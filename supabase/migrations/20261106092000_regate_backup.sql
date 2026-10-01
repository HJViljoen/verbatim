-- Videos the fail-open gate let in, and today's check drops, leave the corpus
-- WITH A BACKUP, so the removal can be undone (the backfill's regate, 1 Oct
-- evening; lead's ruling: reversible preferred, deletion with a backup only
-- where exclusion is not possible).
--
-- WHY A DELETION, NOT AN EXCLUSION BY VERDICT. A video counts in a reading
-- through no single choke point: sixteen SQL functions (the monthly_* and
-- window_* bodies, market_month_videos, market_month_depth,
-- market_segment_counts, market_week_readings, market_week_volumes,
-- subject_band, statement_band) each define their own video set, two views
-- (audience_insights_current, language_samples_current) carry its insights,
-- the TypeScript readers read videos, comments and evidence directly (brand
-- mentions, the formats on Competitive, the own-post census, Ask's retrieval,
-- the quotes), and the pipeline keeps re-reading a video (Pass A re-selects
-- one whose comments grow; prune-stale-analysis deletes the rows of one whose
-- pointer moves). An exclusion would have to be taught to every one of them,
-- and one missed would count the video again. The regate tool
-- (scripts/regate-corpus.ts) removes a video from all of them at once, and has
-- since July; this is that removal, with every row it takes kept here first.
--
-- WHAT IT TAKES, for the given videos of one client, all in one transaction:
-- the videos, their comments (joined by platform and video id, as everywhere),
-- their insights and those insights' evidence and subject memberships, their
-- language samples, comment translations and brand mentions, their claims,
-- segments, provenance, surfacings, own-post subjects and account events. Each
-- row is copied whole into `regate_backup` (as jsonb, the table it came from
-- named beside it) before anything is deleted. The client's own posts are
-- refused, as regate-corpus refuses them.
--
-- WHAT IT RECORDS: one `config_changes` row, surface `gate_rule`, field
-- `relevance_gate`, source `logged`, the operator's command as the actor and
-- no note (Heinrich, 27 Sep: these rows carry no sentence). That is the 24 Sep
-- fix's own record shape, on purpose: this finishes that fix (the batches that
-- failed open were judged after all), so the comparison judge measures it as
-- it measures the fix (lib/provenance/measure.ts: touched = the videos let in
-- unjudged) instead of counting an unmeasured `regate` as a tenth of every
-- month it spans, and the Dashboard's chart does not cut a week at it
-- (`isFailOpenFix`, lib/pages/home.ts).
--
-- UNDO: `regate_restore(batch)` puts every row back in dependency order and
-- marks the batch restored. It leaves the change row (a record of what was
-- done, not a switch).
--
-- WHAT IT DOES NOT TOUCH: the six month tables (no foreign key reaches them).
-- A frozen month keeps the counts it was read with; a filling month takes the
-- removal at its next refresh (the run's freeze-months, or the backfill's own
-- refresh right after this).
--
-- ADDITIVE AND IDEMPOTENT: one table (create if not exists), its index, RLS on
-- with no policy (the service role alone reads it), and two functions (create
-- or replace), executable by the service role alone. Applied twice on a
-- throwaway PostgreSQL 17 cluster (scripts/pg-shim/throwaway.sh twice) with an
-- empty catalogue diff, and exercised by scripts/pg-shim/regate-backup-checks.sql
-- (a removal and its restore round-trip every row, embeddings included).

create table if not exists public.regate_backup (
  batch_id     uuid not null,
  client_id    uuid not null references public.clients(id) on delete cascade,
  source_table text not null,
  row_data     jsonb not null,
  backed_up_at timestamptz not null default now(),
  restored_at  timestamptz
);
create index if not exists regate_backup_batch_idx on public.regate_backup (batch_id, source_table);
comment on table public.regate_backup is
  'Every row regate_videos() removed, whole, before it was removed (row_data = to_jsonb of the row, source_table = where it lived). regate_restore(batch_id) puts a batch back. Service role only.';

