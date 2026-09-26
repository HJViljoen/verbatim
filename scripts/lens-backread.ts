import type { SupabaseClient } from '@supabase/supabase-js'

import { readBrands, brandReadingRows, mergeBrandRows, pooledBrandMonth, storedBrandRows, writeBrandRows, type IdentityRow, type Tracking } from '../lib/brands/readings'
import type { Candidate } from '../lib/brands/mentions'
import { SEALAND_CLIENT_ID } from '../lib/config'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import {
  isMissingObject, readKeywordRows, readMonthComments, readMonthVideos, readProvenanceTable, readRuns, readVerdicts, readVideos, type Pages,
} from '../lib/provenance/load'
import { measureContext, pairRead } from '../lib/provenance/measure'
import { isOutside, unchangedSearches, type MonthVideo } from '../lib/provenance/searches'
import {
  lensCalls, lensRowsOf, lensSizeLine, LENS_TABLE, mergeLensRows, pooledLensVideos, storedLensRows, writeLensRows,
  type LensReadingRow, type LensVideo,
} from '../lib/reading/lens'
import { denominatorKey, nextMonth } from '../lib/reading/monthly'
import type { LensRow } from '../lib/reading/recheck'
import { segmentRulesEnabled } from '../lib/segments/rules'
import { createAdminClient, selectAll } from '../lib/supabase-admin'

// The one back-read (market-first plan WP3.3 and WP3.5; decision K's single
// later chance for the new lens and brand tables): every lens of
// month_lens_readings and every brand of month_brand_readings, for the months
// that CLOSED before the tables existed, June to September. Heinrich's paste,
// Tue 10 to Thu 12 Nov, after the 8 Nov run's parity checks; from then on the
// run's lens-readings and brand-readings steps keep every month.
//
// CLOSED MONTHS ONLY. A month is read back only when every one of its
// month_denominators rows is frozen; a filling month is the run's to write.
//
// PINNED TO WHAT THE MONTH HELD WHEN IT FROZE: comments first captured before
// the month's frozen_at (lens_readings' p_captured_before; for brands, the
// comment mentions and the market's videos are cut the same way), and the
// themes of the run that froze it. The readings behind a count (a kind, a
// subject membership) are today's: the small residual drift from insights
// re-read since is stated once on the page.
//
// A lens row is written only for an object the main tables hold for that
// audience-month (plan WP3.3), and a brand row only for an audience the month's
// denominators hold.
//
// ONCE. It refuses, before it writes anything, when any (month, audience, lens)
// or brand audience-month it would write is already held: "already held". The
// database refuses the same (month_lens_frozen_insert_guard, MF3; the month
// tables' insert guard on month_brand_readings), so a second --apply is
// refused either way.
//
// READ-ONLY BY DEFAULT, and it never prompts (it runs through `!`). It prints
// each lens-month's size, and under 100 a count, never a share (the August
// buyer lens: about 91, decision F).
//   --project <ref>   required; allow-listed, and the URL must be its (host check)
//   --confirm         required to read production (a timed probe first)
//   --months <from:to>  default 2026-06:2026-09 (inclusive, YYYY-MM)
//   --only lens|brands  one table only
//   --apply           write
//
//   cd ~/Documents/code/verbatim-mf-run && … node --env-file=.env.local --import tsx scripts/lens-backread.ts \
//     --project mkwjlckescdveosvrvaq --confirm [--months 2026-06:2026-09] [--apply]

const NAME = 'lens-backread'
const PRODUCTION = 'mkwjlckescdveosvrvaq'
const PROBE_MAX_MS = 3000
const SEGMENT_CHUNK = 500

const monthStart = (m: string): string => `${m.slice(0, 7)}-01`
function monthsIn(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = monthStart(from); m <= monthStart(to); m = nextMonth(m)) out.push(m)
  return out
}

interface ClosedMonth {
  month: string
  /** When its denominators froze (the latest audience's): the capture cut. */
  frozenAt: string
  /** The run whose clustering its theme rows froze under, or null. */
  themeRun: string | null
  /** The main tables' object keys per audience ('<audience>|<kind>|<id>'). */
  objects: Set<string>
  audiences: Set<string>
}

