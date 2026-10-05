<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Repo rules

- **Verify claims against code and DB, not docs or notes.** Shipped-state
  comments and older docs drift; the code is the record.
- **Inngest step IDs are a stability contract.** Completed steps replay by ID
  string; renaming/renumbering strands in-flight runs across a deploy. Change
  step shape only between runs, and re-register after function changes:
  `curl -X PUT https://app.verbatimintel.com/api/inngest`.
- **A new step is an additive id in its own position** — never a rename, a
  renumber or a reorder. Two landed 2026-09-15: `embed-insights` (after the
  Pass A wave, before `cross-reference`) and `freeze-months` (after
  `persist-themes`, before `owned-events`). Both are non-fatal — logged, not
  `noteError`'d, the `keyword-discovery` precedent — because a record kept
  alongside the report must not make a clean run read `partial`; and both
  no-op rather than retry when their migration has not been applied yet.
  **Phase 1 adds five more, on `feat/phase1`, not yet deployed and in their own
  positions:** `plan-translate-quotes` and `translate-quotes:${i}-of-${n}`
  (after the Pass A wave, before `embed-insights`), `plan-subject-membership`
  and `subject-membership:${i}-of-${n}` (after `embed-insights`, before
  `cross-reference`), and `anomaly-check` (after `freeze-months`, before
  `owned-events`). **Count them one way and say which**, because two documents
  disagreed by exactly one until this line was written:
  `grep -c '\.run(' inngest/functions/pipeline.ts` gives **48 on `main` and 53
  on the branch**, and the one `step.sendEvent('request-report')` — which
  Inngest memoises by id like any other step, and which since 5 Oct runs on
  EVERY finished run (a manual one's event marked `manual`), same id, same
  position — makes it 49 and 54. Either pair
  is honest; mixing them reads as a missing step. **The check before a deploy
  is the ordered DIFF of the ids, not the count**: five pure insertions, zero
  removals, zero reorderings. All five
  follow the same non-fatal, no-op-without-its-migration rule. **Deploy 4
  (market-first, 27 Sep) adds eight, immediately before `freeze-months`, in
  this order:** `plan-segment-videos` and `segment-videos:${i}-of-${n}`,
  `plan-comparability` and `comparability:${i}-of-${n}`, `plan-lens-readings`
  and `lens-readings:${i}-of-${n}`, `plan-brand-readings` and
  `brand-readings:${i}-of-${n}` (54 ids at `mf-d3`, 62 after;
  `scripts/pipeline-step-ids.sh mf-d3 --expect-before freeze-months
  segment-videos comparability lens-readings brand-readings` is the check).
  Each ends in a `.catch` that logs and returns null, so a failed one never
  stops `freeze-months`; `lib/pipeline/freeze-parity.test.ts` and
  `scripts/pg-shim/d4-freeze-checks.sh` prove none of them moves what it
  freezes. **Deploy 5b (27 Sep) adds one, immediately before
  `plan-segment-videos`:** `trim-stale-memberships` (62 ids at `mf-d5`, 63
  after; `scripts/pipeline-step-ids.sh mf-d5 --expect-before
  plan-segment-videos trim-stale-memberships` is the check). It deletes the
  `subject_memberships` rows of exactly the insights `prune-stale-analysis`
  deletes after the close, so no month a step reads before then counts a
  member the prune takes; its `.catch` returns null and `trimFreezeHold` turns
  that into freeze-months' subject hold, and the prune keeps any insight a
  membership still counts (`lib/pipeline/stale-analysis.ts`;
  `lib/pipeline/freeze-parity.test.ts` §6-7 and
  `scripts/pg-shim/d5b-trim-checks.sh`). **Writing back (T4, `feat/writing-back`)
  adds one, immediately before `close-run`:** `write-week-read` (63 ids, 64
  after; `scripts/pipeline-step-ids.sh <base> --expect-before close-run
  write-week-read` is the check, and `lib/written/step.test.ts` pins it). It
  writes the run's `week_reads` row (`lib/written/step.ts`). A TRANSIENT
  failure (`isTransient`, `lib/written/deadline.ts`: a model call that timed
  out or was aborted, a 408, 429 or 5xx, a dropped connection) on any attempt
  but the step's last THROWS, so Inngest retries the step, with no row and no
  alert for that attempt; the pipeline passes `lastAttempt: attempt >=
  (maxAttempts ?? 3) - 1`, the theme merge's `mergeFailSoft` test (5 Oct:
  Össur's run `555af400` stored `failed` on one self-check timeout and its
  Dashboard lost its figures). On the last attempt, and on any other failure
  at once, the body NEVER throws: a failure stores a `failed` row and alerts
  the operator inside the step, because an alert in a `.catch` beside
  `step.run` is sent again on every later step's replay. A thin week makes no
  model call, and with no `week_reads` table it no-ops and spends nothing. **The pages build (1 Oct)
  adds one, immediately after it and before `close-run`:**
  `write-longrun-read` (64 ids, 65 after; `scripts/pipeline-step-ids.sh
  5d591359 --expect-before close-run write-longrun-read` is the check, and
  `lib/written/step.test.ts` pins both). It writes the month's long-run read
  (a `week_reads` row of `kind = 'month'`, `lib/written/longrun.ts`
  `runLongRunStep`) on the run that CLOSES a month only (`closesMonth`: the
  window holds the first day of the month it ends in, one run a month); every
  other run returns at once. Same contract as the week's: a transient failure
  before the last attempt throws for Inngest to retry; otherwise the body
  never throws, its model calls are capped on its own clock, and a failure
  stores a `failed` row and alerts once with the script
  (`scripts/longrun-read.ts`), because no later run writes an ended month. It was a hook inside
  `write-week-read` on the market branch and moved out because the two reads
  overran one step's 250 s. Re-register
  after ANY function change: `curl -X PUT https://app.verbatimintel.com/api/inngest`.
- **A run's window is frozen once, at `open-run`** (`pipeline_runs.window_start`
  / `window_end` / `window_basis`, rule in `lib/pipeline/window.ts`). Steps read
  it off `OpenRunResult` / `GatherOptions`; no step recomputes the window from
  `Date.now()` — three did, and two multi-day runs gathered and synthesised
  against windows 18 and 9 days apart. Instagram and YouTube take the dates;
  TikTok and Reddit take enums (`tiktokRangeFor` / `redditTimeFor`) and the
  `inWindow` post-filter trims the surplus.
