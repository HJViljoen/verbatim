#!/usr/bin/env bash
# The September 2026 department briefs for both workspaces, once, after the
# deploy that wires the briefs (T8): the month closed on the runs of 4 Oct,
# before the pipeline's `briefs:*` steps existed, so no run will write it.
#
#   bash scripts/backfill-briefs-september.sh --plan    # free: what --write would do
#   bash scripts/backfill-briefs-september.sh           # dry: builds both, stores nothing (~$5 of model calls),
#                                                       # and draws every brief as the product does
#   bash scripts/backfill-briefs-september.sh --write   # builds and stores both (~$5); they appear in the Studio
#
# THE DRY BUILD IS FOR READING THE MONTH DESIGNED before anything is stored:
# each brief is saved as `{ data, texts }` JSON (quotes as refs, their words
# beside them, local) and drawn through the product's own deck (the canvas's
# pages) as a PDF and a PNG a page, into
#   ~/Documents/Heinrich/Verbatim/Briefs-2026-09-designed/<tenant>/
# (sealand/, ossur/). Its Markdown and the raw JSON go to --out where given.
# A dry build and a later --write are two builds: --write calls the models
# again, so its words differ from the dry one's.
#
# Needs supabase/migrations/20261107093000_monthly_briefs.sql applied
# (app-setup.sh) before --write. One workspace after the other, never two at
# once: each is a pipeline step's worth of production reads. Run it from the
# repo root with .env.local present. A month already written is refused;
# pass --replace with --write to write it again.
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f .env.local ]] || { echo "backfill: .env.local is missing (it holds the production keys)" >&2; exit 2; }

designed() { # tenant folder; only a dry build is drawn
  case " $* " in *" --write "*|*" --plan "*) ;; *) echo "--designed $HOME/Documents/Heinrich/Verbatim/Briefs-2026-09-designed/$1" ;; esac
}

run() { # client, run, label, folder
  echo
  echo "=== $3 ==="
  # shellcheck disable=SC2046
  node --env-file=.env.local --import tsx scripts/monthly-briefs.ts --client "$1" --month 2026-09 --run "$2" $(designed "$4" "${@:5}") "${@:5}"
}

# Sealand: the run that closed September.
run ac16988e-c4f3-4baf-b388-73895852a554 393b95df-705c-4cd0-9654-a5a92327b4bf Sealand sealand "$@"
# Össur: the run that closed September.
run e52cac94-30e1-426a-9a36-31b11e0b30b6 555af400-4f5a-49bd-883f-4af7799ddc1f Össur ossur "$@"
