import type { ConfigChange } from '../config-log'
import { fmtInt, longMonth, platformLabel } from '../format'
import { changeInSpan, isSearchSurface, modeForShare, type OurChange } from '../reading/comparability'
import { communityDelta, type GatherRun } from '../provenance/searches'
import { monthStartOf, nextMonth, prevMonth as monthBefore } from '../reading/month-key'
import { BRANDS_PANEL, CATEGORY_AUDIENCE, type PairOn } from '../reading/pairs'
import { addedOnlyRecordSentence, type ChangeBlock, type LedgerLine } from '../pages/overview-market/change'
import type { FigureTable } from '../reading/verdicts'
import { SURFACE_WORDS } from './change-log'

// Settings › What we changed: the dated list of our own changes (market-first
// WP1.6, plan §2.10 D2), the list that was to sit in the front page's "How
// sound" block and moved here with the 25 Sep rulings. The front page's "What
// we changed, and when →" opens it.
//
// ONE LINE PER CHANGE, NEVER PER ROW. A change of ours is what
// `changesFromLog` groups (lib/reading/comparability.ts): the audit trigger's
// three rows for one script, the reconstruction's fourteen for one swap. Each
// line prints the change once, in client words, with the months it touched
// and how much of each month it brought in (MF1's `config_change_reach`, the
// newest computation per month, on the market's population), and the update
// that measure was read with. A change nobody has measured says so; it is
// never printed as a zero.
//
// PURE. The page reads the change log (the one memoised read every reading
// page already makes), the reach rows and the runs, and hands them in.

/** One `config_change_reach` row (MF1), as the list reads it. */
export interface ReachRow {
  changeId: string
  month: string
  population: string
  touched: number
  inMonth: number
  readThroughRun: string | null
  computedAt: string
}

/** The words for a change no count describes, per surface, in client words.
 *  The three MF1 surfaces (WP1.4) use the preview's headings, except the
 *  relevance check, which reads as The record's surface name does
 *  (`SURFACE_WORDS` in lib/settings/change-log.ts), so one change has one
 *  name on the tab (settled at the deploy 2 integration). */
const SURFACE_SENTENCE: Record<string, string> = {
  gate_rule: 'How we check relevance',
  attribution: 'How we file a video to a brand',
  segment: 'How we mark makers’ videos',
  entity_retag: 'Stored videos filed again under the brand they are about',
  regate: 'Stored videos checked again for relevance',
  prompt_version: 'How we read comments changed',
  platforms: 'The platforms we read changed',
  knobs: 'How deeply we read changed',
  handles: 'The accounts we read changed',
  rival_rename: 'A rival was renamed',
  other: 'A change to how we read',
}

/** Surfaces whose stored note is client words: the rows market-first's own
 *  scripts write (WP1.4). Since 27 Sep they are written with no note
 *  (Heinrich: no client-visible notes on our own changes), so each is titled
 *  by its surface alone; a note prints only where a row still holds one
 *  (staging's 26 Sep rehearsal rows). Every older row's note is the
 *  reconstruction's operator prose (GC F9) and is never printed here. */
const CLIENT_NOTE_SURFACES: ReadonlySet<string> = new Set(['gate_rule', 'attribution', 'segment'])

/** `other` rows whose stored note is client words: the capped update
 *  `log-tracking-eras --capped-run` writes (field 'gather_capped'; with no
 *  note since 27 Sep, when it reads "A change to how we read"). Every other
 *  `other` row (an attention-panel freeze, an operator's edit) carries
 *  operator prose and is never printed here. */
const CLIENT_NOTE_OTHER_FIELDS: ReadonlySet<string> = new Set(['gather_capped'])

const listOf = (side: unknown): string[] =>
  Array.isArray(side) ? side.filter((v): v is string => typeof v === 'string') : []

/** Is this `terms` row the exclusions list (words a video must not carry),
 *  not a search term? Shared with the lead's new-search count
 *  (lib/pages/overview-market/provenance.ts), so the two agree on what "terms
 *  added" means. */
export const isExclusions = (r: Pick<ConfigChange, 'field'>): boolean => r.field === 'exclude_terms'

/** What a group of rows added and removed from one list, each once. */
function moved(rows: readonly Pick<ConfigChange, 'before' | 'after'>[]): { added: string[]; removed: string[] } {
  const added = new Set<string>()
  const removed = new Set<string>()
  for (const r of rows) {
    const before = new Set(listOf(r.before))
    const after = new Set(listOf(r.after))
    for (const t of after) if (!before.has(t)) added.add(t)
    for (const t of before) if (!after.has(t)) removed.add(t)
  }
  for (const t of [...added]) if (removed.has(t)) { added.delete(t); removed.delete(t) }
  return { added: [...added].sort(), removed: [...removed].sort() }
}

