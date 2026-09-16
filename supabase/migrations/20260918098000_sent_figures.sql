-- The record of what we actually sent: a reading date on every artefact, and
-- the numbers it printed, object-keyed (Phase 1 WP18, design item 13,
-- decision O, 2026-09-18).
--
-- WHY THIS EXISTS AT ALL. Three lines the design asks for —
--   "{Month} · reading as at {date} · still filling until {date}"
--   "the report of {date} read X" beside today's live figure
--   next month's report confirming last month's final figures
-- — all need the same thing and the product does not have it: a numeric,
-- object-keyed, month-keyed record of a reading that was DELIVERED, with the
-- instant it was taken. `report_snapshots` freezes tile-ready data and that
-- freeze is sound (quotes travel as refs, words resolve at render), but the
-- record it has produced answers none of the three:
--   · `created_at` is the BUILD instant, not a reading date. Össur's six August
--     rows are one brief rebuilt six times over eighteen hours off one run —
--     six timestamps, one reading.
--   · `data.figures` is `{label, value: '15.5%', kind}` — a display STRING with
--     no n, no denominator and no band. `components/print/document-deck.tsx`
--     already has to `parseFloat` it back.
--   · the figure KEYS are rank slots (`top_theme`) and build-local prompt ids
--     (`g1_conversations`), so the same key names a different object next month
--     and a confirming line would compare two different things under one name.
-- Measured, read-only, on production 2026-09-15 (research/refute-10): NO report
-- has ever been snapshotted in two different calendar months on either tenant.
--
-- SO: four columns on `report_snapshots` that say what a snapshot is a reading
-- OF, and one new table that says what it PRINTED, keyed by the object rather
-- than by a rank slot.
--
-- WRITTEN AT SEND TIME, NOT AT BUILD TIME. The August six are the argument: six
-- builds of one brief in eighteen hours would have written six readings of one
-- month, and "the report of {date}" would have had six answers. An artefact
-- enters this record when it is DELIVERED — one row per figure per delivered
-- artefact — which makes the record start small and honest rather than large
-- and ambiguous. A preview writes nothing (it deletes its own snapshot); a test
-- send writes nothing (it leaves no artifact, no export event and no link).
--
-- AND IT IS NEVER REWRITTEN. A sent figure is a statement made to a named list
-- of people on a date. A rebuild that could correct it would make the record a
-- record of nothing, and worse, would silently un-say something a reader has
-- already read. Two mechanisms, deliberately both:
--   · the ACL — service_role holds SELECT and INSERT and nothing else, the
--     `anomaly_flags` precedent, which is what actually enforces it;
--   · a BEFORE UPDATE guard that raises, the `month_reading_frozen_guard`
--     precedent, so the rule is stated in the database and survives a future
--     grant somebody widens without reading this comment.
--
-- A THIRD, UNRELATED COLUMN RIDES ALONG: `plan_checks.notice`. WP21 needs one
-- `text` column to persist the "this document was clipped" notice it currently
-- computes and throws away, and the plan gives it to this migration (§2's
-- table) rather than authoring a tenth file for one column in the R2 window.
-- It is additive, nullable and read by nothing until WP21 lands.

-- ============================================================================
-- 1 · report_snapshots — what this snapshot is a reading OF
-- ============================================================================
--
-- All four are NULLABLE and stay nullable. Twelve of the thirteen rows in
-- production today are documents and pages built before any of this existed,
-- and a NOT NULL with a default would have invented a reading date for each of
-- them. A reader tells "this artefact did not record one" from "this artefact
-- was read at noon" only if the absent case is absent.

alter table public.report_snapshots
  add column if not exists reading_at    timestamptz,
  add column if not exists month         date,
  add column if not exists month_status  text,
  add column if not exists window_basis  text;

-- `month_status` and `window_basis` are checked rather than free text, because
-- both are read by a surface that changes its words on them. Added as NOT VALID
-- and then validated: the tables are tiny today, but this is the shape that
-- does not take an ACCESS EXCLUSIVE scan on a table that is not.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.report_snapshots'::regclass and conname = 'report_snapshots_month_status_check'
  ) then
    alter table public.report_snapshots
      add constraint report_snapshots_month_status_check
      check (month_status is null or month_status in ('filling', 'frozen')) not valid;
    alter table public.report_snapshots validate constraint report_snapshots_month_status_check;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.report_snapshots'::regclass and conname = 'report_snapshots_window_basis_check'
  ) then
    alter table public.report_snapshots
      add constraint report_snapshots_window_basis_check
      check (window_basis is null or window_basis in ('month', 'quarter', 'update_window', 'run', 'cumulative')) not valid;
    alter table public.report_snapshots validate constraint report_snapshots_window_basis_check;
  end if;
