import { fmtInt, longMonth } from '../../format'
import { carriesShare } from '../../reading/level'
import type { FigureTable } from '../../reading/verdicts'
import {
  LEAD_MAX_MAKER_SHARE,
  LEAD_NEW_SEARCH_NOTE,
  THEME_FLOOR,
  isMeasuredShare,
  makerFraction,
  type MarketTheme,
  type ThemeBoard,
} from './board'

// "The month": the market's size, then its three biggest conversations, and
// the two voices of the lead theme (market-first WP1.6, plan §2.2 block 1).
//
// THE LEAD IS THE THEME WHOSE QUOTES THE PAGE PRINTS, SO IT IS HELD TO THE
// STRICTEST RULE ON THE PAGE. The largest board row whose maker share is
// MEASURED at a quarter or less, whose label names no brand its quotes do not,
// whose identity was not minted by this run, and which Heinrich has not
// excluded (`front_page_overrides`), and whose kind is ever quoted (a
// demographic signal is counted, never quoted, so it could print no voice).
// A lead or voice over a quarter makers is a stop condition (plan §7.11). A
// tenant with no maker rule (Össur) has no maker restriction, and the words
// say "Its biggest conversations".
//
// ONE DENOMINATOR PER CLAUSE. The size sentence names the market's 655; the
// themes clause names the category's 626, where themes are grouped (decision
// E); the August line names August's 351. Never a category count over the
// market's n.
//
// PURE. The sentence travels as parts, so a theme label (model words) is its
// own node with its own marker and a figure is its own node with its own
// token; nothing is parsed out of a finished string.

export type HeroLead =
  | { kind: 'themes'; top: MarketTheme[]; lead: MarketTheme | null }
  | { kind: 'subject'; subjectId: string; label: string; k: number; n: number }
  | { kind: 'size' }

/** The three states WP1.1 gives a subject (decision C). Only `ready` may lead. */
export type LeadCalibration = 'ready' | 'provisional' | 'failed'

/** How many board rows the hero names. */
export const HERO_TOP = 3

/**
 * The hero's lead (plan §4.2 `heroLead`).
 *
 * Themes first: the top three board rows, and among ALL board rows the
 * largest that may supply voices. With no readable theme, the largest READY
 * subject at the floor leads ("the subject we read most"); otherwise the size
 * alone. No path makes a provisional or failed subject, or a maker-led theme,
 * the lead.
 */
export function heroLead(
  board: ThemeBoard,
  subjects: readonly { id: string; name: string; k: number | null; n: number | null; calibration: LeadCalibration }[],
  excluded: ReadonlySet<string>,
): HeroLead {
  if (board.rows.length > 0) {
    const lead = board.rows.find((t) => mayLead(t, board.segments, excluded)) ?? null
    return { kind: 'themes', top: board.rows.slice(0, HERO_TOP), lead }
  }
  const ready = subjects
    .filter((s) => s.calibration === 'ready' && s.k != null && s.n != null && s.n > 0 && s.k >= THEME_FLOOR)
    .sort((a, b) => (b.k ?? 0) - (a.k ?? 0) || a.id.localeCompare(b.id))[0]
  if (ready) return { kind: 'subject', subjectId: ready.id, label: ready.name, k: ready.k as number, n: ready.n as number }
  return { kind: 'size' }
}

/**
 * Kinds whose evidence is counted and never quoted: a demographic signal is
 * verified, then counted (Pass A, 2026-08-22; `insight_evidence.redacted`),
 * so a theme of that kind can never supply a voice. It stays on the board and
 * in the three the hero names; it never leads (WP1.6 review: Össur's biggest
 * September theme on staging, "Audience identities and amputation types", led
 * a page that could print no voice under it).
 */
export const UNQUOTED_KINDS: ReadonlySet<string> = new Set(['demographic_signal'])

/** May this board row supply the page's voices? */
export function mayLead(t: MarketTheme, segments: ThemeBoard['segments'], excluded: ReadonlySet<string>): boolean {
  if (t.labelStripped || t.identityNewThisRun || excluded.has(t.registryId)) return false
  if (t.kind != null && UNQUOTED_KINDS.has(t.kind)) return false
  if (segments === 'no_rule') return true
  if (segments !== 'measured') return false
  const s = t.makerShare
  return s != null && Number.isFinite(s) && s >= 0 && s <= LEAD_MAX_MAKER_SHARE
}

// ---- The sentence, as parts ------------------------------------------------------------

export type HeroPart =
  | { t: 'text'; s: string }
  /** A theme's label: model words, printed in quotation marks. */
  | { t: 'label'; s: string }
  /** A figure, by token in the hero's figure table. */
  | { t: 'figure'; key: string }

const tokenId = (id: string): string => id.replace(/[^a-z0-9]+/gi, '_').toLowerCase()

/** A theme's figure token, shared by the hero and the board so one figure is
 *  declared once however many blocks print it. */
export const themeToken = (registryId: string, suffix: 'k' | 'share' | 'prev'): string => `theme_${tokenId(registryId)}_${suffix}`
/** The category's videos in the reading month, and in the month before. */
export const THEME_N = 'theme_n'
export const THEME_PREV_N = 'theme_prev_n'

