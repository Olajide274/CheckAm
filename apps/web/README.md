# CheckAm web

Mobile-first CheckAm landing page, paid device report, early-access waitlist,
and email-first accounts with role dashboards. The separate phone OTP API
remains in the repository but is not exposed by the web sign-in flow.

## Run locally

```bash
docker compose up -d postgres
cd apps/web
npm ci
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/checkam npm run dev
```

Open http://localhost:3000. The web app creates its tables on first database
use. Set `DATABASE_URL` in the environment for a non-local database; the URL
above uses credentials configured by the local Compose service only.

For Neon, set `DATABASE_URL` to your Neon connection string. The app creates
waitlist, analytics, account, payment, TAC, and Seller Proof tables on first
use. To create them in advance, run
[db/neon-schema.sql](./db/neon-schema.sql) in the Neon SQL Editor.

The free IMEI form checks only the 15-digit format and Luhn checksum in the
browser. It does not identify the model or check whether a user report exists.
When payments are enabled, the ₦500 paid report shows the TAC model lookup and
report status.

## Accounts, dashboards, and free limits

Register at `/register` with a valid email, a password of at least 12
characters, and a required buyer or seller role. Phone is optional, stored for
possible later verification, and not verified or sent by SMS in this phase.
Passwords are hashed with Node.js scrypt and never logged.

Sign-in creates a random opaque session token in an `HttpOnly`,
`SameSite=Lax` cookie (also `Secure` in production). The token hash is stored in
PostgreSQL; sessions expire after 30 days. Logout deletes the server session
and expires the cookie. Registration and login are rate-limited by hashed client
address and email identifiers. Set `ACCOUNT_RATE_LIMIT_SECRET` to a
server-only random secret of at least 32 characters in Production and Preview;
development uses a local-only fallback.

Email verification is a non-blocking soft reminder. No email provider is
connected. In development only, registration logs a short-lived verification
token without logging the email; submit it to `POST /api/accounts/verify-email`
to mark the address verified. An unverified account can still use the app.

- **Buyer Free:** unlimited format/Luhn-only IMEI checks and one full-report
  checkout per rolling 30 days. A checkout uses the existing one-time ₦500
  Paystack payment; a pending checkout reserves the quota until it succeeds
  or expires. The server serializes quota checks with payment creation. Premium
  and Pro are data-model values only and have no checkout.
- **Seller Free:** two bill-of-sale actions per rolling 30 days when signed in.
  Premium and Pro are data-model values only and have no checkout. Anonymous
  bill-of-sale use remains unchanged.

Anonymous visitors can continue the existing optional paid-report flow and
aren't required to register. Their payment behavior remains governed by the
existing Paystack feature flag and key-mode safeguards. `/dashboard` requires
an account. The seller shop destination is only a coming-soon stub.

To start, configure `DATABASE_URL` and run `npm run dev` from `apps/web`, then
open `/register`. Account tables and indexes are created on first database
use, or can be installed ahead of time with the idempotent SQL in
[`db/neon-schema.sql`](./db/neon-schema.sql).

## Bill of sale

The browser-only bill of sale generator is disabled unless
`FEATURE_BILL_OF_SALE=true` is set in the app's environment. Agreement details
stay in the browser and are shared through a URL fragment; they are not saved
on CheckAm servers. To enable it locally, run this from `apps/web`:

```bash
FEATURE_BILL_OF_SALE=true npm run dev
```

Use the print action and choose “Save as PDF” to export the agreement.

## Paid report (Paystack)

Payments are disabled by default. Set `FEATURE_PAYMENTS=true` only when
intentionally enabling checkout. Preview and local use Paystack test credentials
(`sk_test_...`). Production requires `APP_ENV=production`,
`VERCEL_ENV=production`, and a Paystack live secret (`sk_live_...`); test keys
are rejected if either environment marker is production, and live keys are
rejected unless both are production. The application logs only whether Paystack
test or live mode is active, never the key. Never expose `PAYSTACK_SECRET_KEY`
or `IMEI_HASH_SECRET` in a `NEXT_PUBLIC_` variable or client bundle.

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

PostgreSQL creates the `payments`, payment rate-limit, TAC, and Seller Proof
tables on first use and adds missing columns to older versions. For Neon, run
the idempotent statements in `db/neon-schema.sql` in the Neon SQL Editor before
deployment. The email is
stored with its payment only to initialize Paystack's transaction and deliver
its receipt. An optional device identifier is stored as a keyed hash and its
last four digits only. The report route and attachment download require a
successful, confirmed payment; a return from Paystack alone does not unlock
the report.

