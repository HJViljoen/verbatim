-- Checks for 20261108090000_costs.sql, run on a throwaway cluster after the
-- migration (scripts/pg-shim/throwaway.sh check <dir> this-file). Every check
-- raises on a wrong answer, so the run stops at the first one; the whole file
-- is one transaction and rolls back.
--
--   1. the seed: ten bills (each anchored on its date's day, no card number or
--      remark about the card), the two client plans once both tenants exist
--   2. no tenant reaches the tables or the functions: anon, a tenant member and
--      a platform admin's own session are all refused; the service role is not
--   3. the four read functions add up to known figures, and the spend between
--      two instants reads ai_call_log once, on its created_at index

begin;

-- ── 1. The seed ─────────────────────────────────────────────────────────────

do $$
begin
  if (select count(*) from public.cost_bills) <> 10 then
    raise exception 'seed: % bills, expected 10', (select count(*) from public.cost_bills);
  end if;
  if (select count(*) from public.cost_bills where shared) <> 1
     or not (select shared from public.cost_bills where slug = 'claude-max') then
    raise exception 'seed: Claude Max is the one shared bill';
  end if;
  if (select array_agg(slug order by slug) from public.cost_bills where usage_tracked)
     <> array['apify', 'assemblyai', 'openai-api'] then
    raise exception 'seed: usage covers exactly OpenAI, Apify and AssemblyAI';
  end if;
  if (select overdue_amount from public.cost_bills where slug = 'apify') <> 72.37
     or (select status from public.cost_bills where slug = 'apify') <> 'failing' then
    raise exception 'seed: Apify''s failed $72.37 is owed';
  end if;
  if (select count(*) from public.cost_settings) <> 1 then
    raise exception 'seed: one settings row';
  end if;
  -- every bill charges on the day of its date; a bill with no date has no day
  if exists (select 1 from public.cost_bills
             where anchor_day is distinct from extract(day from next_charge_on)::smallint) then
    raise exception 'seed: anchor_day is not the day of next_charge_on on %',
      (select array_agg(slug) from public.cost_bills where anchor_day is distinct from extract(day from next_charge_on)::smallint);
  end if;
  if (select anchor_day from public.cost_bills where slug = 'verbatimintel') <> 30 then
    raise exception 'seed: the domain renews on the 30th';
  end if;
  -- the business's facts only: no card number, no remark about the card's funds
  if exists (select 1 from public.cost_bills
             where payment_method ~ '[0-9•]' or notes ~* 'insufficient|declin|funds|mastercard|visa|card [0-9]|•') then
    raise exception 'seed: personal card details in %',
      (select array_agg(slug) from public.cost_bills
       where payment_method ~ '[0-9•]' or notes ~* 'insufficient|declin|funds|mastercard|visa|card [0-9]|•');
  end if;
  -- No tenants in this cluster, so no plans yet.
  if (select count(*) from public.cost_client_plans) <> 0 then
    raise exception 'seed: plans without their clients';
  end if;
end $$;

-- With the two tenants present, the seed adds their plans, once.
insert into public.clients (id, company_name) values
  ('e52cac94-30e1-426a-9a36-31b11e0b30b6', 'Össur'),
  ('ac16988e-c4f3-4baf-b388-73895852a554', 'Sealand');
\ir ../../supabase/migrations/20261108090000_costs.sql
\ir ../../supabase/migrations/20261108090000_costs.sql

do $$
begin
  if (select count(*) from public.cost_client_plans) <> 2 then
    raise exception 'seed: % plans, expected 2', (select count(*) from public.cost_client_plans);
  end if;
  if (select (stage, price, currency, unpaid_amount)::text from public.cost_client_plans
      where client_id = 'e52cac94-30e1-426a-9a36-31b11e0b30b6') <> '(paying,205.00,USD,1025.00)' then
    raise exception 'seed: Össur pays $205 and owes $1,025';
  end if;
  if (select (stage, price, currency, trial_ends_on)::text from public.cost_client_plans
      where client_id = 'ac16988e-c4f3-4baf-b388-73895852a554') <> '(trial,3500.00,ZAR,2026-10-13)' then
    raise exception 'seed: Sealand is on trial at R3,500 until 13 Oct';
  end if;
  if (select count(*) from public.cost_bills) <> 10 then
    raise exception 'seed: a re-run added bills';
  end if;
end $$;