async function closedMonth(admin: SupabaseClient, clientId: string, month: string): Promise<ClosedMonth | { refused: string }> {
  const den = await selectAll<{ audience: string; status: string; frozen_at: string | null; videos: number; comments: number }>(() =>
    admin.from('month_denominators').select('audience, status, frozen_at, videos, comments').eq('client_id', clientId).eq('month', month).order('audience'))
  if (den.length === 0) return { refused: 'no denominator row: nothing to read back' }
  if (den.some((d) => d.status !== 'frozen' || !d.frozen_at)) return { refused: 'not closed: a filling month is the run\'s to write' }
  const frozenAt = den.map((d) => d.frozen_at as string).sort().at(-1) as string
  const objects = new Set<string>()
  for (const d of den) { objects.add(`${d.audience}|denominator|videos`); objects.add(`${d.audience}|denominator|comments`) }
  const readSide = async (table: string, col: string, kind: string) => {
    try {
      const rows = await selectAll<Record<string, string>>(() => admin.from(table).select(`audience, ${col}` as '*').eq('client_id', clientId).eq('month', month).order('audience').order(col) as unknown as { range: (a: number, b: number) => PromiseLike<{ data: Record<string, string>[] | null; error: unknown }> })
      for (const r of rows) objects.add(`${r.audience}|${kind}|${r[col]}`)
    } catch (e) {
      if (!/schema cache|does not exist|Could not find/i.test(e instanceof Error ? e.message : String(e))) throw e
    }
  }
  await readSide('month_subject_readings', 'subject_id', 'subject')
  await readSide('month_kind_readings', 'kind', 'kind')
  const themes = await selectAll<{ audience: string; theme_id: string; run_id: string | null }>(() =>
    admin.from('month_theme_readings').select('audience, theme_id, run_id').eq('client_id', clientId).eq('month', month).order('audience').order('theme_id'))
  for (const t of themes) objects.add(`${t.audience}|theme|${t.theme_id}`)
  const runs = new Map<string, number>()
  for (const t of themes) if (t.run_id) runs.set(t.run_id, (runs.get(t.run_id) ?? 0) + 1)
  const themeRun = [...runs].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  // Mood rides month_audience_stats: an audience with a stats row holds its five mood objects.
  try {
    const stats = await selectAll<{ audience: string }>(() => admin.from('month_audience_stats').select('audience').eq('client_id', clientId).eq('month', month).order('audience'))
    for (const s of stats) for (const m of ['positive', 'negative', 'neutral', 'mixed', 'framing']) objects.add(`${s.audience}|mood|${m}`)
  } catch (e) {
    if (!/schema cache|does not exist|Could not find/i.test(e instanceof Error ? e.message : String(e))) throw e
  }
  return { month, frozenAt, themeRun, objects, audiences: new Set(den.map((d) => d.audience)) }
}

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME, values: ['months', 'only'], flags: ['confirm'], defaultClient: SEALAND_CLIENT_ID,
  })
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  if (args.project === PRODUCTION && !args.flags.has('confirm')) {
    throw new Error(`${NAME}: reading production needs --confirm (it probes first and keeps to the read ration). Nothing read.`)
  }
  const only = args.values.only ?? null
  if (only && only !== 'lens' && only !== 'brands') throw new Error(`${NAME}: --only takes lens or brands`)
  const [from, to] = (args.values.months ?? '2026-06:2026-09').split(':').map((m) => monthStart(m.trim()))
  if (!/^\d{4}-\d{2}-01$/.test(from) || !/^\d{4}-\d{2}-01$/.test(to) || from > to) throw new Error(`${NAME}: --months takes <from YYYY-MM>:<to YYYY-MM>`)
  console.log(modeLine(args, NAME))
  const admin = createAdminClient()
  if (args.project === PRODUCTION) {
    const t0 = Date.now()
    const { error } = await admin.from('clients').select('id').eq('id', args.clientId).limit(1)
    const ms = Date.now() - t0
    if (error) throw new Error(`${NAME}: the probe failed (${error.message}). Back off 15 minutes.`)
    console.log(`  probe: ${ms} ms`)
    if (ms > PROBE_MAX_MS) throw new Error(`${NAME}: the probe took ${ms} ms (over ${PROBE_MAX_MS}). Back off 15 minutes (plan §7.6).`)
  }
  const now = new Date().toISOString()
  const months: ClosedMonth[] = []
  for (const m of monthsIn(from, to)) {
    const c = await closedMonth(admin, args.clientId, m)
    if ('refused' in c) { console.log(`  ${m.slice(0, 7)}: skipped (${c.refused})`); continue }
    console.log(`  ${m.slice(0, 7)}: closed, frozen at ${c.frozenAt}, themes of run ${c.themeRun ?? '(none)'}`)
    months.push(c)
  }
  if (months.length === 0) { console.log('nothing to read back'); return }

  // ONCE: anything already held refuses the whole apply, before a write.
  const heldLens = only === 'brands' ? [] : await storedLensRows(admin, args.clientId, months.map((m) => m.month))
  if (heldLens == null) throw new Error(`${NAME}: ${LENS_TABLE} is not on ${args.project}: apply MF3 first. Nothing written.`)
  const heldBrands = only === 'lens' ? [] : await storedBrandRows(admin, args.clientId, months.map((m) => m.month))
  if (heldBrands == null) throw new Error(`${NAME}: month_brand_readings is not on ${args.project}: apply MF3 first. Nothing written.`)
  const heldLines = [
    ...[...new Set(heldLens.map((h) => `${h.month.slice(0, 7)} ${h.audience} lens ${h.lens}`))],
    ...[...new Set(heldBrands.map((h) => `${h.month.slice(0, 7)} ${h.audience} brands`))],
  ]
  if (heldLines.length > 0) {
    console.log(`  already held: ${heldLines.slice(0, 12).join(' · ')}${heldLines.length > 12 ? ` · and ${heldLines.length - 12} more` : ''}`)
    if (args.apply) throw new Error(`${NAME}: REFUSED: already held. The one back-read has been made for these months; nothing written.`)
  }

  // The same-searches lens and the brands' organic base read the provenance.
  const pages: Pages = { n: 0 }
  const [videos, verdicts, keywordRows, runs] = await Promise.all([
    readVideos(admin, args.clientId, pages), readVerdicts(admin, args.clientId, pages), readKeywordRows(admin, args.clientId, pages), readRuns(admin, args.clientId, pages),
  ])
  const provenance = await readProvenanceTable(admin, args.clientId, pages)
  const ctx = measureContext({ clientId: args.clientId, now, changes: [], videos, verdicts, keywordRows, runs, provenance })
  const keyOf = new Map(videos.map((v) => [v.id, `${v.platform}\u0000${v.video_id}`]))

  const lensWrites: LensReadingRow[] = []
  let brandPlan: { fresh: ReturnType<typeof brandReadingRows>; months: string[] } = { fresh: [], months: [] }
  for (const c of months) {
    const set = await readMonthVideos(admin, args.clientId, c.month, pages)
    if (!set) throw new Error(`${NAME}: market_month_videos is not on ${args.project}: MF1 is not applied. Nothing written.`)
    // Pinned: a video counts when it holds a comment dated in the month and
    // first captured before the month froze.
    const comments = await readMonthComments(admin, args.clientId, c.month, pages)
    const pinnedKeys = new Set(comments.filter((x) => x.created_at < c.frozenAt).map((x) => `${x.platform}\u0000${x.video_id}`))
    const pinned: MonthVideo[] = set.filter((v) => pinnedKeys.has(keyOf.get(v.id) ?? ''))

    if (only !== 'brands') {
      const segments = new Map<string, LensVideo['segment']>()
      if (segmentRulesEnabled(args.clientId)) {
        const ids = pinned.map((v) => v.id)
        for (let i = 0; i < ids.length; i += SEGMENT_CHUNK) {
          const { data, error } = await admin.rpc('segments_for_videos', { p_client: args.clientId, p_video_ids: ids.slice(i, i + SEGMENT_CHUNK) })
          if (error) throw new Error(`${NAME}: segments_for_videos: ${error.message}`)
          for (const r of (data ?? []) as { video_id: string; segment: string }[]) segments.set(r.video_id, r.segment === 'maker' || r.segment === 'noise' ? r.segment : 'market')
        }
      }
      const { lastGather } = pairRead({ ...ctx, now: c.frozenAt }, c.month)
      const prevStart = `${new Date(Date.UTC(Number(c.month.slice(0, 4)), Number(c.month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10)}T00:00:00.000Z`
      const unchanged = lastGather ? unchangedSearches(ctx.gathers, prevStart, lastGather.runId) : null
      const lensVideos: LensVideo[] = pinned.map((v) => ({
        id: v.id, dated: v.dated, segment: segments.get(v.id) ?? 'market', insideSearches: unchanged ? !isOutside(v, ctx.evidence.get(v.id), unchanged) : false,
      }))
      for (const call of lensCalls(c.month, lensVideos, { withSegments: segmentRulesEnabled(args.clientId), withSearches: unchanged != null })) {
        if (call.ids && call.ids.length === 0) { console.log(`    ${lensSizeLine(call.lens, c.month, 0)}`); continue }
        let rows: LensRow[]
        try {
          rows = await selectAll<LensRow>(() => admin.rpc('lens_readings', {
            p_client: args.clientId, p_month: c.month, p_run: c.themeRun, p_video_ids: call.ids, p_min_dated_comments: call.minDated, p_captured_before: c.frozenAt,
          }).order('audience').order('object_kind').order('object_id'))
        } catch (e) {
          if (isMissingObject(e, 'lens_readings')) throw new Error(`${NAME}: lens_readings is not on ${args.project}: MF2 is not applied. Nothing written.`)
          throw e
        }
        const lensRows = lensRowsOf(args.clientId, c.month, call.lens, rows).filter((r) => c.objects.has(`${r.audience}|${r.object_kind}|${r.object_id}`))
        console.log(`    ${lensSizeLine(call.lens, c.month, pooledLensVideos(lensRows))}`)
        lensWrites.push(...lensRows)
      }
    }

    if (only !== 'lens') {
      const window = { from: c.month, to: nextMonth(c.month) }
      const read = await readBrands(args.clientId, scriptBrandIO(admin, args.clientId, window, pinned), window)
      if (!read) { console.log('    no brand rules for this client: no brand rows'); continue }
      // Pinned: a comment mention counts only for a comment first captured before the freeze.
      const commentIds = [...new Set(read.plan.mentions.filter((m) => m.row.source === 'comment' && m.row.comment_id).map((m) => m.row.comment_id as string))]
      const captured = new Map<string, string>()
      for (let i = 0; i < commentIds.length; i += 100) {
        const rows = await selectAll<{ id: string; created_at: string }>(() => admin.from('comments').select('id, created_at').eq('client_id', args.clientId).in('id', commentIds.slice(i, i + 100)).order('id'))
        for (const r of rows) captured.set(r.id, r.created_at)
      }
      const counted = (m: { row: { source: string; comment_id: string | null } }) => m.row.source !== 'comment' || (captured.get(m.row.comment_id ?? '') ?? '9999') < c.frozenAt
      const rows = brandReadingRows(args.clientId, read, counted).filter((r) => r.month === c.month && c.audiences.has(r.audience))
      for (const b of read.brands) {
        const p = pooledBrandMonth(rows, c.month, b.brandKey)
        console.log(`    ${c.month.slice(0, 7)} · ${b.rule.brand}: ${p.k_any} of ${p.n}${p.n < 100 ? ' (a count, too few to read)' : ''}; without its own searches ${p.k_organic} of ${p.n_organic}`)
      }
      brandPlan = { fresh: [...brandPlan.fresh, ...rows], months: [...brandPlan.months, c.month] }
    }
  }

  const closed = months.flatMap((c) => [...c.audiences].map((a) => denominatorKey({ month: c.month, audience: a })))
  const lensMerged = mergeLensRows({ months: months.map((m) => m.month), fresh: lensWrites, stored: [], now, runId: null, closedAudienceMonths: closed })
  const brandMerged = mergeBrandRows({ months: brandPlan.months, fresh: brandPlan.fresh, stored: [], now, runId: null, closedAudienceMonths: closed })
  console.log(`\n  planned: ${lensMerged.writes.length} lens rows and ${brandMerged.writes.length} brand rows, every one frozen and read back`)
  if (!args.apply) {
    console.log(`read-only: nothing written · reads: ${pages.n} pages and the month reads`)
    return
  }
  const lens = only === 'brands' ? { written: 0 } : await writeLensRows(admin, args.clientId, lensMerged)
  const brands = only === 'lens' ? { written: 0 } : await writeBrandRows(admin, args.clientId, brandMerged)
  console.log(`APPLIED: ${lens.written} lens rows, ${brands.written} brand rows (back_read, frozen)`)
}

