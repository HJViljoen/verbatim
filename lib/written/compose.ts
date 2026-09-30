import { fmtInt, longMonth } from '../format'
import type { FigureTable } from '../reports/types'
import { POOL_MIN_VIDEOS } from './pool'
import type { ScrubbedWeekRead } from './scrub'
import { standingLine } from './standing'
import { quoteValue } from './substance'
import { evidenceOf, monthEvidenceOf, sureOf } from './sure'
import {
  firstHeardThisWeek,
  type HeldSection, type PoolCandidate, type QuoteOption, type QuoteRef, type StandingFact, type TokenSentence,
  type WeekMarketFigures, type WeekPool, type WeekReadDataV2, type WeekReadFinding, type WeekReadHeld,
  type WeekReadImplication, type WeekReadNewItem, type WeekReadParagraph, type WeekReadStanding, type WeekReadWatchItem,
} from './types'
import { WEEK_FINDINGS_MAX, WEEK_READ_MAX, WEEK_READ_PROMPT_VERSION, type WriterSubject } from './write'

// From the scrubbed writer's output to the stored read (plan T3; v3 30 Sep).
// Pure.
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
//    sentence; the market's week and month (v3) are the pool's;
//  · the only mark of confidence, "Strong evidence", at the product's line
//    (`CURATION_GATE.confirmedMinVideos`);
//  · every quote: among the cited candidates' strict-gated, kind-matched
//    options, the one whose insight sits closest to the finding as written
//    (`fit`, lib/written/fit.ts) PLUS how much the quote says on its own
//    (v3, lib/written/substance.ts: a self-contained claim over a bare
//    question or a line that opens mid-reply). The writer's `quote_from`
//    breaks a tie, and decides alone where nothing could be scored. None is
//    printed twice, findings first, then the story's.
//
// THE REPORT (v3) RESTS ON WHAT PRINTS. The story's paragraphs, the
// implications and the watch lines each cite candidates; one that rests on no
// candidate backing a printed finding or a printed "new this week" line is
// held, so the report never tells a story about evidence the findings below it
// do not carry. "New this week" is code's to decide: a candidate the writer
// names prints there only where it was first heard this week
// (`firstHeardThisWeek`). The week's one line is held where the self-check
// contradicts it or the scrub took it, and the top finding's headline stands
// in. With no finding printed, the whole report is empty: nothing is sent.

export { evidenceOf, monthEvidenceOf, sureOf } from './sure'

/** An evidence line: what a finding (or a first-heard conversation) rests on
 *  this week, stated again as its month to date (AGENTS.md: a week is never
 *  printed alone). `key` names its figures (`f1` → `f1_week`, `f1_month`);
 *  `about` is what the label says they are behind. */
