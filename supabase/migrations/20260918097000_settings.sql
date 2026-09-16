-- Settings' four record surfaces, opened to the tenant that owns them
-- (Phase 1 WP16, design item 29, decisions V and U, 2026-09-18).
--
-- Four unrelated-looking changes, one reason: Settings stops being an operator
-- console and becomes seven sub-pages a client reads. Each of the four is the
-- narrowest thing that lets one of those sub-pages tell the truth.
--
-- 1. gate_verdicts — a tenant SELECT policy, and a COLUMN grant that withholds
--    the scraped text. Readiness' row 8 reads three scalars off this table
--    (rows, kept, first). Today the table is is_superadmin() only, so a session
--    client's read comes back EMPTY rather than FORBIDDEN — PostgREST returns
--    no error for a row RLS filtered — and lib/readiness/compute.ts turns that
--    silence into "what was looked at and set aside is not recorded at all",
--    a confident falsehood on the one page whose premise is that every row is a
--    measurement (lib/readiness/types.ts). A filtered read is not an error, so
--    the module's no-quiet-zero discipline cannot catch this; only a policy can.
--
--    The policy is row-level and therefore keys on client_id and NEVER on role.
--    Össur has five workspace members, three of them role='member', and
--    caption_excerpt is 200 characters of a third party's public caption,
--    scraped (lib/gather/gate-verdicts.ts CAPTION_EXCERPT_CHARS); account_name
--    and reason are the gate's own words about a stranger's post. canManageTenant
--    gates the PAGE; PostgREST is a separate door with the same key. So the text
--    is withheld by column grant — PostgreSQL applies column privileges
--    underneath RLS — and the reject log's excerpt view stays a server-component
--    read on the service role, gated canManageTenant. That is decision V's
--    shape: the counts are the tenant's, the stranger's words are not.
--
-- 2. gate_appeals — "this should have been kept", which had no column, no table
--    and no route. It files a complaint to an operator queue; it does not
--    re-gather. A re-gather is Apify money spent from a button, and the honest
--    answer to "why was this dropped" is a person reading the verdict, not the
--    same gate running again on the same caption.
--
-- 3. report_schedules.artefact — the recipient table's key. ST6 asks who
--    receives which artefact; the product has one row per tenant called
--    "Weekly digest" and no way to say "the monthly reading goes to these four
--    and the sales brief to those two". Seven artefacts exist after Phase 1
--    (weekly, monthly, quarterly and the four briefs) and a schedule now names
--    which of them it sends.
--
-- 4. video_claims — a tenant SELECT policy restricted to the tenant's OWN
--    claims, with the verbatim quote withheld. Subjects pre-fills its candidates
--    from what the client's own videos say (design item 22). A rival's claims
--    are not the tenant's to read, and the quote is a whole sentence out of a
--    third party's transcript — the gate_verdicts limb again, and worse, because
--    these are sentences rather than 200-char excerpts.
--
-- Every object here is additive. Nothing is dropped, no data moves, and the
-- existing superadmin policies stay (permissive policies OR together, so an
-- operator standing in their own workspace keeps reading through the session
-- client, and an operator viewing ANOTHER workspace arrives on the service-role
-- client already — lib/auth.ts applyOperatorView — and bypasses both).

-- ============================================================================
-- 1 · gate_verdicts — the tenant reads the counts, never the caption
-- ============================================================================

drop policy if exists "Members read their gate verdicts" on public.gate_verdicts;
create policy "Members read their gate verdicts" on public.gate_verdicts
  for select to authenticated using (client_id = public.get_my_client_id());

-- Stated, not inherited from whatever this project's default ACL happens to be
-- (the config_changes precedent, 2026-09-15). Note what is NOT in the list:
-- caption_excerpt, account_name and reason. A tenant session selecting one of
-- them is refused ("permission denied for table gate_verdicts" — a column-grant
-- denial is reported against the table, because there is no table-level SELECT
-- to fall back to); a tenant session selecting the other nine gets its own rows
-- and no other tenant's.
revoke all on public.gate_verdicts from authenticated, anon;
grant select (id, client_id, run_id, platform, video_id, keyword, kept, source, created_at)
  on public.gate_verdicts to authenticated;

