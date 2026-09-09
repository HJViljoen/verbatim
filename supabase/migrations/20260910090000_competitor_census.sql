-- Competitor account census (2026-09-09). Competitors get the same treatment
-- the client's own accounts get: their posts for the window, exactly, with
-- their transcripts — so a competitor page can say what the competitor
-- actually claims instead of "nothing captured from X's own videos".
--
-- Three additive changes, all applied BEFORE the code that reads them deploys.

-- 1. Where a competitor's accounts live. Keys MUST match tracking_configs
--    .competitor_names entries exactly — that is the join between the handle
--    and everything else the product already knows about that competitor.
--    Shape: { "<competitor_name>": { "instagram": "handle", "tiktok": "handle",
--                                    "youtube": "UC…" } }
--    Operator-set, like own_handles: a wrong handle here would attribute
--    someone else's posts to a tracked brand, so it is not self-serve.
alter table public.tracking_configs
  add column if not exists competitor_handles jsonb not null default '{}'::jsonb;

comment on column public.tracking_configs.competitor_handles is
  'Competitor-owned account handles per platform, keyed by the exact competitor_names entry. Operator-set (a wrong handle mis-attributes posts to a tracked brand).';

-- 2. A third kind of row. 'competitor_owned' is a competitor's OWN post: it
--    feeds their claims (say side) and never the discovered-corpus metrics —
--    the same anti-inflation rule that keeps the client's own posts out of
--    share of conversation, applied to everyone, so share stays a pure measure
--    of what the market said unprompted.
alter table public.videos drop constraint if exists videos_source_check;
alter table public.videos add constraint videos_source_check
  check (source = any (array['discovered'::text, 'owned'::text, 'competitor_owned'::text]));

alter table public.comments drop constraint if exists comments_source_check;
alter table public.comments add constraint comments_source_check
  check (source = any (array['discovered'::text, 'owned'::text, 'competitor_owned'::text]));

-- 3. Snapshots are per ACCOUNT, not per platform. One tenant now tracks its own
--    Instagram account and three competitors' — (client, platform, date) would
--    let them overwrite each other, silently, one row a day. `nulls not
--    distinct` keeps the old guarantee for the handle-less rows the column
--    allows (there are none in prod: 132 rows, 0 null handles, 0 duplicates
--    under the new key — checked before applying).
update public.account_snapshots s
   set handle = c.own_handles ->> s.platform
  from public.tracking_configs c
 where c.client_id = s.client_id
   and s.handle is null
   and c.own_handles ? s.platform;

alter table public.account_snapshots
  drop constraint if exists account_snapshots_client_id_platform_snapshot_date_key;
alter table public.account_snapshots
  add constraint account_snapshots_client_id_platform_handle_snapshot_date_key
  unique nulls not distinct (client_id, platform, handle, snapshot_date);

-- Post-apply check (run by hand):
--   select pg_get_constraintdef(oid) from pg_constraint where conname in
--     ('videos_source_check', 'comments_source_check',
--      'account_snapshots_client_id_platform_handle_snapshot_date_key');
--   select count(*) from public.account_snapshots where handle is null;  -- 0
