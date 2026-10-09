# CheckAm: instructions for Copilot

## Product
CheckAm ("check am" = check it) is a Nigerian "Before You Pay" device check. Buyers check a phone or laptop (IMEI or serial) before paying, sellers prove ownership, and owners register devices and report them lost or stolen. It is a private, user-reported registry. It is not affiliated with the NCC.

## How to work (most important)
1. Read docs/ROADMAP.md first. Work ONLY on the step marked CURRENT.
2. Never start, scaffold, or prepare a later step.
3. Finish every item in the step's "Done when" list and run the tests. Then mark the step DONE, mark the next step CURRENT in the roadmap, summarise what changed, and STOP for my review.
4. If something is unclear, ask. Do not guess.
5. One step = one branch (step-N-short-name) = one pull request.

## Stack
- apps/web: Next.js (App Router), TypeScript strict, Tailwind CSS.
- apps/api: ASP.NET Core Web API on the latest LTS .NET, EF Core, FluentValidation.
- PostgreSQL, Redis, Docker Compose for local development.

## Architecture
API layers: Domain, Application, Infrastructure, Api. Dependencies point inward. No business logic in controllers. Use DTOs, EF Core migrations, and ProblemDetails for errors.

## Security and privacy
- No secrets in code; use environment variables.
- Normalise IMEI and serial numbers; store a hashed lookup value and encrypt the raw value.
- Public results never show owner name, phone number, receipts, or photos.
- Rate limit every public endpoint. Audit-log admin actions and status changes.
- Validate all input. Collect the minimum personal data (Nigeria Data Protection Act).

## Wording rules (legal, strict)
Public results may only say: "Reported lost or stolen by the registered owner", "Registered, no report found", "No record found", "Under review", or "Ownership transferred on <date>".
Never use the words: clean, verified safe, legal, not stolen, approved by NCC, blacklisted, blocked, tracked.
Every result shows: "This result is based on information reported by users. It is not proof of ownership, legality or safety."

## Quality
Tests for every new behaviour (xUnit for the API, Vitest and Playwright for the web). No TODO placeholders. Conventional commits. Update docs when behaviour changes.
