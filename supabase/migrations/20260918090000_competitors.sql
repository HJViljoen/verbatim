-- A rival's identity, and the record of its renaming (Phase 1 M1, design item 16
-- addendum, decision I, 2026-09-18).
--
-- WHAT IS BROKEN TODAY. A rival has no identity in this database — only a
-- spelling, repeated in nine places. `tracking_configs.competitor_names` holds
-- free text; `videos.competitor_name` copies it; `themes.bucket`,
-- `theme_registry.bucket`, `run_summary.share_of_voice` and now
-- `month_denominators.audience` / `month_theme_readings.audience` all key on
-- 'competitor:' || that text. Rename a rival in Settings and the prescribed
-- follow-up (scripts/run-tagging.ts --write) re-stamps the corpus, after which
-- every FROZEN month row stands under the old string and can never be re-keyed
-- (month_reading_frozen_guard, 20260915092000:191-215, refuses the UPDATE and
-- `audience` is in the primary key), the new name's series starts at zero, and
-- the rival's themes all read as new because matchThemes buckets its candidate
-- set by the literal bucket string (lib/pipeline/theme-registry.ts:97-110).
-- Remove a rival instead — which is what happened to Sealand on 2026-09-09 —
-- and 253 videos move silently to industry-other with nothing anywhere saying
-- that Patagonia, Topo Designs and Poler were ever tracked at all.
--
-- WHAT THIS MIGRATION DOES, AND WHAT IT DELIBERATELY DOES NOT. It does NOT
-- re-key the audience: `competitor:<name>` stays exactly as it is, because 214
-- denominator rows and 2,957 theme readings are already frozen under it and a
-- re-key is a one-way rewrite of the record before the record exists (decision
-- I; the uuid-keyed option is written up in full in
-- ~/.claude/plans/verbatim-phase1/research/rival-identity.md §3 option A).
-- What it adds is additive and reversible:
--
--   * `competitors` — the identity the name is a LABEL on. One row per rival
--     per tenant, never deleted: retired, or superseded by the row that
--     absorbed it. It is what lets a rename be one operation instead of five,
--     what gives design §3 ST4 its "tracked since {date}", and what keeps the
--     three erased Sealand names in the record.
--   * `config_changes.affects_audiences` / `.affects_months` — the two columns
--     the change log needs before it can draw anything. `changed_at` is a wall
--     clock; every axis in the design is comment-dated calendar months, and
--     the months a change moved are almost never the month it was made in
--     (Sealand's re-tag moved 34 months from 2021-12 to 2026-09; a term Össur
--     added on 3 July put comments dated 11 June into the corpus).
--   * two new `surface` values — 'rival_rename' (the break a reader stitches
--     across) and 'prompt_version' (WP2's Pass A bump, which breaks every
--     theme line in every month and today has no writer at all).
--   * `rename_rival()` — the whole rename in ONE transaction. PostgREST cannot
--     give a client one, and a rename that half-lands leaves a corpus stamped
--     with two names and no log saying so.
--
-- Everything frozen stays as it is. A renamed rival's months split under the
-- two strings exactly as they do today; `affects_audiences` names both halves
-- so lib/rivals.ts stitchRenames can draw one line with a marked break, which
-- is what design §3 ST7 promises and what nothing could supply before.

