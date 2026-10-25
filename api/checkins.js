// Same-origin API for invite-only groups, backed by Tiger Data PostgreSQL.
// Group links permit reading; a separate random browser token permits editing
// ONLY that browser's entry. Neither token is stored in plaintext in the database.
const { createHash } = require('node:crypto');
const { getPool, createStore } = require('../server/checkins-store');
const digest = text => createHash('sha256').update(text).digest('hex');
const sequenceOK = text => typeof text === 'string' && /^(?:live:)?[a-z0-9_-]{1,80}$/i.test(text);
const hits = new Map();
function limited(key, write, now = Date.now()) {
  const id = `${write ? 'write' : 'read'}:${key}`, times = (hits.get(id) || []).filter(t => now - t < 60000);
  times.push(now); hits.set(id, times);
  if (hits.size > 5000) hits.clear();
  return times.length > (write ? 15 : 90);
}
function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !sequenceOK(body.sequence)) return 'Choose a valid earthquake.';
  if (!['safe', 'help'].includes(body.status)) return 'Choose safe or needs help.';
  if (!Number.isFinite(body.lat) || Math.abs(body.lat) > 90 || !Number.isFinite(body.lon) || Math.abs(body.lon) > 180) return 'Choose a valid map location.';
  if (typeof body.note !== 'string' || body.note.length > 80 || /[\u0000-\u001f\u007f]/.test(body.note)) return 'Use a note of up to 80 characters, without line breaks.';
  return null;
}
function createHandler({ store, configured = () => !!process.env.TIGER_DATABASE_URL, throttle = limited } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization, X-Checkin-Owner');
    if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, PUT, DELETE'); return res.status(405).json({ error: 'Use GET, PUT or DELETE.' });
    }
    // A non-sensitive availability probe lets standalone copies explain why the
    // feature is unavailable without enabling buttons that cannot save.
    if (req.method === 'GET' && !req.headers.authorization) return res.status(200).json({ configured: configured(), provider: 'Tiger Data' });
    if (!configured()) return res.status(503).json({ error: 'Shared check-ins are not set up on this server yet.' });
    const group = /^Bearer ([a-f0-9]{32})$/.exec(req.headers.authorization || '')?.[1];
    const token = req.headers['x-checkin-owner'];
    if (!group || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({ error: 'Join a group using its invite link or code.' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (throttle(ip, req.method !== 'GET')) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Too many check-in requests. Try again in a minute.' }); }
    let body = req.body;
    if (req.method === 'PUT') {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return res.status(415).json({ error: 'Send JSON.' });
      if (typeof body === 'string') { if (body.length > 2048) return res.status(413).json({ error: 'Check-in too large.' }); try { body = JSON.parse(body); } catch { body = null; } }
      if (JSON.stringify(body || '').length > 2048) return res.status(413).json({ error: 'Check-in too large.' });
      const error = validate(body); if (error) return res.status(400).json({ error });
    }
    const sequence = req.method === 'PUT' ? body.sequence : req.query?.sequence;
    if (!sequenceOK(sequence)) return res.status(400).json({ error: 'Choose a valid earthquake.' });
    const room = digest(group), owner = digest(`${group}:${token}`);
    try {
      const db = store || createStore(getPool());
      if (req.method === 'GET') return res.status(200).json(await db.list(room, sequence, owner));
      if (req.method === 'PUT') await db.save(room, sequence, owner, { status: body.status,
        lat: +body.lat.toFixed(3), lon: +body.lon.toFixed(3), note: body.note.trim() });
      else await db.remove(room, sequence, owner);
      return res.status(200).json({ ok: true });
    } catch {
      // Database errors can contain hostnames, SQL and credentials. Keep them out
      // of both visitor responses and server logs.
      return res.status(503).json({ error: 'Check-ins are temporarily unavailable. Your change was not confirmed; please try again.' });
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.validate = validate;
