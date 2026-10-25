// Vercel serverless function: reads the forecast summary aloud with ElevenLabs, in English or the local language.
// Keys stay here (ELEVENLABS_API_KEY, and GEMINI_API_KEY for translation); the page never sees them.
// The text comes from the page's deterministic summary (src/spoken.js). For other languages Gemini translates it first,
// and the translation is rejected unless every number in the English text survives, so a figure can't be altered in translation.
const EL_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';
// "George", one of ElevenLabs' default voices. Override with ELEVENLABS_VOICE_ID (any voice in your ElevenLabs library).
const EL_VOICE = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const EL_ENDPOINT = v => `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(v)}?output_format=mp3_44100_64`;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const GEMINI_ENDPOINT = m => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;

// Languages Flash v2.5 / Turbo v2.5 speak (ISO 639-1), with names for the page's menu.
const LANGUAGES = {
  en: 'English', tr: 'Turkish', ja: 'Japanese', zh: 'Chinese', hi: 'Hindi', id: 'Indonesian', es: 'Spanish', pt: 'Portuguese',
  fr: 'French', de: 'German', it: 'Italian', el: 'Greek', ar: 'Arabic', ko: 'Korean', fil: 'Filipino', ms: 'Malay', vi: 'Vietnamese',
  ru: 'Russian', uk: 'Ukrainian', pl: 'Polish', ro: 'Romanian', hr: 'Croatian', bg: 'Bulgarian', cs: 'Czech', sk: 'Slovak',
  hu: 'Hungarian', nl: 'Dutch', sv: 'Swedish', no: 'Norwegian', da: 'Danish', fi: 'Finnish', ta: 'Tamil',
};
const MAX_TEXT = 1500;

const TRANSLATE_RULES = `Translate the user's text into LANGUAGE for a spoken earthquake safety summary that will be read aloud to the public.
- Translate faithfully and completely. Do not add, remove, soften or strengthen anything, and add no advice.
- Use short, everyday sentences suitable for someone listening under stress. Stay as brief as the source: no introduction, extra explanations, repeated warnings or model terminology.
- Preserve safety conditions exactly, including whether an action applies indoors, outdoors or only after shaking. Keep the selected date and any delayed-data warning. Do not add "recorded example" labels or other preambles.
- Keep every number, percentage, date and time exactly as given (you may use the language's usual decimal separator and date order).
- Keep place names recognisable. Keep numeric values in digits, including magnitudes and percentages; translate their surrounding words and units, but do not spell out the digits.
- Reply with the translation only: no notes, quotes or headings.`;

// Best-effort per-visitor rate limit (speech uses paid credits).
const WINDOW_MS = 10 * 60e3, MAX_REQUESTS = 20, hits = new Map();
function limited(ip, now = Date.now()) {
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > MAX_REQUESTS;
}

function validate(body) {
  if (!body || typeof body !== 'object') return 'Expected a JSON body.';
  if (typeof body.text !== 'string' || !body.text.trim()) return 'Missing text.';
  if (body.text.length > MAX_TEXT) return 'Text too long.';
  if (body.lang != null && !Object.hasOwn(LANGUAGES, body.lang)) return 'Unsupported language.';
  return null;
}

// Every digit run in the English text must appear in the translation (as many times), e.g. 9.2% -> 9 and 2.
const digitRuns = s => (String(s).match(/\d+/g) || []).map(d => d.replace(/^0+(?=\d)/, ''));
function numbersPreserved(source, translated) {
  const pool = digitRuns(translated);
  for (const d of digitRuns(source)) { const i = pool.indexOf(d); if (i < 0) return false; pool.splice(i, 1) }
  return true;
}

