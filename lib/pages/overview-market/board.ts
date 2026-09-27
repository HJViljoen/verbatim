import type { Quote } from '../../renderables/types'
import { SHARE_BAND } from '../../report-bands'
import { fromNewSearches, type ThemeEvidence } from './provenance'

// "What your market talked about": the theme board, the makers line, and the
// asks (market-first WP1.6, plan §2.2 blocks 2 and 5, §4.2 `overview-market`).
//
// THE MARKET IN FULL, BIGGEST FIRST, AS LEVELS. Every theme the category read
// in the month at 10 videos or more is accounted for: it is one of the ten
// board rows, or it is counted in the makers line or the set-aside line
// (decision F), and `atTen` counts all of them. Nothing here compares two
// months; the previous month rides beside each row as a level of its own.
//
// THEMES ARE GROUPED WITHIN THE CATEGORY (decision E). A theme's k and n are
// the category's, never the pooled market's: the category's 626 September
// videos, not the market's 655. A category count is never divided by the
// market's n.
//
// MAKERS STAY IN THE COUNTS AND ARE MARKED (decision F). A theme where half or
// more of the videos are makers' is grouped into the makers line; a theme at a
// fifth or more prints its maker share on its row. The share is MF1's
// `theme_maker_shares` (WP1.4); null is "not measured", and until it is
// measured nothing is grouped and no theme may lead (`hero.ts`).
//
// PURE. The loader reads the month's category theme rows, the latest themed
// run's kinds and match kinds, and the segment shares, and hands them in.

/** At or above: a theme is grouped into the makers line (decision F). */
export const MAKER_GROUP_SHARE = 0.5
/** At or above: a board row prints its maker share. */
export const MAKER_NOTE_SHARE = 0.2
/** The lead theme (its voices, Conversation's opening theme) must measure at or
 *  under this (plan §7.11: a voice or lead over a quarter is a stop). */
export const LEAD_MAX_MAKER_SHARE = 0.25
/** A lead with this share or more of its videos from searches added in the
 *  reading month prints that count on the hero line. */
export const LEAD_NEW_SEARCH_NOTE = 1 / 3
/** The board's rows, and the most any block may print (decision B). */
export const BOARD_ROWS = 10
/** Rows in each of the three asks lists. */
export const ASK_ROWS = 3
/** A theme's own floor: the board, the hero and the asks open at 10 videos
 *  (`SHARE_BAND.minK`, the floor a share needs). */
export const THEME_FLOOR = SHARE_BAND.minK ?? 10

export interface MarketTheme {
  /** `theme_registry.id`: the identity, never the label. */
  registryId: string
  label: string
  /** The label named a brand no evidence quote names, and reads "a brand" now
   *  (`stripUnevidencedBrand`). A stripped label never leads. */
  labelStripped: boolean
  /** `theme_observations.category` on the latest themed run: question,
   *  pain_point, feature_request, praise… Null where the run did not observe it. */
  kind: string | null
  /** The reading month, category bucket, CATEGORY n (never the pooled n). */
  k: number
  n: number
  /** The previous month's level: k is 0 where that month has a category row
   *  and the theme is not in it; null where that month has no row at all. */
  prev: { month: string; k: number; n: number } | null
  /** `theme_maker_shares()`: null is not measured (MF1 missing, or no rule for
   *  the tenant). */
  makerShare: number | null
  noiseShare: number | null
  /** `match_kind` 'new' on the latest themed run AND that run did not open a
   *  new clustering regime (the first run of a regime re-groups; it does not
   *  mint). */
  identityNewThisRun: boolean
  /** WP2.4 (`themeFlags`): at most one; empty on the front page's board,
   *  which prints no flag (the approved preview). */
  flags: ('new' | 'now_10')[]
  /** Videos found only by searches added in the reading month, of the theme's
   *  reading-month videos. Null where not measured. */
  provenance: { fromNewSearches: number; of: number } | null
}

