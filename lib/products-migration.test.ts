import { readdirSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

import { CONFIG_SURFACES, TRACKING_SURFACES } from './config-log'
import { MF1_SURFACES } from './config-surfaces-mf1'
import { POST_IDEA_COLUMNS, POST_IDEA_RANKS } from './post-ideas/types'
import {
  ALIAS_KINDS, CATALOGUE_ACTOR_KINDS, CATALOGUE_STATUSES, CATALOGUE_VERSION_PATTERN, MENTION_SOURCES,
  MONTH_PRODUCT_READING_COLUMNS, MONTH_PRODUCT_READINGS_ON_CONFLICT, PLACEMENT_METHODS, PLACEMENTS,
  PRODUCT_ALIAS_COLUMNS, PRODUCT_COLUMNS, PRODUCT_CONTENT_FIELDS, PRODUCT_GROUP_COLUMNS, PRODUCT_MENTION_COLUMNS,
  PRODUCT_TAG_COLUMNS, PRODUCTS_SURFACE, READING_OBJECT_KINDS,
} from './products/types'
import { NOT_OUR_CHANGES } from './reading/comparability'
import { PANEL_STALING_SURFACES } from './reading/attention'
import { WEEK_CUT_SURFACES } from './reading/weeks'
import { SURFACE_WORDS } from './settings/change-log'

// The products migration (depth redesign v2, T10, and T13's post_ideas), read
// as text: what a later edit could quietly break without a database. The
// runtime proof is a throwaway PostgreSQL 17 cluster (scripts/pg-shim/
// throwaway.sh twice, then scripts/pg-shim/products-checks.sql). Pinned here:
// MF1's RLS and grant conventions on every new table, the append-only and
// month-table grant rules, the freeze guards, the shapes T11/T12/T13/T10b/T5
// code against (and their TypeScript mirrors), the catalogue version, the
// regate's coverage of the new video- and comment-keyed tables, and the
// change log's new surface.

const DIR = new URL('../supabase/migrations/', import.meta.url)
const FILE = '20261109090000_products.sql'
const REGATE = '20261106092000_regate_backup.sql'

/** The SQL without its comments: a comment grants, revokes and creates nothing. */
const code = (file: string) => readFileSync(new URL(file, DIR), 'utf8').replace(/--[^\n]*/g, '')
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const quoted = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1])

const sql = code(FILE)
const flat = squash(sql)
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()

const TABLES = ['product_groups', 'products', 'product_aliases', 'product_tags', 'product_mentions', 'month_product_readings', 'post_ideas']
const CATALOGUE = ['product_groups', 'products', 'product_aliases']
const APPEND_ONLY = ['product_tags', 'product_mentions']
const NEW_FUNCTIONS = ['product_catalogue', 'product_aliases_retire_once', 'product_month_videos']
const REPLACED = ['regate_videos', 'regate_restore']

