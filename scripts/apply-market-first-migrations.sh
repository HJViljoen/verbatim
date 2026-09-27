#!/usr/bin/env bash
# Market-first: apply a migration set to PRODUCTION (mkwjlckescdveosvrvaq), per
# plan §4.0 "Migrations" and §4.1. Adapted from the Phase 1 runner
# (verbatim-phase1/scratchpad/apply-phase1-migrations.sh, used 2026-09-24):
# the session pooler, the refusal guards, one psql and one transaction per file,
# a verification after each file, and the history rows at the end.
#
# RUN IT BY HAND, IN A REAL TERMINAL, from the run checkout at the set's tag.
# It asks before it writes (a `read` prompt), so it cannot run through `!`,
# which has no tty:
#
#   cd ~/Documents/code/verbatim-mf-run && test "$(git rev-parse HEAD)" = "$(git rev-parse <tag>)" && \
#     bash scripts/apply-market-first-migrations.sh --set <set> --dry-run   # plan, pre-checks, history; applies nothing
#   cd ~/Documents/code/verbatim-mf-run && test "$(git rev-parse HEAD)" = "$(git rev-parse <tag>)" && \
#     bash scripts/apply-market-first-migrations.sh --set <set>             # the real apply
#
# THE TAGS. mf1 (Wed 30 Sep) runs from `mf-d1-data`: deploy 1 (mf-d1) pushed
# first, then WP1.4 merged into feat/market-first and tagged there, because
# this runner, MF1 and the four --apply scripts exist only from WP1.4, which
# deploys with deploy 2. So on 30 Sep the run checkout sits one tag AHEAD of
# production's code (plan §4.0 says the deployed tag; this is the recorded
# exception). That is safe because MF1 is additive and nothing in production
# at mf-d1 reads or loses anything by it. r12 runs from `mf-d2`, the deployed
# tag, once deploy 2 is live.
#
# The connection comes from .env.dbdump in the checkout (PROD_DB_URL; Heinrich
# placed it there, agents never write secrets), and is printed without its
# password. It REFUSES unless the user is postgres.mkwjlckescdveosvrvaq on the
# session pooler's port 5432: not the transaction pooler (6543), not a direct
# host, not another project.
#
# Mechanics: `psql -X -v ON_ERROR_STOP=1 --single-transaction -c 'set local
# statement_timeout = 0' -f <file>`: psql 17 wraps every -c/-f of one
# invocation in one BEGIN/COMMIT, so the SET LOCAL lives and dies with that
# file's transaction. No market-first migration holds BEGIN, COMMIT or
# CONCURRENTLY (plan §4.0), and each is idempotent, so re-running a file once
# after an error is safe.
#
# SETS.
#   mf1 = 20260928090000_market_first_s1.sql (WP1.4, Wed 30 Sep). Additive: it
#         changes no existing grant, so deploy 1's code keeps working on it.
#   r12 = 20260928091000_market_first_r12_grants.sql (WP1.4, the deploy-1
#         review's R12). ONLY ONCE DEPLOY 2 IS LIVE: it revokes the tenant's
#         column UPDATE on tracking_configs that deploy 1's settings saves still
#         use, and it asks that question before it applies. Not additive: after
#         it, a rollback behind deploy 2 breaks those saves (its file header
#         says how to undo it).
#   mf2 = 20261005090000_market_first_s2.sql (WP2.1, WP2.3, WP2.6, WP2.7; Tue
#         6 Oct). Additive: two tables, three functions, the sent_figures
#         object_kind CHECK widened. Needs MF1.
#   mf4 = 20261005091000_market_first_weeks.sql (WP2.9, WP3.13; Tue 6 Oct, in
#         the same Terminal session, right after mf2). Additive: two functions,
#         two append-only tables. Needs MF2.
# mf2 and mf4 run from the tag the lead names for them, one tag ahead of
# production as mf1 was: both are additive and nothing deployed reads them
# until deploy 3. They change no grant, so R12 may or may not be applied.
#   mf3 = 20261103090000_market_first_s3.sql (WP3.3, WP3.4, WP3.5, WP3.6,
#         WP3.10; planned for Tue 3 Nov before deploy 4 on Sat 7 Nov, moved to
#         right after deploy 4 went live on 27 Sep, run/mf3.sh). Additive: five tables (month_lens_readings and
#         month_brand_readings with their guards, video_surfacings,
#         tracking_config_queue, own_post_subjects), two trigger functions,
#         and tracking_configs.watched_brands and market_description with no
#         tenant column grant. It changes no existing grant, month table or
#         function (the runner reads the existing guards before and after).
#         Needs MF4. It runs from the run checkout at mf-d4, the deployed
#         code; deploy 4's steps and pages read it from the next run and page
#         load (before it, each says the table is not there and writes nothing).
#   mf5 = 20261103091000_market_first_moves.sql (WP3.6 wave 2, "Date a move"),
#         after MF3, from the run checkout at mf-d5, the deployed code.
#         Additive: one nullable column (moves.dated_on), one CHECK on it and
#         the member's INSERT on it; no other grant, policy or trigger changes
#         (the runner reads the member's grants on moves after it). Your moves
#         dates a move today until it is applied, and reads the day once it is.
#
# TESTED on a throwaway PG 17 cluster (scripts/pg-shim/throwaway.sh) through
# --test-target, which takes MF_TEST_DB_URL, accepts ONLY a 127.0.0.1 or
# localhost host, and skips nothing but the production user/pooler guards.
#
# The [[ … ]]; check_true … "$?" idiom is deliberate (SC2319).
# shellcheck disable=SC2319
set -u
set -o pipefail

WORKTREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${MF_ENV_FILE:-$WORKTREE/.env.dbdump}"   # MF_ENV_FILE only for the runner's own refusal tests
MIG_DIR="$WORKTREE/supabase/migrations"
EXPECTED_REF="mkwjlckescdveosvrvaq"
SEALAND="ac16988e-c4f3-4baf-b388-73895852a554"
FS=$'\x1f'
DRY_RUN=0
PRINT_TARGET=0
TEST_TARGET=0
SET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --print-target) PRINT_TARGET=1 ;;
    --test-target) TEST_TARGET=1 ;;
    --set) shift; SET="${1:-}" ;;
    *) echo "unknown argument: $1 (--set <name> | --dry-run | --print-target | --test-target)"; exit 2 ;;
  esac
  shift
