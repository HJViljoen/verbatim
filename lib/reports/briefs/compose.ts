import { names } from '../../agent/scope'
import { aboutNamed, type WhoVideo } from '../../brands/attribution'
import type { About } from '../../brands/labels'
import { fmtInt, longMonth } from '../../format'
import type { PlaybookBlock } from '../../pages/playbook'
import { kindLabel } from '../../reading/kinds'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, isRivalAudience, rivalNameOf } from '../../rivals'
import { splitSentences } from '../../prose/scrub'
import type { StandingFact } from '../../written/types'
import type { WeekScrubCounts } from '../../written/scrub'
import { monthsPhrase } from '../../written/month'
import { collectQuoteRefs, resolveQuotes } from '../../renderables/quotes-freeze'
import type { QuoteResolution } from '../../renderables/types'
import { overlapOfSmaller, referencesFor } from './allocate'
import { printedSections } from './deck'
import { unionOf } from './ground'
import { FIT, type Meaning } from './meaning'
import { itemKey } from './repeats'
import type { QuotePool } from './quotes'
import { addCounts, hyphenatedNames, restoreNames, scrubBriefText, tradeOff, varySubjects, ZERO_COUNTS, type BriefField } from './scrub'
import { BRAND_MIN_VIDEOS, ITEM_MIN_VIDEOS, ROLE_SECTIONS, groundedRival, printsSection, sectionSays, sectionTitle, selectRoleSections, standingItems } from './sections'
import type { AllocatedIdea, Allocation, BriefFigure, BriefFinding, BriefItem, BriefQuote, BriefRole, BriefSection, GroundedPoint, MonthlyBriefData, SectionKey, ShareBar } from './types'
import { BRIEF_NAME, BRIEF_ROLES, SAY_HEAR_STATUSES, type SayHearStatus } from './types'
import { BRIEF_MAX, BRIEF_PROMPT_VERSION, EXTRA_MAX, PARTS, partCaps, partOf, type BriefLineOutput, type BriefOutput, type BriefPartItem, type BriefWordsGroup } from './write'

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
// pushback, what is behind a question, a buyer's column) prints only where a
// kept point carries it too. An item that says what this brief's finding
// says, or what an earlier item says on the same videos, is held; one that
// rests on another brief's idea keeps a line and says where it is argued. A
// label the scrub drops takes its item to `held`, never off the page in
// silence.
//
// THE CANVAS'S COMPONENTS (12 Oct: "look just like the design", every brief
// the canvas's page set and components). Beyond the items, code builds what
// the canvas draws from counts it holds: the subjects' bars with what people
// did in the comments and the mood, the brands' shares of the month's
// comments and videos with where each is talked about, the brands' own posts
// and how many drew a reply, the formats with a rival's column, and what holds
// so far from the month's long-run read. The writer adds what only words can
// say: a buyer's columns, the job a rival is bought for, the market's own
// words, the status of each claim, what each brand is heard for, the
// company's position in one line. A component whose material does not stand
// does not print; nothing is ever a placeholder.

/** One month of one audience, as `month_denominators` holds it. */
export interface AudienceRow {
  audience: string
  videos: number
  comments: number
  /** Videos by platform, over the same video set (`platform_mix`). */
  platforms?: Record<string, number> | null
}

/** What people did in the comments and the mood, pooled over the market
 *  (`buildMarketKinds`, lib/pages/overview-market/kinds.ts): counts only. */
export interface MarketKindsIn {
  /** The market's videos in the month (the kinds' base). */
  n: number | null
  kinds: { kind: string; k: number | null }[]
  /** The market's videos whose comments carry a mood (the mood's base). */
  judged: number | null
  mood: { mood: string; k: number | null }[]
}

/** One brand's own posts published in the month (upload-dated), and how many
 *  of them drew five or more comments. */
export interface OwnPostCount {
  name: string
  you: boolean
  posts: number
  five: number
}

/** The month's long-run read, as much as "What holds so far" prints: its
 *  window's months and its ideas' headlines with their evidence. */
export interface LongRunIn {
  months: string[]
  ideas: { headline: string; videos: number; months: { month: string; videos: number }[] }[]
}

/** Half or more of an item's points, or of its videos, is that idea again. */
export const SAME_AS_FINDING = 0.5

/** The share of an item's points that are among `of`. */
export const cover = (ids: readonly string[], of: readonly string[]): number => {
  if (ids.length === 0) return 0
  const set = new Set(of)
  return ids.filter((id) => set.has(id)).length / ids.length
}

/** Claims on "What the company says, and what comes back" (the canvas's five). */
export const SAY_HEAR_MAX = 5
/** A rival takes a question with at least this many videos in the month. */
export const SHARE_MIN_VIDEOS = 3
/** A format or opening is compared on its median only over this many rated
 *  videos (more than the page's own floor of three: a sentence rests on it). */
export const FORMAT_LINE_MIN_RATED = 10
/** Short phrases on "Words to borrow", and voices on "In its own words". */
export const PHRASES_MAX = 4
/** The formats and the openings "Hooks and formats that work" lists (the
 *  canvas's five and three), and the only ones a line may name. */
export const FORMAT_ROWS = 5
export const HOOK_ROWS = 3
/** Quotes a page of trigger moments prints, one a moment (the canvas's three). */
export const TRIGGER_QUOTES = 3
/** A kind or the mood prints as a share only on this many videos, and a kind
 *  only on this many of its own (`marketLevel`'s floor). */
export const KIND_MIN_N = 100
export const KIND_MIN_K = 10
/** What each brand is heard for prints only where two brands stand. */
export const HEARD_FOR_MIN = 2
/** The writer's caps are the canvas's measure; the scrub lets a little past
 *  them through whole (the deck fits the page), rather than cut a sentence. */
const SLACK = 1.4

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
  /** The subjects (Leadership's writer is shown them; the Sales figure and a
   *  finding's subject line read their levels). */
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
  /** Leadership: what people did in the comments and the mood. */
  kinds?: MarketKindsIn | null
  /** Marketing: each brand's own posts in the month. */
  posts?: readonly OwnPostCount[] | null
  /** Leadership: the month's long-run read. */
  longRun?: LongRunIn | null
  /** The subjects each of the findings' insights is a member of: a finding's
   *  "Part of {subject}" line. */
  insightSubjects?: ReadonlyMap<string, readonly string[]> | null
  model: string
  costUsd: number
}

const pct1 = (k: number, n: number): string => `${(Math.round((k / n) * 1000) / 10).toFixed(1)}%`
const pct0 = (k: number, n: number): string => `${Math.round((k / n) * 100)}%`
const BIGGEST = ['biggest', 'second biggest', 'third biggest', 'fourth biggest', 'fifth biggest', 'sixth biggest', 'seventh biggest', 'eighth biggest']
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
/** "five", or the digits past ten. */
export const numberWord = (n: number): string => NUMBER[n] ?? fmtInt(n)
const firstSentence = (s: string): string => splitSentences(s)[0] ?? s
const PLATFORM: Readonly<Record<string, string>> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit' }
const platformName = (p: string): string => PLATFORM[p.toLowerCase()] ?? p
/** "A, B and C". */
const andList = (xs: readonly string[]): string => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
/** A share with one decimal, its ".0" kept off a whole number ("77%", "13.5%"). */
const pctShort = (x: number): number => Math.round(x * 10) / 10

