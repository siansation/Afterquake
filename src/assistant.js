// "Ask about this forecast": a Gemini assistant (via /api/chat) that answers by calling the tools below.
// The tools run here, on the page's own model and data, so every figure in an answer comes from the forecast.
// This file is inlined into the main UI script so it shares the map and forecast state.
// Tool names and descriptions are declared once, in api/chat.js.
const ASK = { history: [], key: null, busy: false };
const ASK_BUILDINGS = { local: 'local', modern: '9', concrete: '8', brick: '7', damaged: '6' };
const plain = h => String(h).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const limitLabel = () => $('tol').selectedOptions[0].text;

function findPlace(name) {
  const n = fold(name), all = [...TOWNS.towns, ...B.towns];
  return all.find(t => fold(t[0]) === n) || all.find(t => fold(t[0]).startsWith(n));
}
function buildingLabel(bld, lat, lon) {
  if (bld === 'local') { const cc = countryAt(lat, lon), t = countryThr(cc); return `typical local building in ${cname(cc)} (damaging from intensity ${t ? R(t) : 'VIII'})` }
  const o = [...$('bld').options].find(o => o.value === bld); return o ? o.text : bld;
}
const belowLimit = re => re === 0 ? 'already below the limit' : re === Infinity ? 'not within the 400-day search'
  : `from ${fmtDT(new Date(cur.nowDate.getTime() + re * 864e5))}, ${dur(re)} after the replay time`;

function forecastFor(lat, lon, name, minutes, bld) {
  if (!gridAt(lat, lon)) return { error: `${name} is outside the mapped area for this earthquake.` };
  const thrB = bld === 'local' ? (countryThr(countryAt(lat, lon)) || 8) : +bld;
  const sp = spot(lat, lon, thrB, cur.calib, cur.src), ex = SCENARIO.exposure(SHAKE, cur.f, cur.cp, sp.qv, minutes);
  const re = SHAKE.reentryQ(cur.f, cur.cp, sp.qv, cur.tol, ex.days), P = (a, b) => pct(SHAKE.probQ(cur.f, cur.cp, sp.qv, a, b));
  return { place: name, km_from_epicentre: Math.round(Math.hypot(sp.x, sp.y)), replay_time: fmtDT(cur.nowDate), time_since_mainshock: dur(cur.now),
    building: buildingLabel(bld, lat, lon), damaging_shaking_means: `intensity ${R(sp.thr)} or more`,
    threshold_lowered_because: sp.why.length ? sp.why.join(' and ') : 'not lowered',
    stay: SCENARIO.durationLabel(minutes), chance_during_stay: chance(ex.probability), chance_range_90pct: `${chance(ex.range.low)} to ${chance(ex.range.high)}`,
    chance_next_24_hours: P(0, 1), chance_next_7_days: P(0, 7), chance_next_30_days: P(0, 30),
    risk_limit: limitLabel(), below_limit: belowLimit(re),
    ground_vs30_m_per_s: Math.round(sp.gv.vs), mainshock_intensity_here: `${R(sp.gv.mmi)} (${MMI_NAME[Math.round(sp.gv.mmi)] || 'not felt'})`,
    note: 'Model estimate of shaking from M5+ aftershocks only. Not a building safety assessment.' };
}
const stayMinutes = a => Math.round(a.stay_minutes || cur.exposure.minutes);