done

# ------------------------------------------------------------------- sets ----
# PREREQ_VERSION must already be in the history before the set applies.
case "$SET" in
  mf1)
    EXPECTED_FILES=(20260928090000_market_first_s1.sql)
    LABELS=(MF1)
    PREREQ_VERSION="20260924093000"; PREREQ_NAME="Phase 1's last migration M16"
    ;;
  r12)
    EXPECTED_FILES=(20260928091000_market_first_r12_grants.sql)
    LABELS=(R12)
    PREREQ_VERSION="20260928090000"; PREREQ_NAME="MF1"
    ;;
  mf2)
    EXPECTED_FILES=(20261005090000_market_first_s2.sql)
    LABELS=(MF2)
    PREREQ_VERSION="20260928090000"; PREREQ_NAME="MF1"
    ;;
  mf4)
    EXPECTED_FILES=(20261005091000_market_first_weeks.sql)
    LABELS=(MF4)
    PREREQ_VERSION="20261005090000"; PREREQ_NAME="MF2"
    ;;
  mf3)
    EXPECTED_FILES=(20261103090000_market_first_s3.sql)
    LABELS=(MF3)
    PREREQ_VERSION="20261005091000"; PREREQ_NAME="MF4"
    ;;
  mf5)
    EXPECTED_FILES=(20261103091000_market_first_moves.sql)
    LABELS=(MF5)
    PREREQ_VERSION="20261103090000"; PREREQ_NAME="MF3"
    ;;
  "") echo "ABORT: --set is required (mf1 | r12 | mf2 | mf4 | mf3 | mf5)."; exit 2 ;;
  *) echo "ABORT: unknown set '$SET' (mf1 | r12 | mf2 | mf4 | mf3 | mf5)."; exit 2 ;;