/** The search terms a group of `terms` rows added and removed, each once; the
 *  exclusions list is not a search term and is left out. */
export function termsMoved(rows: readonly Pick<ConfigChange, 'surface' | 'field' | 'before' | 'after'>[]): { added: string[]; removed: string[] } {
  return moved(rows.filter((r) => r.surface === 'terms' && !isExclusions(r)))
}

/** The gathers a community line is read against: when each community was
 *  searched (keyword_performance, `gathersOf`). Null where they were not read. */
export type CommunityGathers = readonly Pick<GatherRun, 'at' | 'terms'>[] | null

/**
 * The communities a group of `subreddits` rows switched on and off, as
 * `r/<name>` labels (lib/gather/subreddits.ts `subredditLabel`'s form).
 * THE RECONSTRUCTION'S ROWS ARE READ AGAINST THE GATHERS
 * (lib/provenance/searches.ts communityDelta, the reading log-tracking-eras'
 * reach uses): they carry a day and today's status, so Sealand's 9 Sep rows
 * switch on r/backpacks, which has run in every gather since 17 Aug, and log
 * r/onebag only as proposed, though it first ran that evening. Read against
 * the gathers the line is "r/onebag and r/travelgear". Where no gather was
 * read, every row is read as it stands.
 */
function communitiesMoved(rows: readonly ConfigChange[], gathers: CommunityGathers): { on: string[]; off: string[] } {
  const { added, removed } = communityDelta(rows, gathers)
  return { on: [...added].sort(), off: [...removed].sort() }
}

const plural = (n: number, one: string, many: string): string => `${fmtInt(n)} ${n === 1 ? one : many}`

/** "a", "a and b", "a, b and c". */
const andList = (names: readonly string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** A platform → handle map off a stored side; anything else is empty. */
function handleMap(side: unknown): Map<string, string> {
  const out = new Map<string, string>()
  if (!side || typeof side !== 'object' || Array.isArray(side)) return out
  for (const [platform, handle] of Object.entries(side as Record<string, unknown>)) {
    if (typeof handle === 'string' && handle.trim()) out.set(platform, handle.trim())
  }
  return out
}

/** A brand → (platform → handle) map off a stored `competitor_handles` side. */
function brandHandles(side: unknown): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>()
  if (!side || typeof side !== 'object' || Array.isArray(side)) return out
  for (const [brand, handles] of Object.entries(side as Record<string, unknown>)) {
    const m = handleMap(handles)
    if (brand.trim() && m.size > 0) out.set(brand.trim(), m)
  }
  return out
}

/** The platforms two maps disagree on: added, taken out, and changed. */
function platformsMoved(before: Map<string, string>, after: Map<string, string>): { added: string[]; removed: string[]; changed: string[] } {
  const order = (ps: string[]) => ps.sort((a, b) => platformLabel(a).localeCompare(platformLabel(b)))
  return {
    added: order([...after.keys()].filter((p) => !before.has(p))),
    removed: order([...before.keys()].filter((p) => !after.has(p))),
    changed: order([...after.keys()].filter((p) => before.has(p) && before.get(p) !== after.get(p))),
  }
}

/** "a TikTok account", "TikTok and YouTube accounts". */
const accountsWord = (platforms: readonly string[]): string =>
  platforms.length === 1 ? `a ${platformLabel(platforms[0])} account` : `${andList(platforms.map(platformLabel))} accounts`

/** One field's first `before` and last `after` in a group of rows. */
function span(rows: readonly ConfigChange[]): { before: unknown; after: unknown } | null {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => Date.parse(a.changed_at) - Date.parse(b.changed_at) || a.id.localeCompare(b.id))
  return { before: sorted[0].before, after: sorted[sorted.length - 1].after }
}

/**
 * A `handles` change in client words, naming what moved (WP1.6 review: two
 * changes on 17 Sep both read "The accounts we read changed"). Your own
 * accounts by platform; a tracked brand's by the brand and, where the brand
 * was already tracked, the platform: "Accounts added for Freedom of Movement,
 * Old School, Patagonia and The North Face", "A TikTok account added for The
 * North Face". Null where nothing readable moved.
 */
