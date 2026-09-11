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
