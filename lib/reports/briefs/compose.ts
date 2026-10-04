import type { WhoVideo } from '../../brands/attribution'
import { fmtInt, longMonth } from '../../format'
import type { PlaybookBlock } from '../../pages/playbook'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, isRivalAudience, rivalNameOf } from '../../rivals'
import type { StandingFact } from '../../written/types'
import type { WeekScrubCounts } from '../../written/scrub'
import { overlapOfSmaller, referencesFor } from './allocate'
import { unionOf } from './ground'
import type { QuotePool } from './quotes'
import { addCounts, scrubBriefText, ZERO_COUNTS, type BriefField } from './scrub'
import { ROLE_SECTIONS, groundedRival, sectionTitle, selectRoleSections, standingItems } from './sections'
import type { AllocatedIdea, Allocation, BriefFigure, BriefFinding, BriefItem, BriefRole, BriefSection, GroundedPoint, MonthlyBriefData, SectionKey } from './types'
import { BRIEF_NAME } from './types'
import { BRIEF_MAX, BRIEF_PROMPT_VERSION, PARTS, partOf, type BriefOutput } from './write'

// From the writer's output and code's material to one department's brief
// (pure). Code owns: which findings print (allocate.ts), their order, every
// count and who it is about, which section items stand (sections.ts), which
// quotes print (quotes.ts), the figures, and the one line that names each of
// the month's other ideas. The writer owns the words inside the fields, after
// the scrub (scrub.ts).

/** One month of one audience, as `month_denominators` holds it. */
export interface AudienceRow {
  audience: string
  videos: number
  comments: number
}

/** An item whose cited points are at least this share the brief's own
 *  finding's is that finding again. */
export const SAME_AS_FINDING = 0.5

/** The share of an item's points that are among `of`. */
const cover = (ids: readonly string[], of: readonly string[]): number => {
  if (ids.length === 0) return 0
  const set = new Set(of)
  return ids.filter((id) => set.has(id)).length / ids.length
}

/** Specific words a printed voice must share with what it sits beside
 *  (quotes.ts `specificRelevance`): two, so one shared word ("price") is not
 *  enough to call a voice an illustration. */
export const QUOTE_MIN_RELEVANCE = 2

/** Claims on "What the company says, and what comes back". */
export const SAY_HEAR_MAX = 4

/** A rival takes a row on the shares section with at least this many videos
 *  in the month. */
export const SHARE_MIN_VIDEOS = 3
/** A format or opening is compared on its median only over this many rated
 *  videos (more than the page's own floor of three: a sentence rests on it). */
export const FORMAT_LINE_MIN_RATED = 10
/** Short phrases on "Words to borrow", and voices on "In its own words". */
export const PHRASES_MAX = 4

export interface ComposeInput {
  role: BriefRole
  company: string
  /** `YYYY-MM-01`. */
  month: string
  noun: string | null
  allocation: Allocation
  points: readonly GroundedPoint[]
  /** Each point's counted videos with who they are about. */
  whoVideos: ReadonlyMap<string, readonly WhoVideo[]>
  quotes: QuotePool
  written: BriefOutput | null
  /** The tracked rivals (their names, as the tenant tracks them). */
  rivals: readonly string[]
  /** Marketing: the company's claims, as the writer was shown them. */
  claims?: readonly { id: string; claim: string }[]
  /** Leadership: the subjects, as the writer was shown them. */
  subjects?: readonly { id: string; fact: StandingFact }[]
  /** The month's audiences (client, each rival, the category). */
  audiences: readonly AudienceRow[] | null
  /** The market's month: the category and the tracked rivals, pooled. */
  market: { videos: number | null; comments: number | null } | null
  /** Posts the company published in the month, or null where not read. */
  ownPosts: number | null
  /** Which brands the product counts talk for (the hand-checked brand rules,
   *  lib/brands/precision.ts): the client, and the rivals by name. A tenant
   *  whose brands are not counted (Össur today: its Competitive page is empty)
   *  gets no share of talk by brand, rather than one its own pages do not
   *  show, measured one way for itself and another for its rivals. */
  brandsCounted: { client: boolean; rivals: readonly string[] }
  playbook: PlaybookBlock | null
  model: string
  costUsd: number
}

