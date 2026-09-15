-- The re-analysis-stable theme key (Phase 1 M2, design item 3, decisions J and
-- L, 2026-09-18).
--
-- WHAT IS BROKEN TODAY. A theme's identity is assigned by Jaccard overlap of
-- `audience_insights` ROW IDS (theme_registry.member_insight_ids, matched in
-- lib/pipeline/theme-registry.ts). Those ids are destroyed and re-minted every
-- time Pass A re-reads a video — persistVideo deletes the video's rows and
-- inserts fresh ones with new uuids, and prune-stale-analysis hard-deletes the
-- superseded rows after close-run. So the matching key erodes in proportion to
-- how much of the corpus a run re-read: measured on Össur, one run of ageing
-- costs 20.2% of the stored member references, and the two historical
-- corpus-wide re-reads in this database (2026-08-09→16 and 08-16→23, before
-- incremental Pass A landed) share ZERO insight ids across the boundary while
-- sharing 358 and 486 source VIDEO ids. A Pass A prompt-version bump does
-- exactly that to the whole corpus in one run, and today it would reset every
-- theme to `new` with nothing on screen saying so.
--
-- WHAT THIS MIGRATION ADDS, AND WHY IT HAS TO COME FIRST.
--
--   * `theme_registry.member_video_ids` / `theme_observations.member_video_ids`
--     — the durable half of the membership. `videos.id` survives re-analysis
--     (rows are upserted on (client_id, platform, video_id) and retention
--     TOMBSTONES rather than deletes), and `themes.supporting_video_ids` has
--     carried the set per run, on all 8,192 retained rows, since before the
--     registry existed. It was simply dropped on the way into the registry.
--     The columns are BACKFILLED here, in the same file, because a video arm
--     computed on the fly from member_insight_ids scores 0 — not weakly, zero:
--     jaccard() returns 0 for two empty sets — for 148 of 1,096 Össur (13.5%)
--     and 573 of 1,883 Sealand (30.4%) registry entries, which are precisely
--     the lapsed and dormant entries a stable key exists to revive. Changing
--     the matcher before the column is filled would read as the corpus-wide
--     identity reset item 3 exists to prevent.
--   * `theme_observations.prompt_version` / `.reread_share` — what regime
--     produced this reading and how much of its membership was re-analysed by
--     the run that wrote it. Neither is derivable afterwards:
--     `videos.analyzed_prompt_version` is overwritten in place, and the
--     re-read share's denominator moves at the next run's prune. Stamped at
--     persist time by lib/pipeline/themes.ts.
--   * `pipeline_runs.clustering_key` — a human-legible fingerprint of the
--     regime a run clustered under (lib/pipeline/clustering.ts clusteringKey),
--     written at open-run beside the frozen window and flags. `run_id`
--     inequality is necessary but nowhere near sufficient to answer "did the
--     clustering change between month X and month Y": two runs can produce
--     identical clustering, and one run_id can span a regime change — the Pass
--     A flags flipped between Össur's 29a56395 and d346b0f7 with nothing but a
--     seven-key JSON blob recording it. The key carries those flags itself
--     (`i=`), not only the prompt version they select, because flipping
--     translation or OCR re-reads the corpus a video at a time without moving
--     passAPromptVersion — which is that very event.
--   * `month_denominators.clustering_key` / `month_theme_readings.clustering_key`
--     — the run's fingerprint copied onto the month rows freeze-months writes,
--     so a reader can ask the like-for-like question without joining
--     pipeline_runs across a dozen months. Nullable and additive: NULL is the
--     honest value on every row already frozen (2,957 theme readings and 214
--     denominators, seeded 2026-09-15), and no frozen row is touched here.
--   * The ACL on the three theme tables, brought in line with the Phase 0
--     tables. All three have RLS on with exactly one SELECT policy, but their
--     grants are the project default — anon and authenticated hold all seven
--     privileges. Harmless while no write policy exists (RLS denies), and not
--     something to leave standing in a file that is already touching them.
--
-- WHAT IT DELIBERATELY DOES NOT DO. It re-mints nothing and deletes nothing.
-- `month_theme_readings.theme_id` references `theme_registry(id)` ON DELETE
-- CASCADE and the frozen-row guard is BEFORE UPDATE only (deliberately, so the
-- tenant cascade works), so deleting a registry row silently destroys the
-- frozen months hanging off it — which by design cannot be recomputed. Identity
-- is merged the way scripts/theme-registry.ts --merge does it: move the
-- observations, mark dormant, set parent_theme_id. Never a DELETE.

