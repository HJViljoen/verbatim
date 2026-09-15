-- Subjects: the 5–8 things a tenant wants to be measured on, in its own words
-- (Phase 1 WP4, design items 4 and 22, decisions E and K, 2026-09-18).
--
-- WHAT A SUBJECT IS, AND WHY IT IS NOT A THEME. A theme is a clustering
-- artefact: Pass A2 groups this run's insights and a reasoning model writes the
-- label, so labels churn ~88% run to run and a registry entry's membership is
-- re-decided every Sunday. A subject is the opposite — the client names it once
-- ("comfort", "price", "looks medical") and it does not move. Everything below
-- follows from that one difference:
--
--   * identity is a row id, never the name. SU1 says a rename starts a NEW
--     line and keeps the old one, so `name` carries no UPDATE grant at all: a
--     rename is an INSERT of a new subject plus `status='retired'` and
--     `superseded_by` on the old one. `description` is withheld for the same
--     reason and it is not pedantry — the judge reads the description and the
--     phrase vector is built from it, so editing it silently re-decides
--     membership under an unchanged judge_version and every month already
--     frozen becomes a month about something slightly else.
--   * membership is stored per (subject, insight) PAIR, cascading from the
--     insight, because insight ids churn: Pass A deletes and re-inserts a
--     re-read video's rows and prune-stale-analysis hard-deletes the
--     superseded ones. Measured 2026-09-15: one run replaced 20.1% (Össur) /
--     33.8% (Sealand) of the live insight population, and one run back, 20–44%
--     of a stored member set no longer resolves. A membership table is a
--     one-week artefact by construction and the freeze is what makes it a
--     record.
--   * the month table's comparability key is `judge_version`, NOT the run. A
--     subject reading has no clustering; what makes two of its months
--     like-for-like is that the same judge, at the same thresholds, read them.
--     `run_id` rides along as bookkeeping (which update's membership step wrote
--     the row), exactly as it does for a theme — but a reader compares on
--     judge_version.
--
-- WHAT THIS FILE CREATES
--   1. subjects                — the named set, and its calibration state
--   2. subject_memberships     — one decision per (subject, insight) pair
--   3. subject_band()          — the pairs a membership run must act on
--   4. month_subject_readings  — the record, same freeze contract as themes
--   5. monthly_subject_readings() / window_subject_readings()
--   6. moves                   — "Track this", append-only for members
--
-- Applied by hand in window W1, with no run in flight, and AFTER
-- 20260918092000_reading_windows.sql (M3) — not merely after it in filename
-- order, but dependent on it: month_subject_readings' INSERT guard calls
-- public.month_reading_frozen_insert_guard(), which M3 creates, and that
-- function does not exist in production today. Applied alone this file fails
-- on the trigger statement. It also needs 20260915092000_monthly_reading.sql
-- for month_reading_frozen_guard(), which IS applied.
--
-- Idempotent: every object is `if not exists` or `create or replace`, and the
-- three triggers are dropped before they are created. Exercised twice on a
-- throwaway PostgreSQL 17 cluster over schema-baseline.sql plus every 2026*
-- migration in filename order; the checks are listed at the foot.