esac
N=${#EXPECTED_FILES[@]}
for f in "${EXPECTED_FILES[@]}"; do
  if [[ ! -f "$MIG_DIR/$f" ]]; then echo "ABORT: $MIG_DIR/$f not found. Is the checkout at the right tag?"; exit 1; fi
  if grep -vE '^[[:space:]]*--' "$MIG_DIR/$f" | grep -qiE '^[[:space:]]*(begin|commit)[[:space:]]*;|concurrently'; then
    echo "ABORT: $f holds BEGIN, COMMIT or CONCURRENTLY; the runner's one transaction per file would break."; exit 1
  fi
done

LOG_DIR="${MF_LOG_DIR:-$HOME/.claude/plans/verbatim-market-first/exec/logs}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/apply-market-first-$SET-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1

# -------------------------------------------------------- the connection ----
parse_url() { # sets DB_USER DB_HOST DB_PORT and the _parts used by the rewrite
  _scheme="${1%%://*}"
  _rest="${1#*://}"
  _creds="${_rest%@*}"
  _hostpart="${_rest##*@}"
  DB_USER="${_creds%%:*}"
  _pw="${_creds#"$DB_USER"}"             # ":<password>" or "": kept byte-for-byte, never printed
  _hostport="${_hostpart%%/*}"
  _hostport="${_hostport%%\?*}"
  _suffix="${_hostpart#"$_hostport"}"
  DB_HOST="${_hostport%%:*}"
  if [[ "$_hostport" == *:* ]]; then DB_PORT="${_hostport##*:}"; else DB_PORT=""; fi
}

if (( TEST_TARGET )); then
  DB_URL="${MF_TEST_DB_URL:-}"
  if [[ -z "$DB_URL" ]]; then echo "ABORT: --test-target needs MF_TEST_DB_URL."; exit 1; fi
  parse_url "$DB_URL"
  if [[ "$DB_HOST" != "127.0.0.1" && "$DB_HOST" != "localhost" ]]; then
    echo "REFUSING: --test-target takes a local cluster only; host is '$DB_HOST'."; exit 1
  fi
  echo "== TEST TARGET (a throwaway cluster, not production) =="
else
  if [[ ! -f "$ENV_FILE" ]]; then echo "ABORT: $ENV_FILE not found."; exit 1; fi
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  if [[ -z "${PROD_DB_URL:-}" ]]; then echo "ABORT: PROD_DB_URL is not set by $ENV_FILE."; exit 1; fi
  POOLER_HOST="aws-1-eu-west-1.pooler.supabase.com"
  parse_url "$PROD_DB_URL"
  DB_URL="$PROD_DB_URL"
  # The direct host (db.<ref>.supabase.co) is IPv6-only from this machine; the
  # session-pooler form is derived in memory (user postgres.<ref>, same port,
  # database, query and password), as the Phase 1 runner did.
  if [[ "$DB_USER" == "postgres" && "$DB_HOST" =~ ^db\.([a-z0-9]+)\.supabase\.co$ ]]; then
    _ref="${BASH_REMATCH[1]}"
    _portpart=""; [[ -n "$DB_PORT" ]] && _portpart=":$DB_PORT"
    DB_URL="${_scheme}://postgres.${_ref}${_pw}@${POOLER_HOST}${_portpart}${_suffix}"
    echo "(derived the session-pooler URL from the direct-host PROD_DB_URL, in memory)"
    parse_url "$DB_URL"
  fi
  unset PROD_DB_URL
fi
unset _scheme _rest _creds _hostpart _pw _hostport _suffix _ref _portpart

echo "== target =="
echo "host: $DB_HOST"
echo "port: ${DB_PORT:-<none>}"
echo "user: $DB_USER"
if (( ! TEST_TARGET )); then
  if [[ "$DB_USER" != "postgres.$EXPECTED_REF" ]]; then
    echo "REFUSING: user is '$DB_USER', not 'postgres.$EXPECTED_REF'. This script only targets production via the session pooler."; exit 1
  fi
  if [[ "$DB_PORT" == "6543" ]]; then echo "REFUSING: port 6543 is the TRANSACTION pooler. Use the SESSION pooler, port 5432."; exit 1; fi
  if [[ "$DB_PORT" != "5432" ]]; then echo "REFUSING: port is '${DB_PORT:-<none>}', must be exactly 5432 (session pooler)."; exit 1; fi
fi
echo "set:  $SET ($N file(s))"
echo "log:  $LOG"
echo
if (( PRINT_TARGET )); then echo "PRINT-TARGET only: no connection made."; exit 0; fi

export PGAPPNAME="market-first-apply"
export PGCONNECT_TIMEOUT=15

# --------------------------------------------------------------- helpers ----
APPLIED=()
CURRENT=""

next_after() {
  local i
  for i in "${!EXPECTED_FILES[@]}"; do
    if [[ "${EXPECTED_FILES[$i]}" == "$1" ]]; then
      if (( i + 1 < N )); then echo "${EXPECTED_FILES[$((i+1))]}"; else echo "(none: all $N applied)"; fi
      return
    fi
  done
  echo "${EXPECTED_FILES[0]}"
}
print_progress() {
  echo "Applied (committed) this run: ${#APPLIED[@]} of $N"
  local a; for a in ${APPLIED[@]+"${APPLIED[@]}"}; do echo "  applied  $a"; done
}
stop_psql_error() { # $1 = what failed, $2 = next file to apply
  echo
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "STOPPED: psql error during: $1"
  print_progress
  echo "Next file to apply: $2"
  echo "Each file runs in ONE transaction, so a file that errored was rolled back whole."
  echo "Re-running the same file ONCE is safe: every market-first migration is idempotent."
  echo "Do NOT hand-patch the database or the file. Read the error above first."
  echo "Log: $LOG"
  exit 1
}
VFAIL=()
check() { # label actual expected
  if [[ "$2" == "$3" ]]; then printf '  ok    %-30s %s\n' "$1" "$2"
  else printf '  FAIL  %-30s got [%s]  expected [%s]\n' "$1" "$2" "$3"; VFAIL+=("$1: got [$2] expected [$3]"); fi
}
check_true() { # label condition-result(0/1) shown-value note
  if [[ "$2" == "0" ]]; then printf '  ok    %-30s %s\n' "$1" "$3"
  else printf '  FAIL  %-30s %s  (%s)\n' "$1" "$3" "$4"; VFAIL+=("$1: $3 ($4)"); fi
}
finish_verify() {
  if (( ${#VFAIL[@]} > 0 )); then
    echo
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "STOPPED: verification MISMATCH after $1"
    local m; for m in "${VFAIL[@]}"; do echo "  - $m"; done
    echo "$1 IS applied (committed). Its check did not read as expected."
    print_progress
    echo "Next file (NOT applied): $(next_after "$1")"
    echo "Re-running is safe (idempotent) but will not change this reading. Do NOT hand-patch. Log: $LOG"
    exit 1
  fi
}
pause_human() { # $1 = question
  local ans=""
  printf '\n>>> %s  Type y to continue, anything else stops: ' "$1"
  read -r ans || ans=""
  echo
  if [[ "$ans" != "y" ]]; then
    echo "STOPPED by operator at: $1"
    print_progress
    echo "Next file (NOT applied): $(next_after "${CURRENT:-}")"
    echo "Log: $LOG"
    exit 1
  fi
}
q() { psql "$DB_URL" -X -q -A -t -F "$FS" -v ON_ERROR_STOP=1 -f - <<<"$1"; }
OUT=""
show() {
  echo "  ---- query ----"
  sed 's/^/  | /' <<<"$1"
  if ! OUT="$(q "$1")"; then stop_psql_error "verification query after ${CURRENT:-pre-check}" "$(next_after "${CURRENT:-}")"; fi
  echo "  ---- result ----"
  if [[ -z "$OUT" ]]; then echo "  (no rows)"; else sed "s/$FS/ | /g; s/^/  > /" <<<"$OUT"; fi
}
field() { local IFS="$FS" arr; read -r -a arr <<<"$2"; echo "${arr[$(( $1 - 1 ))]:-}"; }

# ------------------------------------------------------------ verifications ----
MF1_TABLES="'video_segments','video_provenance','config_change_reach','month_pair_comparability','front_page_overrides'"
MF1_FUNCS="'segments_v1_reason','segments_for_videos','market_month_videos','market_month_depth','theme_maker_shares','market_segment_counts'"
# The tenant's column UPDATE on tracking_configs (the R12 grants). Before R12:
# the eight staging holds (read 26 Sep); after it, the three that move no
# search and no send.
TENANT_UPDATE_SQL="select string_agg(column_name, ', ' order by column_name) from information_schema.role_column_grants where table_schema = 'public' and table_name = 'tracking_configs' and grantee = 'authenticated' and privilege_type = 'UPDATE';"
TENANT_UPDATE_BEFORE="competitor_names, exclude_terms, last_actor, report_day, report_emails, report_period, subreddits, updated_at"
TENANT_UPDATE_AFTER="last_actor, report_emails, updated_at"
PRE_TENANT_UPDATE=""

verify_MF1() {
  local sql
  read -r -d '' sql <<SQL
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ($MF1_TABLES) and c.relrowsecurity)             as tables_rls,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ($MF1_TABLES)
      and cmd = 'SELECT' and roles = '{authenticated}')                                           as select_policies,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
    and table_name in ($MF1_TABLES) and grantee in ('anon','authenticated'))                      as tenant_table_grants,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
    and table_name in ($MF1_TABLES) and grantee = 'service_role'
    and privilege_type in ('UPDATE','DELETE','TRUNCATE'))                                        as service_rewrites,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
    and table_name in ($MF1_TABLES) and grantee = 'service_role'
    and privilege_type in ('SELECT','INSERT'))                                                   as service_select_insert,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ($MF1_FUNCS))                                   as funcs,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ($MF1_FUNCS) and p.prosecdef
      and p.proconfig = '{"search_path=public, pg_temp"}')                                       as definer_pinned,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ($MF1_FUNCS)
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE')))                         as leaked_execute,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ($MF1_FUNCS)
      and has_function_privilege('service_role', p.oid, 'EXECUTE'))                               as service_execute;
