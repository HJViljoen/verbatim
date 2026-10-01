-- Checks for 20261106091000_week_unchecked_newest.sql (and the operator's
-- verdict, 20261106093000), run on a throwaway
-- cluster after the migration (scripts/pg-shim/throwaway.sh check <dir> this-file).
-- Every check raises on a wrong answer; one transaction, rolled back.
--
-- One tenant, three category videos with a comment each in the week of
-- 21 Sep, each let in by the fail-open default:
--   y1  judged again later and KEPT       → checked
--   y2  judged again later and DROPPED    → unchecked
--   y3  never judged again                → unchecked
-- and y4, kept by GPT at its gather: never unchecked.

begin;

insert into public.clients (id, company_name) values ('00000000-0000-4000-8000-00000000c0c1', 'Unchecked check');
insert into public.pipeline_runs (id, client_id, status)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c0c1', 'completed');
insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor, competitor_name, analyzed_lane, caption, hashtags, topics, source_keywords)
select ('00000000-0000-4000-8000-0000000000b' || n)::uuid, '00000000-0000-4000-8000-00000000c0c1', 'youtube', 'y' || n, 'u', 'a', false, false, null, 'full', 'a bag', '{}', '{}', '{}'
from generate_series(1, 4) n;
insert into public.comments (client_id, run_id, platform, video_id, comment_id, comment_date)
select '00000000-0000-4000-8000-00000000c0c1', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'y' || n, 'c' || n, timestamptz '2026-09-23 10:00Z'
from generate_series(1, 4) n;

-- The admissions, at the gather (20 Sep).
insert into public.gate_verdicts (client_id, run_id, platform, video_id, kept, reason, source, created_at) values
  ('00000000-0000-4000-8000-00000000c0c1', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'y1', true, 'kept unjudged', 'default', '2026-09-20 04:18Z'),
  ('00000000-0000-4000-8000-00000000c0c1', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'y2', true, 'kept unjudged', 'default', '2026-09-20 04:18Z'),
  ('00000000-0000-4000-8000-00000000c0c1', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'y3', true, 'kept unjudged', 'default', '2026-09-20 04:18Z'),
  ('00000000-0000-4000-8000-00000000c0c1', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'y4', true, 'about bags', 'gpt', '2026-09-20 04:18Z');

-- Before any later judgement: the three defaults are unchecked, as before.
do $$ declare n int; begin
  select sum(unchecked) into n from public.market_week_volumes('00000000-0000-4000-8000-00000000c0c1', '2026-09-21', '2026-09-28');
  if n is distinct from 3 then raise exception 'before: % unchecked, expected 3', n; end if;
end $$;

-- Today's check, appended (run_id null, as the backfill writes it).
insert into public.gate_verdicts (client_id, run_id, platform, video_id, kept, reason, source, created_at) values
  ('00000000-0000-4000-8000-00000000c0c1', null, 'youtube', 'y1', true, 're-judged: about bags', 'gpt', '2026-10-01 18:00Z'),
  ('00000000-0000-4000-8000-00000000c0c1', null, 'youtube', 'y2', false, 're-judged: a jacket', 'gpt', '2026-10-01 18:00Z');

do $$ declare n int; v int; begin
  select sum(unchecked), sum(videos) into n, v from public.market_week_volumes('00000000-0000-4000-8000-00000000c0c1', '2026-09-21', '2026-09-28');
  if n is distinct from 2 then raise exception 'after: % unchecked, expected 2 (y2 dropped, y3 never judged)', n; end if;
  -- Counts are untouched: the function counts what is stored.
  if v is distinct from 4 then raise exception 'after: % videos, expected 4', v; end if;
end $$;

-- An operator keeps the dropped one (20261106093000): the newest verdict is a
-- clean keep, and only y3 (never judged) stays unchecked.
insert into public.gate_verdicts (client_id, run_id, platform, video_id, kept, reason, source, created_at) values
  ('00000000-0000-4000-8000-00000000c0c1', null, 'youtube', 'y2', true, 'kept by the operator: on-topic', 'operator', '2026-10-01 20:00Z');
do $$ declare n int; begin
  select sum(unchecked) into n from public.market_week_volumes('00000000-0000-4000-8000-00000000c0c1', '2026-09-21', '2026-09-28');
  if n is distinct from 1 then raise exception 'after the keep: % unchecked, expected 1 (y3)', n; end if;
end $$;

select 'week-unchecked checks: all passed' as result;
rollback;