-- 1. The named set -------------------------------------------------------------
create table if not exists public.subjects (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  -- The client's own words. Short on purpose: the proposer writes a noun
  -- phrase a buyer would say out loud, not a theme label.
  name          text not null check (char_length(trim(name)) between 1 and 60),
  -- One sentence the judge reads. Part of the measurement, not decoration.
  description   text check (description is null or char_length(description) <= 400),
  -- Where the candidate came from, kept so Settings can say why it was offered.
  origin        text not null check (origin in ('own_claims', 'category_theme', 'client')),
  -- video_claims.id or theme_registry.id, depending on origin. No foreign key:
  -- a claim's video can be deleted by retention and the provenance of a name
  -- the client has since confirmed must outlive it (the rec_decisions.lineage_id
  -- precedent).
  source_ref    uuid,
  named_at      date not null default current_date,
  status        text not null check (status in ('proposed', 'active', 'retired')) default 'proposed',
  -- The subject that replaced this one, when a rename or an edit minted a new
  -- row. The old line is kept and the new one starts here.
  superseded_by uuid references public.subjects(id) on delete set null,
  -- The phrase vector, in the insight vector space (EMBEDDING_MODEL,
  -- text-embedding-3-small, 1536 dims). Written by the membership runner, not
  -- by a browser.
  embedding     vector(1536),
  embedded_at   timestamptz,
  -- lib/subjects/types.ts SUBJECT_EMBED_INPUT_VERSION — which text formula
  -- produced `embedding`. Two vectors from different formulas are not
  -- comparable, and the repair has to be a query rather than an archaeology
  -- (the EMBED_INPUT_VERSION precedent, lib/pipeline/cluster.ts).
  embed_input_version text,
  -- The precision gate (design :891). Null until a hand-labelled sample has
  -- been scored at the shipped thresholds; a subject with a null here prints
  -- "calibrating" and its share is not shown to a client.
  calibrated_at timestamptz,
  calibration_precision numeric check (calibration_precision is null or (calibration_precision >= 0 and calibration_precision <= 1)),
  calibration_n int check (calibration_n is null or calibration_n >= 0),
  -- WHICH judge the precision above was measured under. A stored 85% from a
  -- band that no longer exists is not evidence about the numbers the subject is
  -- carrying now, so moving a threshold or the prompt puts every subject back
  -- to "calibrating" rather than inheriting a figure it did not earn
  -- (lib/subjects/types.ts subjectCalibration).
  calibration_judge_version text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.subjects is
  'The 5-8 things a tenant asked to be measured on, in its own words. Identity is `id`, never `name`: renaming or re-describing a subject mints a NEW row (status retired + superseded_by on the old one) because the judge reads the name and the description, so an edit in place would re-decide membership under an unchanged judge_version and quietly change what every frozen month was about.';
comment on column public.subjects.description is
  'One sentence the membership judge reads and the phrase vector is built from. Not updatable by a member, deliberately — see the table comment.';
comment on column public.subjects.calibrated_at is
  'When precision was last measured on a hand-labelled sample (scripts/subject-calibration.ts). Null means the subject prints "calibrating" and no share of it is shown to a client (design :891).';
comment on column public.subjects.superseded_by is
  'The subject that replaced this one. A rename keeps the old line rather than re-keying it: month_subject_readings.subject_id is part of a frozen primary key and a frozen row cannot be re-keyed, the same rule month_denominators.audience carries for a rival name.';

-- One live subject per name per tenant. Retired rows are excluded: the whole
-- point of a rename is that the old name keeps its line.
create unique index if not exists subjects_live_name_idx
  on public.subjects (client_id, lower(trim(name))) where status <> 'retired';
create index if not exists subjects_client_status_idx
  on public.subjects (client_id, status, named_at);

-- `superseded_by` is a lineage, and a lineage that crosses tenants is a lineage
-- that reads as one subject's history and is two workspaces'. The foreign key
-- cannot say so — it admits any subjects row — and the column IS in the member
-- update grant (that is how a rename joins the old line to the new), so the
-- rule is a trigger. Under RLS a member cannot even see another tenant's
-- subject, so the `exists` fails and the message is the same one service_role
-- gets.
create or replace function public.subjects_lineage_same_tenant()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.superseded_by is null then
    return new;
  end if;
  if new.superseded_by = new.id then
    raise exception 'subjects.superseded_by cannot name its own row'
      using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.subjects s
    where s.id = new.superseded_by and s.client_id = new.client_id
  ) then
    raise exception 'subjects.superseded_by must name a subject of the same tenant'
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

comment on function public.subjects_lineage_same_tenant() is
  'Keeps a subject''s lineage inside one tenant: superseded_by must name a subject of the same client, and never the row itself. The foreign key admits any subjects row and the column is in the member update grant, so the rule has to be a trigger.';

drop trigger if exists subjects_lineage_same_tenant on public.subjects;
create trigger subjects_lineage_same_tenant
  before insert or update of superseded_by, client_id on public.subjects
  for each row execute function public.subjects_lineage_same_tenant();

-- 2. Membership — one decision per (subject, insight) pair ---------------------
create table if not exists public.subject_memberships (
  subject_id          uuid not null references public.subjects(id) on delete cascade,
  -- ON DELETE CASCADE, and it is load-bearing rather than tidy: the Pass A
  -- prune hard-deletes superseded insights, so without the cascade this table
  -- would accumulate the same dangling references theme_observations already
  -- carries (20-44% one run back, measured 2026-09-15). A membership whose
  -- insight is gone is not a fact about anything.
  audience_insight_id uuid not null references public.audience_insights(id) on delete cascade,
  client_id           uuid not null references public.clients(id) on delete cascade,
  -- The decision. A judged NO is stored: it is the expensive answer, and not
  -- storing it would re-buy it from the model every single update.
  member              boolean not null,
  -- How it was decided. `embedding_high` is the vector alone above the high
  -- threshold; `judge` is a gpt-4.1-mini call on a pair inside the band.
  -- `client` is a hand correction from Settings, and it outranks both:
  -- subject_band() excludes a pair with a `client` row whatever judge version
  -- it carries, so a threshold move or a prompt change re-judges everything
  -- EXCEPT what a person decided.
  method              text not null check (method in ('embedding_high', 'judge', 'client')),
  -- Cosine similarity at the moment of the decision, when a vector produced it.
  score               numeric,
  -- lib/subjects/types.ts JUDGE_VERSION: the model, the prompt and BOTH
  -- thresholds, folded into one string. It is the month reading's
  -- comparability key, so it has to change whenever the answer could.
  judge_version       text not null,
  judged_at           timestamptz not null default now(),
  -- Which update decided it. Bookkeeping; never a period key.
  run_id              uuid references public.pipeline_runs(id) on delete set null,
  primary key (subject_id, audience_insight_id)
);

