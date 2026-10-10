# CheckAm API

The API targets the repository's configured .NET 8 LTS SDK and uses PostgreSQL
through Entity Framework Core. Set
`ConnectionStrings__DefaultConnection` in the environment before starting the
API or applying migrations. For the existing Compose PostgreSQL service, the
local value is:

```text
Host=localhost;Port=5432;Database=checkam;Username=postgres;Password=postgres
```

For local development, set it using .NET user secrets from this directory:

```sh
dotnet user-secrets init --project CheckAm.Api
dotnet user-secrets set "ConnectionStrings:DefaultConnection" \
  "Host=localhost;Port=5432;Database=checkam;Username=postgres;Password=postgres" \
  --project CheckAm.Api
```

Start the API with `dotnet run --project CheckAm.Api`. The health endpoint is
`/health`; Swagger is available at `/swagger` only in Development. HTTP request
logs use structured route-template fields and do not include raw paths, query
strings, or request bodies. All requests are subject to the built-in per-client
rate limit.

## Database migrations

The EF Core migration and tool manifest are checked in. From `apps/api`, run:

```sh
dotnet tool restore
./scripts/apply-migrations.sh
```

The script applies migrations to the database specified by
`ConnectionStrings__DefaultConnection`; CI can run the same script after
starting PostgreSQL and exporting that variable. New schema changes should be
created with:

```sh
dotnet ef migrations add <MigrationName> \
  --project CheckAm.Infrastructure \
  --startup-project CheckAm.Api \
  --context CheckAmDbContext
```

## Phone OTP sign-in

Set `Auth__OtpHashKey` to a randomly generated, base64-encoded key containing at
least 32 bytes. Keep it in environment configuration or .NET user secrets; it is
used to HMAC OTP codes, phone/IP rate-limit keys, and session tokens. Run
`dotnet user-secrets set "Auth:OtpHashKey" "<base64-encoded random key>" --project CheckAm.Api`
for local development.

In Development, the configured OTP sender does not deliver codes; it logs only
that delivery is disabled and never logs the phone number or OTP. Codes expire
after five minutes, can be used once, and allow at most five attempts. OTP
requests are limited to three per phone number and ten per IP address in each
ten-minute window. These limits and active sessions are stored in PostgreSQL. Use
`Auth__CookieDomain` only when the API and web app need to share a parent-domain
cookie; leave it unset for local development.

To inspect a Development OTP locally, explicitly set
`Auth__DevelopmentLogOtp=true`. This setting defaults to false and the API
refuses to start if it is enabled outside Development. The opt-in logs the code
but not the phone number; it does not send an SMS.

The session cookie is HttpOnly, SameSite=Lax, and Secure for Production or HTTPS
requests. Sessions expire after 30 days. The web app proxies these endpoints
through `/api/auth/*`; set `CHECKAM_API_URL` in the web process to the API origin
(for example `http://localhost:5155`).

`IOtpSender` is the provider boundary. This repository includes only a
Development-only, non-delivering sender; other environments fail startup until
a production SMS sender is implemented and configured. No OTP is returned in
an HTTP response.
