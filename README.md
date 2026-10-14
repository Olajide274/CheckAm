# CheckAm

CheckAm is a Nigerian before-you-pay device-check project for phones and
laptops. The repository currently contains a mobile-first landing page with an
IMEI format check, a PostgreSQL-backed waitlist and basic analytics, plus an
ASP.NET Core API foundation.

## Current roadmap status

- Steps 0 and 2: DONE.
- Phase 1: CURRENT — accounts, roles, free-tier limits, and dashboards.
- Step 1: TODO — deploy the landing page and demand test.
- Steps 1b and 1c: DONE.
- Step 1d: DONE — add TAC model lookup to the paid report.
- Step 3: BLOCKED — the phone OTP flow exists, but a production SMS sender is
  deferred until a provider is chosen.
- Steps 4–11: TODO, including Step 7 (paid report and Seller Proof).

See [docs/ROADMAP.md](docs/ROADMAP.md) and
[the SMS provider decision](docs/decisions/0001-defer-sms-provider.md).
The IMEI check validates input format only; it does not check a device registry.
Email/password accounts are available at `/register` and `/login`; phone is
optional, stored for later verification, and not verified. Sessions use opaque
random tokens in `HttpOnly`, `SameSite=Lax` cookies, with only the token hash
stored in PostgreSQL, and expire after 30 days. Email verification is a
non-blocking reminder; in development, its token is written to the server log
and can be submitted at `/api/accounts/verify-email`. No email or SMS provider
is connected.
`/dashboard` shows buyer- or seller-specific links. Free buyers may start one
full-report checkout per rolling 30 days; pending checkouts reserve the limit
until they expire after 30 minutes. Anonymous visitors keep the existing
optional paid-report flow and are not subject to the registered-account limit.
Free sellers may use the bill-of-sale generator twice per rolling 30 days while
signed in; anonymous use remains as before. Premium and Pro plan values are
reserved in the data model; subscription billing is not available. The seller
shop route is only a coming-soon stub.
The server-gated `/report/[reference]` route is enabled only with
`FEATURE_PAYMENTS=true` and only after a successful payment reference is
confirmed server-side. It keeps the report behind a redirect to `/` for any
unpaid, pending, failed or made-up reference and includes a print-to-PDF action.
The report's model code check looks up the first eight IMEI digits (TAC) in the
local `tac_models` table. Payment records store the TAC, not the full IMEI.
Seller descriptions are compared using normalized word tokens; partial overlap
is reported as inconclusive.

To register, configure `DATABASE_URL`, run `npm run dev` from `apps/web`, and
open `/register`. Use a valid email, a password of at least 12 characters, and
choose buyer or seller. Account tables and indexes are created on first
database use.

## Seller Proof attachments

Seller Proof is enabled only when `FEATURE_PAYMENTS=true` and
`FEATURE_SELLER_PROOF=true`. Sellers can submit one JPEG, PNG, or WebP image,
up to 2 MB. Uploads are decoded, auto-rotated, stripped of metadata, resized
to at most 1600 pixels on the long side, and re-encoded as JPEG at quality 80.
Seller phone numbers are not collected or stored. Attachments are available
only in the successful payment report they belong to.

Attachment data and MIME types are deleted 30 days after the seller responds.
Schedule `npm run purge:seller-proof` to run daily from `apps/web`, with
`DATABASE_URL` configured in the scheduler's protected environment. For
example, a server cron can run:

```cron
17 2 * * * cd /path/to/CheckAm/apps/web && npm run purge:seller-proof
```

To load an Osmocom TAC CSV with `tac`, `brand`, and `model` columns, place it at
`apps/web/data/tac.csv` and run `npm run import:tac` from `apps/web` with
`DATABASE_URL` set. The supplementary community TAC list uses
`apps/web/data/tac-supplement.csv` and `npm run import:tac:supplement`. The data
directory is ignored by Git. Imports skip invalid rows and let the last valid
duplicate TAC take precedence. Osmocom TAC data (CC-BY-SA 3.0) is authoritative
and overwrites existing TAC records; the supplement only inserts missing TACs.

## Local development

Prerequisites: Node.js 20+, .NET 8 SDK, and Docker Compose.

Start PostgreSQL:

```sh
docker compose up -d postgres
```

Run the web app from `apps/web` with a PostgreSQL `DATABASE_URL`:

```sh
npm ci
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/checkam' npm run dev
```

Run the API from `apps/api` after setting
`ConnectionStrings__DefaultConnection` and `Auth__OtpHashKey` in environment
configuration or .NET user secrets. The OTP hash key must be base64-encoded and
contain at least 32 random bytes. Apply schema changes with
`./scripts/apply-migrations.sh`. Development OTP logging is disabled unless
`Auth__DevelopmentLogOtp=true` is explicitly set; it is rejected outside
Development and does not send a message.

## Deploy the landing page

1. Create a Vercel project from this repository and set its Root Directory to
   `apps/web`.
2. Provision a managed PostgreSQL database reachable from Vercel (for example,
   through a Vercel integration or an external PostgreSQL provider). Use a
   separate database for production and preview environments where practical.
3. Set `DATABASE_URL` in the Vercel project environment variables to that
   database's PostgreSQL connection URI. Use the provider's serverless/pooling
   connection URI where it supplies one; the database role must be able to
   create and write the app's tables.
4. Deploy. The web app creates its waitlist, analytics, account, payment, TAC,
   and Seller Proof tables on first database use; no API EF migration is needed
   for these web tables. Verify the landing page, create a test account, and
   confirm the expected records in the database.

### Production payments launch checklist

- Keep `FEATURE_PAYMENTS` unset or `false` by default; enable it explicitly
  only after completing this checklist.
- Confirm the Vercel project is on Pro and its production environment has both
  `APP_ENV=production` and `VERCEL_ENV=production`.
- Configure `PAYSTACK_SECRET_KEY` as a server-only live key
  (`sk_live_...`) in Vercel Production. Live keys are rejected unless both
  environment markers are production; test keys are rejected in production.
- Set Paystack's live webhook URL to
  `https://<production-domain>/api/payments/webhook`.
- Run the idempotent schema upgrade in
  [`apps/web/db/neon-schema.sql`](apps/web/db/neon-schema.sql), or confirm the
  first-use application upgrade has created/added all payment, TAC, rate-limit,
  and Seller Proof tables and columns.
- Import the production TAC datasets and preserve attribution with
  `npm run import:tac` and `npm run import:tac:supplement` from `apps/web`.
- Complete a controlled payment/webhook check and reconcile using
  `npm run payments:summary` from `apps/web`; its output contains only
  aggregates, never emails or IMEIs.

`DATABASE_URL` is required for waitlist submissions and analytics. The public
landing page can render without it, but those persistence requests will fail
until it is configured.

`CHECKAM_API_URL` is only needed if a separately hosted API is configured for
the web app's `/api/auth/*` proxy. Production phone sign-in is not ready: no
production SMS sender has been selected or implemented. Do not enable
`Auth__DevelopmentLogOtp` outside Development.

## Tests

Web tests run from `apps/web` with `npm test`; API tests run from `apps/api`
with `dotnet test CheckAm.sln`. CI starts PostgreSQL, applies EF Core migrations,
and runs the API tests against that database service.
