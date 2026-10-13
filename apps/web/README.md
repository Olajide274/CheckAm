# CheckAm web

Mobile-first CheckAm landing page, paid device report, and early-access
waitlist. The `/login` and `/app` routes currently show a Coming soon page; the
OTP implementation remains in the repository but is not exposed on the public
site.

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

The free IMEI form checks only the 15-digit format and Luhn checksum in the
browser. It does not identify the model or check whether a user report exists.
When payments are enabled, the ₦500 paid report shows the TAC model lookup and
report status.

## Bill of sale

The browser-only bill of sale generator is disabled unless
`FEATURE_BILL_OF_SALE=true` is set in the app's environment. Agreement details
stay in the browser and are shared through a URL fragment; they are not saved
on CheckAm servers. To enable it locally, run this from `apps/web`:

```bash
FEATURE_BILL_OF_SALE=true npm run dev
```

Use the print action and choose “Save as PDF” to export the agreement.

## Paid report (Paystack test mode)

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

PostgreSQL creates the `payments`, payment rate-limit, TAC, and Seller Proof
tables on first use. For Neon, run the corresponding statements in
`db/neon-schema.sql` in the Neon SQL Editor before deployment. The email is
stored with its payment only to initialize Paystack's transaction and deliver
its receipt. An optional device identifier is stored as a keyed hash and its
last four digits only. The report route and attachment download require a
successful, confirmed payment; a return from Paystack alone does not unlock
the report.

## TAC model data

TAC imports write to the same PostgreSQL `tac_models` table used by the paid
report. The Osmocom importer expects its license line followed by
`tac,name,name,...`; the first `name` is mapped to brand and the second to
model. The supplement importer expects `tac,brand,model` and optionally a
`source` column. Both validate eight-digit TACs and non-empty brand/model
values, skip invalid rows, report row counts, and upsert by TAC. Duplicate TACs
inside one file use the last valid row. A supplement row takes precedence over
an Osmocom row regardless of import order; a later supplement import replaces
an earlier supplement row.

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

The Osmocom-style data is open reference data attributed to the Osmocom TAC
database under CC-BY-SA 3.0. This is not the complete GSMA TAC database, and
neither the reference data nor the supplement is guaranteed to include every
model sold in Nigeria. A missing match means only that this database has no
usable model entry for the submitted TAC.

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

Playwright starts the Next.js development server and mocks the persistence and
authentication APIs. To exercise persistence or sign in locally, leave
PostgreSQL and the API running and submit a waitlist signup or request an OTP.
