import { names } from '../../agent/scope'
import { aboutNamed, type WhoVideo } from '../../brands/attribution'
import type { About } from '../../brands/labels'
import { fmtInt, longMonth } from '../../format'
import type { PlaybookBlock } from '../../pages/playbook'
import { CLIENT_AUDIENCE, isRivalAudience, rivalNameOf } from '../../rivals'
import { splitSentences } from '../../prose/scrub'
import type { StandingFact } from '../../written/types'
import type { WeekScrubCounts } from '../../written/scrub'
import { overlapOfSmaller, referencesFor } from './allocate'
import { unionOf } from './ground'
import { FIT, type Meaning } from './meaning'
import type { QuotePool } from './quotes'
import { addCounts, hyphenatedNames, restoreNames, scrubBriefText, tradeOff, varySubjects, ZERO_COUNTS, type BriefField } from './scrub'
import { BRAND_MIN_VIDEOS, ROLE_SECTIONS, groundedRival, sectionTitle, selectRoleSections, standingItems } from './sections'
import type { AllocatedIdea, Allocation, BriefFigure, BriefFinding, BriefItem, BriefRole, BriefSection, GroundedPoint, MonthlyBriefData, SectionKey } from './types'
import { BRIEF_NAME, BRIEF_ROLES } from './types'
import { BRIEF_MAX, BRIEF_PROMPT_VERSION, PARTS, partOf, type BriefOutput } from './write'

// From the writer's output and code's material to one department's brief
// (pure). Code owns: which findings print (allocate.ts), their order, every
// count and who it is about, which section items stand (sections.ts), which
// quotes print (quotes.ts), the figures, and the one line that names each of
// the month's other ideas. The writer owns the words inside the fields, after
// the scrub (scrub.ts).
//
// AN ITEM RESTS ON WHAT IT SAYS (the fix pass, 4 Oct). The writer cites
// points; code keeps only the cited points the item carries the meaning of
// (`Meaning`, `FIT.item`), from the questions its part is written from
// (`PartSpec.from`) or the brief's own ideas, and its count and who it is
// about come from those alone. An item that names a brand rests on at least
// `BRAND_MIN_VIDEOS` videos about that brand. A second line (a rival's
// pushback, what is behind a question) prints only where a kept point carries
// it too. An item that says what this brief's finding says, or what an
// earlier item says on the same videos, is held; one that rests on another
// brief's idea keeps a line and says where it is argued. A label the scrub
// drops takes its item to `held`, never off the page in silence.

/** One month of one audience, as `month_denominators` holds it. */
export interface AudienceRow {
  audience: string
  videos: number
  comments: number
}

/** Half or more of an item's points, or of its videos, is that idea again. */
export const SAME_AS_FINDING = 0.5

/** The share of an item's points that are among `of`. */
export const cover = (ids: readonly string[], of: readonly string[]): number => {
  if (ids.length === 0) return 0
  const set = new Set(of)
  return ids.filter((id) => set.has(id)).length / ids.length
}

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
/** The formats and openings a section lists, and the only ones a line may
 *  name. */
export const FORMAT_ROWS = 4

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
  meaning: Meaning
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
  /** Comments in the month on the company's own giveaway posts (a caption
   *  that runs a giveaway or a competition), which a share line flags. */
  giveaway: { posts: number; comments: number } | null
  playbook: PlaybookBlock | null
  /** Which brands the product counts talk for (the hand-checked brand rules,
   *  lib/brands/precision.ts): the client, and the rivals by name. A tenant
   *  whose brands are not counted (Össur today: its Competitive page is empty)
   *  gets no share of talk by brand. */
  brandsCounted: { client: boolean; rivals: readonly string[] }
  model: string
  costUsd: number
}

const pct1 = (k: number, n: number): string => `${(Math.round((k / n) * 1000) / 10).toFixed(1)}%`
const pct0 = (k: number, n: number): string => `${Math.round((k / n) * 100)}%`
const BIGGEST = ['biggest', 'second biggest', 'third biggest', 'fourth biggest', 'fifth biggest', 'sixth biggest', 'seventh biggest', 'eighth biggest']
const firstSentence = (s: string): string => splitSentences(s)[0] ?? s