export interface ThemeBoard {
  month: string
  /** The category's videos in the month: every row's n. */
  n: number
  /** `measured`: MF1 answered. `unknown`: it did not (not applied, or the read
   *  failed), so nothing is grouped. `no_rule`: the tenant has no maker rule
   *  (Össur, §2.13), so there is no makers line at all. */
  segments: 'measured' | 'unknown' | 'no_rule'
  /** The themes not led by makers or noise (or not measured), at the floor or
   *  over, by k desc (ties: prev k desc, then registryId), at most BOARD_ROWS. */
  rows: MarketTheme[]
  /** Maker-led themes at the floor, and the two biggest of them by name. Null
   *  when unknown or no rule. */
  makers: { count: number; lead: MarketTheme[] } | null
  /** Noise-led themes, grouped the same way. */
  setAside: { count: number; lead: MarketTheme[] } | null
  /** Every theme at the floor or over in the reading month. */
  atTen: number
  /** The previous month the rows print beside, and its category n, for the
   *  column head "Aug (of 351)". Null where the page has none. */
  prev: { month: string; n: number | null } | null
  /** The month pair's one chip for the board (R3): the themes view's refusal,
   *  set by the loader. Additive to the pinned shape. */
  chip?: string | null
}

const finiteShare = (s: number | null | undefined): number | null =>
  s != null && Number.isFinite(s) && s >= 0 && s <= 1 ? s : null

/**
 * The previous month's count of a theme that month read, or null where it did
 * not read the theme (no row, or a row without it).
 *
 * NOT "Aug 0%" (the lead's ruling of 27 Sep on the deploy-3 design review).
 * A theme first heard this month has no August reading, and its August cell
 * printed "0%" as if August had been read for it and found nothing. The
 * preview's mark for a month with no figure is "·" (its subjects table sets
 * Price's August so), so a table prints "·" where this is null, and a
 * sentence says "none".
 */
export function prevReadK(t: Pick<MarketTheme, 'prev'>): number | null {
  return t.prev && t.prev.k > 0 ? t.prev.k : null
}

/** Board order: k desc, then the previous month's k desc, then the registry
 *  id, so the order never depends on how the rows came back. */
export function byBoardOrder(a: MarketTheme, b: MarketTheme): number {
  return b.k - a.k || (b.prev?.k ?? -1) - (a.prev?.k ?? -1) || a.registryId.localeCompare(b.registryId)
}

/** Led by makers (grouped), led by noise (set aside), or neither. A theme that
 *  is not measured is neither: it cannot be grouped on a share nobody has. */
export function segmentOf(t: Pick<MarketTheme, 'makerShare' | 'noiseShare'>): 'makers' | 'noise' | null {
  const maker = finiteShare(t.makerShare)
  const noise = finiteShare(t.noiseShare)
  const makers = maker != null && maker >= MAKER_GROUP_SHARE
  const set = noise != null && noise >= MAKER_GROUP_SHARE
  if (makers && set) return (maker ?? 0) >= (noise ?? 0) ? 'makers' : 'noise'
  return makers ? 'makers' : set ? 'noise' : null
}

/**
 * The board, from every category theme the month read.
 *
 * Only themes at the floor or over are on it or counted by it: the list opens
 * at 10 videos (§2.12). Where segments are `measured`, maker-led and noise-led
 * themes leave the rows for their two lines; otherwise every theme at the
 * floor is a candidate row, and nothing is grouped.
 */
export function buildThemeBoard(
  themes: readonly MarketTheme[],
  n: number,
  month: string,
  segments: ThemeBoard['segments'],
  prev: ThemeBoard['prev'] = null,
): ThemeBoard {
  const seen = new Set<string>()
  const atFloor = themes
    .filter((t) => {
      if (seen.has(t.registryId) || !(t.k >= THEME_FLOOR) || !t.label.trim()) return false
      seen.add(t.registryId)
      return true
    })
    .sort(byBoardOrder)
  const grouped = segments === 'measured'
  const makers = grouped ? atFloor.filter((t) => segmentOf(t) === 'makers') : []
  const noise = grouped ? atFloor.filter((t) => segmentOf(t) === 'noise') : []
  const rows = atFloor.filter((t) => !grouped || segmentOf(t) == null).slice(0, BOARD_ROWS)
  return {
    month,
    n,
    segments,
    rows,
    makers: grouped ? { count: makers.length, lead: makers.slice(0, 2) } : null,
    setAside: grouped ? { count: noise.length, lead: noise.slice(0, 2) } : null,
    atTen: atFloor.length,
    prev,
  }
}

/**
 * How much of a theme is makers', in words: "about a third". Null under a
 * fifth, where a row prints nothing about makers (decision F), and for a share
 * nobody measured. Half or more is "mostly": such a theme is grouped, and the
 * words only reach a reader on the makers line.
 *
 * The ladder rounds to the fraction a reader would say: 21% is "a fifth", 31%
 * to 36% is "about a third", 38% is "over a third" (plan §2.2's print and the
 * preview's rows).
 */
