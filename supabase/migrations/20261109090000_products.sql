-- Your products (depth redesign v2, T10; plan decision 3, option B) and the
-- weekly post ideas (T13). NOT APPLIED ANYWHERE YET: written 13 Oct on
-- depth/t10-schema; applying it is Heinrich's step.
--
-- WHAT IT ADDS. Seven new tables, one new trigger function (a guard) and two
-- read functions; two existing functions replaced with their bodies plus two
-- tables; one widened CHECK.
--   product_groups          a client's product categories ("Liners", "Feet").
--                           The page says "categories"; the table never does,
--                           because `category` already names the non-rival
--                           bucket and the insight kind (research D §10)
--   products                the client's products, each in one group
--   product_aliases         the names people use for a product or a category,
--                           and the category's own words; what the rules match
--   product_mentions        every placement of a video's content or a comment
--                           under the catalogue: named, couldn't tell which,
--                           the category in general, or none of it.
--                           Append-only, brand_mentions' shape (MF2)
--   product_tags            a person's verdict from "Tag the product".
--                           Append-only; a re-tag supersedes, never edits
--   month_product_readings  a product's or a category's month, per audience,
--                           with the month tables' three guards (MF3's
--                           month_brand_readings shape)
--   post_ideas              the run's three post ideas (T13)
--   product_catalogue()     the active catalogue and its data-derived version,
--                           read in one snapshot
--   product_month_videos()  the month's videos a product reading counts: every
--                           audience, the client's included, each marked owned
--                           or not (T5: the market's words, never the brand's)
--   regate_videos / regate_restore   + product_mentions and product_tags
--   config_changes_surface_check     + 'products'
--
-- THE CONVENTIONS ARE MF1's (20260928090000_market_first_s1.sql). Every table:
-- RLS on, one get_my_client_id() select policy, every privilege revoked from
-- anon and authenticated, then column-level SELECT for authenticated (every
-- column: nothing here is an operator's private words). No tenant write policy
-- anywhere: the catalogue is written as tracking settings are, by a server
-- action through the service role after its own role and lock checks (T10b,
-- lib/actions; app/dashboard/settings/actions.ts is the template), by the seed
-- script with scriptActor (T12), and by the pipeline. What service_role keeps
-- depends on the table:
--   product_groups, products   SELECT and INSERT, and UPDATE on the columns an
--       edit moves (column grants): a rename, a move between categories, a
--       retirement. Never DELETE: a product or category that ever placed talk
--       is named by placements and frozen months that must still render
--       (retireRival's rule, lib/rivals.ts), so removing one is retiring it
--   product_aliases   append-only but for its one retirement stamp (the
--       tracking_config_queue shape, MF3): a renamed alias is a retirement
--       plus a new row, so the catalogue of any past moment can be read back
--   product_mentions, product_tags   append-only: UPDATE, DELETE and TRUNCATE
--       revoked. A new catalogue version, a model verdict, a confirm verdict
--       or a person's tag is a row of its own, never an edit
--   month_product_readings   the month tables' four (the upsert needs UPDATE,
--       the stale sweep DELETE on filling rows); TRUNCATE revoked. The guards,
--       not the ACL, refuse a frozen row
--   post_ideas   SELECT, INSERT and UPDATE (an upsert of the run's ranks, the
--       week_reads precedent); DELETE and TRUNCATE revoked
-- A foreign-key cascade still works: referential actions run as the owner,
-- and the delete guard lets a tenant's own removal through.
--
-- VERSIONED BY THE DATA (decision 3; research D §2: an alias edit that mints no
-- version silently moves counts). product_catalogue(p_client) returns the
-- client's ACTIVE catalogue and `version`, 'pc1_' plus 16 hex of an md5 over
-- the active categories, products and aliases (ids, the product's category,
-- lower-cased names and aliases, alias kinds and their confirm flags; never a
-- sort order, a timestamp or an actor). The same catalogue always reads the
-- same version and any edit that could move a placement reads a new one,
-- reverting an edit included. Every placement and every month row carries the
-- version it was made under (catalogue_version), so a reader knows which
-- catalogue made a count and compares two months like-for-like only where it
-- is equal (month_subject_readings' judge_version rule). One function, one
-- statement: the version a writer stores is the catalogue it compiled.
--
-- THE MONTH TABLE'S ONE-SHOT. month_product_readings attaches the three
-- existing guard functions unchanged, as month_brand_readings does (MF3), so a
-- closed audience-month takes its product rows ONCE: the first back-read of a
-- month that closed before the table existed, or before the client had a
-- catalogue (decision K's arm). A product or alias added after that has no
-- history for the closed month and cannot be given one (AGENTS.md "One-shot
-- history"; research D risk 1). The insert guard reads the table's primary key
-- out of the catalogue, so every key column is NOT NULL: the row names its
-- object as (object_kind, object_id), and product_id / group_id beside it carry
-- the foreign keys.
--
-- THE CHANGE LOG. Catalogue edits are logged by their writers through
-- recordConfigChange on the new surface 'products' (the subjects precedent: no
-- trigger watches these tables). Under 'other' they would read as a change of
-- ours to every view and cut charts (lib/reading/comparability.ts); 'products'
-- is in neither TRACKING_SURFACES nor WEEK_CUT_SURFACES, and the comparability
-- reader drops it (NOT_OUR_CHANGES): a catalogue edit moves no video into or
-- out of the corpus, and the product readings carry their own version.
--
-- NO OTHER CHECK WIDENS. No reader in this build needs a product kind in
-- sent_figures, month_evidence_refs, anomaly_flags, comparability_checks or
-- month_lens_readings: no artefact sends a product figure yet (T11b's page
-- lines are frozen into the week read), product_mentions is itself the
-- versioned, append-only record of which videos and comments a product month
-- counted (month_evidence_refs exists because insight ids churn; a placement
-- does not), and products are not flagged or re-checked. The kind joins those
-- CHECKs the day a writer needs it (MF2's WP2.1 widened sent_figures for that
-- reason: recordSend is non-fatal and a refused kind is a lost row).
--
-- THE REGATE. regate_videos() removes a video and everything hanging off it,
-- each row backed up first, and regate_restore() puts it back
-- (20261106092000). product_mentions and product_tags hang off videos and
-- comments, so without this a regate would cascade them away with no backup
-- and a restore would bring the video back without its placements and the
-- person's tags. Both bodies are 20261106092000's, byte for byte (production's
-- prosrc md5 matched that file on 13 Oct), plus those two tables in the backup,
-- the removal and the restore. Tags restore before mentions (a 'tag' mention
-- names its tag). month_product_readings is untouched, as every month table is
-- (no foreign key reaches it), and post_ideas holds comment ids in jsonb with
-- no key, as a stored read does.
--
-- IDEMPOTENT. `if not exists`, `create or replace`, drop-then-create for the
-- policies, triggers and the CHECK, grants that end where they began. No
-- CONCURRENTLY, no BEGIN/COMMIT: the runner wraps the file in one transaction.
-- Proven before production (phase1-staging is paused) on a throwaway
-- PostgreSQL 17 cluster, 13 Oct: scripts/pg-shim/throwaway.sh up --before
-- 20261109090000, then twice with this file (the catalogue diff after the
-- second application is empty), then scripts/pg-shim/products-checks.sql
-- (throwaway.sh check), which exercises the RLS, the append-only grants, the
-- guards' one-shot, the version and a regate round trip; and the runner's
-- `products` set through scripts/pg-shim/test-runner.sh <dir> products.
-- Applied to production by scripts/apply-market-first-migrations.sh --set
-- products.

-- =============================================================================
-- 1. The catalogue
-- =============================================================================

-- A category of the client's products, as the client names it. Identity is the
-- id: a rename keeps the category's line (the version moves instead).
create table if not exists public.product_groups (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  name          text not null,
  status        text not null default 'active' check (status in ('active', 'retired')),
  -- Display order on the page and in Settings. Not part of the version.
  sort          int not null default 0,
  -- The website a seeded row was filled in from ('ossur.com'), for the board's
  -- "We filled this in from ossur.com on 11 Oct" (with created_at); null for a
  -- row a person added.
  seeded_from   text,
  retired_at    timestamptz,
  created_at    timestamptz not null default now(),
  -- Set by every UPDATE's writer, with the actor below (no trigger writes a
  -- catalogue row: lib/pipeline/freeze-parity.test.ts admits guards only).
  updated_at    timestamptz not null default now(),
  -- Who last wrote the row (lib/config-log.ts ConfigActor: actorStamp,
  -- scriptActor, pipelineActor). The change log is the history; this is the
  -- latest hand. No foreign key on the user, as subjects.created_by has none.
  actor_kind    text not null check (actor_kind in ('user', 'operator', 'script', 'pipeline')),
  actor_user_id uuid,
  actor_label   text not null,
  constraint product_groups_id_client unique (id, client_id),
  constraint product_groups_name_check check (
    name = btrim(name) and char_length(name) between 1 and 60 and name !~ '[[:cntrl:]]'),
  constraint product_groups_retired_check check ((status = 'retired') = (retired_at is not null)),
  constraint product_groups_seeded_from_check check (seeded_from is null or seeded_from <> ''),
  constraint product_groups_actor_label_check check (actor_label <> '')
);
-- One live category per name per client; a retired one keeps its name.
create unique index if not exists product_groups_live_name_idx
  on public.product_groups (client_id, lower(name)) where status = 'active';

comment on table public.product_groups is
  'A client''s product categories (the page''s "categories"). Identity is the id; a category is retired, never deleted, because placements and frozen months name it. Written by the service role only.';

-- A product, in one category. Moving it to another category is an UPDATE of
-- group_id (a new version); its placements keep the category they were made
-- under.
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  group_id      uuid not null,
  name          text not null,
  status        text not null default 'active' check (status in ('active', 'retired')),
  sort          int not null default 0,
  seeded_from   text,
  retired_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  actor_kind    text not null check (actor_kind in ('user', 'operator', 'script', 'pipeline')),
  actor_user_id uuid,
  actor_label   text not null,
  constraint products_id_client unique (id, client_id),
  -- The category is the same client's (the client_statement_readings shape).
  -- NO ACTION: a category with products is retired, not deleted; deleting the
  -- CLIENT still works, both sides cascading from clients in one statement.
  constraint products_group foreign key (group_id, client_id)
    references public.product_groups (id, client_id) on delete no action,
  constraint products_name_check check (
    name = btrim(name) and char_length(name) between 1 and 80 and name !~ '[[:cntrl:]]'),
  constraint products_retired_check check ((status = 'retired') = (retired_at is not null)),
  constraint products_seeded_from_check check (seeded_from is null or seeded_from <> ''),
  constraint products_actor_label_check check (actor_label <> '')
);
create unique index if not exists products_live_name_idx
  on public.products (client_id, lower(name)) where status = 'active';
create index if not exists products_group_idx on public.products (client_id, group_id);

comment on table public.products is
  'A client''s products, each in one category. Identity is the id; a product is retired, never deleted, because placements and frozen months name it. Written by the service role only.';

-- What the rules match: a product's name and the other names people use for
-- it, and a category's words. Exactly one target. The matcher's contract
-- (T11, lib/products): an alias of a PRODUCT names that product (placement
-- 'named'); a 'category_word' (a category's only) is talk about the category
-- in general ('unbranded') unless the model reads more into it; a category's
-- 'name' or 'nickname' (a product family, "Pro-Flex") is one of the client's
-- products in that category, the rules unable to tell which ('unclear').
-- needs_confirm marks a generic word ("Unity", "Comfort", "Total Knee") whose
-- hit goes to the confirm call before it places anything.
--
-- Retired, never edited: changing the words is a retirement plus a new row, so
-- the aliases of any past moment read back from created_at and retired_at.
create table if not exists public.product_aliases (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  product_id    uuid,
  group_id      uuid,
  alias         text not null,
  kind          text not null check (kind in ('name', 'nickname', 'category_word')),
  needs_confirm boolean not null default false,
  seeded_from   text,
  created_at    timestamptz not null default now(),
  actor_kind    text not null check (actor_kind in ('user', 'operator', 'script', 'pipeline')),
  actor_user_id uuid,
  actor_label   text not null,
  retired_at    timestamptz,
  retired_by    uuid,
  retired_label text,
  constraint product_aliases_product foreign key (product_id, client_id)
    references public.products (id, client_id) on delete no action,
  constraint product_aliases_group foreign key (group_id, client_id)
    references public.product_groups (id, client_id) on delete no action,
  constraint product_aliases_target_check check (num_nonnulls(product_id, group_id) = 1),
  constraint product_aliases_kind_target_check check (kind <> 'category_word' or group_id is not null),
  -- Two characters at least: a one-letter alias matches everything.
  constraint product_aliases_alias_check check (
    alias = btrim(alias) and char_length(alias) between 2 and 80 and alias !~ '[[:cntrl:]]'),
  constraint product_aliases_retired_check check (
    (retired_at is null and retired_by is null and retired_label is null)
    or (retired_at is not null and coalesce(retired_label, '') <> '')),
  constraint product_aliases_seeded_from_check check (seeded_from is null or seeded_from <> ''),
  constraint product_aliases_actor_label_check check (actor_label <> '')
);
-- One live alias per word per client: a word places talk under one target. A
-- word shared by several products of a category is that category's nickname.
create unique index if not exists product_aliases_live_idx
  on public.product_aliases (client_id, lower(alias)) where retired_at is null;
create index if not exists product_aliases_product_idx
  on public.product_aliases (product_id) where product_id is not null;
create index if not exists product_aliases_group_idx
  on public.product_aliases (group_id) where group_id is not null;

comment on table public.product_aliases is
  'The words the rules match for a product (its name, other names people use) or a category (its words, a product family''s name), with a flag for generic words the confirm call must check. Retired, never edited: a change of words is a retirement plus a new row.';

-- BEFORE UPDATE on product_aliases: the one change an alias takes is its
-- retirement, once. service_role holds UPDATE on the three retirement columns
-- alone; this also holds for a role that holds more.
create or replace function public.product_aliases_retire_once()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $once$
begin
  if old.retired_at is not null then
    raise exception 'a retired alias stays retired: % was retired at %', old.id, old.retired_at
      using errcode = 'restrict_violation',
            hint = 'Add the words again as a new alias. The catalogue of a past moment is read back from these rows.';
  end if;
  if new.retired_at is null then
    raise exception 'an alias is retired, never rewritten: %', old.id
      using errcode = 'restrict_violation',
            hint = 'Retire it and add the new words as a new alias.';
  end if;
  if (to_jsonb(new) - array['retired_at', 'retired_by', 'retired_label'])
     is distinct from (to_jsonb(old) - array['retired_at', 'retired_by', 'retired_label']) then
    raise exception 'an alias is retired, never rewritten: %', old.id
      using errcode = 'restrict_violation',
            hint = 'Only retired_at, retired_by and retired_label are stamped, once.';
  end if;
  return new;
end
$once$;

comment on function public.product_aliases_retire_once() is
  'BEFORE UPDATE on product_aliases: lets the retirement be stamped once, from live, and refuses every other change.';

drop trigger if exists product_aliases_retire_once on public.product_aliases;
create trigger product_aliases_retire_once
  before update on public.product_aliases
  for each row
  execute function public.product_aliases_retire_once();

-- The client's ACTIVE catalogue and its version, in one snapshot: active
-- categories, their active products, and the live aliases of those. Null when
-- the client has no active category (nothing to place). `version` is
-- 'pc1_' || 16 hex of md5 over one sorted line per row (the header's
-- VERSIONED BY THE DATA); the rows come back in display order. A writer stores
-- this version on what it places with this catalogue, never one it read apart.
create or replace function public.product_catalogue(p_client uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with g as (
    select pg.id, pg.name, pg.sort
    from public.product_groups pg
    where pg.client_id = p_client and pg.status = 'active'
  ),
  p as (
    select pr.id, pr.group_id, pr.name, pr.sort
    from public.products pr
    join g on g.id = pr.group_id
    where pr.client_id = p_client and pr.status = 'active'
  ),
  a as (
    select al.id, al.product_id, al.group_id, al.alias, al.kind, al.needs_confirm
    from public.product_aliases al
    where al.client_id = p_client
      and al.retired_at is null
      and (al.product_id in (select p.id from p)
           or (al.product_id is null and al.group_id in (select g.id from g)))
  ),
  canon as (
    select string_agg(x.line, E'\n' order by x.line) as body
    from (
      select 'g|' || g.id || '|' || lower(g.name) as line from g
      union all
      select 'p|' || p.id || '|' || p.group_id || '|' || lower(p.name) from p
      union all
      select 'a|' || coalesce(a.product_id, a.group_id) || '|' || a.kind || '|' || a.needs_confirm || '|' || lower(a.alias) from a
    ) x
  )
  select case when exists (select 1 from g) then jsonb_build_object(
    'version', 'pc1_' || left(md5(c.body), 16),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'sort', g.sort)
                                         order by g.sort, g.name, g.id), '[]'::jsonb) from g),
    'products', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'group_id', p.group_id, 'name', p.name, 'sort', p.sort)
                                           order by p.sort, p.name, p.id), '[]'::jsonb) from p),
    'aliases', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'product_id', a.product_id, 'group_id', a.group_id,
                                                             'alias', a.alias, 'kind', a.kind, 'needs_confirm', a.needs_confirm)
                                          order by lower(a.alias), a.id), '[]'::jsonb) from a))
  end
  from canon c
