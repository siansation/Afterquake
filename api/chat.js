// Vercel serverless function: the "Ask about this forecast" assistant, backed by the Gemini API.
// The API key stays here (environment variable GEMINI_API_KEY); the page never sees it.
// Gemini answers by calling tools, and the TOOLS run in the visitor's browser against the page's own model and data
// (src/assistant.js), so every number it quotes comes from the forecast, not from the language model.
// Flash-Lite with minimal thinking: these are lookups plus a short explanation, and 3.8 Flash took 30-50 s per step.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const THINKING = process.env.GEMINI_THINKING || (/flash-lite/.test(MODEL) ? 'minimal' : 'low');
const ENDPOINT = m => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;

const RULES = `You are the assistant inside Aftershock Re-entry, a prototype that estimates the chance of damaging shaking from M5+ aftershocks at a chosen spot after an earthquake.
Rules:
- Answer only questions about the open earthquake, its aftershocks, this forecast, the data behind it and how to read it. Politely decline anything else in one sentence.
- Get every number from a tool called for this question. Never estimate, round, reuse figures from earlier answers, or invent probabilities, ranges, times, counts or distances yourself. If no tool can answer, say so.
- Never say or imply that a building is safe to enter. The forecast only covers the chance of more shaking. Whether a building can be re-entered is decided by a structural inspection and local authorities. Say this briefly whenever someone asks about going back inside.
- If someone describes an emergency, injury or being trapped, tell them to contact local emergency services first.
- Make clear these are model estimates with uncertainty, without repeating long caveats.
- Be brief and plain: two to five sentences, UK spelling, no headings. Quote the figures the tools give, as given.
- When a tool reports an error (for example a place outside the mapped area), explain it simply.`;

// Shared with src/assistant.js, which implements each one in the browser.
const TOOLS = [
  { name: 'current_forecast', description: 'The forecast at the pin the user has placed, with their current settings (building, length of stay, risk limit, replay time).', parameters: { type: 'object', properties: {} } },
  { name: 'forecast_at', description: 'Forecast at another place or with different settings, without changing the page. Give a town name or coordinates inside the mapped area; leave both out to use the user\'s pin with the other settings changed.',
    parameters: { type: 'object', properties: {
      place: { type: 'string', description: 'Town name in the mapped area, e.g. "Gaziantep"' },
      lat: { type: 'number' }, lon: { type: 'number' },
      stay_minutes: { type: 'integer', description: 'Length of stay, 1 to 1440 minutes. Defaults to the current setting.' },
      building: { type: 'string', enum: ['local', 'modern', 'concrete', 'brick', 'damaged'], description: 'Building type. Defaults to the current setting.' } } } },
  { name: 'risk_over_time', description: 'How the chance during the current stay length changes if the stay starts later (now, +6 h, +1, +3, +7, +14, +30 days), and when it drops below the risk limit.',
    parameters: { type: 'object', properties: { stay_minutes: { type: 'integer', description: '1 to 1440. Defaults to the current setting.' } } } },
  { name: 'danger_factors', description: 'What drives the risk at the pin: distance to aftershock activity, ground softness, mainshock shaking, liquefaction, landslides, country building vulnerability, coast distance.', parameters: { type: 'object', properties: {} } },
  { name: 'aftershocks_so_far', description: 'Aftershocks recorded up to the replay time: counts, the largest ones, and the most recent M5+.',
    parameters: { type: 'object', properties: { min_magnitude: { type: 'number', description: 'Default 5' } } } },
  { name: 'people_at_risk', description: 'People living near the pin, towns with the highest 7-day chance, and USGS PAGER counts of people who felt each shaking level in the mainshock.', parameters: { type: 'object', properties: {} } },
  { name: 'method_and_limits', description: 'How the forecast is calculated, where the data comes from, how well it has been checked, and its limits.', parameters: { type: 'object', properties: {} } },
];
const TOOL_NAMES = new Set(TOOLS.map(t => t.name));

