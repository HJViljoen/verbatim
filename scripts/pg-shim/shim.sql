-- The Supabase platform, shimmed onto a plain PostgreSQL 17 cluster (market-first
-- plan §4.0, WP1.4; until now this lived only in an old scratchpad, BI F29).
--
-- Nothing here is Verbatim's. It is the platform that supabase/schema-baseline.sql
-- and every migration assume: the three API roles and the authenticator, the auth
-- and storage schemas, the three JWT helpers, and, load-bearing, production's
-- DEFAULT ACL. Supabase grants every privilege on every new public table, function
-- and sequence to anon, authenticated and service_role; without that default a
-- `revoke` in a migration revokes a privilege that was never granted, and a
-- migration that gets its grants wrong still passes here.
--
-- Used by scripts/pg-shim/throwaway.sh, which loads it before the baseline. Safe to
-- run twice.

create extension if not exists vector;
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
create schema if not exists storage;
create table if not exists auth.users (id uuid primary key, email text);
-- The three helpers read the request's JWT claims the way PostgREST sets them:
-- `set local request.jwt.claims = '{"sub": "…", "role": "authenticated"}'`.
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as
  $f$ select nullif(current_setting('request.jwt.claims', true)::json->>'role', '')::text $f$;
create or replace function auth.jwt() returns jsonb language sql stable as
  $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $f$;
grant usage on schema auth, storage to anon, authenticated, service_role;

-- Production's default ACL on the public schema.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- storage.buckets and storage.objects: the platform tables
-- 20260829150000_report_snapshots_artifacts.sql inserts a bucket row into.
create table if not exists storage.buckets (
  id text primary key, name text not null, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text, owner uuid,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(), metadata jsonb
);
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