export function handlesWords(rows: readonly ConfigChange[]): string | null {
  const parts: { s: string; proper: boolean }[] = []
  const own = span(rows.filter((r) => r.field === 'own_handles'))
  if (own) {
    const m = platformsMoved(handleMap(own.before), handleMap(own.after))
    const yours = (ps: string[]) => `your ${andList(ps.map(platformLabel))} ${ps.length === 1 ? 'account' : 'accounts'}`
    if (m.added.length > 0) parts.push({ s: `${yours(m.added)} added`, proper: false })
    if (m.changed.length > 0) parts.push({ s: `${yours(m.changed)} changed`, proper: false })
    if (m.removed.length > 0) parts.push({ s: `${yours(m.removed)} taken out`, proper: false })
  }
  const theirs = span(rows.filter((r) => r.field !== 'own_handles'))
  if (theirs) {
    const before = brandHandles(theirs.before)
    const after = brandHandles(theirs.after)
    const sort = (xs: string[]) => xs.sort((a, b) => a.localeCompare(b))
    const added = sort([...after.keys()].filter((b) => !before.has(b)))
    const dropped = sort([...before.keys()].filter((b) => !after.has(b)))
    if (added.length > 0) parts.push({ s: `accounts added for ${andList(added)}`, proper: false })
    if (dropped.length > 0) parts.push({ s: `accounts dropped for ${andList(dropped)}`, proper: false })
    for (const brand of sort([...after.keys()].filter((b) => before.has(b)))) {
      const m = platformsMoved(before.get(brand) as Map<string, string>, after.get(brand) as Map<string, string>)
      if (m.added.length > 0) parts.push({ s: `${accountsWord(m.added)} added for ${brand}`, proper: false })
      if (m.changed.length > 0) parts.push({ s: `${brand}’s ${andList(m.changed.map(platformLabel))} ${m.changed.length === 1 ? 'account' : 'accounts'} changed`, proper: true })
      if (m.removed.length > 0) parts.push({ s: `${brand}’s ${andList(m.removed.map(platformLabel))} ${m.removed.length === 1 ? 'account' : 'accounts'} taken out`, proper: true })
    }
  }
  if (parts.length === 0) return null
  const [first, ...rest] = parts
  const lead = first.proper ? first.s : `${first.s.charAt(0).toUpperCase()}${first.s.slice(1)}`
  return [lead, ...rest.map((p) => p.s)].join('; ')
}

/** The rivals a group of `rivals` rows added and dropped, each once. */
export function rivalsMoved(rows: readonly Pick<ConfigChange, 'surface' | 'before' | 'after'>[]): { added: string[]; removed: string[] } {
  return moved(rows.filter((r) => r.surface === 'rivals'))
}

/** "7 search terms out and 7 in", "5 search terms added", from the counts. */
function outAndIn(added: number, removed: number, one: string, many: string, gone = 'taken out'): string | null {
  if (added > 0 && removed > 0) return `${plural(removed, one, many)} out and ${fmtInt(added)} in`
  if (added > 0) return `${plural(added, one, many)} added`
  if (removed > 0) return `${plural(removed, one, many)} ${gone}`
  return null
}

/**
 * A change in client words, composed from what its rows moved: search terms
 * and exclusions counted apart, communities switched on or off, rivals in and
 * out; else the surface's own sentence. A stored note is used only where it
 * was written in client words (`CLIENT_NOTE_SURFACES`, and a capped update's
 * `other` row, `CLIENT_NOTE_OTHER_FIELDS`).
 */
export function changeWords(change: OurChange, rows: readonly ConfigChange[], gathers: CommunityGathers = null): string {
  // A market-first change with a client-words note is titled by its surface
  // (the approved preview: "How we check relevance" in weight, the note under
  // it); its note is `changeDetail`'s. Without a note (every such row
  // written since 27 Sep), the title stands alone.
  if (CLIENT_NOTE_SURFACES.has(change.surface) && change.note?.trim()) return SURFACE_SENTENCE[change.surface] ?? change.note.trim()
  const ids = new Set(change.rowIds ?? [change.id])
  const mine = rows.filter((r) => ids.has(r.id))
  if (change.surface === 'other') {
    const noted = mine.find((r) => CLIENT_NOTE_OTHER_FIELDS.has(r.field ?? '') && r.note?.trim())
    if (noted) return (noted.note as string).trim()
  }
  if (change.surface === 'terms') {
    const terms = termsMoved(mine)
    const excl = moved(mine.filter(isExclusions))
    const parts = [
      outAndIn(terms.added.length, terms.removed.length, 'search term', 'search terms'),
      outAndIn(excl.added.length, excl.removed.length, 'exclusion', 'exclusions', 'lifted'),
    ].filter((p): p is string => p != null)
    if (parts.length > 0) return parts.join('; ')
  }
  if (change.surface === 'subreddits') {
    const { on, off } = communitiesMoved(mine, gathers)
    const words = outAndIn(on.length, off.length, 'community', 'communities', 'dropped')
    if (words) return words
  }
  if (change.surface === 'rivals') {
    // The count here, the names on the line's own "in: … · out: …" beside it
    // (`ledgerLines` `items`), as the search terms print.
    const { added, removed } = rivalsMoved(mine)
    const words = outAndIn(added.length, removed.length, 'rival', 'rivals', 'dropped')
    if (words) return words
  }
  if (change.surface === 'handles') {
    const words = handlesWords(mine)
    if (words) return words
  }
  return SURFACE_SENTENCE[change.surface] ?? (SURFACE_WORDS as Record<string, string>)[change.surface] ?? 'A change to how we read'
}

