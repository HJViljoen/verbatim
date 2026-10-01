-- Checks for 20261106092000_regate_backup.sql, run on a throwaway cluster
-- after the migration (scripts/pg-shim/throwaway.sh check <dir> this-file).
-- Every check raises on a wrong answer; one transaction, rolled back.
--
-- One tenant: v1 (an off-market video let in unjudged: removed), v2 (a market
-- video: kept), v3 (the client's own post: never removed). Each with comments,
-- an insight (with an embedding), evidence, a subject membership, a language
-- sample, a translation, a brand mention and a segment. The removal takes
-- exactly v1's rows, backs every one up, logs one gate_rule change, and the
-- restore puts every row back as it was.

begin;

insert into public.clients (id, company_name) values
  ('00000000-0000-4000-8000-00000000c0c2', 'Regate check'),
  ('00000000-0000-4000-8000-00000000c0c3', 'Another tenant');
insert into public.pipeline_runs (id, client_id, status)
  values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000c0c2', 'completed');
insert into public.subjects (id, client_id, name, origin, status)
  values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000c0c2', 'Comfort', 'client', 'active');
insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor, competitor_name, analyzed_lane, analyzed_run_id, caption, hashtags, topics, source_keywords) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000c0c2', 'youtube', 'off1', 'u', 'a', false, false, null, 'full', '00000000-0000-4000-8000-0000000000a2', 'A ham radio morning', '{}', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-00000000c0c2', 'youtube', 'bag2', 'u', 'a', false, false, null, 'full', '00000000-0000-4000-8000-0000000000a2', 'A bag review', '{}', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-00000000c0c2', 'instagram', 'own3', 'u', 'a', true, false, null, 'full', '00000000-0000-4000-8000-0000000000a2', 'Our bag', '{}', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-00000000c0c3', 'youtube', 'theirs', 'u', 'a', false, false, null, 'full', null, 'x', '{}', '{}', '{}');
insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, text)
select ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000a2',
       case when n <= 4 then 'youtube' else 'youtube' end, case when n <= 2 then 'off1' else 'bag2' end, 'c' || n, timestamptz '2026-09-23 10:00Z', 'words ' || n
from generate_series(1, 4) n;
insert into public.audience_insights (id, client_id, run_id, source_video_id, category, theme, description, embedding) values
  ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e1', 'praise', 'radio', 'likes the radio', array_fill(0.25::real, array[1536])::vector),
  ('00000000-0000-4000-8000-0000000002a2', '00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e2', 'praise', 'straps', 'likes the straps', array_fill(0.5::real, array[1536])::vector);
