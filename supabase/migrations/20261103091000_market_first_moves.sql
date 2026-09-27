-- MF5 · market-first: the day a move was made (WP3.6 wave 2, the approved
-- preview's "Date a move"; applied by Heinrich through
-- scripts/apply-market-first-migrations.sh --set mf5, after MF3, from the tag
-- the lead cuts for it). Nothing deployed before it reads the column, and the
-- page that writes it dates a move today until it is applied.
--
-- WHAT IT ADDS. One nullable column on public.moves, one CHECK on it, and the
-- member's INSERT on it. No table, no function, no existing grant, policy,
-- trigger or column changes.
--   moves.dated_on  the day the client says the change was made ("Date
--                   something you change, such as a post series, a product
--                   page or a price"): Your moves reads the market from that
--                   day's month (Y4: the move's month, the month after and the
--                   month after that, as levels). Null for every move before
--                   it, and for one dated today: a reader takes
--                   coalesce(dated_on, declared_at).
--
-- WHY A SECOND DATE AND NOT declared_at. declared_at is the database's
-- current_date and never a form value (20260918093000): the Phase 1 move
-- reading compares the months either side of it, and a date a request could
-- choose is a baseline a request could choose. That reading is unchanged and
-- keeps declared_at. dated_on feeds only Y4, which prints levels and no
-- comparison (decision D), so a chosen day chooses which months are shown and
-- nothing else. It is bounded all the same:
--   · no later than declared_at: a move is dated when it has been made;
--   · no earlier than the first of the month two months before declared_at's:
--     the three months the page reads questions over (QUESTION_WINDOW_MONTHS),
--     so a move is dated from what the client can still see on the page.
-- declared_at itself stays append-only, and so does dated_on: the member's
-- UPDATE is (status, updated_at) and nothing else, so a dated move keeps the
-- day it was given, and a different day is a different move.
--
-- IDEMPOTENT. `add column if not exists`, drop-then-add for the CHECK, and a
-- grant that is the same grant the second time; applied twice on a throwaway
-- PG 17.11 cluster (after MF1, R12, MF2, MF4 and MF3) with an empty catalogue
-- diff and checked by scripts/pg-shim/mf5-checks.sql. No CONCURRENTLY, no
-- BEGIN/COMMIT: the runner wraps the file in one transaction. The CHECK scans
-- moves when it is added (staging held 0 rows on 27 Sep; the runner prints
-- production's count after the apply).

alter table public.moves add column if not exists dated_on date;

alter table public.moves drop constraint if exists moves_dated_on_window;
-- Through `timestamp`, never `timestamptz`: the month is the date's own, not
-- the session time zone's, so the CHECK is immutable.
alter table public.moves add constraint moves_dated_on_window check (
  dated_on is null
  or (dated_on <= declared_at
      and dated_on >= (date_trunc('month', declared_at::timestamp) - interval '2 months')::date)
);

comment on column public.moves.dated_on is
  'The day the client says the change was made (Your moves'' "Date a move"). Null: dated the day it was declared, so a reader takes coalesce(dated_on, declared_at). No later than declared_at and no earlier than the first of the month two months before it (moves_dated_on_window). Read only by the market read of a move (levels, never a comparison); the Phase 1 move reading keeps declared_at. Insert-only for members, like declared_at (MF5, 20261103091000).';

-- The member's insert, beside the nine columns 20260918093000 grants. No
-- UPDATE: the member's update stays (status, updated_at).
grant insert (dated_on) on public.moves to authenticated;

-- Post-apply checks, read-only:
--   select data_type, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'moves' and column_name = 'dated_on';   -- date | YES
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'moves_dated_on_window';
--   select has_column_privilege('authenticated', 'public.moves', 'dated_on', 'insert');    -- true
--   select has_column_privilege('authenticated', 'public.moves', 'dated_on', 'update');    -- false
--   select string_agg(column_name, ', ' order by column_name) from information_schema.role_column_grants
--    where table_schema = 'public' and table_name = 'moves' and grantee = 'authenticated' and privilege_type = 'UPDATE';  -- status, updated_at
