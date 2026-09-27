#!/usr/bin/env bash
# Deploy 5b and the 4 Oct freeze on a throwaway PostgreSQL 17 cluster: does the
# trim before the months make the stored subject reading the live one, and move
# nothing else freeze-months writes?
#
#   bash scripts/pg-shim/d5b-trim-checks.sh <scratch dir>
#
# Brings a fresh cluster up with every migration (throwaway.sh up), runs
# scripts/pg-shim/d5b-trim-checks.sql, and takes the cluster down again, pass
# or fail. LOCAL ONLY: throwaway.sh connects to nothing but its own server.
# Exits non-zero on the first failed check.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${1:?usage: d5b-trim-checks.sh <scratch dir>}"
TW="$ROOT/scripts/pg-shim/throwaway.sh"
mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd)"
bash "$TW" down "$DIR/pg" > /dev/null
trap 'bash "$TW" down "$DIR/pg" > /dev/null' EXIT
bash "$TW" up "$DIR/pg"
bash "$TW" check "$DIR/pg" "$ROOT/scripts/pg-shim/d5b-trim-checks.sql"
echo "d5b-trim-checks: all passed"
