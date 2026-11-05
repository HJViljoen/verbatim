-- Checks for 20261112090000_window_theme_readings_speed.sql, run on a throwaway
-- cluster after the migration (scripts/pg-shim/throwaway.sh check <dir> this-file).
-- Every check raises on a wrong answer; one transaction, rolled back.
--
-- The migration changes HOW `window_theme_readings` counts, never WHAT. So this
-- file holds two things:
--   1. the shipped body (20260918092000 after 62c54155), verbatim, as a pg_temp
--      witness, and old EXCEPT ALL new / new EXCEPT ALL old over a dozen windows
--      of a hand-built tenant, both empty;
--   2. the numbers themselves for October and June, written out by hand, so a
--      body that agreed with the witness by being wrong in the same way still
--      fails.
--
-- One tenant T, one run R, a second tenant U, four themes:
--   v1 youtube  analysed  industry-other   Oct 10, Oct 12, Jun 15, one undated
--   v2 tiktok   analysed  rival 'Rival'    Oct 20, one undated
--   v3 youtube  NOT analysed, T's own      Oct 5            (never counted)
--   v4 instagram analysed rival, no name   Jun 10, one undated
--   v5 tiktok   analysed  T's own          no comments at all
--   v6 youtube  analysed  industry-other   one undated comment only
--   v7 youtube  analysed  industry-other   Oct 15
--   th1  i1 (v1: Oct 10 + undated), i2 (v1: Oct 12 + Oct 10 again),
--        i3 (v2: Oct 20 + undated), i10 (cites U's comment: dropped), and a
--        member id from U's insight (dropped)
--   th2  i3 again (a member in two themes), i4 (v3, not analysed),
--        i9 (v1: Jun 15, plus on-camera evidence: not on-camera ONLY)
--   th3  i5 (v4: Jun 10 + undated), a member id that resolves to nothing
--   th4  on-camera only: i6 (v5, never dated), i7 (v6, only undated),
--        i8 (v7, dated in October)
-- and an older run whose single observation must never be read under R.

begin;

-- The shipped body, the witness. pg_temp, so it leaves with the session.
create function pg_temp.wtr_shipped(
  p_client uuid,
  p_run    uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  audience           text,
  theme_id           uuid,
  videos             int,
  comments           int,
  platform_mix       jsonb,
  excluded_on_camera int,
  excluded_undated   int
)
language sql
stable
set search_path = public, pg_temp
as $$
  with vid_all as (
    select v.id, v.platform, v.video_id,
           v.analyzed_run_id is not null as analysed,
           case when v.is_client     then 'client'
                when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience
    from public.videos v
    where v.client_id = p_client
  ),
  mem as (
    select o.theme_id, u.insight_id
    from public.theme_observations o, unnest(o.member_insight_ids) u(insight_id)
    where o.client_id = p_client and o.run_id = p_run
  ),
  ins as (
    select m.theme_id, ai.id as insight_id, ai.source_video_id
    from mem m
    join public.audience_insights ai on ai.id = m.insight_id
    where ai.client_id = p_client
  ),
  cited_all as (
    select i.theme_id, c.id as comment_id, c.comment_date, c.platform, c.video_id
    from ins i
    join public.insight_evidence ie on ie.audience_insight_id = i.insight_id and ie.source = 'comment'
    join public.comments c on c.id = ie.comment_id
    where c.client_id = p_client
  ),
  cited as (
    select ca.theme_id, v.audience, v.id as video_uuid, v.platform, ca.comment_id
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id and v.analysed
    where ca.comment_date >= p_from and ca.comment_date < p_to
  ),
  -- THE WINDOW'S (THEME, VIDEO) PAIRS DRIVE THIS JOIN, for the reason given on
  -- the denominator's copy of it: the pass used to fold every undated citation
  -- the run's themes hold and was then narrowed to the pairs `cited` already
  -- names. Same answer, the window's rows.
  cited_videos as (
    select distinct c.theme_id, c.audience, c.video_uuid from cited c
  ),
  undated_per_video as (
    select cv.theme_id, cv.video_uuid, count(distinct ca.comment_id) as n
    from cited_videos cv
    join vid_all v on v.id = cv.video_uuid
    join cited_all ca
      on ca.theme_id = cv.theme_id
     and ca.platform = v.platform
     and ca.video_id = v.video_id
     and ca.comment_date is null
    group by 1, 2
  ),
  undated as (
    select cv.theme_id, cv.audience, sum(u.n) as n
    from cited_videos cv
    join undated_per_video u on u.theme_id = cv.theme_id and u.video_uuid = cv.video_uuid
    group by 1, 2
  ),
  oncam as (
    select i.theme_id, i.insight_id, v.id as video_uuid, v.audience, v.platform
    from ins i
    join vid_all v on v.id = i.source_video_id
    where exists (select 1 from public.insight_evidence ie
                   where ie.audience_insight_id = i.insight_id and ie.source in ('video', 'video_text'))
      and not exists (select 1 from public.insight_evidence ie
                       where ie.audience_insight_id = i.insight_id and ie.source = 'comment')
  ),
  -- Window-scoped: which of these videos the window can attribute the member to
  -- at all. The month function asks the same question per month; here the answer
  -- is one row per video.
  denom as (
    select distinct v.audience, v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id and v.analysed
    where c.client_id = p_client
      and c.comment_date >= p_from and c.comment_date < p_to
      and v.id in (select o.video_uuid from oncam o)
  ),
  -- Window-FREE, exactly as in the month function: "no month could ever take
  -- this citation" is a fact about the video, not about the caller's window, and
  -- the number it produces has already been frozen onto month rows. Keeping the
  -- pass identical is what makes a window read and a month read agree on this
  -- column instead of quietly disagreeing.
  dated_ever as (
    select distinct v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id and v.analysed
    where c.client_id = p_client
      and c.comment_date is not null
      and v.id in (select o.video_uuid from oncam o)
  ),
  oncam_in as (
    select o.theme_id, d.audience, o.video_uuid, o.platform
    from oncam o
    join denom d on d.video_uuid = o.video_uuid and d.audience = o.audience
  ),
  oncam_out as (
    select o.theme_id, o.audience, count(*) as n
    from oncam o
    where not exists (select 1 from dated_ever d where d.video_uuid = o.video_uuid)
    group by 1, 2
  ),
  vids as (
    select c.theme_id, c.audience, c.video_uuid, c.platform from cited c
    union
    select oi.theme_id, oi.audience, oi.video_uuid, oi.platform from oncam_in oi
  ),
  base as (
    select x.theme_id, x.audience, count(distinct x.video_uuid) as videos
    from vids x group by 1, 2
  ),
  cmt as (
    select c.theme_id, c.audience, count(distinct c.comment_id) as comments
    from cited c group by 1, 2
  ),
  per_platform as (
    select x.theme_id, x.audience, x.platform, count(distinct x.video_uuid) as n
    from vids x group by 1, 2, 3
  ),
  mix as (
    select p.theme_id, p.audience, jsonb_object_agg(p.platform, p.n) as platform_mix
    from per_platform p group by 1, 2
  )
  select b.audience,
         b.theme_id,
         b.videos::int,
         coalesce(c.comments, 0)::int,
         coalesce(m.platform_mix, '{}'::jsonb),
         coalesce(oo.n, 0)::int,
         coalesce(u.n, 0)::int
  from base b
  left join cmt c on c.theme_id = b.theme_id and c.audience = b.audience
  left join mix m on m.theme_id = b.theme_id and m.audience = b.audience
  left join oncam_out oo on oo.theme_id = b.theme_id and oo.audience = b.audience
  left join undated   u  on u.theme_id  = b.theme_id and u.audience = b.audience
  order by b.audience, b.theme_id
$$;

insert into public.clients (id, company_name) values
  ('00000000-0000-4000-8000-0000000c0001', 'Window speed check T'),
  ('00000000-0000-4000-8000-0000000c0002', 'Window speed check U');
insert into public.pipeline_runs (id, client_id, status) values
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000c0001', 'completed'),
  ('00000000-0000-4000-8000-0000000a0002', '00000000-0000-4000-8000-0000000c0001', 'completed'),
  ('00000000-0000-4000-8000-0000000a0009', '00000000-0000-4000-8000-0000000c0002', 'completed');

insert into public.videos (id, client_id, platform, video_id, video_url, account_name, analyzed_run_id, is_client, is_competitor, competitor_name) values
  ('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-0000000c0001', 'youtube',   'y1', 'u', 'a', '00000000-0000-4000-8000-0000000a0001', false, false, null),
  ('00000000-0000-4000-8000-0000000b0002', '00000000-0000-4000-8000-0000000c0001', 'tiktok',    't2', 'u', 'a', '00000000-0000-4000-8000-0000000a0001', false, true,  'Rival'),
  ('00000000-0000-4000-8000-0000000b0003', '00000000-0000-4000-8000-0000000c0001', 'youtube',   'y3', 'u', 'a', null,                                   true,  false, null),
  ('00000000-0000-4000-8000-0000000b0004', '00000000-0000-4000-8000-0000000c0001', 'instagram', 'i4', 'u', 'a', '00000000-0000-4000-8000-0000000a0001', false, true,  null),
  ('00000000-0000-4000-8000-0000000b0005', '00000000-0000-4000-8000-0000000c0001', 'tiktok',    't5', 'u', 'a', '00000000-0000-4000-8000-0000000a0001', true,  false, null),
  ('00000000-0000-4000-8000-0000000b0006', '00000000-0000-4000-8000-0000000c0001', 'youtube',   'y6', 'u', 'a', '00000000-0000-4000-8000-0000000a0001', false, false, null),
  ('00000000-0000-4000-8000-0000000b0007', '00000000-0000-4000-8000-0000000c0001', 'youtube',   'y7', 'u', 'a', '00000000-0000-4000-8000-0000000a0001', false, false, null),
  ('00000000-0000-4000-8000-0000000b0099', '00000000-0000-4000-8000-0000000c0002', 'youtube',   'y1', 'u', 'a', '00000000-0000-4000-8000-0000000a0009', false, false, null);

insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date) values
  ('00000000-0000-4000-8000-0000000d0011', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'youtube',   'y1', 'c11', '2026-10-10 09:00Z'),
  ('00000000-0000-4000-8000-0000000d0012', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'youtube',   'y1', 'c12', '2026-10-12 09:00Z'),
  ('00000000-0000-4000-8000-0000000d0013', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'youtube',   'y1', 'c13', '2026-06-15 09:00Z'),
  ('00000000-0000-4000-8000-0000000d0014', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'youtube',   'y1', 'c14', null),
  ('00000000-0000-4000-8000-0000000d0021', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'tiktok',    't2', 'c21', '2026-10-20 09:00Z'),
  ('00000000-0000-4000-8000-0000000d0022', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'tiktok',    't2', 'c22', null),
  ('00000000-0000-4000-8000-0000000d0031', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'youtube',   'y3', 'c31', '2026-10-05 09:00Z'),
  ('00000000-0000-4000-8000-0000000d0041', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'instagram', 'i4', 'c41', '2026-06-10 09:00Z'),
  ('00000000-0000-4000-8000-0000000d0042', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'instagram', 'i4', 'c42', null),
  ('00000000-0000-4000-8000-0000000d0061', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'youtube',   'y6', 'c61', null),
  ('00000000-0000-4000-8000-0000000d0071', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'youtube',   'y7', 'c71', '2026-10-15 09:00Z'),
  ('00000000-0000-4000-8000-0000000d0091', '00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000a0009', 'youtube',   'y1', 'c91', '2026-10-11 09:00Z');