-- 1. The slug ------------------------------------------------------------------
-- The stable key a display name folds down to: lowercased, diacritics stripped,
-- everything else run together with hyphens. 'Össur' → 'ossur',
-- 'Topo Designs' → 'topo-designs'. It is NOT the audience key (that is still
-- the name) — it is what keeps two live rivals from being one bucket by a
-- capitalisation, and what a URL can carry.
--
-- Deliberately NOT lib/gather/owned.ts entitySlug, which looks almost the same
-- and must not change: that slug is an Inngest step-id segment, and step ids
-- are a stability contract (AGENTS.md). It also does not strip diacritics, so
-- it renders 'Össur' as '-ssur'. lib/rivals.ts rivalSlug is this function's
-- TypeScript twin and the two must agree.
create or replace function public.rival_slug(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  -- Decompose, strip the marks, THEN lowercase. In that order 'O' with its
  -- diaeresis has already become an ASCII 'O' by the time lower() sees it, so
  -- the answer does not depend on the database's collation -- on a C-locale
  -- cluster lower() leaves the accented letter alone and it would be thrown
  -- away as punctuation instead of folded (found by exercising this on a
  -- throwaway cluster: the name came back 'ssur', not 'ossur').
  -- lib/rivals.ts rivalSlug folds in the same order.
  --
  -- When NOTHING ASCII survives -- a Japanese, Cyrillic or Arabic name -- the
  -- key is the UTF-8 bytes of the lowercased name in hex behind an 'x-'.
  -- competitors.slug is `not null`, so returning NULL for such a name means it
  -- can have no identity at all, which is everything this table is for; hex is
  -- the one fold this function and its TypeScript twin can be trusted to agree
  -- on byte for byte. The guard is octet_length > char_length ("holds a
  -- non-ASCII character" in UTF-8), which asks the collation nothing, so a name
  -- with no letter and no digit anywhere -- '!!!' -- still returns NULL.
  with folded as (
    select coalesce(p_name, '') as raw,
           nullif(
             btrim(
               regexp_replace(
                 lower(
                   regexp_replace(
                     normalize(coalesce(p_name, ''), NFD),
                     '[' || chr(768) || '-' || chr(879) || ']', '', 'g'    -- combining marks
                   )
                 ),
                 '[^a-z0-9]+', '-', 'g'
               ),
               '-'
             ),
             ''
           ) as ascii_slug
  ), based as (
    select f.ascii_slug, btrim(lower(normalize(f.raw, NFC))) as base from folded f
  )
  select case
           when b.ascii_slug is not null then b.ascii_slug
           when octet_length(b.base) > char_length(b.base)
             then 'x-' || encode(convert_to(b.base, 'UTF8'), 'hex')
           else null
         end
    from based b
$$;

comment on function public.rival_slug(text) is
  'Display name → stable per-tenant key: lowercase, diacritics stripped, non-alphanumerics to hyphens; a name with no ASCII at all (another script) folds to x-<utf8 hex> so that it can still have an identity, and only a name with no letter or digit anywhere returns NULL. The twin of lib/rivals.ts rivalSlug. NOT the audience key (that is competitor:<name>) and NOT lib/gather/owned.ts entitySlug, which is an Inngest step-id segment and may never change.';

-- 2. The identity --------------------------------------------------------------
create table if not exists public.competitors (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  -- The display name, as the tenant types it in Settings, and the string the
  -- audience key is built from: 'competitor:' || name. It CHANGES; the row does
  -- not. Every rename is a config_changes row with surface 'rival_rename'.
  name           text not null,
  -- rival_slug(name), stored so a lookup and a unique index can use it.
  slug           text not null,
  -- The earliest evidence in THIS database that the name was tracked — not the
  -- day tracking began, which nothing records. For the backfill that is the
  -- earliest of min(videos.scraped_at), min(theme_registry.first_seen_at) and
  -- min(keyword_performance.created_at) for the name.
  first_seen_at  timestamptz,
  -- Set when the tenant stops tracking the rival. The row stays: its months are
  -- frozen under its name and a reader still has to be able to render it.
  retired_at     timestamptz,
  -- The row that absorbed this one, when a tenant realises two names are one
  -- rival. A merge is this column, never a DELETE.
  superseded_by  uuid references public.competitors(id) on delete set null,
  -- The actor label that created the row (lib/config-log.ts ConfigActor.label):
  -- an email, a command line, this migration. Free text — the change log is the
  -- record of who; this is a convenience on the row itself.
  created_by     text,
  created_at     timestamptz not null default now()
);

comment on table public.competitors is
  'A rival''s identity, separate from its spelling. The audience key is still competitor:<name> (decision I — 214 frozen denominator rows already key on it), so this table does not re-key anything: it is what makes a rename one operation with a record, keeps a retired rival renderable, and supplies design §3 ST4''s "tracked since {date}". Never deleted — retired_at, or superseded_by.';
comment on column public.competitors.name is
  'The display name AND the string the audience key is built from (competitor:<name>). A rename rewrites it, videos.competitor_name, theme_registry.bucket and the current run''s themes.bucket together — public.rename_rival() — and leaves frozen months under the old string, which is why the rename also writes a config_changes row naming both audiences.';
comment on column public.competitors.first_seen_at is
  'Earliest evidence in this database that the name was tracked. NOT the day tracking began: tracking_configs has one updated_at for all ten of its columns and no history at all before 2026-09-15.';
comment on column public.competitors.retired_at is
  'When the tenant stopped tracking this rival. The three Sealand rows backfilled at 2026-09-09 are reconstructed from scripts/reconstruct-config-log.ts — inference, not record.';

-- One live rival per slug per tenant: 'Össur' and 'Ossur' may not become two
-- buckets by accident. Retired rows are outside the index, so a name can be
-- dropped and a differently-spelled successor tracked without a collision.
create unique index if not exists competitors_client_slug_live_idx
  on public.competitors (client_id, slug) where retired_at is null;
-- The two read patterns: this tenant's rivals, and name → row (the audience key
-- arrives as a name and has to find its identity).
create index if not exists competitors_client_idx on public.competitors (client_id, slug);
create index if not exists competitors_client_name_idx on public.competitors (client_id, name);

alter table public.competitors enable row level security;

drop policy if exists "Members read their rivals" on public.competitors;
create policy "Members read their rivals" on public.competitors
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.competitors from authenticated, anon;
grant select on public.competitors to authenticated;
-- Stated, not inherited: this project's default ACL hands every new public table
-- all seven privileges to anon, authenticated AND service_role alike, so a
-- revoke that is not written down is not true.
grant select, insert, update on public.competitors to service_role;
-- A rival a frozen month keys on may not vanish. Retiring is retired_at,
-- merging is superseded_by, and neither is a DELETE. TRUNCATE goes with it:
-- emptying the table in one statement is the same act row by row.
revoke delete, truncate on public.competitors from service_role;

-- 3. The change log learns what a change broke ---------------------------------
-- Both nullable, and NULL means "not known" — which is the honest value on all
-- 93 rows already stored, 91 of them reconstructed from gather records whose
-- before/after are term names, not video ids.
alter table public.config_changes add column if not exists affects_audiences text[];
alter table public.config_changes add column if not exists affects_months daterange;

comment on column public.config_changes.affects_audiences is
  'The literal audience keys this change moved — the same strings month_denominators.audience stores (client, industry-other, competitor:<name>). A rename carries BOTH halves, old first. NULL means unknown, not none.';
comment on column public.config_changes.affects_months is
  'The comment-dated calendar months whose reading this change could have moved, as [first, last+1). NOT the month it was made in: changed_at is a wall clock and every axis in this product is dated by the comment. Computed at save time from videos.source_keywords x comments.comment_date (lib/config-affects.ts affectsMonths). NULL means unknown.';

-- Two more surfaces. 'rival_rename' is the break a reader stitches across —
-- distinct from 'rivals', which is the trigger's row for the tracked LIST
-- moving. 'prompt_version' is WP2's: a Pass A bump re-reads the whole corpus
-- and breaks every theme line in every month, and today nothing writes it down.
alter table public.config_changes drop constraint if exists config_changes_surface_check;
alter table public.config_changes add constraint config_changes_surface_check
  check (surface in (
    'terms','rivals','handles','platforms','subreddits','cadence','knobs',
    'schedule','subjects','entity_retag','regate','prompt_version','rival_rename','other'));

-- 4. Backfill — every name this database has ever carried ----------------------
-- Seven rows: Össur 1 (Ottobock), Sealand 6 (Cotopaxi, Freitag, Rareform
-- tracked; Patagonia, Topo Designs, Poler retired). Idempotent by NOT EXISTS
-- rather than ON CONFLICT, because the unique index is partial and the retired
-- rows fall outside it.
with evidence as (
  -- The tracked list, as it stands
  select tc.client_id, btrim(cn) as name, min(now()) as seen
    from public.tracking_configs tc, unnest(coalesce(tc.competitor_names, '{}'::text[])) cn
   where btrim(cn) <> ''
   group by 1, 2
  union all
  select v.client_id, v.competitor_name, min(v.scraped_at)
    from public.videos v where btrim(coalesce(v.competitor_name, '')) <> '' group by 1, 2
  union all
  select tr.client_id, replace(tr.bucket, 'competitor:', ''), min(tr.first_seen_at)
    from public.theme_registry tr where tr.bucket like 'competitor:_%' group by 1, 2
  union all
  select t.client_id, replace(t.bucket, 'competitor:', ''), min(t.created_at)
    from public.themes t where t.bucket like 'competitor:_%' group by 1, 2
  union all
  select rs.client_id, replace(k, 'competitor:', ''), min(rs.created_at)
    from public.run_summary rs, jsonb_object_keys(rs.share_of_voice::jsonb) k
   where k like 'competitor:_%' group by 1, 2
  union all
  select md.client_id, replace(md.audience, 'competitor:', ''), min(md.read_at)
    from public.month_denominators md where md.audience like 'competitor:_%' group by 1, 2
  -- Poler is the one name this database cannot spell for itself. It survives
  -- only in keyword_performance, lowercased, and its capitalisation is inferred
  -- from scripts/reconstruct-config-log.ts:60 — the single source for it.
  -- Inference, and the row says so in created_by.
  union all
  select kp.client_id, 'Poler', min(kp.created_at)
    from public.keyword_performance kp where lower(kp.keyword) = 'poler' group by 1
),
named as (
  select e.client_id, e.name, min(e.seen) as first_seen_at,
         bool_or(e.name = any(coalesce(tc.competitor_names, '{}'::text[]))) as tracked
    from evidence e
    join public.tracking_configs tc on tc.client_id = e.client_id
   group by 1, 2
),
-- keyword_performance holds the earliest trace of a name that is no longer
-- tracked anywhere else (Patagonia and Topo Designs first appear there on
-- 2026-07-06, two months before theme_registry first sees them).
dated as (
  select n.*, least(n.first_seen_at,
                    (select min(kp.created_at) from public.keyword_performance kp
                      where kp.client_id = n.client_id and lower(kp.keyword) = lower(n.name))
                   ) as seen_at
    from named n
)
insert into public.competitors (client_id, name, slug, first_seen_at, retired_at, created_by)
select d.client_id, d.name, public.rival_slug(d.name), d.seen_at,
       -- Everything this database knows a name for but no longer tracks left on
       -- 2026-09-09, the day Sealand's rival set was rewritten (bracketed at
       -- 18:10 SAST by scripts/reconstruct-config-log.ts:71-87). That is the
       -- only untracked set in this database and this is a one-time backfill;
       -- a retirement after today is written by lib/rivals.ts retireRival with
       -- the real moment.
       case when d.tracked then null else timestamptz '2026-09-09 18:10:00+02' end,
       case when d.tracked then 'migration 20260918090000_competitors.sql'
            else 'migration 20260918090000_competitors.sql · retirement reconstructed, not recorded' end
  from dated d
 where public.rival_slug(d.name) is not null
   -- 'competitor:unknown' is not a rival. It is what lib/rivals.ts rivalKey
   -- emits for a video flagged as a rival's but carrying no name — a tagger
   -- disagreeing with itself — and it matches the four `like 'competitor:_%'`
   -- arms above, so a single such row in themes, theme_registry or a month
   -- would give this tenant an identity called "unknown", with a slug and a
   -- fabricated retirement date. Zero exist in production today; the predicate
   -- is what keeps it that way. A tenant that genuinely tracks a rival called
   -- "unknown" still gets its row: the name is in the tracked list, and this
   -- only skips the sentinel nothing tracks.
   and not (d.name = 'unknown' and not d.tracked)
   and not exists (
     select 1 from public.competitors c
      where c.client_id = d.client_id and c.slug = public.rival_slug(d.name))
   -- A name this tenant has RENAMED AWAY is not a missing identity — it is the
   -- old spelling of a live one. rename_rival rewrites competitors.slug in
   -- place while month_denominators.audience and keyword_performance keep the
   -- old string by design, so the evidence union above still finds the old
   -- name and the NOT EXISTS above, which keys on the slug, no longer sees a
   -- row for it. Re-applying this file after a rename (a rebuilt environment,
   -- a db push replay, a fresh branch) would then mint a GHOST: a retired row
   -- carrying the old slug, outside the partial unique index, and the only row
   -- that slug resolves to — so findRival would send the rival's frozen months
   -- to the ghost instead of to the row the rename was supposed to explain.
   and not exists (
     select 1 from public.config_changes cc
      where cc.client_id = d.client_id
        and cc.surface = 'rival_rename'
        and cc.affects_audiences[1] = 'competitor:' || d.name);

