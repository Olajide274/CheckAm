# Decision 0001: Defer the sign-in provider

- Status: Deferred
- Date: 2026-10-10

## Decision

Do not build or select a production SMS provider as part of the current work.
The phone OTP flow remains implemented, but Step 3 stays blocked until the
product chooses how users should sign in and the selected provider can be
configured and exercised end-to-end.

Development OTP logging is disabled by default. It may be explicitly enabled
with `Auth:DevelopmentLogOtp=true` only in the Development environment.

## Options to evaluate

- **SMS OTP:** Familiar phone-based sign-in; requires a Nigerian-capable SMS
  provider, delivery and operational monitoring, and a clear cost model.
- **Email OTP:** Avoids SMS delivery integration but requires collecting email
  addresses and reliable email delivery.
- **Google sign-in:** Delegates authentication to Google; requires OAuth
  application setup and a decision about account linking and supported users.
- **WhatsApp OTP:** Uses a familiar channel but requires an approved WhatsApp
  Business messaging integration, templates, and delivery-cost review.

## Revisit when

- The product owner selects one of the options above.
- Provider ownership, credentials/configuration, expected costs, and operational
  responsibilities are agreed.
- User-facing privacy, consent, and recovery behavior are defined for the
  selected identifier and channel.
- The selected provider has a working end-to-end integration, with tests for
  success, delivery failure, throttling, expiry, and session creation.
- No authentication code or secret is logged or returned outside the intended
  development-only OTP logging setting.
