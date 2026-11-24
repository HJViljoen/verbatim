-- Pipeline reads through PostgREST run as service_role, which inherited the
-- authenticator role's 8 s statement_timeout. Since 18 Oct the lens, brand and
-- comparability reads have timed out on every Sealand and Ossur run (stale-data
-- warnings). 60 s fits inside every pipeline step budget.
alter role service_role set statement_timeout = '60s';
notify pgrst, 'reload config';
