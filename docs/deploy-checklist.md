# Phase 1 — the deploy checklist

Written in WP22 from the real state of `feat/phase1` @ `d4e7dc1`, and
re-checked against the **Block C merge head `8d0d4ab`** (WP18–WP21 and WP23
merged in on 2026-09-16 at 14:37–14:43) in WP22's second pass — every command
read off the script's own header on the branch and every migration object read
off the migration file. Production was read-only throughout; where a figure
could not be re-checked it says so on the line rather than quoting a note.
Three things moved in that second pass: the gate baseline (0.5), the way the
Inngest ids are counted (0.8), and step 4's coverage query, which until then
printed the query that took production down.

**This file lives in the repo on purpose.** It is the one Phase 1 artefact an
operator needs at the keyboard, it names migrations and scripts that are in
version control, and a checklist that drifts from the branch it deploys is
worse than none — so it is reviewed in the same diff as the code it ships and
the README points at it by this path. The WP22 status note under
`~/.claude/plans/verbatim-phase1/status/` records how it was written; this is
the document you follow.

**Checked read-only against production on 2026-09-16 (SELECT only):**

| Fact | Today | Query |
|---|---|---|
| Phase 1's tables absent — **M1–M11 are not applied** | `to_regclass` null for `competitors`, `subjects`, `sent_figures` | precondition 0 |
| **No run in flight** | `pipeline_runs` not in (`completed`,`failed`,`partial`) → **0** | 0.1 |
| **201 frozen audience-months of 214** | exactly as the `monthly-reading.ts` header says | 5.4 |
| **Two schedules, both `active`, ZERO with recipients** | `report_schedules` → 2 / 2 active / 0 with recipients | 5.3, 5.6 |
| **Four dead addresses in `tracking_configs.report_emails`** | Össur 4, Sealand 0 | 5.5 |
| Tracked rivals **4**; `competitors` should hold **7** | tracked: Össur `{Ottobock}`, Sealand `{Cotopaxi, Freitag, Rareform}`; plus three Sealand retired | M1 |
| Tenants | 2 — Össur `e52cac94-…`, Sealand `ac16988e-…` | — |

The zero-recipients row is the one the single-window recommendation rests on,
and it holds. **The rivals row says two things and they are both true.** The
plan's §2 M1 line reads as seven TRACKED names and
`tracking_configs.competitor_names` holds four today (re-read 2026-09-16) — so
the tracked list is four. `competitors` is not the tracked list: M1's backfill
unions it with every rival the evidence names (`month_denominators.audience`,
`keyword_performance`, `themes`, `theme_registry`) and dates the untracked ones
`2026-09-09 18:10+02`. The migration states its own answer — seven rows, four
tracked plus Patagonia, Topo Designs and Poler retired — and that is what to
expect after the apply. **Four rows after M1 is a failed backfill, not a
correction to the plan.**

The one figure I could not get is embedding coverage: the query kept timing out
(see "Owed" at the bottom). It is step 4 and it gates step 5.1 anyway.

**This is ONE deploy, not two.** The plan (§5) split it R1 / R2 because R1
turns on the weekly email and R2 the monthly artefact. That split has no force
any more: **nothing emails anybody until an operator sets recipients**, and
both weekly schedules have none. So the code, all twelve migrations and every
backfill go out in one window, the recipients go on last and on purpose, and
the first email is a decision rather than a consequence of a deploy. The two
-window version is kept at the bottom, unchanged, in case something in step 1
or step 2 makes you want to stop halfway.

**The one thing that cannot be re-run:** `scripts/monthly-reading.ts --write`,
per tenant. Everything else on this page is idempotent or repeatable. That one
spends decision K's single opening into the 201 already-frozen audience-months
and the frozen guard refuses every later correction. It has three prerequisites
and they are in step 5 in the only order that works.

---

## 0 · Preconditions

Every one of these is a gate, not a nicety. **Twelve of them** — 0.0a, 0.0b,
0.0c and 0.1 through 0.9 — and do not start until all twelve hold.

| # | Precondition | How you know |
|---|---|---|
| 0.0a | **The database answers first time** | `select count(*) from clients;` through the MCP. If it times out, STOP. On 16 Sep the instance returned roughly one query in four while reporting `ACTIVE_HEALTHY`; applying twelve migrations through a transport that drops one connection in four is how you end up not knowing which of them landed. |
| 0.0b | **PostgREST answers too — it is a SEPARATE path and it can be down while SQL works** | `node --env-file=.env.local --import tsx scripts/stored-artefacts-smoke.ts`. On 16 Sep the MCP's direct SQL connection was intermittently fine while PostgREST returned `Could not query the database for the schema cache. Retrying.` on every attempt. **Every operator script in step 5 goes through PostgREST** (`createAdminClient`), so a green MCP query proves nothing about whether the backfills can run. Check both. |
| 0.0c | **The disk-IO budget is healthy — or the compute tier has been upgraded** | Supabase dashboard → Reports → **Disk IO**, and the burst balance in particular. 0.0a and 0.0b are the symptom; this is the cause. On 16 Sep five agents reading at once, one of them counting a vector column, spent the budget by 09:10 UTC and it had not come back by 15:16 SAST — `select 1` returned while the next catalog query timed out and PostgREST still refused its schema cache. **A restart does not refill an IO budget; hours do, or a larger instance.** This deploy is twelve migrations, two backfills that read the whole corpus and a rehearsal run, and the reading pages already load in 8–12 s on this tier (41–69 s when it is starved) — so **the recommendation is to upgrade compute before the deploy, not after it** (plan §Status, "Known and open after Block B", item 1 — where the 8–12 s page load is the R1 blocker and the fix is WP23's performance pass; the compute upgrade itself is a RECOMMENDATION, the plan's Status line of 2026-09-16 ~12:05, not a gate anybody has signed off). If you deploy on the current tier anyway, do it on a day nothing else is reading and expect step 5 to be slow rather than broken. |
| 0.1 | **No run in flight** on either tenant | `select id, client_id, status, started_at from pipeline_runs where status not in ('completed','failed','partial') order by started_at desc;` → zero rows (**verified 0 on 2026-09-16**). A run mid-flight when the code deploys replays completed steps by id, and M3's INSERT guard would meet Phase 0's writer inside an open freeze. |
| 0.2 | **Outside 04:00–09:00 SAST** | The retention sweep runs at 04:00 (live since 24 Aug) and the Sunday dispatcher wakes in that band. Deploy after 09:00 and before 22:00 SAST, and not on a Sunday. |
| 0.3 | **OpenAI credits present** | The balance has been zero all week and a model call fails 429. Three backfills spend: subject-membership ($0.14–0.25/tenant), translate-quotes ($0.7–1.8/tenant), propose-subjects ($0.002/tenant). Check the dashboard, not a note. |
| 0.4 | **`main` merged into `feat/phase1`** | `git fetch origin && git merge origin/main` on the branch, then the four gates again. Any hotfix landed on `main` since the branch's merge base (`git merge-base main HEAD` — `d27c98d`, merged in on 2026-09-16) has to be under the branch before it goes back. |
| 0.5 | **All four gates green on the merged head** | `npx vitest run` (**242 files / 4,514 tests**, measured on the Block C merge head `8d0d4ab`, 2026-09-16 15:06 SAST; the 241 / 4,432 in the first draft of this file predates WP18–WP21 and WP23) · `npx tsc --noEmit` · `npm run lint` · `npx next build --webpack`. If `tsc` reports `Cannot find module '…/route.js'` from `.next/types/`, rebuild first — stale generated types, not a defect. |
| 0.6 | **The Turbopack build green too** | `TURBOPACK_ROOT=/Users/heinrichviljoen/Documents/code npx next build`. This is the bundler Vercel runs and the only gate that catches a bundler-only break before a deploy does. |
| 0.7 | **`stored-artefacts-smoke` 36/36** | `node --env-file=.env.local --import tsx scripts/stored-artefacts-smoke.ts`. **This one is still owed.** Attempted three times on 16 Sep — once during the Block C merge (~10:30) and twice in WP22's second pass (15:12 and 15:16 SAST): every attempt died on its FIRST read, `reports: Could not query the database for the schema cache. Retrying.`, while `select 1` through the MCP returned in about two seconds. That is 0.0b's case, live. WP19 REPLACED the Reports page, and this is the check that catches a stored page key breaking silently. Do not deploy without it. |
| 0.8 | **The Inngest step-id diff is five insertions and nothing else** | `git diff origin/main..HEAD -- inngest/functions/pipeline.ts` and read the ids. **`grep -c '\.run(' inngest/functions/pipeline.ts` → 48 on `main`, 53 on the branch** (49 and 54 if you also count `step.sendEvent('request-report')`, which Inngest memoises the same way — both pairs appear in the notes, so say which you counted). In their own positions: `plan-translate-quotes` / `translate-quotes:N-of-M` (after the Pass A wave, before `embed-insights`), `plan-subject-membership` / `subject-membership:N-of-M` (before `cross-reference`), `anomaly-check` (after `freeze-months`). Zero removals, zero reorderings. |
| 0.9 | **A whole-branch review has run** (plan §3.2) | Fresh eyes, never an author. |