comment on table public.subject_memberships is
  'One row per (subject, insight) pair that has been decided, members and judged non-members alike. Pairs the vector put below the low threshold are absent rather than stored: that answer is free to recompute and storing it would put the whole corpus in this table. Cascades from the insight because insight ids churn every run.';
comment on column public.subject_memberships.member is
  'The decision. A judged FALSE is stored so the same pair is not re-bought from the model every update; an absent row means "never decided at this judge_version", which is what subject_band() looks for.';

create index if not exists subject_memberships_client_insight_idx
  on public.subject_memberships (client_id, audience_insight_id);
-- The month read's own path: members of one subject.
create index if not exists subject_memberships_member_idx
  on public.subject_memberships (subject_id, client_id) where member;

alter table public.subjects            enable row level security;
alter table public.subject_memberships enable row level security;

drop policy if exists "Members read their subjects" on public.subjects;
create policy "Members read their subjects" on public.subjects
  for select to authenticated using (client_id = public.get_my_client_id());

-- The actor is pinned as well as the tenant, the same rule `moves` carries and
-- for the same reason: a subject is one member saying what this workspace is to
-- be measured on, and the log of who said it is the whole provenance. Without
-- the second clause one member can file a subject under another member's id.
drop policy if exists "Members name their subjects" on public.subjects;
create policy "Members name their subjects" on public.subjects
  for insert to authenticated
  with check (client_id = public.get_my_client_id() and created_by = (select auth.uid()));

drop policy if exists "Members retire their subjects" on public.subjects;
create policy "Members retire their subjects" on public.subjects
  for update to authenticated
  using (client_id = public.get_my_client_id())
  with check (client_id = public.get_my_client_id());

drop policy if exists "Members read their subject memberships" on public.subject_memberships;
create policy "Members read their subject memberships" on public.subject_memberships
  for select to authenticated using (client_id = public.get_my_client_id());

-- The initiatives ACL shape (20260911142000): revoke everything, then hand back
-- exactly the columns a browser may write. What is NOT granted is the design.
revoke all on public.subjects            from authenticated, anon;
revoke all on public.subject_memberships from authenticated, anon;
grant select on public.subjects to authenticated;
grant insert (client_id, name, description, origin, source_ref, created_by)
  on public.subjects to authenticated;
-- No `name`, no `description`, no `origin`, no `named_at`: those are what the
-- measurement means, and an edit to any of them is a new subject. No
-- `calibrated_at` / `calibration_precision` either — a tenant marking its own
-- subject calibrated would empty the gate of its meaning.
grant update (status, superseded_by, updated_at) on public.subjects to authenticated;
grant select on public.subject_memberships to authenticated;
-- Stated, not inherited from whatever the project's default ACL happens to be
-- (the config_changes precedent, 2026-09-15).
grant select, insert, update, delete on public.subjects            to service_role;
grant select, insert, update, delete on public.subject_memberships to service_role;

