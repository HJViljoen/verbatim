# Verbatim

Media-based consumer intelligence for mid-market D2C brands. Verbatim gathers
TikTok / YouTube / Instagram video and comment conversations around a client's
category, runs them through a multi-pass GPT analysis pipeline, and delivers a
dashboard plus scheduled email updates — multi-tenant SaaS at
[app.verbatimintel.com](https://app.verbatimintel.com).

## Stack

- **Next.js 16** (App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui
- **Supabase** — Postgres + auth, multi-tenant RLS. Accessed directly via
  `@supabase/supabase-js` (no ORM, client is deliberately untyped)
- **Inngest** — the analysis pipeline as one durable function (`inngest/`)
- **OpenAI** — analysis (`gpt-4.1-mini`), synthesis (`gpt-5.4`), embeddings,
  Whisper transcription
- **Apify** (TikTok/Instagram scraping) + **YouTube Data API v3** (free, official)
- **Resend** — invite + scheduled update emails (PDF attached)
- **Vercel** — Hobby plan, region `dub1`; 300s function cap shapes the pipeline's
  step sizing

## Local setup

```sh
npm ci
cp .env.example .env.local   # fill in real values
npm run dev
```

| Command | What |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest — `lib/**/*.test.ts` (pure pipeline logic, no network/DB) + `components/**/*.test.tsx` (static block renders) |

CI (GitHub Actions) runs typecheck + lint + test **and `next build`** on every
push to every branch. The build step is there because the bundler is the one
gate the other three cannot stand in for: Vercel builds with Turbopack, and a
Turbopack-only break used to surface as a failed production deploy.

### Working in a worktree

`node_modules` inside a git worktree is a symlink out of the project root.
Turbopack resolves modules only inside the root it auto-detects from the
nearest lockfile, so the plain `npm run build` fails there with
`Symlink … invalid` before it compiles anything. Two supported ways round it:

| Command | Bundler | Notes |
| --- | --- | --- |
| `npx next build --webpack` | webpack | No config, no env var. Compiles, typechecks and writes the `*.nft.json` file-tracing manifests, so a missing `outputFileTracingIncludes` entry is visible locally. Not the bundler Vercel runs. |
| `TURBOPACK_ROOT=/path/containing/both npx next build` | Turbopack | Production parity. `next.config.ts` reads `TURBOPACK_ROOT` and sets `turbopack.root` only when it is set, so the line is inert on Vercel. The path must contain both the worktree and the real `node_modules`. |

Both work for `next dev` too (`npx next dev --webpack`, or the same env var).

**One dev server per project directory.** Next 16 refuses to start a second
`next dev` from the same directory, whatever port you pass — so when someone
else already has one running on :3000 from the worktree you are in, `-p 8470`
does not help. Do not kill theirs and do not move its lock file. Build once and
`npx next start -p <port>`: it serves the same route tree at higher fidelity
than dev, which is what you want for a render check anyway.

**A stale `.next/types/` can fail `tsc` for no reason.** After a merge that
retires a route, `tsc` reports `Cannot find module '../../app/api/…/route.js'`
from generated types the last build wrote. Rebuild and re-run; it is not a
defect, and it looks exactly like one.

## How the pipeline works

Everything hangs off one event, `pipeline/run.requested` → `runPipeline`
(`inngest/functions/pipeline.ts`), a durable Inngest function whose steps are
each sized to fit the 300s cap:

1. **Gather** (skipped on analysis-only resumes) — per-keyword search steps →
   one relevance/attribution gate per platform → comment-scrape batches →
   owned-account reads → transcript batches (flag-gated by
   `TRANSCRIPTS_ENABLED`). Delta-scraping skips unchanged re-finds and
   re-checks grown videos.

   **Every platform is dated at the source.** TikTok has `dateRange`, YouTube
   `publishedAfter`, and Instagram (since 2026-09-09) `onlyPostsNewerThan` on
   the flagship `apify/instagram-scraper`. That actor answers a hashtag with
   *either* reels *or* feed posts per call, so **Instagram plans two searches
   per keyword** (`search:instagram:<kw>:reels` / `:posts`) — the variant rides
   on the adapter (`searchVariants`), and the keyword itself is never split, so
   `keyword_performance` still keeps one row per (run, platform, keyword,
   bucket).

   **And the window is frozen once, at `open-run`** (2026-09-15):
   `pipeline_runs.window_start` / `window_end` / `window_basis`, anchored on the
   previous run's `window_end` and capped 30 days back (`lib/pipeline/window.ts`).
   Every step reads that one window — the filter, the actor bounds and the owned
   census alike — instead of re-reading the clock, which is how two multi-day
   runs came to gather and synthesise 18 and 9 days apart. Instagram and YouTube
   take the dates; TikTok and Reddit can only take enums, so they get
   `THIS_WEEK`/`week` for a window of 8 days or less and `THIS_MONTH`/`month`
   otherwise, with the `inWindow` post-filter trimming the surplus before
   anything is paid for. `periodSince` in `lib/config.ts` remains the fallback
   where there is no window: a baseline run, and the CLI callers.

   **Owned reads are a census, not a sample.** Each configured account's posts
   *for the window* are stored (`OWN_POSTS_CEILING` = 200 is a runaway guard, not
   a sample size), and the count per platform is frozen in
   `run_summary.owned_census` with the window and handle it is true for. The
   share tile speaks it: "You published n posts this update · the market posted
   about you k times."

   **Competitors get the same read.** `tracking_configs.competitor_handles`
   (operator-set, keyed by the exact `competitor_names` entry) names each
   tracked brand's own accounts; their posts are stored `source:'competitor_owned'`
   with their transcripts, so competitive briefs can quote what a competitor
   actually claims. No account's own posts — client's or competitor's — ever
   count toward share of conversation.

   Run ceilings live in `lib/config.ts`: `GATHER_MAX_SEARCHES_PER_RUN` (120),
   `REDDIT_COMMENT_SCRAPE_CAP` / `RECHECK_CAP` (100 each), `TRANSCRIBE_CAP`
   (5000), `RUN_MODEL_BUDGET_USD` (60). They are kill switches sized above any
   honest run, not budgets — meeting one means something is wrong.
   `COMMENT_THRESHOLD` (5) is the exception: it is a real decision about which
   posts are worth a paid comment scrape, and it matches the analysis floor.
2. **Pass A** — per-video GPT insight extraction, fanned out in batches.
   **Incremental since 2026-08-17** (flag `INCREMENTAL_PASS_A`): insights are
   durable facts about a *video* — `videos.analyzed_run_id` points at the run
   that produced a video's current rows, and `plan-pass-a` re-reads a video only
   when it is new, its stored comments grew (≥ min(3, 20%) since last analysis),
   a usable transcript landed, its lane changed, the prompt version bumped, or
   `options.forcePassA` is set. Flag off = every eligible video re-read (the
   pre-2026-08-17 behaviour) on the same bookkeeping. "Current corpus" reads go
   through the `audience_insights_current` / `language_samples_current` views;
   stale rows are pruned after `close-run`.

   **`embed-insights`** (2026-09-15) follows the wave: every insight still
   carrying a NULL `embedding` is embedded in 512s and written back through the
   `set_insight_embeddings` RPC (a bulk single-column write PostgREST cannot
   express). It is what keeps the agent's retrieval index whole; it is logged,
   never `noteError`'d, so an index pass having a bad day cannot make a clean
   run read `partial`.
3. **Cross-reference** — deterministic client-brand mention detection.
4. **Themes** — fan-out per entity bucket (`plan-themes` → `themes:<bucket>`
   clustering + LLM label-merge → `pass-b` labels → `persist-themes`).
   **Theme identity** (flag `THEME_REGISTRY`): `persist-themes` matches this
   run's themes to a per-client `theme_registry` on **membership** (the
   `supporting_insight_ids` set, durable since Pass A went incremental), not on
   the label — measured, 507 of 537 themes had an identical member set run to
   run while 48 of 58 "new" flags were the same theme relabelled. Each match
   writes a `theme_observations` row and stamps `themes.registry_id`;
   `first_seen` then means *genuinely new*. Trends and the Voice history join on
   that id instead of the label string.

   **`freeze-months`** (2026-09-15) follows `persist-themes`: this run's
   clustering is read back month by calendar month, dated by
   `comments.comment_date`, into `month_denominators` / `month_theme_readings`
   (`lib/reading/monthly.ts`). A month is `filling` until 30 days after it ends
   and every run rewrites it; then it freezes and is never rewritten — a
   `before update` trigger refuses it, so a late-discovered video shows as
   accrual and no artefact is silently corrected. Non-fatal, like the step
   above.
5. **Synthesize** — metrics → Pass C (competitive) → Pass D (market insights,
   recommendations, executive brief) → `run_summary`.
6. **Close run** → `prune-stale-analysis` → optionally emit
   `report/send.requested` → `sendWeeklyReport` finds the due schedules and calls
   `POST /api/admin/schedules/run` per schedule (build, PDF, link, email → `report_sends`).

A daily cron (`inngest/functions/scheduler.ts`, 06:00 Africa/Johannesburg)
dispatches runs for clients whose `report_day`/`report_period` are due.

**Step-ID stability matters**: Inngest memoizes completed steps by their ID
string. Renaming or renumbering steps strands any in-flight run across a
deploy — change step shape only between runs.

Key directories: `app/` (pages + API routes) · `lib/pipeline/` (passes,
clustering, themes) · `lib/gather/` (platform adapters, delta logic) ·
`inngest/` (functions) · `scripts/` (operator CLIs) · `supabase/migrations/`.

## Database

Schema baseline: `supabase/schema-baseline.sql` (full prod schema as of
2026-08-09). A fresh database = apply the baseline; files in
`supabase/migrations/` dated **before** the baseline are historical record
(already folded in), files dated **after** it are new migrations. Migrations
are hand-authored SQL, applied to prod by hand (no Supabase CLI link).
Multi-tenant RLS leans on the `get_my_client_id()` / `get_my_role()` helper
functions (defined in the baseline).

## Deploy & ops

- **Deploy** = push `main` (Vercel auto-deploys) or `npx vercel --prod`.
- **After any Inngest function change**, re-register:
  `curl -X PUT https://app.verbatimintel.com/api/inngest`
- **Inngest locally** (first used for `build-document`, 2026-08-31): run the
  app with `INNGEST_DEV=1 npm run dev` and, beside it,
  `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest --no-discovery`;
  `inngest.send` then lands on the dev server at :8288 and functions run
  against localhost. `scripts/document-smoke.ts` needs both.
- **Manual run**: `POST /api/admin/trigger-run` with header `X-Admin-Key:
  <ADMIN_API_KEY>` and body `{"clientId": "..."}`. (The service-role key is
  still accepted during the changeover; stop using it — the ops bearer is a
  separate credential now so it can be rotated on its own.) Add
  `"options": {"runId": "...", "skipGather": true}` for an **analysis-only
  resume** — reuses the stored corpus, the recovery lever when a run's
  analysis half dies. Add `"forcePassA": true` to re-read every eligible video
  even if nothing changed (after a prompt/model change that kept the version
  string; no effect while `INCREMENTAL_PASS_A` is off). Note `forcePassA` does
  **not** re-read videos this same run already analysed — on a `skipGather`
  resume of the *same* `runId` those are already this run's output; use a new
  run id to force a genuine re-read.
- **Schedule preview/send**: `scripts/send-report.ts` (preview by default →
  `email-preview.html`; `--test <email>`; `--commit` sends to the list) or
  `POST /api/admin/send-report { clientId, scheduleId?, mode }`.
- **Retention** (`retention-daily`, 04:00 SAST). **Live, not dormant**:
  `RETENTION_ENABLED` is set in production and the sweep has been running since
  **24 Aug 2026** — 50 YouTube videos tombstoned between 24 Aug and 12 Sep, each
  batch stamped at the 04:00 slot (`select count(*), min(unavailable_at),
  max(unavailable_at) from videos where unavailable_at is not null`; only the
  sweep writes that column). It is deleting and refreshing real tenant data
  every night, so treat it as one of the four forces that move a month's
  numbers, not as something waiting to be switched on. Raw payloads and prompt
  bodies past 30 days go; **YouTube rows are refreshed, not deleted** —
  re-fetched from the API every ≤30 days (Developer Policy III.E.4.d), rows
  YouTube no longer serves are deleted (evidence cascades, hero-quote copies
  nulled), vanished videos are tombstoned; the Tier 0 delete path stays as a
  30-day backstop and logs loudly if it ever fires. Preview tonight's sweep with
  `scripts/retention-dry.ts` (read-only). **How it was rolled out**, kept as the
  order any re-apply would follow: apply `20260822100000_retention_refresh.sql`
  (schema) BEFORE deploying the code (gather/Pass A write the new columns) →
  deploy + re-register Inngest → apply
  `20260822110000_demographic_redact_backfill.sql` AFTER (its readers must be
  live) → run `retention-dry.ts --refresh-sample 50` → then `RETENTION_ENABLED=1`.
- **Workspace switcher (operator only, 2026-09-09)**: a user listed in
  `public.platform_admins` sees a tenant dropdown in place of the sidebar
  wordmark and can point their session at any client — the whole app follows,
  reads and writes alike, with an "Operator" tag in the header whenever the
  viewed tenant is not their own. The mechanism is one httpOnly cookie
  (`vb_workspace`, a client uuid, one year) honoured **only** in `lib/auth.ts`
  and **only** after `isPlatformAdmin()` passes; for anyone else the cookie is
  inert, so forging it changes nothing. While viewing another tenant the
  session's role is `owner` and reads use the service role (RLS keys every
  tenant policy on the caller's own `users.client_id`, so the session client
  would see nothing over there) — writes already went through the service role
  everywhere. Billing/Stripe actions are the one exception and refuse to run
  from an operator view. Adding an operator is a hand-written
  `insert into platform_admins (user_id) values (...)`; there is no UI, no env
  allowlist, and no migration behind this feature.