$$;

-- The month's videos a product reading counts (depth v2 T5; the lead's ruling
-- of 13 Oct): market_month_videos' rule (full-lane videos, the comments Pass A
-- read, with a comment dated in the month, UTC) over EVERY audience, the
-- client's included. A creator's video that names the client is where talk
-- about its products lives, and the comments under the client's own posts are
-- the market speaking on the brand's post: both count. What the client's own
-- posts SAY never places anything (lib/products/readings.ts contentFields
-- leaves an owned video's words out), which is why `owned` comes back:
-- videos.source = 'owned' (lib/reading/owned.ts OWNED_SOURCE). The audience
-- strings are monthly_denominators' own, the client first (lib/rivals.ts
-- audienceOf), so a month's audiences add up to distinct videos.
create or replace function public.product_month_videos(p_client uuid, p_month date)
returns table (video_id uuid, audience text, platform text, dated_comments int, owned boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select (date_trunc('month', p_month)::date)::timestamp at time zone 'UTC' as t0,
           ((date_trunc('month', p_month) + interval '1 month')::date)::timestamp at time zone 'UTC' as t1
  ),
  vid as (
    select v.id, v.platform, v.video_id,
           case when v.is_client     then 'client'
                when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience,
           coalesce(v.source = 'owned', false) as owned
    from public.videos v
    where v.client_id = p_client
      and v.analyzed_lane = 'full'
  )
  select v.id, v.audience, v.platform, count(distinct c.id)::int, v.owned
  from public.comments c
  join vid v on v.platform = c.platform and v.video_id = c.video_id
  cross join bounds b
  where c.client_id = p_client
    and c.comment_date >= b.t0
    and c.comment_date <  b.t1
  group by v.id, v.audience, v.platform, v.owned
