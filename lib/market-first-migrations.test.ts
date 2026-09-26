import { readdirSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, RIVAL_PREFIX, UNKNOWN_RIVAL } from './rivals'

// Market-first MF2, MF4 and MF3 (plan §4.1, §4.2), read as text. The runtime
// proof is on the throwaway cluster (scripts/pg-shim/mf2-checks.sql,
// mf4-checks.sql and mf3-checks.sql, each file applied twice with an empty
// catalogue diff); this file pins what a later edit could quietly break without
// a cluster: the file names and their order, MF1's grant, RLS and append-only
// conventions on every new table and function, the pinned signatures and table
// shapes, the audience key, the guards, the sent_figures CHECK against
// lib/reports/sent-figures.ts, and the runner's sets.

const DIR = new URL('../supabase/migrations/', import.meta.url)
const MF1 = '20260928090000_market_first_s1.sql'
const R12 = '20260928091000_market_first_r12_grants.sql'
const MF2 = '20261005090000_market_first_s2.sql'
const MF4 = '20261005091000_market_first_weeks.sql'
const MF3 = '20261103090000_market_first_s3.sql'

/** The SQL without its comments: a comment grants, revokes and creates nothing. */
const code = (file: string) => readFileSync(new URL(file, DIR), 'utf8').replace(/--[^\n]*/g, '')
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

const tablesOf = (sql: string) => [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])
const functionsOf = (sql: string) =>
  [...sql.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)\)\s*returns/g)].map((m) => ({
    name: m[1],
    args: squash(m[2]),
  }))
/** The argument types alone, as `revoke … on function public.f(<types>)` names them. */
const signatureOf = (args: string) =>
  args
    .split(',')
    .map((a) => a.trim().replace(/\s+default\s+.*$/i, '').split(/\s+/).slice(1).join(' '))
    .join(', ')

describe('MF2 and MF4: the files', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()

  it('sit at the pinned names, after MF1 and R12, so the file order is the order of application', () => {
    expect(files).toContain(MF2)
    expect(files).toContain(MF4)
    const at = (f: string) => files.indexOf(f)
    expect(at(MF1)).toBeLessThan(at(R12))
    expect(at(R12)).toBeLessThan(at(MF2))
    expect(at(MF2)).toBeLessThan(at(MF4))
    // Nothing else sits between them (MF3, 20261103090000, sorts after MF4).
    expect(files.slice(at(MF1), at(MF4) + 1)).toEqual([MF1, R12, MF2, MF4])
  })

  it.each([MF2, MF4])('%s holds no BEGIN, COMMIT or CONCURRENTLY (the runner wraps one transaction per file)', (file) => {
    const sql = code(file)
    expect(sql).not.toMatch(/^\s*(begin|commit)\s*;/im)
    expect(sql).not.toMatch(/concurrently/i)
  })

  it.each([MF2, MF4])('%s changes no existing table grant, month table or audience CASE body', (file) => {
    const sql = code(file)
    expect(sql).not.toMatch(/(revoke|grant)[^;]*on public\.tracking_configs/i)
    expect(sql).not.toMatch(/\bpublic\.month_(denominators|theme_readings|subject_readings|kind_readings|audience_stats|evidence_refs)\b/)
    expect(sql).not.toMatch(/create or replace function public\.(monthly_|window_|market_month_|theme_maker_shares|market_segment_counts)/)
  })
})