const ASK_TOOLS = {
  quick_summary: () => ({summary:lastSummary}),
  current_forecast: () => forecastFor(loc.lat, loc.lon, loc.name, cur.exposure.minutes, $('bld').value),
  forecast_at: a => {
    let lat = a.lat, lon = a.lon, name;
    if (a.place) { const t = findPlace(String(a.place)); if (!t) return { error: `No town called "${a.place}" in this earthquake's mapped area.` }; [name, lat, lon] = [t[0], t[1], t[2]] }
    else if (Number.isFinite(lat) && Number.isFinite(lon)) name = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    else[name, lat, lon] = [loc.name, loc.lat, loc.lon];   // no place given: the user's pin, with the other settings changed
    const m = stayMinutes(a); if (!(m >= 1 && m <= 1440)) return { error: 'The stay must be between 1 minute and 24 hours.' };
    const bld = a.building ? ASK_BUILDINGS[a.building] : $('bld').value; if (!bld) return { error: 'Unknown building type.' };
    return forecastFor(lat, lon, name, m, bld);
  },
  risk_over_time: a => {
    const m = stayMinutes(a); if (!(m >= 1 && m <= 1440)) return { error: 'The stay must be between 1 minute and 24 hours.' };
    const d = m / 1440, re = SHAKE.reentryQ(cur.f, cur.cp, cur.sp.qv, cur.tol, d);
    return { place: loc.name, stay: SCENARIO.durationLabel(m), risk_limit: limitLabel(), replay_time: fmtDT(cur.nowDate),
      chance_if_the_stay_starts: [0, .25, 1, 3, 7, 14, 30].map(t => ({ start: t === 0 ? 'now' : `${dur(t)} later`, chance: chance(SHAKE.probQ(cur.f, cur.cp, cur.sp.qv, t, t + d)) })),
      below_limit: belowLimit(re), assumes: 'no new large earthquake changes the sequence' };
  },
  danger_factors: () => ({ place: loc.name, factors: factorsList().map(([k, v, d]) => ({ factor: k, value: plain(v), detail: plain(d).replace(/\s*source$/, '') })) }),
  aftershocks_so_far: a => {
    const min = Number.isFinite(a.min_magnitude) ? a.min_magnitude : 5, ev = S.events.filter(e => e[0] > 0.001 && e[0] <= cur.now);
    const away = e => { const [x, y] = km(e[2], e[3]); return Math.round(Math.hypot(x - cur.sp.x, y - cur.sp.y)) };
    const big = ev.filter(e => e[1] >= min), last = big[big.length - 1];
    return { up_to: fmtDT(cur.nowDate), counts: { 'M4+': ev.filter(e => e[1] >= 4).length, 'M5+': ev.filter(e => e[1] >= 5).length, 'M6+': ev.filter(e => e[1] >= 6).length },
      largest: [...big].sort((x, y) => y[1] - x[1]).slice(0, 5).map(e => ({ magnitude: e[1], when: `${dur(e[0])} after the mainshock`, km_from_pin: away(e) })),
      most_recent: last ? { magnitude: last[1], when: `${dur(last[0])} after the mainshock`, time_before_replay: dur(cur.now - last[0]), km_from_pin: away(last) } : null };
  },
  people_at_risk: () => {
    const near = TOWNS.towns.map(t => ({ t, d: Math.hypot((t[1] - loc.lat) * 110.57, (t[2] - loc.lon) * 111.32 * G.c) })).filter(o => o.d <= 15).sort((a, b) => a.d - b.d);
    const scored = townRisks(), pager = EX[S.key] && EX[S.key].pager;
    return { near_pin: { towns_within_15_km: near.length, people: Math.round(near.reduce((a, o) => a + o.t[3], 0)), closest: near.slice(0, 5).map(o => ({ town: o.t[0], people: o.t[3], km: +o.d.toFixed(1) })) },
      towns_with_highest_7_day_chance: [...scored].sort((a, b) => b.p7 - a.p7).slice(0, 6).map(item => ({ town: item.town[0], people: item.town[3], chance_7_days: pct(item.p7) })),
      expected_people_with_damaging_shaking_7_days: Math.round(scored.reduce((a, item) => a + item.town[3] * item.p7, 0)),
      mainshock_exposure_pager: pager && pager.exposure ? pager.exposure.filter(r => r[2] > 0 && r[0] >= 3.5).map(r => ({ intensity: R((r[0] + r[1]) / 2), people: r[2] })) : 'no PAGER estimate',
      note: 'Town populations are point counts from GeoNames; rural homes are not included.' };
  },
  method_and_limits: () => ({
    data: S.live ? 'Live USGS catalogue, ShakeMap and PAGER report for this earthquake, re-checked every 2 minutes while open. No ground-failure maps for live quakes.'
      : `Recorded USGS catalogue, ShakeMap, ground-failure and PAGER data, downloaded ${fmtDate(new Date(D.fetchedAt))}.`,
    how_many: 'Reasenberg-Jones aftershock rate model, updated with this sequence\'s own M5+ aftershocks up to the replay time (Bayesian update of a single global prior).',
    where: 'Future aftershocks are assumed to cluster around past ones (6 km smoothing, fixed 10 km depth).',
    how_hard: 'Allen, Wald and Worden (2012) intensity equation with its scatter, M5 to M8.5.',
    ground: `Soil term fitted by the team to ShakeMaps: ${SITEFIT.k} intensity per tenfold change in Vs30.`,
    building: 'Intensity thresholds from the Modified Mercalli scale, or for a typical local building, where the USGS PAGER fatality rate for the country reaches 1 in 10,000 (a prototype rule). Lowered one level if the spot already shook near that level or likely liquefied.',
    accuracy: `Regional 7-day occurrence checks on the case studies: skill ${skillTxt(5)} for M5+ and ${skillTxt(6)} for M6+ (0 = reference, 1 = perfect). Local shaking and building damage are not independently validated.`,
    limits: 'Prototype, not safety advice or an official forecast. No secondary triggering (ETAS). About 1 km ground resolution. Re-entry needs a structural inspection and local authority guidance.' }),
};

