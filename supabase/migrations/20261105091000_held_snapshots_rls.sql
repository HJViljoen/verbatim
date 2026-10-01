-- A held build is not readable by a tenant's session (the pages build's fresh
-- review, 1 Oct evening, M4; first raised in the weekly deploy's review).
--
-- WHAT WAS OPEN. RLS let `authenticated` select every `report_snapshots` row
-- of its own client, `data` included ("Users see their own report_snapshots",
-- 20260829150000). A review schedule's build stands from Sunday morning as a
-- snapshot carried by a `ready` send, held until Heinrich presses Send
-- (lib/reports/held.ts). The app never shows it to a tenant: every tenant
-- path reads snapshots with the service role behind `mayReadHeld`,
-- `heldSnapshotIds` or `snapshotHeld`. But a member holding their own JWT
-- could select it straight through PostgREST before it was sent.
--
-- THE RULE, MIRRORED FROM THE APP (`heldOf`, lib/reports/held.ts). A snapshot
-- some send carries is HELD until some send carrying it is `sent` (ready,
-- claimed, failed or skipped: built, not gone out). A snapshot no send
-- carries (a page export, a tile, an Ask thread, a build made by hand) is not
-- held. A session reads its own client's rows, except a held one, which only
-- a platform admin reads: the app's `mayReadHeld` is the operator OR
-- `reviewAudience` = 'members', and that second arm is the code constant
-- STUDIO_TENANT_REVIEWS (lib/studio-visibility.ts), false for every tenant, so
-- it has no SQL side. If it is ever flipped, this policy is revisited with it.
--
-- ONE POLICY, REPLACED UNDER ITS OWN NAME. Permissive policies OR together, so
-- a second policy beside the old one would change nothing: the old one is
-- dropped and rebuilt with the held arm, under the same name (the name is the
-- contract, the 20261104091000 precedent).
--
-- THE SUBQUERIES RUN UNDER report_sends' OWN RLS (`client_id =
-- get_my_client_id()`, 20260831090000), and every send that carries a
-- snapshot is that snapshot's client's (a schedule builds its own client's
-- report), so a tenant's session sees exactly the sends the rule asks about.
-- No new function: `get_my_client_id()` and `is_superadmin()` are the
-- baseline's SECURITY DEFINER helpers, each wrapped in a scalar subquery so
-- it is evaluated once per statement, not once per row.
--
-- NOTHING IN THE APP LOSES A READ. The app reads `report_snapshots` with the
-- service role (BYPASSRLS) everywhere but one place, the Studio workbench's
-- build list (app/dashboard/studio/workbench.tsx), which is the operator's
-- alone and reads with the operator's own session on their home workspace;
-- the `is_superadmin()` arm keeps every row there. Only a tenant session's
-- select narrows.
--
-- ADDITIVE, AND APPLIED BEFORE THE CODE. It changes one SELECT policy and
-- nothing else: no column, no grant, no row. The deployed code does not
-- depend on it (it closes a path the code never used), so it applies before
-- the code deploy and survives a rollback of the code.
--
-- IDEMPOTENT: drop-if-exists then create. No BEGIN/COMMIT (the runner wraps
-- one transaction per file). Applied twice on a throwaway PostgreSQL 17
-- cluster (scripts/pg-shim/throwaway.sh twice) with an empty catalogue diff,
-- and exercised by scripts/pg-shim/held-snapshots-checks.sql: a tenant session
-- cannot read a held row, still reads a sent one and an unsent-by-nobody one,
-- never another tenant's, and the platform admin reads the held one.

drop policy if exists "Users see their own report_snapshots" on public.report_snapshots;
create policy "Users see their own report_snapshots" on public.report_snapshots
  for select using (
    client_id = (select public.get_my_client_id())
    and (
      -- No send carries it: not a held build.
      not exists (select 1 from public.report_sends s where s.snapshot_id = report_snapshots.id)
      -- Some send carrying it went out: the workspace's, as every sent report is.
      or exists (select 1 from public.report_sends s where s.snapshot_id = report_snapshots.id and s.status = 'sent')
      -- Held: the operator's alone.
      or (select public.is_superadmin())
    )
  );

-- Post-apply check (run by hand):
--   select policyname, cmd, qual from pg_policies where tablename = 'report_snapshots';
--   -- expect ONE row, "Users see their own report_snapshots", SELECT, with the held arm