/** The brand read's reads for a pinned month: the market is the pinned set. */
function scriptBrandIO(admin: SupabaseClient, clientId: string, window: { from: string; to: string }, pinned: readonly MonthVideo[]) {
  const idCols = 'id, platform, video_id, source, account_name, is_client, is_competitor, competitor_name'
  return {
    engine: 'are' as const,
    tracking: async (): Promise<Tracking> => {
      const base = 'competitor_names, competitor_keywords, competitor_handles, own_handles, brand_keywords'
      const first = await admin.from('tracking_configs').select(`${base}, watched_brands`).eq('client_id', clientId).maybeSingle()
      if (!first.error && first.data) return first.data as Tracking
      const { data, error } = await admin.from('tracking_configs').select(base).eq('client_id', clientId).maybeSingle()
      if (error || !data) throw new Error(`${NAME}: tracking_configs: ${error?.message ?? 'no row'}`)
      return data as Tracking
    },
    competitors: async () => {
      const { data, error } = await admin.from('competitors').select('id, name, retired_at').eq('client_id', clientId)
      if (error) throw new Error(`${NAME}: competitors: ${error.message}`)
      return (data ?? []) as { id: string; name: string; retired_at: string | null }[]
    },
    candidates: async (pattern: string) => {
      const rows = await selectAll<Candidate>(() => admin.rpc('brand_mention_candidates', { p_client: clientId, p_pattern: pattern, p_from: window.from, p_to: window.to })
        .order('video_id').order('source').order('field').order('comment_id'))
      return rows.map((r) => ({ ...r, comment_month: r.comment_month ? String(r.comment_month).slice(0, 10) : null }))
    },
    ownedVideos: () => selectAll<IdentityRow>(() => admin.from('videos').select(idCols).eq('client_id', clientId).in('source', ['owned', 'competitor_owned']).order('id')),
    videosById: (ids: readonly string[]) => selectAll<IdentityRow>(() => admin.from('videos').select(idCols).eq('client_id', clientId).in('id', [...ids]).order('id')),
    monthVideos: async (m: string) => (m === window.from ? [...pinned] : null),
    firstTerms: async (ids: readonly string[]) => {
      const out = new Map<string, string[]>()
      try {
        for (let i = 0; i < ids.length; i += 100) {
          const rows = await selectAll<{ video_id: string; first_terms: string[] }>(() => admin.from('video_provenance')
            .select('video_id, first_terms').eq('client_id', clientId).in('video_id', ids.slice(i, i + 100)).order('video_id'))
          for (const r of rows) out.set(r.video_id, r.first_terms)
        }
      } catch (e) {
        if (isMissingObject(e, 'video_provenance')) return null
        throw e
      }
      return out
    },
  }
}

if (process.argv[1]?.endsWith('lens-backread.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