export function makerFraction(share: number | null | undefined): string | null {
  const s = finiteShare(share)
  if (s == null || s < MAKER_NOTE_SHARE) return null
  if (s >= MAKER_GROUP_SHARE) return 'mostly'
  if (s < 0.225) return 'a fifth'
  if (s < 0.275) return 'about a quarter'
  if (s < 0.365) return 'about a third'
  if (s < 0.45) return 'over a third'
  return 'almost half'
}

/**
 * How much of a MAKER-LED theme is makers' (WP2.4; the preview's makers group
 * on Conversation: "about three quarters makers", "nearly all makers"). The
 * front page groups these into one line and never prints their rows; the
 * Conversation board lists every one of them, so "mostly" would say the same
 * word seven times. Null under half, where `makerWords` speaks.
 */
export function groupedMakerWords(share: number | null | undefined): string | null {
  const f = groupedMakerFraction(share)
  return f ? `${f} makers` : null
}

/** The fraction `groupedMakerWords` names: "over four in five", "all". */
export function groupedMakerFraction(share: number | null | undefined): string | null {
  const s = finiteShare(share)
  if (s == null || s < MAKER_GROUP_SHARE) return null
  return s >= 1 ? 'all' : s >= 0.9 ? 'nearly all' : s >= 0.825 ? 'over four in five' : s >= 0.775 ? 'about four in five'
    : s >= 0.7 ? 'about three quarters' : s >= 0.6 ? 'about two thirds' : 'over half'
}

/** A row's maker tag: "about a third makers", or null (under a fifth, or not
 *  measured). */
export function makerWords(share: number | null | undefined): string | null {
  const f = makerFraction(share)
  return f ? `${f} makers` : null
}

/** Did `theme_maker_shares` measure this share (a proportion, 0 to 1)? */
export const isMeasuredShare = (share: number | null | undefined): boolean => finiteShare(share) != null

/** The Makers cell's words where a theme came back with no share. */
export const MAKERS_NOT_MEASURED = 'not measured'

/**
 * A board row's Makers cell, on a board whose segments were measured: its
 * maker words at a fifth or more, "not measured" where `theme_maker_shares`
 * returned no row for the theme (WP1.6 review: an empty cell read as "under a
 * fifth makers" when nothing was measured), and null under a fifth.
 */