-- 5. The rename, in one transaction --------------------------------------------
-- Five writes have to land together or not at all: the identity, the tracked
-- list (else the next gather re-stamps the old name straight back onto new
-- videos — lib/gather/tagging.ts tagVideo reads competitor_names), the stored
-- corpus, the theme registry (matchThemes buckets by the literal string, so a
-- half-rewritten registry orphans the rival's whole history) and the log row
-- that says it happened. PostgREST gives a client no transaction, so this is a
-- function.
--
-- What it does NOT do: touch a frozen month. `month_denominators` and
-- `month_theme_readings` keep the old string, the new months start under the
-- new one, and the config_changes row names both so lib/rivals.ts stitchRenames
-- can draw one line with the break marked. That is decision I's whole trade:
-- the record is not rewritten, it is explained.
create or replace function public.rename_rival(
  p_client_id      uuid,
  p_competitor_id  uuid,
  p_new_name       text,
  p_actor          jsonb default null,
  p_affects_months daterange default null,
  p_note           text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old      text;
  v_new      text := btrim(coalesce(p_new_name, ''));
  v_slug     text;
  v_videos   int  := 0;
  v_registry int  := 0;
  v_themes   int  := 0;
  v_kind     text;
  v_user     uuid := null;
  v_label    text := null;
  v_run      uuid := null;
  v_change   uuid;
  v_handles  jsonb;
begin
  if v_new = '' then
    raise exception 'rename_rival: the new name is empty' using errcode = '22023';
  end if;
  v_slug := public.rival_slug(v_new);
  if v_slug is null then
    raise exception 'rename_rival: % has no slug — a rival name needs a letter or a digit', p_new_name
      using errcode = '22023';
  end if;

  select c.name into v_old
    from public.competitors c
   where c.id = p_competitor_id and c.client_id = p_client_id
   for update;
  if v_old is null then
    raise exception 'rename_rival: no rival % for client %', p_competitor_id, p_client_id
      using errcode = '23503';
  end if;

  if v_old = v_new then
    -- Not a change. A no-op writes no log row: the log answers "what moved",
    -- and nothing did.
    return jsonb_build_object('renamed', false, 'old_name', v_old, 'new_name', v_new,
                              'videos', 0, 'theme_registry', 0, 'themes', 0, 'change_id', null);
  end if;

  if exists (select 1 from public.competitors c
              where c.client_id = p_client_id and c.id <> p_competitor_id
                and c.retired_at is null and c.slug = v_slug) then
    raise exception 'rename_rival: % is already a tracked rival for this client', v_new
      using errcode = '23505';
  end if;

  -- The actor, normalised the way tracking_configs_audit() normalises it: an
  -- unknown kind becomes 'script', a user or run that is not a row becomes
  -- NULL. Never abort a rename over a malformed stamp — the rename is the
  -- thing that must be recorded.
  v_kind  := coalesce(nullif(p_actor ->> 'kind', ''), 'script');
  if v_kind not in ('user','operator','script','pipeline','sql','reconstructed') then
    v_kind := 'script';
  end if;
  v_label := nullif(p_actor ->> 'label', '');
  begin v_user := nullif(p_actor ->> 'user_id', '')::uuid; exception when others then v_user := null; end;
  begin v_run  := nullif(p_actor ->> 'run_id',  '')::uuid; exception when others then v_run  := null; end;
  if v_user is not null and not exists (select 1 from public.users u where u.id = v_user) then
    v_user := null;
  end if;
  if v_run is not null and not exists (select 1 from public.pipeline_runs r where r.id = v_run) then
    v_run := null;
  end if;

  update public.competitors
     set name = v_new, slug = v_slug
   where id = p_competitor_id and client_id = p_client_id;

  -- The tracked list and the census handles. competitor_keywords is left alone
  -- on purpose: a search term that found the brand under its old name still
  -- finds it, and removing terms is a curation decision, not a rename. This
  -- UPDATE fires tracking_configs_audit, which logs its own 'rivals' /
  -- 'handles' rows for the list moving — the 'rival_rename' row below is the
  -- different fact that the two names are one rival.
  select tc.competitor_handles into v_handles
    from public.tracking_configs tc where tc.client_id = p_client_id;
  update public.tracking_configs tc
     set competitor_names = array_replace(tc.competitor_names, v_old, v_new),
         competitor_handles = case
           when v_handles ? v_old
             then (v_handles - v_old) || jsonb_build_object(v_new, v_handles -> v_old)
           else tc.competitor_handles end,
         last_actor = p_actor,
         updated_at = now()
   where tc.client_id = p_client_id
     and (v_old = any(coalesce(tc.competitor_names, '{}'::text[])) or coalesce(v_handles, '{}'::jsonb) ? v_old);

  update public.videos v
     set competitor_name = v_new
   where v.client_id = p_client_id and v.competitor_name = v_old;
  get diagnostics v_videos = row_count;

  update public.theme_registry tr
     set bucket = 'competitor:' || v_new
   where tr.client_id = p_client_id and tr.bucket = 'competitor:' || v_old;
  get diagnostics v_registry = row_count;

  -- `themes` is replaced wholesale every run, so only the newest run's rows can
  -- still be read; rewriting older ones would be rewriting a run's own record.
  update public.themes t
     set bucket = 'competitor:' || v_new
   where t.client_id = p_client_id and t.bucket = 'competitor:' || v_old
     and t.run_id = (select t2.run_id from public.themes t2
                      where t2.client_id = p_client_id
                      order by t2.created_at desc limit 1);
  get diagnostics v_themes = row_count;

  insert into public.config_changes
    (client_id, surface, field, before, after, actor_kind, actor_user_id, actor_label,
     run_id, source, rows_affected, note, affects_audiences, affects_months)
  values
    (p_client_id, 'rival_rename', 'competitor_names',
     jsonb_build_object('name', v_old), jsonb_build_object('name', v_new),
     v_kind, v_user, v_label, v_run, 'logged',
     v_videos + v_registry + v_themes,
     coalesce(p_note,
       v_old || ' is now called ' || v_new || '. Everything we had already recorded about ' ||
       v_old || ' stays under that name, so the chart shows one line with the change marked on it.'),
     array['competitor:' || v_old, 'competitor:' || v_new],
     p_affects_months)
  returning id into v_change;

  return jsonb_build_object('renamed', true, 'old_name', v_old, 'new_name', v_new,
                            'videos', v_videos, 'theme_registry', v_registry,
                            'themes', v_themes, 'change_id', v_change);
end
$$;

comment on function public.rename_rival(uuid, uuid, text, jsonb, daterange, text) is
  'Renames a rival in one transaction: the competitors row, the tracked list and census handles, videos.competitor_name, theme_registry.bucket, the current run''s themes.bucket, and one config_changes row with surface ''rival_rename'' naming both audience keys. Frozen month rows are NOT re-keyed — they cannot be — so the log row is what lets a reader stitch the two halves. lib/rivals.ts renameRival is the caller.';

revoke all on function public.rename_rival(uuid, uuid, text, jsonb, daterange, text) from public, anon, authenticated;
grant execute on function public.rename_rival(uuid, uuid, text, jsonb, daterange, text) to service_role;

-- Exercised before it was ever applied, on a throwaway PostgreSQL 17 cluster
-- over schema-baseline.sql + every migration after it: the file applies twice
-- with no error and the second apply writes no eighth competitors row; a rename
-- moves videos, theme_registry and only the newest run's themes; a rename to a
-- live rival's spelling is refused; a rename to the same name writes no log row;
-- a malformed actor stamp is normalised rather than aborting the rename; the
-- tracking_configs UPDATE inside the rename fires the audit trigger and logs its
-- own 'rivals' row; a member can select their own tenant's competitors and
-- nothing else; service_role cannot delete one.
--
-- Post-apply checks (run by hand, read-only):
--   select name, slug, first_seen_at::date, retired_at::date from public.competitors
--     join public.clients cl on cl.id = client_id order by cl.company_name, name;
--     -- THE NAMES AND THE COUNT BELOW WERE TRUE ON 2026-09-16 AND ARE NOT A
--     -- CHECK. Both tracked lists were edited on 17 September — Sealand now
--     -- tracks seven, Patagonia among them, so Patagonia is TRACKED and not
--     -- retired and the backfill's evidence arms add whatever else they find
--     -- (Topo Designs and Poler at least): about ten rows with one or two
--     -- retired, not seven with three. Any Settings edit before the deploy
--     -- moves it again. THE CHECK IS THE RECONCILIATION, not the total —
--     -- every name in tracking_configs.competitor_names present with
--     -- retired_at null, every extra row retired and accountable, none
--     -- 'unknown'. A count equal to the tracked list ALONE is a failure: it
--     -- means the evidence arms found nothing and the erased set is missing.
--     -- docs/deploy-checklist.md §M1 carries it in full.
--   select count(*) from public.competitors;                                     -- about 10
--   select count(*) from information_schema.table_privileges
--     where table_name = 'competitors' and grantee = 'service_role'
--       and privilege_type in ('DELETE','TRUNCATE');                             -- 0
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.config_changes'::regclass and conname like '%surface%';
--     -- includes 'prompt_version' and 'rival_rename'
--   select policyname, cmd from pg_policies where tablename = 'competitors';     -- SELECT only
