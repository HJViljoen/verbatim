-- Evidence-led cards (Redesign Spec §1): each synthesised finding stores the
-- single most representative VERBATIM customer quote, chosen by Pass D (which
-- already reads every comment behind the finding). The data pages lead with it;
-- older rows / runs before this column fall back to the frontend quote heuristic.
-- Nullable and additive — safe to apply live.
alter table market_insights add column if not exists hero_quote text;
alter table recommendations add column if not exists hero_quote text;
alter table competitive_insights add column if not exists hero_quote text;
