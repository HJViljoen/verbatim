import { DOCUMENT_BLOCK_MAX, DOCUMENT_CITED_COUNT_MIN, DOCUMENT_FINDING_MIN_CONVERSATIONS, DOCUMENT_THIN_CONVERSATIONS } from '../../config'
import { chunk } from '../../chunk'
import { readsAsHeroQuote } from '../../quotes'
import type { Quote, Slide } from '../../renderables/types'
import type { FigureTable } from '../types'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../../rivals'
import { CLUSTERING_CAVEAT, briefStamp, denominatorLine, platformLine, type BriefReading } from './reading'
import { SECTION_SLIDE_PREFIX, type DocBriefSection, type DocLayoutEntry, type DocumentReading } from './types'
import type { BriefEntry } from './sections'
import { missingSentence, missingSummary, pageKindsOf } from './sections'
import type { Signals } from './signals'
import type { ResearchAnswer, ResearchPoint } from './research'
import { ASKED_MAX, CLAIMS_PER_PAGE, PAGE_TITLE, PERSONAS_PER_PAGE, SAY_HEAR_MAX, type DocumentTemplate } from './templates'
import type { DocPageKind } from './types'
import type { WriterOutput } from './write'
import { bucketWord, slug } from './write'
import { SURE_WORDS, calibrateSure, productTokens, resolveIndices, scrubLine, scrubText, singularise } from './scrub'
import type { BlockWorkings, DocBlock, DocPage, DocumentSettings, DocumentSnapshotData, DocumentWorkings } from './types'

/**
 * From the writer's output and the signals to the frozen document (pure).
 *
 * The page ORDER is the template's skeleton, walked in order (2026-09-02):
 * a template without a competitor page prints none, and a page whose only
 * material is missing (no claims to answer, nothing held back) drops out
 * rather than printing an empty sheet. Findings are resolved before the walk
 * because the overview lists them.
 * Code owns what code can own: the figure table and every number, the order
 * of the findings (by the evidence behind them), where each was heard, how
 * sure the reading is, which quote leads a finding, the finding floor and
 * the thin-week rule, the page count, the method page. The model owns the
 * words inside the blocks, and only after scrub.
 */

const cap = (field: string) => DOCUMENT_BLOCK_MAX[field] ?? 400
const fmtCount = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n))
const fmtPct = (n: number) => `${Math.round(n * 10) / 10}%`
/** Names in the inputs that carry digits, so the writer may repeat them. */
export function allowedTokens(s: Signals, answers: ResearchAnswer[]): string[] {
  return productTokens([
    ...s.competitors.flatMap((c) => [...c.claims, ...c.about].map((cl) => cl.claim)),
    ...s.themes.flatMap((t) => [t.label, t.description]),
    ...answers.flatMap((a) => a.grounded.map((p) => p.text)),
    ...s.sayVsHear.map((e) => e.you_say),
  ])
}

export function thinWeek(s: Pick<Signals, 'runStatus' | 'run'>): boolean {
  return s.runStatus === 'partial' || s.run.conversations < DOCUMENT_THIN_CONVERSATIONS
}

/**
 * Every figure the writer may cite (Phase 1 WP19 re-based it onto the month).
 *
 * WHEN THERE IS A MONTHLY READING, IT IS THE MONTH'S. The table opens with the
 * blocks' own merged figures — the shares, the levels and the banded changes a
 * reader saw on the page — and its headline counts are the month's
 * denominators, each labelled with the month it is of. The run-scoped figures
 * that used to be here are deliberately NOT offered beside them:
 * `prev_positive_pct`, `prev_conversations` and `new_themes` are one update
 * against the previous update, which is the run-indexed series item 43 exists
 * to take out of the artefacts, and a model handed both would write a sentence
 * that is half a month and half a Sunday.
 *
 * VIDEOS ARE NOT SUMMED ACROSS AUDIENCES. A video naming two rivals sits in
 * both buckets (`CoverageRecord.dualMention` counts exactly that), so
 * `competitor_videos` — which summed them — has no month-scoped successor and
 * each rival gets its own figure instead. Comments DO sum exactly, which is
 * why `conversations` still has one.
 *
 * AND THE SAME SUM DOES NOT COME BACK IN THROUGH THE BLOCK TABLE. The blocks'
 * merged figures open this table, and two of them are that sum by another
 * name: `month_videos` ("videos read into this month", OV0's own total across
 * audiences) and `standings_videos` ("videos read in Sep 2026"). Measured on
 * production, Össur, September: both hand the writer 449 while the same
 * brief's method page prints "388 videos in the category · 42 videos in
 * Ottobock · 19 videos in your own brand", and `dual_mention_videos` = 6
 * proves the overlap is real. Whether 449 is the right number for the page it
 * is drawn on is Overview's argument; putting it in a document's citable list
 * beside a contradicting 388 is this module's.
 *
 * WHEN THERE IS NO READING the update figures stand, unchanged, and the method
 * page says which basis this brief used. That is the isMissing* precedent: a
 * brief on a workspace whose month tables are not applied prints what it has
 * and names what it could not read.
 */
/** Block figures a brief withdraws: a video count summed across audiences,
 *  which double-counts a video naming two rivals. Withdrawn by KEY rather than
 *  by a guess at the label, so adding one is a deliberate line here. */
export const AUDIENCE_SUMMED_VIDEO_FIGURES: readonly string[] = ['month_videos', 'standings_videos']