---

## 1 · Ship the code

**The code goes first and the migrations follow it.** This is a recorded rule,
not a preference (plan §Status, "Known and open after Block B", item 2: "the apply must NOT
precede the code deploy"), and the mechanism is live on `main` today. M3's
insert guard forgives a new key in a closed audience-month only where no row of
that audience-month was written by another transaction
(`month_reading_written_here(t.xmin)`, `20260918092000_reading_windows.sql`).
`main`'s freeze writer upserts in flat chunks of 500 through PostgREST —
`chunk(rows, 500)` in `lib/reading/monthly.ts`, one transaction per chunk — so
the moment a freeze spills one audience-month across two chunks, the second
chunk is a new key arriving after a committed sibling and the guard raises.
That is the Block A critical. The branch fixes it (`chunkByAudienceMonth`, plus
a merge that drops a fresh key in a closed audience-month and names it in
`refusedLate`); `main` does not. Apply M3 over `main` and the next freeze — a
Sunday run, a manual trigger, a retry — meets a guard the code it is running
does not know about.

The reverse gap is the one the `isMissing*` guards exist for: new code over
un-applied migrations degrades honestly, printing "not recorded" and 200s
rather than 500s. That is a page that reads thin for an hour. The other way
round is a failed step in a freeze.

So: ship, confirm READY, then apply — and keep the gap short.

1. `git checkout main && git merge --no-ff feat/phase1` — no fast-forward, so
   the Phase 1 line is one readable merge on `main`.
2. `git push origin main`. Vercel builds it. **Vercel builds its own bundle** —
   never promote a CI or local artifact, which carries dummy `NEXT_PUBLIC_*`
   values Next inlines into the client JS.
3. Wait for the deployment to read **READY** in Vercel. Not "building", not
   "queued".
4. **Re-register Inngest:**
   `curl -X PUT https://app.verbatimintel.com/api/inngest`
   An in-flight run across an unregistered deploy is the failure this exists to
   stop, and precondition 0.1 is why there is no in-flight run. **Do not go
   looking for 54 step ids in the Inngest UI**: a PUT registers FUNCTIONS, and
   Inngest discovers a step when a run reaches it — and many of the ids are
   templates (`gate:${platform}`, `comments:${platform}:${n}`,
   `pass-a:${i}-of-${n}`, `translate-quotes:${i}-of-${n}`, …) that do not exist
   until a run mints them. The step-id check is precondition 0.8, read off the
   ordered diff of `inngest/functions/pipeline.ts`, and it is done before you
   get here.
5. Load two pages signed in — `/dashboard` and `/dashboard/reports` — before
   you apply anything. The code is new and the migrations are NOT yet applied,
   which is the state the `isMissing*` guards were written for: expect "not
   recorded" where a Phase 1 table would be read, and expect a 200. A 500 here
   is a guard that does not cover what it claims to, and it is cheaper to find
   it now — nothing is spent and the schema has not moved.

---

## 2 · Apply the migrations

**Only once §1 reads READY.** See §1's first paragraph for why the apply
follows the deploy rather than leading it. Do not leave the gap open longer
than it takes to read twelve verification queries: between §1 and §2 every
Phase 1 surface says "not recorded", and a Sunday dispatcher or a manual
trigger in that gap runs the new pipeline against a Phase 0 schema — which its
steps no-op against by design, but it is a run that does less than it should.

Twelve files, **in filename order**, one at a time through the Supabase MCP
(project `mkwjlckescdveosvrvaq`). Read the verification query's answer before
starting the next file. A regex character class inside a migration must be
written with `chr()` — the MCP transport decodes `\u` escapes (Phase 0's
lesson, proven harmless once and not worth proving twice).

**Order matters twice over.** M3's insert guard must exist before M4–M6 create
tables that rely on the same function; M6's delete guard installs triggers on
all six month tables and therefore needs M4 and M5 to have created theirs.

**There is no separate index step, and that is deliberate.** **Thirty**
indexes are created across the twelve files — competitors 3, subjects 7,
kind_mood_attention 5, quote_translations 3, anomaly_flags 3, settings 4,
sent_figures 3, reading_indexes 2, **five** of them `unique`
(`competitors_client_slug_live_idx`, `subjects_live_name_idx`,
`gate_appeals_one_per_verdict`, `gate_appeals_one_per_unrun_verdict`,
`report_schedules_one_per_artefact`); theme_key,
reading_windows, plan_check_notice and report_family_grants create none — and **not one is
`CONCURRENTLY`**
— a concurrent build cannot run inside the transaction a migration is applied
in, and every table being indexed is small (M10's own note: `videos` 8,377 rows
/ 27 MB, `gate_verdicts` smaller). So each index is built by the file that
needs it, inside its apply, in the seconds that takes. If you are looking for a
list of indexes to run by hand after the migrations, there isn't one; if a
future index lands on a table big enough to need `CONCURRENTLY`, it needs its
own step here and its own migration file, because it cannot share theirs.

Each file was applied twice over `schema-baseline.sql` on a throwaway PG 17
cluster (the Block C merge: 62 migrations, 0 errors; the eleven re-applied over
themselves, 0 errors — and the block fixer re-ran the whole set plus M11 on a
fresh PG 17.11 cluster, 0 errors, M11 applied twice). They are idempotent.
Re-running one after a partial failure is safe.

### The verification query per migration

Run each immediately after its file. Every one is SELECT-only.

**M1 · `20260918090000_competitors.sql`**
```sql
select
  (select count(*) from information_schema.columns
     where table_name='competitors' and table_schema='public')                as competitor_cols,
  (select count(*) from public.competitors)                                   as rivals,
  (select count(*) from public.competitors where retired_at is not null)      as retired,
  (select count(*) from information_schema.columns
     where table_name='config_changes'
       and column_name in ('affects_audiences','affects_months'))             as cc_cols,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('rival_slug','rename_rival'))  as fns,
  (select count(*) from pg_policies
     where tablename='competitors')                                            as policies,
  (select pg_get_constraintdef(oid) from pg_constraint
     where conname like 'config_changes%surface%check%' limit 1)               as surface_check;
```
Expect: `cc_cols = 2`, `fns = 2`, `policies = 1`, and `surface_check`
containing `prompt_version` and `rival_rename`.

**`rivals = 7`, `retired = 3`, and the three are nameable in advance.** The
migration says so itself — `20260918090000_competitors.sql`, the backfill's
own head: "Seven rows: Össur 1 (Ottobock), Sealand 6 (Cotopaxi, Freitag,
Rareform tracked; Patagonia, Topo Designs, Poler retired)" — and its post-apply
check is `select count(*) from public.competitors; -- 7`. Four of those are the
tracked list (Össur `{Ottobock}`, Sealand `{Cotopaxi, Freitag, Rareform}` —
re-read on production 2026-09-16); the other three are rivals Sealand once
tracked and no longer does, which the backfill finds in the evidence
(`theme_registry` carries `competitor:Patagonia` and `competitor:Topo Designs`,
`keyword_performance` carries `poler` — read read-only in the WP22 review;
today's re-check dropped its connection twice, which is the instance's known
flakiness and not a change in the answer) and dates `2026-09-09 18:10+02`.

