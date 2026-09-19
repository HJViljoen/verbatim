import { GAP_WORDS, gapBasisLine, gapLine, sidePct, type Gap } from '../../reading/gap'
import { fmtInt, round1 } from '../../format'
import { denominatorLine } from './reading'
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

/**
 * The gap tile's face: the magnitude where one was earned, the state's own
 * word where it was not. Never a magnitude beside a refusal (D2).
 *
 * AND THE WORD IS SAID ONCE. `gapLine` ends in the state's phrase and the
 * tile's own value IS that phrase, so the obvious composition printed "too few
 * to compare — you 31% of 84 · Freitag 44% of 142 · too few to compare. too
 * few to compare in August" — the same four words three times on one tile. The
 * label under a word-valued tile therefore carries the LEVELS alone, which is
 * the half of `gapLine` that still says something, and the earlier reading is
 * printed only where it CONCLUDED something: a second refusal beside the first
 * is a sentence about our bookkeeping twice over.
 */
/**
 * The earlier gap, printed ONLY where it concluded something.
 *
 * `gapBasisLine` answers for every state, which is right for a caller that
 * wants the earlier reading whatever it was. A brief prints the current
 * reading's own refusal already, and a second refusal beside it ("too few to
 * compare. too few to compare in August") is a sentence about our bookkeeping
 * said twice — it tells a reader nothing about August that the line above it
 * has not told them about September.
 */
export function concludedBasisLine(gap: Gap): string | null {
  return gap.basis && (gap.basis.state === 'apart' || gap.basis.state === 'level') ? gapBasisLine(gap) : null
}

export function gapTile(gap: Gap): OverviewTile {
  const basis = concludedBasisLine(gap)
  if (gap.state === 'apart' && gap.gapPts != null) {
    return { value: `${round1(Math.abs(gap.gapPts))} pts`, label: `${gap.objectLabel} — ${gapLine(gap)}${basis ? `. ${basis}` : ''}` }
  }
  const levels = [gap.a, gap.b]
    .map((side) => {
      const pct = sidePct(side)
      return side.observed && pct != null
        ? `${side.label} ${round1(pct)}% of ${fmtInt(side.value.n)}`
        : `${side.label} — not tracked`
    })
    .join(' · ')
  return { value: GAP_WORDS[gap.state], label: `${gap.objectLabel} — ${levels}${basis ? `. ${basis}` : ''}`, word: true }
}

/**
 * One measurement's identity: the object, the audience it is a proportion of,
 * what it counts and the window it covers.
 *
 * NOT THE OBJECT ALONE. `CountedOver.measure` exists because two readings of
 * one object are two statements — a rival's cut of the panel's videos and its
 * cut of the panel's comments are both true and neither is a duplicate of the
 * other — so the key carries it, exactly as the record does.
 */
const measurementKey = (v: Verdict) =>
  [v.objectKind, v.objectId, v.audience, v.countedOver?.measure ?? 'videos', v.window.from, v.window.to].join('|')

/** What two readings of ONE measurement have to agree on to be the same
 *  reading: both sides' counts, the change and the band. */
const readingSignature = (v: Verdict) =>
  [v.value.k, v.value.n, v.changePts, v.bandPts, v.state].join('|')

/**
 * The verdict a brief leads with: the largest banded MOVE, and only a move.
 *
 * A tile is the most prominent thing on the first sheet, so it states a
 * conclusion or it states nothing — `no_clear_change` and `too_little_data`
 * are real answers on a row of a table and are not a headline. Ties break on
 * the larger n, so the one measured on more videos wins.
 *
 * BY MEASUREMENT, AND A DISAGREEMENT IS REFUSED (fix pass). A brief merges the
 * verdicts of every surface it borrows, and two surfaces can publish a verdict
 * for the same object over the same window — `overview.subjects` and
 * `subjects.line` both read a subject's category share. Taking the MAXIMUM
 * `changePts` across the merged list meant that where two readings of one
 * measurement differed, the LOUDER one won the most prominent tile on the
 * brief, over a sheet whose table prints the other. Measured on this package's
 * own fixture: "▲ 5.5 pts · Durability — 24.5%, 340 of 1,388" one line under a
 * paragraph reading "22% of its videos".
 *
 * On production the two surfaces should agree, and where they do this collapses
 * them to one reading and changes nothing. Where they do not, the brief cannot
 * tell which is the month's — so it leads with neither, and the next
 * measurement takes the tile. A refusal is a real answer; picking the bigger
 * number is not.
 */
