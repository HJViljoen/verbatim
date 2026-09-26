#!/usr/bin/env bash
# A throwaway PostgreSQL 17 cluster holding Verbatim's schema, for applying a
# migration twice and diffing the catalogue (market-first plan §4.0
# "Migrations", WP1.4; BI F29).
#
#   scripts/pg-shim/throwaway.sh up <dir> [--before <version>]
#       initdb into <dir>/data, start it on 127.0.0.1 (no unix socket: the
#       scratchpad's paths are longer than a socket path may be), then load
#       shim.sql, supabase/schema-baseline.sql and every migration dated after
#       the baseline (2026-08-09) in filename order, stopping before
#       <version> when given (for example --before 20260928090000).
#   scripts/pg-shim/throwaway.sh twice <dir> <migration.sql>...
#       for each file: catalogue, apply, catalogue, apply again, catalogue.
#       Exits 1 unless the catalogue after the second application equals the
#       catalogue after the first, line for line. Prints what the first
#       application added.
#   scripts/pg-shim/throwaway.sh apply <dir> <file.sql>...   one psql per file, one transaction each
#   scripts/pg-shim/throwaway.sh check <dir> <file.sql>...   run a checks file as written (it holds its
#       own begin/rollback), stopping on the first error; for example mf1-checks.sql
#   scripts/pg-shim/throwaway.sh psql <dir> [psql args]      a psql on the cluster
#   scripts/pg-shim/throwaway.sh down <dir>                  stop the server and delete <dir>
#
# LOCAL ONLY. It connects to nothing but its own server: every psql gets
# -h 127.0.0.1 and the cluster's own port, and PG* variables and DATABASE_URL from
# the caller's shell are cleared first, so a stray production URL cannot be
# reached from here. No dependency beyond Homebrew's postgresql@17 (17.11) and
# pgvector.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHIM_DIR="$ROOT/scripts/pg-shim"
MIG_DIR="$ROOT/supabase/migrations"
BASELINE="$ROOT/supabase/schema-baseline.sql"
BASELINE_DATE="20260809"   # the baseline supersedes every migration dated on or before 2026-08-08
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
PORT="${THROWAWAY_PORT:-54917}"
DB="verbatim"

unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE DATABASE_URL SUPABASE_DB_URL PROD_DB_URL BRANCH_DB_URL || true

die() { echo "throwaway: $*" >&2; exit 2; }

cmd="${1:-}"; dir="${2:-}"
[[ -n "$cmd" && -n "$dir" ]] || die "usage: throwaway.sh up|twice|apply|psql|down <dir> …"
shift 2
mkdir -p "$dir"
dir="$(cd "$dir" && pwd)"

q() { "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -d "$DB" -X -v ON_ERROR_STOP=1 "$@"; }

apply_file() { # one file, one transaction, stop on the first error
  local f="$1"
  if ! q -q --single-transaction -f "$f" > "$dir/apply.log" 2>&1; then
    echo "FAILED: $(basename "$f")" >&2; cat "$dir/apply.log" >&2; exit 1
  fi
  if grep -q 'ERROR' "$dir/apply.log"; then cat "$dir/apply.log" >&2; exit 1; fi
}

catalogue() { q -q -f "$SHIM_DIR/catalogue.sql" > "$1"; }

case "$cmd" in
  up)
    before=""
    if [[ "${1:-}" == "--before" ]]; then before="${2:?--before needs a version}"; fi
    [[ -e "$dir/data" ]] && die "$dir/data exists; run down first"
    "$PG_BIN/initdb" -D "$dir/data" -U "$(whoami)" --locale=C -E UTF8 > "$dir/initdb.log" 2>&1
    "$PG_BIN/pg_ctl" -D "$dir/data" -l "$dir/server.log" \
      -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -w start > /dev/null
    "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" "$DB"
    apply_file "$SHIM_DIR/shim.sql"
    apply_file "$BASELINE"
    n=0
    for f in "$MIG_DIR"/*.sql; do
      v="$(basename "$f")"; v="${v%%_*}"
      [[ "${v:0:8}" < "$BASELINE_DATE" ]] && continue
      [[ -n "$before" && ! "$v" < "$before" ]] && continue
      apply_file "$f"; n=$((n + 1))
    done
    echo "up: $dir (port $PORT, database $DB): shim, baseline and $n migrations applied${before:+ (before $before)}"
    ;;
  twice)
    [[ $# -ge 1 ]] || die "twice needs at least one migration file"
    status=0
    for f in "$@"; do
      b="$(basename "$f")"
      catalogue "$dir/cat-0-$b.txt"
      apply_file "$f"; catalogue "$dir/cat-1-$b.txt"
      apply_file "$f"; catalogue "$dir/cat-2-$b.txt"
      added="$(diff "$dir/cat-0-$b.txt" "$dir/cat-1-$b.txt" | grep -c '^[<>]' || true)"
      if diff -u "$dir/cat-1-$b.txt" "$dir/cat-2-$b.txt" > "$dir/diff-$b.txt"; then
        echo "twice: $b applied twice; catalogue diff after the second application: EMPTY ($(wc -l < "$dir/cat-2-$b.txt" | tr -d ' ') catalogue lines; the first application changed $added)"
      else
        echo "twice: $b NOT idempotent; the second application changed the catalogue:" >&2
        cat "$dir/diff-$b.txt" >&2
        status=1
      fi
    done
    exit "$status"
    ;;
  apply)
    for f in "$@"; do apply_file "$f"; echo "applied $(basename "$f")"; done
    ;;
  check)
    for f in "$@"; do q -q -f "$f"; done
    ;;
  psql)
    q "$@"
    ;;
  down)
    if [[ -e "$dir/data" ]]; then "$PG_BIN/pg_ctl" -D "$dir/data" -m fast stop > /dev/null 2>&1 || true; fi
    rm -rf "$dir"
    echo "down: $dir removed"
    ;;
  *) die "unknown command $cmd" ;;
esac