- **Tests are offline, in two tiers** (vitest — no network, DB, or GPT).
  `lib/**/*.test.ts` is pure logic: new pure pipeline logic gets a test, and
  don't mock the world to test I/O glue. `components/**/*.test.tsx` is the
  render tier: one static `renderToStaticMarkup` per block (`lib/test/render.ts`)
  asserted against the copy contract (`lib/test/copy-contract.ts` — no digit in
  a model-prose node, every level prints "of N", no direction word outside a
  verdict node). Every block gets one. No jsdom, no testing-library, no new
  dependency: the tier checks what a block PRINTS.
  The marker is `data-copy`, and it has SEVEN kinds, not four: `prose` ·
  `figure` · `level` · `verdict` · `subject` · `stored` · `quote`. The last
  three are exemptions and each one names itself. `stored` and `subject` are
  model prose written ELSEWHERE and replayed here (a stored recommendation, a
  theme label), so they must carry `data-slot` naming a `ProseSlot` that
  `PROSE_POLICY` (`lib/prose/scrub.ts`) knows — an unknown slot fails rather
  than exempting anything, because an exemption that names nothing is a hole.
  `quote` is a commenter's own words, which rule (c) may not police: a
  commenter can say "growing" and the product has not made a direction claim by
  quoting them. Unmarked markup is NOT exempt from rule (c) — the rule is about
  the whole block.
- **The build runs in CI, and in a worktree it needs a flag.** `npm run build`
  fails inside a git worktree — `node_modules` is a symlink out of the project
  root and Turbopack will not resolve through it. Use `npx next build --webpack`
  (also `next dev --webpack`), or `TURBOPACK_ROOT=<dir holding both> npx next
  build` for production parity; `next.config.ts` reads that env var and is inert
  without it. CI builds with Turbopack, the bundler Vercel uses, because that is
  the only gate that catches a bundler-only break before a deploy does. CI's
  build output is a TEST artifact and is never promoted: it is built with dummy
  `NEXT_PUBLIC_*` values, which Next inlines into the client JS, so a
  `vercel deploy --prebuilt` of it would ship a bundle pointing at localhost.
  Vercel builds its own.
- **`next.config.ts` declares no redirects.** Config-level redirects run BEFORE
  `proxy.ts`, which is what routes the apex between the marketing site and the
  app by host. A redirect added here silently wins over that routing; send it
  through the proxy instead.
- **Insights belong to videos, not runs (incremental Pass A, 2026-08-17).**
  `videos.analyzed_run_id` names the run whose `audience_insights` /
  `language_samples` rows are a video's current analysis. Population reads
  ("all current insights") go through the `audience_insights_current` /
  `language_samples_current` views — never `audience_insights … eq('run_id')`
  (that means "produced by this run", which is only what
  `keyword-attribution.ts` wants). Id-set lookups (by `audience_insight_id`)
  stay on the base tables so they resolve rows an in-flight run has superseded
  but not yet pruned. A Pass A prompt-version bump re-reads the whole corpus
  on the next run — that is the cost of a change, budget for it.
  **Cited evidence is retained past re-analysis** (2026-09-18): the
  `prune-stale-analysis` step deletes a superseded row only when nothing stored
  points at it, so an id-set lookup keeps resolving past the next run and not
  only during it. FOUR citation classes are protected, resolved in
  `citedEvidenceIds` (`lib/pipeline/stale-analysis.ts` since deploy 5b) and enforced by the
  optional third argument to `staleInsightIds` (`lib/pipeline/pass-a-plan.ts`,
  where the tests are):
  **recommendations** — `based_on.insight_ids` through BOTH `market_insights`
  and `competitive_insights` (it mixes M# and C# ids) to
  `evidence.supporting_theme_ids`; **plan checks** — `insightIds` on the claims
  of `plan_checks` AND `plan_check_evaluations`, because `currentReading` prints
  the newest evaluation and falls back to the upload's; **saved Ask answers** —
  `agent_messages.result.grounded[].insightIds`, which stores ids and never
  quote text, so a reopened thread resolves its words through `insight_evidence`
  off exactly those rows; and **frozen exports** —
  `report_snapshots.evidence_ids`, where `e:<insight_evidence.id>` resolves back
  to its `audience_insights` row and `p:<language_samples.id>` IS one of these
  rows (the only citation path `language_samples` has). **Three further paths are
  deliberately NOT protected, and that is a judgement, not an omission:**
  `theme_observations.member_insight_ids` (a fifth id-exact path, walked by
  `monthly_theme_readings`) is left unprotected because a run's themes name most
  of its corpus and protecting them would retain nearly everything — which is
  why `member_video_ids` is the primary matching key and why that migration's
  own header writes down the share of member references already dangling; and
  `c:` / `v:` / `m:` refs name no row, so they cannot be protected by id — they
  resolve by SEARCHING `insight_evidence` for a live excerpt on that comment or
  video, which holds only IF a re-read produced evidence on that comment,
  possibly a different excerpt and sometimes none; and the remaining ref kinds —
  `k:` (`video_claims`), `t:` (`videos.ocr_text`, Block D wave 2), `h:` (a hero
  row) and `b:` (`run_summary`) — read tables this step never deletes from.
  Those three arms plus the protected `e:` / `p:` name EVERY ref kind
  `quotes-freeze.ts` defines, which is the point of writing them down: **a new
  ref kind joins the third arm or a protected class, never neither**, because a
  kind named in no arm reads as an oversight whether or not it is one. Adding a
  fifth protected class means re-opening that list here, not appending a set
  union to the step.
  The set loads before the first delete, so the step fails closed — and a read
  that fails deletes nothing, on that run and every later one, until it is
  fixed. This is a different thing from the retention
  cron (`inngest/functions/retention.ts`), which drops raw payloads and AI-call
  bodies past 30 days, the regate's backup copies (`regate_backup`, whole
  batches, step `purge-regate-backup`, migration `20261106094000`) past 30
  days, and refreshes-or-deletes YouTube only; nothing analytical
  is deleted on any other platform, which is what the notice says.
- **Theme identity lives in `theme_registry`.** `themes.id` is a per-run row id
  (the table is fully replaced each run) and must NEVER be used as a cross-run
  key; `themes.registry_id` is the stable identity, and cross-run joins use it.
  Do not join themes by `label` — labels churn ~88% run to run because a
  reasoning model writes them and reasoning models take no temperature.