export function composeBrief(a: ComposeInput): { data: MonthlyBriefData; counts: WeekScrubCounts; scrubbed: { field: string; sentence: string; rule: string }[] } {
  const month = longMonth(a.month)
  const co = a.company
  let counts = ZERO_COUNTS
  const held: MonthlyBriefData['held'] = []
  const scrubbed: { field: string; sentence: string; rule: string }[] = []
  const productNames = hyphenatedNames(a.points.map((p) => p.text))
  const polish = (s: string) => varySubjects(tradeOff(restoreNames(s, productNames)))
  const scrub = (raw: string, max: number, field: BriefField, where: string, o: { maxSentences?: number; whole?: boolean } = {}) => {
    const r = scrubBriefText(raw ?? '', max, { company: co, field, ...o })
    counts = addCounts(counts, r.counts)
    for (const d of r.dropped) scrubbed.push({ field: where, ...d })
    return { text: polish(r.text), rule: r.dropped[0]?.rule ?? null }
  }
  const run = (raw: string, max: number, field: BriefField, where: string, o: { maxSentences?: number; whole?: boolean } = {}) => scrub(raw, max, field, where, o).text
  const byId = new Map(a.points.map((p) => [p.id.toUpperCase(), p]))
  const whoOf = (ids: readonly string[]) => ids.flatMap((id) => a.whoVideos.get(id) ?? [])
  const evidenceOf = (ids: readonly string[]) => {
    const pts = ids.map((id) => byId.get(id)).filter((p): p is GroundedPoint => p != null)
    return unionOf(pts, whoOf(pts.map((p) => p.id)), co)
  }
  /** The distinct videos among `ids`' points that are about `about`. */
  const videosAbout = (ids: readonly string[], about: About): number =>
    new Set(whoOf(ids).filter((v) => aboutNamed(v, co) === about).map((v) => v.id)).size
  const brandsNamed = (text: string, withCompany: boolean): { name: string; about: About }[] => [
    ...(withCompany && names(text, co) ? [{ name: co, about: 'client' as About }] : []),
    ...a.rivals.filter((r) => names(text, r)).map((r) => ({ name: r, about: `rival:${r}` as About })),
  ]
  const mine = a.allocation.ideas.filter((i) => i.home === a.role)
  const otherIdeas = a.allocation.ideas.filter((i) => i.home !== a.role)
  const ideaVideos = new Map(a.allocation.ideas.map((i) => [i.id, evidenceOf(i.points).videoIds]))
  const ideaPointIds = new Set(mine.flatMap((i) => i.points))

  // ---- findings --------------------------------------------------------------------------
  const findings: BriefFinding[] = []
  for (const idea of mine) {
    const w = (a.written?.findings ?? []).find((f) => String(f.idea).trim().toUpperCase() === idea.id)
    if (!w) { held.push({ what: idea.headline, reason: 'the writer wrote nothing for it' }); continue }
    // What was heard about a brand rests on videos about it: a sentence that
    // names one with fewer than BRAND_MIN_VIDEOS of the idea's videos about
    // it drops ("People under Össur's posts ask…" on one video). What it
    // means for the company may name the company.
    const shortBrand = (s: string) => brandsNamed(s, true).find((b) => videosAbout(idea.points, b.about) < BRAND_MIN_VIDEOS)
    const heardOnly = (text: string, where: string) => text.split(/\n\s*\n/).map((para) => splitSentences(para).filter((s) => {
      const b = shortBrand(s)
      if (b) scrubbed.push({ field: where, sentence: s, rule: `names ${b.name} on ${videosAbout(idea.points, b.about)} videos about it` })
      return !b
    }).join(' ')).filter(Boolean).join('\n\n')
    const short = shortBrand(idea.headline)
    if (short) { held.push({ what: idea.headline, reason: `only ${videosAbout(idea.points, short.about)} of its videos are about ${short.name}` }); continue }
    const saw = heardOnly(run(w.saw, BRIEF_MAX.saw, 'market', `${idea.id}.saw`), `${idea.id}.saw`).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    const means = run(w.means, BRIEF_MAX.means, 'interpret', `${idea.id}.means`)
    if (saw.length === 0 || !means) { held.push({ what: idea.headline, reason: 'the scrub left no saw or no means' }); continue }
    const practice = (w.practice ?? []).map((x, i) => heardOnly(run(x, BRIEF_MAX.practice, 'interpret', `${idea.id}.practice${i}`, { maxSentences: 1, whole: true }), `${idea.id}.practice${i}`)).filter(Boolean).slice(0, BRIEF_MAX.practiceItems)
    const ev = evidenceOf(idea.points)
    findings.push({
      ideaId: idea.id,
      headline: polish(idea.headline),
      basedOn: [...idea.points],
      saw,
      means,
      practice,
      months: ev.months,
      videos: ev.videos,
      who: ev.who,
      // Two voices from two videos, in one pick, closest to the finding.
      quotes: a.quotes.pick(idea.points, `${idea.headline}. ${saw.join(' ')}`, 2),
    })
  }

  // ---- the writer's parts, as items ---------------------------------------------------------
  /** Items printed so far in this brief, for the in-brief repeat check. */
  const printed: { item: BriefItem; videoIds: string[] }[] = []
  type Built = { lead: string; items: BriefItem[]; pointIds: string[] }
  const itemsOf = (key: string, opts: { rival?: boolean; aboutClient?: boolean } = {}): Built => {
    const part = a.written ? partOf(a.written, key) : { lead: '', items: [] }
    const spec = PARTS[a.role].find((p) => p.key === key)
    const from = new Set(spec?.from ?? [])
    // What this part may rest on: its own questions' points, or the brief's
    // own ideas' points (PartSpec.from, the review's addendum).
    const mayCite = (id: string) => {
      const p = byId.get(id)
      return !!p && p.usable && (from.has(p.questionId) || ideaPointIds.has(p.id))
    }
    const field: BriefField = key === 'risks' || key === 'decisions' ? 'interpret' : 'market'
    const out: (BriefItem & { videos: number })[] = []
    const used = new Set<string>()
    for (const [n, it] of part.items.slice(0, spec?.max ?? BRIEF_MAX.items).entries()) {
      const what = `${key}: ${it.title || it.text.slice(0, 60)}`
      // A part with no title whose writer put the line in the title (Össur's
      // questions for the business came back that way) prints it as the text.
      const untitledPart = spec?.title === '""'
      const moved = untitledPart && !it.text.trim() && it.title.trim() && it.title.trim() !== '""'
      const rawTitle = untitledPart || it.title.trim() === '""' ? '' : it.title.trim()
      const rawText = moved ? it.title : it.text
      const t = rawTitle ? scrub(rawTitle, BRIEF_MAX.title, 'headline', `${key}${n}.title`, { whole: true }) : { text: '', rule: null }
      if (rawTitle && !t.text) { held.push({ what, reason: `its label broke a rule (${t.rule ?? 'the scrub'})` }); continue }
      let title = t.text
      const tx = scrub(rawText, BRIEF_MAX.text, field, `${key}${n}.text`)
      if (!tx.text) { held.push({ what, reason: `its text broke a rule (${tx.rule ?? 'the scrub'})` }); continue }
      const text = tx.text
      const rawDetail = it.detail.trim() === '""' ? '' : it.detail
      let detail = rawDetail ? run(rawDetail, BRIEF_MAX.detail, 'market', `${key}${n}.detail`) : ''
      const cited = [...new Set((it.based_on ?? []).map((x) => String(x).trim().toUpperCase()))].filter(mayCite)
      if (cited.length === 0) { held.push({ what, reason: 'it cites no point its part is written from' }); continue }
      const said = `${title ? `${title}. ` : ''}${text}`
      let ids = cited.filter((id) => a.meaning.sim(said, byId.get(id)!.text) >= (key === 'decisions' ? FIT.question : FIT.item))
      if (ids.length === 0) { held.push({ what, reason: 'it says nothing the points it cites say' }); continue }
      if (opts.rival) {
        const rival = groundedRival(rawTitle, a.rivals, ids.map((id) => byId.get(id)?.text ?? ''))
        if (!rival) { held.push({ what, reason: 'not a tracked rival a cited point names' }); continue }
        title = rival
        // A rival's entry rests only on talk about that rival.
        ids = ids.filter((id) => videosAbout([id], `rival:${rival}`) > 0)
      }
      // A brand named rests on videos about it (a question for the business
      // may name the company it is put to).
      const short = brandsNamed(said, key !== 'decisions').find((b) => videosAbout(ids, b.about) < BRAND_MIN_VIDEOS)
      if (short) { held.push({ what, reason: `only ${videosAbout(ids, short.about)} of its videos are about ${short.name}` }); continue }
      if (opts.aboutClient && videosAbout(ids, 'client') < BRAND_MIN_VIDEOS) { held.push({ what, reason: `only ${videosAbout(ids, 'client')} of its videos are about ${co}` }); continue }
      if (detail && a.meaning.best(detail, ids.map((id) => byId.get(id)!.text)) < FIT.item) {
        scrubbed.push({ field: `${key}${n}.detail`, sentence: detail, rule: 'not carried by the points kept' })
        detail = ''
      }
      const ev = evidenceOf(ids)
      // One idea, one home, inside the brief: the brief's own finding again
      // (its points, or its videos and its meaning) is held. A question for
      // the business may rest on a finding: asking is not saying it twice.
      const finding = key === 'decisions' ? null : mine.find((i) => cover(ids, i.points) >= SAME_AS_FINDING
        || (overlapOfSmaller(ev.videoIds, ideaVideos.get(i.id) ?? []) >= SAME_AS_FINDING && a.meaning.sim(said, i.headline) >= FIT.same))
      if (finding) { held.push({ what, reason: `says what the finding "${finding.headline}" says` }); continue }
      // A question for the business that only asks an item above it again is
      // that item twice (the review: "Can demand hold…" asked the risk).
      const twinFit = key === 'decisions' ? FIT.askTwin : FIT.same
      const twin = printed.find((p) => overlapOfSmaller(ev.videoIds, p.videoIds) >= SAME_AS_FINDING && a.meaning.sim(said, `${p.item.title ? `${p.item.title}. ` : ''}${p.item.text}`) >= twinFit)
      if (twin) { held.push({ what, reason: `says what "${(twin.item.title ?? twin.item.text).slice(0, 60)}" says` }); continue }
      // Another brief's idea is NAMED here in a line, never argued.
      const elsewhere = key === 'decisions' ? null : otherIdeas.find((o) => cover(ids, o.points) >= SAME_AS_FINDING
        || (overlapOfSmaller(ev.videoIds, ideaVideos.get(o.id) ?? []) >= SAME_AS_FINDING && a.meaning.sim(said, o.headline) >= FIT.same))
      for (const id of ids) used.add(id)
      const item: BriefItem & { videos: number } = {
        ...(title ? { title } : {}), text: elsewhere ? firstSentence(text) : text, ...(detail && !elsewhere ? { detail } : {}),
        ...(elsewhere ? { tag: `Argued in the ${BRIEF_NAME[elsewhere.home]}` } : {}),
        videos: ev.videos, who: ev.who, basedOn: ids, videoIds: ev.videoIds,
      }
      out.push(item)
    }
    const { kept, held: h } = standingItems(out)
    for (const x of h) held.push({ what: `${key}: ${x.what}`, reason: x.reason })
    for (const k of kept) printed.push({ item: k, videoIds: k.videoIds ?? [] })
    const lead = run(part.lead, BRIEF_MAX.lead, field, `${key}.lead`, { maxSentences: 2, whole: true })
    return { lead: kept.length ? lead : '', items: kept, pointIds: [...used] }
  }
  const quoteFor = (ids: readonly string[], claim: string) => (ids.length ? a.quotes.pick(ids, claim, 1)[0] ?? null : null)
  /** A section's voice comes from what the section argues: never from an
   *  item that only names another brief's idea. */
  const argued = (items: readonly BriefItem[]) => items.filter((i) => !i.tag)
  const voiceFor = (items: readonly BriefItem[], lead = '') => {
    const own = argued(items)
    return quoteFor([...new Set(own.flatMap((i) => i.basedOn ?? []))], [lead, ...own.map((i) => `${i.title ?? ''} ${i.text}`)].join(' '))
  }
  const section = (key: SectionKey, groups: BriefSection['groups'], extra: Partial<BriefSection> = {}): BriefSection => {
    const spec = ROLE_SECTIONS[a.role].find((s) => s.key === key)!
    return { key, title: sectionTitle(spec, co), groups, ...extra }
  }
  const simple = (key: SectionKey, part: string, opts: { rival?: boolean; quote?: boolean } = {}): BriefSection | null => {
    const p = itemsOf(part, opts)
    if (p.items.length === 0) return null
    const quote = opts.quote ? voiceFor(p.items, p.lead) : null
    return section(key, [{ items: p.items }], { ...(p.lead ? { lead: p.lead } : {}), ...(quote ? { quote } : {}) })
  }
  /** Items grouped by their title ("Praised for", "Criticised for"). */
  const grouped = (key: SectionKey, p: Built, order: readonly string[]): BriefSection['groups'] =>
    order
      .map((label) => ({ label, items: p.items.filter((i) => (i.title ?? '').toLowerCase() === label.toLowerCase()).map(untitled) }))
      .filter((g) => g.items.length > 0)

  const built: Partial<Record<SectionKey, BriefSection | null>> = {}
  if (a.role === 'sales') {
    built['sales.buyers'] = simple('sales.buyers', 'buyers')
    built['sales.deciders'] = simple('sales.deciders', 'deciders')
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
    const quote = voiceFor([...believe.items, ...doubt.items])
    built['marketing.believe'] = groups.length ? section('marketing.believe', groups, { ...(believe.lead ? { lead: believe.lead } : {}), ...(quote ? { quote } : {}) }) : null
    const words = itemsOf('words')
    const wordGroups = grouped('marketing.words', words, ['What they praise', 'What they argue about', 'How they describe it'])
    // The market's own words: short voices from the points this section rests
    // on, close in meaning to what it says.
    const voices = words.items.length ? a.quotes.phrases(words.pointIds.map((id) => ({ id, text: byId.get(id)!.text })), PHRASES_MAX - 1) : []
    built['marketing.words'] = wordGroups.length ? section('marketing.words', wordGroups, { ...(words.lead ? { lead: words.lead } : {}), ...(voices.length ? { voices } : {}) }) : null
    built['marketing.say_hear'] = sayHear()
    const recall = itemsOf('recall', { aboutClient: true })
    const recallGroups = grouped('marketing.recall', recall, ['Praised for', 'Criticised for'])
    built['marketing.recall'] = recallGroups.length ? section('marketing.recall', recallGroups, recall.lead ? { lead: recall.lead } : {}) : null
    built['marketing.rivals'] = simple('marketing.rivals', 'rivals', { rival: true })
  }
  if (a.role === 'content') {
    built['content.questions'] = simple('content.questions', 'questions')
    built['content.formats'] = formats()
    const praise = itemsOf('praise')
    const complain = itemsOf('complain')
    const watchGroups = [
      { label: 'What the comments praise', items: praise.items },
      { label: 'What the comments complain about', items: complain.items },
    ].filter((g) => g.items.length > 0)
    built['content.watch'] = watchGroups.length ? section('content.watch', watchGroups, praise.lead ? { lead: praise.lead } : {}) : null
    built['content.more'] = simple('content.more', 'more', { quote: true })
    built['content.confusion'] = simple('content.confusion', 'confusion')
    const ownPts = a.points.filter((p) => p.role === 'content' && p.usable)
    const phrases = a.quotes.phrases([...ownPts].sort((x, y) => y.videoIds.length - x.videoIds.length).map((p) => ({ id: p.id, text: p.text })), PHRASES_MAX)
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
    const wq = voiceFor([...weigh.items, ...move.items])
    built['leadership.weigh'] = wg.length ? section('leadership.weigh', wg, { ...(weigh.lead ? { lead: weigh.lead } : {}), ...(wq ? { quote: wq } : {}) }) : null
    const r = itemsOf('risks')
    built['leadership.risks'] = r.items.length ? section('leadership.risks', [{ items: r.items }], r.lead ? { lead: r.lead } : {}) : null
    built['leadership.decisions'] = simple('leadership.decisions', 'decisions')
  }

  // ---- marketing: what the company says, and what comes back ----------------------------------
  function sayHear(): BriefSection | null {
    const claims = a.claims ?? []
    const items: (BriefItem & { videos: number })[] = []
    for (const [n, w] of (a.written?.say_hear ?? []).entries()) {
      const claim = claims.find((c) => c.id.toUpperCase() === String(w.claim).trim().toUpperCase())
      if (!claim) { held.push({ what: `say_hear: ${w.claim}`, reason: 'not a listed claim' }); continue }
      if (items.some((i) => i.title === claim.claim)) continue
      const heard = run(w.heard, BRIEF_MAX.text, 'market', `say_hear${n}`)
      const cited = [...new Set((w.based_on ?? []).map((x) => String(x).trim().toUpperCase()))].filter((id) => byId.get(id)?.usable && byId.get(id)?.role === 'marketing')
      const ids = cited.filter((id) => a.meaning.sim(heard, byId.get(id)!.text) >= FIT.item)
      if (!heard || ids.length === 0) { held.push({ what: `say_hear: ${claim.claim}`, reason: 'nothing that stood came back on it' }); continue }
      // What comes back on a claim is talk about the company, about that
      // claim: its own posts or comments naming it, close to the claim.
      const about = videosAbout(ids, 'client')
      if (about < BRAND_MIN_VIDEOS) { held.push({ what: `say_hear: ${claim.claim}`, reason: `only ${about} of its videos are about ${co}` }); continue }
      if (a.meaning.sim(claim.claim, heard) < FIT.item - 0.1) { held.push({ what: `say_hear: ${claim.claim}`, reason: 'what came back is not about this claim' }); continue }
      const ev = evidenceOf(ids)
      const twin = items.find((x) => overlapOfSmaller(x.videoIds ?? [], ev.videoIds) >= SAME_AS_FINDING)
      if (twin && (twin.videos ?? 0) >= ev.videos) { held.push({ what: `say_hear: ${claim.claim}`, reason: `the same talk answers "${twin.title}"` }); continue }
      if (twin) {
        held.push({ what: `say_hear: ${twin.title}`, reason: `the same talk answers "${claim.claim}"` })
        items.splice(items.indexOf(twin), 1)
      }
      items.push({ title: claim.claim, text: heard, videos: ev.videos, who: ev.who, basedOn: ids, videoIds: ev.videoIds })
    }
    const { kept, held: h } = standingItems(items)
    for (const x of h) held.push({ what: `say_hear: ${x.what}`, reason: x.reason })
    const top = [...kept].sort((x, y) => (y.videos ?? 0) - (x.videos ?? 0)).slice(0, SAY_HEAR_MAX)
    for (const x of kept.filter((k) => !top.includes(k))) held.push({ what: `say_hear: ${x.title ?? ''}`, reason: 'over the section\'s cap' })
    const shown = kept.filter((k) => top.includes(k))
    for (const k of shown) printed.push({ item: k, videoIds: k.videoIds ?? [] })
    return shown.length ? section('marketing.say_hear', [{ items: shown }]) : null
  }

  // ---- content: what works in the market's videos (counted) -----------------------------------
  function formats(): BriefSection | null {
    const pb = a.playbook
    if (!pb || pb.unread) return null
    const linesFor = (m: PlaybookBlock['formats'], share: (pct: string) => string, kind: string): { items: BriefItem[]; line: string | null; base: string } => {
      const cat = m.sides[0]
      const own = m.sides.find((s) => s.audience === CLIENT_AUDIENCE) ?? null
      if (!cat || cat.of === 0) return { items: [], line: null, base: '' }
      const items: BriefItem[] = []
      const listed = m.keys.slice(0, FORMAT_ROWS)
      for (const k of listed) {
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
        items.push({
          title: k.label, text: `${share(pct0(row.value.k, cat.of))}${median}.`, ...(detail ? { detail } : {}),
          measure: {
            pct: Math.round((row.value.k / cat.of) * 1000) / 10,
            median: row.engagement.median != null && row.engagement.n >= FORMAT_LINE_MIN_RATED ? row.engagement.median : null,
            ...(own && !own.unread && own.of > 0 ? { own: mine, ownOf: own.of } : {}),
          },
        })
      }
      // The line names only a listed row, and only one whose band clears the
      // market's median video: a median over a few videos whose band takes in
      // the market's own is not "running at" anything (the review's addendum).
      const overall = cat.median.value
      const rated = listed.map((k) => cat.byKey[k.key]).filter((r): r is NonNullable<typeof r> =>
        r != null && r.engagement.median != null && r.engagement.n >= FORMAT_LINE_MIN_RATED && r.engagement.band != null && overall != null && r.engagement.band.low > overall)
      const best = [...rated].sort((x, y) => (y.engagement.median ?? 0) - (x.engagement.median ?? 0))[0]
      const line = best && overall != null
        ? `${best.label} ${kind} run at a median engagement of ${best.engagement.median!.toFixed(1)}%, against ${overall.toFixed(1)}% for all the market's videos.`
        : null
      const ownBase = own && !own.unread && own.of > 0 ? ` · counts of ${fmtInt(own.of)} ${co} ${own.of === 1 ? 'post' : 'posts'}` : ''
      return { items, line, base: `Shares of ${fmtInt(cat.of)} videos in the market${ownBase}` }
    }
    const f = linesFor(pb.formats, (p) => `${p} of the market's videos published in ${month}`, 'videos')
    const h = linesFor(pb.hooks, (p) => `${p} of them open this way`, 'openings')
    const groups = [
      ...(f.items.length ? [{ label: 'Formats', items: f.items, base: f.base, ...(f.line ? { lines: [f.line] } : {}) }] : []),
      ...(h.items.length ? [{ label: 'Openings', items: h.items, base: h.base, ...(h.line ? { lines: [h.line] } : {}) }] : []),
    ]
    if (groups.length === 0) return null
    return section('content.formats', groups, { lead: `The videos published in the market in ${month}, by format and by how they open, with ${co}'s own posts beside them.` })
  }

  // ---- leadership: where the market stands (the subjects people talked about) --------------------
  function market(): BriefSection | null {
    const subjects = a.subjects ?? []
    if (subjects.length === 0) return null
    const sentences = new Map((a.written?.subjects ?? []).map((s) => [String(s.subject).trim().toUpperCase(), run(s.sentence, BRIEF_MAX.subject, 'market', `subject.${s.subject}`, { maxSentences: 1 })]))
    const ready = subjects.filter(({ fact }) => fact.calibration === 'ready' && fact.level && fact.level.n > 0)
      .sort((x, y) => (x.fact.rank || 99) - (y.fact.rank || 99))
    const rest = subjects.filter((s) => !ready.includes(s) && s.fact.calibration !== 'failed')
    const items: BriefItem[] = []
    for (const { id, fact } of [...ready, ...rest]) {
      const sentence = sentences.get(id.toUpperCase()) ?? ''
      const level = fact.calibration === 'ready' && fact.level && fact.level.n > 0
        ? `${pct0(fact.level.k, fact.level.n)} of ${month}'s videos in the market${fact.rank >= 1 && fact.rank <= BIGGEST.length ? `, the ${BIGGEST[fact.rank - 1]} subject` : ''}.`
        : ''
      // A subject with nothing said about it prints nothing, not its bare
      // name (the review's addendum: a list of names says nothing).
      if (!sentence) { held.push({ what: `subject: ${fact.name}`, reason: 'nothing was said about it' }); continue }
      const pct = fact.calibration === 'ready' && fact.level && fact.level.n > 0 ? Math.round((fact.level.k / fact.level.n) * 100) : null
      items.push({ title: fact.name, text: sentence, ...(level ? { detail: level } : {}), ...(pct != null ? { measure: { pct } } : {}) })
    }
    for (const { fact } of subjects) if (fact.calibration === 'failed') held.push({ what: `subject: ${fact.name}`, reason: 'its matching is not trusted, so nothing about it prints' })
    const n = ready[0]?.fact.level?.n ?? 0
    return items.length ? section('leadership.market', [{ items }], n > 0 ? { base: `Share of the ${fmtInt(n)} videos in your market in ${month}` } : {}) : null
  }

  // ---- leadership: where the company stands ---------------------------------------------------
  function shares(): BriefSection | null {
    const rows = a.audiences ?? []
    const client = rows.find((r) => r.audience === CLIENT_AUDIENCE) ?? null
    const rivals = rows.filter((r) => isRivalAudience(r.audience) && r.videos >= SHARE_MIN_VIDEOS)
      .filter((r) => a.rivals.some((n) => n.toLowerCase() === (rivalNameOf(r.audience) ?? '').toLowerCase()))
      .filter((r) => a.brandsCounted.rivals.some((n) => n.toLowerCase() === (rivalNameOf(r.audience) ?? '').toLowerCase()))
    const stand = itemsOf('stand', { aboutClient: true })
    const standGroups = grouped('leadership.shares', stand, ['Praised for', 'Criticised for'])
    // ONE SET OF TOTALS: rivals' talk as a share of the market's (the In
    // short's own base), and the company's own posts as a count, never a share
    // of a base that includes them, and never a rank (a giveaway post carried
    // most of Sealand's September comments).
    const items: BriefItem[] = []
    const lines: string[] = []
    const mc = a.market?.comments ?? 0
    const mv = a.market?.videos ?? 0
    if (a.brandsCounted.client && mc > 0 && mv > 0) {
      for (const r of [...rivals].sort((x, y) => y.comments - x.comments)) {
        const name = rivalNameOf(r.audience) ?? r.audience
        items.push({
          title: name, text: `${pct1(r.comments, mc)} of the market's comments and ${pct1(r.videos, mv)} of its videos, on videos about ${name}.`,
          measure: { comments: Math.round((r.comments / mc) * 1000) / 10, videos: Math.round((r.videos / mv) * 1000) / 10 },
        })
      }
      if (client && client.comments > 0) {
        const g = a.giveaway && a.giveaway.comments > 0 ? a.giveaway : null
        lines.push(`${co}'s own posts drew ${fmtInt(client.comments)} comments in ${month}${g ? `, ${fmtInt(g.comments)} of them on ${g.posts === 1 ? 'one giveaway post' : `${fmtInt(g.posts)} giveaway posts`}` : ''}.`)
      }
    }
    const groups = [
      ...(items.length || lines.length ? [{ label: `Talk about each brand in ${month}`, items, ...(lines.length ? { lines } : {}) }] : []),
      ...standGroups,
    ]
    if (groups.length === 0) return null
    return section('leadership.shares', groups, stand.lead && standGroups.length ? { lead: stand.lead } : {})
  }

  const { sections, held: sectionHeld } = selectRoleSections(a.role, built)
  for (const h of sectionHeld) held.push(h)

  // ---- in short (filtered against what printed, at the set level: summaryAgainstPrinted) --------
  const summary = run(a.written?.in_short ?? '', BRIEF_MAX.summary, 'interpret', 'in_short', { maxSentences: BRIEF_MAX.summarySentences })
  const data: MonthlyBriefData = {
    version: 1,
    kind: 'monthly_brief',
    role: a.role,
    title: `${BRIEF_NAME[a.role]} · ${month}`,
    company: co,
    noun: a.noun,
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
  return { data, counts, scrubbed }
}

/** An item without its title: the title named its group. */
const untitled = (i: BriefItem): BriefItem => {
  const out = { ...i }
  delete out.title
  return out
}

/** The figures In short prints, each from a count code holds: the market's
 *  month for everyone, then one that belongs to the reader. Pure. */
export function figuresFor(a: Pick<ComposeInput, 'role' | 'company' | 'month' | 'market' | 'subjects' | 'ownPosts' | 'playbook'>): BriefFigure[] {
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
    const overall = cat?.median.value ?? null
    const listed = a.playbook.formats.keys.slice(0, FORMAT_ROWS).map((k) => cat?.byKey[k.key]).filter((r): r is NonNullable<typeof r> => r != null)
    const best = listed.filter((r) => r.engagement.median != null && r.engagement.n >= FORMAT_LINE_MIN_RATED && r.engagement.band != null && overall != null && r.engagement.band.low > overall)
      .sort((x, y) => (y.engagement.median ?? 0) - (x.engagement.median ?? 0))[0]
    if (best && overall != null) out.push({ value: `${best.engagement.median!.toFixed(1)}%`, label: `median engagement on the market's ${best.label.toLowerCase()} videos, against ${overall.toFixed(1)}% for all its videos` })
  }
  return out
}