const COUNT_WORDS: Record<number, string> = { 1: '', 2: 'two ', 3: 'three ' }

/** "Its three biggest conversations not led by makers" and its kin. "Not led
 *  by makers" is said only where every conversation it names had its maker
 *  share measured: a row `theme_maker_shares` did not answer for may be. */
function introWords(count: number, measured: boolean): string {
  const plural = count !== 1
  const noun = plural ? 'conversations' : 'conversation'
  if (measured) return `Its ${COUNT_WORDS[count] ?? ''}biggest ${noun} not led by makers`
  return `Its biggest ${noun}`
}

/** "the first two", "the three", "the first and third": the positions a maker
 *  clause is about, where two or more share one fraction. */
function positionsWords(positions: readonly number[], of: number): string {
  const ord = ['first', 'second', 'third']
  if (positions.length === of && of > 1) return `the ${fmtCount(of)}`
  if (positions.length === 2 && positions[0] === 0 && positions[1] === 1) return 'the first two'
  return `the ${positions.map((p) => ord[p]).join(' and ')}`
}
const fmtCount = (n: number): string => (n === 2 ? 'two' : n === 3 ? 'three' : fmtInt(n))

/**
 * The themes clause: "Its three biggest conversations not led by makers, of
 * the [626] category videos: “Ready to buy handmade bags” [69], … and
 * “Confusion over airline bag sizes” [21]." then, where the board measured
 * them, a sentence per maker fraction among the three: "About a third of each
 * of the first two sits under makers’ own posts."
 */
export function heroThemeParts(hero: Extract<HeroLead, { kind: 'themes' }>, board: ThemeBoard): HeroPart[] {
  const top = hero.top
  if (top.length === 0) return []
  const measured = board.segments === 'measured' && top.every((t) => isMeasuredShare(t.makerShare))
  const parts: HeroPart[] = [
    { t: 'text', s: `${introWords(top.length, measured)}, of the ` },
    { t: 'figure', key: THEME_N },
    { t: 'text', s: ' category videos: ' },
  ]
  top.forEach((t, i) => {
    if (i > 0) parts.push({ t: 'text', s: i === top.length - 1 ? ' and ' : ', ' })
    parts.push({ t: 'label', s: t.label }, { t: 'text', s: ' ' }, { t: 'figure', key: themeToken(t.registryId, 'k') })
  })
  parts.push({ t: 'text', s: '.' })
  if (board.segments !== 'measured') return parts
  const byFraction = new Map<string, number[]>()
  top.forEach((t, i) => {
    const f = makerFraction(t.makerShare)
    if (f && f !== 'mostly') byFraction.set(f, [...(byFraction.get(f) ?? []), i])
  })
  for (const [fraction, positions] of byFraction) {
    const lead = `${fraction.charAt(0).toUpperCase()}${fraction.slice(1)}`
    if (positions.length === 1) {
      parts.push(
        { t: 'text', s: ` ${lead} of ` },
        { t: 'label', s: top[positions[0]].label },
        { t: 'text', s: ' sits under makers’ own posts.' },
      )
    } else {
      parts.push({ t: 'text', s: ` ${lead} of each of ${positionsWords(positions, top.length)} sits under makers’ own posts.` })
    }
  }
  return parts
}

/** "August: 7%, 7% and 3% of 351", or null where the previous month has no
 *  category row. Levels, never a change: nothing is compared across them. */
export function heroPrevParts(hero: Extract<HeroLead, { kind: 'themes' }>, board: ThemeBoard): HeroPart[] | null {
  const prev = board.prev
  if (!prev || prev.n == null || prev.n <= 0 || hero.top.length === 0) return null
  const parts: HeroPart[] = [{ t: 'text', s: `${longMonth(prev.month)}: ` }]
  hero.top.forEach((t, i) => {
    if (i > 0) parts.push({ t: 'text', s: i === hero.top.length - 1 ? ' and ' : ', ' })
    parts.push({ t: 'figure', key: themeToken(t.registryId, 'prev') })
  })
  parts.push({ t: 'text', s: ' of ' }, { t: 'figure', key: THEME_PREV_N })
  return parts
}

/** Does the lead carry its new-search count? At a third or more of its
 *  reading-month videos (`LEAD_NEW_SEARCH_NOTE`). */
export function leadNewSearch(lead: MarketTheme | null): { fromNewSearches: number; of: number } | null {
  const p = lead?.provenance
  if (!p || !(p.of > 0) || !(p.fromNewSearches >= 0) || p.fromNewSearches > p.of) return null
  return p.fromNewSearches / p.of >= LEAD_NEW_SEARCH_NOTE ? p : null
}

export const LEAD_NEW = 'lead_new_searches'
export const LEAD_OF = 'lead_videos'

