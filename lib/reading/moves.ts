import { PASS_A_MIN_COMMENTS_DEFAULT } from '../config'
import { fmtInt, longMonth, shortDate } from '../format'
import { monthChange } from './bands'
import { monthStartOf, nextMonth } from './month-key'
import type { Counted, FigureTable, Verdict, VerdictWindow } from './verdicts'
import type { DeclareMoveInput } from '../subjects/moves'

// What a move proposes, and what a move did (Phase 1 Block D, package D2).
//
// TWO SHAPES, AND THEY ARE NOT THE SAME KIND OF STATEMENT.
//
// `MoveCandidate` is a PROPOSAL. It counts what the client published this
// month — posts, the ones that drew comment above the floor, the claims made on
// them, the hook split, the subjects they matched — and every one of those is a
// count of the client's OWN acts with its own denominator. Nothing on the card
// is a reading of the conversation and nothing on it is a direction word. The
// one thing on it that IS a reading (`movement`) is two `Verdict`s side by
// side, yours and the category's, each carrying its own k, n and band, because
// a magnitude and a band travel together or neither (mock-gap D2).
//
// `MoveReading` is the ONE movement claim a move earns: the target object's
// monthly series on the client side, the last complete month BEFORE the
// declaration against the latest month after it, banded — plus the same
// comparison on the audiences the move did not touch, as a control. It never
// carries a direction word: `initiatives` is false in `directionWordsFor`, and
// a direction is earned by `directionWord` over three consecutive readings in
// one regime, never by one comparison.
//
// WHY MONTH-AGAINST-MONTH AND NOT A POOLED BEFORE/AFTER. Denominators do not
// add (AGENTS.md, +38.7% surplus measured over twelve months), so "the two
// months since" cannot be summed into one side of a proportion. A window read
// that spans months is `window_denominators` / `window_theme_readings`, which
// this shape is not handed. So the comparison is two SINGLE months, each with
// its own n — the last readable month before the line the client drew, and the
// latest readable month after it — and the verdict says which two it read.
//
// AND THE DECLARATION MONTH BELONGS TO NEITHER SIDE. `firstScoringMonth`
// (lib/pages/overview.ts) already states the rule: the month a move is declared
// in is part-filled at declaration, so it is neither a clean before nor a clean
// after. It is drawn on the chart and it is not compared.

/** How many comments a post must have drawn to be read at all. The platform
 *  floor Pass A applies (`lib/config.ts` `passAMinComments`), taken at its
 *  default because the card counts a client's posts across platforms and a
 *  per-platform floor on one card would make "3 of 9" a figure about our
 *  gather plan rather than about the posts. A caller with one platform in
 *  hand may pass its own. */
export const CARD_COMMENT_FLOOR = PASS_A_MIN_COMMENTS_DEFAULT

/** One counted row of the pre-filled card. `basis` is printed beside it. */
export interface CardCount {
  label: string
  value: Counted
  /** 'posts published in September' — the population, in the reader's words. */
  basis: string
}

/** One claim the client made on its own posts this month, and how many of
 *  those posts carried it.
 *
 *  ADDITIVE TO THE PINNED SHAPE, and named here because the brief's
 *  `claimTopics: string[]` cannot carry the mock's per-claim count
 *  ("Built to last a decade" · 3 posts). The claim TEXT is the client's own
 *  words lifted off its own transcript, so a surface prints it as a quotation
 *  and never inside scrubbed prose — several real claims carry a digit
 *  ("Made from 100% recycled sails") and rule (a) may not police a quotation. */
export interface CardClaim {
  claim: string
  posts: Counted
}