async function translate(text, lang, key, signal) {
  const r = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL), { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: TRANSLATE_RULES.replace('LANGUAGE', LANGUAGES[lang]) }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1500 },
    }) });
  if (!r.ok) throw Object.assign(new Error('translation failed'), { status: r.status });
  const data = await r.json().catch(() => ({}));
  const out = (((data.candidates || [])[0] || {}).content?.parts || []).map(p => p.text || '').join('').trim();
  if (!out) throw new Error('empty translation');
  return out;
}

function speechRequest(text, lang) {
  const body = { text, model_id: EL_MODEL, voice_settings: { stability: 0.6, similarity_boost: 0.8 } };
  if (/v2_5/.test(EL_MODEL) && lang) body.language_code = lang;   // only the v2.5 models accept language enforcement
  return body;
}

function upstreamError(status, detail) {
  if (status === 429) return [429, 'The voice service is busy. Try again in a minute.'];
  if (/quota/i.test(detail || '')) return [503, 'Voice credits have run out on this server. The text summary is still available.'];
  if (status === 401 || status === 403) return [503, 'The voice service is not set up correctly on this server.'];
  return [502, 'Could not create the spoken summary. Try again, or read the text summary.'];
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.ELEVENLABS_API_KEY, gemini = process.env.GEMINI_API_KEY;
  if (req.method === 'GET') {
    const languages = Object.entries(LANGUAGES).filter(([code]) => code === 'en' || gemini).map(([code, name]) => ({ code, name }));
    return res.status(200).json({ configured: !!key, provider: 'ElevenLabs', model: EL_MODEL, languages: key ? languages : [] });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Use GET or POST.' }) }
  if (!key) return res.status(503).json({ error: 'The natural voice is not set up on this server yet.' });
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (limited(ip)) return res.status(429).json({ error: 'Too many spoken summaries in a short time. Try again in a few minutes.' });
  let body = req.body;
  if (typeof body === 'string') { if (body.length > 4096) return res.status(413).json({ error: 'Text too long.' }); try { body = JSON.parse(body) } catch { body = null } }
  const bad = validate(body);
  if (bad) return res.status(400).json({ error: bad });
  const want = body.lang || 'en';
  let text = body.text.trim(), lang = 'en', translated = false, note = null;
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 25e3);
  try {
    if (want !== 'en') {
      if (!gemini) note = `${LANGUAGES[want]} needs the translation service, which is not set up. Reading in English.`;
      else {
        try {
          const out = await translate(text, want, gemini, abort.signal);
          if (numbersPreserved(text, out)) { text = out; lang = want; translated = true }
          else note = `The ${LANGUAGES[want]} translation changed a figure, so it was not used. Reading in English.`;
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          console.error('Translation failed', e.status || e.message);
          note = `Could not translate into ${LANGUAGES[want]} right now. Reading in English.`;
        }
      }
    }
    const r = await fetch(EL_ENDPOINT(EL_VOICE), { method: 'POST', signal: abort.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', 'xi-api-key': key },
      body: JSON.stringify(speechRequest(text, lang)) });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('ElevenLabs error', r.status, detail.slice(0, 300));
      const [code, msg] = upstreamError(r.status, detail);
      return res.status(code).json({ error: msg });
    }
    const audio = Buffer.from(await r.arrayBuffer()).toString('base64');
    if (!audio) return res.status(502).json({ error: 'The voice service returned no audio.' });
    return res.status(200).json({ audio, mime: 'audio/mpeg', transcript: text, lang, language: LANGUAGES[lang], translated, note, model: EL_MODEL });
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: 'The spoken summary is taking too long. Try again, or read the text summary.' });
    console.error('Speech request failed', e.message);
    return res.status(502).json({ error: 'Could not reach the voice service. Try again.' });
  } finally { clearTimeout(timer) }
}

module.exports = handler;
module.exports.LANGUAGES = LANGUAGES;
module.exports.validate = validate;
module.exports.numbersPreserved = numbersPreserved;
module.exports.speechRequest = speechRequest;
module.exports.limited = limited;
module.exports.defaults = { model: EL_MODEL, voice: EL_VOICE };
