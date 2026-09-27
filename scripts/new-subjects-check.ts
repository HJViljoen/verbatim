import { readFileSync } from 'fs'

import { embeddingCoverage } from '../lib/agent/retrieve'
import { chunk, UUID_IN_CHUNK } from '../lib/chunk'
import { SEALAND_CLIENT_ID } from '../lib/config'
import { assertProject, MARKET_FIRST_PROJECTS, parseScriptArgs, type ScriptArgs } from '../lib/ops/market-first-args'
import { isMissingObject } from '../lib/provenance/load'
import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { subjectCalibration } from '../lib/subjects/calibration-state'
import { coverageClears, readBand } from '../lib/subjects/membership'
import {
  JUDGE_VERSION,
  SUBJECT_MIN_COVERAGE,
  TABLE_MONTH_SUBJECT_READINGS,
  TABLE_SUBJECT_MEMBERSHIPS,
  TABLE_SUBJECTS,
  type Subject,
} from '../lib/subjects/types'
import { NEW_SUBJECTS_CAP, parseConfirmedSet } from './new-subjects'

// Did the new subjects land? (market-first plan WP3.1, done-when.) READ-ONLY:
// it writes nothing and takes no --apply. Run after the activation paste, after
// the membership --apply, after the calibration --apply, and after the 25 Oct
// run, which writes their September and October rows before the 1 Nov run
// freezes September.
//
//   node --env-file=.env.local --import tsx scripts/new-subjects-check.ts --project <ref> \
//     [--client <uuid>] [--from-file <confirmed.json>] [--month 2026-10] [--no-coverage]
//
// It reports:
//   - the active count, against the cap of NEW_SUBJECTS_CAP;
//   - embedding coverage, which membership needs at SUBJECT_MIN_COVERAGE (95%)
//     or it refuses (an unembedded insight is invisible to the band);
//   - per active subject: members at the live judge, and, for a subject the
//     file names, the band pairs still undecided (0 when membership is done);
//     its calibration state (ready · provisional · failed, decision C);
//     which of August, September and October hold a row. A subject the file
//     names must hold September and October and must NOT hold August (§9.1 #2:
//     no back-read into a closed month);
//   - the coverage line: of the month's market videos (MF1's
//     market_month_videos, the market's count the pages print), how many carry
//     a comment dated in the month cited by a member insight of any active
//     subject, or are the source of an on-camera-only member insight. The
//     target is over 40% of October (plan §2.3, WP3.1; September read 32% on
//     staging with today's set, subjects-model F47).
//
// THE READ RATION (plan §7.6). It prints the pages it read at the end. The
// coverage line is most of them (chunked `in` reads over the members' evidence
// and comments, about thirty pages on Sealand's production volumes); pass
// --no-coverage for the rest alone.

const NAME = 'new-subjects-check'
/** Plan WP3.1: the Subjects coverage line's target, of the month's market videos. */
export const COVERAGE_TARGET = 0.4

const MONTHS = ['2026-08-01', '2026-09-01', '2026-10-01'] as const

export interface MonthRowsCheck { aug: boolean; sep: boolean; oct: boolean; ok: boolean; words: string }

/** Which of August, September and October hold a row for one subject, and
 *  whether that is right: a new subject needs September and October and no
 *  August; a subject the file does not name is listed, not judged. */
export function monthRowsCheck(months: readonly string[], isNew: boolean): MonthRowsCheck {
  const has = (m: string) => months.includes(m)
  const aug = has(MONTHS[0]), sep = has(MONTHS[1]), oct = has(MONTHS[2])
  const held = [aug && 'Aug', sep && 'Sep', oct && 'Oct'].filter(Boolean).join(' · ') || 'none of Aug, Sep, Oct'
  if (!isNew) return { aug, sep, oct, ok: true, words: `rows: ${held}` }
  const problems = [!sep && 'no September row', !oct && 'no October row', aug && 'an August row (must have none)'].filter(Boolean)
  return { aug, sep, oct, ok: problems.length === 0, words: problems.length === 0 ? `rows: ${held} · OK` : `rows: ${held} · ${problems.join(', ')}` }
}

export interface CoverageInput {
  /** The month's market videos: videos.id, with the platform and platform id
   *  comments join on. */
  market: readonly { id: string; platform: string; videoId: string }[]
  /** Member insights of active subjects, with their source video. */
  insights: readonly { id: string; sourceVideoId: string | null }[]
  /** Evidence rows of those insights. */
  evidence: readonly { insightId: string; source: string; commentId: string | null }[]
  /** The evidence comments dated in the month. */
  comments: readonly { id: string; platform: string; videoId: string }[]
}

/** The market videos any active subject reaches in the month: a cited comment
 *  dated in the month (the month's comments only are passed in), or the
 *  source of an on-camera-only member insight, the video being in the month's
 *  market set (so it carries a dated comment in the month). The same two arms
 *  as monthly_subject_readings, pooled across subjects and audiences. */
