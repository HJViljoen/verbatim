import { GAP_WORDS, gapBasisLine, gapLine, type Gap } from '../../reading/gap'
import { fmtInt, round1 } from '../../format'
import type { Verdict } from '../../reading/verdicts'
import type { DocumentSnapshotData } from './types'

/**
 * What the overview says, derived from the document itself (T10, 2026-08-31).
 *
 * The three numbers, the in-short paragraph and the finding headlines are not
 * fields on the snapshot: they are read off the pages, so an edit flows
 * through. The printed deck and the email both read them HERE, so the paper
 * and the email can never drift apart.
 */

export interface OverviewTile {
  value: string
  label: string
  /**
   * The value is a WORD, not a figure — "too few to compare", "comparison
   * refused" — so the tile sets it at reading size rather than at the 38px
   * mono the artboard's figures sit at.
   *
   * IT IS NOT A STYLE FLAG IN DISGUISE. A refusal is the tile's answer, and a
   * refusal typeset as a 38px number reads as one; keeping the tile and
   * changing the type is how the artboard's layout survives a rule the
   * artboard does not have (mock-gap §6 D1, D2).
   */
  word?: boolean
}

/**
 * The gap a brief leads with (package E-marketing, `mkt.p2.gap` / `mkt.p1.stats`).
 *
 * THE FIRST ONE THAT CONCLUDED SOMETHING, and the order is the order the page
 * drew its rows in — the brief does not re-rank the subjects, because the page
 * already ranked them and a brief that re-sorted would be a second reading. A
 * gap that is `apart` beats one that read `level`, which beats a refusal;
 * within a state the page's own order stands. Null where the reading holds no
 * gap at all, which a workspace without subjects is.
 */
export function leadGap(gaps: readonly Gap[] | undefined): Gap | null {
  if (!gaps?.length) return null
  const rank = (g: Gap) => (g.state === 'apart' ? 0 : g.state === 'level' ? 1 : 2)
  return [...gaps].sort((a, b) => rank(a) - rank(b))[0] ?? null
}

/** The gap tile's face: the magnitude where one was earned, the state's own
 *  word where it was not. Never a magnitude beside a refusal (D2). */
export function gapTile(gap: Gap): OverviewTile {
  const basis = gapBasisLine(gap)
  const label = `${gap.objectLabel} — ${gapLine(gap)}${basis ? `. ${basis}` : ''}`
  return gap.state === 'apart' && gap.gapPts != null
    ? { value: `${round1(Math.abs(gap.gapPts))} pts`, label }
    : { value: GAP_WORDS[gap.state], label, word: true }
}

/**
 * The verdict a brief leads with: the largest banded MOVE, and only a move.
 *
 * A tile is the most prominent thing on the first sheet, so it states a
 * conclusion or it states nothing — `no_clear_change` and `too_little_data`
 * are real answers on a row of a table and are not a headline. Ties break on
 * the larger n, so the one measured on more videos wins.
 */
export function leadVerdict(verdicts: readonly Verdict[] | undefined): Verdict | null {
  const moved = (verdicts ?? []).filter((v) => v.state === 'moved' && v.changePts != null && v.bandPts != null)
  return [...moved].sort((a, b) => Math.abs(b.changePts!) - Math.abs(a.changePts!) || b.value.n - a.value.n)[0] ?? null
}

/** "▲ 3.2 pts" and the sentence under it — the levels, the band, and the
 *  population, with NO direction word: `Verdict.direction` is filled only by
 *  `directionWord`, over three readings, and a tile may not add one. */
export function verdictTile(v: Verdict): OverviewTile {
  const pct = v.value.n > 0 ? round1((v.value.k / v.value.n) * 100) : 0
  const arrow = (v.changePts ?? 0) >= 0 ? '\u25b2' : '\u25bc'
  const of = `${fmtInt(v.value.k)} of ${fmtInt(v.value.n)}`
  return {
    value: `${arrow} ${round1(Math.abs(v.changePts ?? 0))} pts`,
    label: `${v.objectLabel} — ${pct}%, ${of}. Band ${round1(v.bandPts ?? 0)}.`,
  }
}