- **Share of tracked conversation counts by AND about (2026-09-10)**: the share
  measure takes everything relating to a brand — videos other accounts posted
  about it and the brand's own account posts (`videos.source` `owned` and
  `competitor_owned`) — on the same rule for the client and every tracked
  competitor. The bucket comes from identity (`is_client`, `is_competitor` +
  `competitor_name`), which the census gather stamps onto own-post rows, and
  those videos' comments count with them. Before this the metrics excluded both
  census sources, which was asymmetric: a competitor's own post that keyword
  search happened to find already counted, because it lands on source
  `discovered`, while the same post read off their profile did not. The
  run_summary sentiment distribution stays market-only (own posts carry the
  brand's framing of itself, not the audience's reaction), and so does the
  Content page's field tile, which keeps its separate "Your own posts" row —
  each filters at its own call site (`isDiscoveredVideo` in
  `lib/pipeline/metrics.ts`; `source = 'discovered'` in the Content read).
- **Readiness (operator only, 2026-09-15)**: `/dashboard/ops/readiness` — one
  row per input the product needs (rival accounts, tracked terms, Reddit
  communities, embeddings, months of history, coverage, updates, delivery, the
  change log, decisions, retention), each saying whether it is in place, who
  can move it, and what it unlocks. Gated on `getSessionContext().operator`,
  `notFound()` for anyone else; the workspace switcher chooses the tenant. It
  becomes a Settings section in Phase 1.