end $$;

comment on column public.report_snapshots.reading_at is
  'The instant the reading behind this artefact was taken — NOT created_at, which is the build instant. Six builds of one brief in eighteen hours carry six created_at values and one reading_at. Backfilled from data->>''readingAt'', which is where WP17 put it while this column did not exist.';
comment on column public.report_snapshots.month is
  'The calendar month this artefact is a reading of, as its first day. A period key by the COMMENT''s month (lib/reading/monthly.ts), never by the run — AGENTS.md''s rule, and the reason data->>''month'' is the source rather than created_at.';
comment on column public.report_snapshots.month_status is
  'Whether that month was still filling when this was read. A still-filling month moves after the artefact is sent, which is exactly the case "the report of {date} read X" exists to make legible; a frozen one never moves again.';
comment on column public.report_snapshots.window_basis is
  'What the frozen numbers are a reading OVER. Unrecorded before this column, and it mattered: lib/reports/documents/signals.ts falls back from a run window to the whole corpus with a ?? and stores nothing to say which branch ran — on 4 of Sealand''s 10 runs the headline figure is an all-time cumulative count printed under "Update of 9 Sept 2026".';

-- The two reads this record is for: "the artefact we sent for September" and
-- "the last artefact we sent". Partial, because eleven of today's thirteen rows
-- carry no month at all and never will.
create index if not exists report_snapshots_month_idx
  on public.report_snapshots (client_id, month desc, reading_at desc)
  where month is not null;

-- ---- the backfill ----------------------------------------------------------
-- WP17 wrote the reading date into `data.readingAt` and said in its own
-- docblock that M9 would backfill the column from exactly that field. This is
-- that backfill, and it is idempotent by its WHERE clause: it touches only rows
-- whose column is still null.
--
-- IT MATCHES NOTHING TODAY AND THAT IS CORRECT. Production holds no weekly
-- snapshot yet (WP17 ships at R1; this migration applies in the R2 window), so
-- the rows this is for are the ones R1's Sunday sends will have written by the
-- time it runs. Verified read-only 2026-09-15: 13 snapshots, 0 with a
-- `readingAt` key.
--
-- A TEXT DATE THAT DOES NOT PARSE IS LEFT NULL rather than failing the
-- migration: `data` is jsonb written by application code over four shapes, and
-- a migration that aborts the whole R2 window on one malformed string is a
-- worse outcome than one artefact with no stamp. The regex is deliberately
-- conservative — an ISO instant, which is what `new Date().toISOString()`
-- produces and the only thing that field has ever held.
update public.report_snapshots
   set reading_at = (data->>'readingAt')::timestamptz
 where reading_at is null
   and data ? 'readingAt'
   and data->>'readingAt' ~ ('^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}');

-- The month, from the same place and by the same rule.
--
-- `data.month` IS THE MONTH'S FIRST DAY, 'YYYY-MM-01', and NOT 'YYYY-MM'. That
-- is what `monthStartOf` returns (lib/reading/month-key.ts), what lib/pages/week.ts
-- puts on the weekly reading, and what weekly-build.ts and monthly-build.ts
-- copy verbatim onto the snapshot — `month 2026-09-01`, read off a live render
-- of both tenants. The first cut of this clause matched 'YYYY-MM' only and so
-- matched nothing the product has ever written; and because `window_basis` is
-- gated on `month is not null`, that clause never fired either. Both forms are
-- accepted now: the reading layer's key is the ten-character one, the
-- seven-character one is what a hand-written row is likeliest to hold, and a
-- backfill that quietly matches neither is worse than one that takes both.
update public.report_snapshots
   set month = (case
                  when length(data->>'month') = 7 then (data->>'month') || '-01'
                  else data->>'month'
                end)::date
 where month is null
   and data ? 'month'
   and data->>'month' ~ '^[0-9]{4}-[0-9]{2}(-[0-9]{2})?$';

-- The month's status, from wherever the artefact actually keeps it. A MONTHLY
-- snapshot carries it at the top level (`MonthlySnapshotData.monthStatus`); a
-- WEEKLY one keeps it on the reading — `data.reading.monthStatus`, which is how
-- lib/schedules/deliver.ts reaches it, and `WeeklySnapshotData` has no
-- top-level field for it at all. Reading only the top level matched no weekly
-- row, which is to say none of the rows this column was added for.
update public.report_snapshots
   set month_status = coalesce(data->>'monthStatus', data->'reading'->>'monthStatus')
 where month_status is null
   and coalesce(data->>'monthStatus', data->'reading'->>'monthStatus') in ('filling', 'frozen');