/** The standing page packs its party names as JSON (a name may carry any
 *  separator we could have chosen). Anything unparseable degrades to none. */
function standingParties(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')

/**
 * The three tiles on the In-short sheet.
 *
 * WITH A MONTHLY READING THEY ARE THE MONTH'S, AND THERE ARE THREE OF THEM.
 * `documentFigures` fills `client_share_pct` / `positive_pct` only on the
 * branch with NO reading, so a brief with one printed a single tile —
 * measured on the populated fixture and on production. The artboard's three
 * are a gap, a banded change and an attention index; the first two are now
 * frozen onto the reading and are printed here. The third is refused: an
 * attention index is a movement claim over a comment count under a fixed
 * panel, which has no denominator and therefore no band (D7), so the third
 * tile states what the month was read on instead — which is the one number the
 * other two are shares of.
 *
 * THE LABEL SAID "THIS UPDATE" OVER A MONTH'S NUMBER. `f.conversations` has
 * been the month's comments since WP19 and the tile went on calling them "read
 * this update", on the first sheet a reader meets. Same class as AGENTS.md's
 * "a page once claimed no email is sent while Resend sent".
 *
 * WITHOUT A READING nothing changes: the update's own three, exactly as they
 * were, and the method sheet says which basis the brief used.
 */
export function overviewTiles(data: DocumentSnapshotData): OverviewTile[] {
  const f = data.figures
  const r = data.reading
  if (r) {
    const gap = leadGap(r.gaps)
    const verdict = leadVerdict(r.verdicts)
    const category = r.denominators.find((d) => d.audience === 'industry-other') ?? r.denominators[0] ?? null
    const comments = r.denominators.reduce((n, d) => n + d.comments, 0)
    return [
      gap && gapTile(gap),
      verdict && verdictTile(verdict),
      comments > 0 && {
        value: fmtInt(comments),
        label: `comments read in ${r.monthLabel}${category ? `, on ${fmtInt(category.videos)} videos in ${category.label}` : ''}`,
      },
    ].filter(Boolean) as OverviewTile[]
  }
  // The name to set the share against: the first competitor with a page, or,
  // for a template that prints none (the leadership brief's standing page),
  // the first one the standing page lists. A share with nothing beside it is
  // a number without a scale.
  const competitor =
    data.pages.find((p) => p.kind === 'competitor')?.meta?.name
    ?? standingParties(data.pages.find((p) => p.kind === 'standing')?.meta?.parties)[1]
  const compKey = competitor ? `${slugOf(competitor)}_share_pct` : null
  return [
    f.conversations && { value: f.conversations.value, label: `conversations read this update${f.videos ? `, on ${f.videos.value} videos` : ''}` },
    f.client_share_pct && {
      value: f.client_share_pct.value,
      label: compKey && f[compKey] ? `${data.company}'s share of tracked conversation · ${competitor} ${f[compKey].value}` : `${data.company}'s share of tracked conversation`,
    },
    f.positive_pct && { value: f.positive_pct.value, label: 'positive, of the conversations judged for tone' },
  ].filter(Boolean) as OverviewTile[]
}

/** The finding headlines, in page order — from the finding pages themselves,
 *  never the overview's own written-once list, so an edited headline shows. */
export function findingHeadlines(data: DocumentSnapshotData): string[] {
  return data.pages
    .filter((p) => p.kind === 'finding')
    .map((p) => p.blocks.find((b) => b.field === 'headline')?.text ?? '')
    .filter(Boolean)
}

/** The in-short paragraph, still carrying its [[key]] placeholders. */
export function inShortSummary(data: DocumentSnapshotData): string {
  const page = data.pages.find((p) => p.kind === 'in_short')
  return page?.blocks.find((b) => b.field === 'summary')?.text ?? ''
}