const tablesOf = (s: string) => [...s.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])
const functionsOf = (s: string) => [...s.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1])
const listIn = (re: RegExp) => (flat.match(re)?.[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean)

/** A table's body split at its top-level commas: one entry per column or constraint. */
function tableParts(s: string, table: string): string[] {
  const start = s.indexOf(`create table if not exists public.${table} (`)
  if (start < 0) return []
  const parts: string[] = []
  let depth = 0
  let quotedNow = false
  let cur = ''
  for (let i = s.indexOf('(', start) + 1; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'") quotedNow = !quotedNow
    if (!quotedNow && ch === '(') depth++
    if (!quotedNow && ch === ')') {
      if (depth === 0) break
      depth--
    }
    if (!quotedNow && depth === 0 && ch === ',') {
      parts.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

/** Each column as `name type [not null] [→ table on delete action]`; the primary key as `pk (…)`. */
function shapeOf(s: string, table: string): string[] {
  return tableParts(s, table)
    .filter((p) => !/^(constraint|unique|foreign key)\b/.test(p))
    .map((p) => {
      if (p.startsWith('primary key')) return `pk ${p.slice('primary key '.length)}`
      const [name, type] = p.split(' ')
      const notNull = /\bnot null\b|\bprimary key\b/.test(p) ? ' not null' : ''
      const ref = p.match(/references public\.(\w+)\(id\)(?: on delete (cascade|set null))?/)
      return `${name} ${type}${notNull}${ref ? ` → ${ref[1]}${ref[2] ? ` on delete ${ref[2]}` : ''}` : ''}`
    })
}
const columnsOf = (table: string) => shapeOf(flat, table).filter((c) => !c.startsWith('pk ')).map((c) => c.split(' ')[0])

/** A function's body, from its `create or replace` to the end of its dollar quote. */
function bodyOf(s: string, name: string): string {
  const start = s.indexOf(`create or replace function public.${name}(`)
  if (start < 0) return ''
  const rest = s.slice(start)
  const m = rest.match(/\sas\s+(\$\w*\$)/)
  if (!m || m.index === undefined) return ''
  const open = m.index + m[0].length
  return rest.slice(open, rest.indexOf(m[1], open))
}

/** The fields of an exported interface, its `extends` included. */
function interfaceFields(source: string, name: string): string[] {
  const m = source.match(new RegExp(`export interface ${name}(?: extends (\\w+))? \\{([\\s\\S]*?)\\n\\}`))
  if (!m) return []
  const own = [...m[2].matchAll(/^ {2}(\w+)\??:/gm)].map((x) => x[1])
  return m[1] ? [...interfaceFields(source, m[1]), ...own] : own
}

// ---- The file -----------------------------------------------------------------------

describe('the products migration: the file', () => {
  it('sorts after every migration production has (costs, 20261108090000, the newest on 13 Oct)', () => {
    expect(files).toContain(FILE)
    expect(files.indexOf(FILE)).toBeGreaterThan(files.indexOf('20261108090000_costs.sql'))
  })

  it('holds no BEGIN, COMMIT or CONCURRENTLY (the runner wraps one transaction per file)', () => {
    expect(sql).not.toMatch(/^\s*(begin|commit)\s*;/im)
    expect(sql).not.toMatch(/concurrently/i)
  })

  it('creates exactly its seven tables and three functions (product_month_videos, T5), and replaces the regate pair', () => {
    expect(tablesOf(sql).sort()).toEqual([...TABLES].sort())
    expect(functionsOf(sql).sort()).toEqual([...NEW_FUNCTIONS, ...REPLACED].sort())
  })

  it('never names a table "categories" (the word is taken twice in the code)', () => {
    expect(flat).not.toMatch(/public\.(product_)?categor/)
  })

  it('replaces no function an earlier migration made but the regate pair', () => {
    for (const name of NEW_FUNCTIONS) {
      for (const f of files.filter((x) => x < FILE)) expect(code(f), `${name} in ${f}`).not.toContain(`function public.${name}(`)
    }
    expect(flat).not.toMatch(/create or replace function public\.(month_reading_|monthly_|window_|market_|get_my_client_id|tracking_configs_audit)/)
  })
})

// ---- RLS: a tenant reads its own rows and writes none ------------------------------------

describe('the products migration: MF1\'s RLS conventions on every new table', () => {
  it.each(TABLES)('%s: RLS on, one get_my_client_id() select policy, tenant column SELECT only', (t) => {
    expect(flat).toContain(`alter table public.${t} enable row level security;`)
    const policies = [...flat.matchAll(new RegExp(`create policy "[^"]+" on public\\.${t} (.*?);`, 'g'))].map((m) => m[1])
    expect(policies).toEqual(['for select to authenticated using (client_id = public.get_my_client_id())'])
    expect(listIn(/revoke all on (public\.[^;]+) from anon, authenticated;/)).toContain(`public.${t}`)
    expect(flat).toMatch(new RegExp(`grant select \\([^)]+\\) on public\\.${t} to authenticated;`))
    // No tenant write, and no table-level read: column grants only.
    expect(flat).not.toMatch(new RegExp(`grant (select|insert|update|delete|all)[^;(]*on [^;]*public\\.${t}\\b[^;]*to [^;]*(anon|authenticated)`))
    expect(flat).not.toMatch(new RegExp(`grant (insert|update|delete)[^;]*on public\\.${t} to [^;]*(anon|authenticated)`))
  })

  it.each(TABLES)('%s: a tenant reads every column (nothing here is an operator\'s private words)', (t) => {
    const granted = listIn(new RegExp(`grant select \\(([^)]+)\\) on public\\.${t} to authenticated;`))
    expect(granted.sort()).toEqual(columnsOf(t).sort())
  })

  it('every new table carries client_id, cascading from clients (the policy\'s key, and a tenant\'s removal)', () => {
    for (const t of TABLES) expect(shapeOf(flat, t), t).toContain('client_id uuid not null → clients on delete cascade')
  })
})

// ---- What the service role keeps ----------------------------------------------------------

describe('the products migration: the service role\'s grants, by kind of table', () => {
  it('the catalogue and the append-only tables: SELECT and INSERT, never UPDATE, DELETE or TRUNCATE', () => {
    const tables = [...CATALOGUE, ...APPEND_ONLY].map((t) => `public.${t}`).sort()
    expect(listIn(/grant select, insert on ([^;]+) to service_role;/).sort()).toEqual(tables)
    expect(listIn(/revoke update, delete, truncate on ([^;]+) from service_role;/).sort()).toEqual(tables)
  })

  it('the catalogue\'s edits are column grants, after the revoke; an alias takes its retirement alone', () => {
    const updates = [...flat.matchAll(/grant update \(([^)]+)\) on public\.(\w+) to service_role;/g)]
      .map((m) => [m[2], m[1].split(',').map((c) => c.trim())] as const)
    expect(updates.map(([t]) => t)).toEqual(['product_groups', 'products', 'product_aliases'])
    const of = (t: string) => updates.find(([name]) => name === t)![1]
    expect(of('product_aliases')).toEqual(['retired_at', 'retired_by', 'retired_label'])
    for (const [t, cols] of updates) {
      for (const fixed of ['id', 'client_id', 'created_at']) expect(cols, `${t}.${fixed}`).not.toContain(fixed)
      for (const c of cols) expect(columnsOf(t), `${t}.${c}`).toContain(c)
      expect(flat.indexOf(`on public.${t} to service_role;`), t).toBeGreaterThan(flat.indexOf('revoke update, delete, truncate on public.product_groups'))
    }
    // A product moves between categories; a category has none to move between.
    expect(of('products')).toContain('group_id')
  })

  it('the month table keeps the month tables\' four and loses TRUNCATE; post_ideas upserts and never deletes', () => {
    expect(flat).toContain('grant select, insert, update, delete on public.month_product_readings to service_role;')
    expect(flat).toContain('revoke truncate on public.month_product_readings from service_role;')
    expect(flat).toContain('grant select, insert, update on public.post_ideas to service_role;')
    expect(flat).toContain('revoke delete, truncate on public.post_ideas from service_role;')
  })

  it('every UPDATE the file grants is one of those', () => {
    expect(flat.match(/grant [^;]*\bupdate\b[^;]*;/g)).toEqual([
      'grant update (name, status, sort, seeded_from, retired_at, updated_at, actor_kind, actor_user_id, actor_label) on public.product_groups to service_role;',
      'grant update (group_id, name, status, sort, seeded_from, retired_at, updated_at, actor_kind, actor_user_id, actor_label) on public.products to service_role;',
      'grant update (retired_at, retired_by, retired_label) on public.product_aliases to service_role;',
      'grant select, insert, update, delete on public.month_product_readings to service_role;',
      'grant select, insert, update on public.post_ideas to service_role;',
    ])
  })
})

// ---- Append-only ------------------------------------------------------------------------

describe('the products migration: placements and tags are append-only', () => {
  it.each(APPEND_ONLY)('%s: no UPDATE grant anywhere, and UPDATE, DELETE, TRUNCATE revoked', (t) => {
    expect(listIn(/revoke update, delete, truncate on ([^;]+) from service_role;/)).toContain(`public.${t}`)
    expect(flat).not.toMatch(new RegExp(`grant [^;]*\\bupdate\\b[^;]*on [^;]*public\\.${t}\\b`))
  })

  it('a placement is one row per video, comment, target, method and version; a tag\'s per tag and version', () => {
    expect(flat).toContain(
      "create unique index if not exists product_mentions_uniq on public.product_mentions (client_id, video_id, source, coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid), method, rule_version, catalogue_version) where method <> 'tag';",
    )
    expect(flat).toContain('create unique index if not exists product_mentions_one_per_tag on public.product_mentions (tag_id, catalogue_version) where method = \'tag\';')
  })

  it('a target\'s tags are one chain: one first tag, each replaced at most once, on the same client and video', () => {
    expect(flat).toContain(
      "create unique index if not exists product_tags_one_first on public.product_tags (client_id, video_id, coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid)) where supersedes is null;",
    )
    expect(flat).toContain('create unique index if not exists product_tags_one_successor on public.product_tags (supersedes) where supersedes is not null;')
    expect(flat).toContain('foreign key (supersedes, client_id, video_id) references public.product_tags (id, client_id, video_id)')
    expect(flat).toContain('check (supersedes is null or supersedes <> id)')
  })

  it('an alias takes its retirement once and nothing else (the tracking_config_queue shape)', () => {
    expect(flat).toContain('create trigger product_aliases_retire_once before update on public.product_aliases for each row execute function public.product_aliases_retire_once();')
    const body = squash(bodyOf(sql, 'product_aliases_retire_once'))
    expect(body).toContain('if old.retired_at is not null then')
    expect(body).toContain('if new.retired_at is null then')
    expect(body).toContain("if (to_jsonb(new) - array['retired_at', 'retired_by', 'retired_label']) is distinct from (to_jsonb(old) - array['retired_at', 'retired_by', 'retired_label']) then")
    expect(body.match(/errcode = 'restrict_violation'/g)).toHaveLength(3)
  })

  it('the catalogue is retired, never deleted, and its foreign keys say so (NO ACTION, the subjects rule)', () => {
    for (const t of ['products', 'product_aliases', 'product_tags', 'product_mentions', 'month_product_readings']) {
      const refs = tableParts(flat, t).filter((p) => /references public\.(products|product_groups) \(id, client_id\)/.test(p))
      expect(refs.length, t).toBeGreaterThan(0)
      for (const r of refs) expect(r, `${t}: ${r}`).toMatch(/\(id, client_id\) on delete no action$/)
    }
    expect(flat).toContain("check ((status = 'retired') = (retired_at is not null))")
  })
})

// ---- The month table's guards ------------------------------------------------------------

describe('the products migration: month_product_readings carries the month tables\' guards', () => {
  const triggers = [
    ...flat.matchAll(/create trigger (\w+) before (\w+) on public\.(\w+) for each row (when \(old\.status = 'frozen'\) )?execute function public\.(\w+)\(\);/g),
  ].map((m) => `${m[1]}: before ${m[2]}${m[4] ? ' when frozen' : ''} → ${m[5]}`)

  it('the existing three, attached as MF3 attaches them to month_brand_readings', () => {
    expect(triggers.filter((t) => t.startsWith('month_product_readings_'))).toEqual([
      'month_product_readings_frozen_guard: before update when frozen → month_reading_frozen_guard',
      'month_product_readings_frozen_insert_guard: before insert → month_reading_frozen_insert_guard',
      'month_product_readings_delete_guard: before delete when frozen → month_reading_delete_guard',
    ])
    const mf3 = squash(code('20261103090000_market_first_s3.sql'))
    for (const [guard, when] of [['frozen_guard', 'update'], ['frozen_insert_guard', 'insert'], ['delete_guard', 'delete']] as const) {
      const ours = flat.match(new RegExp(`create trigger month_product_readings_${guard} (before ${when} [^;]*;)`))?.[1]
      const theirs = mf3.match(new RegExp(`create trigger month_brand_readings_${guard} (before ${when} [^;]*;)`))?.[1]
      expect(ours, guard).toBe(theirs?.replace('month_brand_readings', 'month_product_readings'))
    }
  })

  it('so the one-shot back-read opening is the same one: no guard function of its own', () => {
    expect(functionsOf(sql).filter((f) => /guard/.test(f))).toEqual([])
  })

  it('every primary-key column is NOT NULL: the insert guard reads the key from the catalogue', () => {
    const shape = shapeOf(flat, 'month_product_readings')
    const pk = shape.find((c) => c.startsWith('pk '))!.slice(4).replace(/[()]/g, '').split(',').map((c) => c.trim())
    expect(pk).toEqual(['client_id', 'month', 'audience', 'object_kind', 'object_id'])
    expect(MONTH_PRODUCT_READINGS_ON_CONFLICT).toBe(pk.join(','))
    for (const c of pk) expect(shape.find((s) => s.startsWith(`${c} `)), c).toMatch(/ not null/)
    // The guard reads new.client_id, new.month and new.audience by name.
    for (const c of ['client_id', 'month', 'audience', 'status']) expect(columnsOf('month_product_readings')).toContain(c)
  })

  it('filling or frozen, live or read back, a month is its first day, frozen exactly when it carries frozen_at', () => {
    const parts = tableParts(flat, 'month_product_readings')
    expect(parts).toContain("status text not null check (status in ('filling', 'frozen'))")
    expect(parts).toContain("origin text not null check (origin in ('live', 'back_read'))")
    expect(parts).toContain("constraint month_product_readings_month_check check (month = date_trunc('month', month)::date)")
    expect(parts).toContain("constraint month_product_readings_frozen_at_check check ((status = 'frozen') = (frozen_at is not null))")
  })

  it('a category\'s split adds up to its videos; a product row is its named videos; every count sits inside n', () => {
    expect(flat).toContain(
      "check ( (object_kind = 'product' and k_unclear = 0 and k_unbranded = 0 and k_any = k_named) or (object_kind = 'group' and k_named + k_unclear + k_unbranded = k_any))",
    )
    expect(flat).toContain('k_any <= n')
    // The organic base (month_brand_readings', MF3): inside k_any and n, its k inside its n.
    expect(flat).toContain('k_organic >= 0 and n_organic >= 0 and k_organic <= k_any and n_organic <= n and k_organic <= n_organic')
    expect(flat).toContain(
      "check ( (object_kind = 'group' and product_id is null and object_id = group_id) or (object_kind = 'product' and product_id is not null and object_id = product_id))",
    )
  })
})

// ---- The pinned shapes (the interface T11, T12, T13, T10b and T5 code against) ---------------

describe('the products migration: the pinned shapes', () => {
  const actor = ['actor_kind text not null', 'actor_user_id uuid', 'actor_label text not null']
  const pinned: Record<string, string[]> = {
    product_groups: [
      'id uuid not null', 'client_id uuid not null → clients on delete cascade', 'name text not null', 'status text not null',
      'sort int not null', 'seeded_from text', 'retired_at timestamptz', 'created_at timestamptz not null',
      'updated_at timestamptz not null', ...actor,
    ],
    products: [
      'id uuid not null', 'client_id uuid not null → clients on delete cascade', 'group_id uuid not null', 'name text not null',
      'status text not null', 'sort int not null', 'seeded_from text', 'retired_at timestamptz', 'created_at timestamptz not null',
      'updated_at timestamptz not null', ...actor,
    ],
    product_aliases: [
      'id uuid not null', 'client_id uuid not null → clients on delete cascade', 'product_id uuid', 'group_id uuid',
      'alias text not null', 'kind text not null', 'needs_confirm boolean not null', 'seeded_from text',
      'created_at timestamptz not null', ...actor, 'retired_at timestamptz', 'retired_by uuid', 'retired_label text',
    ],
    product_tags: [
      'id uuid not null', 'client_id uuid not null → clients on delete cascade', 'video_id uuid not null → videos on delete cascade',
      'comment_id uuid → comments on delete cascade', 'placement text not null', 'product_id uuid', 'group_id uuid',
      'supersedes uuid', ...actor, 'created_at timestamptz not null',
    ],
    product_mentions: [
      'id uuid not null', 'client_id uuid not null → clients on delete cascade', 'video_id uuid not null → videos on delete cascade',
      'source text not null', 'field text', 'comment_id uuid → comments on delete cascade', 'comment_month date',
      'placement text not null', 'product_id uuid', 'group_id uuid', 'method text not null', 'rule_version text not null',
      'catalogue_version text not null', 'model text', 'prompt_version text', 'tag_id uuid', 'found_at timestamptz not null',
    ],
    month_product_readings: [
      'client_id uuid not null → clients on delete cascade', 'month date not null', 'audience text not null',
      'object_kind text not null', 'object_id uuid not null', 'group_id uuid not null', 'product_id uuid',
      'k_named int not null', 'k_unclear int not null', 'k_unbranded int not null', 'k_any int not null',
      'k_organic int not null', 'comments int not null', 'n int not null', 'n_organic int not null',
      'status text not null', 'origin text not null',
      'read_at timestamptz not null', 'run_id uuid → pipeline_runs on delete set null', 'rule_version text not null',
      'catalogue_version text not null', 'frozen_at timestamptz',
      'pk (client_id, month, audience, object_kind, object_id)',
    ],
    post_ideas: [
      'id uuid not null', 'client_id uuid not null → clients on delete cascade',
      'run_id uuid not null → pipeline_runs on delete cascade', 'window_start timestamptz not null',
      'window_end timestamptz not null', 'rank smallint not null', 'registry_id uuid not null → theme_registry on delete cascade',
      'title text not null', 'cover jsonb not null', 'subquestions jsonb not null', 'format text', 'format_multiple numeric',
      'opening text', 'opening_multiple numeric', 'model text not null', 'prompt_version text not null',
      'created_at timestamptz not null',
    ],
  }

  it.each(TABLES)('%s has the pinned columns, references and key', (t) => {
    expect(shapeOf(flat, t)).toEqual(pinned[t])
  })

  it('the TypeScript row types and column lists name exactly the stored columns, in the table\'s order', () => {
    const products = readFileSync(new URL('./products/types.ts', import.meta.url), 'utf8')
    const ideas = readFileSync(new URL('./post-ideas/types.ts', import.meta.url), 'utf8')
    const mirrors: [string, string, string, string][] = [
      ['product_groups', 'ProductGroupRow', PRODUCT_GROUP_COLUMNS, products],
      ['products', 'ProductRow', PRODUCT_COLUMNS, products],
      ['product_aliases', 'ProductAliasRow', PRODUCT_ALIAS_COLUMNS, products],
      ['product_tags', 'ProductTagRow', PRODUCT_TAG_COLUMNS, products],
      ['product_mentions', 'ProductMentionRow', PRODUCT_MENTION_COLUMNS, products],
      ['month_product_readings', 'MonthProductReadingRow', MONTH_PRODUCT_READING_COLUMNS, products],
      ['post_ideas', 'PostIdeaRow', POST_IDEA_COLUMNS, ideas],
    ]
    for (const [table, row, columns, source] of mirrors) {
      expect(columns.split(',').map((c) => c.trim()), table).toEqual(columnsOf(table))
      expect(interfaceFields(source, row).sort(), row).toEqual(columnsOf(table).sort())
    }
  })
})

// ---- The vocabularies -------------------------------------------------------------------

describe('the products migration: every CHECK list is the TypeScript list', () => {
  const listsOf = (column: string) =>
    [...flat.matchAll(new RegExp(`${column} text not null(?: default '[^']+')? check \\(${column} in \\(([^)]*)\\)\\)`, 'g'))].map((m) => quoted(m[1]))
  const checkOf = (column: string) => {
    const lists = listsOf(column)
    expect(lists.length, column).toBeGreaterThan(0)
    for (const l of lists) expect(l, column).toEqual(lists[0])
    return lists[0]
  }

  it('placements, methods, alias kinds, statuses, sources, object kinds and actors', () => {
    expect(checkOf('placement')).toEqual([...PLACEMENTS])
    expect(checkOf('method')).toEqual([...PLACEMENT_METHODS])
    expect(checkOf('kind')).toEqual([...ALIAS_KINDS])
    // A catalogue row is active or retired; the month row is filling or frozen.
    const statuses = [...new Set(listsOf('status').map((l) => l.join(',')))].sort()
    expect(statuses).toEqual([CATALOGUE_STATUSES.join(','), 'filling,frozen'].sort())
    expect(checkOf('source')).toEqual([...MENTION_SOURCES])
    expect(checkOf('object_kind')).toEqual([...READING_OBJECT_KINDS])
    expect(checkOf('actor_kind')).toEqual([...CATALOGUE_ACTOR_KINDS])
  })

  it('a content field is brand_mentions\' list, and the TypeScript one', () => {
    const fields = quoted(flat.match(/and \(field in \(([^)]*)\)/)?.[1] ?? '')
    expect(fields).toEqual([...PRODUCT_CONTENT_FIELDS])
    const mf2 = squash(code('20261005090000_market_first_s2.sql'))
    expect(quoted(mf2.match(/and field in \(([^)]*)\)\)/)?.[1] ?? '')).toEqual(fields)
  })

  it('a catalogue version is the pattern both tables check and the reader tests', () => {
    const checks = [...flat.matchAll(/check \(catalogue_version ~ '([^']+)'\)/g)].map((m) => m[1])
    expect(checks).toEqual([CATALOGUE_VERSION_PATTERN.source, CATALOGUE_VERSION_PATTERN.source])
  })

  it('a post idea is ranked 1 to 3', () => {
    expect(flat).toContain('rank smallint not null check (rank between 1 and 3)')
    expect([...POST_IDEA_RANKS]).toEqual([1, 2, 3])
  })
})

// ---- The catalogue version ------------------------------------------------------------------

describe('the products migration: product_catalogue, the catalogue read once with its version', () => {
  const decl = flat.slice(flat.indexOf('create or replace function public.product_catalogue('))
  const body = squash(bodyOf(sql, 'product_catalogue'))

  it('stable SECURITY DEFINER, a pinned search_path, executable by the service role alone', () => {
    expect(decl.slice(0, decl.indexOf(' as $$'))).toBe(
      'create or replace function public.product_catalogue(p_client uuid) returns jsonb language sql stable security definer set search_path = public, pg_temp',
    )
    expect(flat).toContain('revoke all on function public.product_catalogue(uuid) from public, anon, authenticated;')
    expect(flat).toContain('grant execute on function public.product_catalogue(uuid) to service_role;')
    expect(flat).not.toMatch(/grant execute on function public\.product_catalogue\([^)]*\) to [^;]*(anon|authenticated|public)/)
  })

  it('reads the active catalogue only: active categories, their active products, live aliases of those', () => {
    expect(body).toContain("where pg.client_id = p_client and pg.status = 'active'")
    expect(body).toContain("join g on g.id = pr.group_id where pr.client_id = p_client and pr.status = 'active'")
    expect(body).toContain('and al.retired_at is null')
    expect(body).toContain("select case when exists (select 1 from g) then jsonb_build_object(")
  })

  it('hashes what can move a placement, and nothing that cannot (no sort, time or actor)', () => {
    const canon = body.slice(body.indexOf('canon as ('), body.indexOf('select case when'))
    expect(canon).toContain("'g|' || g.id || '|' || lower(g.name)")
    expect(canon).toContain("'p|' || p.id || '|' || p.group_id || '|' || lower(p.name)")
    expect(canon).toContain("'a|' || coalesce(a.product_id, a.group_id) || '|' || a.kind || '|' || a.needs_confirm || '|' || lower(a.alias)")
    expect(canon).toContain("string_agg(x.line, E'\\n' order by x.line)")
    expect(canon).not.toMatch(/sort|created_at|updated_at|actor|seeded_from/)
    expect(body).toContain("'version', 'pc1_' || left(md5(c.body), 16)")
    expect(CATALOGUE_VERSION_PATTERN.test(`pc1_${'0123456789abcdef'}`)).toBe(true)
  })

  it('product_aliases_retire_once: a plpgsql trigger function, invoker, pinned search_path, closed to tenants', () => {
    const name = 'product_aliases_retire_once'
    const d = flat.slice(flat.indexOf(`create or replace function public.${name}()`))
    expect(d.slice(0, d.indexOf(' as $'))).toBe(`create or replace function public.${name}() returns trigger language plpgsql set search_path = public, pg_temp`)
    expect(flat).toContain(`revoke all on function public.${name}() from public, anon, authenticated;`)
  })

  it('every trigger the file creates guards; none writes a row (freeze-parity\'s rule for these files)', () => {
    const fns = [...flat.matchAll(/create trigger \w+ [^;]*?execute function public\.(\w+)\(\);/g)].map((m) => m[1])
    expect([...new Set(fns)].sort()).toEqual([
      'month_reading_delete_guard', 'month_reading_frozen_guard', 'month_reading_frozen_insert_guard', 'product_aliases_retire_once',
    ])
    expect(squash(bodyOf(sql, 'product_aliases_retire_once'))).not.toMatch(/\b(insert|update|delete)\s+(into\s+)?public\./)
  })
})

// ---- The regate -----------------------------------------------------------------------------

describe('the products migration: a regate backs up and restores placements and tags', () => {
  const newest = (name: string) => files.filter((f) => code(f).includes(`create or replace function public.${name}(`)).at(-1)
  const regate = squash(bodyOf(sql, 'regate_videos'))
  const restore = squash(bodyOf(sql, 'regate_restore'))
  const restoreOrder = quoted(restore.match(/foreach v_table in array array\[([^\]]+)\]/)?.[1] ?? '')

  it('this file holds the newest definition of both', () => {
    expect(newest('regate_videos')).toBe(FILE)
    expect(newest('regate_restore')).toBe(FILE)
  })

  it('every table here keyed to a video or a comment is backed up, removed and restored', () => {
    const keyed = TABLES.filter((t) => shapeOf(flat, t).some((c) => /→ (videos|comments) /.test(c)))
    expect(keyed.sort()).toEqual([...APPEND_ONLY].sort())
    for (const t of keyed) {
      expect(regate, t).toContain(`'${t}', to_jsonb(t) from public.${t} t where t.video_id in (select id from rg_videos) or t.comment_id in (select id from rg_comments)`)
      expect(regate, t).toContain(`delete from public.${t} where video_id in (select id from rg_videos) or comment_id in (select id from rg_comments);`)
      expect(restoreOrder, t).toContain(t)
    }
  })

  it('restores a tag before the placement that names it, and both after their video and comment', () => {
    const at = (t: string) => restoreOrder.indexOf(t)
    expect(at('product_tags')).toBeLessThan(at('product_mentions'))
    expect(at('comments')).toBeLessThan(at('product_tags'))
    expect(at('videos')).toBeLessThan(at('comments'))
    // and removes the placement first (a leaf before what it names)
    expect(regate.indexOf('delete from public.product_mentions')).toBeLessThan(regate.indexOf('delete from public.product_tags'))
    expect(regate.indexOf('delete from public.product_tags')).toBeLessThan(regate.indexOf('delete from public.comments'))
  })

  it('is 20261106092000\'s body, byte for byte in every other line (production matched that file on 13 Oct)', () => {
    const added = (t: string) => ` union all select v_batch, p_client, '${t}', to_jsonb(t) from public.${t} t where t.video_id in (select id from rg_videos) or t.comment_id in (select id from rg_comments)`
    const removed = (t: string) => ` delete from public.${t} where video_id in (select id from rg_videos) or comment_id in (select id from rg_comments);`
    const back = regate
      .replace(added('product_tags'), '').replace(added('product_mentions'), '')
      .replace(removed('product_mentions'), '').replace(removed('product_tags'), '')
    expect(back).toBe(squash(bodyOf(code(REGATE), 'regate_videos')))
    expect(restore.replace("'product_tags', 'product_mentions', ", '')).toBe(squash(bodyOf(code(REGATE), 'regate_restore')))
    // The heads and the grants are the same too.
    for (const name of REPLACED) {
      const head = (s: string) => s.slice(s.indexOf(`create or replace function public.${name}(`)).split(' as $$')[0]
      expect(head(flat), name).toBe(head(squash(code(REGATE))))
    }
    expect(flat).toContain('revoke all on function public.regate_videos(uuid, uuid[], text, uuid) from public, anon, authenticated;')
    expect(flat).toContain('grant execute on function public.regate_videos(uuid, uuid[], text, uuid) to service_role;')
    expect(flat).toContain('revoke all on function public.regate_restore(uuid) from public, anon, authenticated;')
    expect(flat).toContain('grant execute on function public.regate_restore(uuid) to service_role;')
  })

  it('leaves the month table and post_ideas out: no key reaches them from a video or a comment', () => {
    expect(regate).not.toMatch(/month_product_readings|post_ideas/)
    for (const t of ['month_product_readings', 'post_ideas']) {
      expect(shapeOf(flat, t).some((c) => /→ (videos|comments) /.test(c)), t).toBe(false)
    }
  })
})