- **A period is dated by the comment, never by the run.** `run_id` / `run_date`
  are a run's own bookkeeping and are never a period key outside `run_summary`
  (`theme_observations.run_date` is the wall clock at persist — one run has
  carried two dates). The series is per calendar month by `comments.comment_date`
  through `lib/reading/monthly.ts` into `month_denominators` /
  `month_theme_readings` — which exist once `20260915092000_monthly_reading.sql`
  is applied AND the tables are seeded, not before; a fresh database has the
  code and no rows, and every reader has to survive that. (Production: applied
  and seeded on both tenants 2026-09-15; counts live in the status notes and in
  the database, never here.) A month is `filling` until 30 days after it ends and `frozen` after;
  a frozen row is never rewritten — a BEFORE UPDATE trigger per table
  (`month_denominators_frozen_guard`, `month_theme_readings_frozen_guard`, both
  running `month_reading_frozen_guard()`) refuses it, so a late-discovered video
  shows as accrual and no artefact is silently corrected. Two limits come with that, and a reader has to
  carry them: months freeze under whatever clustering was current when each
  passed its line, so rows of different months may carry different `run_id`s and
  a cross-month comparison is like-for-like only where `run_id` is equal; and
  `audience` is a NAME (`competitor:<competitor_name>`, free text from Settings),
  so renaming a rival splits its series — the frozen months stay under the old
  string and cannot be re-keyed. The one month in this product that is NOT the
  comment's is a **budget**: Ask's `ASK_MONTHLY_CAP` counts a workspace's
  questions over the calendar month on the WALL CLOCK (`monthStartIso` in
  `lib/ask/quota.ts`, deliberately eight lines rather than an import of
  `lib/reading/monthly.ts`). A spend limit is dated by the day the money is
  spent; sharing a clock between the two would date a bill by when a stranger
  wrote a comment.
- **A reader reads the series; it never sums videos across months.** Every
  Phase 1 surface goes through `lib/reading` — `loadMonthSeries` /
  `loadWindowReading` (`lib/reading/read.ts`) off `Scope.reading`, which is a
  REQUIRED field so a loader cannot quietly not have one. Re-deriving a period
  figure by counting `videos` or `audience_insights` over a date span is the
  bug the whole layer exists to stop: it silently mixes clusterings, ignores
  the freeze, and answers a question about our gather cadence dressed as a
  question about the conversation. A window read that spans months is
  `window_denominators` / `window_theme_readings` (M3) — the month bodies minus
  the month GROUP BY — not a sum of month rows, because denominators do not add.
- **Three guards on the six month tables, not one.** Each of
  `month_denominators`, `month_theme_readings`, `month_subject_readings`,
  `month_kind_readings`, `month_audience_stats` and `month_evidence_refs`
  carries `_frozen_guard` (BEFORE UPDATE — a frozen row is never rewritten),
  `_frozen_insert_guard` (BEFORE INSERT — no NEW row may appear behind a closed
  audience-month; the denominator's `status = 'frozen'` is the commit marker,
  and closed is closed even to the transaction that closed it) and
  `_delete_guard` (BEFORE DELETE WHEN `old.status = 'frozen'`). The delete
  guard's one exception is the workspace going away: during the `clients`
  cascade the parent row is already gone, which is how it tells "this tenant is
  being removed" from "this record is being erased" without trusting the
  caller. It exists because `month_theme_readings` cascades from
  `theme_registry` and one merge there would have taken 2,957 frozen rows.
  The insert guard has exactly ONE opening for a NEW row — decision K's arm,
  which accepts the FIRST back-read of an audience-month that closed before the
  table existed. That is a one-shot, and the seed below is what spends it. It
  has a second `return new` and that one is not an opening: an
  `insert … on conflict do update` fires BEFORE INSERT before it detects the
  conflict, so a row whose primary key already exists arrives looking like an
  insert and is let through to the DO UPDATE path, where the UPDATE guard
  judges it as it always has. **Do not delete that arm's transaction-local
  marker** (`verbatim.month_reading_refreshed`): a refreshed row carries this
  transaction's `xmin`, so without the marker decision K's arm can no longer
  see that the audience-month was already held, and a brand-new key later in
  the same statement slips in behind the freeze.
- **The seed/freeze discipline is an order, and out of order the loss is
  permanent.** `scripts/monthly-reading.ts --write` is the only thing that will
  ever give the 201 already-frozen audience-months their subject rows and their
  evidence ids; `freeze-months` visits filling months only and never revisits a
  frozen one. The order the script pins in its own header:
  **(1)** every subject NAMED and CONFIRMED in Settings (`activateSubject` —
  `loadActiveSubjects` filters `status = 'active'`, so a proposed subject
  measures nothing); **(2)** `scripts/subject-membership.ts --client <uuid>
  --apply`, to completion (and it refuses below 95% embedding coverage, because
  an unembedded insight is invisible to `subject_band()` and the subject then
  reads WRONG rather than low); **(3)** then `monthly-reading.ts --write`, ONCE.
  `backReadBlockers` (`lib/subjects/read.ts`) asks first and, when the answer is
  no, writes the denominators and themes and leaves the subject side UNSPENT —
  which keeps the shot. `--force-subjects` overrides it, for an operator who
  means it. A subject named after the seed has no history and cannot be given
  one.
- **`competitors` is rival identity; a rename is ONE logged operation.**
  `tracking_configs.competitor_names` is the tracked LIST; `competitors`
  (M1) is the identity, with `first_seen_at`, `retired_at` and `superseded_by`.
  `renameRival` (`lib/rivals.ts`) is a single `rename_rival` RPC that moves the
  name, rewrites the tracked list and handles, and writes the `config_changes`
  row carrying both names — never a Settings edit plus a hand UPDATE. It does
  NOT re-key a frozen month and cannot: `audience` is in the primary key and
  the frozen guard refuses the UPDATE. The old months stay under the old string
  and `stitchRenames` draws one line with the break marked. `retireRival` sets
  `retired_at` and never deletes, because a frozen month keyed on the name
  still has to render.
- **Every movement claim is a `Verdict`** (`lib/reading/verdicts.ts`) — one
  shape replacing five incompatible direction vocabularies, carrying both
  sides' k and n, the change and the band beside the word, so the claim is
  checkable. `state` is a token, never copy (the sentence is assigned in
  `lib/calibration.ts` and by the surface). `direction` is NOT derived from
  `state`: a single banded comparison can never earn a direction word, and only
  `directionWord` (`lib/reading/bands.ts`) fills it, from three consecutive
  readings inside one clustering regime. `refused` is a real answer — the
  number exists and saying it moved would be a claim about our bookkeeping
  (`unlogged_era` · `tracking_change` · `clustering_changed` · `rename`).
