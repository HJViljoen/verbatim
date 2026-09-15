-- The anomaly check's record: what was flagged, on what numbers, and why
-- (Phase 1 WP8, design item 40 + §9.20, decision S, 2026-09-18).
--
-- WHAT THIS TABLE IS. Once an update, the pipeline compares the week it just
-- covered with the trailing three complete months over a pre-registered set of
-- objects (lib/reading/anomaly.ts). At most three of them are shown to anybody.
-- This is where those three are written down, with every number the comparison
-- was made on, so that the quarterly review's method page can print "here is
-- what we flagged this quarter and here is what each one turned out to be" —
-- the design's own requirement (§6 item 40, §3 QR page 7) — and so that the
-- rate at which the rule fires is a measurement rather than a memory.
--
-- WHY IT IS APPEND-ONLY AND WHY THAT IS THE SAME THING AS FROZEN. A flag is a
-- statement made on a date, out of a reading taken at that moment, under the
-- clustering and the corpus that existed then. Re-reading the same week a month
-- later gives different numbers — the corpus behind it has grown, late comments
-- have landed, a re-analysis has moved insights — so a row that could be
-- corrected would be a record of nothing. The month tables express the same
-- rule with a status column and a BEFORE UPDATE trigger because they are
-- rewritten while their month fills; this table is never rewritten at all, so
-- the rule is expressed in the ACL: service_role holds SELECT and INSERT and
-- nothing else. `frozen_at` is therefore not a state, it is a timestamp of when
-- the statement was made, and there is no unfrozen state for a row to be in.
--
-- WHICH MEANS A SECOND UPDATE IN THE SAME WEEK ADDS, IT DOES NOT REPLACE. The
-- key is (client_id, run_id, object_kind, object_id): one update's reading of
-- one object, once. A retry of the same run re-inserts nothing (the writer uses
-- ON CONFLICT DO NOTHING, which needs no UPDATE privilege); a second update
-- covering an overlapping week writes its own rows under its own run_id, and a
-- reader grouping by week sees two readings and can say so. That is the honest
-- shape: two updates covering the same days really did make two statements.
--
-- IDS AND COUNTS, NEVER WORDS. `quote_refs` holds comment ids and their
-- context, never the text — the rule lib/reports/ already keeps and the one
-- month_evidence_refs keeps, for the same reason: retention deletes comments,
-- and a record that kept a copy would outlive the deletion. The explanation is
-- the model's prose ABOUT the flag, which is ours and not anybody's comment;
-- the words it points at are resolved at render from the live comment or
-- printed as "counted, not quotable" when they are gone.
--
-- WHAT IS DELIBERATELY NOT HERE. The rows that were tested and not flagged.
-- Thirty-odd objects a week per tenant, almost all of them "no clear change",
-- is a table that grows for nobody: `set_size` and `tested` on each flag carry
-- the family the correction was made over, which is the only part of the
-- unflagged set a reader of a flag needs. A week in which nothing fired writes
-- no row, and "nothing was unusual this week" is composed in code from that
-- absence — it always will be, because it is the answer the check gives most
-- weeks and it must never cost a model call.

