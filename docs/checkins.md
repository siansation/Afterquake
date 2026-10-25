# Shared Check-ins with Tiger Data

Aftershock uses Tiger Data PostgreSQL to provide shared earthquake check-ins through `api/checkins.js`. The hosted application serves a prebuilt `index.html`, with server-side API routes handling database operations.

Current check-ins are stored in `afterquake.checkins`, while timestamped status changes are stored in `afterquake.checkin_events`. When TimescaleDB is enabled, the event table is configured as a hypertable partitioned by day.

The People tab displays current safe/help counts and hourly update counts over the last 24 hours.

**Live application:** https://afterquake-one.vercel.app

## Requirements

- Node.js 20.12 or newer; Node.js 22+ is recommended.
- npm.
- A Tiger Cloud PostgreSQL service, preferably with TimescaleDB enabled.
- Database credentials and, if required, a trusted TLS certificate.

## Connect a database

### 1. Create a Tiger Cloud service

[Create a Tiger Cloud service](https://www.tigerdata.com/docs/get-started/quickstart/create-service) and download its PostgreSQL connection details.

You can also use an existing service. The migration creates its own `afterquake` schema and does not change other application tables.

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and set `TIGER_DATABASE_URL` to your service's PostgreSQL connection URL.

```dotenv
TIGER_DATABASE_URL=your_tiger_database_connection_url
```

If your service requires a private or self-signed certificate, configure `TIGER_DATABASE_CA` with its trusted CA certificate in PEM format, using escaped newlines as shown in `.env.example`.

Passwords containing reserved URL characters must be URL-encoded in the connection URL.

Local environment files should remain ignored by Git. Never commit database credentials or share a real connection URL in issues, screenshots, documentation, or chat.

### 3. Initialize the database

Install dependencies:

```bash
npm install
```

Initialize the database:

```bash
npm run db:setup
```

This runs `scripts/setup-checkins.js`, which loads `.env.local` when present and applies the SQL files:

- `db/checkins.sql` — creates the shared check-in database structures.
- `db/quakes.sql` — prepares the earthquake time-series structures.

A successful setup prints:

```text
Check-in tables are ready.
```

The script also reports whether the earthquake time-series structures use TimescaleDB or ordinary PostgreSQL tables and views.

The migration is designed to be safe to run again. The setup script requires `TIGER_DATABASE_URL` and uses the project's shared database connection configuration.

### 4. Configure TLS

Remote database connections use TLS with certificate verification. If your Tiger Cloud service uses a private or self-signed certificate, configure `TIGER_DATABASE_CA` with its trusted CA PEM.

Do not disable certificate verification for remote connections. Only a loopback development database can explicitly use `sslmode=disable`.

See the [node-postgres SSL documentation](https://node-postgres.com/features/ssl) and [Tiger Data's strict SSL guide](https://www.tigerdata.com/docs/use-timescale/latest/security/strict-ssl/).

### 5. Run locally

Build the prebuilt application, then start the development server:

```bash
npm run build
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

The local development server and API routes require the appropriate environment variables to be configured.

## Deploy on Vercel

The application serves its prebuilt `index.html` from the project root. Vercel does not rebuild the frontend during deployment; its build command intentionally skips that step.

The Vercel configuration installs production dependencies using:

```bash
npm ci --omit=dev --ignore-scripts
```

The `pg` package is installed for runtime database access. PGlite is a development dependency used by tests and is not installed in the production dependency set.

### 1. Configure production secrets

Add `TIGER_DATABASE_URL` to the Vercel project's environment variables for Production. Add `TIGER_DATABASE_CA` if your database requires a custom trusted CA certificate.

You can configure these in the Vercel dashboard or with the CLI:

```bash
npx vercel@65.2.0 env add TIGER_DATABASE_URL production
```

If needed:

```bash
npx vercel@65.2.0 env add TIGER_DATABASE_CA production
```

Run these commands from a directory linked to the correct Vercel project. On a new machine, authenticate first:

```bash
npx vercel@65.2.0 login
```

### 2. Apply the database migration

Before deploying, make sure the database has been initialized using `npm run db:setup` against the intended Tiger Data service.

### 3. Build and deploy

Regenerate the prebuilt application:

```bash
npm run build
```

Deploy to production:

```bash
npx vercel@65.2.0 deploy --prod
```

Ensure the production environment variables are configured before testing the deployed check-in API.

The database URL is a server-side secret; database credentials are not embedded in `index.html`. A static host without the API routes cannot provide shared check-ins. When the server is unconfigured, the UI keeps posting disabled rather than pretending a browser-local record has been shared.

## Use and visibility

### Create or join a group

1. Open an earthquake and select **People**.
2. Select **Create group** to create a group for the selected earthquake and map view.
3. Use **Copy group invite** to share the invitation link.
4. To join an existing group, open its invitation link or paste an existing code into **Join an existing group**. Joining this way uses the currently selected earthquake.

Sharing a normal forecast view does not include the group code.

### Group access and ownership

Anyone holding the group invitation link can read and post within that group. Treat the link as an invitation credential and share it only with the intended group.

The service uses anonymous browser identities rather than verified people or accounts. Each browser has a separate random editing token and can update or remove only its own entry for that group and earthquake.

Group and owner tokens are hashed before database storage; owner hashes are scoped to groups. The API validates earthquake identifiers, statuses, coordinates, and notes, and applies request-rate limits.

Clearing browser storage loses the editing token. If browser storage is blocked, ownership may be limited to the current visit.

### What a check-in shares

A check-in includes:

- A self-reported status: `safe` or `help`.
- A selected map location.
- An optional note of up to 80 characters.

Check-ins do not use GPS or track movement. Coordinates are rounded to three decimal places on the server.

Notes and positions are excluded from the history table.

### Expiry and deletion

Posts stop appearing 24 hours after their last update, independently of the earthquake replay clock.

Expired records and history older than 24 hours are physically cleaned up on the next write. Removing your entry also removes its history for that group and earthquake.

**Leave group** clears local membership and the invitation from the current URL; it does not delete your posts. To remove your entry, rejoin the group and use **Remove mine**.

Database backups follow the provider's retention settings.

### Refresh and status counts

The app refreshes visible check-ins every 15 seconds and reports the last confirmed check time when reads fail.

Hourly history counts represent status updates, including repeated updates, rather than unique people. Current safe/help counts describe self-reported statuses.

**Check-ins are not monitored or dispatched to emergency services.** Do not rely on them as a substitute for emergency services or official safety information.

## API reference

The same-origin `api/checkins.js` endpoint supports:

| Method | Purpose |
|---|---|
| `GET` | Check service configuration or retrieve check-ins for a group and earthquake. |
| `PUT` | Create or update the current browser's check-in. |
| `DELETE` | Remove the current browser's check-in. |

The API uses a group authorization token and a separate owner token for protected operations. It validates request bodies and rejects invalid statuses, coordinates, notes, and earthquake identifiers.

Responses disable caching. Database errors are returned as generic errors so credentials, SQL, and internal connection details are not exposed in visitor-facing responses or server logs.

## Verification and tests

Run the test suite:

```bash
npm test
```

The tests cover API validation, ownership, group and earthquake isolation, expiry, deletion, transaction rollback, browser controls, and stale-response handling.

Store tests run the migration and SQL against PostgreSQL through PGlite/WASM. They do not verify the TimescaleDB conversion, remote TLS, or an authenticated Tiger Cloud connection.

Passing tests alone does not prove that a live database has been provisioned or that production deployment is correctly configured.

To check the build separately, run:

```bash
npm run check
```

## Troubleshooting

**Shared check-ins are unavailable**

- Confirm that `TIGER_DATABASE_URL` is configured in the relevant local or Vercel environment.
- Ensure the database migration has completed successfully.
- Check that the deployed API routes are available.
- Inspect Vercel function logs for deployment or connectivity problems.

**Database setup fails**

- Check the PostgreSQL URL and URL-encode reserved characters in the password.
- Verify database access permissions and network connectivity.
- Check the TLS certificate and `TIGER_DATABASE_CA` configuration.
- Confirm that the local Node.js version supports `process.loadEnvFile`.

**Check-ins cannot be saved**

- Confirm that the browser joined the intended group.
- Check that the request contains valid group and owner credentials.
- Verify that the database is reachable and inspect the server-side logs.

If the API returns a temporary-unavailability error, the change was not confirmed. Retry only after checking connectivity.

**Speech functionality fails**

If the application uses ElevenLabs speech functionality, verify that its API key is configured in the appropriate server-side environment. Do not expose it in frontend code or commit it to source control.

## Security and indexing

Keep `.env.local` and all credentials out of version control. Use Vercel environment variables for production secrets.

The site's `X-Robots-Tag` header requests that search engines not index the application. This does not make the site private or restrict access to its public URL.