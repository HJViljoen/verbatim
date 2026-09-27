import { SEALAND_CLIENT_ID } from '../config'
import { shortDate } from '../format'
import type { BrandRule } from '../brands/aliases'
import { strongPattern } from '../brands/aliases'
import type { SubredditEntry } from '../gather/types'
import { QUEUE_FLOOR } from './queue'
import { PAGES_CAN_SAY } from './record-additions'

// Settings › What we read, "The search set" (market-first WP3.10; the approved
// Settings artboard): each search with the day we first searched it, the
// other meanings of the names we track, and "How the set got here", the
// set's own dated history. Pure: the page reads the change log and the
// updates, this turns them into what the card prints.
//
// THE DAY WE FIRST SEARCHED IT, AND WHERE IT COMES FROM.
//   - A term the reconstruction found in an update's searches
//     (`config_changes.source = 'reconstructed'`) was first searched by that
//     update: the reconstruction compares consecutive updates, so the row's
//     day is the update's. The first such row is where the record starts, and
//     a term already in it may have been searched before: "by 6 Jul".
//   - A term written down when it was added (a logged or trigger row) is first
//     searched by the first update that started after the change: "17 Sep"
//     added reads "20 Sep". None yet: "not searched yet".
//   - A term the log never names prints no day at all.

type Change = {
  changed_at: string
  surface: string
  field: string | null
  before: unknown
  after: unknown
  source: string
}

/** The three lists a search runs from. The fourth, "Not these", filters what
 *  they find and is never searched. */
const SEARCH_FIELDS = new Set(['brand_keywords', 'competitor_keywords', 'industry_keywords'])

const fold = (s: string): string => s.trim().toLowerCase()
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const dayOf = (iso: string): string => iso.slice(0, 10)
const short = (day: string): string => shortDate(`${day}T00:00:00.000Z`)

/** A terms row that is about the searched lists (a reconstructed row names no
 *  field: it is what the update searched). */
const searchedRow = (c: Change): boolean => c.surface === 'terms' && (c.field == null || SEARCH_FIELDS.has(c.field))

/** When each term now in the set entered it, with the row's time and whether
 *  it was reconstructed. The newest entry wins: a term taken out and put back
 *  is searched again from the day it came back. */
function entries(changes: readonly Change[]): Map<string, { at: string; reconstructed: boolean }> {
  const out = new Map<string, { at: string; reconstructed: boolean }>()
  const rows = changes.filter((c) => c.surface === 'terms').sort((a, b) => (a.changed_at < b.changed_at ? -1 : a.changed_at > b.changed_at ? 1 : 0))
  for (const c of rows) {
    const before = new Set(listOf(c.before).map(fold))
    for (const t of listOf(c.after)) {
      const k = fold(t)
      if (!k || before.has(k)) continue
      out.set(k, { at: c.changed_at, reconstructed: c.source === 'reconstructed' })
    }
  }
  return out
}

/** Where the record starts: the first logged row of the set, any surface. */
export function recordStart(changes: readonly Change[]): string | null {
  let first: string | null = null
  for (const c of changes) if (first == null || c.changed_at < first) first = c.changed_at
  return first
}

/** The first update that started after `at`, as a day. */
function firstUpdateAfter(at: string, updates: readonly { startedAt: string }[]): string | null {
  let best: string | null = null
  for (const u of updates) if (u.startedAt > at && (best == null || u.startedAt < best)) best = u.startedAt
  return best ? dayOf(best) : null
}

/**
 * The chip's day for each term in the set: "by 6 Jul", "9 Sep", "not searched
 * yet", or nothing where the log never names the term. Keyed folded.
 */
export function firstSearched(
  changes: readonly Change[],
  updates: readonly { startedAt: string }[],
): Map<string, string> {
  const start = recordStart(changes.filter((c) => c.surface === 'terms'))
  const out = new Map<string, string>()
  for (const [term, e] of entries(changes)) {
    if (e.reconstructed) {
      out.set(term, start != null && dayOf(e.at) === dayOf(start) ? `by ${short(dayOf(e.at))}` : short(dayOf(e.at)))
    } else {
      const first = firstUpdateAfter(e.at, updates)
      out.set(term, first ? short(first) : 'not searched yet')
    }
  }
  return out
}

