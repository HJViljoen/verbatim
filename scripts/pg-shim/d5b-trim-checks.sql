-- Deploy 5b and the 4 Oct freeze, on the throwaway cluster (every migration
-- applied, MF1 to MF5 among them):
--
--   bash scripts/pg-shim/d5b-trim-checks.sh <scratch dir>
--
-- THE DEFECT. freeze-months writes the month tables before close-run, and
-- prune-stale-analysis runs after it. monthly_subject_readings reads a
-- subject's members through subject_memberships over the BASE insights table,
-- and subject_memberships cascades from audience_insights. So a run's freeze
-- counted each re-read video's OLD member insights, and the prune deleted them
-- minutes later. Production, 27 Sep: 203 stored for Buying & delivery, 199 live.
--
-- THE FIX (lib/pipeline/stale-analysis.ts): trim-stale-memberships deletes the
-- memberships of exactly the insights the prune will delete, before any month
-- is read; a trim that does not finish holds freeze-months' subject side; and
-- the prune keeps any insight a membership still counts.
--
-- THE CHECK. Three tenants, seeded identically (twelve videos, six of them
-- re-read by the running run: each keeps its OLD insight, superseded, beside
-- the NEW one; one old insight cited, so the prune keeps it; two subjects with
-- members old, new and current, a judged NO among them; an on-camera member;
-- the running run's themes; the stored filling months the 27 Sep run left):
--   A is deploy 5's order:   freeze, then the prune;
--   B is deploy 5b's order:  the trim, freeze, then the prune (with its hold);
--   C is deploy 5b with the trim out of retries: freeze with the subject side
--     held, then the prune (with its hold).
-- The trim and the prune are the statements the code sends (a DELETE on
-- subject_memberships by audience_insight_id; a DELETE on audience_insights by
-- id), as service_role, over the set staleInsightIds gives under the citation
-- protection (restated here in SQL: the TypeScript rule has its own tests).
--   E1. A reproduces the defect: its stored subject rows are not what
--       monthly_subject_readings reads after its prune.
--   E2. B's stored subject rows ARE what it reads after its prune, row for row
--       and column for column, August frozen.
--   E3. Only the phantoms went: B's stored subject rows are A's less exactly
--       the videos only a prune-bound member reached (counted here by hand from
--       the seed), and the other five month tables are A's row for row.
--   E4. The trim moves nothing else: before the freeze, the five other month
--       functions read the same on A and on B.
--   E5. C: no subject row written, the prune kept every superseded member, and
--       monthly_subject_readings reads the same after the prune as before it.
--   E6. subject_memberships carries no trigger, and after the prune no
--       membership names a deleted insight on any tenant.
--   E7. The lens step (deploy 4; it writes August's month_lens_readings FROZEN
--       on 4 Oct, before freeze-months) reads lens_readings, which reads
--       subject_memberships too: after the trim it reads on B what A reads
--       after its prune for every subject, and the same as A before the trim
--       for every other object.
-- The tenants and their counts are made up; the arithmetic is the test's own.
\set ON_ERROR_STOP 1

delete from public.clients where id in ('00000000-0000-4000-8000-00000000d5a1', '00000000-0000-4000-8000-00000000d5b1', '00000000-0000-4000-8000-00000000d5c1');

create or replace function pg_temp.d5_id(c uuid, what text) returns uuid language sql immutable as
$$ select md5(c::text || '/' || what)::uuid $$;

create or replace function pg_temp.d5_seed(c uuid) returns void language plpgsql as $seed$
declare
  r0 uuid := pg_temp.d5_id(c, 'run-0927');
  r1 uuid := pg_temp.d5_id(c, 'run-1004');
  s1 uuid := pg_temp.d5_id(c, 'subject-1');
  s2 uuid := pg_temp.d5_id(c, 'subject-2');
  th uuid;
  g int;
begin
  insert into public.clients (id, company_name) values (c, 'd5b trim check');
  insert into public.tracking_configs (client_id, competitor_names, competitor_keywords, platforms)
    values (c, '{Cotopaxi}', '{cotopaxi backpack}', '{youtube,tiktok,reddit}');
  insert into public.pipeline_runs (id, client_id, status, started_at, completed_at) values
    (r0, c, 'completed', '2026-09-27 04:00Z', '2026-09-27 07:28Z'),
    (r1, c, 'running',   '2026-10-04 04:00Z', null);
  -- Twelve videos, every one analysed by the running run: ten in the category,
  -- two filed under Cotopaxi. Two August comments and one September comment each.
  for g in 1..12 loop
    insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor, competitor_name,
                               analyzed_lane, analyzed_run_id, sentiment, sentiment_source, caption, hashtags, upload_date, scraped_at)
    values (pg_temp.d5_id(c, 'v' || g), c, (array['youtube','tiktok','reddit'])[1 + g % 3], 'vid-' || g, 'u', 'acct-' || (g % 4),
            false, g >= 11, case when g >= 11 then 'Cotopaxi' end, 'full', r1,
            (array['positive','negative','neutral'])[1 + g % 3], 'audience', 'which bag lasts', '{}', '2026-08-01', '2026-08-02 05:00Z');
    insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, created_at, text) values
      (pg_temp.d5_id(c, 'c-aug1-' || g), c, r0, (array['youtube','tiktok','reddit'])[1 + g % 3], 'vid-' || g, g || '-a1', '2026-08-12 12:00Z', '2026-09-27 05:00Z', 'august'),
      (pg_temp.d5_id(c, 'c-aug2-' || g), c, r0, (array['youtube','tiktok','reddit'])[1 + g % 3], 'vid-' || g, g || '-a2', '2026-08-20 12:00Z', '2026-09-27 05:00Z', 'august'),
      (pg_temp.d5_id(c, 'c-sep-'  || g), c, r1, (array['youtube','tiktok','reddit'])[1 + g % 3], 'vid-' || g, g || '-s',  '2026-09-21 12:00Z', '2026-10-04 05:00Z', 'september');
  end loop;
  -- Videos 1 to 6 were re-read by the running run: the OLD insight (27 Sep's
  -- reading, August and September cited) is superseded, the NEW one cites
  -- September only. Videos 7 to 12 carry one current insight each, citing both.
  for g in 1..6 loop
    insert into public.audience_insights (id, client_id, run_id, category, theme, description, source_video_id) values
      (pg_temp.d5_id(c, 'old' || g), c, r0, 'praise', 'o' || g, 'd', pg_temp.d5_id(c, 'v' || g)),
      (pg_temp.d5_id(c, 'new' || g), c, r1, 'praise', 'n' || g, 'd', pg_temp.d5_id(c, 'v' || g));
    insert into public.insight_evidence (audience_insight_id, comment_id, quote, source, source_video_id) values
      (pg_temp.d5_id(c, 'old' || g), pg_temp.d5_id(c, 'c-aug1-' || g), 'august', 'comment', null),
      (pg_temp.d5_id(c, 'old' || g), pg_temp.d5_id(c, 'c-sep-'  || g), 'september', 'comment', null),
      (pg_temp.d5_id(c, 'new' || g), pg_temp.d5_id(c, 'c-sep-'  || g), 'september', 'comment', null);
  end loop;
  for g in 7..12 loop
    insert into public.audience_insights (id, client_id, run_id, category, theme, description, source_video_id) values
      (pg_temp.d5_id(c, 'cur' || g), c, r1, 'question', 'c' || g, 'd', pg_temp.d5_id(c, 'v' || g));
    insert into public.insight_evidence (audience_insight_id, comment_id, quote, source, source_video_id) values
      (pg_temp.d5_id(c, 'cur' || g), pg_temp.d5_id(c, 'c-aug1-' || g), 'august', 'comment', null),
      (pg_temp.d5_id(c, 'cur' || g), pg_temp.d5_id(c, 'c-sep-'  || g), 'september', 'comment', null);
  end loop;
  -- An on-camera member (no comment evidence) on video 8, current.
  insert into public.audience_insights (id, client_id, run_id, category, theme, description, source_video_id)
    values (pg_temp.d5_id(c, 'cam8'), c, r1, 'pain_point', 'cam', 'd', pg_temp.d5_id(c, 'v8'));
  insert into public.insight_evidence (audience_insight_id, comment_id, quote, source, source_video_id)
    values (pg_temp.d5_id(c, 'cam8'), null, 'said on camera', 'video', pg_temp.d5_id(c, 'v8'));
  -- The running run's themes: its current insights, as loadGroupedInsights builds them.
  for g in 1..2 loop
    th := pg_temp.d5_id(c, 'theme' || g);
    insert into public.theme_registry (id, client_id, bucket, canonical_label) values (th, c, 'industry-other', 'theme ' || g);
  end loop;
  insert into public.theme_observations (theme_id, client_id, run_id, label, member_insight_ids, match_kind) values
    (pg_temp.d5_id(c, 'theme1'), c, r1, 'theme 1', array(select pg_temp.d5_id(c, 'new' || x) from generate_series(1, 6) x), 'exact'),
    (pg_temp.d5_id(c, 'theme2'), c, r1, 'theme 2', array(select pg_temp.d5_id(c, 'cur' || x) from generate_series(7, 12) x) || pg_temp.d5_id(c, 'cam8'), 'exact');
  -- Two subjects. S1: every old insight, the new ones the judge took (2, 4, 6),
  -- four current ones and the on-camera one. S2: old3, a judged NO on old5 and
  -- on new3, and the two Cotopaxi videos.
  insert into public.subjects (id, client_id, name, origin, status) values
    (s1, c, 'Durability', 'category_theme', 'active'), (s2, c, 'Price', 'category_theme', 'active');
  insert into public.subject_memberships (subject_id, audience_insight_id, client_id, member, method, judge_version, run_id)
    select s1, pg_temp.d5_id(c, x), c, true, 'judge', 'subject_judge_v1', r1
      from unnest(array['old1','old2','old3','old4','old5','old6','new2','new4','new6','cur7','cur8','cur9','cur10','cam8']) x
    union all
    select s2, pg_temp.d5_id(c, x), c, x not in ('old5', 'new3'), 'judge', 'subject_judge_v1', r1
      from unnest(array['old3','old5','new3','cur11','cur12']) x;
  -- The stored rows the 27 Sep run left: August and September filling.
  insert into public.month_denominators (client_id, month, audience, videos, comments, platform_mix, status, origin, read_at, run_id, frozen_at) values
    (c, '2026-08-01', 'industry-other',      10, 20, '{}', 'filling', 'live', '2026-09-27 07:22Z', r0, null),
    (c, '2026-08-01', 'competitor:Cotopaxi',  2,  4, '{}', 'filling', 'live', '2026-09-27 07:22Z', r0, null),
    (c, '2026-09-01', 'industry-other',      10, 10, '{}', 'filling', 'live', '2026-09-27 07:22Z', r0, null);