### Production launch checklist

- Keep `FEATURE_PAYMENTS` unset or `false` by default. Enable it explicitly
  only after the production checks below are complete.
- Confirm the Vercel project is on the Pro plan and that the production
  deployment has `APP_ENV=production` and `VERCEL_ENV=production`.
- Add the Paystack live secret as the server-only `PAYSTACK_SECRET_KEY`
  production environment variable. Do not configure a test key in production;
  redeploy after changing environment variables.
- Configure Paystack's live webhook URL as
  `https://<production-domain>/api/payments/webhook`.
- Upgrade the production database using the idempotent
  [`db/neon-schema.sql`](./db/neon-schema.sql), or make a first app request to
  run the automatic schema upgrade. Confirm that payments, TAC, rate-limit,
  and Seller Proof tables and columns are present before enabling checkout.
- Import the licensed TAC data and any attributed supplementary data into the
  production database using `npm run import:tac` and
  `npm run import:tac:supplement` from `apps/web`.
- Verify a controlled live payment and its webhook, then use the aggregate-only
  `npm run payments:summary` report for reconciliation. The report includes no
  email addresses or IMEI values.

## TAC model data

TAC imports write to the same PostgreSQL `tac_models` table used by the paid
report. The Osmocom importer expects its license line followed by
`tac,name,name,...`; the first `name` is mapped to brand and the second to
model. The supplement importer expects `tac,brand,model` and optionally a
`source` column. Both validate eight-digit TACs and non-empty brand/model
values, skip invalid rows, and report row counts. Duplicate TACs inside one
file use the last valid row. Osmocom is authoritative: its import overwrites
any existing TAC row, while a supplement import inserts only TACs not already
present. The row's `source` records either the Osmocom TAC database or the
supplement attribution.

Set `DATABASE_URL` to the same PostgreSQL connection string used by the
application, then run from `apps/web`. Replace the placeholder with the
database's connection string; do not commit it:

```bash
cd apps/web
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE'
npm run import:tac -- data/tac.csv
npm run import:tac:supplement -- data/tac-supplement.csv
```

The file arguments are optional. The first command defaults to
`data/tac.csv`; the second defaults to `data/tac-supplement.csv`. Files in
`apps/web/data/` are excluded from Git; keep source datasets out of commits and
record each supplemental dataset's attribution in its `source` column.

Model data comes from the Osmocom TAC database under CC-BY-SA 3.0 and a
supplementary community TAC list. The Osmocom data is not the complete GSMA TAC
database, and neither source is guaranteed to include every model sold in
Nigeria. A missing match means only that this database has no usable model
entry for the submitted TAC.

## Seller Proof

Seller Proof is disabled by default. Set `FEATURE_SELLER_PROOF=true` alongside
the Preview-only `FEATURE_PAYMENTS=true` flag to show its controls in a paid
report. A buyer can create a random, single-use request link, copy it, or open
a WhatsApp share. The link value is not stored; only its SHA-256 hash is kept
in PostgreSQL. A seller can submit one JPEG, PNG, or WebP photo up to 2 MB.
Uploads must decode successfully; they are auto-rotated, stripped of metadata,
resized to at most 1600 pixels on the long side, and re-encoded as JPEG at
quality 80. Seller phone numbers are not collected or stored. The paid report
shows the response time and offers the photo download only to the payment that
owns it. Request creation, status polling, and submission are rate limited.

The seller link is a bearer link: send it only to the intended seller.
Attachments are deleted 30 days after the seller responds. Schedule
`npm run purge:seller-proof` to run daily from `apps/web`, with `DATABASE_URL`
set in the scheduler's protected environment. For example, a server cron can
run:

```cron
17 2 * * * cd /path/to/CheckAm/apps/web && npm run purge:seller-proof
```

## Tests

```bash
npm test
npm run test:e2e
npm run lint
npm run build
```

Generate aggregate payment counts by status/day and the successful amount in
naira with `DATABASE_URL` set:

```bash
npm run payments:summary
```

Playwright starts the Next.js development server and mocks the persistence and
authentication APIs. To exercise persistence or sign in locally, leave
PostgreSQL and the API running and submit a waitlist signup or request an OTP.
