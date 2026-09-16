# Phase 1 — the deploy checklist

Written in WP22 from the real state of `feat/phase1` @ `d4e7dc1`
(`/Users/heinrichviljoen/Documents/code/verbatim-phase1`), every command read
off the script's own header on the branch and every migration object read off
the migration file. Production was read-only throughout; where a figure could
not be re-checked today it says so on the line rather than quoting a note.

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
| Phase 1's tables absent — **M1–M10 are not applied** | `to_regclass` null for `competitors`, `subjects`, `sent_figures` | precondition 0 |
| **No run in flight** | `pipeline_runs` not in (`completed`,`failed`,`partial`) → **0** | 0.1 |
| **201 frozen audience-months of 214** | exactly as the `monthly-reading.ts` header says | 5.4 |
| **Two schedules, both `active`, ZERO with recipients** | `report_schedules` → 2 / 2 active / 0 with recipients | 5.3, 5.6 |
| **Four dead addresses in `tracking_configs.report_emails`** | Össur 4, Sealand 0 | 5.5 |
| Tracked rivals: **4, not 7** | Össur `{Ottobock}`; Sealand `{Cotopaxi, Freitag, Rareform}` | M1 |
| Tenants | 2 — Össur `e52cac94-…`, Sealand `ac16988e-…` | — |

The zero-recipients row is the one the single-window recommendation rests on,
and it holds. **The rivals row corrects the plan:** §2's M1 line reads as seven
tracked names, and `tracking_configs.competitor_names` holds four today. M1's
backfill does not read that column alone — it unions the tracked list with
every rival the evidence names (`month_denominators.audience`,
`keyword_performance`, `themes`, `theme_registry`) and dates the untracked ones
`2026-09-09 18:10+02`. Three rival audiences exist in `month_denominators`
(`competitor:Ottobock`, `competitor:Cotopaxi`, `competitor:Freitag`), so four
live plus the erased Sealand set is the shape to expect. **Read the count M1
actually writes and reconcile it against the four tracked names — do not expect
seven because the plan says seven.**

The one figure I could not get is embedding coverage: the query kept timing out
(see "Owed" at the bottom). It is step 4 and it gates step 5.1 anyway.

**This is ONE deploy, not two.** The plan (§5) split it R1 / R2 because R1
turns on the weekly email and R2 the monthly artefact. That split has no force
any more: **nothing emails anybody until an operator sets recipients**, and
both weekly schedules have none. So the code, all eleven migrations and every
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

Every one of these is a gate, not a nicety. Do not start until all nine hold.

| # | Precondition | How you know |
|---|---|---|
| 0.0a | **The database answers first time** | `select count(*) from clients;` through the MCP. If it times out, STOP. On 16 Sep the instance returned roughly one query in four while reporting `ACTIVE_HEALTHY`; applying eleven migrations through a transport that drops one connection in four is how you end up not knowing which of them landed. |
| 0.0b | **PostgREST answers too — it is a SEPARATE path and it can be down while SQL works** | `node --env-file=.env.local --import tsx scripts/stored-artefacts-smoke.ts`. On 16 Sep the MCP's direct SQL connection was intermittently fine while PostgREST returned `Could not query the database for the schema cache. Retrying.` on every attempt. **Every operator script in step 5 goes through PostgREST** (`createAdminClient`), so a green MCP query proves nothing about whether the backfills can run. Check both. |
| 0.1 | **No run in flight** on either tenant | `select id, client_id, status, started_at from pipeline_runs where status not in ('completed','failed','partial') order by started_at desc;` → zero rows (**verified 0 on 2026-09-16**). A run mid-flight when the code deploys replays completed steps by id, and M3's INSERT guard would meet Phase 0's writer inside an open freeze. |
| 0.2 | **Outside 04:00–09:00 SAST** | The retention sweep runs at 04:00 (live since 24 Aug) and the Sunday dispatcher wakes in that band. Deploy after 09:00 and before 22:00 SAST, and not on a Sunday. |
| 0.3 | **OpenAI credits present** | The balance has been zero all week and a model call fails 429. Three backfills spend: subject-membership ($0.14–0.25/tenant), translate-quotes ($0.7–1.8/tenant), propose-subjects ($0.002/tenant). Check the dashboard, not a note. |
| 0.4 | **`main` merged into `feat/phase1`** | `git fetch origin && git merge origin/main` on the branch, then the four gates again. Any hotfix landed on `main` since `39cfa15` has to be under the branch before it goes back. |
| 0.5 | **All four gates green on the merged head** | `npx vitest run` (baseline 241 files / 4,432 tests) · `npx tsc --noEmit` · `npm run lint` · `npx next build --webpack`. If `tsc` reports `Cannot find module '…/route.js'` from `.next/types/`, rebuild first — stale generated types, not a defect. |
| 0.6 | **The Turbopack build green too** | `TURBOPACK_ROOT=/Users/heinrichviljoen/Documents/code npx next build`. This is the bundler Vercel runs and the only gate that catches a bundler-only break before a deploy does. |
| 0.7 | **`stored-artefacts-smoke` 36/36** | `node --env-file=.env.local --import tsx scripts/stored-artefacts-smoke.ts`. **This one is owed** — the Supabase instance has been unreachable since ~09:17 on 16 Sep and the Block C merge could not run it. WP19 REPLACED the Reports page, and this is the check that catches a stored page key breaking silently. Do not deploy without it. |
| 0.8 | **The Inngest step-id diff is five insertions and nothing else** | `git diff origin/main..HEAD -- inngest/functions/pipeline.ts` and read the ids. `main` 49 → branch 54, in their own positions: `plan-translate-quotes` / `translate-quotes:N-of-M` (after the Pass A wave, before `embed-insights`), `plan-subject-membership` / `subject-membership:N-of-M` (before `cross-reference`), `anomaly-check` (after `freeze-months`). Zero removals, zero reorderings. |
| 0.9 | **A whole-branch review has run** (plan §3.2) | Fresh eyes, never an author. |