-- A prospect has a name and no client; a client never has the prospect stage.
-- A bill's anchor is a day of the month.
do $$
begin
  begin
    insert into public.cost_bills (name, anchor_day) values ('Day 32', 32);
    raise exception 'an anchor day of 32 was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.cost_client_plans (stage, price) values ('prospect', 100);
    raise exception 'a nameless prospect was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.cost_client_plans (client_id, stage) values ('ac16988e-c4f3-4baf-b388-73895852a554', 'prospect');
    raise exception 'a client with the prospect stage was accepted';
  exception when check_violation or unique_violation then null;
  end;
  insert into public.cost_client_plans (name, stage, price, currency) values ('Prospect Co', 'prospect', 300, 'USD');
end $$;

-- ── 2. No tenant reaches any of it ──────────────────────────────────────────

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000ff', 'operator@verbatim.test'),
  ('a0000000-0000-0000-0000-00000000000a', 'member@tenant.test');
insert into public.users (id, client_id, full_name, email, role) values
  ('a0000000-0000-0000-0000-0000000000ff', 'e52cac94-30e1-426a-9a36-31b11e0b30b6', 'Operator', 'operator@verbatim.test', 'owner'),
  ('a0000000-0000-0000-0000-00000000000a', 'e52cac94-30e1-426a-9a36-31b11e0b30b6', 'Member', 'member@tenant.test', 'owner');
insert into public.platform_admins (user_id) values ('a0000000-0000-0000-0000-0000000000ff');

create or replace function pg_temp.refused(p_sql text) returns boolean language plpgsql as $f$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $f$;

create temp table refusals (who text, what text, refused boolean);
grant all on refusals to anon, authenticated;
grant execute on function pg_temp.refused(text) to anon, authenticated;

-- anon
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
insert into refusals select 'anon', s, pg_temp.refused(s) from unnest(array[
  'select * from public.cost_bills',
  'select * from public.cost_client_plans',
  'select * from public.cost_settings',
  'update public.cost_settings set usd_zar = 1',
  'select * from public.cost_usage_by_month(6)',
  'select * from public.cost_spend_between(now() - interval ''1 day'')',
  'select * from public.cost_recent_runs(15)',
  'select * from public.cost_per_run_by_client(3)'
]) s;
reset role;

-- a tenant owner, and the platform admin's own browser session: the page goes
-- through the service role, so even the operator's JWT reads nothing here
set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
insert into refusals select 'tenant', s, pg_temp.refused(s) from unnest(array[
  'select * from public.cost_bills',
  'select * from public.cost_client_plans',
  'select * from public.cost_settings',
  'insert into public.cost_bills (name) values (''x'')',
  'delete from public.cost_client_plans',
  'select * from public.cost_usage_by_month(6)',
  'select * from public.cost_spend_between(now() - interval ''1 day'')',
  'select * from public.cost_recent_runs(15)',
  'select * from public.cost_per_run_by_client(3)'
]) s;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-0000000000ff", "role": "authenticated"}';
insert into refusals select 'operator-jwt', s, pg_temp.refused(s) from unnest(array[
  'select * from public.cost_bills',
  'select * from public.cost_client_plans',
  'select * from public.cost_usage_by_month(6)'
]) s;
reset role;

do $$
declare r record;
begin
  for r in select * from refusals where not refused loop
    raise exception 'not refused: % ran %', r.who, r.what;
  end loop;
  if (select count(*) from refusals) <> 20 then
    raise exception 'refusals: % rows, expected 20', (select count(*) from refusals);
  end if;
end $$;

-- the service role reads all of it
set local role service_role;
do $$
begin
  if (select count(*) from public.cost_bills) <> 10 then raise exception 'service role: bills'; end if;
  if (select count(*) from public.cost_client_plans) <> 3 then raise exception 'service role: plans'; end if;
  perform * from public.cost_usage_by_month(6);
  perform * from public.cost_spend_between(now() - interval '1 day');
  perform * from public.cost_recent_runs(15);
  perform * from public.cost_per_run_by_client(3);
end $$;
reset role;

-- ── 3. The read functions add up ────────────────────────────────────────────
-- Össur: four runs this month. r1..r3 are full (Apify spent), r4 is the
-- newest and gathered nothing (apify_usd 0), so the per-run average is r1..r3.
-- r1 predates apify_runs (no rows of its own): its run_costs.apify_usd counts
-- as Apify spend. r2 and r3 have apify_runs rows, and their run_costs figure
-- must NOT count a second time. One apify_runs row has no run (a snapshot).