/** A part's raw field, trimmed, "" for the schema's "" placeholder. */
const field = (it: BriefPartItem, key: string): string => {
  const v = it[key]
  if (typeof v !== 'string') return ''
  const t = v.trim()
  return t === '""' ? '' : t
}

export function composeBrief(a: ComposeInput): { data: MonthlyBriefData; counts: WeekScrubCounts; scrubbed: { field: string; sentence: string; rule: string }[] } {
  const month = longMonth(a.month)
  const co = a.company
  let counts = ZERO_COUNTS
  const held: MonthlyBriefData['held'] = []
  const scrubbed: { field: string; sentence: string; rule: string }[] = []
  const productNames = hyphenatedNames(a.points.map((p) => p.text))
  const polish = (s: string) => varySubjects(tradeOff(restoreNames(s, productNames)))
  const scrub = (raw: string, max: number, f: BriefField, where: string, o: { maxSentences?: number; whole?: boolean } = {}) => {
    const r = scrubBriefText(raw ?? '', max, { company: co, field: f, ...o })
    counts = addCounts(counts, r.counts)
    for (const d of r.dropped) scrubbed.push({ field: where, ...d })
    return { text: polish(r.text), rule: r.dropped[0]?.rule ?? null }
  }
  const run = (raw: string, max: number, f: BriefField, where: string, o: { maxSentences?: number; whole?: boolean } = {}) => scrub(raw, max, f, where, o).text
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
  /** The usable cited points of an extra a set of questions feeds. */
  const citedFrom = (basedOn: readonly unknown[] | undefined, from: readonly string[]) => {
    const q = new Set(from)
    return [...new Set((basedOn ?? []).map((x) => String(x).trim().toUpperCase()))].filter((id) => {
      const p = byId.get(id)
      return !!p && p.usable && (q.has(p.questionId) || ideaPointIds.has(p.id))
    })
  }

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
    // The contents' short name: a label, never a brand on too few videos.
    const name = w.short ? run(w.short, EXTRA_MAX.short, 'headline', `${idea.id}.short`, { whole: true }) : ''
    const ev = evidenceOf(idea.points)
    const part = subjectLineOf(idea.points)
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
      ...(name && !shortBrand(name) ? { short: name } : {}),
      ...(part ? { subjectLine: part } : {}),
    })
  }

  /** "Part of Buying & delivery, the biggest subject in your market: 23% of
   *  September's videos.": the ready subject that half or more of a finding's
   *  insights are members of, with its level. Null where none is. */
  function subjectLineOf(pointIds: readonly string[]): string | null {
    const ids = [...new Set(pointIds.flatMap((id) => byId.get(id)?.insightIds ?? []))]
    const members = a.insightSubjects
    if (!members || ids.length === 0) return null
    const ready = (a.subjects ?? []).map((s) => s.fact).filter((f) => f.calibration === 'ready' && f.level && f.level.n > 0)
    const best = ready.map((f) => ({ f, share: ids.filter((id) => (members.get(id) ?? []).includes(f.subjectId)).length / ids.length }))
      .filter((x) => x.share >= SAME_AS_FINDING)
      .sort((x, y) => y.share - x.share || (x.f.rank || 99) - (y.f.rank || 99))[0]
    if (!best?.f.level) return null
    const rank = best.f.rank >= 1 && best.f.rank <= BIGGEST.length ? `, the ${BIGGEST[best.f.rank - 1]} subject in your market` : ''
    return `Part of ${best.f.name}${rank}: ${pct0(best.f.level.k, best.f.level.n)} of ${month}'s videos.`
  }

  // ---- the writer's parts, as items ---------------------------------------------------------
  /** Items printed so far in this brief, for the in-brief repeat check. */
  const printed: { item: BriefItem; videoIds: string[] }[] = []
  type Built = { lead: string; note: string; items: BriefItem[]; pointIds: string[] }
  const itemsOf = (key: string, opts: { rival?: boolean; aboutClient?: boolean } = {}): Built => {
    const part = a.written ? partOf(a.written, key) : { lead: '', note: '', items: [] }
    const spec = PARTS[a.role].find((p) => p.key === key)
    const caps = partCaps(a.role, key)
    const from = new Set(spec?.from ?? [])
    // What this part may rest on: its own questions' points, or the brief's
    // own ideas' points (PartSpec.from, the review's addendum).
    const mayCite = (id: string) => {
      const p = byId.get(id)
      return !!p && p.usable && (from.has(p.questionId) || ideaPointIds.has(p.id))
    }
    const f: BriefField = key === 'risks' || key === 'decisions' ? 'interpret' : 'market'
    const out: (BriefItem & { videos: number })[] = []
    const used = new Set<string>()
    for (const [n, it] of part.items.slice(0, spec?.max ?? BRIEF_MAX.items).entries()) {
      const what = `${key}: ${field(it, 'title') || field(it, 'text').slice(0, 60)}`
      // A part with no title whose writer put the line in the title (Össur's
      // questions for the business came back that way) prints it as the text.
      const untitledPart = spec?.title === '""'
      const moved = untitledPart && !field(it, 'text') && field(it, 'title')
      const rawTitle = untitledPart ? '' : field(it, 'title')
      const rawText = moved ? field(it, 'title') : field(it, 'text')
      const t = rawTitle ? scrub(rawTitle, Math.round(caps.title * SLACK), 'headline', `${key}${n}.title`, { whole: true }) : { text: '', rule: null }
      if (rawTitle && !t.text) { held.push({ what, reason: `its label broke a rule (${t.rule ?? 'the scrub'})` }); continue }
      let title = t.text
      const tx = scrub(rawText, Math.round(caps.text * SLACK), f, `${key}${n}.text`)
      if (!tx.text) { held.push({ what, reason: `its text broke a rule (${tx.rule ?? 'the scrub'})` }); continue }
      const text = tx.text
      const rawDetail = field(it, 'detail')
      let detail = rawDetail ? run(rawDetail, Math.round(caps.detail * SLACK), 'market', `${key}${n}.detail`) : ''
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
      const kept = ids.map((id) => byId.get(id)!.text)
      /** A second line prints only where a kept point carries it too. */
      const carried = (line: string, where: string): string => {
        if (!line) return ''
        if (a.meaning.best(line, kept) >= FIT.item) return line
        scrubbed.push({ field: where, sentence: line, rule: 'not carried by the points kept' })
        return ''
      }
      detail = carried(detail, `${key}${n}.detail`)
      // The canvas's extras for this part.
      const extra: Partial<BriefItem> = {}
      if (key === 'buyers') {
        const col = (k: string) => carried(run(field(it, k), Math.round(240 * SLACK), 'market', `${key}${n}.${k}`), `${key}${n}.${k}`)
        const forSale = run(field(it, 'for_sale'), Math.round(190 * SLACK), 'interpret', `${key}${n}.for_sale`, { maxSentences: 2 })
        const persona = { want: col('want'), stops: col('stops'), moves: col('moves'), forSale }
        const kept = Object.fromEntries(Object.entries(persona).filter(([, v]) => v)) as BriefItem['persona']
        if (kept && Object.keys(kept).length) extra.persona = kept
        if (it.buys === false) {
          extra.muted = true
          const pill = run(field(it, 'status'), Math.round(30 * SLACK), 'headline', `${key}${n}.status`, { whole: true })
          if (pill) extra.pill = pill
        }
      }
      if (key === 'rivals' && a.role === 'sales') {
        const job = run(field(it, 'job'), Math.round(30 * SLACK), 'headline', `${key}${n}.job`, { whole: true }).replace(/^bought for\s+/i, '')
        if (job) extra.pill = `Bought for ${job[0].toLowerCase()}${job.slice(1)}`
      }
      if (key === 'rivals' && a.role === 'marketing') {
        const idea = run(field(it, 'idea'), Math.round(36 * SLACK), 'headline', `${key}${n}.idea`, { whole: true })
        if (idea) extra.pill = idea
      }
      if (key === 'questions' && it.from_makers === true) extra.muted = true
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
        ...(elsewhere ? { tag: `Argued in the ${BRIEF_NAME[elsewhere.home]}`, named: { brief: elsewhere.home, idea: elsewhere.id } } : {}),
        ...(elsewhere ? { ...extra, persona: undefined } : extra),
        videos: ev.videos, who: ev.who, basedOn: ids, videoIds: ev.videoIds,
      }
      if (item.persona === undefined) delete item.persona
      out.push(item)
    }
    const { kept, held: h } = standingItems(out)
    for (const x of h) held.push({ what: `${key}: ${x.what}`, reason: x.reason })
    for (const k of kept) printed.push({ item: k, videoIds: k.videoIds ?? [] })
    const lead = spec?.lead ? run(part.lead, Math.round(spec.lead * SLACK), f, `${key}.lead`, { maxSentences: 2, whole: true }) : ''
    const note = spec?.note ? run(part.note, Math.round(spec.note.max * SLACK), f, `${key}.note`, { maxSentences: 2, whole: true }) : ''
    return { lead: kept.length ? lead : '', note: kept.length ? note : '', items: kept, pointIds: [...used] }
  }

  /**
   * One line of the writer's beyond the parts (Also in the set, a panel row,
   * the company's own card, its position): scrubbed, resting on the cited
   * points of the questions it is written from whose meaning it carries, on
   * enough videos, and on enough about any brand it names (about the company
   * throughout where `aboutClient`). Null where it does not stand, and held
   * with why.
   */
  const standingLine = (raw: BriefLineOutput | undefined, from: readonly string[], cap: number, where: string, o: { aboutClient?: boolean; fit?: number; f?: BriefField } = {}): BriefItem | null => {
    if (!raw?.text?.trim()) return null
    const text = run(raw.text, Math.round(cap * SLACK), o.f ?? 'market', where, { maxSentences: 2 })
    if (!text) { held.push({ what: where, reason: 'it broke a rule' }); return null }
    const ids = citedFrom(raw.based_on, from).filter((id) => a.meaning.sim(text, byId.get(id)!.text) >= (o.fit ?? FIT.item))
    if (ids.length === 0) { held.push({ what: `${where}: ${text.slice(0, 60)}`, reason: 'it says nothing the points it cites say' }); return null }
    const short = brandsNamed(text, true).find((b) => videosAbout(ids, b.about) < BRAND_MIN_VIDEOS)
    if (short) { held.push({ what: `${where}: ${text.slice(0, 60)}`, reason: `only ${videosAbout(ids, short.about)} of its videos are about ${short.name}` }); return null }
    if (o.aboutClient && videosAbout(ids, 'client') < BRAND_MIN_VIDEOS) { held.push({ what: `${where}: ${text.slice(0, 60)}`, reason: `only ${videosAbout(ids, 'client')} of its videos are about ${co}` }); return null }
    const ev = evidenceOf(ids)
    if (ev.videos < ITEM_MIN_VIDEOS) { held.push({ what: `${where}: ${text.slice(0, 60)}`, reason: `too little behind it (${ev.videos} videos)` }); return null }
    return { text, videos: ev.videos, who: ev.who, basedOn: ids, videoIds: ev.videoIds }
  }

  const quoteFor = (ids: readonly string[], claim: string, o: { about?: string } = {}) => (ids.length ? a.quotes.pick(ids, claim, 1, o)[0] ?? null : null)
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
    return section(key, [{ items: p.items }], { ...(p.lead ? { lead: p.lead } : {}), ...(p.note ? { note: p.note } : {}), ...(quote ? { quote } : {}) })
  }
  /** Items grouped by their title ("Praised for", "Criticised for"). */
  const grouped = (p: Built, order: readonly string[]): BriefSection['groups'] =>
    order
      .map((label) => ({ label, items: p.items.filter((i) => (i.title ?? '').toLowerCase() === label.toLowerCase()).map(untitled) }))
      .filter((g) => g.items.length > 0)

  const built: Partial<Record<SectionKey, BriefSection | null>> = {}
  if (a.role === 'sales') {
    built['sales.buyers'] = simple('sales.buyers', 'buyers')
    built['sales.deciders'] = simple('sales.deciders', 'deciders')
    built['sales.stops'] = simple('sales.stops', 'stops', { quote: true })
    built['sales.settle'] = simple('sales.settle', 'settle')
    built['sales.triggers'] = triggers()
    built['sales.rivals'] = rivalsBought()
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
    built['marketing.believe'] = groups.length ? section('marketing.believe', groups, quote ? { quote } : {}) : null
    built['marketing.words'] = ownWords()
    built['marketing.say_hear'] = sayHear()
    const recall = itemsOf('recall', { aboutClient: true })
    const recallGroups = grouped(recall, ['Praised for', 'Criticised for'])
    built['marketing.recall'] = recallGroups.length ? section('marketing.recall', recallGroups) : null
    built['marketing.rivals'] = rivalsHeard()
  }
  if (a.role === 'content') {
    built['content.questions'] = simple('content.questions', 'questions')
    built['content.formats'] = formats()
    const praise = itemsOf('praise')
    const complain = itemsOf('complain')
    const watchGroups = [
      { label: 'What earns a response', items: praise.items },
      { label: 'What loses them', items: complain.items },
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
      { label: 'What holds them', items: stay.items },
      { label: 'What moves them', items: move.items },
    ].filter((g) => g.items.length > 0)
    const wq = voiceFor([...weigh.items, ...move.items])
    built['leadership.weigh'] = wg.length ? section('leadership.weigh', wg, { ...(weigh.lead ? { lead: weigh.lead } : {}), ...(wq ? { quote: wq } : {}) }) : null
    const r = itemsOf('risks')
    built['leadership.risks'] = r.items.length ? section('leadership.risks', [{ items: r.items }]) : null
    built['leadership.decisions'] = simple('leadership.decisions', 'decisions')
    built['leadership.holds'] = holds()
    // What each brand is heard for, on the brief's first finding.
    const chips = heardFor()
    if (chips && findings[0]) findings[0] = { ...findings[0], heardFor: chips }
  }

  // ---- sales: what tips them into buying, a voice for each of the first moments -----------------
  function triggers(): BriefSection | null {
    const p = itemsOf('triggers')
    if (p.items.length === 0) return null
    let taken = 0
    const items = p.items.map((i) => {
      if (taken >= TRIGGER_QUOTES || i.tag) return i
      const q = quoteFor(i.basedOn ?? [], `${i.title ?? ''}. ${i.text}`)
      if (!q) return i
      taken += 1
      return { ...i, quote: q }
    })
    return section('sales.triggers', [{ items }])
  }

  // ---- sales: who buyers compare you with ---------------------------------------------------------
  function rivalsBought(): BriefSection | null {
    const p = itemsOf('rivals', { rival: true })
    const also = standingLine(a.written?.also_set, ['sales.rivals'], EXTRA_MAX.alsoSet, 'also_set')
    if (p.items.length === 0) return null
    // The rival quote: about the first rival that has one, from its own talk.
    let quoted = false
    const items = p.items.map((i) => {
      if (quoted || i.tag || !i.title) return i
      const q = quoteFor(i.basedOn ?? [], `${i.title}. ${i.text}`, { about: `rival:${i.title}` })
      if (!q) return i
      quoted = true
      return { ...i, quote: q }
    })
    return section('sales.rivals', [{ items }], also ? { also: also.text } : {})
  }

  // ---- marketing: in its own words ----------------------------------------------------------------
  function ownWords(): BriefSection | null {
    const w = a.written?.own_words
    if (!w) return null
    const from = ['marketing.notice']
    const group = (label: string, g: BriefWordsGroup | undefined, max: number, where: string) => {
      const ids = citedFrom(g?.based_on, from)
      if (!g || ids.length === 0) return null
      if (evidenceOf(ids).videos < ITEM_MIN_VIDEOS) { held.push({ what: `${where}`, reason: `too little behind it (${evidenceOf(ids).videos} videos)` }); return null }
      const said = ids.map((id) => byId.get(id)!.text).join(' ')
      const words: string[] = []
      for (const raw of g.words ?? []) {
        const word = run(String(raw), EXTRA_MAX.word, 'headline', where, { whole: true }).toLowerCase()
        if (!word || words.includes(word)) continue
        if (!wordsIn(word, said)) { held.push({ what: `${where}: ${word}`, reason: 'no point it cites uses the words' }); continue }
        words.push(word)
        if (words.length >= max) break
      }
      return words.length ? { label, words } : null
    }
    const chips = [
      group('What they call it', w.call_it, EXTRA_MAX.callIt, 'own_words.call_it'),
      group('How they praise it', w.praise, EXTRA_MAX.praiseWords, 'own_words.praise'),
      group('The problem, in their words', w.problem, EXTRA_MAX.problemWords, 'own_words.problem'),
    ].filter((c): c is { label: string; words: string[] } => c != null)
    const rows: { verb: string; row: BriefItem }[] = []
    for (const [label, line, verb] of [['They stop on', w.stop_on, 'stop'], ['They share', w.share, 'share'], ['They argue over', w.argue, 'argue']] as const) {
      const r = standingLine(line, from, EXTRA_MAX.panel, `own_words.${verb}`)
      if (r) rows.push({ verb, row: { ...r, title: label } })
    }
    const lead = chips.length ? run(w.lead ?? '', Math.round(EXTRA_MAX.ownWordsLead * SLACK), 'market', 'own_words.lead', { maxSentences: 2, whole: true }) : ''
    if (chips.length === 0 && rows.length === 0) return null
    const panel = rows.length
      ? { title: `What makes them ${andList(rows.map((r) => r.verb))}`, rows: rows.map((r) => r.row) }
      : undefined
    return section('marketing.words', [], { chips, ...(lead ? { lead } : {}), ...(panel ? { panel } : {}) })
  }

  // ---- marketing: what the company says, and what comes back ----------------------------------
  function sayHear(): BriefSection | null {
    const claims = a.claims ?? []
    const items: (BriefItem & { videos: number })[] = []
    for (const [n, w] of (a.written?.say_hear ?? []).entries()) {
      const claim = claims.find((c) => c.id.toUpperCase() === String(w.claim).trim().toUpperCase())
      if (!claim) { held.push({ what: `say_hear: ${w.claim}`, reason: 'not a listed claim' }); continue }
      if (items.some((i) => i.title === claim.claim)) continue
      const heard = run(w.heard, Math.round(170 * SLACK), 'market', `say_hear${n}`)
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
      const status = SAY_HEAR_STATUSES.includes(w.status as SayHearStatus) ? (w.status as SayHearStatus) : null
      items.push({ title: claim.claim, text: heard, ...(status ? { status } : {}), videos: ev.videos, who: ev.who, basedOn: ids, videoIds: ev.videoIds })
    }
    const { kept, held: h } = standingItems(items)
    for (const x of h) held.push({ what: `say_hear: ${x.what}`, reason: x.reason })
    const top = [...kept].sort((x, y) => (y.videos ?? 0) - (x.videos ?? 0)).slice(0, SAY_HEAR_MAX)
    for (const x of kept.filter((k) => !top.includes(k))) held.push({ what: `say_hear: ${x.title ?? ''}`, reason: 'over the section\'s cap' })
    const shown = kept.filter((k) => top.includes(k))
    for (const k of shown) printed.push({ item: k, videoIds: k.videoIds ?? [] })
    return shown.length ? section('marketing.say_hear', [{ items: shown }]) : null
  }

  // ---- marketing: how rivals are heard, the company's own card, and the brands' own posts -------
  function rivalsHeard(): BriefSection | null {
    const p = itemsOf('rivals', { rival: true })
    const youRaw = a.written?.you
    const youLine = youRaw ? standingLine({ text: youRaw.text, based_on: youRaw.based_on }, ['marketing.recall', 'marketing.claims', 'marketing.rivals'], EXTRA_MAX.youText, 'you', { aboutClient: true }) : null
    const youIdea = youLine && youRaw?.idea ? run(youRaw.idea, Math.round(EXTRA_MAX.youIdea * SLACK), 'headline', 'you.idea', { whole: true }) : ''
    const you: BriefItem | null = youLine && youIdea ? { ...youLine, title: co, pill: youIdea, you: true } : null
    const rows = (a.posts ?? []).filter((r) => r.posts > 0)
      .map((r) => ({ name: r.name, you: r.you, posts: r.posts, five: Math.min(r.five, r.posts), pct: Math.round((Math.min(r.five, r.posts) / r.posts) * 100) }))
      .sort((x, y) => Number(y.you) - Number(x.you) || y.pct - x.pct || y.posts - x.posts || x.name.localeCompare(y.name))
    const items = [...p.items, ...(you ? [you] : [])]
    if (items.length === 0 && rows.length === 0) return null
    return section('marketing.rivals', items.length ? [{ items }] : [], rows.length ? { posts: { title: `Own posts published in ${month}`, rows } } : {})
  }

  // ---- content: hooks and formats that work (counted) ---------------------------------------------
  function formats(): BriefSection | null {
    const pb = a.playbook
    if (!pb || pb.unread) return null
    const tableOf = (m: PlaybookBlock['formats'], rowsMax: number) => {
      const cat = m.sides[0]
      const own = m.sides.find((s) => s.audience === CLIENT_AUDIENCE) ?? null
      const rival = m.sides.find((s) => isRivalAudience(s.audience)) ?? null
      if (!cat || cat.of === 0) return null
      const ownRead = own && !own.unread && own.of > 0 ? own : null
      const rivalRead = rival && !rival.unread && rival.of > 0 ? rival : null
      const overall = cat.median.value
      const items: BriefItem[] = []
      const listed = m.keys.slice(0, rowsMax)
      for (const k of listed) {
        const row = cat.byKey[k.key]
        if (!row || row.value.k === 0) continue
        const rated = row.engagement.median != null && row.engagement.n >= FORMAT_LINE_MIN_RATED
        items.push({
          title: k.label,
          text: `${pct0(row.value.k, cat.of)} of the category's videos published in ${month}${rated ? `, at a median engagement of ${row.engagement.median!.toFixed(1)}%` : ''}.`,
          measure: {
            pct: Math.round((row.value.k / cat.of) * 1000) / 10,
            median: rated ? row.engagement.median : null,
            above: rated && row.engagement.band != null && overall != null && row.engagement.band.low > overall,
            ...(ownRead ? { own: ownRead.byKey[k.key]?.value.k ?? 0, ownOf: ownRead.of } : {}),
            ...(rivalRead ? { rival: rivalRead.byKey[k.key]?.value.k ?? 0, rivalOf: rivalRead.of } : {}),
          },
        })
      }
      // A line names only a listed row, and only one whose band clears the
      // category's median video: a median over a few videos whose band takes
      // in the category's own is not "running at" anything.
      const rows = listed.map((k) => cat.byKey[k.key]).filter((r): r is NonNullable<typeof r> => r != null)
      const best = rows.filter((r) => r.engagement.median != null && r.engagement.n >= FORMAT_LINE_MIN_RATED && r.engagement.band != null && overall != null && r.engagement.band.low > overall)
        .sort((x, y) => (y.engagement.median ?? 0) - (x.engagement.median ?? 0))[0] ?? null
      const common = rows.find((r) => r.value.k > 0) ?? null
      const topOf = (side: typeof own) => {
        if (!side || side.unread || side.of === 0) return null
        return listed.map((k) => ({ label: k.label, k: side.byKey[k.key]?.value.k ?? 0 })).filter((x) => x.k > 0).sort((x, y) => y.k - x.k)[0] ?? null
      }
      return { cat, ownRead, rivalRead, items, best, common, overall, ownTop: topOf(own), rivalTop: topOf(rival) }
    }
    const f = tableOf(pb.formats, FORMAT_ROWS)
    const h = tableOf(pb.hooks, HOOK_ROWS)
    if (!f && !h) return null
    const lines: string[] = []
    if (f?.best && f.overall != null) lines.push(`${f.best.label} videos run at ${f.best.engagement.median!.toFixed(1)}% median engagement in the category, against ${f.overall.toFixed(1)}% for all its videos.`)
    if (h?.best) {
      const common = h.common && h.common !== h.best && h.common.engagement.median != null && h.common.engagement.n >= FORMAT_LINE_MIN_RATED ? h.common : null
      lines.push(`${h.best.label} openings run at ${h.best.engagement.median!.toFixed(1)}%.${common ? ` The most common opening, ${common.label.toLowerCase()}, runs at ${common.engagement.median!.toFixed(1)}%.` : ''}`)
    }
    if (f?.ownRead && f.ownTop && h?.ownTop) {
      lines.push(`Of these ${fmtInt(f.ownRead.of)} ${co} posts, ${fmtInt(f.ownTop.k)} were ${f.ownTop.label.toLowerCase()} posts and ${fmtInt(h.ownTop.k)} opened with a ${h.ownTop.label.toLowerCase()}.${f.rivalRead && f.rivalTop && h.rivalTop ? ` ${f.rivalRead.label}'s videos are most often ${f.rivalTop.label.toLowerCase()} videos, and most often open with a ${h.rivalTop.label.toLowerCase()}.` : ''}`)
    }
    const baseOf = (t: NonNullable<typeof f>) => {
      const counts = [
        ...(t.ownRead ? [`${fmtInt(t.ownRead.of)} ${co} ${t.ownRead.of === 1 ? 'post' : 'posts'}`] : []),
        ...(t.rivalRead ? [`${fmtInt(t.rivalRead.of)} ${t.rivalRead.label} ${t.rivalRead.of === 1 ? 'video' : 'videos'}`] : []),
      ]
      return `Shares of ${fmtInt(t.cat.of)} category videos${counts.length ? ` · counts of ${andList(counts)}` : ''}`
    }
    const groups = [
      ...(f && f.items.length ? [{ label: 'Format', items: f.items, base: baseOf(f) }] : []),
      ...(h && h.items.length ? [{ label: 'Opening', items: h.items, base: baseOf(h) }] : []),
    ]
    if (groups.length === 0) return null
    const overall = (f ?? h)!.overall
    return section('content.formats', groups, {
      ...(lines.length ? { lines } : {}),
      ...(overall != null ? { note: `Median engagement across all the category's videos: ${overall.toFixed(1)}%` } : {}),
      ...((f ?? h)!.rivalRead ? { rival: (f ?? h)!.rivalRead!.label } : {}),
    })
  }

  // ---- leadership: where the market stands (the subjects people talked about) --------------------
  function market(): BriefSection | null {
    const subjects = a.subjects ?? []
    if (subjects.length === 0) return null
    const sentences = new Map((a.written?.subjects ?? []).map((s) => [String(s.subject).trim().toUpperCase(), run(s.sentence, Math.round(BRIEF_MAX.subject * SLACK), 'market', `subject.${s.subject}`, { maxSentences: 1 })]))
    const ready = subjects.filter(({ fact }) => fact.calibration === 'ready' && fact.level && fact.level.n > 0)
      .sort((x, y) => (x.fact.rank || 99) - (y.fact.rank || 99))
    const rest = subjects.filter((s) => !ready.includes(s) && s.fact.calibration !== 'failed')
    const items: BriefItem[] = []
    for (const { id, fact } of [...ready, ...rest]) {
      const sentence = sentences.get(id.toUpperCase()) ?? ''
      const level = fact.calibration === 'ready' && fact.level && fact.level.n > 0
        ? `${pct0(fact.level.k, fact.level.n)} of ${month}'s videos in the market${fact.rank >= 1 && fact.rank <= BIGGEST.length ? `, the ${BIGGEST[fact.rank - 1]} subject` : ''}.`
        : ''
      // What people say about it, or failing that one of their voices; a
      // subject with neither prints nothing, not its bare name (the review's
      // addendum: a list of names says nothing).
      const voice = sentence ? null : subjectQuote(fact)
      if (!sentence && !voice) { held.push({ what: `subject: ${fact.name}`, reason: 'nothing was said about it' }); continue }
      const pct = fact.calibration === 'ready' && fact.level && fact.level.n > 0 ? Math.round((fact.level.k / fact.level.n) * 100) : null
      items.push({ title: fact.name, text: sentence, ...(voice ? { quote: voice } : {}), ...(level ? { detail: level } : {}), ...(pct != null ? { measure: { pct } } : {}) })
    }
    for (const { fact } of subjects) if (fact.calibration === 'failed') held.push({ what: `subject: ${fact.name}`, reason: 'its matching is not trusted, so nothing about it prints' })
    const n = ready[0]?.fact.level?.n ?? 0
    const k = kindsOf()
    return items.length
      ? section('leadership.market', [{ items }], { ...(n > 0 ? { base: `Share of the ${fmtInt(n)} videos in your market in ${month}` } : {}), ...k })
      : null
  }

  /** A subject's own strict-gated voice, where it is not printed already. */
  function subjectQuote(fact: StandingFact): BriefQuote | null {
    const q = fact.quoteRef
    if (!q?.ref || a.quotes.picked().includes(q.ref)) return null
    a.quotes.spend([q.ref])
    return { ref: q.ref, text: '', date: q.date, platform: q.platform, about: 'market', ownPost: false, lang: null }
  }

  /** What people did in the comments, and the mood, as the canvas's bars:
   *  shares only over enough videos (`marketLevel`'s floor). */
  function kindsOf(): Pick<BriefSection, 'kinds' | 'mood'> {
    const m = a.kinds
    if (!m || m.n == null || m.n < KIND_MIN_N) return {}
    const n = m.n
    const rows = m.kinds.filter((r) => r.k != null && r.k >= KIND_MIN_K)
      .sort((x, y) => (y.k ?? 0) - (x.k ?? 0)).slice(0, 3)
      .map((r) => ({ label: kindLabel(r.kind), pct: pctShort(((r.k ?? 0) / n) * 100) }))
    const judged = m.judged ?? 0
    const mood = judged >= KIND_MIN_N && m.mood.every((r) => r.k != null)
      ? m.mood.map((r) => ({ mood: r.mood, label: `${r.mood[0].toUpperCase()}${r.mood.slice(1)}`, pct: pctShort(((r.k ?? 0) / judged) * 100) }))
      : []
    return {
      ...(rows.length ? { kinds: { base: `Share of the ${fmtInt(n)} videos in your market in ${month}`, rows } } : {}),
      ...(mood.length ? { mood: { base: judged === n ? `The same ${fmtInt(n)} videos` : `${fmtInt(judged)} of the same ${fmtInt(n)} videos`, rows: mood } } : {}),
    }
  }

  // ---- leadership: where the company stands against its rivals -----------------------------------
  function shares(): BriefSection | null {
    const s = brandShares(a)
    if (!s) return null
    const items: BriefItem[] = s.brands.map((b) => ({
      title: b.you ? `${co} (you)` : b.name,
      text: `${pct1(b.comments, s.base.comments)} of ${month}'s comments and ${pct1(b.videos, s.base.videos)} of its videos.`,
      ...(b.where ? { detail: b.where } : {}),
      ...(b.you ? { you: true } : {}),
      measure: { comments: Math.round((b.comments / s.base.comments) * 1000) / 10, videos: Math.round((b.videos / s.base.videos) * 1000) / 10 },
    }))
    return section('leadership.shares', [{ items }], {
      sub: `Share of ${month}'s conversation: ${fmtInt(s.base.comments)} comments and ${fmtInt(s.base.videos)} videos, ${co}'s own posts included.`,
      shares: { comments: s.bars.comments, videos: s.bars.videos },
      lines: s.notes,
    })
  }

  // ---- leadership: what holds so far ---------------------------------------------------------------
  function holds(): BriefSection | null {
    const lr = a.longRun
    if (!lr || lr.ideas.length === 0) return null
    const items: BriefItem[] = lr.ideas.filter((i) => i.headline.trim() && i.videos >= ITEM_MIN_VIDEOS).map((i) => ({ text: i.headline.trim(), videos: i.videos }))
    if (items.length === 0) return null
    const months = [...lr.months].sort()
    const everyMonth = lr.ideas.filter((i) => i.headline.trim() && i.videos >= ITEM_MIN_VIDEOS)
      .every((i) => months.every((m) => (i.months.find((x) => x.month === m)?.videos ?? 0) > 0))
    const each = everyMonth && months.length >= 2 ? ` Each was heard in ${months.length === 2 ? 'both months' : `all ${numberWord(months.length)} months`}.` : ''
    const position = standingLine(a.written?.position, ['leadership.stand', 'leadership.weigh', 'leadership.risk'], EXTRA_MAX.position, 'position', { aboutClient: true, f: 'interpret' })
    return section('leadership.holds', [{ items }], {
      ...(months.length ? { sub: `Patterns here describe ${monthsPhrase(months)}.${each}` } : {}),
      ...(position ? { position } : {}),
    })
  }

  // ---- leadership: what each brand is heard for (the finding's chips) ------------------------------
  function heardFor(): BriefFinding['heardFor'] | null {
    const out: NonNullable<BriefFinding['heardFor']> = []
    let you: NonNullable<BriefFinding['heardFor']>[number] | null = null
    for (const [n, w] of (a.written?.heard_for ?? []).entries()) {
      const phrase = run(w.phrase ?? '', Math.round(EXTRA_MAX.phrase * SLACK), 'headline', `heard_for${n}`, { whole: true })
      const ids = citedFrom(w.based_on, ['leadership.stand', 'leadership.weigh', 'leadership.risk'])
      if (!phrase || ids.length === 0) { held.push({ what: `heard_for: ${w.brand}`, reason: 'nothing that stood' }); continue }
      const isYou = names(String(w.brand ?? ''), co) && !a.rivals.some((r) => names(String(w.brand ?? ''), r))
      const rival = isYou ? null : groundedRival(String(w.brand ?? ''), a.rivals, ids.map((id) => byId.get(id)?.text ?? ''))
      if (!isYou && !rival) { held.push({ what: `heard_for: ${w.brand}`, reason: 'not the company or a tracked rival a cited point names' }); continue }
      const about: About = isYou ? 'client' : `rival:${rival}`
      if (videosAbout(ids, about) < BRAND_MIN_VIDEOS) { held.push({ what: `heard_for: ${w.brand}`, reason: `only ${videosAbout(ids, about)} of its videos are about it` }); continue }
      if (a.meaning.best(phrase, ids.map((id) => byId.get(id)!.text)) < FIT.question) { held.push({ what: `heard_for: ${w.brand}`, reason: 'the phrase says nothing its points say' }); continue }
      if (isYou) you = { name: co, you: true, phrase }
      else if (!out.some((x) => x.name === rival)) out.push({ name: rival!, you: false, phrase })
    }
    const chips = [...out.slice(0, EXTRA_MAX.heardFor - (you ? 1 : 0)), ...(you ? [you] : [])]
    return chips.length >= HEARD_FOR_MIN ? chips : null
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

const STOP = new Set(['a', 'an', 'and', 'or', 'the', 'of', 'to', 'in', 'on', 'for', 'not', 'no', 'too', 'very', 'it', 'its', 'with', 'from', 'by', 'at', 'as'])
/** Does a short phrase use the words of `text`? Each of its words of three
 *  letters or more (stop words out) is in it, a plural or tense apart. Pure. */
export function wordsIn(phrase: string, text: string): boolean {
  const have = (text.toLowerCase().match(/[\p{L}]+/gu) ?? [])
  const want = (phrase.toLowerCase().match(/[\p{L}]+/gu) ?? []).filter((w) => w.length >= 3 && !STOP.has(w))
  if (want.length === 0) return false
  return want.every((w) => {
    const root = w.length > 4 ? w.slice(0, Math.max(3, w.length - 2)) : w.replace(/s$/, '')
    return have.some((h) => h.startsWith(root))
  })
}

/** The brands' shares of the month's comments and videos, the company's own
 *  posts included (the canvas's "Where {company} stands against its rivals"),
 *  where the product counts the company's talk and a rival's. Null otherwise.
 *  Pure. */
export function brandShares(a: Pick<ComposeInput, 'company' | 'audiences' | 'rivals' | 'brandsCounted' | 'giveaway'>): {
  base: { comments: number; videos: number }
  brands: { name: string; you: boolean; comments: number; videos: number; where: string }[]
  bars: { comments: ShareBar; videos: ShareBar }
  notes: string[]
} | null {
  const rows = a.audiences ?? []
  const co = a.company
  const client = rows.find((r) => r.audience === CLIENT_AUDIENCE) ?? null
  if (!a.brandsCounted.client || !client || client.comments <= 0) return null
  const counted = (name: string) => a.brandsCounted.rivals.some((n) => n.toLowerCase() === name.toLowerCase()) && a.rivals.some((n) => n.toLowerCase() === name.toLowerCase())
  const rivals = rows.filter((r) => isRivalAudience(r.audience) && r.videos > 0 && counted(rivalNameOf(r.audience) ?? ''))
  if (rivals.length === 0) return null
  const base = { comments: rows.reduce((n, r) => n + r.comments, 0), videos: rows.reduce((n, r) => n + r.videos, 0) }
  if (base.comments <= 0 || base.videos <= 0) return null
  // Uncounted rivals' talk is in the rest, which is then more than the category.
  const restIsCategory = rows.every((r) => r.audience === CLIENT_AUDIENCE || r.audience === INDUSTRY_AUDIENCE || rivals.includes(r))
  const restName = restIsCategory ? 'the rest of the category' : 'the rest'
  const platformsOf = (r: AudienceRow) => Object.entries(r.platforms ?? {}).filter(([, v]) => Number(v) > 0).sort((x, y) => Number(y[1]) - Number(x[1]) || x[0].localeCompare(y[0])).map(([p]) => platformName(p))
  const brands = [
    { name: co, you: true, comments: client.comments, videos: client.videos, where: platformsOf(client).length ? `Its own ${andList(platformsOf(client).slice(0, 3))} posts` : '' },
    ...rivals.map((r) => ({ name: rivalNameOf(r.audience) ?? r.audience, you: false, comments: r.comments, videos: r.videos, where: platformsOf(r).slice(0, 3).join(', ') })),
  ].sort((x, y) => y.comments - x.comments || y.videos - x.videos || x.name.localeCompare(y.name))
  const pct = (k: number, n: number) => Math.round((k / n) * 1000) / 10
  const bar = (k: 'comments' | 'videos'): ShareBar => {
    const c = pct(client[k], base[k])
    const r = pct(rivals.reduce((n, x) => n + x[k], 0), base[k])
    const rest = Math.max(0, Math.round((100 - c - r) * 10) / 10)
    const its = rivals.length === 1 ? 'its rival' : `its ${numberWord(rivals.length)} rivals`
    return { client: c, rivals: r, rest, line: `${co} ${c.toFixed(1)}% · ${its} ${r.toFixed(1)}% · ${restName} ${rest.toFixed(1)}%` }
  }
  const bars = { comments: bar('comments'), videos: bar('videos') }
  // The notes, code's: the company's place among these brands (with the
  // giveaway posts said where they carried its comments), the brands
  // together against the rest, and where each is talked about.
  const notes: string[] = []
  const at = brands.findIndex((b) => b.you)
  const top = brands[0]
  const all = `these ${numberWord(brands.length)} brands`
  const g = a.giveaway && a.giveaway.comments > 0 ? a.giveaway : null
  notes.push(`${co} holds ${bars.comments.client.toFixed(1)}% of the month's comments, ${at === 0 ? `the most of ${all}` : `${ORDINAL[at] ?? fmtInt(at + 1)} of ${all}, behind ${top.name}'s ${pct(top.comments, base.comments).toFixed(1)}%`}.${g ? ` ${fmtInt(g.comments)} of ${co}'s comments were on ${g.posts === 1 ? 'one giveaway post' : `${fmtInt(g.posts)} giveaway posts`}.` : ''}`)
  notes.push(`${co} and ${rivals.length === 1 ? 'its rival' : `its ${numberWord(rivals.length)} rivals`} together hold ${(Math.round((bars.comments.client + bars.comments.rivals) * 10) / 10).toFixed(1)}% of the month's comments. ${restName[0].toUpperCase()}${restName.slice(1)} holds ${bars.comments.rest.toFixed(1)}%.`)
  const own = brands.find((b) => b.you)!.where
  const rivalPlatforms = new Map<string, number>()
  for (const r of rivals) for (const [p, v] of Object.entries(r.platforms ?? {})) rivalPlatforms.set(platformName(p), (rivalPlatforms.get(platformName(p)) ?? 0) + Number(v))
  const theirs = [...rivalPlatforms.entries()].filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 3).map(([p]) => p)
  if (own && theirs.length) notes.push(`${co}'s comments sit under ${own.replace(/^Its/, 'its')}. ${rivals.length === 1 ? 'Its rival is' : 'Its rivals are'} talked about on ${andList(theirs)}.`)
  return { base, brands, bars, notes }
}

/** The figures In short prints, each from a count code holds: the market's
 *  month for everyone, then one that belongs to the reader (the canvas's
 *  two). Pure. */
export function figuresFor(a: Pick<ComposeInput, 'role' | 'company' | 'month' | 'market' | 'subjects' | 'ownPosts' | 'playbook'> & Partial<Pick<ComposeInput, 'audiences' | 'rivals' | 'brandsCounted' | 'giveaway'>>): BriefFigure[] {
  const month = longMonth(a.month)
  const out: BriefFigure[] = []
  if (a.market?.videos) {
    out.push(a.role === 'leadership' && a.market.comments
      ? { value: fmtInt(a.market.videos), label: `videos and ${fmtInt(a.market.comments)} comments in your market in ${month}` }
      : { value: fmtInt(a.market.videos), label: `videos in your market in ${month}` })
  }
  if (a.role === 'sales') {
    const top = (a.subjects ?? []).map((s) => s.fact).filter((f) => f.calibration === 'ready' && f.level && f.level.n > 0 && f.rank === 1)[0]
    if (top?.level) out.push({ value: pct0(top.level.k, top.level.n), label: `of them about ${top.name}, the biggest subject` })
  }
  if (a.role === 'marketing' && a.ownPosts != null && a.ownPosts > 0) out.push({ value: fmtInt(a.ownPosts), label: `posts ${a.company} published in ${month}` })
  if (a.role === 'content' && a.playbook && !a.playbook.unread) {
    const cat = a.playbook.formats.sides[0]
    const overall = cat?.median.value ?? null
    const listed = a.playbook.formats.keys.slice(0, FORMAT_ROWS).map((k) => ({ label: k.label, row: cat?.byKey[k.key] ?? null })).filter((r): r is { label: string; row: NonNullable<typeof r.row> } => r.row != null)
    const best = listed.filter(({ row }) => row.engagement.median != null && row.engagement.n >= FORMAT_LINE_MIN_RATED && row.engagement.band != null && overall != null && row.engagement.band.low > overall)
      .sort((x, y) => (y.row.engagement.median ?? 0) - (x.row.engagement.median ?? 0))[0]
    if (best && overall != null) out.push({ value: `${best.row.engagement.median!.toFixed(1)}%`, label: `median engagement on the category's ${best.label.toLowerCase()} videos, against ${overall.toFixed(1)}% for all its videos` })
  }
  if (a.role === 'leadership' && a.audiences && a.brandsCounted) {
    const s = brandShares({ company: a.company, audiences: a.audiences, rivals: a.rivals ?? [], brandsCounted: a.brandsCounted, giveaway: a.giveaway ?? null })
    const you = s?.brands.find((b) => b.you)
    const top = s?.brands.find((b) => !b.you)
    if (s && you && top) out.push({ value: `${s.bars.comments.client.toFixed(1)}%`, label: `of ${month}'s comments were under ${a.company}'s posts; ${top.name} held ${(Math.round((top.comments / s.base.comments) * 1000) / 10).toFixed(1)}%` })
  }
  return out
}

// ---- the set ----------------------------------------------------------------------------------

/** The words of an item a reader reads: its title, its text, its second line
 *  and its columns. */
const itemWords = (i: BriefItem): string => [
  i.title ? `${i.title}.` : '', i.text, i.detail ?? '',
  i.persona?.want ?? '', i.persona?.stops ?? '', i.persona?.moves ?? '', i.persona?.forSale ?? '',
].filter(Boolean).join(' ')

/** The words a quote ref resolves to, where the set has them (the quote
 *  pool's `textOf`): the deck fits a page by its voices' length, so what a
 *  page prints is judged with them. */
export type QuoteWordsOf = (ref: string) => { text: string; english: string | null; lang: string | null } | null

/** The brief's sections as the deck prints them: its pages that stand, each
 *  cut to what fits, its quotes' words resolved where `words` has them. */
function printedOf(d: MonthlyBriefData, words?: QuoteWordsOf): BriefSection[] {
  if (!words) return printedSections(d)
  const texts = new Map<string, QuoteResolution>()
  for (const ref of collectQuoteRefs(d)) {
    const w = words(ref)
    if (w?.text) texts.set(ref, w)
  }
  return printedSections(resolveQuotes(d, texts))
}

/** The keys (`itemKey`) of the items a brief prints. */
const printedKeys = (d: MonthlyBriefData, words?: QuoteWordsOf): Set<string> =>
  new Set(printedOf(d, words).flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => itemKey(d.role, s.key, i)))))