-- Only the two artefacts whose every number is a reading of a calendar month
-- get 'month'. A document brief is NOT backfilled: its figures come off
-- `run_summary.period_*` with a cumulative fallback nobody recorded, so
-- stamping it 'month' would be this migration inventing the very fact the
-- column exists to stop being invented. WP19 re-bases those on the monthly
-- reading and they will carry a basis from then on.
--
-- AND ONLY WHERE THE MONTH ITSELF PARSED. The two travel together: a basis of
-- 'month' beside a null `month` tells a reader the numbers are a reading of a
-- calendar month and refuses to say which, which is worse than saying neither.
update public.report_snapshots
   set window_basis = 'month'
 where window_basis is null
   and month is not null
   and data->>'kind' in ('weekly', 'monthly');

-- ============================================================================
-- 2 · sent_figures — the numbers a delivered artefact printed, by object
-- ============================================================================
--
-- THE GRAIN IS (snapshot, audience, object), not (snapshot, figure token).
-- A token is a rank slot or a build-local prompt id; an object is a thing that
-- is still the same thing next month. Five kinds, and the fifth is the escape:
--
--   subject   subjects.id            — a uuid, stable, the client's own word
--   theme     theme_registry.id      — the stable identity; NEVER themes.id,
--                                      which is a per-run row id, and never the
--                                      label, which churns ~88% run to run
--   rival     'competitor:<name>'    — the audience string, verbatim. A NAME
--                                      and not an identity: renaming a rival
--                                      splits its series and a sent row cannot
--                                      be re-keyed, which is the same rule
--                                      month_denominators.audience carries
--   kind      the insight kind slug
--   figure    a figure TOKEN, for the artefact-level numbers that are about no
--             object at all ('videos_this_month', 'category_videos'). Kept
--             because the design's line is "the report of {date} read X" and X
--             is often the month's own denominator; marked as what it is so a
--             reader joining on objects never picks one up by accident.
--
-- `object_id` is text and unkeyed, exactly as `anomaly_flags.object_id` and
-- `month_evidence_refs` are: a frozen statement about a theme must survive a
-- re-minted registry row, and a foreign key would delete the record when the
-- thing it is a record of is re-clustered.
create table if not exists public.sent_figures (
  client_id    uuid not null references public.clients(id) on delete cascade,
  -- The artefact this figure was printed on. The snapshot is the artefact's
  -- identity — one send, one snapshot — and the cascade is right: if the
  -- artefact is erased, the record of what it said goes with it.
  snapshot_id  uuid not null references public.report_snapshots(id) on delete cascade,
  -- The month the figure is a reading of, as its first day. NOT NULL: a figure
  -- with no period is the run-indexed reading this whole phase exists to
  -- remove, and there is nothing for next month to confirm.
  month        date not null,
  -- The literal audience string the reading was taken in — 'industry',
  -- 'client', 'competitor:<name>'. A NAME, per month_denominators.audience.
  audience     text not null,
  object_kind  text not null check (object_kind in ('subject', 'theme', 'rival', 'kind', 'figure')),
  object_id    text not null,
  -- What the reader saw as the object's name. DECORATION, never a key.
  label        text not null,
  -- The number as printed, as a NUMBER. `report_snapshots.data.figures` holds
  -- '15.5%' and the deck parseFloats it back; this is 15.5.
  value        numeric not null,
  -- What that number is: a share, a count of videos, a count of comments, or a
  -- movement in points. Without it "13" is unreadable and a confirming line
  -- could compare a percentage with a count.
  unit         text not null check (unit in ('pct', 'videos', 'comments', 'pts')),
  -- The two sides the share was measured on. Null on a unit that is not a
  -- share — a count has no k and n, it IS k.
  k            int,
  n            int,
  -- WHAT THE SHARE IS A SHARE OF, by name (the anomaly_flags precedent): 'the
  -- category''s videos this month', 'your own videos this month'. Stored rather
  -- than assumed, because the same object is read against three denominators on
  -- one page and a figure quoted without its population is not checkable.
  denominator  text not null,
  -- The banded month-on-month comparison behind it, where there was one. Null
  -- where no comparison was drawn: a level is still a reading, and a null band
  -- says "this was printed as a level" rather than "this moved by nothing".
  change_pts   numeric,
  band_pts     numeric,
  -- The verdict's state, as lib/reading/verdicts.ts issued it. 'moved' and
  -- 'no_clear_change' are answers; the other three are the product declining to
  -- give one, for three different reasons, and a confirming line must not treat
  -- a refusal as a reading of zero.
  verdict      text check (verdict in ('moved', 'no_clear_change', 'too_little_data', 'baseline_forming', 'refused')),
  -- The direction word this figure was PRINTED with, or null where it was owed
  -- none. Null is not 'flat': flat is a reading, absent is a silence.
  direction    text check (direction in ('growing', 'fading', 'flat')),
  -- Whether the month was still filling when this was sent. The whole point of
  -- "the report of {date} read X": a frozen month's figure can never disagree
  -- with today's, so only a filling one is worth printing beside the live
  -- number.
  month_status text not null check (month_status in ('filling', 'frozen')),
  -- Which artefact printed it — 'weekly', 'monthly', 'quarterly', 'brief:<who>'.
  -- The archive (WP19) groups by it, and a weekly and a monthly reading of the
  -- same month are two statements, not one.
  artefact     text not null,
  -- The instant the reading was taken. The same value as the snapshot's
  -- reading_at, copied here so a month's sent figures are one index scan and
  -- still say their date if the snapshot is ever pruned.
  reading_at   timestamptz not null,
  -- When it was written down, which is when it was sent. Distinct from
  -- reading_at by the length of a render.
  sent_at      timestamptz not null default now(),
  primary key (client_id, snapshot_id, audience, object_kind, object_id)
);

