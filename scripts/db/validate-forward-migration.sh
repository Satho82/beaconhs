#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 3 ]]; then
  echo "usage: $0 DATABASE_URL MIGRATION_SQL allowed,objects" >&2
  exit 64
fi
root="$(cd "$(dirname "$0")/../.." && pwd)"
dump="$(mktemp)"
trap 'rm -f "$dump"' EXIT
pg_dump "$1" --schema-only --no-owner --no-privileges --no-comments > "$dump"
cd "$root"
pnpm --filter @beaconhs/db exec tsx src/forward-migration-cli.ts "$dump" "$2" "$3"