/**
 * What a market-first change's own note says, printed under its title in
 * regular weight (the approved preview's "How we check, mark and file videos"
 * rows: a short title in weight, a description beneath; deploy 2 review, which
 * found the notes set as whole bold sentences). Null for every other change,
 * whose words already say what moved.
 */
export function changeDetail(change: OurChange): string | null {
  if (!CLIENT_NOTE_SURFACES.has(change.surface)) return null
  return change.note?.trim() || null
}

/**
 * The dated list: one line per change of ours, newest first, each with the
 * months it touched. `runFinish` maps a run id to its finish instant, for
 * "read with the {date} update"; a reach row read through a run the map does
 * not hold is dated by its own computation. `gathers` are what a community
 * line is read against (`communitiesMoved`); without them its rows are read as
 * they stand.
 */
export function ledgerLines(input: {
  changes: readonly OurChange[]
  rows: readonly ConfigChange[]
  reach: readonly ReachRow[]
  runFinish: ReadonlyMap<string, string>
  gathers?: CommunityGathers
}): (LedgerLine & { items: { added: string[]; removed: string[] } | null; categoryMonths: NonNullable<LedgerLine['months']> })[] {
  const out = input.changes.map((c) => {
    const ids = new Set(c.rowIds ?? [c.id])
    const monthsOn = (population: 'market' | 'category'): NonNullable<LedgerLine['months']> => {
      const newest = new Map<string, ReachRow>()
      for (const r of input.reach) {
        if (!ids.has(r.changeId) || r.population !== population) continue
        const m = monthStartOf(r.month)
        const held = newest.get(m)
        if (!held || Date.parse(r.computedAt) > Date.parse(held.computedAt)) newest.set(m, r)
      }
      return [...newest.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([month, r]) => ({
          month,
          touched: r.touched,
          of: r.inMonth,
          readWith: (r.readThroughRun ? input.runFinish.get(r.readThroughRun) : null) ?? r.computedAt,
        }))
    }
    const months = monthsOn('market')
    const own = months.find((m) => m.month === monthStartOf(c.changedAt)) ?? null
    const mine = input.rows.filter((r) => ids.has(r.id))
    // WHAT THE LINE NAMES BESIDE ITS WORDS: the search terms, the rivals or
    // the communities it took in and out.
    const communities = c.surface === 'subreddits' ? communitiesMoved(mine, input.gathers ?? null) : null
    const items = c.surface === 'terms'
      ? termsMoved(mine)
      : c.surface === 'rivals'
        ? rivalsMoved(mine)
        : communities
          ? { added: communities.on, removed: communities.off }
          : null
    return {
      changeId: c.id,
      date: c.changedAt,
      surface: c.surface,
      words: changeWords(c, input.rows, input.gathers ?? null),
      detail: changeDetail(c),
      reach: own ? { month: own.month, touched: own.touched, of: own.of, readWith: own.readWith as string } : null,
      months,
      // The category's reach, which a themes comparison divides by: printed
      // only under a comparison the change stops for themes (`recordView`).
      categoryMonths: monthsOn('category'),
      items: items && (items.added.length > 0 || items.removed.length > 0) ? items : null,
    }
  })
  return out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.changeId.localeCompare(b.changeId))
}

/** The months the list prints a column for: every month a line touched, the
 *  last two (the pair the page reads), oldest first. */
export function ledgerMonths(lines: readonly Pick<LedgerLine, 'months'>[], readingMonth: string, prevMonth: string | null): string[] {
  const all = new Set<string>([monthStartOf(readingMonth), ...(prevMonth ? [monthStartOf(prevMonth)] : [])])
  for (const l of lines) for (const m of l.months ?? []) all.add(m.month)
  return [...all].sort().slice(-2)
}

/** A line's cell for one month: "63 of 655", or null where it touched none
 *  measured in that month. */
export function reachCell(line: Pick<LedgerLine, 'months'>, month: string): string | null {
  const m = (line.months ?? []).find((x) => x.month === monthStartOf(month))
  return m ? `${fmtInt(m.touched)} of ${fmtInt(m.of)}` : null
}

/** A column's head: "September". */
export const monthHead = (month: string): string => longMonth(month)

/** The rows of the Phase 1 change log that are not a change of ours, so the
 *  page prints every change once: ours in the dated list, the rest (a
 *  schedule, a subject, a strike count) in the log below it. */
export function otherRows(rows: readonly ConfigChange[], changes: readonly OurChange[]): ConfigChange[] {
  const ours = new Set(changes.flatMap((c) => c.rowIds ?? [c.id]))
  return rows.filter((r) => !ours.has(r.id))
}

