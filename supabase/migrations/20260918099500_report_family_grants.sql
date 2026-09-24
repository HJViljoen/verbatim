-- M11 · the report and Ask family's grants, narrowed to what the app uses.
--
-- WHY THIS EXISTS, AND WHY "RLS DENIES IT" WAS NOT A REASON TO LEAVE IT.
-- Eleven tables in this family carry the project's default ALL grant for
-- `anon` and `authenticated` — DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
-- TRUNCATE, UPDATE — with exactly ONE policy each, and every one of those
-- policies is a SELECT. The Block C merge note deferred narrowing them on the
-- ground that "every write by those roles is denied by RLS today". Three of the
-- four are. TRUNCATE is not: PostgreSQL row security applies to SELECT, INSERT,
-- UPDATE and DELETE, there is no TRUNCATE policy to write, and a TRUNCATE is
-- not row-scoped.
--
-- MEASURED, NOT ARGUED. On a throwaway PostgreSQL 17.11 cluster built from
-- `schema-baseline.sql` plus every migration in this directory, as role
-- `authenticated`:
--
--   delete from public.report_snapshots  -> DELETE 0      (RLS)
--   update  … set title='x'              -> UPDATE 0      (RLS)
--   insert  …                            -> ERROR, new row violates RLS
--   truncate public.agent_threads cascade-> TRUNCATE TABLE, both tenants' rows
--                                           gone, cascading to agent_messages
--
-- `truncate public.report_snapshots cascade` gets further still — past
-- `artifacts`, `export_events`, `reports`, `share_links`, `report_sends`,
-- `report_edits` and `report_builds` — and is stopped today by exactly one
-- thing: M9's `revoke all on public.sent_figures`. Before M9 is applied,
-- nothing stops it at all.
--
-- NOT A LIVE INCIDENT, AND STILL WORTH CLOSING. PostgREST issues no TRUNCATE
-- verb and `authenticated` is NOLOGIN, so there is no route through the public
-- API; this is the shape M2 already judged unacceptable on three other tables
-- ("RLS denied the writes, so it was harmless and one stray policy away from
-- not being"). It matters more after Block C than before it, because WP21's
-- monthly cap is the product's only spend limit and it counts rows in
-- `agent_messages` — where DELETE is blocked by the ABSENCE of a policy rather
-- than by a privilege.
--
-- BY NAME, NOT `revoke all`, FOR ONE REASON. `share_links` deliberately holds
-- NO table-level SELECT: 20260830090000 revoked it and granted back a column
-- list, so that "the token and the password hash never reach a session client"
-- (the 20260820180000 pattern). `revoke all` there would drop those column
-- grants and a later `grant select` would hand the token back. Revoking the
-- write privileges by name leaves every SELECT — table-level on the ten,
-- column-level on `share_links` — exactly as it is, so this migration cannot
-- take a read the app depends on.
--
-- NOTHING IN THE PRODUCT LOSES ANYTHING. Every one of these tables has one
-- SELECT policy and no other, so no INSERT, UPDATE or DELETE by `anon` or
-- `authenticated` can succeed today — a write that worked would already have
-- had to get past RLS, and none can. Every writer is the service role, whose
-- grants this file does not touch.
--
-- Idempotent: a revoke of a privilege already revoked is a no-op, so this file
-- applies twice with the same result.

revoke insert, update, delete, truncate, references, trigger
  on public.report_snapshots from authenticated, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.report_sends     from authenticated, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.report_builds    from authenticated, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.report_edits     from authenticated, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.reports          from authenticated, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.artifacts        from authenticated, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.export_events    from authenticated, anon;
-- Legacy, read-only, and gets no new rows (AGENTS.md) — which is a rule the
-- grants can state rather than only the docs.
revoke insert, update, delete, truncate, references, trigger
  on public.weekly_reports   from authenticated, anon;
-- The token and the password hash stay withheld: no SELECT is revoked here, so
-- 20260830090000's column list survives untouched.
revoke insert, update, delete, truncate, references, trigger
  on public.share_links      from authenticated, anon;
-- Ask. `agent_messages` is what `lib/ask/quota.ts` counts the monthly cap over,
-- so a role that can empty it can reset somebody's spend limit.
revoke insert, update, delete, truncate, references, trigger
  on public.agent_threads    from authenticated, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.agent_messages   from authenticated, anon;

-- Stated, not inherited (the config_changes precedent, 2026-09-15): the service
-- role is every writer on this family and keeps what it already holds. Named
-- here so a future default-privilege change cannot quietly take it away.
grant select, insert, update, delete on public.report_snapshots to service_role;
grant select, insert, update, delete on public.report_sends     to service_role;
grant select, insert, update, delete on public.report_builds    to service_role;
grant select, insert, update, delete on public.report_edits     to service_role;
grant select, insert, update, delete on public.reports          to service_role;
grant select, insert, update, delete on public.artifacts        to service_role;
grant select, insert, update, delete on public.export_events    to service_role;
grant select, insert, update, delete on public.weekly_reports   to service_role;
grant select, insert, update, delete on public.share_links      to service_role;
grant select, insert, update, delete on public.agent_threads    to service_role;
grant select, insert, update, delete on public.agent_messages   to service_role;
