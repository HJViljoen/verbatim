#!/usr/bin/env bash
# Deploy 4 and the 4 Oct freeze on a throwaway PostgreSQL 17 cluster: can any
# write the new run code makes change what freeze-months writes for August?
#
#   bash scripts/pg-shim/d4-freeze-checks.sh <scratch dir>
#
# Brings a fresh cluster up with every migration (throwaway.sh up: MF1, R12,
# MF2, MF4 and MF3 among them), runs scripts/pg-shim/d4-freeze-checks.sql, and
# takes the cluster down again, pass or fail. LOCAL ONLY: throwaway.sh
# connects to nothing but its own server. Exits non-zero on the first failed
# check.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${1:?usage: d4-freeze-checks.sh <scratch dir>}"
TW="$ROOT/scripts/pg-shim/throwaway.sh"
mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd)"
bash "$TW" down "$DIR/pg" > /dev/null
trap 'bash "$TW" down "$DIR/pg" > /dev/null' EXIT
bash "$TW" up "$DIR/pg"
bash "$TW" check "$DIR/pg" "$ROOT/scripts/pg-shim/d4-freeze-checks.sql"
echo "d4-freeze-checks: all passed"
