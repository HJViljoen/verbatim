-- Costs (operator only, 2026-10-09): what Verbatim costs to run, and a plan.
--
-- Heinrich tracked the bills in a side file and worked the variable spend out
-- by hand in SQL. This puts both inside the app, on /dashboard/ops/costs, for
-- the platform admin alone (`platform_admins`, the Readiness page's gate).
--
-- THREE TABLES, NONE OF THEM A TENANT'S. Bills are Verbatim's own (Supabase,
-- Apify, the domain); a client plan is what a client PAYS Verbatim, which no
-- client may read about another or about itself here; the settings row holds
-- the exchange rates and the planning extras. RLS is ON with NO policy, so an
-- anon or authenticated session reads and writes nothing, and the grants are
-- revoked as well, so PostgREST does not even list the tables to a tenant.
-- The page reads and writes through the service role, on the server, after
-- `isPlatformAdmin` (lib/costs/access.ts).
--
-- FOUR READ FUNCTIONS, executable by the service role only. They aggregate in
-- SQL so no read pulls ai_call_log rows across the wire (the 1000-row cap,
-- AGENTS.md); each returns tens of rows. All four only SELECT. A page load
-- reads ai_call_log three times (by month once, between twice), each a range
-- on created_at, which gets its own index here.
--
-- ADDITIVE ONLY. Nothing existing is altered but for that one index; the
-- pipeline does not read any of this, so the migration can be applied ahead of
-- the code deploy.

-- ── Bills ───────────────────────────────────────────────────────────────────

create table if not exists public.cost_bills (
  id uuid primary key default gen_random_uuid(),
  -- The seed's file name ('apify', 'claude-max'): what makes the seed safe to
  -- re-run. Null for a bill added on the page.
  slug text unique,
  name text not null check (length(btrim(name)) > 0),
  what text,
  category text,
  -- Null = not known yet (Inngest, Resend). The forecast counts it as zero and
  -- the page says "not known".
  amount numeric(12,2) check (amount is null or amount >= 0),
  currency text not null default 'USD' check (currency in ('USD', 'ZAR', 'EUR')),
  cadence text not null default 'monthly'
    check (cadence in ('monthly', 'yearly', 'two_yearly', 'usage')),
  next_charge_on date,
  -- The day of the month it charges on. A short month clamps next_charge_on
  -- (a bill on the 31st shows 30 Nov), so the day is kept apart and the next
  -- cycle lands on it again (31 Dec). Null = the day of next_charge_on.
  anchor_day smallint check (anchor_day is null or anchor_day between 1 and 31),
  status text not null default 'active'
    check (status in ('active', 'watch', 'failing', 'paused', 'ended')),
  -- What is owed on a charge that failed, in the bill's currency.
  overdue_amount numeric(12,2) not null default 0 check (overdue_amount >= 0),
  payment_method text,
  notes text,
  is_estimate boolean not null default false,
  -- Shared with Heinrich's other projects (Claude Max): counted in the
  -- forecast only while cost_settings.count_shared is on.
  shared boolean not null default false,
  -- The live usage figures already cover this bill (OpenAI, Apify,
  -- AssemblyAI), so the fixed-cost forecast leaves it out.
  usage_tracked boolean not null default false,
  manage_url text,
  last_paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cost_bills is
  'Verbatim''s own recurring costs (operator only; /dashboard/ops/costs). RLS on with no policy: the service role alone reads or writes.';

-- ── Client plans ────────────────────────────────────────────────────────────
-- Only what the database does not already hold. Cadence comes from
-- tracking_configs.report_period and the trial date from clients.trial_ends_at
-- where they say something; the columns here are what they cannot say:
--   price / currency / unpaid / note  -- nothing in the schema holds them
--   stage                             -- both tenants are `design_partner` and
--                                        comped, which does not say who pays
--   trial_ends_on                     -- clients.trial_ends_at is null on both;
--                                        writing it there would arm the app's
--                                        trial gate, so the plan keeps its own
--   cadence                           -- null = follow the schedule; set only
--                                        to plan another rhythm (every 2 weeks
--                                        has no report_period value)
--   cost_per_run_usd                  -- null = the measured average
-- A prospect is a row with no client_id: a name, a price and a guessed cost.

create table if not exists public.cost_client_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique references public.clients(id) on delete cascade,
  name text,
  stage text not null default 'paying' check (stage in ('paying', 'trial', 'prospect')),
  price numeric(12,2) not null default 0 check (price >= 0),
  currency text not null default 'USD' check (currency in ('USD', 'ZAR', 'EUR')),
  unpaid_amount numeric(12,2) not null default 0 check (unpaid_amount >= 0),
  note text,
  trial_ends_on date,
  cadence text check (cadence is null or cadence in ('weekly', 'fortnightly', 'monthly', 'none')),
  cost_per_run_usd numeric(10,2) check (cost_per_run_usd is null or cost_per_run_usd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A prospect has a name and no client; a client has no prospect stage.
  constraint cost_client_plans_prospect_shape check (
    (client_id is null and stage = 'prospect' and name is not null and length(btrim(name)) > 0)
    or (client_id is not null and stage <> 'prospect')
  )
);

comment on table public.cost_client_plans is
  'What each client pays Verbatim, and prospects to plan with (operator only). RLS on with no policy: the service role alone reads or writes.';

-- ── Assumptions ─────────────────────────────────────────────────────────────
-- One row (id is always true). The page edits every column.

create table if not exists public.cost_settings (
  id boolean primary key default true check (id),
  usd_zar numeric(8,4) not null default 16.62 check (usd_zar > 0),
  eur_zar numeric(8,4) not null default 18.63 check (eur_zar > 0),
  -- OpenAI spend outside the pipeline's log (gbrain and tests share the key).
  extra_openai_usd numeric(10,2) not null default 17 check (extra_openai_usd >= 0),
  -- Apify spend outside a pipeline run's own (snapshots, tests).
  extra_apify_usd numeric(10,2) not null default 7.50 check (extra_apify_usd >= 0),
  apify_plan_usd numeric(10,2) not null default 29 check (apify_plan_usd >= 0),
  apify_cap_usd numeric(10,2) not null default 200 check (apify_cap_usd >= 0),
  -- Apify's billing cycle starts on this day of the month (9th to 8th).
  apify_cycle_day smallint not null default 9 check (apify_cycle_day between 1 and 28),
  openai_balance_usd numeric(10,2) check (openai_balance_usd is null or openai_balance_usd >= 0),
  openai_balance_on date,
  count_shared boolean not null default true,
  count_prospects boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.cost_settings is
  'The Costs page''s assumptions, one row (operator only). RLS on with no policy: the service role alone reads or writes.';

-- ── Lock them to the server ─────────────────────────────────────────────────

alter table public.cost_bills enable row level security;
alter table public.cost_client_plans enable row level security;
alter table public.cost_settings enable row level security;

revoke all on table public.cost_bills, public.cost_client_plans, public.cost_settings from anon, authenticated;
grant all on table public.cost_bills, public.cost_client_plans, public.cost_settings to service_role;

-- ── Read functions ──────────────────────────────────────────────────────────
-- Months are calendar months in Africa/Johannesburg time.

-- Spend by month, vendor and client over the last `p_months` months (this one
-- included). OpenAI = ai_call_log except transcription; transcripts = the
-- transcribe pass (whisper-1, and the content check on Apify's speech path:
-- OpenAI tokens both, the actor's own spend being apify_runs'); Apify =
-- apify_runs, plus run_costs.apify_usd for runs from before apify_runs existed
-- (no rows of their own), so nothing is counted twice.
create or replace function public.cost_usage_by_month(p_months int default 6)
returns table (month date, vendor text, client_id uuid, client_name text, usd numeric)
language sql stable
set search_path = public, pg_temp
as $$
  with bounds as (
    select (date_trunc('month', now() at time zone 'Africa/Johannesburg')
            - make_interval(months => greatest(least(p_months, 24), 1) - 1))
           at time zone 'Africa/Johannesburg' as since
  ),
  ai as (
    select date_trunc('month', l.created_at at time zone 'Africa/Johannesburg')::date as month,
           case when l.pass = 'transcribe' then 'transcripts' else 'openai' end as vendor,
           l.client_id,
           sum(l.cost_usd) as usd
    from public.ai_call_log l, bounds b
    where l.created_at >= b.since and l.cost_usd is not null
    group by 1, 2, 3
  ),
  ap as (
    select date_trunc('month', coalesce(r.started_at, r.created_at) at time zone 'Africa/Johannesburg')::date,
           'apify', r.client_id, sum(r.usage_usd)
    from public.apify_runs r, bounds b
    where coalesce(r.started_at, r.created_at) >= b.since and r.usage_usd is not null
    group by 1, 2, 3
  ),
  ap_old as (
    select date_trunc('month', p.started_at at time zone 'Africa/Johannesburg')::date,
           'apify', rc.client_id, sum(rc.apify_usd)
    from public.run_costs rc
    join public.pipeline_runs p on p.id = rc.run_id
    cross join bounds b
    where p.started_at >= b.since and rc.apify_usd is not null
      and not exists (select 1 from public.apify_runs r where r.run_id = rc.run_id)
    group by 1, 2, 3
  )
  select u.month, u.vendor, u.client_id, c.company_name as client_name, round(sum(u.usd), 4) as usd
  from (select * from ai union all select * from ap union all select * from ap_old) u
  left join public.clients c on c.id = u.client_id
  group by u.month, u.vendor, u.client_id, c.company_name
  order by u.month, u.vendor, c.company_name nulls last
$$;

-- Spend between two instants, by vendor: the OpenAI credit runway (since the
-- balance was read: openai + transcripts, every row of both being OpenAI
-- tokens) and the Apify cycle (since the cycle began). ai_call_log is read
-- once, both figures filtered out of the one pass.
create or replace function public.cost_spend_between(p_from timestamptz, p_to timestamptz default now())
returns table (vendor text, usd numeric)
language sql stable
set search_path = public, pg_temp
as $$
  with ai as (
    select coalesce(sum(l.cost_usd) filter (where l.pass <> 'transcribe'), 0) as openai,
           coalesce(sum(l.cost_usd) filter (where l.pass = 'transcribe'), 0) as transcripts
    from public.ai_call_log l
    where l.created_at >= p_from and l.created_at < p_to
  )
  select v.vendor, v.usd
  from ai cross join lateral (values ('openai', ai.openai), ('transcripts', ai.transcripts)) as v(vendor, usd)
  union all
  select 'apify', coalesce((
    select sum(r.usage_usd) from public.apify_runs r
    where coalesce(r.started_at, r.created_at) >= p_from and coalesce(r.started_at, r.created_at) < p_to
  ), 0) + coalesce((
    select sum(rc.apify_usd) from public.run_costs rc
    join public.pipeline_runs p on p.id = rc.run_id
    where p.started_at >= p_from and p.started_at < p_to
      and not exists (select 1 from public.apify_runs r where r.run_id = rc.run_id)
  ), 0)
$$;

-- The newest runs with their cost (run_costs is written at close-run).
create or replace function public.cost_recent_runs(p_limit int default 15)
returns table (
  run_id uuid, client_id uuid, client_name text, started_at timestamptz, status text,
  openai_usd numeric, transcribe_usd numeric, apify_usd numeric, total_usd numeric,
  apify_attribution text
)
language sql stable
set search_path = public, pg_temp
as $$
  select p.id, p.client_id, c.company_name, p.started_at, p.status,
         rc.openai_usd, rc.transcribe_usd, rc.apify_usd,
         rc.openai_usd + rc.transcribe_usd + coalesce(rc.apify_usd, 0),
         rc.apify_attribution
  from public.pipeline_runs p
  join public.run_costs rc on rc.run_id = p.id
  left join public.clients c on c.id = p.client_id
  order by p.started_at desc
  limit greatest(least(p_limit, 100), 1)
$$;

-- Each client's cost per run: the average of its last `p_runs` FULL runs, a
-- full run being one that spent on Apify (apify_usd > 0). A re-analysis or a
-- rehearsal gathers nothing and would pull the average down.
create or replace function public.cost_per_run_by_client(p_runs int default 3)
returns table (
  client_id uuid, runs int, openai_usd numeric, transcribe_usd numeric, apify_usd numeric,
  total_usd numeric, last_run_at timestamptz
)
language sql stable
set search_path = public, pg_temp
as $$
  with fr as (
    select rc.client_id, p.started_at, rc.openai_usd, rc.transcribe_usd, rc.apify_usd,
           row_number() over (partition by rc.client_id order by p.started_at desc) as rn
    from public.run_costs rc
    join public.pipeline_runs p on p.id = rc.run_id
    where rc.apify_usd > 0
  )
  select client_id, count(*)::int,
         round(avg(openai_usd), 4), round(avg(transcribe_usd), 4), round(avg(apify_usd), 4),
         round(avg(openai_usd + transcribe_usd + apify_usd), 4),
         max(started_at)
  from fr
  where rn <= greatest(least(p_runs, 20), 1)
  group by client_id
$$;

-- Every read above is a range on ai_call_log.created_at, which had no index.
-- Built in the migration's transaction, not CONCURRENTLY: the table is small,
-- so the write lock it takes is brief.
create index if not exists ai_call_log_created_at_idx on public.ai_call_log (created_at);

revoke all on function public.cost_usage_by_month(int) from public, anon, authenticated;
revoke all on function public.cost_spend_between(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.cost_recent_runs(int) from public, anon, authenticated;
revoke all on function public.cost_per_run_by_client(int) from public, anon, authenticated;
grant execute on function public.cost_usage_by_month(int) to service_role;
grant execute on function public.cost_spend_between(timestamptz, timestamptz) to service_role;
grant execute on function public.cost_recent_runs(int) to service_role;
grant execute on function public.cost_per_run_by_client(int) to service_role;

-- ── Seed ────────────────────────────────────────────────────────────────────
-- From the bills tracker of 9 Oct 2026: the "Verbatim stack" group, the
-- verbatimintel.com domain, and Claude Max (shared with the other projects).
-- Personal, receptionist and other-domain items stay out, and so do card
-- numbers and remarks about the card that pays: what is kept is the
-- business's own (amounts, dates, status, what is owed). Each anchor_day is
-- the day of its next_charge_on. Re-runnable: a slug or a client that already
-- has a row is left alone.

insert into public.cost_settings (id) values (true) on conflict (id) do nothing;

insert into public.cost_bills
  (slug, name, what, category, amount, currency, cadence, next_charge_on, anchor_day, status, overdue_amount,
   payment_method, is_estimate, shared, usage_tracked, manage_url, notes)
values
  ('apify', 'Apify Starter', 'Scrapers for the Verbatim pipeline', 'Verbatim stack',
   72.37, 'USD', 'monthly', '2026-11-09', 9, 'failing', 72.37,
   'Card', true, false, true, 'https://console.apify.com/billing',
   $n$Apify's 9 Oct invoice (#202610090288, $72.37) failed to collect and is still owed. Pay it from the billing page.

The bill is the $29 plan plus usage over $29. Usage: Jul $16.58 · Aug $58.24 · Sep $72.37, and it's rising. The Reddit and Instagram scrapers were ~$55 of September. Hard cap is $200/mo. Billing cycle runs 9th to 8th.$n$),

  ('assemblyai', 'AssemblyAI', 'Video transcription for Verbatim', 'Verbatim stack',
   null, 'USD', 'usage', null, null, 'active', 0,
   null, false, false, true, 'https://www.assemblyai.com/app/account',
   $n$Pay as you go. Spend not checked yet: the account API returned nothing.$n$),

  ('google-workspace', 'Google Workspace', 'Business Standard, 1 seat: heinrichviljoen@verbatimintel.com', 'Verbatim stack',
   14, 'EUR', 'monthly', '2026-11-01', 1, 'active', 0,
   'Card', true, false, false, 'https://admin.google.com/ac/billing',
   $n$Billed on the 1st for the month before. ~€12.17 + 15% VAT, worked back from the first invoice. Trial ended 24 Sep.

The 1 Oct charge failed to collect; €3.27 was paid on 6 Oct.

You're on Standard, not the Starter plan your notes said you chose. Starter costs about half as much.$n$),

  ('inngest', 'Inngest', 'Verbatim''s background jobs', 'Verbatim stack',
   null, 'USD', 'monthly', null, null, 'active', 0,
   null, false, false, false, 'https://app.inngest.com/billing',
   $n$Plan not checked yet: the keys only live on Vercel. The free tier has a monthly run cap, and the every-5-minutes job makes ~8,600 runs a month. No billing emails found, so probably free.$n$),

  ('openai-api', 'OpenAI API', 'Verbatim pipeline + gbrain (they share one key)', 'Verbatim stack',
   90, 'USD', 'usage', null, null, 'active', 0,
   'Card', true, false, true, 'https://platform.openai.com/settings/organization/billing/overview',
   $n$Prepaid credit, topped up with $11.50–34.50 (VAT incl.) whenever the balance drops to $3. Last 30 days: $109.25 · last 60 days: $143.75. Top-ups so far: 17 Aug $11.50 · 29 Aug $11.50 · 2 Sep $11.50 · 9 Sep $11.50 · 10 Sep $11.50 · 12 Sep $11.50 · 16 Sep $23 · 26 Sep $17.25 · 4 Oct $34.50.

They look manual. Verbatim runs failed with 'no credits' on 10 and 15 Sep, so auto-recharge would stop those failures.$n$),

  ('resend', 'Resend', 'Verbatim''s report emails', 'Verbatim stack',
   null, 'USD', 'monthly', null, null, 'active', 0,
   null, false, false, false, 'https://resend.com/settings/billing',
   $n$Plan not checked yet. No billing emails found, so probably free.$n$),

  ('supabase', 'Supabase Pro', 'Verbatim database (org SMA)', 'Verbatim stack',
   25, 'USD', 'monthly', '2026-10-16', 16, 'active', 0,
   'Card', false, false, false, 'https://supabase.com/dashboard/org/geubffosnklmcznrfnur/billing',
   $n$The 16 Oct bill will be about $31–33. It includes ~$6–8 for the phase1-staging test database, which ran 20 Sep–9 Oct and was paused on 9 Oct. That branch can be deleted to remove it completely.

Capslock has its own free org: $0, auto-paused 7 Oct after a week idle. The 16 Sep payment wasn't confirmed by a receipt email.$n$),

  ('vercel', 'Vercel Hobby', 'Hosting for Verbatim, Capslock, receptionist, farmbook', 'Verbatim stack',
   0, 'USD', 'monthly', null, null, 'watch', 0,
   'Free plan', false, false, false, 'https://vercel.com/hjviljoens-projects/~/usage',
   $n$Free, but you've hit the free limits: compute (4 h) on 27 Sep and function storage (10 GB) on 4 Oct. Vercel says it pauses projects that go over. All sites were still up on 9 Oct.

Pro is $20/mo per seat. You'd need it anyway because Hobby doesn't allow commercial use, and you invoice Össur. Likely cause of the compute use: Verbatim's background job that runs every 5 minutes.$n$),

  ('verbatimintel', 'verbatimintel.com', 'Domain at GoDaddy (2-year term)', 'Domains',
   848.70, 'ZAR', 'two_yearly', '2028-06-30', 30, 'active', 0,
   'Card', true, false, false, 'https://account.godaddy.com/products',
   $n$Paid R580.08 on 30 Jun 2026 for 2 years. Renews at R738 + VAT (≈ R848.70).$n$),

  ('claude-max', 'Claude Max 5x', 'Personal Claude plan: Claude Code, agents, the PA bot', 'AI & tools',
   115, 'USD', 'monthly', '2026-10-14', 14, 'watch', 0,
   'Card', false, true, false, 'https://claude.ai/settings/billing',
   $n$Shared with Heinrich's other projects, not Verbatim's alone. The forecast counts it while "Count shared bills" is on.

Tracked as Max 5x from 9 Oct: $100 + 15% VAT = $115. You're switching down from 20x.

Until you make the switch at claude.ai/settings/billing (Adjust plan, then Max 5x), the account stays on 20x and charges $230 instead of $115. Switch before 14 Oct to get the lower price on this renewal.

History: upgraded Max 5x to 20x on 14 Sep, which moved billing to the 14th.$n$)
on conflict (slug) do nothing;

-- Össur pays $205 a month and owes invoices 0002 and 0003; Sealand is on a
-- free trial at R3,500 a month once it converts. Inserted through the clients
-- table so a database without these two tenants simply gets no rows.
insert into public.cost_client_plans (client_id, stage, price, currency, unpaid_amount, note, trial_ends_on)
select c.id, s.stage, s.price, s.currency, s.unpaid, s.note, s.trial_ends_on
from (values
  ('e52cac94-30e1-426a-9a36-31b11e0b30b6'::uuid, 'paying', 205.00, 'USD', 1025.00,
   'Invoices 0002 ($205) and 0003 ($820) are unpaid.', null::date),
  ('ac16988e-c4f3-4baf-b388-73895852a554'::uuid, 'trial', 3500.00, 'ZAR', 0.00,
   'Free trial until 13 Oct 2026; it may be extended. R3,500 a month once it converts.', '2026-10-13'::date)
) as s(client_id, stage, price, currency, unpaid, note, trial_ends_on)
join public.clients c on c.id = s.client_id
on conflict (client_id) do nothing;
