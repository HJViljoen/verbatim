-- The reading layer's two window reads, and the hole in the freeze guard
-- (Phase 1 WP3, design items 1/2/5/6, decisions K and N, 2026-09-18).
--
-- TWO THINGS, ONE FILE, BECAUSE THEY ARE THE SAME RULE SEEN FROM TWO SIDES.
-- 20260915092000 wrote the month down and promised a frozen month is never
-- rewritten. This file finishes both halves of that promise: the reads that a
-- window — a week, a month-to-date, a quarter — actually needs, and the guard
-- that stops a row being added to a month that has already closed.
--
-- 1. WHY A WINDOW NEEDS ITS OWN READ, AND CANNOT BE A SUM OF MONTHS.
-- `monthly_denominators` / `monthly_theme_readings` group by calendar month
-- unconditionally (20260915092000:322, :456), which is right: a month is the
-- record's key. But `videos` is a count of DISTINCT videos in a month, and a
-- video whose comment thread spans two months is a member of both months' sets.
-- Summing the rows counts it twice. Measured read-only on production, 2026-09-15:
--
--   Össur, ISO week 36 (2026-08-31 → 2026-09-07)
--     window-grouped distinct videos  290
--     sum of the two month rows       372     +28.3%
--   Össur, own brand (audience 'client'), the last twelve months
--     window-grouped distinct videos   62
--     sum of the month rows            86     +38.7%
--   Össur, own brand, since the first stored month
--     window-grouped distinct videos   88
--     sum of the month rows           168     +90.9%
--
-- The last one crosses a floor: SHARE_BAND.minN is 100 videos a side
-- (lib/report-bands.ts:49), so the summed number turns the one audience the
-- buyer cares most about from an honest "too few to compare" into an answered
-- comparison, on an n that is 91% double-counted — and, because the band's
-- half-width goes as 1/sqrt(n), narrows the band by about 28% while it does it.
--
-- COMMENTS DO SUM EXACTLY. A comment carries one comment_date and lands in one
-- month; `count(distinct comment_id)` summed across month rows equalled the
-- window's distinct comment count on all twenty tenant-weeks measured, crossing
-- weeks included. So the rule a reader has to carry is not "never sum" — it is
-- "comments sum, videos do not", and with them `platform_mix`, `dual_mention`,
-- `excluded_undated` and `excluded_on_camera`.
--
-- WHAT THESE TWO FUNCTIONS ARE FOR, AND WHAT THEY ARE NOT FOR. They answer the
-- one windowed FIGURE a page prints in prose — "19% (69 of 366) over the last
-- three months" — and the anomaly check's week n. They are transient: nothing
-- freezes their output, and nothing should. The SERIES on a chart stays a read
-- of the stored month rows, which is the cheap indexed read and the frozen
-- record; a horizon control is a longer series plus one windowed figure, not a
-- fresh full read per page load. (Measured: the theme arm's I/O is exactly
-- window-independent — 54,765 shared buffers on Össur at "this month" and at
-- "since we started", to the block — so a wider horizon is not a more expensive
-- read, it is the same read discarding fewer rows.)
--
-- THE BODIES ARE THE MONTH BODIES WITH THE MONTH TAKEN OUT. Deliberately, line
-- for line, so that the two answers can never drift into two different
-- measurements of the same thing: same audience precedence, same
-- (client_id, platform, video_id) join, same analysed-only filter, same
-- `position(name in haystack)` rival fold, same theme chain through the BASE
-- audience_insights table, same on-camera rule. Every substantive comment lives
-- in 20260915092000 and is not repeated here; what differs is noted where it
-- differs.
--
-- ONE DIFFERENCE THAT IS NOT A SIMPLIFICATION. `excluded_on_camera` was already
-- window-independent in the month function (its `dated_ever` pass is
-- deliberately window-free, 20260915092000:498-503), so it ports unchanged and
-- a window read and a month read of the same theme agree on it exactly. The
-- other exclusions are window-scoped here exactly as they are month-scoped
-- there.
--
-- 2. WHY THE FREEZE GUARD NEEDED A SECOND HALF.
-- `month_reading_frozen_guard` is BEFORE UPDATE only (20260915092000:205-215),
-- which stops a stored row being rewritten and does nothing about a row that
-- was never stored. A theme the current clustering has just discovered has no
-- row in last March, so a writer that visits March inserts it — into a month
-- that froze weeks ago, beside numbers read under a different clustering, with
-- nothing on the row saying it arrived late. Verified by running the shipped
-- `mergeMonthRows` against the stored rows: a fresh key in a frozen month is an
-- INSERT and the merge lets it through.
--
-- THE UNIT OF FREEZING IS THE AUDIENCE-MONTH, not the row. Once
-- (client_id, month, audience) has closed, what that audience carried in that
-- month is the record, and adding a numerator to it changes the record whether
-- or not the row being added is new.
--
-- THE DENOMINATOR IS THE COMMIT MARKER. `freezeMonths` writes the theme rows
-- first and the denominators second, on purpose (lib/reading/monthly.ts:736-755:
-- a visit that froze a denominator and then failed on its numerators would
-- leave a month nothing can bring a later run back to). So a frozen denominator
-- row means "a visit to this audience-month completed", and it is the only
-- state in the schema that means it. That is the authority this guard reads.
--
-- WHY NOT THE TARGET TABLE'S OWN FROZEN ROWS. Because a BEFORE INSERT trigger
-- CAN see the rows its own statement has already processed — measured on
-- PostgreSQL 17.11: in one `insert … on conflict do update` of three rows, the
-- second row's trigger saw one sibling already flipped to frozen and the third
-- saw two. A guard keyed on the target table's own frozen rows would therefore
-- refuse the visit that closes a month, half way through the statement that
-- closes it, every time. The denominator is a different table written by a
-- later statement, so it is still `filling` (or absent) while the numerators go
-- in, and frozen for ever after.
--
-- AN UPSERT IS NOT AN INSERT, AND THE TRIGGER CANNOT TELL. `insert … on
-- conflict do update` fires BEFORE INSERT before it looks for the conflict, so
-- the ordinary refresh of rows that already exist reaches this trigger as an
-- insert (measured on PostgreSQL 17.11). A guard that stopped there would
-- refuse every upsert into a closed audience-month — including the one that
-- refreshes the filling theme rows of a month whose denominator froze first,
-- which is exactly the state this file's writer paragraph describes, and
-- `writeRows` sends an upsert for every write there is. So the guard asks the
-- catalogue for the target table's primary key and lets a row that is already
-- there through to the DO UPDATE path, where the BEFORE UPDATE guard judges it.
-- Reading the key from the catalogue is also what lets M4 and M5 attach this
-- function unchanged. It leaves one thing to tidy up: the DO UPDATE rewrites
-- that row's tuple with THIS transaction's xmin, which would blind the third
-- clause below to the fact that the audience-month was already held, so a new
-- key later in the same statement could slip in behind the freeze. The pass is
-- therefore marked in a transaction-local setting and the third clause reads
-- it, which makes the answer the same whichever order the rows arrive in.
--
-- THE THIRD CLAUSE, AND DECISION K's "A FIRST WRITE IS ALLOWED". A frozen
-- denominator alone would also refuse the first back-read of a table that did
-- not exist when the month closed — the subject readings of M4, the kind
-- readings of M5 — and those are not a change to the record, they are the first
-- reading of it. So the guard refuses only when the target table ALREADY HOLDS
-- a row for that audience-month, and "already" excludes the rows the current
-- transaction is writing (`month_reading_written_here`, which is
-- subtransaction-safe where a bare `xmin <> pg_current_xact_id()::xid` is not),
-- so a first population of a whole table is one statement — or one savepointed
-- chunk after another — and not one row followed by a raise. A tenant's newly tracked rival is allowed for the plainer reason that
-- its audience has no denominator row in those months at all.
--
-- AND THE WRITER MUST NOT SEND ONE. A raise takes the WHOLE statement with it,
-- and `freezeMonths` upserts a month's theme rows in chunks of 500: one refused
-- new key would kill the legitimate refresh of every filling row beside it in
-- the chunk. That is not hypothetical — it is this file's own recoverable
-- state, reached when a registry failure holds filling theme rows while the
-- denominators (which do not depend on the clustering) are written and frozen,
-- and it is self-perpetuating, because the held filling row brings the month
-- back on every later run and re-clustering mints a fresh key each time. So
-- `mergeMonthRows` takes `closedAudienceMonths` and drops exactly the rows this
-- guard would refuse, one row rather than one statement at a time, and names
-- them in `refusedLate` for the caller to log. The guard is the backstop for
-- hand-run SQL and for a writer that has not learnt the rule; it is not the
-- mechanism by which the rule is kept.
--
-- NO `added_after_freeze` ESCAPE (decision K). A row that arrived after the
-- month closed is not a row with a flag on it; it is a number nobody read at
-- the time. The guard raises, the writer's step fails loudly, and a person
-- decides — which is the same posture the UPDATE guard has taken since
-- 2026-09-15. The one door left open is a DELETE followed by an INSERT, and it
-- is open on purpose: a DELETE guard would block the cascades from `clients`
-- and `theme_registry` and make a tenant undeletable.