insert into public.insight_evidence (audience_insight_id, quote, source, comment_id) values
  ('00000000-0000-4000-8000-0000000002a1', 'words 1', 'comment', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-0000000002a2', 'words 3', 'comment', '00000000-0000-4000-8000-000000000103');
insert into public.subject_memberships (subject_id, audience_insight_id, client_id, member, method, judge_version) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-00000000c0c2', true, 'judge', 'v'),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000002a2', '00000000-0000-4000-8000-00000000c0c2', true, 'judge', 'v');
insert into public.language_samples (client_id, phrase, source_video_id, comment_id) values
  ('00000000-0000-4000-8000-00000000c0c2', 'radio', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000102'),
  ('00000000-0000-4000-8000-00000000c0c2', 'straps', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000104');
insert into public.comment_translations (client_id, comment_id, text_hash, language, model, prompt_version) values
  ('00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-000000000101', 'h1', 'fi', 'm', 'p'),
  ('00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-000000000103', 'h3', 'nl', 'm', 'p');
insert into public.brand_mentions (client_id, video_id, brand_key, source, method, rule_version, comment_id, comment_month) values
  ('00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000e1', 'client', 'comment', 'rule', 'r1', '00000000-0000-4000-8000-000000000101', '2026-09-01'),
  ('00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000e2', 'client', 'comment', 'rule', 'r1', '00000000-0000-4000-8000-000000000103', '2026-09-01');
insert into public.video_segments (client_id, video_id, rule_version, segment, method, actor_label) values
  ('00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000e1', 'r1', 'noise', 'rule', 'a'),
  ('00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000e2', 'r1', 'market', 'rule', 'a');

create temp table before_counts as
select 'videos' t, count(*) n from public.videos where client_id = '00000000-0000-4000-8000-00000000c0c2'
union all select 'comments', count(*) from public.comments where client_id = '00000000-0000-4000-8000-00000000c0c2'
union all select 'audience_insights', count(*) from public.audience_insights where client_id = '00000000-0000-4000-8000-00000000c0c2'
union all select 'insight_evidence', count(*) from public.insight_evidence
union all select 'subject_memberships', count(*) from public.subject_memberships
union all select 'language_samples', count(*) from public.language_samples
union all select 'comment_translations', count(*) from public.comment_translations
union all select 'brand_mentions', count(*) from public.brand_mentions
union all select 'video_segments', count(*) from public.video_segments;

-- Refusals: the client's own post, another tenant's video, nothing at all.
do $$ begin
  begin perform public.regate_videos('00000000-0000-4000-8000-00000000c0c2', array['00000000-0000-4000-8000-0000000000e3']::uuid[], 'check');
    raise exception 'an own post was removed'; exception when raise_exception then if sqlerrm like 'an own post%' then raise; end if; end;
  begin perform public.regate_videos('00000000-0000-4000-8000-00000000c0c2', array['00000000-0000-4000-8000-0000000000e4']::uuid[], 'check');
    raise exception 'another tenant''s video was removed'; exception when raise_exception then if sqlerrm like 'another tenant%' then raise; end if; end;
  begin perform public.regate_videos('00000000-0000-4000-8000-00000000c0c2', array[]::uuid[], 'check');
    raise exception 'an empty list was accepted'; exception when raise_exception then if sqlerrm like 'an empty%' then raise; end if; end;
end $$;

-- The removal.
create temp table result as
select public.regate_videos('00000000-0000-4000-8000-00000000c0c2', array['00000000-0000-4000-8000-0000000000e1']::uuid[], 'scripts/backfill-platform.ts --regate --yes', '00000000-0000-4000-8000-0000000000a2') r;

do $$ declare r jsonb; n int; begin
  select result.r into r from result;
  if (r->>'videos_removed')::int <> 1 then raise exception 'removed %, expected 1', r->>'videos_removed'; end if;
  if (r->'backed_up'->>'comments')::int <> 2 or (r->'backed_up'->>'audience_insights')::int <> 1 or (r->'backed_up'->>'insight_evidence')::int <> 1
     or (r->'backed_up'->>'subject_memberships')::int <> 1 or (r->'backed_up'->>'language_samples')::int <> 1 or (r->'backed_up'->>'comment_translations')::int <> 1
     or (r->'backed_up'->>'brand_mentions')::int <> 1 or (r->'backed_up'->>'video_segments')::int <> 1 or (r->'backed_up'->>'videos')::int <> 1 then
    raise exception 'backed up %', r->'backed_up';
  end if;
  -- v1 is gone everywhere; v2 and v3 are whole.
  if exists (select 1 from public.videos where id = '00000000-0000-4000-8000-0000000000e1') then raise exception 'v1 is still stored'; end if;
  select count(*) into n from public.comments where client_id = '00000000-0000-4000-8000-00000000c0c2'; if n <> 2 then raise exception '% comments left, expected 2', n; end if;
  select count(*) into n from public.audience_insights where client_id = '00000000-0000-4000-8000-00000000c0c2'; if n <> 1 then raise exception '% insights left', n; end if;
  select count(*) into n from public.subject_memberships; if n <> 1 then raise exception '% memberships left', n; end if;
  select count(*) into n from public.video_segments; if n <> 1 then raise exception '% segments left', n; end if;
  -- The record: the 24 Sep fix's shape, no note.
  select count(*) into n from public.config_changes where id = (r->>'change_id')::uuid and surface = 'gate_rule' and field = 'relevance_gate'
    and source = 'logged' and actor_kind = 'script' and note is null and rows_affected = 1;
  if n <> 1 then raise exception 'the change row is not the gate_rule record'; end if;
end $$;

-- The restore: every row back, the embedding exact, the batch marked.
do $$ declare r jsonb; b uuid; diff int; begin
  select (result.r->>'batch_id')::uuid into b from result;
  r := public.regate_restore(b);
  select count(*) into diff from (
    select 'videos' t, count(*) n from public.videos where client_id = '00000000-0000-4000-8000-00000000c0c2'
    union all select 'comments', count(*) from public.comments where client_id = '00000000-0000-4000-8000-00000000c0c2'
    union all select 'audience_insights', count(*) from public.audience_insights where client_id = '00000000-0000-4000-8000-00000000c0c2'
    union all select 'insight_evidence', count(*) from public.insight_evidence
    union all select 'subject_memberships', count(*) from public.subject_memberships
    union all select 'language_samples', count(*) from public.language_samples
    union all select 'comment_translations', count(*) from public.comment_translations
    union all select 'brand_mentions', count(*) from public.brand_mentions
    union all select 'video_segments', count(*) from public.video_segments
    except select * from before_counts) d;
  if diff <> 0 then raise exception 'after the restore % table counts differ from before', diff; end if;
  if (select embedding from public.audience_insights where id = '00000000-0000-4000-8000-0000000002a1') <> array_fill(0.25::real, array[1536])::vector then
    raise exception 'the restored embedding differs';
  end if;
  if exists (select 1 from public.regate_backup where batch_id = b and restored_at is null) then raise exception 'the batch is not marked restored'; end if;
  begin perform public.regate_restore(b); raise exception 'a batch was restored twice';
  exception when raise_exception then if sqlerrm like 'a batch was%' then raise; end if; end;
end $$;

-- Only the service role may call either function.
do $$ begin
  if has_function_privilege('authenticated', 'public.regate_videos(uuid, uuid[], text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.regate_restore(uuid)', 'execute')
     or has_table_privilege('authenticated', 'public.regate_backup', 'select') then
    raise exception 'a tenant or anon can reach the regate';
  end if;
end $$;

select 'regate-backup checks: all passed' as result;
rollback;