const pct1 = (k: number, n: number): string => `${(Math.round((k / n) * 1000) / 10).toFixed(1)}%`
const pct0 = (k: number, n: number): string => `${Math.round((k / n) * 100)}%`
const COUNT_WORD = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const RANK = ['largest', 'second largest', 'third largest', 'fourth largest', 'fifth largest', 'sixth largest', 'seventh largest', 'eighth largest']
const BIGGEST = ['biggest', 'second biggest', 'third biggest', 'fourth biggest', 'fifth biggest', 'sixth biggest', 'seventh biggest', 'eighth biggest']

export function composeBrief(a: ComposeInput): { data: MonthlyBriefData; counts: WeekScrubCounts } {
  const month = longMonth(a.month)
  const co = a.company
  let counts = ZERO_COUNTS
  const held: MonthlyBriefData['held'] = []
  const run = (raw: string, max: number, field: BriefField, o: { maxSentences?: number; whole?: boolean } = {}) => {
    const r = scrubBriefText(raw ?? '', max, { company: co, field, ...o })
    counts = addCounts(counts, r.counts)
    return r.text
  }
  const byId = new Map(a.points.map((p) => [p.id.toUpperCase(), p]))
  const whoOf = (ids: readonly string[]) => ids.flatMap((id) => a.whoVideos.get(id) ?? [])
  const evidenceOf = (ids: readonly string[]) => {
    const pts = ids.map((id) => byId.get(id)).filter((p): p is GroundedPoint => p != null)
    return unionOf(pts, whoOf(pts.map((p) => p.id)), co)
  }
  const mine = a.allocation.ideas.filter((i) => i.home === a.role)
  const ideaPointIds = new Set(mine.flatMap((i) => i.points))
  // What the writer was shown: this role's research and its own ideas' points.
  const allowed = new Set(a.points.filter((p) => p.usable && (p.role === a.role || ideaPointIds.has(p.id))).map((p) => p.id.toUpperCase()))
  const cite = (ids: readonly string[] | null | undefined): string[] =>
    [...new Set((ids ?? []).map((x) => String(x).trim().toUpperCase()))].filter((id) => allowed.has(id))

  // ---- findings --------------------------------------------------------------------------
  const findings: BriefFinding[] = []
  for (const idea of mine) {
    const w = (a.written?.findings ?? []).find((f) => String(f.idea).trim().toUpperCase() === idea.id)
    if (!w) { held.push({ what: idea.headline, reason: 'the writer wrote nothing for it' }); continue }
    const saw = run(w.saw, BRIEF_MAX.saw, 'market').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    const means = run(w.means, BRIEF_MAX.means, 'interpret')
    if (saw.length === 0 || !means) { held.push({ what: idea.headline, reason: 'the scrub left no saw or no means' }); continue }
    const practice = (w.practice ?? []).map((x) => run(x, BRIEF_MAX.practice, 'interpret', { maxSentences: 1, whole: true })).filter(Boolean).slice(0, BRIEF_MAX.practiceItems)
    const ev = evidenceOf(idea.points)
    findings.push({
      ideaId: idea.id,
      headline: idea.headline,
      basedOn: [...idea.points],
      saw,
      means,
      practice,
      months: ev.months,
      videos: ev.videos,
      who: ev.who,
      quotes: [
        ...a.quotes.pick(idea.points, `${idea.headline} ${saw.join(' ')}`, 1, { minRelevance: QUOTE_MIN_RELEVANCE }),
        ...a.quotes.pick(idea.points, idea.headline, 1, { minRelevance: QUOTE_MIN_RELEVANCE }),
      ],
    })
  }

  // ---- the writer's parts, as items ---------------------------------------------------------
  const otherIdeas = a.allocation.ideas.filter((i) => i.home !== a.role)
  const itemsOf = (key: string, opts: { rival?: boolean; aboutClient?: boolean } = {}): { lead: string; items: (BriefItem & { videos: number })[]; pointIds: string[] } => {
    const part = a.written ? partOf(a.written, key) : { lead: '', items: [] }
    const spec = PARTS[a.role].find((p) => p.key === key)
    const out: (BriefItem & { videos: number })[] = []
    const used = new Set<string>()
    for (const it of part.items.slice(0, spec?.max ?? BRIEF_MAX.items)) {
      const ids = cite(it.based_on)
      if (ids.length === 0) { held.push({ what: `${key}: ${it.title || it.text.slice(0, 60)}`, reason: 'it cites no point the brief was given' }); continue }
      let title = it.title.trim() === '""' ? '' : run(it.title, BRIEF_MAX.title, 'headline', { whole: true })
      if (opts.rival) {
        const rival = groundedRival(it.title, a.rivals, ids.map((id) => byId.get(id)?.text ?? ''))
        if (!rival) { held.push({ what: `${key}: ${it.title}`, reason: 'not a tracked rival a cited point names' }); continue }
        title = rival
      }
      const text = run(it.text, BRIEF_MAX.text, key === 'risks' || key === 'decisions' ? 'interpret' : 'market')
      const detail = it.detail.trim() === '""' ? '' : run(it.detail, BRIEF_MAX.detail, 'market')
      // One idea, one home, inside the brief too: an item that is the brief's
      // own finding again is held. A question for the business may rest on a
      // finding: asking what it means is not saying it twice.
      const finding = key === 'decisions' ? null : mine.find((i) => overlapOfSmaller(ids, i.points) >= SAME_AS_FINDING && cover(ids, i.points) >= SAME_AS_FINDING)
      if (finding) { held.push({ what: `${key}: ${it.title || it.text.slice(0, 60)}`, reason: `says what the finding "${finding.headline}" says` }); continue }
      const ev = evidenceOf(ids)
      // How the company is remembered, and what comes back on its claims, is
      // talk ABOUT the company: an item none of whose videos are about it
      // (its own posts, or a comment naming it) is someone else's story.
      if (opts.aboutClient && !ev.who.some((w) => w.about === 'client' && w.videos > 0)) {
        held.push({ what: `${key}: ${it.title || it.text.slice(0, 60)}`, reason: `none of its videos is about ${co}` })
        continue
      }
      // Another brief's idea is NAMED here in a line, never argued: an item
      // that rests mostly on it keeps its title and first sentence and says
      // where it is argued. A question for the business is not an argument.
      const elsewhere = key === 'decisions' ? null : otherIdeas.find((o) => cover(ids, o.points) >= SAME_AS_FINDING)
      const shown = elsewhere ? (text.split(/(?<=[.!?])\s+/)[0] ?? text) : text
      for (const id of ids) used.add(id)
      out.push({
        ...(title ? { title } : {}), text: shown, ...(detail && !elsewhere ? { detail } : {}),
        ...(elsewhere ? { tag: `Argued in the ${BRIEF_NAME[elsewhere.home]}` } : {}),
        videos: ev.videos, who: ev.who, basedOn: ids,
      })
    }
    const { kept, held: h } = standingItems(out)
    for (const x of h) held.push({ what: `${key}: ${x.what}`, reason: x.reason })
    return { lead: run(part.lead, BRIEF_MAX.lead, key === 'risks' || key === 'decisions' ? 'interpret' : 'market', { maxSentences: 2, whole: true }), items: kept as (BriefItem & { videos: number })[], pointIds: [...used] }
  }
  const quoteFor = (ids: readonly string[], claim: string) => (ids.length ? a.quotes.pick(ids, claim, 1, { minRelevance: QUOTE_MIN_RELEVANCE })[0] ?? null : null)
  const section = (key: SectionKey, groups: BriefSection['groups'], extra: Partial<BriefSection> = {}): BriefSection => {
    const spec = ROLE_SECTIONS[a.role].find((s) => s.key === key)!
    return { key, title: sectionTitle(spec, co), groups, ...extra }
  }
  const simple = (key: SectionKey, part: string, opts: { rival?: boolean; quote?: boolean } = {}): BriefSection | null => {
    const p = itemsOf(part, opts)
    if (p.items.length === 0) return null
    const quote = opts.quote ? quoteFor(p.pointIds, [p.lead, ...p.items.map((i) => `${i.title ?? ''} ${i.text}`)].join(' ')) : null
    return section(key, [{ items: p.items }], { ...(p.lead ? { lead: p.lead } : {}), ...(quote ? { quote } : {}) })
  }
  /** Items grouped by their title ("Remembered for", "Ahead on"). */
  const grouped = (key: SectionKey, part: string, order: readonly string[], opts: { aboutClient?: boolean } = {}): BriefSection | null => {
    const p = itemsOf(part, opts)
    if (p.items.length === 0) return null
    const groups = order
      .map((label) => ({ label, items: p.items.filter((i) => (i.title ?? '').toLowerCase() === label.toLowerCase()).map(untitled) }))
      .filter((g) => g.items.length > 0)
    if (groups.length === 0) return null
    return section(key, groups, p.lead ? { lead: p.lead } : {})
  }

  const built: Partial<Record<SectionKey, BriefSection | null>> = {}
  if (a.role === 'sales') {
    built['sales.buyers'] = simple('sales.buyers', 'buyers')
    built['sales.stops'] = simple('sales.stops', 'stops', { quote: true })
    built['sales.settle'] = simple('sales.settle', 'settle')
    built['sales.triggers'] = simple('sales.triggers', 'triggers', { quote: true })
    built['sales.rivals'] = simple('sales.rivals', 'rivals', { rival: true, quote: true })
    built['sales.care'] = simple('sales.care', 'care')
  }
  if (a.role === 'marketing') {
    const believe = itemsOf('believe')
    const doubt = itemsOf('doubt')
    const groups = [
      { label: 'What it believes', items: believe.items },
      { label: 'What it doubts', items: doubt.items },
    ].filter((g) => g.items.length > 0)
    const ids = [...believe.pointIds, ...doubt.pointIds]
    const quote = quoteFor(ids, [...believe.items, ...doubt.items].map((i) => i.text).join(' '))
    built['marketing.believe'] = groups.length ? section('marketing.believe', groups, { ...(believe.lead ? { lead: believe.lead } : {}), ...(quote ? { quote } : {}) }) : null
    const words = itemsOf('words')
    // The market's own words: short voices from every point the marketing
    // research grounded, judged against everything this section and the
    // beliefs say, so the page carries real words even where the writer's
    // own items are few.
    const marketingPoints = a.points.filter((p) => p.role === 'marketing' && p.usable).map((p) => p.id)
    const voices = a.quotes.phrases(marketingPoints, [...words.items, ...believe.items, ...doubt.items].map((i) => `${i.title ?? ''} ${i.text}`).join(' '), PHRASES_MAX - 1)
    const wordGroups = [
      ...(words.items.length ? [{ items: words.items }] : []),
    ]
    built['marketing.words'] = wordGroups.length || voices.length
      ? section('marketing.words', wordGroups, { ...(words.lead ? { lead: words.lead } : {}), ...(voices.length ? { voices } : {}) })
      : null
    built['marketing.say_hear'] = sayHear()
    built['marketing.recall'] = grouped('marketing.recall', 'recall', ['Remembered for', 'Held against it'], { aboutClient: true })
    built['marketing.rivals'] = simple('marketing.rivals', 'rivals', { rival: true })
  }
  if (a.role === 'content') {
    built['content.questions'] = simple('content.questions', 'questions')
    built['content.formats'] = formats()
    const come = itemsOf('come')
    const lose = itemsOf('lose')
    const watchGroups = [
      { label: 'What draws them', items: come.items },
      { label: 'What loses them', items: lose.items },
    ].filter((g) => g.items.length > 0)
    built['content.watch'] = watchGroups.length ? section('content.watch', watchGroups, come.lead ? { lead: come.lead } : {}) : null
    built['content.more'] = simple('content.more', 'more', { quote: true })
    built['content.confusion'] = simple('content.confusion', 'confusion')
    const ownPts = a.points.filter((p) => p.role === 'content' && p.usable)
    const phrases = a.quotes.phrases(ownPts.map((p) => p.id), ownPts.map((p) => p.text).join(' '), PHRASES_MAX)
    built['content.borrow'] = phrases.length ? section('content.borrow', [], { voices: phrases }) : null
  }
  if (a.role === 'leadership') {
    built['leadership.market'] = market()
    built['leadership.shares'] = shares()
    const weigh = itemsOf('weigh')
    const stay = itemsOf('stay')
    const move = itemsOf('move')
    const wg = [
      { label: 'What they weigh', items: weigh.items },
      { label: 'What keeps them', items: stay.items },
      { label: 'What moves them', items: move.items },
    ].filter((g) => g.items.length > 0)
    const wq = quoteFor([...weigh.pointIds, ...move.pointIds], [...weigh.items, ...move.items].map((i) => i.text).join(' '))
    built['leadership.weigh'] = wg.length ? section('leadership.weigh', wg, { ...(weigh.lead ? { lead: weigh.lead } : {}), ...(wq ? { quote: wq } : {}) }) : null
    built['leadership.risks'] = risks()
    built['leadership.decisions'] = simple('leadership.decisions', 'decisions')
  }

  // ---- marketing: what the company says, and what comes back ----------------------------------
  function sayHear(): BriefSection | null {
    const claims = a.claims ?? []
    const items: (BriefItem & { videos: number })[] = []
    for (const w of a.written?.say_hear ?? []) {
      const claim = claims.find((c) => c.id.toUpperCase() === String(w.claim).trim().toUpperCase())
      if (!claim) { held.push({ what: `say_hear: ${w.claim}`, reason: 'not a listed claim' }); continue }
      if (items.some((i) => i.title === claim.claim)) continue
      const ids = cite(w.based_on)
      const heard = run(w.heard, BRIEF_MAX.text, 'market')
      if (!heard || ids.length === 0) { held.push({ what: `say_hear: ${claim.claim}`, reason: 'nothing that stood came back on it' }); continue }
      const ev = evidenceOf(ids)
      if (!ev.who.some((w) => w.about === 'client' && w.videos > 0)) { held.push({ what: `say_hear: ${claim.claim}`, reason: `none of its videos is about ${co}` }); continue }
      // Two claims answered from the same talk are one answer told twice: the
      // one with more behind it stays.
      const twin = items.find((x) => overlapOfSmaller(x.basedOn ?? [], ids) >= SAME_AS_FINDING)
      if (twin && (twin.videos ?? 0) >= ev.videos) { held.push({ what: `say_hear: ${claim.claim}`, reason: `the same talk answers "${twin.title}"` }); continue }
      if (twin) {
        held.push({ what: `say_hear: ${twin.title}`, reason: `the same talk answers "${claim.claim}"` })
        items.splice(items.indexOf(twin), 1)
      }
      items.push({ title: claim.claim, text: heard, videos: ev.videos, who: ev.who, basedOn: ids })
    }
    const { kept, held: h } = standingItems(items)
    for (const x of h) held.push({ what: `say_hear: ${x.what}`, reason: x.reason })
    // The claims with the most behind them, at most `SAY_HEAR_MAX`.
    const top = [...kept].sort((x, y) => (y.videos ?? 0) - (x.videos ?? 0)).slice(0, SAY_HEAR_MAX)
    for (const x of kept.filter((k) => !top.includes(k))) held.push({ what: `say_hear: ${x.title ?? ''}`, reason: 'over the section\'s cap' })
    return top.length ? section('marketing.say_hear', [{ items: kept.filter((k) => top.includes(k)) }]) : null
  }

  // ---- content: what works in the market's videos (counted) -----------------------------------
  function formats(): BriefSection | null {
    const pb = a.playbook
    if (!pb || pb.unread) return null
    const linesFor = (m: PlaybookBlock['formats'], share: (pct: string) => string, kind: string): { items: BriefItem[]; line: string | null } => {
      // The client's own column prints its "of N" only where every post it
      // published carries a format; otherwise a count alone, where it has one,
      // so "9 of its 12" never sits beside "27 posts published" elsewhere.
      const cat = m.sides[0]
      const own = m.sides.find((s) => s.audience === CLIENT_AUDIENCE) ?? null
      if (!cat || cat.of === 0) return { items: [], line: null }
      const items: BriefItem[] = []
      for (const k of m.keys.slice(0, 4)) {
        const row = cat.byKey[k.key]
        if (!row || row.value.k === 0) continue
        const median = row.engagement.median != null && row.engagement.n >= FORMAT_LINE_MIN_RATED ? `, at a median engagement of ${row.engagement.median.toFixed(1)}%` : ''
        const mineRow = own && !own.unread ? own.byKey[k.key] : null
        const mine = mineRow?.value.k ?? 0
        const detail = !own || own.unread || own.of === 0
          ? ''
          : own.of >= own.published
            ? `${co}: ${fmtInt(mine)} of its ${fmtInt(own.of)} posts.`
            : mine > 0 ? `${co}: ${fmtInt(mine)} ${mine === 1 ? 'post' : 'posts'}.` : ''
        items.push({ title: k.label, text: `${share(pct0(row.value.k, cat.of))}${median}.`, ...(detail ? { detail } : {}) })
      }
      const rated = Object.values(cat.byKey).filter((r): r is NonNullable<typeof r> => r != null && r.engagement.median != null && r.engagement.n >= FORMAT_LINE_MIN_RATED)
      const best = [...rated].sort((x, y) => (y.engagement.median ?? 0) - (x.engagement.median ?? 0))[0]
      const overall = cat.median.value
      const line = best && overall != null && (best.engagement.median ?? 0) > overall
        ? `${best.label} ${kind} run at a median engagement of ${best.engagement.median!.toFixed(1)}%, against ${overall.toFixed(1)}% for all the market's videos.`
        : null
      return { items, line }
    }
    const f = linesFor(pb.formats, (p) => `${p} of the market's videos published in ${month}`, 'videos')
    const h = linesFor(pb.hooks, (p) => `${p} of them open this way`, 'openings')
    const groups = [
      ...(f.items.length ? [{ label: 'Formats', items: f.items, ...(f.line ? { lines: [f.line] } : {}) }] : []),
      ...(h.items.length ? [{ label: 'Openings', items: h.items, ...(h.line ? { lines: [h.line] } : {}) }] : []),
    ]
    if (groups.length === 0) return null
    return section('content.formats', groups, { lead: `The videos published in the market in ${month}, by format and by how they open, with ${co}'s own posts beside them.` })
  }

  // ---- leadership: where the market stands (every tracked subject) ---------------------------------
  function market(): BriefSection | null {
    const subjects = a.subjects ?? []
    if (subjects.length === 0) return null
    const sentences = new Map((a.written?.subjects ?? []).map((s) => [String(s.subject).trim().toUpperCase(), run(s.sentence, BRIEF_MAX.subject, 'market', { maxSentences: 1 })]))
    const ready = subjects.filter(({ fact }) => fact.calibration === 'ready' && fact.level && fact.level.n > 0)
      .sort((x, y) => (x.fact.rank || 99) - (y.fact.rank || 99))
    const rest = subjects.filter((s) => !ready.includes(s) && s.fact.calibration !== 'failed')
    const items: BriefItem[] = []
    const also: string[] = []
    for (const { id, fact } of [...ready, ...rest]) {
      const sentence = sentences.get(id.toUpperCase()) ?? ''
      const level = fact.calibration === 'ready' && fact.level && fact.level.n > 0
        ? `${pct0(fact.level.k, fact.level.n)} of ${month}'s videos in the market${fact.rank >= 1 && fact.rank <= BIGGEST.length ? `, the ${BIGGEST[fact.rank - 1]} subject` : ''}.`
        : ''
      if (!sentence && !level) { also.push(fact.name); continue }
      items.push({ title: fact.name, text: sentence || level, ...(sentence && level ? { detail: level } : {}) })
    }
    for (const { fact } of subjects) if (fact.calibration === 'failed') also.push(fact.name)
    const lines = also.length ? [`Also following: ${also.join(', ')}.`] : []
    if (items.length === 0 && lines.length === 0) return null
    return section('leadership.market', items.length ? [{ items }] : [], lines.length ? { lines } : {})
  }

  // ---- leadership: where the company stands (counted, and what people say) ------------------------
  function shares(): BriefSection | null {
    const rows = a.audiences ?? []
    const client = rows.find((r) => r.audience === CLIENT_AUDIENCE) ?? null
    const rivals = rows.filter((r) => isRivalAudience(r.audience) && r.videos >= SHARE_MIN_VIDEOS)
      .filter((r) => a.rivals.some((n) => n.toLowerCase() === (rivalNameOf(r.audience) ?? '').toLowerCase()))
      .filter((r) => a.brandsCounted.rivals.some((n) => n.toLowerCase() === (rivalNameOf(r.audience) ?? '').toLowerCase()))
    const category = rows.find((r) => r.audience === INDUSTRY_AUDIENCE) ?? null
    // Where the company stands needs talk about the company: rival praise
    // alone does not put the company behind it.
    const stand = itemsOf('stand', { aboutClient: true })
    const standGroups = ['Ahead on', 'Behind on']
      .map((label) => ({ label, items: stand.items.filter((i) => (i.title ?? '').toLowerCase() === label.toLowerCase()).map(untitled) }))
      .filter((g) => g.items.length > 0)
    const comments = rows.reduce((n, r) => n + r.comments, 0)
    const videos = rows.reduce((n, r) => n + r.videos, 0)
    const items: BriefItem[] = []
    const lines: string[] = []
    if (a.brandsCounted.client && client && client.videos > 0 && rivals.length > 0 && comments > 0 && videos > 0) {
      const brands = [
        { name: co, row: client, you: true },
        ...rivals.map((r) => ({ name: rivalNameOf(r.audience) ?? r.audience, row: r, you: false })),
      ].sort((x, y) => y.row.comments - x.row.comments || x.name.localeCompare(y.name))
      for (const b of brands) {
        items.push({
          title: b.name,
          text: `${pct1(b.row.comments, comments)} of the comments, ${pct1(b.row.videos, videos)} of the videos.`,
          detail: b.you ? `On ${co}'s own posts.` : `On videos about ${b.name}.`,
          ...(b.you ? { tag: 'you' } : {}),
        })
      }
      const at = brands.findIndex((b) => b.you)
      if (rivals.length === 1) {
        const other = brands.find((b) => !b.you)!
        lines.push(`${co} draws a ${at === 0 ? 'larger' : 'smaller'} share of ${month}'s comments than ${other.name}.`)
      } else {
        lines.push(`Of ${co} and the ${COUNT_WORD[rivals.length] ?? fmtInt(rivals.length)} rivals beside it, ${co} draws the ${RANK[at] ?? `${at + 1}th largest`} share of ${month}'s comments.`)
      }
      if (category) lines.push(`The rest of the market holds ${pct1(category.comments, comments)} of the comments.`)
    }
    const groups = [
      ...(items.length ? [{ label: `Share of ${month}'s talk, ${co}'s own posts included: ${fmtInt(comments)} comments on ${fmtInt(videos)} videos`, items, ...(lines.length ? { lines } : {}) }] : []),
      ...standGroups,
    ]
    if (groups.length === 0) return null
    return section('leadership.shares', groups, stand.lead ? { lead: stand.lead } : {})
  }

  // ---- leadership: the risks (another brief's idea is named, not argued) ---------------------------
  function risks(): BriefSection | null {
    const p = itemsOf('risks')
    if (p.items.length === 0) return null
    return section('leadership.risks', [{ items: p.items }], p.lead ? { lead: p.lead } : {})
  }

  const { sections, held: sectionHeld } = selectRoleSections(a.role, built)
  for (const h of sectionHeld) held.push(h)

  // ---- in short -----------------------------------------------------------------------------
  const summary = run(a.written?.in_short ?? '', BRIEF_MAX.summary, 'interpret', { maxSentences: BRIEF_MAX.summarySentences })
  const data: MonthlyBriefData = {
    version: 1,
    kind: 'monthly_brief',
    role: a.role,
    title: `${BRIEF_NAME[a.role]} · ${month}`,
    company: co,
    month: a.month,
    heardMonths: [...new Set(findings.flatMap((f) => f.months.filter((m) => m.videos > 0).map((m) => m.month)))].sort(),
    inShort: { summary, figures: figuresFor(a), also: referencesFor(a.role, a.allocation) },
    findings,
    sections,
    held,
    promptVersion: BRIEF_PROMPT_VERSION,
    model: a.model,
    costUsd: Math.round(a.costUsd * 10_000) / 10_000,
  }
  return { data, counts }
}