**`rivals = 4` is a FAILURE, not a pass.** It means the backfill's evidence
arms found none of the three and Sealand's erased set is silently absent from
the identity table — the exact loss `competitors` exists to prevent. Read the
number M1 writes against 7, and reconcile:
```sql
select name, slug, first_seen_at, retired_at from public.competitors order by client_id, name;
```
against `select client_id, competitor_names from public.tracking_configs;`.
The three `retired_at` rows must be Patagonia, Topo Designs and Poler. A fourth
retired row, or one under another name, is the backfill picking up a sentinel —
check it is not `unknown` (the migration excludes that one deliberately). More
than seven rows is a rival the evidence names and this note did not; read it
before you move on, because a name here is what a frozen month's `audience`
string will be reconciled against for the rest of the product's life.

**M2 · `20260918091000_theme_key.sql`**
```sql
select
  (select count(*) from information_schema.columns where table_schema='public'
     and (table_name,column_name) in
       (('theme_registry','member_video_ids'),('theme_observations','member_video_ids'),
        ('theme_observations','match_arm'),('theme_observations','prompt_version'),
        ('theme_observations','reread_share'),('pipeline_runs','clustering_key'),
        ('month_denominators','clustering_key'),('month_theme_readings','clustering_key')))  as cols,
  (select count(*) from public.theme_registry where cardinality(member_video_ids) > 0)       as backfilled,
  (select count(*) from public.theme_registry)                                               as entries,
  (select count(*) from public.theme_observations where cardinality(member_video_ids) > 0)   as obs_backfilled,
  (select count(*) from public.theme_observations)                                           as observations,
  (select count(*) from information_schema.role_table_grants
     where table_schema='public'
       and table_name in ('themes','theme_registry','theme_observations')
       and grantee in ('anon','authenticated')
       and privilege_type in ('INSERT','UPDATE','DELETE'))                                   as leftover_writes;
```
Expect `cols = 8` and `leftover_writes = 0`. The two backfills are separate
tables with separate misses, and the migration measured both on 2026-09-15:

- **`entries − backfilled` ≈ 67.** Össur 1,096 of 1,096, Sealand 1,860 of
  1,927. The 67 have no `themes` row at all to lift from — debris from two
  retried `persist-themes` runs whose first attempt's theme rows were deleted
  by the retry while the observations upsert kept the entries alive.
- **`observations − obs_backfilled` ≈ 120.** A different table and a different
  count, same cause. An observation's video set is the `themes` row of ITS OWN
  run, so a run whose theme rows a retry took keeps `'{}'`.

**Both numbers grow by roughly thirty per retried run of that size**, so they
are readings and not constants: a larger gap is not a failed backfill unless
the gap is most of the table. A gap of ZERO on either is the surprise worth
stopping for — nothing has re-created the deleted `themes` rows.

**M3 · `20260918092000_reading_windows.sql`** — the first of the two guards.
```sql
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in
       ('window_denominators','window_theme_readings',
        'month_reading_written_here','month_reading_frozen_insert_guard'))   as fns,
  (select count(*) from pg_trigger
     where tgname in ('month_denominators_frozen_insert_guard',
                      'month_theme_readings_frozen_insert_guard'))            as insert_guards,
  (select count(*) from information_schema.role_routine_grants
     where routine_schema='public'
       and routine_name in ('window_denominators','window_theme_readings')
       and grantee in ('anon','authenticated','PUBLIC'))                      as leaked_execute,
  (select count(*) from information_schema.role_routine_grants
     where routine_schema='public'
       and routine_name in ('window_denominators','window_theme_readings')
       and grantee = 'service_role')                                          as service_execute;
```
Expect `fns = 4`, `insert_guards = 2`, `leaked_execute = 0`, `service_execute = 2`.
The functions are SECURITY DEFINER with a pinned `search_path`; confirm with
`select proname, prosecdef, proconfig from pg_proc where proname like 'window_%readings' or proname='window_denominators';`
— `prosecdef = t` and `proconfig` naming `search_path`.

**M4 · `20260918093000_subjects.sql`**
```sql
select
  (select count(*) from information_schema.tables where table_schema='public'
     and table_name in ('subjects','subject_memberships','month_subject_readings','moves'))  as tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in
       ('subject_band','monthly_subject_readings','window_subject_readings'))                as fns,
  (select count(*) from pg_trigger where tgname in
     ('month_subject_readings_frozen_guard','month_subject_readings_frozen_insert_guard',
      'subjects_status_audit','subjects_retirement_is_final','subjects_retirement_freeze',
      'subjects_lineage_same_tenant','moves_target_same_tenant'))                            as triggers,
  (select count(*) from pg_policies where tablename in
     ('subjects','subject_memberships','month_subject_readings','moves'))                    as policies,
  (select count(*) from information_schema.role_table_grants
     where table_schema='public' and table_name='month_subject_readings'
       and grantee='service_role' and privilege_type='TRUNCATE')                             as truncate_left;
```
Expect `tables = 4`, `fns = 3`, `triggers = 7`, `policies = 8`
(`subjects` 3 · `subject_memberships` 1 · `month_subject_readings` 1 ·
`moves` 3), `truncate_left = 0`. The four in the parenthesis sum to eight; the
line said seven, which is a correct apply reading as a mismatch, and an
operator who waves one mismatched count through at 22:00 waves the next one
through too.

**M5 · `20260918094000_kind_mood_attention.sql`**
```sql
select
  (select count(*) from information_schema.tables where table_schema='public'
     and table_name in ('month_kind_readings','month_audience_stats','attention_panels'))    as tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in
       ('monthly_kind_readings','window_kind_readings','monthly_audience_stats'))            as fns,
  (select count(*) from pg_trigger where tgname in
     ('month_kind_readings_frozen_guard','month_kind_readings_frozen_insert_guard',
      'month_audience_stats_frozen_guard','month_audience_stats_frozen_insert_guard'))       as guards,
  (select count(*) from pg_indexes where schemaname='public'
     and indexname in ('videos_client_account_idx','videos_client_upload_date_idx'))         as idx;
```
Expect `tables = 3`, `fns = 3`, `guards = 4`, `idx = 2`. `attention_panels` is
append-only: `select privilege_type from information_schema.role_table_grants
where table_name='attention_panels' and grantee='service_role';` must show
SELECT and INSERT and no UPDATE, DELETE or TRUNCATE.

**M6 · `20260918095000_quote_translations.sql`** — the DELETE guard, on all six.
```sql
select
  (select count(*) from information_schema.tables where table_schema='public'
     and table_name in ('comment_translations','month_evidence_refs'))                       as tables,
  (select count(*) from pg_trigger where tgname like '%\_delete\_guard')                     as delete_guards,
  (select count(*) from pg_trigger where tgname in
     ('month_evidence_refs_frozen_guard','month_evidence_refs_frozen_insert_guard'))         as refs_guards,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and p.proname in ('month_reading_delete_guard','monthly_evidence_refs'))              as fns;
```
Expect `delete_guards = 6` — one per month table — `refs_guards = 2`, `fns = 2`.
Then the shape check that matters, which is that every month table now carries
**three** distinct guards:
```sql
select c.relname, count(*) as guards
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and c.relname in ('month_denominators','month_theme_readings','month_subject_readings',
                    'month_kind_readings','month_audience_stats','month_evidence_refs')
group by 1 order by 1;
```
Six rows, **3 each**. Two is a missing guard, not a tidier design.

**M7 · `20260918096000_anomaly_flags.sql`**
```sql
select
  (select count(*) from information_schema.tables where table_schema='public'
     and table_name in ('anomaly_checks','anomaly_flags'))                                   as tables,
  (select count(*) from information_schema.role_table_grants where table_schema='public'
     and table_name in ('anomaly_checks','anomaly_flags') and grantee='service_role'
     and privilege_type in ('UPDATE','DELETE','TRUNCATE'))                                   as writable,
  (select count(*) from pg_policies where tablename in ('anomaly_checks','anomaly_flags'))   as policies;
```
Expect `tables = 2`, **`writable = 0`**, `policies = 2`. Append-only means
append-only, and the consequence is on the rehearsal in step 7.