// Best-effort per-visitor rate limit (per server instance; enough to stop casual quota draining on a public link).
const WINDOW_MS = 10 * 60e3, MAX_REQUESTS = 40, hits = new Map();
function limited(ip, now = Date.now()) {
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > MAX_REQUESTS;
}

// Accept only the shapes this app sends, so the endpoint can't be used as a general-purpose Gemini proxy.
function validate(body) {
  if (!body || typeof body !== 'object') return 'Expected a JSON body.';
  const { contents, context } = body;
  if (typeof context !== 'string' || context.length > 4000) return 'Missing or oversized context.';
  if (!Array.isArray(contents) || !contents.length || contents.length > 40) return 'Expected 1 to 40 messages.';
  for (const c of contents) {
    if (!c || (c.role !== 'user' && c.role !== 'model') || !Array.isArray(c.parts) || !c.parts.length || c.parts.length > 12) return 'Malformed message.';
    for (const p of c.parts) {
      if (!p || typeof p !== 'object') return 'Malformed part.';
      if (p.text != null && (typeof p.text !== 'string' || p.text.length > (c.role === 'user' ? 1000 : 6000))) return 'Message too long.';
      if (p.functionCall && !TOOL_NAMES.has(p.functionCall.name)) return 'Unknown tool.';
      if (p.functionResponse && (!TOOL_NAMES.has(p.functionResponse.name) || JSON.stringify(p.functionResponse).length > 12000)) return 'Bad tool result.';
      if (c.role === 'user' && p.functionCall) return 'Malformed message.';
    }
  }
  const last = contents[contents.length - 1];
  if (last.role !== 'user') return 'The last message must come from the user.';
  return null;
}

function request(contents, context) {
  // A new question must start with a tool call (mode ANY), so answers can't reuse or invent figures;
  // after the tool results come back, Gemini may call more tools or answer (mode AUTO).
  const last = contents[contents.length - 1], fresh = last.role === 'user' && last.parts.some(p => typeof p.text === 'string');
  return {
    systemInstruction: { parts: [{ text: `${RULES}\n\nWhat the user is looking at right now:\n${context}` }] },
    contents,
    tools: [{ functionDeclarations: TOOLS }],
    toolConfig: { functionCallingConfig: { mode: fresh ? 'ANY' : 'AUTO' } },
    generationConfig: { temperature: 0.2, maxOutputTokens: 700, thinkingConfig: { thinkingLevel: THINKING } },
  };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST.' }) }
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'The assistant is not set up on this server yet.' });
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (limited(ip)) return res.status(429).json({ error: 'Too many questions in a short time. Try again in a few minutes.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
  if (JSON.stringify(body || '').length > 200000) return res.status(413).json({ error: 'Conversation too long. Start a new one.' });
  const bad = validate(body);
  if (bad) return res.status(400).json({ error: bad });
  // Give up before Vercel's 60 s function limit, so the page gets a clear message instead of an error page.
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 50e3);
  try {
    const r = await fetch(ENDPOINT(MODEL), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(request(body.contents, body.context)), signal: abort.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = r.status === 429 ? 'The assistant is busy right now. Try again in a minute.' : 'The assistant could not answer that.';
      console.error('Gemini error', r.status, data && data.error && data.error.message);
      return res.status(r.status === 429 ? 429 : 502).json({ error: msg });
    }
    const cand = (data.candidates || [])[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    if (!parts.length) return res.status(502).json({ error: cand && cand.finishReason === 'SAFETY' ? 'The assistant declined to answer that.' : 'The assistant returned no answer.' });
    return res.status(200).json({ parts, model: MODEL });   // parts are passed back unchanged next turn (keeps thought signatures)
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: 'The assistant is taking too long right now. Try again, or ask something simpler.' });
    console.error('Gemini request failed', e);
    return res.status(502).json({ error: 'Could not reach the assistant. Try again.' });
  } finally { clearTimeout(timer) }
}

module.exports = handler;
module.exports.TOOLS = TOOLS;
module.exports.validate = validate;
module.exports.request = request;
module.exports.limited = limited;