export function documentFigures(s: Signals, answers: ResearchAnswer[]): FigureTable {
  const f: FigureTable = {}
  if (s.reading) for (const [k, v] of Object.entries(s.reading.figures)) if (!AUDIENCE_SUMMED_VIDEO_FIGURES.includes(k)) f[k] = v
  if (s.reading) {
    const r = s.reading
    const of = (audience: string) => r.denominators.find((d) => d.audience === audience) ?? null
    const category = of(INDUSTRY_AUDIENCE)
    const client = of(CLIENT_AUDIENCE)
    const comments = r.denominators.reduce((n, d) => n + d.comments, 0)
    f.reading_month = { label: 'the month this reading is of', value: r.monthLabel, kind: 'name' }
    f.conversations = { label: `comments read in ${r.monthLabel}`, value: fmtCount(comments), kind: 'count' }
    if (category) f.videos = { label: `videos read for the category in ${r.monthLabel}`, value: fmtCount(category.videos), kind: 'count' }
    if (client) f.client_videos = { label: `${s.company} videos in ${r.monthLabel}`, value: fmtCount(client.videos), kind: 'count' }
    for (const c of s.competitors) {
      const d = of(`competitor:${c.name}`)
      if (d) f[`${slug(c.name)}_videos`] = { label: `${c.name} videos in ${r.monthLabel}`, value: fmtCount(d.videos), kind: 'count' }
    }
  } else {
    f.conversations = { label: 'conversations', value: fmtCount(s.run.conversations), kind: 'count' }
    f.videos = { label: 'videos', value: fmtCount(s.run.videos), kind: 'count' }
    f.client_videos = { label: `${s.company} videos`, value: fmtCount(s.run.clientVideos), kind: 'count' }
    f.competitor_videos = { label: 'competitor videos', value: fmtCount(s.run.competitorVideos), kind: 'count' }
    if (s.run.positivePct != null) f.positive_pct = { label: 'positive share of judged conversations', value: fmtPct(s.run.positivePct), kind: 'pct' }
    if (s.run.clientSharePct != null) f.client_share_pct = { label: `${s.company} share of tracked conversation`, value: fmtPct(s.run.clientSharePct), kind: 'pct' }
    for (const c of s.competitors) if (c.shareNow != null) f[`${slug(c.name)}_share_pct`] = { label: `${c.name} share of tracked conversation`, value: fmtPct(c.shareNow), kind: 'pct' }
    if (s.delta?.sentiment) f.prev_positive_pct = { label: 'positive share in the previous update', value: fmtPct(s.delta.sentiment.prev), kind: 'pct' }
    if (s.delta?.conversations) f.prev_conversations = { label: 'conversations in the previous update', value: fmtCount(s.delta.conversations.prev), kind: 'count' }
    if (s.delta?.newThemes) f.new_themes = { label: 'themes new this update', value: fmtCount(s.delta.newThemes.count), kind: 'count' }
  }
  // A count under three is not worth a number on paper ("one conversation
  // praise…" reads as thin as it is); the point still grounds, the writer
  // names the pattern instead of counting it.
  for (const a of answers) for (const p of a.grounded) if (p.conversationCount >= DOCUMENT_CITED_COUNT_MIN) f[`${p.id.toLowerCase()}_conversations`] = { label: 'conversations', value: fmtCount(p.conversationCount), kind: 'count' }
  for (const c of s.concerns) if (c.total >= DOCUMENT_CITED_COUNT_MIN) f[`${c.id.toLowerCase()}_conversations`] = { label: 'conversations', value: fmtCount(c.total), kind: 'count' }
  return f
}

/** The quote that leads a finding: from the grounded point the writer named,
 *  a comment before a transcript line, one THIS READER CAN READ and that fits a
 *  card, the longest of those. Text stays in memory until freeze.
 *
 *  The reading travels with the quote and both halves of this use it: the
 *  filter, because a hard filter given only the words drops every translated
 *  voice out of every document (item 8's inversion has to reach the call site
 *  to reach the reader); and the returned Quote, because a finding that leads
 *  with a Spanish sentence and no English under it is the failure the
 *  translation exists to prevent. `steps.ts` resolves lang/english onto these
 *  refs a moment before composing — they are never stored. */
export function pickQuote(point: ResearchPoint | undefined, used: Set<string>): Quote | null {
  if (!point) return null
  const ok = point.quotes.filter((q) => !used.has(q.ref) && readsAsHeroQuote(q.text, q))
  const pick = [...ok].sort((a, b) => (b.commentId ? 1 : 0) - (a.commentId ? 1 : 0) || b.text.length - a.text.length)[0]
  if (!pick) return null
  used.add(pick.ref)
  return pick.lang != null
    ? { ref: pick.ref, text: pick.text, lang: pick.lang, english: pick.english ?? null }
    : { ref: pick.ref, text: pick.text }
}

/** Where a finding was heard, written by code from the points and concerns
 *  it rests on: how many conversations across how many strands, which
 *  audiences, the history in words. */
