<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Repo rules

- **Verify claims against code and DB, not docs or notes.** Shipped-state
  comments and older docs drift; the code is the record.
- **Schema changes are migration files, never live SQL on prod.** There is no
  local Supabase stack, and the Supabase MCP points at the real projects. Write
  `supabase/migrations/<timestamp>_<name>.sql`, test it on the staging branch
  (`phase1-staging`), then apply it to prod. The `supabase` agent skill's
  advice to iterate with `execute_sql` / `supabase db query` assumes a local
  database — never follow it against prod (`mkwjlckescdveosvrvaq`).
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
  other run returns at once, decided from the run's own window (the
  pipeline's `runWindow`) before any read, so it never alerts. A TEST run
  (`isTestRun`) that closes a month writes nothing and alerts once with the
  script: test runs never publish. Same contract as the week's: a transient failure
  before the last attempt throws for Inngest to retry; otherwise the body
  never throws, its model calls are capped on its own clock, and a failure
  stores a `failed` row and alerts once with the script
  (`scripts/longrun-read.ts`), because no later run writes an ended month. It was a hook inside
  `write-week-read` on the market branch and moved out because the two reads
  overran one step's 250 s (since Design v2, `write-post-ideas` sits between
  the two). **The month's briefs (T8 wired, 5 Oct) add five,
  after `write-longrun-read` and immediately before `close-run`, in this
  order:** `plan-briefs`, `briefs:research-${i}-of-${n}`, `briefs:ideas`,
  `briefs:write-${role}`, `briefs:compose` (66 ids before, 71 after;
  `scripts/pipeline-step-ids.sh origin/main --expect-before close-run briefs`
  is the check, and `lib/reports/briefs/step.test.ts` pins them; the bullet
  "The monthly department briefs" below says what they do). **Design v2 (the
  depth plan, 13 Oct) adds three, 71 ids before and 74 after** (the
  script's count, `request-report` included; `grep -c '\.run('` gives 70 and
  73): `scripts/pipeline-step-ids.sh origin/main` (or `0d77e537`, the depth
  branch's base) lists three pure insertions, zero removals, zero
  reorderings. Each family's `--expect-before` passes only from a base that
  already holds the other family, because the other's insertion reads as
  "inserted elsewhere": `scripts/pipeline-step-ids.sh 23c4e424
  --expect-before write-longrun-read write-post-ideas` (`23c4e424` is
  `depth/t11-products`) and `scripts/pipeline-step-ids.sh b18dbc1a
  --expect-before freeze-months plan-product-readings product-readings`
  (`b18dbc1a` is `depth/t13-ideas`).
  **The week's post ideas (T13) add one, immediately after `write-week-read`
  and before `write-longrun-read`:** `write-post-ideas`
  (`lib/post-ideas/step.test.ts` pins its neighbours, the total, its `.catch`
  and its place in `AFTER_GATHER_STEPS`). *What it writes:* up to three
  `post_ideas` rows, upserted on (run_id, rank) (`lib/post-ideas/step.ts`
  `runPostIdeasStep`). *The window it reads* (Heinrich, 13 Oct evening):
  the ideas still refresh on every run, but they read the question comments
  of the FOUR WEEKS ending at the run's window end, `ideasReadWindow`
  (`lib/post-ideas/select.ts`, `POST_IDEAS_READ_DAYS` = 28; never the clock,
  never past the run's end), one week having given one idea a tenant under
  the floor. It is one `window_theme_readings` read over those 28 days under
  the run's clustering (`loadWindowReading`, never a sum of weeks) and the
  dated evidence over the same days (`loadDatedEvidence`); every row stores
  it as `read_start` / `read_end` beside the run's `window_start` /
  `window_end` (columns of the unapplied products migration, granted to
  tenants, CHECK `read_start < read_end <= window_end`), and
  `lib/post-ideas/inputs.test.ts` pins which days each read asks for.
  *Candidates:* the question conversations of those four weeks,
  filed as `question` or whose commonest kind is a question
  (`isQuestionConversation`), each passing the week pool's `rankEligible`,
  untouched by the client's own posts (`questionTouch` over `ownedPosts`, the
  run's reading month and the two before, to the run's end:
  `POST_IDEA_OWNED_MONTHS`, unchanged by the four weeks) and clearing
  the evidence floor, `POST_IDEA_MIN_COMMENTS` (3) asking comments on
  `POST_IDEA_MIN_VIDEOS` (2) videos; biggest first. The floor is read twice:
  on the comments sent, so a conversation under it costs no call, and on what
  an idea's sub-questions hold after compose's drops, under which the idea is
  held `thin`. *Model and code:* only question-shaped comments go to the
  model (`isQuestionShaped`). One gpt-5.4 call (`POST_IDEAS_MODEL`; a second
  attempt where the first gave nothing usable: an answer that will not
  parse, or a failed call that was not a timeout, such as a 429 or a 5xx; a
  timeout is thrown for the step to retry, and never a third attempt)
  writes each title and cover and
  groups the comments, sent by handle, into sub-questions; comment words go
  to a model here as in Pass A, never under `lib/reports/`. Code maps the
  handles back to ids and counts them (`subquestionCounts`), and picks the
  format and opening (`formatReading` with `published: 'any'`, only where a
  group has `POST_IDEA_MIN_RATED` (10, the same floor as `LEAD_MIN_RATED`)
  rated videos and a multiple of at least `POST_IDEA_MIN_MULTIPLE` (1.1),
  else null) and the length (`cover.length`). *Scrub:* the `post_idea` prose
  slot is `digits`. The step's scrub (`scrubIdeaText`,
  `lib/post-ideas/scrub.ts`) drops a sentence holding a medical claim
  (`MEDICAL_CLAIMS`: cures, effect on the body, kind to the body, safety,
  proven or recommended, diagnosis, medicine, the medical team line, sent to
  a doctor; a question passes all but medicine and the medical team line),
  on the cover and the labels a movement claim (`MOVEMENT`) or the first
  person, and on the cover `BANNED_PHRASES`. Compose (`composePostIdeas`,
  `lib/post-ideas/compose.ts`) holds an idea whose title copies a sent
  comment (the whole comment, or a run of `COPY_MIN_WORDS` (4) words inside
  one) or names no subject (`namesNoSubject`); a label that copies a comment
  drops only its sub-question. The "check with your medical team" line is
  never stored: Content prints it (`MEDICAL_LINE`, `lib/post-ideas/medical.ts`,
  where `printsMedicalLine`). *The switch is OPT-IN per tenant* (Phase 4
  fix round): `POST_IDEAS_ENABLED` (`lib/config.ts`, the
  `PRODUCT_READINGS_ENABLED` pattern) is off for Sealand and Össur and
  pinned off by `lib/config.test.ts`, so applying the products migration
  (which creates `post_ideas`) starts no model spend; turning a tenant on is
  Heinrich's production step, a diff to the map and its test. Read it
  through `postIdeasEnabled(clientId)`, never the map. `POST_IDEAS=0` (or
  `false`) and `POST_IDEAS_OFF` (a list of client ids) stay as emergency
  OFF-switches only: neither can turn a tenant on. Content and the
  Dashboard print "not switched on" and no stored idea while it is off.
  *Money:* a hard cap PER RUN, `POST_IDEAS_BUDGET_USD` ($0.50), across
  every retry of the step: after its cheap checks the step reads the run's
  spend (`runSpendSoFar`) and this run's post-ideas spend so far
  (`postIdeasSpendSoFar`: `ai_call_log`, pass `post_ideas`), and starts only
  where something is left of the cap (`postIdeasCapLeft`) and
  `RUN_MODEL_BUDGET_USD` leaves that plus `POST_IDEAS_RUN_MARGIN_USD` ($0.50)
  (`postIdeasHeadroom`, the briefs' rule); the call is then held to what is
  left (`postIdeasRoom`), and each attempt is made only where the spend so
  far plus that attempt's worst case (`postIdeasAttemptMaxUsd`: the prompt
  counted at two characters a token and the full output ceiling) fits.
  Either refusal stops fail-soft: no call, no rows, status `over_budget`,
  one alert, and the result reports what the attempt really spent (an
  unparsed answer is paid for; so does `failed`). `scripts/post-ideas.ts`
  reads through the step's own `loadPostIdeaInputs`, so its dry run reads
  the same four weeks (a saved file from before 13 Oct says it read the
  run's own window). `scripts/post-ideas.ts
  --write` does not check the switch: it writes, and the pages hide what it
  wrote while the switch is off. *When it does nothing:* a TEST run reads and
  writes nothing. The switch off, no table (`isMissingPostIdeas`), no
  candidate over the floor, or a run that already has its ideas is a silent
  no-op that spends nothing; a week whose written ideas are all held `thin`
  is silent too, and has spent its call. *Failure:* the week read's
  contract: a transient failure before the
  last attempt throws; otherwise the body never throws and alerts the
  operator ONCE inside the step, naming the company and
  `scripts/post-ideas.ts`. Its `.catch` only logs and is never `noteError`'d.
  It is in `AFTER_GATHER_STEPS`.
  **Your products (T11) adds two, after the `brand-readings:*` steps and
  immediately before `freeze-months`:** `plan-product-readings` and
  `product-readings:${i}-of-${n}`, one month a step
  (`lib/pipeline/freeze-parity.test.ts` pins both, in order, each ending in a
  `.catch` that logs and returns null). *Placement* (`placeProducts`,
  `lib/products/readings.ts`): the rules first, then a gpt-4.1 confirm of a
  generic name (`needs_confirm`), then a gpt-4.1-mini classifier on comments
  under category-relevant videos. Code checks every answer against the text
  (`classifyRows`): the words it gives must be in the comment, a named
  product must be among them as a whole word (one slip for a one-word name
  of six letters or more) or be the one product the video names, a
  couldn't-tell-which answer needs the client's name, a product family or
  one of its products in the comment or the video (else it reads as the
  category in general), and a category-in-general answer must name the
  category; paraphrase placements
  are off (`MODEL_PLACES_PARAPHRASE`). Placements are appended to
  `product_mentions`. The client's own words never place: every content
  field of a `source='owned'` video (account, caption, hashtags, transcript,
  `transcript_en`, OCR; `contentFields`), and any comment written by the
  client's own accounts (`tracking_configs.own_handles`, plus, on a platform
  with a configured handle, the account names of the own posts the pass
  read; `ownAuthorNames`). Comments under its posts do place, by the rules
  and the confirm only: an own post is never category-relevant, so they
  never reach the classifier. A month's videos come from
  `product_month_videos(p_client, p_month)` (in the products migration):
  `market_month_videos`' rule over every audience, the client's included,
  with an `owned` flag; `readProductMonthVideos` falls back to
  `market_month_videos` where the migration is missing. A product name never
  writes a `brand_mentions` row. *Readings:* `month_product_readings` per
  audience, category and product: the exclusive split `k_named + k_unclear +
  k_unbranded = k_any`, and `k_organic` / `n_organic` on a per-category
  organic base (`categorySearchFinds` in `lib/products/readings.ts`, its
  reads in `lib/products/organic.ts`): the rival searches' finds and every
  video a search of ours in that category's own words found are left out,
  and a product takes its category's base. *The one-shot guard:* a month
  that would freeze is written frozen only from a pass with nothing left
  (`guardFreeze`); otherwise it is written `filling` (the result's
  `heldOpen`) and the next run freezes it. The back-read
  (`scripts/products.ts`) skips such a month and says to run again. *When it
  does nothing:* both are in `AFTER_GATHER_STEPS`, and each is a no-op that
  reads and spends nothing until `20261109090000_products.sql` is applied,
  for a tenant with no catalogue, and while `PRODUCT_READINGS_ENABLED` is
  off, which it is for every tenant: turn one on only after its seed is
  loaded and its back-read written. *Caps:* `PRODUCT_CLASSIFY_CAP` (3,000
  items a run), `PRODUCT_CLASSIFY_BUDGET_USD` ($0.75, read from
  `ai_call_log`), and each call capped at the lesser of `CALL_CAP_MS` (60 s)
  and the step's own clock, with no retry; a model failure never throws.
  *Tags:* a tag (`lib/actions/product-tags.ts`, owners and admins) supersedes
  the last and re-reads open months only, and only where their rows are all
  on the current catalogue version; a tag in a closed month is recorded and
  changes nothing (`written_closed`). **The week read's level 1 (T11b)**
  changed `write-week-read`'s body and not its id (the bullet "The weekly
  read sends only a READY read" below). Re-register
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
  **The client-bundle guard** (`lib/test/client-chains.test.ts`, Phase 4 fix
  round) walks every `'use client'` file's runtime imports with the
  project's own TypeScript parser and fails on the first chain to a `node:`
  builtin, a bare builtin Next does not polyfill for the client
  (`NEXT_CLIENT_POLYFILLS`), `server-only` or `next/headers`: the Tag
  control's break (3abd43be), in the test tier rather than minutes into
  `next build`. Type-only imports are erased and a `'use server'` module is
  a boundary. Four softer chains to `lib/supabase-admin` and `lib/gather`
  predate it and are listed in `lib/test/client-chains.ts`, not failed on;
  a client file's style or constant comes from a client-safe module, never
  from a page's `parts` that import its loader.
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
  where `WEEK_LINE.print` says so. Since Design v2 This week is not a page
  (its address lands on Market), and its rule is decision 1's on every page
  that prints a week: the Dashboard, Market, Content and the weekly read's
  level 1 state each week figure beside the month it falls in
  (`readingMonthOf`), off a run's frozen window, and three weeks are three
  bare counts with no word.
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
  `regate_videos` (migration `20261106092000`; redefined by
  `20261109090000_products.sql`), which copies every row it takes (16
  tables, embeddings included: the products migration added `product_tags`
  and `product_mentions`, and `regate_restore` puts all 16 back) into
  `regate_backup` first and logs
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
  `scripts/weekly-read-email.ts`. **Level 1 (depth v2, T11b, 13 Oct).**
  *Versions:* a `weekly_read` snapshot's `version` names its email
  (`WEEKLY_READ_SNAPSHOT_VERSION`, `lib/reports/weekly-read-build.ts`). 1 is
  the report, every snapshot stored before 13 Oct, and it renders byte for
  byte as sent (`lib/test/weekly-read-golden/`, held by
  `components/email/weekly-read.test.tsx`). 2 is level 1 (board E7): the
  week in one line, the market's week beside its month, the lead, Also this
  week, Across your pages, the way in. No quote. The share page, the viewer
  and the PDF of a version 2 snapshot print the full report plus level 1's
  flag, rows and page lines; that is where the full read lives now that This
  week is not a page. *The lead* is ONE rule, shared with Market's top row:
  `weekLead` (`lib/reading/week-lead.ts`): the first flag in `weekFlagRows`'
  order, else the new conversation with the most videos this week, else the
  conversation with the most ("Most talked about this week"). Both rank on
  the category's window count (the read's frozen `conversations`; a read
  stored before T11b ranks on its own counts). A set-apart conversation
  (maker-led or off-topic, `setApartOf`, `lib/written/conversations.ts`)
  never leads as new or biggest; a flag leads whatever its conversation's
  mark. *The check read:* `write-week-read` reads the update's check strictly
  before it builds anything (`loadCheckStrict` / `loadFlagsStrict`). A
  missing table is no check. A failure before the step's last attempt is
  retried as transient; on the last attempt it is frozen `unread`, never "no
  check". The flags (`WeekReadDataV2.unusual`) and the week's conversations
  (`conversations`) are frozen into the read, with no new step id. *Page
  lines* are read when the snapshot is built (`snapshotWeeklyRead` through
  `loadWeeklyReadLines`, `lib/reports/weekly-read-lines-load.ts`), because
  post ideas are written after the read. EACH LINE IS ITS PAGE'S DASHBOARD
  TILE (Phase 4 fix round): the build calls the same readers the Dashboard
  does, `topVoices`, `topProducts`, `topContent` and `topMoves`
  (`loadLineTops`, on the admin client and a reading handle over it, the
  export path's shape; no one decides from an email, so `canDecide` is
  false), and the pure `weeklyReadLines` (`lib/reports/weekly-read-lines.ts`)
  turns each tile's data into a line: the same item, the tile's own link
  (its open panel), its figures and its month words. So the email never
  ranks on another base or folds advice another way: Your products' line is
  the tile's standout under the tile's label ("Came up for the first time",
  "Talked about most"), on `marketProductMonth`, and gives no line while
  `PRODUCT_READINGS_ENABLED` is off; Your moves' line is `waitingAdvice`'s
  first, folded by its vectors (the page's embedding call, cached per
  server); Voices' is the group in the most videos. A tile with nothing, a
  failed read, a table not there yet or a switch off gives no line. The line
  is stricter than its tile in two ways, and only by leaving itself out: a
  post idea's title goes through the written read's scrub (`week_read`), and
  an idea from an older week gives no line. Each line's month is its tile's:
  the reading month for Voices and Your products (`loadReadingMonth`), and
  for Content the month its idea week is restated against (`contentMonth`,
  the `readingMonthOf` rule over the anchor week). Content's line states the
  idea's videos over the four weeks its ideas read, named by their days
  ("48 of 640 videos, 14 Sep to 11 Oct · 35 of 318 in October so far";
  `contentLine`), never "this week". Those months can differ from each
  other, and from the read's own month, for a week that crosses a month
  (Heinrich's open question on two month rules).
  `components/pages/v2/home/email-lines.test.tsx` holds each line to its
  tile's markup. So a build long after its run (a backfill, a re-claim, Send
  now on an old run) carries that day's lines. *Rollback hazard:* code from before this deploy
  accepts only version 1 and prints a version 2 snapshot as the stale line
  (`staleWeeklyReadSnapshot`). Do not roll back past this deploy without
  first holding v2 sends.
- **The pages and navigation (pages build, 1 Oct; Design v2, 13 Oct).**
  Every client page is drawn to its approved artboard (`Page-*.dc.html`;
  since Design v2 the depth boards, `E*.dc.html`); a deviation is Heinrich's
  call, never a builder's. What the builds fixed in place:
  - **Navigation** (`lib/nav.ts`; Design v2, depth plan T1, 13 Oct): nine
    surfaces in three unlabelled groups: Dashboard · Market · Voices · Your
    products · Content · Your moves, the Agent, then Studio · Settings. The
    Dashboard is `/dashboard` (nav key `home`, NO page key: page key
    `dashboard` names the legacy module that stored snapshots and Össur's
    digest still render). Market is `/dashboard/market` (page key
    `overview`), Voices `/dashboard/voices` (`voice`), Content
    `/dashboard/content` (`content`), Your moves `/dashboard/moves` (`market`,
    deep link `?advice=`); Your products (`/dashboard/products`) is new and
    has no page key, so nothing stores under it. PAGE KEYS DID NOT MOVE, only
    addresses. The 1 Oct reading addresses (`/dashboard/overview`, `/week`
    and `/subjects` land on Market, `/voice` and `/competitive` on Voices)
    are redirect stubs with no loader; `/dashboard/content` is no stub but
    the live Content page, which replaced This week's read there. ONE pure
    function maps every old address with its params, `redirectFor`
    (`voice?theme=` → `market?conv=`,
    `competitive?vs=` → `voices?brand=`, `subjects?item=` →
    `market?subject=`, a month → `market?period=month&month=`, Your moves'
    `market?rec|item|ledger` → `moves?advice=`, `/dashboard?month=` too),
    pinned by `lib/nav-redirects.test.ts`. A bare `/dashboard/market` is
    Market now, so a link meaning Your moves must say `/dashboard/moves`.
    Parked pages leave clients through `TENANT_RETIRED` / `tenantAway` (the
    operator keeps them); Reports redirects into the Studio with its query
    (`?group=sent&item=`, `?view=`). Studio names a page key by
    `pageKeyName` (a surface's label, else `RETIRED_PAGE_NAMES`).
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
    fails throws, and the page loses only that block. Since Design v2 the
    routed readers are the Dashboard (`startDashboard`, which reads it once
    and hands it to `topMarket` and `topContent`), Market (`loadMarket`,
    `topMarket`) and Content (`loadContentPage`, `topContent`). The month's
    long-run read (`week_reads` kind 'month', `loadPublishedLongRun`) has
    ONE routed reader since 13 Oct (Heinrich): Market › This month
    (`loadMarket`, `period === 'month'` only), which asks for the month the
    view reads (`loadPublishedLongRun(db, clientId, { month })`) and, only
    where that month is still filling and has none, for the most recent
    closed month's (`{ before: month }`, headed with that month;
    `marketLongRunFor`), and draws the one read last on the page, below the
    conversation table (`components/pages/v2/market/long-run.tsx`,
    `#long-run`). Never on This week or Over time; no read to show, no
    section and no placeholder. This week
    (`loadWeekReadPage`), the Subjects pane (`loadSubjectReadLine`) and Your
    market (`loadMarketPicture`, the newest long-run read of any month, for
    stored snapshots) still read through it and are on no route.
    `lib/written/published.test.ts` pins all six files, both long-run
    readers (Market's with its month), and that the selector reads no
    schedule and no send. A weekly read's
    review email says the read is on the platform already and Send emails the
    list (`readOnPlatform`); the run that closes a month also writes the
    long-run read, and that run's operator review email carries its title,
    lead, headlines and sentences (`readyForReview`, `lib/email.ts`) under
    "The month's long-run read, already on Market › This month"
    (`ALSO_PUBLISHED_HEADING`), with a link to its month there
    (`alsoPublishedOf` with the app's base URL: `marketMonthHref(month,
    MARKET_LONG_RUN_ANCHOR)`, `lib/nav.ts`, e.g.
    `/dashboard/market?period=month&month=2026-09#long-run`); a read that
    could not be read into the email says where a written one is
    (`ALSO_PUBLISHED_UNREAD`) and links nowhere. It said "Already on Your
    market" until Design v2, then named no page from the Phase 4 fix round
    to 13 Oct. The client's email is unchanged. **"On the platform"
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
    still writes the full one; until it does, Market › This month prints the
    partial one and says the day it reads to (`longRunSub`), and the full
    one takes its place (the newest ready row of the month). A read's facts worded against a month say "this
    month" only while the read's month is the calendar month, and its name
    otherwise (`monthPhrase`: This week's blocks and the legacy overview's
    subjects, which render stored snapshots; fresh review B2). The
    Dashboard's week tile words its month with `readingMonthOf` and
    `inMonth` (`weekTileOf`), and its subjects as "{Month} so far" or
    "{Month}" (`weekSubjectsOf`).
  - **Who talk is about** (`lib/brands/attribution.ts`): one rule (a tracked
    brand named in the item's own counted comments, else the audience; one
    brand per video; never a guess), one order (the client, rivals by
    videos, the market last; a kind's split prints most first), one wording
    (`marketLabels`). The kind words are `talkKindLabel`
    (`lib/pages/overview-market/kinds.ts`), except on the Your products
    panels, which name a kind by where it was found (`productKindLabel`,
    `lib/pages/v2/products.ts`: "Praise in the comments", never "Praised
    it"), because a product's kind count is its videos with that kind
    anywhere in their comments. Every page title is the shared
    `PageBar` (26px on 40px).
  - **Legacy modules stay registered, never routed**: `OverviewPage`,
    `WeekPage` / `WEEK_BLOCKS`, the subjects module, `COMPETITIVE_BLOCKS`,
    `MARKET_BLOCKS` / `MarketSurfacePage` and the six `voice.*` blocks render
    stored snapshots, exports and the monthly; `loadMarketSurface` also feeds
    the quarterly and the briefs. A block leaves a page's list, not the
    registry.
  - **Dashboard** (Design v2, T8; boards E1-Dashboard and -Phone;
    `lib/pages/v2/home.ts`, route `app/dashboard/(home)/page.tsx`).
    `startDashboard` starts every tile's reads in one wave on one session
    client and one reading handle (the memoised reads, `lib/reading/memo.ts`,
    made once a request); the published week read is read once and handed to
    `topMarket` and `topContent`; `loadDashboard` awaits every tile, for
    scripts and tests. `loadHome` is gone. The route streams each tile
    behind its own bones, and a tile whose read or render throws prints one
    line (`TILE_FAILED`) and loses only itself (`settleTile` plus a per-tile
    error boundary, `components/pages/v2/home/tile-boundary.tsx`); the bar's
    own read, the Agent box's questions, the weekly chart and the subjects
    are soft and draw nothing, the empty frame or no subjects instead. A
    weekly volume read that THREW is not "Insufficient data" (too few clean
    weeks, `homeWeeks` null): it carries `WEEKS_FAILED` (`lib/pages/home.ts`,
    `WeeksRead`), and the week tile prints `TILE_FAILED` in the chart's
    place while Market's "Videos, week by week" prints `WEEKS_UNREAD` (Phase
    4 fix round). The
    tiles: Market (`topMarket`); Your market this week (the published read's
    frozen market videos and comments this week beside the month,
    `weekTileOf`; Week by week below them; the biggest ready subject and the
    one that moved most against last month through its `Verdict`, or "No
    subject moved beyond its normal swing", `weekSubjectsOf` over Market's
    own subject facts; no head link); Voices (`topVoices`: the group in the
    most videos, every group's videos as separate bars, the two brands named
    most unprompted, `NAMED_MOST`, with no verdict); Your products
    (`topProducts`); Content (`topContent`, with `MEDICAL_LINE` under the
    idea in a medical market, `printsMedicalLine`); Your moves (`topMoves`:
    Accept and Not for us for owners and admins, `mayDecideMoves`); and the
    Agent box (two questions to try, `agentTries`, from the read's frozen
    `conversations`). Each tile's head link opens its page's panel in place
    where the tile has an item, else the page; the Agent box has none either.
    There is no Subjects tile and no Competitive tile: the Competitive
    tile's "Named most" brands are the Voices tile's two brands named most
    unprompted (`NAMED_MOST`). The weekly email prints no "Named most" line
    of its own: its Your products line is the products tile's standout
    under the tile's own label ("Came up for the first time" or "Talked
    about most", `TOP_LABELS`), with its videos of the month's
    (`lib/reports/weekly-read-lines.ts` `productsLine`). **Week by week** (`homeWeeks`, drawn
    by `HomeWeeksPlot`, `components/pages/v2/home/weeks-plot.tsx`, kept
    exactly from 1 Oct) draws from ONE clean week, the first the DATA shows, never a
    constant (`homeAxis`: the last eight weeks; `weeksSinceOurChanges` cuts at
    the latest search or relevance change on them, a pipeline change made
    before its run's gather at that run, at weeks off the cadence (a run that
    gathered nothing not counted) and at weeks with nothing gathered;
    a bar counts checked videos only, `checkedRows`), a filling week faint;
    a drawn week's numbers (the week, its videos and comments, "still
    filling" where faint) show on hover, on keyboard focus and on a tap, off
    the column itself (`homeWeekDetail`), with the weekly bars' card and
    behaviour (`useWeekTip`, `WEEK_TIP_CARD`, components/charts/week-tip.tsx;
    "still filling" is `STILL_FILLING`); Market's rail draws the same chart.
    The two fail-open fixes (`gate_rule` / `relevance_gate`: the 24 Sep fix
    and the backfill's regate) cut no week, because `unchecked` counts
    exactly their videos (`isFailOpenFix`).
  - **Market** (T3; `lib/pages/v2/market.ts`, `app/dashboard/market/page.tsx`).
    Nav key `market`, page key `overview`, unchanged: the `overview` module
    (`overviewPage`) stays registered for stored snapshots, exports and the
    monthly, on no route. Its week is the published read's run window plus
    the two equal windows before it (`weekWindows`, `MARKET_WEEKS`), cut by
    `WEEK_CUT_SURFACES` changes (`cutWindows`; the newest window is never
    cut). A conversation's counts are the category's videos, and the page
    says so; the flag's k of n is every audience together, the client's own
    posts included, and is named as such (`flagBaseWords`). The lead is
    `weekLead`; a set-apart theme (maker-led or off-topic) never leads as new
    or biggest, and stays listed, tagged. The table lists a conversation at
    `MARKET_TABLE_FLOOR` (`POOL_FLOOR`, 3) of the period's category videos,
    ten until `?all=1`. A subject that prints no level says why
    (`unmeasuredOf`: `countedNote('provisional')`, `FAILED_EXPLAINED`, or no
    reading in the month yet). `?conv=` takes a registry id or a slug;
    `?subject=`, `?period=week|month|time`, `?month=` (`YYYY-MM` or a date),
    `?at=` and `?in=` are read too (`marketParams`). THIS MONTH ENDS WITH
    THE MONTH'S LONG-RUN READ (Heinrich, 13 Oct): below the conversation
    table, the last thing on the page, never at the top and never on This
    week or Over time (`MarketData.longRun`, `marketLongRunOf`,
    `LongRunSection`). It is the published read for the month the view
    reads; a month's read is written when it closes, so where the view reads
    a month still FILLING (`soFar`: from about the 16th, `readingMonthFor`,
    decision A) with no read of its own, the most recent CLOSED month's read
    stands in, in the same place, headed with its own month ("September’s
    long-run read", and "October has no read of its own yet"), one read and
    never a stack (`marketLongRunFor`, `loadPublishedLongRun` with
    `before`). A month with its own read shows its own, and `?month=` of a
    closed month shows only that month's (none where it has none). Its title ("What holds across September and
    October"), lead, headlines and sentences are stored `week_read` prose;
    each idea's months and videos are code's figures, and who they are
    about prints only where the brands are `counted`. No board draws it:
    the kit's card and head, the lead, then one row an idea (words left,
    counts right). The lead card labels all three weeks' bars, as the side card and
    the Dashboard's tile do, and its "What they're doing" never names the
    conversation's own kind (`leadDoing`: a praise conversation's videos are
    praise by definition). On a phone the table's month sits under the
    week's figure in its cell, and its own column shows from 640, so no
    figure column is cut at 390 (checked on Sealand's dump and the
    long-label fixture, `marketLongRowsFixture`).
  - **Voices** (T4; `lib/pages/v2/voices.ts`), on the reading month. Groups
    are today's profile with this month's comment-dated videos: a count,
    never a share, never compared (decision 2). Brands: named unprompted is
    `k_organic` of `n_organic` with its `Verdict` (`brandMonthPair`, on
    `BRANDS_PANEL`); praised, complained and the subject read base `any` and
    carry no verdict. The client's own row needs its name checked
    (`nameChecked`) and every month match read in `NAME_READS`
    (`clientNameCounts`; the Dashboard's tile uses
    `clientNameCountsByCount`). A tenant with rules and no rows says the
    brands are not counted yet (`BRANDS_NOT_COUNTED`). Creators are listed at
    `ACCOUNT_FLOOR` (3) market videos; Reddit is left out
    (`COMMUNITY_PLATFORMS`: its account is the community) and never shows
    followers. A rival's panel carries Competitive's pane over the ninety
    days ending at the reading month's last update. One panel opens at a
    time: `?group=` / `?persona=`, `?brand=` (a name, a key or
    `competitor:<name>`, for ANY tracked brand), `?creator=` (an account or
    `platform|account`).
  - **Your products** (T5; `lib/pages/v2/products.ts`). `?group=` /
    `?product=` open in place; `?unclear=all` shows an open category's full
    couldn't-tell list. Counts pool `month_product_readings` over every
    audience through `marketProductMonth` (`lib/products/market-month.ts`),
    and the crosses pool every audience too (a local `poolLens`; Voices'
    brand cross is unchanged). Settings › Your products uses the same
    function and the page's own month (`productsMonth`), and its "Tag them"
    link carries the month and `#unclear` (`lib/pages/v2/products-address.ts`).
    While `PRODUCT_READINGS_ENABLED` is off for the tenant (every tenant
    today; Heinrich's order is to back-read first), Settings reads no month
    (the route asks for the page's month only while it is on,
    `loadProductSettingsForPage`),
    prints no count even where a back-read left rows, and says plainly that
    the Your products page is not switched on yet (`PRODUCTS_PAGE_OFF`); the
    weekly email's products line is absent, and the page bar names no month
    over a page that reads none (not applied, not on, no catalogue).
    The quote gate runs with `allowOwn: true` here, because comments under
    the client's posts are part of the basis. Standouts are picked by code
    (`pickStandouts`) and need `STANDOUT_MIN` (3) videos, except the gap
    card, which needs its band to clear. Every comparison is a `Verdict`
    (`ObjectKind` `'product'`); the category share verdict is judged on the
    brands view (`BRANDS_PANEL`), which handles changes cut, and is refused
    across a catalogue change. A product with no row in a read month reads
    "not read yet", never quiet. The panels' kinds are `productKindLabel`'s
    (above, "Who talk is about"). The Tag control is for owners and admins
    only. Honest states: not applied, no catalogue, not switched on, unread,
    failed (`ProductsState`).
  - **Content** (T6; `lib/pages/v2/content.ts`: `loadContentPage`,
    `topContent`). The week is a run's frozen window: the newer of the post
    ideas' run and the published week read's (`anchorOf`), either alone
    where the other is missing. Every week count sits beside its month
    (`readingMonthOf`). Ideas come from `post_ideas`, behind
    `postIdeasEnabled` (opt-in, off for every tenant today): a missing table
    or the switch off reads "not switched on", no rows "none written", a
    failed read says so (`unread`). THE IDEAS PRINT THE DAYS THEY READ
    (Heinrich, 13 Oct): "From questions asked 14 Sep to 11 Oct"
    (`askedPhrase` over `ideasReadOf`, the row's `read_start` / `read_end`),
    above the cards, on the open panel's head chip and on the Dashboard's
    tile ("of 640 videos, 14 Sep to 11 Oct"). Each idea's figure is its
    market videos over those days of the market's then (`IdeaCard.read`,
    `TopContent.idea.read`: one window read, never a sum of weeks), beside
    the page's month, and its bars are those four weeks as four bare counts
    (`IdeasRead.weeks`, `ideaWeeks`; no weekly counts where the stored window
    is not whole weeks), all under the page's run's clustering
    (`readWindows` with `ideas`; the tile reads the four weeks and the month
    only). Ideas still say the week they were written for when it is not the
    page's (`olderIdeasLine`) and stop printing once that week ended more than
    `IDEAS_STALE_DAYS` (28) before the page's (`stale`). Also asked keeps the
    page's week and its three weeks. Who asks is group
    names, never a count. "Your posts" is `ownedPosts`, and "touched on" is
    `questionTouch` over the reading month and the two before. What works is
    `buildPlaybook({ clientSide: 'owned' })`, dated by publish date, with the
    clock named. The reply list is one click down, never "N waiting"; its
    card carries `id="worth-a-reply"` (`REPLIES_ANCHOR`, equal to This
    week's `WEEK_ANCHORS.reply`), so a stored snapshot's or an email's
    `/dashboard/content#worth-a-reply` lands on it, and an old link's
    `?reply=<intent>` opens the list. The list reads its window only
    (`buildReplies` passes both ends to `loadEngageCandidates`, which then
    reads each chunk of engage insights' evidence with its comment embedded
    and bounded, `comments!inner`, one statement per 250 insights, in the
    unbounded read's order so the ranking's ties hold): Sealand's Content
    load was 143 statements on 13 Oct, 99 of them this list. On a tenant
    that size the list now makes 24 statements for the week and 26 for the
    month, pinned by `lib/pages/week-replies-cost.test.ts`; the 117 it made
    before was measured once, offline, on the same tenant with the old code,
    with the same rows. In a
    medical market every printed idea carries `MEDICAL_LINE`.
  - **Your moves** (T7; `lib/pages/v2/moves.ts`, `loadMovesPage`).
    `loadMarketSurface` and its blocks stay for stored snapshots, the briefs
    and the quarterly. `?advice=` takes a lineage, a recommendation id or
    `all`; the old `item` / `rec` / `ledger` are read too (`adviceParam`).
    Accept, Not for us, Date a move and a move's status are an owner's or
    admin's (`mayDecideMoves`); the database does not yet enforce it.
    `TrackThisSubject` requires `canChangeStatus`. A move reads the market
    from `MOVE_MONTHS_BEFORE` (2) months before it, and its one comparison
    goes through `pairedVerdict` under the month-pair judge.
    `theme_registry`'s label column is `canonical_label`. Your statements
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
  - **Settings** (T10b, T10c; `lib/settings/rail.ts`). Five client tabs: What
    you track, Your products (`/dashboard/settings/products`), Your subjects
    (`/dashboard/settings/subjects`, the subject editor again; it no longer
    redirects), Team, Billing. Readiness, The record and How to read are the
    operator's tabs, and Reports and recipients has none (its address
    redirects into the Studio). Log out sits in its bar. The app's catalogue
    writes are `lib/actions/products.ts` only: role (`canManageTenant`), then
    the tracking tenant lock, then the service role, logged on surface
    `products`; the seed (`scripts/products.ts --seed … --apply`) is the one
    other writer, append-only. Nothing is deleted: a product or an alias is
    retired, and an alias is retired and re-added, never edited, held to the
    matcher's one rule (`aliasProblem`, `lib/products/rules.ts`). How to read
    (`lib/settings/how-to-read.ts`) carries one card per routed page, the
    Dashboard's included.
  - **Own posts.** "Your posts" on the v2 pages is `ownedPosts`
    (`source='owned'`, `lib/reading/owned.ts`). Overview's
    `loadRecentOwnPosts` / `loadOwnPosts` and Your moves' legacy
    `loadRecentOwnPosts` (`lib/pages/market-surface.ts`) read through it;
    the subjects module's census (`lib/pages/subjects.ts` `loadOwnPosts`)
    still reads `is_client` or `source='owned'`, and `buildPlaybook` defaults
    to `clientSide: 'about'` everywhere but Content.
  - **Panels at every width (T9).** A v2 panel opened from a card in a grid
    is ONE child of that grid: cards take `panelItemOrder(i)`, the panel
    goes in a `PanelSlot` right after the clicked card, and
    `panelPlacement(index, layout)` (`components/v2/panel-place.ts`) gives
    its order and notch per breakpoint. The rules are plain CSS
    (`.panel-slot` / `.panel-notch` in `app/globals.css`) because Tailwind
    sorts `min-[1180px]:` before the named breakpoints. No page does its own
    order arithmetic (Content's lower row took hand-set `order-*` classes
    until the Phase 4 fix round; it takes `panelItemOrder` now, its
    right-hand column's order inert while that column is `display:
    contents`), and the panel's content is never drawn twice.
    `InPlacePanel` scrolls itself into view when its head is off screen
    (`panelScrollPlan`, reduced motion jumps). From 768 the sidebar takes
    281px, so at 820 a page has 459px and three-column sections start at
    `lg`.
  - **The phone shell (T9).** Below 768 `PhoneTopBar`
    (`components/shell/phone-bar.tsx`) stands in for the sidebar and opens
    the same drawer, so its rows still come from `lib/nav.ts`; the
    workspace name comes through `viewedClientRow` (request-cached, shared
    with the billing banner). Phone `<main>` is `px-4 pt-[18px] pb-12`.
    `scripts/pages-shots.ts` writes `measure-<width>.json` (scrollWidth and
    overflow per shot); a page that scrolls sideways at 390 is a bug.
  - **A page that throws keeps the shell**: `app/dashboard/error.tsx` draws
    one calm line and Try again (`unstable_retry`) inside the sidebar; the
    Dashboard loses only a tile, and Market and Content only the block whose
    read failed (their `soft` reads).
  - **Dead after the build, not deleted** (one cleanup commit wants them):
    `components/sidebar-tenant-loader.tsx`; the old Settings forms
    (`app/dashboard/settings/{tracking-form,term-performance,config-shapes,rival-rename}`,
    most of `components/settings/tracking/*`, the What-we-read loaders in
    `lib/settings/*`); `StarterCards`, `AskIndexColumns`, `loadAskFront`,
    `lib/agent/starters.ts`. Since Design v2 also: `MarketPicturePage` /
    `loadMarketPicture` (Your market's 1 Oct page; `scripts/pages-shots.ts`
    still draws it), `WeekReadPage` / `loadWeekReadPage` and
    `loadSubjectReadLine`, which no route calls and
    `lib/written/published.test.ts` still pins.
- **The monthly department briefs (T8 wired, 5 Oct; Heinrich: "a finished
  run reaches the platform by itself; review holds ONLY the email").** The
  engine is `lib/reports/briefs/` (one idea, one home; role sections; the
  evidence floor; who the talk is about; the scrubs). It runs ONLY on the run
  that closes a month (`closesMonth`, the long-run read's rule) as five
  steps (`lib/reports/briefs/step.ts`): `plan-briefs` (due? the inputs, read
  once and carried, frozen, no comment's words; the 19 questions in waves of
  four), `briefs:research-${i}-of-${n}` (each question held to the step's
  clock), `briefs:ideas` (the evidence counted, one ideas call, its
  self-check, the allocation), `briefs:write-${role}` (one writer a step:
  four never fit 250 s), `briefs:compose` (the set composed against the
  ideas step's allocation, the repeat judge, the set paginated, the In short
  check against its printed pages, the summaries' self-check, then stored). Every other run runs `plan-briefs` alone, decided from the run's
  own window before any read: nothing read, nothing spent, nobody told. A
  TEST run (`isTestRun`: a rehearsal that gathered nothing, a capped run,
  `publish: false`) that closes a month writes no brief and alerts once,
  naming the month and the script, because test runs never publish and no
  later run writes an ended month (`write-longrun-read` has the same guard).
  **Fail-soft, the long-run read's contract:** a
  transient failure before a step's last attempt throws for Inngest to retry;
  otherwise the body never throws: the set is stored `failed` (never where
  the due check itself failed, so a failure never overwrites a ready brief)
  and the operator alerted ONCE, naming the month, in the step that gave up,
  with the script; the steps
  after it see the failure and do nothing; a research question that never
  answers is a failed answer, not a failed set. Every model call is capped on
  its step's own clock (`lib/reports/briefs/clock.ts`, 250 s; no SDK retry).
  A PostgREST that cannot load its schema cache (PGRST002) is transient
  (`isTransient`); a missing table (PGRST205) is not.
  **Spend, a hard cap:** about $2 to $2.50 a workspace a month (September's
  dry builds), capped at `BRIEF_SET_BUDGET_USD` ($5), logged under the run.
  The set starts only where the run has `BRIEF_HEADROOM_USD` left under
  `RUN_MODEL_BUDGET_USD` (`briefHeadroom`), and EVERY `briefs:*` step reads
  the run's spend again before it calls anything (`runSpendSoFar`, so a
  retried attempt's calls count): the set's spend is the run's since
  `plan-briefs` (`spentAtPlan`), and a step goes on only where the room
  (`briefRoom`: the set's cap, and the run's budget less
  `BRIEF_RUN_MARGIN_USD`) covers its worst case and every later step's
  (`BRIEF_STEP_MAX_USD`, about three times September's). A research wave
  asks only as many questions as the room leaves after the later steps'
  worst case, each given its share, never the whole (`researchAllowance`).
  So the set stops, stored failed and alerted once, before it could trip
  `assertWithinBudget` and fail the run. **Storage:** each brief that prints is a
  `report_snapshots` row (kind 'report', `data.kind = 'monthly_brief'`,
  `ref.artefact = 'brief:<role>'`, quotes as refs, `evidence_ids`, stamped
  `month` / `window_basis = 'month'`), ONE per client, month and role: a
  retried compose step or `--replace` rewrites it in place (its PDF flagged
  stale) and a role thin this time loses its earlier one, so no retry leaves
  an orphan. Its `data` is what a tenant reads, so it holds neither what the
  brief held nor what it cost (`storedBrief`); those are the ledger's. The
  ledger is `monthly_briefs` (migration `20261107093000`, additive, service
  role only): one row per client, month and role, `ready` (with its
  snapshot), `thin` (nothing stood, never shown) or `failed`, with `held`
  and `cost_usd`. A month is written when every role is ready or
  thin; no later run writes an ended month. **Shown:** the Studio's "Monthly
  briefs" card (`lib/pages/studio-briefs.ts`, `components/pages/studio/
  monthly-briefs.tsx`) lists every ready brief, newest month first, to Open
  in the viewer (`?view=<snapshot>`) or download; no review holds them (there
  is no email). "Your reports"' brief rows stay hidden (`BRIEFS_BUILT`: they
  are email schedules no brief has), and the August engine's document builds
  are not in the ledger and are never listed. **Drawn EXACTLY to the canvas** (Heinrich, 12 Oct: "look just like the
  design", no deviations; the canvas "Verbatim reports and colour", page
  "Monthly briefs", Brief-{Sales,Marketing,Content,Leadership}-*: every size,
  weight, colour, radius and gap is the artboard's): `components/briefs/
  brief-deck.tsx`, 1280×720 sheets, palette A, each brief's cover colour, one
  body for the viewer, the PDF and a share link, a hairline round a sheet on
  screen and never a shadow. The page set and order are the canvas's (Sales
  9: cover, In short, a finding a page, Who is buying and its one
  continuation, What stops them with What they want settled first, What tips
  them into buying, Who buyers compare you with, Language to handle with
  care; Marketing 8; Content 8; Leadership 8, its findings after Where
  {company} stands against its rivals and What holds so far last);
  `lib/reports/briefs/deck.ts` (pure) fits each page at the canvas's type and
  count (two buyers a page, five objections, three rival cards, five words to
  handle with care…) by an estimate of each layout's height, and what does
  not fit stays in the stored brief: no page carries on, no finding takes a
  second page. A component whose material does not stand does not print.
  **Thin pages are left out (Heinrich, 12 Oct):** a section's page prints
  only with every main piece the canvas draws on it (an opening line where
  the canvas draws one, both columns of a two-column page, the subject bars
  and the comments' bars on Where the market stands, the paragraph where the
  confusion starts, the panel beside or under a page's rows, an own-posts
  table with a rival's row in it…) and at least two items in its section,
  counted on what fits the page; Who is buying counts its page and its
  continuation together, and a sheet of one buyer prints only where that
  buyer fills it (a short odd buyer stays stored). ONE table holds it, `PAGE_NEEDS` in
  `lib/reports/briefs/deck.ts`, read by the paginator (`planDeck` also says
  why a page was left out; the dry build prints it). A voice is never a main
  piece (its words resolve at render, and a page does not come and go with
  them), nor a footnote, a muted line under a title or "Also following". The
  cover, In short and a finding's page are exempt. What a page left out held
  stays in the stored brief; the cover's contents and "In this brief · N
  pages", In short's contents and the page numbers are the printed pages';
  a brief with no finding and no page past In short is thin (`briefPrints`).
  **In short says only what prints** (the September dry build, 12 Oct): the
  writer writes it before the paginator leaves pages out, so inside
  `briefs:compose` (no new step) the set is paginated as it will draw (every
  quote's words in hand, a subject's voice read once) and ONE call
  (`lib/reports/briefs/inshort.ts`, gpt-5.4 at low effort, $0.023 and $0.024 on
  September's two sets) reads each brief's PRINTED pages, never a voice's words, against its
  In short; a sentence no printed page carries drops whole into `held`, then
  the conversation self-check reads what is left. In short's summary is its
  page's main piece: where the checks leave none, the In short page is left
  out like any page missing a main piece, its figures and "Also this month"
  stay stored, and the brief prints on. "Also this month" names only an idea
  some brief of the set prints as a finding (`alsoOnlyPrinted`; a finding's
  page is never left out). Several footnotes on one page naming the same
  brief the same way are one line (“A”, “B” and “C” are argued in full in
  the Content brief.; `footnoteOf`); one keeps the canvas's line. Every name
  is in curly quotes, one alone too, so a name that is a clause reads as a
  name (12 Oct: Össur's Sales printed "Everyday wear is unclear is argued in
  full in the Content brief."); a risk card's foot names no item. In its own
  words draws a chip that is only another of its group's plural or singular
  once, the first listed ("bag" / "bags": case aside, one is the other plus
  "s" or "es", nothing else stemmed; `distinctChips`), before the page is
  fitted and counted; the stored brief keeps every word. Both are drawing,
  not words: `--from` compares a saved In short record's lines without them
  (`sameWords`), so the v2 September build still stores.
  The writer always writes the leads the canvas draws (Where the confusion
  starts' paragraph too) where the part has items, summing up the items and
  claiming nothing they do not, under the same evidence floors and scrubs; a
  lead the scrubs empty leaves its page out. The contents use the
  canvas's short names (a finding's writer-made `short`). Items carry no count
  line; brand attribution stays where the canvas carries it (a quote's cite,
  "On a {company} post", a rival card, the "(you)" card, the brand chips).
  Another brief's idea named in a section is the canvas's footnote ("… is
  argued in full in the Marketing brief."), on a risk card its foot line; it
  never points at what did not print there: each tagged item records what it
  names (`named`: the idea, or that brief's item), `namedAcross` names only
  an item the earlier brief prints, and `footnotesOnlyPrinted` holds a line
  whose idea has no finding or whose item is on a page left out. The Who is
  buying heading counts every buyer the brief found, printed or not, in words
  ("Four kinds of people…" where two print; Heinrich, 12 Oct).
  Three sections the engine writes have no canvas page (who else is in the
  decision, how {company} is remembered, words to borrow): they are built and
  stored, never printed, behind ONE switch, `PRINT_UNDRAWN_SECTIONS`
  (`lib/reports/briefs/canvas.ts`), and the set's repeat checks never name
  them. The canvas's components come from the writer (`monthly_brief_v2`,
  each field capped at its column's measure: a buyer's want, stops, moves and
  "For a sale" with a status where they mostly do not buy; a rival's job; the
  market's own words as chips and what it stops on, shares and argues over;
  each claim's status; the company's own card; what each brand is heard for;
  the position in one line) and from counts code reads (the Sales figure's
  biggest subject; a finding's "Part of {subject}", from the memberships of its
  insights, read at compose; what people did in the comments and the mood;
  each brand's share of the month's comments and videos, the company's own
  posts included, where it is talked about, the notes, a giveaway said; each
  brand's own posts and how many drew five or more comments; the formats with
  the first rival's column; What holds so far from the month's ready long-run
  read). The estimate is measured by `scripts/brief-render.ts --in
  <brief.json> --out <dir> [--pdf]` (local Chrome, a PNG a page, exits 1 on
  any clipping): run it on a real brief and a worst case whenever a page
  changes. The writers' words are the `monthly_brief` prose slot; the
  long-run patterns are `week_read`'s. Four wordings Heinrich ruled on, 12
  Oct, to keep as built: "about {brand}" on a quote's cite; the percentages in
  "Also following"; "videos in your market" for what people do in the
  comments and the mood; and the canvas labels "What loses them", "They stop
  on" and "They share", which claim a viewer's behaviour the product reads
  only through comments, so the writer is held to what comments show under
  them. **PDF:** `GET /api/briefs/<snapshot>/pdf` prints on the first
  download (the export route's pattern: session tenant, the daily export cap,
  Chrome at `/render`, Storage, `artifacts`, `export_events`), then reuses the
  file; a stale one prints again; an id that is not a UUID is a 404. **By hand:** `scripts/monthly-briefs.ts
  --client <uuid> --month YYYY-MM --run <uuid>` (`--plan` free, dry by
  default and paid for, `--write` stores, `--replace` over a written month).
  A dry build (the default) is also drawn, as the product draws it, into
  `--designed` (default `~/Documents/Heinrich/Verbatim/Briefs-YYYY-MM-designed/
  <tenant>/`, never over a folder that holds a build): `<role>.json`
  (`{ data, texts }`, a thin role's too), `<role>.pdf`, a PNG a page, and
  `set.json` (`lib/reports/briefs/saved.ts`: the client, the run, when it was
  read, the set's spend and each role's ledger fields, the evidence ids, the
  pages drawn, the In short check's record, the month's ideas). **Store what
  was reviewed with `--write --from <dir>`**: no model call; it checks every
  saved brief (it parses against this code's stored-brief shape, held equal
  to the type at compile time; it is the client's, month's and run's named;
  its status, evidence ids and pages are what was saved; its In short still
  holds to what prints; it draws with no clipping) and stores the same
  snapshots and ledger rows `--write` stores, or nothing and why. `texts` is
  never stored. A plain `--write` calls the models again, so its words are
  not the dry build's. A dry build ends by saying whether `--from` will take
  its folder. September 2026, which closed before the steps existed: `bash
  scripts/backfill-briefs-september.sh [--designed-root <dir>]` (dry, drawn
  and saved) to read it designed, then `--write --from <root>`, once, after
  the migration. The first September dry build (12 Oct,
  `Briefs-2026-09-designed`) predates `set.json` and cannot be stored by
  `--from`; the second (`Briefs-2026-09-designed-v2`, $4.56) can. A brief's snapshot has no send row, so `scripts/purge-reports.ts`
  reads `data->>kind` and keeps it by what it is: `drafts` keeps it, `all`
  refuses it, as it refuses any build on the platform (`lib/reports/purge.ts`).
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