insert into public.pipeline_runs (id, client_id, status, started_at) values
  ('11111111-0000-0000-0000-000000000001', 'e52cac94-30e1-426a-9a36-31b11e0b30b6', 'completed', date_trunc('month', now()) + interval '1 hour'),
  ('11111111-0000-0000-0000-000000000002', 'e52cac94-30e1-426a-9a36-31b11e0b30b6', 'completed', date_trunc('month', now()) + interval '2 hours'),
  ('11111111-0000-0000-0000-000000000003', 'e52cac94-30e1-426a-9a36-31b11e0b30b6', 'completed', date_trunc('month', now()) + interval '3 hours'),
  ('11111111-0000-0000-0000-000000000004', 'e52cac94-30e1-426a-9a36-31b11e0b30b6', 'completed', date_trunc('month', now()) + interval '4 hours'),
  -- ten months back: outside every window
  ('11111111-0000-0000-0000-000000000009', 'ac16988e-c4f3-4baf-b388-73895852a554', 'completed', now() - interval '10 months');

insert into public.run_costs (run_id, client_id, openai_usd, transcribe_usd, apify_usd, apify_attribution) values
  ('11111111-0000-0000-0000-000000000001', 'e52cac94-30e1-426a-9a36-31b11e0b30b6', 4, 0.20, 6,  'ambiguous'),
  ('11111111-0000-0000-0000-000000000002', 'e52cac94-30e1-426a-9a36-31b11e0b30b6', 5, 0.10, 7,  'exact'),
  ('11111111-0000-0000-0000-000000000003', 'e52cac94-30e1-426a-9a36-31b11e0b30b6', 3, 0.30, 8,  'exact'),
  ('11111111-0000-0000-0000-000000000004', 'e52cac94-30e1-426a-9a36-31b11e0b30b6', 2, 0,    0,  'exact'),
  ('11111111-0000-0000-0000-000000000009', 'ac16988e-c4f3-4baf-b388-73895852a554', 9, 1,    20, 'exact');

insert into public.apify_runs (client_id, run_id, actor_id, apify_run_id, usage_usd, started_at) values
  ('e52cac94-30e1-426a-9a36-31b11e0b30b6', '11111111-0000-0000-0000-000000000002', 'a', 'ap-2a', 3, date_trunc('month', now()) + interval '2 hours'),
  ('e52cac94-30e1-426a-9a36-31b11e0b30b6', '11111111-0000-0000-0000-000000000002', 'a', 'ap-2b', 4, date_trunc('month', now()) + interval '2 hours'),
  ('e52cac94-30e1-426a-9a36-31b11e0b30b6', '11111111-0000-0000-0000-000000000003', 'a', 'ap-3',  8, date_trunc('month', now()) + interval '3 hours'),
  ('e52cac94-30e1-426a-9a36-31b11e0b30b6', null,                                   'a', 'ap-s',  0.5, date_trunc('month', now()) + interval '5 hours'),
  ('ac16988e-c4f3-4baf-b388-73895852a554', '11111111-0000-0000-0000-000000000009', 'a', 'ap-9',  20, now() - interval '10 months');

insert into public.ai_call_log (client_id, run_id, pass, model, request, cost_usd, created_at) values
  ('e52cac94-30e1-426a-9a36-31b11e0b30b6', null, 'pass_a',     'gpt-4.1',      '{}', 10,   date_trunc('month', now()) + interval '1 hour'),
  ('e52cac94-30e1-426a-9a36-31b11e0b30b6', null, 'transcribe', 'whisper-1',    '{}', 0.40, date_trunc('month', now()) + interval '1 hour'),
  ('e52cac94-30e1-426a-9a36-31b11e0b30b6', null, 'transcribe', 'apify_speech', '{}', 0.20, date_trunc('month', now()) + interval '1 hour'),
  (null,                                   null, 'ask',        'gpt-4.1-mini', '{}', 1,    date_trunc('month', now()) + interval '1 hour'),
  ('ac16988e-c4f3-4baf-b388-73895852a554', null, 'pass_a',     'gpt-4.1',      '{}', 99,   now() - interval '10 months');

set local role service_role;
do $$
declare
  v numeric;
