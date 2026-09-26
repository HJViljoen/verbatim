#!/usr/bin/env bash
# The test of scripts/week-points.ts --apply (market-first WP3.13 part B), on a
# throwaway PostgreSQL 17 cluster holding MF1, MF2 and MF4. Run it before
# handing Heinrich the paste:
#
#   bash scripts/pg-shim/week-points-apply.sh <scratch dir>
#
# 1. The kept file: staging's week of 31 Aug at 14 days, captured through the
#    one capture (lib/reading/week-keep.ts captureWeekPoints) over staging's
#    real rows (lib/test/week-fixture.ts), written as --keep writes it.
# 2. The refusals, each writing nothing and never prompting (stdin is
#    /dev/null): no --project; a --project not allow-listed; a --project the
#    Supabase URL does not match; a file captured on another project; a
#    --test-target that is not local; --apply with no --from-file.
# 3. The first --apply inserts the file, keeping its computed_at and run ids;
#    the second inserts nothing and says so; week-points-apply.sql checks the
#    rows and that UPDATE, DELETE and TRUNCATE are refused on both tables.
# Exits non-zero on the first failed expectation. Local only: the script's
# writes go to MF_TEST_DB_URL (127.0.0.1) through psql, and the Supabase URLs
# are fake ones that are never contacted.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${1:?usage: week-points-apply.sh <scratch dir>}"
TW="$ROOT/scripts/pg-shim/throwaway.sh"
mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd)"
PORT="${THROWAWAY_PORT:-54917}"
SEALAND=ac16988e-c4f3-4baf-b388-73895852a554
STAGING=zfmxrrugaihxpubunleu
PROD=mkwjlckescdveosvrvaq
LOCAL="postgresql://$(whoami)@127.0.0.1:$PORT/verbatim"
FILE="$DIR/week-points-staging-2026-09-21.json"

fail() { echo "week-points-apply: FAILED: $*" >&2; exit 1; }
expect() { # description, output, pattern
  if grep -qE -- "$3" <<<"$2"; then echo "ok    $1"; else echo "$2" | tail -20 >&2; fail "$1 (no match for: $3)"; fi
}
count() { bash "$TW" psql "$DIR/pg" -At -c "select (select count(*) from public.week_line_reads) || ' ' || (select count(*) from public.week_line_points)"; }
# The script, with nothing from the caller's shell: a fake Supabase URL for
# the project guard, the local cluster for --test-target, stdin closed.
ws() { # <supabase ref> <test db url> args…
  local ref="$1" db="$2"; shift 2
  (cd "$ROOT" && env -i PATH="$PATH" HOME="$HOME" NEXT_PUBLIC_SUPABASE_URL="https://$ref.supabase.co" MF_TEST_DB_URL="$db" \
    node --import tsx scripts/week-points.ts "$@" < /dev/null 2>&1) || true
}

# ---- The cluster -------------------------------------------------------------------------------
bash "$TW" down "$DIR/pg" > /dev/null
bash "$TW" up "$DIR/pg"
bash "$TW" psql "$DIR/pg" -q -c "
  insert into public.clients (id, company_name) values ('$SEALAND', 'Sealand');
  insert into public.pipeline_runs (id, client_id, status, started_at, completed_at)
    values ('b67b56de-17b6-429d-b5f7-e53a3c37f7d4', '$SEALAND', 'partial', '2026-09-20T04:02:57.897Z', '2026-09-20T08:33:47.358Z');"