-- 1. The window denominator ----------------------------------------------------
-- One row per audience for the whole half-open window [p_from, p_to), never per
-- month. SECURITY DEFINER with execute granted to service_role only, for the
-- same reason as its month sibling (20260915092000:245-249): p_client is a
-- parameter, so a function `authenticated` could call is a function a tenant
-- could call with someone else's client id.
create or replace function public.window_denominators(
  p_client uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  audience         text,
  videos           int,
  comments         int,
  platform_mix     jsonb,
  dual_mention     int,
  excluded_undated int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with vid as (
    select v.id, v.platform, v.video_id,
           case when v.is_client     then 'client'
                when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience
    from public.videos v
    where v.client_id = p_client
      and v.analyzed_run_id is not null
  ),
  -- The combining-mark range is built with chr() rather than written as \u
  -- escapes: this file is applied by hand through the Supabase MCP and that
  -- transport decodes \u sequences before Postgres ever sees them, which would
  -- change the fold with no error raised anywhere. chr(768)–chr(879) is
  -- U+0300–U+036F, the same range 20260915092000 folds on.
  rivals as (
    select distinct regexp_replace(normalize(lower(cn), NFD),
                                   '[' || chr(768) || '-' || chr(879) || ']', '', 'g') as name
    from public.tracking_configs tc, unnest(coalesce(tc.competitor_names, '{}'::text[])) cn
    where tc.client_id = p_client and coalesce(cn, '') <> ''
  ),
  dual as (
    select v.id
    from public.videos v
    where v.client_id = p_client
      and v.is_client
      and exists (
        select 1 from rivals r
        where position(r.name in regexp_replace(
                normalize(lower(coalesce(v.account_name, '') || ' ' || coalesce(v.caption, '') || ' ' ||
                                coalesce(array_to_string(v.hashtags, ' '), '')), NFD),
                '[' || chr(768) || '-' || chr(879) || ']', '', 'g')) > 0
      )
  ),
  -- No date_trunc here, and that is the whole difference: a video that carried
  -- conversation on both sides of a month boundary is ONE member of this set.
  dated as (
    select v.audience, v.id as video_uuid, v.platform, c.id as comment_id
    from public.comments c
    join vid v on v.platform = c.platform and v.video_id = c.video_id
    where c.client_id = p_client
      and c.comment_date >= p_from
      and c.comment_date <  p_to
  ),
  base as (
    select d.audience,
           count(distinct d.video_uuid) as videos,
           count(distinct d.comment_id) as comments
    from dated d group by 1
  ),
  per_platform as (
    select d.audience, d.platform, count(distinct d.video_uuid) as n
    from dated d group by 1, 2
  ),
  mix as (
    select p.audience, jsonb_object_agg(p.platform, p.n) as platform_mix
    from per_platform p group by 1
  ),
  duals as (
    select d.audience, count(distinct d.video_uuid) as dual_mention
    from dated d join dual on dual.id = d.video_uuid group by 1
  ),
  undated_per_video as (
    select v.id as video_uuid, count(*) as n
    from public.comments c
    join vid v on v.platform = c.platform and v.video_id = c.video_id
    where c.client_id = p_client and c.comment_date is null
    group by 1
  ),
  -- Recorded against the window's videos once, not once per month those videos
  -- occupy: "the videos this window reads also carry N comments nobody could
  -- date". Same sentence as the month row, one window instead of one month.
  undated as (
    select s.audience, sum(u.n) as excluded_undated
    from (select distinct d.audience, d.video_uuid from dated d) s
    join undated_per_video u on u.video_uuid = s.video_uuid
    group by 1
  )
  select b.audience,
         b.videos::int,
         b.comments::int,
         coalesce(m.platform_mix, '{}'::jsonb),
         coalesce(dm.dual_mention, 0)::int,
         coalesce(un.excluded_undated, 0)::int
  from base b
  left join mix   m  on m.audience  = b.audience
  left join duals dm on dm.audience = b.audience
  left join undated un on un.audience = b.audience
  order by b.audience
$$;

comment on function public.window_denominators(uuid, timestamptz, timestamptz) is
  'Per audience over the whole half-open window [p_from, p_to), never per month: DISTINCT analysed videos carrying a comment dated in the window, their comments, the platform mix, the client videos that also name a rival, and the undated comments those videos carry. The month sibling monthly_denominators is what the record is written from; this one answers a windowed figure (a week, a month-to-date, a quarter) that summing month rows would over-count — measured +28.3% on Ossur week 36 and +90.9% on its own brand since the first stored month.';

revoke all on function public.window_denominators(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.window_denominators(uuid, timestamptz, timestamptz) to service_role;

-- 2. The window theme read -----------------------------------------------------
-- One row per audience per theme for the whole window, under one run's
-- clustering. Every rule is monthly_theme_readings' rule; see 20260915092000:384-401
-- for the chain and why member ids that resolve to nothing are skipped in silence.
create or replace function public.window_theme_readings(
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
security definer
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
  undated_per_video as (
    select ca.theme_id, v.id as video_uuid, count(distinct ca.comment_id) as n
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id
    where ca.comment_date is null
    group by 1, 2
  ),
  undated as (
    select s.theme_id, s.audience, sum(u.n) as n
    from (select distinct c.theme_id, c.audience, c.video_uuid from cited c) s
    join undated_per_video u on u.theme_id = s.theme_id and u.video_uuid = s.video_uuid
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

comment on function public.window_theme_readings(uuid, uuid, timestamptz, timestamptz) is
  'Per audience per theme over the whole half-open window [p_from, p_to), for one run''s clustering: DISTINCT videos and comments the theme''s member insights cite, the platform mix, the undated citations those videos carry, and the on-camera-only members no month can carry (window-independent, identical to the month function''s column). theme_id is theme_registry.id. The month sibling writes the record; this one answers a windowed figure.';

revoke all on function public.window_theme_readings(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.window_theme_readings(uuid, uuid, timestamptz, timestamptz) to service_role;

-- 3. The other half of the freeze guard ----------------------------------------
-- Attached to every month table. The rationale is at the head of this file; the
-- rule is three predicates and they are all in the one query below.

-- Was this row written by THIS transaction? Not the same question as
-- `xmin = pg_current_xact_id()`, and the difference is a live bug: a row
-- inserted inside a SAVEPOINT — or inside a PL/pgSQL `begin … exception` block,
-- which opens one — carries a SUBTRANSACTION xid, while pg_current_xact_id()
-- returns the top-level one, so the plain equality reads this transaction's own
-- earlier rows as an earlier transaction's and refuses a first population on
-- the chunk after the savepoint (measured on PostgreSQL 17.11: the plain
-- outer-then-savepoint order passes and the savepoint-then-outer order raises,
-- so the failure is direction-dependent and a casual test misses it).
-- pg_xact_status answers 'in progress' for the current transaction AND every
-- subtransaction of it, and a row written by ANOTHER in-progress transaction is
-- not visible to this one in the first place, so 'in progress' means "written
-- here". It raises on an xid8 in the future, which is what an xid from an
-- earlier epoch casts to after wraparound; that is caught and answered `false`,
-- the conservative direction (the row counts as an earlier transaction's, and
-- the guard fires). Takes an xid and returns a boolean: it reads no table and
-- says nothing about any tenant, so it keeps the default ACL.
create or replace function public.month_reading_written_here(p_xmin xid)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $here$
begin
  if p_xmin = pg_current_xact_id()::xid then
    return true;
  end if;
  return coalesce(pg_xact_status(p_xmin::text::xid8) = 'in progress', false);
exception when others then
  return false;
end
$here$;

comment on function public.month_reading_written_here(xid) is
  'Was the row carrying this xmin written by the current transaction, subtransactions included? Used by month_reading_frozen_insert_guard to tell its own statement''s rows from an earlier transaction''s. Subtransaction-safe, which xmin = pg_current_xact_id()::xid is not.';

create or replace function public.month_reading_frozen_insert_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $guard$
declare
  v_closed boolean;
  v_known  boolean;
  v_exists boolean;
  v_pk     text;
  v_mark   text;
  v_seen   text;
begin
  -- (a) has this audience-month already closed? The denominator is the commit
  -- marker: freezeMonths writes it last, so it is `filling` or absent while a
  -- visit is still writing and frozen once the visit has finished.
  select exists (
    select 1 from public.month_denominators d
    where d.client_id = new.client_id
      and d.month     = new.month
      and d.audience  = new.audience
      and d.status    = 'frozen'
      and d.xmin <> pg_current_xact_id()::xid
  ) into v_closed;

  if not v_closed then
    return new;
  end if;

  v_mark := format('|%s/%s/%s|', tg_table_name, new.month, new.audience);

  -- (b) is this row genuinely NEW? `insert … on conflict do update` fires its
  -- BEFORE INSERT triggers BEFORE it detects the conflict, so the ordinary
  -- refresh of a row that already exists arrives here looking exactly like an
  -- insert (measured on PostgreSQL 17.11). Without this clause the guard
  -- refuses every upsert into a closed audience-month, including one whose rows
  -- all exist — which is the shape `writeRows` sends, so an audience-month
  -- whose denominator froze while a theme row of it is still filling could
  -- never be refreshed again. A row whose primary key is already there is not
  -- an addition to the record: it goes on to the DO UPDATE path, where
  -- `month_reading_frozen_guard` (BEFORE UPDATE) judges it as it always has.
  -- The key is read from the catalogue rather than named, so M4 and M5 attach
  -- this function to their own tables unchanged.
  select string_agg(
           format('t.%I = ($1 ->> %L)::%s', a.attname, a.attname, format_type(a.atttypid, a.atttypmod)),
           ' and ' order by k.ord)
    into v_pk
  from pg_index i
  cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = tg_relid and i.indisprimary;

  if v_pk is not null then
    execute format('select exists (select 1 from public.%I t where %s)', tg_table_name, v_pk)
      into v_exists
      using to_jsonb(new);
    if v_exists then
      -- Remember it. An `on conflict do update` rewrites the existing row's
      -- tuple, and the rewritten tuple carries THIS transaction's xmin — so
      -- once a sibling of this audience-month has been refreshed by this
      -- statement, clause (c) below can no longer see that the audience-month
      -- was already held, and a brand-new key later in the same statement would
      -- slip in behind the freeze. The mark is transaction-local (reset on
      -- rollback, including a savepoint's) and makes the refusal the same
      -- whichever order the rows arrive in.
      v_seen := coalesce(current_setting('verbatim.month_reading_refreshed', true), '');
      if position(v_mark in v_seen) = 0 then
        perform set_config('verbatim.month_reading_refreshed', v_seen || v_mark, true);
      end if;
      return new;
    end if;
  end if;

  -- (c) does the table being written to already hold a reading of that
  -- audience-month? If it does not, this is the first reading of a record that
  -- closed before the table existed (decision K), not a change to one. Rows this
  -- transaction has written do not count as "already": a BEFORE INSERT trigger
  -- sees its own statement's earlier rows, and without this a first population
  -- would refuse itself on its second row. `month_reading_written_here` is that
  -- test, and it is subtransaction-safe — see its own comment.
  execute format(
    'select exists (select 1 from public.%I t
                     where t.client_id = $1 and t.month = $2 and t.audience = $3
                       and not public.month_reading_written_here(t.xmin))',
    tg_table_name)
    into v_known
    using new.client_id, new.month, new.audience;

  if not v_known
     and position(v_mark in coalesce(current_setting('verbatim.month_reading_refreshed', true), '')) = 0 then
    return new;
  end if;

  raise exception 'frozen monthly reading takes no new rows: %, month %, audience %',
    tg_table_name, new.month, new.audience
    using errcode = 'restrict_violation',
          hint = 'That audience-month closed and is the record. A late reading is written down as an accrual against a fresh reading, never added to the frozen one (lib/reading/monthly.ts mergeMonthRows).';
  return null;
end
$guard$;

comment on function public.month_reading_frozen_insert_guard() is
  'BEFORE INSERT on every month table: refuses a row for an audience-month whose month_denominators row is already frozen, unless the row''s primary key is already there (an upsert''s DO UPDATE path, judged by month_reading_frozen_guard instead) or the target table holds no reading of that audience-month from an earlier transaction (the first back-read of a table that did not exist when the month closed). The companion to month_reading_frozen_guard, which is BEFORE UPDATE.';

drop trigger if exists month_denominators_frozen_insert_guard on public.month_denominators;
create trigger month_denominators_frozen_insert_guard
  before insert on public.month_denominators
  for each row
  execute function public.month_reading_frozen_insert_guard();

drop trigger if exists month_theme_readings_frozen_insert_guard on public.month_theme_readings;
create trigger month_theme_readings_frozen_insert_guard
  before insert on public.month_theme_readings
  for each row
  execute function public.month_reading_frozen_insert_guard();

-- Exercised before it was ever applied, on a throwaway PostgreSQL 17.11 cluster
-- over schema-baseline.sql + every migration after it, applied TWICE:
--   * the file is idempotent — second apply replaces both functions and both
--     triggers with no error and no duplicate trigger;
--   * a new theme row into a frozen audience-month raises restrict_violation,
--     and the same row into the same month of an audience whose denominator is
--     still filling is accepted;
--   * the visit that CLOSES a month — the theme rows of that month upserted in
--     one statement, some of them new — is accepted, which is the case a guard
--     keyed on the target table's own frozen rows would have refused (measured:
--     a BEFORE INSERT trigger sees its own statement's earlier rows);
--   * a first row for a brand-new object kind (a second table with the same
--     shape) into a long-frozen audience-month is accepted, and a second row for
--     the same audience-month in a LATER transaction is refused;
--   * that first population is accepted whether its chunks are plain statements,
--     savepointed in either order, or written from a PL/pgSQL `begin … exception`
--     block — the case a bare `xmin <> pg_current_xact_id()::xid` refused,
--     because a row written in a subtransaction carries the SUBtransaction's xid;
--   * an upsert of rows that ALL already exist in a closed audience-month is
--     accepted by this guard and judged by the UPDATE guard instead, so a month
--     whose denominator froze while a theme row of it is still filling can still
--     be refreshed;
--   * the same upsert with ONE fresh key in it is refused IN WHOLE, in either
--     row order — which is why `mergeMonthRows` drops that row before it sends
--     the batch (`closedAudienceMonths` / `refusedLate`);
--   * a newly tracked rival back-reads into old months freely (no denominator
--     row for its audience);
--   * an upsert that would rewrite a frozen denominator is refused;
--   * both window functions run, and reproduce the month functions' totals where
--     the window is exactly one month;
--   * `authenticated` and `anon` cannot execute either window function;
--     `service_role` can.
--
-- Post-apply checks (run by hand, read-only):
--   select proname, prosecdef from pg_proc
--     where proname in ('window_denominators','window_theme_readings','month_reading_frozen_insert_guard');
--   select has_function_privilege('service_role',  'public.window_denominators(uuid,timestamptz,timestamptz)', 'execute'); -- true
--   select has_function_privilege('authenticated', 'public.window_denominators(uuid,timestamptz,timestamptz)', 'execute'); -- false
--   select tgname, tgrelid::regclass from pg_trigger
--     where not tgisinternal and tgname like 'month_%_frozen_insert_guard';