/** "[x] of its [21] videos came from searches we added in September". */
export function leadNewSearchParts(lead: MarketTheme | null, month: string): HeroPart[] | null {
  if (!leadNewSearch(lead)) return null
  return [
    { t: 'figure', key: LEAD_NEW },
    { t: 'text', s: ' of its ' },
    { t: 'figure', key: LEAD_OF },
    { t: 'text', s: ` videos came from searches we added in ${longMonth(month)}` },
  ]
}

/** One theme's level in a column or a clause: its share at 100 videos or more,
 *  its count under (`levelText`'s floor), as a figure. */
function levelFigure(k: number, n: number, label: string): FigureTable[string] {
  return carriesShare(n)
    ? { value: Math.round((k / n) * 100), unit: 'pct', label }
    : { value: k, unit: 'videos', label }
}

/**
 * Every figure the board and the hero can print, by token: the category's n
 * and the previous month's, and each board row's k, share and previous level.
 * The hero and the board read ONE table, so the three biggest conversations
 * are the board's first three rows' own figures and are declared once.
 */
export function themeFigures(board: ThemeBoard, rows: readonly MarketTheme[] = board.rows): FigureTable {
  const month = longMonth(board.month)
  const out: FigureTable = {
    [THEME_N]: { value: board.n, unit: 'videos', label: `category videos in ${month}` },
  }
  const prev = board.prev
  if (prev && prev.n != null && prev.n > 0) {
    out[THEME_PREV_N] = { value: prev.n, unit: 'videos', label: `category videos in ${longMonth(prev.month)}` }
  }
  for (const t of rows) {
    out[themeToken(t.registryId, 'k')] = { value: t.k, unit: 'videos', label: `videos on ${t.label} in ${month}` }
    if (carriesShare(t.n)) out[themeToken(t.registryId, 'share')] = levelFigure(t.k, t.n, `${t.label}'s share of ${month}`)
    if (prev && prev.n != null && prev.n > 0) {
      const k = t.prev?.k ?? 0
      out[themeToken(t.registryId, 'prev')] = levelFigure(k, prev.n, `${t.label}'s level in ${longMonth(prev.month)}`)
    }
  }
  return out
}

/** The hero's own table: the board's figures for its three rows, and the
 *  lead's new-search count where it prints. */
export function heroFigures(hero: HeroLead, board: ThemeBoard | null, month: string): FigureTable {
  if (hero.kind === 'subject') {
    return {
      hero_subject_k: { value: hero.k, unit: 'videos', label: `videos on ${hero.label} in ${longMonth(month)}` },
      hero_subject_n: { value: hero.n, unit: 'videos', label: `videos in your market in ${longMonth(month)}` },
    }
  }
  if (hero.kind !== 'themes' || !board) return {}
  const out = themeFigures(board, hero.top)
  const note = leadNewSearch(hero.lead)
  if (note) {
    out[LEAD_NEW] = { value: note.fromNewSearches, unit: 'videos', label: `of the lead theme's videos, found by searches added in ${longMonth(month)}` }
    out[LEAD_OF] = { value: note.of, unit: 'videos', label: `the lead theme's videos in ${longMonth(month)}` }
  }
  return out
}

/** A figure as it prints: a whole share, or a count. */
export function figureText(f: FigureTable[string] | undefined): string {
  if (!f) return ''
  return f.unit === 'pct' ? `${Math.round(f.value)}%` : fmtInt(f.value)
}

/** The subject lead's clause: "The subject we read most, of the [655] videos
 *  in your market: Looks & style [104]." */
export function heroSubjectParts(hero: Extract<HeroLead, { kind: 'subject' }>): HeroPart[] {
  return [
    { t: 'text', s: 'The subject we read most, of the ' },
    { t: 'figure', key: 'hero_subject_n' },
    { t: 'text', s: ' videos in your market: ' },
    { t: 'label', s: hero.label },
    { t: 'text', s: ' ' },
    { t: 'figure', key: 'hero_subject_k' },
    { t: 'text', s: '.' },
  ]
}

/** "Two voices on “Confusion over airline bag sizes”" over the lead's quotes. */
export function voicesHeading(count: number): string {
  const words: Record<number, string> = { 1: 'One voice', 2: 'Two voices', 3: 'Three voices' }
  return words[count] ?? `${fmtInt(count)} voices`
}

/** The hero's figures and parts under the size sentence, in one place. */
export interface HeroView {
  parts: HeroPart[]
  prev: HeroPart[] | null
  newSearch: HeroPart[] | null
  figures: FigureTable
}

export function heroView(hero: HeroLead | null | undefined, board: ThemeBoard | null | undefined, month: string): HeroView {
  if (!hero || hero.kind === 'size') return { parts: [], prev: null, newSearch: null, figures: {} }
  if (hero.kind === 'subject') return { parts: heroSubjectParts(hero), prev: null, newSearch: null, figures: heroFigures(hero, null, month) }
  if (!board) return { parts: [], prev: null, newSearch: null, figures: {} }
  return {
    parts: heroThemeParts(hero, board),
    prev: heroPrevParts(hero, board),
    newSearch: leadNewSearchParts(hero.lead, month),
    figures: heroFigures(hero, board, month),
  }
}
