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
# The freeze-months path is lib/reading/monthly.ts AND its imports (§7.11), so
# its own closure is listed too (tsconfig.freeze-months.json), and every changed
# file on it is flagged with "!", not only monthly.ts itself.
#
# Read-only: it runs `tsc --listFilesOnly` on tsconfig.pipeline.json and
# tsconfig.freeze-months.json (no type-check, no emit) and
# `git diff --name-only`. No new dependency.
set -euo pipefail
cd "$(dirname "$0")/.."

base="${1:-main}"
from="$(git merge-base "$base" HEAD)"

list_files() {
  npx tsc -p "$1" --listFilesOnly \
    | grep -v '/node_modules/' \
    | sed "s|^$(pwd -P)/||; s|^$(pwd)/||" \
    | sort -u
}

closure="$(list_files tsconfig.pipeline.json)"
freeze="$(list_files tsconfig.freeze-months.json)"
changed="$(git diff --name-only "$from" | sort -u)"

hits="$(comm -12 <(printf '%s\n' "$closure") <(printf '%s\n' "$changed") | sed '/^$/d')"
count="$(printf '%s\n' "$closure" | sed '/^$/d' | wc -l | tr -d ' ')"
freeze_count="$(printf '%s\n' "$freeze" | sed '/^$/d' | wc -l | tr -d ' ')"

echo "pipeline closure: ${count} files in the import closure of inngest/functions/pipeline.ts"
echo "freeze-months path: ${freeze_count} files (lib/reading/monthly.ts and its imports)"
echo "changed since ${base} (merge base ${from:0:8}):"
if [ -z "$hits" ]; then
  echo "  (none)"
else
  # One path per line, quoted: a path with a space or a bracket ([id]) is
  # neither split nor globbed.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if printf '%s\n' "$freeze" | grep -qxF -- "$f"; then
      printf '  %s   ! on the freeze-months path (plan §7.11)\n' "$f"
    else
      printf '  %s\n' "$f"
    fi
  done <<< "$hits"
fi
