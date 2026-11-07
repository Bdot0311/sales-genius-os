#!/usr/bin/env bash
# Run the local Postgres contention tests.
#
# These are not part of `npm test` unless a database is reachable. GitHub CI
# runs them in the audit-db job against an empty Postgres service. Nothing
# here connects to production.
#
# Local setup, once:
#   sudo apt-get install -y postgresql
#   sudo pg_ctlcluster 16 main start
#   sudo -u postgres psql -c "CREATE ROLE audit LOGIN PASSWORD 'audit'"
#   sudo -u postgres createdb -O audit audit_test
#
# Then:
#   AUDIT_PG_URL=postgresql://audit:audit@127.0.0.1/audit_test \
#   AUDIT_PG_REQUIRED=1 \
#   npx vitest run src/lib/runtime-guards.test.ts
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export AUDIT_PG_URL="${AUDIT_PG_URL:-postgresql://audit:audit@127.0.0.1/audit_test}"
export AUDIT_PG_REQUIRED=1
exec npx vitest run src/lib/runtime-guards.test.ts src/lib/outbound-infra.test.ts