// ---- The record, grouped (Heinrich's default, 26 Sep, R-a) ---------------------------
//
// THE APPROVED PREVIEW'S RECORD (`SettingsRecord` artboard): the dated list in
// two groups, "What we search" (the searches, communities, rivals and accounts
// we read, the 9, 13 and 17 Sep changes) and "How we check, mark and file
// videos" (everything else), with a "Comparisons it stops" column; the search
// group's column is one aside for the whole group ("Together, these stop"),
// because a search change's reach is measured for the month's searches
// together, not per change (the pair row's search-outside count). It replaces
// the thirteen flat rows. §4.2 pins one line per change, and each group keeps
// one line per change.
//
// "READ WITH …" ONCE, where the preview states it once: a group whose measured
// cells were all read with one update says so beside its heading (the
// preview's "How we check, mark and file videos · due, not made yet" slot); a
// cell read with another update still says which. The search group's aside
// dates its figure by when it was measured, as the artboard does.
//
// WHAT A CHANGE STOPS IS THE JUDGE'S, never recomputed: for each pair of
// months the page can show (the months in the list's columns against the month
// before each, and the reading month against the next), a change stops the
// pair on a view when the page's own judge refuses it for that change, a
// refusal at 10% or more, or unmeasured, which counts as 10% (decision D).
// Search changes stop a pair together, through its searches reason.

export type RecordGroupKey = 'search' | 'check'

/** The two groups' headings, the preview's words. */
export const RECORD_GROUP_TITLE: Readonly<Record<RecordGroupKey, string>> = {
  search: 'What we search',
  check: 'How we check, mark and file videos',
}

/** What we search: the searches, the communities, the rivals and the
 *  accounts we read (the preview files the 17 Sep rivals with the 17 Sep
 *  terms, and the footer's "What we search now →" opens the page that lists
 *  all four). Every other surface is how we check, mark and file videos. */
export const SEARCH_GROUP_SURFACES: readonly string[] = ['terms', 'platforms', 'subreddits', 'rivals', 'handles']

export const recordGroupOf = (surface: string): RecordGroupKey => (SEARCH_GROUP_SURFACES.includes(surface) ? 'search' : 'check')

/** The views a client reads, each with the audience its judge is asked on
 *  (`viewForAudience`, lib/reading/pairs.ts). The lens view has no page yet. */
const STOP_VIEWS = [
  { view: 'market', audience: 'market' },
  { view: 'themes', audience: CATEGORY_AUDIENCE },
  { view: 'brands', audience: BRANDS_PANEL },
] as const
type StopView = (typeof STOP_VIEWS)[number]['view']

export interface MonthPair { prevMonth: string; month: string }

/** One pair a change (or the search group) stops, on the views it stops it
 *  for; `unmeasured` when every refusal behind it is an unmeasured change. */
export interface StopEntry { pair: MonthPair; views: StopView[]; unmeasured: boolean }

/** The pairs the page can show, oldest first: each column month against the
 *  month before it, and the reading month against the next. */
export function recordPairs(months: readonly string[], readingMonth: string): MonthPair[] {
  const later = new Set([...months.map(monthStartOf), nextMonth(readingMonth)])
  return [...later].sort().map((m) => ({ prevMonth: monthBefore(m), month: m }))
}

/** The pairs one change stops, per the judge. A search change stops a pair
 *  through the pair's searches reason (the searches are measured together);
 *  any other change through a reason that names it. */
export function stopsOf(change: OurChange, pair: PairOn, pairs: readonly MonthPair[]): StopEntry[] {
  const ids = new Set(change.rowIds && change.rowIds.length > 0 ? change.rowIds : [change.id])
  const search = isSearchSurface(change.surface)
  const out: StopEntry[] = []
  for (const p of pairs) {
    if (!changeInSpan(change, p.prevMonth, p.month)) continue
    const views: StopView[] = []
    let measured = false
    for (const { view, audience } of STOP_VIEWS) {
      if (!change.affects.includes(view)) continue
      const refusing = pair(p.prevMonth, p.month, audience).reasons.filter((r) =>
        (search ? r.kind === 'searches' : (r.kind === 'code_change' || r.kind === 'searches') && r.changeId != null && ids.has(r.changeId))
        && modeForShare(r.share) === 'refuse')
      if (refusing.length === 0) continue
      views.push(view)
      if (refusing.some((r) => r.share != null)) measured = true
    }
    if (views.length > 0) out.push({ pair: p, views, unmeasured: !measured })
  }
  return out
}

/** Several changes' stops as one list, a pair once: its views together, and
 *  unmeasured only where every change's refusal of it is. */
