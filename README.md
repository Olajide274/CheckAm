# CheckAm

CheckAm is a Nigerian before-you-pay device check for phones and laptops. Buyers can check an IMEI or serial number before paying, sellers can prove ownership, and owners can register devices and report them lost or stolen.

## Overview

This repository contains the foundation for the product:

- a Next.js web app for the public check and waitlist experience
- an ASP.NET Core API with layered architecture for domain, application, infrastructure, and API concerns
- PostgreSQL and Redis services for local development via Docker Compose
- GitHub Actions CI to build and test both app stacks on every pull request

## Local setup

### Prerequisites

- Node.js 20+
- .NET 8 SDK
- Docker Desktop or Docker Engine with Compose

### Start dependencies

```bash
docker compose up -d
```

### Run the web app

```bash
cd apps/web
npm install
npm run dev
```

### Run the API

```bash
cd apps/api
dotnet restore
dotnet build
dotnet run --project CheckAm.Api
```

## Project status

This repository is currently in Step 0: repository and tooling setup. The next step is the landing page and demand test.
