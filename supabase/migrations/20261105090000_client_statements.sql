-- Your statements (pages build, package MOVES, 1 Oct): the claims a client
-- makes about itself, typed on Your moves, and how its market treats each one.
--
-- WHAT A ROW IS. `client_statements` is the client's own sentence, in its own
-- words ("Every Sealand product is a small act of defiance against waste").
-- `client_statement_readings` is one measurement of one statement over one
-- calendar month (lib/statements/measure.ts): how many of the month's market
-- videos carry talk about the idea, and whether people back it up, doubt it or
-- ask about it. The reading is written by the service role only (the operator
-- script `scripts/statements.ts --write`, the add action's measurement, and the
-- weekly run's `ask-reevaluate` step); a browser never writes one.
--
-- A STATEMENT IS RETIRED, NEVER EDITED IN PLACE. The measurement is about the
-- words, so changing them would leave a reading about a sentence nobody can
-- see any more. An edit is a retirement plus a new row (lib/actions/
-- statements.ts), the rule `subjects` keeps for a rename. So a member holds
-- INSERT on (client_id, text, created_by) and UPDATE on `retired_at` alone, and
-- the update policy only lets `retired_at` be SET: a retired statement does not
-- come back. No DELETE for members: its readings stay with it.
--
-- WHO. Every member of the tenant reads both tables; owners and admins add and
-- retire statements (`get_my_role()`, the shape `subjects` uses), and the actor
-- is pinned on the insert so one member cannot file a statement under
-- another's id.
--
-- ONE READING PER (statement, month), REPLACEABLE: the weekly run upserts the
-- month it reads, so a month under way is re-measured as its comments arrive
-- and a month that has ended keeps its last measurement. The composite foreign
-- key keeps a reading on its statement's tenant.
--
-- `statement_band()` is `subject_band()` for a sentence the caller embeds: the
-- live insights whose phrase similarity to it clears p_low, exact (no
-- distance ORDER BY, so the HNSW index is never used and nothing is cut at its
-- ef_search), one tenant by parameter, so SECURITY DEFINER and service_role
-- only (the monthly_denominators rule). It reads `audience_insights_current`,
-- as AGENTS.md requires a population read to.
--
-- ADDITIVE: two new tables and one new function; nothing existing changes.
-- Idempotent (`if not exists`, `create or replace`, drop-if-exists before each
-- policy, grants that are no-ops the second time). Applied twice on a throwaway
-- PostgreSQL 17 cluster (scripts/pg-shim/throwaway.sh twice) with an empty
-- catalogue diff. No BEGIN/COMMIT.

create table if not exists public.client_statements (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  -- The client's own words. Short on purpose: one claim, the way it says it.
  text        text not null check (char_length(trim(text)) between 3 and 200),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  retired_at  timestamptz,
  constraint client_statements_id_client unique (id, client_id)
);

comment on table public.client_statements is
  'What a client says about itself, typed on Your moves. Retired, never edited in place: the reading is about the words, so an edit is a retirement plus a new row.';

-- One live statement per sentence per tenant.
create unique index if not exists client_statements_live_text_idx
  on public.client_statements (client_id, lower(trim(text))) where retired_at is null;
create index if not exists client_statements_client_idx
  on public.client_statements (client_id, created_at);

create table if not exists public.client_statement_readings (
  statement_id uuid not null,
  client_id    uuid not null references public.clients(id) on delete cascade,
  -- The calendar month measured, its first day. A period is dated by the
  -- comment (AGENTS.md), never by the run.
  month        date not null check (month = date_trunc('month', month)::date),
  -- lib/statements/types.ts `StatementReading`: counts, the stance split, the
  -- brand split and one scrubbed sentence. No comment's words.
  data         jsonb not null,
  -- `READING_VERSION` (judge, thresholds and the stance prompt).
  version      text not null,
  cost_usd     numeric not null default 0,
  measured_at  timestamptz not null default now(),
  primary key (statement_id, month),
  constraint client_statement_readings_statement
    foreign key (statement_id, client_id)
    references public.client_statements (id, client_id) on delete cascade
);

comment on table public.client_statement_readings is
  'One measurement of one statement over one calendar month: the share of the month''s market videos that talk about it, and how people treat it. Written by the service role only.';

create index if not exists client_statement_readings_client_idx
  on public.client_statement_readings (client_id, month);

alter table public.client_statements         enable row level security;
alter table public.client_statement_readings enable row level security;

drop policy if exists "Members read their statements" on public.client_statements;
create policy "Members read their statements" on public.client_statements
  for select to authenticated using (client_id = public.get_my_client_id());

drop policy if exists "Owners and admins add statements" on public.client_statements;
create policy "Owners and admins add statements" on public.client_statements
  for insert to authenticated
  with check (
    client_id = public.get_my_client_id()
    and created_by = (select auth.uid())
    and retired_at is null
    and public.get_my_role() = any (array['owner', 'admin'])
  );

drop policy if exists "Owners and admins retire statements" on public.client_statements;
create policy "Owners and admins retire statements" on public.client_statements
  for update to authenticated
  using (
    client_id = public.get_my_client_id()
    and retired_at is null
    and public.get_my_role() = any (array['owner', 'admin'])
  )
  with check (
    client_id = public.get_my_client_id()
    and retired_at is not null
    and public.get_my_role() = any (array['owner', 'admin'])
  );

drop policy if exists "Members read their statement readings" on public.client_statement_readings;
create policy "Members read their statement readings" on public.client_statement_readings
  for select to authenticated using (client_id = public.get_my_client_id());

-- What a browser may write is the columns below and nothing else; the policies
-- above say who. The service role measures and keeps the record.
revoke all on public.client_statements         from authenticated, anon;
revoke all on public.client_statement_readings from authenticated, anon;
grant select on public.client_statements to authenticated;
grant insert (client_id, text, created_by) on public.client_statements to authenticated;
grant update (retired_at) on public.client_statements to authenticated;
grant select on public.client_statement_readings to authenticated;
grant select, insert, update, delete on public.client_statements         to service_role;
grant select, insert, update, delete on public.client_statement_readings to service_role;

-- The band: every live insight close enough to the statement to be worth a
-- decision. Pairs under p_low are the vector's answer and are not returned.
create or replace function public.statement_band(
  p_client uuid,
  p_query  vector(1536),
  p_low    float8
)
returns table (
  audience_insight_id uuid,
  score               float8
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ai.id, (1 - (ai.embedding <=> p_query))::float8 as score
  from public.audience_insights_current ai
  where ai.client_id = p_client
    and ai.embedding is not null
    and (1 - (ai.embedding <=> p_query)) >= p_low
  order by ai.id
$$;

comment on function public.statement_band(uuid, vector, float8) is
  'The live insights whose similarity to a statement (embedded by the caller) clears p_low, with the score. Exact: ordered by id, never by distance, so the HNSW index cannot cut the answer at ef_search. One tenant by parameter: service_role only.';

revoke all on function public.statement_band(uuid, vector, float8) from public, anon, authenticated;
grant execute on function public.statement_band(uuid, vector, float8) to service_role;