insert into public.audience_insights (id, client_id, run_id, source_video_id, category, theme, description)
select ('00000000-0000-4000-8000-0000000f00' || lpad(n::text, 2, '0'))::uuid, c::uuid, '00000000-0000-4000-8000-0000000a0001',
       ('00000000-0000-4000-8000-0000000b00' || lpad(v::text, 2, '0'))::uuid, 'question', 't', 'd'
from (values (1, 1, '00000000-0000-4000-8000-0000000c0001'), (2, 1, '00000000-0000-4000-8000-0000000c0001'),
             (3, 2, '00000000-0000-4000-8000-0000000c0001'), (4, 3, '00000000-0000-4000-8000-0000000c0001'),
             (5, 4, '00000000-0000-4000-8000-0000000c0001'), (6, 5, '00000000-0000-4000-8000-0000000c0001'),
             (7, 6, '00000000-0000-4000-8000-0000000c0001'), (8, 7, '00000000-0000-4000-8000-0000000c0001'),
             (9, 1, '00000000-0000-4000-8000-0000000c0001'), (10, 1, '00000000-0000-4000-8000-0000000c0001'),
             (11, 6, '00000000-0000-4000-8000-0000000c0001'),
             (99, 99, '00000000-0000-4000-8000-0000000c0002')) x(n, v, c);

