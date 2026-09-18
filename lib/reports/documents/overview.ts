import { fmtInt } from '../../format'
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
   * The banded claim about this figure, where the reading earned one
   * (`sales.p1.stats`, the mock's third line on a stat tile).
   *
   * A VERDICT, NOT A WORD. The artboard writes "▼ 3 pts · fading, 3rd month"
   * and "▲ 1.9 pts · up, 2nd month" by hand; a magnitude and a direction word
   * are two different claims and this product earns them separately —
   * `MovementBadge` prints the change only when the state is `moved` and the
   * band travels beside it (D2), and a direction word comes from
   * `directionWord` alone and from no reader whose flag is false (D5). So the
   * tile hands the claim to the one component allowed to make it and writes
   * none of its own.
   */
  verdict?: Verdict | null
  /**
   * Why the comparison was not drawn, in the FIGURE's own words — the
   * switching figure's `unread`, which says which floor bit and how many it
   * had. Printed under the badge, never instead of a number that exists.
   */
  note?: string | null
  /**
   * Is this tile a LEVEL — a figure over a population it names — rather than
   * a count or a share the update never counted?
   *
   * THE SIDE THAT KNOWS SAYS SO. `StatTile` decided this with
   * `/\bof\s[\d]/.test(label)`, a regex over rendered copy: the contract's own
   * `DENOMINATOR_RE` is `\bof\s+[\d]`, so a label with two spaces, or one
   * phrased "of the 1,388", dropped the `data-copy="level"` marker and the
   * tile silently stopped being checked — the node-declares-itself discipline
   * the contract is built on, inverted. The composer below builds each label
   * and knows which of them is a measurement of a population.
   */
  level?: boolean
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
 * The three numbers on the cover.
 *
 * TWO BASES, AND THE READING'S ONE COMES FIRST (Block D wave 2, E-sales).
 * Without a monthly reading these are the update's: conversations read, share
 * of tracked conversation (paired with the first competitor when there is one),
 * positive of judged. A number the run could not measure is simply absent.
 *
 * WITH one, two of those three are deliberately withdrawn upstream —
 * `documentFigures` sets `client_share_pct` and `positive_pct` only on the
 * no-reading branch, because a share of one run's tracked videos is not a
 * reading of a month — and the cover was left printing a SINGLE tile. The
 * artboard draws three. So the two withdrawn tiles are replaced by two real
 * measures of the same month rather than by nothing: the switching pool with
 * its own refusal beside it, and the objection with its denominator. Both come
 * off `slideFigures`, which is to say off the numbers wave 1 already counted;
 * neither is a second measurement of anything.
 */
export function overviewTiles(data: DocumentSnapshotData): OverviewTile[] {
  const f = data.figures
  // The name to set the share against: the first competitor with a page, or,
  // for a template that prints none (the leadership brief's standing page),
  // the first one the standing page lists. A share with nothing beside it is
  // a number without a scale.
  const competitor =
    data.pages.find((p) => p.kind === 'competitor')?.meta?.name
    ?? standingParties(data.pages.find((p) => p.kind === 'standing')?.meta?.parties)[1]
  const compKey = competitor ? `${slugOf(competitor)}_share_pct` : null
  const sf = data.slideFigures ?? null
  const switching = sf?.switching ?? null
  const objection = sf?.scripted?.[0]?.objection ?? null
  return [
    // THE NOUN IS THE BASIS'S. With a monthly reading `f.conversations` is
    // "comments read in September 2026" (`documentFigures`) and the tile says
    // comments; without one it is the update's conversation count and keeps
    // the word the legacy figure has always carried. Two clocks, two nouns,
    // and lib/calibration.ts GLOSSARY fixes both.
    f.conversations && {
      value: f.conversations.value,
      label: `${data.reading ? 'comments read' : 'conversations read this update'}${f.videos ? `, on ${f.videos.value} videos` : ''}`,
    },
    f.client_share_pct && {
      value: f.client_share_pct.value,
      label: compKey && f[compKey] ? `${data.company}'s share of tracked conversation · ${competitor} ${f[compKey].value}` : `${data.company}'s share of tracked conversation`,
    },
    f.positive_pct && { value: f.positive_pct.value, label: 'positive, of the conversations judged for tone' },
    // THE POOL IS THE VALUE AND THE LEAN IS THE LABEL, which is the mock's own
    // tile read honestly: "12 · videos name a switch between brands · 7 toward
    // Sealand · 5 away". The lean carries its own "of N" because 7 of 12 and
    // 7 of 1,388 are different sentences.
    switching && {
      value: fmtInt(switching.pool),
      label: `${switching.pool === 1 ? 'video names' : 'videos name'} a switch between brands · ${fmtInt(switching.toward.k)} of ${fmtInt(switching.pool)} toward you · ${fmtInt(switching.away.k)} of ${fmtInt(switching.pool)} away`,
      verdict: switching.verdict,
      note: switching.unread,
      // The lean carries its own population, so the pair is a level.
      level: true,
    },
    // The objection, with the population it is a share of. No badge: a kind's
    // level carries no banded comparison on this corpus, and the artboard's
    // "▼ 3 pts · fading, 3rd month" is exactly the claim nothing measured.
    objection && objection.value.n > 0 && {
      value: fmtInt(objection.value.k),
      label: `of ${fmtInt(objection.value.n)} videos carry ${objection.label.toLowerCase()}`,
      level: true,
    },
  ].filter(Boolean).slice(0, 3) as OverviewTile[]
}

/**
 * Does the COVER carry the in-short summary, or does the overview slide?
 *
 * The four artboards disagree and both are right. The sales brief's cover is
 * the summary's home — a 58px title, the paragraph at 16px/1.5 under it, the
 * contents beside three tiles — while the marketing brief draws a 17px title
 * atop its In-short slide and no separate cover sheet at all (E-marketing's
 * own `mkt.p1.title`). So the predicate is the template's, stated once and
 * read by both the cover and the overview page, rather than the summary being
 * moved for everyone or drawn twice.
 */
export const coverCarriesSummary = (data: DocumentSnapshotData): boolean =>
  data.template === 'sales_brief'

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
