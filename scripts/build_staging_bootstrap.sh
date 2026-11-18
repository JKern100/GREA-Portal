#!/usr/bin/env bash
# Build ONE SQL file that turns an empty Supabase project into a working
# staging database: every migration in order, then the demo data.
#
#   scripts/build_staging_bootstrap.sh > staging_bootstrap.sql
#   scripts/build_staging_bootstrap.sh --no-data > schema_only.sql
#
# Paste the result into the SQL editor of the STAGING project. Never run it
# on production: the demo data step deletes any office outside the six
# canonical codes.
#
# Generated on demand rather than committed, so it can never drift from
# supabase/migrations/. See docs/STAGING_SETUP.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WITH_DATA=1
[ "${1:-}" = "--no-data" ] && WITH_DATA=0

echo "-- ============================================================"
echo "-- GREA Portal — STAGING bootstrap. Generated $(date -u +%Y-%m-%dT%H:%MZ)"
echo "-- from commit $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)."
echo "-- FOR A NEW, EMPTY STAGING PROJECT ONLY. DO NOT RUN ON PRODUCTION."
echo "-- ============================================================"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo
  echo "-- >>>>>>>>>> $(basename "$f")"
  cat "$f"
  echo
done

if [ "$WITH_DATA" = "1" ]; then
  # supabase/seed.sql is NOT used: it predates migration 0007 and no longer
  # loads (it inserts into deal columns that were dropped).
  for f in "$ROOT/supabase/seeds/large_sample.sql" "$ROOT/supabase/seeds/cross_office_examples.sql"; do
    echo
    echo "-- >>>>>>>>>> demo data: $(basename "$f")"
    cat "$f"
    echo
  done
fi