SQL
  show "$sql"
  echo "  expect: tables_rls=5 select_policies=5 tenant_table_grants=0 service_rewrites=0 service_select_insert=10"
  echo "          funcs=6 definer_pinned=5 (segments_v1_reason is immutable, not definer) leaked_execute=0 service_execute=6"
  check "tables|pol|tenant|rewr|sel+ins" "$(sed "s/$FS/|/g" <<<"$OUT" | cut -d'|' -f1-5)" "5|5|0|0|10"
  check "funcs|definer|leaked|service" "$(sed "s/$FS/|/g" <<<"$OUT" | cut -d'|' -f6-9)" "6|5|0|6"

  read -r -d '' sql <<'SQL'
select pg_get_constraintdef(oid) from pg_constraint where conname = 'config_changes_surface_check';
SQL
  show "$sql"
  [[ "$OUT" == *"'segment'"* && "$OUT" == *"'gate_rule'"* && "$OUT" == *"'attribution'"* && "$OUT" == *"'rival_rename'"* ]]
  check_true "surface_check" "$?" "has segment, gate_rule, attribution (and rival_rename)" "missing one: $OUT"

  show "$TENANT_UPDATE_SQL"
  echo "  expect: MF1 changes no grant, so the list read before it (deploy 1 saves through these)"
  check "tenant UPDATE columns kept" "$OUT" "$PRE_TENANT_UPDATE"
  finish_verify "$CURRENT"

  echo
  echo "  == MF1 READING (human read): the market's videos this month against the stored denominator =="
  read -r -d '' sql <<SQL
with m as (select date_trunc('month', now() at time zone 'UTC')::date as m0),
f as (select audience, count(*) as videos from m, public.market_month_videos('$SEALAND', m.m0) group by 1),
d as (select audience, videos from public.month_denominators, m
       where client_id = '$SEALAND' and month = m.m0 and audience <> 'client')
select audience, fn_videos, stored_videos from (
  select 0 as k, coalesce(f.audience, d.audience) as audience, f.videos as fn_videos, d.videos as stored_videos
    from f full join d using (audience)
  union all
  select 1, '(all audiences)', (select sum(videos) from f), (select sum(videos) from d)
) x
order by k, audience;
SQL
  show "$sql"
  local totals_match=1
  if awk -F"$FS" '$1 == "(all audiences)" && $2 != $3 {bad=1} END {exit !bad}' <<<"$OUT"; then totals_match=0; fi
  if awk -F"$FS" '$2 != $3 {bad=1} END {exit !bad}' <<<"$OUT"; then
    echo "  !! market_month_videos differs from the stored denominator on at least one audience."
    if (( totals_match )); then
      echo "     The pooled totals (all audiences) MATCH: videos moved between audiences. Expected if a re-tag"
      echo "     moved videos between the rival and category audiences after the denominator was written"
      echo "     (decision H), or an update ran after it. Read it before going on."
    else
      echo "     The pooled totals differ too. Expected only if an update ran after the denominator was last"
      echo "     written (a re-tag alone moves videos between audiences and leaves the totals equal). Read it before going on."
    fi
    pause_human "MF1 reading differs from the stored denominator. Continue?"
  else
    echo "  ok    market_month_videos equals month_denominators on every audience of the current month, and in total"
  fi
}

verify_R12() {
  show "$TENANT_UPDATE_SQL"
  echo "  expect: authenticated keeps UPDATE on $TENANT_UPDATE_AFTER only"
  check "R12 tenant UPDATE columns" "$OUT" "$TENANT_UPDATE_AFTER"
  finish_verify "$CURRENT"
}

# MF2 and MF4 (plan §4.1): the MF1 conventions, read back table by table and
# function by function, plus each file's own reading. verify_MF1 above is left
# exactly as it was applied on Wed 30 Sep.
MF2_TABLES="'comparability_checks','brand_mentions'"
MF2_FUNCS="'lens_readings','brand_mention_candidates','update_arrivals'"
MF4_TABLES="'week_line_reads','week_line_points'"
MF4_FUNCS="'market_week_volumes','market_week_readings'"

# $1 tables, $2 functions, $3 expected tables|pol|tenant|rewr|sel+ins|cols, $4 expected funcs|definer|leaked|service.
# select_policies counts only a get_my_client_id() SELECT policy for
# authenticated; hidden_columns counts columns a tenant cannot read (both
# files grant every column: neither holds operator words).
verify_conventions() {
  local sql
  read -r -d '' sql <<SQL
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ($1) and c.relrowsecurity)                        as tables_rls,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ($1)
      and cmd = 'SELECT' and roles = '{authenticated}' and qual = '(client_id = get_my_client_id())') as select_policies,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
    and table_name in ($1) and grantee in ('anon','authenticated'))                                 as tenant_table_grants,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
    and table_name in ($1) and grantee = 'service_role'
    and privilege_type in ('UPDATE','DELETE','TRUNCATE'))                                          as service_rewrites,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
    and table_name in ($1) and grantee = 'service_role'
    and privilege_type in ('SELECT','INSERT'))                                                     as service_select_insert,
  (select count(*) from information_schema.columns c where c.table_schema = 'public' and c.table_name in ($1)
    and not has_column_privilege('authenticated', format('public.%I', c.table_name), c.column_name, 'SELECT')) as hidden_columns,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ($2))                                              as funcs,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ($2) and p.prosecdef
      and p.proconfig = '{"search_path=public, pg_temp"}')                                          as definer_pinned,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ($2)
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE')))                            as leaked_execute,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ($2)
      and has_function_privilege('service_role', p.oid, 'EXECUTE'))                                  as service_execute;