export interface MoveCandidate {
  month: string
  /** Posts you published this month, and how many drew comment above the floor. */
  posts: CardCount
  overFloor: CardCount
  commentFloor: number
  /** Claims made on your own posts this month (video_claims → your videos). */
  claims: CardCount
  claimTopics: string[]
  /** The same claims with the posts each was made on — see `CardClaim`. */
  claimRows: CardClaim[]
  /** The hook split of those posts. */
  hooks: CardCount[]
  /**
   * How many of the month's posts we actually READ — the denominator the
   * subject rows are a share of, and not the same number as `posts`.
   *
   * MEASURED, AND THE REASON THIS FIELD EXISTS. A subject match comes off
   * `audience_insights`, which only exist for a post Pass A analysed; Sealand
   * published 17 posts in September and none of them had been analysed on
   * 2026-09-18, and across all time 28 of its 90 own posts carry any analysis
   * at all. Denominating the subject rows on every post published would have
   * printed "0 of 17 matched Durability" about a month in which 17 posts were
   * never read — a statement about our gather cadence wearing the client's
   * noun. The share is of what was read, and `subjectsBasis` says so.
   */
  readPosts: CardCount
  /** The population the subject rows are a share of, in the reader's words. */
  subjectsBasis: string
  /** Subjects your own posts matched, by subject id — of `readPosts`. */
  subjects: { subjectId: string; label: string; matched: Counted }[]
  /** Your movement and the category's, side by side. Either may be null. */
  movement: { yours: Verdict | null; category: Verdict | null }
  /** What the confirm button would declare. Null when there is nothing to
   *  declare (no posts, or M4 not applied). */
  proposal: DeclareMoveInput | null
  /** Why the card cannot be pre-filled, in the reader's words. Null when it can. */
  unread: string | null
}

export interface MoveCandidateInput {
  month: string
  clientVideos: readonly { id: string; upload_date: string | null; comments_count: number; hook_style: string | null; classified_type: string | null }[]
  claims: readonly { source_video_id: string; claim: string; entity: string }[]
  membership: readonly { subjectId: string; label: string; videoIds: readonly string[] }[]
  yours: Verdict | null
  category: Verdict | null
  commentFloor?: number
  /** How many of the month's posts were analysed — the posts a subject match
   *  could possibly have come off. Omitted, every post counts, which is right
   *  only for a caller that knows they were all read. */
  readPosts?: number
  /** False where `moves` (M4) is not applied here: the card still counts, and
   *  there is nothing to declare it as. */
  declarable?: boolean
}

/** Said on the card when M4 is not applied — the same fact `MOVES_UNLOCK`
 *  states on the block, in the card's own words. */
export const CARD_NOT_DECLARABLE =
  'Declared moves are not recorded for this workspace yet, so this card can be read and not yet confirmed.'

/** Said when the month carries none of your own posts. Not the same fact as
 *  "we did not read them": you published nothing we found. */
export const CARD_NO_POSTS = 'No posts of your own were found in this month, so there is nothing to confirm.'

/**
 * The hook a post led with, in the reader's words.
 *
 * `videos.hook_style` is the product's ten-value taxonomy, CHECKed in the
 * schema. The mock's split — "on-screen text 5 · spoken 2" — is a THIRD thing
 * the product does not hold: `analyzed_with_ocr` / `analyzed_with_transcript`
 * say how WE read a video, never where its hook was, and labelling them as a
 * hook split would put our gather plan on the client's card wearing the
 * client's noun. So the card keeps the mock's row and prints the split the
 * product actually measures.
 */
export const HOOK_LABEL: Record<string, string> = {
  question: 'a question',
  statistic: 'a statistic',
  'bold-claim': 'a bold claim',
  'personal-story': 'a personal story',
  'before-after': 'before and after',
  controversy: 'controversy',
  demonstration: 'a demonstration',
  listicle: 'a list',
  'trend-riding': 'a trend',
  'shock-value': 'shock value',
}

export const HOOK_UNCLASSIFIED = 'not classified'

const counted = (k: number, n: number): Counted => ({ k, n })

