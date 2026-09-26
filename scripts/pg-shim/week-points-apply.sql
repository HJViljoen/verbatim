-- scripts/week-points.ts --apply on the throwaway cluster (market-first WP3.13
-- part B): what the first --apply of a kept file wrote, and that neither table
-- can be rewritten. Run by scripts/pg-shim/week-points-apply.sh after its two
-- --apply runs (the first inserts, the second inserts nothing):
--
--   bash scripts/pg-shim/throwaway.sh check <dir> scripts/pg-shim/week-points-apply.sql
--
-- The kept file is staging's week of 31 Aug at 14 days, captured through the
-- one capture (lib/reading/week-keep.ts) over staging's real rows
-- (lib/test/week-fixture.ts: 229 market videos, 3,275 comments, median 6,
-- bands 91 · 80 · 58, 4 let in unchecked, 89 older videos; read through
-- staging's 20 Sep update b67b56de, computed 21 Sep 06:00 UTC). Every check
-- raises on failure; the transaction is rolled back, so the applied rows stay
-- for the driver's own counts.
\set ON_ERROR_STOP 1
begin;

-- 1. The first --apply wrote the file: one read with the capture's own
--    computed_at and run, its conditions, and its 128 point rows ---------------
do $$
declare
  c constant uuid := 'ac16988e-c4f3-4baf-b388-73895852a554';
  r public.week_line_reads%rowtype;
  n int; k int;
begin
  select count(*) into n from public.week_line_reads where client_id = c;
  if n <> 1 then raise exception 'apply FAILED: % reads held, expected 1', n; end if;
  select * into r from public.week_line_reads where client_id = c;
  if r.week <> date '2026-08-31' or r.age_days <> 14 or r.method_version <> 'week_line_v1' then
    raise exception 'apply FAILED: the read is keyed %, % days, %', r.week, r.age_days, r.method_version;
  end if;
  if r.computed_at <> timestamptz '2026-09-21 06:00:00+00' then
    raise exception 'apply FAILED: computed_at is %, not the capture''s 2026-09-21 06:00 UTC', r.computed_at;
  end if;
  if r.read_through_run is distinct from 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4' then
    raise exception 'apply FAILED: read_through_run is %, not the capture''s age run', r.read_through_run;
  end if;
  if r.captured_before <> timestamptz '2026-09-21 00:00:00+00' then
    raise exception 'apply FAILED: captured_before is %', r.captured_before;
  end if;
  -- recorded_at is when the row landed (this test's clock), never the capture's.
  if r.recorded_at <= r.computed_at then
    raise exception 'apply FAILED: recorded_at % is not after computed_at %', r.recorded_at, r.computed_at;
  end if;
  if (r.conditions->>'videos')::int <> 229 or (r.conditions->>'comments')::int <> 3275
     or (r.conditions->>'median_dated')::numeric <> 6 or r.conditions->'bands' <> '[91, 80, 58]'::jsonb
     or (r.conditions->>'unchecked')::int <> 4 or (r.conditions->>'older_videos')::int <> 89
     or r.conditions->'runs_after' <> '[2, 2]'::jsonb or (r.conditions->>'runs_in_week')::int <> 0
     or r.conditions->>'prompt_version' <> 'pass_a_v4.1'
     or r.conditions->>'read_through_at' <> '2026-09-20T08:33:47.358Z' then
    raise exception 'apply FAILED: the conditions are not the capture''s: %', r.conditions;
  end if;
  select count(*) into n from public.week_line_points where client_id = c and week = date '2026-08-31' and age_days = 14;
  if n <> 128 then raise exception 'apply FAILED: % point rows, expected 128 (8 audience-bands, 16 objects)', n; end if;
  select sum(p.k) into k from public.week_line_points p
   where p.client_id = c and p.object_kind = 'kind' and p.object_id = 'praise';
  -- Praise pooled over the market: 27 + 51 + 53 (lib/test/week-fixture.ts, the week of 31 Aug).
  if k <> 131 then raise exception 'apply FAILED: praise k sums to %, not 131', k; end if;
  raise notice 'ok  --apply wrote the kept file: one read with its own computed_at and run, its conditions, 128 points';
end $$;

-- 2. Neither table can be rewritten: UPDATE, DELETE and TRUNCATE refused, to the
--    service role the script writes as and to a tenant ------------------------
set local role service_role;
do $$
begin
  begin
    update public.week_line_reads set computed_at = now();
    raise exception 'append-only FAILED: service_role updated week_line_reads';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.week_line_points set k = 0;
    raise exception 'append-only FAILED: service_role updated week_line_points';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.week_line_points;
    raise exception 'append-only FAILED: service_role deleted from week_line_points';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.week_line_reads;
    raise exception 'append-only FAILED: service_role deleted from week_line_reads';
  exception when insufficient_privilege then null;
  end;
  begin
    truncate public.week_line_points;
    raise exception 'append-only FAILED: service_role truncated week_line_points';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  service_role: update, delete and truncate refused on both tables';
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin
    update public.week_line_reads set computed_at = now();
    raise exception 'append-only FAILED: a tenant updated week_line_reads';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.week_line_points;
    raise exception 'append-only FAILED: a tenant deleted from week_line_points';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  a tenant: update and delete refused';
end $$;
reset role;

rollback;