SQL
  show "$sql"
  echo "  expect: tables|pol|tenant|rewr|sel+ins|hidden = $3 and funcs|definer|leaked|service = $4"
  check "tables|pol|tenant|rewr|sel+ins|hid" "$(sed "s/$FS/|/g" <<<"$OUT" | cut -d'|' -f1-6)" "$3"
  check "funcs|definer|leaked|service" "$(sed "s/$FS/|/g" <<<"$OUT" | cut -d'|' -f7-10)" "$4"

  show "$TENANT_UPDATE_SQL"
  echo "  expect: this file changes no grant, so the list read before it"
  check "tenant UPDATE columns kept" "$OUT" "$PRE_TENANT_UPDATE"
}

verify_MF2() {
  local sql
  verify_conventions "$MF2_TABLES" "$MF2_FUNCS" "2|2|0|0|4|0" "3|3|0|3"
  read -r -d '' sql <<'SQL'
select pg_get_constraintdef(oid) from pg_constraint where conname = 'sent_figures_object_kind_check';
SQL
  show "$sql"
  [[ "$OUT" == *"'mood'"* && "$OUT" == *"'brand'"* && "$OUT" == *"'denominator'"* && "$OUT" == *"'figure'"* && "$OUT" == *"'rival'"* ]]
  check_true "sent_figures object_kind" "$?" "has mood, brand, denominator (and figure, rival)" "missing one: $OUT"

  # lens_readings' denominators against MF1's market_month_videos, for the
  # previous and the current month: two reads of the same rows now, so they
  # agree to the video and the comment, or lens_readings is wrong.
  read -r -d '' sql <<SQL
with m as (
  select (date_trunc('month', now() at time zone 'UTC') - interval '1 month')::date as m0
  union all select date_trunc('month', now() at time zone 'UTC')::date
),
l as (
  select m.m0, sum(x.k) filter (where x.object_id = 'videos') as videos, sum(x.k) filter (where x.object_id = 'comments') as comments
  from m, public.lens_readings('$SEALAND', m.m0, null) x
  where x.object_kind = 'denominator' and x.audience <> 'client' group by m.m0
),
v as (
  select m.m0, count(*) as videos, sum(x.dated_comments) as comments
  from m, public.market_month_videos('$SEALAND', m.m0) x group by m.m0
)
select m.m0, coalesce(l.videos, 0), coalesce(v.videos, 0), coalesce(l.comments, 0), coalesce(v.comments, 0)
from m left join l using (m0) left join v using (m0) order by m.m0;
SQL
  show "$sql"
  echo "  expect: per month, lens videos = market_month_videos videos, and the comments likewise"
  awk -F"$FS" '$2 != $3 || $4 != $5 {bad=1} END {exit bad}' <<<"$OUT"
  check_true "lens = market_month_videos" "$?" "both months agree" "lens_readings' denominators differ from market_month_videos"
  finish_verify "$CURRENT"

  echo
  echo "  == MF2 READING (human read): what came in with the latest update, by month =="
  read -r -d '' sql <<SQL
with r as (
  select id, completed_at from public.pipeline_runs
  where client_id = '$SEALAND' and status in ('completed', 'partial') and completed_at is not null
  order by completed_at desc limit 1
)
select r.completed_at, a.month, a.videos_first_read, a.comments_captured
from r, public.update_arrivals('$SEALAND', r.id,
  array[(date_trunc('month', now() at time zone 'UTC') - interval '1 month')::date,
        date_trunc('month', now() at time zone 'UTC')::date]) a
order by a.month;
SQL
  show "$sql"
}

verify_MF4() {
  local sql
  verify_conventions "$MF4_TABLES" "$MF4_FUNCS" "2|2|0|0|4|0" "2|2|0|2"

  # The same-age cut and the bars read the same videos: for the week two weeks
  # back, at 14 days, market_week_readings' n (per audience and band) sums to
  # market_week_volumes' videos at that cut.
  read -r -d '' sql <<SQL
with w as (select (date_trunc('week', now() at time zone 'UTC') - interval '14 days')::date as w0),
c as (select w0, (w0 + 21)::timestamp at time zone 'UTC' as cut from w),
r as (
  select sum(x.n) as n from (
    select distinct r.audience, r.depth_band, r.n from c, public.market_week_readings('$SEALAND', c.w0, 14) r) x
),
v as (select sum(x.videos) as videos from c, public.market_week_volumes('$SEALAND', c.w0, c.w0 + 7, c.cut) x)
select (select w0 from w), coalesce(r.n, 0), coalesce(v.videos, 0) from r, v;
SQL
  show "$sql"
  echo "  expect: the week's n summed over audiences and bands = its market videos at the same cut"
  awk -F"$FS" '$2 != $3 {bad=1} END {exit bad}' <<<"$OUT"
  check_true "readings n = volumes videos" "$?" "they agree" "market_week_readings' n differs from market_week_volumes' videos"
  finish_verify "$CURRENT"

  echo
  echo "  == MF4 READING (human read): the market's last six weeks, as counts =="
  read -r -d '' sql <<SQL
select w.week, sum(w.videos) as videos, sum(w.comments) as comments, max(w.median_dated) as median_dated,
       sum(w.unchecked) as unchecked
from public.market_week_volumes('$SEALAND',
       (date_trunc('week', now() at time zone 'UTC') - interval '35 days')::date,
       (date_trunc('week', now() at time zone 'UTC') + interval '7 days')::date) w
group by w.week order by w.week;
SQL
  show "$sql"
}

