-- Checks for 20261109090000_products.sql, run on a throwaway cluster after the
-- migration (scripts/pg-shim/throwaway.sh up <dir> --before 20261109090000;
-- then throwaway.sh twice <dir> supabase/migrations/20261109090000_products.sql
-- for the empty catalogue diff; then throwaway.sh check <dir> this-file).
-- Every check raises on a wrong answer, so the run stops at the first one; the
-- whole file is one transaction and rolls back. FIRST RUN 13 Oct (depth v2
-- T11 step 1) on a throwaway PG 17 cluster brought up `--before
-- 20261109090000`: the migration applied twice with an empty catalogue diff
-- (after one fix: a named constraint took the auto-name of an inline CHECK),
-- and every check here passed.
--
-- The world: tenant A with two categories (Liners, Feet), a product in each,
-- aliases, a video with a comment, placements and a tag chain, a closed month
-- and a filling one; tenant B with a category of its own; a member of each.
--
--   1. RLS: a member reads their own tenant's rows only; anon reads nothing;
--      a member writes nothing.
--   2. The service role: placements and tags are append-only; the catalogue is
--      never deleted, and edits only the columns it is granted; an alias is
--      retired once and never rewritten.
--   3. The shapes refuse a writer's slip (targets, methods, versions, splits)
--      and a cross-tenant reference.
--   4. The catalogue version: stable, moved by an edit that can move a
--      placement, back where it was when the edit is undone, null with no
--      catalogue.
--   5. The month table's guards: a frozen row is never rewritten or deleted;
--      a closed audience-month takes its first rows (the one-shot back-read).
--      The refusal of a SECOND back-read needs an earlier transaction and
--      cannot be shown inside this one: the guard function is the one
--      20260918092000's checks exercise, attached unchanged.
--   6. A regate takes the placements and tags with their video, backed up, and
--      the restore puts them back as they were.
--   7. config_changes takes 'products'; post_ideas reads to its tenant.
--   8. Removing a tenant removes everything here (the delete guard's one
--      exception, and the NO ACTION keys checked at the statement's end).
--   9. product_month_videos (T5): the month's videos over every audience, the
--      client's included and its own posts marked owned, dated by the comment,
--      the claims lane never; the service role's alone. (Run before 8, while
--      tenant A still exists.)

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'member@a.test'),
  ('b0000000-0000-0000-0000-00000000000b', 'member@b.test');