/** Every printed text of a brief: what an In short sentence must find itself
 *  in. A page the deck leaves out, or a section it has no page for, is not
 *  printed text; nor is an item that did not fit its page. */
export function printedTexts(d: MonthlyBriefData, words?: QuoteWordsOf): { text: string; brands: string }[] {
  // An item that only names another brief's idea is not this brief's to
  // summarise: In short says what THIS brief argues.
  return [
    ...d.findings.flatMap((f) => [f.headline, ...f.saw, f.means, ...f.practice]),
    ...printedOf(d, words).flatMap((s) => [
      ...(s.lead ? [s.lead] : []),
      ...(s.note ? [s.note] : []),
      ...(s.also ? [s.also] : []),
      ...(s.panel?.rows ?? []).map((r) => r.text),
      ...(s.position ? [s.position.text] : []),
      ...s.groups.flatMap((g) => g.items.filter((i) => !i.tag && i.text).map(itemWords)),
    ]),
  ].map((text) => ({ text, brands: text }))
}

/**
 * In short says only what the brief PRINTED (the review: held items fed the
 * summaries). Each sentence must sit close in meaning to something printed
 * (`FIT.summary`), and a sentence that names a brand must sit close to a
 * printed text that names it too. The rest drop, into `held`. Pure.
 */