export function heardMeta(args: { points: ResearchPoint[]; concerns: Signals['concerns'] }): { audiences: string[]; history: string; conversations: number; strands: number } {
  const buckets = new Set<string>()
  const words = new Set<string>()
  for (const c of args.concerns) {
    for (const b of c.buckets) buckets.add(b.bucket)
    if (c.trajectory) words.add(c.trajectory)
  }
  const w = [...words]
  const seen = w.map((x) => /seen (\d+)/.exec(x)?.[1]).filter(Boolean).map(Number)
  const history = w.find((x) => x.startsWith('new')) ?? w.find((x) => x === 'rising') ?? w.find((x) => x === 'fading') ?? (seen.length ? `seen ${Math.max(...seen)} updates running` : w[0] ?? '')
  return { audiences: [...buckets], history, conversations: args.points.reduce((n, p) => n + p.conversationCount, 0), strands: args.points.length }
}

export function heardLine(args: { points: ResearchPoint[]; concerns: Signals['concerns']; company: string }): string {
  const buckets = new Set<string>()
  const words = new Set<string>()
  for (const c of args.concerns) {
    for (const b of c.buckets) buckets.add(bucketWord(b.bucket, args.company))
    if (c.trajectory) words.add(c.trajectory)
  }
  const conversations = args.points.reduce((n, p) => n + p.conversationCount, 0)
  const strands = args.points.length
  const parts = [`${fmtCount(conversations)} ${conversations === 1 ? 'conversation' : 'conversations'} across ${strands} ${strands === 1 ? 'strand' : 'strands'} of the research`]
  if (buckets.size) parts.push(`heard from ${[...buckets].join(', ')}`)
  // One history word: new beats rising beats fading beats the longest run.
  const w = [...words]
  const seen = w.map((x) => /seen (\d+)/.exec(x)?.[1]).filter(Boolean).map(Number)
  const history = w.find((x) => x.startsWith('new')) ?? w.find((x) => x === 'rising') ?? w.find((x) => x === 'fading') ?? (seen.length ? `seen ${Math.max(...seen)} updates running` : w[0])
  if (history) parts.push(history)
  return `${parts.join(' · ')}.`
}

export interface ComposeArgs {
  template: DocumentTemplate
  settings: DocumentSettings
  reportId: string
  title: string
  period: string
  signals: Signals
  answers: ResearchAnswer[]
  written: WriterOutput
  figures: FigureTable
  model: string
  promptVersion: string
  costUsd: number
  timings: Record<string, number>
  /** The self-check's outcome, when it ran: a verdict per surviving finding
   *  headline and the findings it dropped (lib/reports/documents/check.ts). */
  check?: { verdicts: Record<string, 'echoes' | 'silent'>; dropped: { headline: string; reason: string }[]; brief?: { answered: boolean; subjects: string[]; missed: string[] } | null } | null
}

