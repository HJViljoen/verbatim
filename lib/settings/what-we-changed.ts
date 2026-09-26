import type { ConfigChange } from '../config-log'
import { fmtInt, longMonth, platformLabel } from '../format'
import { subredditLabel } from '../gather/subreddits'
import { activeCommunities, type OurChange } from '../reading/comparability'
import { monthStartOf } from '../reading/month-key'
import type { LedgerLine } from '../pages/overview-market/change'
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
 *  scripts write (WP1.4), whose notes Heinrich approves before the apply.
 *  Every older row's note is the reconstruction's operator prose (GC F9) and
 *  is never printed here. */
const CLIENT_NOTE_SURFACES: ReadonlySet<string> = new Set(['gate_rule', 'attribution', 'segment'])

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

/** The communities a group of `subreddits` rows switched on and off. */
function communitiesMoved(rows: readonly Pick<ConfigChange, 'surface' | 'before' | 'after'>[]): { on: string[]; off: string[] } {
  const on = new Set<string>()
  const off = new Set<string>()
  for (const r of rows) {
    if (r.surface !== 'subreddits') continue
    const before = activeCommunities(r.before) ?? new Set<string>()
    const after = activeCommunities(r.after) ?? new Set<string>()
    for (const s of after) if (!before.has(s)) on.add(s)
    for (const s of before) if (!after.has(s)) off.add(s)
  }
  return { on: [...on].sort(), off: [...off].sort() }
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
 * was written in client words (`CLIENT_NOTE_SURFACES`).
 */
export function changeWords(change: OurChange, rows: readonly ConfigChange[]): string {
  if (CLIENT_NOTE_SURFACES.has(change.surface) && change.note?.trim()) return change.note.trim()
  const ids = new Set(change.rowIds ?? [change.id])
  const mine = rows.filter((r) => ids.has(r.id))
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
    const { on, off } = communitiesMoved(mine)
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
 * The dated list: one line per change of ours, newest first, each with the
 * months it touched. `runFinish` maps a run id to its finish instant, for
 * "read with the {date} update"; a reach row read through a run the map does
 * not hold is dated by its own computation.
 */
export function ledgerLines(input: {
  changes: readonly OurChange[]
  rows: readonly ConfigChange[]
  reach: readonly ReachRow[]
  runFinish: ReadonlyMap<string, string>
}): (LedgerLine & { items: { added: string[]; removed: string[] } | null })[] {
  const out = input.changes.map((c) => {
    const ids = new Set(c.rowIds ?? [c.id])
    const newest = new Map<string, ReachRow>()
    for (const r of input.reach) {
      if (!ids.has(r.changeId) || r.population !== 'market') continue
      const m = monthStartOf(r.month)
      const held = newest.get(m)
      if (!held || Date.parse(r.computedAt) > Date.parse(held.computedAt)) newest.set(m, r)
    }
    const months = [...newest.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, r]) => ({
        month,
        touched: r.touched,
        of: r.inMonth,
        readWith: (r.readThroughRun ? input.runFinish.get(r.readThroughRun) : null) ?? r.computedAt,
      }))
    const own = months.find((m) => m.month === monthStartOf(c.changedAt)) ?? null
    const mine = input.rows.filter((r) => ids.has(r.id))
    // WHAT THE LINE NAMES BESIDE ITS WORDS: the search terms, the rivals or
    // the communities it took in and out.
    const communities = c.surface === 'subreddits' ? communitiesMoved(mine) : null
    const items = c.surface === 'terms'
      ? termsMoved(mine)
      : c.surface === 'rivals'
        ? rivalsMoved(mine)
        : communities
          ? { added: communities.on.map(subredditLabel), removed: communities.off.map(subredditLabel) }
          : null
    return {
      changeId: c.id,
      date: c.changedAt,
      surface: c.surface,
      words: changeWords(c, input.rows),
      reach: own ? { month: own.month, touched: own.touched, of: own.of, readWith: own.readWith as string } : null,
      months,
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