begin
  -- by month: this month only (the old rows are outside six months)
  if (select count(distinct month) from public.cost_usage_by_month(6)) <> 1 then
    raise exception 'usage: months %', (select array_agg(distinct month) from public.cost_usage_by_month(6));
  end if;
  select usd into v from public.cost_usage_by_month(6) where vendor = 'openai' and client_name = 'Össur';
  if v <> 10 then raise exception 'usage: Össur openai %, expected 10', v; end if;
  select usd into v from public.cost_usage_by_month(6) where vendor = 'openai' and client_id is null;
  if v <> 1 then raise exception 'usage: unattributed openai %, expected 1', v; end if;
  select usd into v from public.cost_usage_by_month(6) where vendor = 'transcripts' and client_name = 'Össur';
  if v <> 0.6 then raise exception 'usage: Össur transcripts %, expected 0.60', v; end if;
  -- Apify: r1's 6 (no apify_runs rows) + r2's 3 + 4 + r3's 8 + the snapshot's 0.5 = 21.5;
  -- r2's and r3's run_costs figures (7, 8) are not counted again
  select usd into v from public.cost_usage_by_month(6) where vendor = 'apify' and client_name = 'Össur';
  if v <> 21.5 then raise exception 'usage: Össur apify %, expected 21.50', v; end if;
  -- twelve months reach the old Sealand rows
  if (select count(distinct month) from public.cost_usage_by_month(12)) <> 2 then
    raise exception 'usage: twelve months should see two';
  end if;

  -- per run: r1..r3 (r4 spent nothing on Apify); (10.2 + 12.1 + 11.3) / 3 = 11.2
  select total_usd into v from public.cost_per_run_by_client(3) where client_id = 'e52cac94-30e1-426a-9a36-31b11e0b30b6';
  if v <> 11.2 then raise exception 'per run: Össur %, expected 11.2000', v; end if;
  select apify_usd into v from public.cost_per_run_by_client(3) where client_id = 'e52cac94-30e1-426a-9a36-31b11e0b30b6';
  if v <> 7 then raise exception 'per run: Össur apify %, expected 7', v; end if;
  -- the last two full runs: r2, r3
  select total_usd into v from public.cost_per_run_by_client(2) where client_id = 'e52cac94-30e1-426a-9a36-31b11e0b30b6';
  if v <> 11.7 then raise exception 'per run (2): Össur %, expected 11.7000', v; end if;

  -- recent runs: newest first, the client's name joined, the total summed
  if (select run_id from public.cost_recent_runs(15) limit 1) <> '11111111-0000-0000-0000-000000000004' then
    raise exception 'recent: newest first';
  end if;
  if (select count(*) from public.cost_recent_runs(2)) <> 2 then raise exception 'recent: the limit'; end if;
  select total_usd into v from public.cost_recent_runs(15) where run_id = '11111111-0000-0000-0000-000000000002';
  if v <> 12.1 then raise exception 'recent: r2 total %, expected 12.10', v; end if;
  if (select client_name from public.cost_recent_runs(15) where run_id = '11111111-0000-0000-0000-000000000009') <> 'Sealand' then
    raise exception 'recent: the client name';
  end if;

  -- between: since the month began
  select usd into v from public.cost_spend_between(date_trunc('month', now())) where vendor = 'openai';
  if v <> 11 then raise exception 'between: openai %, expected 11', v; end if;
  -- transcripts: whisper-1's 0.40 and the speech path's content check, 0.20:
  -- both OpenAI tokens, so both burn the credit
  select usd into v from public.cost_spend_between(date_trunc('month', now())) where vendor = 'transcripts';
  if v <> 0.6 then raise exception 'between: transcripts %, expected 0.60', v; end if;
  if exists (select 1 from public.cost_spend_between(date_trunc('month', now())) where vendor not in ('openai', 'transcripts', 'apify')) then
    raise exception 'between: a vendor beyond openai, transcripts and apify';
  end if;
  select usd into v from public.cost_spend_between(date_trunc('month', now())) where vendor = 'apify';
  if v <> 21.5 then raise exception 'between: apify %, expected 21.50', v; end if;
  -- an empty window is zeros, not nulls or no rows
  if (select count(*) from public.cost_spend_between(now() + interval '1 day', now() + interval '2 days') where usd = 0) <> 3 then
    raise exception 'between: an empty window';
  end if;
end $$;
reset role;

-- One read of ai_call_log in the spend between two instants (it was three),
-- and the ranges have an index on created_at.
do $$
declare
  body text := pg_get_functiondef('public.cost_spend_between(timestamptz, timestamptz)'::regprocedure);
begin
  if (length(body) - length(replace(body, 'public.ai_call_log', ''))) / length('public.ai_call_log') <> 1 then
    raise exception 'between: ai_call_log is read more than once';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'ai_call_log'
                 and indexname = 'ai_call_log_created_at_idx' and indexdef like '%(created_at)') then
    raise exception 'no index on ai_call_log (created_at)';
  end if;
end $$;

select 'costs checks: ok' as result;

rollback;