- Run state lives in `pipeline_runs.status`
  (`running`/`completed`/`partial`/`failed`); a run failure also emails
  `ALERT_EMAIL` when configured. A fifth value exists: `analyzing`, which
  `runPassA` opens a standalone analysis run at (`lib/pipeline/pass-a.ts`) and
  only `run-cd.ts`, the terminal stage of that CLI path, ever flips. Nothing in
  the pipeline closes it — `decideOpenRun` and `onFailure` both act on `running`
  alone, and the ops check's 14-day lookback is the only reason a run abandoned
  mid-path is not an alert every morning forever. `close-stranded-run.ts` is how
  one gets closed.

## Reports & Exports

The artifact system (2026-08-29/30; vault: Architecture/Reports-Exports).
Every dashboard page is a **loader** (`lib/pages/<page>.ts`) plus **renderers**
(`components/pages/<page>`, catalogue `components/pages/registry.ts`, keys
`<page>.<tile>`); the same data feeds the app, paper and the Studio.

- **The spine** (Stage 1): `POST /api/export` freezes a **snapshot**
  (`report_snapshots`: tile-ready data, quotes as refs, never their text) →
  headless Chrome prints `/render/<snapshot>` under a signed token → the file
  lands in the private `artifacts` bucket → `GET /api/artifacts/<id>` 302s to
  a one-hour signed URL. Erasure stales the artifacts whose snapshots cite a
  voice (`deleteCommentsProperly`); the next download re-renders without it.
  The page-bar Export menu and the tile controls were removed from the
  dashboard pages in Stage 3 (to be redone after the Studio); the routes and
  `scripts/export-smoke.ts` remain.
