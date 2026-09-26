import { readdirSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, RIVAL_PREFIX, UNKNOWN_RIVAL } from './rivals'

// Market-first MF2 and MF4 (plan §4.1, §4.2), read as text. The runtime proof is
// on the throwaway cluster (scripts/pg-shim/mf2-checks.sql and mf4-checks.sql,
// applied twice with an empty catalogue diff); this file pins what a later edit
// could quietly break without a cluster: the file names and their order, MF1's
// grant, RLS and append-only conventions on every new table and function, the
// pinned signatures, the audience key, the sent_figures CHECK against
// lib/reports/sent-figures.ts, and the runner's two new sets.

const DIR = new URL('../supabase/migrations/', import.meta.url)
const MF1 = '20260928090000_market_first_s1.sql'
const R12 = '20260928091000_market_first_r12_grants.sql'
const MF2 = '20261005090000_market_first_s2.sql'
const MF4 = '20261005091000_market_first_weeks.sql'

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