**M8 · `20260918097000_settings.sql`** — the one with TWO privacy limbs.
```sql
select
  (select array_agg(column_name order by column_name) from information_schema.column_privileges
     where table_schema='public' and table_name='gate_verdicts' and grantee='authenticated') as gv_cols,
  (select array_agg(column_name order by column_name) from information_schema.column_privileges
     where table_schema='public' and table_name='video_claims' and grantee='authenticated')  as vc_cols,
  (select count(*) from information_schema.role_table_grants
     where table_schema='public' and table_name='video_claims' and grantee='service_role'
       and privilege_type in ('UPDATE','TRUNCATE'))                                          as vc_writable,
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='gate_appeals')                              as appeals,
  (select count(*) from information_schema.columns
     where table_name='report_schedules' and column_name='artefact')                         as artefact_col,
  (select pg_get_constraintdef(oid) from pg_constraint
     where conname='report_schedules_cadence_check')                                         as cadence_check,
  (select count(*) from pg_policies
     where tablename in ('gate_verdicts','gate_appeals','video_claims'))                     as policies,
  (select count(*) from pg_indexes where indexname='report_schedules_one_per_artefact')      as uniq;
```
**Both column lists, and neither is optional.** Both are
`array_agg(… order by column_name)`, so they print alphabetically and can be
diffed against these strings character for character. `gv_cols` must be exactly
`{client_id, created_at, id, kept, keyword, platform, run_id, source, video_id}`
and must **not** contain `caption_excerpt`, `account_name` or `reason`.
`vc_cols` must be exactly
`{claim, client_id, created_at, entity, id, platform, run_id, source_video_id}`
and must **not** contain `quote` — M8 grants `authenticated` those eight
columns of `video_claims` by name and withholds the ninth for the reason it
withholds `gate_verdicts.caption_excerpt`: the quote is "a whole sentence of a
third party's speech" out of a video's own transcript, and a row-level policy
cannot tell a member from an owner. The subject proposer reads it server-side
and hands the browser labels and counts. A `quote` in that list is the privacy
failure of the whole apply, and counting `video_claims` policies does not see
it.

`vc_writable` must be **0**. `revoke all … from authenticated, anon` does not
touch Supabase's default `arwdDxtm` for `service_role`, so M8 revokes UPDATE
and TRUNCATE by name on the table it has just opened to a tenant session
(M4 and M5 learned the same thing about the month tables). Pass D-a rewrites
the claim set and never edits a stored claim in place.

`cadence_check` must contain `quarterly`. Expect `appeals = 1`,
`artefact_col = 1`, `policies = 4`, `uniq = 1`.

**Four, not three**, and this is the one the page tells you to stop on.
`gate_verdicts` carries TWO policies after M8: its own "Members read their gate
verdicts", plus the pre-existing "Superadmins read gate_verdicts" from
`20260821130000_gate_verdicts.sql`, which is dated well before the Phase 1
files and is applied on production already. So `gate_appeals` 1 +
`gate_verdicts` 2 + `video_claims` 1 = 4, on production as on a fresh cluster.

**M9 · `20260918098000_sent_figures.sql`**
```sql
select
  (select count(*) from information_schema.columns where table_name='report_snapshots'
     and column_name in ('reading_at','month','month_status','window_basis'))                as snap_cols,
  (select count(*) from pg_constraint where conname in
     ('report_snapshots_month_status_check','report_snapshots_window_basis_check')
     and convalidated)                                                                       as checks_valid,
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='sent_figures')                              as tbl,
  (select count(*) from pg_trigger where tgname='sent_figures_frozen_guard')                 as guard,
  (select count(*) from information_schema.role_table_grants where table_schema='public'
     and table_name='sent_figures' and grantee='service_role'
     and privilege_type in ('DELETE','TRUNCATE'))                                            as deletable;
```
Expect `snap_cols = 4`, `checks_valid = 2`, `tbl = 1`, `guard = 1`,
`deletable = 0`. The four columns are what `isMissingReadingColumns` narrows
by; until they exist the whole product degrades honestly, which is why the
apply may not precede the code deploy but may follow it by an hour.

**M9.1 · `20260918098100_plan_check_notice.sql`**

**The column's existence proves nothing here.** M9 already carries the same
`alter table public.plan_checks add column if not exists notice text`, so
`count(*) … where column_name='notice'` returns 1 after M9 alone and the check
cannot fail. What M9.1 alone writes is the COLUMN-level ACL:
```sql
select
  (select count(*) from information_schema.columns
     where table_name='plan_checks' and column_name='notice')                    as col,
  (select a.attacl is not null from pg_attribute a
     where a.attrelid = 'public.plan_checks'::regclass and a.attname = 'notice') as col_acl;
```
Expect `col = 1` (true after M9 too) and **`col_acl = true`** (M9.1's, and only
M9.1's — M9's grants on this table are table-level, which leaves
`pg_attribute.attacl` null).

**Do not skip the file**, even though the two overlap: `schema-baseline.sql`
carries zero grant statements, so on a freshly built cluster `notice` is
unreadable to `authenticated` without this line, and the file is one idempotent
ALTER plus two grants. **But it should not stay a separate file.** Its own head
says why it is one — M9 was being written in a sibling worktree and two
packages creating one file is an add/add conflict at merge — and that reason
expired when the branches merged. Folding it into M9 is a tidy for after the
deploy, not during it.

**M10 · `20260918099000_reading_indexes.sql`**
```sql
select indexname from pg_indexes where schemaname='public'
 and indexname in ('videos_analysed_record_idx','gate_verdicts_client_time_idx');
```
Expect both. These are WP23's; without them the reading pages are back to
7–21 s.

**Then one decision, in the same window, with the migration applied.** M10's
`videos_analysed_record_idx (client_id, analyzed_run_id, id)` is a strict key
prefix superset of `videos_analyzed_run_idx (client_id, analyzed_run_id)`, from
August's incremental-Pass-A migration. Both are now maintained by every gather
and by every Pass A `updateBookkeeping` — which writes that index's key column
AND all four of its payload columns per video — so the old one costs write time
and answers nothing the new one cannot. Dropping it gives most of M10's write
cost back:

```sql
-- only after the two indexes above are confirmed present
drop index if exists public.videos_analyzed_run_idx;
```

M10 does not do it: a migration for the reading pages should not quietly remove
an index the pipeline has planned against since August. Check first that nothing
names it (`grep -r videos_analyzed_run_idx` over the repo, and no plan pinned to
it), then drop it or leave it deliberately. Leaving it costs one extra index
maintained per analysed video; it breaks nothing.

**M11 · `20260918099500_report_family_grants.sql`**
```sql
select table_name, string_agg(distinct privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated')
  and table_name in ('report_snapshots','report_sends','report_builds','report_edits',
                     'reports','artifacts','export_events','weekly_reports',
                     'share_links','agent_threads','agent_messages')
group by 1 order by 1;
```
Expect **ten rows reading `SELECT` and nothing else** — and `share_links`
absent from the result, because it holds no TABLE-level SELECT at all (its
`authenticated` grant is a column list, which is how the token and the password
hash stay off a session client). Check that too, and check the token is still
not in it:
```sql
select string_agg(column_name, ', ' order by column_name)
from information_schema.column_privileges
where table_name='share_links' and grantee='authenticated' and privilege_type='SELECT';
```
Expect `client_id, created_at, created_by, expires_at, id, last_viewed_at,
revoked_at, snapshot_id, title, view_count` — ten columns, with `token` and
`password_hash` absent.

**Why it exists:** those eleven tables carried the project's default ALL grant
for `anon` and `authenticated` with ONE policy each, all SELECT. RLS covers
SELECT, INSERT, UPDATE and DELETE; it does not cover TRUNCATE, and there is no
TRUNCATE policy to write. Measured on the cluster as `authenticated`: DELETE 0,
UPDATE 0, INSERT refused — and `truncate public.agent_threads cascade` emptied
both tenants' threads and their messages. Nothing reaches it through PostgREST,
which issues no TRUNCATE verb, so this is a posture fix rather than an incident.
It touches no service-role grant and no SELECT, so nothing the app does can
change: every writer on this family is the service role.

### The two guards, proven rather than counted