insert into public.insight_evidence (audience_insight_id, source, comment_id, source_video_id, quote)
select ('00000000-0000-4000-8000-0000000f00' || lpad(i::text, 2, '0'))::uuid, s,
       case when s = 'comment' then ('00000000-0000-4000-8000-0000000d00' || r)::uuid end,
       case when s <> 'comment' then ('00000000-0000-4000-8000-0000000b00' || r)::uuid end,
       'q'
from (values (1, 'comment', '11'), (1, 'comment', '14'),
             (2, 'comment', '12'), (2, 'comment', '11'),
             -- A citation of c14 held twice (members 1 and 2: count(distinct) must
             -- not double it) and an undated citation on y6, a video no window
             -- pair of theme one names (the undated pass must not count it).
             (2, 'comment', '14'), (11, 'comment', '61'),
             (3, 'comment', '21'), (3, 'comment', '22'),
             (4, 'comment', '31'),
             (5, 'comment', '41'), (5, 'comment', '42'),
             (6, 'video', '05'), (7, 'video_text', '06'), (8, 'video', '07'),
             (9, 'comment', '13'), (9, 'video', '01'),
             (10, 'comment', '91'),
             (99, 'comment', '91')) x(i, s, r);

insert into public.theme_registry (id, client_id, bucket, canonical_label)
select ('00000000-0000-4000-8000-0000000e000' || n)::uuid, '00000000-0000-4000-8000-0000000c0001', 'question', 'theme ' || n
from generate_series(1, 4) n;

