#!/usr/bin/env bash
# Finance (20261115090000_finance.sql) on a throwaway PostgreSQL 17 cluster:
# the migration twice, scripts/pg-shim/finance-checks.sql, then three races
# between two real sessions, which one psql cannot stage:
#
#   1. fin_take_number from two sessions at once: two numbers, never one
#   2. fin_issue_invoice for one month from two sessions at once: one invoice,
#      both callers get it, and the counter moves once
#   3. the month guard's own path: a session inserts the month's invoice and
#      holds its transaction open while fin_issue_invoice runs for the month;
#      once the first commits, the function answers with that invoice and the
#      number it took goes back
#
#   bash scripts/pg-shim/finance-checks.sh <scratch dir>
#
# LOCAL ONLY: throwaway.sh connects to nothing but its own server. Made-up
# names and figures. Exits non-zero on the first failed check, and takes the
# cluster down again, pass or fail.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${1:?usage: finance-checks.sh <scratch dir>}"
TW="$ROOT/scripts/pg-shim/throwaway.sh"
MIG="$ROOT/supabase/migrations/20261115090000_finance.sql"
mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd)"
PG="$DIR/pg"
bash "$TW" down "$PG" > /dev/null
trap 'bash "$TW" down "$PG" > /dev/null' EXIT
bash "$TW" up "$PG" --before 20261115090000
bash "$TW" twice "$PG" "$MIG"
bash "$TW" check "$PG" "$ROOT/scripts/pg-shim/finance-checks.sql"

sql() { bash "$TW" psql "$PG" -q -At -c "$1"; }
fail() { echo "finance-checks: FAILED: $*" >&2; exit 1; }

# A committed fixture for the races (the cluster is thrown away after).
sql "insert into public.clients (id, company_name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme SA');
     insert into public.fin_billing_profiles (id, client_id, bill_to, currency, fx_rate, lines, subject_line)
     values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme SA', 'ZAR', 17.5,
             '[{\"description\": \"Widget service\", \"unit_usd\": 100, \"qty\": 1}]', 'Monthly services');
     insert into public.fin_counters (kind, next_no) values ('invoice', 121);"

ISSUE="select invoice_number || ':' || created from public.fin_issue_invoice('cccccccc-cccc-cccc-cccc-cccccccccccc', '%s', '%s', '%s', '%s', '[]', 1750, null, null)"

# ── 1. Two sessions take numbers at once ────────────────────────────────────
bash "$TW" psql "$PG" -q -At -c "begin; select public.fin_take_number('invoice'); select pg_sleep(1.5); commit;" > "$DIR/race1-a.txt" &
A=$!
sleep 0.3
bash "$TW" psql "$PG" -q -At -c "select public.fin_take_number('invoice');" > "$DIR/race1-b.txt"
wait "$A"
a="$(grep -E '^[0-9]+$' "$DIR/race1-a.txt" | head -1)"; b="$(grep -E '^[0-9]+$' "$DIR/race1-b.txt" | head -1)"
[[ "$a" == "121" && "$b" == "122" ]] || fail "race 1: the sessions took '$a' and '$b', expected 121 then 122"
[[ "$(sql "select next_no from public.fin_counters where kind = 'invoice'")" == "123" ]] || fail "race 1: the counter is not at 123"
echo "race 1: two concurrent fin_take_number calls took 121 and 122 (B waited for A's commit)"

# ── 2. Two sessions issue the same month at once ────────────────────────────
q="$(printf "$ISSUE" 2027-01-01 'January 2027' 2026-12-15 2026-12-31)"
bash "$TW" psql "$PG" -q -At -c "begin; $q; select pg_sleep(1.5); commit;" > "$DIR/race2-a.txt" &
A=$!
sleep 0.3
bash "$TW" psql "$PG" -q -At -c "$q;" > "$DIR/race2-b.txt"
wait "$A"
a="$(grep ':' "$DIR/race2-a.txt" | head -1)"; b="$(grep ':' "$DIR/race2-b.txt" | head -1)"
[[ "$a" == "0123:true" && "$b" == "0123:false" ]] || fail "race 2: A said '$a', B said '$b', expected 0123:true and 0123:false"
[[ "$(sql "select count(*) from public.fin_invoices where period_start = '2027-01-01'")" == "1" ]] || fail "race 2: not one January invoice"
[[ "$(sql "select next_no from public.fin_counters where kind = 'invoice'")" == "124" ]] || fail "race 2: the counter moved twice"
echo "race 2: two concurrent issues of January made one invoice (0123); the second caller got it back; the counter moved once"

# ── 3. The month guard catches a race the profile lock does not see ─────────
q="$(printf "$ISSUE" 2027-02-01 'February 2027' 2027-01-15 2027-01-31)"
bash "$TW" psql "$PG" -q -At -c "begin;
  insert into public.fin_invoices (number, client_id, bill_to, period_label, period_start, issued_on, currency, total, status)
  values ('0900', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme SA', 'February 2027', '2027-02-01', '2027-01-15', 'ZAR', 1750, 'sent');
  select pg_sleep(1.5); commit;" > "$DIR/race3-a.txt" &
A=$!
sleep 0.3
bash "$TW" psql "$PG" -q -At -c "$q;" > "$DIR/race3-b.txt"
wait "$A"
b="$(grep ':' "$DIR/race3-b.txt" | head -1)"
[[ "$b" == "0900:false" ]] || fail "race 3: the function said '$b', expected 0900:false"
[[ "$(sql "select count(*) from public.fin_invoices where period_start = '2027-02-01'")" == "1" ]] || fail "race 3: not one February invoice"
[[ "$(sql "select next_no from public.fin_counters where kind = 'invoice'")" == "124" ]] || fail "race 3: the number taken was not given back"
echo "race 3: an issue racing an uncommitted February insert answered with that invoice (0900); the number it took went back"

echo "finance-checks: all passed"