// ---- The communities we read -------------------------------------------------------

/** Each watched community's first day on the list we read: the first logged
 *  row that makes it active, else the day it was found. Keyed by name. */
export function communitySince(entriesNow: readonly SubredditEntry[], changes: readonly Change[]): Map<string, string> {
  const active = new Map<string, string>()
  const rows = changes.filter((c) => c.surface === 'subreddits').sort((a, b) => (a.changed_at < b.changed_at ? -1 : 1))
  const statusIn = (v: unknown): Map<string, string> => {
    const m = new Map<string, string>()
    const items = Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []
    for (const it of items) {
      const r = it as { name?: unknown; status?: unknown }
      if (typeof r?.name === 'string') m.set(r.name.toLowerCase(), typeof r.status === 'string' ? r.status : '')
    }
    return m
  }
  for (const c of rows) {
    const before = statusIn(c.before)
    for (const [name, status] of statusIn(c.after)) {
      if (status === 'active' && before.get(name) !== 'active' && !active.has(name)) active.set(name, dayOf(c.changed_at))
    }
  }
  const out = new Map<string, string>()
  for (const e of entriesNow) {
    if (e.status !== 'active') continue
    const day = active.get(e.name.toLowerCase()) ?? (e.discovered_at ? dayOf(e.discovered_at) : null)
    if (day) out.set(e.name, short(day))
  }
  return out
}

// ---- How the set got here -----------------------------------------------------------

export interface SetStep {
  /** "by 6 Jul", "9 Sep", "6 Dec update", "1 Jan 2027". */
  when: string
  words: string
  /** A change that happened, or a date ahead of us. */
  state: 'past' | 'ahead'
}

const ONES = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
/** "one" … "twelve", then the figure. */
export const countWord = (n: number): string => ONES[n] ?? String(n)

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** "7 terms out and 7 in", "4 terms added", "3 terms taken out". */
function moved(noun: [string, string], added: number, removed: number): string | null {
  if (added > 0 && removed > 0) return `${plural(removed, noun[0], noun[1])} out and ${added} in`
  if (added > 0) return `${plural(added, noun[0], noun[1])} added`
  if (removed > 0) return `${plural(removed, noun[0], noun[1])} taken out`
  return null
}

/** Additions and removals between two lists, folded; a name in both halves of
 *  one day cancels. */
function listDiff(before: unknown, after: unknown): { added: string[]; removed: string[] } {
  const b = new Set(listOf(before).map(fold))
  const a = new Set(listOf(after).map(fold))
  return { added: [...a].filter((x) => !b.has(x)), removed: [...b].filter((x) => !a.has(x)) }
}

/** What one day changed: the brands you track, the searched terms and the
 *  communities read. */