comment on table public.sent_figures is
  'Every figure a DELIVERED artefact printed, keyed by the object rather than by a rank slot, with the n, the denominator, the band and the instant the reading was taken. Append-only and never rewritten: a sent figure is a statement made to named people on a date, and a rebuild that corrected it would un-say something a reader has already read.';
comment on column public.sent_figures.object_kind is
  'subject | theme | rival | kind | figure. ''figure'' means object_id is a figure TOKEN and the row is about no object — the artefact-level numbers (a month''s own denominator) that "the report of {date} read X" is most often about.';
comment on column public.sent_figures.object_id is
  'A subjects.id, a theme_registry.id (never themes.id — a per-run row id — and never the label), the literal competitor:<name> audience string, an insight kind slug, or a figure token. Text and unkeyed on purpose: a frozen statement must survive a re-minted registry row.';
comment on column public.sent_figures.audience is
  'The literal bucket string, competitor_name included verbatim. A NAME, not an identity: renaming a rival leaves its sent figures under the old string and no later visit re-keys them — the same rule month_denominators.audience carries, and the reason a rename is a logged break rather than an edit.';
comment on column public.sent_figures.denominator is
  'The population the value is a share of, in the reader''s words. Stored rather than assumed: the same object is read against three denominators on one page, and a share quoted without its population cannot be checked against next month''s.';
comment on column public.sent_figures.month_status is
  'Whether the month was still filling when this went out. A frozen month''s figure can never disagree with today''s, so only a filling one is worth printing beside the live number.';
comment on column public.sent_figures.verdict is
  'The verdict state behind the figure. moved / no_clear_change are answers; too_little_data / baseline_forming / refused are refusals, and a confirming line must not read a refusal as a change of zero.';

-- "What did we send this tenant about September?" — the confirming line's own
-- read, and the archive's.
create index if not exists sent_figures_month_idx
  on public.sent_figures (client_id, month, reading_at desc);
-- "What has this object been sent as before?" — "the report of {date} read X"
-- beside today's live figure, which is a lookup by object and not by month.
create index if not exists sent_figures_object_idx
  on public.sent_figures (client_id, object_kind, object_id, audience, reading_at desc);

alter table public.sent_figures enable row level security;

drop policy if exists "Members read their sent figures" on public.sent_figures;
create policy "Members read their sent figures" on public.sent_figures
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.sent_figures from authenticated, anon;
grant select on public.sent_figures to authenticated;
-- Stated, not inherited from whatever the project's default ACL happens to be
-- (the config_changes precedent, 2026-09-15; and report_snapshots is the
-- counter-example — it carries the default ALL grants to anon and authenticated
-- to this day, with RLS as its only protection).
--
-- TWO PRIVILEGES AND NO MORE. This is what makes the table append-only. The
-- writer is INSERT … ON CONFLICT DO NOTHING, which PostgreSQL permits with
-- INSERT alone — unlike DO UPDATE, which needs UPDATE even on a row that does
-- not conflict (the mistake month_evidence_refs documents).
grant select, insert on public.sent_figures to service_role;
revoke update, delete, truncate on public.sent_figures from service_role;

