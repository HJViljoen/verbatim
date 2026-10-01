-- Checks for 20261106090000_platform_publish.sql, run on a throwaway cluster
-- after the migration (scripts/pg-shim/throwaway.sh check <dir> this-file).
-- Every check raises on a wrong answer, so the run stops at the first one;
-- the whole file is one transaction and rolls back.
--
-- The world: tenant A with a weekly-read review schedule and three builds,
-- tenant B with one published build.
--   held       carried by a `ready` send (built, held for review)
--   published  carried by a `ready` send the operator PUBLISHED (on the
--              platform, not emailed)
--   sent       carried by a `sent` send
--   b-pub      tenant B's published build
-- A tenant session reads a published build like a sent one, never a held one,
-- never another tenant's; Send after publishing still moves the row to `sent`
-- and keeps `published_at`; the check refuses a published send with no build.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'member@a.test'),
  ('b0000000-0000-0000-0000-00000000000b', 'member@b.test');
insert into public.clients (id, company_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B');
insert into public.users (id, client_id, full_name, email, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A member', 'member@a.test', 'member'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B member', 'member@b.test', 'member');

insert into public.report_schedules (id, client_id, name, starter_key, artefact, review) values
  ('5c000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'This week in your market', 'weekly_read', 'weekly_read', true),
  ('5c000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'This week in your market', 'weekly_read', 'weekly_read', true);

insert into public.report_snapshots (id, client_id, kind, ref, title, data) values
  ('50000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'report', '{}', 'held', '{}'),
  ('50000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'report', '{}', 'published', '{}'),
  ('50000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'report', '{}', 'sent', '{}'),
  ('50000000-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'report', '{}', 'b-pub', '{}');

insert into public.report_sends (client_id, schedule_id, snapshot_id, status, published_at, published_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5c000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', 'ready', null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5c000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000002', 'ready', now(), null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5c000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000003', 'sent', null, null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '5c000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-000000000004', 'ready', now(), null);

-- The columns, the check and ONE policy on the table, with the published arm.
do $$ declare n int; begin
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'report_sends' and column_name in ('published_at', 'published_by');
  if n <> 2 then raise exception 'report_sends has % of the two publish columns', n; end if;
  select count(*) into n from pg_constraint where conname = 'report_sends_published_built';
  if n <> 1 then raise exception 'the published-built check is missing'; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'report_snapshots';
  if n <> 1 then raise exception 'report_snapshots has % policies, expected 1', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'report_snapshots'
    and policyname = 'Users see their own report_snapshots' and cmd = 'SELECT' and qual like '%published_at IS NOT NULL%';
  if n <> 1 then raise exception 'the published arm is not on the policy'; end if;
end $$;

-- A's member: the sent and the PUBLISHED build; never the held one, never B's.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select string_agg(title, ', ' order by title) as tenant_a_member_sees from public.report_snapshots;
do $$ declare seen text; begin
  select string_agg(title, ',' order by title) into seen from public.report_snapshots;
  if seen is distinct from 'published,sent' then raise exception 'A''s member sees [%], expected [published,sent]', seen; end if;
end $$;

-- B's member: B's own published build only.
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
do $$ declare seen text; begin
  select string_agg(title, ',' order by title) into seen from public.report_snapshots;
  if seen is distinct from 'b-pub' then raise exception 'B''s member sees [%]', seen; end if;
end $$;

-- A tenant session cannot publish (report_sends has no tenant write policy).
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
do $$ declare n int; begin
  update public.report_sends set published_at = now() where snapshot_id = '50000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a tenant session published % send(s)', n; end if;
exception when insufficient_privilege then
  null; -- refused outright: also right
end $$;

-- Heinrich presses Send on the published build: `sent`, published_at kept.
reset role;
update public.report_sends set status = 'sent', sent_at = now() where snapshot_id = '50000000-0000-0000-0000-000000000002';
do $$ declare n int; begin
  select count(*) into n from public.report_sends where snapshot_id = '50000000-0000-0000-0000-000000000002' and status = 'sent' and published_at is not null;
  if n <> 1 then raise exception 'Send after publishing lost the published state'; end if;
end $$;

-- A published send with no build is refused.
do $$ begin
  begin
    insert into public.report_sends (client_id, schedule_id, status, published_at)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5c000000-0000-0000-0000-00000000000a', 'skipped', now());
    raise exception 'a published send with no build was accepted';
  exception when check_violation then null;
  end;
end $$;

select 'platform-publish checks: all passed' as result;
rollback;