// ---- the set ----------------------------------------------------------------------------------

/** Every printed text of a brief: what an In short sentence must find itself
 *  in. */
export function printedTexts(d: MonthlyBriefData): { text: string; brands: string }[] {
  // An item that only names another brief's idea is not this brief's to
  // summarise: In short says what THIS brief argues.
  return [
    ...d.findings.flatMap((f) => [f.headline, ...f.saw, f.means, ...f.practice]),
    ...d.sections.flatMap((s) => [...(s.lead ? [s.lead] : []), ...s.groups.flatMap((g) => g.items.filter((i) => !i.tag).map((i) => `${i.title ? `${i.title}. ` : ''}${i.text}${i.detail ? ` ${i.detail}` : ''}`))]),
  ].map((text) => ({ text, brands: text }))
}

/**
 * In short says only what the brief PRINTED (the review: held items fed the
 * summaries). Each sentence must sit close in meaning to something printed
 * (`FIT.summary`), and a sentence that names a brand must sit close to a
 * printed text that names it too. The rest drop, into `held`. Pure.
 */
export function summaryAgainstPrinted(d: MonthlyBriefData, meaning: Meaning, brands: readonly string[]): MonthlyBriefData {
  const printed = printedTexts(d).map((p) => p.text)
  // What another brief argues: its ideas, and this brief's lines naming them.
  const elsewhere = [
    ...d.inShort.also.map((x) => x.headline),
    ...d.sections.flatMap((s) => s.groups.flatMap((g) => g.items.filter((i) => i.tag).map((i) => `${i.title ? `${i.title}. ` : ''}${i.text}`))),
  ]
  const kept: string[] = []
  const held = [...d.held]
  for (const sentence of splitSentences(d.inShort.summary)) {
    const named = brands.filter((b) => names(sentence, b))
    const pool = named.length ? printed.filter((t) => named.every((b) => names(t, b))) : printed
    const own = pool.length ? meaning.best(sentence, pool) : 0
    if (own < FIT.summary) {
      held.push({ what: `in short: ${sentence.slice(0, 90)}`, reason: named.length ? `nothing printed about ${named.join(' and ')} says it` : 'nothing the brief printed says it' })
      continue
    }
    if (elsewhere.length && meaning.best(sentence, elsewhere) > own) {
      held.push({ what: `in short: ${sentence.slice(0, 90)}`, reason: 'it says what another brief argues' })
      continue
    }
    kept.push(sentence)
  }
  return { ...d, inShort: { ...d.inShort, summary: kept.join(' ') }, held }
}

