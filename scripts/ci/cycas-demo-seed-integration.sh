#!/usr/bin/env bash
set -euo pipefail
# The older validation lane calls this script directly; current lanes execute
# the same harness through pnpm test. Only fixed disposable hosted CI settings
# may supply the fallback. Operator execution always requires an explicit URL.
if [[ -z "${CYCAS_TEST_DATABASE_URL:-}" && "${GITHUB_ACTIONS:-}" == true && "${CI:-}" == true ]]; then
  [[ "${DATABASE_URL:-}" == postgresql://beaconhs_app:beaconhs_app@localhost:5432/beaconhs_test ]]
  export CYCAS_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/beaconhs_test
fi
: "${CYCAS_TEST_DATABASE_URL:?Set the administrator URL of a disposable test database}"
pnpm --filter @beaconhs/auth test:cycas-board