end
$seed$;

begin;
select pg_temp.d5_seed('00000000-0000-4000-8000-00000000d5a1');
select pg_temp.d5_seed('00000000-0000-4000-8000-00000000d5b1');
select pg_temp.d5_seed('00000000-0000-4000-8000-00000000d5c1');
commit;

-- The prune's set: staleInsightIds (lib/pipeline/pass-a-plan.ts) under the
-- citation protection. The one cited row is old2 (a recommendation's evidence,
-- as citedEvidenceIds resolves it); the seed's labels stand in for the ids.
create or replace function pg_temp.d5_prunable(c uuid) returns setof uuid language sql stable as $$
  select ai.id
    from public.audience_insights ai
    left join public.videos v on v.id = ai.source_video_id
   where ai.client_id = c
     and (ai.run_id is null or ai.source_video_id is null or v.analyzed_run_id is distinct from ai.run_id)
     and ai.id <> pg_temp.d5_id(c, 'old2')
$$;

-- What the freeze reads, per tenant, as comparable text (ids to seed labels).
create or replace function pg_temp.d5_label(c uuid, id uuid) returns text language sql stable as $$
  select coalesce((select x from unnest(array['subject-1','subject-2','theme1','theme2']) x where pg_temp.d5_id(c, x) = id), id::text)
