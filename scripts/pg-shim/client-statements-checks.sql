begin;
insert into public.clients (id, company_name) values ('11111111-1111-1111-1111-111111111111', 'T') ;
insert into public.client_statements (client_id, text) values ('11111111-1111-1111-1111-111111111111', 'Made from recycled nylon') returning id \gset s_
do $$ begin
  begin
    insert into public.client_statements (client_id, text) values ('11111111-1111-1111-1111-111111111111', ' made from recycled nylon ');
    raise exception 'duplicate live text was accepted';
  exception when unique_violation then null; end;
end $$;
insert into public.client_statement_readings (statement_id, client_id, month, data, version) values (:'s_id', '11111111-1111-1111-1111-111111111111', '2026-09-01', '{}'::jsonb, 'v');
do $$ begin
  begin
    insert into public.client_statement_readings (statement_id, client_id, month, data, version) select id, '11111111-1111-1111-1111-111111111111', '2026-09-15', '{}'::jsonb, 'v' from public.client_statements limit 1;
    raise exception 'a mid-month date was accepted';
  exception when check_violation then null; end;
end $$;
select count(*) as band_rows from public.statement_band('11111111-1111-1111-1111-111111111111', array_fill(0.01::real, array[1536])::vector, 0.4);
select has_function_privilege('authenticated', 'public.statement_band(uuid, vector, float8)', 'execute') as auth_can_call,
       has_table_privilege('authenticated', 'public.client_statement_readings', 'insert') as auth_can_write_readings,
       has_column_privilege('authenticated', 'public.client_statements', 'text', 'update') as auth_can_edit_text,
       has_column_privilege('authenticated', 'public.client_statements', 'retired_at', 'update') as auth_can_retire;
update public.client_statements set retired_at = now() where id = :'s_id';
insert into public.client_statements (client_id, text) values ('11111111-1111-1111-1111-111111111111', 'Made from recycled nylon');
select count(*) filter (where retired_at is null) as live, count(*) as all_rows from public.client_statements;
delete from public.clients where id = '11111111-1111-1111-1111-111111111111';
select count(*) as after_cascade from public.client_statement_readings;
rollback;