export function composeDocument(a: ComposeArgs): { data: DocumentSnapshotData; workings: DocumentWorkings } {
  const { signals: s, written: w, figures } = a
  const allow = allowedTokens(s, a.answers)
  const prose = (raw: string, figures: FigureTable, max: number) => singularise(scrubText(raw, figures, max, { allow }).text, figures)
  const line = (raw: string, figures: FigureTable, max: number, headline = false) => singularise(scrubLine(raw, figures, max, { headline, allow }).text, figures)
  const points = new Map<string, ResearchPoint>()
  for (const ans of a.answers) for (const p of ans.grounded) points.set(p.id, p)
  const concernById = new Map(s.concerns.map((c) => [c.id, c]))
  const known = new Set([...points.keys(), ...concernById.keys()])
  const thin = thinWeek(s)
  // THE PAGES THIS BRIEF ACTUALLY PRINTS, which is the section map's list
  // where it has one and the template's skeleton otherwise — the same choice
  // the walk below makes, made once. The method page used to describe the
  // TEMPLATE's kinds: under MARKETING_MAP a marketing brief prints no claims
  // page, no competitor pages and no personas, and its method page went on
  // saying "Competitor pages read each competitor's own videos…" and
  // "Personas come from the consumer profile…". A method note for a document
  // the reader does not have is the rule the comment above methodItems states.
  const printedKinds: DocPageKind[] = (s.map?.length ?? 0) > 0 ? pageKindsOf(s.map) : a.template.skeleton.map((p) => p.kind)
  const pages: DocPage[] = []
  const blocksW: BlockWorkings[] = []
  const dropped: DocumentWorkings['dropped'] = [...(a.check?.dropped ?? [])]
  const notSure: string[] = []
  const usedQuotes = new Set<string>()

  // Findings: resolve, floor, order by evidence, cap.
  const perTemplate = Math.min(a.settings.findings, a.template.findingsMax)
  const findingsMax = thin ? Math.min(perTemplate, 3) : perTemplate
  const candidates = (w.findings ?? []).map((f) => {
    const { ok } = resolveIndices(f.based_on, known)
    const gs = ok.filter((i) => i.startsWith('G')).map((i) => points.get(i)!).filter(Boolean)
    const cs = ok.filter((i) => i.startsWith('S')).map((i) => concernById.get(i)!).filter(Boolean)
    const { sure, conversations } = calibrateSure(gs)
    return { f, ok, gs, cs, sure, conversations }
  })
  const kept = candidates.filter((c) => {
    const headline = line(c.f.headline, figures, cap('headline'), true)
    if (!headline) { dropped.push({ headline: c.f.headline, reason: 'no headline survived scrub' }); return false }
    if (c.gs.length === 0) { dropped.push({ headline, reason: 'rests on no grounded point' }); notSure.push(headline); return false }
    if (c.conversations < DOCUMENT_FINDING_MIN_CONVERSATIONS) { dropped.push({ headline, reason: `too thin: ${c.conversations} conversations` }); notSure.push(headline); return false }
    return true
  })
  kept.sort((x, y) => y.conversations - x.conversations || y.gs.length - x.gs.length)
  const findingPages: DocPage[] = kept.slice(0, findingsMax).map((c, i) => {
    const id = `f${i + 1}`
    const headline = line(c.f.headline, figures, cap('headline'), true)
    const quoteFrom = c.f.quote_from ? resolveIndices([c.f.quote_from], known).ok[0] : undefined
    const quote = pickQuote(quoteFrom ? points.get(quoteFrom) : c.gs[0], usedQuotes)
    const practice = (c.f.practice ?? []).map((x) => line(x, figures, cap('practice'))).filter(Boolean).slice(0, 2)
    const sureNote = prose(c.f.sure_note ?? '', figures, cap('sure'))
    const blocks: DocBlock[] = [
      { id: `${id}.headline`, field: 'headline', text: headline },
      { id: `${id}.saw`, field: 'saw', text: prose(c.f.saw, figures, cap('saw')), quote },
      { id: `${id}.heard`, field: 'heard', text: heardLine({ points: c.gs, concerns: c.cs, company: s.company }) },
      { id: `${id}.means`, field: 'means', text: prose(c.f.means, figures, cap('means')) },
      { id: `${id}.practice`, field: 'practice', text: '', items: practice },
      { id: `${id}.sure`, field: 'sure', text: `${SURE_WORDS[c.sure]}${sureNote ? ` ${sureNote}` : ''}` },
    ]
    const continued = c.f.continued_from?.trim() || null
    const check = a.check ? (a.check.verdicts[c.f.headline] ?? 'silent') : null
    for (const b of blocks) blocksW.push({ blockId: b.id, basedOn: c.ok, continuedFrom: continued, check })
    const heard = heardMeta({ points: c.gs, concerns: c.cs })
    return {
      id, kind: 'finding', title: PAGE_TITLE.finding, blocks,
      meta: { sure: c.sure, n: String(i + 1), audiences: heard.audiences.join(','), history: heard.history, conversations: String(heard.conversations), strands: String(heard.strands), ...(continued ? { continuedFrom: continued } : {}) },
    }
  })

  // The overview's own list: what is not settled, written and derived.
  const notSureYet = [...(w.not_sure_yet ?? []).map((x) => line(x, figures, cap('not_sure'))).filter(Boolean), ...notSure].slice(0, 6)

  // ── one builder per page kind; the skeleton decides which run ───────────
  // A builder returns the pages it has material for. Returning none is a
  // legitimate answer (no claims to answer, nothing to handle with care) and
  // the page simply does not exist in that issue.
  const build: Record<DocPageKind, () => DocPage[]> = {
    in_short: () => {
      const summary = prose(w.in_short?.summary ?? '', figures, cap('summary'))
      const blocks: DocBlock[] = [
        { id: 'in_short.summary', field: 'summary', text: summary },
        { id: 'in_short.findings', field: 'findings', text: '', items: findingPages.map((p) => p.blocks.find((b) => b.field === 'headline')?.text ?? '').filter(Boolean) },
        { id: 'in_short.not_sure', field: 'not_sure', text: '', items: notSureYet },
      ]
      for (const b of blocks) blocksW.push({ blockId: b.id, basedOn: [] })
      return [{ id: 'in_short', kind: 'in_short', title: PAGE_TITLE.in_short, blocks }]
    },

    finding: () => findingPages,

    // One page per included competitor, from the writer where it wrote one,
    // else from the signals.
    competitor: () => s.competitors.map((c) => {
      const id = `c_${slug(c.name)}`
      const wc = (w.competitors ?? []).find((x) => x.name.trim().toLowerCase() === c.name.toLowerCase())
      const { ok } = resolveIndices(wc?.based_on, known)
      const text = (field: 'pitch' | 'about' | 'praise' | 'hurt' | 'read', fallback: string) => prose(wc?.[field] || fallback, figures, cap(field))
      const blocks: DocBlock[] = [
        { id: `${id}.pitch`, field: 'pitch', text: text('pitch', c.claims.length ? c.claims.slice(0, 4).map((cl) => cl.claim).join(' ') : 'Nothing from their own videos was captured this update.') },
        { id: `${id}.about`, field: 'about', text: text('about', c.about.length ? c.about.slice(0, 4).map((cl) => cl.claim).join(' ') : 'Nothing others said about them was captured this update.') },
        { id: `${id}.praise`, field: 'praise', text: text('praise', c.praise.length ? c.praise.slice(0, 4).map((t) => `${t.label}: ${t.description}`).join(' ') : 'Nothing their users praised was captured this update.') },
        { id: `${id}.hurt`, field: 'hurt', text: text('hurt', c.hurt.length ? c.hurt.slice(0, 4).map((t) => `${t.label}: ${t.description}`).join(' ') : 'Nothing their users complained about was captured this update.') },
        { id: `${id}.read`, field: 'read', text: text('read', '') },
      ]
      for (const b of blocks) blocksW.push({ blockId: b.id, basedOn: ok })
      return { id, kind: 'competitor' as const, title: PAGE_TITLE.competitor, blocks, meta: { name: c.name, thin: String(c.thin) } }
    }),

    // Where the company stands: the writer's read, printed beside a table the
    // deck draws from the figures and the delta. One page, always, because a
    // leadership brief that cannot say where the company sits has failed.
    standing: () => {
      const block: DocBlock = { id: 'standing.standing', field: 'standing', text: prose(w.standing ?? '', figures, cap('standing')) }
      blocksW.push({ blockId: block.id, basedOn: [] })
      const parties = [s.company, ...s.competitors.map((c) => c.name)]
      return [{
        id: 'standing', kind: 'standing', title: PAGE_TITLE.standing, blocks: [block],
        // The deck draws the bars from the figures; the names and their order
        // are the composer's, because a figure key is a slug and a name is not
        // recoverable from it. The concerns are the FIELD this update, which
        // the three findings deliberately do not cover: a director is asking
        // what the conversation is about, not only what was worth writing up.
        //
        // JSON, not a delimiter: a company or a theme label containing the
        // separator would mis-split, and the deck would print NaN and a bar of
        // NaN width into a paid PDF without throwing.
        meta: {
          parties: JSON.stringify(parties),
          concerns: JSON.stringify(s.concerns.slice(0, 5).map((c) => ({ label: c.label, total: c.total, trajectory: c.trajectory || '' }))),
        },
      }]
    },

    // What the company claims against what comes back. One block per claim
    // the writer answered, the claim matched back to the pipeline's own
    // say-vs-hear entry so the page cannot print a claim nobody made.
    say_hear: () => {
      const entries = s.sayVsHear
      if (!entries.length) return []
      const blocks: DocBlock[] = []
      const blockFor = (entry: (typeof entries)[number], read: string): DocBlock => ({
        // The claim is PRINTED IN QUOTATION MARKS, so it is scrubbed but not
        // shortened: a claim cut at a character count is a misquote of the
        // company. Its length is the pipeline's to bound, not this page's.
        // The index keeps the id unique: two claims that open with the same
        // forty characters would otherwise collide. The index is the entry's,
        // not the loop's, so an edit keys to the same block if the writer
        // reorders them.
        id: `sh${entries.indexOf(entry) + 1}_${slug(entry.you_say).slice(0, 36)}`,
        field: 'gap',
        label: scrubLine(entry.you_say, figures, entry.you_say.length + 1, { allow }).text || entry.you_say,
        text: read,
        // Positional, like a persona card: [0] the pipeline's own verdict
        // word (echoes | contradicts | silent), [1] what the audience says
        // back, [2] the gap it named. Never filtered, so a missing middle
        // does not shift the gap into its place.
        items: [entry.audience, entry.they_say ?? '', entry.gap].map((x) => scrubText(x, figures, 300, { allow }).text),
      })
      for (const written of (w.say_hear ?? []).slice(0, SAY_HEAR_MAX)) {
        const claim = written.claim?.trim()
        if (!claim) continue
        // Exact first; then a prefix long enough to be an identification and
        // not a coincidence, and only when exactly ONE claim matches it. A
        // two-way `includes` let a short fragment bind to whichever entry came
        // first, which attaches a read to the wrong claim in silence.
        const lower = claim.toLowerCase()
        let entry = entries.find((e) => e.you_say.trim().toLowerCase() === lower)
        if (!entry && lower.length >= 30) {
          const near = entries.filter((e) => e.you_say.toLowerCase().startsWith(lower.slice(0, 30)) || lower.startsWith(e.you_say.toLowerCase().slice(0, 30)))
          entry = near.length === 1 ? near[0] : undefined
        }
        if (!entry) continue
        if (blocks.some((b) => b.label === entry!.you_say)) continue
        const read = prose(written.read ?? '', figures, cap('gap'))
        if (!read) continue
        const { ok } = resolveIndices(written.based_on, known)
        // The index keeps the id unique: two claims that open with the same
        // forty characters would otherwise collide, and the second would be
        // dropped without a word. The index is the entry's, not the loop's,
        // so an edit keys to the same block if the writer reorders them.
        const b = blockFor(entry, read)
        if (blocks.some((x) => x.id === b.id)) continue
        blocks.push(b)
        blocksW.push({ blockId: b.id, basedOn: ok })
      }
      // A claim the writer did not answer, or answered in words that no longer
      // identify it, still belongs on the page: the verdict, what the audience
      // says back and the gap are the PIPELINE's, not the writer's, so the
      // entry can be printed with the pipeline's own reading in place of a
      // written one. This is the same fallback the competitor page has always
      // had, and it is what keeps a paraphrase from silently costing the
      // market brief the one page that distinguishes it.
      for (const entry of entries) {
        if (blocks.length >= SAY_HEAR_MAX) break
        if (blocks.some((b) => b.id.startsWith(`sh${entries.indexOf(entry) + 1}_`))) continue
        const read = prose(entry.gap ?? '', figures, cap('gap'))
        if (!read) continue
        const b = blockFor(entry, read)
        blocks.push(b)
        blocksW.push({ blockId: b.id, basedOn: [] })
      }

      // Two a page, like personas. A claim is the company's own sentence and
      // is printed whole; four of them on one sheet ran off the bottom, and a
      // claim cut to fit is a misquote (found by rendering, 2026-09-02).
      return chunk(blocks, CLAIMS_PER_PAGE).map((part, i) => ({
        id: `say_hear_${i + 1}`, kind: 'say_hear' as const, title: PAGE_TITLE.say_hear, blocks: part,
      }))
    },

    // The questions the conversation puts and nobody settles.
    asked: () => {
      const items = (w.asked ?? []).map((x) => line(x, figures, cap('asked'))).filter(Boolean).slice(0, ASKED_MAX)
      if (!items.length) return []
      blocksW.push({ blockId: 'asked.asked', basedOn: [] })
      return [{ id: 'asked', kind: 'asked' as const, title: PAGE_TITLE.asked, blocks: [{ id: 'asked.asked', field: 'asked' as const, text: '', items }] }]
    },

    // Who is in the conversation: the profile's own words in full, two a
    // page, and the writer's line on what each means for this reader.
    personas: () => {
      const personaBlocks: DocBlock[] = s.personas.slice(0, 6).map((p) => {
        const wl = (w.persona_lines ?? []).find((x) => x.name.trim().toLowerCase() === p.name.toLowerCase())
        return {
          id: `p_${slug(p.key || p.name)}`,
          field: 'persona' as const,
          label: p.name,
          text: prose(wl?.line ?? '', figures, cap('persona')),
          items: [p.oneLiner, p.wants, p.blockers, p.triggers].map((x) => scrubText(x, figures, 300, { allow }).text),
        }
      })
      for (const b of personaBlocks) blocksW.push({ blockId: b.id, basedOn: [] })
      return chunk(personaBlocks, PERSONAS_PER_PAGE).map((part, i) => ({
        id: `personas_${i + 1}`, kind: 'personas' as const, title: PAGE_TITLE.personas, blocks: part,
      }))
    },

    language: () => {
      const care = (w.care ?? []).map((x) => line(x, figures, cap('care'))).filter(Boolean).slice(0, 6)
      if (!care.length) return []
      blocksW.push({ blockId: 'language.care', basedOn: [] })
      return [{ id: 'language', kind: 'language' as const, title: PAGE_TITLE.language, blocks: [{ id: 'language.care', field: 'care' as const, text: '', items: care }] }]
    },

    // ── the two counted sheets (E-sales, sales.p5 / sales.p6) ────────────
    // NO BLOCK, AND THAT IS THE DESIGN. Every line on these two sheets is a
    // count the reading already made and froze onto `slideFigures`; the deck
    // draws them from there. A page with no blocks writes nothing, is asked of
    // no model and costs no tokens — and a sheet whose material is missing
    // drops out rather than printing an empty one, the same rule the say-hear
    // and asked builders follow.
    switching: () => (s.slideFigures?.switching
      ? [{ id: 'switching', kind: 'switching' as const, title: PAGE_TITLE.switching, blocks: [] }]
      : []),

    scripted: () => (s.slideFigures?.scripted.length
      ? [{ id: 'scripted', kind: 'scripted' as const, title: PAGE_TITLE.scripted, blocks: [] }]
      : []),

    method: () => {
      blocksW.push({ blockId: 'method.method', basedOn: [] })
      return [{ id: 'method', kind: 'method' as const, title: PAGE_TITLE.method, blocks: [{ id: 'method.method', field: 'method' as const, text: '', items: methodItems(s, a.period, thin, s.updatesCount, printedKinds, a.settings.brief) }] }]
    },
  }

  // The walk. A kind that repeats is emitted once by its builder, which
  // returns every page of that kind; a kind listed twice is built once.
  //
  // WP19: the ORDER is the section map's where the brief has one — written
  // pages and borrowed page blocks interleaved — and the template's skeleton
  // otherwise. A custom brief keeps the skeleton, and so does any brief built
  // where the reading could not be loaded at all, which is the same fallback
  // every other number on the page takes.
  const layout: DocLayoutEntry[] = []
  const done = new Set<DocPageKind>()
  const walk: { kind: 'page'; page: DocPageKind }[] | readonly BriefEntry[] =
    (s.map?.length ?? 0) > 0 ? s.map : printedKinds.map((page) => ({ kind: 'page' as const, page }))
  for (const entry of walk) {
    if (entry.kind === 'block') {
      layout.push({ kind: 'section', id: entry.section.id })
      continue
    }
    if (done.has(entry.page)) continue
    done.add(entry.page)
    const built = build[entry.page]()
    pages.push(...built)
    for (const p of built) layout.push({ kind: 'page', id: p.id })
  }

  const data: DocumentSnapshotData = {
    version: 1,
    kind: 'document',
    template: a.template.key,
    reportId: a.reportId,
    title: a.title,
    audience: a.template.audience,
    company: s.company,
    period: a.period,
    runId: s.runId,
    figures,
    delta: s.delta,
    ...(s.reading ? { reading: documentReading(s.reading) } : {}),
    ...(s.missing?.length ? { missing: s.missing.map((m) => ({ ...m, sections: [...m.sections] })) } : {}),
    ...(s.sections?.length ? { sections: s.sections.map((x) => ({ ...x })), surfaces: s.surfaces ?? {}, layout } : {}),
    // THE BRIEF'S OWN SLIDE FIGURES, FROZEN (E-sales). Wave 1 computed all six
    // and handed them to nobody. They are stored rather than re-read because a
    // share link renders from the snapshot alone, and because a count of one
    // month must read the same in March as it did in September. The one QUOTE
    // in them rides `freezeQuotes` / `resolveQuotes` structurally, exactly as a
    // finding's pull quote does — nothing here stores a commenter's words.
    ...(s.slideFigures ? { slideFigures: s.slideFigures } : {}),
    pages,
    // What the skeleton above was composed from, so it can be composed again
    // (WP7d): the eval and any rebuild read these, not the picker.
    ...(a.settings.blocks?.length ? { blocks: a.settings.blocks } : {}),
    ...(a.settings.role ? { role: a.settings.role } : {}),
    ...(a.settings.brief ? { brief: a.settings.brief } : {}),
    lens: { means: a.template.lens.means, short: a.template.lens.short },
    method: {
      conversations: s.run.conversations,
      videos: s.run.videos,
      clientVideos: s.run.clientVideos,
      competitorVideos: s.run.competitorVideos,
      period: a.period,
      sources: sourcesOf(s),
      heldBack: s.heldBackPhrases,
      thin,
      // The denominator behind "Findings". Computed since the composer
      // existed, kept in the workings, never shown to a reader.
      dropped: dropped.length,
    },
    notSureYet,
    generatedAt: new Date().toISOString(),
    model: a.model,
    promptVersion: a.promptVersion,
  }
  const workings: DocumentWorkings = {
    version: 1,
    questions: a.answers.map((ans) => ({ id: ans.question.id, text: ans.question.text, purpose: ans.question.purpose, outcome: ans.outcome === 'failed' || ans.outcome === 'unasked' ? 'silent' : ans.outcome, conversationCount: ans.conversationCount, costUsd: ans.costUsd })),
    points: [...points.values()].map((p) => ({ id: p.id, text: p.text, insightIds: p.insightIds, conversationCount: p.conversationCount, themeLabels: p.themeLabels, quotes: p.quotes.slice(0, 3).map((q) => ({ ref: q.ref, text: q.text })), questionId: p.questionId })),
    blocks: blocksW,
    concerns: s.concerns.map((c) => ({ label: c.label, buckets: c.buckets.map((b) => ({ bucket: b.bucket, label: b.label, evidenceCount: b.evidenceCount })), total: c.total, trajectory: c.trajectory })),
    dropped,
    ...(a.check?.brief ? { brief: a.check.brief } : {}),
    heldBack: s.heldBackPhrases,
    costUsd: a.costUsd,
    timings: a.timings,
  }
  return { data, workings }
}