# MF3 (plan §4.1): five tables under three grant rules, the guards on the two
# month tables, the queue's one stamp, the operator columns, and the existing
# guards untouched (read before the apply, pre-check 4, and again after it).
MF3_TABLES="'month_lens_readings','month_brand_readings','video_surfacings','tracking_config_queue','own_post_subjects'"
MF3_MONTH_TABLES="'month_lens_readings','month_brand_readings'"
MF3_APPEND_TABLES="'video_surfacings','tracking_config_queue','own_post_subjects'"
MF3_FUNCS="'month_lens_frozen_insert_guard','tracking_config_queue_applied_once'"
MF3_TRIGGERS="month_brand_readings_delete_guard:month_reading_delete_guard,month_brand_readings_frozen_guard:month_reading_frozen_guard,month_brand_readings_frozen_insert_guard:month_reading_frozen_insert_guard,month_lens_readings_delete_guard:month_reading_delete_guard,month_lens_readings_frozen_guard:month_reading_frozen_guard,month_lens_readings_frozen_insert_guard:month_lens_frozen_insert_guard,tracking_config_queue_applied_once:tracking_config_queue_applied_once"
# The existing guards: the four guard functions, the audit trigger's function,
# and every trigger on the six month tables and tracking_configs, as one line
# count and one md5. MF3 attaches the guards to its own tables and replaces none.
GUARDS_SQL="select count(*), md5(string_agg(x, E'\n' order by x)) from (
  select p.proname || ':' || md5(pg_get_functiondef(p.oid)) as x
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('month_reading_frozen_guard', 'month_reading_frozen_insert_guard',
         'month_reading_delete_guard', 'month_reading_written_here', 'tracking_configs_audit')
  union all
  select c.relname || ':' || pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
     and c.relname in ('month_denominators', 'month_theme_readings', 'month_subject_readings', 'month_kind_readings',
                       'month_audience_stats', 'month_evidence_refs', 'tracking_configs')
) g;"
PRE_GUARDS=""

verify_MF3() {
  local sql
  read -r -d '' sql <<SQL
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ($MF3_TABLES) and c.relrowsecurity)                     as tables_rls,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ($MF3_TABLES)
      and cmd = 'SELECT' and roles = '{authenticated}' and qual = '(client_id = get_my_client_id())')  as select_policies,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
    and table_name in ($MF3_TABLES) and grantee in ('anon','authenticated'))                            as tenant_table_grants,
  (select count(*) from information_schema.columns c where c.table_schema = 'public' and c.table_name in ($MF3_TABLES)
    and not has_column_privilege('authenticated', format('public.%I', c.table_name), c.column_name, 'SELECT')) as hidden_columns,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
    and table_name in ($MF3_TABLES) and grantee = 'service_role'
    and privilege_type in ('SELECT','INSERT'))                                                          as service_select_insert,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
    and table_name in ($MF3_MONTH_TABLES) and grantee = 'service_role'
    and privilege_type in ('UPDATE','DELETE'))                                                          as month_update_delete,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
    and ((table_name in ($MF3_APPEND_TABLES) and privilege_type in ('UPDATE','DELETE','TRUNCATE'))
         or (table_name in ($MF3_MONTH_TABLES) and privilege_type = 'TRUNCATE'))
    and grantee = 'service_role')                                                                       as service_rewrites,
  (select coalesce(string_agg(column_name, ',' order by column_name), '-') from information_schema.column_privileges
    where table_schema = 'public' and table_name in ($MF3_APPEND_TABLES) and grantee = 'service_role'
      and privilege_type = 'UPDATE')                                                                    as service_update_columns;
SQL
  show "$sql"
  echo "  expect: tables|pol|tenant|hidden|sel+ins|month upd+del|rewrites|update columns = 5|5|0|2|10|4|0|applied_at"
  echo "          (hidden: own_post_subjects' reason and actor_label; update columns: the queue's one stamp)"
  check "tables|pol|tenant|hid|sel+ins|m|rw|col" "$(sed "s/$FS/|/g" <<<"$OUT")" "5|5|0|2|10|4|0|applied_at"

  read -r -d '' sql <<SQL
select
  (select string_agg(t.tgname || ':' || p.proname, ',' order by t.tgname)
     from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal and c.relnamespace = 'public'::regnamespace and c.relname in ($MF3_TABLES)) as triggers,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ($MF3_FUNCS)
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE')))                               as leaked_execute,
  (select count(*) from pg_attribute where attrelid = 'public.tracking_configs'::regclass and not attisdropped
      and attname in ('watched_brands','market_description') and attacl is null
      and not has_column_privilege('authenticated', 'public.tracking_configs', attname, 'UPDATE'))        as operator_columns;
SQL
  show "$sql"
  echo "  expect: the seven guards on their tables, no tenant execute, both operator columns with no tenant grant"
  check "guards on the new tables" "$(sed "s/$FS/|/g" <<<"$OUT" | cut -d'|' -f1)" "$MF3_TRIGGERS"
  check "leaked|operator columns" "$(sed "s/$FS/|/g" <<<"$OUT" | cut -d'|' -f2-3)" "0|2"

  show "$TENANT_UPDATE_SQL"
  echo "  expect: MF3 changes no grant, so the list read before it"
  check "tenant UPDATE columns kept" "$OUT" "$PRE_TENANT_UPDATE"

  show "$GUARDS_SQL"
  echo "  expect: the existing guards as read before the apply (pre-check 4)"
  check "existing guards unchanged" "$(sed "s/$FS/|/g" <<<"$OUT")" "$PRE_GUARDS"
  finish_verify "$CURRENT"

  echo
  echo "  == MF3 READING (human read): the new tables are empty, and Sealand's months as they stand =="
  read -r -d '' sql <<SQL
select 'month_lens_readings' as t, count(*) from public.month_lens_readings
union all select 'month_brand_readings', count(*) from public.month_brand_readings
union all select 'video_surfacings', count(*) from public.video_surfacings
union all select 'tracking_config_queue', count(*) from public.tracking_config_queue
union all select 'own_post_subjects', count(*) from public.own_post_subjects;
SQL
  show "$sql"
  echo "  expect: 0 rows in each (deploy 4's steps and the back-read write them)"
  read -r -d '' sql <<SQL
select month, string_agg(distinct status, ',') as status, count(*) as audiences
from public.month_denominators where client_id = '$SEALAND' and month >= date '2026-06-01'
group by month order by month;
SQL
  show "$sql"
  echo "  expect before the Sun 4 Oct run: the months before August frozen, August and September filling; after it, August frozen too"
}

