#!/usr/bin/env sh
set -eu

if [ -z "${ConnectionStrings__DefaultConnection:-}" ]; then
  echo "Set ConnectionStrings__DefaultConnection before applying database migrations." >&2
  exit 1
fi

dotnet tool restore
dotnet ef database update \
  --project CheckAm.Infrastructure \
  --startup-project CheckAm.Api \
  --context CheckAmDbContext
