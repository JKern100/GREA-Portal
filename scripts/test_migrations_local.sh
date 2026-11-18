#!/usr/bin/env bash
# Apply every migration, in order, to a throwaway local Postgres and report
# the first one that fails. Optionally apply extra SQL files afterwards
# (a draft migration, a test script).
#
#   scripts/test_migrations_local.sh
#   scripts/test_migrations_local.sh supabase/drafts/0026_deal_key_and_notes.sql \
#                                    supabase/drafts/0026_test.sql
#
# Why this exists: there is no migration runner on this project. SQL is
# applied to production by hand, and three migrations have already drifted
# (see docs/MIGRATIONS.md). This proves the full set applies cleanly from an
# empty database, and lets a new migration be rehearsed before anyone pastes
# it into the Supabase SQL editor.
#
# It touches nothing outside a temp directory. Needs local Postgres binaries
# (initdb, pg_ctl, psql); Supabase itself is imitated by
# supabase/local/supabase_stubs.sql.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb 2>/dev/null | sort -V | tail -1)")}"
[ -x "$PGBIN/initdb" ] || { echo "Postgres binaries not found. Set PGBIN." >&2; exit 2; }

WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
chmod 755 "$WORK"

# Postgres refuses to run as root; hand the work directory to `postgres`.
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$WORK"
  AS() { runuser -u postgres -- "$@"; }
else
  AS() { "$@"; }
fi

cleanup() {
  AS "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

AS "$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
AS "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -c listen_addresses='' -k $WORK" -l "$WORK/log" -w start >/dev/null

PSQL=(AS "$PGBIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

run() {
  local label="$1" file="$2"
  # Copy so the postgres user can read it wherever the repo lives.
  cp "$file" "$WORK/current.sql"; chmod 644 "$WORK/current.sql"
  if "${PSQL[@]}" -f "$WORK/current.sql" >"$WORK/out" 2>&1; then
    printf '  ok    %s\n' "$label"
    grep -E '^(NOTICE|psql:.*NOTICE):? +TEST' "$WORK/out" | sed -E 's/^.*NOTICE: +/        /' || true
  else
    printf '  FAIL  %s\n' "$label"
    sed 's/^/        /' "$WORK/out" | tail -15
    exit 1
  fi
}

echo "Supabase stand-ins"
run "supabase_stubs.sql" "$ROOT/supabase/local/supabase_stubs.sql"

echo "Migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  run "$(basename "$f")" "$f"
done

if [ "$#" -gt 0 ]; then
  echo "Extra files"
  for f in "$@"; do
    run "$f" "$ROOT/$f"
  done
fi

echo "All applied cleanly."
