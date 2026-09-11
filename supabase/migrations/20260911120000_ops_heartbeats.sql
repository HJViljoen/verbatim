-- Dead-man's switch (WP2, 2026-09-11): proof that Inngest is calling us.
--
-- On 2026-09-06 the 06:00 SAST dispatcher produced no pipeline_runs row at all
-- — not a failed run, silence — and nothing noticed, because every alert the
-- product has runs inside an Inngest function. This table is the one fact an
-- outside checker (Vercel Cron -> /api/cron/ops-check) can read to tell
-- "Inngest is alive" from "Inngest has stopped calling".
--
-- One row per named liveness signal, upserted in place; no history, because the
-- only question ever asked of it is "how long since". Today:
--   'inngest'    — keep-warm, every 5 minutes
--   'dispatcher' — the daily 06:00 SAST scheduled-pipeline-dispatcher

create table if not exists public.ops_heartbeats (
  name text primary key,
  last_seen_at timestamptz not null default now(),
  detail jsonb
);

-- RLS on with NO policies: this is operator plumbing, not tenant data, and it
-- must never be readable through the anon/authenticated keys. The service role
-- bypasses RLS, and the service role is the only thing that touches it — both
-- the Inngest functions that write it and the ops route that reads it.
alter table public.ops_heartbeats enable row level security;

comment on table public.ops_heartbeats is
  'Liveness beacons written by Inngest functions and read by /api/cron/ops-check. Absence or staleness of a row IS the alert.';
comment on column public.ops_heartbeats.detail is
  'Free-form context from the writer (last run outcome, counts). Never required; the timestamp is the signal.';