# MF5 (WP3.6 wave 2): the column, its CHECK, and the member's grants on moves:
# INSERT on the nine columns 20260918093000 names plus dated_on, UPDATE on
# (status, updated_at) and nothing else, as before it.
MOVES_TENANT_SQL="select
  (select string_agg(column_name, ', ' order by column_name) from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'moves' and grantee = 'authenticated' and privilege_type = 'INSERT'),
  (select string_agg(column_name, ', ' order by column_name) from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'moves' and grantee = 'authenticated' and privilege_type = 'UPDATE');"
MOVES_INSERT_AFTER="client_id, dated_on, declared_by, direction, kind, lineage_id, note, registry_ids, subject_id, title"

verify_MF5() {
  local sql
  read -r -d '' sql <<'SQL'
select
  (select data_type || ':' || is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'moves' and column_name = 'dated_on')                  as dated_on,
  (select count(*) from pg_constraint where conrelid = 'public.moves'::regclass and conname = 'moves_dated_on_window'
      and pg_get_constraintdef(oid) like '%dated_on <= declared_at%'
      and pg_get_constraintdef(oid) like '%2 mons%')                                                       as window_check,
  (select has_column_privilege('authenticated', 'public.moves', 'dated_on', 'UPDATE')
       or has_column_privilege('anon', 'public.moves', 'dated_on', 'INSERT'))                              as leaked;
SQL
  show "$sql"
  echo "  expect: dated_on = date:YES, the window CHECK in place, no member UPDATE and no anon INSERT on it"
  check "dated_on|check|leaked" "$(sed "s/$FS/|/g" <<<"$OUT")" "date:YES|1|f"

  show "$MOVES_TENANT_SQL"
  echo "  expect: the member's INSERT is the nine columns plus dated_on; its UPDATE is status and updated_at, as before"
  check "member INSERT on moves" "$(field 1 "$OUT")" "$MOVES_INSERT_AFTER"
  check "member UPDATE on moves" "$(field 2 "$OUT")" "status, updated_at"

  show "$TENANT_UPDATE_SQL"
  echo "  expect: MF5 changes no grant on tracking_configs, so the list read before it"
  check "tenant UPDATE columns kept" "$OUT" "$PRE_TENANT_UPDATE"
  finish_verify "$CURRENT"

  echo
  echo "  == MF5 READING (human read): the moves each tenant holds, and how many carry a day =="
  read -r -d '' sql <<'SQL'
select c.company_name, count(m.id) as moves, count(m.dated_on) as dated_on
from public.clients c left join public.moves m on m.client_id = c.id
group by c.company_name order by c.company_name;
SQL
  show "$sql"
  echo "  expect: dated_on 0 on every tenant (only Your moves' Date a move writes it, once this is in)"
}

# ------------------------------------------------------------ pre-checks ----
echo "== plan: $N file(s), filename order, one psql + one transaction each =="
for i in "${!EXPECTED_FILES[@]}"; do printf '  %-5s %s\n' "${LABELS[$i]}" "${EXPECTED_FILES[$i]}"; done
echo

echo "== pre-check 1: clients (expect 2) =="
if ! n_clients="$(q "select count(*) from clients")"; then echo "ABORT: could not query clients: connection or auth failed. Nothing applied."; exit 1; fi
echo "  clients = $n_clients"
if ! [[ "$n_clients" =~ ^[0-9]+$ ]]; then echo "ABORT: unexpected answer '$n_clients'."; exit 1; fi
if [[ "$n_clients" != "2" ]]; then pause_human "clients = $n_clients, expected 2. Is this really the database you mean?"; fi

echo "== pre-check 2: no pipeline run in flight (expect 0) =="
if ! n_open="$(q "select count(*) from pipeline_runs where status not in ('completed','failed','partial')")"; then
  echo "ABORT: pipeline_runs query failed. Nothing applied."; exit 1
fi
echo "  open runs = $n_open"
if [[ "$n_open" != "0" ]]; then echo "ABORT: $n_open pipeline run(s) in flight. Wait for them to finish. Nothing applied."; exit 1; fi

echo "== pre-check 3: the tenant's column UPDATE on tracking_configs (the R12 grants) =="
if ! PRE_TENANT_UPDATE="$(q "$TENANT_UPDATE_SQL")"; then echo "ABORT: grant query failed. Nothing applied."; exit 1; fi
echo "  authenticated UPDATE: ${PRE_TENANT_UPDATE:-(none)}"
echo "  expect before R12:    $TENANT_UPDATE_BEFORE"
echo "  expect after R12:     $TENANT_UPDATE_AFTER"
if [[ "$PRE_TENANT_UPDATE" == "$TENANT_UPDATE_BEFORE" ]]; then
  echo "  ok    as staging holds them (R12 not applied yet)"
elif [[ "$PRE_TENANT_UPDATE" == "$TENANT_UPDATE_AFTER" ]]; then
  echo "  NOTE: R12 is already applied here."
elif [[ "$SET" == "r12" ]]; then
  echo "ABORT: this database holds a tenant UPDATE grant staging does not (or lacks one it has). R12's revoke would leave it"
  echo "       and its check would fail after the commit. Show Claude the list above. Nothing applied."; exit 1
else
  echo "  NOTE: differs from staging. ${LABELS[0]} changes no grant, so this does not stop ${LABELS[0]}; show Claude the list before the r12 set."
fi

if [[ "$SET" == "mf3" ]]; then
  echo "== pre-check 4: the existing guards and the audit trigger, before MF3 =="
  if ! PRE_GUARDS="$(q "$GUARDS_SQL")"; then echo "ABORT: guard query failed. Nothing applied."; exit 1; fi
  PRE_GUARDS="$(sed "s/$FS/|/g" <<<"$PRE_GUARDS")"
  echo "  functions and triggers | md5 = $PRE_GUARDS"
  echo "  (MF3 must leave this line as it is: verify_MF3 reads it again after the apply)"
fi

