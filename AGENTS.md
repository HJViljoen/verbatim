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
- **A run's window is frozen once, at `open-run`** (`pipeline_runs.window_start`
  / `window_end` / `window_basis`, rule in `lib/pipeline/window.ts`). Steps read
  it off `OpenRunResult` / `GatherOptions`; no step recomputes the window from
  `Date.now()` — three did, and two multi-day runs gathered and synthesised
  against windows 18 and 9 days apart. Instagram and YouTube take the dates;
  TikTok and Reddit take enums (`tiktokRangeFor` / `redditTimeFor`) and the
  `inWindow` post-filter trims the surplus.
- **Tests are pure-logic only** (`lib/**/*.test.ts`, vitest — no network, DB,
  or GPT). New pure pipeline logic gets a test; don't mock the world to test
  I/O glue.
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
  `month_theme_readings`. A month is `filling` until 30 days after it ends and
  `frozen` after; a frozen row is never rewritten — the `month_reading_frozen_guard`
  trigger refuses the UPDATE, so a late-discovered video shows as accrual and no
  artefact is silently corrected.
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
- **Client-facing copy is calibrated**: no pipeline jargon (T#, Pass C, run),
  no raw scores; "comments" vs "conversations" have fixed meanings
  (`lib/calibration.ts` GLOSSARY). Copy claims about behavior must match the
  code (a page once claimed "no email is sent" while Resend sent).
- **No direction word on the run-indexed series** (`RUN_INDEXED_DIRECTION_WORDS`
  in `lib/config.ts`, false since 2026-09-15). Gaining / fading / New compares
  two readings of one cumulative corpus taken at two arbitrary moments, not two
  periods — a missed week moves the number as much as the conversation does.
  Gated branches read the constant instead of deleting the code and gated pure
  functions take it as an argument, so both answers stay tested and Phase 1
  flips it one reader at a time as each re-bases on the monthly reading. Levels
  are untouched, as is any period reading with an n and a band (the digest's
  sentiment and share verdicts).
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
