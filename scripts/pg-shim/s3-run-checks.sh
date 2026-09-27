#!/usr/bin/env bash
# The deploy-4 run steps' writes on a throwaway PostgreSQL 17 cluster
# (mf/s3-run; plan WP3.3, WP3.4, WP3.5, WP3.10):
#
#   bash scripts/pg-shim/s3-run-checks.sh <scratch dir>
#
# Brings a fresh cluster up with every migration (throwaway.sh up: MF1, R12,
# MF2, MF4 and MF3 among them), runs scripts/pg-shim/s3-run-checks.sql, and
# takes the cluster down again, pass or fail. LOCAL ONLY: throwaway.sh
# connects to nothing but its own server. Exits non-zero on the first failed
# check.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${1:?usage: s3-run-checks.sh <scratch dir>}"
TW="$ROOT/scripts/pg-shim/throwaway.sh"
mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd)"
bash "$TW" down "$DIR/pg" > /dev/null
trap 'bash "$TW" down "$DIR/pg" > /dev/null' EXIT
bash "$TW" up "$DIR/pg"
bash "$TW" check "$DIR/pg" "$ROOT/scripts/pg-shim/s3-run-checks.sql"
echo "s3-run-checks: all passed"
