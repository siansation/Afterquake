# Shared check-ins with Tiger Data

The hosted app uses Tiger Data PostgreSQL through `api/checkins.js`. Current posts
live in `afterquake.checkins`; timestamped status changes live in
`afterquake.checkin_events`. On a service with TimescaleDB enabled, the migration
turns the event table into a hypertable partitioned by day. The People tab shows
current safe/help counts and hourly update counts over the last 24 hours.

## Connect a database

1. [Create a Tiger Cloud service](https://www.tigerdata.com/docs/get-started/quickstart/create-service).
   Choose a service with TimescaleDB enabled and download its connection details.
   You can use an existing service instead; the migration creates its own
   `afterquake` schema and does not change other application tables.
2. Copy `.env.example` to `.env.local` and replace `TIGER_DATABASE_URL` with the
   service's PostgreSQL URL. Passwords with reserved URL characters must be URL-encoded.
   These local environment files are ignored by Git. Never paste a real URL into
   an issue, README, screenshot or chat.
3. Run `npm install`, followed by `npm run db:setup`. A successful setup prints
   `Check-in tables are ready.` The migration is safe to run again.
4. Run `npm run build`, then `npm run dev`, and open `http://127.0.0.1:3000`.
   Node 20.12 or newer is required to load `.env.local`; Node 22+ is recommended.

Remote connections use TLS with certificate verification. If your Tiger service
uses a private or self-signed certificate, add its trusted CA PEM to
`TIGER_DATABASE_CA`, with escaped newlines as shown in `.env.example`. Do not
disable verification. See [node-postgres SSL options](https://node-postgres.com/features/ssl)
and [Tiger Data's SSL guide](https://www.tigerdata.com/docs/use-timescale/latest/security/strict-ssl/).
Only a loopback development database can explicitly use `sslmode=disable`.

## Deploy on Vercel

The page is still prebuilt. Vercel now installs the runtime `pg` dependency using
`npm ci --omit=dev --ignore-scripts`, then bundles the two API routes and the
server-only database code. PGlite is a test dependency and is not deployed.

Add `TIGER_DATABASE_URL` to the project's Vercel environment variables, and add
`TIGER_DATABASE_CA` there if needed. Apply the migration before deployment, then
redeploy. For a CLI already linked to the correct Vercel project:

```bash
npx vercel@65.2.0 env add TIGER_DATABASE_URL production
# If needed:
npx vercel@65.2.0 env add TIGER_DATABASE_CA production
npx vercel@65.2.0 deploy --prod
```

The URL is a server secret. No database credentials are embedded in `index.html`.
A static host without the API routes cannot provide shared check-ins. The UI
keeps posting disabled when the server is unconfigured, rather than pretending
that a browser-local record has been shared.

## Use and visibility

Open an earthquake and select **People**, then **Create group**. **Copy group
invite** creates a link containing the chosen earthquake/map view and a random
group code. Opening it joins that group. An existing code or invite can also be
pasted into **Join an existing group**; this joins for the currently selected
earthquake. Sharing a normal forecast view does not include the group code.

Anyone holding the group link can read and post within that group. Keep it within
the intended group: it is an invitation credential, not a public room directory.
The service uses anonymous browser identities, not verified people or accounts.
Each browser keeps a separate random editing token and can update or remove only
its own entry for that group and earthquake. Clearing browser storage loses that
editing token; blocked storage limits ownership to the current visit.

Posting shares the chosen map pin and an optional 80-character note; it does not
use GPS or track movement. Coordinates are rounded to three decimal places on the
server. Notes and positions are excluded from the history table. Group and owner
tokens are hashed before database storage, and owner hashes are scoped to groups.

Posts stop appearing 24 hours after the last update, independent of the replay
clock. Expired records and history older than 24 hours are physically cleaned up
on the next write. Removing your entry also removes your history for that group
and earthquake. **Leave group** clears local membership and the invitation from
the current URL; it does not delete posts. Rejoin and use **Remove mine** to do that.
Database backups follow the database provider's retention settings.

The app refreshes visible check-ins every 15 seconds and labels failed reads with
the last confirmed check time. Counts describe self-reported statuses. Hourly
history counts status updates, including repeats, rather than unique people.
These posts are not monitored or dispatched to emergency services.

## Verification

`npm test` exercises API validation, ownership, group/earthquake isolation, expiry,
deletion, transaction rollback, browser controls and stale-response handling.
Store tests run the migration and SQL against actual PostgreSQL via PGlite/WASM.
They do not test the TimescaleDB conversion, remote TLS, or an authenticated Tiger
Cloud connection. Those need the configured service; successful tests alone do
not mean a live database has been provisioned or deployed.
