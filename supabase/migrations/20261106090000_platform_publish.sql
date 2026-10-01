-- On the platform, not emailed (the backfill, 1 Oct evening; lead's ruling 3).
--
-- WHAT IT RECORDS. A review schedule's build stands as a `ready` send until
-- Heinrich presses Send, and until then nothing of it reaches the client: not
-- the email, and not the pages either (`loadPublishedWeekRead` and
-- `loadPublishedLongRun`, lib/written/published.ts, print only a read whose
-- send went out). He can now put a held build on the platform WITHOUT emailing
-- anyone: its week read, and the long-run read the same run wrote, show on the
-- client's pages, and the email is not sent. That is a decision of its own, so
-- it is a recorded state of its own: `published_at` (when) and `published_by`
-- (the operator who pressed it; null where an operator script did, which
-- records itself in `config_changes`). It is NOT a `sent` row with no
-- recipients: a send that went to nobody would read as an email in every
-- place that counts sends.
--
-- THE STATUS DOES NOT MOVE. A published build stays `ready`: built, and not
-- emailed. Send still emails it exactly as before (deliverSend takes `ready`
-- to `sent` and leaves `published_at` as it is), and every rule that reads the
-- status (the claim, the cadence check, the ops check) reads what it read
-- before. "On the platform" is `published_at is not null` OR `status =
-- 'sent'`: an emailed build was always on the platform.
--
-- THE HELD-SNAPSHOT POLICY ACCEPTS IT. `report_snapshots`' one SELECT policy
-- (20261105091000, mirrored from `heldOf` in lib/reports/held.ts) hides a
-- snapshot a send carries until some send carrying it is `sent`. A published
-- build is the workspace's as a sent one is, so the policy is rebuilt under
-- its own name with that one arm widened, and the app's `heldOf` says the same.
--
-- ADDITIVE. Two nullable columns (every existing row reads "not published",
-- which is what it is), one CHECK that only a built send can be published
-- (`snapshot_id` set; true of every existing row, whose `published_at` is
-- null), and the policy widened by one arm. Applied before the code: the
-- deployed code names neither column, and the policy only lets a tenant read
-- a snapshot carried by a published send, of which there are none until the
-- code that publishes ships.
--
-- IDEMPOTENT: add column if not exists, drop-if-exists then add for the
-- constraint, drop-if-exists then create for the policy. No BEGIN/COMMIT (the
-- runner wraps one transaction per file). Applied twice on a throwaway
-- PostgreSQL 17 cluster (scripts/pg-shim/throwaway.sh twice) with an empty
-- catalogue diff, and exercised by scripts/pg-shim/platform-publish-checks.sql
-- (a tenant session reads a published build and still not a held one; Send
-- after publish; the check refuses an unbuilt send).

alter table public.report_sends add column if not exists published_at timestamptz;
alter table public.report_sends add column if not exists published_by uuid;
comment on column public.report_sends.published_at is
  'When the operator put this build on the client''s platform without emailing it (the Studio''s "Publish to the platform", or scripts/backfill-platform.ts --publish). Null: not published (it may still have been emailed: status ''sent''). The status does not move: a published build stays ''ready'' until someone presses Send.';
comment on column public.report_sends.published_by is
  'The operator who published it; null where an operator script did (that writes a config_changes row naming the command).';

alter table public.report_sends drop constraint if exists report_sends_published_built;
alter table public.report_sends add constraint report_sends_published_built
  check (published_at is null or snapshot_id is not null);

drop policy if exists "Users see their own report_snapshots" on public.report_snapshots;
create policy "Users see their own report_snapshots" on public.report_snapshots
  for select using (
    client_id = (select public.get_my_client_id())
    and (
      -- No send carries it: not a held build.
      not exists (select 1 from public.report_sends s where s.snapshot_id = report_snapshots.id)
      -- Some send carrying it went out, or was put on the platform without
      -- an email: the workspace's, as every sent report is.
      or exists (select 1 from public.report_sends s where s.snapshot_id = report_snapshots.id and (s.status = 'sent' or s.published_at is not null))
      -- Held: the operator's alone.
      or (select public.is_superadmin())
    )
  );

-- Post-apply check (run by hand):
--   select column_name from information_schema.columns where table_name = 'report_sends' and column_name in ('published_at', 'published_by');
--   select policyname, cmd, qual from pg_policies where tablename = 'report_snapshots';
--   -- expect ONE row, "Users see their own report_snapshots", SELECT, with "published_at is not null" in the sent arm