-- The guard, said out loud as well as granted away.
--
-- UPDATE ONLY, deliberately, and for the same reason month_reading_frozen_guard
-- is: a DELETE guard would also block the cascades from clients and
-- report_snapshots and make a tenant undeletable. There is no `status` column to
-- key the trigger on, because there is no unfrozen state for one of these rows
-- to be in — every row is frozen the instant it is written.
create or replace function public.sent_figure_frozen_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $guard$
begin
  raise exception 'a sent figure is never rewritten: snapshot %, month %, audience %, % %',
    old.snapshot_id, old.month, old.audience, old.object_kind, old.object_id
    using errcode = 'restrict_violation',
          hint = 'A figure that has been sent is a statement made to named people on a date. Write a new reading; do not correct an old one.';
  return null;
end
$guard$;

comment on function public.sent_figure_frozen_guard() is
  'Refuses every UPDATE on sent_figures. Belt to the ACL''s braces: service_role holds no UPDATE, and this is what still refuses one the day somebody widens that grant without reading the table''s comment.';

drop trigger if exists sent_figures_frozen_guard on public.sent_figures;
create trigger sent_figures_frozen_guard
  before update on public.sent_figures
  for each row
  execute function public.sent_figure_frozen_guard();

-- ============================================================================
-- 3 · plan_checks.notice — WP21's one column
-- ============================================================================
--
-- Ask reads an uploaded plan. A PDF longer than the reader's limit is CLIPPED,
-- and today the sentence saying so is computed at upload and thrown away — so
-- the check's own answer, read back a week later, silently claims to have been
-- made over the whole document. One nullable text column, written by WP21,
-- read by nothing until then.
alter table public.plan_checks
  add column if not exists notice text;

comment on column public.plan_checks.notice is
  'What the reader was told about the document itself at the time of the check — "only the first N pages could be read", "the pages held no text". Null where nothing was wrong with it. Persisted because a judgement read back later must carry what it was made over.';

-- AND THE TABLE'S GRANTS, SAID OUT LOUD WHILE WE ARE HERE.
--
-- `plan_checks` carries the Supabase default ALL grants — DELETE, INSERT,
-- SELECT, UPDATE, TRUNCATE — to `anon` and `authenticated`, with RLS as its
-- only protection and a SELECT policy as its only policy, so a write is
-- refused by RLS rather than by a grant. That is a weaker posture than every
-- Phase 0 table, and this migration is the one adding a column to it.
--
-- Nothing in the product loses anything: every write to `plan_checks` goes
-- through the service role behind an authenticated route
-- (app/api/ask/route.ts, app/api/agent/route.ts), and the one tenant-client
-- read (lib/pages/agent-thread.ts) is a SELECT, which is exactly what is kept.
-- The evaluations table beside it holds the same shape for the same reason.
revoke all on public.plan_checks            from authenticated, anon;
revoke all on public.plan_check_evaluations from authenticated, anon;
grant select on public.plan_checks            to authenticated;
grant select on public.plan_check_evaluations to authenticated;
-- Stated, not inherited (the config_changes precedent, 2026-09-15).
grant select, insert, update, delete on public.plan_checks            to service_role;
grant select, insert, update, delete on public.plan_check_evaluations to service_role;

-- ============================================================================
-- EXERCISED before it was ever applied, on a throwaway PostgreSQL 17 cluster
-- over schema-baseline.sql + every 2026 migration in filename order, applied
-- TWICE:
--   * idempotent — the second apply adds no column twice, creates no constraint
--     twice, leaves one policy, one trigger and three indexes of the same
--     names, and re-runs the four backfills over rows that already have values
--     without touching them (each is `where <column> is null`);
--   * the backfill reads a weekly snapshot's data->>'readingAt' into the column
--     and its data->>'month' into `month`, leaves a document row (no such keys)
--     entirely null, and leaves a row whose readingAt is not an ISO instant
--     null rather than failing;
--   * service_role can INSERT a sent figure and SELECT it back; its UPDATE is
--     refused by the grant ("permission denied for table sent_figures") and,
--     with the grant temporarily restored, by the trigger with the sentence
--     above — both arms checked, because the point of having two is that either
--     one alone can be undone;
--   * INSERT … ON CONFLICT DO NOTHING on an existing key succeeds and writes
--     nothing, WITHOUT the UPDATE privilege (the retry path);
--   * authenticated can select its own tenant's rows through the policy and no
--     other tenant's, and holds no insert, update or delete;
--   * every CHECK refuses a bad value (object_kind, unit, verdict, direction,
--     month_status on the table; month_status and window_basis on the snapshot),
--     and each nullable one accepts null;
--   * deleting a client deletes its sent figures, and deleting the snapshot
--     deletes the figures it printed (both cascades) — the DELETE guard that is
--     deliberately absent is what lets both of those still work.
-- ============================================================================