/** An item without its title: the title named its group. */
const untitled = (i: BriefItem): BriefItem => {
  const out = { ...i }
  delete out.title
  return out
}

/** The figures In short prints, each from a count code holds: the market's
 *  month for everyone, then one that belongs to the reader. Pure. */
export function figuresFor(a: Pick<ComposeInput, 'role' | 'company' | 'month' | 'market' | 'subjects' | 'ownPosts' | 'playbook' | 'audiences' | 'brandsCounted'>): BriefFigure[] {
  const month = longMonth(a.month)
  const out: BriefFigure[] = []
  if (a.market?.videos) out.push({ value: fmtInt(a.market.videos), label: `videos in your market in ${month}${a.market.comments ? `, with ${fmtInt(a.market.comments)} comments` : ''}` })
  if (a.role === 'sales') {
    const top = (a.subjects ?? []).map((s) => s.fact).filter((f) => f.calibration === 'ready' && f.level && f.level.n > 0 && f.rank === 1)[0]
    if (top?.level) out.push({ value: pct0(top.level.k, top.level.n), label: `of them about ${top.name}, the biggest subject` })
  }
  if (a.role === 'marketing' && a.ownPosts != null && a.ownPosts > 0) out.push({ value: fmtInt(a.ownPosts), label: `posts ${a.company} published in ${month}` })
  if (a.role === 'content' && a.playbook && !a.playbook.unread) {
    const cat = a.playbook.formats.sides[0]
    const best = a.playbook.engagement.find((r) => r.engagement.median != null && r.engagement.n >= FORMAT_LINE_MIN_RATED)
    if (best && cat?.median.value != null && (best.engagement.median ?? 0) > cat.median.value) {
      out.push({ value: `${best.engagement.median!.toFixed(1)}%`, label: `median engagement on the market's ${best.label.toLowerCase()} videos, against ${cat.median.value.toFixed(1)}% for all its videos` })
    }
  }
  if (a.role === 'leadership' && a.brandsCounted.client) {
    const rows = a.audiences ?? []
    const client = rows.find((r) => r.audience === CLIENT_AUDIENCE)
    const comments = rows.reduce((n, r) => n + r.comments, 0)
    if (client && client.comments > 0 && comments > 0) out.push({ value: pct1(client.comments, comments), label: `of ${month}'s comments were on ${a.company}'s own posts` })
  }
  return out
}