-- The gate writer is the pipeline, on the service-role key, and it UPSERTS.
-- lib/gather/gate-verdicts.ts recordGateVerdicts is
-- `.upsert(part, { onConflict: 'client_id,run_id,platform,video_id' })`,
-- deliberately: the step it runs in can replay, and a re-insert would double
-- every survival rate the table exists to measure. PostgreSQL requires the
-- UPDATE privilege to PLAN an `insert ... on conflict do update`, whether or
-- not a row actually conflicts — so a revoke here does not harden the record,
-- it stops the record being written at all. Every platform's
-- recordGateVerdicts would throw, lib/gather/gather.ts would push "gate
-- verdicts not recorded" into `errors`, and every run would read `partial`
-- while the reject log, the per-term kept-rate and readiness row 8 quietly
-- stopped growing. (Exercised: with insert alone, a plain INSERT succeeds and
-- the same statement with ON CONFLICT DO UPDATE fails "permission denied for
-- table gate_verdicts".)
--
-- So the grant follows the writer, and what is withheld is what the writer
-- never does: nothing in the repo DELETES a verdict, and a record its own
-- writer can erase answers no question worth asking (the rec_decisions
-- precedent). lib/readiness/load.ts, lib/reading/record.ts and the scripts
-- read.
grant select, insert, update on public.gate_verdicts to service_role;
revoke delete, truncate on public.gate_verdicts from service_role;

comment on column public.gate_verdicts.caption_excerpt is
  'Two hundred characters of a third party''s public caption, scraped. NOT granted to `authenticated` (WP16): a row-level policy keys on client_id and never on role, so granting it would publish every stranger''s caption to every member of the workspace. The reject log serves it through a server component gated canManageTenant, on the service-role client.';

-- ============================================================================
-- 2 · gate_appeals — "this should have been kept"
-- ============================================================================
-- Append-only, and one appeal per verdict. The key is gate_verdicts_unique's
-- key — (client_id, run_id, platform, video_id) — because an appeal is about
-- one verdict and a second click is the same complaint, not a second one. No
-- foreign key to gate_verdicts: that table's primary key is its identity
-- column, not the natural key, and an appeal must survive the verdict being
-- pruned. The cascade that matters (the client) is declared.
--
-- No status column and no resolution column. An appeal is a thing a person
-- said on a date; what we then did about it is a configuration change, and
-- config_changes is where a configuration change is written down. A status here
-- would be a second record of the same act, kept in the one place nobody reads.

create table if not exists public.gate_appeals (
  id uuid default gen_random_uuid() primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  run_id uuid references public.pipeline_runs(id) on delete set null,
  platform text not null,
  video_id text not null,
  -- The person, not the role. Null once they leave the workspace; the appeal
  -- stays, because the operator queue is about the post, not about who filed.
  filed_by uuid references public.users(id) on delete set null,
  filed_at timestamptz not null default now(),
  -- Optional. "This should have been kept" is itself the whole complaint most
  -- of the time; the note is where a client says why they think so.
  note text
);

-- TWO PARTIAL INDEXES, BECAUSE NULLS ARE DISTINCT. gate_verdicts.run_id is
-- nullable and this key mirrors it, so a single unique index over the four
-- columns would let the same verdict be appealed any number of times whenever
-- run_id is null — the 23505 "Already filed" branch in the appeal action would
-- simply never fire, and the comment above would be a claim the database does
-- not keep. The UI folds a null run to 'none' and hides the button, so this is
-- the constraint catching up with the sentence rather than a live duplicate.
create unique index if not exists gate_appeals_one_per_verdict
  on public.gate_appeals (client_id, run_id, platform, video_id)
  where run_id is not null;
create unique index if not exists gate_appeals_one_per_unrun_verdict
  on public.gate_appeals (client_id, platform, video_id)
  where run_id is null;
create index if not exists gate_appeals_queue_idx
  on public.gate_appeals (client_id, filed_at desc);

alter table public.gate_appeals enable row level security;

-- The tenant files and reads its own appeals. Unlike the verdict it is about,
-- every column here was written by the tenant, so there is nothing to withhold.
drop policy if exists "Members read their gate appeals" on public.gate_appeals;
create policy "Members read their gate appeals" on public.gate_appeals
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.gate_appeals from authenticated, anon;
grant select on public.gate_appeals to authenticated;
-- The filing goes through a server action on the service-role client, gated
-- canManageTenant and stamped with the caller's own user id — the same shape
-- every other client-facing write takes, and the reason `authenticated` holds
-- no INSERT here: a crafted POST must not be able to file under another
-- person's name.
grant select, insert on public.gate_appeals to service_role;
revoke update, delete, truncate on public.gate_appeals from service_role;

comment on table public.gate_appeals is
  'A client saying a discarded post should have been kept (design ST5, Phase 1 WP16). Append-only, one per verdict, keyed the way gate_verdicts_unique is keyed. Filing does NOT re-gather the video — it files to an operator queue, because a re-gather is Apify money spent from a button and the useful answer is a person reading the verdict.';

-- ============================================================================
-- 3 · report_schedules.artefact — who receives which artefact
-- ============================================================================
-- Nullable, deliberately. A schedule that names no artefact is the legacy
-- "Weekly digest" starter, which WP17 retires; until it does, null means "the
-- starter template this row already names", and a reader prints that rather
-- than guessing. The backfill below claims only what is provably the weekly
-- digest, and leaves anything else for a person.

alter table public.report_schedules add column if not exists artefact text;

alter table public.report_schedules drop constraint if exists report_schedules_artefact_check;
alter table public.report_schedules add constraint report_schedules_artefact_check
  check (artefact is null or artefact in (
    'weekly', 'monthly', 'quarterly',
    'brief:sales', 'brief:leadership', 'brief:marketing', 'brief:content'
  ));

comment on column public.report_schedules.artefact is
  'Which artefact this schedule sends: weekly | monthly | quarterly | brief:<audience> (sales, leadership, marketing, content). Null on a legacy starter schedule that predates the seven. One row per artefact per tenant.';

-- One row per artefact per tenant. A partial unique index rather than a
-- constraint, because null must stay repeatable while the legacy rows live.
create unique index if not exists report_schedules_one_per_artefact
  on public.report_schedules (client_id, artefact) where artefact is not null;

-- The two live rows are both the workspace digest, both named 'Weekly digest'
-- and both carrying starter_key 'weekly_digest'. That, and only that, is what
-- is claimed here: a hand-made schedule pointing at a workspace template is
-- left null for a person to name.
update public.report_schedules
   set artefact = 'weekly'
 where artefact is null
   and is_default
   and starter_key = 'weekly_digest';

-- The quarterly review (item 14) runs four times a year, which no cadence in
-- this table could express. Dropped and rebuilt rather than ALTERed: the
-- constraint's name is the contract, and a second constraint with a generated
-- name would be invisible to the next person who reads the table.
alter table public.report_schedules drop constraint if exists report_schedules_cadence_check;
alter table public.report_schedules add constraint report_schedules_cadence_check
  check (cadence in ('every_update', 'monthly', 'quarterly'));

-- ============================================================================
-- 4 · video_claims — the tenant's own claims, without the verbatim quote
-- ============================================================================
-- RLS has been ON with zero policies since the table was created: service role
-- only, by construction (lib/pipeline/schemas.ts — Pass D-a resolves claims
-- into run_summary.say_vs_hear so the UI never needed the table). Subjects
-- changes that: item 22 pre-fills candidate subjects from what the client's own
-- videos claim, and those ~105 rows per tenant are the population.
--
-- entity = 'client' sits in the USING clause, not only in the query. A rival's
-- claims (354 Össur rows, 271 Sealand) are not the tenant's to read in full
-- sentences, and a policy that relied on the query to say so would be a policy
-- that protects nothing.

drop policy if exists "Members read their own-voice claims" on public.video_claims;
create policy "Members read their own-voice claims" on public.video_claims
  for select to authenticated
  using (client_id = public.get_my_client_id() and entity = 'client');

revoke all on public.video_claims from authenticated, anon;
grant select (id, client_id, run_id, platform, source_video_id, entity, claim, created_at)
  on public.video_claims to authenticated;
grant select, insert, delete on public.video_claims to service_role;

comment on column public.video_claims.quote is
  'The verbatim line from the video''s own transcript that the claim was read out of. NOT granted to `authenticated` (WP16), for the reason gate_verdicts.caption_excerpt is not: it is a whole sentence of a third party''s speech, and a row-level policy cannot tell a member from an owner. The subject proposer reads it server-side and hands the browser labels and counts.';

-- ============================================================================
-- EXERCISED before it was ever applied, on a throwaway PostgreSQL 17 cluster
-- over schema-baseline.sql + every 2026 migration in filename order, applied
-- TWICE:
--   * idempotent — the second apply creates nothing twice, rebuilds the two
--     named check constraints to the same definition, and the artefact backfill
--     claims nothing a second time (it is a null-guarded UPDATE);
--   * a tenant session reads its own gate_verdicts rows and no other tenant's,
--     and `select caption_excerpt`, `select account_name` and `select reason`
--     are each refused — PostgreSQL reports a column-grant denial as
--     "permission denied for TABLE gate_verdicts", because there is no
--     table-level SELECT to fall back to, so that is the message an operator
--     chasing this will see;
--   * the same session holds no insert, update or delete on gate_verdicts;
--     service_role's own write — the product's write, an INSERT ... ON CONFLICT
--     DO UPDATE over the natural key — succeeds and updates the conflicting row
--     rather than doubling it, and service_role's DELETE is refused
--     ("permission denied for table gate_verdicts");
--   * gate_appeals takes one row per (client, run, platform, video) and refuses
--     the second — with a run id on gate_appeals_one_per_verdict, and WITHOUT
--     one on gate_appeals_one_per_unrun_verdict, which a single index over the
--     four columns did not catch because NULLs are distinct; a tenant session
--     reads its own and its INSERT is refused; service_role's DELETE is
--     refused;
--   * video_claims hands a tenant session its own `client` claim and NOT the
--     `competitor` row beside it (the entity predicate is in the policy), and
--     `select quote` is refused;
--   * report_schedules accepts every one of the seven artefact values and
--     refuses an eighth; the partial unique index refuses a second 'weekly' for
--     one client and permits two nulls; cadence accepts 'quarterly' and still
--     refuses a value that was never in the set.
-- ============================================================================