-- 3. The pairs a membership run must act on -------------------------------------
-- One subject at a time, deliberately. A cross join of every live insight
-- against every subject is 25k cosine comparisons on 1536-dim vectors, and
-- PostgREST logs in as `authenticator`, whose role config carries
-- statement_timeout = 8s — SET ROLE service_role does not lift it. Per subject
-- it is ~3k comparisons and comfortably inside the clock, it gives the runner a
-- natural unit to fan out over, and it degrades one subject at a time rather
-- than all of them at once.
--
-- Returns only pairs at or above the LOW threshold. A pair below it is decided
-- by the vector and costs nothing to recompute, so storing it would put the
-- whole corpus in subject_memberships for no answer anyone reads. Pairs already
-- decided at `p_judge` are excluded, which is what makes the step incremental:
-- a re-read video's insights carry new ids and have no row, so they come back;
-- everything else does not.
--
-- SECURITY DEFINER, service_role only. It reads one tenant's whole insight
-- population by parameter, and a function a tenant could call is a function a
-- tenant could call with someone else's id (the monthly_denominators rule,
-- 20260915092000:245-249).
create or replace function public.subject_band(
  p_client  uuid,
  p_subject uuid,
  p_low     float8,
  p_high    float8,
  p_judge   text
)
returns table (
  audience_insight_id uuid,
  score               float8,
  band                text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with s as (
    select sub.id, sub.embedding
    from public.subjects sub
    where sub.id = p_subject and sub.client_id = p_client and sub.embedding is not null
  )
  select ai.id,
         (1 - (ai.embedding <=> s.embedding))::float8 as score,
         case when (1 - (ai.embedding <=> s.embedding)) >= p_high then 'member' else 'judge' end as band
  from public.audience_insights_current ai
  cross join s
  where ai.client_id = p_client
    and ai.embedding is not null
    and (1 - (ai.embedding <=> s.embedding)) >= p_low
    and not exists (
      select 1 from public.subject_memberships m
      where m.subject_id = s.id
        and m.audience_insight_id = ai.id
        -- Decided at this judge version, OR decided by a person. `client` is a
        -- hand correction from Settings and this is what makes the column
        -- comment true: without the second arm, the next JUDGE_VERSION bump —
        -- the event this design explicitly says to budget for — would hand
        -- every corrected pair back to the model and the upsert on
        -- (subject_id, audience_insight_id) would overwrite the correction with
        -- whatever it said this time. A person's answer is not re-bought.
        and (m.judge_version = p_judge or m.method = 'client')
    )
  order by ai.id
$$;

comment on function public.subject_band(uuid, uuid, float8, float8, text) is
  'The (subject, insight) pairs one membership run must act on: every live insight whose phrase similarity clears p_low and which has neither a decision at p_judge nor a hand correction (method = client) yet, banded `member` at or above p_high and `judge` below it. Pairs under p_low are absent — that answer is the vector''s and is free to recompute. Reads audience_insights_current, as AGENTS.md requires a population read to.';

revoke all on function public.subject_band(uuid, uuid, float8, float8, text) from public, anon, authenticated;
grant execute on function public.subject_band(uuid, uuid, float8, float8, text) to service_role;

-- 4. The record — a subject's month --------------------------------------------
-- The theme table's column set, word for word, because it is the same reading
-- over a different membership: distinct analysed videos carrying a comment
-- dated in the month that a member insight cites, the comments themselves, the
-- platform mix, the undated citations those videos carry, and the members whose
-- only evidence is on camera so no month can take them.
create table if not exists public.month_subject_readings (
  client_id          uuid not null references public.clients(id) on delete cascade,
  month              date not null,
  audience           text not null,
  -- NO ACTION, not cascade: a frozen month is the record, and a service-role
  -- `delete from subjects` would otherwise erase the very rows the freeze
  -- contract exists to protect — silently, and with no way back. A subject with
  -- months is retired (status + superseded_by), never deleted, the same rule
  -- moves.subject_id states one table over. NO ACTION rather than RESTRICT so
  -- that deleting a CLIENT still works: both sides cascade from `clients` in
  -- one statement, and NO ACTION is checked at the end of it, when the
  -- referencing rows are already gone.
  subject_id         uuid not null references public.subjects(id) on delete no action,
  videos             int not null,
  comments           int not null,
  platform_mix       jsonb not null,
  excluded_on_camera int not null default 0,
  excluded_undated   int not null default 0,
  status             text not null check (status in ('filling', 'frozen')),
  origin             text not null check (origin in ('live', 'back_read')),
  read_at            timestamptz not null,
  run_id             uuid references public.pipeline_runs(id) on delete set null,
  -- The comparability key. Not run_id: a subject reading is a judgement
  -- artefact, not a clustering one, and what makes two months like-for-like is
  -- that the same judge at the same thresholds read them.
  judge_version      text not null,
  frozen_at          timestamptz,
  primary key (client_id, month, audience, subject_id)
);

comment on table public.month_subject_readings is
  'One row per tenant per month per audience per subject: the months one judge''s membership reads, by comments.comment_date. Same rule, same columns and same freeze contract as month_theme_readings; the comparability key is judge_version rather than run_id.';
comment on column public.month_subject_readings.judge_version is
  'lib/subjects/types.ts JUDGE_VERSION — model, prompt and both thresholds. Rows of different months may carry different values (a month freezes under whatever judge was current when its 30-day line passed), so a cross-month comparison is like-for-like only where this column is equal.';
comment on column public.month_subject_readings.audience is
  'The literal bucket string, competitor_name included verbatim. A NAME, not an identity, and a frozen row cannot be re-keyed — the same rule and the same wording as month_denominators.audience.';
comment on column public.month_subject_readings.excluded_on_camera is
  'Member insights evidenced only on camera or on screen whose video carries no dated comment at all — a property of the subject in this audience, repeated on each of its month rows, never summed. Window-independent, so the backfill and the pipeline write the same number.';

create index if not exists month_subject_readings_subject_idx
  on public.month_subject_readings (client_id, subject_id, month);

-- Both halves of the freeze contract. Both functions are already generic —
-- month_reading_frozen_guard reads only tg_table_name / old.month /
-- old.audience (20260915092000:191-203), and
-- month_reading_frozen_insert_guard reads the primary key out of the catalogue
-- (20260918092000:520-530) exactly so a later month table attaches it
-- unchanged. No new function; two more trigger statements.
drop trigger if exists month_subject_readings_frozen_guard on public.month_subject_readings;
create trigger month_subject_readings_frozen_guard
  before update on public.month_subject_readings
  for each row when (old.status = 'frozen')
  execute function public.month_reading_frozen_guard();

drop trigger if exists month_subject_readings_frozen_insert_guard on public.month_subject_readings;
create trigger month_subject_readings_frozen_insert_guard
  before insert on public.month_subject_readings
  for each row
  execute function public.month_reading_frozen_insert_guard();

-- Retiring a subject CLOSES the months it is still carrying.
--
-- Without this the copy is a lie in one direction and the numbers are wrong in
-- the other. `retireSubject` tells the client "Stopped. The months it already
-- carries keep their line." — true of a frozen month, false of every month
-- still filling at retirement, because subject_memberships cascades from
-- audience_insights and only ACTIVE subjects are re-judged: a retired subject's
-- member set loses 20-34% of its rows every run (the churn measured
-- 2026-09-15), so its open months would be recomputed downward every Sunday
-- and freeze at a number far below what the client was reading when they
-- stopped. Freezing them at the moment of retirement is what makes the sentence
-- true.
--
-- It is a trigger rather than a second statement in the application for the
-- reason the read functions need: they skip retired subjects, so a retired
-- subject's `filling` row would be stale on the next visit and the stale sweep
-- would DELETE it. Closing the months has to happen wherever the retirement
-- does — the Settings write, an operator script, a hand-run UPDATE.
--
-- SECURITY DEFINER because a member retires a subject on the `authenticated`
-- client, which holds SELECT on month_subject_readings and nothing else. It
-- touches only the retired subject's own rows, and only ones that are still
-- filling, so the BEFORE UPDATE frozen guard (which fires only on
-- old.status = 'frozen') never sees it.
create or replace function public.subject_retirement_freeze()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.month_subject_readings
     set status = 'frozen', frozen_at = now()
   where client_id = new.client_id
     and subject_id = new.id
     and status = 'filling';
  return new;
end;
$$;

comment on function public.subject_retirement_freeze() is
  'Freezes a retired subject''s still-filling months at the moment of retirement. A retired subject is not re-judged, so its membership decays with every Pass A prune; leaving its open months to be recomputed would freeze them at a number the client never saw.';

drop trigger if exists subjects_retirement_freeze on public.subjects;
create trigger subjects_retirement_freeze
  after update of status on public.subjects
  for each row when (new.status = 'retired' and old.status is distinct from 'retired')
  execute function public.subject_retirement_freeze();

alter table public.month_subject_readings enable row level security;

drop policy if exists "Members read their month subject readings" on public.month_subject_readings;
create policy "Members read their month subject readings" on public.month_subject_readings
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.month_subject_readings from authenticated, anon;
grant select on public.month_subject_readings to authenticated;
grant select, insert, update, delete on public.month_subject_readings to service_role;

-- 5. The reads ------------------------------------------------------------------
-- monthly_theme_readings' body with exactly one hop swapped: `mem` comes from
-- subject_memberships (no run parameter — membership is not a clustering) and
-- the grouping column is subject_id. Everything after `ins` is byte-identical,
-- and that is the concrete meaning of item 4's "counted per audience per month
-- by the same rule as item 1". Anything else would be a different rule wearing
-- the same words.
--
-- `ins` joins the audience_insights BASE table, not the _current view, for the
-- reason AGENTS.md gives: an id-set lookup must resolve rows an in-flight run
-- has superseded but not yet pruned. Member ids that resolve to nothing are
-- skipped in silence — the same honest behaviour the theme read has.
create or replace function public.monthly_subject_readings(
  p_client uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  month              date,
  audience           text,
  subject_id         uuid,
  videos             int,
  comments           int,
  platform_mix       jsonb,
  excluded_on_camera int,
  excluded_undated   int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with vid_all as (
    select v.id, v.platform, v.video_id,
           v.analyzed_run_id is not null as analysed,
           case when v.is_client     then 'client'
                when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience
    from public.videos v
    where v.client_id = p_client
  ),
  mem as (
    -- Retired subjects are not read. They are not re-judged either, so their
    -- membership only decays from here, and a fresh reading of one would open
    -- NEW months for a subject the client stopped tracking. Their existing
    -- months are frozen at retirement (subject_retirement_freeze) and are the
    -- record; this function never sees them, and the stale sweep never touches
    -- a frozen row.
    select m.subject_id, m.audience_insight_id as insight_id
    from public.subject_memberships m
    join public.subjects sub on sub.id = m.subject_id and sub.status <> 'retired'
    where m.client_id = p_client and m.member
  ),
  ins as (
    select m.subject_id, ai.id as insight_id, ai.source_video_id
    from mem m
    join public.audience_insights ai on ai.id = m.insight_id
    where ai.client_id = p_client
  ),
  cited_all as (
    select i.subject_id, c.id as comment_id, c.comment_date, c.platform, c.video_id
    from ins i
    join public.insight_evidence ie on ie.audience_insight_id = i.insight_id and ie.source = 'comment'
    join public.comments c on c.id = ie.comment_id
    where c.client_id = p_client
  ),
  cited as (
    select ca.subject_id,
           date_trunc('month', ca.comment_date at time zone 'UTC')::date as month,
           v.audience, v.id as video_uuid, v.platform, ca.comment_id
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id and v.analysed
    where ca.comment_date >= p_from and ca.comment_date < p_to
  ),
  undated_per_video as (
    select ca.subject_id, v.id as video_uuid, count(distinct ca.comment_id) as n
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id
    where ca.comment_date is null
    group by 1, 2
  ),
  undated as (
    select s.subject_id, s.month, s.audience, sum(u.n) as n
    from (select distinct c.subject_id, c.month, c.audience, c.video_uuid from cited c) s
    join undated_per_video u on u.subject_id = s.subject_id and u.video_uuid = s.video_uuid
    group by 1, 2, 3
  ),
  oncam as (
    select i.subject_id, i.insight_id, v.id as video_uuid, v.audience, v.platform
    from ins i
    join vid_all v on v.id = i.source_video_id
    where exists (select 1 from public.insight_evidence ie
                   where ie.audience_insight_id = i.insight_id and ie.source in ('video', 'video_text'))
      and not exists (select 1 from public.insight_evidence ie
                       where ie.audience_insight_id = i.insight_id and ie.source = 'comment')
  ),
  denom as (
    select distinct date_trunc('month', c.comment_date at time zone 'UTC')::date as month,
           v.audience, v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id and v.analysed
    where c.client_id = p_client
      and c.comment_date >= p_from and c.comment_date < p_to
      and v.id in (select o.video_uuid from oncam o)
  ),
  dated_ever as (
    select distinct v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id and v.analysed
    where c.client_id = p_client
      and c.comment_date is not null
      and v.id in (select o.video_uuid from oncam o)
  ),
  oncam_in as (
    select o.subject_id, d.month, d.audience, o.video_uuid, o.platform
    from oncam o
    join denom d on d.video_uuid = o.video_uuid and d.audience = o.audience
  ),
  oncam_out as (
    select o.subject_id, o.audience, count(*) as n
    from oncam o
    where not exists (select 1 from dated_ever d where d.video_uuid = o.video_uuid)
    group by 1, 2
  ),
  vids as (
    select c.subject_id, c.month, c.audience, c.video_uuid, c.platform from cited c
    union
    select oi.subject_id, oi.month, oi.audience, oi.video_uuid, oi.platform from oncam_in oi
  ),
  base as (
    select x.subject_id, x.month, x.audience, count(distinct x.video_uuid) as videos
    from vids x group by 1, 2, 3
  ),
  cmt as (
    select c.subject_id, c.month, c.audience, count(distinct c.comment_id) as comments
    from cited c group by 1, 2, 3
  ),
  per_platform as (
    select x.subject_id, x.month, x.audience, x.platform, count(distinct x.video_uuid) as n
    from vids x group by 1, 2, 3, 4
  ),
  mix as (
    select p.subject_id, p.month, p.audience, jsonb_object_agg(p.platform, p.n) as platform_mix
    from per_platform p group by 1, 2, 3
  )
  select b.month,
         b.audience,
         b.subject_id,
         b.videos::int,
         coalesce(c.comments, 0)::int,
         coalesce(m.platform_mix, '{}'::jsonb),
         coalesce(oo.n, 0)::int,
         coalesce(u.n, 0)::int
  from base b
  left join cmt c on c.subject_id = b.subject_id and c.month = b.month and c.audience = b.audience
  left join mix m on m.subject_id = b.subject_id and m.month = b.month and m.audience = b.audience
  left join oncam_out oo on oo.subject_id = b.subject_id and oo.audience = b.audience
  left join undated   u  on u.subject_id  = b.subject_id and u.month = b.month and u.audience = b.audience
  order by b.month, b.audience, b.subject_id
$$;

comment on function public.monthly_subject_readings(uuid, timestamptz, timestamptz) is
  'Per month per audience per subject in [p_from, p_to): distinct videos and comments the subject''s member insights cite, the platform mix, the undated citations those videos carry (per month), and the on-camera-only members no month can carry (per subject and audience, window-independent). monthly_theme_readings'' rule over subject_memberships instead of a run''s theme_observations.';

revoke all on function public.monthly_subject_readings(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.monthly_subject_readings(uuid, timestamptz, timestamptz) to service_role;

-- The window sibling. Same body, no month grouping — because a video whose
-- comment thread spans two months is a member of both months' sets, so summing
-- month rows counts it twice (+28% on a crossing week, +91% since-start on
-- Össur's own audience; 20260918092000 has the measurements). Comments sum
-- exactly; videos do not, and videos are what every share divides by.
create or replace function public.window_subject_readings(
  p_client uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  audience           text,
  subject_id         uuid,
  videos             int,
  comments           int,
  platform_mix       jsonb,
  excluded_on_camera int,
  excluded_undated   int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with vid_all as (
    select v.id, v.platform, v.video_id,
           v.analyzed_run_id is not null as analysed,
           case when v.is_client     then 'client'
                when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience
    from public.videos v
    where v.client_id = p_client
  ),
  mem as (
    -- Retired subjects are not read. They are not re-judged either, so their
    -- membership only decays from here, and a fresh reading of one would open
    -- NEW months for a subject the client stopped tracking. Their existing
    -- months are frozen at retirement (subject_retirement_freeze) and are the
    -- record; this function never sees them, and the stale sweep never touches
    -- a frozen row.
    select m.subject_id, m.audience_insight_id as insight_id
    from public.subject_memberships m
    join public.subjects sub on sub.id = m.subject_id and sub.status <> 'retired'
    where m.client_id = p_client and m.member
  ),
  ins as (
    select m.subject_id, ai.id as insight_id, ai.source_video_id
    from mem m
    join public.audience_insights ai on ai.id = m.insight_id
    where ai.client_id = p_client
  ),
  cited_all as (
    select i.subject_id, c.id as comment_id, c.comment_date, c.platform, c.video_id
    from ins i
    join public.insight_evidence ie on ie.audience_insight_id = i.insight_id and ie.source = 'comment'
    join public.comments c on c.id = ie.comment_id
    where c.client_id = p_client
  ),
  cited as (
    select ca.subject_id, v.audience, v.id as video_uuid, v.platform, ca.comment_id
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id and v.analysed
    where ca.comment_date >= p_from and ca.comment_date < p_to
  ),
  undated_per_video as (
    select ca.subject_id, v.id as video_uuid, count(distinct ca.comment_id) as n
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id
    where ca.comment_date is null
    group by 1, 2
  ),
  undated as (
    select s.subject_id, s.audience, sum(u.n) as n
    from (select distinct c.subject_id, c.audience, c.video_uuid from cited c) s
    join undated_per_video u on u.subject_id = s.subject_id and u.video_uuid = s.video_uuid
    group by 1, 2
  ),
  oncam as (
    select i.subject_id, i.insight_id, v.id as video_uuid, v.audience, v.platform
    from ins i
    join vid_all v on v.id = i.source_video_id
    where exists (select 1 from public.insight_evidence ie
                   where ie.audience_insight_id = i.insight_id and ie.source in ('video', 'video_text'))
      and not exists (select 1 from public.insight_evidence ie
                       where ie.audience_insight_id = i.insight_id and ie.source = 'comment')
  ),
  denom as (
    select distinct v.audience, v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id and v.analysed
    where c.client_id = p_client
      and c.comment_date >= p_from and c.comment_date < p_to
      and v.id in (select o.video_uuid from oncam o)
  ),
  dated_ever as (
    select distinct v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id and v.analysed
    where c.client_id = p_client
      and c.comment_date is not null
      and v.id in (select o.video_uuid from oncam o)
  ),
  oncam_in as (
    select o.subject_id, d.audience, o.video_uuid, o.platform
    from oncam o
    join denom d on d.video_uuid = o.video_uuid and d.audience = o.audience
  ),
  oncam_out as (
    select o.subject_id, o.audience, count(*) as n
    from oncam o
    where not exists (select 1 from dated_ever d where d.video_uuid = o.video_uuid)
    group by 1, 2
  ),
  vids as (
    select c.subject_id, c.audience, c.video_uuid, c.platform from cited c
    union
    select oi.subject_id, oi.audience, oi.video_uuid, oi.platform from oncam_in oi
  ),
  base as (
    select x.subject_id, x.audience, count(distinct x.video_uuid) as videos
    from vids x group by 1, 2
  ),
  cmt as (
    select c.subject_id, c.audience, count(distinct c.comment_id) as comments
    from cited c group by 1, 2
  ),
  per_platform as (
    select x.subject_id, x.audience, x.platform, count(distinct x.video_uuid) as n
    from vids x group by 1, 2, 3
  ),
  mix as (
    select p.subject_id, p.audience, jsonb_object_agg(p.platform, p.n) as platform_mix
    from per_platform p group by 1, 2
  )
  select b.audience,
         b.subject_id,
         b.videos::int,
         coalesce(c.comments, 0)::int,
         coalesce(m.platform_mix, '{}'::jsonb),
         coalesce(oo.n, 0)::int,
         coalesce(u.n, 0)::int
  from base b
  left join cmt c on c.subject_id = b.subject_id and c.audience = b.audience
  left join mix m on m.subject_id = b.subject_id and m.audience = b.audience
  left join oncam_out oo on oo.subject_id = b.subject_id and oo.audience = b.audience
  left join undated   u  on u.subject_id  = b.subject_id and u.audience = b.audience
  order by b.audience, b.subject_id
$$;

comment on function public.window_subject_readings(uuid, timestamptz, timestamptz) is
  'Per audience per subject over the whole half-open window [p_from, p_to): DISTINCT videos and comments the subject''s member insights cite, the platform mix, the undated citations, and the on-camera-only members (window-independent, identical to the month function''s column). The month sibling writes the record; this one answers a windowed figure without double-counting a video whose thread spans two months.';

revoke all on function public.window_subject_readings(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.window_subject_readings(uuid, timestamptz, timestamptz) to service_role;

-- 6. Moves — what the client said they are trying to change ---------------------
-- "Track this" on a subject (SU2), on a theme (VO3) or on a piece of advice.
-- `initiatives` (0 rows, both tenants) is the ancestor and stays legacy: its
-- registry_ids column is documented as theme_registry ids, is not updatable by
-- grant, and is CHECKed at 1-5 — none of which fits a subject, whose membership
-- is a set that exceeds five themes and moves every week. Storing a subject id
-- there would break the column's contract in three places at once
-- (research/mk2-co5-first-cuts.md §9).
create table if not exists public.moves (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  kind         text not null check (kind in ('subject', 'theme', 'advice')),
  -- Exactly one target, and it has to match the kind. A move with no target is
  -- a sentence; a move with two is a question nobody can answer.
  subject_id   uuid references public.subjects(id) on delete restrict,
  registry_ids uuid[],
  -- recommendations.lineage_id. No foreign key, for the rec_decisions reason:
  -- the row that started the lineage is deleted by the next update and the
  -- move must outlive it.
  lineage_id   uuid,
  title        text not null check (char_length(trim(title)) between 1 and 120),
  note         text check (note is null or char_length(note) <= 400),
  direction    text not null check (direction in ('up', 'down')) default 'up',
  declared_at  date not null default current_date,
  declared_by  uuid,
  status       text not null check (status in ('active', 'done', 'dropped')) default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint moves_one_target check (
    (kind = 'subject' and subject_id is not null and registry_ids is null and lineage_id is null)
    or (kind = 'theme' and subject_id is null and lineage_id is null
        and registry_ids is not null and cardinality(registry_ids) between 1 and 5)
    or (kind = 'advice' and subject_id is null and registry_ids is null and lineage_id is not null)
  )
);

comment on table public.moves is
  'What a client declared it is trying to change, from "Track this" on a subject or a theme, or from accepting a piece of advice. Append-only for members: the target and the date are what every point already reported means, and there is no UPDATE grant at all, so a lifecycle change is a service-role write until a page needs one (then it is a column grant and a conversation, not a quiet write).';
comment on column public.moves.declared_at is
  'The date the client drew the line, as the database''s current_date — never a form value. Everything measured about this move is measured from here.';
comment on column public.moves.subject_id is
  'ON DELETE RESTRICT, not cascade: a subject with a declared move against it is retired (status + superseded_by), never deleted, and the database should say so rather than quietly dropping the declaration.';

create index if not exists moves_client_status_idx
  on public.moves (client_id, status, declared_at desc);
create index if not exists moves_subject_idx
  on public.moves (client_id, subject_id) where subject_id is not null;

alter table public.moves enable row level security;

drop policy if exists "Members read their moves" on public.moves;
create policy "Members read their moves" on public.moves
  for select to authenticated using (client_id = public.get_my_client_id());

-- The actor is pinned as well as the tenant, the rec_decisions rule: a table
-- whose whole value is "the client said this" may not let one member file a
-- declaration under another member's name. A platform admin viewing another
-- tenant arrives on the service-role client (lib/auth.ts applyOperatorView) and
-- bypasses this entirely, with the real person's id still on the row.
drop policy if exists "Members declare their own moves" on public.moves;
create policy "Members declare their own moves" on public.moves
  for insert to authenticated
  with check (client_id = public.get_my_client_id() and declared_by = (select auth.uid()));

-- No update policy and no delete policy: append-only is enforced by their
-- absence and by the grants below.
revoke all on public.moves from authenticated, anon;
grant select on public.moves to authenticated;
grant insert (client_id, kind, subject_id, registry_ids, lineage_id, title, note, direction, declared_by)
  on public.moves to authenticated;
grant select, insert, update on public.moves to service_role;
-- Deleting a declaration would erase the client's own words about what it was
-- trying to do, and TRUNCATE is the same act one statement at a time.
revoke delete, truncate on public.moves from service_role;

-- Post-apply checks, read-only:
--   select count(*) from public.subjects;                    -- 0
--   select policyname, cmd from pg_policies where tablename in ('subjects','subject_memberships','month_subject_readings','moves');
--   select tgname, tgrelid::regclass from pg_trigger
--     where not tgisinternal and tgrelid = 'public.month_subject_readings'::regclass;   -- both guards
--   select proname, prosecdef from pg_proc
--     where proname in ('subject_band','monthly_subject_readings','window_subject_readings');
--   select has_function_privilege('authenticated', 'public.monthly_subject_readings(uuid,timestamptz,timestamptz)', 'execute'); -- false
--   select has_table_privilege('authenticated', 'public.moves', 'update');              -- false
--   select has_table_privilege('authenticated', 'public.moves', 'delete');              -- false
--   select has_column_privilege('authenticated', 'public.subjects', 'name', 'update');  -- false
--   select confdeltype from pg_constraint where conrelid = 'public.month_subject_readings'::regclass
--     and confrelid = 'public.subjects'::regclass;   -- 'a' (no action)
--   select tgname from pg_trigger where not tgisinternal and tgrelid = 'public.subjects'::regclass;
--     -- subjects_lineage_same_tenant, subjects_retirement_freeze
