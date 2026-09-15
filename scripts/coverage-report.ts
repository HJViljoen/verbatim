import { writeFileSync } from 'node:fs'

import {
  KIND_SET,
  TOP_THEMES,
  baselineStateOf,
  preRegisteredSet,
  weekVsBaseline,
  type DenominatorSeries,
  type PreRegisteredObject,
} from '../lib/reading/anomaly'
import { SLICE, coverage, sliceMonths } from '../lib/reading/coverage'
import {
  completeWeeksBefore,
  monthStartOf,
  monthsBetween,
  readDenominators,
  readKindReadings,
  readThemeReadings,
  readWindowDenominators,
  readWindowKindReadings,
  readWindowThemeReadings,
  trailingCompleteMonths,
  windowOf,
} from '../lib/reading/monthly'
import { readSubjectMonths, readSubjectWindow } from '../lib/subjects/read'
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
// IT CANNOT RUN UNTIL THE MIGRATIONS ARE APPLIED. Every number here comes from
// the month and window SQL functions — 20260915092000_monthly_reading.sql
// (applied to production 2026-09-15), and 20260918092000 / 093000 / 094000,
// which are authored and NOT yet applied. Until they land this script exits
// with that sentence rather than a stack trace, and the 2026-09 edition of the
// report was produced by running the function bodies as plain SELECTs through
// the Supabase MCP.
//
// THE DENOMINATOR THE CHECK USES. Every object is a share of the whole update's
// comment-dated slice — every audience together — because that is the n the
// design's own arithmetic uses ("an update's window holds about 117 videos in
// total… a trailing baseline of ~1,100"; Össur's Jun–Aug slice is 1,089). The
// per-audience baselines are reported too, because the readiness page prints
// one per audience and the category audience is the only one that ever clears.
//
// EVERY WEEK IS READ, INCLUDING THE ONES THAT CROSS A MONTH. Until WP8 they
// were not: both month functions group by calendar month, so a week spanning
// two months came back as two rows and adding them counted a video with
// comments on both sides twice — Össur's week 36 is 290 distinct videos and 372
// added up, 28% high — and a denominator that wrong is worse than a gap. The
// window functions (20260918092000 and M4/M5's siblings) group by the WINDOW,
// so the week is one row per audience and the count is distinct. That recovers
// 3 of every 11 weeks here and about 3 of every 13 updates in the pipeline.
//
// THE KIND MIX HAS A LOADER NOW, and this script uses it. It used to be read in
// this process, because there was no SQL function for it — and that read was
// the COMMENT HALF only, with no arm for a member whose evidence is spoken on
// camera, so a theme's numerator could hold a video a kind's never could.
// monthly_kind_readings / window_kind_readings carry both arms and the two are
// commensurable; the in-process read is gone.
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

const pct = (k: number, n: number): string => (n > 0 ? `${((k / n) * 100).toFixed(1)}%` : '—')