- **The Studio** (Stage 2; its own page since Stage 3, reshaped 2026-08-30):
  `/dashboard/studio` lists your reports down the left; the picked one on the
  right shows its reader, pages, builds, share links and its **sending**.
  A report is a `reports` row: pages + tiles + one framing line per section
  + "written for" (free text, `cover.reader`; a known register keeps its
  prompt). **New report** (`/dashboard/studio/new`) starts from one of the
  five templates (`lib/reports/templates.ts`, arrange existing pages only) or
  custom; **Edit** opens `/dashboard/studio/edit/<id>` (outline beside the
  deck preview). **Build** (`POST /api/reports/<id>/build`) runs every
  section's loader, writes the cover in the reader's register (`COVER_MODEL`,
  figures substituted by code, the model never sees a number or a quote),
  freezes it all into ONE snapshot of kind `report` (with `delta`, what moved
  since the previous update), prints the PDF. On paper the cover is the title
  and the page count; every page carries its page name and "Created by
  {company} with Verbatim · date" with the page number.
- **Sending** (Stage 3): a report's schedule, edited on the report itself:
  `report_schedules` (one per report; `report_id`, a cadence (every
  update / first update of the month, SAST), its own recipient list (≤ 25),
  attach the PDF, the share link's life; owners/admins edit, every member may
  look and preview. Every workspace has a default **Weekly digest** (an
  accepted invite joins its list; `tracking_configs.report_emails` is no
  longer read). After a scheduled update the pipeline emits
  `report/send.requested` → Inngest `send-weekly-report` finds the due
  schedules and, one step each, calls `POST /api/admin/schedules/run`
  (admin key) — the render never runs inside an Inngest step. The runner
  (`lib/schedules/run.ts`) claims `report_sends (schedule_id, run_id)` first
  (a retry cannot send twice), builds the snapshot, prints the PDF and the
  email's inline PNGs in one browser session, mints a share link, renders
  the **email from the same tiles** (`Renderable.email`, `components/email/*`
  — tables, inline styles, literal hex; the delta block leads) and sends
  through Resend with the PDF attached. A send stores ids, never the HTML:
  "the email as sent" re-renders from the snapshot
  (`GET /api/schedules/<id>/preview?send=`). **Reports** (`/dashboard/reports`)
  is the archive: Sent (with the pre-Stage-3 `weekly_reports` rows beneath)
  and Built. Ops: `POST /api/admin/send-report { clientId, scheduleId?, runId?,
  mode: preview|test|send, to? }`.
- **Share links**: `/r/<token>` renders a build live from its snapshot in
  app mode — no account, the evidence popovers work, dashboard links go
  quiet. 32-byte token, 7/30/90/no expiry, one-click revoke, optional
  password (scrypt), `noindex`, a view log (`share_views`: hashed address,
  agent). The token column is withheld from RLS reads; the Reports page shows
  links through the service role. `POST /api/share`.
- **Env**: `RENDER_TOKEN_SECRET` (signs render tokens and share-unlock
  cookies; falls back to the service-role key), `CHROME_PATH` (local dev
  only), `RENDER_BASE_URL` (optional origin override for the renderer).
- **Verify**: `scripts/render-page.ts` (any page / `--template` / `--report`
  to PDF, no session, snapshot deleted after; `--no-render` prints the cover
  and the delta), `scripts/send-report.ts` (a schedule's email: preview by
  default → `email-preview.html/.txt`; `--test <email>`; `--commit`),
  `scripts/export-smoke.ts`, `scripts/studio-smoke.ts` (the Studio, schedules,
  Reports, no export chrome — real browser, demo account),
  `scripts/share-smoke.ts`.

**Written reports** (`reports.kind = 'document'`, 2026-08-31; the Sales
brief first): the agent writes the document from the update in a role,
inside a fixed skeleton (`lib/reports/documents/`). A build is asynchronous:
`POST /api/reports/[id]/build` inserts a `report_builds` row and sends
`report/build.requested`; Inngest `build-document` runs research → write →
check → freeze as steps (model calls only; signals reload per step) and
`fetch`es `POST /api/admin/documents/render` for the PDF; the Studio polls
`GET /api/reports/[id]/builds/[buildId]`. The self-check judges each
finding's headline against the data (`check.ts`) and drops a contradicted
one, flagging the build. The Studio edits blocks in place as an overlay
(`report_edits`, `lib/reports/documents/edits.ts`; the snapshot never
changes, artifacts go stale) and shows the workings beside the page
(`report_snapshots.workings`, never selected by render or share).
`scripts/build-document.ts --report <id>` runs the same steps in process;
`scripts/eval-document.ts <snapshotId>` is the structural eval.

## Operator scripts

All run as `node --env-file=.env.local --import tsx scripts/<name>.ts`.

**Reading production, before you run any of them.** These scripts point at the
live database, and on 2026-09-16 a morning of unserialised agent reads — one of
them counting `audience_insights.embedding`, a 1536-float vector column — spent
the instance's disk-IO burst budget and the app answered 504 to paying
customers for about two hours. So: probe with a trivial query first and back
off for fifteen minutes if it is slow or errors; one reader at a time; no
timing loops and no `EXPLAIN ANALYZE` against the window functions; count
`embedding is not null` as a predicate and never `count(embedding)` (and note
that `embedded_at` is never backfilled, so it is not the same measure). SQL and
PostgREST are separate paths — every script here goes through PostgREST
(`createAdminClient`), which can refuse its schema cache while `select 1`
answers fine, so a green SQL query proves nothing about whether a script will
run. The full rules are in AGENTS.md; `loader-dump.ts` and `reading-timing.ts`
carry them in their own flags.

| Script | Purpose |
| --- | --- |
| `run-gather.ts` | CLI gather stage (Apify spend!) |
| `run-pass-a.ts` | CLI Pass A iteration (also the per-video re-read lever: `--video <id>` re-analyses and moves the video's pointer). **Persisting runs move `videos.analyzed_*` for every video they touch** — a `--min-comments`/`--limit`/`--platform` slice therefore rewrites what the corpus counts as current (and a below-override video is bookkept `skip`). Use `--dry-run`, or pass `trackAnalysis: false` when calling `runPassA` from a harness |
| `run-a2.ts` | Step A2 inspector (`--debug` prints similarity matrices) |
| `run-cd.ts` | Back half locally: metrics → A2 → Pass B/C/D → run_summary (A2 reads the corpus's *current* insights via `audience_insights_current`; `--run` is the run the output is written under) |
| `run-recs.ts` | Regenerate one run's recommendations only |
| `run-relevance.ts` | Relevance gate dry-run over stored videos — no Apify spend and no writes without `--prune`, but `--method` defaults to `gpt` and that call is real OpenAI money; `--method heuristic` is the free one |
| `run-tagging.ts` | Entity-tagging strategy comparison; `--write` re-stamps the stored corpus after `competitor_names` changes |
| `run-owned-events.ts` | Owned-account event detection |
| `diagnose-owned.ts` | Replays the owned-posts step outside Inngest — prints the in-window census per platform with dates; read-only unless `--commit` |
| `sealand-config-2026-09.ts` | Sealand's tracking config for the census pass (keywords, subreddits, competitor handles); dry by default, `--apply` writes |
| `send-report.ts` | A schedule's digest: preview / test send / real send |
| `seed-demo.ts` | Idempotent demo-tenant seeder (careful: doesn't recreate account_events/weekly_reports; after a re-seed, re-run the backfill block of `supabase/migrations/20260818090000_incremental_pass_a.sql` so the demo videos' `analyzed_run_id` points at W6 — the `*_current` views are empty until it does) |
| `regate-corpus.ts` | Re-apply the relevance gate post-hoc (`--apply` deletes). **The dry run is not free**: the gate's batched GPT call produces the would-drop list, so it runs before the `--apply` gate and a dry run spends the same OpenAI money an apply does |
| `backfill-transcripts.ts` | Transcript backfill for stored corpus |
| `ab-pass-a.ts` | Pass A transcript A/B harness (runs with `trackAnalysis: false` — arms write rows under throwaway runs without moving the corpus pointer) |
| `citation-floor.ts` | Citation-relevance floor calibrator (read-only). Aimed at an OLD run it now under-reports: that run's insights are pruned once a newer run supersedes them (incremental Pass A) |
| `theme-registry.ts` | Theme-identity inspector + repair lever — entries, observations, label history, weak-band matches; `--merge` / `--dormant` / `--revive` need `--apply` |
| `retention-dry.ts` | What tonight's retention sweep would do, read-only (`--refresh-sample N` also calls YouTube for N due comment ids and reports found/missing/edited — still read-only) |
| `erase-commenter.ts` | Erase one commenter on request: `--platform <p> --handle <h>` finds their rows across every tenant + the demo clone, the evidence/language samples the delete cascades, hero-quote copies, and prompt bodies inside 30 days; dry-run by default, `--apply` deletes and records the handle in `suppressed_commenters` so a re-scrape never brings it back. Prints the reply template. 7-day SLA per the privacy notice |
| `keyword-roi.ts` | Keyword ROI pruning table, worst first |
| `keyword-candidates.ts` | The add side of the same config: terms the corpus keeps showing (classifier topics + hashtags, minus everything already tracked), pooled over the last N runs. Read-only |
| `backfill-keyword-candidates.ts` | Recompute `keyword_candidates` for one run or every completed/partial run of a client (repairs a swallowed `keyword-discovery` step). Dry-run prints the top 30; `--apply` writes |

**Phase 0** (2026-09-15). Every one of these is dry by default; the flag that
writes is named on the row. Most read a table or function the Phase 0
migrations add, and each one behaves differently before its migration lands —
written as measured, not as intended:

- `embed-insights.ts` names the file and exits **having read and spent
  nothing** (it asks whether the write path exists before it prices anything).
- `coverage-report.ts` names the file and exits too, but only after reading the
  tenants and printing the report header — so it has read a fair amount by
  then. It spends nothing either way: no model, no Apify.
- `reconstruct-config-log.ts` is deliberately tolerant, because the useful time
  to read its dry run is *before* the log table exists.
- `backfill-run-windows.ts` and `monthly-reading.ts` print the driver's error
  (they select the new columns / call the new functions directly).
- `set-cadence.ts` and `set-competitor-handles.ts` **do not fail — and that is
  the trap.** `lib/config-log.ts` `updateWithActor` retries without the actor
  stamp when `tracking_configs.last_actor` is absent, so an `--apply` before
  `20260915091000_config_changes.sql` writes the change successfully,
  unattributed, and with no `config_changes` row (the audit trigger arrives in
  the same migration). Arming a tenant that way costs the usual $13–20 an
  update and leaves nothing behind saying who did it. Apply migration 2 first.
- `close-stranded-run.ts` needs no Phase 0 migration at all: it reads
  `pipeline_runs` and writes that row's `status` / `completed_at` /
  `error_message`, all of which have always existed.

| Script | Purpose |
| --- | --- |
| `backfill-run-windows.ts` | Label the window each historical run covered — after the fact and marked `window_basis = 'reconstructed'`, because it is the rule those runs followed, not a record of what they gathered. Skips any run that wrote its own window. `--apply` writes |
| `set-cadence.ts` | A tenant's `report_period` / `report_day` — the pair that decides whether the dispatcher picks it up (≈ $13–20 an update). The settings form cannot express `paused` and a save silently rewrote it; this can. Prints the cost and the recipients first. `--apply` writes, stamped |
| `set-competitor-handles.ts` | One rival's own accounts, merged into `competitor_handles` (what the census reads). Refuses a rival not in `competitor_names`, a platform no account can be read on, and a YouTube value that is not a channel id. Verify each handle by hand first. `--apply` writes, stamped |
| `reconstruct-config-log.ts` | The configuration history that predates the change log, inferred from `keyword_performance`, subreddit `discovered_at` and the repo's own git — every row `source = 'reconstructed'` with a note naming its evidence. Refuses to write a tenant twice. `--apply` writes |
| `monthly-reading.ts` | The comment-dated monthly reading, printed: one clustering asked of every month. `--write` seeds the back-read — months past their 30-day line stored `frozen` / `back_read`, the rest `filling` for the pipeline's `freeze-months` step to take over |
| `coverage-report.ts` | How much history clears the floor (months ≥ 100 videos and ≥ 100 comments, per audience) and what the anomaly rule would have flagged, replayed week by week. Writes a markdown report and nothing else — never a table, a model or a cent |
| `embed-insights.ts` | Drains the `audience_insights.embedding` backlog through the `set_insight_embeddings` RPC; the pipeline's own `embed-insights` step keeps it current from 2026-09-15, so this is the one-off and the catch-up after a failed step. `--apply` writes |
| `close-stranded-run.ts` | Close a run nothing else will. `analyzing` is what the standalone Pass A script parks a run at, and neither `decideOpenRun` nor `onFailure` knows that status. Closes it `failed` with a dated epitaph. `--apply` writes one UPDATE to one row |

**Phase 1** (2026-09-18). Dry by default, same rule: the flag that writes is
named on the row. **Five of these depend on migrations M1–M10, which are
authored on the branch and not yet applied** — each says what it does before
its migration lands, written as measured. The order they run in on a deploy is
not free: it is in [`docs/deploy-checklist.md`](docs/deploy-checklist.md), and `monthly-reading.ts
--write` is a ONE-SHOT that cannot be re-run against a month it has closed.

| Script | Purpose |
| --- | --- |
| `propose-subjects.ts` | Proposes a tenant's 5–8 subject candidates from its own-voice claims and its category's top themes — one `gpt-4.1-mini` call, ≈$0.002. **It writes no subject.** Confirming 5–8 in Settings › Subjects is the write, and a proposer that also wrote would be a proposer that had made the choice. `--apply` makes the call; `--prompt` prints it |
| `subject-membership.ts` | Decides subject membership across a tenant's whole live insight population — the one-off backfill before a subject row is shown to a client, and the catch-up when the pipeline step missed a run (Sealand is `paused`, so its step never fires on a schedule). Same module as the pipeline step, deliberately. **Refuses below 95% embedding coverage**: an unembedded insight is invisible to `subject_band()`, so the subject reads wrong rather than low. Run `embed-insights.ts --apply` first. `--apply` spends and writes; `--budget <usd>` caps |
| `subject-calibration.ts` | The precision gate, in two commands with a person in between. `--emit labels.jsonl` writes 200 (subject, insight) PAIRS — not 200 insights, which crossed with every subject is 1,000–1,600 labels — split evenly across subjects and drawn only from pairs at or above the lowest threshold tried. A person fills in every `null`. `--score labels.jsonl` prints precision at every threshold pair; `--apply` records the shipped pair's figure on each subject, stamped with an actor. **A subject under 85%, or with no figure, prints "calibrating" everywhere and its share is not shown to a client.** Recall below the floor is not measured by this sheet, and the script says so |
| `translate-quotes.ts` | The quote-translation cache in front of the pipeline step: the one-off that lets a back-read month and every already-shipped snapshot show an English rendering on day one. Dry run prints distinct uncached (comment, text) pairs, calls and cost. **`--limit` is in TEXTS, not comments** — a comment carries ≈1.22 displayable texts here, so `--limit 1000` reaches ≈810 comments, and a capped run spends slightly over the limit (the batch re-derives a sibling text the cap cut off mid-comment). `--apply` requires an explicit `--client` and `--limit`, because spending defaults are not defaults. ≈$0.7–1.8 per tenant the first time, then the cache |
| `migrate-schedule-keys.ts` | Moves a live schedule onto the weekly report's block keys — `starter_key` → `weekly_report`, `report_id` → null, `artefact` → `weekly` (the last only where M8 is applied), plus a `config_changes` row, because no trigger watches this table. **A migration and not a rename**: a stored section key is a contract, and renaming one in code would silently drop eight of ten tiles from a live weekly email. **One row by default** — the workspace's default schedule; `--schedule <uuid>` names one, `--all` asks for all of them on purpose. `--apply` writes |
| `clear-report-emails.ts` | Clears `tracking_configs.report_emails`, the dead recipient list. Recipients moved to `report_schedules` at T0-10 and nothing has read the column since, but it still holds four live Össur addresses and `authenticated` still holds column-level UPDATE on it — a trap for whoever next builds a recipients form. **The product does not clear it**: Settings prints the list, says nothing is sent to it, and asks. This is the act, and Heinrich runs it on his own word. `--apply` writes, one tenant at a time |
| `theme-key-backtest.ts` | The theme-key back-test — **read-only, no model, no `--apply`**. Every figure quoted in `lib/pipeline/theme-registry.ts`, `lib/pipeline/clustering.ts` and the WP2 note comes out of this file, so a later reader re-runs the measurement instead of trusting a comment. Three readings: `transitions` (the real thing — one run of corpus drift, both keys scored side by side), `cutover` (printed on two bases, `excl. latest` and `self-match`, because they differ roughly twofold) and `bump` (a Pass A prompt-version bump re-mints every insight id, so the insight arm scores zero and the video column IS the carry) |
| `stored-artefacts-smoke.ts` | Do the artefacts that are ALREADY BUILT still render every tile they name? Read-only. Four code paths resolve a stored page key and a list of tile keys, and **every one of them fails silently** when a key stops resolving — a deck drops the section, a share link renders nothing including the heading, an email skips the tiles. A 404 would at least be visible. Run it after any change to `components/pages/registry.ts`, `lib/reports/compose.ts` or a block registry; the bar is 36/36 |
| `loader-dump.ts` | Dumps every reading page's loader output for both tenants on a frozen clock, keys sorted, one JSON file a page. Take it in two trees and `diff -r`: that is how "this change is invisible to a client" gets checked rather than argued, and it is the only thing that caught a chunk size silently choosing four of a tenant's quotes. A read LOOP against production — `--confirm`, a probe first, `--max-loads` 12. `--confirm --out scratch/dump-new` |
| `reading-timing.ts` | Times every database read a reading page's loader makes. Read-only: it calls the loaders and throws the answers away. The number that matters is the READ COUNT, not the clock — it is the one that does not move when the instance has a bad minute. `summed/total` is the concurrency the page actually got; at 1 the page is a queue. The first round in a process is always slower, so ask for two and read the second. It is a read LOOP against production: it will not start without `--confirm`, it probes first and refuses a slow instance, and it refuses a plan above `--max-loads` (6) page loads. `--confirm --page "this week" --rounds 2 --client <uuid> --detail 30` |