---

## 1 · Ship the code

**The code goes first and the migrations follow it.** This is a recorded rule,
not a preference (plan §3, Block B known-and-open item 2: "the apply must NOT
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
   Then confirm the function list shows **54** step ids for `pipeline` and that
   none of the 49 pre-existing ones changed name. An in-flight run across an
   unregistered deploy is the failure this exists to stop, and step 0.1 is why
   there is no in-flight run.
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
than it takes to read eleven verification queries: between §1 and §2 every
Phase 1 surface says "not recorded", and a Sunday dispatcher or a manual
trigger in that gap runs the new pipeline against a Phase 0 schema — which its
steps no-op against by design, but it is a run that does less than it should.

Eleven files, **in filename order**, one at a time through the Supabase MCP
(project `mkwjlckescdveosvrvaq`). Read the verification query's answer before
starting the next file. A regex character class inside a migration must be
written with `chr()` — the MCP transport decodes `\u` escapes (Phase 0's
lesson, proven harmless once and not worth proving twice).

**Order matters twice over.** M3's insert guard must exist before M4–M6 create
tables that rely on the same function; M6's delete guard installs triggers on
all six month tables and therefore needs M4 and M5 to have created theirs.

Each file was applied twice over `schema-baseline.sql` on a throwaway PG 17
cluster (the Block C merge: 62 migrations, 0 errors; the eleven re-applied over
themselves, 0 errors). They are idempotent. Re-running one after a partial
failure is safe.

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
containing `prompt_version` and `rival_rename`. For `rivals`: **four tracked
names exist today** (Össur `{Ottobock}`, Sealand `{Cotopaxi, Freitag,
Rareform}` — checked 2026-09-16), and the backfill adds every rival the
evidence names but the tracked list does not, dated `2026-09-09 18:10+02`. So
expect `rivals ≥ 4` with `retired = rivals − 4`, and reconcile:
```sql
select name, slug, first_seen_at, retired_at from public.competitors order by client_id, name;
```
against `select client_id, competitor_names from public.tracking_configs;`.
A row with a `retired_at` that is NOT one of the erased Sealand names is a
backfill picking up a sentinel — check it is not `unknown` (the migration
excludes it deliberately at line 277).

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
  (select count(*) from information_schema.role_table_grants
     where table_schema='public'
       and table_name in ('themes','theme_registry','theme_observations')
       and grantee in ('anon','authenticated')
       and privilege_type in ('INSERT','UPDATE','DELETE'))                                   as leftover_writes;
```
Expect `cols = 8`, `leftover_writes = 0`, and `backfilled` close to `entries`
(the backfill takes the newest `themes` row per `registry_id`; ~120 observation
rows are legitimately empty — the migration says so at line 166).

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
Expect `tables = 4`, `fns = 3`, `triggers = 7`, `policies = 7`
(`subjects` 3 · `subject_memberships` 1 · `month_subject_readings` 1 ·
`moves` 3), `truncate_left = 0`.

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

**M8 · `20260918097000_settings.sql`** — the one with a privacy limb.
```sql
select
  (select array_agg(column_name order by column_name) from information_schema.column_privileges
     where table_schema='public' and table_name='gate_verdicts' and grantee='authenticated') as gv_cols,
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
`gv_cols` must be exactly
`{created_at, client_id, id, kept, keyword, platform, run_id, source, video_id}`
and must **not** contain `caption_excerpt`, `account_name` or `reason` — those
three are a third party's words and a tenant does not read them.
`cadence_check` must contain `quarterly`. Expect `appeals = 1`,
`artefact_col = 1`, `policies = 3`, `uniq = 1`.

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
```sql
select count(*) from information_schema.columns
 where table_name='plan_checks' and column_name='notice';
```
Expect 1. (WP21's, small, and it is between M9 and M10 in filename order — do
not skip it because the plan's table stops at M9.)

**M10 · `20260918099000_reading_indexes.sql`**
```sql
select indexname from pg_indexes where schemaname='public'
 and indexname in ('videos_analysed_record_idx','gate_verdicts_client_time_idx');
```
Expect both. These are WP23's; without them the reading pages are back to
7–21 s.

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

```sql
select client_id,
       count(*) as insights,
       count(embedding) as embedded,
       round(100.0*count(embedding)/nullif(count(*),0), 1) as pct
from public.audience_insights group by 1 order by 1;
```

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
them, because step 6 is going to ask you for them.

### 5.6 · Recipients — LAST, and by hand

**Settings › Reports and recipients, per tenant.** Until this step nothing
emails anybody; after it, the next Sunday does. That is why it is last and why
it is not a script.

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
the page. From the command line, one at a time:

```
node --env-file=.env.local --import tsx scripts/build-document.ts --client <össur uuid> --role sales_brief
# then --role market_brief · --role content_brief · --role leadership_brief
```

**This spends**: a real research-and-write build under a `$3` ceiling
(`DOCUMENT_BUILD_BUDGET_USD`), so it is precondition 0.3's credits again, and
`--questions` prints what it would ask without paying. Each build files a
`report_builds` row and a snapshot — that is what the Reports page's **Built**
group lists, and reading the four there is the check.

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

- `node --env-file=.env.local --import tsx scripts/shot.ts` — the nine pages on
  both tenants, for Heinrich.
- The weekly report preview for Össur, read against the page: same
  month-to-date figures.
- `node --env-file=.env.local --import tsx scripts/reading-timing.ts --page overview --rounds 2 --client <uuid>` — read the SECOND round. WP23's target
  is 1.6–4.6 s; the read COUNT is the number that does not move when the
  instance has a bad minute.
- `node --env-file=.env.local --import tsx scripts/stored-artefacts-smoke.ts`
  again, **after** the migrations and the deploy. 36/36.

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
4. **The weekly send.** Össur's list — `select * from public.report_sends order by created_at desc limit 5;` — subject, recipients and ids, never a body. If you set recipients in 5.6, this is the first email Phase 1 sends and somebody should read it before the client does.
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
| **The code is bad, the migrations are fine** | Revert the merge on `main` (`git revert -m 1 <merge sha>`), push, wait for READY, `curl -X PUT …/api/inngest`. **The migrations stay.** Every one is additive — new tables, new columns, new functions, new triggers — and Phase 0's code does not read any of them. This is the easy case and it is the case you are most likely to be in. |
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
(stop before `20260918098000_sent_figures.sql`) · step 3 · step 4 ·
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

- **Embedding coverage (step 4) is the one figure I could not read.** The
  Supabase instance was unreachable for most of WP22 (~09:17 to ~10:45 SAST on
  16 Sep — `Connection terminated due to connection timeout` through the MCP,
  `upstream request timeout` then a Cloudflare HTML error page through the
  service-role client, while the control plane reported `ACTIVE_HEALTHY`). It
  came back flaky — roughly one query in four returns — and the six facts in
  the table at the top were read through that. The `audience_insights` coverage
  query is heavier and timed out every attempt. **It is precondition-shaped:
  run it at step 4, before you spend anything on 5.1.**
- `stored-artefacts-smoke` 36/36 is precondition 0.7 and has not passed since
  Block B. I started it while the instance was intermittently answering and it
  did not finish. **Run it on a healthy instance before the deploy.**
- **The instance's health is itself a precondition.** If a `select count(*)`
  through the MCP does not return first time, do not start step 2. Applying
  eleven migrations through a transport that drops one connection in four is
  how you end up not knowing which of them landed.
- **The For-sales duplication is still open.** Two blocks say the same thing to
  a salesperson and a change has to be made twice. It has no owner.