- **Two scrubbers, one loop** (`lib/prose/scrub.ts`, `PROSE_POLICY`). A digit
  the model typed drops its SENTENCE whole, never the word — a word-delete
  leaves the leak on the page and the evidence in `ai_call_log`; a figure a
  sentence may name is a `[[key]]` the caller's table holds and render
  substitutes. A direction word for an object nothing earned a verdict for
  drops its sentence on the same rule. Neither rule reaches inside a quotation:
  words in quotation marks are the speaker's (41% of stored quotes are
  non-ASCII, and the magnitude strip already ate `vast` out of a Dutch "dat
  staat vast"). A NUMBER inside a quotation is still refused — which is why a
  quote in the new slots is a sibling node with its own ref, never a span
  inside scrubbed prose. Which rules a slot gets is the policy table's answer,
  not whichever file happened to import which helper. The written read's slot
  is `week_read` (`both`, run with NO verdicts, so any direction word drops
  its sentence; `lib/written/scrub.ts`), and it adds a third rule of its own:
  a sentence about how the read was made (searches, data, coverage, sources,
  updates, the tool, "this report", why something cannot be said) drops too,
  on `BANNED_PHRASES`, which a guard over the client surfaces reuses. Since
  `week_read_v3` (the read is a report: the week in one line, what happened,
  what it means, new this week, worth watching, then the findings) a fourth
  rule holds in the report's implications and watch lines only: advice and
  forecasts drop their sentence (`ADVICE`, `FORECAST`, `toldWhatToDo`), which
  are NOT safe on market prose and are not reused by the guard.
- **A block renders three modes.** `render(data, mode, ctx)` for
  `app | print | email`, plus `figures()` / `verdicts()` / `quotes()` /
  `emptyState()` (`lib/blocks/types.ts`). There is exactly ONE `RenderMode` in
  the codebase and both spines import it. A renderable is read as
  `renderables[k]?.render` — a missing key is an empty tile, not a crash. An
  arranged artefact (weekly, monthly, quarterly) is a `report_snapshots` row of
  kind `report` whose `data.kind` names the artefact, composed over block keys;
  key collisions across the three registries are zero and must stay zero.
- **There are TWO `FigureTable`s on purpose, and one crossing.**
  `lib/reading/verdicts.ts` holds a figure as MEASURED
  (`{ value: 3.4, unit: 'pct', label }`) because a band, a comparison and a
  chart axis need the number; `lib/reports/types.ts` holds it as PRINTED
  (`{ label, value: '3.4%', kind }`) because a cover, a document and an
  interpretation substitute a rendered string and must not each decide how a
  percentage reads. `lib/prose/figures.ts` `proseFigures` is the ONE
  conversion — do not unify the types and do not write a second conversion;
  three hand-rolled ones is how "3.4%", "3%" and "3.4 pct" reach one product.
- **This week prints nothing computed over a week alone.** It is the one
  surface dated by the DELIVERY rather than the month, so every count it states
  against the run's own frozen `[window_start, window_end)` is stated again as
  a contribution to the month it falls in ("this update's contribution to
  September so far: 205 of 449"). That second half is what stops a reader
  treating a week as a period, and it is not optional decoration. The window
  comes off the run row (`rowWindow`), never from the clock — a run with no
  window says so, and Sealand's newest update covers thirty days, not seven.
  The one exception is decision M's same-age weekly line (`lib/reading/week-line.ts`,
  WP3.13): each week's market share, read once at two updates old, kept in
  `week_line_reads` / `week_line_points` and compared only with a week read
  the same way, is the one reading computed over a week, and it prints only
  where `WEEK_LINE.print` says so.
- **New reading surfaces say "videos".** `conversations` keeps its meaning and
  its name on the legacy pages that still compute it (`lib/calibration.ts`
  GLOSSARY); a new surface counts videos, and a level without its "of N" is a
  score, which this product does not show. **A new surface draws its vocabulary
  from `THIRTEEN_WORDS` plus the two `READER_FLAGS`** (`lib/calibration.ts`) and
  prints no term outside them — that is a WORD LIST, and it is not the ladders:
  `SENTIMENT_LADDER` and the evidence ladder above it are cutoffs that decide
  which word a measurement earns. The rest of GLOSSARY is legacy, kept because
  the pages that print those words have not retired yet.
- **Every configuration write carries an actor.** `tracking_configs` UPDATEs go
  through `updateWithActor` / `withActor` (`lib/config-log.ts`) so the
  `tracking_configs_audit` trigger logs a person instead of a role; surfaces the
  trigger cannot see (schedules, subjects, an entity re-tag, a re-gate) call
  `recordConfigChange(s)`. Operator scripts pass `scriptActor('<the command>')`,
  the pipeline `pipelineActor(runId, …)`; hand-run SQL is caught by the trigger
  alone. A browser's stamp is never taken on trust — kind, user and label come
  from identity, and `operator` survives only for a `platform_admins` row.
- **The Supabase client is untyped** (no `Database` generic). Reads past 1000
  rows must use `selectAll` (`lib/supabase-admin.ts`) — a bare `.select()`
  silently caps at 1000.
