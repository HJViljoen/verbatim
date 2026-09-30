import { fmtInt, longMonth } from '../format'
import type { FigureTable } from '../reports/types'
import { POOL_MIN_VIDEOS } from './pool'
import type { ScrubbedWeekRead } from './scrub'
import { standingLine } from './standing'
import { evidenceOf, monthEvidenceOf, sureOf } from './sure'
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
//    at least three DISTINCT lenient-gated videos across them, on evidence the
//    document engine's own rule calls at least reasonable (`calibrateSure`,
//    counted in videos), and on a strict-gated quote left to print. The
//    self-check's contradicted findings, and a finding whose headline or body
//    did not survive the scrub, are held;
//  · the order: by that evidence, largest first, and at most four print. A
//    thin week has fewer, and nothing says so (§0a.2);
//  · every number: the evidence line counts what the finding rests on, the
//    distinct gated videos across EVERY cited candidate this week and the same
//    union over the month to date (T3b), one measure read twice (AGENTS.md's
//    week-against-month rule), never a sum; the context line is T2's code
//    sentence;
//  · the only mark of confidence, "Strong evidence", at the product's line
//    (`CURATION_GATE.confirmedMinVideos`);
//  · the quote (T3b): among the cited candidates' strict-gated, kind-matched
//    options, the one whose insight sits closest to the finding as written
//    (`fit`, lib/written/fit.ts: embeddings of the headline and what it saw
//    against each option's insight). The writer's `quote_from` breaks a tie,
//    and decides alone where no fit could be measured. None is printed twice.

export { evidenceOf, monthEvidenceOf, sureOf } from './sure'

/** The evidence line: what the finding rests on this week, stated again as
 *  its month to date (AGENTS.md: a week is never printed alone). */
export function evidenceLine(n: number, videos: WeekReadFinding['videos'], headline: string, month: string): TokenSentence {
  const name = longMonth(month)
  return {
    body: `[[f${n}_week]] videos this week · [[f${n}_month]] in ${name} so far`,
    figures: {
      [`f${n}_week`]: { label: `videos this week behind the finding "${headline}"`, value: fmtInt(videos.week), kind: 'count' },
      [`f${n}_month`]: { label: `videos in ${name} so far behind the finding "${headline}"`, value: fmtInt(videos.month), kind: 'count' },
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

/** The quotes a candidate may give a finding: its options, or, for a pool
 *  saved before options existed, its listed refs. */
const optionsOf = (c: PoolCandidate): readonly QuoteRef[] => (c.quoteOptions?.length ? c.quoteOptions.map((o) => o.quote) : c.quoteRefs)

/**
 * The finding's quote. Every option of the cited candidates, best fit first
 * where `fit` scored them (ref → similarity; an unscored option ranks after
 * every scored one); ties, and every option where nothing was scored, in the
 * writer's order: `preferred` (its `quote_from`) first, then the cited in
 * their order, each candidate's options in its own. The first ref not
 * printed yet on a thread not heard yet, else the first not printed yet, else
 * none. Marks what it takes as used.
 */
export function pickFindingQuote(
  preferred: PoolCandidate | null,
  cited: readonly PoolCandidate[],
  used: { refs: Set<string>; threads: Set<string> },
  fit: ReadonlyMap<string, number> | null = null,
): QuoteRef | null {
  const order = preferred ? [preferred, ...cited.filter((c) => c !== preferred)] : [...cited]
  const seen = new Set<string>()
  const options: QuoteRef[] = []
  for (const c of order) for (const q of optionsOf(c)) if (!seen.has(q.ref)) { seen.add(q.ref); options.push(q) }
  const score = (q: QuoteRef): number => fit?.get(q.ref) ?? Number.NEGATIVE_INFINITY
  const ranked = fit && fit.size > 0
    ? options.map((q, i) => ({ q, i, s: score(q) })).sort((a, b) => (b.s === a.s ? 0 : b.s > a.s ? 1 : -1) || a.i - b.i).map((x) => x.q)
    : options
  const take = (q: QuoteRef): QuoteRef => {
    used.refs.add(q.ref)
    if (q.thread) used.threads.add(q.thread)
    return q
  }
  const fresh = ranked.find((q) => !used.refs.has(q.ref) && !(q.thread && used.threads.has(q.thread)))
  if (fresh) return take(fresh)
  const unused = ranked.find((q) => !used.refs.has(q.ref))
  return unused ? take(unused) : null
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
  /** How well each quote option fits each written finding: the finding's
   *  index in the writer's output → quote ref → similarity
   *  (lib/written/fit.ts). Absent or empty: the writer's order decides. */
  fit?: ReadonlyMap<number, ReadonlyMap<string, number>>
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
    const videos = { week: j.evidence, month: monthEvidenceOf(j.cited) }
    const sure = sureOf(j.cited.length, videos.week, videos.week)
    if (!sure) { held.push({ reason: `below reasonable: ${j.evidence} videos`, headline: j.f.headline }); continue }
    if (findings.length >= WEEK_FINDINGS_MAX) { held.push({ reason: `past the first ${WEEK_FINDINGS_MAX} findings`, headline: j.f.headline }); continue }
    const asked = j.f.quote_from ? byId.get(j.f.quote_from.trim().toUpperCase()) ?? null : null
    const preferred = asked && j.cited.includes(asked) ? asked : null
    // Every finding prints a real quote (plan: "each with a real quote").
    const quote = pickFindingQuote(preferred, j.cited, usedQuotes, a.fit?.get(j.i) ?? null)
    if (!quote) { held.push({ reason: 'no quote left to print', headline: j.f.headline }); continue }
    const n = findings.length + 1
    const evidence = evidenceLine(n, videos, j.f.headline, month)
    // The finding's subject: the one its candidates name, where they name one.
    // Two subjects (a price finding resting on a comfort theme too) name
    // neither: "Part of Comfort" would misplace it.
    const named = [...new Set(j.cited.map((c) => c.subjectId).filter((x): x is string => Boolean(x)))]
    const subjectId = named.length === 1 ? named[0] : null
    const isNew = j.cited.every((c) => c.isNew)
    const context = contextLine(subjectId ? subjectOf.get(subjectId) : null, isNew, month)
    Object.assign(figures, evidence.figures, context.figures)
    const forLines: Partial<Record<Department, string>> = {}
    for (const d of DEPARTMENTS) if (j.f.for[d]?.trim()) forLines[d] = j.f.for[d].trim()
    findings.push({
      headline: j.f.headline,
      saw: j.f.saw,
      means: j.f.means,
      for: forLines,
      basedOn: j.cited.map((c) => c.themeId),
      quote,
      videos,
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