/** The reading, as the snapshot carries it: the stamp and the denominators
 *  frozen, the figures already on `data.figures`, and neither the verdicts nor
 *  the surfaces' own data duplicated here. */
export function documentReading(r: BriefReading): DocumentReading {
  return {
    month: r.month,
    monthLabel: r.monthLabel,
    monthStatus: r.monthStatus,
    readingAt: r.readingAt,
    stamp: briefStamp(r),
    denominators: r.denominators.map((d) => ({ ...d })),
    platformMix: { ...r.platformMix },
    crossesClustering: r.crossesClustering,
    // THE FOOTNOTE AND THE DELIVERY LINE, FROZEN (E-sales, `sales.p7`). Both
    // were composed on every reading and consumed only by `methodItems`, as
    // prose inside one paragraph. The method SHEET prints them as what they
    // are — a footnote under the numbers card, and the record of how many
    // updates there have been — and a stored artefact has to keep them.
    method: r.method,
    delivery: r.delivery,
    confidence: r.confidence,
  }
}

/** The platforms the update's phrases came from: the honest list of what was read. */
function sourcesOf(s: Signals): string[] {
  const platforms = new Set<string>()
  for (const p of s.phrases) if (p.platform) platforms.add(p.platform)
  return [...platforms].sort()
}

