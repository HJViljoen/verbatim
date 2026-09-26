#!/usr/bin/env bash
# The test of scripts/apply-market-first-migrations.sh (plan §4.0: "a tested
# runner"). Run it before handing Heinrich a set:
#
#   bash scripts/pg-shim/test-runner.sh <scratch dir> [set]      # mf1 (the default) or r12
#
# 1. The refusal guards, with no connection at all: no set, an unknown set,
#    another project's URL, the transaction pooler, and a --test-target that is
#    not local refuse; production's own URL prints its target (session pooler,
#    postgres.<ref>, port 5432) and never the password.
# 2. On a fresh throwaway cluster (throwaway.sh up --before the set's first
#    version) with a supabase_migrations history holding the set's prerequisite
#    (Phase 1's last row for mf1; MF1's for r12, whose file `up` applied):
#    a dry run applies nothing; "n" at the prompt applies nothing; "y" applies,
#    verifies and records the history; a second apply is idempotent and says the
#    set is already recorded; the catalogue after it equals the catalogue after
#    the first.
# Exits non-zero on the first failed expectation. Fake URLs only; nothing
# leaves the machine.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${1:?usage: test-runner.sh <scratch dir> [set]}"
SET="${2:-mf1}"
RUNNER="$ROOT/scripts/apply-market-first-migrations.sh"
TW="$ROOT/scripts/pg-shim/throwaway.sh"
mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd)"
export MF_LOG_DIR="$DIR/logs"
# YES: what the operator types to apply (r12 first asks whether deploy 2 is live).
case "$SET" in
  mf1) FIRST=20260928090000; HISTORY="('20260924093000', 'steps_completed_dead')"; YES='y\n' ;;
  r12) FIRST=20260928091000; HISTORY="('20260924093000', 'steps_completed_dead'), ('20260928090000', 'market_first_s1')"; YES='y\ny\n' ;;
  *) echo "test-runner: unknown set $SET"; exit 2 ;;
esac

fail() { echo "test-runner: FAILED: $*" >&2; exit 1; }
expect() { # description, output, pattern
  if grep -qE -- "$3" <<<"$2"; then echo "ok    $1"; else echo "$2" | tail -20 >&2; fail "$1 (no match for: $3)"; fi
}
run() { /bin/bash "$RUNNER" "$@" 2>&1 || true; }

# 1. Guards, no connection.
expect "no set refused" "$(run)" '^ABORT: --set is required'
expect "unknown set refused" "$(run --set nope)" "^ABORT: unknown set 'nope'"
envf="$DIR/fake.env"
printf 'PROD_DB_URL=postgresql://postgres:fakepw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres\n' > "$envf"
expect "another project refused" "$(MF_ENV_FILE="$envf" run --set "$SET" --print-target)" "^REFUSING: user is 'postgres.abcdefghijklmnopqrst'"
printf 'PROD_DB_URL=postgresql://postgres.mkwjlckescdveosvrvaq:fakepw@aws-1-eu-west-1.pooler.supabase.com:6543/postgres\n' > "$envf"
expect "transaction pooler refused" "$(MF_ENV_FILE="$envf" run --set "$SET" --print-target)" '^REFUSING: port 6543 is the TRANSACTION pooler'
printf 'PROD_DB_URL=postgresql://postgres:fakepw@db.mkwjlckescdveosvrvaq.supabase.co:5432/postgres\n' > "$envf"
out="$(MF_ENV_FILE="$envf" run --set "$SET" --print-target)"
expect "production target printed, session pooler" "$out" '^user: postgres\.mkwjlckescdveosvrvaq'
expect "production target printed, no connection" "$out" '^PRINT-TARGET only: no connection made\.'
if grep -q fakepw <<<"$out" || grep -rq fakepw "$MF_LOG_DIR"; then fail "the password was printed or logged"; fi
echo "ok    the password is never printed or logged"
rm -f "$envf"
expect "a non-local test target refused" "$(MF_TEST_DB_URL=postgresql://postgres@db.mkwjlckescdveosvrvaq.supabase.co:5432/postgres run --set "$SET" --test-target --print-target)" '^REFUSING: --test-target takes a local cluster only'

# 2. The flow, on a fresh cluster.
bash "$TW" down "$DIR/pg" > /dev/null
bash "$TW" up "$DIR/pg" --before "$FIRST"
bash "$TW" psql "$DIR/pg" -q -c "create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text, idempotency_key text, rollback text[]); insert into supabase_migrations.schema_migrations (version, name) values $HISTORY; insert into public.clients (company_name) values ('one'), ('two');"
export MF_TEST_DB_URL="postgresql://$(whoami)@127.0.0.1:${THROWAWAY_PORT:-54917}/verbatim"
applied() { bash "$TW" psql "$DIR/pg" -At -c "select count(*) from supabase_migrations.schema_migrations where version >= '$FIRST'"; }

out="$(run --set "$SET" --test-target --dry-run)"
expect "dry run applies nothing" "$out" '^DRY RUN complete: nothing applied'
expect "the dry run reads the tenant's tracking_configs grants as staging holds them" "$out" '^  ok    as staging holds them'
[[ "$(applied)" == "0" ]] || fail "the dry run recorded history"
expect "'n' at the prompt applies nothing" "$(printf 'n\n' | run --set "$SET" --test-target)" '^STOPPED by operator'
[[ "$(applied)" == "0" ]] || fail "a refused prompt recorded history"
out="$(printf "$YES" | run --set "$SET" --test-target)"
expect "'y' applies and verifies" "$out" '^All [0-9]+ applied and verified'
expect "no verification failed" "$out" '^DONE: '
[[ "$(applied)" != "0" ]] || fail "the history row was not recorded"
bash "$TW" psql "$DIR/pg" -q -f "$ROOT/scripts/pg-shim/catalogue.sql" > "$DIR/cat-after-first.txt"
out="$(printf "$YES" | run --set "$SET" --test-target)"
expect "a second apply says it is already recorded" "$out" '^  NOTE: every file of this set is already in the history'
expect "a second apply verifies again" "$out" '^DONE: '
bash "$TW" psql "$DIR/pg" -q -f "$ROOT/scripts/pg-shim/catalogue.sql" > "$DIR/cat-after-second.txt"
diff -q "$DIR/cat-after-first.txt" "$DIR/cat-after-second.txt" > /dev/null || fail "the second apply changed the catalogue"
echo "ok    the second apply leaves the catalogue as the first did"
if [[ "$SET" == "r12" ]]; then
  expect "a second r12 apply sees R12 applied already" "$out" '^  NOTE: R12 is already applied here'
  bash "$TW" psql "$DIR/pg" -q -c "grant update (platforms) on public.tracking_configs to authenticated;"
  out="$(run --set "$SET" --test-target --dry-run)"
  expect "an unexpected tenant grant stops r12 before it applies" "$out" '^ABORT: this database holds a tenant UPDATE grant staging does not'
fi
bash "$TW" down "$DIR/pg" > /dev/null
echo "test-runner: all passed ($SET)"