$$;
create or replace function pg_temp.d5_reads(c uuid) returns table (what text, line text) language plpgsql as $reads$
declare
  r1 uuid := pg_temp.d5_id(c, 'run-1004');
  f timestamptz := '2026-08-01'; t timestamptz := '2026-11-01';
begin
  return query select 'denominators', format('%s|%s|%s|%s|%s', d.month, d.audience, d.videos, d.comments, d.platform_mix) from public.monthly_denominators(c, f, t) d;
  return query select 'themes', format('%s|%s|%s|%s|%s|%s|%s', x.month, x.audience, pg_temp.d5_label(c, x.theme_id), x.videos, x.comments, x.excluded_on_camera, x.excluded_undated) from public.monthly_theme_readings(c, r1, f, t) x;
  return query select 'kinds', format('%s|%s|%s|%s|%s', k.month, k.audience, k.kind, k.videos, k.comments) from public.monthly_kind_readings(c, f, t) k;
  return query select 'stats', format('%s|%s|%s|%s', s.month, s.audience, s.judged, s.positive) from public.monthly_audience_stats(c, null, f, t) s;
  return query select 'refs', format('%s|%s|%s|%s|%s', e.month, e.audience, pg_temp.d5_label(c, e.theme_id), cardinality(e.video_ids), cardinality(e.comment_ids)) from public.monthly_evidence_refs(c, r1, f, t) e;
  return query select 'subjects', format('%s|%s|%s|%s|%s|%s|%s|%s', s.month, s.audience, pg_temp.d5_label(c, s.subject_id), s.videos, s.comments, s.platform_mix, s.excluded_on_camera, s.excluded_undated) from public.monthly_subject_readings(c, f, t) s;
