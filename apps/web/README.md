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

The IMEI form checks the 15-digit format and Luhn checksum in the browser. It does not run a registry check. The full-report button records interest only in production; the separate Step 1c payment checkout is available only when its feature flag is enabled. A payment success message does not include a device report.

## Bill of sale

The browser-only bill of sale generator is disabled unless
`FEATURE_BILL_OF_SALE=true` is set in the app's environment. Agreement details
stay in the browser and are shared through a URL fragment; they are not saved
on CheckAm servers. To enable it locally, run this from `apps/web`:

```bash
FEATURE_BILL_OF_SALE=true npm run dev
```

Use the print action and choose “Save as PDF” to export the agreement.

## Step 1c payment checkout (Paystack test mode)

Payments are disabled unless `FEATURE_PAYMENTS=true`. They are always disabled
when `VERCEL_ENV=production`; enable the flag in Preview only. Use Paystack
**test-mode** credentials (`sk_test_...` and, optionally, `pk_test_...`) only.
Never expose `PAYSTACK_SECRET_KEY` or `IMEI_HASH_SECRET` in a `NEXT_PUBLIC_`
variable or client bundle.

Set these server-side environment variables for Preview or local development:

- `FEATURE_PAYMENTS=true` to enable the checkout outside production.
- `DATABASE_URL` for the existing PostgreSQL database.
- `PAYSTACK_SECRET_KEY` to a Paystack test secret key (`sk_test_...`).
- `IMEI_HASH_SECRET` to a random secret of at least 32 characters. It is used
  only to HMAC-hash the optional normalized IMEI; the raw IMEI is not stored.
- `APP_BASE_URL` to the HTTPS base URL of the app. Local development may use
  `http://localhost:3000`.

Paystack sends `charge.success` and `charge.failed` events to
`/api/payments/webhook`. Configure that endpoint in the Paystack test
dashboard. The route checks `x-paystack-signature` against the raw request body
using HMAC SHA-512 and `PAYSTACK_SECRET_KEY`; a separate webhook secret is not
used. Successful webhooks and status checks are cross-checked with Paystack's
server-side transaction verification endpoint (reference, status, ₦500 amount,
and NGN currency). Pending payments expire after 30 minutes.

PostgreSQL creates the `payments` and payment rate-limit tables on first use.
For Neon, run the corresponding statements in `db/neon-schema.sql` in the Neon
SQL Editor before deployment. The email is stored with its payment only to
initialize Paystack's transaction and deliver its receipt. An optional device
identifier is stored as a keyed hash and its last four digits only. The current
app does not yet generate or expose a full report.

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