Counting triggers proves they are installed. Prove they FIRE, once, on a
throwaway row of a **filling** month you then delete — never against a frozen
one, and never on a real audience-month. Or skip it: both guards are covered by
the local-cluster pass and by `lib/reading/*.test.ts`, and a live probe on a
month table is exactly the kind of cleverness this record exists to refuse.
**Recommended: skip. Count the triggers, read their `pg_get_triggerdef`, move
on.**

### Then load the two pages again

`/dashboard` and `/dashboard/reports`, signed in, the same two you loaded at
the end of §1. Now the migrations are applied and the code is new: where the
first pass said "not recorded" this one should read a number or an honest empty
state (the tables exist and hold nothing until step 5). Anything that 500s here
and did not in §1 is a migration this code disagrees with, and it is the last
moment to find that out with nothing spent.

---

## 3 · Confirm the subjects (Heinrich, in the product)

**This is a person's step and it comes before every backfill.** The plan
originally put it after the membership pass, which inverts the order
`monthly-reading.ts` pins in its own header. `loadActiveSubjects` filters
`status = 'active'`, so a membership pass run before confirmation judges
nothing; `backReadBlockers` would refuse at run time, so the shot could not
actually be spent out of order — but as written the runbook walked you into
the refusal.

Per tenant (Össur, then Sealand):

1. Optional, and $0.002: `node --env-file=.env.local --import tsx scripts/propose-subjects.ts --client <uuid>` (dry — prints the prompt and the two pools), then `--apply` for the one `gpt-4.1-mini` call. It writes no subject; it prints candidates.
2. **Settings › Subjects: name and confirm 5–8.** Confirming is the write.
   A subject named after step 5 has no history and can never be given one —
   decision K, and the frozen guard is what enforces it.

Verify before moving on:
```sql
select client_id, status, count(*) from public.subjects group by 1,2 order by 1,2;
```
Every tenant you intend to seed must show 5–8 rows at `status = 'active'`.

---

## 4 · Embeddings, and the coverage floor

`subject-membership` **refuses below 95% coverage**, and it is right to: an
unembedded insight is invisible to `subject_band()`, so a subject scored
against a half-embedded corpus does not read low, it reads wrong, silently.

**Ask the script, not the database.** Its dry run prints the same two numbers
the refusal reads, through the same path, and it is 5.1's dry run anyway — so
this is one command rather than two:

```
node --env-file=.env.local --import tsx scripts/subject-membership.ts --client <uuid>
# [subject-membership] <uuid>: 1680/3129 insights embedded (53.7%)
```

If you want it in SQL, **count the PREDICATE, never the column**:

```sql
select client_id,
       count(*)                                        as insights,
       count(*) filter (where embedding is not null)   as embedded,
       round(100.0 * count(*) filter (where embedding is not null)
             / nullif(count(*), 0), 1)                 as pct
from public.audience_insights_current group by 1 order by 1;
```

Three things about that query, and this file printed the wrong one until
2026-09-16:

- **`count(embedding)` is banned.** It asks a question about null-ness and pays
  for every 1536-float vector to answer it. It is the query that took
  production down on 16 September — 56 s at 08:40 UTC, 94 s at 09:10, the
  instance's disk-IO burst budget gone, PostgREST unable to load its schema
  cache and 504s to paying customers for about two hours. The rule is in
  AGENTS.md; the version above reads the null bitmap and not the vectors.
- **`embedded_at is not null` is not the substitute either.** The column
  arrived with `20260915094000_insight_embedding.sql` and is never backfilled,
  so every vector written before that date reads as unembedded: it would tell
  you a fully embedded tenant is at 0% and walk you into a backfill you do not
  need. It answers "when was the last vector written", nothing else.
- **`audience_insights_current`, not the base table** — that is the population
  `match_insights` searches, so it is the only honest denominator, and it is
  the one `embeddingCoverage` (`lib/agent/retrieve.ts`) uses.

**Last measured: Össur 1,680 of 3,129, Sealand 785 of 2,872** (2026-09-15,
recorded in `lib/agent/retrieve.ts`, before the pipeline's own `embed-insights`
step began keeping it current). Both were far below the floor then, and every
Sunday since has been pulling them up — so read the number, do not assume
either answer.

Below 95% on either tenant:
`node --env-file=.env.local --import tsx scripts/embed-insights.ts --client <uuid> --apply`
(≈$0.003 the whole backlog; `EMBED_WRITE_CHUNK` is 25 since the Phase 0 hotfix,
because PostgREST's `authenticator` role carries `statement_timeout = 8s` and
100 HNSW inserts exceed it).

---

## 5 · The backfills, dry run first, in THIS order

The order is not a preference. Each step is a prerequisite of the next, and
step 5.4 is the one-shot.

### 5.1 · Subject membership, per tenant

```
# dry — prints coverage, the plan and the estimate, spends nothing
node --env-file=.env.local --import tsx scripts/subject-membership.ts --client <uuid>
# apply
node --env-file=.env.local --import tsx scripts/subject-membership.ts --client <uuid> --apply --budget 1.00
```
≈$0.14–0.25 per tenant. Run to **completion** — a partial pass means a subject
with no members at the instant step 5.4 runs, and that subject is refused a row
in the 201 frozen months for ever. Verify:
```sql
select s.client_id, s.name, count(m.*) as members
from public.subjects s
left join public.subject_memberships m on m.subject_id = s.id
where s.status='active' group by 1,2 order by 1,2;
```
Every active subject should have members. One with zero is a real answer
(nobody talks about it) — but check it is not a coverage failure first.

### 5.2 · Quote translations, per tenant

```
# dry — distinct uncached (comment, text) pairs, calls, cost. Spends nothing.
node --env-file=.env.local --import tsx scripts/translate-quotes.ts --client <uuid>
# apply — BOTH flags are required, because spending defaults are not defaults
node --env-file=.env.local --import tsx scripts/translate-quotes.ts --client <uuid> --limit 2000 --apply
```
≈$0.7–1.8 per tenant the first time, then the cache. **`--limit` is in TEXTS,
not comments** — ≈1.22 texts per comment here, so `--limit 2000` reaches ≈1,640
comments — and a capped run spends slightly over the limit, because a batch
re-derives a sibling text the cap cut off mid-comment. Read the dry run's two
numbers side by side before you choose the limit. Re-run until the dry run
reports nothing needing.

This is out of the plan's stated order (it had translations after the seed).
**It belongs before**, because the seed freezes evidence refs for the 201
closed months and the point of the one-off is that a back-read month can show
an English rendering on day one rather than accumulating one a week at a time.
Nothing in the seed depends on a translation, so the move is free — but it is a
deviation from §5 and it is named here on purpose.

### 5.3 · Schedule keys, per tenant

```
# dry — what each schedule sends now, what it would send after, what is left
node --env-file=.env.local --import tsx scripts/migrate-schedule-keys.ts --client <uuid>
# apply, ONE ROW
node --env-file=.env.local --import tsx scripts/migrate-schedule-keys.ts --client <uuid> --apply
```
One row by default — the workspace's default schedule. `--schedule <uuid>`
names one; `--all` asks for all of them on purpose, and a document or brief
schedule with its own `report_id` is not "row by row" however carefully the
preview is read. It writes `starter_key` → `weekly_report`, `report_id` → null,
`artefact` → `weekly` (that last only because M8 is now applied), plus a
`config_changes` row. The OLD report is left standing so yesterday's artefacts
still render — do not tidy it away.

Verify: `select id, name, starter_key, report_id, artefact, active, cardinality(recipients) as n from public.report_schedules order by client_id;`

### 5.4 · **THE ONE-SHOT** — `monthly-reading.ts --write`, per tenant

Do not reach this line until 5.1 is complete for the tenant you are about to
run and its subjects are `active`.

```
# dry — prints every month, the clustering it read, the blockers, the panel
node --env-file=.env.local --import tsx scripts/monthly-reading.ts --client <uuid>
# the shot
node --env-file=.env.local --import tsx scripts/monthly-reading.ts --client <uuid> --write
```

**Read the dry run before you run the write.** Four things in it decide
whether you should:

- **Blockers.** `backReadBlockers` asks whether the subject side can be spent.
  If the answer is no, `--write` writes the denominators and the themes and
  leaves the subject side **unspent** — which keeps the shot. That is the safe
  failure, and it means you can fix the blocker and run again. `--force-subjects`
  overrides it; do not, unless you mean it.
- **The clustering.** `--write` refuses a tenant whose clustering could not be
  named unless `--denominators-only` says so out loud. A seed that cannot name
  its clustering freezes every back-read month's denominators with no theme
  readings at all and nothing ever revisits a frozen month.
- **The attention panel.** *(Deviation from the plan — see below.)* The panel
  freeze is **not a separate command**. It happens inside this script, before
  the stats side is read, when an actor is present and it is not a dry run.
  Össur gets its first panel here. **Sealand has no account first seen before
  the cutoff**, so the script prints
  `the attention half of every month this visit CLOSES … will be written with
  no panel, permanently`. That is the truth and it is permanent: `panel_id` is
  stamped on every `month_audience_stats` row, decision K's arm is spent, and
  the frozen guard refuses the correction. **Sealand's attention index is an
  October reading either way** — so the seed's null panel costs its history and
  not its future. Run it anyway, knowing that; or hold Sealand's seed until it
  has a panel and accept that its 95 closed months stay without subject rows
  and evidence ids. **This is Heinrich's call, and it has to be made from the
  dry run, not after.**
- **The lead shortfall.** One panel era per tenant means months behind the
  newest one get less than the constant's lead. The script prints how many.
  The shortfall belongs on the axis, not in the numbers.

Verify, per tenant:
```sql
select
  (select count(*) from public.month_denominators   where client_id = '<uuid>' and status='frozen')   as frozen_months,
  (select count(*) from public.month_subject_readings where client_id = '<uuid>')                     as subject_rows,
  (select count(*) from public.month_evidence_refs  where client_id = '<uuid>')                       as evidence_rows,
  (select count(*) from public.month_audience_stats where client_id = '<uuid>' and panel_id is null)  as no_panel;
```
`subject_rows` and `evidence_rows` must both be non-zero and must cover the
closed months, not only the filling ones:
```sql
select min(month), max(month), count(*) from public.month_evidence_refs where client_id = '<uuid>';
```
If `max(month)` is this month and `min(month)` is also recent, the back-read
did not happen and the shot is spent. Stop and say so.

### 5.5 · Clear the dead recipient list (Heinrich's word)

```
node --env-file=.env.local --import tsx scripts/clear-report-emails.ts --client <uuid>
node --env-file=.env.local --import tsx scripts/clear-report-emails.ts --client <uuid> --apply
```
`tracking_configs.report_emails` still holds four live Össur addresses and
`authenticated` still holds column-level UPDATE on it — a trap for whoever next
builds a recipients form. The product deliberately does not clear it. **Those
addresses are the only surviving record of who was on the list before
recipients moved to `report_schedules`** — copy them somewhere before you clear
them, because **step 5.6** is going to ask you for them. (Step 6 is the
rehearsal; it wants no addresses at all.)

**This clear is visible to the tenant.** Settings › Reports shows the column's
contents in the "An old list we no longer use" card
(`lib/settings/reports-load.ts` → `deadRecipients`, rendered in
`app/dashboard/settings/reports/page.tsx`), whose copy promises "We will clear
this list once you say so". So read the four addresses OFF THAT PAGE before you
run the script — that is the cheapest copy there is — and expect the card to
disappear afterwards. Heinrich's word is the thing that authorises it.

### 5.6 · Recipients — LAST, and by hand

**Settings › Reports and recipients, per tenant.** Until this step nothing
emails anybody; after it, the next Sunday does. That is why it is last and why
it is not a script.

**For Össur this is a RESTORATION, not a new list.** Both schedules are
`active` with ZERO recipients today (read on production 2026-09-16, the row at
the top of this file), and `tracking_configs.report_emails` holds **four** live
Össur addresses (read the same day). That a digest went to those four on
13 September is Block B's reading of `report_sends` and **was not re-read
today** — the query below is how you check it in the deploy window, and it
costs nothing. The list did not shrink on purpose: it moved to
`report_schedules.recipients` at T0-10 and those four never came with it, which
is why `tracking_configs.report_emails` still holds them and why step 5.5 tells
you to copy them out BEFORE you clear that column. Put the same four back, read
them one by one against the send that went out, and treat a fifth address as a
decision somebody has to have made rather than a typo to be kept. If
`report_sends` shows a different set, believe `report_sends`: it is the record
of what was delivered, and nothing has SENT to `report_emails` since T0-10.

**THE CARD IS GONE BY THE TIME YOU GET HERE — use the copy you took in 5.5.**
Settings › Reports reads `tracking_configs.report_emails` on every load
(`lib/settings/reports-load.ts` → `deadRecipients`) and prints the addresses in
the "An old list we no longer use" card, which
`app/dashboard/settings/reports/page.tsx` gates on
`inputs.deadRecipients.length > 0`. Step 5.5 clears that column, so after it
there is no card and no addresses on the page. That is exactly why 5.5 tells
you to copy them somewhere first, and why 5.5 is a visible change: clearing the
column empties the card.

An earlier draft of this step said the opposite — "you may not need a
production query at all here … the four are on the page you are already
standing on in 5.6" — in the step that decides which real people start
receiving a client's report. If you have the copy from 5.5, you need no query.
If you do not, the query below is how you get the list back, and it is the
better source anyway: it is the record of what was DELIVERED.
```
select subject, recipients, status, sent_at
from public.report_sends
where client_id = '<össur uuid>' and status = 'sent'
order by sent_at desc limit 3;
```
is the record of who actually received one. **`report_sends` has no
`created_at`** — the row is written when the dispatcher claims the send
(`claimed_at`, which is also the index: `report_sends_client_sent_idx
(client_id, claimed_at desc)`) and stamped `sent_at` when Resend accepts it.
Drop the `status` filter and order by `claimed_at` if you want every attempt
including the failures; keep it as written if the question is who received one.

**Sealand gets none from this file.** Its schedule has never had recipients and
nobody has asked for one; leaving it empty is the safe answer and a decision,
not an omission.

Verify: `select id, name, active, cadence, artefact, recipients from public.report_schedules;`
— and read the addresses, not the count.

---

## 6 · The rehearsal

**Sealand, `skipGather`, before Sunday.** It reuses the stored corpus, so no
Apify money; it spends OpenAI on the new passes.

```
curl -X POST https://app.verbatimintel.com/api/admin/trigger-run \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H 'content-type: application/json' \
  -d '{"clientId":"<sealand uuid>","options":{"skipGather":true}}'
```

**Know this before you press it:** `anomaly_flags` and `anomaly_checks` are
append-only — `service_role` holds SELECT and INSERT and no DELETE. **A
rehearsal's rows are permanent**, written out of a rehearsal corpus, and the
only removal is deleting the `pipeline_runs` row and taking the cascade. The
`run_id` on each row is what names them as a rehearsal. Decide that you are
willing to keep them before you start.

### What to watch, per new step

| Step | Log line to find | What a bad one looks like |
|---|---|---|
| `plan-translate-quotes` / `translate-quotes:N-of-M` | `[translate-quotes] N texts needed across M comments · X translated · Y already English · Z already cached · … · ~$0.000` | `RATE LIMITED`, or `deferred by the cap` on every batch. `plan out of retries` is logged, not fatal. After 5.2 the cache should make `already cached` the large number and the cost near zero. |
| `plan-subject-membership` / `subject-membership:N-of-M` | `[subject-membership] <summary>` then `[subject-membership] pass spent $X of its $Y ceiling` | `skipped: supabase/migrations/20260918093000_subjects.sql has not been applied yet` — means step 2 did not take. `<name> out of retries` is per-subject and non-fatal. |
| `anomaly-check` | `[anomaly-check] <status> — <note>`, and on a registration `set: N kinds · M rivals · …` | `baseline_forming` is CORRECT for Sealand — it is the honest answer, not a failure. `out of retries` is logged, not `noteError`'d. |
| `embed-insights` | existing | unchanged by Phase 1 |
| `freeze-months` | existing, now extended | a `filling` month that does not advance |

