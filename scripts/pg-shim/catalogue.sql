-- The public schema's catalogue, one line per object, for the apply-twice diff
-- (market-first plan §4.0, WP1.4; until now this lived only in an old scratchpad,
-- BI F29). A migration is idempotent when the catalogue after its second
-- application equals the catalogue after its first, line for line.
--
-- What it covers: tables and their RLS flags; every column with its type, NOT NULL,
-- column ACL and default; indexes; functions (security definer, config, ACL and an
-- md5 of the full definition, so a changed body shows; extension members such as
-- pgvector's aggregates are left out); non-internal triggers; policies
-- with their roles and expressions; constraints; table and column grants; column
-- and function comments. Ordered, unaligned, tuples only, so `diff` is the test.
--
--   psql … -X -q -f scripts/pg-shim/catalogue.sql > before.txt
\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
select 'TABLE', c.relname, c.relrowsecurity::text, c.relforcerowsecurity::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') order by 2;
select 'COLUMN', c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull::text,
       coalesce(a.attacl::text, '-'), coalesce(pg_get_expr(d.adbin, d.adrelid), '-')
  from pg_attribute a join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
 where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped and c.relkind in ('r', 'v', 'm', 'p')
 order by 2, 3;
select 'INDEX', c.relname, i.indexrelid::regclass::text, pg_get_indexdef(i.indexrelid)
  from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' order by 2, 3;
select 'FUNCTION', p.proname, p.prosecdef::text, coalesce(array_to_string(p.proconfig, ','), '-'),
       md5(pg_get_functiondef(p.oid)), coalesce(p.proacl::text, '-')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind in ('f', 'p')
   and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
 order by 2, 5;
select 'TRIGGER', c.relname, t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and not t.tgisinternal order by 2, 3;
select 'POLICY', c.relname, p.polname, p.polcmd::text, p.polroles::regrole[]::text,
       coalesce(pg_get_expr(p.polqual, p.polrelid), '-'), coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')
  from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' order by 2, 3;
select 'CONSTRAINT', c.relname, k.conname, pg_get_constraintdef(k.oid)
  from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' order by 2, 3;
select 'TABLEGRANT', table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants where table_schema = 'public'
 group by 2, 3 order by 2, 3;
select 'COLGRANT', table_name, column_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_column_grants where table_schema = 'public'
 group by 2, 3, 4 order by 2, 3, 4;
select 'COMMENT', c.relname, a.attname, col_description(c.oid, a.attnum)
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped and col_description(c.oid, a.attnum) is not null
 order by 2, 3;
select 'TBLCOMMENT', c.relname, obj_description(c.oid, 'pg_class')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') and obj_description(c.oid, 'pg_class') is not null
 order by 2;
select 'FNCOMMENT', p.proname, obj_description(p.oid, 'pg_proc')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and obj_description(p.oid, 'pg_proc') is not null order by 2, 3;