// ---- The change log -----------------------------------------------------------------------

describe('the products migration: a catalogue edit is logged on its own surface and cuts no chart', () => {
  const surfacesIn = (s: string) => quoted(squash(s).match(/add constraint config_changes_surface_check check \(surface in \(([^)]*)\)\)/)?.[1] ?? '')

  it('is the newest migration to write the CHECK, and adds products to MF1\'s list without dropping one', () => {
    const writers = files.filter((f) => /add constraint config_changes_surface_check/i.test(code(f)))
    expect(writers.at(-1)).toBe(FILE)
    const mf1 = surfacesIn(code('20260928090000_market_first_s1.sql'))
    expect(surfacesIn(sql)).toEqual([...mf1, 'products'])
    expect(surfacesIn(sql).sort()).toEqual([...CONFIG_SURFACES, ...MF1_SURFACES].sort())
  })

  it('no other CHECK widens: the file adds constraints only to its own tables and config_changes', () => {
    const altered = [...flat.matchAll(/alter table public\.(\w+) (?:add|drop) constraint/g)].map((m) => m[1])
    expect([...new Set(altered)]).toEqual(['config_changes'])
    expect(flat).not.toMatch(/sent_figures|month_evidence_refs|anomaly_flags|comparability_checks|month_lens_readings/)
  })

  it('the surface is the TypeScript one, named in client words, and in no list that cuts a chart', () => {
    expect(PRODUCTS_SURFACE).toBe('products')
    expect(CONFIG_SURFACES).toContain(PRODUCTS_SURFACE)
    expect(TRACKING_SURFACES).not.toContain(PRODUCTS_SURFACE)
    expect(WEEK_CUT_SURFACES as readonly string[]).not.toContain(PRODUCTS_SURFACE)
    expect(PANEL_STALING_SURFACES).not.toContain(PRODUCTS_SURFACE)
    expect(NOT_OUR_CHANGES).toContain(PRODUCTS_SURFACE)
    expect(SURFACE_WORDS[PRODUCTS_SURFACE]).toBe('Your products')
  })
})