insert into public.clients (id, company_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B');
insert into public.users (id, client_id, full_name, email, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A member', 'member@a.test', 'owner'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B member', 'member@b.test', 'owner');
insert into public.pipeline_runs (id, client_id, status)
  values ('00000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'completed');
insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor, competitor_name, analyzed_lane, analyzed_run_id, caption, hashtags, topics, source_keywords) values
  ('0c000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'youtube', 'yt1', 'u', 'a', false, false, null, 'full', '00000000-0000-4000-8000-0000000000a1', 'My Seal-In X5 after six months', '{}', '{}', '{}'),
  ('0c000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'youtube', 'yt2', 'u', 'a', false, false, null, 'full', '00000000-0000-4000-8000-0000000000a1', 'A day with a new liner', '{}', '{}', '{}');
insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, text) values
  ('0d000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'yt1', 'c1', timestamptz '2026-09-23 10:00Z', 'mine feels loose by lunchtime'),
  ('0d000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'yt2', 'c2', timestamptz '2026-09-24 10:00Z', 'which liner is that');
insert into public.theme_registry (id, client_id, bucket, canonical_label) values
  ('0f000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'industry-other', 'How long a liner lasts');

-- The catalogue, written as the service role writes it.
set local role service_role;
insert into public.product_groups (id, client_id, name, sort, seeded_from, actor_kind, actor_label) values
  ('0a000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Liners', 0, 'ossur.com', 'script', 'scripts/products.ts --apply'),
  ('0a000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Feet', 1, 'ossur.com', 'script', 'scripts/products.ts --apply'),
  ('0a000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Backpacks', 0, null, 'user', 'member@b.test');
insert into public.products (id, client_id, group_id, name, actor_kind, actor_label) values
  ('0b000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0a000000-0000-4000-8000-000000000001', 'Seal-In X5', 'script', 'scripts/products.ts --apply'),
  ('0b000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0a000000-0000-4000-8000-000000000002', 'Pro-Flex XC', 'script', 'scripts/products.ts --apply');
insert into public.product_aliases (id, client_id, product_id, group_id, alias, kind, needs_confirm, actor_kind, actor_label) values
  ('0e100000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0b000000-0000-4000-8000-000000000001', null, 'Seal-In X5', 'name', false, 'script', 'scripts/products.ts --apply'),
  ('0e100000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, '0a000000-0000-4000-8000-000000000001', 'liner', 'category_word', false, 'script', 'scripts/products.ts --apply'),
  ('0e100000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0b000000-0000-4000-8000-000000000002', null, 'Pro-Flex', 'nickname', true, 'script', 'scripts/products.ts --apply');

-- 4 (first half). The version, before anything below moves the catalogue.
create temp table v as select (public.product_catalogue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'version') as v0;
do $$ declare c jsonb; v0 text; begin
  select v.v0 into v0 from v;
  if v0 !~ '^pc1_[0-9a-f]{16}$' then raise exception 'CHECK FAILED: version %', v0; end if;
  if public.product_catalogue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'version' <> v0 then raise exception 'CHECK FAILED: the same catalogue read two versions'; end if;
  c := public.product_catalogue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  if jsonb_array_length(c -> 'groups') <> 2 or jsonb_array_length(c -> 'products') <> 2 or jsonb_array_length(c -> 'aliases') <> 3 then
    raise exception 'CHECK FAILED: catalogue %', c;
  end if;
  if c -> 'groups' -> 0 ->> 'name' <> 'Liners' then raise exception 'CHECK FAILED: groups not in display order: %', c -> 'groups'; end if;
  -- B's own catalogue, and a tenant with none.
  if public.product_catalogue('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') ->> 'version' = v0 then raise exception 'CHECK FAILED: B read A''s version'; end if;
  if public.product_catalogue('00000000-0000-0000-0000-000000000000') is not null then raise exception 'CHECK FAILED: no catalogue is not null'; end if;
end $$;

-- Placements and a tag chain on A's first video.
insert into public.product_tags (id, client_id, video_id, comment_id, placement, product_id, group_id, supersedes, actor_kind, actor_user_id, actor_label) values
  ('0e000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0c000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001', 'unbranded', null, '0a000000-0000-4000-8000-000000000001', null, 'user', 'a0000000-0000-0000-0000-00000000000a', 'member@a.test');
insert into public.product_tags (id, client_id, video_id, comment_id, placement, product_id, group_id, supersedes, actor_kind, actor_user_id, actor_label) values
  ('0e000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0c000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001', 'named', '0b000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '0e000000-0000-4000-8000-000000000001', 'user', 'a0000000-0000-0000-0000-00000000000a', 'member@a.test');
insert into public.product_mentions (client_id, video_id, source, field, comment_id, comment_month, placement, product_id, group_id, method, rule_version, catalogue_version, model, prompt_version, tag_id)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0c000000-0000-4000-8000-000000000001', x.source, x.field, x.comment_id, x.comment_month, x.placement, x.product_id, x.group_id, x.method, x.rule_version, v.v0, x.model, x.prompt_version, x.tag_id
from v cross join (values
  ('content', 'caption', null::uuid, null::date, 'named', '0b000000-0000-4000-8000-000000000001'::uuid, '0a000000-0000-4000-8000-000000000001'::uuid, 'rule', 'products_v1', null, null, null::uuid),
  ('comment', null, '0d000000-0000-4000-8000-000000000001'::uuid, date '2026-09-01', 'unclear', null, '0a000000-0000-4000-8000-000000000001'::uuid, 'model', 'product_classify_v1', 'gpt-4.1-mini', 'product_classify_v1', null),
  ('comment', null, '0d000000-0000-4000-8000-000000000001'::uuid, date '2026-09-01', 'named', '0b000000-0000-4000-8000-000000000001'::uuid, '0a000000-0000-4000-8000-000000000001'::uuid, 'tag', 'tag_v1', null, null, '0e000000-0000-4000-8000-000000000002'::uuid)
) x(source, field, comment_id, comment_month, placement, product_id, group_id, method, rule_version, model, prompt_version, tag_id);

-- 2. The service role: append-only placements and tags; a catalogue never deleted.
do $$ begin
  begin update public.product_mentions set placement = 'none';
    raise exception 'CHECK FAILED: the service role rewrote a placement';
  exception when insufficient_privilege then null; end;
  begin delete from public.product_mentions;
    raise exception 'CHECK FAILED: the service role deleted a placement';
  exception when insufficient_privilege then null; end;
  begin update public.product_tags set placement = 'none';
    raise exception 'CHECK FAILED: the service role rewrote a tag';
  exception when insufficient_privilege then null; end;
  begin delete from public.products where id = '0b000000-0000-4000-8000-000000000002';
    raise exception 'CHECK FAILED: the service role deleted a product';
  exception when insufficient_privilege then null; end;
  begin delete from public.product_groups where id = '0a000000-0000-4000-8000-000000000002';
    raise exception 'CHECK FAILED: the service role deleted a category';
  exception when insufficient_privilege then null; end;
  begin update public.products set client_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where id = '0b000000-0000-4000-8000-000000000002';
    raise exception 'CHECK FAILED: the service role moved a product to another tenant';
  exception when insufficient_privilege then null; end;
  begin update public.product_aliases set alias = 'sealin' where id = '0e100000-0000-4000-8000-000000000001';
    raise exception 'CHECK FAILED: the service role rewrote an alias';
  exception when insufficient_privilege then null; end;
  begin truncate public.product_mentions;
    raise exception 'CHECK FAILED: the service role truncated placements';
  exception when insufficient_privilege then null; end;
  begin truncate public.month_product_readings;
    raise exception 'CHECK FAILED: the service role truncated the month table';
  exception when insufficient_privilege then null; end;
end $$;

-- A tag chain: one first tag, each replaced once.
do $$ begin
  begin
    insert into public.product_tags (client_id, video_id, comment_id, placement, product_id, group_id, supersedes, actor_kind, actor_label)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0c000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001', 'none', null, null, '0e000000-0000-4000-8000-000000000001', 'user', 'member@a.test');
    raise exception 'CHECK FAILED: a tag was superseded twice';
  exception when unique_violation then null; end;
  begin
    insert into public.product_tags (client_id, video_id, comment_id, placement, product_id, group_id, supersedes, actor_kind, actor_label)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0c000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001', 'none', null, null, null, 'user', 'member@a.test');
    raise exception 'CHECK FAILED: a target took a second first tag';
  exception when unique_violation then null; end;
  begin
    insert into public.product_tags (client_id, video_id, comment_id, placement, product_id, group_id, supersedes, actor_kind, actor_label)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0c000000-0000-4000-8000-000000000002', '0d000000-0000-4000-8000-000000000002', 'none', null, null, '0e000000-0000-4000-8000-000000000002', 'user', 'member@a.test');
    raise exception 'CHECK FAILED: a tag superseded one on another video';
  exception when foreign_key_violation then null; end;
end $$;

-- An alias: retired once, never rewritten, never brought back.
update public.product_aliases set retired_at = now(), retired_by = null, retired_label = 'member@a.test · rename'
  where id = '0e100000-0000-4000-8000-000000000003';
reset role;
do $$ begin
  -- As the owner (a role that holds more than the column grant), the trigger still holds.
  begin update public.product_aliases set retired_at = null, retired_label = null where id = '0e100000-0000-4000-8000-000000000003';
    raise exception 'CHECK FAILED: a retired alias came back';
  exception when restrict_violation then null; end;
  begin update public.product_aliases set alias = 'liners' where id = '0e100000-0000-4000-8000-000000000002';
    raise exception 'CHECK FAILED: an alias was rewritten';
  exception when restrict_violation then null; end;
end $$;

-- 4 (second half). The version moves with the catalogue and comes back with it.
do $$ declare v0 text; v1 text; v2 text; begin
  select v.v0 into v0 from v;
  v1 := public.product_catalogue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'version';
  if v1 = v0 then raise exception 'CHECK FAILED: retiring an alias kept the version'; end if;
  -- The same words again, a new row: the same catalogue, the same version (ids of aliases are not hashed).
  insert into public.product_aliases (client_id, product_id, alias, kind, needs_confirm, actor_kind, actor_label)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0b000000-0000-4000-8000-000000000002', 'Pro-Flex', 'nickname', true, 'user', 'member@a.test');
  if public.product_catalogue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'version' <> v0 then raise exception 'CHECK FAILED: the same catalogue read a new version'; end if;
  -- Display order is not part of it; a confirm flag and a rename are.
  update public.products set sort = 9 where id = '0b000000-0000-4000-8000-000000000002';
  if public.product_catalogue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'version' <> v0 then raise exception 'CHECK FAILED: a sort order moved the version'; end if;
  update public.products set name = 'Pro-Flex XC Torsion' where id = '0b000000-0000-4000-8000-000000000002';
  v2 := public.product_catalogue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'version';
  if v2 = v0 then raise exception 'CHECK FAILED: a rename kept the version'; end if;
  update public.products set name = 'Pro-Flex XC' where id = '0b000000-0000-4000-8000-000000000002';
  -- A retired category takes its products and their aliases out of the catalogue.
  update public.product_groups set status = 'retired', retired_at = now() where id = '0a000000-0000-4000-8000-000000000002';
  if jsonb_array_length(public.product_catalogue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') -> 'products') <> 1
     or jsonb_array_length(public.product_catalogue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') -> 'aliases') <> 2 then
    raise exception 'CHECK FAILED: a retired category''s products stayed in the catalogue';
  end if;
  update public.product_groups set status = 'active', retired_at = null where id = '0a000000-0000-4000-8000-000000000002';
  if public.product_catalogue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'version' <> v0 then raise exception 'CHECK FAILED: undoing the edits did not restore the version'; end if;
end $$;

-- 3. The shapes refuse a writer's slip and a cross-tenant reference.
do $$ declare v0 text; begin
  select v.v0 into v0 from v;
  begin insert into public.product_mentions (client_id, video_id, source, field, placement, product_id, group_id, method, rule_version, catalogue_version)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0c000000-0000-4000-8000-000000000002', 'content', 'caption', 'named', null, '0a000000-0000-4000-8000-000000000001', 'rule', 'products_v1', v0);
    raise exception 'CHECK FAILED: a named placement with no product';
  exception when check_violation then null; end;
  begin insert into public.product_mentions (client_id, video_id, source, field, placement, product_id, group_id, method, rule_version, catalogue_version)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0c000000-0000-4000-8000-000000000002', 'content', 'caption', 'unbranded', null, '0a000000-0000-4000-8000-000000000001', 'model', 'product_classify_v1', v0);
    raise exception 'CHECK FAILED: a model placement that names no model';
  exception when check_violation then null; end;
  begin insert into public.product_mentions (client_id, video_id, source, field, placement, product_id, group_id, method, rule_version, catalogue_version)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0c000000-0000-4000-8000-000000000002', 'content', 'caption', 'unbranded', null, '0a000000-0000-4000-8000-000000000001', 'rule', 'products_v1', 'products_v1');
    raise exception 'CHECK FAILED: a placement under no catalogue version';
  exception when check_violation then null; end;
  begin insert into public.product_mentions (client_id, video_id, source, field, placement, product_id, group_id, method, rule_version, catalogue_version)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0c000000-0000-4000-8000-000000000002', 'comment', null, 'none', null, null, 'rule', 'products_v1', v0);
    raise exception 'CHECK FAILED: a comment placement with no comment';
  exception when check_violation then null; end;
  begin insert into public.product_mentions (client_id, video_id, source, field, placement, product_id, group_id, method, rule_version, catalogue_version)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '0c000000-0000-4000-8000-000000000002', 'content', 'caption', 'unbranded', null, '0a000000-0000-4000-8000-000000000001', 'rule', 'products_v1', v0);
    raise exception 'CHECK FAILED: B placed talk under A''s category';
  exception when foreign_key_violation then null; end;
  begin insert into public.products (client_id, group_id, name, actor_kind, actor_label)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '0a000000-0000-4000-8000-000000000001', 'Not theirs', 'user', 'member@b.test');
    raise exception 'CHECK FAILED: B filed a product under A''s category';
  exception when foreign_key_violation then null; end;
  begin insert into public.product_aliases (client_id, product_id, group_id, alias, kind, actor_kind, actor_label)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0b000000-0000-4000-8000-000000000001', null, 'socket', 'category_word', 'user', 'member@a.test');
    raise exception 'CHECK FAILED: a product took a category word';
  exception when check_violation then null; end;
  begin insert into public.product_aliases (client_id, product_id, group_id, alias, kind, actor_kind, actor_label)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, '0a000000-0000-4000-8000-000000000002', 'LINER', 'category_word', 'user', 'member@a.test');
    raise exception 'CHECK FAILED: one word placed under two targets';
  exception when unique_violation then null; end;
end $$;

-- 5. The month table: a closed audience-month and a filling one.
insert into public.month_denominators (client_id, month, audience, videos, comments, platform_mix, status, origin, read_at, frozen_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-08-01', 'industry-other', 40, 400, '{}', 'frozen', 'live', now(), now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', 'industry-other', 52, 520, '{}', 'filling', 'live', now(), null);
do $$ declare v0 text; begin
  select v.v0 into v0 from v;
  -- The first back-read of a month that closed before the table had rows: let in, every row.
  insert into public.month_product_readings (client_id, month, audience, object_kind, object_id, group_id, product_id, k_named, k_unclear, k_unbranded, k_any, k_organic, comments, n, n_organic, status, origin, read_at, run_id, rule_version, catalogue_version, frozen_at) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-08-01', 'industry-other', 'group', '0a000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', null, 6, 5, 10, 21, 18, 30, 40, 35, 'frozen', 'back_read', now(), null, 'products_v1', v0, now()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-08-01', 'industry-other', 'product', '0b000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000001', 6, 0, 0, 6, 5, 8, 40, 35, 'frozen', 'back_read', now(), null, 'products_v1', v0, now()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', 'industry-other', 'group', '0a000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', null, 11, 11, 30, 52, 45, 70, 52, 46, 'filling', 'live', now(), '00000000-0000-4000-8000-0000000000a1', 'products_v1', v0, null);
  -- A frozen row is never rewritten, nor deleted.
  begin update public.month_product_readings set k_named = 7, k_any = 22 where month = '2026-08-01' and object_kind = 'group';
    raise exception 'CHECK FAILED: a frozen product month was rewritten';
  exception when restrict_violation then null; end;
  begin delete from public.month_product_readings where month = '2026-08-01' and object_kind = 'product';
    raise exception 'CHECK FAILED: a frozen product month was deleted';
  exception when restrict_violation then null; end;
  -- A filling one is refreshed and swept.
  update public.month_product_readings set k_unbranded = 31, k_any = 53, n = 53 where month = '2026-09-01' and object_kind = 'group';
  -- The split adds up; a product row is its named videos; the object is the row's.
  begin insert into public.month_product_readings (client_id, month, audience, object_kind, object_id, group_id, product_id, k_named, k_unclear, k_unbranded, k_any, k_organic, comments, n, n_organic, status, origin, read_at, rule_version, catalogue_version) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', 'industry-other', 'group', '0a000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000002', null, 1, 1, 1, 2, 0, 3, 52, 52, 'filling', 'live', now(), 'products_v1', v0);
    raise exception 'CHECK FAILED: a category split that does not add up';
  exception when check_violation then null; end;
  begin insert into public.month_product_readings (client_id, month, audience, object_kind, object_id, group_id, product_id, k_named, k_unclear, k_unbranded, k_any, k_organic, comments, n, n_organic, status, origin, read_at, rule_version, catalogue_version) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', 'industry-other', 'product', '0b000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000002', 1, 1, 0, 2, 0, 3, 52, 52, 'filling', 'live', now(), 'products_v1', v0);
    raise exception 'CHECK FAILED: a product row with videos it does not name';
  exception when check_violation then null; end;
  begin insert into public.month_product_readings (client_id, month, audience, object_kind, object_id, group_id, product_id, k_named, k_unclear, k_unbranded, k_any, k_organic, comments, n, n_organic, status, origin, read_at, rule_version, catalogue_version) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', 'industry-other', 'group', '0a000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000002', null, 0, 0, 0, 0, 0, 0, 52, 52, 'filling', 'live', now(), 'products_v1', v0);
    raise exception 'CHECK FAILED: a category row naming another category';
  exception when check_violation then null; end;
  begin insert into public.month_product_readings (client_id, month, audience, object_kind, object_id, group_id, product_id, k_named, k_unclear, k_unbranded, k_any, k_organic, comments, n, n_organic, status, origin, read_at, rule_version, catalogue_version) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', 'industry-other', 'group', '0a000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000002', null, 0, 0, 60, 60, 0, 0, 52, 52, 'filling', 'live', now(), 'products_v1', v0);
    raise exception 'CHECK FAILED: more videos than the month has';
  exception when check_violation then null; end;
  -- The organic base is inside the base: no more organic videos than videos,
  -- nor than the organic month has.
  begin insert into public.month_product_readings (client_id, month, audience, object_kind, object_id, group_id, product_id, k_named, k_unclear, k_unbranded, k_any, k_organic, comments, n, n_organic, status, origin, read_at, rule_version, catalogue_version) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', 'industry-other', 'group', '0a000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000002', null, 0, 0, 4, 4, 5, 0, 52, 52, 'filling', 'live', now(), 'products_v1', v0);
    raise exception 'CHECK FAILED: more organic videos than videos';
  exception when check_violation then null; end;
  begin insert into public.month_product_readings (client_id, month, audience, object_kind, object_id, group_id, product_id, k_named, k_unclear, k_unbranded, k_any, k_organic, comments, n, n_organic, status, origin, read_at, rule_version, catalogue_version) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', 'industry-other', 'group', '0a000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000002', null, 0, 0, 4, 4, 4, 0, 52, 3, 'filling', 'live', now(), 'products_v1', v0);
    raise exception 'CHECK FAILED: more organic videos than the organic month has';
  exception when check_violation then null; end;
  -- The catalogue a frozen month names cannot be taken away under it.
  begin delete from public.products where id = '0b000000-0000-4000-8000-000000000001';
    raise exception 'CHECK FAILED: a product a frozen month names was deleted';
  exception when foreign_key_violation then null; end;
end $$;

-- 1. RLS: A's member reads A's rows only.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
do $$ declare n int; begin
  select count(id) into n from public.product_groups; if n <> 2 then raise exception 'CHECK FAILED: A reads % categories, expected 2', n; end if;
  select count(id) into n from public.products; if n <> 2 then raise exception 'CHECK FAILED: A reads % products', n; end if;
  select count(id) into n from public.product_aliases; if n <> 4 then raise exception 'CHECK FAILED: A reads % aliases, expected 4', n; end if;
  select count(id) into n from public.product_tags; if n <> 2 then raise exception 'CHECK FAILED: A reads % tags', n; end if;
  select count(id) into n from public.product_mentions; if n <> 3 then raise exception 'CHECK FAILED: A reads % placements', n; end if;
  select count(object_id) into n from public.month_product_readings; if n <> 3 then raise exception 'CHECK FAILED: A reads % product months', n; end if;
  begin insert into public.product_groups (client_id, name, actor_kind, actor_label)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Knees', 'user', 'member@a.test');
    raise exception 'CHECK FAILED: a member wrote a category directly';
  exception when insufficient_privilege then null; end;
  begin perform public.product_catalogue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    raise exception 'CHECK FAILED: a member called product_catalogue';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
do $$ declare n int; begin
  select count(id) into n from public.product_groups; if n <> 1 then raise exception 'CHECK FAILED: B reads % categories, expected its 1', n; end if;
  select count(id) into n from public.product_mentions; if n <> 0 then raise exception 'CHECK FAILED: B reads A''s placements'; end if;
  select count(object_id) into n from public.month_product_readings; if n <> 0 then raise exception 'CHECK FAILED: B reads A''s months'; end if;
end $$;
reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
do $$ begin
  begin perform 1 from public.products limit 1;
    raise exception 'CHECK FAILED: anon reads products';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 7. config_changes takes the new surface and nothing it does not know.
insert into public.config_changes (client_id, surface, field, actor_kind, actor_label, source)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'products', 'alias', 'user', 'member@a.test', 'logged');
do $$ begin
  begin insert into public.config_changes (client_id, surface, actor_kind) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'catalogue', 'user');
    raise exception 'CHECK FAILED: the change log took an unknown surface';
  exception when check_violation then null; end;
end $$;

-- post_ideas: one set per run, ranks 1 to 3, read by its tenant.
insert into public.post_ideas (client_id, run_id, window_start, window_end, rank, registry_id, title, cover, subquestions, format, format_multiple, opening, opening_multiple, model, prompt_version)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', '2026-10-05', '2026-10-12', 1,
        '0f000000-0000-4000-8000-000000000001', 'How long does a liner last?', '{"text": "How long liners last"}',
        '[{"label": "How long it should last", "commentIds": ["0d000000-0000-4000-8000-000000000001"], "videoIds": ["0c000000-0000-4000-8000-000000000001"]}]',
        'tutorial', 2.1, 'question', 1.8, 'gpt-4.1-mini', 'post_ideas_v1');
do $$ begin
  begin insert into public.post_ideas (client_id, run_id, window_start, window_end, rank, registry_id, title, cover, subquestions, model, prompt_version)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', '2026-10-05', '2026-10-12', 4,
            '0f000000-0000-4000-8000-000000000001', 'x', '{"text": "x"}', '[]', 'm', 'p');
    raise exception 'CHECK FAILED: a fourth idea';
  exception when check_violation then null; end;
  begin insert into public.post_ideas (client_id, run_id, window_start, window_end, rank, registry_id, title, cover, subquestions, model, prompt_version)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', '2026-10-05', '2026-10-12', 2,
            '0f000000-0000-4000-8000-000000000001', 'x', '{"text": "x"}', '[]', 'm', 'p');
    raise exception 'CHECK FAILED: one conversation twice in one run';
  exception when unique_violation then null; end;
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
do $$ declare n int; begin
  select count(id) into n from public.post_ideas; if n <> 0 then raise exception 'CHECK FAILED: B reads A''s post ideas'; end if;
end $$;
reset role;

-- 6. A regate takes the placements and tags with their video, and gives them back.
create temp table before_regate as
  select 'product_tags' as t, to_jsonb(x) as r from public.product_tags x where x.video_id = '0c000000-0000-4000-8000-000000000001'
  union all select 'product_mentions', to_jsonb(x) from public.product_mentions x where x.video_id = '0c000000-0000-4000-8000-000000000001';
create temp table regated as
  select public.regate_videos('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', array['0c000000-0000-4000-8000-000000000001']::uuid[], 'products-checks.sql') as r;
do $$ declare r jsonb; n int; begin
  select regated.r into r from regated;
  if (r -> 'backed_up' ->> 'product_tags')::int <> 2 or (r -> 'backed_up' ->> 'product_mentions')::int <> 3 then
    raise exception 'CHECK FAILED: backed up %', r -> 'backed_up';
  end if;
  select count(*) into n from public.product_mentions where video_id = '0c000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'CHECK FAILED: % placements left on a removed video', n; end if;
  select count(*) into n from public.product_tags where video_id = '0c000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'CHECK FAILED: % tags left on a removed video', n; end if;
  -- The month rows are untouched: no key reaches them.
  select count(*) into n from public.month_product_readings where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 3 then raise exception 'CHECK FAILED: the regate moved the product months'; end if;
  perform public.regate_restore((r ->> 'batch_id')::uuid);
  select count(*) into n from (
    (select 'product_tags' as t, to_jsonb(x) as r from public.product_tags x where x.video_id = '0c000000-0000-4000-8000-000000000001'
     union all select 'product_mentions', to_jsonb(x) from public.product_mentions x where x.video_id = '0c000000-0000-4000-8000-000000000001')
    except select * from before_regate) d;
  if n <> 0 then raise exception 'CHECK FAILED: % placement or tag rows came back different', n; end if;
  select count(*) into n from public.product_mentions where video_id = '0c000000-0000-4000-8000-000000000001';
  if n <> 3 then raise exception 'CHECK FAILED: % placements restored, expected 3', n; end if;
end $$;

-- 9. The month's videos a product reading counts (T5): every audience, the
-- client's included, its own posts marked owned; the month by the comment.
reset role;
insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor, competitor_name, analyzed_lane, analyzed_run_id, caption, hashtags, topics, source_keywords, source) values
  ('0c000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tiktok', 'tt-own', 'u', 'tenant_a', true, false, null, 'full', '00000000-0000-4000-8000-0000000000a1', 'Our Seal-In X', '{}', '{}', '{}', 'owned'),
  ('0c000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tiktok', 'tt-about', 'u', 'creator', true, false, null, 'full', '00000000-0000-4000-8000-0000000000a1', 'My Tenant A liner', '{}', '{}', '{}', 'discovered'),
  ('0c000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tiktok', 'tt-claims', 'u', 'creator', false, false, null, 'claims_only', '00000000-0000-4000-8000-0000000000a1', 'x', '{}', '{}', '{}', 'discovered');
insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, text) values
  ('0d000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'tiktok', 'tt-own', 'c3', timestamptz '2026-09-25 10:00Z', 'is that the seal-in x?'),
  ('0d000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'tiktok', 'tt-about', 'c4', timestamptz '2026-09-26 10:00Z', 'mine too'),
  ('0d000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'tiktok', 'tt-about', 'c5', timestamptz '2026-10-02 10:00Z', 'october'),
  ('0d000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'tiktok', 'tt-claims', 'c6', timestamptz '2026-09-26 10:00Z', 'not read');
set local role service_role;
do $$
declare n int; own boolean; aud text;
begin
  select count(*) into n from public.product_month_videos('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', date '2026-09-01');
  if n <> 4 then raise exception 'CHECK FAILED: September holds % videos, not 4 (two market, the own post, the video about A; never the claims lane)', n; end if;
  select owned, audience into own, aud from public.product_month_videos('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', date '2026-09-01') where video_id = '0c000000-0000-4000-8000-000000000003';
  if own is not true or aud <> 'client' then raise exception 'CHECK FAILED: the own post reads owned=% audience=%', own, aud; end if;
  select owned, audience into own, aud from public.product_month_videos('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', date '2026-09-01') where video_id = '0c000000-0000-4000-8000-000000000004';
  if own is not false or aud <> 'client' then raise exception 'CHECK FAILED: the video about A reads owned=% audience=%', own, aud; end if;
  select count(*) into n from public.product_month_videos('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', date '2026-10-01');
  if n <> 1 then raise exception 'CHECK FAILED: October holds % videos, not 1 (dated by the comment)', n; end if;
  select count(*) into n from public.product_month_videos('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', date '2026-09-01');
  if n <> 0 then raise exception 'CHECK FAILED: B read A''s videos'; end if;
end $$;
reset role;

-- 8. Removing a tenant removes its catalogue, placements, tags, frozen months and ideas.
delete from public.clients where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$ declare n int; begin
  select (select count(*) from public.product_groups where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
       + (select count(*) from public.products where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
       + (select count(*) from public.product_aliases where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
       + (select count(*) from public.product_tags where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
       + (select count(*) from public.product_mentions where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
       + (select count(*) from public.month_product_readings where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
       + (select count(*) from public.post_ideas where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    into n;
  if n <> 0 then raise exception 'CHECK FAILED: % rows outlived their tenant', n; end if;
  select count(*) into n from public.product_groups where client_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 1 then raise exception 'CHECK FAILED: removing A took B''s catalogue'; end if;
end $$;

-- The grants, as the catalogue sees them.
do $$ begin
  if has_function_privilege('authenticated', 'public.product_month_videos(uuid, date)', 'execute')
     or not has_function_privilege('service_role', 'public.product_month_videos(uuid, date)', 'execute') then
    raise exception 'CHECK FAILED: product_month_videos is not the service role''s alone';
  end if;
end $$;
do $$ begin
  if has_function_privilege('authenticated', 'public.product_catalogue(uuid)', 'execute')
     or has_function_privilege('anon', 'public.product_catalogue(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.product_catalogue(uuid)', 'execute') then
    raise exception 'CHECK FAILED: product_catalogue is not the service role''s alone';
  end if;
  if has_table_privilege('service_role', 'public.product_mentions', 'update')
     or has_table_privilege('service_role', 'public.product_tags', 'delete')
     or has_table_privilege('service_role', 'public.products', 'delete')
     or has_table_privilege('authenticated', 'public.post_ideas', 'insert')
     or not has_column_privilege('service_role', 'public.product_aliases', 'retired_at', 'update')
     or has_column_privilege('service_role', 'public.product_aliases', 'alias', 'update') then
    raise exception 'CHECK FAILED: a grant is not what the migration says';
  end if;
end $$;

select 'products checks: all passed' as result;
rollback;
