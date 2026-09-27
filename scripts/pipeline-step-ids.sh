#!/usr/bin/env bash
# The ordered Inngest step-id diff (market-first plan §4.2 "Pipeline ids",
# §7.4; AGENTS.md: "the check before a deploy is the ordered DIFF of the ids,
# not the count").
#
# Lists every step id of inngest/functions/pipeline.ts in source order (the
# first argument of each step.run / step.sendEvent, as written: a literal, a
# template such as `comparability:${i + 1}-of-${comparabilityTasks.length}`, or
# a call such as searchStepId(task)), at BASE and in the working tree, and
# diffs the two lists. Completed steps replay by id, so a deploy may only ADD
# ids in their own positions: zero removals, zero reorderings.
#
# Usage: scripts/pipeline-step-ids.sh [BASE]   (default: mf/d2-int)
#   --expect-before <id> <id>...  also check that the insertions are exactly
#       these ids' families (x and plan-x, x:${i}-of-${n}), in this order,
#       immediately before the id named after --expect-before.
# Exits 1 on a removal, a reordering, or an unmet --expect-before.
#
# Deploy 4: scripts/pipeline-step-ids.sh mf/d2-int --expect-before freeze-months \
#   segment-videos comparability lens-readings brand-readings
#
# Read-only: git show and node, no dependency.
set -euo pipefail
cd "$(dirname "$0")/.."

base="${1:-mf/d2-int}"
shift || true
expect_before=""
expect_ids=()
if [[ "${1:-}" == "--expect-before" ]]; then
  expect_before="${2:?--expect-before needs an id}"
  shift 2
  expect_ids=("$@")
fi

FILE=inngest/functions/pipeline.ts
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git show "$base:$FILE" > "$tmp/base.ts"
cp "$FILE" "$tmp/head.ts"

extract() { # file → one id per line, source order
  node -e '
const src = require("fs").readFileSync(process.argv[1], "utf8")
const re = /\bstep\s*\.\s*(run|sendEvent)\s*\(/g
const out = []
let m
while ((m = re.exec(src))) {
  let i = re.lastIndex, depth = 0, q = null, arg = ""
  for (; i < src.length; i++) {
    const c = src[i]
    if (q) {
      arg += c
      if (c === "\\") { arg += src[++i]; continue }
      if (q === "`" && c === "$" && src[i + 1] === "{") { depth++; arg += src[++i]; continue }
      if (c === q && depth === 0) q = null
      else if (q === "`" && c === "}" && depth > 0) depth--
      continue
    }
    if (c === "\x27" || c === "\"" || c === "`") { q = c; arg += c; continue }
    if (c === "(" || c === "{" || c === "[") depth++
    if (c === ")" || c === "}" || c === "]") { if (depth === 0) break; depth-- }
    if (c === "," && depth === 0) break
    arg += c
  }
  out.push(arg.replace(/\s+/g, " ").trim().replace(/^[\x27"]|[\x27"]$/g, ""))
}
console.log(out.join("\n"))
' "$1"
}

extract "$tmp/base.ts" > "$tmp/base.ids"
extract "$tmp/head.ts" > "$tmp/head.ids"
nb="$(wc -l < "$tmp/base.ids" | tr -d ' ')"
nh="$(wc -l < "$tmp/head.ids" | tr -d ' ')"
echo "step ids: ${nb} at ${base}, ${nh} in the working tree"

diff "$tmp/base.ids" "$tmp/head.ids" > "$tmp/diff" || true
removed="$(grep '^<' "$tmp/diff" | sed 's/^< //' || true)"
added="$(grep '^>' "$tmp/diff" | sed 's/^> //' || true)"
status=0
if [[ -n "$removed" ]]; then
  moved="$(comm -12 <(printf '%s\n' "$removed" | sort) <(printf '%s\n' "$added" | sort) | sed '/^$/d' || true)"
  if [[ -n "$moved" ]]; then echo "REORDERED:"; printf '  %s\n' $moved; fi
  echo "REMOVED (or renamed):"; printf '%s\n' "$removed" | sed 's/^/  /'
  status=1
fi
if [[ -n "$added" ]]; then
  echo "inserted, in order:"
  # each insertion with the id that follows it at HEAD
  node -e '
const [h, a] = process.argv.slice(1).map((f) => require("fs").readFileSync(f, "utf8").split("\n").filter(Boolean))
const added = new Set(a)
for (let i = 0; i < h.length; i++) if (added.has(h[i])) {
  let j = i + 1; while (j < h.length && added.has(h[j])) j++
  console.log(`  ${h[i]}    (before ${h[j] ?? "the end"})`)
}' "$tmp/head.ids" <(printf '%s\n' "$added")
else
  echo "inserted: none"
fi
[[ -z "$removed" ]] && echo "removed: none · reordered: none"

if [[ -n "$expect_before" ]]; then
  node -e '
const [hf, af, before, ...ids] = process.argv.slice(1)
const h = require("fs").readFileSync(hf, "utf8").split("\n").filter(Boolean)
const added = require("fs").readFileSync(af, "utf8").split("\n").filter(Boolean)
const fam = (id) => (x) => x === id || x === `plan-${id}` || x.startsWith(`${id}:`) || x.startsWith("`" + id + ":")
const at = h.indexOf(before)
if (at < 0) { console.log(`EXPECT: ${before} is not an id here`); process.exit(1) }
// the run of insertions immediately before `before`
let i = at - 1; while (i >= 0 && added.includes(h[i])) i--
const block = h.slice(i + 1, at)
const order = []
for (const x of block) { const k = ids.findIndex((id) => fam(id)(x)); if (k < 0) { console.log(`EXPECT: ${x} is not one of ${ids.join(", ")}`); process.exit(1) } order.push(k) }
const sorted = order.every((k, n) => n === 0 || order[n - 1] <= k)
const every = ids.every((_, k) => order.includes(k))
const outside = added.filter((x) => !block.includes(x))
if (!sorted || !every || outside.length) {
  console.log(`EXPECT FAILED: ${!every ? "a family is missing; " : ""}${!sorted ? "out of order; " : ""}${outside.length ? `inserted elsewhere: ${outside.join(", ")}` : ""}`)
  process.exit(1)
}
console.log(`EXPECT OK: ${ids.join(" · ")} (${block.length} ids with their plan-x and x:i-of-n fan-out) immediately before ${before}, nothing inserted elsewhere`)
' "$tmp/head.ids" <(printf '%s\n' "$added") "$expect_before" "${expect_ids[@]}" || status=1
fi
exit "$status"
