-- The erasure's list of stored files still to delete (scripts/erase-commenter.ts,
-- step 7f; lib/retention/snapshot-files.ts). NOT APPLIED: written on
-- fix/erase-prose for the operator to apply.
--
-- WHY A TABLE. An erasure scrubs a snapshot's words, then deletes the PDFs and
-- PNGs built from it, every version. A delete can fail (Storage unreachable),
-- and once the snapshot is scrubbed nothing finds it again by the commenter's
-- words, so a re-run would delete nothing and report success. The snapshot is
-- therefore written here BEFORE its words are scrubbed, and every run of the
-- script works through the whole list (this request's and any earlier one's),
-- deleting each snapshot's bucket folder and removing its row only once that
-- succeeds. `artifacts.stale` cannot be the record: it is set before the file
-- is removed and cleared by the next download's re-render.
--
-- WHAT IT HOLDS: ids and the handle's suppression key, never a comment's text.
-- One row per snapshot (a second request touching the same snapshot keeps the
-- first row). `client_id` cascades: a workspace that goes takes its rows.
--
-- WITHOUT IT, the script refuses to scrub a snapshot that has stored files
-- (the step fails, the comments stay, exit 1, the message names this file);
-- a snapshot with none is scrubbed as before.
--
-- ADDITIVE AND IDEMPOTENT: one table (if not exists), RLS on with no policy,
-- the service role alone.

create table if not exists public.erasure_pending_files (
  snapshot_id  uuid primary key,
  client_id    uuid not null references public.clients(id) on delete cascade,
  platform     text not null,
  author_key   text not null,
  recorded_at  timestamptz not null default now()
);

comment on table public.erasure_pending_files is
  'Snapshots whose stored files (every version in artifacts/<client>/<snapshot>/) an erasure must still delete. Written before the snapshot is scrubbed; a row goes once its files are deleted. Service role only.';

alter table public.erasure_pending_files enable row level security;
revoke all on public.erasure_pending_files from public, anon, authenticated;
grant select, insert, update, delete on public.erasure_pending_files to service_role;