alter table public.regate_backup enable row level security;
revoke all on public.regate_backup from public, anon, authenticated;
grant select, insert, update on public.regate_backup to service_role;

create or replace function public.regate_videos(
  p_client      uuid,
  p_video_ids   uuid[],
  p_actor_label text,
  p_run_id      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch   uuid := gen_random_uuid();
  v_change  uuid;
  v_videos  int;
  v_before  int;
  v_counts  jsonb := '{}'::jsonb;
  v_n       int;
begin
  if p_video_ids is null or cardinality(p_video_ids) = 0 then
    raise exception 'regate_videos: no videos given';
  end if;
  select count(*) into v_videos from public.videos where id = any(p_video_ids) and client_id = p_client;
  if v_videos <> cardinality(p_video_ids) then
    raise exception 'regate_videos: % of % videos are not this client''s', cardinality(p_video_ids) - v_videos, cardinality(p_video_ids);
  end if;
  if exists (select 1 from public.videos where id = any(p_video_ids) and is_client) then
    raise exception 'regate_videos: the client''s own posts are never removed';
  end if;
  select count(*) into v_before from public.videos where client_id = p_client;

  -- The rows, by what they hang off (dropped first: a second call in one
  -- transaction must not find the first call's).
  drop table if exists rg_videos, rg_comments, rg_insights;
  create temp table rg_videos on commit drop as
    select id, platform, video_id from public.videos where id = any(p_video_ids);
  create temp table rg_comments on commit drop as
    select c.id from public.comments c join rg_videos v on v.platform = c.platform and v.video_id = c.video_id
    where c.client_id = p_client;
  create temp table rg_insights on commit drop as
    select ai.id from public.audience_insights ai where ai.source_video_id in (select id from rg_videos);

  -- 1. Backed up whole, every table the removal reaches.
  insert into public.regate_backup (batch_id, client_id, source_table, row_data)
  select v_batch, p_client, 'videos', to_jsonb(t) from public.videos t where t.id in (select id from rg_videos)
  union all select v_batch, p_client, 'comments', to_jsonb(t) from public.comments t where t.id in (select id from rg_comments)
  union all select v_batch, p_client, 'audience_insights', to_jsonb(t) from public.audience_insights t where t.id in (select id from rg_insights)
  union all select v_batch, p_client, 'insight_evidence', to_jsonb(t) from public.insight_evidence t
    where t.audience_insight_id in (select id from rg_insights) or t.comment_id in (select id from rg_comments) or t.source_video_id in (select id from rg_videos)
  union all select v_batch, p_client, 'subject_memberships', to_jsonb(t) from public.subject_memberships t where t.audience_insight_id in (select id from rg_insights)
  union all select v_batch, p_client, 'language_samples', to_jsonb(t) from public.language_samples t
    where t.source_video_id in (select id from rg_videos) or t.comment_id in (select id from rg_comments)
  union all select v_batch, p_client, 'comment_translations', to_jsonb(t) from public.comment_translations t where t.comment_id in (select id from rg_comments)
  union all select v_batch, p_client, 'brand_mentions', to_jsonb(t) from public.brand_mentions t
    where t.video_id in (select id from rg_videos) or t.comment_id in (select id from rg_comments)
  union all select v_batch, p_client, 'video_claims', to_jsonb(t) from public.video_claims t where t.source_video_id in (select id from rg_videos)
  union all select v_batch, p_client, 'video_segments', to_jsonb(t) from public.video_segments t where t.video_id in (select id from rg_videos)
  union all select v_batch, p_client, 'video_provenance', to_jsonb(t) from public.video_provenance t where t.video_id in (select id from rg_videos)
  union all select v_batch, p_client, 'video_surfacings', to_jsonb(t) from public.video_surfacings t where t.video_id in (select id from rg_videos)
  union all select v_batch, p_client, 'own_post_subjects', to_jsonb(t) from public.own_post_subjects t where t.video_id in (select id from rg_videos)
  union all select v_batch, p_client, 'account_events', to_jsonb(t) from public.account_events t where t.video_id in (select id from rg_videos);

  select coalesce(jsonb_object_agg(source_table, n), '{}'::jsonb) into v_counts
  from (select source_table, count(*) as n from public.regate_backup where batch_id = v_batch group by source_table) s;

  -- 2. Removed, leaves first (the rest cascade from videos, already backed up).
  delete from public.insight_evidence
   where audience_insight_id in (select id from rg_insights) or comment_id in (select id from rg_comments) or source_video_id in (select id from rg_videos);
  delete from public.subject_memberships where audience_insight_id in (select id from rg_insights);
  delete from public.language_samples where source_video_id in (select id from rg_videos) or comment_id in (select id from rg_comments);
  delete from public.comment_translations where comment_id in (select id from rg_comments);
  delete from public.brand_mentions where video_id in (select id from rg_videos) or comment_id in (select id from rg_comments);
  delete from public.audience_insights where id in (select id from rg_insights);
  delete from public.comments where id in (select id from rg_comments);
  delete from public.videos where id in (select id from rg_videos);
  get diagnostics v_n = row_count;

  -- 3. The record: the 24 Sep fix's shape (see the header).
  insert into public.config_changes (client_id, surface, field, before, after, actor_kind, actor_label, run_id, source, rows_affected, note)
  values (p_client, 'gate_rule', 'relevance_gate',
          jsonb_build_object('videos', v_before),
          jsonb_build_object('videos', v_before - v_n, 'backup_batch', v_batch),
          'script', p_actor_label, p_run_id, 'logged', v_n, null)
  returning id into v_change;

  return jsonb_build_object('batch_id', v_batch, 'change_id', v_change, 'videos_removed', v_n, 'backed_up', v_counts);
end;
$$;

comment on function public.regate_videos(uuid, uuid[], text, uuid) is
  'Removes these videos of one client and everything that hangs off them, each row backed up whole in regate_backup first, and logs one gate_rule change. One transaction. Never the client''s own posts. Undo: regate_restore(batch_id).';

create or replace function public.regate_restore(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_n      int;
  v_table  text;
begin
  if not exists (select 1 from public.regate_backup where batch_id = p_batch) then
    raise exception 'regate_restore: no batch %', p_batch;
  end if;
  if exists (select 1 from public.regate_backup where batch_id = p_batch and restored_at is not null) then
    raise exception 'regate_restore: batch % is restored already', p_batch;
  end if;
  -- Parents first.
  foreach v_table in array array['videos', 'comments', 'audience_insights', 'insight_evidence', 'subject_memberships',
                                 'language_samples', 'comment_translations', 'brand_mentions', 'video_claims',
                                 'video_segments', 'video_provenance', 'video_surfacings', 'own_post_subjects', 'account_events']
  loop
    execute format(
      'insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, b.row_data)).* from public.regate_backup b where b.batch_id = $1 and b.source_table = %2$L',
      v_table, v_table)
      using p_batch;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object(v_table, v_n); end if;
  end loop;
  update public.regate_backup set restored_at = now() where batch_id = p_batch;
  return jsonb_build_object('batch_id', p_batch, 'restored', v_counts);
end;
$$;

comment on function public.regate_restore(uuid) is
  'Puts back every row regate_videos() removed in this batch, parents first, and marks the batch restored. The gate_rule change row stays as the record.';

revoke all on function public.regate_videos(uuid, uuid[], text, uuid) from public, anon, authenticated;
revoke all on function public.regate_restore(uuid) from public, anon, authenticated;
grant execute on function public.regate_videos(uuid, uuid[], text, uuid) to service_role;
grant execute on function public.regate_restore(uuid) to service_role;