end
$reads$;

create temp table d5_before as
  select 'A' as tenant, * from pg_temp.d5_reads('00000000-0000-4000-8000-00000000d5a1')
  union all select 'B', * from pg_temp.d5_reads('00000000-0000-4000-8000-00000000d5b1')
  union all select 'C', * from pg_temp.d5_reads('00000000-0000-4000-8000-00000000d5c1');
do $$
begin
  if exists (select what, line from d5_before where tenant = 'A' except select what, line from d5_before where tenant = 'B')
     or exists (select what, line from d5_before where tenant = 'B' except select what, line from d5_before where tenant = 'A')
     or exists (select what, line from d5_before where tenant = 'A' except select what, line from d5_before where tenant = 'C') then
    raise exception 'seed FAILED: the three tenants do not read the same before the run';
  end if;
  if (select count(*) from d5_before where tenant = 'A' and what = 'subjects') < 4 then raise exception 'seed FAILED: too few subject lines'; end if;
  raise notice 'ok  seed: three identical tenants; the six functions read % lines each (% of them subjects)',
    (select count(*) from d5_before where tenant = 'A'), (select count(*) from d5_before where tenant = 'A' and what = 'subjects');
end $$;

-- What the lens step reads (MF2's lens_readings, the stored lens with the
-- defaults: every video, depth 1, no capture cut), August and September.
create or replace function pg_temp.d5_lens(c uuid) returns table (line text) language sql stable as $$
  select format('%s|%s|%s|%s|%s|%s', m.m, l.audience, l.object_kind,
                case when l.object_kind in ('subject', 'theme') then pg_temp.d5_label(c, l.object_id::uuid) else l.object_id end, l.k, l.n)
    from (values (date '2026-08-01'), (date '2026-09-01')) m(m),
         lateral public.lens_readings(c, m.m, pg_temp.d5_id(c, 'run-1004'), null, 1, null) l
$$;
create temp table d5_lens_a_before as select line from pg_temp.d5_lens('00000000-0000-4000-8000-00000000d5a1');

-- B's trim, before any month is read: the memberships of the prune's rows,
-- the statement the code sends, as service_role.
begin;
set local role service_role;
delete from public.subject_memberships
 where client_id = '00000000-0000-4000-8000-00000000d5b1'
   and audience_insight_id in (select pg_temp.d5_prunable('00000000-0000-4000-8000-00000000d5b1'));
commit;

-- E4. The trim moved monthly_subject_readings and nothing else.
create temp table d5_trimmed as select 'B' as tenant, * from pg_temp.d5_reads('00000000-0000-4000-8000-00000000d5b1');
create temp table d5_lens_b_trimmed as select line from pg_temp.d5_lens('00000000-0000-4000-8000-00000000d5b1');
do $$
declare diff text;
begin
  select string_agg(format('%s %s', what, line), E'\n') into diff from (
    (select what, line from d5_before where tenant = 'A' and what <> 'subjects' except select what, line from d5_trimmed where what <> 'subjects')
    union all
    (select what, line from d5_trimmed where what <> 'subjects' except select what, line from d5_before where tenant = 'A' and what <> 'subjects')) x;
  if diff is not null then raise exception E'E4 FAILED: the trim moved another month function:\n%', diff; end if;
  if not exists (select line from d5_before where tenant = 'A' and what = 'subjects' except select line from d5_trimmed where what = 'subjects') then
    raise exception 'E4 FAILED: the trim did not move the subject reading (the seed has phantoms to remove)';
  end if;
  raise notice 'ok  E4: after the trim, the denominators, themes, kinds, stats and evidence ids read on B exactly as on A; only the subject reading moved';
end $$;