function dayWords(rows: readonly Change[]): { words: string | null; reconstructed: boolean; last: string } {
  const terms = { added: new Set<string>(), removed: new Set<string>() }
  const brands = { added: new Set<string>(), removed: new Set<string>() }
  const communities = { added: new Set<string>(), removed: new Set<string>() }
  const put = (bucket: typeof terms, d: { added: string[]; removed: string[] }) => {
    for (const x of d.added) { if (bucket.removed.has(x)) bucket.removed.delete(x); else bucket.added.add(x) }
    for (const x of d.removed) { if (bucket.added.has(x)) bucket.added.delete(x); else bucket.removed.add(x) }
  }
  for (const c of rows) {
    if (searchedRow(c)) put(terms, listDiff(c.before, c.after))
    else if (c.surface === 'rivals' && (c.field == null || c.field === 'competitor_names')) put(brands, listDiff(c.before, c.after))
    else if (c.surface === 'subreddits') {
      const status = (v: unknown): Map<string, string> => {
        const m = new Map<string, string>()
        const items = Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []
        for (const it of items) {
          const r = it as { name?: unknown; status?: unknown }
          if (typeof r?.name === 'string') m.set(r.name.toLowerCase(), typeof r.status === 'string' ? r.status : '')
        }
        return m
      }
      const b = status(c.before)
      const a = status(c.after)
      const wasOn = (n: string) => b.get(n) === 'active'
      const isOn = (n: string) => a.get(n) === 'active'
      // A single-entry row names one community; a whole-list row names all of
      // them, so a community absent from its `after` was not taken off.
      const whole = Array.isArray(c.after)
      const added = [...a.keys()].filter((n) => isOn(n) && !wasOn(n))
      const removed = [...b.keys()].filter((n) => wasOn(n) && (a.has(n) ? !isOn(n) : whole))
      put(communities, { added, removed })
    }
  }
  const t = { added: terms.added.size, removed: terms.removed.size }
  const br = { added: brands.added.size, removed: brands.removed.size }
  const co = { added: communities.added.size, removed: communities.removed.size }
  // "4 brands and 5 terms added" where the day only added; each its own
  // phrase otherwise.
  const onlyAdded = [br, t, co].every((x) => x.removed === 0) && [br, t, co].some((x) => x.added > 0)
  let words: string | null
  if (onlyAdded) {
    const parts = [
      br.added ? plural(br.added, 'brand', 'brands') : null,
      t.added ? plural(t.added, 'term', 'terms') : null,
      co.added ? plural(co.added, 'community', 'communities') : null,
    ].filter((p): p is string => p !== null)
    words = `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]} added`
  } else {
    const parts = [
      moved(['brand', 'brands'], br.added, br.removed),
      moved(['term', 'terms'], t.added, t.removed),
      moved(['community', 'communities'], co.added, co.removed),
    ].filter((p): p is string => p !== null)
    words = parts.length ? parts.join(', ') : null
  }
  return {
    words,
    reconstructed: rows.every((c) => c.source === 'reconstructed'),
    last: rows.reduce((m, c) => (c.changed_at > m ? c.changed_at : m), ''),
  }
}

/** The day the first comparison read the same way lands (plan §2.11, the
 *  record's "What the pages can say, and when"). */
const FIRST_CLEAN = PAGES_CAN_SAY.find((r) => r.when === '6 Dec update') ?? null

/**
 * How the set got here: where the record starts ("by 6 Jul: 6 of today's
 * terms"), each day since that changed a brand, a searched term or a
 * community, and, where the searches are held still, the two dates ahead: the
 * first comparison read the same way and the earliest a queued change lands.
 */
export function setHistory(input: {
  changes: readonly Change[]
  /** Today's searched terms, as stored. */
  terms: readonly string[]
  updates: readonly { startedAt: string }[]
  locked: boolean
  now: string
}): { steps: SetStep[]; heldAfter: number | null } {
  const rows = input.changes.filter((c) => searchedRow(c) || c.surface === 'rivals' || c.surface === 'subreddits')
  const termStart = recordStart(input.changes.filter(searchedRow))
  const steps: SetStep[] = []
  // Where the record starts: today's terms that were already searched then.
  if (termStart) {
    const today = new Set(input.terms.map(fold))
    const first = entries(input.changes.filter(searchedRow))
    const k = [...first].filter(([t, e]) => today.has(t) && e.reconstructed && dayOf(e.at) === dayOf(termStart)).length
    if (k > 0) steps.push({ when: `by ${short(dayOf(termStart))}`, words: `${k} of today’s terms`, state: 'past' })
  }
  const byDay = new Map<string, Change[]>()
  for (const c of rows) {
    const d = dayOf(c.changed_at)
    if (termStart && d === dayOf(termStart)) continue
    byDay.set(d, [...(byDay.get(d) ?? []), c])
  }
  for (const d of [...byDay.keys()].sort()) {
    const day = dayWords(byDay.get(d)!)
    if (!day.words) continue
    let words = day.words
    if (!day.reconstructed) {
      const first = firstUpdateAfter(day.last, input.updates)
      if (!first) words += ', not searched yet'
      else if (first !== d) words += `, first searched ${short(first)}`
    }
    steps.push({ when: short(d), words, state: 'past' })
  }
  if (!input.locked) return { steps, heldAfter: null }
  const heldAfter = steps.length > 0 ? steps.length - 1 : null
  const today = dayOf(input.now)
  if (FIRST_CLEAN && FIRST_CLEAN.from > today) {
    steps.push({ when: FIRST_CLEAN.when, words: 'October against November: the first comparison read the same way', state: 'ahead' })
  }
  if (QUEUE_FLOOR > today) {
    const d = new Date(`${QUEUE_FLOOR}T00:00:00.000Z`)
    steps.push({ when: `${shortDate(d.toISOString())} ${d.getUTCFullYear()}`, words: 'the earliest a change you ask for lands', state: 'ahead' })
  }
  return { steps, heldAfter }
}