const PLATFORM_NAME: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit' }

/** The report's basis, in code: what was read, how findings are ordered,
 *  how confidence is judged, what was held back. Not evidence per line; the
 *  page a professional report ends on. */
export function methodItems(s: Signals, period: string, thin: boolean, updatesCount: number, kinds: DocPageKind[] = ['competitor', 'personas'], brief?: string): string[] {
  const sources = sourcesOf(s).map((p) => PLATFORM_NAME[p] ?? p)
  const competitors = s.competitors.map((c) => c.name)
  const has = (k: DocPageKind) => kinds.includes(k)
  // The third paragraph explains the pages this brief ACTUALLY has. It used
  // to describe competitor pages and personas unconditionally, which on a
  // leadership brief (neither) was a method note for a different document.
  const wherePagesComeFrom = [
    has('competitor') ? "Competitor pages read each competitor's own videos for what it pitches, videos other people posted about it for what others say, and its audience's comments for praise and complaint." : '',
    has('standing') ? 'Standing is measured as share of the tracked video conversation, and movement is called only where the numbers can carry it.' : '',
    has('say_hear') ? "The claims page sets what the company says in its own videos against what the tracked conversation does with it; a claim it does not take up is recorded as not taken up, never answered on its behalf." : '',
    has('personas') ? 'Personas come from the consumer profile, which groups the whole conversation by who is speaking and where they are in the journey.' : '',
    has('asked') ? 'The questions page carries what the conversation asks and does not settle, in the wording the audience uses.' : '',
  ].filter(Boolean).join(' ')
  // A custom brief says what it was asked, first: a reader of the PDF (and a
  // reader of the snapshot later) can otherwise not tell what this document
  // was written to answer. Operator prose, printed as written.
  const asked = brief?.replace(/\s+/g, ' ').trim()
  // WHAT THE BRIEF IS A READING OF. Two bases, and the page says which. With a
  // monthly reading the basis is the month, dated by the comment, with its
  // denominator per audience and the platform mix behind it — the three things
  // no brief has ever printed. Without one it is the update, exactly as before,
  // and the page says the month-by-month reading was not available rather than
  // letting a reader take an update for a month.
  // DEFENSIVE, and not from timidity: a `Signals` is constructed by the build
  // path, by scripts/build-document.ts and by fixtures, and a brief that
  // throws because one of them predates item 43 is worse than a brief that
  // prints the update basis.
  const r = s.reading ?? null
  const missing = s.missing ?? []
  const basis = r
    ? `This brief is a reading of ${r.monthLabel}, written from public conversation around ${s.company}, ${competitors.length ? `${competitors.join(', ')} ` : ''}and the wider category. ${denominatorLine(r.denominators)}${platformLine(r.platformMix) ? ` Across ${platformLine(r.platformMix)}.` : ''} A month is dated by when the comment was written, not by when we looked${r.monthStatus === 'filling' ? ', and this month is still filling' : ''}. ${briefStamp(r)}.`
    : `This brief is written from public conversation around ${s.company}, ${competitors.length ? `${competitors.join(', ')} ` : ''}and the wider category: ${fmtCount(s.run.conversations)} conversations on ${fmtCount(s.run.videos)} videos in the ${period.replace(/^Update/, 'update')}${sources.length ? `, on ${sources.join(', ')}` : ''}. The month-by-month reading is not recorded for this workspace yet, so these are the update's own numbers. A conversation is one comment or spoken line the analysis cited; the analysis reads what people said in public, not sales calls or surveys.`

  return [
    asked ? `This brief was written to answer an instruction from ${s.company}: "${/[.!?]$/.test(asked) ? asked : `${asked}.`}"` : '',
    basis,
    r && sources.length ? `The words quoted in it were read on ${sources.join(', ')}.` : '',
    r?.crossesClustering ? CLUSTERING_CAVEAT : '',
    ...(missing.length ? [missingSummary(missing) ?? '', ...missing.map(missingSentence)] : []),
    `Findings are the researcher's readings of that conversation, ordered by the evidence behind them. Each rests on grounded points the analysis extracted and verified; confidence is judged from how many conversations and how many independent strands support the reading (solid, reasonable or thin), never by the writer.${thin ? ' This update was thin, so fewer findings were written rather than stretch the evidence.' : ''}`,
    `${wherePagesComeFrom}${wherePagesComeFrom && s.heldBackPhrases ? ' ' : ''}${s.heldBackPhrases ? `${fmtCount(s.heldBackPhrases)} phrases in other languages were read for the counts but not quoted.` : ''}`,
    updatesCount > 1
      ? `This is update ${updatesCount} for ${s.company}. Where a finding carries from the previous brief it says so; "new this update" means the theme was first seen now. Movement is called only after three updates.`
      : `This is the first update for ${s.company}; there is nothing yet to compare with.`,
    // ── the method footnote, at last on a document (block D, D9) ──────────
    //
    // `sales.p7.footnote`, `content.p5.delivery` and `content.p5.caveat`, all
    // three of them sentences the product already composes and no brief has
    // ever printed. They go LAST, after the basis and the ordering rules,
    // because they are the fine print rather than the argument — and each one
    // carries its own basis, which is the whole reason they are separate
    // sentences rather than one paragraph:
    //
    //   · the delivery line is RUN-dated, and names the updates;
    //   · the read-depth and language shares are ALL-TIME, and say so;
    //   · the caveat is this month's, about the client's own side.
    r?.delivery ? `${r.delivery}${r.counter ? ` — ${r.counter}.` : '.'}` : '',
    // THE OTHER FIVE MOVED TO THE CARD (E-sales). `methodLines`' read-depth,
    // language, Reddit and privacy sentences are the artboard's FOOTNOTE — the
    // mono rule under the numbers card, which is where a reader looks for the
    // fine print — and the deck prints them there off `reading.method`. Two
    // renderings of one sentence on one sheet is the drift `lib/reading/method.ts`
    // was written to end, so the paragraph arm goes rather than both staying.
    r?.hollow ?? '',
  ].filter(Boolean)
}

