#!/usr/bin/env bash
# The September 2026 department briefs for both workspaces, once, after the
# deploy that wires the briefs (T8): the month closed on the runs of 4 Oct,
# before the pipeline's `briefs:*` steps existed, so no run will write it.
#
#   bash scripts/backfill-briefs-september.sh --plan    # free: what --write would do
#   bash scripts/backfill-briefs-september.sh [--designed-root <dir>]
#                                                       # dry: builds both, stores nothing (~$5 of model calls),
#                                                       # and draws and saves every brief as the product does
#   bash scripts/backfill-briefs-september.sh --write --from <dir>
#                                                       # stores the dry build saved under <dir> AS IT IS: no model call
#   bash scripts/backfill-briefs-september.sh --write   # builds again and stores both (~$5); they appear in the Studio
#
# THE DRY BUILD IS FOR READING THE MONTH DESIGNED before anything is stored:
# each brief is saved as `{ data, texts }` JSON (quotes as refs, their words
# beside them, local) and drawn through the product's own deck (the canvas's
# pages) as a PDF and a PNG a page, with a `set.json` that holds what --from
# stores by, into
#   <designed root>/<tenant>/    (sealand/, ossur/)
# where the root is --designed-root, by default
#   ~/Documents/Heinrich/Verbatim/Briefs-2026-09-designed
# A dry build never draws into a folder that holds a build already, so a
# second dry build takes a new root. Its Markdown and the raw JSON go to
# --out where given.
#
# STORE WHAT WAS REVIEWED WITH --from <root> (the root holding sealand/ and
# ossur/): each workspace's saved briefs are checked (they parse, they are
# that workspace's September, their In short holds to what prints, they draw
# with no clipping) and stored exactly as reviewed, or nothing is stored and
# the script says why. A plain --write calls the models again, so its words
# differ from the dry build's.
#
# Needs supabase/migrations/20261107093000_monthly_briefs.sql applied
# (app-setup.sh) before --write. One workspace after the other, never two at
# once: each is a pipeline step's worth of production reads (--from reads one
# client row and the ledger). Run it from the repo root with .env.local
# present. A month already written is refused; pass --replace with --write to
# write it again.
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f .env.local ]] || { echo "backfill: .env.local is missing (it holds the production keys)" >&2; exit 2; }

root="$HOME/Documents/Heinrich/Verbatim/Briefs-2026-09-designed"
from=""
pass=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --designed-root) root="${2:?backfill: --designed-root needs a folder}"; shift 2 ;;
    --from) from="${2:?backfill: --from needs the folder holding sealand/ and ossur/}"; shift 2 ;;
    *) pass+=("$1"); shift ;;
  esac
done

dry=1
for a in ${pass[@]+"${pass[@]}"}; do [[ "$a" == "--write" || "$a" == "--plan" ]] && dry=0; done

run() { # client, run, label, folder
  echo
  echo "=== $3 ==="
  local extra=()
  [[ $dry == 1 ]] && extra+=(--designed "$root/$4")
  [[ -n "$from" ]] && extra+=(--from "$from/$4")
  node --env-file=.env.local --import tsx scripts/monthly-briefs.ts --client "$1" --month 2026-09 --run "$2" ${extra[@]+"${extra[@]}"} ${pass[@]+"${pass[@]}"}
}

# Sealand: the run that closed September.
run ac16988e-c4f3-4baf-b388-73895852a554 393b95df-705c-4cd0-9654-a5a92327b4bf Sealand sealand
# Össur: the run that closed September.
run e52cac94-30e1-426a-9a36-31b11e0b30b6 555af400-4f5a-49bd-883f-4af7799ddc1f Össur ossur