describe.each([
  [MF2, ['comparability_checks', 'brand_mentions'], ['lens_readings', 'brand_mention_candidates', 'update_arrivals']],
  [MF4, ['week_line_reads', 'week_line_points'], ['market_week_volumes', 'market_week_readings']],
])('%s: MF1\'s conventions', (file, tables, functions) => {
  const sql = code(file)
  const flat = squash(sql)

  it('creates exactly the pinned tables and functions', () => {
    expect(tablesOf(sql).sort()).toEqual([...tables].sort())
    expect(functionsOf(sql).map((f) => f.name).sort()).toEqual([...functions].sort())
  })

  it.each(tables)('%s: RLS on, one get_my_client_id() select policy, tenant column SELECT only, service role append-only', (t) => {
    expect(flat).toContain(`alter table public.${t} enable row level security;`)
    const policies = [...flat.matchAll(new RegExp(`create policy "[^"]+" on public\\.${t} (.*?);`, 'g'))].map((m) => m[1])
    expect(policies).toEqual(['for select to authenticated using (client_id = public.get_my_client_id())'])
    const revokeTenant = flat.match(/revoke all on ([^;]+) from anon, authenticated;/)?.[1] ?? ''
    expect(revokeTenant.split(',').map((s) => s.trim())).toContain(`public.${t}`)
    // Column-level SELECT only: no table-level select for a tenant role.
    expect(flat).toMatch(new RegExp(`grant select \\([^)]+\\) on public\\.${t} to authenticated;`))
    expect(flat).not.toMatch(new RegExp(`grant (select|all)[^;(]*on [^;]*public\\.${t}\\b[^;]*to [^;]*(anon|authenticated)`))
    const serviceGrant = flat.match(/grant select, insert on ([^;]+) to service_role;/)?.[1] ?? ''
    expect(serviceGrant.split(',').map((s) => s.trim())).toContain(`public.${t}`)
    const serviceRevoke = flat.match(/revoke update, delete, truncate on ([^;]+) from service_role;/)?.[1] ?? ''
    expect(serviceRevoke.split(',').map((s) => s.trim())).toContain(`public.${t}`)
  })

  it.each(functions)('%s: stable SECURITY DEFINER, pinned search_path, execute for service_role only', (name) => {
    const fn = functionsOf(sql).find((f) => f.name === name)!
    const sig = signatureOf(fn.args)
    const decl = flat.slice(flat.indexOf(`create or replace function public.${name}(`))
    const head = decl.slice(0, decl.indexOf(' as $$'))
    expect(head).toMatch(/language sql stable security definer set search_path = public, pg_temp$/)
    expect(flat).toContain(`revoke all on function public.${name}(${sig}) from public, anon, authenticated;`)
    expect(flat).toContain(`grant execute on function public.${name}(${sig}) to service_role;`)
    // The grants name the function; nothing grants it to a tenant role.
    expect(flat).not.toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to [^;]*(anon|authenticated|public)`))
  })
})

describe('the pinned signatures (plan §4.2)', () => {
  const pinned: Record<string, string> = {
    lens_readings:
      'p_client uuid, p_month date, p_run uuid, p_video_ids uuid[] default null, p_min_dated_comments int default 1, p_captured_before timestamptz default null',
    brand_mention_candidates: 'p_client uuid, p_pattern text, p_from date, p_to date',
    update_arrivals: 'p_client uuid, p_run uuid, p_months date[]',
    market_week_volumes: 'p_client uuid, p_from date, p_to date, p_captured_before timestamptz default null',
    market_week_readings: 'p_client uuid, p_week date, p_age_days int, p_video_ids uuid[] default null',
  }
  const returns: Record<string, string> = {
    lens_readings: 'audience text, object_kind text, object_id text, k int, n int',
    brand_mention_candidates: 'video_id uuid, source text, field text, comment_id uuid, comment_month date, excerpt text',
    update_arrivals: 'month date, videos_first_read int, comments_captured int',
    market_week_volumes:
      'week date, audience text, videos int, comments int, comments_next_month int, under_5 int, median_dated numeric, mean_dated numeric, older_videos int, unchecked int',
    market_week_readings: 'audience text, object_kind text, object_id text, depth_band text, k int, n int',
  }
  const all = [...functionsOf(code(MF2)), ...functionsOf(code(MF4))]
  const flat = squash(code(MF2) + '\n' + code(MF4))

  it.each(Object.keys(pinned))('%s takes and returns what §4.2 pins', (name) => {
    expect(all.find((f) => f.name === name)?.args).toBe(pinned[name])
    const decl = flat.slice(flat.indexOf(`create or replace function public.${name}(`))
    expect(decl.slice(decl.indexOf(' returns table ('), decl.indexOf(' language sql'))).toBe(` returns table (${returns[name]})`)
  })
})

describe('the audience key', () => {
  // lens_readings reproduces stored month rows, so it carries the three-arm CASE
  // of monthly_denominators and its siblings; the market_ functions drop the
  // client arm, as MF1's market_month_videos does.
  const three = new RegExp(
    `case when v\\.is_client then '${CLIENT_AUDIENCE}' when v\\.is_competitor then '${RIVAL_PREFIX}' \\|\\| coalesce\\(v\\.competitor_name, '${UNKNOWN_RIVAL}'\\) else '${INDUSTRY_AUDIENCE}' end`,
    'g',
  )
  const two = new RegExp(
    `case when v\\.is_competitor then '${RIVAL_PREFIX}' \\|\\| coalesce\\(v\\.competitor_name, '${UNKNOWN_RIVAL}'\\) else '${INDUSTRY_AUDIENCE}' end`,
    'g',
  )

  it('MF2 builds the same three keys as lib/rivals.ts, once, in lens_readings', () => {
    const flat = squash(code(MF2))
    expect(flat.match(three)).toHaveLength(1)
    expect(flat.slice(flat.indexOf('create or replace function public.lens_readings'))).toMatch(three)
    // update_arrivals reads the market: no client arm, and the client's own posts left out.
    const arrivals = flat.slice(flat.indexOf('create or replace function public.update_arrivals'))
    expect(arrivals.slice(0, arrivals.indexOf('$$;'))).toContain('and v.is_client is not true')
  })

  it('MF4 builds the market\'s two keys in both functions, and leaves the client\'s own posts out', () => {
    const flat = squash(code(MF4))
    expect(flat.match(two)).toHaveLength(2)
    expect(flat.match(three)).toBeNull()
    expect(flat.match(/and v\.is_client is not true/g)).toHaveLength(2)
    expect(flat.match(/and v\.analyzed_lane = 'full'/g)).toHaveLength(2)
  })

  it('every week is an ISO week at UTC, by the comment\'s date', () => {
    const flat = squash(code(MF4))
    expect(flat).toContain("date_trunc('week', c.comment_date at time zone 'UTC')::date as week")
    expect(flat).not.toMatch(/date_trunc\('week', c\.comment_date\)/)
  })
})

describe('sent_figures.object_kind (WP2.1)', () => {
  const kindsIn = (sql: string) =>
    [...(sql.match(/sent_figures_object_kind_check\s+check \(object_kind in \(([^)]*)\)\)/i)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
  const original = [
    ...(code('20260918098000_sent_figures.sql').match(/object_kind\s+text not null check \(object_kind in \(([^)]*)\)\)/)?.[1] ?? '').matchAll(/'([^']+)'/g),
  ].map((m) => m[1])

  it('is the original five plus mood, brand and denominator, in the newest migration that writes it', () => {
    const newest = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => /add constraint sent_figures_object_kind_check/i.test(code(f)))
      .at(-1)
    expect(newest).toBe(MF2)
    expect(original).toEqual(['subject', 'theme', 'rival', 'kind', 'figure'])
    expect(kindsIn(code(MF2))).toEqual([...original, 'mood', 'brand', 'denominator'])
  })

  it('admits every kind lib/reports/sent-figures.ts can write (recordSend is non-fatal: a refused kind is a lost row)', () => {
    const source = readFileSync(new URL('./reports/sent-figures.ts', import.meta.url), 'utf8')
    const declared = source.match(/export type SentObjectKind =([^\n]+)/)?.[1]
    expect(declared, 'SentObjectKind is no longer where this test looks for it').toBeTruthy()
    const kinds = [...declared!.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(kinds.length).toBeGreaterThan(0)
    for (const kind of kinds) expect(kindsIn(code(MF2))).toContain(kind)
  })
})

describe('the runner (scripts/apply-market-first-migrations.sh)', () => {
  const runner = readFileSync(new URL('../scripts/apply-market-first-migrations.sh', import.meta.url), 'utf8')
  const setOf = (name: string) => {
    const block = runner.match(new RegExp(`\\n  ${name}\\)\\n([\\s\\S]*?)\\n    ;;`))?.[1] ?? ''
    return {
      files: block.match(/EXPECTED_FILES=\(([^)]*)\)/)?.[1]?.trim(),
      labels: block.match(/LABELS=\(([^)]*)\)/)?.[1]?.trim(),
      prereq: block.match(/PREREQ_VERSION="(\d+)"/)?.[1],
    }
  }

  it('keeps mf1 and r12 as they were, and adds mf2 (after MF1) and mf4 (after MF2)', () => {
    expect(setOf('mf1')).toEqual({ files: MF1, labels: 'MF1', prereq: '20260924093000' })
    expect(setOf('r12')).toEqual({ files: R12, labels: 'R12', prereq: '20260928090000' })
    expect(setOf('mf2')).toEqual({ files: MF2, labels: 'MF2', prereq: '20260928090000' })
    expect(setOf('mf4')).toEqual({ files: MF4, labels: 'MF4', prereq: '20261005090000' })
  })

  it('verifies each new set against its own tables and functions', () => {
    expect(runner).toContain(`MF2_TABLES="'comparability_checks','brand_mentions'"`)
    expect(runner).toContain(`MF2_FUNCS="'lens_readings','brand_mention_candidates','update_arrivals'"`)
    expect(runner).toContain(`MF4_TABLES="'week_line_reads','week_line_points'"`)
    expect(runner).toContain(`MF4_FUNCS="'market_week_volumes','market_week_readings'"`)
    expect(runner).toMatch(/verify_MF2\(\) \{[\s\S]*?verify_conventions "\$MF2_TABLES" "\$MF2_FUNCS" "2\|2\|0\|0\|4\|0" "3\|3\|0\|3"/)
    expect(runner).toMatch(/verify_MF4\(\) \{[\s\S]*?verify_conventions "\$MF4_TABLES" "\$MF4_FUNCS" "2\|2\|0\|0\|4\|0" "2\|2\|0\|2"/)
  })
})

// ── MF3 (Stage 3: WP3.3, WP3.4, WP3.5, WP3.6, WP3.10) ─────────────────────────

const MF3_TABLES = ['month_lens_readings', 'month_brand_readings', 'video_surfacings', 'tracking_config_queue', 'own_post_subjects']
const MF3_MONTH_TABLES = ['month_lens_readings', 'month_brand_readings']
const MF3_APPEND_TABLES = ['video_surfacings', 'tracking_config_queue', 'own_post_subjects']
const MF3_FUNCTIONS = ['month_lens_frozen_insert_guard', 'tracking_config_queue_applied_once']
const SIX_MONTH_TABLES = /public\.month_(denominators|theme_readings|subject_readings|kind_readings|audience_stats|evidence_refs)\b/g

/** A table's body split at its top-level commas: one entry per column or constraint. */
function tableParts(flat: string, table: string): string[] {
  const start = flat.indexOf(`create table if not exists public.${table} (`)
  if (start < 0) return []
  const parts: string[] = []
  let depth = 0
  let quoted = false
  let cur = ''
  for (let i = flat.indexOf('(', start) + 1; i < flat.length; i++) {
    const ch = flat[i]
    if (ch === "'") quoted = !quoted
    if (!quoted && ch === '(') depth++
    if (!quoted && ch === ')') {
      if (depth === 0) break
      depth--
    }
    if (!quoted && depth === 0 && ch === ',') {
      parts.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

/** Each column as `name type [not null] [→ table on delete action]`; the primary key as `pk (…)`. */
function shapeOf(flat: string, table: string): string[] {
  return tableParts(flat, table)
    .filter((p) => !/^(constraint|unique|foreign key)\b/.test(p))
    .map((p) => {
      if (p.startsWith('primary key')) return `pk ${p.slice('primary key '.length)}`
      const [name, type] = p.split(' ')
      const notNull = /\bnot null\b|\bprimary key\b/.test(p) ? ' not null' : ''
      const ref = p.match(/references public\.(\w+)\(id\)(?: on delete (cascade|set null))?/)
      return `${name} ${type}${notNull}${ref ? ` → ${ref[1]}${ref[2] ? ` on delete ${ref[2]}` : ''}` : ''}`
    })
}

describe('MF3: the file', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  const sql = code(MF3)

  it('sits at the pinned name, right after MF4: applied last, after September freezes (Tue 3 Nov)', () => {
    expect(files).toContain(MF3)
    expect(files[files.indexOf(MF4) + 1]).toBe(MF3)
  })

  it('holds no BEGIN, COMMIT or CONCURRENTLY (the runner wraps one transaction per file)', () => {
    expect(sql).not.toMatch(/^\s*(begin|commit)\s*;/im)
    expect(sql).not.toMatch(/concurrently/i)
  })

  it('creates exactly its five tables and two trigger functions', () => {
    expect(tablesOf(sql).sort()).toEqual([...MF3_TABLES].sort())
    expect(functionsOf(sql).map((f) => f.name).sort()).toEqual([...MF3_FUNCTIONS].sort())
  })
})

describe('MF3: additive only (plan §4.1)', () => {
  const sql = code(MF3)
  const flat = squash(sql)
  const earlier = readdirSync(DIR).filter((f) => f.endsWith('.sql') && f < MF3)

  it('names none of the six month tables but to read the denominator marker', () => {
    expect([...flat.matchAll(SIX_MONTH_TABLES)].map((m) => m[0])).toEqual(['public.month_denominators'])
    expect(flat).toContain('select 1 from public.month_denominators d where d.client_id = new.client_id')
  })

  it('replaces no function an earlier migration made, and builds no audience key', () => {
    for (const name of MF3_FUNCTIONS) {
      for (const f of earlier) expect(code(f), `${name} in ${f}`).not.toContain(`function public.${name}(`)
    }
    expect(flat).not.toMatch(/create or replace function public\.(month_reading_|monthly_|window_|market_|theme_maker_shares|lens_readings|brand_mention_candidates|update_arrivals|tracking_configs_audit|get_my_client_id)/)
    expect(flat).not.toMatch(/case when v\.is_(client|competitor)/)
  })

  it('gives tracking_configs two columns and their comments, and no grant', () => {
    const statements = [...flat.matchAll(/[^;]*public\.tracking_configs\b[^;]*;/g)].map((m) => m[0].trim())
    expect(statements.filter((st) => !st.startsWith('comment on column'))).toEqual([
      "alter table public.tracking_configs add column if not exists watched_brands text[] not null default '{}';",
      'alter table public.tracking_configs add column if not exists market_description text;',
    ])
    expect(statements.filter((st) => st.startsWith('comment on column')).map((st) => st.split(' ')[3])).toEqual([
      'public.tracking_configs.watched_brands',
      'public.tracking_configs.market_description',
    ])
    expect(flat).not.toMatch(/(grant|revoke)[^;]*on [^;]*public\.tracking_configs/i)
  })

  it('no migration grants a tenant role either operator column (they are operator-only, plan §4.2)', () => {
    for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql'))) {
      const grants = squash(code(f)).match(/grant [^;]*\b(watched_brands|market_description)\b[^;]*;/g) ?? []
      expect(grants, f).toEqual([])
    }
  })
})

describe('MF3: MF1\'s conventions, under three grant rules', () => {
  const flat = squash(code(MF3))
  const listIn = (re: RegExp) => (flat.match(re)?.[1] ?? '').split(',').map((x) => x.trim())

  it.each(MF3_TABLES)('%s: RLS on, one get_my_client_id() select policy, tenant column SELECT only', (t) => {
    expect(flat).toContain(`alter table public.${t} enable row level security;`)
    const policies = [...flat.matchAll(new RegExp(`create policy "[^"]+" on public\\.${t} (.*?);`, 'g'))].map((m) => m[1])
    expect(policies).toEqual(['for select to authenticated using (client_id = public.get_my_client_id())'])
    expect(listIn(/revoke all on ([^;]+) from anon, authenticated;/)).toContain(`public.${t}`)
    expect(flat).toMatch(new RegExp(`grant select \\([^)]+\\) on public\\.${t} to authenticated;`))
    expect(flat).not.toMatch(new RegExp(`grant (select|insert|update|delete|all)[^;(]*on [^;]*public\\.${t}\\b[^;]*to [^;]*(anon|authenticated)`))
  })

  it('a tenant reads every column but own_post_subjects\' operator words (reason, actor_label)', () => {
    for (const t of MF3_TABLES) {
      const granted = listIn(new RegExp(`grant select \\(([^)]+)\\) on public\\.${t} to authenticated;`)).sort()
      const columns = shapeOf(flat, t).filter((c) => !c.startsWith('pk ')).map((c) => c.split(' ')[0])
      const hidden = t === 'own_post_subjects' ? ['actor_label', 'reason'] : []
      expect(granted, t).toEqual(columns.filter((c) => !hidden.includes(c)).sort())
    }
  })

  it('the month tables keep the month tables\' four (the upsert, the stale sweep) and lose TRUNCATE', () => {
    const month = MF3_MONTH_TABLES.map((t) => `public.${t}`)
    expect(listIn(/grant select, insert, update, delete on ([^;]+) to service_role;/)).toEqual(month)
    expect(listIn(/revoke truncate on ([^;]+) from service_role;/)).toEqual(month)
  })

  it('the surfacings, the queue and the own-post subjects are append-only; the queue keeps one stamp', () => {
    const append = MF3_APPEND_TABLES.map((t) => `public.${t}`)
    expect(listIn(/grant select, insert on ([^;]+) to service_role;/)).toEqual(append)
    expect(listIn(/revoke update, delete, truncate on ([^;]+) from service_role;/)).toEqual(append)
    // The only UPDATE granted anywhere in the file, and after the revoke (which
    // takes column grants with it), so a second application ends where the first did.
    expect(flat.match(/grant [^;]*update[^;]*;/g)).toEqual([
      'grant select, insert, update, delete on public.month_lens_readings, public.month_brand_readings to service_role;',
      'grant update (applied_at) on public.tracking_config_queue to service_role;',
    ])
    expect(flat.indexOf('grant update (applied_at)')).toBeGreaterThan(flat.indexOf('revoke update, delete, truncate on public.video_surfacings'))
  })

  it.each(MF3_FUNCTIONS)('%s: a plpgsql trigger function, invoker, pinned search_path, closed to tenants', (name) => {
    const decl = flat.slice(flat.indexOf(`create or replace function public.${name}()`))
    expect(decl.slice(0, decl.indexOf(' as $'))).toBe(
      `create or replace function public.${name}() returns trigger language plpgsql set search_path = public, pg_temp`,
    )
    expect(flat).toContain(`revoke all on function public.${name}() from public, anon, authenticated;`)
    expect(flat).not.toMatch(new RegExp(`grant execute on function public\\.${name}\\(\\) to [^;]*(anon|authenticated|public)`))
  })
})

describe('MF3: the pinned shapes (plan §4.2, and the own_post_subjects pin for mf/s3-moves)', () => {
  const flat = squash(code(MF3))
  const month = [
    'status text not null', 'origin text not null', 'read_at timestamptz not null',
    'run_id uuid → pipeline_runs on delete set null', 'rule_version text not null', 'frozen_at timestamptz',
  ]
  const pinned: Record<string, string[]> = {
    month_lens_readings: [
      'client_id uuid not null → clients on delete cascade', 'month date not null', 'audience text not null', 'lens text not null',
      'object_kind text not null', 'object_id text not null', 'k int not null', 'n int not null', 'comments int', ...month,
      'pk (client_id, month, audience, lens, object_kind, object_id)',
    ],
    month_brand_readings: [
      'client_id uuid not null → clients on delete cascade', 'month date not null', 'audience text not null', 'brand_key text not null',
      'k_any int not null', 'k_content int not null', 'k_comment int not null', 'k_organic int not null',
      'n int not null', 'n_organic int not null', ...month,
      'pk (client_id, month, audience, brand_key)',
    ],
    video_surfacings: [
      'client_id uuid not null → clients on delete cascade', 'video_id uuid not null → videos on delete cascade',
      'run_id uuid not null → pipeline_runs on delete cascade', 'terms text[] not null', 'subreddits text[] not null',
      'pk (client_id, video_id, run_id)',
    ],
    tracking_config_queue: [
      'id uuid not null', 'client_id uuid not null → clients on delete cascade', 'field text not null', 'after jsonb not null',
      'effective_month date not null', 'queued_by uuid', 'queued_label text not null', 'queued_at timestamptz not null',
      'applied_at timestamptz',
    ],
    // The deviation's table. `id` is the key because claim_id is nullable (brand_mentions' shape).
    own_post_subjects: [
      'id uuid not null', 'client_id uuid not null → clients on delete cascade', 'video_id uuid not null → videos on delete cascade',
      'claim_id uuid → video_claims on delete cascade', 'subject_id uuid not null → subjects on delete cascade',
      'touches boolean not null', 'matched_words text[] not null', 'method text not null', 'judge_version text', 'reason text',
      'decided_at timestamptz not null', 'actor_label text not null',
    ],
  }

  it.each(MF3_TABLES)('%s has the pinned columns, references and key', (t) => {
    expect(shapeOf(flat, t)).toEqual(pinned[t])
  })

  it('own_post_subjects: judge or override, one judge row per post or claim, subject and version', () => {
    expect(flat).toContain("method text not null check (method in ('judge', 'override'))")
    expect(flat).toContain(
      "create unique index if not exists own_post_subjects_one_judge on public.own_post_subjects (client_id, video_id, coalesce(claim_id, '00000000-0000-0000-0000-000000000000'::uuid), subject_id, judge_version) where method = 'judge';",
    )
    // A judge row names its version, or the unique index could never collide.
    expect(flat).toContain("check (method <> 'judge' or coalesce(judge_version, '') <> '')")
  })

  it('the month tables: filling or frozen, live or read back', () => {
    for (const t of MF3_MONTH_TABLES) {
      const parts = tableParts(flat, t)
      expect(parts).toContain("status text not null check (status in ('filling', 'frozen'))")
      expect(parts).toContain("origin text not null check (origin in ('live', 'back_read'))")
    }
  })
})

describe('MF3: the guards (plan §4.2)', () => {
  const flat = squash(code(MF3))
  const triggers = [
    ...flat.matchAll(/create trigger (\w+) before (\w+) on public\.(\w+) for each row (when \(old\.status = 'frozen'\) )?execute function public\.(\w+)\(\);/g),
  ].map((m) => `${m[1]}: before ${m[2]}${m[4] ? ' when frozen' : ''} → ${m[5]}`)

  it('month_lens_readings: the update and delete guards, and its own lens-keyed insert guard', () => {
    expect(triggers.filter((t) => t.startsWith('month_lens_readings_'))).toEqual([
      'month_lens_readings_frozen_guard: before update when frozen → month_reading_frozen_guard',
      'month_lens_readings_frozen_insert_guard: before insert → month_lens_frozen_insert_guard',
      'month_lens_readings_delete_guard: before delete when frozen → month_reading_delete_guard',
    ])
  })

  it('month_brand_readings: the existing three, attached as the six month tables attach them', () => {
    expect(triggers.filter((t) => t.startsWith('month_brand_readings_'))).toEqual([
      'month_brand_readings_frozen_guard: before update when frozen → month_reading_frozen_guard',
      'month_brand_readings_frozen_insert_guard: before insert → month_reading_frozen_insert_guard',
      'month_brand_readings_delete_guard: before delete when frozen → month_reading_delete_guard',
    ])
    // The same attachment a month table has (M5, month_kind_readings).
    const m5 = squash(code('20260918094000_kind_mood_attention.sql'))
    expect(m5).toContain(
      "create trigger month_kind_readings_frozen_guard before update on public.month_kind_readings for each row when (old.status = 'frozen') execute function public.month_reading_frozen_guard();",
    )
    expect(m5).toContain(
      'create trigger month_kind_readings_frozen_insert_guard before insert on public.month_kind_readings for each row execute function public.month_reading_frozen_insert_guard();',
    )
  })

  it('the queue: applied_at stamped once, nothing else rewritten', () => {
    expect(triggers.filter((t) => t.startsWith('tracking_config_queue'))).toEqual([
      'tracking_config_queue_applied_once: before update → tracking_config_queue_applied_once',
    ])
    const body = flat.slice(flat.indexOf('create or replace function public.tracking_config_queue_applied_once()'))
    expect(body).toContain('if old.applied_at is not null then')
    expect(body).toContain("if (to_jsonb(new) - 'applied_at') is distinct from (to_jsonb(old) - 'applied_at') then")
  })

  it('the lens insert guard is the audience-month guard with the lens in its held test and its mark', () => {
    const start = flat.indexOf('create or replace function public.month_lens_frozen_insert_guard()')
    const body = flat.slice(start, flat.indexOf('$guard$;', start))
    const original = squash(code('20260918092000_reading_windows.sql'))
    // (a) the same commit marker as the original
    expect(original).toContain("and d.status = 'frozen'")
    expect(body).toContain("select 1 from public.month_denominators d where d.client_id = new.client_id and d.month = new.month and d.audience = new.audience and d.status = 'frozen'")
    // the mark carries the lens, hashed as the audience is
    expect(body).toContain("v_mark := format('|%s/%s/%s|', new.month, md5(new.audience), md5(new.lens));")
    expect(body).toContain("set_config('verbatim.month_lens_refreshed'")
    // (b) the whole key, lens included
    expect(body).toContain('and t.lens = new.lens and t.object_kind = new.object_kind and t.object_id = new.object_id')
    // (c) held by THIS lens from an earlier transaction, through the same subtransaction-safe test
    expect(body).toContain('and t.lens = new.lens and not public.month_reading_written_here(t.xmin)')
    expect(original).toContain('not public.month_reading_written_here(t.xmin)')
    expect(body).toContain("errcode = 'restrict_violation'")
    expect(body).toContain('is already held')
    // static: it guards one table and says so
    expect(body).not.toContain('execute format')
    expect(body).toContain("if tg_table_name <> 'month_lens_readings' then")
  })
})

describe('MF3: the seams its consumers code against', () => {
  const flat = squash(code(MF3))

  it('a brand is keyed as brand_mentions keys it (MF2), never as an audience string', () => {
    const keyCheck = (s: string) => s.match(/check \(\s*(brand_key = 'client' or brand_key like 'watched:_%' or brand_key ~ '[^']+')\s*\)/)?.[1]
    expect(keyCheck(flat)).toBeTruthy()
    expect(keyCheck(flat)).toBe(keyCheck(squash(code(MF2))))
  })

  it('a lens row\'s object kinds are lens_readings\' own five (MF2)', () => {
    expect(flat).toContain("check (object_kind in ('denominator', 'subject', 'kind', 'mood', 'theme'))")
    const mf2 = squash(code(MF2))
    const lens = mf2.slice(mf2.indexOf('create or replace function public.lens_readings'))
    const body = lens.slice(0, lens.indexOf('$$;'))
    for (const kind of ['denominator', 'subject', 'kind', 'mood', 'theme']) expect(body).toContain(`'${kind}'`)
  })

  it('a lens is a name with an optional month (the pinned same_searches:<prev YYYY-MM>)', () => {
    const lensCheck = flat.match(/check \(lens ~ '([^']+)'\)/)?.[1]
    expect(lensCheck).toBeTruthy()
    const lensRe = new RegExp(lensCheck!)
    for (const ok of ['buyers', 'makers', 'all_but_noise', 'dense20', 'same_searches:2026-09']) expect(lensRe.test(ok), ok).toBe(true)
    for (const bad of ['Buyers', 'same_searches:2026-9', 'same_searches:2026-13', 'same searches', '']) expect(lensRe.test(bad), bad).toBe(false)
  })

  it('a queued edit names a column the tenant sets and the audit trigger watches, never a cost knob', () => {
    const audit = squash(code('20260915091000_config_changes.sql'))
    const watched = [...(audit.match(/foreach v_col in array array\[([^\]]+)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(watched.length).toBe(14)
    const queued = [...(flat.match(/constraint tracking_config_queue_field_check check \(field in \(([^)]*)\)\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    const knobs = ['max_videos', 'max_comments', 'comment_depth']
    expect(queued.sort()).toEqual(watched.filter((c) => !knobs.includes(c)).sort())
    // Its value has the column's JSON shape: handles are objects, the cadence a string, the rest lists.
    expect(flat).toContain(
      "case field when 'own_handles' then jsonb_typeof(after) = 'object' when 'competitor_handles' then jsonb_typeof(after) = 'object' when 'report_period' then jsonb_typeof(after) = 'string' when 'report_day' then jsonb_typeof(after) = 'string' else jsonb_typeof(after) = 'array' end",
    )
  })

  it('a queued edit is effective from a month\'s first day, and the month tables\' months are firsts', () => {
    expect(flat).toContain('check (effective_month = date_trunc(\'month\', effective_month)::date)')
    for (const t of MF3_MONTH_TABLES) expect(tableParts(flat, t)).toContain(`constraint ${t}_month_check check (month = date_trunc('month', month)::date)`)
  })
})

describe('the runner\'s mf3 set', () => {
  const runner = readFileSync(new URL('../scripts/apply-market-first-migrations.sh', import.meta.url), 'utf8')
  const testRunner = readFileSync(new URL('../scripts/pg-shim/test-runner.sh', import.meta.url), 'utf8')
  const flat = squash(code(MF3))
  const listed = (name: string) => [...(runner.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1])

  it('applies MF3 alone, after MF4', () => {
    const block = runner.match(/\n {2}mf3\)\n([\s\S]*?)\n {4};;/)?.[1] ?? ''
    expect(block.match(/EXPECTED_FILES=\(([^)]*)\)/)?.[1]?.trim()).toBe(MF3)
    expect(block.match(/LABELS=\(([^)]*)\)/)?.[1]?.trim()).toBe('MF3')
    expect(block.match(/PREREQ_VERSION="(\d+)"/)?.[1]).toBe(MF4.slice(0, 14))
    expect(testRunner).toMatch(/mf3\) FIRST=20261103090000; HISTORY="[^"]*\('20261005091000', 'market_first_weeks'\)"; YES='y\\n'; PREREQ=20261005091000 ;;/)
  })

  it('verifies the tables, functions and guards the file makes', () => {
    expect(listed('MF3_TABLES').sort()).toEqual([...MF3_TABLES].sort())
    expect(listed('MF3_MONTH_TABLES')).toEqual(MF3_MONTH_TABLES)
    expect(listed('MF3_APPEND_TABLES')).toEqual(MF3_APPEND_TABLES)
    expect(listed('MF3_FUNCS').sort()).toEqual([...MF3_FUNCTIONS].sort())
    const inFile = [...flat.matchAll(/create trigger (\w+) [^;]*?execute function public\.(\w+)\(\);/g)]
      .map((m) => `${m[1]}:${m[2]}`)
      .filter((t) => MF3_TABLES.some((table) => t.startsWith(table)))
      .sort()
    expect(runner.match(/MF3_TRIGGERS="([^"]+)"/)?.[1]).toBe(inFile.join(','))
    expect(runner).toMatch(/verify_MF3\(\) \{[\s\S]*?check "existing guards unchanged" .* "\$PRE_GUARDS"\n/)
    expect(runner).toMatch(/if \[\[ "\$SET" == "mf3" \]\]; then\n {2}echo "== pre-check 4: the existing guards/)
  })
})