- **Never read `audience_insights.embedding` in bulk — count the PREDICATE,
  never the column.** It is a 1536-float vector on the corpus's largest table,
  so `count(embedding)` or `select embedding` across a tenant materialises
  every vector (tens of megabytes a scan) where the question was only ever
  "how many are not null". On 2026-09-16 one such probe ran 56 s at 08:40 UTC
  and 94 s at 09:10 UTC; on top of a morning of window-function timing loops it
  exhausted the instance's disk-IO burst budget, PostgREST could not load its
  schema cache, GoTrue answered 504, and the live app was down for paying
  customers for about two hours. A restart does not refill an IO budget — time
  does, or a larger compute tier. The measure everything actually gates on is a
  predicate count: `.select('id', { count: 'exact', head: true })
  .not('embedding', 'is', null)` (both in `lib/agent/retrieve.ts`:
  `embeddingCoverage` counts over `audience_insights_current` and is the one
  `subject-membership` refuses below 95% on; `embeddedInsightCount` counts the
  base table and is the is-it-zero guard in the answering path),
  or in SQL `count(*) filter (where embedding is not null)`. **`embedded_at is
  not null` is NOT that measure**: the column arrived 2026-09-15 and is never
  backfilled, so every vector written before it reads as unembedded — it
  answers "when was the last vector written", never "how much of the corpus is
  embedded". **The rule is about `audience_insights.embedding` in
  particular**: that table's vectors are reached through the RPCs
  (`set_insight_embeddings`, `match_insights`), which filter server-side, and
  are never bulk-selected or counted from application code. One bounded
  id-set read exists and is not bulk: the written read's quote fit
  (`lib/written/fit.ts`) selects `id, embedding` on the base table for at most
  `FIT_MAX_INSIGHTS` (120) option insights by id, a few dozen in practice,
  never a scan and never a count.
  `themes.embedding` and `theme_registry.embedding` are a different case and
  ARE read directly today — `lib/pipeline/themes.ts` (one run's themes, and
  the whole tenant's registry), `lib/ask/engine.ts`,
  `lib/reports/documents/signals.ts`, `scripts/citation-floor.ts` — because
  those tables are two orders of magnitude smaller than `audience_insights`,
  so even a whole-tenant registry read is a few megabytes and not seventy-five.
  Treat that as the shape of the rule, not as a closed list: before you
  "fix" a vector read you have found, check which table it is on and how many
  rows it bounds, and count the predicate rather than the column either way.
- **The fail-open admissions, and the regate that finished them** (the
  backfill, 1 Oct evening). Before the 24 Sep fix a relevance batch OpenAI
  refused kept its videos unjudged (`gate_verdicts.source = 'default'`), and a
  resurfaced video is never judged again. `market_week_volumes`' `unchecked`
  now reads the NEWEST verdict (migration `20261106091000`): a video is
  unchecked while that is the default or a drop. `scripts/backfill-platform.ts
  --regate --yes` (`lib/gather/rejudge.ts`, `scripts/backfill-regate.ts`)
  judges the market-lane ones with today's check, appends today's verdicts
  (`run_id` null; the default rows stay), and removes the ones it drops with
  `regate_videos` (migration `20261106092000`), which copies every row it
  takes (14 tables, embeddings included) into `regate_backup` first and logs
  ONE `gate_rule` / `relevance_gate` change (the fix's own shape, so the pair
  judge measures it, `lib/provenance/measure.ts`, instead of counting an
  unmeasured `regate` as a tenth); undo is `regate_restore(batch)`. A video
  something stored cites is kept and named; a person decides it with
  `--keep <ids> --yes`, which appends an `operator` verdict (kept; migration
  `20261106093000`), so the newest verdict is a clean keep, and logs ONE
  `gate_rule` / `relevance_gate` change of its own (`operatorKeepChange`). It
  takes only videos flagged unchecked (`newestUnchecked`, the same rule as the
  SQL) and refuses any other. Deletion, not exclusion: a video
  counts through sixteen SQL functions, two views, TypeScript readers and the
  pipeline's own re-reads, with no single place to exclude it.
  **The undo is a data undo, on purpose:** today's verdicts stay, so a
  restored video's newest verdict is a drop and it counts `unchecked`, which
  is the state it was in before (the fail-open default is unchecked too);
  keeping one is `--keep`. After a restore, refresh the reading month again
  (`freezeMonths`), and restore within 30 days: retention drops a batch then
  (`purge-regate-backup`), after which `regate_restore` says "no batch".
  **These rows are not method changes** (`isFailOpenFix`, now in
  `lib/reading/comparability.ts`; `changesFromLog` sets `failOpenFix` on a
  change whose every row is `gate_rule` / `relevance_gate`): neither the
  Dashboard's chart, the weekly bars (`weekRules`) nor the same-age line
  (`weekPairOf`'s gate reason) cuts at them; `unchecked` carries their
  videos (left out of the Dashboard's bars, counted against the line's 10%).
- **The week chart's cut and cadence** (the release fix, 1 Oct night; made
  precise 5 Oct; `weeksSinceOurChanges`, `lib/reading/weeks.ts`). The bars
  never span a change on `WEEK_CUT_SURFACES` (the same-age line's search and
  gate surfaces, rivals and handles included; a test pins them equal): a
  change cuts its own week and every week before it. **Except a change the
  pipeline made inside a run before that run's gather**: subreddit
  discovery's write (`discover-subreddits` runs before `plan-gather`; its
  probes store nothing), logged with `actor_kind` 'pipeline', one of
  `PRE_GATHER_ACTOR_LABELS` and that `run_id`. `changesFromLog` marks it
  `preGatherRunId` only when every row of the change is such a write of one
  run, and it then cuts only the weeks that BEGIN before every earlier gather
  ended (`preGatherCutBefore`: the later of the run's `window_start` and the
  finish of each run opened before the change, a later-resumed one bounded
  at the change itself), so the week the run gathered is drawn. It fails
  closed to the old rule unless the change was written inside the run it
  names (between its `window_end`, the opening a resume keeps, and its
  finish), and for a change written during a resume of the run (`started_at`
  more than a minute past `window_end`, the change at or after it: a resume
  that gathers again runs discovery again, after the run's own first gather
  under the old setting); a person's or a script's change, or a row with no
  run, keeps the old rule. `lib/reading/week-cuts.test.ts` pins the step order and the
  labels to the source. The bars draw only weeks on the one weekly cadence:
  exactly one completed Sunday gather in the week and in each of the two
  after (`chartCadenceBroken`, the line's own `cadenceBroken` on the clock;
  `loadCadenceRuns` reads every run, any status, with its window and its
  options). A partial run counts as a completed gather only when every
  recorded error is a step after the gather (`AFTER_GATHER_STEPS`, fail
  closed). **A run that gathered nothing is not counted at all** (Heinrich,
  5 Oct: "Why is the first bar on Sealand twenty eighth September when we've
  had earlier runs"): a fresh `skipGather` run (a rehearsal) plans no search
  and no own-posts census, so it moved no count in any week, and it is
  neither an extra update nor a missing one (`chartRunGatheredNothing`, the
  window anchor's `gatheredNothing` restated and pinned equal; the resume
  lever, `runId` naming the run itself in either case, is the gather it
  resumes and counts; a run read without its options counts, fail closed),
  and it settles no week either: its finish is not one of the two updates a
  week turns solid by, nor in a hover's "read by N updates"
  (`chartSettlingUpdates`, in `homeWeeks` and `weekVolumesBlock`; a page's
  latest update and the line's due dates read every finish). **The same-age line
  does not follow** (`weekCadence` in `keepWeekPoints` counts every run, so
  `cadenceBroken` on a kept read is unchanged): a kept read is never
  recomputed, so counting a new way would mix two rules under one
  `method_version`, and an analysis-only run re-runs classification and Pass
  A, which is what the line's shares read and the bars' counts do not. The
  two need not agree: the bars count, the line reads shares, and the line
  leaves the week of 21 Sep out by name (`WEEK_LINE_EXCLUDED`). **A bar never counts
  a video let in before we checked relevance** (`unchecked`, the newest
  verdict not a clean keep), and since 5 Oct one such video no longer blanks
  its week: every weekly-bar builder (the Dashboard's `homeWeeks`, Your
  market's and This week's `weekVolumesBlock`, and the regate preview) leaves
  those videos out of every count of their row before pooling (`checkedRows`:
  the row less the unchecked videos' own `unchecked_comments`,
  `unchecked_comments_next_month`, `unchecked_under_5` and
  `unchecked_older_videos`, migration `20261107090000`, which the operator
  applies; a restated week prints no median). Until it is applied the
  function returns none of them and the week is cut as before. The pages
  count and cut the same way, so none draws a week another cuts. The same-age line keeps its own rule (unchecked at 10% or
  more of either week's videos refuses a pair, `weekPairOf`): its points are
  read once at the cut and kept, never recomputed, so a kept read cannot drop
  them afterwards, and a share with under a tenth unchecked is what decision
  M accepted; the chart prints counts and can subtract exactly. On Sealand
  the week of 21 Sep holds three runs, the two 24 Sep rehearsals
  (`e80e9347`, `03180a33`, fresh `skipGather`: they gathered nothing) and
  the 27 Sep update `f3646446` (partial only for transcripts and the
  own-posts census), so it holds ONE counted update, and the 4 Oct update
  (`393b95df`, resumed with `runId` itself: the gather it resumes) holds the
  week after. `homeWeeks` over production's 5 Oct rows draws from 21 Sep
  (301 videos, 4,990 comments, none unchecked), then 28 Sep (266 videos and
  5,029 comments, one video unchecked with one comment, so 265 and 5,028
  drawn), both faint; Your market and This week draw the same two. The week
  of 14 Sep stays cut, by the 17 Sep search change (terms, rivals, handles)
  and by two runs in it (the failed 15 Sep resume and the 20 Sep update);
  every week before it by the 9, 13 and 17 Sep search changes. On Össur the 4
  Oct discovery row (run `555af400`) moved no active community (amputee,
  bionics, prosthetics before and after), so `movesActiveSet` never made it a
  change, and `homeWeeks` over production's 5 Oct rows draws 28 Sep (177
  videos, 3,217 comments) with or without the pre-gather rule, and with or
  without the rehearsal rule (no Össur run on the axis gathered nothing): the
  week of 21 Sep has no update in it (none ran between 13 Sep and 4 Oct), and
  14 Sep is cut by the 15 Sep handles change as well.
- **Production reads from agents are serialised and rationed.** Five agents
  reading production at once is what caused the outage above, so this is the
  fix and not caution. Before the first read of a session, `select 1` through
  the MCP, timed: over 3 s or an error means no production read for the next
  15 minutes — work from a local PG 17 cluster and fixtures and retry later.
  Then: ONE query in flight at a time, never a loop, never a repeated loader
  run "to measure", never `EXPLAIN ANALYZE` of the window functions; about
  twenty small, targeted queries per work package, counted in its status note;
  a page is rendered against production once per tenant per surface, not once
  per iteration. `scripts/loader-dump.ts` and `scripts/reading-timing.ts` ARE
  read loops and carry the ration in their own flags (`--confirm`, a probe
  first, `--max-loads`) — one of them at a time and never beside another
  reader. **SQL and PostgREST are separate paths and either can be down
  alone**: measured 2026-09-16 at 15:12 and 15:16 SAST, `select 1` through the
  MCP returned while every `createAdminClient` read failed with `Could not
  query the database for the schema cache` — so a green MCP query proves
  nothing about whether an operator script can run. Check both, and say which
  one you checked.
- **Client-facing copy is calibrated**: no pipeline jargon (T#, Pass C, run),
  no raw scores; "comments" vs "conversations" have fixed meanings
  (`lib/calibration.ts` GLOSSARY). Copy claims about behavior must match the
  code (a page once claimed "no email is sent" while Resend sent).
- **No direction word on the run-indexed series** (`directionWordsFor(reader)`
  in `lib/config.ts`; all seven readers went false on 2026-09-15 and **exactly
  one is true today — `agent.movement`**, flipped by WP21 when Ask's movement
  block stopped reading `theme_observations` and started reading the
  comment-dated months through `lib/agent/movement.ts`. That is what a flip
  means: a key turns true the day the surface it names re-bases on the monthly
  reading, never as a re-wording, and `lib/config.test.ts` pins the re-based
  list so a second `true` has to be argued for in a diff). Gaining /
  fading / New compares two readings of one cumulative corpus taken at two
  arbitrary moments, not two periods — a missed week moves the number as much
  as the conversation does. One flag PER READER (`voice.movers`,
  `dashboard.themes`, `documents.trajectory`, `agent.movement`, `initiatives`,
  `competitive.deltas`, `profile.mix`) so a reader flips the day its own series
  is re-based on the monthly reading and not before; never read the map
  (`DIRECTION_WORDS_BY_READER`) directly. Phase 0's boolean of the SAME name,
  `RUN_INDEXED_DIRECTION_WORDS`, is deliberately gone rather than renamed in
  place: a `RUN_INDEXED_DIRECTION_WORDS ? … : …` merged in from an older branch
  must fail to compile, not read an always-truthy object and turn all seven
  readers on. Gated branches read the flag instead of deleting the code and gated
  pure functions take it as an argument, so both answers stay tested. A CHART is
  a direction claim too — `profile.mix` gates a line across `run_date` that
  printed no direction word at all. Levels are untouched, as is any period
  reading with an n and a band (the digest's sentiment and share verdicts).
  The same-age weekly line never carries one either: a pair of weeks read the
  same way gets `bandVerdict` with `SHARE_BAND` and nothing more, and nothing
  calls `directionWord` over weeks (`lib/reading/week-line.ts`, WP3.13).
- **Costs are real**: gather scripts spend Apify money; synthesis calls spend
  OpenAI. Prefer inspectors/dry-run flags (`run-relevance.ts`, `--no-merge`,
  send-report's default preview) when iterating.
- `.env.local` holds real production credentials — never commit it, never
  print its values into logs or command output.
- **Exports and reports freeze numbers, never words.** A snapshot
  (`report_snapshots.data`) holds tile-ready data with every quote as a ref
  (`lib/renderables/quotes-freeze.ts`) and `text: ''`; the words resolve at
  render. Nothing under `lib/reports/` may store or send to a model a
  comment's text — the cover prompt gets figure KEYS and validated brief
  prose only. A share link (`/r/<token>`) reads the link, its snapshot and
  the quote texts — never a tenant table live. A scheduled send
  (`report_sends`) stores subject, recipients and ids — never the email body;
  "the email as sent" re-renders from the snapshot. `weekly_reports` is
  legacy (read-only, stored HTML) and gets no new rows.
- **The weekly read (`weekly_read`, "This week in your market") sends only a
  READY read.** The artefact is the email of the run's stored `week_reads` row
  (`lib/reports/weekly-read-build.ts`): one body for the email, the share page,
  the viewer and the A4 PDF (`components/email/weekly-read.tsx`), quotes as
  refs, `sent_figures` none. A run whose read is thin, failed, missing or empty
  sends NOTHING: the send is `skipped` and the operator is alerted
  (`weekReadSendState`, `runSchedule`). **A READY read is built on EVERY
  finished run and goes in the client's past issues at once** (5 Oct;
  Heinrich: "a finished run reaches the platform by itself; review holds ONLY
  the email"): the pipeline emits `report/send.requested` after every run, a
  manual one's marked `manual`; `reportTargets` (`lib/schedules/due.ts`) fires
  a scheduled run's due schedules as before, plus any active weekly-read
  schedule not due, and a manual run's active weekly-read schedules ALONE
  (none at all for a TEST run, `isTestRun`: a rehearsal that gathered
  nothing, a capped `videoLimit` / `maxVideos` run, or `options.publish:
  false`; a real manual run such as Össur's `555af400` publishes), both of
  those with `noEmail` (nothing else starts: not a legacy digest, the
  monthly or a brief, and `runSchedule` refuses any non-weekly-read schedule
  under `noEmail` before it claims). `weeklyReadPath`
  (`lib/schedules/claim.ts`) says who is emailed: `send` (review off, a list:
  the list), `review` (review on, a list: the review email, the list waits
  for Send) or `hold` (`noEmail`, or nobody on the list: nobody at all, which
  is how Össur's schedule with no recipients still gets its issue); EVERY path
  stands the build `ready` and `publishSend`s it, with the pipeline as actor
  (`pipelineActor`; Send now passes the operator, the scripts
  `scriptActor`), before any email: the review email then says it is in the
  past issues (`inPastIssues`), and `send` emails the list through
  `deliverSend` (its CAS on `ready`), so a refused email leaves the read on
  the platform, `ready` with the reason, for Send (no automatic re-send). Idempotent on the (schedule, run) claim: a retried
  `send:<scheduleId>` step finds the row `ready` (`waiting`) and only
  publishes it, a no-op once it is there, so there is never a second build or
  review email; a publish that is refused answers 500 with one
  `unpublished` alert, and the retry publishes. Every other schedule still
  skips with "no recipients". A review schedule's email goes to the
  OPERATOR (`ALERT_EMAIL`), not the members, wherever the Studio is hidden from
  the tenant or its sending is locked (`reviewAudience`,
  `lib/schedules/members.ts`), and a build that has not gone out is readable
  by its reviewer alone (`lib/reports/held.ts`). A week that STARTS in one
  month and ends in the next is restated against the month it started in,
  in full ("16 in September", "September in total"), never "October so far";
  a week inside one month, against that month so far (`readingMonthOf`,
  `lib/written/month.ts`). Offline preview of a stored read:
  `scripts/weekly-read-email.ts`.
- **The pages and navigation (pages build, 1 Oct).** Every client page is
  drawn to its approved artboard (`Page-*.dc.html`); a deviation is Heinrich's
  call, never a builder's. What the build fixed in place:
  - **Navigation** (`lib/nav.ts`): ten surfaces in four unlabelled groups. The
    Dashboard is `/dashboard` (nav key `home`, NO page key: page key
    `dashboard` names the legacy module that stored snapshots and Össur's
    digest still render); Your market is `/dashboard/overview` (page key
    `overview`), and `/dashboard?month=` lands there (`frontRedirect`). A
    `revalidatePath('/dashboard')` revalidates `/dashboard/overview` too.
    Brands is labelled Competitive and Ask is labelled Agent; keys and
    routes are unchanged. Parked pages leave clients through
    `TENANT_RETIRED` / `tenantAway` (the operator keeps them); Reports
    redirects into the Studio with its query (`?group=sent&item=`, `?view=`).
  - **Studio** is shown to clients (`STUDIO_TENANT_VISIBLE`), but who reviews
    a build is ONE separate switch, `STUDIO_TENANT_REVIEWS` (false):
    `reviewAudience` and `mayReadHeld` read it, so a held build stays the
    operator's (B1). Building, composing, sending and the dry preview are the
    operator's on the server too (`mayBuildReports` in
    `/api/reports/[id]/build`, `/sections`, `/api/schedules/[id]/send` in
    every mode, and the preview without `?send=`); a client reads sent issues.
    A held build is closed to a tenant's session in the database as well:
    `report_snapshots`' one SELECT policy hides a snapshot a send carries
    until some send carrying it is `sent` (the `heldOf` rule), except to a
    platform admin (migration `20261105091000_held_snapshots_rls.sql`,
    checked by `scripts/pg-shim/held-snapshots-checks.sql`). The Recipients
    editor never arms a schedule for a tenant: a tenant's save keeps a
    schedule as it is and never switches one on or creates one switched on,
    and every row it creates is born with `review` on; arming is the
    operator's (`updateArtefactRecipients`, fresh review H1).
    Settings' tabs are What you track, Team and Billing (Readiness, The record
    and How to read are the operator's); Log out sits in its bar.
  - **The published read** (`lib/written/published.ts`): the ONLY way a page
    reads `week_reads`. A page prints the newest READY read as soon as the run
    writes it, whatever its schedule or its send (Heinrich, 5 Oct: "This
    should be happening by itself when everything runs"). **Review holds the
    EMAIL only**: the review email (`reviewAudience`), Send in the Studio and
    the held snapshot (`mayReadHeld` / `heldOf`, `report_snapshots`' RLS
    policy) belong to the email build and wait for Send; the pages never do.
    Until 5 Oct they waited too (under an active `weekly_read` schedule with
    review on, a page printed only a read whose send was on the platform), so
    Sealand's 4 Oct run never reached its pages and Össur, reviewed with no
    recipients, printed nothing. The ISSUE no longer waits either: every
    weekly read the runner builds is published at once (below). It fails closed: a `week_reads` read that
    fails throws, and the page loses only that block. This week, the
    Dashboard, the Subjects pane and Your market's subject sentences read the
    week read through it, and Your market's long-run read comes through
    `loadPublishedLongRun`; `lib/written/published.test.ts` pins every one,
    and pins that the selector reads no schedule and no send. A weekly read's
    review email says the read is on the platform already and Send emails the
    list (`readOnPlatform`); the run that closes a month also writes the
    long-run read, and that run's operator review email carries its title,
    lead, headlines and sentences under "Already on Your market"
    (`readyForReview`). The client's email is unchanged. **"On the platform"
    is about the ISSUE, not the pages** (the backfill, 1 Oct evening;
    migration `20261106090000_platform_publish.sql`): sent, or put there
    WITHOUT its email (`report_sends.published_at` and `published_by`,
    `lib/schedules/publish.ts`): by the runner for every weekly read it
    builds since 5 Oct (above, "The weekly read sends only a READY read"), and
    by the operator for a build held before then or whose publishing failed
    (the Studio's "Add to past issues (not emailed)" or
    `scripts/backfill-platform.ts --publish`).
    One rule, `onPlatform` (`lib/schedules/platform-state.ts`), read by
    `heldOf`, `report_snapshots`' RLS policy, the email preview
    (`/api/schedules/[id]/preview`), the Studio's past issues and the purge's
    "delivered" line (`lib/reports/purge.ts`: `drafts` keeps a published
    build, `all` refuses one) alike; wherever "sent" means visible or kept, it
    means this. It is a recorded state, never a `sent` row with no
    recipients: the status stays `ready`, so Send still emails it, and the
    operator's workbench says "On the platform · not emailed". A client's
    Past issues print the day it was published, like any issue, and never how
    it got there (§0a.1). Publishing BY HAND is the operator's alone
    (`mayBuildReports` on `/api/schedules/[id]/publish`). A long-run read
    written before its month closed carries `partialThrough` and does not
    stand as the month's (`standsAsMonthRead`), so the month-closing run
    still writes the full one. A read's facts worded against a month say "this
    month" only while the read's month is the calendar month, and its name
    otherwise (`monthPhrase`: This week's context line, the Dashboard's
    Subjects tile; fresh review B2).
  - **Who talk is about** (`lib/brands/attribution.ts`): one rule (a tracked
    brand named in the item's own counted comments, else the audience; one
    brand per video; never a guess), one order (the client, rivals by
    videos, the market last; a kind's split prints most first), one wording
    (`marketLabels`). The kind words are `talkKindLabel`
    (`lib/pages/overview-market/kinds.ts`). Every page title is the shared
    `PageBar` (26px on 40px).
  - **Legacy modules stay registered, never routed**: `OverviewPage`,
    `WeekPage` / `WEEK_BLOCKS`, the subjects module, `COMPETITIVE_BLOCKS`,
    `MARKET_BLOCKS` / `MarketSurfacePage` and the six `voice.*` blocks render
    stored snapshots, exports and the monthly. A block leaves a page's list,
    not the registry.
  - **Per page.** Dashboard: `loadHome`, one wave of light reads; Week by
    week draws from ONE clean week, the first the DATA shows, never a
    constant (`homeAxis`: the last eight weeks; `weeksSinceOurChanges` cuts at
    the latest search or relevance change on them, a pipeline change made
    before its run's gather at that run, at weeks off the cadence (a run that
    gathered nothing not counted) and at weeks with nothing gathered;
    a bar counts checked videos only, `checkedRows`), a filling week faint;
    a drawn week's numbers (the week, its videos and comments, "still
    filling" where faint) show on hover, on keyboard focus and on a tap, off
    the column itself (`homeWeekDetail`, the client leaf `HomeWeeksPlot`),
    with the weekly bars' card and the same behaviour as Your market's and
    This week's (`useWeekTip`, `WEEK_TIP_CARD`, components/charts/week-tip.tsx;
    their cards and panel say "still filling" too, `STILL_FILLING`);
    the two fail-open fixes (`gate_rule` / `relevance_gate`: the 24 Sep fix
    and the backfill's regate) cut no week, because `unchecked` counts
    exactly their videos (`isFailOpenFix`). The Competitive tile's row is "Named most in
    {Month}" off Competitive's own brand list (`loadBrandList`, the page's
    reader and `brandList`, over the page's reading month); no week reading
    of who was named exists, so never "this week", and nothing says what
    brands are "compared on", so that row is not drawn. Your market: the
    PUBLISHED `kind = 'month'` long-run read (`data.kind = 'longrun'`,
    `scripts/longrun-read.ts`, through `loadPublishedLongRun`), then
    standing, the top five conversations and the kinds. This week: the published read in full, with additive
    `monthVideoIds` / `alsoHeard` (a read stored before them prints no brand
    line and no Also heard). Subjects: the editor moved in
    (`/dashboard/settings/subjects` redirects), and the pane's lines come from
    the read's additive `standing[].contents`. Your moves: Your statements
    (`client_statements` / `client_statement_readings`, migration
    `20261105090000`; gloss, band at the subjects' 0.40/0.60, judge, stance),
    re-measured inside `ask-reevaluate` (so only where `CONSUMER_PROFILE` is
    on) on a clock from that step's start; `match_insights` is approximate
    (HNSW), so a complete band is `statement_band()`, never it. Deploy order:
    migration, `scripts/statements-seed.ts --write`,
    `scripts/statements.ts --client … --write`, re-register Inngest. **Your statements is HELD FROM TENANTS** until Heinrich decides
    (open ruling #7): `STATEMENTS_TENANT_VISIBLE` is false
    (`lib/statements/visibility.ts`, `maySeeStatements`), so a tenant's Your
    moves reads no statement and draws neither the section nor the add form,
    and the add, edit and remove actions refuse a tenant's session before
    anything is written, so nothing is measured on a tenant's behalf. The
    operator sees and uses it as built, on any workspace they view. Opening
    it to clients is that one constant.
  - **A page that throws keeps the shell**: `app/dashboard/error.tsx` draws
    one calm line and Try again (`unstable_retry`) inside the sidebar, and
    This week loses only its read to a failed `week_reads` read (logged),
    as the Dashboard, Subjects and Your market lose only their block.
  - **Dead after the build, not deleted** (one cleanup commit wants them):
    `components/sidebar-tenant-loader.tsx`; the old Settings forms
    (`app/dashboard/settings/{tracking-form,term-performance,config-shapes,rival-rename}`,
    most of `components/settings/tracking/*`, the What-we-read loaders in
    `lib/settings/*`); `StarterCards`, `AskIndexColumns`, `loadAskFront`,
    `lib/agent/starters.ts`.
- **Rendering never runs inside an Inngest step.** Chromium (PDF, PNG) and
  the email body are produced in route handlers (`/api/export`,
  `/api/reports/[id]/build`, `/api/admin/schedules/run`, `/api/schedules/*`,
  `/api/admin/documents/render`); an Inngest function only `fetch`es them,
  one step per schedule or build (`build-document`'s own steps are model
  calls and a snapshot insert, nothing else). The account
  has a hard 5-slot concurrency shared with the pipeline. `react-dom/server`
  cannot be imported statically in an app route (Next compiles it in the RSC
  layer) — `lib/email/render-html.ts` loads it at runtime; new browser or
  email routes need their `outputFileTracingIncludes` entry.