/**
 * One slide per page, plus the cover. Pagination decided here, never by the
 * browser.
 *
 * WP19: a brief composed from a section map paginates off `layout`, which
 * carries the written pages and the borrowed blocks in one order. A brief built
 * before the maps has no `layout` and paginates off `pages`, exactly as it did
 * — a stored artefact must keep rendering what it rendered.
 */
export function documentSlides(data: DocumentSnapshotData): Slide[] {
  if (!data.layout?.length) {
    return data.pages.map((p) => ({ title: p.title, keys: [p.id], layout: 'single' as const }))
  }
  const out: Slide[] = []
  for (const entry of data.layout) {
    if (entry.kind === 'page') {
      const page = data.pages.find((p) => p.id === entry.id)
      if (page) out.push({ title: page.title, keys: [page.id], layout: 'single' })
      continue
    }
    const section = data.sections?.find((x) => x.id === entry.id)
    if (section) out.push({ title: section.title, keys: [`${SECTION_SLIDE_PREFIX}${section.id}`], layout: 'single' })
  }
  return out
}

/** The section a slide key names, or null where it names a written page. */
export function sectionOfSlide(data: DocumentSnapshotData, key: string): DocBriefSection | null {
  if (!key.startsWith(SECTION_SLIDE_PREFIX)) return null
  return data.sections?.find((x) => x.id === key.slice(SECTION_SLIDE_PREFIX.length)) ?? null
}