insert into public.theme_observations (theme_id, client_id, run_id, label, match_kind, member_insight_ids) values
  ('00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'one', 'new',
   array['00000000-0000-4000-8000-0000000f0001', '00000000-0000-4000-8000-0000000f0002', '00000000-0000-4000-8000-0000000f0003',
         '00000000-0000-4000-8000-0000000f0010', '00000000-0000-4000-8000-0000000f0099',
         '00000000-0000-4000-8000-0000000f0011']::uuid[]),
  ('00000000-0000-4000-8000-0000000e0002', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'two', 'new',
   array['00000000-0000-4000-8000-0000000f0003', '00000000-0000-4000-8000-0000000f0004', '00000000-0000-4000-8000-0000000f0009']::uuid[]),
  ('00000000-0000-4000-8000-0000000e0003', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'three', 'new',
   array['00000000-0000-4000-8000-0000000f0005', '00000000-0000-4000-8000-00000000dead']::uuid[]),
  ('00000000-0000-4000-8000-0000000e0004', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'four', 'new',
   array['00000000-0000-4000-8000-0000000f0006', '00000000-0000-4000-8000-0000000f0007', '00000000-0000-4000-8000-0000000f0008']::uuid[]),
  ('00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0002', 'older', 'new',
   array['00000000-0000-4000-8000-0000000f0009']::uuid[]);

-- 1. The witness agrees, both directions, on every window.
do $$ declare w record; a int; b int; n int; total int := 0; begin
  for w in select * from (values
      ('2026-10-01'::timestamptz, '2026-11-01'::timestamptz), ('2026-06-01', '2026-07-01'),
      ('2026-10-12', '2026-10-13'), ('2026-10-01', '2026-10-12'), ('2026-10-13', '2026-10-21'),
      ('2026-09-28', '2026-10-05'), ('2026-08-01', '2026-11-01'), ('2026-06-01', '2026-11-01'),
      ('2000-01-01', '2100-01-01'), ('2027-01-01', '2027-02-01'), ('2026-11-01', '2026-10-01'),
      ('2026-09-30 22:00Z', '2026-10-31 22:00Z')) x(f, t)
  loop
    select count(*) into a from (
      select * from pg_temp.wtr_shipped('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', w.f, w.t)
      except all
      select * from public.window_theme_readings('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', w.f, w.t)) x;
    select count(*) into b from (
      select * from public.window_theme_readings('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', w.f, w.t)
      except all
      select * from pg_temp.wtr_shipped('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', w.f, w.t)) x;
    if a <> 0 or b <> 0 then raise exception 'window [%, %): shipped minus new %, new minus shipped %', w.f, w.t, a, b; end if;
    select count(*) into n from public.window_theme_readings('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', w.f, w.t);
    total := total + n;
  end loop;
  if total < 20 then raise exception 'the windows read only % rows: the fixture is not being read', total; end if;
