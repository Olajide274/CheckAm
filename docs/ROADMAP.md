# CheckAm roadmap

Rule: one step at a time. Only the CURRENT step may be built. A step is DONE only when every "Done when" item is true.

Status key: CURRENT, TODO, BLOCKED, DONE

## Step 0: Repo and tooling (DONE)
Done when: README explains the project; folders exist; docker-compose runs PostgreSQL and Redis; an empty Next.js app and an empty ASP.NET Core solution (four layered projects plus a test project) both build; a GitHub Actions workflow builds and tests both apps on every pull request; .editorconfig and .gitignore are in place.

## Step 1: Landing page deployment (TODO)
Done when: a fast, mobile-first landing page with the CheckAm logo; a "Check a phone before you buy" input that validates IMEI format only; a waitlist form saving to PostgreSQL; a "Get the full report, N500" button that only records clicks; a one-question sign-up ("which feature would you use most?"); basic analytics events; deployed.
Paused for the `step-seller-proof` branch by user authorization; deployment completion remains to be confirmed.

## Step 1c: Paystack test checkout (DONE)
Done when: a default-off payment feature flag enables the Preview-only ₦500 test checkout; payment initialization stores a unique pending reference before calling Paystack; raw-body webhook signatures are checked and successful payments are verified server-to-server; a rate-limited status route reports only paid/pending/failed and verifies pending payments; IMEI values are stored only as a keyed hash and last four digits plus the format/Luhn checks; pending payments expire after 30 minutes; and the landing page polls before showing a payment-received message. The report route is server-gated behind `FEATURE_PAYMENTS`, redirects any unpaid or invalid reference to `/`, and keeps the printable report view behind a successful payment only.

## Step 1d: TAC model lookup (DONE)
Done when: payment records store only the first eight IMEI digits for model lookup in addition to the existing protected IMEI fields; `tac_models` holds imported TAC, brand, model, source, and import time; a CSV importer handles quoted values and duplicate TACs and skips invalid rows; the paid report looks up TAC data server-side behind `FEATURE_PAYMENTS`, compares an optional seller description using normalized tokens, and displays the data source and limitations; and lookup, comparison, importer, and payment-storage tests pass.

## Step 1b: Bill of sale generator (DONE)
Done when: a default-off feature flag controls the generator; the form captures both parties' names and phone numbers, device type, brand/model, IMEI or serial number, price in naira, date, and condition notes; 15-digit IMEIs pass Luhn validation; the browser creates a printable PDF with the required disclaimer; and agreement details can be shared through a fragment-based link on WhatsApp without being stored on the server.

## Step 2: API foundation (DONE)
Done when: health endpoint; global error handling; structured logging; rate limiting; migrations run in CI; OpenAPI docs.

## Step 3: Phone OTP login (BLOCKED)
Done when: OTP request and verify with throttling, sessions, and tests.
Blocked because: "Phone OTP flow is implemented and tested; a production SMS sender is deferred until a provider is chosen."

## Step 4: Device registration (TODO)
Done when: register a device (IMEI or serial, photos, receipt upload); IMEI validity check; model-match lookup behind an interface; duplicate registrations blocked.

## Step 5: Public check and reports (TODO)
Done when: the public check endpoint and page return only the allowed statuses; report lost or stolen; abuse limits and scraping protection tested.

## Step 6: Admin, proof, and disputes (TODO)
Done when: admin review queue; "Under review" state; dispute workflow with an audit log.

## Step 7: Paid report and Seller Proof (CURRENT)
Done when: the free IMEI result states that format/Luhn checks do not identify the model or indicate user reports and links to the ₦500 report; successful payment unlocks the TAC brand/model result, the Bill of Sale generator, and Seller Proof controls; a paid buyer can create, copy, and share a unique Seller Proof request link; the seller can submit a receipt/device photo and optional contact number; only one response is accepted per link; the payment-gated report shows the response time and submitted photo; private contact details are not exposed outside the paid report; every result includes the required disclaimer; and feature-flag, payment-gating, upload-validation, and UI tests pass.

## Step 8: Payments (TODO)
Done when: 3 free checks per verified number; wallet and bundles through Paystack or Flutterwave; webhooks are idempotent; reconciliation report.

## Step 9: WhatsApp check (TODO)
Done when: send an IMEI to the WhatsApp number and receive the report.

## Step 10: Dealer accounts (TODO)
Done when: dealer signup, bulk upload and check, plans and quotas, team seats.

## Step 11: Hardening and launch (TODO)
Done when: security review, load test of the check endpoint, backup restore test, privacy policy and terms published, monitoring and alerts live.