/**
 * The card, from one month of the client's own posts.
 *
 * EVERY ROW IS k OF n AND THE n IS THE SAME ONE. "9 posts published in
 * September" is the population; "3 cleared the comment floor", "5 carried a
 * claim", each hook row and each subject row are shares of it. That is what
 * stops a reader summing the hook rows into something, and it is why `basis`
 * is a field rather than a caption a surface writes twice.
 *
 * THE POSTS ARE DATED BY THE POST. `videos.upload_date` is the day the client
 * published, which is the client's own clock and is what a card about what you
 * did has to be dated by — not by the comments underneath it and not by the
 * run. `basis` says so in the reader's words, every time.
 */
export function buildMoveCandidate(input: MoveCandidateInput): MoveCandidate {
  const month = monthStartOf(input.month)
  const floor = input.commentFloor ?? CARD_COMMENT_FLOOR
  const basis = `posts published in ${longMonth(month)}`
  const inMonth = input.clientVideos.filter((v) => v.upload_date != null && monthStartOf(v.upload_date) === month)
  const n = inMonth.length
  const ids = new Set(inMonth.map((v) => v.id))

  const overFloor = inMonth.filter((v) => (v.comments_count ?? 0) >= floor).length

  // ONLY THE CLIENT'S OWN VOICE. `video_claims.entity` is 'client' or
  // 'competitor' on the same table; a competitor's claim on a competitor's
  // video is not something you said, and the id filter alone would not catch
  // one filed against a video of yours.
  const mine = input.claims.filter((c) => c.entity === 'client' && ids.has(c.source_video_id))
  const postsByClaim = new Map<string, Set<string>>()
  for (const c of mine) {
    const claim = c.claim.trim()
    if (!claim) continue
    const set = postsByClaim.get(claim) ?? new Set<string>()
    set.add(c.source_video_id)
    postsByClaim.set(claim, set)
  }
  const claimRows: CardClaim[] = [...postsByClaim.entries()]
    .map(([claim, posts]) => ({ claim, posts: counted(posts.size, n) }))
    .sort((a, b) => b.posts.k - a.posts.k || a.claim.localeCompare(b.claim))
  const postsWithAClaim = new Set(mine.map((c) => c.source_video_id))

  const byHook = new Map<string, number>()
  for (const v of inMonth) {
    const key = v.hook_style ?? ''
    byHook.set(key, (byHook.get(key) ?? 0) + 1)
  }
  const hooks: CardCount[] = [...byHook.entries()]
    .map(([key, k]) => ({
      label: key ? HOOK_LABEL[key] ?? key : HOOK_UNCLASSIFIED,
      value: counted(k, n),
      basis,
    }))
    .sort((a, b) => b.value.k - a.value.k || a.label.localeCompare(b.label))

  // THE SUBJECT ROWS DENOMINATE ON WHAT WAS READ, not on what was published —
  // see `MoveCandidate.readPosts`. `Math.min` because a caller's count of read
  // posts is about the same month and may not exceed it.
  const read = Math.min(input.readPosts ?? n, n)
  const subjectsBasis = read === n ? basis : `posts of yours we read in ${longMonth(month)}`
  const subjects = input.membership
    .map((m) => ({
      subjectId: m.subjectId,
      label: m.label,
      matched: counted(new Set([...m.videoIds].filter((id) => ids.has(id))).size, read),
    }))
    .filter((s) => s.matched.k > 0)
    .sort((a, b) => b.matched.k - a.matched.k || a.label.localeCompare(b.label))

  const declarable = input.declarable ?? true
  const top = subjects[0] ?? null
  // WHAT THE BUTTON WOULD DECLARE, and why it is a SUBJECT move. `moves` takes
  // exactly one target matching its kind (`moves_one_target`), and the only
  // target a month of posts names by itself is the subject those posts matched
  // most. With no subject matched there is nothing the database would accept,
  // so the proposal is null and the card still counts.
  const proposal: DeclareMoveInput | null =
    !declarable || n === 0 || !top
      ? null
      : { kind: 'subject', subjectId: top.subjectId, title: `What you published in ${longMonth(month)}`, direction: 'up' }

  const unread = n === 0 ? CARD_NO_POSTS : !declarable ? CARD_NOT_DECLARABLE : null

  return {
    month,
    posts: { label: 'posts published', value: counted(n, n), basis },
    overFloor: { label: 'cleared the comment floor', value: counted(overFloor, n), basis },
    commentFloor: floor,
    claims: { label: 'carried a claim of yours', value: counted(postsWithAClaim.size, n), basis },
    claimTopics: claimRows.map((c) => c.claim),
    claimRows,
    hooks,
    readPosts: { label: 'we have read', value: counted(read, n), basis },
    subjectsBasis,
    subjects,
    movement: { yours: input.yours, category: input.category },
    proposal,
    unread,
  }
}

