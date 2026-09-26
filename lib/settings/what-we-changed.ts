import type { ConfigChange } from '../config-log'
import { fmtInt, longMonth } from '../format'
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
 *  The three MF1 surfaces (WP1.4) use the preview's headings. */
const SURFACE_SENTENCE: Record<string, string> = {
  gate_rule: 'How we decide what is relevant',
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
 *  not a search term? */
const isExclusions = (r: Pick<ConfigChange, 'field'>): boolean => r.field === 'exclude_terms'

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
    const words = outAndIn(moved(mine).added.length, moved(mine).removed.length, 'rival', 'rivals')
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
}): (LedgerLine & { terms: { added: string[]; removed: string[] } | null })[] {
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
    const terms = c.surface === 'terms' ? termsMoved(mine) : null
    return {
      changeId: c.id,
      date: c.changedAt,
      surface: c.surface,
      words: changeWords(c, input.rows),
      reach: own ? { month: own.month, touched: own.touched, of: own.of, readWith: own.readWith as string } : null,
      months,
      terms: terms && (terms.added.length > 0 || terms.removed.length > 0) ? terms : null,
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