**The run must close `completed`, not `partial`.** All five new steps are
non-fatal by design (the `keyword-discovery` precedent) precisely so a record
kept alongside the report cannot make a clean run read `partial`. So `partial`
after this rehearsal means something OLD broke, not something new.

```sql
select id, status, started_at, completed_at, error_message
from public.pipeline_runs where client_id='<sealand uuid>'
order by started_at desc limit 3;

select model, count(*), round(sum(cost_usd)::numeric, 4)
from public.ai_call_log where run_id='<the run>' group by 1 order by 2 desc;

select * from public.run_costs where run_id='<the run>';
```
`ai_call_log` and `run_costs` must carry the new passes. No `run_incomplete`.

---

## 7 · Build each artefact once, then the screenshots

**These four were stranded in the R1/R2 alternative** and belong on the single
window too: a deploy that ships WP18–WP21's artefacts and never builds one has
not seen any of them against real data.

### 7.1 · The four briefs, once, for Össur

Three are cards on `/dashboard/reports` (Sales · Marketing · Content) and the
fourth, Leadership, is built in the Studio — `lib/reports/briefs.ts` says so on
the page. From the command line:

**`--template`, NOT `--role`, and `--keep`, and a separate `--out` each.** An
earlier draft of this step printed `--role sales_brief` four times and claimed
each run filed a `report_builds` row and a snapshot to read in the Reports
page's **Built** group. All three parts were wrong, and following it cost four
real builds and produced one PDF of one brief:

* **`--role` is inert on this path.** `scripts/build-document.ts` defaults the
  template to `sales_brief`, and `resolveTemplate` substitutes `settings.role`
  only for `CUSTOM_KEY` — so all four runs composed the SALES brief: same
  section map, same voice, same skeleton. `--template` is the flag that changes
  the artefact.
* **No `report_builds` row is written.** That path exists only under
  `--report <id>`; the command below goes down `main()`'s standalone path.
* **The snapshot is DELETED at the end** unless you pass `--keep`
  (`if (!has('keep')) await admin.from('report_snapshots').delete()…`), so the
  Built group you were told to read stays empty.
* **The PDF is written to `${out}/${template.key}.pdf`** with `--out`
  defaulting to `scratch/document`, so four runs into one directory overwrite
  one file (and one `answers.json`, one `written.json`).
* **`RENDER_BASE_URL` must be set**, or the render falls back to
  `http://localhost:3000` and throws — AFTER the `finally` has deleted the
  snapshot.

```
export RENDER_BASE_URL=https://app.verbatimintel.com   # or a local dev server
for t in sales_brief market_brief content_brief leadership_brief; do
  node --env-file=.env.local --import tsx scripts/build-document.ts \
    --client <össur uuid> --template "$t" --keep --out "scratch/brief-$t"
done
```

If reading the four in the Reports page's **Built** group is genuinely the
check you want, use `--report <uuid>` per brief instead: that path inserts the
`report_builds` row, keeps the snapshot and sets `reports.latest_snapshot_id`,
which is what the page's cards read.

**This spends**: a real research-and-write build under a `$3` ceiling
(`DOCUMENT_BUILD_BUDGET_USD`) PER BRIEF, so it is precondition 0.3's credits
again, and `--questions` prints what it would ask without paying.

### 7.2 · The quarterly review and the monthly report — through the preview

`snapshotQuarterly` and `snapshotMonthly` are called by `runSchedule` and by
nothing else: there is no operator command that files either without a send,
and with recipients still empty (5.6 is deliberately last) an
`/api/admin/schedules/run` returns `skipped: no recipients` rather than a
build. So read each through **Settings › Reports and recipients → preview**
(`GET /api/schedules/[id]/preview`, session only) — a dry build at the
workspace's current data with "no PDF, no link, no send, no rows left behind".

The quarterly needs a schedule whose cadence is `quarterly`; M8's
`report_schedules_cadence_check` admits it and the Studio's picker offers it
(WP20). Build it once for Össur and read it.

**The first real monthly is 1 October**, not deploy day: it is a reading AS AT
the month it names, and a monthly previewed mid-September reads a `filling`
month and says so. Put 1 Oct in the diary with this line beside it — the first
monthly send is the artefact nobody has seen against a frozen month.

### 7.3 · The two retirements — decisions, not commands

- **The old Reports route content stays for now.** 5.3 leaves the OLD report
  standing so yesterday's artefacts still render; it is retired when nothing
  needs to render from it, and that is a separate, dated act.
- **`OLD_PAGES_RETIRE_ON` is `2026-11-30`** (`lib/config.ts`), read by
  `lib/nav.ts` `retireDate()` and printed by `OldPageBanner` on
  `/dashboard/market` and `/dashboard/competitive`. Changing it is a code
  change with a test pinned to the date (`lib/nav.test.ts`), not a switch in
  the product — so confirm on deploy day that the date on the banner is the
  date you mean, and leave the Phase 2 cutover to Phase 2.

### 7.4 · Screenshots and the preview

- **Screenshots — TWO invocations, one per tenant.** `scripts/shot.ts` signs in
  once at the top of a run (`SHOT_EMAIL` / `SHOT_PASSWORD`, defaulting to the
  demo tenant) and has no tenant loop and no mid-run session switch, so "both
  tenants" is two commands with two logins and two `--out` directories. It also
  defaults `--base` to `http://localhost:3000`; against production say so:

  ```
  SHOT_EMAIL=<össur login> SHOT_PASSWORD=<…> \
    node --env-file=.env.local --import tsx scripts/shot.ts \
    --base https://app.verbatimintel.com --out scratch/shots-ossur
  SHOT_EMAIL=<sealand login> SHOT_PASSWORD=<…> \
    node --env-file=.env.local --import tsx scripts/shot.ts \
    --base https://app.verbatimintel.com --out scratch/shots-sealand
  ```

  Its list is nineteen entries — the nine surfaces, their detail variants and
  the parked pages — plus up to five deep-link follows, so a full run writes
  around two dozen PNGs. `--only <prefix>` narrows it. **Open the first PNG of
  each directory and check the workspace name before you trust the set**: the
  credentials come from the environment, and a run that silently signed in as
  the demo tenant looks exactly like a run that worked.
- The weekly report preview for Össur, read against the page: same
  month-to-date figures.
- `node --env-file=.env.local --import tsx scripts/reading-timing.ts --confirm --page overview --rounds 2 --client <uuid>` — read the SECOND round. WP23's target
  is 1.6–4.6 s; the read COUNT is the number that does not move when the
  instance has a bad minute. **One page, one tenant, and `--confirm` is not
  decoration**: the script is a read LOOP (22–64 statements a page load), it
  refuses a plan above six page loads, and it probes the instance first and
  refuses to run if that probe takes over 3 s. An unnarrowed two-round sweep is
  ~1,400 statements — the pattern that starved this instance on 16 September.
- `node --env-file=.env.local --import tsx scripts/stored-artefacts-smoke.ts`
  again, **after** the migrations and the deploy. 36/36.
- **The loader-output dump, if a reading page looks different to anyone.**
  `node --env-file=.env.local --import tsx scripts/loader-dump.ts --confirm --out scratch/dump-new`
  writes every page's loader output for both tenants on a frozen clock; the same
  command in a worktree at the baseline sha writes the other side, and `diff -r`
  is the answer. **WP23's "nothing a client reads has changed" was proved this
  way against `eb8d787` and was NOT re-proved on the merged tree** — it is a
  reasoned expectation there, not a checked fact, and this is how to convert it.
  It is twelve page loads a side, ~500 statements: a quiet window, once per
  tree. The one defect WP23 found in itself — a chunk size silently choosing
  four of a tenant's quotes — was found by this diff and by nothing else.

---

## 8 · The Sunday watch list

The first Sunday after the deploy, in this order:

1. **Both runs close `completed`.** Not `partial`, no `run_incomplete`.
2. **The five new steps logged** what §6's table says they log, on a real
   gather rather than a `skipGather`.
3. **The freeze line advanced only where expected.**
   ```sql
   select client_id, status, count(*), min(month), max(month)
   from public.month_denominators group by 1,2 order by 1,2;
   ```
   A month that was `frozen` before the deploy is still frozen and still
   carries the same numbers. A month newly frozen should be the one whose
   30-day line just passed, and no other.
