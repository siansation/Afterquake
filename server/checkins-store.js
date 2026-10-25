// The browser never receives a database URL. All SQL uses bound parameters and
// each write updates the current entry and its timestamped history atomically.
function poolConfig(env = process.env) {
  const url = new URL(env.TIGER_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Expected a PostgreSQL URL.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const disableTLS = local && url.searchParams.get('sslmode') === 'disable';
  // pg otherwise lets URL SSL parameters replace the explicit verification settings.
  for (const key of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
  return { connectionString: url.href, ssl: disableTLS ? false : {
    rejectUnauthorized: true, ...(env.TIGER_DATABASE_CA ? { ca: env.TIGER_DATABASE_CA.replace(/\\n/g, '\n') } : {})
  }, max: 2, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000,
  statement_timeout: 8000, query_timeout: 10000, application_name: 'afterquake-checkins' };
}

let sharedPool;
function getPool() {
  if (!sharedPool) {
    const { Pool } = require('pg');
    sharedPool = new Pool(poolConfig());
    sharedPool.on('error', () => {}); // Requests report failures without logging connection credentials.
  }
  return sharedPool;
}

function createStore(pool) {
  async function transaction(work, readOnly = false) {
    const client = await pool.connect();
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  async function cleanup(client) {
    await client.query("DELETE FROM afterquake.checkin_events WHERE at < now() - interval '24 hours'");
    await client.query('DELETE FROM afterquake.checkins WHERE expires_at <= now()');
  }
  async function lockOwner(client, room, sequence, owner) {
    // Serialise updates/removal from multiple tabs or server instances so a
    // concurrent save cannot leave history behind after a confirmed removal.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${room}:${sequence}:${owner}`]);
  }
  return {
    async list(room, sequence, owner) {
      return transaction(async client => {
        const args = [room, sequence, owner];
        const entries = await client.query(`SELECT public_id AS id, status, lat, lon, note,
          updated_at AS ts, expires_at, owner_hash = $3 AS mine
          FROM afterquake.checkins WHERE room_hash = $1 AND sequence = $2 AND expires_at > now()
          ORDER BY (owner_hash = $3) DESC, updated_at DESC, public_id LIMIT 201`, args);
        const counts = await client.query(`SELECT count(*)::int AS total,
          count(*) FILTER (WHERE status = 'safe')::int AS safe,
          count(*) FILTER (WHERE status = 'help')::int AS help
          FROM afterquake.checkins WHERE room_hash = $1 AND sequence = $2 AND expires_at > now()`, args.slice(0, 2));
        const activity = await client.query(`SELECT date_trunc('hour', at, 'UTC') AS hour,
          count(*) FILTER (WHERE status = 'safe')::int AS safe,
          count(*) FILTER (WHERE status = 'help')::int AS help
          FROM afterquake.checkin_events WHERE room_hash = $1 AND sequence = $2
          AND at > now() - interval '24 hours' GROUP BY 1 ORDER BY 1 DESC LIMIT 25`, args.slice(0, 2));
        return { items: entries.rows.slice(0, 200).map(row => ({ id: row.id, status: row.status,
          lat: row.lat, lon: row.lon, note: row.note, ts: new Date(row.ts).getTime(),
          expiresAt: new Date(row.expires_at).toISOString(), mine: row.mine })),
          counts: counts.rows[0], activity: activity.rows.map(row => ({ ...row, hour: new Date(row.hour).toISOString() })),
          limited: entries.rows.length > 200, checkedAt: new Date().toISOString() };
      }, true);
    },
    async save(room, sequence, owner, entry) {
      return transaction(async client => {
        await lockOwner(client, room, sequence, owner);
        await cleanup(client);
        await client.query(`INSERT INTO afterquake.checkins (room_hash, sequence, owner_hash, status, lat, lon, note)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (room_hash, sequence, owner_hash) DO UPDATE SET status = EXCLUDED.status,
          lat = EXCLUDED.lat, lon = EXCLUDED.lon, note = EXCLUDED.note,
          updated_at = now(), expires_at = now() + interval '24 hours'`,
        [room, sequence, owner, entry.status, entry.lat, entry.lon, entry.note]);
        // History deliberately excludes notes and coordinates. Removing an entry
        // removes that browser's associated history as well.
        await client.query(`INSERT INTO afterquake.checkin_events (room_hash, sequence, owner_hash, status)
          VALUES ($1, $2, $3, $4)`, [room, sequence, owner, entry.status]);
      });
    },
    async remove(room, sequence, owner) {
      return transaction(async client => {
        await lockOwner(client, room, sequence, owner);
        await client.query('DELETE FROM afterquake.checkin_events WHERE room_hash = $1 AND sequence = $2 AND owner_hash = $3', [room, sequence, owner]);
        await client.query('DELETE FROM afterquake.checkins WHERE room_hash = $1 AND sequence = $2 AND owner_hash = $3', [room, sequence, owner]);
        await cleanup(client);
      });
    }
  };
}
module.exports = { poolConfig, getPool, createStore };