-- The freeze, the statements freezeMonths sends (d4-freeze-checks.sql's):
-- every numerator first (August frozen, the 4 Oct clock), the marker last.
-- p_subjects false is trimFreezeHold: the subject side is not written.
create or replace function pg_temp.d5_freeze(c uuid, p_subjects boolean) returns void language plpgsql as $freeze$
declare
  r1 uuid := pg_temp.d5_id(c, 'run-1004');
  f timestamptz := '2026-08-01'; t timestamptz := '2026-11-01';
  at timestamptz := '2026-10-04 08:20Z';
begin
  insert into public.month_theme_readings (client_id, month, audience, theme_id, videos, comments, platform_mix, excluded_on_camera, excluded_undated,
                                           status, origin, read_at, run_id, frozen_at, clustering_key)
    select c, x.month, x.audience, x.theme_id, x.videos, x.comments, x.platform_mix, x.excluded_on_camera, x.excluded_undated,
           case when x.month = '2026-08-01' then 'frozen' else 'filling' end, 'live', at, r1, case when x.month = '2026-08-01' then at end, 'ck-1004'
      from public.monthly_theme_readings(c, r1, f, t) x
  on conflict (client_id, month, audience, theme_id) do update set videos = excluded.videos, comments = excluded.comments, status = excluded.status, frozen_at = excluded.frozen_at, read_at = excluded.read_at;
  insert into public.month_kind_readings (client_id, month, audience, kind, videos, comments, platform_mix, excluded_on_camera, excluded_undated,
                                          status, origin, read_at, run_id, frozen_at)
    select c, k.month, k.audience, k.kind, k.videos, k.comments, k.platform_mix, k.excluded_on_camera, k.excluded_undated,
           case when k.month = '2026-08-01' then 'frozen' else 'filling' end, 'live', at, r1, case when k.month = '2026-08-01' then at end
      from public.monthly_kind_readings(c, f, t) k
  on conflict (client_id, month, audience, kind) do update set videos = excluded.videos, status = excluded.status, frozen_at = excluded.frozen_at, read_at = excluded.read_at;
  if p_subjects then
    insert into public.month_subject_readings (client_id, month, audience, subject_id, videos, comments, platform_mix, excluded_on_camera, excluded_undated,
                                               status, origin, read_at, run_id, frozen_at, judge_version)
      select c, s.month, s.audience, s.subject_id, s.videos, s.comments, s.platform_mix, s.excluded_on_camera, s.excluded_undated,
             case when s.month = '2026-08-01' then 'frozen' else 'filling' end, 'live', at, r1, case when s.month = '2026-08-01' then at end, 'subject_judge_v1'
        from public.monthly_subject_readings(c, f, t) s
    on conflict (client_id, month, audience, subject_id) do update set videos = excluded.videos, comments = excluded.comments, platform_mix = excluded.platform_mix,
      excluded_on_camera = excluded.excluded_on_camera, excluded_undated = excluded.excluded_undated, status = excluded.status, frozen_at = excluded.frozen_at, read_at = excluded.read_at;
  end if;
  insert into public.month_audience_stats (client_id, month, audience, judged, positive, negative, neutral, mixed, judged_framing,
                                           panel_videos, attention_comments, panel_platform_mix, panel_id, status, origin, read_at, run_id, frozen_at)
    select c, s.month, s.audience, s.judged, s.positive, s.negative, s.neutral, s.mixed, s.judged_framing,
           s.panel_videos, s.attention_comments, s.panel_platform_mix, null,
           case when s.month = '2026-08-01' then 'frozen' else 'filling' end, 'live', at, r1, case when s.month = '2026-08-01' then at end
      from public.monthly_audience_stats(c, null, f, t) s
  on conflict (client_id, month, audience) do update set judged = excluded.judged, status = excluded.status, frozen_at = excluded.frozen_at, read_at = excluded.read_at;
  insert into public.month_evidence_refs (client_id, month, audience, object_kind, object_id, video_ids, comment_ids, platform_mix,
                                          status, origin, read_at, run_id, frozen_at, clustering_key)
    select c, e.month, e.audience, 'theme', e.theme_id::text, e.video_ids, e.comment_ids, e.platform_mix,
           case when e.month = '2026-08-01' then 'frozen' else 'filling' end, 'live', at, r1, case when e.month = '2026-08-01' then at end, 'ck-1004'
      from public.monthly_evidence_refs(c, r1, f, t) e
  on conflict (client_id, month, audience, object_kind, object_id) do update set video_ids = excluded.video_ids, status = excluded.status, frozen_at = excluded.frozen_at, read_at = excluded.read_at;
  insert into public.month_denominators (client_id, month, audience, videos, comments, platform_mix, status, origin, read_at, run_id, frozen_at)
    select c, d.month, d.audience, d.videos, d.comments, d.platform_mix,
           case when d.month = '2026-08-01' then 'frozen' else 'filling' end, 'live', at, r1, case when d.month = '2026-08-01' then at end
      from public.monthly_denominators(c, f, t) d
  on conflict (client_id, month, audience) do update
    set videos = excluded.videos, comments = excluded.comments, platform_mix = excluded.platform_mix, status = excluded.status,
        read_at = excluded.read_at, run_id = excluded.run_id, frozen_at = excluded.frozen_at;
end
$freeze$;

begin; set local role service_role; select pg_temp.d5_freeze('00000000-0000-4000-8000-00000000d5a1', true); commit;
begin; set local role service_role; select pg_temp.d5_freeze('00000000-0000-4000-8000-00000000d5b1', true); commit;
begin; set local role service_role; select pg_temp.d5_freeze('00000000-0000-4000-8000-00000000d5c1', false); commit;

-- C's reading at the freeze, to compare with after its prune.
create temp table d5_c_at_freeze as select * from pg_temp.d5_reads('00000000-0000-4000-8000-00000000d5c1') where what = 'subjects';

-- The prunes, after the close. A: deploy 5's (no hold). B and C: deploy 5b's,
-- which keeps any insight a membership still counts (member = true).
begin;
set local role service_role;
delete from public.audience_insights
 where id in (select pg_temp.d5_prunable('00000000-0000-4000-8000-00000000d5a1'));
commit;
begin;
set local role service_role;
delete from public.audience_insights
 where id in (select pg_temp.d5_prunable('00000000-0000-4000-8000-00000000d5b1'))
   and id not in (select audience_insight_id from public.subject_memberships where client_id = '00000000-0000-4000-8000-00000000d5b1' and member);
commit;
begin;
set local role service_role;
delete from public.audience_insights
 where id in (select pg_temp.d5_prunable('00000000-0000-4000-8000-00000000d5c1'))
   and id not in (select audience_insight_id from public.subject_memberships where client_id = '00000000-0000-4000-8000-00000000d5c1' and member);
commit;

-- The stored subject rows against the live reading, per tenant.
create or replace function pg_temp.d5_stored(c uuid) returns table (line text) language sql stable as $$
  select format('%s|%s|%s|%s|%s|%s|%s|%s', month, audience, pg_temp.d5_label(c, subject_id), videos, comments, platform_mix, excluded_on_camera, excluded_undated)
    from public.month_subject_readings where client_id = c
$$;
create or replace function pg_temp.d5_live(c uuid) returns table (line text) language sql stable as $$
  select line from pg_temp.d5_reads(c) where what = 'subjects'
$$;

-- The other five month tables as stored, per tenant (ids to seed labels; the
-- evidence ids by count, since they name each tenant's own rows).
create or replace function pg_temp.d5_other(c uuid) returns table (tbl text, line text) language sql stable as $$
  select 'denominators', format('%s|%s|%s|%s|%s|%s|%s', month, audience, videos, comments, platform_mix, status, frozen_at) from public.month_denominators where client_id = c
  union all
  select 'themes', format('%s|%s|%s|%s|%s|%s|%s', month, audience, pg_temp.d5_label(c, theme_id), videos, comments, status, frozen_at) from public.month_theme_readings where client_id = c
  union all
  select 'kinds', format('%s|%s|%s|%s|%s|%s', month, audience, kind, videos, comments, status) from public.month_kind_readings where client_id = c
  union all
  select 'stats', format('%s|%s|%s|%s|%s', month, audience, judged, positive, status) from public.month_audience_stats where client_id = c
  union all
  select 'refs', format('%s|%s|%s|%s|%s|%s', month, audience, pg_temp.d5_label(c, object_id::uuid), cardinality(video_ids), cardinality(comment_ids), status) from public.month_evidence_refs where client_id = c
$$;

-- E1. Deploy 5's order reproduces the defect.
do $$
declare a uuid := '00000000-0000-4000-8000-00000000d5a1';
begin
  if not exists (select line from pg_temp.d5_stored(a) except select line from pg_temp.d5_live(a)) then
    raise exception 'E1 FAILED: deploy 5''s order left stored = live; the seed does not reproduce the defect';
  end if;
  raise notice 'ok  E1: deploy 5''s order (freeze, then prune): % stored subject row(s) are not what the same SQL reads after the prune',
    (select count(*) from (select line from pg_temp.d5_stored(a) except select line from pg_temp.d5_live(a)) x);
end $$;

-- E2. Deploy 5b's order: stored is live, row for row, August frozen.
do $$
declare b uuid := '00000000-0000-4000-8000-00000000d5b1'; diff text;
begin
  select string_agg(line, E'\n') into diff from (
    (select line from pg_temp.d5_stored(b) except all select line from pg_temp.d5_live(b))
    union all
    (select line from pg_temp.d5_live(b) except all select line from pg_temp.d5_stored(b))) x;
  if diff is not null then raise exception E'E2 FAILED: B''s stored subject rows are not its live reading:\n%', diff; end if;
  if (select count(*) from public.month_subject_readings where client_id = b and month = '2026-08-01' and status = 'frozen') = 0
     or exists (select 1 from public.month_subject_readings where client_id = b and month = '2026-08-01' and status <> 'frozen') then
    raise exception 'E2 FAILED: B''s August subject rows are not all frozen';
  end if;
  raise notice 'ok  E2: deploy 5b''s order (trim, freeze, prune): B''s % stored subject rows are its live reading row for row (videos, comments, platform mix, both exclusions), August''s % frozen',
    (select count(*) from pg_temp.d5_stored(b)), (select count(*) from public.month_subject_readings where client_id = b and month = '2026-08-01');
end $$;

-- E3. Only the phantoms went. By hand from the seed: the prune takes old1,
-- old3, old4, old5 and old6 (old2 is cited). Durability loses, in August,
-- videos 1, 3, 4, 5 and 6 (only their old insight cited August) and, in
-- September, videos 1, 3 and 5 (4 and 6 keep their new member); Price loses
-- video 3 in both months. Nothing else, and the other five tables are A's.
do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000d5a1'; b uuid := '00000000-0000-4000-8000-00000000d5b1';
  diff text; bad text;
begin
  select string_agg(format('%s %s %s: A %s, B %s, expected a loss of %s', x.month, x.audience, x.subject, x.va, x.vb, x.loss), E'\n') into bad from (
    select coalesce(sa.month, sb.month) as month, coalesce(sa.audience, sb.audience) as audience, pg_temp.d5_label(a, sa.subject_id) as subject,
           coalesce(sa.videos, 0) as va, coalesce(sb.videos, 0) as vb,
           case when sa.audience = 'industry-other' and pg_temp.d5_label(a, sa.subject_id) = 'subject-1' and sa.month = '2026-08-01' then 5
                when sa.audience = 'industry-other' and pg_temp.d5_label(a, sa.subject_id) = 'subject-1' and sa.month = '2026-09-01' then 3
                when sa.audience = 'industry-other' and pg_temp.d5_label(a, sa.subject_id) = 'subject-2' then 1
                else 0 end as loss
      from (select * from public.month_subject_readings where client_id = a) sa
      full join (select * from public.month_subject_readings where client_id = b) sb
        on sb.month = sa.month and sb.audience = sa.audience and pg_temp.d5_label(b, sb.subject_id) = pg_temp.d5_label(a, sa.subject_id)
  ) x where x.va - x.vb <> x.loss;
  if bad is not null then raise exception E'E3 FAILED: B''s subject rows are not A''s less exactly the phantom-only videos:\n%', bad; end if;
  select string_agg(format('%s %s', tbl, line), E'\n') into diff from (
    (select * from pg_temp.d5_other(a) except all select * from pg_temp.d5_other(b))
    union all
    (select * from pg_temp.d5_other(b) except all select * from pg_temp.d5_other(a))) y;
  if diff is not null then raise exception E'E3 FAILED: another month table differs between A and B:\n%', diff; end if;
  raise notice 'ok  E3: B''s subject rows are A''s less exactly the ten phantom-only video-months (Durability August 5 and September 3, Price 1 and 1), and the other five month tables are A''s row for row (% rows)',
    (select count(*) from pg_temp.d5_other(b));
end $$;

-- E5. The trim out of retries (C): no subject row written, every superseded
-- member kept by the prune, and the live reading is what it was at the freeze.
do $$
declare c uuid := '00000000-0000-4000-8000-00000000d5c1'; diff text;
begin
  if exists (select 1 from public.month_subject_readings where client_id = c) then
    raise exception 'E5 FAILED: C wrote subject rows with the subject side held';
  end if;
  if (select count(*) from public.audience_insights where client_id = c and id in (pg_temp.d5_id(c, 'old1'), pg_temp.d5_id(c, 'old3'), pg_temp.d5_id(c, 'old4'), pg_temp.d5_id(c, 'old5'), pg_temp.d5_id(c, 'old6'))) <> 5 then
    raise exception 'E5 FAILED: the prune deleted a superseded insight a membership still counts';
  end if;
  select string_agg(line, E'\n') into diff from (
    (select line from d5_c_at_freeze except all select line from pg_temp.d5_live(c))
    union all (select line from pg_temp.d5_live(c) except all select line from d5_c_at_freeze)) x;
  if diff is not null then raise exception E'E5 FAILED: C''s subject reading moved across its prune:\n%', diff; end if;
  if exists (select 1 from public.month_denominators where client_id = c and month = '2026-08-01' and status <> 'frozen') then
    raise exception 'E5 FAILED: C''s August did not freeze';
  end if;
  raise notice 'ok  E5: the trim out of retries: no subject row written, the five superseded members kept by the prune, the subject reading unchanged across it, and August frozen as ever';
end $$;

-- E6. No trigger on subject_memberships, and no membership names a deleted insight.
do $$
declare bad text;
begin
  select string_agg(t.tgname, ', ') into bad from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'subject_memberships' and not t.tgisinternal;
  if bad is not null then raise exception 'E6 FAILED: subject_memberships carries a trigger: %', bad; end if;
  if exists (select 1 from public.subject_memberships m left join public.audience_insights ai on ai.id = m.audience_insight_id
              where m.client_id in ('00000000-0000-4000-8000-00000000d5a1', '00000000-0000-4000-8000-00000000d5b1', '00000000-0000-4000-8000-00000000d5c1') and ai.id is null) then
    raise exception 'E6 FAILED: a membership names a deleted insight';
  end if;
  raise notice 'ok  E6: subject_memberships carries no trigger (a trim delete writes nothing else), and after every prune no membership names a deleted insight';
end $$;

-- E7. The lens step's read, the same question.
do $$
declare a uuid := '00000000-0000-4000-8000-00000000d5a1'; diff text;
begin
  select string_agg(line, E'\n') into diff from (
    (select line from d5_lens_a_before where split_part(line, '|', 3) <> 'subject' except all select line from d5_lens_b_trimmed where split_part(line, '|', 3) <> 'subject')
    union all
    (select line from d5_lens_b_trimmed where split_part(line, '|', 3) <> 'subject' except all select line from d5_lens_a_before where split_part(line, '|', 3) <> 'subject')) x;
  if diff is not null then raise exception E'E7 FAILED: the trim moved a lens object that is not a subject:\n%', diff; end if;
  select string_agg(line, E'\n') into diff from (
    (select line from d5_lens_b_trimmed where split_part(line, '|', 3) = 'subject' except all select line from pg_temp.d5_lens(a) where split_part(line, '|', 3) = 'subject')
    union all
    (select line from pg_temp.d5_lens(a) where split_part(line, '|', 3) = 'subject' except all select line from d5_lens_b_trimmed where split_part(line, '|', 3) = 'subject')) x;
  if diff is not null then raise exception E'E7 FAILED: after the trim, B''s lens subjects are not what A reads after its prune:\n%', diff; end if;
  if not exists (select line from d5_lens_a_before where split_part(line, '|', 3) = 'subject' except select line from pg_temp.d5_lens(a) where split_part(line, '|', 3) = 'subject') then
    raise exception 'E7 FAILED: A''s lens subjects did not move across its prune (the seed has phantoms to remove)';
  end if;
  raise notice 'ok  E7: lens_readings (the lens step, August frozen on 4 Oct): after the trim B reads, for every subject, what A reads after its prune (% subject lines), and the same as A before it for every other object (% lines)',
    (select count(*) from d5_lens_b_trimmed where split_part(line, '|', 3) = 'subject'), (select count(*) from d5_lens_b_trimmed where split_part(line, '|', 3) <> 'subject');
end $$;

delete from public.clients where id in ('00000000-0000-4000-8000-00000000d5a1', '00000000-0000-4000-8000-00000000d5b1', '00000000-0000-4000-8000-00000000d5c1');
do $$ begin raise notice 'ok  d5b trim checks: all passed'; end $$;