// ---- What a move did ---------------------------------------------------------

/** One side of a move reading: the target's months for one audience. */
export interface MoveSeries {
  audience: string
  label: string
  /** Oldest first; null where the month carried no reading. */
  points: { month: string; k: number | null; n: number | null; pct: number | null }[]
  /** Whether this audience was touched by the move — the control is the rest. */
  touched: boolean
  /** The clustering each month was produced under, by month. A theme series
   *  has one; a subject series does not (membership is not a clustering) and
   *  leaves it empty, which `monthChange` reads as "no clustering to be
   *  like-for-like about". */
  regimeByMonth?: Readonly<Record<string, string | null>>
  /** True where this series has no clustering to compare — a subject. */
  noClustering?: boolean
}

export interface MoveReading {
  moveId: string
  title: string
  kind: 'subject' | 'theme' | 'advice'
  /** What the move is on, in the reader's words. */
  on: string
  declaredAt: string
  /** The client side, then every control audience, then the rival where one
   *  is tracked for the target. */
  series: MoveSeries[]
  /** Before vs after `declared_at` on the client side, banded. The ONE
   *  movement claim a move earns. Null until both sides clear the floor. */
  verdict: Verdict | null
  /** The same comparison on the untouched audiences — what would have moved
   *  anyway. Empty where no control cleared the floor. */
  control: Verdict[]
  /** What the row prints as its figures. */
  figures: FigureTable
  /** The months the reading spans, for the axis of a chart that cannot say
   *  a direction. */
  months: string[]
  /** "declared 12 Aug · read against the two months since" — the footer. */
  line: string
  /**
   * Why a line may not be DRAWN over this reading, or null when it may.
   *
   * A CHART IS A DIRECTION CLAIM TOO (AGENTS.md), and two readings drawn as a
   * line make one. `monthlyLineLabel` (lib/pages/overview.ts) is the built
   * answer on OV2 — it refuses below three readings and names the months
   * instead — and a move's chart is the same picture over the same kind of
   * series, so it gets the same refusal rather than a second opinion. Wave 2
   * prints this string where the mock draws the line.
   */
  chartNote: string | null
  /** Why there is no verdict, when there is none. */
  unread: string | null
}

export interface MoveReadingInput {
  move: { id: string; title: string; kind: 'subject' | 'theme' | 'advice'; declared_at: string; subject_id: string | null; registry_ids: string[] | null; lineage_id: string | null }
  series: readonly MoveSeries[]
  window: VerdictWindow
  /** The target's name, where the caller holds one — a subject's name, a
   *  theme's label. Additive and optional: `readMove` says "on a subject"
   *  without it, which is true and thin, and "on the subject Durability" with
   *  it, which is what the artboard's chip prints. */
  targetLabel?: string | null
}

/** What a move is on, in the reader's words — the shape `moveTargetLabel`
 *  (lib/pages/market-surface.ts) writes for the ledger row, restated here
 *  because the reading layer may not import a page. */
