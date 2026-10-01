import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// No step reaches a model here: the flags are off (lib/config.test.ts pins
// them), and the one module that builds the OpenAI client at import is mocked
// to throw if anything ever calls it.
const h = vi.hoisted(() => ({ parse: vi.fn(async () => { throw new Error('no model call in the freeze proof') }) }))
vi.mock('../openai', () => ({ openai: { chat: { completions: { parse: h.parse } } } }))

import { SEALAND_CLIENT_ID } from '../config'
import { pipelineActor } from '../config-log'
import { recordGatherSurfacings } from '../gather/surfacings'
import { PANEL_STALING_SURFACES } from '../reading/attention'
import { freezeMonths, type FreezeSummary } from '../reading/monthly'
import { subjectMonthSide } from '../subjects/read'
import { fakeAdmin, type FakeAdmin } from '../test/s3-run-fake-admin'
import { STAGING_FREEZE } from '../test/freeze-parity-staging'
import { LABEL_SEGMENTS_STAGING } from '../test/s3-run-segments'
import { COTOPAXI, NORTH_FACE, PATAGONIA, SEP_MARKET, sepMentions } from '../test/s3-run-brands'
import { brandPattern, brandRulesFor } from '../brands/aliases'
import { gatherRows, runsThrough, SUNDAYS } from '../test/s3-run-updates'
import { planSegmentVideos, runSegmentBatch } from './segment-videos'
import { keepWeeksInRun, planComparability, runComparabilityTask } from './comparability-step'
import { planLensReadings, runLensMonth } from './lens-readings'
import { planBrandReadings, runBrandMonth } from './brand-readings'
import { applyQueuedEdits } from './tracking-queue'
import { subjectMonthVideos, type SubjectMember } from '../pages/subjects'
import { TRIM_STAGING } from '../test/trim-staging'
import { staleInsightIds } from './pass-a-plan'
import { pruneStaleAnalysis, trimFreezeHold, trimStaleMemberships, type TrimSummary } from './stale-analysis'

// THE SUN 4 OCT RUN FREEZES AUGUST FOR GOOD, and deploy 4 puts four run steps
// (segment-videos, comparability, lens-readings, brand-readings) immediately
// before freeze-months, plus the queue apply in open-run and the gather's
// provenance and surfacings. This file is the proof that none of it can change
// what freeze-months writes for August:
//
//  1. The six month-reading functions freeze-months reads (the SQL) read only
//     the corpus tables below, and no market-first migration redefines them.
//  2. Every table the new code writes is outside everything freeze-months
//     reads or writes, recorded here, not listed by hand.
//  3. On staging's own August (still filling there, as production's is until
//     the 4 Oct run), freeze-months writes the same rows, the same attention
//     panel and the same evidence ids with and without every new step's
//     writes before it, on a database where every market-first table exists
//     (MF1, MF2, MF4 and MF3, the worst case: each step writes).
//
// The attention hunk ('attribution' in PANEL_STALING_SURFACES) is proven in
// lib/reading/attention.test.ts: for every change dated before 5 Oct it reads
// exactly as deploy 3's list does. The cluster half of this proof, the same
// question asked of the real SQL on PG 17, is scripts/pg-shim/d4-freeze-checks.sql.

const ROOT = join(__dirname, '..', '..')
const RUN = '00000000-0000-4000-8000-0000000d4004'
const STEPS_AT = '2026-10-04T07:40:00.000Z'
const FREEZE_AT = '2026-10-04T08:20:00.000Z'
const MONTHS = ['2026-08-01', '2026-09-01', '2026-10-01']

// ---- 1. The SQL freeze-months reads ------------------------------------------------

const FREEZE_RPCS = ['monthly_denominators', 'monthly_theme_readings', 'monthly_kind_readings', 'monthly_audience_stats', 'monthly_evidence_refs', 'monthly_subject_readings']

/** Every table the six functions read, through any function or view they call. */
const FREEZE_SQL_READS = [
  'attention_panels', 'audience_insights', 'comments', 'insight_evidence', 'subject_memberships', 'subjects',
  'theme_observations', 'tracking_configs', 'videos',
]

type Def = { file: string; body: string; kind: 'function' | 'view' }

function sqlDefinitions(): Map<string, Def> {
  const dir = join(ROOT, 'supabase', 'migrations')
  const defs = new Map<string, Def>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8')
    for (const m of sql.matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?(\w+)\s*\([\s\S]*?\$(\w*)\$([\s\S]*?)\$\2\$/gi)) {
      defs.set(m[1].toLowerCase(), { file, body: m[3], kind: 'function' })
    }
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?(\w+)[\s\S]*?\bas\b([\s\S]*?);/gi)) {
      defs.set(m[1].toLowerCase(), { file, body: m[2], kind: 'view' })
    }
  }
  // The baseline holds the views and functions older than the migrations.
  const base = readFileSync(join(ROOT, 'supabase', 'schema-baseline.sql'), 'utf8')
  for (const m of base.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:"?public"?\.)?"?(\w+)"?[\s\S]*?\bas\b([\s\S]*?);/gi)) {
    if (!defs.has(m[1].toLowerCase())) defs.set(m[1].toLowerCase(), { file: 'schema-baseline.sql', body: m[2], kind: 'view' })
  }
  return defs
}

