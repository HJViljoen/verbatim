import { writeFileSync } from 'node:fs'

import { chunk } from '../lib/chunk'
import {
  KIND_SET,
  TOP_THEMES,
  baselineStateOf,
  topThemesByBaseline,
  weekVsBaseline,
  type DenominatorSeries,
  type PreRegisteredObject,
} from '../lib/reading/anomaly'
import {
  completeWeeksBefore,
  monthStartOf,
  monthsBetween,
  readDenominators,
  readThemeReadings,
  trailingCompleteMonths,
  windowOf,
} from '../lib/reading/monthly'
import type { DenominatorReading } from '../lib/reading/types'
import { SHARE_BAND } from '../lib/report-bands'
import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { categoryLabel } from '../lib/voice-tiles'

// Back-read coverage, and the anomaly check replayed over the weeks that
// already exist (Phase 0 WP4, design items 37 and 40 + §9.20, 2026-09-15).
//
// TWO QUESTIONS, ONE SCRIPT, READ-ONLY THROUGHOUT.
//
//   1. How much history clears the floor? Per tenant, per audience, per
//      calendar month dated by when the COMMENT was written: how many months
//      carried at least 100 videos, and how many carried at least 100 comments.
//      The product's floor is videos (SHARE_BAND.minN, 100 a side); comments are
//      printed beside them because the same month reads "too little data" or
//      "plenty" depending only on which noun you count, and nobody should
//      discover that later.
//
//   2. Would the anomaly check ever have said anything? The rule in
//      lib/reading/anomaly.ts, replayed week by week over the complete ISO weeks
//      behind today, with the flags it would have raised counted. The design
//      asks for exactly this measurement before the weekly report ships: "if the
//      answer is zero over a quarter, section 1 is a sentence and a coverage
//      line, not a check".
//
// IT CANNOT RUN UNTIL THE WP3 MIGRATION IS APPLIED. Every number here comes
// from monthly_denominators / monthly_theme_readings — the two SQL functions in
// supabase/migrations/20260915092000_monthly_reading.sql, which is authored and
// NOT yet applied. Until it lands this script exits with that sentence rather
// than a stack trace, and the 2026-09 edition of the report was produced by
// running those two function bodies as plain SELECTs through the Supabase MCP.
//
// THE DENOMINATOR THE CHECK USES. Every object is a share of the whole update's
// comment-dated slice — every audience together — because that is the n the
// design's own arithmetic uses ("an update's window holds about 117 videos in
// total… a trailing baseline of ~1,100"; Össur's Jun–Aug slice is 1,089). The
// per-audience baselines are reported too, because the readiness page prints
// one per audience and the category audience is the only one that ever clears.
//
// THE KIND MIX IS READ IN THIS PROCESS, not by an RPC: there is no SQL function
// for it. The chain is the one monthly_theme_readings uses, with "an insight of
// this kind" in place of "a member of this theme" — insight → comment evidence →
// dated comment → its analysed video. When Phase 1 gives the kind mix a loader,
// this read should go.
//
// WHAT IT NEVER DOES: write anything, call a model, or spend a cent.
//
//   node --env-file=.env.local --import tsx scripts/coverage-report.ts \
//     [--client <uuid>] [--weeks 11] [--out path/to/report.md] [--ignore-baseline-floor]

