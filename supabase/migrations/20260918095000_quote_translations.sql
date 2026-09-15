-- The translation cache, and the evidence-id freeze
-- (Phase 1 WP6, design items 8 and 31a, decisions A and H, 2026-09-18).
--
-- TWO TABLES, ONE FILE, BECAUSE THEY ARE THE TWO HALVES OF ONE PROMISE: that a
-- number a client reads can be opened to the voices underneath it, and that
-- those voices can be read by someone who does not speak the language they were
-- written in. The first half is a cache of machine translations; the second is
-- a record of WHICH videos and WHICH comments a frozen month's number rested
-- on, taken at the same moment as the number.
--
-- ============================================================================
-- 1. WHAT THIS REVERSES, AND HOW FAR
-- ============================================================================
-- 2026-08-09 decided "a hero quote never translates", and the decision is
-- written as an absolute in three places: lib/pipeline/translate.ts's module
-- header, the header of 20260911141000_transcript_en.sql, and the live column
-- comment on videos.transcript_en ("never evidence, never displayed, never
-- frozen into a snapshot"). Design item 8 reverses it for QUOTED COMMENTS, and
-- only for them. The reversal is narrow and the three statements are rewritten
-- to say so in the same change (this file rewrites the column comment; the
-- other two are rewritten in code), because the repo's own rule is that a copy
-- claim about behaviour matches the code.
--
-- What does NOT change:
--   * the ORIGINAL is still the evidence. insight_evidence.quote is untouched,
--     the verbatim-quote validator (lib/pipeline/quote-match.ts) is untouched,
--     and Pass A still quotes only from the original text it was shown.
--   * videos.transcript_en is still a reading aid for the extraction model and
--     is still never displayed. A transcript is a creator's speech; item 8 is
--     about a commenter's words.
--   * an English rendering is never frozen into report_snapshots.data. It is
--     resolved at render from this table, exactly as the original text is
--     resolved from insight_evidence (lib/renderables/quotes-freeze.ts).
--
-- ============================================================================
-- 2. WHY THE CACHE IS KEYED ON (comment_id, text_hash) AND NOT ON THE EVIDENCE
-- ============================================================================
-- The design's own feasibility note says two incompatible things: that
-- "insight_evidence gains a column" and that a translation is "cached by
-- comment id so a comment is translated once". Only the second is buildable.
-- insight_evidence rows are re-derived on every Pass A re-read
-- (lib/pipeline/pass-a.ts persistVideo deletes and re-inserts) and hard-deleted
-- by pruneStaleAnalysis. Measured read-only on production 2026-09-15: the
-- latest run's cited comments and every earlier run's are DISJOINT sets
-- (Össur 2,386 vs 4,633, intersection 0), and 20.2–44.4% of an older run's
-- member references no longer resolve. A translation stored on the evidence row
-- is re-paid for every week, for ever.
--
-- comments.id is the stable key: comments are upserted on
-- (client_id, platform, comment_id) (lib/retention/youtube-refresh-io.ts), so a
-- re-gather preserves the row id.
--
-- But an id alone is not enough. The nightly YouTube refresh re-fetches a due
-- comment and upserts it on the same key, so a comment whose author EDITED it
-- keeps its row id and acquires different text — 272 (Össur) / 393 (Sealand) of
-- the non-English ever-cited comments are on YouTube, the one platform the
-- sweep touches. A cache keyed on the id alone would serve an English rendering
-- of text the commenter has since replaced, published under an "in their own
-- words" promise. The text hash is the invalidation: different text is a
-- different row, and the stale row simply stops being asked for.
--
-- The hash also settles "does it translate the comment or the quote?" — both,
-- when they differ. An evidence excerpt and the whole comment are two texts and
-- two rows under one comment; whichever a surface renders, the English beside
-- it is an English rendering of THAT text and not of a longer one it was cut
-- from.
--
-- ============================================================================
-- 3. IT CASCADES FROM comments, DELIBERATELY
-- ============================================================================
-- The alternative — no cascade — means the product holds a machine translation
-- of a comment it deleted for retention or for a GDPR erasure. That is not a
-- schema detail; it is the answer to "does a copy survive the deletion", and
-- the answer this file gives is no. A re-cited comment that comes back is
-- re-translated at roughly $0.0004. Cascading also means the cache cannot
-- outlive the thing it describes, which is the same rule insight_evidence
-- already keeps.
--
-- ============================================================================
-- 4. THE EVIDENCE FREEZE, AND THE PARAGRAPH IT HAS TO ANSWER
-- ============================================================================
-- 20260915092000_monthly_reading.sql:31-35 refused exactly this table:
--
--   "COUNTS, NOT CITATIONS. These rows hold numbers and no comment ids on
--    purpose. Retention deletes comment rows; the prune deletes the insights
--    that made them citable. A frozen count survives both. A frozen id list
--    would decay into a record of what we can no longer show."
--
-- That paragraph is right, and it is the reason month_evidence_refs is a
-- SEPARATE table rather than two columns on month_theme_readings. The month
-- reading is a record that does not rot. This one does, and says so:
--
--   * it is a record of WHICH, not of WHAT. Nothing here is a word anybody
--     wrote. The words are resolved live or they are gone.
--   * video_ids is the durable half. A video is TOMBSTONED and never deleted
--     (retention.ts: "videos(id) cascades into the whole analysis"), so a
--     frozen video id opens a point to its videos years later. Measured
--     2026-09-15: 50 tombstoned videos, 0 deleted. The one thing that empties
--     it is scripts/regate-corpus.ts --apply, which deletes video rows outright
--     and calls itself "the most destructive operation an operator can run";
--     after a re-gate a frozen point reads "counted, not quotable" and there is
--     no way to recover it.
--   * comment_ids is the perishable half, and the reader is told so. Retention
--     takes a comment; the prune takes the evidence row that made it citable.
--     Resolvability is computed ON READ (lib/reading/evidence-refs.ts
--     resolveRefs → "N of M still quotable") and is never stored: a frozen
--     "still quotable" boolean is a lie within a week.
--   * it freezes on the same line and under the same two guards as the month
--     reading, so the ids and the count they explain freeze together or not at
--     all.
--
-- ONE THING THE DESIGN ASKED FOR IS NOT HERE: the LINK. `comments` carries no
-- URL. A deep link would have to be assembled from the platform's own comment
-- id — the same id the platform stopped serving, which is WHY retention deleted
-- our row. A frozen link is a stored pointer to something already gone, and the
-- product would be promising to open it. The platform is frozen (it is a fact
-- about the video), the date is the month itself, and a link is assembled at
-- render from videos.video_url, which survives a tombstone.
--
-- object_id IS TEXT AND CARRIES NO FOREIGN KEY, on purpose. month_theme_readings
-- keys theme_id to theme_registry(id) on delete cascade, so re-minting a
-- registry row takes its frozen months with it. That is right for a reading
-- (a number about a theme that no longer exists is unreadable) and wrong for a
-- record of which videos were read (they were read, whatever the grouping is
-- called now). A kind is a text enum, a subject is a uuid in another table, a
-- mood is a word; one column holds all of them and none of them cascades.
--
-- ============================================================================
-- APPLY: idempotent, applied twice on a throwaway PostgreSQL 17.11 cluster over
-- schema-baseline.sql + every 2026 migration in filename order. What was
-- exercised is recorded at the foot of this file.
-- ============================================================================

-- 1. The translation cache ----------------------------------------------------
create table if not exists public.comment_translations (
  client_id    uuid not null references public.clients(id) on delete cascade,
  comment_id   uuid not null references public.comments(id) on delete cascade,
  -- sha-256 (hex) of the exact text that was sent to the model, after the same
  -- whitespace collapse the renderers apply (lib/quotes.ts cleanQuote). The
  -- invalidation: an edited comment hashes differently and the old row is never
  -- asked for again.
  text_hash    text not null,
  -- The language the model detected, as a BCP-47-ish label it reported
  -- ('en', 'pt', 'es-419', 'zh-Hant'). Normalised by lib/gather/transcript.ts
  -- normaliseLang before it is written, the same fold the transcript path uses.
  -- This is the first per-comment language signal the schema has ever had: the
  -- only other language columns are on videos and describe the CREATOR's
  -- speech, which as a per-comment decider is 34–58% precise (refute-07 §1.3).
  language     text not null,
  -- The English rendering, or NULL for "there is nothing to render": the text
  -- is already English ('en'), or it carries no language at all ('und' — pure
  -- emoji, a bare handle, digits). NULL is a RESULT, not a missing value — the
  -- row exists, so the text has been read, and a text that has been read is
  -- never sent to the model again. Only a NON-ENGLISH, NON-'und' language with
  -- a null rendering is a failed reading, and that combination is never
  -- written.
  english      text,
  model        text not null,
  prompt_version text not null,
  translated_at timestamptz not null default now(),
  primary key (comment_id, text_hash)
);

comment on table public.comment_translations is
  'Machine translations of quoted comment text, one row per (comment, exact text). english NULL means the text is already English. A reading aid shown BESIDE the original, never in place of it, and never frozen into a snapshot — it is resolved at render like the original words are. Cascades from comments, so no translated copy survives a retention delete or an erasure; an EDIT is not a delete, so the YouTube refresh removes a comment's rows itself when the upstream text changes (lib/retention/youtube-refresh-io.ts) — otherwise a rendering of words the author removed would sit here under the old hash. NOTHING TENANT-SHAPED MAY BE ADDED TO THIS TABLE: lib/quotes.ts readTranslations queries it by text_hash with NO client predicate on the admin client (a snapshot hydrate, a document build, a scheduled digest, a share link), which is harmless only because a row is a translation of the exact bytes asked about and holds nothing anyone owns. A column that broke that would leak across tenants through a read with no tenant in it — TRANSLATION_COLUMNS pins what that read selects, and a test holds it.';
comment on column public.comment_translations.text_hash is
  'sha-256 hex of the exact text translated, whitespace-collapsed. The cache key''s second half and the only invalidation an edited comment gets: the YouTube refresh upserts a comment on (client_id, platform, comment_id), so an edit keeps the row id and changes the text.';
comment on column public.comment_translations.english is
  'NULL means there is nothing to render — the text is already English, or its language is ''und'' (it carries no language at all: pure emoji, a bare handle, digits). Either way it is a result the model returned, not an absent value, and the row exists so the text is never paid for again. Only a non-English, non-''und'' language with a NULL english is a failed reading, and that is never written.';
comment on column public.comment_translations.language is
  'The language the model detected in this text, or ''und'' where there is none to detect. The only per-comment language signal in the schema; videos.transcript_lang is the creator''s speech and is 34–58% precise used as a per-comment decider.';

-- TWO INDEXES, because the cache is read two different ways and the primary
-- key serves neither (it leads with comment_id, and PostgreSQL 17 has no skip
-- scan).
--   * a SESSION client reads it with RLS injecting client_id = get_my_client_id(),
--     so the tenant-led index is the one that serves a page;
--   * the ADMIN client reads it by text hash with no client predicate at all
--     (lib/quotes.ts readTranslations, reached from a snapshot hydrate, a
--     scheduled digest and a share link at /r/<token>), and without a
--     hash-led index every one of those chunks sequentially scans the table.
create index if not exists comment_translations_client_hash_idx
  on public.comment_translations (client_id, text_hash);
create index if not exists comment_translations_hash_idx
  on public.comment_translations (text_hash);

alter table public.comment_translations enable row level security;

drop policy if exists "Members read their comment translations" on public.comment_translations;
create policy "Members read their comment translations" on public.comment_translations
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.comment_translations from authenticated, anon;
grant select on public.comment_translations to authenticated;
-- Stated, not inherited from whatever the project's default ACL happens to be
-- (the config_changes precedent, 2026-09-15). Writes are the pipeline step's
-- and the backfill script's, both service role.
grant select, insert, update, delete on public.comment_translations to service_role;

-- 2. The evidence-id freeze ---------------------------------------------------
create table if not exists public.month_evidence_refs (
  client_id    uuid not null references public.clients(id) on delete cascade,
  month        date not null,
  -- The literal bucket string, competitor_name included verbatim — the same
  -- NAME, not identity, that month_denominators.audience is. A rival rename
  -- splits a frozen id list exactly as it splits a frozen count.
  audience     text not null,
  object_kind  text not null check (object_kind in ('theme', 'subject', 'kind', 'mood', 'audience')),
  -- theme_registry.id / subjects.id as text, a kind slug, a mood word, or the
  -- audience string again for the audience-wide row. Text and unkeyed on
  -- purpose — see the header.
  object_id    text not null,
  -- The videos this object's citations were read on, in this audience, in this
  -- month. The durable half: a video is tombstoned, never deleted.
  video_ids    uuid[] not null,
  -- The comments cited. The perishable half: retention deletes a comment, and
  -- the prune deletes the evidence row that made it quotable. Resolvability is
  -- computed on read and never stored.
  comment_ids  uuid[] not null,
  -- Videos per platform over the same distinct video set, as month_denominators
  -- carries it. Never pooled.
  platform_mix jsonb not null,
  status       text not null check (status in ('filling', 'frozen')),
  origin       text not null check (origin in ('live', 'back_read')),
  read_at      timestamptz not null,
  run_id       uuid references public.pipeline_runs(id) on delete set null,
  -- The clustering these ids were read under, as month_theme_readings carries
  -- it (20260918091000). The freeze STAMPS it — mergeMonthRows puts the run's
  -- fingerprint on every row of this merge — so the column has to exist or the
  -- whole upsert is a 42703 that the caller's non-fatal wrapper swallows, one
  -- console line a run, for ever. It belongs here on its own merits too: a
  -- theme's id list is a product of the grouping that made the theme, so two
  -- months' id lists are like-for-like only where this is equal, which is the
  -- same sentence run_id already carries.
  clustering_key text,
  frozen_at    timestamptz,
  primary key (client_id, month, audience, object_kind, object_id)
);

comment on table public.month_evidence_refs is
  'Which videos and which comments a month''s reading of one object rested on, frozen on the same line as the count it explains (design item 31a). Ids only — never a word anybody wrote. video_ids is durable (a video is tombstoned, never deleted); comment_ids decays as retention and the Pass A prune take the evidence, and how much of it still resolves is computed on read, never stored.';
comment on column public.month_evidence_refs.object_id is
  'A theme_registry id, a subject id, a kind slug, a mood word or the audience string, as text and with no foreign key. A frozen record of which videos were read survives a re-minted theme registry row; a frozen READING of that theme, which is month_theme_readings, correctly does not.';
comment on column public.month_evidence_refs.comment_ids is
  'The comments cited. Expect decay: measured on production 2026-09-15, 32 of 1,217 comment refs in shipped snapshots no longer resolved (31 to the weekly prune, 1 to retention), and 11 of 11 snapshots carrying comment refs had lost at least one.';
comment on column public.month_evidence_refs.run_id is
  'The run whose clustering produced this row, as month_theme_readings carries it. Months freeze under whatever clustering was current when each passed its line, so two rows are like-for-like only where run_id is equal.';

create index if not exists month_evidence_refs_object_idx
  on public.month_evidence_refs (client_id, object_kind, object_id, month);

-- Both guards, the same two this table's siblings carry. The BEFORE UPDATE
-- guard (20260915092000) refuses a rewrite of a frozen row; the BEFORE INSERT
-- guard (20260918092000) refuses a NEW row for an audience-month whose
-- denominator has already frozen, while still allowing the first back-read of a
-- table that did not exist when the month closed. Both functions read the
-- table's primary key out of the catalogue rather than naming it, which is why
-- a table with a five-column key can attach them unchanged.
drop trigger if exists month_evidence_refs_frozen_guard on public.month_evidence_refs;
create trigger month_evidence_refs_frozen_guard
  before update on public.month_evidence_refs
  for each row when (old.status = 'frozen')
  execute function public.month_reading_frozen_guard();

drop trigger if exists month_evidence_refs_frozen_insert_guard on public.month_evidence_refs;
create trigger month_evidence_refs_frozen_insert_guard
  before insert on public.month_evidence_refs
  for each row
  execute function public.month_reading_frozen_insert_guard();

alter table public.month_evidence_refs enable row level security;

drop policy if exists "Members read their month evidence refs" on public.month_evidence_refs;
create policy "Members read their month evidence refs" on public.month_evidence_refs
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.month_evidence_refs from authenticated, anon;
grant select on public.month_evidence_refs to authenticated;
-- Stated, not inherited from whatever the project's default ACL happens to be
-- (the config_changes precedent, 2026-09-15). The month tables' four, for the
-- month tables' reasons.
--
-- UPDATE IS REQUIRED, AND THE ACL IS NOT WHAT REFUSES A FROZEN ROW. A filling
-- audience-month's row is rewritten on every visit, and the writer is an
-- upsert — INSERT … ON CONFLICT DO UPDATE, which PostgreSQL refuses without
-- the UPDATE privilege even when no row actually conflicts. Taking the grant
-- away would not harden the freeze; it would make every refs write fail, be
-- swallowed by the non-fatal catch in lib/reading/monthly.ts, and leave this
-- table permanently empty. What refuses a correction to a frozen row is the
-- BEFORE UPDATE trigger above (month_reading_frozen_guard), which is a rule
-- about the ROW's status and not about the role — the same thing that protects
-- month_denominators and month_theme_readings, which hold the same four.
-- TRUNCATE is the one that goes: emptying the record in a single statement is
-- not an operation the merge needs.
grant select, insert, update, delete on public.month_evidence_refs to service_role;
revoke truncate on public.month_evidence_refs from service_role;

-- 3. The freeze-time read ------------------------------------------------------
-- The same joins monthly_theme_readings makes, returning the ids it collapses
-- into count(distinct …). Nothing new is computed and nothing new is read: the
-- `cited` CTE there already carries theme_id, month, audience, video_uuid,
-- platform and comment_id, and throws five of the six away.
--
-- SECURITY DEFINER with execute granted to service_role ONLY, the rule its
-- siblings keep: p_client is a parameter, so a function a tenant could call is
-- a function a tenant could call with someone else's id.
--
-- ON-CAMERA CITATIONS ARE INCLUDED IN video_ids AND NOT IN comment_ids, which
-- is what they are: a video whose only evidence was spoken on camera or printed
-- on the cover frame is a video the reading rested on, with no comment behind
-- it. The count beside it (excluded_on_camera) says how many such members there
-- were; this says which videos they were.
create or replace function public.monthly_evidence_refs(
  p_client uuid,
  p_run    uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  month        date,
  audience     text,
  theme_id     uuid,
  video_ids    uuid[],
  comment_ids  uuid[],
  platform_mix jsonb
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
    select o.theme_id, u.insight_id
    from public.theme_observations o, unnest(o.member_insight_ids) u(insight_id)
    where o.client_id = p_client and o.run_id = p_run
  ),
  ins as (
    select m.theme_id, ai.id as insight_id, ai.source_video_id
    from mem m
    join public.audience_insights ai on ai.id = m.insight_id
    where ai.client_id = p_client
  ),
  cited_all as (
    select i.theme_id, c.id as comment_id, c.comment_date, c.platform, c.video_id
    from ins i
    join public.insight_evidence ie on ie.audience_insight_id = i.insight_id and ie.source = 'comment'
    join public.comments c on c.id = ie.comment_id
    where c.client_id = p_client
  ),
  cited as (
    select ca.theme_id,
           date_trunc('month', ca.comment_date at time zone 'UTC')::date as month,
           v.audience, v.id as video_uuid, v.platform, ca.comment_id
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id and v.analysed
    where ca.comment_date >= p_from and ca.comment_date < p_to
  ),
  oncam as (
    select i.theme_id, i.insight_id, v.id as video_uuid, v.audience, v.platform
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
  oncam_in as (
    select o.theme_id, d.month, d.audience, o.video_uuid, o.platform
    from oncam o
    join denom d on d.video_uuid = o.video_uuid and d.audience = o.audience
  ),
  vids as (
    select c.theme_id, c.month, c.audience, c.video_uuid, c.platform from cited c
    union
    select oi.theme_id, oi.month, oi.audience, oi.video_uuid, oi.platform from oncam_in oi
  ),
  vid_ids as (
    select x.theme_id, x.month, x.audience,
           array_agg(distinct x.video_uuid) as video_ids
    from vids x group by 1, 2, 3
  ),
  cmt_ids as (
    select c.theme_id, c.month, c.audience,
           array_agg(distinct c.comment_id) as comment_ids
    from cited c group by 1, 2, 3
  ),
  per_platform as (
    select x.theme_id, x.month, x.audience, x.platform, count(distinct x.video_uuid) as n
    from vids x group by 1, 2, 3, 4
  ),
  mix as (
    select p.theme_id, p.month, p.audience, jsonb_object_agg(p.platform, p.n) as platform_mix
    from per_platform p group by 1, 2, 3
  )
  select v.month,
         v.audience,
         v.theme_id,
         v.video_ids,
         coalesce(c.comment_ids, '{}'::uuid[]),
         coalesce(m.platform_mix, '{}'::jsonb)
  from vid_ids v
  left join cmt_ids c on c.theme_id = v.theme_id and c.month = v.month and c.audience = v.audience
  left join mix     m on m.theme_id = v.theme_id and m.month = v.month and m.audience = v.audience
$$;

comment on function public.monthly_evidence_refs(uuid, uuid, timestamptz, timestamptz) is
  'The ids behind monthly_theme_readings'' counts: per theme per month per audience, the distinct videos read and the distinct comments cited, plus the platform mix over the same video set. Written down by freeze-months into month_evidence_refs so a frozen point can still be opened to WHICH videos after the words are gone.';

revoke all on function public.monthly_evidence_refs(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.monthly_evidence_refs(uuid, uuid, timestamptz, timestamptz) to service_role;

-- 4. The 2026-08-09 statement, narrowed ----------------------------------------
-- The live column comment reads "never evidence, never displayed, never frozen
-- into a snapshot". That stays TRUE OF TRANSCRIPTS and this file does not
-- change it for them — but as written it reads as a rule about translation in
-- general, and item 8 makes that reading false. Narrowed to the thing it is
-- actually about, with the reversal named so the next reader finds it.
comment on column public.videos.transcript_en is
  'English rendering of transcript, for non-English videos. A reading aid for Pass A and classify-meta: the ORIGINAL transcript is what a quote is validated against, and no word of this column is ever quoted, displayed or frozen into a snapshot. That rule is about TRANSCRIPTS (a creator''s speech) and is unchanged. It is not a rule about translation in general: since 2026-09-18 a quoted COMMENT does carry an English rendering beside the original, stamped as a machine translation and resolved at render from comment_translations — design item 8, which narrowed the 2026-08-09 "a hero quote never translates" decision to this column.';

-- ============================================================================
-- EXERCISED before it was ever applied, on a throwaway PostgreSQL 17.11 cluster
-- over schema-baseline.sql + every 2026 migration in filename order, applied
-- TWICE:
--   * idempotent — the second apply creates nothing twice, replaces the
--     function and both triggers, and leaves one trigger of each name;
--   * deleting a comment deletes its translations (the cascade), and deleting
--     a client deletes them too;
--   * a second translation of the SAME comment under a different text_hash is
--     accepted (the edited-comment path) and the two coexist;
--   * a new month_evidence_refs row for an audience-month whose denominator is
--     frozen raises restrict_violation, while the same row for a filling
--     audience-month is accepted, and the FIRST back-read of an audience-month
--     that froze before this table existed is accepted (decision K);
--   * an UPDATE of a frozen row raises restrict_violation — from the trigger,
--     which is the only thing that refuses it. service_role DOES hold UPDATE
--     here, and must: the writer is an upsert and a filling row is rewritten
--     every visit. Re-exercised 2026-09-15 on the same cluster after the grant
--     was corrected: `grant select, insert, delete` alone makes a plain
--     `insert … on conflict do update` fail with "permission denied for table"
--     even on a non-conflicting row, which is what the earlier wording would
--     have shipped;
--   * authenticated can select its own tenant's rows in both tables and no
--     other tenant's, and holds no insert/update/delete on either;
--   * monthly_evidence_refs returns the same distinct video and comment counts
--     that monthly_theme_readings returns as `videos` and `comments` on the
--     same fixture.
-- ============================================================================
