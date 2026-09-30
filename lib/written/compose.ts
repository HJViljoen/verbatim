import { fmtInt, longMonth } from '../format'
import type { FigureTable } from '../reports/types'
import { POOL_MIN_VIDEOS } from './pool'
import type { ScrubbedWeekRead } from './scrub'
import { standingLine } from './standing'
import { evidenceOf, sureOf } from './sure'
import {
  DEPARTMENTS, type Department, type PoolCandidate, type QuoteRef, type StandingFact, type TokenSentence,
  type WeekPool, type WeekReadData, type WeekReadFinding, type WeekReadStanding,
} from './types'
import { WEEK_FINDINGS_MAX, WEEK_READ_PROMPT_VERSION, type WriterSubject } from './write'

// From the scrubbed writer's output to the stored read (plan T3). Pure.
//
// CODE OWNS EVERYTHING BUT THE SENTENCES:
//  · which findings exist: a finding rests on the candidates it cites that
//    exist (`based_on` resolved; an invented id is dropped, never thrown), on
//    at least three DISTINCT gated videos across them, and on evidence the
//    document engine's own rule calls at least reasonable (`calibrateSure`,
//    counted in videos). The self-check's contradicted findings, and a finding
//    whose headline or body did not survive the scrub, are held;
//  · the order: by that evidence, largest first, and at most four print. A
//    thin week has fewer, and nothing says so (§0a.2);
//  · every number: the evidence line is the lead candidate's week and its
//    month to date, one object read twice (AGENTS.md's week-against-month
//    rule), and the context line is T2's code sentence;
//  · the only mark of confidence, "Strong evidence", at the product's line
//    (`CURATION_GATE.confirmedMinVideos`);
//  · the quote: from the candidate the writer named where it cited it, else
//    the strongest cited candidate; its refs are already kind-matched and
//    strict-gated (T1), and none is printed twice.

export { evidenceOf, sureOf } from './sure'

/** The evidence line: the lead candidate's week, stated again as its
 *  contribution to the month (AGENTS.md: a week is never printed alone). */
export function evidenceLine(n: number, lead: Pick<PoolCandidate, 'label' | 'weekVideos' | 'monthK'>, month: string): TokenSentence {
  const name = longMonth(month)
  return {
    body: `[[f${n}_week]] videos this week · [[f${n}_month]] in ${name} so far`,
    figures: {
      [`f${n}_week`]: { label: `videos this week in which people talked about "${lead.label}"`, value: fmtInt(lead.weekVideos), kind: 'count' },
      [`f${n}_month`]: { label: `videos in ${name} so far in which people talked about "${lead.label}"`, value: fmtInt(lead.monthK), kind: 'count' },
    },
  }
}

/**
 * The context line: where the finding sits in the long run. Its subject's
 * standing line, where the subject prints one ("Part of Comfort: [[…]] of
 * [[…]] videos in your market in September, the fourth biggest subject."),
 * and the product's own flag words where every candidate it rests on was
 * first heard this month ("First heard in September."). Either, both, or
 * nothing: a subject that prints no level adds nothing, and nothing says why.
 */
export function contextLine(subject: StandingFact | null | undefined, isNew: boolean, month: string): TokenSentence {
  const parts: string[] = []
  let figures: FigureTable = {}
  if (subject) {
    const line = standingLine(subject, month)
    if (line.body) {
      parts.push(`Part of ${subject.name}: ${line.body}`)
      figures = line.figures
    }
  }
  if (isNew) parts.push(`First heard in ${longMonth(month)}.`)
  return { body: parts.join(' '), figures }
}

/** The finding's quote: from `preferred` where given, else the cited in their
 *  order (strongest first), the first ref not printed yet, a thread not heard
 *  yet where there is one. Marks what it takes as used. */
export function pickFindingQuote(
  preferred: PoolCandidate | null,
  cited: readonly PoolCandidate[],
  used: { refs: Set<string>; threads: Set<string> },
): QuoteRef | null {
  const order = preferred ? [preferred, ...cited.filter((c) => c !== preferred)] : [...cited]
  const take = (q: QuoteRef): QuoteRef => {
    used.refs.add(q.ref)
    if (q.thread) used.threads.add(q.thread)
    return q
  }
  for (const c of order) {
    const q = c.quoteRefs.find((r) => !used.refs.has(r.ref) && !(r.thread && used.threads.has(r.thread)))
    if (q) return take(q)
  }
  for (const c of order) {
    const q = c.quoteRefs.find((r) => !used.refs.has(r.ref))
    if (q) return take(q)
  }
  return null
}

export interface ComposeWeekArgs {
  pool: WeekPool
  standing: readonly StandingFact[]
  /** The writer's output after scrub, or null where no call was made (a thin
   *  week). */
  written: ScrubbedWeekRead | null
  /** The subjects the writer was shown, by handle. */
  subjects: readonly WriterSubject[]
  /** The table the writer was offered (`writerFigures`). */
  writerFigures: FigureTable
  /** The self-check's contradicted headlines (as scrubbed), with what the
   *  conversation says instead where the check said. */
  contradicted?: ReadonlyMap<string, string | null>
  model: string
  costUsd: number
}

type Held = WeekReadData['held'][number]

