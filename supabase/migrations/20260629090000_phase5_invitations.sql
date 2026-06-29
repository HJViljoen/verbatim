-- Phase 5 — team invitations.
--
-- Backs the team-management invite flow: an owner/admin creates a row here, the
-- invitee opens /invite/<token>, and acceptance attaches a public.users row to
-- this client. The acceptance path (token lookup + status flip + membership
-- insert) runs through the service role in a server action and is validated in
-- app code, so this table is never anon-readable — the policies below only grant
-- tenant owners/admins management access.
--
-- Apply with: supabase db push  (or the Supabase MCP apply_migration tool).
-- This file is the source of truth; it had not been applied to the live DB as of
-- writing (production migration is gated on Heinrich's approval).

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner','admin','member')),
  token text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

-- One outstanding (pending) invite per email per tenant.
create unique index invitations_pending_unique
  on public.invitations (client_id, lower(email))
  where status = 'pending';

create index invitations_client_id_idx on public.invitations (client_id);

alter table public.invitations enable row level security;

-- Owners/admins of the tenant can view its invitations. Members get none.
create policy "Owners and admins see invitations"
  on public.invitations for select to authenticated
  using (client_id = get_my_client_id() and get_my_role() in ('owner','admin'));

-- Owners/admins create invitations only for their own tenant.
create policy "Owners and admins create invitations"
  on public.invitations for insert to authenticated
  with check (client_id = get_my_client_id() and get_my_role() in ('owner','admin'));

-- Owners/admins update (revoke) their tenant's invitations.
create policy "Owners and admins update invitations"
  on public.invitations for update to authenticated
  using (client_id = get_my_client_id() and get_my_role() in ('owner','admin'))
  with check (client_id = get_my_client_id());
