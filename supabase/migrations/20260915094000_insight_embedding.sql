-- Insight embedding in the pipeline (Phase 0, design item 36, 2026-09-15).
--
-- audience_insights.embedding is the Verbatim Agent's only retrieval index
-- (public.match_insights filters `embedding is not null`), and today it is
-- written by one manual script and by nothing else. Pass A's insert names ten
-- columns and not this one (lib/pipeline/pass-a.ts), so every insight is born
-- NULL, and re-analysing a video does not refresh a vector — persistVideo
-- deletes and re-inserts, so the row gets a new id and the old embedded row is
-- deleted by prune-stale-analysis. The vector is destroyed, not updated.
--
-- Measured on production 2026-09-15: 3,536 of 6,001 live insights carry no
-- vector (Össur 1,449 of 3,129, Sealand 2,087 of 2,872). The agent answers a
-- question against 41% of the corpus and says nothing about the other 59%,
-- because lib/agent/answer.ts only tests `embeddedInsightCount === 0` — an
-- empty index is caught, a half-empty one is silent.
--
-- This migration adds the two things the pipeline needs to keep the index
-- current itself: a per-row timestamp, and a bulk write.
--
-- WHY AN RPC AND NOT A TABLE WRITE. A bulk single-column write is not
-- expressible through PostgREST at all:
--   * PATCH with `.in('id', [...])` sets ONE value for every matched row.
--     Distinct vectors per row cannot be said that way.
--   * An upsert on the primary key carries the whole proposed tuple through
--     ExecConstraints BEFORE the conflict resolves, and this table has four
--     NOT NULL columns with no default (client_id, category, theme,
--     description). A {id, embedding} payload therefore fails 23502 even
--     though every row already exists.
--   * Widening the payload to satisfy those four is worse, not better: on the
--     INSERT branch an upsert RESURRECTS a row deleted between the read and
--     the write — by persistVideo's per-run delete or by prune-stale-analysis
--     — with a null run_id, a null source_video_id and no insight_evidence.
--     That row is then invisible to audience_insights_current and would never
--     be pruned again.
-- An UPDATE ... FROM a values list is expressible, and both halves of the
-- pattern already run in production: a SECURITY DEFINER write RPC
-- (public.increment_share_view) and a vector-typed RPC parameter
-- (public.match_insights(p_query vector), called on every agent question).
--
-- The write shape one row at a time is a network defect, not a database one:
-- measured 220 ms per round trip ZA→eu-west-1 against 0.24 ms of Postgres, so
-- the 3,536-row backlog is ~13 minutes of round trips and ~30 s of database.
-- The caller chunks at 100 rows (lib/pipeline/embed-insights.ts) — 1.9 MB of
-- body, the size the themes insert settled on after a 10 MB statement took
-- 13.4 s and died 57014 on the 2026-09-13 run.

-- 1. When this row's vector was written ---------------------------------------
-- Not created_at (that is the insight's birth: the backlog's rows were created
-- on 2026-09-06 and 2026-09-13 and are still NULL), not run_id (its FK is ON
-- DELETE SET NULL, so a deleted run leaves no trace), not
-- pipeline_runs.steps_completed (0 of 49 rows have ever carried a value).
-- The readiness page's "embeddings: N of M, last written {date}" row reads it.
alter table public.audience_insights add column if not exists embedded_at timestamptz;

comment on column public.audience_insights.embedded_at is
  'When embedding was written, by the pipeline''s embed-insights step or by scripts/embed-insights.ts. Null on every row that predates 2026-09-15 and on every row with no vector. Never updated in place — a re-analysed video gets a new row.';

-- 2. The view must be replaced, for the same reason it was on 2026-08-23 -------
-- audience_insights_current is `select ai.*`, and Postgres expands `*` ONCE, at
-- view-creation time. The column list frozen on 2026-08-23 is fifteen columns
-- ending at `embedding` (verified against production before writing this), so
-- without this replace `embedded_at` reaches the base table and never reaches
-- the population surface — and the readiness row reads coverage through the
-- view, as AGENTS.md requires population reads to.
--
-- Safe as a REPLACE: create or replace view may only APPEND columns, and
-- `embedded_at` is the newest column on the base table, so every pre-existing
-- column keeps its name, type and position; exactly one column is appended.
-- Grants survive a replace (the object is not dropped); security_invoker does
-- not, so it is restated.
--
-- Nothing starts pulling a column by accident: every reader of this view in the
-- repo names its columns (engage, pass-e, step-a2, voice, the prune counter,
-- coverage-report, the backfill script). Checked, not assumed.
create or replace view public.audience_insights_current
  with (security_invoker = true) as
  select ai.*
  from public.audience_insights ai
  join public.videos v on v.id = ai.source_video_id and ai.run_id = v.analyzed_run_id;

-- 3. The bulk write ------------------------------------------------------------
-- p_rows is [{"id": "<uuid>", "embedding": [1536 floats]}, ...]. jsonb's own
-- array text is pgvector's input format, so the cast is direct.
--
-- `and ai.embedding is null` is the whole safety story and it is deliberate:
--   * it makes the call idempotent — a step retry re-sends rows that already
--     landed and they are skipped, so the returned count is "rows this call
--     actually wrote", not "rows I asked about";
--   * it means this function can never overwrite a vector. A model change or
--     an embedInput change needs the existing vectors cleared first — a
--     deliberate, separate act, which is why the backfill script refuses
--     --force rather than quietly writing nothing. Vectors built from
--     different text are not comparable, and a half-rebuilt corpus is a
--     silent retrieval failure, so the clearing is the decision and this
--     function is not the place to make it.
-- A row that no longer exists (pruned between the read and the write) simply
-- matches nothing. That is the outcome an upsert could not give.
--
-- `and r.emb is not null` is the second half of that. Without it an element
-- carrying no `embedding` key casts to NULL, and the UPDATE happily sets
-- embedding = null, embedded_at = now() and COUNTS it — a row that reports
-- itself embedded and is not (found by exercising this function on a local
-- cluster, 2026-09-15). With it, a malformed element writes nothing and the
-- returned count stays honest.
--
-- Everything else is caller-enforced by shape: a wrong-length or non-array
-- embedding raises from the cast and the WHOLE call rolls back (one statement,
-- so no chunk is ever half-written — the themes.ts rule), and two elements
-- naming the same id would leave which vector won unspecified, which is why
-- the caller reads distinct primary keys.
--
-- SECURITY DEFINER because audience_insights carries RLS and the writer is the
-- service role (which bypasses it anyway) — but stated, not inherited, so the
-- grant below is the only way in. search_path is pinned; `vector` lives in
-- public on this database (verified 2026-09-15, pgvector 0.8.0).
create or replace function public.set_insight_embeddings(p_rows jsonb)
returns int
language sql
security definer
set search_path = public, pg_temp
as $$
  with r as (
    select (e->>'id')::uuid as id, (e->>'embedding')::vector(1536) as emb
    from jsonb_array_elements(p_rows) e
  ),
  u as (
    update public.audience_insights ai
       set embedding = r.emb, embedded_at = now()
      from r
     where ai.id = r.id
       and ai.embedding is null
       and r.emb is not null
    returning ai.id
  )
  select count(*)::int from u
$$;

comment on function public.set_insight_embeddings(jsonb) is
  'Bulk-write insight embeddings. Takes [{id, embedding:[1536 floats]}]; writes only rows whose embedding is still null and returns how many landed. Service role only.';

revoke all on function public.set_insight_embeddings(jsonb) from public, anon, authenticated;
grant execute on function public.set_insight_embeddings(jsonb) to service_role;