export function mergeStops(lists: readonly (readonly StopEntry[])[]): StopEntry[] {
  const byPair = new Map<string, StopEntry>()
  for (const e of lists.flat()) {
    const key = `${e.pair.prevMonth}|${e.pair.month}`
    const held = byPair.get(key)
    if (!held) {
      byPair.set(key, { pair: e.pair, views: [...e.views], unmeasured: e.unmeasured })
      continue
    }
    for (const v of e.views) if (!held.views.includes(v)) held.views.push(v)
    held.unmeasured = held.unmeasured && e.unmeasured
  }
  return [...byPair.values()].sort((a, b) => (a.pair.month < b.pair.month ? -1 : 1))
}

const orList = (names: readonly string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`

/** ", for themes", ", for brands and themes", or nothing where the market
 *  view is stopped (a pair stopped for the market is stopped for everything
 *  read inside it). */
function viewWords(views: readonly StopView[]): string {
  if (views.includes('market')) return ''
  const named = (['brands', 'themes'] as const).filter((v) => views.includes(v))
  return named.length > 0 ? `, for ${andList(named)}` : ''
}

const pairWords = (p: MonthPair): string => `${longMonth(p.prevMonth)} against ${longMonth(p.month)}`

/**
 * A list of stops in words, one line each: "August against September", "…,
 * for themes", "…, until measured". Where `compress` is set (the narrow
 * column), pairs with the same views and state that are exactly every pair
 * with some months read as "Pairs with September" (the preview's words) or
 * "Pairs with August or September".
 */
export function stopLines(stops: readonly StopEntry[], compress = false): string[] {
  const tail = (e: Pick<StopEntry, 'views' | 'unmeasured'>): string => `${viewWords(e.views)}${e.unmeasured ? ', until measured' : ''}`
  if (!compress) return stops.map((e) => `${pairWords(e.pair)}${tail(e)}`)
  const groups = new Map<string, StopEntry[]>()
  for (const e of stops) {
    const key = `${[...e.views].sort().join('+')}|${e.unmeasured}`
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  const out: { at: string; words: string }[] = []
  for (const entries of groups.values()) {
    const held = new Set(entries.map((e) => `${e.pair.prevMonth}|${e.pair.month}`))
    const has = (a: string, b: string): boolean => held.has(`${a}|${b}`)
    const months = [...new Set(entries.flatMap((e) => [e.pair.prevMonth, e.pair.month]))].sort()
    const hubs = months.filter((m) => has(monthBefore(m), m) && has(m, nextMonth(m)))
    const covered = new Set(hubs.flatMap((m) => [`${monthBefore(m)}|${m}`, `${m}|${nextMonth(m)}`]))
    if (entries.length > 1 && hubs.length > 0 && covered.size === held.size && [...held].every((k) => covered.has(k))) {
      out.push({ at: entries[0].pair.month, words: `Pairs with ${orList(hubs.map(longMonth))}${tail(entries[0])}` })
    } else {
      for (const e of entries) out.push({ at: e.pair.month, words: `${pairWords(e.pair)}${tail(e)}` })
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).map((o) => o.words)
}

/** What a month cell of the record prints. */
export type RecordCell =
  | { month: string; state: 'measured'; touched: number; of: number; readWith: string | null }
  | { month: string; state: 'none'; readWith: string | null }
  | { month: string; state: 'unmeasured' | 'untouched' | 'blank' }

export interface RecordLine {
  line: Line
  cells: RecordCell[]
  /** What a measured cell counts, under its figure (the `SettingsRecord`
   *  artboard captions every cell: "had been let in unchecked", "of
   *  September's videos"; deploy 2 review, which found bare "159 of 654"s).
   *  Null where the line's measure has no words here. Additive. */
  caption?: string | null
  /** What it stops, in words (the narrow column's compressed form); null
   *  where no judge was handed in (a stored or fixture render). */
  stops: string[] | null
  /** Under "none", what that means, where it needs saying (the preview's
   *  "nothing leaves a count" under the makers' marks). */
  noneNote: string | null
  /** Under a comparison stopped for themes and not for the market, the count
   *  that stops it, on the category's base: "64 of 625 September category
   *  videos" (deploy 2 review: the line's own cell prints the market's 65 of
   *  654, under a tenth, beside "Stops August against September, for themes",
   *  the artboard's sub-caption). `line` is the stop line (one of `stops`) it
   *  sits under. Null elsewhere. Additive. */
  stopNote?: { line: string; text: string } | null
}

export interface RecordGroup {
  key: RecordGroupKey
  title: string
  lines: RecordLine[]
  /** The one update every measured cell in the group was read with, said
   *  once beside the heading; null where it is said in the aside, or where the
   *  cells were read with different updates (each cell says its own). */
  readWith: string | null
}

export interface SearchAside {
  /** "Together, these stop": each pair once, in words. Null without a judge. */
  stops: string[] | null
  /** The month's one figure in the `SettingsRecord` artboard's words, as the
   *  26 Sep ruling has Settings print it (`addedOnlyRecordSentence`): "About
   *  half of September came from searches we added in September: 356 of 654,
   *  measured on 26 Sep." Its figures are tokens. Null where the front page
   *  prints no figure either. */
  figure: { body: string; figures: FigureTable } | null
  /** Since when the searches have run unchanged: the first update after the
   *  group's latest change, which first searched it ("Since 20 Sep nothing we
   *  search has changed.", the artboard's and decision I's date for the 17 Sep
   *  change); the change's own date while no update has run since. */
  since: string | null
}

export interface RecordView {
  /** The columns: the last two months the list touches (`ledgerMonths`). */
  months: string[]
  groups: RecordGroup[]
  aside: SearchAside | null
}

type Line = ReturnType<typeof ledgerLines>[number]

/** The capped update is a gather event: nothing is moved into or out of a
 *  month by it, so it has no reach to measure and its cells print nothing. */
const isGatherEvent = (change: OurChange | undefined, rows: readonly ConfigChange[]): boolean => {
  if (!change || change.surface !== 'other') return false
  const ids = new Set(change.rowIds ?? [change.id])
  const mine = rows.filter((r) => ids.has(r.id))
  return mine.length > 0 && mine.every((r) => CLIENT_NOTE_OTHER_FIELDS.has(r.field ?? ''))
}

/** What a code change's reach counts, per surface, in the words its cell
 *  prints under the figure. Each is what measure-comparability counts for that
 *  surface: the relevance fix, the month's videos a gate verdict let in
 *  unjudged (the artboard's "had been let in unchecked"); attribution v3, the
 *  month's videos first stored after it, whose filing it decided. A surface
 *  nothing measures has no caption. */
const REACH_CAPTION: Partial<Record<string, string>> = {
  gate_rule: 'had been let in unchecked',
  attribution: 'filed by the new check',
}

/**
 * What one line's measured cells count. A search change's reach is the
 * month's videos found only by the searches it added or took out and by no
 * other search (log-tracking-eras, lib/provenance/searches.ts `reachOf`), so
 * its caption names which: "found only by the searches it added", "… it took
 * out", "… it added or took out"; communities the same way.
 */
export function reachCaption(line: Pick<Line, 'surface' | 'items'>): string | null {
  if (line.surface === 'terms' || line.surface === 'subreddits') {
    const noun = line.surface === 'terms' ? 'searches' : 'communities'
    const added = line.items?.added.length ?? 0
    const removed = line.items?.removed.length ?? 0
    if (added > 0 && removed > 0) return `found only by the ${noun} it added or took out`
    if (added > 0) return `found only by the ${noun} it added`
    if (removed > 0) return `found only by the ${noun} it took out`
    return null
  }
  return REACH_CAPTION[line.surface] ?? null
}

/** The category count behind the first measured stop that holds for themes
 *  and not for the market: the larger share of the pair's two months, as
 *  rule 3 reads it. Null where there is none, or no category measure. */
function themesStopNote(stops: readonly StopEntry[], lines: readonly string[], category: NonNullable<LedgerLine['months']>): { line: string; text: string } | null {
  const stop = stops.find((e) => !e.unmeasured && e.views.includes('themes') && !e.views.includes('market'))
  if (!stop) return null
  const sides = category.filter((m) => (m.month === stop.pair.prevMonth || m.month === stop.pair.month) && m.of > 0)
  const side = sides.sort((a, b) => b.touched / b.of - a.touched / a.of)[0]
  if (!side || !(side.touched > 0)) return null
  // Under its own stop line: the pair's words, or the compressed line that
  // holds it ("Pairs with September, for themes").
  const own = stopLines([stop])[0]
  const line = lines.find((x) => x === own) ?? lines.find((x) => x.includes(', for themes') && !x.includes('until measured')) ?? null
  return line ? { line, text: `${fmtInt(side.touched)} of ${fmtInt(side.of)} ${longMonth(side.month)} category videos` } : null
}

/** "none" needs a word only where a reader would ask why. */
const NONE_NOTE: Partial<Record<string, string>> = {
  segment: 'nothing leaves a count',
}
const GATHER_NONE_NOTE = 'no pair is refused for it'

/**
 * The record as the preview draws it: the two groups (an empty one is left
 * out), each line's cells and what it stops, and the search group's aside.
 * `pair` is the page's judge (`loadAppPairOn`); without one nothing is said
 * about what a change stops.
 */
export function recordView(input: {
  lines: readonly Line[]
  changes: readonly OurChange[]
  rows: readonly ConfigChange[]
  pair: PairOn | null
  readingMonth: string
  prevMonth: string | null
  block: ChangeBlock | null
  /** The delivered updates' instants (any order): "since" is the first one
   *  after the group's latest change. Additive. */
  updates?: readonly string[]
}): RecordView {
  const months = ledgerMonths(input.lines, input.readingMonth, input.prevMonth)
  const pairs = recordPairs(months, input.readingMonth)
  const byId = new Map(input.changes.map((c) => [c.id, c]))
  const rawStops = new Map<string, StopEntry[]>()

  const lineOf = (l: Line): RecordLine => {
    const change = byId.get(l.changeId)
    const gather = isGatherEvent(change, input.rows)
    const cells: RecordCell[] = months.map((m) => {
      if (gather) return { month: m, state: 'blank' }
      const measure = (l.months ?? []).find((x) => x.month === m)
      if (measure) {
        return measure.touched === 0
          ? { month: m, state: 'none', readWith: measure.readWith }
          : { month: m, state: 'measured', touched: measure.touched, of: measure.of, readWith: measure.readWith }
      }
      // A change that moves no view (an attention-panel freeze; a makers'
      // mark with no count stored) has nothing awaiting a measure: its cells
      // print nothing, never "not measured yet".
      if (change && change.affects.length === 0) return { month: m, state: 'blank' }
      return { month: m, state: monthStartOf(l.date) === m ? 'unmeasured' : 'untouched' }
    })
    const stops = input.pair && change ? stopsOf(change, input.pair, pairs) : null
    if (stops) rawStops.set(l.changeId, stops)
    const lines = stops ? stopLines(stops, true) : null
    return {
      line: l,
      cells,
      caption: cells.some((c) => c.state === 'measured') ? reachCaption(l) : null,
      stops: lines,
      noneNote: stops && stops.length === 0 ? (gather ? GATHER_NONE_NOTE : NONE_NOTE[l.surface] ?? null) : null,
      stopNote: stops && lines ? themesStopNote(stops, lines, l.categoryMonths) : null,
    }
  }

  const grouped: Record<RecordGroupKey, RecordLine[]> = { search: [], check: [] }
  for (const l of input.lines) grouped[recordGroupOf(l.surface)].push(lineOf(l))

  // The search group's aside: what its changes stop together, the month's one
  // figure in the artboard's words (the 26 Sep ruling), and since when nothing
  // we search has changed.
  const searchLines = grouped.search
  const figure = input.block ? addedOnlyRecordSentence(input.block) : null
  const latest = searchLines.map((r) => r.line.date).filter((d) => !Number.isNaN(Date.parse(d))).sort().at(-1) ?? null
  // THE FIRST UPDATE THAT SEARCHED IT (deploy 2 review): the 17 Sep additions
  // were first searched by the 20 Sep update, and the searches have run
  // unchanged since then, which is the artboard's "Since 20 Sep".
  const firstRun = latest
    ? (input.updates ?? []).filter((u) => Date.parse(u) > Date.parse(latest)).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
    : null
  const aside: SearchAside | null = searchLines.length > 0
    ? {
        stops: input.pair ? stopLines(mergeStops(searchLines.map((r) => rawStops.get(r.line.changeId) ?? []))) : null,
        figure,
        since: firstRun ?? latest,
      }
    : null

  /** The update every measured cell in a group was read with, or null. */
  const oneUpdate = (lines: readonly RecordLine[]): string | null => {
    const dates = new Set<string>()
    for (const r of lines) for (const c of r.cells) if ((c.state === 'measured' || c.state === 'none') && c.readWith) dates.add(c.readWith.slice(0, 10))
    return dates.size === 1 ? lines.flatMap((r) => r.cells).map((c) => ('readWith' in c ? c.readWith : null)).find((d): d is string => !!d) ?? null : null
  }
  const groups: RecordGroup[] = []
  if (searchLines.length > 0) {
    // The aside's sentence is dated by when the figure was measured (the
    // artboard's "measured on"), so the cells' update is said beside the
    // group's heading, as for the other group.
    groups.push({ key: 'search', title: RECORD_GROUP_TITLE.search, lines: searchLines, readWith: oneUpdate(searchLines) })
  }
  if (grouped.check.length > 0) {
    groups.push({ key: 'check', title: RECORD_GROUP_TITLE.check, lines: grouped.check, readWith: oneUpdate(grouped.check) })
  }
  return { months, groups, aside }
}

/** The update a cell was read with, where its group does not say it once:
 *  null where the group already says the same update. */
export function cellReadWith(cell: RecordCell, group: Pick<RecordGroup, 'readWith'>): string | null {
  if (!('readWith' in cell) || !cell.readWith) return null
  const said = group.readWith
  return said && said.slice(0, 10) === cell.readWith.slice(0, 10) ? null : cell.readWith
}