export function coveredVideos(input: CoverageInput): Set<string> {
  const byKey = new Map(input.market.map((v) => [`${v.platform}|${v.videoId}`, v.id]))
  const inMarket = new Set(input.market.map((v) => v.id))
  const out = new Set<string>()
  const commentVideo = new Map(input.comments.map((c) => [c.id, `${c.platform}|${c.videoId}`]))
  const commentEvidence = new Set<string>()
  const cameraEvidence = new Set<string>()
  for (const e of input.evidence) {
    if (e.source === 'comment') {
      commentEvidence.add(e.insightId)
      const key = e.commentId ? commentVideo.get(e.commentId) : undefined
      const id = key ? byKey.get(key) : undefined
      if (id) out.add(id)
    } else if (e.source === 'video' || e.source === 'video_text') cameraEvidence.add(e.insightId)
  }
  for (const i of input.insights) {
    if (!cameraEvidence.has(i.id) || commentEvidence.has(i.id)) continue
    if (i.sourceVideoId && inMarket.has(i.sourceVideoId)) out.add(i.sourceVideoId)
  }
  return out
}

/** "412 of 1,030 October market videos (40.0%) · over the 40% target". */
export function coverageLine(covered: number, of: number, monthName: string, target = COVERAGE_TARGET): string {
  if (of <= 0) return `no ${monthName} market videos read yet: the coverage line cannot be drawn`
  const pct = (100 * covered) / of
  const clears = covered / of > target
  return `${covered.toLocaleString('en-GB')} of ${of.toLocaleString('en-GB')} ${monthName} market videos (${pct.toFixed(1)}%) · ` +
    `${clears ? 'over' : 'NOT over'} the ${Math.round(target * 100)}% target`
}