-- 1. The durable membership ----------------------------------------------------
alter table public.theme_registry
  add column if not exists member_video_ids uuid[] not null default '{}'::uuid[];
alter table public.theme_observations
  add column if not exists member_video_ids uuid[] not null default '{}'::uuid[];

comment on column public.theme_registry.member_video_ids is
  'The distinct source videos of this entry''s current members (themes.supporting_video_ids of the run that last claimed it). The PRIMARY matching key from 2026-09-18: videos.id survives a Pass A re-read, audience_insights.id does not. member_insight_ids stays as the second arm and the below-floor tiebreak.';
comment on column public.theme_observations.member_video_ids is
  'The distinct source videos behind this observation, as stored at persist time. Durable where member_insight_ids is not: 20.2% of one-run-old member references already point at pruned rows.';

-- 2. What regime produced the reading ------------------------------------------
alter table public.theme_observations add column if not exists prompt_version text;
alter table public.theme_observations add column if not exists reread_share numeric;

alter table public.theme_observations drop constraint if exists theme_observations_reread_share_check;
alter table public.theme_observations add constraint theme_observations_reread_share_check
  check (reread_share is null or (reread_share >= 0 and reread_share <= 1));

comment on column public.theme_observations.prompt_version is
  'The Pass A prompt version the RUN that wrote this observation was booking against (lib/pipeline/pass-a.ts passAPromptVersion — v4 with transcripts, v3 without). NULL on every row written before 2026-09-18; not reconstructable from videos.analyzed_prompt_version, which is overwritten in place, though ai_call_log dates each regime if anyone ever needs the history.';
comment on column public.theme_observations.reread_share is
  'Share of this theme''s member videos that the run re-analysed (videos.analyzed_run_id = the run), 0..1, computed inside persist-themes BEFORE prune-stale-analysis moves the denominator. 1.0 across a whole run is a corpus-wide re-read — the break a direction word may not be spoken across.';

-- 3. The clustering fingerprint ------------------------------------------------
alter table public.pipeline_runs        add column if not exists clustering_key text;
alter table public.month_denominators   add column if not exists clustering_key text;
alter table public.month_theme_readings add column if not exists clustering_key text;

comment on column public.pipeline_runs.clustering_key is
  'The regime this run clustered under, as a legible fingerprint: pass A prompt version, pass A input flags (transcripts/translation/ocr), cluster similarity threshold, evidence floor, merge model, merge prompt version, theme-key rule (lib/pipeline/clustering.ts clusteringKey). Frozen at open-run beside the window and the flags. NULL on every run opened before 2026-09-18 and on any run opened while this migration had not landed — which reads as "unknown", never as "the same as the next one".';
comment on column public.month_theme_readings.clustering_key is
  'The clustering fingerprint of the run named in run_id, copied here by freeze-months so a reader can tell a re-grouping from an ordinary change of run without joining pipeline_runs a dozen times. NULL means unknown (rows frozen before 2026-09-18, or written by a run that carried no key) and a reader may not read two NULLs as equal.';
comment on column public.month_denominators.clustering_key is
  'The clustering fingerprint of the run named in run_id, or NULL for a seed written with no run at all. A denominator does not depend on the clustering — it is a count of videos and comments per audience — so this column is bookkeeping, not a caveat: the caveat belongs on month_theme_readings.';