HCOLS=""
inspect_history() {
  echo "== supabase_migrations.schema_migrations =="
  if ! HCOLS="$(q "select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations' order by ordinal_position;")"; then
    stop_psql_error "history column inspection" "${1:-$(next_after "")}"
  fi
  if [[ -z "$HCOLS" ]]; then echo "  (table not found)"; return; fi
  sed "s/$FS/ | /g; s/^/  /" <<<"$HCOLS"
  local list r; list="$(printf "'%s'," "${EXPECTED_FILES[@]%%_*}")"; list="${list%,}"
  r="$(q "select count(*), (select count(*) from supabase_migrations.schema_migrations where version in ($list)), (select count(*) from supabase_migrations.schema_migrations where version = '$PREREQ_VERSION') from supabase_migrations.schema_migrations;")" \
    || stop_psql_error "history count" "${1:-$(next_after "")}"
  echo "  total rows = $(field 1 "$r") · this set's versions already present = $(field 2 "$r") of $N · $PREREQ_NAME ($PREREQ_VERSION) present = $(field 3 "$r")"
  HIST_PREREQ="$(field 3 "$r")"
  HIST_PRESENT="$(field 2 "$r")"
}
HIST_PREREQ=""; HIST_PRESENT=""
inspect_history "${EXPECTED_FILES[0]}"
if [[ -n "$HCOLS" && "$HIST_PREREQ" != "1" ]]; then
  echo "ABORT: $PREREQ_NAME ($PREREQ_VERSION) is not in the history. This set assumes it. Nothing applied."; exit 1
fi
if [[ "$HIST_PRESENT" == "$N" ]]; then
  echo "  NOTE: every file of this set is already in the history. Re-applying is safe (idempotent) and re-verifies it."
fi

if (( DRY_RUN )); then
  echo
  echo "DRY RUN complete: nothing applied. Log: $LOG"
  exit 0
fi

if [[ "$SET" == "r12" ]]; then
  echo
  echo "== R12 takes away the grants deploy 1's settings saves use (rivals, cadence, exclusions, communities) =="
  echo "   Apply it only once deploy 2 (mf-d2) is live on production and a settings save has been checked there."
  pause_human "Is deploy 2 live on production?"
fi
echo
pause_human "Apply the $N file(s) above to $( (( TEST_TARGET )) && echo 'the TEST cluster' || echo 'PRODUCTION') ($DB_HOST, $DB_USER)?"

# ----------------------------------------------------------------- apply ----
TOTAL_START=$(date +%s)
for i in "${!EXPECTED_FILES[@]}"; do
  f="${EXPECTED_FILES[$i]}"; label="${LABELS[$i]}"; CURRENT="$f"
  echo
  echo "================================================================================"
  echo "$label · $f   ($(date '+%H:%M:%S'))"
  echo "================================================================================"
  t0=$(date +%s)
  if ! psql "$DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -c 'set local statement_timeout = 0' -f "$MIG_DIR/$f" </dev/null; then
    CURRENT=""
    stop_psql_error "$label $f (rolled back)" "$f"
  fi
  APPLIED+=("$f")
  echo "-- $label applied in $(( $(date +%s) - t0 )) s; verifying:"
  VFAIL=()
  "verify_${label//./_}"
done
echo
echo "All $N applied and verified in $(( $(date +%s) - TOTAL_START )) s."

# ------------------------------------------------------- migration history ----
echo
echo "== recording history in supabase_migrations.schema_migrations =="
CURRENT="${EXPECTED_FILES[$((N-1))]}"
inspect_history "(history insert: every file IS applied)"
if [[ -z "$HCOLS" ]]; then
  echo "STOPPED: no schema_migrations table. Every file IS applied and verified; only the history rows are missing."; exit 1
fi
stmt_notnull="$(awk -F"$FS" '$1=="statements" && $3=="NO" && $4=="" {print "yes"}' <<<"$HCOLS")"
other_req="$(awk -F"$FS" '$3=="NO" && $4=="" && $1!="version" && $1!="name" && $1!="statements" {print $1}' <<<"$HCOLS" | paste -sd, -)"
if [[ -n "$other_req" ]]; then
  echo "STOPPED: schema_migrations has other NOT NULL columns without default: $other_req. Every file IS applied; insert the history by hand."; exit 1
fi
values=""
for f in "${EXPECTED_FILES[@]}"; do
  base="${f%.sql}"; ver="${base%%_*}"; nm="${base#*_}"
  if [[ -n "$stmt_notnull" ]]; then values+="('$ver','$nm','{}'::text[]),"; else values+="('$ver','$nm'),"; fi
done
values="${values%,}"
if [[ -n "$stmt_notnull" ]]; then cols="version, name, statements"; else cols="version, name"; fi
HIST_INSERT="insert into supabase_migrations.schema_migrations ($cols) values $values on conflict do nothing;"
echo "  | $HIST_INSERT"
if ! psql "$DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -c "$HIST_INSERT" </dev/null; then
  echo "STOPPED: history insert failed (rolled back). Every file IS applied and verified; re-running just the insert is safe."; exit 1
fi
inspect_history "(after the insert)"
echo
case "$SET" in
  mf1)
  echo "DONE: $SET applied, verified and recorded. Next (plan §3.6): the four --apply pastes, in order:"
  echo "  reconstruct-provenance → log-tracking-eras → measure-comparability → label-segments."
  echo "  R12 (--set r12) waits for deploy 2."
  ;;
  r12)
  echo "DONE: $SET applied, verified and recorded. A tenant session can no longer change the search set or the cadence."
  echo "  From now on a rollback behind deploy 2 breaks tenant settings saves (the file header says how to undo it)."
  ;;
  mf2)
  echo "DONE: $SET applied, verified and recorded. Next, in this same Terminal session: --set mf4 (plan §4.1)."
  ;;
  mf4)
  echo "DONE: $SET applied, verified and recorded. MF2 and MF4 are in; nothing deployed reads them until deploy 3."
  ;;
  mf3)
  echo "DONE: $SET applied, verified and recorded. MF3 is in, and deploy 4 (live) reads it: the next run writes the lens, brand and surfacing rows."
  echo "  The lens and brand back-read of the months that closed before MF3 is a later, separate step; nothing here runs it."
  ;;
  mf5)
  echo "DONE: $SET applied, verified and recorded. MF5 is in: Your moves' Date a move now takes the day the change was made."
  ;;
esac
echo "Log: $LOG"