4. **The weekly send.** Össur's list — `select subject, recipients, status, claimed_at, sent_at from public.report_sends order by claimed_at desc limit 5;` — subject, recipients and ids, never a body. **`report_sends` has no `created_at`** (5.6 says so too, and commit b6a8c10 fixed the 5.6 occurrence and missed this one): the row is written when the dispatcher claims the send, and `report_sends_client_sent_idx` is `(client_id, claimed_at desc)`. If you set recipients in 5.6, this is the first email Phase 1 sends and somebody should read it before the client does.
5. **`sent_figures` holds the send.**
   ```sql
   select snapshot_id, month, audience, object_kind, count(*)
   from public.sent_figures group by 1,2,3,4 order by 1;
   ```
   A weekly and a monthly file figures. **A quarterly does not** — `sent_figures`
   is keyed by one NOT NULL `month` and a quarter has no single month to file
   under, so the quarterly branch records the send and not the figures. That is
   by design and it is item 2 of "For Heinrich" in the Block C merge note.
6. **The anomaly check.** `select week_start, week_end, count(*) from public.anomaly_flags group by 1,2 order by 1 desc limit 4;` — and remember the rehearsal's rows are in there under their own `run_id`.
7. **Nothing wrote to a frozen month.** The guards raise rather than corrupt,
   so a violation shows as a step error, not as a wrong number. Search the run
   logs for `frozen monthly reading is never deleted` and
   `month_reading_frozen` — zero hits is the pass.

---

## 9 · Rollback

**Read this before you start step 1, not during it.**

| What went wrong | What you do |
|---|---|
| **The code is bad, the migrations are fine** | Revert the merge on `main` (`git revert -m 1 <merge sha>`), push, wait for READY, `curl -X PUT …/api/inngest`. **The migrations stay.** They are additive — new tables, new columns, new functions, new triggers — **except for three grant tightenings, which a code revert does not need undone**: M2 revokes write grants on `themes`, `theme_registry` and `theme_observations` from `authenticated` and `anon`; M8 does the same on `gate_verdicts` and `video_claims`; M9 on `plan_checks` and `plan_check_evaluations`. Every writer of those tables on `main` goes through the service role (`lib/readiness/load.ts`, `lib/gather/gate-verdicts.ts`), and the tenant SELECTs are re-granted in the same statement — so Phase 0's code loses nothing. Checked, so that nobody has to check it at 22:00. The rest of the case is the easy one, and it is the one you are most likely to be in. |
| **A migration failed halfway** | Re-run the same file. They are idempotent (`if not exists` throughout, applied twice on a clean cluster with 0 errors). Do not hand-patch the half-applied state. |
| **A migration applied and you want it gone** | You mostly do not. Dropping `month_subject_readings` or `month_evidence_refs` destroys the one-shot's output and it cannot be recreated. If a table genuinely must go, it goes by name and by hand, and the seed for that tenant is spent regardless. |
| **The one-shot ran wrong** | **There is no rollback.** `month_reading_frozen_guard` refuses the UPDATE and `month_reading_delete_guard` refuses the DELETE, which is the whole point. The 201 audience-months keep whatever the shot wrote. This is why step 5.4 has a dry run and four things to read in it. |
| **Recipients went out too early** | Clear `report_schedules.recipients` in Settings. An email already sent is sent. |
| **A rehearsal's anomaly rows are unwanted** | Delete the `pipeline_runs` row and take the cascade. There is no other way — the tables have no DELETE grant. |
| **The Inngest registration is wrong** | `curl -X PUT …/api/inngest` again. It is idempotent and the ids are a contract, so a re-register cannot strand a run that the deploy did not already strand. |

**What has no rollback at all, listed once:** the one-shot (5.4), an email that
has been sent (5.6), a rehearsal's append-only rows (6), and a frozen month's
contents (everything). Everything else on this page is reversible.

---

## Alternative — the R1 / R2 split, if you want to stop halfway

Kept because step 5.4 is irreversible and you may want to see the pages with
real numbers before you spend it.

**R1** — preconditions 0.1–0.9 · **step 1, the code** · then migrations M1–M8
(stop before `20260918098000_sent_figures.sql`) — **but take M11 with them**,
out of filename order, because it is the file that closes the TRUNCATE grant
and R1's whole window is the gap in which nothing else does · step 3 · step 4 ·
backfills 5.1, 5.2, 5.3 · **5.4 the one-shot** · 5.5 · rehearsal · screenshots ·
**recipients NOT set** · the Sunday watch minus items 4 and 5. The code-then-
migrations order is the same here and for the same reason (§1's first
paragraph): R1's window is where `main`'s flat-chunk freeze writer would meet
M3's insert guard.

**R2** — the code again (merge, push, READY, re-register) · then M9, M9.1,
M10 · **§7 in full** — the four briefs and the quarterly review built once for
Össur, the first monthly on 1 Oct, and the two retirements read rather than
done · **then recipients.** (§7 was written only here until the WP22 fix pass;
it is now on the single-window path, which is where an operator following
sections 0–9 will meet it.)

**What the split costs.** Three things. M9 is what gives
`report_snapshots.reading_at` a column, and between R1 and R2 every weekly the
product builds carries its reading instant only in `data.readingAt` — the
Reports page resolves it from there (fixed in `698216b`), so nothing is lost,
but the column is backfilled from that JSON at R2 and a snapshot built in
between is backfilled too. M10's two indexes are the reading pages' speed, so
R1's pages are slower than WP23 measured. And you deploy twice, which means two
Inngest re-registrations and two windows where a run must not be in flight.

**What the split buys.** One look at the Overview, Subjects and Voice pages
with real numbers before the one-shot — which, if you move 5.4 to R2, is a real
safety margin and the only reason to take the split at all.

---

## Owed, and not done in WP22

**Second pass, 2026-09-16 15:10–15:30 SAST (the Block C merge head).** Five
production calls in total, and they are the whole budget this pass spent:
`select 1` through the MCP returned in about two seconds; the next catalog
query (`pg_stat_activity`, one row, no user table) died with `Connection
terminated due to connection timeout`; a five-row read of `report_sends` died
the same way twenty minutes later; and `stored-artefacts-smoke` failed on its
first read, twice, five minutes apart, with `Could not query the database for
the schema cache. Retrying.` **So the instance is still where it was this
morning** — SQL answering about one call in two, PostgREST not answering at
all — and this was not the hour to scan `audience_insights`. Nothing was
re-read that had already been read today; the table at the top of this file
stands as of that earlier pass.

- **Embedding coverage (step 4) is the one figure I could not read.** The
  Supabase instance was unreachable for most of WP22 (~09:17 to ~10:45 SAST on
  16 Sep — `Connection terminated due to connection timeout` through the MCP,
  `upstream request timeout` then a Cloudflare HTML error page through the
  service-role client, while the control plane reported `ACTIVE_HEALTHY`). It
  came back flaky — roughly one query in four returns — and the six facts in
  the table at the top were read through that. The `audience_insights` coverage
  query is heavier and timed out every attempt. **It is precondition-shaped:
  run it at step 4, before you spend anything on 5.1.**
  The query in step 4 is now the RIGHT one (`count(*) filter (where embedding
  is not null)` over `audience_insights_current`); until 16 Sep this file
  printed `count(embedding)`, which is the probe that took production down, so
  the figure being owed is partly why the fix was found.
- `stored-artefacts-smoke` 36/36 is precondition 0.7 and has not passed since
  Block B — three attempts on 16 Sep, all three killed by PostgREST's schema
  cache rather than by anything the smoke found. **Run it on a healthy instance
  before the deploy**, and remember WP19 replaced the Reports page since it
  last passed: this is the check that catches a stored page key breaking
  silently.
- **The instance's health is itself a precondition.** If a `select count(*)`
  through the MCP does not return first time, do not start step 2. Applying
  twelve migrations through a transport that drops one connection in four is
  how you end up not knowing which of them landed.
- **The For-sales duplication is still open.** Two blocks say the same thing to
  a salesperson and a change has to be made twice. It has no owner.
