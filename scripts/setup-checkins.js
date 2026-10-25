// Load secrets locally; print only a success/error message, never the URL.
const fs = require('node:fs');
const path = require('node:path');
const { poolConfig } = require('../server/checkins-store');
async function main() {
  const envFile = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  if (!process.env.TIGER_DATABASE_URL) throw new Error('Set TIGER_DATABASE_URL in .env.local first.');
  const { Pool } = require('pg');
  const pool = new Pool(poolConfig());
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'checkins.sql'), 'utf8'));
    console.log('Check-in tables are ready.');
    await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'quakes.sql'), 'utf8'));
    const ts = (await pool.query("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') AS ok")).rows[0].ok;
    console.log(ts ? 'Aftershock time series is ready: hypertable, hourly continuous aggregate, refresh and compression policies.'
      : 'Aftershock time series is ready (plain PostgreSQL: TimescaleDB is not enabled, so it uses an ordinary table and view).');
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Database setup failed. Check the local Tiger Data URL, TLS certificate and database access. No credentials were printed.'); process.exitCode = 1; });