function parseArgs(argv: readonly string[]): ScriptArgs {
  if (argv.includes('--apply')) throw new Error(`${NAME}: read-only; --apply is refused`)
  return parseScriptArgs(argv, { name: NAME, values: ['from-file', 'month'], flags: ['no-coverage'], defaultClient: SEALAND_CLIENT_ID })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(`${NAME}: read-only on ${MARKET_FIRST_PROJECTS[args.project]} ${args.project}, client ${args.clientId} (it writes nothing and takes no --apply)`)
  const month = `${args.values.month ?? '2026-10'}-01`
  if (!/^\d{4}-\d{2}-01$/.test(month)) throw new Error(`${NAME}: --month is YYYY-MM`)
  const monthName = new Date(`${month}T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
  const named = args.values['from-file']
    ? new Set(parseConfirmedSet(JSON.parse(readFileSync(args.values['from-file'], 'utf8'))).subjects
      .filter((s) => s.description).map((s) => s.name.trim().toLowerCase()))
    : new Set<string>()

  const admin = createAdminClient()
  let pages = 0
  const paged = <T>(build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> }) =>
    selectAll<T>(() => { pages++; return build() })
  const problems: string[] = []

  // 1 · the active set
  const subjects = await paged<Subject>(() => admin.from(TABLE_SUBJECTS)
    .select('id, client_id, name, description, origin, source_ref, named_at, status, superseded_by, embedded_at, embed_input_version, calibrated_at, calibration_precision, calibration_n, calibration_judge_version')
    .eq('client_id', args.clientId).eq('status', 'active').order('named_at').order('id'))
  console.log(`\nactive subjects: ${subjects.length} of ${NEW_SUBJECTS_CAP}`)
  if (subjects.length > NEW_SUBJECTS_CAP) problems.push(`${subjects.length} active subjects, over the cap of ${NEW_SUBJECTS_CAP}`)
  for (const n of named) {
    if (!subjects.some((s) => s.name.trim().toLowerCase() === n)) problems.push(`"${n}" is named in the file and is not active`)
  }

  // 2 · embedding coverage
  const cov = await embeddingCoverage(admin, args.clientId)
  pages += 3
  const covPct = cov.total === 0 ? 100 : (100 * cov.embedded) / cov.total
  const covOk = coverageClears(cov)
  console.log(`embedding coverage: ${cov.embedded} of ${cov.total} insights (${covPct.toFixed(1)}%) · ${covOk ? 'clears' : 'BELOW'} ${Math.round(SUBJECT_MIN_COVERAGE * 100)}%`)
  if (!covOk) problems.push('embedding coverage is under 95%: membership refuses until scripts/embed-insights.ts --apply has run')

  // 3 · per subject
  const ids = subjects.map((s) => s.id)
  const monthRows = ids.length === 0 ? [] : await paged<{ subject_id: string; month: string }>(() => admin.from(TABLE_MONTH_SUBJECT_READINGS)
    .select('subject_id, month').eq('client_id', args.clientId).in('subject_id', ids).in('month', [...MONTHS])
    .order('subject_id').order('month').order('audience'))
  console.log(`\njudge ${JUDGE_VERSION}`)
  for (const s of subjects) {
    const isNew = named.has(s.name.trim().toLowerCase())
    const members = await admin.from(TABLE_SUBJECT_MEMBERSHIPS).select('audience_insight_id', { count: 'exact', head: true })
      .eq('client_id', args.clientId).eq('subject_id', s.id).eq('member', true).eq('judge_version', JUDGE_VERSION)
    pages++
    if (members.error) throw new Error(`${NAME}: ${TABLE_SUBJECT_MEMBERSHIPS}: ${members.error.message}`)
    let undecided = ''
    if (isNew) {
      pages++
      const band = await readBand(admin, args.clientId, s.id)
      const open = band.filter((p) => p.band === 'judge').length
      undecided = ` · ${open} band pair(s) undecided`
      if (open > 0) problems.push(`${s.name}: ${open} band pairs undecided (run scripts/subject-membership.ts --apply --subjects "${s.name}")`)
    }
    const state = subjectCalibration(s)
    const precision = s.calibration_precision == null ? 'no check yet' : `${(100 * Number(s.calibration_precision)).toFixed(1)}% on ${s.calibration_n ?? 0} labels`
    const rows = monthRowsCheck([...new Set(monthRows.filter((r) => r.subject_id === s.id).map((r) => String(r.month).slice(0, 10)))], isNew)
    if (!rows.ok) problems.push(`${s.name}: ${rows.words}`)
    if (isNew && !s.calibrated_at) problems.push(`${s.name}: no calibration recorded`)
    console.log(`${isNew ? '* ' : '  '}${s.name}: ${members.count ?? 0} members${undecided} · calibration ${state} (${precision}) · ${rows.words}`)
  }
  if (named.size > 0) console.log('(* named in the file: judged against the WP3.1 done-when)')

  // 4 · the coverage line
  if (!args.flags.has('no-coverage')) {
    let market: { video_id: string }[]
    try {
      market = await paged<{ video_id: string }>(() => admin.rpc('market_month_videos', { p_client: args.clientId, p_month: month }).order('video_id'))
    } catch (e) {
      if (!isMissingObject(e, 'market_month_videos')) throw e
      console.log('\ncoverage line: not measured: MF1 (market_month_videos) is not on this project')
      market = []
    }
    const videos: CoverageInput['market'][number][] = []
    for (const part of chunk(market.map((m) => m.video_id), UUID_IN_CHUNK)) {
      const rows = await paged<{ id: string; platform: string; video_id: string }>(() => admin.from('videos')
        .select('id, platform, video_id').in('id', part).order('id'))
      for (const r of rows) videos.push({ id: r.id, platform: r.platform, videoId: r.video_id })
    }
    const memberRows = ids.length === 0 ? [] : await paged<{ audience_insight_id: string }>(() => admin.from(TABLE_SUBJECT_MEMBERSHIPS)
      .select('audience_insight_id').eq('client_id', args.clientId).eq('member', true).in('subject_id', ids).order('audience_insight_id').order('subject_id'))
    const insightIds = [...new Set(memberRows.map((m) => m.audience_insight_id))]
    const insights: CoverageInput['insights'][number][] = []
    const evidence: CoverageInput['evidence'][number][] = []
    for (const part of chunk(insightIds, UUID_IN_CHUNK)) {
      const ins = await paged<{ id: string; source_video_id: string | null }>(() => admin.from('audience_insights')
        .select('id, source_video_id').in('id', part).order('id'))
      for (const r of ins) insights.push({ id: r.id, sourceVideoId: r.source_video_id })
      const ev = await paged<{ id: string; audience_insight_id: string; source: string; comment_id: string | null }>(() => admin.from('insight_evidence')
        .select('id, audience_insight_id, source, comment_id').in('audience_insight_id', part).order('id'))
      for (const r of ev) evidence.push({ insightId: r.audience_insight_id, source: r.source, commentId: r.comment_id })
    }
    const next = new Date(`${month}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1)
    const commentIds = [...new Set(evidence.filter((e) => e.source === 'comment' && e.commentId).map((e) => e.commentId!))]
    const comments: CoverageInput['comments'][number][] = []
    for (const part of chunk(commentIds, UUID_IN_CHUNK)) {
      const rows = await paged<{ id: string; platform: string; video_id: string }>(() => admin.from('comments')
        .select('id, platform, video_id').in('id', part).gte('comment_date', `${month}T00:00:00Z`).lt('comment_date', next.toISOString()).order('id'))
      for (const r of rows) comments.push({ id: r.id, platform: r.platform, videoId: r.video_id })
    }
    if (market.length > 0) {
      const covered = coveredVideos({ market: videos, insights, evidence, comments })
      const line = coverageLine(covered.size, videos.length, monthName)
      console.log(`\ncoverage line: ${line}`)
      if (covered.size / videos.length <= COVERAGE_TARGET) problems.push(`coverage line under the target: ${line}`)
    } else problems.push(`coverage line not drawn: no ${monthName} market videos on this project`)
  }

  console.log(`\n${problems.length === 0 ? 'PASS' : `FAIL (${problems.length})`}`)
  for (const p of problems) console.log(`  - ${p}`)
  console.log(`read-only: nothing written · ${pages} page(s) read`)
}

if (process.argv[1]?.endsWith('new-subjects-check.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