/** Where two briefs of one set rest on the same research: each pair of items
 *  (or findings) in different briefs citing mostly the same points. The
 *  README's self-check reads this; nothing is held for it, because a section
 *  may list a question that another brief's finding argues. Pure. */
export function repeatsAcross(briefs: readonly MonthlyBriefData[]): { a: string; b: string; overlap: number }[] {
  const units = briefs.flatMap((d) => [
    ...d.findings.map((f) => ({ where: `${d.role} finding "${f.headline}"`, role: d.role, ids: f.basedOn, idea: f.ideaId as string | null })),
    ...d.sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => ({ where: `${d.role} ${s.key} "${(i.title ?? i.text).slice(0, 60)}"`, role: d.role, ids: i.basedOn ?? [], idea: null as string | null })))),
  ])
  const out: { a: string; b: string; overlap: number }[] = []
  for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
    const x = units[i]
    const y = units[j]
    if (x.role === y.role || x.ids.length === 0 || y.ids.length === 0) continue
    const o = overlapOfSmaller(x.ids, y.ids)
    if (o >= 0.5) out.push({ a: x.where, b: y.where, overlap: Math.round(o * 100) / 100 })
  }
  return out
}

/** The idea ids a set of briefs prints, and where: every idea exactly once. */
export function ideaHomes(briefs: readonly MonthlyBriefData[]): Map<string, BriefRole[]> {
  const out = new Map<string, BriefRole[]>()
  for (const d of briefs) for (const f of d.findings) out.set(f.ideaId, [...(out.get(f.ideaId) ?? []), d.role])
  return out
}

export type { AllocatedIdea }