create table if not exists public.anomaly_flags (
  client_id     uuid not null references public.clients(id) on delete cascade,
  -- The update whose reading this is. NOT NULL and part of the key: a flag
  -- without the update that raised it cannot be re-derived, and every caller
  -- has one (the check runs inside the pipeline).
  run_id        uuid not null references public.pipeline_runs(id) on delete cascade,
  -- The run's frozen window (pipeline_runs.window_start / window_end), copied
  -- here so a quarter's flags can be read without a join and so the row still
  -- says which days it covered if the run row is ever pruned. Half-open
  -- [start, end), the same convention every window read uses. "week" is what
  -- the product calls it; what it actually is, always, is the days this update
  -- covered — which is a week on a weekly cadence and is not on any other.
  week_start    timestamptz not null,
  week_end      timestamptz not null,
  object_kind   text not null check (object_kind in ('subject', 'kind', 'rival', 'theme')),
  -- A subjects.id, an insight category slug, the `competitor:<name>` audience
  -- string, or a theme_registry.id. Text and unkeyed, as month_evidence_refs
  -- carries the same union: a frozen statement about a theme survives a
  -- re-minted registry row, and should.
  object_id     text not null,
  -- What the reader was shown. Decoration, never a key — theme labels churn
  -- about 88% run to run.
  label         text not null,
  -- WHAT THE SHARE IS A SHARE OF, by name. Decision S keeps one pooled
  -- denominator per tenant-week ("every audience together"), which is the n the
  -- design's arithmetic uses and the only series that clears the floor on
  -- either tenant today. A rival's attention is therefore a share of the whole
  -- update, not of its own audience, and the surface has to say so — which is
  -- why the name is stored beside the numbers rather than assumed.
  denominator   text not null,
  week_k        int not null,
  week_n        int not null,
  baseline_k    int not null,
  baseline_n    int not null,
  -- The months pooled into the baseline, oldest first. Without them the
  -- baseline is a number nobody can re-read: month rows freeze under whatever
  -- clustering was current when each passed its line, so which months went in
  -- is part of the statement (AGENTS.md's like-for-like rule).
  baseline_months date[] not null,
  -- Whether those months were read under ONE grouping. 'one' they were;
  -- 'mixed' they were not; 'unknown' at least one month is older than the
  -- clustering fingerprint and nobody can say; 'not_grouped' the object has no
  -- grouping to be like-for-like about (a kind is a kind). The check MARKS this
  -- and still reports the flag — decision L's posture, and available to it
  -- because an anomaly reading never speaks a direction word.
  baseline_regime text not null check (baseline_regime in ('one', 'mixed', 'unknown', 'not_grouped')),
  -- The band, as proportionDelta drew it: the difference in points and the
  -- half-width it had to clear. Both rounded to 1 dp for display, exactly as
  -- printed.
  change_pts    numeric not null,
  band_pts      numeric not null,
  -- The two-sided p for the difference and the Holm threshold it cleared. The
  -- threshold is alpha/(m − rank + 1) over the WHOLE pre-registered set, which
  -- is why set_size is stored with it: a p of 0.004 means nothing without the
  -- number of questions asked to get it.
  p             double precision not null,
  holm_threshold double precision not null,
  set_size      int not null,
  tested        int not null,
  -- 1 for the largest movement of the week, 2, 3. At most MAX_FLAGS rows per
  -- run; `flagged_count` says how many cleared both gates before the cap.
  rank          int not null check (rank >= 1),
  flagged_count int not null,
  -- The explanation, as lib/prose/interpret.ts composed it: sentences with
  -- their figure tokens intact, whether the product wrote it instead of the
  -- model, and what the scrubbers took out. Null when the check wrote no
  -- explanation at all.
  explanation   jsonb,
  -- The model that drafted it, or null when the product composed the slot
  -- itself. Stored because "who wrote this sentence" is the one thing a reader
  -- of an interpretation slot cannot recover from the sentence.
  explanation_model text,
  -- [{ref, context}] — comment ids and their audience/platform. Never a word
  -- anybody wrote; resolvability is computed at render.
  quote_refs    jsonb not null default '[]'::jsonb,
  read_at       timestamptz not null,
  frozen_at     timestamptz not null default now(),
  primary key (client_id, run_id, object_kind, object_id)
);

comment on table public.anomaly_flags is
  'Every flag the weekly anomaly check has raised, with the numbers it was raised on (design item 40). Append-only and frozen by its ACL: a flag is a statement made on a date under the corpus that existed then, and re-reading the same week later gives different numbers. Counts and ids only — never a comment''s words.';
comment on column public.anomaly_flags.week_start is
  'The run''s frozen window start (pipeline_runs.window_start), half-open with week_end. Called "week" because that is what a weekly cadence makes it; on any other cadence it is simply the days the update covered, and the row says which.';
comment on column public.anomaly_flags.denominator is
  'The population the share is a share of, by name — "every audience together" under decision S. A rival''s attention is a share of the whole update, not of its own audience; a surface that prints the flag prints this beside it.';
comment on column public.anomaly_flags.baseline_regime is
  'Whether the pooled baseline months were read under one clustering. The check marks a mixed or unknown regime and still reports the flag, because an anomaly reading states a level and a difference and never a direction word — the thing decision L reserves for one regime.';
comment on column public.anomaly_flags.quote_refs is
  'Comment ids and their context, never text. Expect decay: measured on production 2026-09-15, 32 of 1,217 comment refs in shipped snapshots no longer resolved.';

-- The quarterly review's read: this tenant's flags over a date range, newest
-- first. The primary key leads on client_id but then on run_id, which is no
-- help to a range over weeks.
create index if not exists anomaly_flags_week_idx
  on public.anomaly_flags (client_id, week_start desc);
-- "What has this object been flagged for before?" — the method page's second
-- question, and the one a surface asks when it prints a flag.
create index if not exists anomaly_flags_object_idx
  on public.anomaly_flags (client_id, object_kind, object_id, week_start desc);

alter table public.anomaly_flags enable row level security;

drop policy if exists "Members read their anomaly flags" on public.anomaly_flags;
create policy "Members read their anomaly flags" on public.anomaly_flags
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.anomaly_flags from authenticated, anon;
grant select on public.anomaly_flags to authenticated;
-- Stated, not inherited from whatever the project's default ACL happens to be
-- (the config_changes precedent, 2026-09-15). TWO privileges and no more: the
-- ACL is what makes this table append-only, and it is the only thing that does
-- — there is no status column and no BEFORE UPDATE trigger here, because there
-- is no filling state for a row to be in. The writer is INSERT … ON CONFLICT DO
-- NOTHING, which PostgreSQL permits with INSERT alone (unlike DO UPDATE, which
-- needs UPDATE even on a non-conflicting row — the mistake month_evidence_refs
-- documents).
grant select, insert on public.anomaly_flags to service_role;
revoke update, delete, truncate on public.anomaly_flags from service_role;

-- ============================================================================
-- EXERCISED before it was ever applied, on a throwaway PostgreSQL 17 cluster
-- over schema-baseline.sql + every 2026 migration in filename order, applied
-- TWICE:
--   * idempotent — the second apply creates nothing twice, leaves one policy
--     and two indexes of the same names, and does not disturb a row already
--     written;
--   * service_role can INSERT a flag and SELECT it back, and its UPDATE and
--     DELETE are refused with "permission denied for table anomaly_flags" —
--     the append-only rule, enforced by the grant and nothing else;
--   * INSERT … ON CONFLICT DO NOTHING on an existing key succeeds and writes
--     nothing, WITHOUT the UPDATE privilege (the retry path);
--   * authenticated can select its own tenant's rows through the policy and no
--     other tenant's, and holds no insert, update or delete;
--   * the object_kind, baseline_regime and rank checks refuse a bad value;
--   * deleting a client deletes its flags, and deleting a run deletes the
--     flags raised by it (both cascades).
-- ============================================================================