$$;

comment on function public.product_catalogue(uuid) is
  'The client''s active product catalogue (categories, products, live aliases) and its data-derived version (pc1_ + 16 hex), read in one snapshot. Null when the client has no active category. Never writes.';

-- =============================================================================
-- 2. Placements and tags
-- =============================================================================

-- A person's verdict from "Tag the product" (the "Not your market" shape,
-- lib/segments/override.ts): which product, category or none a comment (or a
-- video as a whole, comment_id null) is about. Append-only. The newest tag on a
-- target is the one that applies; `supersedes` names the tag it replaced, and
-- the two unique indexes make a target's tags one chain (one first tag, each
-- tag replaced at most once), so two people re-tagging one comment at once
-- cannot both stand: the second insert fails and the action says it changed.
-- A tag cascades away with its comment (YouTube retention) as a placement does.
create table if not exists public.product_tags (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  video_id      uuid not null references public.videos(id) on delete cascade,
  comment_id    uuid references public.comments(id) on delete cascade,
  placement     text not null check (placement in ('named', 'unclear', 'unbranded', 'none')),
  product_id    uuid,
  group_id      uuid,
  supersedes    uuid,
  actor_kind    text not null check (actor_kind in ('user', 'operator', 'script', 'pipeline')),
  actor_user_id uuid,
  actor_label   text not null,
  created_at    timestamptz not null default now(),
  constraint product_tags_id_client_video unique (id, client_id, video_id),
  constraint product_tags_product foreign key (product_id, client_id)
    references public.products (id, client_id) on delete no action,
  constraint product_tags_group foreign key (group_id, client_id)
    references public.product_groups (id, client_id) on delete no action,
  -- The tag it replaced: the same client's, on the same video.
  constraint product_tags_supersedes foreign key (supersedes, client_id, video_id)
    references public.product_tags (id, client_id, video_id) on delete no action,
  constraint product_tags_supersedes_self_check check (supersedes is null or supersedes <> id),
  -- Named: a product and the category it was in. Couldn't tell which, or the
  -- category in general: a category. None of the catalogue: neither.
  constraint product_tags_target_check check (
    (placement = 'named' and product_id is not null and group_id is not null)
    or (placement in ('unclear', 'unbranded') and product_id is null and group_id is not null)
    or (placement = 'none' and product_id is null and group_id is null)),
  constraint product_tags_actor_label_check check (actor_label <> '')
);
create unique index if not exists product_tags_one_first
  on public.product_tags (client_id, video_id, coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where supersedes is null;
create unique index if not exists product_tags_one_successor
  on public.product_tags (supersedes) where supersedes is not null;
create index if not exists product_tags_comment_idx
  on public.product_tags (comment_id) where comment_id is not null;

comment on table public.product_tags is
  'A person''s verdict on which product or category a comment (or a video) is about, from Tag the product. Append-only: a re-tag is a new row that supersedes the last; the newest tag on a comment applies.';

-- Every placement of talk under the catalogue: a video's content (account,
-- caption, hashtags, transcript, its English translation, on-screen text) or a
-- comment on it (with the comment's month), placed as
--   named       it names one of the client's products (product_id, and the
--               category it was in, group_id)
--   unclear     about one of the client's products in a category, not which
--   unbranded   about the category in general
--   none        about none of the catalogue (the model read it and said so,
--               a confirm call refused a generic word's hit, or a person did),
--               so the same text is not read again under the same version
-- by `method`: who placed it.
--   rule        the matcher (lib/products, T11): rule_version is its version
--   confirmed   the confirm call on a needs_confirm hit: model and
--               prompt_version name it; a refusal is placement 'none'
--   model       the classifier on what the rules missed: model and
--               prompt_version name it
--   tag         a person (product_tags; tag_id names the verdict)
-- Every row carries the catalogue version it was made under. Append-only and
-- versioned, brand_mentions' rule (MF2): a new version, a verdict or a tag is
-- a row of its own, never an edit. Which row applies is the reader's (T11):
-- the precedence tag > confirmed > model > rule under one catalogue version.
-- Derived; not a month table: a product's month is read from these rows and
-- the month's market set into month_product_readings.
create table if not exists public.product_mentions (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  video_id          uuid not null references public.videos(id) on delete cascade,
  source            text not null check (source in ('content', 'comment')),
  -- account | caption | hashtags | transcript | transcript_en | ocr (content)
  field             text,
  comment_id        uuid references public.comments(id) on delete cascade,
  comment_month     date,
  placement         text not null check (placement in ('named', 'unclear', 'unbranded', 'none')),
  product_id        uuid,
  group_id          uuid,
  method            text not null check (method in ('rule', 'model', 'confirmed', 'tag')),
  -- The placing method's own version: the matcher's for a rule row, the
  -- confirm's or the classifier's for theirs, the tag step's for a tag.
  rule_version      text not null,
  catalogue_version text not null,
  model             text,
  prompt_version    text,
  tag_id            uuid,
  found_at          timestamptz not null default now(),
  constraint product_mentions_product foreign key (product_id, client_id)
    references public.products (id, client_id) on delete no action,
  constraint product_mentions_group foreign key (group_id, client_id)
    references public.product_groups (id, client_id) on delete no action,
  -- A tag's placement is on the tag's own video, and goes with the tag.
  constraint product_mentions_tag foreign key (tag_id, client_id, video_id)
    references public.product_tags (id, client_id, video_id) on delete cascade,
  -- brand_mentions' source shape: a content row names no comment (and its
  -- field, unless a model or a person placed the video as a whole); a comment
  -- row names its comment and that comment's month (the first of it).
  constraint product_mentions_source_shape_check check (
    (source = 'content' and comment_id is null and comment_month is null
       and (field in ('account', 'caption', 'hashtags', 'transcript', 'transcript_en', 'ocr')
            or (field is null and method in ('model', 'tag'))))
    or (source = 'comment' and comment_id is not null and comment_month is not null)),
  constraint product_mentions_comment_month_check check (
    comment_month is null or comment_month = date_trunc('month', comment_month)::date),
  constraint product_mentions_target_check check (
    (placement = 'named' and product_id is not null and group_id is not null)
    or (placement in ('unclear', 'unbranded') and product_id is null and group_id is not null)
    or (placement = 'none' and product_id is null and group_id is null)),
  -- A model's verdict names the model and its prompt; a rule's or a person's
  -- names neither. A tag row names its tag, and only a tag row does.
  constraint product_mentions_method_shape_check check (
    (method in ('model', 'confirmed') and coalesce(model, '') <> '' and coalesce(prompt_version, '') <> '')
    or (method in ('rule', 'tag') and model is null and prompt_version is null)),
  constraint product_mentions_tag_check check ((method = 'tag') = (tag_id is not null)),
  constraint product_mentions_rule_version_check check (rule_version <> ''),
  constraint product_mentions_catalogue_version_check check (catalogue_version ~ '^pc[0-9]+_[0-9a-f]{16}$')
);
-- One placement per video, comment, target, method and version (a tag's row
-- per tag and version, below): a retried write collides instead of doubling.
create unique index if not exists product_mentions_uniq on public.product_mentions
  (client_id, video_id, source, coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid),
   method, rule_version, catalogue_version)
  where method <> 'tag';
