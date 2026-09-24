-- M14 · a subject that is BORN is a change to the configuration too.
--
-- THE HOLE. M4 (`20260918093000_subjects.sql`) installed
-- `subjects_status_audit` as `after update of status`, for the reason its own
-- head gives: retiring a subject permanently freezes its open months and the
-- write that does it is a member PATCH the application cannot intercept, so the
-- record of who did it belongs in the database. That is right, and it is only
-- half the lifecycle. A row INSERTED with `status = 'active'` never moves, so
-- the trigger never fires, and the subject the whole workspace is measured on
-- appears with nothing anywhere saying who decided it or when.
--
-- MEASURED, NOT ARGUED. On the Supabase PREVIEW BRANCH `zfmxrrugaihxpubunleu`
-- (read-only, 2026-09-24), Sealand's six subjects — Comfort, Durability,
-- Looks & style, Price, Repair & warranty, Waterproofing — all read
-- `status = 'active'`, `created_by = null`, `named_at = 2026-09-23`, and
-- `config_changes` where `surface = 'subjects'` holds SIX rows, every one of
-- them `field = 'calibration'` from `scripts/subject-calibration.ts`. Not one
-- row records that any of the six was created. Six subjects, six months of
-- readings hanging off them, and no record of the decision.
--
-- WHY IT HAS TO BE A SECOND TRIGGER AND NOT ONE WIDENED CLAUSE. The UPDATE
-- trigger's WHEN reads `old.status`, which does not exist on an INSERT;
-- PostgreSQL will not take one trigger that is `after insert or update of
-- status` with that clause. Two triggers on one function, branching on
-- `TG_OP`, is the shape — and it keeps the UPDATE arm byte-for-byte what M4
-- installed, so re-applying this file cannot weaken the retirement record.
--
-- THE DEDUPE, AND WHY IT IS `created_by IS NULL`.
-- `lib/subjects/moves.ts nameSubject` ALREADY writes its own `config_changes`
-- row ("named a subject" / "renamed a subject", `field = 'subjects'`,
-- `before = null`) through `recordConfigChange`, so a trigger that fired on
-- every insert would put two rows behind one click. The discriminator is on
-- the row itself: M4's insert policy is
-- `with check (… and created_by = (select auth.uid()) …)`, so EVERY insert a
-- browser can make carries a non-null `created_by`, and the column is in the
-- insert grant precisely so it can be pinned. A NULL there means the row did
-- not come through the product — a seed script, an operator's service-role
-- write, hand-run SQL — which is exactly the set the application's own log
-- cannot cover. `activateSubject` and `retireSubject` are unaffected: they are
-- UPDATEs, they log nothing app-side by design ("NOT LOGGED HERE"), and the
-- UPDATE arm keeps logging them.
--
-- A service-role insert that DOES set `created_by` is also skipped. That is
-- deliberate and it is the weaker half of the rule: the column then claims a
-- person made the decision, and if it claims that, it has also taken
-- responsibility for logging it. Nothing in the repo writes subjects that way
-- today (`nameSubject` is the only insert site, and it is the UI path).
--
-- WHAT THE ROW SAYS. `before` is null — the subject did not exist. `after`
-- carries the id, the name, the status and the origin. The note names which
-- kind of decision it was, in the words the two UI paths use for the same
-- moves, so a reader of the log sees one vocabulary and not two:
--   born `active`    -> "confirmed", the word `activateSubject` returns
--                       ("Confirmed. It starts being counted from the next
--                       update.")
--   born `proposed`  -> "named", the word `nameSubject` logs
--   born `retired`   -> said plainly, because the CHECK permits it and a
--                       subject that arrives already closed is worth a line.
--
-- Idempotent: `create or replace function` and `drop trigger if exists` before
-- each `create trigger`, so this file applies twice with the same result. It
-- writes no row itself and back-fills nothing — the six subjects already on
-- the branch stay unrecorded, because inventing an actor for them afterwards
-- is what `source = 'reconstructed'` exists to refuse to do quietly.
--
-- EXERCISED, NOT ONLY WRITTEN. On a throwaway PostgreSQL 17.11 cluster built
-- from `schema-baseline.sql` plus every migration in this directory in filename
-- order (2026-09-24), as the owner:
--
--   pg_trigger on public.subjects -> FIVE, no duplicates: subjects_insert_audit
--     (AFTER INSERT … WHEN new.created_by IS NULL), subjects_status_audit
--     (AFTER UPDATE OF status …), and M4's three others untouched
--   insert … status='active',  created_by null -> ONE config_changes row,
--     before null, "Confirmed on creation…", source 'trigger'
--   insert … status defaulted, created_by null -> ONE row, "Named on creation,
--     still proposed…"
--   insert … status='active',  created_by set  -> ZERO rows. The dedupe holds.
--   update … status='retired'                  -> M4's row, active -> retired,
--     with M4's freezing sentence, unchanged
--   update … proposed -> active                -> a row with no note, as before
--   both new files re-applied TWICE more: no error, still five triggers, and a
--     further insert produced exactly one row.

create or replace function public.subjects_status_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := null;
  v_caller text;
  v_kind   text;
  v_user   uuid := null;
  v_label  text := null;
  v_before jsonb;
  v_after  jsonb;
  v_note   text;
begin
  begin v_uid := auth.uid(); exception when others then v_uid := null; end;
  -- Not `current_user`: inside SECURITY DEFINER that names the owner, so every
  -- caller would read as `postgres`.
  begin v_caller := nullif(auth.role(), ''); exception when others then v_caller := null; end;
  v_caller := coalesce(v_caller, session_user);

  if v_caller = 'authenticated' then
    v_user := v_uid;
    v_kind := case
                when v_uid is not null
                 and exists (select 1 from public.platform_admins pa where pa.user_id = v_uid)
                then 'operator' else 'user'
              end;
    begin v_label := nullif(auth.jwt() ->> 'email', ''); exception when others then v_label := null; end;
    v_label := coalesce((select u.email from public.users u where u.id = v_uid), v_label, v_caller);
  else
    -- service_role covers the operator scripts and the pipeline alike, and hand
    -- run SQL is neither. Indistinguishable here, which is what 'script' and
    -- 'sql' say.
    v_kind  := case v_caller when 'service_role' then 'script' else 'sql' end;
    v_label := v_caller;
  end if;
  if v_user is not null and not exists (select 1 from public.users u where u.id = v_user) then
    v_user := null;
  end if;

  if TG_OP = 'INSERT' then
    -- The subject did not exist, so there is no `before`. `origin` goes in
    -- because on this path it is the only thing that says where the name came
    -- from — there is no person on the row to ask.
    v_before := null;
    v_after  := jsonb_build_object(
                  'id', NEW.id, 'name', NEW.name, 'status', NEW.status, 'origin', NEW.origin);
    v_note   := case NEW.status
                  when 'active' then 'Confirmed on creation: this subject was counted from the moment it was written, and it was not written through the product — no member confirmed it.'
                  when 'proposed' then 'Named on creation, still proposed: nothing is counted for it until somebody confirms it.'
                  else 'Created already retired: its months are closed and a frozen monthly reading is never rewritten.'
                end;
  else
    v_before := jsonb_build_object('id', NEW.id, 'name', NEW.name, 'status', OLD.status);
    v_after  := jsonb_build_object('id', NEW.id, 'name', NEW.name, 'status', NEW.status, 'superseded_by', NEW.superseded_by);
    v_note   := case when NEW.status = 'retired'
                  then 'Retiring a subject freezes every month it still had open, and a frozen monthly reading is never rewritten.'
                  else null end;
  end if;

  insert into public.config_changes
    (client_id, surface, field, before, after, actor_kind, actor_user_id, actor_label, source, note)
  values (
    NEW.client_id, 'subjects', 'subjects', v_before, v_after,
    v_kind, v_user, v_label, 'trigger', v_note
  );
  return null;  -- AFTER trigger: the return value is ignored
end
$$;

comment on function public.subjects_status_audit() is
  'Logs a subject''s creation and every later change to its status into config_changes, with the actor taken from identity rather than from a payload. Two triggers, one function: the UPDATE arm is M4''s, because retiring a subject permanently freezes its open months and the write that does it is a member PATCH the application cannot intercept; the INSERT arm fires only when created_by is null, which is every write that did NOT come through the product — the product''s own insert path logs itself and pins the actor on the row.';

-- M4's trigger, restated unchanged so the file is self-contained and a
-- re-apply cannot leave the two arms out of step.
drop trigger if exists subjects_status_audit on public.subjects;
create trigger subjects_status_audit
  after update of status on public.subjects
  for each row when (new.status is distinct from old.status)
  execute function public.subjects_status_audit();

drop trigger if exists subjects_insert_audit on public.subjects;
create trigger subjects_insert_audit
  after insert on public.subjects
  for each row when (new.created_by is null)
  execute function public.subjects_status_audit();

-- VERIFICATION (WP22 style — run it after the apply and read the answer).
--
-- 1 · Both triggers installed, and no third:
--
--   select tgname, tgtype, pg_get_triggerdef(oid) from pg_trigger
--    where tgrelid = 'public.subjects'::regclass and not tgisinternal
--    order by tgname;
--
-- Expect FOUR rows — `subjects_insert_audit` (AFTER INSERT … WHEN new.created_by
-- IS NULL), `subjects_status_audit` (AFTER UPDATE OF status …),
-- `subjects_retirement_freeze` and `subjects_retirement_is_final`, the last two
-- M4's and untouched.
--
-- 2 · The two paths, on a THROWAWAY cluster only — this inserts rows:
--
--   insert into public.subjects (client_id, name, origin)
--     values ('<a client id>', 'Trigger probe', 'client');          -- created_by null
--   insert into public.subjects (client_id, name, origin, created_by)
--     values ('<a client id>', 'UI probe', 'client', '<a user id>'); -- created_by set
--   select after->>'name' as nm, before is null as born, note
--     from public.config_changes
--    where surface='subjects' and source='trigger' order by changed_at desc limit 5;
--
-- Expect ONE row, for 'Trigger probe', `born = t`, the "Confirmed on creation"
-- note (the column defaults to 'proposed', so pass `status` explicitly to see
-- the other arm). 'UI probe' must produce NOTHING here — that is the dedupe,
-- and a second row for it means the product would log every naming twice.
--
-- 3 · The UPDATE arm is unchanged:
--
--   update public.subjects set status='retired' where name='Trigger probe';
--   select before->>'status', after->>'status', note from public.config_changes
--    where surface='subjects' and source='trigger' order by changed_at desc limit 1;
--
-- Expect `active` -> `retired` and M4's freezing sentence, exactly as before.