interface Args {
  clientId: string | null
  weeks: number
  out: string | null
  ignoreBaselineFloor: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { clientId: null, weeks: 11, out: null, ignoreBaselineFloor: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--weeks') args.weeks = Number(argv[++i])
    else if (argv[i] === '--out') args.out = argv[++i]
    // The second question, never a shipped reading: what the band alone would
    // have said if the three-month baseline rule were waived. It says how much
    // of a zero is the floor and how much is the correction.
    else if (argv[i] === '--ignore-baseline-floor') args.ignoreBaselineFloor = true
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  if (!Number.isInteger(args.weeks) || args.weeks < 1) throw new Error('--weeks takes a positive whole number')
  return args
}

/** The name of the denominator every pre-registered object shares. */
const SLICE = 'every audience together'

const pct = (k: number, n: number): string => (n > 0 ? `${((k / n) * 100).toFixed(1)}%` : '—')

const sum = (ns: Iterable<number>): number => {
  let total = 0
  for (const n of ns) total += n
  return total
}

// ---- Reads -------------------------------------------------------------------

interface KindCitation {
  category: string
  videoUuid: string
  /** The comment's date, `YYYY-MM-DD`. */
  date: string
}

/**
 * Every (kind, dated comment, analysed video) the current insights cite, in one
 * window — the kind mix's raw material.
 *
 * `audience_insights_current` is the population read the AGENTS.md rule asks
 * for: "all current insights", never a run filter. The comment carries the date
 * and names the video, exactly as the theme reading does, so a kind and a theme
 * are counted the same way and their shares are comparable.
 */
async function readKindCitations(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  window: { from: string; to: string },
): Promise<KindCitation[]> {
  const insights = await selectAll<{ id: string; category: string | null }>(() =>
    admin.from('audience_insights_current').select('id, category').eq('client_id', clientId).order('id', { ascending: true }),
  )
  const categoryOf = new Map(insights.map((i) => [i.id, i.category ?? 'uncategorised']))

  const videos = await selectAll<{ id: string; platform: string; video_id: string }>(() =>
    admin
      .from('videos')
      .select('id, platform, video_id')
      .eq('client_id', clientId)
      .not('analyzed_run_id', 'is', null)
      .order('id', { ascending: true }),
  )
  const videoOf = new Map(videos.map((v) => [`${v.platform}|${v.video_id}`, v.id]))

  const comments = await selectAll<{ id: string; platform: string; video_id: string; comment_date: string | null }>(() =>
    admin
      .from('comments')
      .select('id, platform, video_id, comment_date')
      .eq('client_id', clientId)
      .gte('comment_date', window.from)
      .lt('comment_date', window.to)
      .order('id', { ascending: true }),
  )
  const commentOf = new Map(comments.map((c) => [c.id, c]))

  const out: KindCitation[] = []
  const seen = new Set<string>()
  for (const part of chunk([...categoryOf.keys()], 100)) {
    const rows = await selectAll<{ audience_insight_id: string; comment_id: string | null }>(() =>
      admin
        .from('insight_evidence')
        .select('audience_insight_id, comment_id')
        .eq('source', 'comment')
        .in('audience_insight_id', part)
        .order('id', { ascending: true }),
    )
    for (const r of rows) {
      if (!r.comment_id) continue
      const comment = commentOf.get(r.comment_id)
      if (!comment?.comment_date) continue
      const videoUuid = videoOf.get(`${comment.platform}|${comment.video_id}`)
      if (!videoUuid) continue
      const category = categoryOf.get(r.audience_insight_id)
      if (!category) continue
      const key = `${category}|${videoUuid}|${comment.comment_date.slice(0, 10)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ category, videoUuid, date: comment.comment_date.slice(0, 10) })
    }
  }
  return out
}

/** Distinct videos per kind inside `[from, to)`. */
function kindVideos(citations: readonly KindCitation[], from: string, to: string): Map<string, number> {
  const perKind = new Map<string, Set<string>>()
  for (const c of citations) {
    const at = `${c.date}T00:00:00.000Z`
    if (at < from || at >= to) continue
    const set = perKind.get(c.category) ?? new Set<string>()
    set.add(c.videoUuid)
    perKind.set(c.category, set)
  }
  return new Map([...perKind].map(([k, v]) => [k, v.size]))
}

// ---- Shaping -----------------------------------------------------------------

/** Videos per audience in a set of denominator rows, months summed. */
function perAudience(rows: readonly DenominatorReading[]): Map<string, { videos: number; comments: number }> {
  const out = new Map<string, { videos: number; comments: number }>()
  for (const r of rows) {
    const prev = out.get(r.audience) ?? { videos: 0, comments: 0 }
    out.set(r.audience, { videos: prev.videos + r.videos, comments: prev.comments + r.comments })
  }
  return out
}

interface MonthlyCoverage {
  audience: string
  monthsWithAny: number
  monthsVideos: number
  monthsComments: number
  firstMonth: string
  lastMonth: string
  biggestVideos: number
  biggestComments: number
}

/** Question 1: how many months clear each floor, per audience. */
function coverage(rows: readonly DenominatorReading[], floor: number): MonthlyCoverage[] {
  const byAudience = new Map<string, DenominatorReading[]>()
  for (const r of rows) byAudience.set(r.audience, [...(byAudience.get(r.audience) ?? []), r])
  return [...byAudience.entries()]
    .map(([audience, months]) => ({
      audience,
      monthsWithAny: months.length,
      monthsVideos: months.filter((m) => m.videos >= floor).length,
      monthsComments: months.filter((m) => m.comments >= floor).length,
      firstMonth: months.map((m) => monthStartOf(m.month)).sort()[0].slice(0, 7),
      lastMonth: months.map((m) => monthStartOf(m.month)).sort().at(-1)!.slice(0, 7),
      biggestVideos: Math.max(...months.map((m) => m.videos)),
      biggestComments: Math.max(...months.map((m) => m.comments)),
    }))
    .sort((a, b) => a.audience.localeCompare(b.audience))
}

/** The slice — every audience together — as its own month series. */
function sliceMonths(rows: readonly DenominatorReading[]): Map<string, { videos: number; comments: number }> {
  const out = new Map<string, { videos: number; comments: number }>()
  for (const r of rows) {
    const month = monthStartOf(r.month)
    const prev = out.get(month) ?? { videos: 0, comments: 0 }
    out.set(month, { videos: prev.videos + r.videos, comments: prev.comments + r.comments })
  }
  return out
}

// ---- The report --------------------------------------------------------------

async function main() {
  const { clientId, weeks: weekCount, out, ignoreBaselineFloor } = parseArgs(process.argv.slice(2))
  const options = ignoreBaselineFloor ? { requireBaselineMonths: 0 } : undefined
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const lines: string[] = []
  const say = (s = '') => {
    lines.push(s)
    console.log(s)
  }

  const { data: clients, error: clientErr } = await admin
    .from('clients')
    .select('id, company_name')
    .order('created_at', { ascending: true })
  if (clientErr) throw new Error(`clients: ${clientErr.message}`)
  const tenants = (clients ?? []).filter((c) => !clientId || c.id === clientId)
  if (tenants.length === 0) throw new Error(clientId ? `no client ${clientId}` : 'no clients')

  const weeks = completeWeeksBefore(now, weekCount)
  say(`# Coverage and the anomaly check, ${now.slice(0, 10)}`)
  say()
  say(
    `Read-only. The floor is ${SHARE_BAND.minN} videos a side (the product's own share band), ` +
    `and the same months are counted again at ${SHARE_BAND.minN} comments so the difference is visible. ` +
    `Weeks ${weeks[0].label} to ${weeks.at(-1)!.label}.` +
    (ignoreBaselineFloor
      ? ' **The three-month baseline rule is waived in this run** — the band is drawn whenever both sides clear their own floors, which is not what a shipped reading does.'
      : ''),
  )

  for (const tenant of tenants) {
    const id = tenant.id as string
    const name = tenant.company_name as string
    say()
    say(`## ${name}`)

    const { data: latest } = await admin
      .from('theme_observations')
      .select('run_id, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
    const runId = ((latest ?? [])[0] as { run_id: string } | undefined)?.run_id ?? null

    const { data: earliestRows } = await admin
      .from('comments')
      .select('comment_date')
      .eq('client_id', id)
      .not('comment_date', 'is', null)
      .order('comment_date', { ascending: true })
      .limit(1)
    const earliest = (earliestRows ?? [])[0]?.comment_date as string | undefined
    if (!earliest) {
      say()
      say('No dated comments yet — nothing to measure.')
      continue
    }

    const history = windowOf(monthsBetween(earliest, now))!
    const months = await readDenominators(admin, id, history)

    // ---- Question 1: months clearing the floor ----
    say()
    say(`### Months of history clearing the floor, by audience`)
    say()
    say('| Audience | Months with any conversation | Months ≥ 100 videos | Months ≥ 100 comments | First → last | Biggest month (videos / comments) |')
    say('|---|---|---|---|---|---|')
    for (const row of coverage(months, SHARE_BAND.minN)) {
      say(
        `| ${row.audience} | ${row.monthsWithAny} | **${row.monthsVideos}** | ${row.monthsComments} | ` +
        `${row.firstMonth} → ${row.lastMonth} | ${row.biggestVideos} / ${row.biggestComments} |`,
      )
    }

    // ---- The baselines, as at today ----
    const trailing = trailingCompleteMonths(now, 3)
    const slice = sliceMonths(months)
    const audiences = [...new Set(months.map((m) => m.audience))].sort()
    const seriesNow: DenominatorSeries[] = [
      ...audiences.map((audience) => ({
        name: audience,
        weekVideos: 0,
        months: trailing.map((month) => ({
          month,
          videos: months.find((m) => monthStartOf(m.month) === month && m.audience === audience)?.videos ?? 0,
        })),
      })),
      { name: SLICE, weekVideos: 0, months: trailing.map((month) => ({ month, videos: slice.get(month)?.videos ?? 0 })) },
    ]
    say()
    say(`### The anomaly check's baseline today (${trailing.map((m) => m.slice(0, 7)).join(', ')})`)
    say()
    say('| Audience | Videos per month | State |')
    say('|---|---|---|')
    for (const s of seriesNow) {
      const state = baselineStateOf(s, SHARE_BAND)
      say(`| ${s.name} | ${s.months.map((m) => m.videos).join(' · ')} | ${state.label} |`)
    }

    // ---- Question 2: the replay ----
    const replayFrom = trailingCompleteMonths(weeks[0].from, 3)[0]
    const citations = await readKindCitations(admin, id, { from: `${replayFrom}T00:00:00.000Z`, to: weeks.at(-1)!.to })
    const rivals = await trackedRivals(admin, id)
    const themeMonths = runId
      ? await readThemeReadings(admin, id, runId, { from: `${replayFrom}T00:00:00.000Z`, to: weeks.at(-1)!.to })
      : []
    // Labels are decoration: theme identity is the registry id and labels churn
    // ~88% run to run, so nothing here keys on one.
    const themeLabels = new Map<string, string>()
    if (themeMonths.length > 0) {
      const rows = await selectAll<{ id: string; canonical_label: string | null }>(() =>
        admin.from('theme_registry').select('id, canonical_label').eq('client_id', id).order('id', { ascending: true }),
      )
      for (const r of rows) themeLabels.set(r.id, r.canonical_label ?? '(unlabelled)')
    }
    // One pass per window rather than one per kind per window.
    const kindsByMonth = new Map<string, Map<string, number>>()
    for (const month of monthsBetween(`${replayFrom}T00:00:00.000Z`, weeks.at(-1)!.to)) {
      kindsByMonth.set(month, kindVideos(citations, `${month}T00:00:00.000Z`, nextMonthInstant(month)))
    }

    say()
    say('### What the anomaly check would have said, week by week')
    say()
    say(
      `Pre-registered each week: the ${KIND_SET.length} insight kinds, ${rivals.length} tracked ` +
      `${rivals.length === 1 ? 'rival' : 'rivals'}, the ${TOP_THEMES} themes with the largest share in that week's ` +
      'baseline, and 0 subjects (none exist yet).',
    )
    say()
    say('| Week | Videos in the week | Baseline | Objects tested | Flags |')
    say('|---|---|---|---|---|')

    const flagDetail: string[] = []
    const notes: string[] = []
    for (const week of weeks) {
      const weekRows = await readDenominators(admin, id, { from: week.from, to: week.to })
      const weekByAudience = perAudience(weekRows)
      const weekSlice = sum([...weekByAudience.values()].map((v) => v.videos))
      const baselineMonths = trailingCompleteMonths(week.from, 3)

      const sliceSeries: DenominatorSeries = {
        name: SLICE,
        weekVideos: weekSlice,
        months: baselineMonths.map((month) => ({ month, videos: slice.get(month)?.videos ?? 0 })),
      }

      const kindsThisWeek = kindVideos(citations, week.from, week.to)
      const set: PreRegisteredObject[] = KIND_SET.map((kind) => ({
        kind: 'kind' as const,
        id: kind,
        label: categoryLabel(kind),
        denominator: SLICE,
        weekVideos: kindsThisWeek.get(kind) ?? 0,
        months: baselineMonths.map((month) => ({ month, videos: kindsByMonth.get(month)?.get(kind) ?? 0 })),
      }))

      for (const rival of rivals) {
        const audience = `competitor:${rival}`
        set.push({
          kind: 'rival',
          id: audience,
          label: `${rival} — share of the conversation`,
          denominator: SLICE,
          weekVideos: weekByAudience.get(audience)?.videos ?? 0,
          months: baselineMonths.map((month) => ({
            month,
            videos: months.find((m) => monthStartOf(m.month) === month && m.audience === audience)?.videos ?? 0,
          })),
        })
      }

      if (runId) {
        const weekThemes = await readThemeReadings(admin, id, runId, { from: week.from, to: week.to })
        const baselinePerTheme = new Map<string, Map<string, number>>()
        for (const t of themeMonths) {
          const month = monthStartOf(t.month)
          if (!baselineMonths.includes(month)) continue
          const per = baselinePerTheme.get(t.theme_id) ?? new Map<string, number>()
          per.set(month, (per.get(month) ?? 0) + t.videos)
          baselinePerTheme.set(t.theme_id, per)
        }
        const weekPerTheme = new Map<string, number>()
        for (const t of weekThemes) weekPerTheme.set(t.theme_id, (weekPerTheme.get(t.theme_id) ?? 0) + t.videos)
        const ranked = topThemesByBaseline(
          [...baselinePerTheme.entries()].map(([themeId, per]) => ({ id: themeId, baselineVideos: sum(per.values()), per })),
        )
        for (const theme of ranked) {
          set.push({
            kind: 'theme',
            id: theme.id,
            label: themeLabels.get(theme.id) ?? theme.id.slice(0, 8),
            denominator: SLICE,
            weekVideos: weekPerTheme.get(theme.id) ?? 0,
            months: baselineMonths.map((month) => ({ month, videos: theme.per.get(month) ?? 0 })),
          })
        }
      }

      const reading = weekVsBaseline({ week: week.label, denominators: [sliceSeries], set, options })
      const state = reading.baselines[0]
      say(
        `| ${week.label} (${week.from.slice(0, 10)}) | ${weekSlice} | ${state.label} | ` +
        `${reading.tested} of ${reading.setSize} | ${reading.flags.length} |`,
      )
      for (const flag of reading.flags) {
        flagDetail.push(
          `- **${week.label} · ${flag.label}** — ${flag.weekVideos} of ${flag.weekTotal} videos this week ` +
          `(${pct(flag.weekVideos, flag.weekTotal)}) against ${flag.baselineVideos} of ${flag.baselineTotal} ` +
          `(${pct(flag.baselineVideos, flag.baselineTotal)}) across ${flag.denominator === SLICE ? 'the three months behind it' : flag.denominator}; ` +
          `moved ${flag.verdict!.change} points on a band of ${flag.verdict!.band}.`,
        )
      }
      const lastInstant = new Date(new Date(week.to).getTime() - 1).toISOString()
      if (week.from.slice(0, 7) !== lastInstant.slice(0, 7)) {
        notes.push(
          `- ${week.label} crosses a month boundary. The reading groups by calendar month, so this week's ` +
          'figure is its two month-parts added together and a video carrying comments on both sides of the ' +
          'boundary is counted in each.',
        )
      }
    }

    say()
    if (flagDetail.length === 0) say('Nothing unusual in any week read.')
    else for (const line of flagDetail) say(line)
    if (notes.length > 0) {
      say()
      for (const line of notes) say(line)
    }
  }

  if (out) {
    writeFileSync(out, `${lines.join('\n')}\n`)
    console.log(`\nwritten to ${out}`)
  }
}

/** The rival names a tenant tracks, in configuration order. */
async function trackedRivals(admin: ReturnType<typeof createAdminClient>, clientId: string): Promise<string[]> {
  const { data, error } = await admin.from('tracking_configs').select('competitor_names').eq('client_id', clientId).maybeSingle()
  if (error) throw new Error(`tracking_configs: ${error.message}`)
  return ((data?.competitor_names as string[] | null) ?? []).filter((n) => n && n.trim().length > 0)
}

const nextMonthInstant = (month: string): string => {
  const d = new Date(`${month}T00:00:00.000Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString()
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e)
  if (/monthly_denominators|monthly_theme_readings/.test(message)) {
    console.error(
      'This report reads the two monthly-reading SQL functions, and they are not in the database yet.\n' +
      'Apply supabase/migrations/20260915092000_monthly_reading.sql first (WP12 step 1), then re-run.\n' +
      `(${message})`,
    )
    process.exit(1)
  }
  console.error(e)
  process.exit(1)
})
