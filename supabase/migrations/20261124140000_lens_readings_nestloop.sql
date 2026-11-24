-- lens_readings is planned generically (it is a security definer SQL function,
-- never inlined): the planner estimates the dated/depth CTEs at one row and
-- picks nested loops that re-scan whole CTEs per video. ~35 s per call for
-- Sealand's October market lens; with nested loops off every join is a hash
-- join and the same call takes ~0.6 s with identical output. A later
-- `create or replace` of this function must restate this setting.
-- Undo: alter function public.lens_readings(uuid, date, uuid, uuid[], integer, timestamp with time zone) reset enable_nestloop;
alter function public.lens_readings(uuid, date, uuid, uuid[], integer, timestamp with time zone) set enable_nestloop = off;