/** The stored read. Pure. */
export function composeWeekRead(a: ComposeWeekArgs): WeekReadData {
  const { pool } = a
  const month = pool.month
  const byId = new Map(pool.candidates.map((c) => [c.id.toUpperCase(), c]))
  const orderOf = new Map(pool.candidates.map((c, i) => [c.id.toUpperCase(), i]))
  const held: Held[] = []

  // Resolve and judge each written finding.
  const judged: { i: number; f: ScrubbedWeekRead['findings'][number]; cited: PoolCandidate[]; evidence: number }[] = []
  for (const [i, f] of (a.written?.findings ?? []).entries()) {
    const headline = f.headline.trim()
    if (!headline) { held.push({ reason: 'no headline survived the scrub', headline: '' }); continue }
    const ids = [...new Set((f.based_on ?? []).map((x) => String(x).trim().toUpperCase()))].filter((x) => byId.has(x))
    const cited = ids.sort((x, y) => (orderOf.get(x) ?? 0) - (orderOf.get(y) ?? 0)).map((x) => byId.get(x)!)
    if (cited.length === 0) { held.push({ reason: 'rests on no candidate', headline }); continue }
    if (a.contradicted?.has(headline)) {
      const theySay = a.contradicted.get(headline)
      held.push({ reason: theySay ? `the conversation contradicts it: ${theySay}` : 'the conversation contradicts it', headline })
      continue
    }
    if (!f.saw.trim()) { held.push({ reason: 'nothing it saw survived the scrub', headline }); continue }
    const evidence = evidenceOf(cited)
    if (evidence < POOL_MIN_VIDEOS) { held.push({ reason: `too thin: ${evidence} videos`, headline }); continue }
    judged.push({ i, f, cited, evidence })
  }

  // Order by the evidence, then the strands, then as written; the same
  // evidence twice prints once; at most four.
  judged.sort((x, y) => y.evidence - x.evidence || y.cited.length - x.cited.length || x.i - y.i)
  const seenSets = new Set<string>()
  const kept: typeof judged = []
  for (const j of judged) {
    const key = j.cited.map((c) => c.themeId).sort().join('|')
    if (seenSets.has(key)) { held.push({ reason: 'rests on the same evidence as another finding', headline: j.f.headline }); continue }
    seenSets.add(key)
    kept.push(j)
  }

  const figures: FigureTable = { ...a.writerFigures }
  const usedQuotes = { refs: new Set<string>(), threads: new Set<string>() }
  const subjectOf = new Map(a.standing.map((f) => [f.subjectId, f]))
  const findings: WeekReadFinding[] = []
  for (const j of kept) {
    const lead = j.cited[0]
    const sure = sureOf(j.cited.length, j.evidence, lead.weekVideos)
    if (!sure) { held.push({ reason: `below reasonable: ${j.evidence} videos`, headline: j.f.headline }); continue }
    if (findings.length >= WEEK_FINDINGS_MAX) { held.push({ reason: `past the first ${WEEK_FINDINGS_MAX} findings`, headline: j.f.headline }); continue }
    const n = findings.length + 1
    const evidence = evidenceLine(n, lead, month)
    // The finding's subject: the one its candidates name, where they name one.
    // Two subjects (a price finding resting on a comfort theme too) name
    // neither: "Part of Comfort" would misplace it.
    const named = [...new Set(j.cited.map((c) => c.subjectId).filter((x): x is string => Boolean(x)))]
    const subjectId = named.length === 1 ? named[0] : null
    const isNew = j.cited.every((c) => c.isNew)
    const context = contextLine(subjectId ? subjectOf.get(subjectId) : null, isNew, month)
    Object.assign(figures, evidence.figures, context.figures)
    const asked = j.f.quote_from ? byId.get(j.f.quote_from.trim().toUpperCase()) ?? null : null
    const preferred = asked && j.cited.includes(asked) ? asked : null
    const forLines: Partial<Record<Department, string>> = {}
    for (const d of DEPARTMENTS) if (j.f.for[d]?.trim()) forLines[d] = j.f.for[d].trim()
    findings.push({
      headline: j.f.headline,
      saw: j.f.saw,
      means: j.f.means,
      for: forLines,
      basedOn: j.cited.map((c) => c.themeId),
      quote: pickFindingQuote(preferred, j.cited, usedQuotes),
      videos: { week: lead.weekVideos, month: lead.monthK },
      subjectId,
      isNew,
      sure,
      evidence: evidence.body,
      context: context.body,
    })
  }

  // Where the market stands: every tracked subject, in the standing's order.
  const sentenceOf = new Map<string, string>()
  const handleOf = new Map(a.subjects.map((s) => [s.handle.toUpperCase(), s.fact.subjectId]))
  for (const s of a.written?.standing ?? []) {
    const id = handleOf.get(String(s.subject_id).trim().toUpperCase())
    if (id && s.sentence.trim() && !sentenceOf.has(id)) sentenceOf.set(id, s.sentence.trim())
  }
  const standing: WeekReadStanding[] = a.standing.map((f) => {
    const line = standingLine(f, month)
    Object.assign(figures, line.figures)
    return {
      subjectId: f.subjectId,
      sentence: f.calibration === 'failed' ? '' : sentenceOf.get(f.subjectId) ?? '',
      name: f.name,
      calibration: f.calibration,
      rung: f.rung,
      line: line.body,
      quote: f.calibration === 'failed' ? null : f.quoteRef,
    }
  })

  return {
    version: 1,
    window: pool.window,
    month,
    // The In short sums up the findings; with none printed it has nothing
    // true to sum up.
    inShort: findings.length > 0 ? (a.written?.in_short ?? '').trim() : '',
    findings,
    standing,
    figures,
    held,
    model: a.model,
    promptVersion: WEEK_READ_PROMPT_VERSION,
    costUsd: a.costUsd,
  }
}