# ---- 1. The kept file ----------------------------------------------------------------------------
cat > "$DIR/make-file.mts" <<EOF
import { writeFileSync } from 'node:fs'
import { captureWeekPoints } from '$ROOT/lib/reading/week-keep.ts'
import { STAGING_AUG31_READINGS, STAGING_RUNS, STAGING_WEEK_VOLUMES } from '$ROOT/lib/test/week-fixture.ts'
const now = '2026-09-21T06:00:00.000Z'
const got = await captureWeekPoints({
  runs: async () => [...STAGING_RUNS],
  volumes: async (q) => STAGING_WEEK_VOLUMES.filter((r) => r.week >= q.from && r.week < q.to),
  readings: async () => [...STAGING_AUG31_READINGS],
  promptVersion: async () => 'pass_a_v4.1',
}, { now, firstWeek: '2026-08-03', methodVersion: 'week_line_v1', laneRule: 'min_comments:default=5,reddit=3', ages: [14] })
writeFileSync(process.argv[2], JSON.stringify({
  kind: 'week-points', version: 1, project: '$STAGING', clientId: '$SEALAND', capturedAt: now,
  latestUpdate: got.latestUpdate, reads: got.reads, rows: got.rows, volumes: got.volumes, reads_used: got.readsUsed, note: got.note,
}, null, 2) + '\n')
console.log(\`kept \${got.reads.length} read(s), \${got.rows.length} point rows\`)
EOF
out="$(cd "$ROOT" && node --import tsx "$DIR/make-file.mts" "$FILE" 2>&1)"
expect "the kept file holds the week of 31 Aug at 14 days and its 128 point rows" "$out" '^kept 1 read\(s\), 128 point rows$'

# ---- 2. Refusals: nothing written, no prompt -----------------------------------------------------
expect "no --project refused" "$(ws "$STAGING" "$LOCAL" --apply --test-target --from-file "$FILE")" '--project <ref> is required'
expect "a --project not allow-listed refused" "$(ws "$STAGING" "$LOCAL" --project abcdefghijklmnopqrst --apply --test-target --from-file "$FILE")" 'is not allow-listed'
expect "a --project the Supabase URL does not match refused" "$(ws "$STAGING" "$LOCAL" --project "$PROD" --apply --test-target --from-file "$FILE")" "REFUSED: the Supabase URL points at $STAGING, not --project $PROD"
expect "a file captured on another project refused" "$(ws "$PROD" "$LOCAL" --project "$PROD" --apply --test-target --from-file "$FILE")" "REFUSED: .* was captured on $STAGING; it is applied only there"
expect "a --test-target that is not local refused" "$(ws "$STAGING" "postgresql://postgres@db.$PROD.supabase.co:5432/postgres" --project "$STAGING" --apply --test-target --from-file "$FILE")" "REFUSED: --test-target takes a local cluster only"
expect "--apply with no file refused" "$(ws "$STAGING" "$LOCAL" --project "$STAGING" --apply --test-target)" '--apply needs --from-file'
expect "--apply with --keep refused" "$(ws "$STAGING" "$LOCAL" --project "$STAGING" --apply --keep --test-target --from-file "$FILE")" 'say --apply or --keep or --check'
[[ "$(count)" == "0 0" ]] || fail "a refusal wrote rows: $(count)"
echo "ok    no refusal wrote a row, and none prompted (stdin closed)"

# ---- 3. The first --apply, then the second -------------------------------------------------------
out="$(ws "$STAGING" "$LOCAL" --project "$STAGING" --apply --test-target --from-file "$FILE")"
expect "the first --apply says it writes" "$out" "^week-points: APPLY on staging $STAGING"
expect "the first --apply inserts the read and its points" "$out" '^APPLIED: 1 read\(s\) and 128 point row\(s\) inserted'
[[ "$(count)" == "1 128" ]] || fail "after the first --apply: $(count)"
echo "ok    1 read and 128 point rows held"
out="$(ws "$STAGING" "$LOCAL" --project "$STAGING" --apply --test-target --from-file "$FILE")"
expect "a second --apply of the same file inserts nothing and reports it" "$out" '^APPLIED: nothing inserted; every read in the file is already held'
expect "and names the held read" "$out" 'held +the week of 31 Aug at 14 days .*already held from this capture'
[[ "$(count)" == "1 128" ]] || fail "the second --apply wrote rows: $(count)"
echo "ok    still 1 read and 128 point rows"

# ---- 4. The rows, and no rewrite -------------------------------------------------------------------
bash "$TW" check "$DIR/pg" "$ROOT/scripts/pg-shim/week-points-apply.sql"

bash "$TW" down "$DIR/pg" > /dev/null
echo "week-points-apply: PASSED"