create unique index if not exists product_mentions_one_per_tag
  on public.product_mentions (tag_id, catalogue_version) where method = 'tag';
create index if not exists product_mentions_version_idx
  on public.product_mentions (client_id, catalogue_version);
create index if not exists product_mentions_comment_idx
  on public.product_mentions (comment_id) where comment_id is not null;

comment on table public.product_mentions is
  'Every placement of a video''s content or a comment under the client''s catalogue (named, unclear, unbranded, none), by rule, model, confirm call or a person''s tag, with the catalogue version it was made under. Derived and versioned; append-only.';

-- =============================================================================
-- 3. month_product_readings
-- =============================================================================

-- A product's or a category's month, per audience: of the audience's videos
-- the month reads (n, the market set month_brand_readings counts over: read in
-- full, a comment dated in the month), those placed under it. On a CATEGORY
-- row the split is exclusive, by precedence: a video naming one of its
-- products is named, else one about one of them is unclear, else one about the
-- category is unbranded, so k_named + k_unclear + k_unbranded = k_any (the
-- board's "11 name one of your liners · 11 … couldn't tell which · 30 …
-- in general", of 52). A PRODUCT row is its named videos alone. `comments`:
-- the comments dated in the month placed under it. k_organic and n_organic
-- are k_any and n leaving out every video ANY of our rival searches found,
-- current and retired: month_brand_readings' one base (MF3; lib/brands/
-- rival-searches.ts readRivalFound), so a product or a category is never
-- counted on our own searching for the brands that make them, and a reader
-- puts the two tables' organic counts side by side over one denominator.
-- Decided 13 Oct (Heinrich; depth v2 T11 step 0) and added before the first
-- apply: the one-shot back-read could never gain them later. Written by the run's
-- product-readings step (before freeze-months, as brand-readings is) and once
-- by the back-read (T12). The existing three guards attach unchanged.
create table if not exists public.month_product_readings (
  client_id         uuid not null references public.clients(id) on delete cascade,
  month             date not null,
  audience          text not null,
  object_kind       text not null check (object_kind in ('group', 'product')),
  object_id         uuid not null,
  -- The category: the row's own on a category row, the product's category
  -- when read on a product row.
  group_id          uuid not null,
  -- The product on a product row; null on a category row.
  product_id        uuid,
  k_named           int not null,
  k_unclear         int not null,
  k_unbranded       int not null,
  k_any             int not null,
  -- k_any and n without any video a rival search of ours found (MF3's
  -- month_brand_readings base, lib/brands/rival-searches.ts).
  k_organic         int not null,
  comments          int not null,
  n                 int not null,
  n_organic         int not null,
  status            text not null check (status in ('filling', 'frozen')),
  origin            text not null check (origin in ('live', 'back_read')),
  read_at           timestamptz not null,
  run_id            uuid references public.pipeline_runs(id) on delete set null,
  -- The placement method's version (matcher, confirm, classifier) and the
  -- catalogue's: a cross-month comparison is like-for-like where both are equal.
  rule_version      text not null,
  catalogue_version text not null,
  frozen_at         timestamptz,
  primary key (client_id, month, audience, object_kind, object_id),
  -- NO ACTION, not cascade (month_subject_readings' rule): a frozen month is
  -- the record, and the catalogue is retired, never deleted.
  constraint month_product_readings_group foreign key (group_id, client_id)
    references public.product_groups (id, client_id) on delete no action,
  constraint month_product_readings_product foreign key (product_id, client_id)
    references public.products (id, client_id) on delete no action,
  -- Guards the plan does not pin, so a writer's slip is refused rather than
  -- frozen: a month is its first day; the object is the row's category or
  -- product; counts are counts inside n; a product row is its named videos;
  -- a category's split adds up; frozen exactly when it carries frozen_at; both
  -- versions named.
  constraint month_product_readings_month_check check (month = date_trunc('month', month)::date),
  constraint month_product_readings_object_check check (
    (object_kind = 'group' and product_id is null and object_id = group_id)
    or (object_kind = 'product' and product_id is not null and object_id = product_id)),
  constraint month_product_readings_counts_check check (
    k_named >= 0 and k_unclear >= 0 and k_unbranded >= 0 and k_any >= 0 and comments >= 0 and n >= 0 and k_any <= n),
  -- The organic base is the same videos less the rival searches' finds: inside
  -- k_any and n, and its k inside its n.
  constraint month_product_readings_organic_check check (
    k_organic >= 0 and n_organic >= 0 and k_organic <= k_any and n_organic <= n and k_organic <= n_organic),
  constraint month_product_readings_split_check check (
    (object_kind = 'product' and k_unclear = 0 and k_unbranded = 0 and k_any = k_named)
    or (object_kind = 'group' and k_named + k_unclear + k_unbranded = k_any)),
  constraint month_product_readings_frozen_at_check check ((status = 'frozen') = (frozen_at is not null)),
  constraint month_product_readings_rule_version_check check (rule_version <> ''),
  constraint month_product_readings_catalogue_version_check check (catalogue_version ~ '^pc[0-9]+_[0-9a-f]{16}$')
);
create index if not exists month_product_readings_object_idx
  on public.month_product_readings (client_id, object_kind, object_id, month);
create index if not exists month_product_readings_group_idx
  on public.month_product_readings (client_id, group_id, month);

comment on table public.month_product_readings is
  'A product''s or a category''s month as talk, per audience: the videos naming it, about one of its products without saying which, about the category in general, and any of them, of the month''s videos, and the same without any video our rival searches found (organic), with the catalogue version. A month table: filling until the month freezes, then the record; a closed audience-month takes its product rows once.';

drop trigger if exists month_product_readings_frozen_guard on public.month_product_readings;
create trigger month_product_readings_frozen_guard
  before update on public.month_product_readings
  for each row when (old.status = 'frozen')
  execute function public.month_reading_frozen_guard();

drop trigger if exists month_product_readings_frozen_insert_guard on public.month_product_readings;
create trigger month_product_readings_frozen_insert_guard
  before insert on public.month_product_readings
  for each row
  execute function public.month_reading_frozen_insert_guard();

drop trigger if exists month_product_readings_delete_guard on public.month_product_readings;
create trigger month_product_readings_delete_guard
  before delete on public.month_product_readings
  for each row when (old.status = 'frozen')
  execute function public.month_reading_delete_guard();

-- =============================================================================
-- 4. post_ideas (T13)
-- =============================================================================

-- The run's post ideas: up to three question conversations of the four weeks
-- ending at the run's window end (read_start to read_end; Heinrich, 13 Oct:
-- the ideas refresh every week and read four weeks of questions) that the
-- client's own posts do not answer, biggest first. The model writes the
-- title and the cover and groups the conversation's question comments into
-- sub-questions BY COMMENT ID; code counts them (a sub-question's comments and
-- videos are its ids, never a number the model typed) and picks the format and
-- the opening from the market's own videos on that question, with their
-- response multiples. No comment's words are stored: the ids resolve at
-- render, as a stored read's quotes do. Written by the run's write-post-ideas
-- step (after write-week-read); one set per run, upserted on (run_id, rank).
create table if not exists public.post_ideas (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id) on delete cascade,
  run_id           uuid not null references public.pipeline_runs(id) on delete cascade,
  -- The run's frozen window, half-open [window_start, window_end): the week
  -- the ideas were written for.
  window_start     timestamptz not null,
  window_end       timestamptz not null,
  -- The window the ideas READ their question comments from, half-open
  -- [read_start, read_end): the four weeks ending at window_end
  -- (lib/post-ideas/select.ts ideasReadWindow). Never past the run's end.
  read_start       timestamptz not null,
  read_end         timestamptz not null,
  rank             smallint not null check (rank between 1 and 3),
  -- The question conversation (theme_registry.id, the stable identity).
  registry_id      uuid not null references public.theme_registry(id) on delete cascade,
  title            text not null,
  -- What the post should cover, as the model wrote it after the scrub:
  -- { text, … } (lib/post-ideas/types.ts PostIdeaCover).
  cover            jsonb not null,
  -- [{ label, commentIds, videoIds }] (PostIdeaSubquestion), biggest first.
  subquestions     jsonb not null,
  -- classified_type and hook_style values, each with its response multiple
  -- against a typical market video; null where the market's videos on the
  -- question are too few to choose one.
  format           text,
  format_multiple  numeric,
  opening          text,
  opening_multiple numeric,
  model            text not null,
  prompt_version   text not null,
  created_at       timestamptz not null default now(),
  constraint post_ideas_run_rank unique (run_id, rank),
  constraint post_ideas_run_registry unique (run_id, registry_id),
  constraint post_ideas_window_check check (window_start < window_end),
  constraint post_ideas_read_check check (read_start < read_end and read_end <= window_end),
  constraint post_ideas_title_check check (char_length(btrim(title)) between 1 and 200),
  constraint post_ideas_cover_check check (jsonb_typeof(cover) = 'object'),
  constraint post_ideas_subquestions_check check (jsonb_typeof(subquestions) = 'array'),
  constraint post_ideas_format_check check (
    (format is null and format_multiple is null)
    or (format <> '' and format_multiple is not null and format_multiple > 0)),
  constraint post_ideas_opening_check check (
    (opening is null and opening_multiple is null)
    or (opening <> '' and opening_multiple is not null and opening_multiple > 0)),
  constraint post_ideas_model_check check (model <> '' and prompt_version <> '')
);
create index if not exists post_ideas_client_latest_idx
  on public.post_ideas (client_id, window_end desc, rank);
