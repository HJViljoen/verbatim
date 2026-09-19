-- ST3/ST4 · the two Reddit controls on Settings › Tracking: the grant that
-- makes them work for a paying client, and the ceiling that keeps them from
-- being a self-served spend lever.
--
-- 1 · THE GRANT. WHY THE CONTROL IS DEAD FOR EVERY CLIENT AND GREEN FOR EVERY
-- OPERATOR.
--
-- `updateCommunity` (app/dashboard/settings/actions.ts) writes
-- `tracking_configs.subreddits` through `session.supabase`, which for a tenant
-- member runs as `authenticated` — `lib/auth.ts` swaps to the admin client
-- only while a PLATFORM ADMIN is viewing someone else's workspace.
-- 20260820120000_lock_the_money.sql revoked table-wide UPDATE and re-granted
-- five columns; 20260911140000 added `exclude_terms` and 20260915091000 added
-- `last_actor`. `subreddits` is in none of them.
--
-- Measured against production 2026-09-19, one query on
-- information_schema.column_privileges:
--
--   authenticated  competitor_names, exclude_terms, last_actor, report_day,
--                  report_emails, report_period, updated_at        (7)
--   anon           all 19 columns
--
-- So an owner pressing "Stop watching" gets 42501, the action returns "Could
-- not save that. Try again…", nothing is written, and the `config_changes`
-- row the action would have logged is never reached — the failure leaves no
-- record either. The identical click from a platform admin SUCCEEDS, because
-- `applyOperatorView` has already swapped to the service role. The control
-- tests green for every operator and is dead for every paying client.
--
-- ONE COLUMN, NOT A WIDER CLIENT. The obvious fix — swapping the action to
-- `createAdminClient()` — would hand a browser-driven action the service role
-- and re-open the lock T0-2 closed. The column privilege is the narrow fix:
-- `subreddits` and nothing else, and the RLS UPDATE policy still scopes it to
-- the caller's own tenant.
grant update (subreddits) on public.tracking_configs to authenticated;

-- And `anon` loses what it was never meant to have (carried item C2). Inert
-- today — RLS is on and both policies name {authenticated} — and inert is not
-- a reason to hold UPDATE on nineteen cost columns, including the five
-- 20260820120000 went out of its way to take off `authenticated`.
revoke update on public.tracking_configs from anon;

-- 2 · THE CEILING ---------------------------------------------------------
--
-- Every ACTIVE community is a paid Apify search plus a comment scrape ON EVERY
-- RUN, and until now `subreddits` was the one list on this row with no bound:
-- `tracking_configs_cost_ceilings_check` bounds industry_keywords,
-- competitor_keywords, brand_keywords, competitor_names and report_emails, and
-- the discovery path bounds itself (SUBREDDIT_TARGET_ACTIVE 5,
-- SUBREDDIT_MAX_KNOWN 20, three probes a run) — but the control this migration
-- grants is the one path with neither.
--
-- The application's own refusal is in `applySubredditEdit`
-- (lib/settings/save-state.ts), where the sentence can be written in the
-- client's words. This is the bound BELOW it, for the PATCH that does not go
-- through it: the grant above is a column privilege, so a crafted PostgREST
-- PATCH may now write this column directly.
--
-- Both numbers sit far above every real value, the way T0-2's do. Production
-- 2026-09-19: the larger of the two tenants holds 20 known communities and 3
-- active. Discovery converges at 20 known, so the total bound is 100 — it
-- cannot be met by anything legitimate, including a client who cycles
-- communities for years, because a stop is a demotion and never a delete.
-- The active bound is SUBREDDIT_MAX_KNOWN's 20, four times the convergence
-- target and the number of paid searches a run could ever be made to make.
--
-- `jsonb_path_query_array` is IMMUTABLE (the `_tz` variants are not), so it is
-- legal in a CHECK; a subquery would not be. The whole constraint is restated
-- because that is the only way to extend one.
alter table public.tracking_configs drop constraint if exists tracking_configs_cost_ceilings_check;
alter table public.tracking_configs add constraint tracking_configs_cost_ceilings_check check (
  (max_videos is null or (max_videos > 0 and max_videos <= 100)) and
  (comment_depth is null or (comment_depth > 0 and comment_depth <= 500)) and
  (max_comments is null or (max_comments > 0 and max_comments <= 1000)) and
  (industry_keywords is null or cardinality(industry_keywords) <= 15) and
  (competitor_keywords is null or cardinality(competitor_keywords) <= 15) and
  (brand_keywords is null or cardinality(brand_keywords) <= 15) and
  (competitor_names is null or cardinality(competitor_names) <= 15) and
  (report_emails is null or cardinality(report_emails) <= 25) and
  (jsonb_typeof(subreddits) = 'array') and
  (jsonb_array_length(subreddits) <= 100) and
  (jsonb_array_length(jsonb_path_query_array(subreddits, '$[*] ? (@.status == "active")')) <= 20)
);

comment on constraint tracking_configs_cost_ceilings_check on public.tracking_configs is
  'Bounds, not policy: every list on this row that costs money per run, ceilinged far above any real value so a runaway or crafted config cannot outrun the account''s credit. The subreddits arms were added with the client-facing community control (ST3/ST4) — an active community is a paid search and a comment scrape on every run.';