export function evidenceLine(key: string, videos: { week: number; month: number }, about: string, month: string): TokenSentence {
  const name = longMonth(month)
  return {
    body: `[[${key}_week]] videos this week · [[${key}_month]] in ${name} so far`,
    figures: {
      [`${key}_week`]: { label: `videos this week behind ${about}`, value: fmtInt(videos.week), kind: 'count' },
      [`${key}_month`]: { label: `videos in ${name} so far behind ${about}`, value: fmtInt(videos.month), kind: 'count' },
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

/**
 * The market's figures as the stored table prints them (the Dashboard's):
 * `market_week_videos`, `market_week_comments`, `market_month_videos`,
 * `market_month_comments`, each only where it was read.
 */
export function marketFigureTable(m: WeekMarketFigures | null | undefined, month: string): FigureTable {
  const out: FigureTable = {}
  if (!m) return out
  const name = longMonth(month)
  const put = (key: string, label: string, v: number | null) => {
    if (v != null && Number.isFinite(v)) out[key] = { label, value: fmtInt(v), kind: 'count' }
  }
  put('market_week_videos', 'videos in your market this week', m.week.videos)
  put('market_week_comments', 'comments in your market this week', m.week.comments)
  put('market_month_videos', `videos in your market in ${name} so far`, m.month.videos)
  put('market_month_comments', `comments in your market in ${name} so far`, m.month.comments)
  return out
}

type Option = Pick<QuoteOption, 'quote' | 'substance'>

/** The quotes a candidate may give a finding: its options, or, for a pool
 *  saved before options existed, its listed refs. */
const optionsOf = (c: PoolCandidate): readonly Option[] =>
  c.quoteOptions?.length ? c.quoteOptions : c.quoteRefs.map((quote) => ({ quote }))

/**
 * Options best first. Where a fit was measured: by the fit plus the quote's
 * substance (`quoteValue`), every unscored option after every scored one.
 * Where none was: by substance alone. Ties keep the order given. Pure.
 */
export function rankOptions<T extends Option>(options: readonly T[], fit: ReadonlyMap<string, number> | null): T[] {
  const measured = fit != null && fit.size > 0
  return options
    .map((o, i) => {
      const f = fit?.get(o.quote.ref)
      return { o, i, scored: !measured || f != null, v: quoteValue(f, o.substance) }
    })
    .sort((a, b) => Number(b.scored) - Number(a.scored) || (b.v === a.v ? 0 : b.v > a.v ? 1 : -1) || a.i - b.i)
    .map((x) => x.o)
}

/**
 * A finding's (or a story paragraph's) quote. Every option of the cited
 * candidates, ranked (`rankOptions`: fit plus substance where a fit was
 * measured); ties in the writer's order: `preferred` (its `quote_from`)
 * first, then the cited in their order, each candidate's options in its own.
 * The first ref not printed yet on a thread not heard yet, else the first not
 * printed yet, else none. Marks what it takes as used.
 */
export function pickFindingQuote(
  preferred: PoolCandidate | null,
  cited: readonly PoolCandidate[],
  used: { refs: Set<string>; threads: Set<string> },
  fit: ReadonlyMap<string, number> | null = null,
): QuoteRef | null {
  const order = preferred ? [preferred, ...cited.filter((c) => c !== preferred)] : [...cited]
  const seen = new Set<string>()
  const options: Option[] = []
  for (const c of order) for (const o of optionsOf(c)) if (!seen.has(o.quote.ref)) { seen.add(o.quote.ref); options.push(o) }
  const ranked = rankOptions(options, fit).map((o) => o.quote)
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
  /** The self-check's contradicted claims (finding headlines and the week's
   *  line, as scrubbed), with what the conversation says instead where the
   *  check said. */
  contradicted?: ReadonlyMap<string, string | null>
  /** How well each quote option fits each written finding: the finding's
   *  index in the writer's output → quote ref → similarity
   *  (lib/written/fit.ts). Absent or empty: substance, then the writer's
   *  order, decides. */
  fit?: ReadonlyMap<number, ReadonlyMap<string, number>>
  /** The same for the story's paragraphs, by index (v3). */
  storyFit?: ReadonlyMap<number, ReadonlyMap<string, number>>
  model: string
  costUsd: number
}

/** The start of a report line, for the workings' held list. */
const excerpt = (s: string): string => (s.length > 80 ? `${s.slice(0, 77).trimEnd()}…` : s)

/** The stored read. Pure. */
export function composeWeekRead(a: ComposeWeekArgs): WeekReadDataV2 {
  const { pool } = a
  const month = pool.month
  const byId = new Map(pool.candidates.map((c) => [c.id.toUpperCase(), c]))
  const orderOf = new Map(pool.candidates.map((c, i) => [c.id.toUpperCase(), i]))
  const held: WeekReadHeld[] = []
  const hold = (reason: string, text: string, section: HeldSection) => held.push({ reason, headline: excerpt(text), section })

  /** Known candidates among these ids, once each, in the pool's order. */
  const resolve = (ids: readonly string[] | null | undefined): PoolCandidate[] =>
    [...new Set((ids ?? []).map((x) => String(x).trim().toUpperCase()))]
      .filter((x) => byId.has(x))
      .sort((x, y) => (orderOf.get(x) ?? 0) - (orderOf.get(y) ?? 0))
      .map((x) => byId.get(x)!)

  // Resolve and judge each written finding.
  const judged: { i: number; f: ScrubbedWeekRead['findings'][number]; cited: PoolCandidate[]; evidence: number }[] = []
  for (const [i, f] of (a.written?.findings ?? []).entries()) {
    const headline = f.headline.trim()
    if (!headline) { held.push({ reason: 'no headline survived the scrub', headline: '' }); continue }
    const cited = resolve(f.based_on)
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
  /** The candidates behind what prints: the report rests on these. */
  const backing = new Set<string>()
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
    const evidence = evidenceLine(`f${n}`, videos, `the finding "${j.f.headline}"`, month)
    // The finding's subject: the one its candidates name, where they name one.
    // Two subjects (a price finding resting on a comfort theme too) name
    // neither: "Part of Comfort" would misplace it.
    const named = [...new Set(j.cited.map((c) => c.subjectId).filter((x): x is string => Boolean(x)))]
    const subjectId = named.length === 1 ? named[0] : null
    const isNew = j.cited.every((c) => c.isNew)
    const context = contextLine(subjectId ? subjectOf.get(subjectId) : null, isNew, month)
    Object.assign(figures, evidence.figures, context.figures)
    for (const c of j.cited) backing.add(c.id.toUpperCase())
    findings.push({
      headline: j.f.headline,
      saw: j.f.saw,
      means: j.f.means,
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

  // ---- The report (v3): only on a week whose findings print ------------------------------
  const report = findings.length > 0 && a.written != null
  if (!report && a.written) {
    const unprinted = [
      ...(a.written.week_in_one_line ? [['week_line', a.written.week_in_one_line] as const] : []),
      ...(a.written.story ?? []).map((p) => ['story', p.paragraph] as const),
      ...(a.written.implications ?? []).map((x) => ['implication', x.implication] as const),
      ...(a.written.new_this_week ?? []).map((x) => ['new', x.sentence] as const),
      ...(a.written.watch ?? []).map((x) => ['watch', x.question] as const),
    ]
    for (const [section, text] of unprinted) if (text.trim()) hold('no finding printed', text, section)
  }

  // New this week: code decides what was first heard this week.
  const newThisWeek: WeekReadNewItem[] = []
  const newSeen = new Set<string>()
  for (const x of report ? a.written?.new_this_week ?? [] : []) {
    const text = x.sentence.trim()
    const c = byId.get(String(x.candidate ?? '').trim().toUpperCase())
    if (!text) { hold('nothing survived the scrub', x.candidate ?? '', 'new'); continue }
    if (!c) { hold('names no candidate', text, 'new'); continue }
    if (!firstHeardThisWeek(c, pool.window)) { hold('not first heard this week', text, 'new'); continue }
    if (newSeen.has(c.id)) { hold('the same conversation twice', text, 'new'); continue }
    if (newThisWeek.length >= WEEK_READ_MAX.newItems) { hold(`past the first ${WEEK_READ_MAX.newItems}`, text, 'new'); continue }
    newSeen.add(c.id)
    const videos = { week: evidenceOf([c]), month: monthEvidenceOf([c]) }
    const evidence = evidenceLine(`n${newThisWeek.length + 1}`, videos, `the conversation "${c.label}"`, month)
    Object.assign(figures, evidence.figures)
    backing.add(c.id.toUpperCase())
    newThisWeek.push({ themeId: c.themeId, body: text, videos, evidence: evidence.body })
  }

  const restsOnWhatPrints = (cited: readonly PoolCandidate[]): boolean => cited.some((c) => backing.has(c.id.toUpperCase()))

  // What happened: the paragraphs that rest on what prints, with at most two
  // real quotes, never one already printed.
  const story: WeekReadParagraph[] = []
  let storyQuotes = 0
  for (const [i, p] of (report ? a.written?.story ?? [] : []).entries()) {
    const text = p.paragraph.trim()
    if (!text) { hold('nothing survived the scrub', '', 'story'); continue }
    const cited = resolve(p.based_on)
    if (!restsOnWhatPrints(cited)) { hold('rests on no printed finding', text, 'story'); continue }
    if (story.length >= WEEK_READ_MAX.storyParagraphs) { hold(`past the first ${WEEK_READ_MAX.storyParagraphs} paragraphs`, text, 'story'); continue }
    const asked = p.quote_from ? byId.get(p.quote_from.trim().toUpperCase()) ?? null : null
    let quote: QuoteRef | null = null
    if (asked && cited.includes(asked) && storyQuotes < WEEK_READ_MAX.storyQuotes) {
      quote = pickFindingQuote(asked, [asked], usedQuotes, a.storyFit?.get(i) ?? null)
      if (quote) storyQuotes++
    }
    story.push({ body: text, basedOn: cited.map((c) => c.themeId), quote })
  }

  // What it means, and what to watch: each resting on what prints.
  const lines = <T extends { body: string; basedOn: string[] }>(
    items: readonly { text: string; based_on: readonly string[] }[],
    max: number,
    section: HeldSection,
  ): T[] => {
    const out: T[] = []
    for (const x of items) {
      const text = x.text.trim()
      if (!text) { hold('nothing survived the scrub', '', section); continue }
      const cited = resolve(x.based_on)
      if (!restsOnWhatPrints(cited)) { hold('rests on no printed finding', text, section); continue }
      if (out.length >= max) { hold(`past the first ${max}`, text, section); continue }
      out.push({ body: text, basedOn: cited.map((c) => c.themeId) } as T)
    }
    return out
  }
  const implications = lines<WeekReadImplication>(
    (report ? a.written?.implications ?? [] : []).map((x) => ({ text: x.implication, based_on: x.based_on })),
    WEEK_READ_MAX.implications,
    'implication',
  )
  const watch = lines<WeekReadWatchItem>(
    (report ? a.written?.watch ?? [] : []).map((x) => ({ text: x.question, based_on: x.based_on })),
    WEEK_READ_MAX.watchItems,
    'watch',
  )

  // The week in one line; where the check contradicts it or the scrub took
  // it, the top finding's headline stands in.
  let headline = report ? (a.written?.week_in_one_line ?? '').trim() : ''
  if (headline && a.contradicted?.has(headline)) {
    const theySay = a.contradicted.get(headline)
    hold(theySay ? `the conversation contradicts it: ${theySay}` : 'the conversation contradicts it', headline, 'week_line')
    headline = ''
  }
  if (!headline && findings.length > 0) headline = `${findings[0].headline}.`

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

  // The market's week and month (the Dashboard's figures), frozen here.
  const market = pool.market ?? null
  Object.assign(figures, marketFigureTable(market, month))

  return {
    version: 2,
    window: pool.window,
    month,
    headline,
    story,
    implications,
    newThisWeek,
    watch,
    findings,
    standing,
    market,
    figures,
    held,
    model: a.model,
    promptVersion: WEEK_READ_PROMPT_VERSION,
    costUsd: a.costUsd,
  }
}