export function leadVerdict(verdicts: readonly Verdict[] | undefined): Verdict | null {
  const moved = (verdicts ?? []).filter((v) => v.state === 'moved' && v.changePts != null && v.bandPts != null)
  const byMeasurement = new Map<string, Verdict[]>()
  for (const v of moved) {
    const key = measurementKey(v)
    byMeasurement.set(key, [...(byMeasurement.get(key) ?? []), v])
  }
  const agreed = [...byMeasurement.values()]
    .filter((group) => new Set(group.map(readingSignature)).size === 1)
    .map((group) => group[0])
  return agreed.sort((a, b) => Math.abs(b.changePts!) - Math.abs(a.changePts!) || b.value.n - a.value.n)[0] ?? null
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
 * WITHOUT A MONTHLY READING these are the update's: conversations read, share
 * of tracked conversation (paired with the first competitor when there is
 * one), positive of judged. A number the run could not measure is simply
 * absent, and nothing on this branch changed.
 *
 * WITH ONE, `documentFigures` withdraws two of those three upstream —
 * `client_share_pct` and `positive_pct` are set only on the no-reading branch,
 * because a share of one run's tracked videos is not a reading of a month — so
 * the sheet printed a SINGLE tile, measured on the populated fixture and on
 * production. E-sales and E-marketing each fixed that and each chose a
 * different three; BOTH SETS ARE KEPT AND THE ORDER DECIDES (merge, Block D
 * wave 2), because each of the four is a real measure of the same month:
 *
 *   1. the lead GAP (E-marketing) — `gapTile`, the magnitude where one was
 *      earned and the state's own word where it was not;
 *   2. the lead banded CHANGE (E-marketing) — `verdictTile`, with no direction
 *      word, which `directionWord` alone may fill;
 *   3. the SWITCHING pool with its own refusal beside it (E-sales);
 *   4. the leading OBJECTION with the population it is a share of (E-sales).
 *
 * The first two of whichever of those four the month actually earned are
 * printed, and the third tile is always the BASIS — the comments the month was
 * read on, which is the one number the others are shares of. So a month that
 * concluded a gap and a change prints E-marketing's three; a month that
 * concluded neither prints E-sales's, instead of falling back to one tile.
 *
 * THE LABEL SAID "THIS UPDATE" OVER A MONTH'S NUMBER. `f.conversations` has
 * been the month's comments since WP19 and the tile went on calling them "read
 * this update", on the first sheet a reader meets. Same class as AGENTS.md's
 * "a page once claimed no email is sent while Resend sent".
 *
 * The attention index the artboard draws as its third is refused: it is a
 * movement claim over a comment count under a fixed panel, which has no
 * denominator and therefore no band (D7).
 */
/**
 * What a KIND's denominator is, in the reader's words.
 *
 * `month_kind_readings` counts every kind over the category audience's videos
 * for ONE month, so the population is the category's month and nothing else —
 * never the whole reading's video count, which is what a brief's footers and
 * its method card print. Where the reading names the category the label is the
 * reading's own; otherwise the audience's standing name.
 */
function objectionPopulation(r: DocumentSnapshotData['reading']): string {
  const category = r?.denominators.find((d) => d.audience === 'industry-other') ?? null
  const label = category?.label ?? 'the category'
  return r ? `videos in ${label} in ${r.monthLabel}` : `videos in ${label}\u2019s month`
}

export function overviewTiles(data: DocumentSnapshotData): OverviewTile[] {
  const f = data.figures
  const r = data.reading
  const sf = data.slideFigures ?? null
  const switching = sf?.switching ?? null
  const objection = sf?.scripted?.[0]?.objection ?? null
  // THE POOL IS THE VALUE AND THE LEAN IS THE LABEL, which is the mock's own
  // tile read honestly: "12 · videos name a switch between brands · 7 toward
  // Sealand · 5 away". The lean carries its own "of N" because 7 of 12 and
  // 7 of 1,388 are different sentences.
  // AND THE BASIS AND THE AUDIENCE TRAVEL WITH IT (fix pass).
  // `SwitchingFigure.basis` is declared "Printed beside it, never omitted"
  // (figures.ts) and `audience` is CLIENT_AUDIENCE — the brand's OWN posts — so
  // a tile that printed neither put a count of videos "naming a switch between
  // brands" on the first sheet a reader meets with nothing saying whose posts
  // they are, or that this is the one figure in the package dated by the video
  // rather than by the comment. The full card prints both
  // (document-deck.tsx); the tile is the more prominent of the two and was the
  // one that dropped them.
  const switchingTile: OverviewTile | null = switching
    ? {
        value: fmtInt(switching.pool),
        label: `${switching.pool === 1 ? 'video names' : 'videos name'} a switch between brands · ${fmtInt(switching.toward.k)} of ${fmtInt(switching.pool)} toward you · ${fmtInt(switching.away.k)} of ${fmtInt(switching.pool)} away · counted in ${switching.audienceLabel}, ${switching.basis}`,
        verdict: switching.verdict,
        note: switching.unread,
        // The lean carries its own population, so the pair is a level.
        level: true,
      }
    : null
  // The objection, with the population it is a share of. No badge: a kind's
  // level carries no banded comparison on this corpus, and the artboard's
  // "▼ 3 pts · fading, 3rd month" is exactly the claim nothing measured.
  //
  // AND THE POPULATION IS NAMED, NOT IMPLIED (fix pass). An objection is a
  // KIND, counted by `month_kind_readings` over ONE denominator — the CATEGORY
  // audience's videos in the month this brief reads — and the label emitted
  // the integer alone: "28 · of 205 videos carry pushing back", on a sheet
  // whose own footer says "1,388 videos in the category". A reader could
  // compute 13.7% or 2.0% and had nothing anywhere in the document to choose
  // between them, which defeats the "of N" rule from inside it. The crosscheck
  // line already states the rule in as many words ("Two populations, two
  // denominators — read them side by side"); this is the tile that states it
  // first saying which one it is.
  const objectionTile: OverviewTile | null = objection && objection.value.n > 0
    ? {
        value: fmtInt(objection.value.k),
        label: `of ${fmtInt(objection.value.n)} ${objectionPopulation(r)} carry ${objection.label.toLowerCase()}`,
        level: true,
      }
    : null

  if (r) {
    const gap = leadGap(r.gaps)
    const verdict = leadVerdict(r.verdicts)
    const category = r.denominators.find((d) => d.audience === 'industry-other') ?? r.denominators[0] ?? null
    const comments = r.denominators.reduce((n, d) => n + d.comments, 0)
    // THE BASIS: the comments the month was read on, which is the one number
    // the others are shares of. Off the month's own denominators.
    //
    // AND WHERE THEY ARE UNWRITTEN IT REFUSES, IT DOES NOT PRINT A ZERO (fix
    // pass). The fallback here read `f.conversations` and called it the
    // update's figure — but `documentFigures` sets `f.conversations` from
    // `commentsRead(r.denominators)` on EVERY branch where a reading exists
    // (compose.ts), so on the one path this arm is reachable on it is the
    // reading's own count, which is the zero that sent us here. The first tile
    // of the first sheet of a brief read "0 · comments read", with no month
    // named and nothing saying the month had not been read — a zero standing
    // in for a refusal, on the sheet a client meets first. Reachable now:
    // `denominatorsOf` answers `[]` whenever `record.coverage` is null or
    // empty, which is a fresh database, a `loadRecordInputs` that threw, and
    // any window wider than one month. The refusal is set as a WORD, for the
    // same reason `gapTile`'s is (mock-gap §6 D2): a refusal typeset as a
    // numeral reads as a measurement.
    const basis: OverviewTile | null = comments > 0
      ? {
          value: fmtInt(comments),
          label: `comments read in ${r.monthLabel}${category ? `, on ${fmtInt(category.videos)} videos in ${category.label}` : ''}`,
        }
      : {
          value: 'not read yet',
          label: `${r.monthLabel} — ${denominatorLine(r.denominators)} Nothing on this sheet is a share of a counted population until it is.`,
          word: true,
        }
    // The order is the merge's decision — see the header. A concluded gap and
    // a banded change lead where the month earned them; the basis follows;
    // E-sales's two measures fill whatever is left.
    return [gap ? gapTile(gap) : null, verdict ? verdictTile(verdict) : null, basis, switchingTile, objectionTile]
      .filter(Boolean)
      .slice(0, 3) as OverviewTile[]
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
    // THE NOUN IS THE BASIS'S. Without a reading `f.conversations` is the
    // update's conversation count and keeps the word the legacy figure has
    // always carried (lib/calibration.ts GLOSSARY).
    f.conversations && {
      value: f.conversations.value,
      label: `conversations read this update${f.videos ? `, on ${f.videos.value} videos` : ''}`,
    },
    f.client_share_pct && {
      value: f.client_share_pct.value,
      label: compKey && f[compKey] ? `${data.company}'s share of tracked conversation · ${competitor} ${f[compKey].value}` : `${data.company}'s share of tracked conversation`,
    },
    f.positive_pct && { value: f.positive_pct.value, label: 'positive, of the conversations judged for tone' },
    switchingTile,
    objectionTile,
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

/**
 * Each finding as the overview sheet indexes it: the headline and the evidence
 * behind it, in page order.
 *
 * WHY THE EVIDENCE TRAVELS WITH THE HEADLINE. The sales artboard moved the
 * summary, the contents and the three tiles onto the cover, which left the
 * overview sheet holding a numbered list of sentences and one box — on a
 * workspace with one finding, a 1123 × 631 sheet of a paid PDF about 85% of
 * which was nothing. The list is worth having and is not the cover's (the
 * cover indexes PAGES, this indexes the argument), so what it was missing is
 * what makes it an index rather than a restatement: how much each finding
 * rests on, how sure we are of it, and whose conversation it was read in.
 * Every field is already on the page's own meta and is already printed on the
 * finding sheet itself — none of it is computed twice or measured again here.
 */
export interface FindingCard {
  /** The finding page's id, so a caller can find its sheet number. */
  id: string
  headline: string
  /** The conversations the finding was calibrated on, and the strands of
   *  research behind it — `FindingPage`'s own two counts. */
  conversations: number
  strands: number
  /** The packed audience list, for `audiencePills`. */
  audiences: string
  /** `solid | reasonable | thin` — the finding's own calibrated word. */
  sure: string
}

export function findingCards(data: DocumentSnapshotData): FindingCard[] {
  return data.pages
    .filter((p) => p.kind === 'finding')
    .map((p) => ({
      id: p.id,
      headline: p.blocks.find((b) => b.field === 'headline')?.text ?? '',
      conversations: Number(p.meta?.conversations ?? 0),
      strands: Number(p.meta?.strands ?? 0),
      audiences: p.meta?.audiences ?? '',
      sure: p.meta?.sure ?? 'thin',
    }))
    .filter((c) => c.headline)
}

/** The finding headlines, in page order — from the finding pages themselves,
 *  never the overview's own written-once list, so an edited headline shows.
 *  The email reads this and the paper reads `findingCards`, and they are one
 *  walk, so the two cannot come to list different findings. */
export function findingHeadlines(data: DocumentSnapshotData): string[] {
  return findingCards(data).map((c) => c.headline)
}

/** The in-short paragraph, still carrying its [[key]] placeholders. */
export function inShortSummary(data: DocumentSnapshotData): string {
  const page = data.pages.find((p) => p.kind === 'in_short')
  return page?.blocks.find((b) => b.field === 'summary')?.text ?? ''
}