function targetPhrase(input: MoveReadingInput): string {
  const label = input.targetLabel?.trim() || null
  if (input.move.kind === 'subject') return label ? `on the subject ${label}` : 'on a subject'
  if (input.move.kind === 'theme') {
    const count = input.move.registry_ids?.length ?? 0
    if (label && count <= 1) return `on the theme ${label}`
    return count > 1 ? `on ${fmtInt(count)} themes` : 'on a theme'
  }
  return 'on a piece of advice'
}

const readable = (p: MoveSeries['points'][number]): boolean => p.k != null && p.n != null && p.n > 0

/** The two months a side is read on: the last readable month strictly BEFORE
 *  the declaration month, and the latest readable month at or after the month
 *  AFTER it. The declaration month itself belongs to neither. */
function sides(series: MoveSeries, declaredMonth: string): { before: MoveSeries['points'][number] | null; after: MoveSeries['points'][number] | null } {
  const from = nextMonth(declaredMonth)
  const before = [...series.points].filter((p) => readable(p) && p.month < declaredMonth).pop() ?? null
  const after = [...series.points].filter((p) => readable(p) && p.month >= from).pop() ?? null
  return { before, after }
}

function pointFor(series: MoveSeries, p: MoveSeries['points'][number]) {
  return {
    month: p.month,
    videos: p.n,
    k: p.k,
    audience: series.audience,
    ...(series.noClustering ? { regime: 'n/a' as const } : { clusteringKey: series.regimeByMonth?.[p.month] ?? null }),
  }
}

function sideVerdict(
  series: MoveSeries,
  declaredMonth: string,
  object: { kind: 'subject' | 'theme' | 'advice'; id: string; label: string },
): Verdict | null {
  const { before, after } = sides(series, declaredMonth)
  if (!before || !after) return null
  return monthChange({
    // A move on advice is measured on the subject or themes the advice was
    // about; there is no `advice` object kind and there must not be one — a
    // Verdict's objectKind names what was COUNTED, and nothing counts a
    // recommendation. `subject` is what such a reading is a reading of.
    object: { kind: object.kind === 'advice' ? 'subject' : object.kind, id: object.id, label: object.label },
    audience: series.audience,
    curr: pointFor(series, after),
    prev: pointFor(series, before),
  })
}

/** How many complete months after the declaration month carry a reading. */
function monthsSince(series: MoveSeries | null, declaredMonth: string): number {
  if (!series) return 0
  const from = nextMonth(declaredMonth)
  return series.points.filter((p) => readable(p) && p.month >= from).length
}

/** Three readings or it is not a line. Mirrors `monthlyLineLabel`'s rule and
 *  its wording; a second threshold for one picture is how two surfaces come to
 *  draw the same two points two ways. */
export function moveChartNote(series: MoveSeries | null): string | null {
  const read = (series?.points ?? []).filter(readable).map((p) => p.month)
  if (read.length >= DRAWABLE_READINGS) return null
  if (read.length === 0) return 'no month reads'
  const short = (m: string) => SHORT_MONTHS[Number(m.slice(5, 7)) - 1] ?? m.slice(0, 7)
  return read.length === 1 ? `${short(read[0])} only` : `${short(read[0])} → ${short(read[read.length - 1])} only`
}

/** Readings a line needs behind it before it is a line — `DIRECTION_RUN`'s
 *  three, and `monthlyLineLabel`'s. */
export const DRAWABLE_READINGS = 3

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const countWord = (n: number): string =>
  n === 1 ? 'the one month since' : n === 0 ? 'no complete month since' : `the ${fmtInt(n)} months since`

/** Said when the client side has no month on one or other side of the line. */
export const MOVE_TOO_YOUNG = 'One monthly reading so far — the first comparison lands with the month after this one.'
export const MOVE_NO_CLIENT_SERIES = 'Your own side carries no reading for this move yet.'
/** A move on a piece of advice names no countable object — a recommendation is
 *  not a thing the corpus can be counted for — so there is no series to read
 *  until the advice is expressed as a subject or some themes. */