end $$;

-- 2. October, by hand. th1 on v1 counts the undated c14 (its pair is in the
--    window); th1 and th2 on v2 each count c22; th3's undated c42 is on a pair
--    October does not name; th4 reads v7 through the on-camera pass and carries
--    i7 (v6, never dated) as excluded; i6 (v5) has no row because its audience
--    has no reading in the window; v3 is never read; U's comment never reaches T.
do $$ declare got text; want text; begin
  select string_agg(format('%s|%s|%s|%s|%s|%s|%s', audience, right(theme_id::text, 1), videos, comments, platform_mix, excluded_on_camera, excluded_undated), ' ; ' order by audience, theme_id)
    into got from public.window_theme_readings('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', '2026-10-01 00:00Z', '2026-11-01 00:00Z');
  want := 'competitor:Rival|1|1|1|{"tiktok": 1}|0|1 ; competitor:Rival|2|1|1|{"tiktok": 1}|0|1 ; industry-other|1|1|2|{"youtube": 1}|0|1 ; industry-other|4|1|0|{"youtube": 1}|1|0';
  if got is distinct from want then raise exception E'October:\n  got  %\n  want %', got, want; end if;
end $$;

-- 3. June, by hand: th3 on v4 now names its pair, so c42 counts there; th2's
--    i9 is read through its comment (it has one, so it is not on-camera only).
do $$ declare got text; want text; begin
  select string_agg(format('%s|%s|%s|%s|%s|%s|%s', audience, right(theme_id::text, 1), videos, comments, platform_mix, excluded_on_camera, excluded_undated), ' ; ' order by audience, theme_id)
    into got from public.window_theme_readings('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', '2026-06-01 00:00Z', '2026-07-01 00:00Z');
  want := 'competitor:unknown|3|1|1|{"instagram": 1}|0|1 ; industry-other|2|1|1|{"youtube": 1}|0|0';
  if got is distinct from want then raise exception E'June:\n  got  %\n  want %', got, want; end if;
end $$;

-- 4. The older run's clustering is its own question, and T's clustering under
--    U's id reads nothing.
do $$ declare n int; begin
  select count(*) into n from public.window_theme_readings('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0002', '2026-06-01 00:00Z', '2026-07-01 00:00Z');
  if n <> 1 then raise exception 'older run, June: % rows, expected 1 (th1 through i9)', n; end if;
  select count(*) into n from public.window_theme_readings('00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000a0001', '2000-01-01 00:00Z', '2100-01-01 00:00Z');
  if n <> 0 then raise exception 'T''s run under U: % rows, expected 0', n; end if;
end $$;

-- 5. Still a service-role-only SECURITY DEFINER function, as 20260918092000 left it.
do $$ begin
  if not (select prosecdef from pg_proc where oid = 'public.window_theme_readings(uuid, uuid, timestamptz, timestamptz)'::regprocedure) then
    raise exception 'window_theme_readings is no longer SECURITY DEFINER';
  end if;
  if has_function_privilege('authenticated', 'public.window_theme_readings(uuid, uuid, timestamptz, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.window_theme_readings(uuid, uuid, timestamptz, timestamptz)', 'execute') then
    raise exception 'window_theme_readings is executable by a tenant role';
  end if;
  if not has_function_privilege('service_role', 'public.window_theme_readings(uuid, uuid, timestamptz, timestamptz)', 'execute') then
    raise exception 'service_role lost execute on window_theme_readings';
  end if;
end $$;

select 'window-theme-speed checks: all passed' as result;
rollback;