function readsOf(roots: readonly string[], defs: Map<string, Def>): { tables: Set<string>; via: Set<string> } {
  const tables = new Set<string>()
  const via = new Set<string>()
  const queue = [...roots]
  while (queue.length) {
    const name = queue.pop()!
    if (via.has(name)) continue
    via.add(name)
    const def = defs.get(name)
    if (!def) throw new Error(`no definition of ${name}`)
    // Names a CTE defines are not tables.
    const ctes = new Set([...def.body.matchAll(/(?:with|,)\s+(\w+)\s+as\s*\(/gi)].map((m) => m[1].toLowerCase()))
    for (const m of def.body.matchAll(/\b(?:from|join)\s+(?:public\.)?(\w+)/gi)) {
      const t = m[1].toLowerCase()
      if (ctes.has(t) || ['unnest', 'lateral', 'generate_series', 'jsonb_each', 'jsonb_array_elements', 'jsonb_array_elements_text', 'jsonb_object_keys'].includes(t)) continue
      if (defs.has(t)) queue.push(t)
      else tables.add(t)
    }
    for (const m of def.body.matchAll(/\b(?:public\.)?(\w+)\s*\(/g)) {
      const f = m[1].toLowerCase()
      if (defs.has(f) && defs.get(f)!.kind === 'function' && !FREEZE_RPCS.includes(f)) queue.push(f)
    }
  }
  return { tables, via }
}

describe('1 · the SQL freeze-months reads', () => {
  const defs = sqlDefinitions()
  const { tables, via } = readsOf(FREEZE_RPCS, defs)

  it('reads the corpus and the panel, and no table any market-first step writes', () => {
    // Words the regexp takes for a table that are the SQL's own (a subquery's
    // alias after "from (", a column in "extract(... from x)") are not tables:
    // only names that exist as tables in the schema count.
    const real = [...tables].filter(tableExists)
    expect(real.sort()).toEqual(FREEZE_SQL_READS)
  })

  it('is defined before market-first: no MF1, R12, MF2, MF4 or MF3 file redefines any of it', () => {
    for (const name of via) {
      const def = defs.get(name)!
      expect(def.file < '20260928090000', `${name} is defined in ${def.file}`).toBe(true)
    }
    // And the market-first files create no trigger that writes, only guards.
    for (const file of readdirSync(join(ROOT, 'supabase', 'migrations')).filter((f) => f >= '20260928090000')) {
      const sql = readFileSync(join(ROOT, 'supabase', 'migrations', file), 'utf8')
      for (const m of sql.matchAll(/create\s+trigger\s+\w+\s+(?:before|after)\s+\w+(?:\s+or\s+\w+)*\s+on\s+(?:public\.)?(\w+)[\s\S]*?execute\s+function\s+(?:public\.)?(\w+)/gi)) {
        expect(['month_reading_frozen_guard', 'month_reading_frozen_insert_guard', 'month_lens_frozen_insert_guard', 'month_reading_delete_guard', 'tracking_config_queue_applied_once'], `${file}: ${m[1]} → ${m[2]}`).toContain(m[2].toLowerCase())
      }
    }
  })
})

const ALL_TABLES = (() => {
  const names = new Set<string>()
  const dir = join(ROOT, 'supabase', 'migrations')
  const texts = [readFileSync(join(ROOT, 'supabase', 'schema-baseline.sql'), 'utf8'), ...readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(join(dir, f), 'utf8'))]
  for (const sql of texts) {
    for (const m of sql.matchAll(/create\s+(?:table|view)\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?(\w+)"?/gi)) names.add(m[1].toLowerCase())
  }
  return names
})()
function tableExists(t: string): boolean {
  return ALL_TABLES.has(t)
}

// ---- 2 and 3. The steps' writes against what freeze-months touches ----------------

const S = STAGING_FREEZE
const tenant = <T extends object>(rows: readonly T[]) => rows.map((r) => ({ client_id: SEALAND_CLIENT_ID, ...r }))
const inWindow = (month: string, p: Record<string, unknown>) => month >= String(p.p_from).slice(0, 10) && month < String(p.p_to).slice(0, 10)
const rules = brandRulesFor(SEALAND_CLIENT_ID)

/** Accounts first seen before 1 Jul, so the 4 Oct visit can freeze a first panel
 *  (production's Sealand has 536: attention.ts), and the videos the evidence
 *  ids name, as the corpus holds them. */
function corpusVideos() {
  const panelAccounts = ['packlight', 'onebagtravel', 'gearreview'].map((a, i) => ({
    id: `00000000-0000-4000-8000-0000000d40a${i}`, platform: 'youtube', video_id: `yt-${a}`, account_name: a, scraped_at: '2026-06-29T05:00:00.000Z', unavailable_at: null,
  }))
  const refVideos = [...new Set(S.refs.flatMap((r) => r.video_ids))].map((id, i) => ({
    id, platform: 'tiktok', video_id: `ref-${i}`, account_name: `ref-account-${i % 7}`, scraped_at: '2026-08-10T05:00:00.000Z', unavailable_at: null,
  }))
  const segmentVideos = LABEL_SEGMENTS_STAGING.map((v) => ({
    id: v.id, platform: v.platform, video_id: `pid-${v.id.slice(0, 8)}`, caption: v.caption, hashtags: v.hashtags, topics: v.topics,
    source_keywords: v.sourceKeywords, account_name: null, scraped_at: '2026-10-04T04:30:00.000Z', unavailable_at: null,
    first_seen: '2026-10-04T04:30:00.000Z', analyzed_lane: 'full', source: 'search', is_client: false, is_competitor: false, competitor_name: null,
  }))
  return tenant([...panelAccounts, ...refVideos, ...segmentVideos])
}

/** Staging's stored month rows for August and September, filling, as the
 *  27 Sep run left production's. */
const storedDenominators = () => tenant(S.stored.map((r) => ({ ...r, origin: 'live', frozen_at: null })))

/** The production attribution row (attribution v3, 25 Sep 16:18:47Z) beside
 *  staging's tracking changes. */
const changes = () => tenant([
  ...S.changes,
  { changed_at: '2026-09-25T16:18:47+00:00', surface: 'attribution' },
].map((c, i) => ({ id: `cc-${String(i).padStart(3, '0')}`, ...c })))

function database(panel: 'none' | 'before-attribution', subjects?: (p: Record<string, unknown>) => object[]): FakeAdmin {
  const { mentions, firstTerms } = sepMentions()
  const byPattern = new Map(rules.map((r) => [brandPattern(r, 'are'), r]))
  const brandKey = (brand: string) => ({ Patagonia: PATAGONIA, 'The North Face': NORTH_FACE, Cotopaxi: COTOPAXI } as Record<string, string>)[brand]
  let panels = 0
  return fakeAdmin({
    tables: {
      // freeze-months' own
      month_denominators: storedDenominators(),
      month_theme_readings: [], month_subject_readings: [], month_kind_readings: [], month_audience_stats: [], month_evidence_refs: [],
      // After every tracking change deploy 3 re-bases on, before the attribution
      // row: the one panel the 'attribution' hunk could have moved.
      attention_panels: panel === 'none' ? [] : tenant([{ id: 'panel-2026-09-25', frozen_at: '2026-09-25T06:00:00+00:00', cutoff: '2026-06-01', accounts: [], account_count: 251, reason: 'first_freeze' }]),
      config_changes: changes(),
      pipeline_runs: tenant([
        ...runsThrough('2026-10-04', true).map((r) => (r.id === 'run-2026-10-04' ? { ...r, id: RUN } : r)),
      ].map((r) => ({ ...r, clustering_key: r.id === RUN ? 'ck-2026-10-04' : null }))),
      videos: corpusVideos(),
      insight_evidence: [...new Set(S.refs.flatMap((r) => r.comment_ids))].map((comment_id, i) => ({ id: `ie-${i}`, comment_id, quote: 'a quote', redacted: false })),
      // the new steps' (every market-first table there: the worst case)
      video_segments: [], video_provenance: tenant([...firstTerms].map(([video_id, first_terms]) => ({ video_id, first_terms, first_subreddits: [], method: 'reconstructed', evidence: 'staging' }))),
      gate_verdicts: tenant(LABEL_SEGMENTS_STAGING.filter((v) => v.unjudged).map((v) => ({ platform: v.platform, video_id: `pid-${v.id.slice(0, 8)}`, kept: true, source: 'default' }))),
      keyword_performance: tenant(SUNDAYS.filter((d) => d <= '2026-10-04').flatMap((d) => gatherRows(d)).map((r) => (r.run_id === 'run-2026-10-04' ? { ...r, run_id: RUN } : r))),
      comments: [],
      // Every table the SQL reads is here, empty where the SQL half is faked:
      // the fake refuses a write to a table it does not hold as a missing
      // migration and records nothing, so a step writing subject_memberships
      // or audience_insights would otherwise pass §2 unseen.
      subject_memberships: [], audience_insights: [],
      theme_observations: tenant([{ run_id: RUN, run_date: '2026-10-04', member_insight_ids: [] }]),
      theme_registry: [], subjects: [],
      month_pair_comparability: [], config_change_reach: [], comparability_checks: [],
      month_lens_readings: [], month_brand_readings: [], brand_mentions: [], video_surfacings: [],
      tracking_configs: tenant([{ competitor_names: ['Patagonia', 'The North Face', 'Cotopaxi'], competitor_keywords: [], competitor_handles: {}, own_handles: {}, brand_keywords: ['sealand gear'], watched_brands: [], exclude_terms: [] }]),
      competitors: tenant([{ id: PATAGONIA, name: 'Patagonia', retired_at: null }, { id: NORTH_FACE, name: 'The North Face', retired_at: null }, { id: COTOPAXI, name: 'Cotopaxi', retired_at: null }]),
      week_line_reads: [], week_line_points: [], ai_call_log: [],
      // a queued edit (MF3): due on the 1st, never before 1 Jan 2027
      tracking_config_queue: tenant([{ id: 'q-1', field: 'competitor_names', after: ['Patagonia', 'Topo Designs'], effective_month: '2026-11-01', queued_by: null, queued_label: 'Daniela', queued_at: '2026-09-28T09:00:00Z', applied_at: null }]),
    },
    defaults: {
      attention_panels: () => ({ id: `panel-new-${++panels}`, frozen_at: FREEZE_AT }),
      config_changes: (_r, i) => ({ id: `cc-new-${i}`, changed_at: FREEZE_AT }),
    },
    rpc: {
      // freeze-months: staging's real outputs over the window asked
      monthly_denominators: (p) => S.denominators.filter((r) => inWindow(r.month, p)),
      monthly_kind_readings: (p) => S.kinds.filter((r) => inWindow(r.month, p)),
      monthly_subject_readings: (p) => (subjects ? subjects(p) : S.subjects.filter((r) => inWindow(r.month, p))),
      monthly_theme_readings: (p) => S.themes.filter((r) => inWindow(r.month, p)),
      monthly_evidence_refs: (p) => S.refs.filter((r) => inWindow(r.month, p)),
      // over a panel the attention half is that panel's: a different panel
      // would read differently, so a panel the steps moved could not pass
      monthly_audience_stats: (p) => S.stats.filter((r) => inWindow(r.month, p)).map((r) => (p.p_panel
        ? { ...r, panel_videos: String(p.p_panel).length + r.judged, attention_comments: String(p.p_panel).length * 10 + r.judged, panel_platform_mix: { youtube: 1 } }
        : r)),
      // the steps' reads
      market_month_videos: (p) => (String(p.p_month).startsWith('2026-09')
        ? SEP_MARKET.map((v) => ({ video_id: v.id, audience: v.audience, platform: v.platform, dated_comments: v.dated }))
        : LABEL_SEGMENTS_STAGING.slice(0, 6).map((v) => ({ video_id: v.id, audience: 'industry-other', platform: v.platform, dated_comments: 12 }))),
      segments_for_videos: (p) => (p.p_video_ids as string[]).map((id, i) => ({ video_id: id, segment: i % 5 === 0 ? 'maker' : 'market' })),
      lens_readings: (p) => [{ audience: 'industry-other', object_kind: 'denominator', object_id: 'videos', k: p.p_video_ids ? (p.p_video_ids as string[]).length : 626, n: 626 }],
      brand_mention_candidates: (p) => {
        const rule = byPattern.get(String(p.p_pattern))
        const key = rule ? brandKey(rule.brand) : undefined
        return mentions.filter((m) => key && m.row.brand_key === key).map((m) => ({ video_id: m.row.video_id, source: 'content', field: 'caption', comment_id: null, comment_month: null, excerpt: m.excerpt }))
      },
    },
  })
}

/** The new code, in the pipeline's order: open-run's queue apply, the gather's
 *  provenance and surfacings, then the four steps before freeze-months. */
async function runTheNewSteps(f: FakeAdmin): Promise<Set<string>> {
  const admin = f.client
  const before = f.writes.length
  const log = () => {}
  const q = await applyQueuedEdits(admin, { clientId: SEALAND_CLIENT_ID, runId: RUN, now: '2026-10-04T04:00:05.000Z' })
  expect(q.status).toBe('nothing_due')
  const fresh = LABEL_SEGMENTS_STAGING.slice(0, 8).map((v) => ({ video_id: `pid-${v.id.slice(0, 8)}`, source_keywords: ['upcycled bag'] }))
  for (const platform of ['tiktok', 'youtube', 'instagram', 'reddit']) {
    await recordGatherSurfacings(admin, { clientId: SEALAND_CLIENT_ID, runId: RUN, platform, storedAt: '2026-10-04T04:30:00.000Z', fresh, surfaced: fresh })
  }
  const seg = await planSegmentVideos(admin, SEALAND_CLIENT_ID)
  for (const ids of seg.batches) await runSegmentBatch(admin, { clientId: SEALAND_CLIENT_ID, runId: RUN, ids, judge: null })
  for (const task of planComparability(STEPS_AT, ['2026-08-01', '2026-09-01'])) {
    await runComparabilityTask(admin, { clientId: SEALAND_CLIENT_ID, runId: RUN, now: STEPS_AT, task, keepWeeks: keepWeeksInRun, log })
  }
  const lens = await planLensReadings(admin, SEALAND_CLIENT_ID, STEPS_AT)
  for (const month of lens.months) await runLensMonth(admin, { clientId: SEALAND_CLIENT_ID, runId: RUN, now: STEPS_AT, month })
  const brands = await planBrandReadings(admin, SEALAND_CLIENT_ID, STEPS_AT)
  for (const month of brands.months) await runBrandMonth(admin, { clientId: SEALAND_CLIENT_ID, runId: RUN, now: STEPS_AT, month, judge: null })
  expect(h.parse).not.toHaveBeenCalled()
  return new Set(f.writes.slice(before).map((w) => w.table))
}

async function freeze(f: FakeAdmin): Promise<{ summary: FreezeSummary; writes: FakeAdmin['writes']; touched: Set<string>; rpcs: Set<string> }> {
  const w0 = f.writes.length
  const r0 = f.reads.length
  const c0 = f.rpcCalls.length
  const summary = await freezeMonths(f.client, {
    clientId: SEALAND_CLIENT_ID, runId: RUN, months: MONTHS, now: FREEZE_AT,
    sides: [subjectMonthSide(f.client, SEALAND_CLIENT_ID)],
    actor: { ...pipelineActor(RUN, 'freeze-months', new Date(FREEZE_AT)), nonce: 'fixed' },
  })
  const writes = f.writes.slice(w0)
  const touched = new Set([...f.reads.slice(r0), ...writes.map((w) => w.table)])
  return { summary, writes, touched, rpcs: new Set(f.rpcCalls.slice(c0).map((c) => c.fn)) }
}

describe('2 and 3 · freeze-months on staging\'s August, with and without every new step before it', () => {
  for (const panel of ['none', 'before-attribution'] as const) {
    it(`writes the same month rows, panel and evidence ids (${panel === 'none' ? 'no panel yet: the 4 Oct visit freezes the first' : 'a panel frozen before the 25 Sep attribution row'})`, async () => {
      const d3 = database(panel)
      const alone = await freeze(d3)

      const d4 = database(panel)
      // A write is recorded only on a table the fake holds: every table
      // freeze-months reads or writes is held, so none can be written unseen.
      for (const t of [...FREEZE_SQL_READS, 'config_changes', 'month_denominators', 'month_theme_readings', 'month_subject_readings', 'month_kind_readings', 'month_audience_stats', 'month_evidence_refs']) {
        expect(d4.tables, t).toHaveProperty(t)
      }
      const stepWrites = await runTheNewSteps(d4)
      const after = await freeze(d4)

      // Not vacuous: every step wrote, on a database where all its tables exist.
      for (const t of ['video_provenance', 'video_surfacings', 'video_segments', 'month_lens_readings', 'month_brand_readings', 'brand_mentions']) {
        expect(stepWrites, t).toContain(t)
      }
      // 2. Nothing a step wrote is anything freeze-months read or wrote.
      const overlap = [...stepWrites].filter((t) => alone.touched.has(t) || after.touched.has(t) || FREEZE_SQL_READS.includes(t))
      expect(overlap).toEqual([])
      expect([...after.rpcs].sort()).toEqual([...alone.rpcs].sort())

      // 3. The same visit, write for write: the six month tables, the panel,
      //    its change row, and the evidence ids.
      expect(after.writes).toEqual(alone.writes)
      expect(after.summary).toEqual(alone.summary)
      const augustFrozen = alone.writes.filter((w) => w.table === 'month_denominators').flatMap((w) => w.rows).filter((r) => r.month === '2026-08-01')
      expect(augustFrozen.length).toBe(3)
      expect(augustFrozen.every((r) => r.status === 'frozen' && r.frozen_at === FREEZE_AT)).toBe(true)
      expect(alone.writes.some((w) => w.table === 'month_evidence_refs')).toBe(true)
      if (panel === 'none') expect(alone.summary.panelReason).toBe('first_freeze')
      else {
        // The dangerous case, and it holds: the attribution row postdates the
        // panel, so 'attribution' without its 5 Oct instant would have re-based
        // it and August's attention half would have frozen over a new panel.
        const later = changes().filter((c) => c.changed_at > '2026-09-25T06:00:00+00:00')
        expect(later.some((c) => PANEL_STALING_SURFACES.includes(c.surface))).toBe(true)
        expect(alone.summary.panelFrozen).toBe(false)
        expect(alone.summary.panelId).toBe('panel-2026-09-25')
      }
      for (const t of ['month_denominators', 'month_theme_readings', 'month_subject_readings', 'month_kind_readings', 'month_audience_stats', 'month_evidence_refs', 'attention_panels']) {
        expect(d4.tables[t], t).toEqual(d3.tables[t])
      }
    })
  }
})

// ---- 4. A failing step cannot stop freeze-months --------------------------------

describe('4 · every new step is non-fatal, so freeze-months always runs after it', () => {
  const src = readFileSync(join(ROOT, 'inngest', 'functions', 'pipeline.ts'), 'utf8')
  const freezeAt = src.indexOf(".run('freeze-months'")

  it('each of the eight new ids ends in .catch, and all eight sit before freeze-months', () => {
    const ids = ["'plan-segment-videos'", '`segment-videos:', "'plan-comparability'", '`comparability:', "'plan-lens-readings'", '`lens-readings:', "'plan-brand-readings'", '`brand-readings:']
    let last = -1
    for (const id of ids) {
      const at = src.indexOf(`.run(${id}`)
      expect(at, id).toBeGreaterThan(last)
      expect(at, id).toBeLessThan(freezeAt)
      last = at
      // The step call, up to its own end: a .catch that logs and returns null.
      const rest = src.slice(at)
      const close = rest.search(/\n {4}(?:\}|const |\/\/)/)
      const chain = rest.slice(0, close > 0 ? close : 4000)
      expect(chain, id).toMatch(/\.catch\(\(e\) => \{\s*console\.error\(`[^`]*`\)\s*return null\s*\}\)/)
    }
  })

  it('the loops between them read only what a caught step returned (null reads as nothing to do)', () => {
    const block = src.slice(src.indexOf(".run('plan-segment-videos'"), freezeAt)
    expect(block).toContain('const segmentBatches = segmentPlan?.batches ?? []')
    expect(block).toContain('const comparabilityTasks = comparabilityPlan?.tasks ?? []')
    expect(block).toContain('const lensMonthsToRead = lensPlan?.months ?? []')
    expect(block).toContain('const brandMonthsToRead = brandPlan?.months ?? []')
    // Outside a step's own callback, nothing between the first new id and
    // freeze-months awaits anything but a step (a throw out there would be
    // uncaught): cut every `.run(…, async () => { … }).catch(…)` out, then look.
    const outside = block.replace(/\.run\([^\n]*, async \(\) => \{[\s\S]*?\n(\s*)\}\)\n\1\.catch\(\(e\) => \{[\s\S]*?\n\1\}\)/g, '.run(STEP).catch(CAUGHT)')
    expect(outside.match(/\.run\(STEP\)\.catch\(CAUGHT\)/g)?.length).toBe(8)
    const awaits = [...outside.matchAll(/await (?!step\b)(\w+)/g)].map((m) => m[1])
    expect(awaits).toEqual([])
  })

  it('open-run\'s queue apply is caught inside open-run, and the gather\'s record inside the gather', () => {
    const open = src.slice(src.indexOf("step.run('open-run'"), src.indexOf("step.run('open-run'") + 6000)
    expect(open).toMatch(/try \{\s*const queued = await applyQueuedEdits[\s\S]*?\} catch \(e\) \{\s*console\.error\(`\[open-run\] queued tracking edits not applied/)
    const gather = readFileSync(join(ROOT, 'lib', 'gather', 'gather.ts'), 'utf8')
    expect(gather).toMatch(/try \{\s*const rec = await recordGatherSurfacings[\s\S]*?\} catch \(e\) \{\s*errors\.push\(/)
  })
})

// ---- 5. The other three freeze-path hunks move nothing freeze-months does -------

/** The freeze-months path: lib/reading/monthly.ts and lib/subjects/read.ts and
 *  everything they import (tsconfig.freeze-months.json; scripts/pipeline-closure.sh
 *  lists the same 38 files through tsc). */
function freezePath(): Map<string, string> {
  const out = new Map<string, string>()
  const queue = ['lib/reading/monthly.ts', 'lib/subjects/read.ts']
  while (queue.length) {
    const file = queue.pop()!
    if (out.has(file)) continue
    const src = readFileSync(join(ROOT, file), 'utf8')
    out.set(file, src)
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+'([^']+)'/g)) {
      const spec = m[1]
      let rel: string | null = null
      if (spec.startsWith('@/')) rel = spec.slice(2)
      else if (spec.startsWith('.')) rel = join(file, '..', spec)
      if (!rel) continue
      for (const cand of [`${rel}.ts`, `${rel}.tsx`, join(rel, 'index.ts')]) {
        try { readFileSync(join(ROOT, cand)); queue.push(cand); break } catch { /* next */ }
      }
    }
  }
  return out
}

describe('5 · the other freeze-path hunks', () => {
  const path = freezePath()
  const uses = (name: string) => [...path.entries()].filter(([, src]) => new RegExp(`\\b${name}\\b`).test(src)).map(([f]) => f)

  it('walks the same path tsc lists (38 files)', () => {
    expect(path.size).toBe(38)
  })

  it('lib/config.ts: the two spend switches are read by nothing on the path, and are off for every tenant', async () => {
    for (const name of ['SEGMENT_JUDGE_ENABLED', 'BRAND_CONFIRM_ENABLED', 'segmentJudgeEnabled', 'brandConfirmEnabled']) {
      expect(uses(name), name).toEqual(['lib/config.ts'])
    }
    const config = await vi.importActual<typeof import('../config')>('../config')
    expect(Object.values(config.SEGMENT_JUDGE_ENABLED).every((on) => on === false)).toBe(true)
    expect(Object.values(config.BRAND_CONFIRM_ENABLED).every((on) => on === false)).toBe(true)
  })

  it('lib/subjects/types.ts: SUBJECTS_MAX (8 to 10) is read by nothing on the path, and by nothing that writes a row without a person or an operator asking', () => {
    expect(uses('SUBJECTS_MAX')).toEqual(['lib/subjects/types.ts'])
    // Beyond the path: Settings' ceiling on adding one (lib/subjects/moves.ts),
    // its copy, and the operator's proposer script. No run step, no loader.
    const pipeline = readFileSync(join(ROOT, 'inngest', 'functions', 'pipeline.ts'), 'utf8')
    expect(pipeline).not.toMatch(/SUBJECTS_MAX|subjects\/propose|PROPOSE_KEEP_MAX/)
  })

  it('lib/agent/retrieve.ts: the path takes embeddingCoverage alone from it, and WP3.9\'s scope is opt-in', () => {
    const importers = [...path.entries()].filter(([, src]) => /from '\.\.\/agent\/retrieve'|from '\.\/retrieve'/.test(src))
    expect(importers.map(([f]) => f)).toEqual(['lib/subjects/membership.ts'])
    expect(importers[0][1]).toMatch(/import \{ embeddingCoverage \} from '\.\.\/agent\/retrieve'/)
    const retrieve = path.get('lib/agent/retrieve.ts')!
    const coverage = retrieve.slice(retrieve.indexOf('export async function embeddingCoverage'))
    expect(coverage.slice(0, coverage.indexOf('\n}\n'))).not.toMatch(/scope/)
    expect(retrieve).toContain('if (args.scope) return retrieveScoped(')
  })
})

// ---- 6. Deploy 5b: the trim before the months, and what it can move ------------
//
// THE DEFECT. freeze-months (and, since deploy 4, lens-readings and the
// comparability keep) read a subject's months over subject_memberships, which
// cascades from audience_insights, and prune-stale-analysis runs after
// close-run. So the months counted each re-read video's OLD member insights,
// and the prune deleted them minutes later: production's September read 203
// for Buying & delivery at 07:22 on 27 Sep and 199 after the prune. The 4 Oct
// run freezes August. trim-stale-memberships removes, before any of those
// steps, the memberships of exactly the insights the prune will delete
// (lib/pipeline/stale-analysis.ts). This section proves where it sits and what
// it can reach; §7 runs it, the freeze and the prune on staging's own
// memberships; scripts/pg-shim/d5b-trim-checks.sql asks the real SQL.

describe('6 · trim-stale-memberships: its position, its failure, and the one table it writes', () => {
  const src = readFileSync(join(ROOT, 'inngest', 'functions', 'pipeline.ts'), 'utf8')
  const at = (id: string) => {
    const i = src.search(new RegExp(`\\.run\\(['\`]${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    expect(i, id).toBeGreaterThan(0)
    return i
  }
  const defs = sqlDefinitions()
  const readers = [...defs.entries()].filter(([, d]) => /\bsubject_memberships\b/.test(d.body)).map(([n]) => n).sort()

  it('sits after Pass A, the membership judge and persist-themes, and before every step that reads a subject month', () => {
    const trim = at('trim-stale-memberships')
    for (const before of ['plan-pass-a', 'plan-subject-membership', 'subject-membership:', 'persist-themes']) expect(at(before), before).toBeLessThan(trim)
    for (const after of ['plan-segment-videos', 'plan-comparability', 'comparability:', 'plan-lens-readings', 'lens-readings:', 'freeze-months', 'anomaly-check', 'close-run', 'prune-stale-analysis']) {
      expect(at(after), after).toBeGreaterThan(trim)
    }
    // Nothing between it and the first deploy-4 id but comments and blank lines.
    const between = src.slice(src.indexOf('\n', src.indexOf('return null', trim)), at('plan-segment-videos'))
    expect(between.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim()).toMatch(/^\}\) const segmentPlan = await step$/)
  })

  it('ends in a .catch that logs and returns null, and freeze-months holds its subject side on that null', () => {
    const rest = src.slice(at('trim-stale-memberships'))
    const chain = rest.slice(0, rest.search(/\n {4}(?:\}|const |\/\/)/))
    expect(chain).toMatch(/\.catch\(\(e\) => \{\s*console\.error\(`[^`]*`\)\s*return null\s*\}\)/)
    expect(src).toContain('const trimmed = await step\n      .run(\'trim-stale-memberships\'')
    expect(src).toContain('const subjectHold = subjectFreezeHold(subjectOutcomes) ?? trimFreezeHold(trimmed)')
    // freeze-months' own body is deploy 5's: it reads subjectHold as it always did.
    expect(src).toContain('sides: subjectHold ? [] : [subjectMonthSide(admin, clientId)],')
  })

  it('the prune stays where it was, under its id, and is the one beside the trim', () => {
    expect(at('prune-stale-analysis')).toBeGreaterThan(at('close-run'))
    expect(src).toContain(".run('prune-stale-analysis', () => pruneStaleAnalysis(createAdminClient(), clientId))")
    expect(src).not.toMatch(/async function (pruneStaleAnalysis|citedEvidenceIds)\(/)
    expect(src).toMatch(/import \{ pruneStaleAnalysis, trimFreezeHold, trimStaleMemberships, trimSummary \} from '@\/lib\/pipeline\/stale-analysis'/)
  })

  it('of the six functions freeze-months reads, only monthly_subject_readings reaches subject_memberships', () => {
    const reach = FREEZE_RPCS.filter((fn) => readsOf([fn], defs).tables.has('subject_memberships'))
    expect(reach).toEqual(['monthly_subject_readings'])
  })

  it('every SQL function that reads subject_memberships is called by the run after the trim, by a page, or is the judge', () => {
    expect(readers).toEqual(['lens_readings', 'market_week_readings', 'monthly_subject_readings', 'regate_restore', 'regate_videos', 'subject_band', 'window_subject_readings'])
    const code = (f: string) => readFileSync(join(ROOT, f), 'utf8')
    // lens_readings: the lens step and the comparability re-check; market_week_readings: the
    // comparability step's weekly keep. All three run after the trim (above).
    expect(code('lib/pipeline/lens-readings.ts')).toContain("admin.rpc('lens_readings'")
    expect(code('lib/pipeline/comparability-step.ts')).toContain("admin.rpc('lens_readings'")
    expect(code('lib/reading/week-keep.ts')).toContain("rpc<WeekReadingRow>('market_week_readings'")
    // subject_band: the judge, BEFORE the trim, over audience_insights_current, so it
    // never names a superseded insight and cannot hand the trim's rows back.
    expect(defs.get('subject_band')!.body).toMatch(/from public\.audience_insights_current ai/)
    // window_subject_readings: pages only; no step calls it.
    expect(src).not.toMatch(/window_subject_readings|RPC_WINDOW_SUBJECT_READINGS/)
    // regate_videos / regate_restore (the backfill's regate, 20261106092000):
    // an operator's removal with a backup and its undo, which back up and
    // delete (or put back) a removed video's memberships with its insights.
    // No step calls either.
    expect(src).not.toMatch(/regate_videos|regate_restore/)
  })

  it('no trigger fires from a subject_memberships delete into anything freeze-months reads', () => {
    const triggers: string[] = []
    for (const file of readdirSync(join(ROOT, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(ROOT, 'supabase', 'migrations', file), 'utf8')
      for (const m of sql.matchAll(/create\s+trigger\s+(\w+)\s[^;]*?\son\s+(?:public\.)?subject_memberships\b[^;]*;/gi)) triggers.push(`${file}: ${m[1]}`)
    }
    expect(triggers).toEqual([])
  })
})

// ---- 7. On staging's own memberships: stored equals live, and only the phantoms go ---

const T = TRIM_STAGING as unknown as {
  months: string[]
  market: string[]
  subjects: [string, string][]
  videos: [string, string | null, number, string][]
  insights: [string, string | null, string][]
  cited: string[]
  members: Record<string, [string, string | null, string, number][]>
  occupies: Record<string, string[]>
  live: [string, string, string, number][]
}
const NEW_RUN = 'r-1004'
const RUN_ROW = { id: RUN, client_id: SEALAND_CLIENT_ID, status: 'running', started_at: '2026-10-04T04:00:00Z', clustering_key: 'ck-2026-10-04' }

/** What each member insight carries, as the pane's rule reads it (the fixture's
 *  header says why this is the whole of it). A re-read's new insight carries
 *  its old one's. */
const EVIDENCE = new Map<string, { kind: string | null; months: string[]; cam: boolean }>()
for (const rows of Object.values(T.members)) {
  for (const [id, kind, months, cam] of rows) EVIDENCE.set(id, { kind, months: months ? months.split('|') : [], cam: cam === 1 })
}
const ORIGIN = (id: string) => id.replace(/\+$/, '')

/** THE 4 OCT RUN, SIMULATED ON STAGING'S STRUCTURE. Every third analysed market
 *  video with a member is re-read by NEW_RUN: its pointer moves, each of its old
 *  insights gets a new one, and the new reading is judged a member of the same
 *  subject for every other old member (index even) and not for the rest. So the
 *  old member insights of a re-read video are superseded; those something stored
 *  cites (staging's real cited set) are kept by the prune, and the rest are the
 *  prune's to delete. The numbers are the fixture's; only the re-read is made up. */
function simulatedRun(): { videos: Record<string, unknown>[]; insights: Record<string, unknown>[]; memberships: Record<string, unknown>[]; reread: Set<string> } {
  const candidates = T.videos.filter((v) => v[1] != null && v[2] === 0)
  const reread = new Set(candidates.filter((_, i) => i % 3 === 0).map((v) => v[0]))
  const videos = T.videos.map(([id, run, client, audience]) => ({
    id, client_id: SEALAND_CLIENT_ID, analyzed_run_id: reread.has(id) ? NEW_RUN : run, is_client: client === 1, audience,
  }))
  const insights: Record<string, unknown>[] = T.insights.map(([id, run, video]) => ({ id, client_id: SEALAND_CLIENT_ID, run_id: run, source_video_id: video }))
  const memberships: Record<string, unknown>[] = []
  const onVideo = new Map<string, string[]>()
  for (const [id, , video] of T.insights) onVideo.set(video, [...(onVideo.get(video) ?? []), id])
  for (const video of reread) for (const id of onVideo.get(video) ?? []) insights.push({ id: `${id}+`, client_id: SEALAND_CLIENT_ID, run_id: NEW_RUN, source_video_id: video })
  const videoOf = new Map(T.insights.map(([id, , video]) => [id, video]))
  for (const [subject, rows] of Object.entries(T.members)) {
    for (const [id] of rows) {
      memberships.push({ subject_id: subject, audience_insight_id: id, client_id: SEALAND_CLIENT_ID, member: true })
      const video = videoOf.get(id)!
      if (reread.has(video) && (onVideo.get(video) ?? []).indexOf(id) % 2 === 0) {
        memberships.push({ subject_id: subject, audience_insight_id: `${id}+`, client_id: SEALAND_CLIENT_ID, member: true })
      }
    }
  }
  return { videos, insights, memberships, reread }
}

/** monthly_subject_readings' video count, per month, audience and subject, over
 *  the fake's tables as they stand: the member rows whose insight is still there
 *  (the SQL's join to the base table), counted by the pane's own rule. On
 *  staging's data the rule reads what the SQL reads (the first test below). */
function subjectReadings(f: FakeAdmin, from: string, to: string): { month: string; audience: string; subject_id: string; videos: number }[] {
  const video = new Map(f.tables.videos.map((v) => [v.id as string, v]))
  const insight = new Map(f.tables.audience_insights.map((i) => [i.id as string, i]))
  const out: { month: string; audience: string; subject_id: string; videos: number }[] = []
  const bySubject = new Map<string, SubjectMember[]>()
  for (const m of f.tables.subject_memberships) {
    if (!m.member) continue
    const i = insight.get(m.audience_insight_id as string)
    const e = EVIDENCE.get(ORIGIN(m.audience_insight_id as string))
    if (!i || !e) continue
    const v = video.get(i.source_video_id as string)
    const member: SubjectMember = {
      insightId: i.id as string, kind: e.kind, videoId: i.source_video_id as string, client: v?.is_client === true, analysed: v?.analyzed_run_id != null,
      evidence: [...e.months.map((mo) => ({ source: 'comment', commentDate: `${mo}-15` })), ...(e.cam ? [{ source: 'video', commentDate: null }] : [])],
    }
    bySubject.set(m.subject_id as string, [...(bySubject.get(m.subject_id as string) ?? []), member])
  }
  for (const month of T.months.filter((mo) => mo >= from.slice(0, 10) && mo < to.slice(0, 10))) {
    for (const [subject, members] of bySubject) {
      const byAudience = new Map<string, SubjectMember[]>()
      for (const m of members) {
        const a = String(video.get(m.videoId!)?.audience)
        byAudience.set(a, [...(byAudience.get(a) ?? []), m])
      }
      for (const [audience, ms] of byAudience) {
        const n = subjectMonthVideos(ms, month, new Set(T.occupies[month])).videos.size
        if (n > 0) out.push({ month, audience, subject_id: subject, videos: n })
      }
    }
  }
  return out.sort((a, b) => `${a.month}${a.audience}${a.subject_id}`.localeCompare(`${b.month}${b.audience}${b.subject_id}`))
}

/** Market pooled, as the headline pools it: month → subject → videos. */
function pooled(rows: readonly { month: string; audience: string; subject_id: string; videos: number }[]): Record<string, Record<string, number>> {
  const market = new Set(T.market)
  const out: Record<string, Record<string, number>> = {}
  for (const m of T.months) out[m] = Object.fromEntries(T.subjects.map(([s]) => [s, 0]))
  for (const r of rows) if (market.has(r.audience) && out[String(r.month).slice(0, 10)]) out[String(r.month).slice(0, 10)][r.subject_id] += Number(r.videos)
  return out
}

/** The foreign key's cascade: the fake does not cascade, the database does. */
function cascade(f: FakeAdmin): void {
  const live = new Set(f.tables.audience_insights.map((r) => r.id))
  f.tables.subject_memberships = f.tables.subject_memberships.filter((r) => live.has(r.audience_insight_id))
}

type Order = 'deploy 5' | 'deploy 5b' | 'deploy 5b, the trim out of retries'
async function theRun(order: Order) {
  // The handler runs only once the freeze calls it, by which time `f` is set.
  const f: FakeAdmin = database('none', (p) => subjectReadings(f, String(p.p_from), String(p.p_to)))
  const world = simulatedRun()
  f.tables.videos.push(...world.videos)
  f.tables.audience_insights = world.insights
  f.tables.subject_memberships = world.memberships
  f.tables.pipeline_runs = [RUN_ROW]
  // Staging's real cited set, reached the way citedEvidenceIds reaches it: a
  // recommendation, through its market insight, to the audience insights.
  Object.assign(f.tables, {
    recommendations: [{ id: 'rec-staging', client_id: SEALAND_CLIENT_ID, based_on: { insight_ids: ['mi-staging'] } }],
    market_insights: [{ id: 'mi-staging', client_id: SEALAND_CLIENT_ID, evidence: { supporting_theme_ids: T.cited } }],
    competitive_insights: [], plan_checks: [], plan_check_evaluations: [], agent_messages: [], report_snapshots: [], language_samples: [],
  })
  const phantom = new Set(staleInsightIds(f.tables.videos as never, f.tables.audience_insights as never, new Set(T.cited)))
  const w0 = f.writes.length
  let trim: TrimSummary | null = null
  if (order === 'deploy 5b') trim = await trimStaleMemberships(f.client, SEALAND_CLIENT_ID)
  const trimWrites = f.writes.slice(w0)
  const hold = order === 'deploy 5' ? null : trimFreezeHold(trim)
  const atFreeze = subjectReadings(f, '2026-08-01', '2026-11-01')
  const w1 = f.writes.length
  const summary = await freezeMonths(f.client, {
    clientId: SEALAND_CLIENT_ID, runId: RUN, months: MONTHS, now: FREEZE_AT,
    sides: hold ? [] : [subjectMonthSide(f.client, SEALAND_CLIENT_ID)],
  })
  const freezeWrites = f.writes.slice(w1)
  const stored = freezeWrites.filter((w) => w.table === 'month_subject_readings').flatMap((w) => w.rows) as never[]
  let pruned: Awaited<ReturnType<typeof pruneStaleAnalysis>>
  if (order === 'deploy 5') {
    // Deploy 5's prune: the same function with no membership to hold.
    const kept = f.tables.subject_memberships
    delete f.tables.subject_memberships
    pruned = await pruneStaleAnalysis(f.client, SEALAND_CLIENT_ID)
    f.tables.subject_memberships = kept
  } else pruned = await pruneStaleAnalysis(f.client, SEALAND_CLIENT_ID)
  cascade(f)
  const live = subjectReadings(f, '2026-08-01', '2026-11-01')
  return { f, world, phantom, trim, trimWrites, hold, atFreeze, summary, freezeWrites, stored, pruned, live }
}

/** The videos only a phantom member reached, per month and subject (market
 *  pooled): the reading over every member, less the reading without them. */
function phantomOnly(run: Awaited<ReturnType<typeof theRun>>): Record<string, Record<string, number>> {
  const all = pooled(run.atFreeze)
  const f = run.f
  const kept = f.tables.subject_memberships
  f.tables.subject_memberships = kept.filter((m) => !run.phantom.has(m.audience_insight_id as string))
  const without = pooled(subjectReadings(f, '2026-08-01', '2026-11-01'))
  f.tables.subject_memberships = kept
  return Object.fromEntries(T.months.map((m) => [m, Object.fromEntries(T.subjects.map(([s]) => [s, all[m][s] - without[m][s]]))]))
}

describe('7 · the 4 Oct run on staging\'s own memberships: the stored reading is the live pane set', () => {
  it('the model reads what staging\'s SQL reads: the pane\'s rule over the fixture is monthly_subject_readings, subject for subject, both months', () => {
    const f = database('none')
    f.tables.videos = T.videos.map(([id, run, client, audience]) => ({ id, analyzed_run_id: run, is_client: client === 1, audience }))
    f.tables.audience_insights = T.insights.map(([id, run, video]) => ({ id, run_id: run, source_video_id: video }))
    f.tables.subject_memberships = Object.entries(T.members).flatMap(([subject_id, rows]) => rows.map(([id]) => ({ subject_id, audience_insight_id: id, member: true })))
    const liveSql = pooled(T.live.map(([month, subject_id, audience, videos]) => ({ month, subject_id, audience, videos })))
    expect(pooled(subjectReadings(f, '2026-08-01', '2026-10-01'))).toEqual(liveSql)
    expect(liveSql['2026-09-01']).toMatchObject({ s3: 103, s6: 43 })   // Looks & style, Comfort: the check's numbers
  })

  it('deploy 5\'s order reproduces the defect: the freeze counts phantoms, the prune takes them, the pane reads fewer', async () => {
    const run = await theRun('deploy 5')
    const stored = pooled(run.stored)
    const live = pooled(run.live)
    const only = phantomOnly(run)
    let differ = 0
    for (const m of T.months) for (const [s] of T.subjects) {
      expect(stored[m][s] - live[m][s], `${m} ${s}`).toBe(only[m][s])
      if (stored[m][s] !== live[m][s]) differ++
    }
    expect(differ).toBeGreaterThan(0)
    expect(run.pruned.heldForSubjects).toBe(0)
  })

  it('deploy 5b\'s order: stored equals live in every subject and both months, August frozen, and only the phantom-only videos left the reading', async () => {
    const before = await theRun('deploy 5')
    const run = await theRun('deploy 5b')
    const stored = pooled(run.stored)
    expect(stored).toEqual(pooled(run.live))
    // Per audience too, not only pooled.
    expect(run.stored.map((r: { month: string; audience: string; subject_id: string; videos: number }) => [String(r.month).slice(0, 10), r.audience, r.subject_id, r.videos]).sort())
      .toEqual(run.live.map((r) => [r.month, r.audience, r.subject_id, r.videos]).sort())
    const only = phantomOnly(before)
    const old = pooled(before.stored)
    let removed = 0
    for (const m of T.months) for (const [s] of T.subjects) { expect(old[m][s] - stored[m][s], `${m} ${s}`).toBe(only[m][s]); removed += only[m][s] }
    expect(removed).toBeGreaterThan(0)
    // August closes in this visit, and closes at the live number.
    const august = run.stored.filter((r: { month: string }) => String(r.month).startsWith('2026-08')) as { status: string }[]
    expect(august.length).toBeGreaterThan(0)
    expect(august.every((r) => r.status === 'frozen')).toBe(true)
    // The trim removed exactly the memberships of the prune's rows, and wrote nothing else.
    expect([...new Set(run.trimWrites.map((w) => w.table))]).toEqual(['subject_memberships'])
    expect(new Set(run.trimWrites.flatMap((w) => w.rows.map((r) => r.audience_insight_id)))).toEqual(
      new Set(before.world.memberships.map((m) => m.audience_insight_id as string).filter((id) => run.phantom.has(id))),
    )
    expect(run.trim).toMatchObject({ skipped: null, prunable: run.trim!.prunable })
    expect(run.pruned.heldForSubjects).toBe(0)
    expect(run.pruned.insights).toBe(before.pruned.insights)
  })

  it('nothing else freeze-months writes moves: the other five tables, the panel and the evidence ids are write for write deploy 5\'s', async () => {
    const before = await theRun('deploy 5')
    const run = await theRun('deploy 5b')
    const others = (w: FakeAdmin['writes']) => w.filter((x) => x.table !== 'month_subject_readings')
    expect(others(run.freezeWrites)).toEqual(others(before.freezeWrites))
    const { sides: s5b, ...rest5b } = run.summary
    const { sides: s5, ...rest5 } = before.summary
    expect(rest5b).toEqual(rest5)
    for (const t of Object.keys(s5)) if (t !== 'month_subject_readings') expect(s5b[t], t).toEqual(s5[t])
  })

  it('the trim out of retries: freeze-months writes no subject row, and the prune holds every member, so no reading loses one', async () => {
    const run = await theRun('deploy 5b, the trim out of retries')
    expect(run.hold).toMatch(/^trim-stale-memberships did not finish/)
    expect(run.stored).toEqual([])
    expect(run.summary.sides).not.toHaveProperty('month_subject_readings')
    // Every superseded member stays, so what the months read before the run still resolves.
    expect(pooled(run.live)).toEqual(pooled(run.atFreeze))
    expect(run.pruned.heldForSubjects).toBeGreaterThan(0)
    // The other tables are written as ever.
    expect(run.freezeWrites.some((w) => w.table === 'month_denominators')).toBe(true)
  })

  it('a prune that fails deletes nothing, after a freeze it cannot reach: stored still equals live', async () => {
    const f: FakeAdmin = database('none', (p) => subjectReadings(f, String(p.p_from), String(p.p_to)))
    const world = simulatedRun()
    f.tables.videos.push(...world.videos)
    f.tables.audience_insights = world.insights
    f.tables.subject_memberships = world.memberships
    f.tables.pipeline_runs = [RUN_ROW]
    Object.assign(f.tables, {
      recommendations: [{ id: 'rec-staging', client_id: SEALAND_CLIENT_ID, based_on: { insight_ids: ['mi-staging'] } }],
      market_insights: [{ id: 'mi-staging', client_id: SEALAND_CLIENT_ID, evidence: { supporting_theme_ids: T.cited } }],
      competitive_insights: [], plan_checks: [], agent_messages: [], report_snapshots: [], language_samples: [],
    })
    await trimStaleMemberships(f.client, SEALAND_CLIENT_ID).catch(() => null)   // no plan_check_evaluations: the trim fails too
    await freezeMonths(f.client, { clientId: SEALAND_CLIENT_ID, runId: RUN, months: MONTHS, now: FREEZE_AT, sides: [subjectMonthSide(f.client, SEALAND_CLIENT_ID)] })
    const stored = f.writes.filter((w) => w.table === 'month_subject_readings').flatMap((w) => w.rows) as never[]
    const n = f.tables.audience_insights.length
    await expect(pruneStaleAnalysis(f.client, SEALAND_CLIENT_ID)).rejects.toThrow(/plan_check_evaluations/)
    expect(f.tables.audience_insights.length).toBe(n)
    cascade(f)
    expect(pooled(stored)).toEqual(pooled(subjectReadings(f, '2026-08-01', '2026-11-01')))
  })
})