/**
 * One idea, one home, across the set's SECTIONS too (the review: Sealand's
 * rivals described three times, its own-post community praise three times).
 * In role order, an item that says what an earlier brief's item says, on the
 * same videos, keeps its first sentence and names that brief. Pure.
 */
export function namedAcross(briefs: readonly MonthlyBriefData[], meaning: Meaning): MonthlyBriefData[] {
  const order = [...briefs].sort((x, y) => BRIEF_ROLES.indexOf(x.role) - BRIEF_ROLES.indexOf(y.role))
  const seen: { role: BriefRole; text: string; videoIds: string[] }[] = []
  const out = new Map<BriefRole, MonthlyBriefData>()
  for (const d of order) {
    const sections = d.sections.map((s) => ({
      ...s,
      groups: s.groups.map((g) => ({
        ...g,
        items: g.items.map((i) => {
          if (i.tag || !i.videoIds?.length || s.key === 'leadership.decisions') return i
          const said = `${i.title ? `${i.title}. ` : ''}${i.text}`
          const earlier = seen.find((e) => e.role !== d.role && overlapOfSmaller(i.videoIds!, e.videoIds) >= SAME_AS_FINDING && meaning.sim(said, e.text) >= FIT.same)
          if (!earlier) return i
          const rest: BriefItem = { ...i, text: firstSentence(i.text), tag: `Also in the ${BRIEF_NAME[earlier.role]}` }
          delete rest.detail
          return rest
        }),
      })),
    }))
    for (const s of sections) for (const g of s.groups) for (const i of g.items) if (!i.tag && i.videoIds?.length) seen.push({ role: d.role, text: `${i.title ? `${i.title}. ` : ''}${i.text}`, videoIds: i.videoIds })
    out.set(d.role, { ...d, sections })
  }
  return briefs.map((d) => out.get(d.role)!)
}

/** Where two briefs of one set rest on the same research: each pair of items
 *  (or findings) in different briefs citing mostly the same points or videos.
 *  The README's self-check reads this. Pure. */
export function repeatsAcross(briefs: readonly MonthlyBriefData[]): { a: string; b: string; overlap: number; tagged: boolean }[] {
  const units = briefs.flatMap((d) => [
    ...d.findings.map((f) => ({ where: `${d.role} finding "${f.headline}"`, role: d.role, ids: f.basedOn, tagged: false })),
    ...d.sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => ({ where: `${d.role} ${s.key} "${(i.title ?? i.text).slice(0, 60)}"`, role: d.role, ids: i.basedOn ?? [], tagged: !!i.tag })))),
  ])
  const out: { a: string; b: string; overlap: number; tagged: boolean }[] = []
  for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
    const x = units[i]
    const y = units[j]
    if (x.role === y.role || x.ids.length === 0 || y.ids.length === 0) continue
    const o = overlapOfSmaller(x.ids, y.ids)
    if (o >= 0.5) out.push({ a: x.where, b: y.where, overlap: Math.round(o * 100) / 100, tagged: x.tagged || y.tagged })
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
