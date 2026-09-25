#!/usr/bin/env bash
# The pipeline import-closure check (market-first plan §7.4, WP1.2).
#
# Prints every file changed since BASE that sits inside the import closure of
# inngest/functions/pipeline.ts: the files a deploy can change the pipeline's
# behaviour through. Each deploy's review names them. Before the 4 Oct run a
# change on the freeze-months path (lib/reading/monthly.ts and what it imports)
# is a stop (plan §7.11), and until deploy 4 a change in the closure may only be
# additive (a new constant, a new union member).
#
# Usage: scripts/pipeline-closure.sh [BASE]   (default: main)
#   BASE is compared at its merge base with HEAD, and uncommitted changes count.
#
# Read-only: it runs `tsc --listFilesOnly` on tsconfig.pipeline.json (no
# type-check, no emit) and `git diff --name-only`. No new dependency.
set -euo pipefail
cd "$(dirname "$0")/.."

base="${1:-main}"
from="$(git merge-base "$base" HEAD)"

closure="$(npx tsc -p tsconfig.pipeline.json --listFilesOnly \
  | grep -v '/node_modules/' \
  | sed "s|^$(pwd -P)/||; s|^$(pwd)/||" \
  | sort -u)"
changed="$(git diff --name-only "$from" | sort -u)"

hits="$(comm -12 <(printf '%s\n' "$closure") <(printf '%s\n' "$changed") | sed '/^$/d')"
count="$(printf '%s\n' "$closure" | sed '/^$/d' | wc -l | tr -d ' ')"

echo "pipeline closure: ${count} files in the import closure of inngest/functions/pipeline.ts"
echo "changed since ${base} (merge base ${from:0:8}):"
if [ -z "$hits" ]; then
  echo "  (none)"
else
  printf '  %s\n' $hits
  if printf '%s\n' $hits | grep -qx 'lib/reading/monthly.ts'; then
    echo "  ! lib/reading/monthly.ts is on the freeze-months path (plan §7.11)"
  fi
fi
