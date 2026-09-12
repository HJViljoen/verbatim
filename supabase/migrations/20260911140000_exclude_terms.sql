-- Exclusions: one mechanism for the homonym class (WP5, 2026-09-11).
--
-- Two real cases, both live:
--   * Cotopaxi is a bag/apparel brand AND a volcano in Ecuador. Searches on the
--     name drag in hiking vlogs, hostel promos and a mineral-water label.
--   * Sealand is a bag brand AND a global container-shipping line, so Sealand's
--     tracked conversation picked up Tunl (a Cape Town shipping company) and
--     Maersk freight content — the "Tunl-tagged-client video" backlog item.
--
-- Meaning of a term here: "when a match is really about this, it is not about
-- us." NOT a blanket text denylist. A comment that says "not the volcano, the
-- jacket" must survive, which is why the relevance gate stays an LLM judgment
-- with these as explicit hints (lib/gather/relevance.ts) and the substring
-- tagger only drops a match whose ONLY evidence is the bare name
-- (excludedByTerms, lib/gather/tagging.ts).
--
-- Client-editable, like competitor_names: a tenant knows its own homonyms
-- better than an operator does, and the column cannot move cost (it only ever
-- removes matches). Column-level UPDATE is granted on the same line of
-- reasoning as T0-2's grant — and is additive, so the four existing columns
-- keep theirs.

alter table public.tracking_configs
  add column if not exists exclude_terms text[] not null default '{}';

alter table public.tracking_configs drop constraint if exists tracking_configs_exclude_terms_check;
alter table public.tracking_configs add constraint tracking_configs_exclude_terms_check
  check (exclude_terms is null or cardinality(exclude_terms) <= 15);

grant update (exclude_terms) on public.tracking_configs to authenticated;

comment on column public.tracking_configs.exclude_terms is
  'Senses of the brand/competitor names that are NOT this client — e.g. Cotopaxi: volcano, Ecuador, hostel, mineral water; Sealand: container shipping, Tunl, Maersk. Read by the relevance gate as hints and by the substring tagger, which drops a match only when the bare name is its only evidence. Never a blanket denylist.';

-- Search-term suggestions: one row per model call, so a per-user hourly cap has
-- something to count (WP5, 2026-09-12).
--
-- The onboarding suggester is reachable by any signed-in account BEFORE it has
-- a tenant, so a per-tenant count (the shape lib/ask/quota.ts uses against rows
-- that already exist) has nothing to count. This table is the cheapest thing
-- that does. Service-role only: written and counted by the server actions, and
-- no tenant ever reads it, so RLS is on with no policy at all.

create table if not exists public.suggestion_calls (
  id uuid primary key default gen_random_uuid(),
  -- auth.users id. No FK: onboarding runs before the public.users row exists.
  user_id uuid not null,
  -- Null on the onboarding call — the tenant does not exist yet.
  client_id uuid references public.clients(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- The only read pattern: "how many did this user make in the last hour".
create index if not exists suggestion_calls_user_idx
  on public.suggestion_calls using btree (user_id, created_at desc);

alter table public.suggestion_calls enable row level security;

comment on table public.suggestion_calls is
  'One row per search-term suggestion call, for the per-user hourly cap (lib/keywords/quota.ts). Service-role only — RLS is enabled with no policy on purpose.';