export function summaryAgainstPrinted(d: MonthlyBriefData, meaning: Meaning, brands: readonly string[], words?: QuoteWordsOf): MonthlyBriefData {
  const printed = printedTexts(d, words).map((p) => p.text)
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
 * same videos, keeps its first sentence and names that brief. Only an item
 * the earlier brief PRINTS is named (Heinrich, 12 Oct: a footnote never
 * points at a page that did not print): not one in a section the canvas has
 * no page for, on a page left out as thin, or past what fits its page. Pure.
 */
export function namedAcross(briefs: readonly MonthlyBriefData[], meaning: Meaning, words?: QuoteWordsOf): MonthlyBriefData[] {
  const order = [...briefs].sort((x, y) => BRIEF_ROLES.indexOf(x.role) - BRIEF_ROLES.indexOf(y.role))
  const seen: { role: BriefRole; key: string; text: string; videoIds: string[] }[] = []
  const out = new Map<BriefRole, MonthlyBriefData>()
  for (const d of order) {
    const sections = d.sections.map((s) => ({
      ...s,
      groups: s.groups.map((g) => ({
        ...g,
        items: g.items.map((i) => {
          if (i.tag || !i.videoIds?.length || s.key === 'leadership.decisions' || !printsSection(s.key)) return i
          const said = `${i.title ? `${i.title}. ` : ''}${i.text}`
          const earlier = seen.find((e) => e.role !== d.role && overlapOfSmaller(i.videoIds!, e.videoIds) >= SAME_AS_FINDING && meaning.sim(said, e.text) >= FIT.same)
          if (!earlier) return i
          const rest: BriefItem = { ...i, text: firstSentence(i.text), tag: `Also in the ${BRIEF_NAME[earlier.role]}`, named: { brief: earlier.role, item: earlier.key } }
          delete rest.detail
          delete rest.persona
          return rest
        }),
      })),
    }))
    const named = { ...d, sections }
    const printed = printedKeys(named, words)
    for (const s of sections) {
      for (const g of s.groups) {
        for (const i of g.items) {
          const key = itemKey(d.role, s.key, i)
          if (!i.tag && i.videoIds?.length && printed.has(key)) seen.push({ role: d.role, key, text: `${i.title ? `${i.title}. ` : ''}${i.text}`, videoIds: i.videoIds })
        }
      }
    }
    out.set(d.role, named)
  }
  return briefs.map((d) => out.get(d.role)!)
}

/**
 * A footnote never points at what did not print (Heinrich, 12 Oct). Every
 * item that names another brief ("… is argued in full in the Marketing
 * brief", "… is also in the Sales brief", a risk card's foot) keeps its tag
 * only where what it names prints there: the idea's finding page, or that
 * brief's item on a page the deck prints. One that points at nothing is held
 * (it was cut to its first sentence to name the other brief, so it does not
 * stand on its own). In role order, each brief against the earlier briefs as
 * they finally print, so a page that a held line leaves thin is accounted for
 * by the briefs after it. A brief outside the set is not judged. Pure.
 */
export function footnotesOnlyPrinted(briefs: readonly MonthlyBriefData[], words?: QuoteWordsOf): MonthlyBriefData[] {
  const order = [...briefs].sort((x, y) => BRIEF_ROLES.indexOf(x.role) - BRIEF_ROLES.indexOf(y.role))
  const done = new Map<BriefRole, MonthlyBriefData>()
  const keys = new Map<BriefRole, Set<string>>()
  const prints = (n: NonNullable<BriefItem['named']>): boolean => {
    const target = done.get(n.brief) ?? briefs.find((b) => b.role === n.brief)
    if (!target) return true
    if ('idea' in n) return target.findings.some((f) => f.ideaId === n.idea)
    // An earlier brief is final once done, so its pages are read once.
    if (!done.has(n.brief)) return printedKeys(target, words).has(n.item)
    if (!keys.has(n.brief)) keys.set(n.brief, printedKeys(target, words))
    return keys.get(n.brief)!.has(n.item)
  }
  for (const d of order) {
    const held = [...d.held]
    const sections = d.sections.map((s) => ({
      ...s,
      groups: s.groups.map((g) => ({
        ...g,
        items: g.items.filter((i) => {
          if (!i.tag || !i.named || prints(i.named)) return true
          held.push({ what: `${s.key}: ${(i.title ?? i.text).slice(0, 60)}`, reason: `it names the ${BRIEF_NAME[i.named.brief]}, which does not print what it names` })
          return false
        }),
      })).filter((g) => g.items.length > 0 || (g.lines?.length ?? 0) > 0),
    })).filter((s) => sectionSays(s))
    done.set(d.role, held.length === d.held.length ? d : { ...d, sections, held })
  }
  return briefs.map((d) => done.get(d.role)!)
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