-- 4. Backfill — every entry that has a themes row ------------------------------
-- The newest themes row per (client, registry_id): that is the membership the
-- entry currently stands on, and it is stored per run and never pruned.
-- Measured on production 2026-09-15: Össur covers 1,096 of 1,096 entries;
-- Sealand 1,860 of 1,927. The 67 it misses have no `themes` row at all and
-- there is nothing anywhere to fill them from — they are debris from two
-- retried persist-themes runs (35 from cb0d97b2 on 09-10, 32 from 5a2ebc43 on
-- 09-15), whose first attempt's theme rows were deleted by the retry's
-- delete-then-insert while the observations upsert kept the entries alive. The
-- population GROWS by roughly thirty every time a run of that size is retried,
-- so the number here is a reading, not a constant. They score 0 on the video
-- arm and fall through to the insight arm exactly as they do today; they are
-- never deleted (see the theme_registry grant at the end of this file).
--
-- Idempotent by the empty-array predicate rather than by ON CONFLICT: the
-- second apply finds every row already filled and writes nothing, and a row a
-- LATER run has since updated is never dragged back to the migration's answer.
update public.theme_registry tr
   set member_video_ids = src.supporting_video_ids
  from (
    select distinct on (t.client_id, t.registry_id)
           t.client_id, t.registry_id, t.supporting_video_ids
      from public.themes t
     where t.registry_id is not null
       and coalesce(cardinality(t.supporting_video_ids), 0) > 0
     order by t.client_id, t.registry_id, t.created_at desc, t.id desc
  ) src
 where src.client_id = tr.client_id
   and src.registry_id = tr.id
   and coalesce(cardinality(tr.member_video_ids), 0) = 0;

-- The same lift for the record: an observation's video set is the themes row of
-- ITS OWN run, not the newest one. Where both survive the two agree exactly —
-- 757/757 on Össur's d346b0f7 and 1,053/1,053 on Sealand's 5a2ebc43, because
-- aggregate() builds both arrays from one cluster — so this is a lift, not a
-- re-derivation. A run whose themes rows were deleted by a retry keeps '{}'.
update public.theme_observations o
   set member_video_ids = src.supporting_video_ids
  from (
    select distinct on (t.client_id, t.run_id, t.registry_id)
           t.client_id, t.run_id, t.registry_id, t.supporting_video_ids
      from public.themes t
     where t.registry_id is not null
       and coalesce(cardinality(t.supporting_video_ids), 0) > 0
     order by t.client_id, t.run_id, t.registry_id, t.created_at desc, t.id desc
  ) src
 where src.client_id = o.client_id
   and src.run_id = o.run_id
   and src.registry_id = o.theme_id
   and coalesce(cardinality(o.member_video_ids), 0) = 0;

-- 5. The ACL, stated rather than inherited -------------------------------------
-- All three tables have RLS on with a single `for select using (client_id =
-- get_my_client_id())` policy applied to PUBLIC, so writes are already denied
-- to anyone but the service role — by the ABSENCE of a write policy, which is
-- one accidental policy away from not being true. The grants themselves are
-- this project's default: SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER
-- and TRUNCATE to anon and authenticated alike. The Phase 0 tables revoke and
-- re-grant explicitly (20260915091000:60-70, 20260915092000:230-238); these
-- three were never tightened, and this file is already touching all three.
revoke all on public.themes             from authenticated, anon;
revoke all on public.theme_registry     from authenticated, anon;
revoke all on public.theme_observations from authenticated, anon;

grant select on public.themes             to authenticated;
grant select on public.theme_registry     to authenticated;
grant select on public.theme_observations to authenticated;

-- themes is replaced per (client_id, run_id) by persist-themes, so it needs the
-- delete. TRUNCATE is not how any writer empties it and emptying the table in
-- one statement is the same act as doing it row by row.
grant select, insert, update, delete on public.themes             to service_role;
grant select, insert, update, delete on public.theme_observations to service_role;
revoke truncate on public.themes             from service_role;
revoke truncate on public.theme_observations from service_role;

-- theme_registry gets NO delete, and this is the load-bearing line of the
-- section. month_theme_readings.theme_id references this table ON DELETE
-- CASCADE and the frozen-month guard is BEFORE UPDATE only, so one DELETE here
-- silently takes every frozen month row hanging off that identity with it, and
-- a frozen month cannot be recomputed: the Pass A prune has taken the
-- citations and the retention sweep has taken the comments. Retiring is
-- status='dormant'; merging is parent_theme_id + moving the observations
-- (scripts/theme-registry.ts --merge). The tenant cascade from clients is
-- unaffected — a referential action runs with the rights of the constraint,
-- not of the caller.
grant select, insert, update on public.theme_registry to service_role;
revoke delete, truncate on public.theme_registry from service_role;