export const MOVE_NO_TARGET_SERIES =
  'This one is on a piece of advice, which names nothing the conversation can be counted for, so there is no line to read yet.'

/**
 * What a move did — the one movement claim a move earns.
 *
 * `verdict` is the client side and nothing else. `control` is the same
 * comparison on every audience the move did not touch, printed BESIDE it and
 * never subtracted from it: `MOVE_PROMISE` is "we never claim you caused it",
 * and a synthetic control differenced into one figure is the strongest causal
 * claim a page can make (mock-gap D8). Two numbers side by side is a reader's
 * judgement; one number is ours.
 */
export function readMove(input: MoveReadingInput): MoveReading {
  const declaredMonth = monthStartOf(input.move.declared_at.slice(0, 10))
  const objectId = input.move.subject_id ?? input.move.registry_ids?.[0] ?? input.move.lineage_id ?? input.move.id
  const objectLabel = input.targetLabel?.trim() || input.move.title
  const object = { kind: input.move.kind, id: objectId, label: objectLabel }

  const touched = input.series.find((s) => s.touched) ?? null
  const verdict = touched ? sideVerdict(touched, declaredMonth, object) : null
  const control = input.series
    .filter((s) => !s.touched)
    .map((s) => sideVerdict(s, declaredMonth, object))
    .filter((v): v is Verdict => v != null)

  const months = [...new Set(input.series.flatMap((s) => s.points.map((p) => p.month)))].sort()
  const since = monthsSince(touched, declaredMonth)

  const figures: FigureTable = {}
  if (verdict) {
    const pct = (side: Counted) => (side.n > 0 ? Math.round((side.k / side.n) * 1000) / 10 : 0)
    figures.share_now = { value: pct(verdict.value), unit: 'pct', label: 'your share this month' }
    figures.videos_now = { value: verdict.value.k, unit: 'videos', label: 'your videos on it this month' }
    figures.videos_read = { value: verdict.value.n, unit: 'videos', label: 'your videos read this month' }
    if (verdict.baseline) {
      figures.share_before = { value: pct(verdict.baseline), unit: 'pct', label: 'your share before you declared it' }
    }
    if (verdict.changePts != null) figures.change_pts = { value: verdict.changePts, unit: 'pts', label: 'the change' }
    if (verdict.bandPts != null) figures.band_pts = { value: verdict.bandPts, unit: 'pts', label: 'the band' }
  }

  const unread = verdict
    ? null
    : input.series.length === 0
      ? MOVE_NO_TARGET_SERIES
      : touched
        ? MOVE_TOO_YOUNG
        : MOVE_NO_CLIENT_SERIES

  return {
    moveId: input.move.id,
    title: input.move.title,
    kind: input.move.kind,
    on: targetPhrase(input),
    declaredAt: input.move.declared_at,
    series: [...input.series],
    verdict,
    control,
    figures,
    months,
    line: `declared ${shortDate(input.move.declared_at)} · read against ${countWord(since)}`,
    chartNote: moveChartNote(touched),
    unread,
  }
}

/**
 * The whole-ledger ratio — never a quarter.
 *
 * Mirrors `actedLine` (lib/pages/market-surface.ts) word for word, and it is a
 * second function rather than an import for the reason that file's own header
 * gives: the reading layer may not import a page. The quarter is out because
 * the denominator is every identity ever recommended and has no quarter at all
 * (mock-gap D12) — scoping the numerator to three months against an all-time
 * denominator prints a fraction of two different populations.
 */
export function actedTally(decided: number, total: number): { decided: number; of: number; line: string } {
  const line =
    total === 0
      ? 'Nothing has been recommended yet.'
      : `You have acted on ${fmtInt(decided)} of ${fmtInt(total)} — every piece of advice this product has ever given you.`
  return { decided, of: total, line }
}
