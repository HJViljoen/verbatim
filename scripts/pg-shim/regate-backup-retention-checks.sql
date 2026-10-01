-- Checks for 20261106094000_regate_backup_retention.sql, run on a throwaway
-- cluster after the migration (scripts/pg-shim/throwaway.sh check <dir>
-- this-file). Every check raises on a wrong answer; one transaction, rolled
-- back.
--
-- The service role may delete from regate_backup (the retention step's
-- delete), a tenant and anon still may not touch it, and the step's predicate
-- (backed_up_at older than 30 days) takes an old batch whole and leaves a
-- recent one, restored or not.

begin;

do $$ begin
  if not has_table_privilege('service_role', 'public.regate_backup', 'delete') then
    raise exception 'the service role cannot delete from regate_backup';
  end if;
  if has_table_privilege('authenticated', 'public.regate_backup', 'select')
     or has_table_privilege('authenticated', 'public.regate_backup', 'delete')
     or has_table_privilege('anon', 'public.regate_backup', 'select')
     or has_table_privilege('anon', 'public.regate_backup', 'delete') then
    raise exception 'a tenant or anon can reach regate_backup';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'regate_backup_backed_up_at_idx') then
    raise exception 'regate_backup has no backed_up_at index';
  end if;
end $$;

insert into public.clients (id, company_name) values ('00000000-0000-4000-8000-00000000c0c9', 'Regate retention check');
-- An old batch (31 days, two rows, one restored), a recent one (29 days).
insert into public.regate_backup (batch_id, client_id, source_table, row_data, backed_up_at, restored_at) values
  ('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-00000000c0c9', 'videos',   '{"id":"v"}', now() - interval '31 days', null),
  ('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-00000000c0c9', 'comments', '{"id":"c","text":"words"}', now() - interval '31 days', null),
  ('00000000-0000-4000-8000-0000000b0002', '00000000-0000-4000-8000-00000000c0c9', 'comments', '{"id":"c2","text":"more"}', now() - interval '29 days', now() - interval '28 days');

-- The step's delete, as the service role (PostgREST: .delete().lt('backed_up_at', cutoff)).
set local role service_role;
delete from public.regate_backup where backed_up_at < now() - interval '30 days';
reset role;

do $$
declare n_old int; n_new int;
begin
  select count(*) into n_old from public.regate_backup where batch_id = '00000000-0000-4000-8000-0000000b0001';
  select count(*) into n_new from public.regate_backup where batch_id = '00000000-0000-4000-8000-0000000b0002';
  if n_old <> 0 then raise exception 'the 31-day batch was not deleted whole (% rows left)', n_old; end if;
  if n_new <> 1 then raise exception 'the 29-day batch was touched (% rows)', n_new; end if;
end $$;

-- A tenant cannot delete it (no grant, RLS on with no policy).
do $$ begin
  begin
    set local role authenticated;
    delete from public.regate_backup;
    reset role;
    raise exception 'a tenant deleted from regate_backup';
  exception when insufficient_privilege then reset role;
  end;
end $$;

select 'regate-backup-retention checks: all passed' as result;
rollback;
