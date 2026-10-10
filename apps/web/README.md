# CheckAm web

Mobile-first CheckAm landing page and early-access waitlist, with Step 3 phone
OTP sign-in and a responsive app shell.

## Run locally

```bash
docker compose up -d postgres
cd apps/web
npm ci
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/checkam npm run dev
```

Open http://localhost:3000. The database tables are created when the first waitlist or analytics request is received. Set `DATABASE_URL` in the environment for a non-local database; the URL above uses credentials configured by the local Compose service only.

For phone sign-in, start the API from `apps/api` in Development with
`ConnectionStrings__DefaultConnection` and `Auth__OtpHashKey` set, apply its EF
migrations, then set `CHECKAM_API_URL=http://localhost:5155` for the web process.
The Development OTP sender writes sign-in codes to the API console. The Next.js
same-origin auth routes forward requests and the HttpOnly session cookie to the
API.

Logged-out visitors continue to use the public landing page. `/login` provides
phone OTP sign-in, and `/app` shows the session-gated CheckAm product shell with
Check, My Devices, History, and Account tabs.

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