create index if not exists post_ideas_registry_idx on public.post_ideas (registry_id);

comment on table public.post_ideas is
  'The run''s post ideas (up to three), read over the four weeks to the run''s window end (read_start, read_end): a question conversation the client''s posts do not answer, the model''s title, cover and sub-questions (comment ids; code counts them), and the format and opening code chose from the market''s videos, with their multiples.';

-- =============================================================================
-- 5. RLS, policies and grants (MF1's conventions)
-- =============================================================================

alter table public.product_groups         enable row level security;
alter table public.products               enable row level security;
alter table public.product_aliases        enable row level security;
alter table public.product_tags           enable row level security;
alter table public.product_mentions       enable row level security;
alter table public.month_product_readings enable row level security;
alter table public.post_ideas             enable row level security;

drop policy if exists "Members read their product groups" on public.product_groups;
create policy "Members read their product groups" on public.product_groups
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their products" on public.products;
create policy "Members read their products" on public.products
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their product aliases" on public.product_aliases;
create policy "Members read their product aliases" on public.product_aliases
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their product tags" on public.product_tags;
create policy "Members read their product tags" on public.product_tags
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their product mentions" on public.product_mentions;
create policy "Members read their product mentions" on public.product_mentions
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their month product readings" on public.month_product_readings;
create policy "Members read their month product readings" on public.month_product_readings
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their post ideas" on public.post_ideas;
create policy "Members read their post ideas" on public.post_ideas
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.product_groups, public.products, public.product_aliases, public.product_tags,
  public.product_mentions, public.month_product_readings, public.post_ideas from anon, authenticated;

-- Column-level SELECT, every column: the catalogue is the client's own, a
-- placement and a month are readings the product prints or joins on, and who
-- tagged or edited what is theirs, as config_changes' actor_label is.
grant select (id, client_id, name, status, sort, seeded_from, retired_at, created_at, updated_at,
              actor_kind, actor_user_id, actor_label)
  on public.product_groups to authenticated;
grant select (id, client_id, group_id, name, status, sort, seeded_from, retired_at, created_at, updated_at,
              actor_kind, actor_user_id, actor_label)
  on public.products to authenticated;
grant select (id, client_id, product_id, group_id, alias, kind, needs_confirm, seeded_from, created_at,
              actor_kind, actor_user_id, actor_label, retired_at, retired_by, retired_label)
  on public.product_aliases to authenticated;
grant select (id, client_id, video_id, comment_id, placement, product_id, group_id, supersedes,
              actor_kind, actor_user_id, actor_label, created_at)
  on public.product_tags to authenticated;
grant select (id, client_id, video_id, source, field, comment_id, comment_month, placement, product_id, group_id,
              method, rule_version, catalogue_version, model, prompt_version, tag_id, found_at)
  on public.product_mentions to authenticated;
grant select (client_id, month, audience, object_kind, object_id, group_id, product_id, k_named, k_unclear,
              k_unbranded, k_any, k_organic, comments, n, n_organic, status, origin, read_at, run_id, rule_version,
              catalogue_version, frozen_at)
  on public.month_product_readings to authenticated;
grant select (id, client_id, run_id, window_start, window_end, read_start, read_end, rank, registry_id, title, cover, subquestions,
              format, format_multiple, opening, opening_multiple, model, prompt_version, created_at)
  on public.post_ideas to authenticated;

-- Append-only, and the catalogue: SELECT and INSERT, nothing that rewrites or
-- removes a row.
grant select, insert on public.product_groups, public.products, public.product_aliases, public.product_tags,
  public.product_mentions to service_role;
revoke update, delete, truncate on public.product_groups, public.products, public.product_aliases,
  public.product_tags, public.product_mentions from service_role;
-- The edits the catalogue takes, by column. After the revoke above, which also
-- takes any column grant away, so a second application ends where the first
-- did. Never id, client_id or created_at; on an alias, its retirement alone.
grant update (name, status, sort, seeded_from, retired_at, updated_at, actor_kind, actor_user_id, actor_label)
  on public.product_groups to service_role;
grant update (group_id, name, status, sort, seeded_from, retired_at, updated_at, actor_kind, actor_user_id, actor_label)
  on public.products to service_role;
grant update (retired_at, retired_by, retired_label) on public.product_aliases to service_role;

-- The month table keeps the month tables' four (20260918095000's reasons): the
-- upsert needs UPDATE even when nothing conflicts, the stale sweep needs DELETE
-- on filling rows, and the guards refuse a frozen row whatever the role.
grant select, insert, update, delete on public.month_product_readings to service_role;
revoke truncate on public.month_product_readings from service_role;