export function makerCell(share: number | null | undefined): string | null {
  return isMeasuredShare(share) ? makerWords(share) : MAKERS_NOT_MEASURED
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A theme label that names a brand no evidence quote names reads "a brand".
 *
 * A model named the theme; its quotes are what people said. "Comparing Sealand
 * with alternatives" names Sealand in none of its quotes (DR F43), so the label
 * would put a claim about Sealand on the front page that nothing said. A name
 * is matched whole-word and without case; a label is left alone when any of
 * the evidence names the brand. With no evidence at all, a label naming a
 * brand is stripped: nothing said it.
 */
export function stripUnevidencedBrand(
  label: string,
  brandNames: readonly string[],
  evidenceTexts: readonly string[],
): { label: string; stripped: boolean } {
  let out = label
  let stripped = false
  const said = evidenceTexts.join('\n')
  for (const name of [...new Set(brandNames.map((b) => b.trim()).filter((b) => b.length > 1))]) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}(?=$|[^\\p{L}\\p{N}])`, 'giu')
    if (!re.test(out)) continue
    re.lastIndex = 0
    const inEvidence = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(said)
    if (inEvidence) continue
    out = out.replace(re, (_m, before: string) => `${before}a brand`)
    stripped = true
  }
  // A label that now opens on the words reads as a sentence start.
  if (stripped && out.startsWith('a brand')) out = `A${out.slice(1)}`
  return { label: out, stripped }
}

/** Does this label name one of the brands (whole word, any case)? The loader
 *  reads evidence only for the labels that do. */
export function namesABrand(label: string, brandNames: readonly string[]): boolean {
  return brandNames.some((name) => {
    const n = name.trim()
    return n.length > 1 && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(n)}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(label)
  })
}

// ---- The asks (plan §2.2 block 5) -----------------------------------------------------

/** The three lists, in the preview's order. */
export const ASK_KINDS = ['question', 'pain_point', 'feature_request'] as const
export type AskKind = (typeof ASK_KINDS)[number]

/** Each list's heading. */
export const ASK_TITLES: Record<AskKind, string> = {
  question: 'Asked',
  pain_point: 'Complained',
  feature_request: 'Wished for',
}

export interface AsksBlock {
  month: string
  /** No all-videos header count: each list counts its own themes. */
  lists: {
    kind: AskKind
    rows: { registryId: string; label: string; k: number; quote: Quote | null }[]
  }[]
}

/**
 * The asks: themes whose kind is a question, a problem or a wish, not led by
 * makers or noise, at the floor or over, the three biggest of each, each with
 * one evidence quote of that kind from that theme, dated in the month
 * (`quotes`, by registry id; the loader applies the quote rule). A stripped
 * label keeps its stripped words.
 */
export function buildAsks(
  themes: readonly MarketTheme[],
  month: string,
  segments: ThemeBoard['segments'],
  quotes: ReadonlyMap<string, Quote | null> = new Map(),
): AsksBlock {
  const grouped = segments === 'measured'
  const eligible = themes
    .filter((t) => t.k >= THEME_FLOOR && t.label.trim() && (!grouped || segmentOf(t) == null))
    .sort(byBoardOrder)
  return {
    month,
    lists: ASK_KINDS.map((kind) => ({
      kind,
      rows: eligible
        .filter((t) => t.kind === kind)
        .slice(0, ASK_ROWS)
        .map((t) => ({ registryId: t.registryId, label: t.label, k: t.k, quote: quotes.get(t.registryId) ?? null })),
    })),
  }
}

/** The registry ids the asks would list, before any quote is read: the loader
 *  reads quotes for exactly these. */
export function askIds(themes: readonly MarketTheme[], segments: ThemeBoard['segments']): string[] {
  return buildAsks(themes, '', segments).lists.flatMap((l) => l.rows.map((r) => r.registryId))
}

// ---- Conversation: every theme at 10+, flagged, with provenance (WP2.4) ------------
//
// PLAN §2.4 C2: every category theme at 10 videos or more in the reading month,
// biggest first, nothing skipped. The same rows the front page's board reads
// (`MarketTheme`), the same order (`byBoardOrder`) and the same grouping
// (decision F: maker-led themes on a line of their own, noise-led ones set
// aside), with no cap, and each row carrying two things the front page's does
// not: its flags and where its videos came from.

/** A theme's flag (plan §2.4 C2; `MarketTheme.flags`). */
export type ThemeFlag = MarketTheme['flags'][number]

/** A flag's words, as the preview prints them. */
export const FLAG_WORDS: Readonly<Record<ThemeFlag, string>> = { new: 'New', now_10: 'Now 10+' }

/** What a flag is not (WP2.4: "both print both counts and 'too few last month
 *  to call it a change'"). A flag is a level against the floor, never a
 *  verdict: last month had under 10 videos, so no band could be drawn. */
export const FLAG_NOT_A_CHANGE = 'too few last month to call it a change'

/** The pool Conversation reads (WP2.4: "a reading-month pool of every category
 *  theme with k ≥ 3, not the top 40 by comments"): the themes at 3 to 9 are
 *  counted under the board and listed on request. */
export const POOL_FLOOR = 3

/**
 * A theme's flags (WP2.4), at most one:
 *
 * - **New**: no row for the registry id in any earlier month (`heardBefore`
 *   false), UNLESS the identity was minted by an update that opened a new
 *   clustering regime (`regrouped`, WP1.9's rule, `opensClusteringRegime`):
 *   that update re-groups the whole corpus, so an identity it minted is the
 *   same conversation under a new name, and flagging it would mark nearly
 *   every theme New.
 * - **Now 10+**: at 10 or more now and under 10 last month (a re-grouped
 *   identity with no earlier row lands here, with last month's 0).
 *
 * Nothing under the floor, and nothing where the page has no previous month
 * to read against (`prevK` null): a tenant's first month is not "new".
 */
export function themeFlags(input: {
  k: number
  /** Last month's category k: 0 where that month has rows and the theme is
   *  not in them; null where the page has no previous month. */
  prevK: number | null
  /** A row with videos for this registry id in some month before the reading
   *  month, in any audience. */
  heardBefore: boolean
  /** Minted by an update that opened a new clustering regime (WP1.9). */
  regrouped: boolean
}): ThemeFlag[] {
  if (!(input.k >= THEME_FLOOR) || input.prevK == null || !Number.isFinite(input.prevK)) return []
  if (!input.heardBefore && !input.regrouped) return ['new']
  return input.prevK < THEME_FLOOR ? ['now_10'] : []
}

/**
 * How many of a theme's reading-month videos came from searches added in that
 * month (WP2.4 `themeProvenance`; the 26 Sep ruling's definition,
 * `fromNewSearches`).
 *
 * IN A MONTH WHERE NO SEARCH WAS ADDED THE COUNT IS 0 BY DEFINITION, with no
 * per-video read: `added` empty answers 0 of the theme's videos whatever
 * `evidence` holds, so the loader skips the evidence reads. Null where it is
 * not measured: the added searches could not be read (`added` null), or the
 * evidence could not (`evidence` null, or no provenance rows: MF1 not applied).
 */
export function themeProvenance(
  videoIds: readonly string[],
  evidence: ThemeEvidence | null,
  added: ReadonlySet<string> | null,
): { fromNewSearches: number; of: number } | null {
  if (added == null) return null
  const of = new Set(videoIds).size
  if (of === 0) return null
  if (added.size === 0) return { fromNewSearches: 0, of }
  return evidence ? fromNewSearches(videoIds, evidence, added) : null
}

export interface ConversationBoard {
  month: string
  /** The category's videos in the month: every row's n. */
  n: number
  /** The previous month and its category n, for the "Aug of 351" column. */
  prev: { month: string; n: number | null } | null
  segments: ThemeBoard['segments']
  /** Every theme at 10+ not led by makers or noise (or not measured), in
   *  board order, NEVER CAPPED: nothing is skipped (plan §2.4 C2, §5.9). */
  rows: MarketTheme[]
  /** The maker-led themes at 10+, in board order. Null where the segments were
   *  not measured or the tenant has no maker rule (Össur). */
  makers: MarketTheme[] | null
  /** The noise-led themes at 10+, set aside the same way. */
  setAside: MarketTheme[] | null
  /** The themes at 3 to 9 videos: how many, and the rows only when a reader
   *  asked for them ("More themes at 3 to 9 videos →"). */
  below: { count: number; rows: MarketTheme[] | null }
  /** Every theme at 10+: rows, makers and set aside together. */
  atTen: number
  /** How many of the category's videos in the month sit in a theme at 10+
   *  (the union of their videos), or null where that was not read. */
  inThemes: number | null
  /** The themes view's one chip for the month pair (R3), or null. */
  chip: string | null
}

/**
 * Conversation's board: every theme at the floor or over, grouped as the
 * front page groups them and uncapped; the pool under the floor counted.
 */
export function buildConversationBoard(
  themes: readonly MarketTheme[],
  n: number,
  month: string,
  segments: ThemeBoard['segments'],
  prev: ConversationBoard['prev'],
  opts: {
    expanded?: boolean
    /** The pool's themes at 3 to 9 where the loader read only those at 10+
     *  (the board not expanded): counted, not listed. */
    belowCount?: number
    inThemes?: number | null
    chip?: string | null
  } = {},
): ConversationBoard {
  const seen = new Set<string>()
  const pool = themes
    .filter((t) => {
      if (seen.has(t.registryId) || !(t.k >= POOL_FLOOR) || !t.label.trim()) return false
      seen.add(t.registryId)
      return true
    })
    .sort(byBoardOrder)
  const atFloor = pool.filter((t) => t.k >= THEME_FLOOR)
  const below = pool.filter((t) => t.k < THEME_FLOOR)
  const grouped = segments === 'measured'
  return {
    month,
    n,
    prev,
    segments,
    rows: atFloor.filter((t) => !grouped || segmentOf(t) == null),
    makers: grouped ? atFloor.filter((t) => segmentOf(t) === 'makers') : null,
    setAside: grouped ? atFloor.filter((t) => segmentOf(t) === 'noise') : null,
    below: { count: opts.expanded ? below.length : opts.belowCount ?? below.length, rows: opts.expanded ? below : null },
    atTen: atFloor.length,
    inThemes: opts.inThemes ?? null,
    chip: opts.chip ?? null,
  }
}

/**
 * How much of a theme's videos are makers', as the theme pane says it (plan
 * §2.4 C3, the preview: "fewer than a fifth of its videos are makers' own").
 * Null where nobody measured it.
 */
export function makerShareSentence(share: number | null | undefined): string | null {
  const s = finiteShare(share)
  if (s == null) return null
  if (s < MAKER_NOTE_SHARE) return 'fewer than a fifth of its videos are makers’ own'
  // Half or more in the board's grouped words, so the pane and its row agree.
  return `${groupedMakerFraction(s) ?? makerFraction(s)} of its videos are makers’ own`
}