const sum = (ns: Iterable<number>): number => {
  let total = 0
  for (const n of ns) total += n
  return total
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
    const rivals = await trackedRivals(admin, id)

    // ---- Question 1: months clearing the floor ----
    say()
    say(`### Months of history clearing the floor, by audience`)
    say()
    say('| Audience | Months with any conversation | Months ≥ 100 videos | Months ≥ 100 comments | First → last | Biggest month (videos / comments) |')
    say('|---|---|---|---|---|---|')
    for (const row of coverage(months, SHARE_BAND.minN, rivals.map((r) => `competitor:${r}`))) {
      const span = row.firstMonth ? `${row.firstMonth} → ${row.lastMonth}` : '—'
      const biggest = row.monthsWithAny > 0 ? `${row.biggestVideos} / ${row.biggestComments}` : 'no videos in any month'
      say(
        `| ${row.audience} | ${row.monthsWithAny} | **${row.monthsVideos}** | ${row.monthsComments} | ` +
        `${span} | ${biggest} |`,
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
    const replayWindow = { from: `${replayFrom}T00:00:00.000Z`, to: weeks.at(-1)!.to }
    const themeMonths = runId ? await readThemeReadings(admin, id, runId, replayWindow) : []
    const kindMonths = await readKindReadings(admin, id, replayWindow)
    const subjectMonths = await readSubjectMonths(admin, id, replayWindow)
    // Labels are decoration: theme identity is the registry id and labels churn
    // ~88% run to run, so nothing here keys on one.
    const themeLabels = new Map<string, string>()
    if (themeMonths.length > 0) {
      const rows = await selectAll<{ id: string; canonical_label: string | null }>(() =>
        admin.from('theme_registry').select('id, canonical_label').eq('client_id', id).order('id', { ascending: true }),
      )
      for (const r of rows) themeLabels.set(r.id, r.canonical_label ?? '(unlabelled)')
    }
    const subjectLabels = new Map<string, string>()
    if (subjectMonths.length > 0) {
      const rows = await selectAll<{ id: string; name: string }>(() =>
        admin.from('subjects').select('id, name').eq('client_id', id).order('id', { ascending: true }),
      )
      for (const r of rows) subjectLabels.set(r.id, r.name)
    }
    const perMonth = <T extends { month: string; videos: number }>(rows: readonly T[], idOf: (r: T) => string) => {
      const out = new Map<string, Map<string, number>>()
      for (const r of rows) {
        const month = monthStartOf(r.month)
        const per = out.get(idOf(r)) ?? new Map<string, number>()
        per.set(month, (per.get(month) ?? 0) + r.videos)
        out.set(idOf(r), per)
      }
      return out
    }
    const kindsByObject = perMonth(kindMonths, (r) => r.kind)
    const subjectsByObject = perMonth(subjectMonths, (r) => r.subject_id)
    const themesByObject = perMonth(themeMonths, (r) => r.theme_id)

    say()
    say('### What the anomaly check would have said, week by week')
    say()
    say(
      `Pre-registered each week: the ${KIND_SET.length} insight kinds, ${rivals.length} tracked ` +
      `${rivals.length === 1 ? 'rival' : 'rivals'}, ${subjectLabels.size} ` +
      `${subjectLabels.size === 1 ? 'subject' : 'subjects'}, and the themes among the top ${TOP_THEMES} of that ` +
      "week's baseline whose share could imply ten of their own videos in a typical week (decision S's trim). " +
      'Every week is read: the window functions count a crossing week correctly.',
    )
    say()
    say('| Week | Videos in the week | Baseline | Set (kept / ranked themes trimmed) | Objects tested | Flags |')
    say('|---|---|---|---|---|---|')

    const flagDetail: string[] = []
    const notes: string[] = []
    for (const week of weeks) {
      const weekRows = await readWindowDenominators(admin, id, week)
      const weekByAudience = new Map(weekRows.map((r) => [r.audience, r]))
      const weekSlice = sum(weekRows.map((r) => r.videos))
      const baselineMonths = trailingCompleteMonths(week.from, 3)

      const sliceSeries: DenominatorSeries = {
        name: SLICE,
        weekVideos: weekSlice,
        months: baselineMonths.map((month) => ({ month, videos: slice.get(month)?.videos ?? 0 })),
      }

      const [weekKinds, weekSubjects, weekThemes] = await Promise.all([
        readWindowKindReadings(admin, id, week),
        readSubjectWindow(admin, id, week),
        runId ? readWindowThemeReadings(admin, id, runId, week) : Promise.resolve([]),
      ])
      const pool = <T extends { videos: number }>(rows: readonly T[], idOf: (r: T) => string) => {
        const out = new Map<string, number>()
        for (const r of rows) out.set(idOf(r), (out.get(idOf(r)) ?? 0) + r.videos)
        return out
      }
      const kindWeek = pool(weekKinds, (r) => r.kind)
      const subjectWeek = pool(weekSubjects, (r) => r.subject_id)
      const themeWeek = pool(weekThemes, (r) => r.theme_id)
      const monthsOf = (per: Map<string, number> | undefined) =>
        baselineMonths.filter((m) => per?.has(m)).map((month) => ({ month, videos: per?.get(month) ?? 0 }))

      const candidates: PreRegisteredObject[] = KIND_SET.map((kind) => ({
        kind: 'kind' as const,
        id: kind,
        label: categoryLabel(kind),
        denominator: SLICE,
        weekVideos: kindWeek.get(kind) ?? 0,
        months: monthsOf(kindsByObject.get(kind)),
      }))

      for (const rival of rivals) {
        const audience = `competitor:${rival}`
        candidates.push({
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

      for (const [subjectId, label] of subjectLabels) {
        candidates.push({
          kind: 'subject',
          id: subjectId,
          label,
          denominator: SLICE,
          weekVideos: subjectWeek.get(subjectId) ?? 0,
          months: monthsOf(subjectsByObject.get(subjectId)),
        })
      }

      // Every theme with a baseline is a candidate; the ranking takes the top
      // TOP_THEMES and the trim then drops the ones whose share could never
      // reach ten of their own videos in a typical week. Both decisions read
      // the baseline alone, so the set is still fixed before the week is seen.
      for (const [themeId, per] of themesByObject) {
        const monthsHere = monthsOf(per)
        if (monthsHere.length === 0) continue
        candidates.push({
          kind: 'theme',
          id: themeId,
          label: themeLabels.get(themeId) ?? themeId.slice(0, 8),
          denominator: SLICE,
          weekVideos: themeWeek.get(themeId) ?? 0,
          months: monthsHere,
        })
      }

      const registration = preRegisteredSet({ denominators: [sliceSeries], candidates })
      const reading = weekVsBaseline({ week: week.label, denominators: [sliceSeries], set: registration.set, options })
      const state = reading.baselines[0]
      say(
        `| ${week.label} (${week.from.slice(0, 10)}) | ${weekSlice} | ${state.label} | ` +
        `${registration.set.length} kept / ${registration.trimmed.length} of ${registration.ranked} trimmed | ` +
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
    }

    say()
    if (flagDetail.length === 0) say('Nothing unusual in any week.')
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

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e)
  if (/monthly_\w+|window_\w+_readings|window_denominators/.test(message)) {
    console.error(
      'This report reads the month and window SQL functions, and at least one of them is not in the\n' +
      'database yet. Apply 20260915092000_monthly_reading.sql, then 20260918092000_reading_windows.sql,\n' +
      '20260918093000_subjects.sql and 20260918094000_kind_mood_attention.sql, then re-run.\n' +
      `(${message})`,
    )
    process.exit(1)
  }
  console.error(e)
  process.exit(1)
})
