-- Checks for 20261107090000_week_unchecked_comments.sql, run on a throwaway
-- cluster after the migration (scripts/pg-shim/throwaway.sh check <dir> this-file).
-- Every check raises on a wrong answer; one transaction, rolled back.
--
-- One tenant, in the week of 28 Sep (Sealand's shape: one unchecked video
-- among checked ones):
--   y1  kept by GPT at its gather, 3 comments            → checked
--   y2  the heuristic default, never judged, 1 comment   → unchecked
--   y3  default, judged later and DROPPED, 2 comments    → unchecked
--   y4  default, judged later and KEPT, 4 comments       → checked
--   r1  a rival's video, the default, 5 comments         → unchecked (its own audience row)
-- and y2 has 6 more comments the week before, which count in that week only.

begin;

insert into public.clients (id, company_name) values ('00000000-0000-4000-8000-00000000c0c2', 'Unchecked comments check');
insert into public.pipeline_runs (id, client_id, status)
  values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000c0c2', 'completed');
insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor, competitor_name, analyzed_lane, caption, hashtags, topics, source_keywords)
values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000c0c2', 'youtube', 'y1', 'u', 'a', false, false, null, 'full', 'a bag', '{}', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000c0c2', 'youtube', 'y2', 'u', 'a', false, false, null, 'full', 'a bag', '{}', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-00000000c0c2', 'youtube', 'y3', 'u', 'a', false, false, null, 'full', 'a bag', '{}', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-00000000c0c2', 'youtube', 'y4', 'u', 'a', false, false, null, 'full', 'a bag', '{}', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-00000000c0c2', 'youtube', 'r1', 'u', 'a', false, true, 'Rival', 'full', 'a bag', '{}', '{}', '{}');
-- Comments dated in the week of 28 Sep: y1 x3, y2 x1, y3 x2, y4 x4, r1 x5;
-- and y2 x6 in the week of 21 Sep.
insert into public.comments (client_id, run_id, platform, video_id, comment_id, comment_date)
select '00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000a2', 'youtube', v.vid, v.vid || '-' || g, v.at
from (values ('y1', 3, timestamptz '2026-09-30 10:00Z'), ('y2', 1, timestamptz '2026-10-02 10:00Z'),
             ('y3', 2, timestamptz '2026-09-29 10:00Z'), ('y4', 4, timestamptz '2026-10-04 10:00Z'),
             ('r1', 5, timestamptz '2026-10-01 10:00Z')) v(vid, n, at)
cross join lateral generate_series(1, v.n) g;
insert into public.comments (client_id, run_id, platform, video_id, comment_id, comment_date)
select '00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000a2', 'youtube', 'y2', 'y2-early-' || g, timestamptz '2026-09-23 10:00Z'
from generate_series(1, 6) g;

insert into public.gate_verdicts (client_id, run_id, platform, video_id, kept, reason, source, created_at) values
  ('00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000a2', 'youtube', 'y1', true, 'about bags', 'gpt', '2026-09-20 04:18Z'),
  ('00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000a2', 'youtube', 'y2', true, 'no off-market signal in metadata', 'default', '2026-09-20 04:18Z'),
  ('00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000a2', 'youtube', 'y3', true, 'kept unjudged', 'default', '2026-09-20 04:18Z'),
  ('00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000a2', 'youtube', 'y4', true, 'kept unjudged', 'default', '2026-09-20 04:18Z'),
  ('00000000-0000-4000-8000-00000000c0c2', '00000000-0000-4000-8000-0000000000a2', 'youtube', 'r1', true, 'kept unjudged', 'default', '2026-09-20 04:18Z'),
  ('00000000-0000-4000-8000-00000000c0c2', null, 'youtube', 'y3', false, 're-judged: a jacket', 'gpt', '2026-10-01 18:00Z'),
  ('00000000-0000-4000-8000-00000000c0c2', null, 'youtube', 'y4', true, 're-judged: about bags', 'gpt', '2026-10-01 18:00Z');

-- The week of 28 Sep, per audience: the category holds y1-y4 (two unchecked,
-- y2 and y3, with 1 + 2 comments), the rival r1 (unchecked, 5 comments).
do $$ declare r record; begin
  select videos, comments, unchecked, unchecked_comments into r
  from public.market_week_volumes('00000000-0000-4000-8000-00000000c0c2', '2026-09-28', '2026-10-05')
  where audience = 'industry-other';
  if (r.videos, r.comments, r.unchecked, r.unchecked_comments) is distinct from (4, 10, 2, 3) then
    raise exception 'category 28 Sep: % videos, % comments, % unchecked, % unchecked comments; expected 4, 10, 2, 3', r.videos, r.comments, r.unchecked, r.unchecked_comments;
  end if;
  select videos, comments, unchecked, unchecked_comments into r
  from public.market_week_volumes('00000000-0000-4000-8000-00000000c0c2', '2026-09-28', '2026-10-05')
  where audience = 'competitor:Rival';
  if (r.videos, r.comments, r.unchecked, r.unchecked_comments) is distinct from (1, 5, 1, 5) then
    raise exception 'rival 28 Sep: % videos, % comments, % unchecked, % unchecked comments; expected 1, 5, 1, 5', r.videos, r.comments, r.unchecked, r.unchecked_comments;
  end if;
end $$;

-- The week before: only y2's six, all unchecked; nothing of 28 Sep leaks in.
do $$ declare r record; begin
  select videos, comments, unchecked, unchecked_comments into r
  from public.market_week_volumes('00000000-0000-4000-8000-00000000c0c2', '2026-09-21', '2026-09-28');
  if (r.videos, r.comments, r.unchecked, r.unchecked_comments) is distinct from (1, 6, 1, 6) then
    raise exception '21 Sep: % videos, % comments, % unchecked, % unchecked comments; expected 1, 6, 1, 6', r.videos, r.comments, r.unchecked, r.unchecked_comments;
  end if;
end $$;

-- A row with nothing unchecked carries 0, never null; and the checked
-- remainder is what is left when the unchecked are kept clean.
insert into public.gate_verdicts (client_id, run_id, platform, video_id, kept, reason, source, created_at) values
  ('00000000-0000-4000-8000-00000000c0c2', null, 'youtube', 'r1', true, 're-judged: about bags', 'gpt', '2026-10-01 18:00Z');
do $$ declare r record; begin
  select videos, comments, unchecked, unchecked_comments into r
  from public.market_week_volumes('00000000-0000-4000-8000-00000000c0c2', '2026-09-28', '2026-10-05')
  where audience = 'competitor:Rival';
  if (r.unchecked, r.unchecked_comments) is distinct from (0, 0) then
    raise exception 'rival kept: % unchecked, % unchecked comments; expected 0 and 0', r.unchecked, r.unchecked_comments;
  end if;
end $$;

-- The cut still counts: a comment first captured after p_captured_before is
-- out of comments and out of unchecked_comments alike.
update public.comments set created_at = '2026-10-10 00:00Z'
 where client_id = '00000000-0000-4000-8000-00000000c0c2' and comment_id = 'y3-1';
do $$ declare r record; begin
  select comments, unchecked_comments into r
  from public.market_week_volumes('00000000-0000-4000-8000-00000000c0c2', '2026-09-28', '2026-10-05', '2026-10-09 00:00Z')
  where audience = 'industry-other';
  if (r.comments, r.unchecked_comments) is distinct from (9, 2) then
    raise exception 'captured before 9 Oct: % comments, % unchecked comments; expected 9 and 2', r.comments, r.unchecked_comments;
  end if;
end $$;

select 'week-unchecked-comments checks: all passed' as result;
rollback;