-- The run's ideas: written once a run, upserted on (run_id, rank) by a retried
-- step; a row goes only with its run, its conversation or its client.
grant select, insert, update on public.post_ideas to service_role;
revoke delete, truncate on public.post_ideas from service_role;

-- The read function takes p_client, so it is the service role's alone (a
-- function a tenant could call is one a tenant could call with another id).
revoke all on function public.product_catalogue(uuid) from public, anon, authenticated;
grant execute on function public.product_catalogue(uuid) to service_role;
revoke all on function public.product_month_videos(uuid, date) from public, anon, authenticated;
grant execute on function public.product_month_videos(uuid, date) to service_role;

-- The trigger function fires whatever the writer's role; nobody calls it.
revoke all on function public.product_aliases_retire_once() from public, anon, authenticated;

-- =============================================================================
-- 6. The regate keeps placements and tags (20261106092000, plus two tables)
-- =============================================================================

create or replace function public.regate_videos(
  p_client      uuid,
  p_video_ids   uuid[],
  p_actor_label text,
  p_run_id      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch   uuid := gen_random_uuid();
  v_change  uuid;
  v_videos  int;
  v_before  int;
  v_counts  jsonb := '{}'::jsonb;
  v_n       int;
begin
  if p_video_ids is null or cardinality(p_video_ids) = 0 then
    raise exception 'regate_videos: no videos given';
  end if;
  select count(*) into v_videos from public.videos where id = any(p_video_ids) and client_id = p_client;
  if v_videos <> cardinality(p_video_ids) then
    raise exception 'regate_videos: % of % videos are not this client''s', cardinality(p_video_ids) - v_videos, cardinality(p_video_ids);
  end if;
  if exists (select 1 from public.videos where id = any(p_video_ids) and is_client) then
    raise exception 'regate_videos: the client''s own posts are never removed';
  end if;
  select count(*) into v_before from public.videos where client_id = p_client;

  -- The rows, by what they hang off (dropped first: a second call in one
  -- transaction must not find the first call's).
  drop table if exists rg_videos, rg_comments, rg_insights;
  create temp table rg_videos on commit drop as
    select id, platform, video_id from public.videos where id = any(p_video_ids);
  create temp table rg_comments on commit drop as
    select c.id from public.comments c join rg_videos v on v.platform = c.platform and v.video_id = c.video_id
    where c.client_id = p_client;
  create temp table rg_insights on commit drop as
    select ai.id from public.audience_insights ai where ai.source_video_id in (select id from rg_videos);

  -- 1. Backed up whole, every table the removal reaches.
  insert into public.regate_backup (batch_id, client_id, source_table, row_data)
  select v_batch, p_client, 'videos', to_jsonb(t) from public.videos t where t.id in (select id from rg_videos)
  union all select v_batch, p_client, 'comments', to_jsonb(t) from public.comments t where t.id in (select id from rg_comments)
  union all select v_batch, p_client, 'audience_insights', to_jsonb(t) from public.audience_insights t where t.id in (select id from rg_insights)
  union all select v_batch, p_client, 'insight_evidence', to_jsonb(t) from public.insight_evidence t
    where t.audience_insight_id in (select id from rg_insights) or t.comment_id in (select id from rg_comments) or t.source_video_id in (select id from rg_videos)
  union all select v_batch, p_client, 'subject_memberships', to_jsonb(t) from public.subject_memberships t where t.audience_insight_id in (select id from rg_insights)
  union all select v_batch, p_client, 'language_samples', to_jsonb(t) from public.language_samples t
    where t.source_video_id in (select id from rg_videos) or t.comment_id in (select id from rg_comments)
  union all select v_batch, p_client, 'comment_translations', to_jsonb(t) from public.comment_translations t where t.comment_id in (select id from rg_comments)
  union all select v_batch, p_client, 'brand_mentions', to_jsonb(t) from public.brand_mentions t
    where t.video_id in (select id from rg_videos) or t.comment_id in (select id from rg_comments)
  union all select v_batch, p_client, 'product_tags', to_jsonb(t) from public.product_tags t
    where t.video_id in (select id from rg_videos) or t.comment_id in (select id from rg_comments)
  union all select v_batch, p_client, 'product_mentions', to_jsonb(t) from public.product_mentions t
    where t.video_id in (select id from rg_videos) or t.comment_id in (select id from rg_comments)
  union all select v_batch, p_client, 'video_claims', to_jsonb(t) from public.video_claims t where t.source_video_id in (select id from rg_videos)
  union all select v_batch, p_client, 'video_segments', to_jsonb(t) from public.video_segments t where t.video_id in (select id from rg_videos)
  union all select v_batch, p_client, 'video_provenance', to_jsonb(t) from public.video_provenance t where t.video_id in (select id from rg_videos)
  union all select v_batch, p_client, 'video_surfacings', to_jsonb(t) from public.video_surfacings t where t.video_id in (select id from rg_videos)
  union all select v_batch, p_client, 'own_post_subjects', to_jsonb(t) from public.own_post_subjects t where t.video_id in (select id from rg_videos)
  union all select v_batch, p_client, 'account_events', to_jsonb(t) from public.account_events t where t.video_id in (select id from rg_videos);

  select coalesce(jsonb_object_agg(source_table, n), '{}'::jsonb) into v_counts
  from (select source_table, count(*) as n from public.regate_backup where batch_id = v_batch group by source_table) s;

  -- 2. Removed, leaves first (the rest cascade from videos, already backed up).
  delete from public.insight_evidence
   where audience_insight_id in (select id from rg_insights) or comment_id in (select id from rg_comments) or source_video_id in (select id from rg_videos);
  delete from public.subject_memberships where audience_insight_id in (select id from rg_insights);
  delete from public.language_samples where source_video_id in (select id from rg_videos) or comment_id in (select id from rg_comments);
  delete from public.comment_translations where comment_id in (select id from rg_comments);
  delete from public.brand_mentions where video_id in (select id from rg_videos) or comment_id in (select id from rg_comments);
  delete from public.product_mentions where video_id in (select id from rg_videos) or comment_id in (select id from rg_comments);
  delete from public.product_tags where video_id in (select id from rg_videos) or comment_id in (select id from rg_comments);
  delete from public.audience_insights where id in (select id from rg_insights);
  delete from public.comments where id in (select id from rg_comments);
  delete from public.videos where id in (select id from rg_videos);
  get diagnostics v_n = row_count;

  -- 3. The record: the 24 Sep fix's shape (see the header).
  insert into public.config_changes (client_id, surface, field, before, after, actor_kind, actor_label, run_id, source, rows_affected, note)
  values (p_client, 'gate_rule', 'relevance_gate',
          jsonb_build_object('videos', v_before),
          jsonb_build_object('videos', v_before - v_n, 'backup_batch', v_batch),
          'script', p_actor_label, p_run_id, 'logged', v_n, null)
  returning id into v_change;

  return jsonb_build_object('batch_id', v_batch, 'change_id', v_change, 'videos_removed', v_n, 'backed_up', v_counts);
end;
$$;

comment on function public.regate_videos(uuid, uuid[], text, uuid) is
  'Removes these videos of one client and everything that hangs off them (product placements and tags included), each row backed up whole in regate_backup first, and logs one gate_rule change. One transaction. Never the client''s own posts. Undo: regate_restore(batch_id).';

create or replace function public.regate_restore(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_n      int;
  v_table  text;
begin
  if not exists (select 1 from public.regate_backup where batch_id = p_batch) then
    raise exception 'regate_restore: no batch %', p_batch;
  end if;
  if exists (select 1 from public.regate_backup where batch_id = p_batch and restored_at is not null) then
    raise exception 'regate_restore: batch % is restored already', p_batch;
  end if;
  -- Parents first.
  foreach v_table in array array['videos', 'comments', 'audience_insights', 'insight_evidence', 'subject_memberships',
                                 'language_samples', 'comment_translations', 'brand_mentions', 'product_tags',
                                 'product_mentions', 'video_claims',
                                 'video_segments', 'video_provenance', 'video_surfacings', 'own_post_subjects', 'account_events']
  loop
    execute format(
      'insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, b.row_data)).* from public.regate_backup b where b.batch_id = $1 and b.source_table = %2$L',
      v_table, v_table)
      using p_batch;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_counts := v_counts || jsonb_build_object(v_table, v_n); end if;
  end loop;
  update public.regate_backup set restored_at = now() where batch_id = p_batch;
  return jsonb_build_object('batch_id', p_batch, 'restored', v_counts);
end;
$$;

comment on function public.regate_restore(uuid) is
  'Puts back every row regate_videos() removed in this batch, parents first (a product tag before the placement that names it), and marks the batch restored. The gate_rule change row stays as the record.';

revoke all on function public.regate_videos(uuid, uuid[], text, uuid) from public, anon, authenticated;
revoke all on function public.regate_restore(uuid) from public, anon, authenticated;
grant execute on function public.regate_videos(uuid, uuid[], text, uuid) to service_role;
grant execute on function public.regate_restore(uuid) to service_role;

-- =============================================================================
-- 7. One more surface on the change log
-- =============================================================================
-- 'products': a catalogue edit (a category, a product, an alias; T10b, the
-- seed script). The list is MF1's (20260928090000) plus this one, which
-- production's constraint matched on 13 Oct; lib/config-log.test.ts pins
-- CONFIG_SURFACES plus lib/config-surfaces-mf1.ts's three to the newest
-- migration that writes it.
alter table public.config_changes drop constraint if exists config_changes_surface_check;
alter table public.config_changes add constraint config_changes_surface_check
  check (surface in (
    'terms','rivals','handles','platforms','subreddits','cadence','knobs',
    'schedule','subjects','entity_retag','regate','prompt_version','rival_rename','other',
    'segment','gate_rule','attribution',
    'products'));
