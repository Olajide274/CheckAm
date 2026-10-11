# CheckAm

CheckAm is a Nigerian before-you-pay device-check project for phones and
laptops. The repository currently contains a mobile-first landing page with an
IMEI format check, a PostgreSQL-backed waitlist and basic analytics, plus an
ASP.NET Core API foundation.

## Current roadmap status

- Steps 0 and 2: DONE.
- Step 1: CURRENT — deploy the landing page and demand test.
- Steps 1b and 1c: DONE.
- Step 1d: DONE — add TAC model lookup to the paid report.
- Step 3: BLOCKED — the phone OTP flow exists, but a production SMS sender is
  deferred until a provider is chosen.
- Steps 4–11: TODO.

See [docs/ROADMAP.md](docs/ROADMAP.md) and
[the SMS provider decision](docs/decisions/0001-defer-sms-provider.md).
The IMEI check validates input format only; it does not check a device registry.
The ₦500 button records interest and does not take payment.
The public `/login` and `/app` routes show a Coming soon page. The OTP
implementation remains in the repository but is not exposed on the public site.
The server-gated `/report/[reference]` route is enabled only with
`FEATURE_PAYMENTS=true` and only after a successful payment reference is
confirmed server-side. It keeps the report behind a redirect to `/` for any
unpaid, pending, failed or made-up reference and includes a print-to-PDF action.
The report's model code check looks up the first eight IMEI digits (TAC) in the
local `tac_models` table. Payment records store the TAC, not the full IMEI.
Seller descriptions are compared using normalized word tokens; partial overlap
is reported as inconclusive.

To load an Osmocom TAC CSV with `tac`, `brand`, and `model` columns, place it at
`apps/web/data/tac.csv` and run `npm run import:tac` from `apps/web` with
`DATABASE_URL` set. The data directory is ignored by Git. Imports skip invalid
rows, let the last valid duplicate TAC take precedence, and update existing TAC
records.

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
4. Deploy. The web app creates its `waitlist_signups` and `analytics_events`
   tables on the first waitlist or analytics request; no API EF migration is
   needed for these web tables. Verify the landing page, submit a test signup,
   and confirm the analytics and signup records in the database.

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
