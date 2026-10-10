# CheckAm web

Mobile-first CheckAm landing page and early-access waitlist. The `/login` and
`/app` routes currently show a Coming soon page; the OTP implementation remains
in the repository but is not exposed on the public site.

## Run locally

```bash
docker compose up -d postgres
cd apps/web
npm ci
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/checkam npm run dev
```

Open http://localhost:3000. The database tables are created when the first waitlist or analytics request is received. Set `DATABASE_URL` in the environment for a non-local database; the URL above uses credentials configured by the local Compose service only.

For Neon, set `DATABASE_URL` to your Neon connection string. The app creates
`waitlist_signups` and `analytics_events` automatically on the first waitlist or
analytics request. To create them in advance, run
[db/neon-schema.sql](./db/neon-schema.sql) in the Neon SQL Editor.

The IMEI form checks the 15-digit format and Luhn checksum in the browser. It does not run a registry check. The full-report button records interest only; it does not start a payment.

## Tests

```bash
npm test
npm run test:e2e
npm run lint
npm run build
```

Playwright starts the Next.js development server and mocks the persistence and
authentication APIs. To exercise persistence or sign in locally, leave
PostgreSQL and the API running and submit a waitlist signup or request an OTP.
