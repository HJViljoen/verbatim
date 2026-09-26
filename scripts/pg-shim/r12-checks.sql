-- R12 on the throwaway cluster (20260928091000_market_first_r12_grants.sql):
-- `authenticated` holds no UPDATE on tracking_configs' search-set and sending
-- columns, the service role keeps them, and a tenant owner's session is
-- refused on each. Run after the file has been applied twice:
--
--   bash scripts/pg-shim/throwaway.sh check <dir> scripts/pg-shim/r12-checks.sql
--
-- Every check raises on failure; the synthetic rows (made-up ids) live inside
-- one transaction that is rolled back.
\set ON_ERROR_STOP 1
begin;

-- 1. The catalogue ------------------------------------------------------------------------
do $$
declare col text;
begin
  foreach col in array array['competitor_names', 'exclude_terms', 'subreddits', 'report_period', 'report_day',
                             'brand_keywords', 'competitor_keywords', 'industry_keywords',
                             'platforms', 'own_handles', 'competitor_handles', 'max_videos', 'max_comments', 'comment_depth'] loop
    if has_column_privilege('authenticated', 'public.tracking_configs', col, 'UPDATE') then
      raise exception 'R12 FAILED: authenticated holds UPDATE on tracking_configs.%', col;
    end if;
    if not has_column_privilege('service_role', 'public.tracking_configs', col, 'UPDATE') then
      raise exception 'R12 FAILED: service_role lost UPDATE on tracking_configs.%', col;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.tracking_configs', 'UPDATE') then
    raise exception 'R12 FAILED: authenticated holds table-level UPDATE on tracking_configs';
  end if;
  foreach col in array array['last_actor', 'report_emails', 'updated_at'] loop
    if not has_column_privilege('authenticated', 'public.tracking_configs', col, 'UPDATE') then
      raise exception 'R12 FAILED: authenticated lost UPDATE on tracking_configs.% (it moves no search and no send)', col;
    end if;
  end loop;
  raise notice 'ok  R12: authenticated holds no UPDATE on the fourteen search, sending and cost columns, and keeps last_actor, report_emails and updated_at';
end $$;

-- 2. Behaviour: a tenant owner's session, which the own-row policy passes ------------------
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000e1', 'owner@check.example');
insert into public.clients (id, company_name) values ('00000000-0000-4000-8000-00000000c001', 'R12 check');
insert into public.users (id, client_id, full_name, email, role)
  values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000c001', 'Owner', 'owner@check.example', 'owner');
insert into public.tracking_configs (client_id, competitor_names, report_period, report_day)
  values ('00000000-0000-4000-8000-00000000c001', array['Cotopaxi'], 'weekly', 'sunday');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
do $$
declare col text;
begin
  foreach col in array array['competitor_names', 'exclude_terms', 'subreddits', 'report_period', 'report_day'] loop
    begin
      execute format('update public.tracking_configs set %I = %I where client_id = %L', col, col, '00000000-0000-4000-8000-00000000c001');
      raise exception 'R12 FAILED: a tenant owner''s session updated tracking_configs.%', col;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'ok  R12: a tenant owner''s session is refused on every search-set and sending column';
end $$;
reset role;

rollback;
\echo 'r12-checks: all passed'