function describeCall(name, args, out) {
  const err = out && out.error ? ` (${out.error})` : '';
  const what = { quick_summary: 'the short summary and next steps', current_forecast: `forecast at ${out && out.place || loc.name}${out && out.stay ? `, ${out.stay}` : ''}`,
    forecast_at: `forecast at ${out && out.place || args.place || 'another spot'}${out && out.stay ? `, ${out.stay}` : ''}${args.building ? `, ${args.building} building` : ''}`,
    risk_over_time: 'how the chance changes with a later start', danger_factors: 'what drives the risk at your pin',
    aftershocks_so_far: `aftershocks of M${Number.isFinite(args.min_magnitude) ? args.min_magnitude : 5}+ so far`, people_at_risk: 'people nearby and at risk',
    method_and_limits: 'how the model works and its limits' }[name] || name;
  return what + err;
}
function askContext() {
  return [`Earthquake: M${S.M.toFixed(1)} ${S.label}, ${fmtDate(new Date(S.t0))} (${S.live ? 'live USGS data' : 'recorded case study'})`,
    `Replay time: ${fmtDT(cur.nowDate)}, ${dur(cur.now)} after the mainshock`,
    `Selected place: ${loc.name}, ${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}`,
    `Settings: ${$('bld').selectedOptions[0].text}; stay ${exposureLabel()}; risk limit ${limitLabel()}`].join('\n');
}
// Keep the conversation short, and always starting with a question (not a tool result).
function trimHistory() {
  while (ASK.history.length > 30) { ASK.history.shift(); while (ASK.history.length && !(ASK.history[0].role === 'user' && ASK.history[0].parts.some(p => p.text))) ASK.history.shift() }
}
const askHtml = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^\s*[-*] /gm, '– ').replace(/\n/g, '<br>');

function addAskEntry(q) {
  const el = document.createElement('div'); el.className = 'ask-entry';
  el.innerHTML = `<p class="ask-q">${esc(q)}</p><p class="ask-a muted">Checking the forecast…</p>`;
  const log = $('askLog'); log.appendChild(el); log.scrollTop = log.scrollHeight;
  const a = el.querySelector('.ask-a');
  return {
    answer(text, checked) { a.className = 'ask-a'; a.innerHTML = askHtml(text);
      if (checked.length) el.insertAdjacentHTML('beforeend', `<details class="ask-checked"><summary>What this answer used</summary><p>${checked.map(esc).join('; ')}</p></details>`); $('askLog').scrollTop = $('askLog').scrollHeight },
    fail(msg) { a.className = 'ask-a ask-err'; a.textContent = msg },
  };
}
function resetAsk() { ASK.history = []; ASK.key = S ? S.key : null; if ($('askLog')) $('askLog').innerHTML = '' }

async function ask(q) {
  q = q.trim().slice(0, 1000); if (!q || ASK.busy || !cur.f) return;
  if (ASK.key !== S.key) resetAsk();
  ASK.busy = true; $('askBtn').disabled = true; $('askInput').value = '';
  const entry = addAskEntry(q), mark = ASK.history.length, checked = [];
  ASK.history.push({ role: 'user', parts: [{ text: q }] });
  try {
    for (let step = 0; ; step++) {
      if (step === 6) { entry.answer('That needed too many steps. Try asking one thing at a time.', checked); break }
      trimHistory();
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: ASK.history, context: askContext() }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || (r.status === 404 || r.status === 501 ? 'The assistant only works on the hosted site (afterquake-one.vercel.app).' : 'The assistant could not answer.'));
      ASK.history.push({ role: 'model', parts: data.parts });   // unchanged, so Gemini's thought signatures survive
      const calls = data.parts.filter(p => p.functionCall);
      if (!calls.length) { entry.answer(data.parts.filter(p => p.text && !p.thought).map(p => p.text).join('\n').trim() || 'No answer came back.', checked); break }
      ASK.history.push({ role: 'user', parts: calls.map(p => {
        const { name, args = {}, id } = p.functionCall; let out;
        try { out = ASK_TOOLS[name] ? ASK_TOOLS[name](args) : { error: 'Unknown tool.' } } catch (e) { out = { error: e.message } }
        checked.push(describeCall(name, args, out));
        return { functionResponse: { name, response: { result: out }, ...(id ? { id } : {}) } };   // newer models match results to calls by id
      }) });
    }
  } catch (e) {
    ASK.history.length = mark;   // drop the failed turn so the conversation stays valid
    entry.fail(e.message === 'Failed to fetch' ? 'Could not reach the assistant. Check the internet connection.' : e.message);
  } finally { ASK.busy = false; $('askBtn').disabled = false }
}
// The chat bubble in the bottom-left corner of the map opens and closes the panel.
function setAskOpen(open) { $('askPanel').hidden = !open; $('askOpen').setAttribute('aria-expanded', String(open)); if (open) $('askInput').focus({ preventScroll: true }); else $('askOpen').focus({ preventScroll: true }) }
$('askOpen').onclick = () => setAskOpen($('askPanel').hidden);
$('askClose').onclick = () => setAskOpen(false);
$('askPanel').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); setAskOpen(false) } });
$('askForm').onsubmit = e => { e.preventDefault(); ask($('askInput').value) };
document.querySelectorAll('#askSuggest button').forEach(b => b.onclick = () => ask(b.textContent));
