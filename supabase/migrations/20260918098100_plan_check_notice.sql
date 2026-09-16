-- The clipped-document notice, persisted (Phase 1 WP21, design item 15 / C11,
-- 2026-09-16).
--
-- WHAT IS BROKEN TODAY. /api/agent's document mode COMPUTES a notice — "that
-- document was longer than I can read in one go, only the earlier part was
-- checked" — returns it in the JSON body, and throws it away: the composer
-- only `router.push`es to the thread, and the thread page hard-codes
-- `notice={null}`. So a client whose 90-page deck was read to 60,000
-- characters is shown verdicts over the whole document with nothing saying
-- where the reading stopped. The same is true of the page warning on a
-- document past ASK_PDF_MAX_PAGES. `plan_checks` has nowhere to put it, which
-- is why it is a column and not a feature.
--
-- WHY IT BELONGS ON THE CHECK AND NOT ON THE THREAD. The notice is a fact
-- about what was READ — the same fact `input_text` already carries, clipped to
-- exactly what the engine saw. A reader arriving at the stored check a month
-- later needs it as much as the person who uploaded it, and an export renders
-- from the same loader.
--
-- WHY THIS FILE AND NOT M9. The plan puts this column in M9
-- (`20260918098000_sent_figures.sql`), which belongs to WP18 and is being
-- written in a sibling worktree at the same time as this one. Two packages
-- creating one new file is an add/add conflict at merge, resolved by hand, on a
-- file that also carries a freeze guard — so the column takes its own file,
-- sorting immediately after M9, and the R2 checklist applies both. It is one
-- idempotent ALTER with no dependency on anything in M9.
--
-- IDEMPOTENT: `add column if not exists` plus grants, which are idempotent in
-- PostgreSQL. Applied twice, the second run changes nothing.

alter table public.plan_checks add column if not exists notice text;

comment on column public.plan_checks.notice is
  'What the reader must be told about the READING of this document, not about its verdicts: that it was clipped at ASK_INPUT_CHARS, or that it runs past ASK_PDF_MAX_PAGES. Null means the whole document was read. Written once at the check and never rewritten — it is a fact about a reading that already happened.';

-- THESE GRANTS ARE BELT AND BRACES, NOT A REQUIREMENT — and the first version
-- of this comment said the opposite, so the correction is worth its space. It
-- claimed that column-level grants do not extend to a column added later and
-- that this project's table grants were expanded per column when they were
-- issued, so a new column carries no privilege until it is named. The first
-- half is true of PostgreSQL; the second is false of THIS TABLE. Verified
-- read-only on production: plan_checks carries TABLE-level grants and no column
-- ACLs at all (pg_class.relacl = postgres/anon/authenticated/service_role each
-- arwdDxtm, and pg_attribute.attacl is null on every column), so a table grant
-- already covers `notice` the moment it exists and these two statements change
-- nothing there. Six tables in public DO carry per-column ACLs — initiatives,
-- invitations, rec_decisions, recommendations, share_links, tracking_configs —
-- which is where the rule came from and why it must not be carried to the next
-- migration as a project-wide fact. It is a per-table question, answered by
-- looking.
--
-- They stay because they are additive and idempotent, revoke nothing, and are
-- load-bearing where the claim was checked: supabase/schema-baseline.sql
-- contains ZERO grant statements, so on a freshly built local cluster
-- `authenticated` holds only what a migration grants it and the column really
-- is unreadable without this line. That is also why the local verification
-- could not have caught the false rationale.
--
-- `anon` is not granted here, following the Phase 1 convention rather than the
-- older shape this table carries. On production that changes nothing either:
-- anon already holds SELECT on plan_checks through the table grant, and only
-- RLS keeps it out (get_my_client_id() has nothing to resolve for it).
grant select (notice) on public.plan_checks to authenticated;
grant select (notice), insert (notice), update (notice) on public.plan_checks to service_role;
