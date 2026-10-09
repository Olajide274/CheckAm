# CheckAm roadmap

Rule: one step at a time. Only the CURRENT step may be built. A step is DONE only when every "Done when" item is true.

Status key: CURRENT, TODO, DONE

## Step 0: Repo and tooling (CURRENT)
Done when: README explains the project; folders exist; docker-compose runs PostgreSQL and Redis; an empty Next.js app and an empty ASP.NET Core solution (four layered projects plus a test project) both build; a GitHub Actions workflow builds and tests both apps on every pull request; .editorconfig and .gitignore are in place.

## Step 1: Landing page and demand test (TODO)
Done when: a fast, mobile-first landing page with the CheckAm logo; a "Check a phone before you buy" input that validates IMEI format only; a waitlist form saving to PostgreSQL; a "Get the full report, N500" button that only records clicks; a one-question sign-up ("which feature would you use most?"); basic analytics events; deployed.

## Step 2: API foundation (TODO)
Done when: health endpoint; global error handling; structured logging; rate limiting; migrations run in CI; OpenAPI docs.

## Step 3: Phone OTP login (TODO)
Done when: OTP request and verify with throttling, sessions, and tests.

## Step 4: Device registration (TODO)
Done when: register a device (IMEI or serial, photos, receipt upload); IMEI validity check; model-match lookup behind an interface; duplicate registrations blocked.

## Step 5: Public check and reports (TODO)
Done when: the public check endpoint and page return only the allowed statuses; report lost or stolen; abuse limits and scraping protection tested.

## Step 6: Admin, proof, and disputes (TODO)
Done when: admin review queue; "Under review" state; dispute workflow with an audit log.

## Step 7: Seller proof link and bill of sale (TODO)
Done when: buyer sends a link; seller verifies by OTP and uploads proof; shareable bill of sale PDF.

## Step 8: Payments (TODO)
Done when: 3 free checks per verified number; wallet and bundles through Paystack or Flutterwave; webhooks are idempotent; reconciliation report.

## Step 9: WhatsApp check (TODO)
Done when: send an IMEI to the WhatsApp number and receive the report.

## Step 10: Dealer accounts (TODO)
Done when: dealer signup, bulk upload and check, plans and quotas, team seats.

## Step 11: Hardening and launch (TODO)
Done when: security review, load test of the check endpoint, backup restore test, privacy policy and terms published, monitoring and alerts live.