// ---- Not these ----------------------------------------------------------------------

/**
 * What each word in "Not these" rules out, per tenant: the other meaning of a
 * name we track. The operator writes the exclusions (the 17 Sep script on
 * Sealand) and knows why each is there; the list does not, so the reason
 * lives here, as the brand rules do (lib/brands/aliases.ts). A word no group
 * names prints in a row of its own.
 */
export const EXCLUSION_MEANINGS: Readonly<Record<string, readonly { meaning: string; words: readonly string[] }[]>> = {
  [SEALAND_CLIENT_ID]: [
    { meaning: 'Patagonia, the region', words: ['argentina', 'chile', 'torres del paine'] },
    { meaning: 'Cotopaxi, the volcano', words: ['ecuador', 'volcano'] },
    { meaning: 'freedom of movement, at borders', words: ['schengen', 'immigration', 'border control'] },
    { meaning: 'old school, the music', words: ['hip hop'] },
  ],
}

/** The tenant's exclusions, grouped by the meaning each rules out, in the
 *  order the table names them; the rest after, with no meaning. */
export function exclusionGroups(clientId: string, exclusions: readonly string[]): { meaning: string | null; words: string[] }[] {
  const left = new Map(exclusions.map((w) => [fold(w), w]))
  const out: { meaning: string | null; words: string[] }[] = []
  for (const g of EXCLUSION_MEANINGS[clientId] ?? []) {
    const words = g.words.filter((w) => left.has(fold(w))).map((w) => left.get(fold(w))!)
    for (const w of g.words) left.delete(fold(w))
    if (words.length) out.push({ meaning: g.meaning, words })
  }
  if (left.size) out.push({ meaning: null, words: [...left.values()] })
  return out
}

// ---- Brands you track: what each is searched as ------------------------------------

/**
 * The searches that look for a brand: each "Brands you track" term its rule
 * names (a strong form, or its bare name with no guard, since a search box
 * reads no guard), or, with no rule, the terms that hold its name.
 */
export function searchedAs(brand: string, rule: BrandRule | null, terms: readonly string[]): string[] {
  const tests: RegExp[] = []
  if (rule) {
    const strong = strongPattern(rule, 'js')
    if (strong) tests.push(new RegExp(strong, 'isu'))
    if (rule.weak.length) tests.push(new RegExp(`(?<![\\p{L}\\p{N}_])(?:${rule.weak.join('|')})(?![\\p{L}\\p{N}_])`, 'isu'))
  }
  const name = fold(brand).replace(/^the\s+/, '')
  return terms.filter((t) => tests.some((re) => re.test(t)) || (name.length > 0 && fold(t).includes(name)))
}

/**
 * Since when a brand has been tracked: the day the list last took it in (a
 * brand taken off and put back is tracked again from that day), or, where
 * the log never shows it arriving, "by" the earliest day we hold evidence of
 * it (`competitors.first_seen_at`).
 */
export function trackedSince(name: string, changes: readonly Change[], firstSeenAt: string | null): string | null {
  const k = fold(name)
  let added: string | null = null
  for (const c of changes) {
    if (c.surface !== 'rivals' || (c.field != null && c.field !== 'competitor_names')) continue
    const before = listOf(c.before).map(fold)
    const after = listOf(c.after).map(fold)
    if (after.includes(k) && !before.includes(k) && (added == null || c.changed_at > added)) added = c.changed_at
  }
  if (added) return short(dayOf(added))
  return firstSeenAt ? `by ${short(dayOf(firstSeenAt))}` : null
}
