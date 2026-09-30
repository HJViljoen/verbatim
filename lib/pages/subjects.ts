import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, mapWithLimit, MULTI_ROW_IN_CHUNK, READ_CONCURRENCY } from '../chunk'
import { fmtInt, fmtPct, longMonth, monthName, platformLabel, shortDate } from '../format'
import { cleanQuote, fetchQuoteCitationsByAudience, readsAsHeroQuote, type QuoteCitation } from '../quotes'
import { citationLink } from '../evidence-cite'
import type { EvidenceSource } from '../pipeline/pass-a'
import { quoteRef } from '../renderables/quotes-freeze'
import { pickEligible, type GateOptions, type QuoteVideo } from '../quote-gate'
import { gateFor } from '../quote-context'
import { loadOwnPostSubjects, questionTouch, type QuestionTouch } from './own-post-touch'
import { ownPostFilings } from '../reading/own-posts'
import type { Quote, Scope } from '../renderables/types'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, loadTrackedRivals, rivalKey, type TrackedRival } from '../rivals'
import { audienceLabel } from '../readiness/types'
import { SHARE_BAND } from '../report-bands'
import { carriesShare, levelText } from '../reading/level'
import { directionWord, monthChange, thinMonth, type Direction, type SeriesPoint } from '../reading/bands'
import { chartMonths, DEFAULT_HORIZON, horizonWindow, HORIZON_LABEL, parseHorizon, readAxisOf, sinceStart, type Horizon } from '../reading/horizon'
import { hasHorizon, surface } from '../nav'
import { KIND_ORDER, kindChange, kindShares, redditRead, type KindShare, type RedditRead } from '../reading/kinds'
import {
  followersLine,
  ownCensusWithClaims,
  type ClaimEcho,
  type OwnPostCensus,
  type OwnPostInput,
} from '../reading/own-posts'
import { claimCounts, claimVerdictFor, ledgerRows, type ClaimCounts } from '../market-tiles'
import { loadClaimEchoes } from './claim-echo'
import type { SayVsHearEntry } from '../pipeline/schemas'
import { freezeBoundary, freezeStateFor } from '../reading/monthly'
import { daysInMonth, MONTH_PARAM, READING_SWITCH_FRACTION, readingAnchor, scheduledUpdateAfter, type ReadingMonth } from '../reading/reading-month'
import { loadDeliveredRuns, loadReadingSchedule, marketRivalAudiences, readingViewFrom, type OtherMonth } from '../reading/reading-view'
import { monthStartOf, nextMonth } from '../reading/month-key'
import { gapBetween, type Gap, type GapSide } from '../reading/gap'
import { loadChanges, loadMonthSeries, loadPairRows, type ReadingHandle } from '../reading/read'
import { loadAppPairOn, ourChangesWithoutGatherFlags } from '../reading/gather-flags'
import { joins, nextComparablePair, pairOnVerdict } from '../reading/comparability'
import { pairChipWords } from '../calibration'
import { pairTools, refusedSteps, type PairOn } from '../reading/pairs'
import type { MethodLines } from '../reading/method'
import { pointsByMonth, type MonthLabel, type MonthPoint, type MonthSeries, type Substrate } from '../reading/series'
import type { MonthStatus } from '../reading/types'
import type { FigureTable, RefusedReason, Verdict } from '../reading/verdicts'
import {
  isMissingSubjects,
  TABLE_SUBJECTS,
  TABLE_SUBJECT_MEMBERSHIPS,
  TABLE_MOVES,
  type Move,
  type Subject,
} from '../subjects/types'
import {
  CALIBRATION_WORDS,
  readCalibration,
  subjectCalibration,
  type StoredCalibration,
} from '../subjects/calibration-state'
import { marketAudiences, pooledDenominators, pooledSide, type MarketCount } from '../reading/market'
import {
  monthsWrittenAt,
  subjectBackRead,
  subjectCountedFrom,
  subjectReadIn,
  NO_READING_YET,
  unreadWords,
  withoutUnreadMonths,
  type CountedSubject,
} from '../subjects/read-in'
import { selectAll } from '../supabase-admin'
import { segmentRulesEnabled } from '../segments/rules'
import { marketKindLabel, marketLevel } from './overview-market/kinds'
import type { FoundSplit } from './overview-market/provenance'
import { loadKeywordRuns, loadSubjectFound } from './subjects-found'
import { accountKey } from './overview-market/voices'
import { fetchRunningRunIds } from './latest-video-run'
import { fetchThemedRunId } from './themed-run'
import { captionOurChanges } from './change-caveats'
import { loadWeekStrip, weekStripFor, type WeekStrip } from './overview-market/weeks'
import { weekLineConfigFor } from '../week-line-config'

// Subjects — "how are we seen on this subject?" (Phase 1 WP12, design §3
// SU1–SU3, the mock's Subjects.dc.html).
//
// THE PAGE IS ONE SUBJECT AT A TIME. SU1 is the rail: every subject the tenant
// named, where it came from, the day it was named, and the sentence that makes
// the whole model legible — renaming or adding one starts a NEW line and the
// old line is kept. SU2 is the selected subject in full: you, each rival and
// the category as monthly lines, the kinds of thing said in each audience, six
// voices, and the two things a reader can DO about it (Track this, Ask about
// this). SU3 is the gap: questions the category asks on this subject that your
// own posts have never answered.
//
// EVERYTHING COUNTED COMES OFF THE STORED MONTHS. `month_subject_readings`
// through `loadMonthSeries` (WP12 attached the table to it) — never a
// recomputation and never a run. M4 is authored and NOT applied, so on
// production today every one of those reads answers `numeratorSubstrate:
// 'missing'` and this page says what is not recorded yet, in words, rather
// than drawing an axis of hollow months for a table that does not exist.
//
// AND ONE THING IT WILL NOT PRINT. SU3's counts are taken from the CURRENT
// analysis — which videos carry a question insight on this subject — while
// every other number on the page is comment-dated. Those two are not two ends
// of one fraction, so SU3 prints counts and the population it counted in, and
// no share and no change badge. The design's example sentence is a share; the
// smallest correct alternative is the sentence without it (see UNANSWERED_BASIS).

/** How many subjects the rail shows before it scrolls. The set is 5-8 by
 *  design (SUBJECTS_MAX), so this is a guard against a tenant that grew past
 *  the editor rather than a page decision. */
export const RAIL_MAX = 12

/** Voices on the selected subject (the mock: "6 shown"). */
export const VOICES_SHOWN = 6

/** …and at most this many from any one audience, so the three sides are all
 *  heard. The design asks for "up to six quotes per audience" and the mock
 *  draws six in total, mixed — one under your post, one under a rival's, one
 *  under a category video. Six per audience is eighteen quotes on one page and
 *  the page is a reading, not an archive; a round-robin over the audiences
 *  keeps the mock's six AND the design's guarantee that no audience is
 *  silenced by another's volume. */
export const VOICES_PER_AUDIENCE = 3

/**
 * How much of a subject's evidence the six voices are drawn from.
 *
 * A COST DECISION, AND THEREFORE SAID OUT LOUD. Every citation on a member
 * insight is read to find six quotable ones, and one insight can carry a
 * hundred; a subject that is a third of Össur's corpus would mean thousands of
 * insights and tens of thousands of evidence rows for six quotes on one tile.
 * So the pool is capped — and where the cap bites, the block stops printing a
 * denominator it did not count ("6 of 41") and says it is a sample instead.
 * SU3's counts are NOT capped: a count printed as the whole must be the whole.
 */
export const VOICES_POOL_INSIGHTS = 400
export const VOICES_POOL_CITATIONS = 400

/** Rows SU3 lists. The mock draws three. */
/** Claims the rail's say-vs-hear tile lists — the mock's three, and the most a
 *  240px rail can carry without the tile becoming the page. The tally under
 *  them is the WHOLE ledger (`claimCounts`), so a reader can always see how
 *  many were not shown. */
export const SAY_HEAR_SHOWN = 3

/** One ledger claim as the Say vs hear tile prints it. */
export interface SayHearClaim {
  /** `run_summary.say_vs_hear.you_say`, Pass D-a's line for what you claimed. */
  claim: string
  state: 'echoed' | 'pushed_back' | 'silent'
  /**
   * The chip's word, Your moves' own (walkthrough item 8): the claim counted in
   * the market by `loadClaimEchoes`, the one counting both pages read, so the
   * two cannot print "Echoed" and "Not talked about" for one claim. OPTIONAL:
   * a copy stored before it prints the state's word.
   */
  label?: string
  /** A `pushed_back` whose words ask rather than argue ("Questioned"). */
  questioned?: boolean
  /** Where the reading rests on your own followers and not on the market,
   *  that said in words (`followersLine`). */
  note?: string | null
}

/** The ledger's stance as the tile's state: the tally's own three buckets
 *  (`claimCounts`), so a row and the count under it use one rule. */
export const claimState = (audience: string): SayHearClaim['state'] =>
  audience === 'echoes' ? 'echoed' : audience === 'contradicts' ? 'pushed_back' : 'silent'

/**
 * One ledger claim as the tile prints it, off its market echo where it was
 * counted (walkthrough item 8) and off the stored stance where it was not.
 * Pure.
 */
export function sayHearClaimOf(e: Pick<SayVsHearEntry, 'you_say' | 'audience' | 'they_say'>, echo: ClaimEcho | null): SayHearClaim {
  // Not counted (the market could not be read): the stance as stored, in the
  // same words, and nothing said about whose it was.
  if (!echo || echo.state === 'not_tracked') {
    const state = claimState(e.audience)
    return { claim: e.you_say, state, ...(echo ? { label: claimVerdictFor(e.audience, e.they_say).label } : {}) }
  }
  const state: SayHearClaim['state'] = echo.state === 'echoed' ? 'echoed' : echo.state === 'pushed_back' ? 'pushed_back' : 'silent'
  return {
    claim: e.you_say,
    state,
    label: echo.label,
    ...(echo.questioned ? { questioned: true } : {}),
    note: followersLine(echo, e.audience, e.they_say),
  }
}

/** The tally over the rows as printed: the same states, so the count under
 *  the rows and the rows cannot disagree. */
export function sayHearCounts(rows: readonly SayHearClaim[]): ClaimCounts {
  return {
    total: rows.length,
    echoed: rows.filter((r) => r.state === 'echoed').length,
    pushedBack: rows.filter((r) => r.state === 'pushed_back').length,
    silent: rows.filter((r) => r.state === 'silent').length,
    questioned: rows.filter((r) => r.state === 'pushed_back' && r.questioned).length,
  }
}

export const UNANSWERED_SHOWN = 3

/** SU3's gate (design §3 SU3): fewer question videos than this on the subject
 *  and the block says so rather than ranking noise. */
export const UNANSWERED_GATE = 10

/** What SU3's counts are counted in, said once.
 *
 *  TWO STATEMENTS, NOT ONE. The counts cover the period the reader chose, and
 *  a video is placed in it by the day it was posted — which is not the date
 *  the rest of this page is read by (a month here is dated by the COMMENT).
 *  Saying only "not in a calendar month" left the first half unsaid, and a
 *  count whose period nobody states is a count a reader will assume is the
 *  one on the control. */
export const UNANSWERED_BASIS =
  'Over the period shown, each video placed by the day it was posted: counts, not shares.'

/**
 * THE READINESS OWNER IS NEVER THE CLIENT'S WORD — the vocabulary call, made
 * once, here, because three surfaces were making it separately.
 *
 * "— Verbatim engineering" is an OWNER: the name of the team a not-yet-built
 * half belongs to. It is the right fact on `/dashboard/settings/readiness`,
 * where the row it belongs to is drawn and a reader can look at it. Anywhere
 * else it is a ticket the client was handed, and it was being handed to them
 * in the APP — which is where the paying reader is, not on the PDF the two
 * `_OUTSIDE` twins were guarding.
 *
 * THE RULE (`OWN_POSTS_UNREADABLE`'s, design review nit 25, applied): the
 * in-app sentence may name the PAGE where the state is recorded — "· Settings
 * › Readiness" — and only where such a row actually exists. It never names the
 * owner. And where no row exists the sentence names NEITHER: `lib/readiness/
 * compute.ts` has no row for the claims ledger at all, so pointing a client at
 * Readiness here would send them to a page that says nothing about it.
 *
 * SO THERE IS ONE SENTENCE PER STATE, not two. The `_OUTSIDE` twins existed
 * only to strip the owner and are gone rather than left as aliases: an alias
 * is an invitation to re-add the owner on one side of it. Competitive's
 * "— not built yet · Verbatim engineering" (competitive-surface.ts) is the
 * same call and takes the same answer.
 *
 * ---- what SU3 says about the half of your posts it cannot read -------------
 *
 * A question is "answered" here when one of your own posts is ABOUT it —
 * `videos.topics`. The other half of the evidence is what those posts CLAIM
 * (`video_claims`), and no tenant may select that table until M8 (WP16): RLS
 * is on and there is not one policy, so a member's read comes back empty with
 * no error. An empty half that reads as "you never answered this" is the
 * failure this block exists to avoid, so the block says which half it read —
 * the OV4 precedent, where a side that cannot be read is named and not drawn
 * as a zero.
 */
export const UNANSWERED_CLAIMS_UNREADABLE =
  'Matched against what your posts are about; what they claim is not readable yet.'

/** Reddit's own caveat wherever a question count leans on it (design §3 SU3). */
export const REDDIT_THREAD_CAP =
  'Reddit threads are the densest source of questions and are counted; we read up to 40 comments on each.'

/**
 * Why the set cannot be ADDED TO while it cannot be READ.
 *
 * "Your subjects are not recorded for this workspace yet" is the product's
 * shared sentence for this state (Overview, the weekly and the monthly report
 * all print it) and it reads, on its own, as *you have not named any* — while
 * the tile that prints it removes the only control that would fix that. It is
 * not the client's inaction: the set cannot be read here, so a write from here
 * would fail. The tile says so where the button would have been, rather than
 * leaving an absence to be read as a task.
 */
export const SUBJECTS_UNREADABLE_WHY =
  'Nothing has been lost. We cannot read the set from this page yet, so it cannot be added to or changed here.'

/** SU1's sentence. The whole identity model in twelve words, printed where the
 *  editing happens rather than inside a help page nobody opens. */
export const SUPERSEDE_RULE = 'Renaming or adding a subject starts a new line. The old line is kept.'

// ---- the shapes ---------------------------------------------------------------

/** One side of the reading: you, one rival, or the category. */
export interface SubjectSide {
  /** The stored audience key. */
  audience: string
  /** The reader's words for it. */
  label: string
  kind: 'you' | 'rival' | 'category'
  /** The entity's colour token — never the rank's. */
  color: string
  /** This month's k and n, and the share. Null where nothing was read. */
  k: number | null
  n: number | null
  pct: number | null
  /** False where this side carries no share this month, for either reason. */
  observed: boolean
  /**
   * WHICH silence, in the page's own distinction (railNote's, one tile away).
   *
   * `not_tracked` is about the AUDIENCE: nothing was read for it at all, there
   * is no denominator, and "— not tracked" is true of it. `no_reading` is
   * about the SUBJECT: the audience was read — the denominator row proves it —
   * and this subject carried no row in it. `monthly_subject_readings` emits a
   * row only where videos > 0 (it is a group-by over matches), so a freshly
   * confirmed subject with no members in a month has no row at all, and
   * printing "— not tracked" for the client's OWN audience there is false.
   */
  silence: 'no_reading' | 'not_tracked' | null
  /** The banded month-on-month change, or null where none was drawn. */
  verdict: Verdict | null
  /** Three consecutive readings in one regime, or null. */
  direction: Direction | null
  /** The month before this one, as a level beside a level — never a change. */
  previous: { month: string; pct: number | null } | null
  /** The audience-wide kind mix this month (the mock's own denominator: every
   *  video in the audience, not the subject's). */
  kinds: KindShare[]
  /**
   * Did each of those kinds' shares move, month on month? One banded `Verdict`
   * per kind in `kinds`, keyed by the kind's enum value, null where no band
   * could be drawn.
   *
   * `kindChange` has existed since WP3 and both Overview and Voice have called
   * it since; this block drew the same rows and printed no change at all,
   * which mock-gap calls the cheapest real gap on the page. The verdicts do
   * NOT sum and nothing here adds them: a kind is an independent share of one
   * denominator (decision T), so each row carries its own "of N" and its own
   * band and there is no remainder row.
   */
  kindVerdicts: Record<string, Verdict | null>
  reddit: RedditRead | null
}

export interface SubjectRail {
  id: string
  name: string
  description: string | null
  origin: Subject['origin']
  namedAt: string
  status: Subject['status']
  /** The three states (decision C, WP1.1). A snapshot stored before them
   *  carries the two-state `'calibrating'`, which `readCalibration` reads as
   *  provisional. */
  calibration: StoredCalibration
  /** Your own side this month, as a level: what the rail printed before
   *  WP1.1, and what a snapshot stored before it still carries (rendered as
   *  sent). Null on every row the loader builds now: the rail prints the
   *  market (`market`), and your own level is the pane's "you" side, shown
   *  only for a ready subject (decision C). */
  level: { k: number; n: number; pct: number | null } | null
  /**
   * The market's side this month (decision E: the category plus the videos
   * filed under a brand you track, pooled), as a level: `pct` is null where the
   * market is under 100 videos, which prints as a count only. Printed on every
   * row that is neither failed nor proposed, with the word on a provisional
   * one (decision C: its market level always prints). Null where nothing was
   * read. Optional: a snapshot stored before WP1.1 has none.
   */
  market?: { k: number; n: number; pct: number | null } | null
  /**
   * The market's side the month before (WP2.2, the rail's second column): k
   * on the same pooled base as `market`, null where the subject was not read
   * that month. Optional: a row stored before WP2.2 has none.
   */
  marketPrev?: { k: number; n: number } | null
  /**
   * The share of this subject's market videos this month that are makers'
   * (WP2.2; MF2 `lens_readings` over the month's maker videos, by the
   * segments_v1 reader precedence), 0 to 1. Null where it was not measured:
   * no maker rule for the tenant (Össur), MF2 not applied, or a failed read.
   * Printed as a row tag at a fifth or more (decision F). Optional: a row
   * stored before WP2.2 has none.
   */
  makerShare?: number | null
  /** Why no share is shown, in the reader's words. */
  note: string | null
  /**
   * The banded month-on-month change of YOUR side of this subject — the badge
   * the mock prints on every rail row ("26 of 84 · too few to compare").
   *
   * THE SAME COMPARISON `buildSides` MAKES FOR THE SELECTED SUBJECT, on the
   * same series, under the same thin-month gate, so the rail and the pane can
   * never disagree about a subject a reader is looking at in both. On the
   * paying tenant's own audience it reads `too_little_data` on every row — 84
   * videos against a 100-video floor — which is the mock's own word for all
   * six of its rows, arrived at by measurement rather than by typing it out.
   * Null where nothing was read, where the subject is still calibrating, or
   * where the month is too thin to band anything on this page. Null on every
   * row since WP1.1, which moved the rail onto the market: a snapshot stored
   * before it keeps its badge.
   */
  verdict: Verdict | null
  selected: boolean
  href: string
}

export interface SubjectListBlock {
  rows: SubjectRail[]
  /** Subjects named but not confirmed — nothing counts them yet. */
  proposed: { id: string; name: string; because: string }[]
  rule: string
  /** Null where `subjects` is readable; a sentence where M4 is not applied. */
  notRecorded: string | null
  setLine: string
  /**
   * Whether this reader may change the set.
   *
   * THE AFFORDANCE, NOT THE GATE — the three subject writes carry
   * `canManageTenant` in lib/actions/subjects.ts, and M4's two write policies
   * key on `get_my_role()` as well as on client_id. It is on the BLOCK because
   * the block draws the controls and the page knows the role: SU1 used to rely
   * on the editor's `canEdit` defaulting to true, which is a permission flag
   * open by default, and the one thing a permission flag must not be.
   */
  canEdit: boolean
  /**
   * The market's base for the rail's two columns (WP2.2): the reading month's
   * pooled videos and the month before's, which the column heads carry
   * ("Sep of 654", "Aug of 377"). Set by the loader since WP2.2; a list stored
   * before it has none and renders as sent (the editor rail).
   */
  base?: { month: string; n: number | null; prev: { month: string; n: number | null } | null } | null
}

export interface SubjectVoice {
  quote: Quote
  cite: string
  href: string | null
  /** Which side of the conversation it came from, for the reader. */
  from: string
  /** The platform, as stored (`tiktok`), for the cite's glyph. Null where the
   *  comment behind the quote could not be dated or placed. */
  platform: string | null
  /**
   * WHERE THE WORDS WERE (WP7a/b's `insight_evidence.source`, carried through
   * for the first time).
   *
   * `comment` is somebody typing under a video; `video` is a creator SAYING it
   * on camera, and `video_text` is words printed on the frame. Those are three
   * different kinds of evidence and the mock flags the second — "Said on
   * camera" — because a creator's sentence in a transcript is not a customer's
   * comment and a reader who cannot tell them apart is reading the wrong thing.
   * The column has been scored since WP7 and only `onCameraBonus` read it.
   */
  source: EvidenceSource
  /**
   * Words printed on the same video's frame, where this quote was spoken and
   * that video also carries on-screen text. The mock's own pairing: what they
   * said, and what the video said at the same time.
   *
   * A `Quote` WITH ITS OWN REF, NEVER A BARE STRING (fix pass). This page is a
   * `PageModule`, so `/api/export` → `createSnapshot` → `freezeQuotes` runs
   * over this data; `freezeQuotes` recognises a quote STRUCTURALLY
   * (`{ ref: 'e:…', text }`, lib/renderables/quotes-freeze.ts) and walks a bare
   * string straight past. Carried as a string these words froze into
   * `report_snapshots.data` AS WORDS and their evidence id never reached
   * `evidence_ids`, so an erasure could not find them and a `/r/<token>` page
   * re-served them out of the stored copy. AGENTS.md is categorical: exports
   * and reports freeze numbers, never words — and a `video_text` row is a
   * third party's frame exactly as an `e:` comment excerpt is.
   */
  onScreen: Quote | null
  /** The comment's likes, where it has any (WP2.2, the preview's cite). A
   *  tie-break is never the selection rule: the order is the evidence's own
   *  rank. Optional: a voice stored before WP2.2 has none. */
  likes?: number | null
  /** The video behind it is a maker's, by the reader precedence (MF1
   *  `segments_for_videos`), so the cite marks it (decision F: makers stay in,
   *  and are marked). Optional: absent where the segment was not read. */
  maker?: boolean
}

export interface UnansweredRow {
  id: string
  label: string
  /** Non-owned videos that asked it. */
  videos: number
  /** Of those, Reddit threads. */
  reddit: number
  /** True where one of your own posts touches it. */
  answered: boolean
}

export interface UnansweredBlock {
  rows: UnansweredRow[]
  /** Distinct non-owned videos that asked something about this subject in the
   *  period shown — the gate's own number, printed on the block's meta line
   *  the way the mock prints it ("in 130 videos this quarter"). */
  questionVideos: number
  /** Your own posts in the drawn window. */
  yourPosts: number
  lead: UnansweredLead | null
  basis: string
  /** What half of your posts this matched on, while the other half is
   *  unreadable. Null the day M8 lands and the claims can be read. */
  claims: string | null
  reddit: string | null
  refusal: string | null
  /** Whether your posts in the window touched the subject, counted as Your
   *  moves counts it (`questionTouch`: the word check over the questions shown
   *  and the judge's filing; sw-2 item 2). OPTIONAL: a stored pane has none
   *  and prints its line as it was sent. */
  touch?: QuestionTouch | null
}

export interface SubjectPane {
  id: string
  name: string
  description: string | null
  namedAt: string
  origin: Subject['origin']
  /** As the rail row's: a stored `'calibrating'` reads as provisional. */
  calibration: StoredCalibration
  /** Set only on a subject the month was NOT READ for: the words its rail
   *  row prints (`unreadWords`, "no reading yet"), which the pane prints in
   *  place of its calibration word (default M-a). Optional: a stored pane
   *  has none and renders as it was sent. */
  unread?: string | null
  /**
   * The subject's market level on the RAIL's base, copied from its rail row
   * (`SubjectRail.market`: the category and the tracked brands pooled,
   * decision E), for the pane's headline figure (default M-b): one screen,
   * one base. Null where the rail row has none (failed, unread, unknown).
   * Optional: a stored pane has none and leads with its gap line, as sent.
   */
  market?: { k: number; n: number; pct: number | null } | null
  /**
   * THE SUBJECT ON THE MARKET, MONTH BY MONTH (WP2.2, §2.3 S2 and S6): the
   * pooled market line over the chart's axis, k null in a month the subject
   * was not read in, each refused step judged on the market view. The pane's
   * trail and "months read", and the Month by month block, are drawn from it.
   * Optional: a pane stored before WP2.2 has none and renders its Phase 1
   * brand comparison, as sent.
   */
  marketLine?: MonthSeries | null
  /** The market pair's one chip (the reading month against the month before),
   *  "not read as a change: we changed our searches in September", or null. */
  chip?: string | null
  /** The subject's market videos this month that are makers', and the base
   *  (the pane's "Who posted them"). Null where not measured. */
  makers?: { k: number; of: number } | null
  /** WHERE WE FOUND THEM (the approved preview's pane): the same videos (`of`
   *  is the headline's k) on searches we ran before the month, and those
   *  found only on searches we added in it, by the front page's added-only
   *  rule (`foundSplit`). Null where not measured, or where the month added
   *  no search. Optional: absent on a stored pane. */
  found?: FoundSplit | null
  /**
   * WHAT PEOPLE SAY ABOUT IT (§2.3 S3): the kinds of the subject's own member
   * insights, as videos in the reading month, by the month rule (a member
   * cited on a comment dated in the month, or on camera on a video that
   * occupies it), over the subject's market videos (`of`, which equals the
   * headline's k: the loader prints nothing where the two disagree). Null
   * where it was not read. Optional: absent on a stored pane.
   */
  kindsIn?: { of: number; rows: { kind: string; label: string; k: number }[] } | null
  /**
   * The next pair the months can be read the same way on (`nextComparablePair`,
   * the market view, assuming nothing further changes), with the dates the
   * Month by month cards print. Null where there is none to name.
   */
  nextPair?: { prevMonth: string; month: string; sameAgeFrom: string; inFullExpected: string } | null
  /** Each month's state line for the Month by month cards, keyed by month
   *  ("final", "ended · still filling until the 1 Nov update", "so far from
   *  16 Oct · ended from 1 Nov"). Optional. */
  monthStates?: Record<string, string>
  /** Week by week, read at the same age (WP3.13, §2.3 S6): the subject's row
   *  on the page's own week axis, once `WEEK_LINE` says print (deploy 3w at
   *  the earliest). Null or absent: no strip (deploy 3 draws none). */
  weekStrip?: WeekStrip | null
  index: number
  of: number
  sides: SubjectSide[]
  /** Whether the kind table is installed here (M5). False: "not recorded
   *  month by month for this workspace yet" is the true sentence. True, with
   *  no kind on any side: the month has none read yet, which is a different
   *  fact (market-first WP1.2, GR F57). Optional: a stored snapshot taken
   *  before WP1.2 has none. */
  kindsRecorded?: boolean
  /** The sides' months over the page's READ axis (the horizon, plus the month
   *  before it) — what the hero's sentences are built from. */
  series: MonthSeries[]
  /**
   * The chart's lines, one per side, over `SubjectsData.chartAxis` — the
   * trailing twelve months whatever the horizon (`chartMonths`). Optional
   * because a snapshot frozen before 2026-09-24 has none; the block then draws
   * `series` over `axis`, as it always did.
   */
  chartSeries?: MonthSeries[]
  voices: SubjectVoice[]
  voicesFrom: number
  /** True where the pool the six were drawn from was capped — then the block
   *  says "a sample" instead of a denominator. */
  voicesSampled: boolean
  unanswered: UnansweredBlock
  /** The move already declared on this subject, where there is one. */
  move: { id: string; title: string; declaredAt: string; status: Move['status'] } | null
  /** The videos behind YOUR figure, as a link and a count. */
  behind: { videos: number; href: string } | null
  /**
   * You against the lead rival on this subject, as a banded difference (D1) —
   * the field `subjects.detail.gapline` binds. Null where no rival is tracked,
   * where the month is thin, or where the reading is not recorded.
   *
   * The mock writes "gap 13 points, narrowed from 19 in June". `Gap` carries
   * the difference, its band and one of four words; `Gap.basis` is the earlier
   * reading printed beside it with its own band; and `Gap.direction` — the
   * only place "narrowed" could ever come from — is null, because it is filled
   * by `gapDirection` alone and no reader's flag is true.
   */
  gap: Gap | null
  /** The category's last three monthly levels, dated — the mock's own
   *  right-hand footer note on the hero. Null under three readings. */
  trail: string | null
  /** The sentence above the axis about which lines carry an n. */
  axisNote: string | null
  /** Said where the numerator table is not applied here. */
  notRecorded: string | null
}

export interface SubjectsRecordBlock {
  line: string
  lines: string[]
}

export interface SubjectsData {
  brand: string
  month: string
  monthStatus: MonthStatus
  readingAt: string
  /** The reading month (market-first decision A) and the bar's other months
   *  (default M-d), newest first. Always set by the loader; optional because a
   *  stored snapshot taken before WP1.2 has neither. */
  reading?: ReadingMonth
  otherMonths?: OtherMonth[]
  horizon: Horizon
  /** The questions pane's period (`?questions=`, `subjectsHorizons`); the
   *  page's where absent (a stored snapshot before it). */
  questionsHorizon?: Horizon
  axis: string[]
  /** The chart's own axis — the trailing twelve months, or from the tenant's
   *  first readable month where that is later (`chartMonths`). Not the
   *  horizon's: the horizon changes the figures, not how much line is drawn.
   *  Optional for the same snapshot reason as `SubjectPane.chartSeries`. */
  chartAxis?: string[]
  substrate: Substrate
  notes: MonthLabel[]
  list: SubjectListBlock
  selected: SubjectPane | null
  /**
   * "Your own posts", this month — the mock's own tile (`subjects.ownposts.*`).
   *
   * DATED BY THE POST, AND THE ONLY FIGURE ON THIS PAGE THAT IS. Everything
   * else here is comment-dated; a census of what you published is dated by
   * `videos.upload_date`, which is a real calendar date for a post and is not
   * the clock the month heading above it means. `OwnPostCensus.basis` carries
   * that sentence and every surface prints it beside every figure — the same
   * rule, and the same reason, as `UNANSWERED_BASIS` two tiles down.
   *
   * Null where the tenant has no month to count in.
   */
  ownPosts: OwnPostCensus | null
  /**
   * "Say vs hear" — how many of your claims the audience echoed, pushed back
   * on, or never took up.
   *
   * THE SAME NUMBERS MARKET PRINTS, FROM THE SAME COMPUTATION AND THE SAME
   * RUN. `claimCounts` over `run_summary.say_vs_hear` for this tenant's latest
   * completed update, exactly as `lib/pages/market.ts` does it; the mock puts
   * the tile on Subjects as well and two tiles of one product counting one
   * ledger twice is how two pages come to disagree. Null where THAT update
   * resolved no claim — which is when Market's tile is empty too.
   */
  sayHear: ClaimCounts | null
  /**
   * The ledger's claims themselves, in `ledgerRows` order (pushed back, then
   * echoed, then silent): the SAME rows `sayHear` counts, so the tile's rows
   * and its tally cannot disagree. Each carries the one state the ledger gave
   * it. There is no "not tracked" per claim here: a claim is on the ledger
   * because the update read it against the audience, and a workspace with no
   * ledger says so once, in the block's empty state.
   */
  sayHearClaims: SayHearClaim[]
  /**
   * THE SUBJECTS ASKED ABOUT MOST OVER THE LAST 3 MONTHS (the preview's
   * "Asked most, last 3 months" under the questions count): each subject's
   * question videos, as S4 counts them, the top three, none being
   * re-described. One read for every subject (`loadQuestionsBySubject`).
   * Optional: a page stored before it has none.
   */
  askedMost?: { id: string; name: string; videos: number }[] | null
  /** The record's lines, which fed the retired "How sound" pill. No block
   *  on the page prints them (25 Sep rulings), so since WP2.2 the loader reads
   *  none (about fourteen reads, a quarter of the page's); a snapshot stored
   *  before WP2.2 still carries them. */
  record?: SubjectsRecordBlock
  /**
   * The method footnote, composed once for every surface (block D, D9).
   *
   * ONE FIELD, ONE CALL LINE, ON EVERY PAGE, from the `RecordInputs` this page
   * already loads — so the language share and the read-depth basis cannot come
   * to be worded differently here and on the next surface. Null only where the
   * record behind it could not be read. See lib/reading/method.ts.
   */
  method?: MethodLines | null
}

// ---- pure ---------------------------------------------------------------------

const pctOf = (k: number | null, n: number | null): number | null =>
  k == null || n == null || n <= 0 ? null : Math.round((k / n) * 1000) / 10

/** Where a subject came from, in the client's words. The same three sentences
 *  OV2's empty state uses, so the two surfaces cannot word one origin twice. */
export function originLine(origin: Subject['origin']): string {
  if (origin === 'own_claims') return 'you said this in your own posts'
  if (origin === 'category_theme') return 'the category raised it in the videos we read'
  return 'you named it'
}

/** The rail's own "N named" line, and what it says about the set. */
export function setLine(active: number, proposed: number): string {
  if (active === 0 && proposed === 0) return 'No subject named yet.'
  if (active === 0) return `${fmtInt(proposed)} proposed · none confirmed, so nothing is counted yet.`
  const tail = proposed > 0 ? ` · ${fmtInt(proposed)} waiting to be confirmed` : ''
  return `${fmtInt(active)} named${tail}`
}

/** Why this subject's share is not being shown, or the word its row carries.
 *  Null when it prints normally.
 *
 *  THREE DIFFERENT SILENCES AND THEY READ DIFFERENTLY. "Not counted yet" is
 *  about the CONSENT — the subject is named and nobody has confirmed it, so
 *  nothing has ever looked. "Provisional" and "being re-described" are about
 *  the MEASUREMENT: nobody has checked how often the judge is right, or the
 *  check came back clearly under the floor (decision C). "No reading yet" is
 *  about the RECORD — the month holds no row. Collapsing them into one
 *  sentence was how the old product told a client its data was missing when
 *  its method was.
 *
 *  A stored `'calibrating'` reads as provisional (`readCalibration`). */
export function railNote(
  calibration: StoredCalibration,
  read: boolean,
  status: Subject['status'] = 'active',
  unread: string | null = null,
): string | null {
  if (status === 'proposed') return 'not counted yet: confirm it and counting starts with the next update'
  const state = readCalibration(calibration)
  // Failed first: a subject being re-described prints nothing else, read or not.
  if (state === 'failed') return CALIBRATION_WORDS.failed
  // A SUBJECT THE MONTH WAS NOT READ FOR (named after its last update) says
  // so in place of a figure and of its word: "no reading yet" (`unreadWords`,
  // the one wording on every surface, default M-a), never "provisional",
  // which is the calibration word alone.
  if (unread) return unread
  // A67: the pane says it in full; the rail says the one word.
  if (state === 'provisional') return CALIBRATION_WORDS.provisional
  if (!read) return NO_READING_YET
  return null
}

/** Each rail row's maker share, from the maker read (in place): the share of
 *  its market videos this month that are makers', or null where the row has
 *  no figure or the read did not happen. */
export function fillMakerShares(rows: SubjectRail[], makers: Pick<MarketMakers, 'lens'>, rivalAudiences: readonly string[]): void {
  for (const r of rows) {
    const k = r.market?.k ?? 0
    const makerK = r.market && k > 0 && r.status === 'active' && readCalibration(r.calibration) !== 'failed'
      ? makerKOf(makers.lens, r.id, rivalAudiences)
      : null
    r.makerShare = makerK != null ? makerK / k : null
  }
}

/** The rail's order (WP2.2, §2.3 S1): rows with a market figure first, by
 *  the market's k this month (one base, so k's order is the share's), then
 *  the confirmed rows with no figure (not read yet, being re-described), then
 *  the rows named but not confirmed; ties by name, so the order never depends
 *  on how the rows came back. */
export function byRailRank(a: Pick<SubjectRail, 'status' | 'market' | 'calibration' | 'name'>, b: Pick<SubjectRail, 'status' | 'market' | 'calibration' | 'name'>): number {
  const tier = (r: typeof a) => (r.status !== 'active' ? 2 : r.market && readCalibration(r.calibration) !== 'failed' ? 0 : 1)
  const t = tier(a) - tier(b)
  if (t !== 0) return t
  return (tier(a) === 0 ? (b.market?.k ?? 0) - (a.market?.k ?? 0) : 0) || a.name.localeCompare(b.name)
}

/** Which subject the page is about: the one asked for, else the first
 *  confirmed one, else nothing. A subject that is not this tenant's, or is
 *  retired, is not selected by a URL — it simply is not in the list. Nor is a
 *  subject being re-described (decision C: hidden everywhere), which the
 *  caller leaves out of `rail`. */
export function selectSubject(rail: readonly { id: string }[], asked: string | undefined): string | null {
  if (asked && rail.some((r) => r.id === asked)) return asked
  return rail[0]?.id ?? null
}

/**
 * The pane's sides under the subject's calibration (decision C, WP1.1).
 *
 * READY: every side, as read. PROVISIONAL: no "you" side (its client level is
 * not shown until the check clears the floor), and no side carries a change
 * verdict or a direction word; the market's sides print as levels. FAILED: no
 * side at all, the subject is being re-described. A pane stored before WP1.1
 * reads `'calibrating'` as provisional; one with no field renders as sent.
 */
export function calibratedSides<S extends { kind: SubjectSide['kind']; verdict: Verdict | null; direction: Direction | null }>(
  sides: readonly S[],
  calibration: string | null | undefined,
): S[] {
  const state = readCalibration(calibration)
  if (state === 'failed') return []
  if (state === 'provisional') {
    return sides.filter((s) => s.kind !== 'you').map((s) => ({ ...s, verdict: null, direction: null }))
  }
  return [...sides]
}

/**
 * EVERY NAMED SUBJECT IS BEING RE-DESCRIBED (WP1.1 review, finding 9): the
 * set is named and confirmed, and a failed subject opens no pane, so nothing
 * is selected. The pane's blocks said "Name a subject and this is where it is
 * read in full." to a tenant whose subjects are named. This is their sentence
 * in that state.
 */
export const SUBJECTS_ALL_REDESCRIBED = 'Your subjects are being re-described; there is none to open in full yet.'

/** Is every confirmed subject on the rail failed? False where none is
 *  confirmed (the "name one" or "confirm one" state). */
export function allRedescribed(data: Pick<SubjectsData, 'list'>): boolean {
  const active = data.list.rows.filter((r) => r.status === 'active')
  return active.length > 0 && active.every((r) => readCalibration(r.calibration) === 'failed')
}

/** The selected subject's sides as its blocks print them (`calibratedSides`). */
export function paneSides(pane: Pick<SubjectPane, 'sides' | 'calibration'>): SubjectSide[] {
  return calibratedSides(pane.sides, pane.calibration)
}

/**
 * A rail row's market side: k pooled over the market's audiences this month,
 * n the pooled market (decision E), or null where there is nothing to print.
 *
 * NULL UNLESS THE SUBJECT WAS READ IN THE MONTH (WP1.1 review, finding 1). A
 * subject named after the month's last update has no row anywhere, and the
 * month series' 0s are then no reading, not a zero. `rows` holds every market
 * audience with a denominator row this month; a null k there is a line the
 * page did not read, and it makes the whole side unknown (`pooledSide`'s
 * contract), never a partial sum.
 */
export function railMarketSide(input: {
  read: 'read' | 'unread' | 'no_month'
  month: string
  rows: readonly { audience: string; k: number | null }[]
  counts: ReadonlyMap<string, MarketCount>
  rivalAudiences: readonly string[]
}): { k: number; n: number } | null {
  if (input.read !== 'read') return null
  const side = pooledSide(
    input.rows.map((r) => ({ month: input.month, audience: r.audience, k: r.k })),
    input.counts,
    input.month,
    input.rivalAudiences,
    { read: true },
  )
  return side.k != null && side.n != null && side.n > 0 ? { k: side.k, n: side.n } : null
}

/**
 * Six voices, drawn round-robin across the audiences.
 *
 * The order inside one audience is the caller's (relevance rank); the order
 * ACROSS them is one each in turn, so a category audience with four hundred
 * citations cannot silence your own audience's two. `perAudience` caps any one
 * side, and the total cap is what actually stops the list.
 */
export function voicesAcross<T>(
  pools: readonly { audience: string; items: readonly T[] }[],
  total: number = VOICES_SHOWN,
  perAudience: number = VOICES_PER_AUDIENCE,
): T[] {
  const out: T[] = []
  const taken = new Map<string, number>()
  for (let round = 0; round < perAudience; round++) {
    for (const pool of pools) {
      if (out.length >= total) return out
      const at = taken.get(pool.audience) ?? 0
      if (at >= perAudience || at >= pool.items.length) continue
      out.push(pool.items[at])
      taken.set(pool.audience, at + 1)
    }
  }
  return out
}

/** The voices block's meta line. Where the pool was capped it says so rather
 *  than printing a denominator nobody counted. */
export function voicesMeta(shown: number, from: number, sampled: boolean): string {
  // A44: the quotes show their own layout, so the meta is the count alone.
  return sampled
    ? `${fmtInt(shown)} shown, drawn from a sample of what was said on this subject`
    : `${fmtInt(shown)} of ${fmtInt(from)}`
}

/**
 * A voice's WHOLE attribution, platform included — the one composer, for every
 * surface that does not draw the glyph.
 *
 * `SubjectVoice.cite` is deliberately platform-free: the Subjects page draws a
 * `PlatformIcon` in front of it, and leading the words with `m.platform` too
 * printed the platform twice, once as a mark and once as a raw column value
 * lower-cased at a client ("⟨glyph⟩ tiktok · 14 Sep"). That is right for the
 * page and wrong everywhere else, and "everywhere else" then invented its own
 * spelling: a reader of one monthly report met "TikTok · 14 Sep" in §1 (from
 * `lib/pages/week.ts`, which composes `platformLabel` into the cite) and
 * "tiktok · 14 Sep" and "instagram · 7 Sep" in §6, with "TikTok 38% ·
 * Instagram 21%" in the footer — three spellings of two platforms in one
 * artefact. On the brief deck the cite printed the GLYPH ALONE, and on paper,
 * with no tooltip and nothing to hover, a 10px glyph is not an attribution:
 * the artboard prints "Instagram · 7 Sep · under your post".
 *
 * So the rule is: a surface that draws the mark uses `voice.cite`; a surface
 * that does not calls THIS, and never assembles the string itself.
 * `platformLabel` is the product's one spelling of a platform's name.
 */
export function voiceCite(voice: Pick<SubjectVoice, 'cite' | 'platform'>): string {
  return voice.platform ? `${platformLabel(voice.platform)} · ${voice.cite}` : voice.cite
}

/**
 * Where a voice was heard, in the reader's words — never an audience key.
 *
 * THE CLIENT AUDIENCE IS TWO DIFFERENT PLACES, and it printed as one. The
 * glossary's own definition of `audience` is "whose videos a figure is ABOUT",
 * and the `client` key is earned two ways: a post published from one of the
 * tenant's own handles (`videos.source = 'owned'`), and a STRANGER's video
 * whose caption or hashtags name a brand keyword (content tagging,
 * lib/gather/tagging.ts). Both are "you"; only the first is yours.
 *
 * Measured on the preview branch 2026-09-24: all 21 of Sealand's
 * client-audience insights sat on eight third-party accounts — `tunl.to`,
 * `honest_money_pod`, `jessejadeturner` and five more — and every quote drawn
 * from them was cited "under a post of yours". A client reading their own
 * Subjects page would have gone looking for a post of theirs that does not
 * exist. `ownPost` is the video's `source`, which is the only thing that knows.
 *
 * Absent (the default) is the honest answer for a caller that cannot tell: the
 * audience key alone does not know whose account the video came off, so it
 * says what it CAN say — the video names you.
 */
export function voiceFrom(audience: string, opts: { ownPost?: boolean } = {}): string {
  if (audience === CLIENT_AUDIENCE) return opts.ownPost ? 'under a post of yours' : 'in a video that names you'
  if (audience === INDUSTRY_AUDIENCE) return 'under a category video'
  const name = audience.startsWith('competitor:') ? audience.slice('competitor:'.length) : audience
  return `under a ${name} video`
}

/** Words worth matching on: lower-cased, accent-folded, three letters or more,
 *  stop words dropped. Small on purpose — this decides whether one of your
 *  posts TOUCHED a question, and a generous matcher that calls everything
 *  answered is the failure mode that matters (it hides the gap). */
const STOP = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'was', 'were', 'will', 'can', 'does', 'did',
  'this', 'that', 'these', 'those', 'from', 'about', 'into', 'have', 'has', 'had', 'but', 'not', 'any',
  'all', 'how', 'why', 'what', 'when', 'where', 'who', 'its', 'it’s', 'there', 'them', 'they',
])

/** The combining marks NFD splits an accent into, as escapes rather than as
 *  invisible characters in the source — a literal combining mark in a regex
 *  class is a character nobody can see in a diff. */
const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g')

export function matchWords(text: string): string[] {
  const folded = text.normalize('NFD').replace(COMBINING, '').toLowerCase()
  const words = folded.split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    // ONE PIECE OF STEMMING, AND ONLY ONE. "zips failing after a year" against
    // a claim about "ten years" shares one word and reads as unanswered — a
    // question you HAVE answered, printed as a gap, which is the direction of
    // failure that embarrasses a client in front of their own posts. A trailing
    // `s` on a word of four letters or more is dropped and nothing else is; a
    // real stemmer would start matching things that are not the same thing.
    .map((w) => (w.length >= 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
  return [...new Set(words)]
}

/**
 * THE GENERIC WORDS (market-first WP2.5): words every post and every question
 * in this category shares, so sharing one says nothing about whether a post
 * touched a question. "bag" is in nearly every question label and every post's
 * topics; "handmade", "love" and "buy" are the market's own framing; and the
 * label words a clustering puts at the front of a group ("Questions about",
 * "Demand for", "Worries about", "Confusion over") name the KIND of thing
 * said, not its subject. A post touches a question only on two words that are
 * none of these. Stemmed as `matchWords` stems (a trailing s dropped).
 */
export const GENERIC_WORDS: ReadonlySet<string> = new Set([
  'bag', 'backpack', 'pack', 'handmade', 'love', 'buy', 'buying', 'want', 'like', 'need', 'make', 'made',
  'good', 'great', 'nice', 'best', 'new', 'product', 'video', 'post', 'brand', 'people', 'thing', 'one', 'get',
  'question', 'demand', 'worrie', 'worry', 'concern', 'confusion', 'interest', 'frustration', 'praise',
  'request', 'desire', 'wish', 'curiosity', 'comment', 'feedback', 'appreciation', 'admiration', 'excitement',
  'over', 'into', 'onto', 'than', 'then', 'just', 'very', 'more', 'most', 'some', 'such', 'only', 'also',
  'after', 'before', 'their', 'there', 'other', 'every', 'much', 'many', 'way', 'real',
])

/** A text's non-generic words (`matchWords` without `GENERIC_WORDS`). */
export function contentWords(text: string): string[] {
  return matchWords(text).filter((w) => !GENERIC_WORDS.has(w))
}

/** Each matched stem as the label wrote it ("canva" is printed "canvas"):
 *  the first word in the text that stems to it. */
function spelledAs(text: string): Map<string, string> {
  const out = new Map<string, string>()
  const folded = text.normalize('NFD').replace(COMBINING, '').toLowerCase()
  for (const w of folded.split(/[^a-z0-9]+/)) {
    if (w.length < 3) continue
    const stem = w.length >= 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w
    if (!out.has(stem)) out.set(stem, w)
  }
  return out
}

/**
 * Which of your posts share two or more of a label's non-generic words, and on
 * which words (WP2.5: a "none" can be checked). Each POST is matched on its
 * own: two words from two different posts are not one post touching the
 * question. `checked` is the label's words a post had to share.
 */
export function postsSharing(
  label: string,
  posts: readonly { id: string; topics: readonly string[] | null }[],
): { checked: string[]; matched: { id: string; words: string[] }[] } {
  const stems = contentWords(label)
  const spelling = spelledAs(label)
  const spell = (w: string) => spelling.get(w) ?? w
  const checked = stems.map(spell)
  if (stems.length < 2) return { checked, matched: [] }
  const matched = posts.flatMap((p) => {
    const pool = new Set((p.topics ?? []).flatMap(contentWords))
    const words = stems.filter((w) => pool.has(w))
    return words.length >= 2 ? [{ id: p.id, words: words.map(spell) }] : []
  })
  return { checked, matched }
}

/**
 * Did any of your own posts touch this question?
 *
 * TWO CONTENT WORDS IN COMMON, ALWAYS. One shared word is "bag", and one
 * shared word calls every question about a bag answered — which hides the gap
 * this block exists to show. `hits >= Math.min(2, want.length)` made the rule
 * one word for a one-word label ("Durability"), which is the case where a
 * single shared word is weakest evidence and the block is likeliest to be
 * wrong in the direction that matters. A label with one content word is
 * therefore never called answered: the row stays in the list, where a reader
 * can see it and disagree, rather than disappearing silently.
 *
 * `haystack` is what your own posts are about (`videos.topics`); what they
 * CLAIM is unreadable until M8 — see UNANSWERED_CLAIMS_UNREADABLE.
 */
export function answeredBy(label: string, haystack: readonly string[]): boolean {
  // Two NON-GENERIC words (WP2.5): "bag" and "love" touch every question.
  const want = contentWords(label)
  if (want.length < 2) return false
  const pool = new Set(haystack.flatMap(contentWords))
  const hits = want.filter((w) => pool.has(w)).length
  return hits >= 2
}

/**
 * SU3's sentence, in the design's own shape minus the share.
 *
 * "Questions grouped as X came up in N of the videos we have read — none of
 * your M posts touched it."
 *
 * TWO DEPARTURES FROM THE DESIGN'S EXAMPLE SENTENCE, both forced by what the
 * label actually is. The share is absent because the k is taken from the
 * current analysis and every other n on this page is comment-dated, and this
 * product does not print a fraction whose two halves are dated two ways. And
 * the verb is "grouped as" rather than "the category asked", because the label
 * is the CLUSTERING's summary of a set of questions, not a question anybody
 * typed — measured on production, one of Össur's largest groups of question
 * insights sits under a theme the model called "Praise for prosthetic look",
 * and "the category asked 'Praise for prosthetic look'" is a sentence that is
 * simply not true. A verbatim question belongs to 31b's evidence freeze, not
 * to a label.
 */
/**
 * The lead, IN ITS PARTS.
 *
 * ONE OF THESE WORDS IS A MODEL'S AND THE REST ARE CODE'S (fix pass). The
 * sentence was composed here and printed inside a single `data-copy="figure"`
 * node, which marks the model's value as code's: `label` is the CLUSTERING's
 * summary, written by Pass B, and the copy contract's own instruction is that
 * a block marks the model's value, not the row it sits in. The block prints the
 * label in a `subject` node naming the `pass_b_theme` slot, the count in a
 * `figure` node, and leaves the sentence it composed itself unmarked — where
 * rule (c) still sweeps it, which is the point.
 */
export interface UnansweredLead {
  /** Pass B's own label for the group — a model's words, replayed. */
  label: string
  /** Videos that asked it. */
  videos: number
  /** What your own posts did about it, in the reader's own period. */
  posts: string
}

export function unansweredLead(
  rows: readonly UnansweredRow[],
  yourPosts: number,
  period: string,
): UnansweredLead | null {
  const top = rows.find((r) => !r.answered)
  if (!top) return null
  const posts = yourPosts > 0
    ? `none of your ${fmtInt(yourPosts)} post${yourPosts === 1 ? '' : 's'} ${period} touched it`
    : `you published nothing ${period}`
  return { label: top.label, videos: top.videos, posts }
}

/** The same sentence as one string, for a caller with no JSX to mark up. */
export function unansweredLeadText(lead: UnansweredLead | null): string | null {
  return lead
    ? `Questions grouped as “${lead.label}” came up in ${fmtInt(lead.videos)} of the videos we have read: ${lead.posts}.`
    : null
}

/**
 * The period the reader chose, in the reader's words, inside a sentence.
 *
 * NOT THE MONTH'S NAME. The lead sentence counted your posts over the whole
 * HORIZON and labelled them with the current month — "none of your 900
 * September posts" on Last 12 months — while the block's own meta line said
 * "in this window" about the same number. One number, two statements, one of
 * them false. The control's own words are the words: it is the only period the
 * reader has been shown.
 */
/**
 * THE QUESTIONS PANE'S OWN PERIOD (`?questions=`; the deploy-3 fresh review).
 * Subjects has no horizon control (lib/nav.ts `horizon: false`, the lead's
 * ruling of 27 Sep), so nothing on the page shows or undoes a horizon: the
 * page reads the default month whatever `?horizon=` says, and the bar's month
 * selector does not carry it. The questions pane's "Asked most, last 3 months"
 * links ask for their period in their own parameter, which moves the pane and
 * nothing else; its meta and sentence say the period ("Last 3 months", "in the
 * last 3 months").
 */
export const QUESTIONS_PARAM = 'questions'

/** The page's horizon and the questions pane's, from the URL. */
export function subjectsHorizons(params: Readonly<Record<string, string | undefined>>): { horizon: Horizon; questions: Horizon } {
  const horizon = hasHorizon(surface('subjects')) ? parseHorizon(params.horizon) : DEFAULT_HORIZON
  const asked = params[QUESTIONS_PARAM]
  return { horizon, questions: asked ? parseHorizon(asked) : horizon }
}

export function periodPhrase(horizon: Horizon, month: string): string {
  if (horizon === 'this_month') return `in ${monthName(month).split(' ')[0]}`
  if (horizon === 'since_start') return 'since we started'
  return `in the ${HORIZON_LABEL[horizon].toLowerCase()}`
}

/** SU3's meta line: what was asked, and what you published, in the period the
 *  basis sentence names. The gate's own number is printed rather than computed
 *  and dropped — the mock says "in 130 videos this quarter". */
export function unansweredMeta(questionVideos: number, yourPosts: number): string {
  const asked = `${fmtInt(questionVideos)} video${questionVideos === 1 ? '' : 's'} asked about this subject`
  return `${asked} · ${fmtInt(yourPosts)} post${yourPosts === 1 ? '' : 's'} of yours`
}

/**
 * A side's eyebrow, qualified — "You — Sealand", "Freitag — rival",
 * "Category — no brand" (the mock's own three).
 *
 * WHY IT IS NOT `SubjectSide.label`. The label is the word the side is CALLED
 * in a sentence, and `gapLine` builds a sentence out of two of them ("You 31%
 * of 84 · Freitag 43.7% of 142"). Folding the qualifier into the label would
 * put "Freitag — rival 43.7% of 142" in that sentence and "The category — no
 * brand" in every chart hover. The qualifier belongs to the COLUMN HEADING,
 * which is the one place a reader needs telling which of the three kinds of
 * audience they are looking at, so it is composed where that heading is drawn.
 *
 * A retired rival keeps the label's own "— stopped" and takes no second dash.
 */
export function sideEyebrow(side: Pick<SubjectSide, 'kind' | 'label'>, brand: string): string {
  if (side.kind === 'you') return brand ? `You · ${brand}` : 'You'
  if (side.kind === 'category') return 'Category · no brand'
  return side.label.includes(' · ') ? side.label : `${side.label} · rival`
}

/** What the figure beside it is a share OF, in the reader's words — the mock's
 *  "of your videos" / "of their videos" / "of category videos". Three columns
 *  of percentages with no unit read as three shares of one denominator, and
 *  they are three shares of three. */
export function sideCaption(side: Pick<SubjectSide, 'kind'>): string {
  if (side.kind === 'you') return 'of your videos'
  if (side.kind === 'category') return 'of category videos'
  return 'of their videos'
}

/** A side's name on the chart's legend — the audience first, its kind after,
 *  as the mock keys its lines ("Sealand — you"). */
export function sideLegend(side: Pick<SubjectSide, 'kind' | 'label'>, brand: string): string {
  if (side.kind === 'you') return brand ? `${brand} · you` : 'You'
  return sideEyebrow(side, brand)
}

/**
 * The hero's right-hand note: one side's last three months as LEVELS, dated —
 * "Jul 17 → Aug 19 → Sep 22 in the category".
 *
 * THREE LEVELS ARE NOT A DIRECTION. The arrow is the calendar's, not a claim:
 * each figure carries its own month and the sentence names the audience it is
 * a share of. A reader can see the series without the product saying which way
 * it is going, which is exactly what `directionWord` exists to gate and what
 * this note is careful not to pre-empt. Null under three readings — two dots
 * and an arrow IS a direction claim.
 */
export function trailLine(series: MonthSeries | null, label: string): string | null {
  if (!series) return null
  const read = series.points.filter((p) => p.pct != null).slice(-3)
  if (read.length < 3) return null
  // ONE DECIMAL, BECAUSE THE FIGURE ABOVE IT HAS ONE. Rounded to the integer
  // the newest step read "Sep 25%" under a stat printing 24.5% — the same
  // number, twice, disagreeing with itself on one tile.
  const steps = read.map((p) => `${monthName(p.month).split(' ')[0]} ${fmtPct(p.pct as number)}`)
  return `${steps.join(' → ')} in ${label.toLowerCase()}`
}

/**
 * Each drawn line's LAST READING, in words — the sentence that stands in for
 * the chart's end labels where a column is too narrow for them (Block D wave
 * 3b, `decks`).
 *
 * `CalendarLine`'s own contract says so in as many words: the end label is
 * drawn at `width - padR + 10` and is clipped by nothing, so "a caller with a
 * column too narrow for the gutter turns it off, gives the plot the space
 * back, and prints the last reading under the chart at its own type size". The
 * marketing brief is that column — `mk.subjectline` takes six of twelve, and
 * "The category 22.0% of 1,388" wants about 40% of the drawing's width — and
 * the labels had been running under the gap card beside them since the sheet
 * was composed.
 *
 * IT IS THE SERIES' OWN LAST READING, NOT THIS MONTH'S LEVEL. `SubjectSide.pct`
 * is September; a side whose newest reading is August would be printed under a
 * September date by a sentence built from the side, and the end label it
 * replaces carries the month the line actually ends on. So it walks the same
 * points the chart draws, takes the last one with a share, and dates it.
 *
 * Null where no line carries a reading at all — then there is nothing to label
 * and the chart's own empty words stand.
 *
 * Pure.
 */
export function endReadings(
  sides: readonly SubjectSide[],
  series: readonly MonthSeries[],
): string | null {
  const parts: string[] = []
  for (const side of sides) {
    const line = series.find((s) => s.audience === side.audience)
    if (!line) continue
    const last = [...line.points].reverse().find((p) => p.pct != null && p.videos != null)
    if (!last) continue
    parts.push(`${side.label} ${monthName(last.month).split(' ')[0]} ${fmtPct(last.pct as number)} of ${fmtInt(last.videos as number)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/** The words above the axis about which lines carry an n (design §3 SU2's
 *  gate, and the mock's own sentence). ONE sentence for a run of lines, never
 *  one per line. */
export function axisNote(
  sides: readonly SubjectSide[],
  floorN: number,
  /**
   * The drawn series, so the note can name a line that STARTS LATE — the
   * artboard's "Patagonia is read from August".
   *
   * A LINE THAT BEGINS HALFWAY IS NOT A LINE THAT FELL TO ZERO, and the axis
   * cannot say which without being told. A rival added to a tenant that
   * already has history is read from the month they were added; drawn beside a
   * line that runs the whole axis, the short one reads as a collapse. Optional,
   * because a caller with no series still gets the floor sentence it always
   * got.
   */
  series: readonly MonthSeries[] = [],
  /** The month the page reads, `YYYY-MM-01`: named where a side read nothing
   *  in it. */
  month?: string | null,
): string | null {
  const hollow = sides.filter((s) => s.observed && (s.n ?? 0) < floorN)
  // "A, B and C", not "A and B and C": ten sides joined by "and" read as one
  // breathless name (layout sweep).
  const names = (of: readonly SubjectSide[]) => {
    const l = of.map((s) => s.label)
    return l.length <= 2 ? l.join(' and ') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`
  }
  const parts: string[] = []
  if (hollow.length > 0) {
    parts.push(
      // The month by name where the page names one (deploy 1 review): on 1–15
      // Oct it reads an ended September.
      `${names(hollow)} carried too few videos ${month ? `in ${longMonth(month)}` : 'this month'} to compare ` +
      `(${hollow.map((s) => `${fmtInt(s.n ?? 0)}`).join(', ')}).`,
    )
  }
  // TWO SILENCES, TWO SENTENCES. An audience with no video read in the month
  // has no denominator; an audience we read that carried nothing on this
  // subject has "no reading yet", and the second is the one a newly confirmed
  // subject is in on the client's OWN side.
  //
  // THE FIRST SAYS THE MONTH, NOT "NOT TRACKED" (market-first WP1.2, GR F57).
  // The audience is tracked; what is missing is a video read in this month.
  // In the first days of a month that was every side, the category included,
  // and "The category: not tracked" named a missing capability for what was a
  // month not read yet.
  const noReading = sides.filter((s) => s.silence === 'no_reading')
  const notTracked = sides.filter((s) => s.silence === 'not_tracked')
  if (noReading.length > 0) parts.push(`${names(noReading)}: no reading yet on this subject.`)
  if (notTracked.length > 0) {
    parts.push(month ? `${names(notTracked)}: no video read in ${longMonth(month)}.` : `${names(notTracked)}: no video read this month.`)
  }

  // A LINE THAT STARTS LATE SAYS WHEN. The axis's own first month is the
  // yardstick: a series whose first reading is later than everyone else's is
  // read from that month, and the sentence names it so the short line is not
  // read as a fall.
  const firstRead = (s: MonthSeries): string | null =>
    s.points.find((p) => p.pct != null)?.month ?? null
  const read = series
    .map((s) => ({ s, from: firstRead(s) }))
    .filter((x): x is { s: MonthSeries; from: string } => x.from != null)
  const earliest = read.map((x) => x.from).sort()[0] ?? null
  // THE AXIS'S OWN FIRST MONTH, AS WELL AS THE EARLIEST LINE. Comparing the
  // lines against each other names a line that starts later than its
  // neighbours and names NOTHING on an axis where every line starts late —
  // which is the state a whole tenant is in for its first months, and exactly
  // when a short line most reads as a collapse. So: a line later than its
  // neighbours is named as before, and where none is but they ALL begin after
  // the axis does, every one of them is.
  const axisFirst = series.flatMap((s) => s.points.map((p) => p.month)).sort()[0] ?? null
  if (earliest) {
    const later = read.filter((x) => x.from > earliest)
    const drawn = later.length > 0
      ? later
      : axisFirst && earliest > axisFirst
        ? read
        : []
    const late = drawn.map(({ s, from }) => {
      const side = sides.find((x) => x.audience === s.audience)
      return `${side?.label ?? s.objectLabel ?? s.audience} is read from ${longMonth(from)}`
    })
    if (late.length > 0) parts.push(`${late.join('; ')}.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}

/**
 * The caveats a subject reading may carry.
 *
 * NOT THE CLUSTERING'S. `buildSeries` labels a run of months whose clustering
 * key is unrecorded, because two of a THEME's months either side of a
 * re-clustering are not the same object. A subject is not a theme: its
 * membership is a judge's answer, pinned by `JUDGE_VERSION`, and `buildSides`
 * says so in its own arithmetic (`regime: 'n/a'` on every point). Printing
 * "We did not record how themes were grouped for Apr 2021 to Sep 2026" under a
 * subject's axis is the page refusing a caveat in its numbers and printing it
 * in its prose — which is what BOTH tenants read at every horizon.
 *
 * And the notes come from the SUBJECT'S series or from nowhere. They used to
 * fall back to `history`, which spans 2019-01-01 to now for the axis
 * arithmetic, so a page drawing one month named sixty.
 *
 * THE SOURCE IS FIXED TOO (Block B fix pass): `loadMonthSeries` passes
 * `regimes: []` for any numerator kind whose table carries no clustering, so a
 * subject series no longer PRODUCES the note — which matters because this
 * filter is a page-level blanket and every other reader of a subject series
 * (WP18's monthly report, WP19's briefs) had none. This stays as the belt: the
 * notes can also arrive from a caller that built its own series.
 */
export function subjectNotes(notes: readonly MonthLabel[] | null | undefined): MonthLabel[] {
  return (notes ?? []).filter((n) => n.kind !== 'clustering_changed')
}

// ---- the rows the loader reads -------------------------------------------------

/** A stored `month_kind_readings` row, as the side builder takes it. Exported
 *  for the fixture — a block test has to be able to build one. */
export type StoredKindRow = {
  month: string
  audience: string
  kind: string
  videos: number
  comments: number
  platform_mix: Record<string, number> | null
}

interface MembershipRow {
  audience_insight_id: string
}

interface InsightRow {
  id: string
  category: string
  theme: string | null
  source_video_id: string | null
}

interface ThemeRow {
  registry_id: string | null
  label: string | null
  supporting_insight_ids: string[] | null
}

interface VideoRow {
  id: string
  platform: string | null
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
  topics: string[] | null
  upload_date: string | null
}

/** Ids per `.in()` chunk on a KEY column — one row per id. 120 uuids is ~4.4 KB
 *  of request line, half of PostgREST's usual 8 KiB cap, and the size
 *  lib/quotes.ts and lib/pages/voice.ts already use for the same shape.
 *
 *  NOT FOR A COLUMN THAT IS NOT A KEY. There the URL is not the binding
 *  constraint — the ROW cap is, and `lib/chunk.ts` `MULTI_ROW_IN_CHUNK` is the
 *  constant that says so. See `readByIds`'s `size`. */
const ID_CHUNK = 120

/**
 * An id-set read that may not be a sample.
 *
 * `.in('id', ids.slice(0, 1000))` was a silent truncation: the ids arrive in
 * uuid order, which is arbitrary, so past the cap every number computed off
 * them — the gate, the question-video count, each row's count — was computed
 * over ~1,000 arbitrary insights and printed as the whole. Össur carries 3,129
 * live insights today and Sealand 2,872, so a subject that is a third of the
 * corpus is already there. Chunks are disjoint by id and read in parallel, the
 * way the quote layer reads its own.
 *
 * AND THE CHUNK SIZE DEPENDS ON WHETHER THE COLUMN IS A KEY (perf review,
 * `main`'s M21 in this file). `ID_CHUNK`'s 120 is sized against the URL, which
 * is the right constraint when an id names ONE row. When it names many, the
 * binding constraint is PostgREST's 1,000-row page: `audience_insights_current
 * .in('source_video_id', …)` returns ~30 insights a video, so 120 videos is
 * ~3,600 rows — and `selectAll` pages those SERIALLY, inside a chunk that was
 * going to be one of several concurrent requests. `lib/chunk.ts`
 * `MULTI_ROW_IN_CHUNK` is the constant for that case and carries the
 * arithmetic; passing it here is four requests becoming three, each of which
 * can overlap with its neighbours. Latency only — `selectAll` pages either
 * way, so nothing was ever truncated.
 */
async function readByIds<T>(
  ids: readonly string[],
  fetch: (part: string[]) => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> },
  /** Ids per request. The default is the KEY-column size; a read whose `.in()`
   *  column is not a key passes `MULTI_ROW_IN_CHUNK`. */
  size: number = ID_CHUNK,
): Promise<T[]> {
  if (ids.length === 0) return []
  const pages = await mapWithLimit(chunk([...ids], size), READ_CONCURRENCY, (part) => selectAll<T>(() => fetch(part)))
  return pages.flat()
}

/** The tenant's subjects, or null where M4 is not applied here.
 *
 *  EXPORTED FOR WP18 (one line, additive): the monthly report prints one voice
 *  per subject and needs the same set this page draws its rail from. A second
 *  read of `subjects` would be a second answer to "which subjects does this
 *  workspace have". */
export async function loadSubjectRows(supabase: SupabaseClient, clientId: string): Promise<Subject[] | null> {
  try {
    return await selectAll<Subject>(() =>
      supabase
        .from(TABLE_SUBJECTS)
        .select('*')
        .eq('client_id', clientId)
        .neq('status', 'retired')
        .order('named_at', { ascending: true })
        .order('id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

/** Every move this tenant has declared on a subject. Null where M4 is absent. */
async function loadSubjectMoves(supabase: SupabaseClient, clientId: string): Promise<Move[] | null> {
  try {
    return await selectAll<Move>(() =>
      supabase
        .from(TABLE_MOVES)
        .select('*')
        .eq('client_id', clientId)
        .eq('kind', 'subject')
        .order('declared_at', { ascending: false })
        .order('id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

/**
 * The member insight ids of MANY subjects, in one read.
 *
 * One statement for a workspace's whole subject list rather than one per
 * subject: the monthly report asks for every active subject at once, and N
 * chunked reads fired together is the shape that costs an instance its IO
 * budget. Null — never an empty map — where M4 is not applied, the same answer
 * the single-subject read gives.
 */
export async function loadMemberInsightIdsBySubject(
  supabase: SupabaseClient,
  clientId: string,
  subjectIds: readonly string[],
): Promise<Map<string, string[]> | null> {
  const out = new Map<string, string[]>(subjectIds.map((id) => [id, []]))
  if (subjectIds.length === 0) return out
  try {
    const rowsOut = await selectAll<MembershipRow & { subject_id: string }>(() =>
      supabase
        .from(TABLE_SUBJECT_MEMBERSHIPS)
        .select('subject_id, audience_insight_id')
        .eq('client_id', clientId)
        .in('subject_id', [...subjectIds])
        .eq('member', true)
        .order('audience_insight_id', { ascending: true }),
    )
    const seen = new Map<string, Set<string>>(subjectIds.map((id) => [id, new Set<string>()]))
    for (const r of rowsOut) {
      const held = out.get(r.subject_id)
      const marked = seen.get(r.subject_id)
      if (!held || !marked || marked.has(r.audience_insight_id)) continue
      marked.add(r.audience_insight_id)
      held.push(r.audience_insight_id)
    }
    return out
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

/**
 * The selected subject's member insights, each with what the month rule reads
 * (WP2.2): its kind, its video (whose audience and analysis), and its evidence
 * with each comment's date. ONE PAGED READ, embedded through the foreign keys
 * (membership → insight → video, and → evidence → comment), in place of the
 * member-id read the pane already made: Looks & style on staging is 180 member
 * insights and 1,073 evidence rows. Null where M4 is not applied here.
 */
export async function loadSubjectMembers(
  supabase: SupabaseClient,
  clientId: string,
  subjectId: string,
): Promise<SubjectMember[] | null> {
  type Row = {
    audience_insight_id: string
    audience_insights: {
      category: string | null
      source_video_id: string | null
      videos: { is_client: boolean | null; analyzed_run_id: string | null } | null
      insight_evidence: { source: string | null; comments: { comment_date: string | null } | null }[] | null
    } | null
  }
  try {
    const rows = await selectAll<Row>(() =>
      supabase
        .from(TABLE_SUBJECT_MEMBERSHIPS)
        .select('audience_insight_id, audience_insights!inner(category, source_video_id, videos(is_client, analyzed_run_id), insight_evidence(source, comments(comment_date)))')
        .eq('client_id', clientId)
        .eq('subject_id', subjectId)
        .eq('member', true)
        .order('audience_insight_id', { ascending: true }) as never,
    )
    // A to-one embed comes back as an object; read an array's first as the
    // same, so a client that types it as a list cannot drop the row.
    const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
    const seen = new Set<string>()
    const out: SubjectMember[] = []
    for (const r of rows) {
      if (seen.has(r.audience_insight_id)) continue
      seen.add(r.audience_insight_id)
      const ai = one(r.audience_insights)
      const video = one(ai?.videos)
      out.push({
        insightId: r.audience_insight_id,
        kind: ai?.category ?? null,
        videoId: ai?.source_video_id ?? null,
        client: video?.is_client === true,
        analysed: video?.analyzed_run_id != null,
        evidence: (ai?.insight_evidence ?? []).map((e) => ({ source: e.source ?? null, commentDate: one(e.comments)?.comment_date ?? null })),
      })
    }
    return out
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

/** The month's market videos, and which of them are makers' (WP2.2). */
export interface MarketMakers {
  /** Every market video with a comment dated in the month (MF1
   *  `market_month_videos`), or null where it could not be read. */
  occupies: Set<string> | null
  /** The maker videos among them (MF1 `segments_for_videos`), or null where
   *  the tenant has no maker rule or the read failed. */
  makers: Set<string> | null
  /** MF2 `lens_readings` over the maker videos, or null (not measured). */
  lens: { audience: string; object_kind: string; object_id: string; k: number }[] | null
}

const RPC_MISSING = new Set(['PGRST202', '42883'])
const rpcMissing = (error: { code?: string | null } | null | undefined): boolean => RPC_MISSING.has(error?.code ?? '')

/**
 * The reading month's market videos and their makers, and every subject's
 * videos among the makers (WP2.2: "maker shares via MF2's lens_readings").
 * Three service-role calls, in turn, on the reading client (the functions are
 * granted to service_role only): `market_month_videos`, `segments_for_videos`
 * over those ids, and `lens_readings` over the maker ids. FAILS CLOSED: a read
 * that fails leaves its part null, which the page prints as not measured,
 * never as 0. A tenant with no maker rule (`segmentRulesEnabled`, Össur) reads
 * the month's videos only.
 */
export async function loadMarketMakers(
  client: SupabaseClient,
  clientId: string,
  month: string,
  /** The month's market videos, where the caller has read them already (Your
   *  market reads them once for its brands block too). `onSegments` is handed
   *  the segments read, where it succeeded, for a caller that wants more of it
   *  (Your market's headline voices; d3 speed pass). */
  opts: { ids?: Promise<string[] | null> | null; onSegments?: (segments: ReadonlyMap<string, string | null>) => void } = {},
): Promise<MarketMakers> {
  const out: MarketMakers = { occupies: null, makers: null, lens: null }
  const log = (what: string, error: { message?: string; code?: string | null }) => {
    if (!rpcMissing(error)) console.error(`[subjects] ${what}: ${error.message ?? String(error)}; not measured`)
  }
  let ids: string[]
  if (opts.ids) {
    const held = await opts.ids
    if (held == null) return out
    ids = [...new Set(held)]
  } else {
    const mv = await client.rpc('market_month_videos', { p_client: clientId, p_month: monthStartOf(month) })
    if (mv.error) { log('market_month_videos', mv.error); return out }
    ids = [...new Set(((mv.data ?? []) as { video_id: string }[]).map((r) => String(r.video_id)))]
  }
  out.occupies = new Set(ids)
  if (!segmentRulesEnabled(clientId)) return out
  if (ids.length === 0) return { ...out, makers: new Set(), lens: [] }
  const seg = await client.rpc('segments_for_videos', { p_client: clientId, p_video_ids: ids })
  if (seg.error) { log('segments_for_videos', seg.error); return out }
  const segRows = (seg.data ?? []) as { video_id: string; segment: string | null }[]
  opts.onSegments?.(new Map(segRows.map((r) => [String(r.video_id), r.segment ?? null])))
  const makers = new Set(segRows.filter((r) => r.segment === 'maker').map((r) => String(r.video_id)))
  out.makers = makers
  if (makers.size === 0) return { ...out, lens: [] }
  const lens = await client.rpc('lens_readings', { p_client: clientId, p_month: monthStartOf(month), p_run: null, p_video_ids: [...makers] })
  if (lens.error) { log('lens_readings', lens.error); return out }
  out.lens = ((lens.data ?? []) as { audience: string; object_kind: string; object_id: string; k: number }[]).map((r) => ({ ...r, k: Number(r.k) }))
  return out
}

// ---- SU4 · your own posts ------------------------------------------------------

interface OwnPostRow {
  id: string
  upload_date: string | null
  comments_count: number
  hook_style: string | null
  classified_type: string | null
}

interface OwnClaimStored {
  id: string
  source_video_id: string
  claim: string
}

/** The month's own posts as half-open calendar days — the census's ONLY filter,
 *  because a post is placed by the day it was published. */
function monthDays(month: string): { from: string; to: string } {
  const start = monthStartOf(month)
  const d = new Date(`${start}T00:00:00.000Z`)
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  return { from: start, to: next.toISOString().slice(0, 10) }
}

/**
 * What you published this month, and what those posts said.
 *
 * FOUR READS, EACH BOUNDED BY THE MONTH'S OWN POSTS. The videos, the claims,
 * the insights those posts drew and the subject memberships over exactly those
 * insights. The video read is NOT an index seek on the date, and the docblock
 * said it was: `videos` carries twelve indexes and none of them is on
 * `upload_date` (checked 2026-09-18; `videos_client_upload_date_idx` is written
 * in 20260918094000 and not applied anywhere). The plan takes
 * `videos_client_id_idx` and filters the month out, which on 3,927 and 4,450
 * rows a tenant is cheap — an accuracy fix, not a performance one, and after
 * the 2026-09-16 outage a docblock claiming a read is indexed when it is not is
 * the wrong thing to leave lying around. Nothing here reads a
 * cumulative corpus and nothing here touches `audience_insights.embedding` —
 * the population read goes through `audience_insights_current` and selects
 * three columns (AGENTS.md).
 *
 * WHOSE POST IT IS FOLLOWS `claimEntity`'s RULE, NOT ONE COLUMN. A post read
 * off your own profile IS yours whatever a caption-only re-tag later decided —
 * Sealand carries 13 `source = 'owned'` rows with `is_client = false`, two of
 * them with 18 claims between them (lib/pipeline/claims.ts). So the filter is
 * `is_client OR source = 'owned'`, which is authorship first and subject
 * second, exactly as the claims loader resolves it.
 *
 * AND THE CLAIMS HALF MAY NOT BE READABLE. `video_claims` carries RLS with no
 * tenant SELECT policy until M8, so a member's read comes back EMPTY WITH NO
 * ERROR — an empty half that reads as "you claimed nothing" is the failure
 * `UNANSWERED_CLAIMS_UNREADABLE` exists to avoid one tile down. The test is
 * the all-time read, not the month's: a tenant with 106 and 108 stored claims
 * that reads zero of them has been refused, not answered, and the census says
 * which half it read (`ownCensusWithClaims`). Even after M8 the verbatim
 * `quote` column is not granted to `authenticated`, so a claim row arrives
 * without its words and the census carries no quote for it — withheld by a
 * policy, not missing.
 *
 * AND "NOT READ" IS NOT "NONE NAMED" (fix pass, SB1). `subjects` is NULL where
 * the subject set itself could not be read — M4 unapplied, which is where both
 * production tenants are today — and an empty ARRAY where it was read and is
 * empty. Collapsed to one empty array they both produced
 * `subjectScope: { named: 0 }`, so the census printed `SUBJECTS_NONE_NAMED`:
 * "No subject is named yet ... name one and this starts counting", 200px under
 * a rail saying "We cannot read the set from this page yet, so it cannot be
 * added to or changed here" with the Add control removed. Two sentences, one
 * screenful, and the one the client can act on is the false one. A census that
 * cannot see the set says NOTHING about it and lets the rail answer.
 */
export async function loadOwnPosts(
  supabase: SupabaseClient,
  clientId: string,
  month: string,
  /** The active subjects, or NULL where the set could not be read at all. */
  subjects: readonly Subject[] | null,
  echoes: readonly ClaimEcho[] = [],
): Promise<OwnPostCensus> {
  const days = monthDays(month)
  const [videos, claims] = await Promise.all([
    selectAll<OwnPostRow>(() =>
      supabase
        .from('videos')
        .select('id, upload_date, comments_count, hook_style, classified_type')
        .eq('client_id', clientId)
        .or('is_client.eq.true,source.eq.owned')
        .gte('upload_date', days.from)
        .lt('upload_date', days.to)
        .order('id', { ascending: true }),
    ),
    // NO `quote`. M8 grants `authenticated` a named column list that excludes
    // it, so asking for it is a permission error on the day M8 lands rather
    // than a wider read — and the census prints claims without verbatim words
    // by design (the migration's own comment on the column).
    //
    // AND NO `entity` FILTER, for the reason the video half has none either.
    // `video_claims.entity` froze `videos.is_client` at the run that wrote the
    // row, and a re-tag since rewrites the video and never the claim — 72 of
    // Sealand's 376 stored rows disagree with their video today, 18 of them on
    // Sealand's own posts (lib/pipeline/claims.ts). Filtering on it would drop
    // a claim sitting on one of THIS MONTH'S own posts because an older run
    // called that post a competitor's — and because `claims.length > 0` is
    // also the "was this half readable" test, a tenant whose every row is
    // stale would be told the claims half was REFUSED rather than empty. The
    // filter buys nothing either: `ownPostCensus` keeps only claims whose
    // `source_video_id` is one of the posts the video half already selected by
    // the LIVE rule, and M8's RLS enforces `entity = 'client'` on the tenant
    // path regardless.
    selectAll<OwnClaimStored>(() =>
      supabase
        .from('video_claims')
        .select('id, source_video_id, claim')
        .eq('client_id', clientId)
        .order('id', { ascending: true }),
    ).catch(() => [] as OwnClaimStored[]),
  ])

  // The subjects these posts matched: insights on exactly these videos, then
  // the membership rows over exactly those insights. Both directions are
  // bounded by the month's own posts — 17 on Sealand in September — rather
  // than by the subject's whole membership, which runs to thousands.
  const postIds = videos.map((v) => v.id)
  let membership: OwnPostInput['membership'] = []
  // How many of the month's own posts have been READ at all. It is what lets
  // an empty subject list say which of three things happened, and on both
  // tenants today it is zero — Sealand has no `audience_insights_current` row
  // on any of its seventeen September posts, so without this the tile would
  // read "about none of your subjects" when nothing has been analysed.
  let analysedPosts = 0
  if (postIds.length > 0 && subjects != null && subjects.length > 0) {
    const insights = await readByIds<{ id: string; source_video_id: string | null }>(postIds, (part) =>
      supabase
        .from('audience_insights_current')
        .select('id, source_video_id')
        .eq('client_id', clientId)
        .in('source_video_id', part)
        .order('id', { ascending: true }),
      // NOT A KEY: ~30 insights a video, so the row cap binds long before the
      // URL does. `readByIds`'s own note has the arithmetic.
      MULTI_ROW_IN_CHUNK,
    )
    const videoOf = new Map(insights.map((i) => [i.id, i.source_video_id]))
    analysedPosts = new Set(insights.map((i) => i.source_video_id).filter((v): v is string => !!v)).size
    if (insights.length > 0) {
      const rows = await readByIds<{ subject_id: string; audience_insight_id: string }>(
        insights.map((i) => i.id),
        (part) =>
          supabase
            .from(TABLE_SUBJECT_MEMBERSHIPS)
            .select('subject_id, audience_insight_id')
            .eq('client_id', clientId)
            .eq('member', true)
            .in('audience_insight_id', part)
            .order('audience_insight_id', { ascending: true }),
        // NOR IS THIS ONE: an insight carries one membership row per named
        // subject, and the set is 5-8 by design (SUBJECTS_MAX), so 120 ids sat
        // within a few rows of the 1,000-row page boundary.
        MULTI_ROW_IN_CHUNK,
      ).catch((error) => {
        if (isMissingSubjects(error)) return []
        throw error
      })
      const bySubject = new Map<string, Set<string>>()
      for (const r of rows) {
        const vid = videoOf.get(r.audience_insight_id)
        if (!vid) continue
        const held = bySubject.get(r.subject_id) ?? new Set<string>()
        held.add(vid)
        bySubject.set(r.subject_id, held)
      }
      // Each row carries its calibration: the census prints a subject's match
      // on your own posts only once the subject is ready (decision C).
      membership = (subjects ?? [])
        .filter((s) => bySubject.has(s.id))
        .map((s) => ({ subjectId: s.id, label: s.name, videoIds: [...(bySubject.get(s.id) ?? [])], calibration: subjectCalibration(s) }))
    }
  }

  const input: OwnPostInput = {
    month,
    audience: CLIENT_AUDIENCE,
    audienceLabel: 'You',
    videos,
    // `entity` is the census's, not the row's. Every claim that survives the
    // census's own month filter sits on a post the LIVE rule already called
    // yours, so the answer to "whose post was this" is the audience this
    // census counts — never the column a run froze and a re-tag left behind.
    claims: claims.map((c) => ({ ...c, entity: CLIENT_AUDIENCE, quote: '' })),
    membership,
    echoes,
    // NULL, NOT `{ named: 0 }`, where the set is unreadable — see the header.
    subjectScope: subjects == null ? null : { named: subjects.length, analysedPosts },
  }
  // `claims.length` is the ALL-TIME read, so "we read nothing at all" is what
  // marks the half as closed — never the month's own zero, which is a real
  // reading and has to be allowed to be one.
  return ownCensusWithClaims(input, claims.length > 0)
}

/** The say-vs-hear ledger as counts, off THE RUN MARKET READS.
 *
 *  `ledgerRows` with no cap, then `claimCounts` — Market's own two lines, so
 *  the two tiles cannot disagree (lib/pages/market.ts). That promise is about
 *  the ROW SELECTION as much as the computation, and this read used to break
 *  it: it took the newest summary that HAD a `say_vs_hear`, ordered by
 *  `run_date`, so on a tenant whose newest update produced no ledger the two
 *  pages read different runs and printed different counts. `run_date` is a
 *  weak key for "newest" besides — it is the wall clock at persist, and one
 *  run has carried two of them (AGENTS.md).
 *
 *  So the run is the page's own latest completed update, which is the run
 *  `loadMarket` picks by the same status filter and the same ordering. When
 *  that run resolved no claim both pages say so, which is the honest pair of
 *  answers; a page that reaches back for an older ledger is printing a reading
 *  of an update the heading above it does not name. */
async function loadSayHear(supabase: SupabaseClient, clientId: string, runId: string): Promise<{ counts: ClaimCounts | null; entries: SayVsHearEntry[] }> {
  const res = await supabase
    .from('run_summary')
    .select('say_vs_hear')
    .eq('client_id', clientId)
    .eq('run_id', runId)
    .maybeSingle()
  const entries = ((res.data as { say_vs_hear: SayVsHearEntry[] | null } | null)?.say_vs_hear ?? []) as SayVsHearEntry[]
  if (entries.length === 0) return { counts: null, entries: [] }
  const rows = ledgerRows(entries, Number.MAX_SAFE_INTEGER)
  return { counts: claimCounts(rows), entries: rows }
}

// ---- the loader ---------------------------------------------------------------

/**
 * The Subjects page, for one tenant, one horizon and one selected subject.
 *
 * Null is the first-run empty state: a tenant with no delivered update has no
 * reading of anything.
 */
export async function loadSubjectsPage(scope: Scope): Promise<SubjectsData | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId, params } = scope
  const reading: ReadingHandle = scope.reading
  const readingAt = new Date().toISOString()
  const { horizon, questions: questionsHorizon } = subjectsHorizons(params)

  // Wave 1 holds what the empty-state guard itself needs and what the page
  // cannot be shaped without; anything else starts on the line after the guard,
  // so a tenant that draws nothing pays for nothing.
  const [clientRes, runsRaw, rivals, subjectRows, moveRows, schedule] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    // With their finish instants, for the reading month (market-first WP1.2).
    loadDeliveredRuns(supabase, clientId),
    loadTrackedRivals(supabase, clientId),
    loadSubjectRows(supabase, clientId),
    loadSubjectMoves(supabase, clientId),
    loadReadingSchedule(supabase, clientId),
  ])
  const brand = (clientRes.data as { company_name?: string | null } | null)?.company_name ?? 'Your brand'
  if (runsRaw.length === 0) return null

  // WHICH SUBJECT IS SELECTED IS A PURE FUNCTION OF WAVE 1 AND THE URL, so it
  // is answered here rather than after the axis — the themed run is the only
  // read that depends on the answer, and asking it early is what lets that read
  // overlap wave 2 instead of sitting alone between two waves.
  const active = (subjectRows ?? []).filter((s) => s.status === 'active')
  const proposed = (subjectRows ?? []).filter((s) => s.status === 'proposed')
  // THE THREE CALIBRATION STATES (decision C, WP1.1), once per subject. A
  // subject being re-described is hidden everywhere: its rail row says so and
  // it is never the pane, whatever the URL asks for.
  const calibrationOf = new Map(active.map((s) => [s.id, subjectCalibration(s)]))
  // WHICH SUBJECT OPENS (WP2.2): the one asked for, else the rail's first,
  // which is the market's biggest (the preview opens on Looks & style). The
  // rail is ranked after the months are read, so here only WHETHER one will
  // open is settled: the themed run and the pane's reads depend on that alone.
  const selectable = active.filter((s) => calibrationOf.get(s.id) !== 'failed')
  const opensOne = selectable.length > 0

  // THE THEMED RUN, STARTED HERE AND TAKEN WHERE IT IS USED (WP23). It waits
  // on the running-run ids and on nothing else, and it used to be read inside
  // the selected subject's branch, behind the whole axis. Started here it
  // overlaps wave 2 — and ONLY WHEN A SUBJECT IS SELECTED, because the pane is
  // the only thing that reads it: a rail with nothing open makes the two reads
  // it made before this package, not two more.
  const themedRunAhead = opensOne
    ? fetchRunningRunIds(supabase, clientId, 'subjects').then((ids) =>
        fetchThemedRunId(supabase, clientId, ids, 'subjects'),
      )
    : null
  themedRunAhead?.catch(() => {})

  const updatesByMonth: Record<string, number> = {}
  for (const r of runsRaw) {
    const m = monthStartOf(r.started_at)
    updatesByMonth[m] = (updatesByMonth[m] ?? 0) + 1
  }
  const firstRunMonth = monthStartOf(runsRaw[0].started_at)
  // `runsRaw` is the completed/partial updates in started_at order, which is
  // `loadMarket`'s own filter read the other way round — so its last row is the
  // run Market calls "latest", and the claims ledger below reads that one.
  const latestRunId = runsRaw[runsRaw.length - 1].id

  // The whole denominator history decides the axis — `sinceStart` is what
  // "since we started" means (decision M) and the horizon is computed from it.
  const history = await loadMonthSeries(reading.client, clientId, {
    from: '2019-01-01',
    to: readingAt,
    updatesByMonth,
    firstRunMonth,
  })
  const started = sinceStart(history.denominators.map((d) => ({ month: d.month, videos: d.videos })))
  // THE READING MONTH (market-first decision A): the month that has just ended
  // until the new one is half over with two updates, or `?month=`. The horizon
  // and the chart are anchored on it, so `month` below is `reading.month`.
  const view = readingViewFrom({
    now: readingAt,
    runs: runsRaw,
    denominators: history.denominators,
    rivalAudiences: marketRivalAudiences(rivals),
    schedule,
    explicit: params[MONTH_PARAM] ?? null,
  })
  const rm = view.reading
  const window = horizonWindow(horizon, readingAnchor(rm), started.from)
  const questionsWindow = questionsHorizon === horizon ? window : horizonWindow(questionsHorizon, readingAnchor(rm), started.from)
  const axis = window.months
  const month = axis[axis.length - 1]
  // The page reads one month wider than it draws: "this month" is a one-month
  // axis, and the comparison is the calendar's, not the horizon's (OV0's rule).
  const prevMonth = previousMonthOf(month)
  const readAxis = axis[0] <= prevMonth ? axis : [prevMonth, ...axis]
  // THE THREE-MONTH READ AXIS (market-first WP3.4, `readAxisOf`): the months
  // the pane's direction words are read over, off the chart's own lines, which
  // reach back further (below). No read of its own.
  const wordAxis = readAxisOf(window)
  // Frozen once an UPDATE has passed its freeze line, not the clock.
  const monthStatus = freezeStateFor(month, rm.asAt ?? readingAt)
  // The chart's axis is its own (`chartMonths`). Where it reaches further back
  // than the read axis, the selected subject is read a second time over it —
  // for the chart alone — so the hero, the rail, the gap and the notes read
  // exactly the months they read before the chart was widened.
  const chartAxis = chartMonths(readingAnchor(rm), started.from)
  const chartSet = new Set(chartAxis)
  const onChart = (s: MonthSeries): MonthSeries =>
    ({ ...s, points: s.points.filter((p) => chartSet.has(monthStartOf(p.month))) })

  // NO RECORD READ (WP2.2): the record's lines fed the "How sound" pill,
  // which left every page on 25 Sep, and no block here prints the method
  // footnote; the page's read budget (plan §5.4) pays for the market's reads.
  // THE MONTH-PAIR JUDGE (decision D, WP1.3): every verdict, direction word
  // and chart step on the page is judged by it.
  const judgeAhead = loadAppPairOn(reading, readingAt)

  const perAudience = new Map<string, number>()
  const denominatorByMonth = new Map<string, number>()
  for (const d of history.denominators) {
    perAudience.set(`${monthStartOf(d.month)}|${d.audience}`, d.videos)
    denominatorByMonth.set(d.month, (denominatorByMonth.get(d.month) ?? 0) + d.videos)
  }

  // A thin month suppresses every band on the page, exactly as it does on
  // Overview — one gate, one answer for the builders.
  const historyMonths = [...denominatorByMonth.keys()].sort()
  const trailing = historyMonths.filter((m) => m < month && m >= firstRunMonth).slice(-12)
    .map((m) => denominatorByMonth.get(m) ?? null)
  const thin = thinMonth(
    { month, videos: denominatorByMonth.get(month) ?? null, k: null },
    trailing,
    { updates: updatesByMonth[month] ?? 0, firstRunMonth },
  )

  // ── SU2 · the selected subject's months ───────────────────────────────
  // `active`, `proposed` and `selectedId` are settled above wave 2, beside the
  // read that depends on them.
  const leadRival = rivals.find((r) => !r.retiredAt) ?? rivals[0] ?? null
  const audiences = [CLIENT_AUDIENCE, ...rivals.map((r) => rivalKey(r.name)), INDUSTRY_AUDIENCE]

  // SU4 AND THE CLAIMS LEDGER RIDE WITH THE MONTH READS. Neither depends on
  // the selected subject and neither is on anything's critical path, so they
  // overlap the two reads that are.
  // `subjectRows == null` is "the set could not be read", which the census
  // must not report as "none is named" — the rail's own sentence answers that
  // state and this tile stays quiet about the set.
  const ownPostsAhead = loadOwnPosts(supabase, clientId, month, subjectRows == null ? null : active)
  const sayHearAhead = loadSayHear(supabase, clientId, latestRunId)
  // EACH CLAIM COUNTED THE WAY YOUR MOVES COUNTS IT (walkthrough item 8): in
  // the month's market, with your own followers apart. A failure here prints
  // the ledger's stances as before rather than losing the tile.
  const echoesAhead: Promise<ClaimEcho[] | null> = sayHearAhead
    .then((sh) => loadClaimEchoes({ supabase, reading, clientId, month, entries: sh.entries }))
    .catch((e: unknown) => {
      console.error(`[pages] subjects.claimEchoes: ${(e as { message?: string })?.message ?? String(e)}`)
      return null
    })
  ownPostsAhead.catch(() => {})
  sayHearAhead.catch(() => {})

  // THE MONTH'S MAKERS (WP2.2), beside the month reads: the rail's maker tags,
  // the pane's "Who posted them" and the voices' maker mark. Fails closed.
  const makersAhead: Promise<MarketMakers> = active.length > 0
    ? loadMarketMakers(reading.client, clientId, month).catch((error: unknown) => {
        console.error(`[subjects] makers: ${(error as { message?: string })?.message ?? String(error)}; not measured`)
        return { occupies: null, makers: null, lens: null }
      })
    : Promise.resolve({ occupies: null, makers: null, lens: null })
  // When each search first ran (`keyword_performance`), for the pane's "Where
  // we found them", beside the month reads.
  const keywordRunsAhead = opensOne ? loadKeywordRuns(reading.client, clientId) : Promise.resolve(null)
  // The next pair read the same way, for the Month by month cards: the judge's
  // own pair rows (memoised, so no second read).
  const pairRowsAhead = opensOne ? loadPairRows(reading.client, clientId, null).catch(() => null) : Promise.resolve(null)
  // Every subject's question videos over the last 3 months (the questions
  // tile's "Asked most"), one read beside the month reads.
  const last3 = horizonWindow('last_3', readingAnchor(rm), started.from)
  const askedMostAhead = opensOne
    ? loadQuestionsBySubject(supabase, clientId, selectable.map((s) => s.id), { from: last3.from, to: last3.to }).catch((error: unknown) => {
        console.error(`[subjects] asked most: ${(error as { message?: string })?.message ?? String(error)}`)
        return null
      })
    : Promise.resolve(null)

  const [subjectSet, kindRows, chartRead] = await Promise.all([
    opensOne
      ? loadMonthSeries(reading.client, clientId, {
          from: readAxis[0],
          to: month,
          audiences,
          objectKind: 'subject',
          objectIds: active.map((s) => s.id),
          updatesByMonth,
          firstRunMonth,
          changeLogFrom: history.changeLogFrom,
        })
      : Promise.resolve(null),
    // NO KIND-MIX READ (WP2.2): the pane's kinds are the subject's own
    // (`kindsIn`, off the members the pane reads), and each audience's whole
    // kind mix is not drawn on the market page. A pane's sides carry none.
    Promise.resolve(null as StoredKindRow[] | null),
    opensOne && chartAxis[0] < readAxis[0]
      ? loadMonthSeries(reading.client, clientId, {
          from: chartAxis[0],
          to: month,
          audiences,
          objectKind: 'subject',
          objectIds: selectable.map((s) => s.id),
          updatesByMonth,
          firstRunMonth,
          changeLogFrom: history.changeLogFrom,
        })
      : Promise.resolve(null),
  ])

  const pair = await judgeAhead

  // WAS EACH SUBJECT READ IN EACH MONTH AT ALL? (WP1.1 review, finding 1.)
  // The month series fills a 0 wherever the audience has a denominator row,
  // which is true only for a subject the month's update read: one named after
  // it (Community & purpose on staging, named 24 Sep at 12:41 after the
  // 12:15 update) printed "0 of 654 in your market", a measurement nobody
  // made. A month the subject was not read in reads as no reading on every
  // line, the rail, the pane's sides and its chart (`lib/subjects/read-in.ts`).
  // The change log is the one `loadMonthSeries` already read (memoised), so
  // this costs no read.
  const marketRivals = marketRivalAudiences(rivals)
  const changes = await loadChanges(reading.client, clientId)
  // WEEK BY WEEK, READ AT THE SAME AGE (WP3.13, §2.3 S6): the kept line, read
  // only once WEEK_LINE says print, and only when a subject opens.
  const weekStripAhead = opensOne
    ? loadWeekStrip(reading.client, {
        clientId,
        cfg: weekLineConfigFor(clientId),
        reading: rm,
        now: readingAt,
        asAt: rm.asAt,
        rivalAudiences: marketRivals,
        changes: ourChangesWithoutGatherFlags(changes),
        objects: selectable.map((s) => ({ objectKind: 'subject' as const, objectId: s.id, label: s.name, calibration: calibrationOf.get(s.id) })),
        nextUpdateAfter: schedule ? scheduledUpdateAfter(schedule) : null,
      })
    : null
  weekStripAhead?.catch(() => {})
  const writtenAt = monthsWrittenAt(history.denominators, new Set(marketAudiences(marketRivals)))
  const countedFrom = new Map(active.map((s) => [s.id, subjectCountedFrom(s as CountedSubject, changes)]))
  const cited = new Map<string, Set<string>>()
  for (const line of [...(subjectSet?.series ?? []), ...(chartRead?.series ?? [])]) {
    if (!line.objectId) continue
    for (const p of line.points) {
      if ((p.k ?? 0) <= 0) continue
      const months = cited.get(line.objectId) ?? new Set<string>()
      months.add(monthStartOf(p.month))
      cited.set(line.objectId, months)
    }
  }
  const backRead = new Map(active.map((s) => [s.id, subjectBackRead(countedFrom.get(s.id) ?? null, cited.get(s.id) ?? [], writtenAt)]))
  const readIn = (subjectId: string, m: string) =>
    subjectReadIn({
      countedFrom: countedFrom.get(subjectId) ?? null,
      writtenAt: writtenAt.get(monthStartOf(m)),
      cited: cited.get(subjectId)?.has(monthStartOf(m)) ?? false,
      backRead: backRead.get(subjectId) ?? false,
    })
  const unreadIn = (subjectId: string) => (m: string) => readIn(subjectId, m) === 'unread'
  const seriesFor = (subjectId: string, audience: string): MonthSeries | null => {
    const line = subjectSet?.series.find((s) => s.objectId === subjectId && s.audience === audience) ?? null
    return line ? withoutUnreadMonths(line, unreadIn(subjectId)) : null
  }
  const chartSeriesFor = (subjectId: string, audience: string): MonthSeries | null => {
    const line = (chartRead ?? subjectSet)?.series.find((s) => s.objectId === subjectId && s.audience === audience) ?? null
    return line ? withoutUnreadMonths(line, unreadIn(subjectId)) : null
  }

  // CONFIRMED FIRST, THEN NAMED-BUT-NOT-CONFIRMED, and both in the ONE list.
  // A proposed subject was kept out of the rail at first and listed underneath
  // as prose, which left the only control that can start it counting — Confirm
  // — on a row a client could not reach. The editor is the whole live set; the
  // row says which of the two it is.
  // THE MARKET'S SIDE OF EACH ROW (decision E), pooled over the tracked
  // brands' audiences and the category from the rows already read: no read of
  // its own. It is what a provisional row prints (decision C).
  const marketCounts = pooledDenominators(history.denominators, marketRivals)
  const marketOf = (subjectId: string, m: string = month) =>
    railMarketSide({
      read: readIn(subjectId, m),
      month: m,
      // Every market audience with a denominator row this month: a line the
      // page did not read (no subject selected) is null, which is unknown and
      // makes the whole side unknown, never a partial sum.
      rows: marketAudiences(marketRivals)
        .filter((audience) => perAudience.has(`${m}|${audience}`))
        .map((audience) => {
          const line = seriesFor(subjectId, audience)
          return { audience, k: line ? pointsByMonth(line).get(m)?.k ?? null : null }
        }),
      counts: marketCounts,
      rivalAudiences: marketRivals,
    })
  const unreadNote = unreadWords({ month, filling: monthStatus === 'filling', nextUpdate: rm.nextUpdate })

  // THE RAIL READS THE MARKET (decision C with decision E, WP1.1). A
  // subject's market level always prints unless its check clearly failed, and
  // its client level only once it is ready; the client level lives in the
  // pane's "you" side, so the rail prints the market for every row and a word
  // where one is due. (Staging holds no client-audience month rows for August
  // or September, so a rail of client levels printed "no reading yet" on
  // every ready row.) NO CHANGE BADGE on the rail: no month pair is read the
  // same way before the 6 Dec update, and a refusal on every row is the
  // sentence the deploy-1 review (R3) took off rows; WP2.2 rebuilds the rail.
  //
  // RANKED BY THE MARKET (WP2.2, §2.3 S1): the market's k this month, largest
  // first; a subject with no figure (not read yet, being re-described) after
  // every one with a figure; a subject named but not confirmed last. Each row
  // carries the month before on the same base, and its maker share (decision
  // F: printed at a fifth or more).
  //
  // THE MONTH BEFORE ONLY WHERE THE MARKET PAIR JOINS (T0a, SB-14). The rail
  // printed August beside September on every row with no pair check at all;
  // where the judge refuses the pair (Sealand's September: our searches
  // changed), the rail carries no month before, on any row, and no column.
  const railPrevShown = joins(pair(prevMonth, month, MARKET_LINE))
  const railRows: SubjectRail[] = [...active, ...proposed].map((s) => {
    // A proposed subject was never checked and measures nothing; its row says
    // "not counted yet" whatever the state (`railNote`).
    const calibration = calibrationOf.get(s.id) ?? subjectCalibration(s)
    const counted = s.status === 'active' && calibration !== 'failed' ? marketOf(s.id) : null
    const before = counted && railPrevShown ? marketOf(s.id, prevMonth) : null
    const unread = s.status === 'active' && readIn(s.id, month) === 'unread'
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      origin: s.origin,
      namedAt: s.named_at,
      status: s.status,
      calibration,
      level: null,
      market: counted
        ? { k: counted.k, n: counted.n, pct: carriesShare(counted.n) ? pctOf(counted.k, counted.n) : null }
        : null,
      marketPrev: before ? { k: before.k, n: before.n } : null,
      // Filled in below, once the maker read is in: it runs beside the pane's
      // reads rather than in front of them.
      makerShare: null,
      note: railNote(calibration, counted != null, s.status, unread ? unreadNote : null),
      verdict: null,
      selected: false,
      // A subject being re-described opens nothing: there is no pane to show.
      href: s.status === 'active' && calibration !== 'failed' ? `/dashboard/subjects?item=${encodeURIComponent(s.id)}` : '',
    }
  })
  const rail = [...railRows].sort(byRailRank).slice(0, RAIL_MAX)
  const selectedId = selectSubject(rail.filter((r) => r.status === 'active' && readCalibration(r.calibration) !== 'failed'), params.item)
  for (const r of rail) r.selected = r.id === selectedId

  const list: SubjectListBlock = {
    rows: rail,
    base: {
      month,
      n: marketCounts.get(monthStartOf(month))?.videos ?? null,
      prev: railPrevShown && marketCounts.has(monthStartOf(prevMonth))
        ? { month: prevMonth, n: marketCounts.get(monthStartOf(prevMonth))?.videos ?? null }
        : null,
    },
    proposed: proposed.map((s) => ({ id: s.id, name: s.name, because: originLine(s.origin) })),
    rule: SUPERSEDE_RULE,
    notRecorded: subjectRows == null
      ? 'Your subjects are not recorded for this workspace yet.'
      : null,
    setLine: setLine(active.length, proposed.length),
    canEdit: scope.canEdit ?? false,
  }

  let selected: SubjectPane | null = null
  const subject = selectedId ? active.find((s) => s.id === selectedId) ?? null : null
  if (subject) {
    const calibration = calibrationOf.get(subject.id) ?? subjectCalibration(subject)
    // DECISION C ON THE PANE: a provisional subject has no "you" side and no
    // side carries a verdict or a direction word (`calibratedSides`). The
    // series, the chart, the gap and "the videos behind your figure" are all
    // built from these sides, so none of them reaches the client level either.
    const sides = calibratedSides(buildSides({
      subject,
      rivals,
      leadRival,
      month,
      prevMonth,
      axis: readAxis,
      // The word is read off the line the chart draws: it reaches the read
      // axis's first month wherever that month could clear the floor (a
      // chart starts no later than the first month any audience cleared it).
      word: { axis: wordAxis, seriesFor: chartSeriesFor },
      perAudience,
      kindRows,
      seriesFor,
      thin,
      pair,
      asOf: readingAt,
    }), calibration)
    // A REFUSED STEP IS DRAWN BROKEN (decision D, WP1.3): each line carries the
    // steps its audience's month pairs refuse, with the refusal's sentence.
    const judged = (line: MonthSeries): MonthSeries => ({
      ...line,
      refusedSteps: refusedSteps(line.points.map((p) => p.month), (a, b) => pair(a, b, line.audience)),
    })
    // A SUBJECT READ IN NO MONTH HAS NO LINE AT ALL (WP1.1 review, finding
    // 1): every point of every line is no reading, and the chart's key named
    // each audience "No line yet … (too few videos)", a reason about volume
    // for a subject nothing has read. With no series the block says "This
    // subject has no stored months on this axis yet."
    const neverRead = chartAxis.every((m) => readIn(subject.id, m) !== 'read')
    // A NOTE-LESS CHANGE OF OURS SAYS ITS TITLE (Heinrich, 27 Sep): the
    // chart's dated rule and its hover read "We changed how we check relevance
    // in September", never the reading layer's "it moved this month"
    // (lib/pages/change-caveats.ts).
    const captioned = (line: MonthSeries): MonthSeries => captionOurChanges(line, changes)
    const series = neverRead ? [] : sides.map((side) => seriesFor(subject.id, side.audience)).filter((s): s is MonthSeries => s != null).map(judged).map(captioned)
    const chartSeries = neverRead ? [] : sides
      .map((side) => chartSeriesFor(subject.id, side.audience))
      .filter((s): s is MonthSeries => s != null)
      .map(onChart)
      .map(judged)
      .map(captioned)

    // THE MEMBERS WITH WHAT THE MONTH RULE READS (WP2.2), in place of the
    // member-id read: the ids feed the voices and the questions as before, and
    // the subject's own market videos this month feed its kinds.
    const members = await loadSubjectMembers(supabase, clientId, subject.id)
    const memberIds = members ? members.map((m) => m.insightId) : null
    // The voices are dated in the reading month, so only a member cited on a
    // comment dated in it can supply one: the rest are not read for quotes
    // (Looks & style on staging: every citation's translation was read for six
    // quotes, three seconds of the page).
    const voiceIds = members
      ? members.filter((m) => m.evidence.some((e) => e.source === 'comment' && inMonth(e.commentDate, month))).map((m) => m.insightId)
      : null
    const themedRunId = themedRunAhead ? await themedRunAhead : null
    // WHERE WE FOUND THEM, read beside the voices and the questions: the
    // subject's market videos this month, the set its kinds are read on
    // (printed below only where that set is the headline's k).
    const foundAhead = members && readIn(subject.id, month) === 'read'
      ? makersAhead
          .then((m) => loadSubjectFound(reading.client, clientId, month, [...subjectMonthVideos(members, month, m.occupies).videos], keywordRunsAhead))
          .catch(() => null)
      : Promise.resolve(null)
    const [voices, unanswered] = await Promise.all([
      // Dated in the reading month, the market first, never the video's own
      // account (§2.3 S5), a maker's video marked.
      // And through the quote gate (walkthrough, 29 Sep; lib/quote-gate.ts):
      // a voice speaks to the subject, sits under a video on the market (no
      // Patagonia Provisions sardines under Durability), comes from a buyer
      // or commenter and not a maker's audience or a seller's post, and one
      // video gives the subject one voice.
      loadVoices(supabase, clientId, voiceIds ?? [], {
        month, marketFirst: true, makers: makersAhead.then((m) => m.makers),
        gate: gateFor(clientId, { claim: [subject.name, subject.description].filter(Boolean).join('. '), requireRelevance: true }),
      }),
      loadUnanswered(supabase, clientId, memberIds ?? [], {
        window: { from: questionsWindow.from, to: questionsWindow.to },
        period: periodPhrase(questionsHorizon, month),
        themedRunId,
        subjectId: subject.id,
      }),
    ])

    const move = (moveRows ?? []).find((m) => m.subject_id === subject.id) ?? null
    const own = sides.find((s) => s.kind === 'you') ?? null

    // D1 · the gap. The lead rival is the one the rail names; a rival that has
    // been retired is a TRACKING CHANGE, so the difference is refused and the
    // two levels print alone — the frozen months still render, which is why
    // `retireRival` never deletes.
    const leadSide = leadRival ? sides.find((s) => s.audience === rivalKey(leadRival.name)) ?? null : null
    const basisSide = (audience: string, label: string): GapSide => {
      const series = seriesFor(subject.id, audience)
      const point = series ? pointsByMonth(series).get(prevMonth) ?? null : null
      const n = perAudience.get(`${prevMonth}|${audience}`) ?? null
      const k = point?.k ?? null
      return {
        audience,
        label,
        value: { k: k ?? 0, n: n ?? 0 },
        pct: pctOf(k, n),
        observed: n != null && k != null,
      }
    }
    const gap = paneGap({
      subject: { id: subject.id, name: subject.name },
      a: own ? gapSideOf(own) : null,
      b: leadSide ? gapSideOf(leadSide) : null,
      basis:
        own && leadSide
          ? { a: basisSide(own.audience, own.label), b: basisSide(leadSide.audience, leadSide.label) }
          : null,
      month,
      prevMonth,
      ...(leadRival?.retiredAt ? { refused: 'tracking_change' as const } : {}),
      thin,
    })

    // ── WP2.2 · the subject on the market ─────────────────────────────
    const railRow = rail.find((r) => r.id === subject.id) ?? null
    const readHere = readIn(subject.id, month) === 'read'
    // The pooled line over the chart's axis, its refused steps judged on the
    // market view (a step Aug to Sep is drawn broken, WP1.3).
    const line = marketLineOf({
      subjectId: subject.id,
      label: subject.name,
      months: chartAxis,
      lines: marketAudiences(marketRivals)
        .map((a) => chartSeriesFor(subject.id, a))
        .filter((l): l is MonthSeries => l != null),
      counts: marketCounts,
      rivalAudiences: marketRivals,
      read: (m) => readIn(subject.id, m) === 'read',
    })
    const marketLine = line
      ? { ...line, refusedSteps: refusedSteps(line.points.map((p) => p.month), (a, b) => pair(a, b, MARKET_LINE)) }
      : null
    const readMonths = new Set(monthsReadOf(marketLine).map((p) => monthStartOf(p.month)))
    // The one chip: the reading month against the month before, where both
    // were read (a pair to refuse exists).
    const pairNote = readMonths.has(monthStartOf(prevMonth)) && readMonths.has(monthStartOf(month))
      ? pairOnVerdict(pair(prevMonth, month, MARKET_LINE)).note
      : null
    const chip = pairNote && pairNote.mode === 'refuse' ? pairChipWords(pairNote) : null
    // What people say about it: the members' kinds on the subject's own
    // market videos, printed only where that set is the headline's k.
    const makers = await makersAhead
    fillMakerShares(rail, makers, marketRivals)
    let kindsIn: SubjectPane['kindsIn'] = null
    if (members && readHere && railRow?.market) {
      const set = subjectMonthVideos(members, month, makers.occupies)
      if (set.videos.size === railRow.market.k) {
        kindsIn = { of: railRow.market.k, rows: kindsInRows(set.byKind) }
      } else {
        console.error(`[subjects] kinds: ${set.videos.size} videos read against the headline's ${railRow.market.k}; not printed`)
      }
    }
    const makerK = railRow?.market && railRow.makerShare != null ? makerKOf(makers.lens, subject.id, marketRivals) : null
    // The next pair read the same way (market view), for the future cards.
    const pairRows = await pairRowsAhead
    const nextUpdateAfter = schedule ? scheduledUpdateAfter(schedule) : null
    const next = pairRows
      ? nextComparablePair(rm.asAt ?? readingAt, ourChangesWithoutGatherFlags(changes), pairRows, {
          view: 'market',
          readingMonth: month,
          ...(nextUpdateAfter ? { nextUpdateAfter } : {}),
        })
      : null
    const nextPair = next ? { prevMonth: next.prevMonth, month: next.month, sameAgeFrom: next.sameAgeFrom, inFullExpected: next.inFullExpected } : null
    const monthStates: Record<string, string> = {}
    for (const p of marketLine?.points ?? []) {
      if (!readMonths.has(monthStartOf(p.month))) continue
      monthStates[monthStartOf(p.month)] = monthCardState({ month: p.month, now: readingAt, read: true, status: p.status, paused: rm.paused, nextUpdateAfter })
    }
    if (nextPair) {
      for (let m = nextMonth(monthStartOf(month)); m <= monthStartOf(nextPair.month); m = nextMonth(m)) {
        monthStates[m] = monthCardState({
          month: m, now: readingAt, read: false, status: null, paused: rm.paused, nextUpdateAfter,
          settlesWith: m === monthStartOf(nextPair.month) ? nextPair.inFullExpected : null,
        })
      }
    }

    selected = {
      id: subject.id,
      name: subject.name,
      description: subject.description,
      namedAt: subject.named_at,
      origin: subject.origin,
      calibration,
      unread: readIn(subject.id, month) === 'unread' ? unreadNote : null,
      // THE RAIL ROW'S OWN FIGURE, never a second read (default M-b), so the
      // pane's headline and the row the reader clicked share one base.
      market: railRow?.market ?? null,
      marketLine,
      chip,
      makers: makerK != null && railRow?.market ? { k: makerK, of: railRow.market.k } : null,
      // Where we found them, on the kinds' set: printed only where it is the headline's k.
      found: kindsIn ? await foundAhead : null,
      kindsIn,
      nextPair,
      monthStates,
      weekStrip: weekStripFor(weekStripAhead ? await weekStripAhead.catch(() => null) : null, subject.id),
      index: active.findIndex((s) => s.id === subject.id) + 1,
      of: active.length,
      sides,
      series,
      chartSeries,
      voices: voices.voices,
      voicesFrom: voices.from,
      voicesSampled: voices.sampled,
      unanswered,
      move: move
        ? { id: move.id, title: move.title, declaredAt: move.declared_at, status: move.status }
        : null,
      behind: own && own.k != null && own.k > 0
        ? { videos: own.k, href: `/dashboard/videos?subject=${encodeURIComponent(subject.id)}` }
        : null,
      gap,
      trail: trailLine(
        seriesFor(subject.id, INDUSTRY_AUDIENCE),
        audienceLabel(INDUSTRY_AUDIENCE),
      ),
      axisNote: axisNote(sides, FLOOR_N, series, month),
      notRecorded: subjectSet?.numeratorSubstrate === 'missing'
        ? 'This subject has no monthly reading recorded for this workspace yet.'
        : null,
    }
  }

  // The rail's maker tags, where no pane filled them above.
  if (!subject) fillMakerShares(rail, await makersAhead, marketRivals)

  // ── SU4 · your own posts, and the claims ledger ───────────────────────
  const census = await ownPostsAhead
  const sayHear = await sayHearAhead
  const echoes = await echoesAhead
  const sayHearClaims: SayHearClaim[] = sayHear.entries.map((e, i) => sayHearClaimOf(e, echoes?.[i] ?? null))
  // THE CENSUS IS PRINTED BY "Your own posts" AND NOT RE-READ HERE. Say vs hear
  // lists the LEDGER's claims (`sayHearClaims`), the same rows its tally counts;
  // matching the census's `video_claims` sentences to the ledger by exact text
  // never matched, and every row read "not tracked" under a tally that said
  // two of three were echoed.
  const ownPosts: OwnPostCensus = census

  const asked = await askedMostAhead
  const askedMost = asked
    ? asked
        .filter((a) => a.questionVideos > 0)
        .map((a) => ({ id: a.subjectId, name: selectable.find((x) => x.id === a.subjectId)?.name ?? '', videos: a.questionVideos }))
        .filter((a) => a.name)
        .sort((a, b) => b.videos - a.videos || a.name.localeCompare(b.name))
        .slice(0, UNANSWERED_SHOWN)
    : null

  return {
    brand,
    month,
    monthStatus,
    readingAt,
    reading: rm,
    askedMost,
    otherMonths: view.others,
    horizon,
    questionsHorizon,
    axis,
    chartAxis,
    substrate: subjectSet?.numeratorSubstrate ?? history.substrate,
    notes: subjectNotes(subjectSet?.notes),
    list,
    selected,
    ownPosts,
    sayHear: echoes && sayHear.counts ? sayHearCounts(sayHearClaims) : sayHear.counts,
    sayHearClaims,
  }
}

// ---- D1 · the two-audience gap -------------------------------------------------

/** A pane side as a gap side. The share is the one the PANE PRINTS, so the
 *  difference and the two figures beside it are one reading of one pair of
 *  numbers (lib/reading/gap.ts `GapSide.pct`). */
export function gapSideOf(side: SubjectSide): GapSide {
  return {
    audience: side.audience,
    label: side.label,
    value: { k: side.k ?? 0, n: side.n ?? 0 },
    pct: side.pct,
    observed: side.observed,
  }
}

export interface PaneGapInput {
  subject: { id: string; name: string }
  /** Your side and the lead rival's, this month. Either may be absent. */
  a: GapSide | null
  b: GapSide | null
  /** The same pair a month earlier — the mock's "from 19 in June", dated by
   *  the month the page's other comparisons use. */
  basis: { a: GapSide; b: GapSide } | null
  month: string
  prevMonth: string
  /** A rename or a tracking change on either side. A retired rival is a
   *  tracking change: the set we track moved inside the window, so the
   *  difference is partly a difference in our own bookkeeping. */
  refused?: RefusedReason
  thin: boolean
}

/**
 * You against the lead rival on this subject, banded — the one place this page
 * builds a gap.
 *
 * A THIN MONTH WITHHOLDS IT, as it withholds every verdict on the page: the
 * month carried too little conversation for its shares to be worth reading,
 * and a difference of two of them is worth less rather than more.
 */
export function paneGap(input: PaneGapInput): Gap | null {
  if (input.thin || !input.a || !input.b) return null
  return gapBetween({
    objectKind: 'subject',
    objectId: input.subject.id,
    objectLabel: input.subject.name,
    a: input.a,
    b: input.b,
    window: { kind: 'month', from: monthStartOf(input.month), to: nextMonth(input.month) },
    ...(input.basis
      ? {
          basis: {
            a: input.basis.a,
            b: input.basis.b,
            window: { kind: 'month', from: monthStartOf(input.prevMonth), to: nextMonth(input.prevMonth) },
          },
        }
      : {}),
    ...(input.refused ? { refused: input.refused } : {}),
    // A subject's membership is not a clustering artefact, so its months are
    // comparable across a boundary a theme's are not — the same declaration
    // `buildSides` makes on its own points.
    regime: 'n/a',
  })
}

/** The denominator floor a side is called hollow against: the band's own, so
 *  the sentence above the axis cannot disagree with the verdicts drawn beside
 *  it the day the band moves. (The design's "30" at final-v3.md:271 is
 *  superseded — research/bands-horizon-direction.md:882 pins minN = 100.) */
const FLOOR_N = SHARE_BAND.minN

/** The competitor bucket's two inks, in tracked order — `--comp` then its
 *  lighter step. Declared in app/globals.css beside the other data hues, so a
 *  theme change moves both. */
const RIVAL_INKS = ['var(--comp)', 'var(--comp-2)'] as const

function previousMonthOf(month: string): string {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 10)
}

interface SidesInput {
  subject: Subject
  rivals: readonly TrackedRival[]
  leadRival: TrackedRival | null
  month: string
  prevMonth: string
  axis: readonly string[]
  /**
   * THE THREE-MONTH READ AXIS (market-first WP3.4): the months each side's
   * direction word is read over (`readAxisOf`, lib/reading/horizon.ts), and
   * the lines it is read off. Absent (a fixture), the word is read over
   * `axis` off `seriesFor`, as before.
   */
  word?: { axis: readonly string[]; seriesFor: (subjectId: string, audience: string) => MonthSeries | null }
  perAudience: Map<string, number>
  kindRows: StoredKindRow[] | null
  seriesFor: (subjectId: string, audience: string) => MonthSeries | null
  thin: boolean
  /** The page's month-pair judge (decision D, WP1.3); null only where no pair
   *  applies (a fixture). */
  pair: PairOn | null
  /** The instant the page reads at (a direction word's newest month must have
   *  ended by it). */
  asOf: string
}

/**
 * You, each rival and the category, as the three sides of one subject.
 *
 * WHAT A SIDE MAY CARRY IS DECIDED BY ITS OWN n, NOT BY THE PAGE'S. On the
 * paying tenant your own audience carries about 9 videos in a month and the
 * category 625 (September, research F12; the mock's 84 and 1,388 were invented
 * volume), so the category is the only side of the three that can carry a monthly
 * change — and a page that printed the same verdict shape on all three would
 * print "too few to compare" on two of them for ever without saying why. The level
 * is real on every side and is always shown; the CHANGE is drawn where the band
 * can be, and `axisNote` says in one sentence which lines those are.
 */
export function buildSides(input: SidesInput): SubjectSide[] {
  const { subject, month, prevMonth, axis, perAudience, thin } = input
  const { pairFor, comparableFor } = pairTools(input.pair)
  const sides: { audience: string; label: string; kind: SubjectSide['kind']; color: string }[] = [
    { audience: CLIENT_AUDIENCE, label: 'You', kind: 'you', color: 'var(--you)' },
    // A SECOND RIVAL IS NOT THE FIRST ONE'S COLOUR. Every rival used to be
    // painted `var(--comp)`, so a tenant tracking two drew two
    // indistinguishable orange lines on one chart and the legend was the only
    // way to tell them apart — which is identity by legend, not by ink. The
    // ramp is lightness inside the one competitor bucket (the chart rule,
    // `--chart-1..5`), so a rival still reads as a rival; past the ramp they
    // share the last step, because five distinguishable oranges is the most
    // this palette has and a sixth invented hue would leave the bucket.
    ...input.rivals.map((r, i) => ({
      audience: rivalKey(r.name),
      label: r.retiredAt ? `${r.name} · stopped` : r.name,
      kind: 'rival' as const,
      color: RIVAL_INKS[Math.min(i, RIVAL_INKS.length - 1)],
    })),
    { audience: INDUSTRY_AUDIENCE, label: audienceLabel(INDUSTRY_AUDIENCE), kind: 'category', color: 'var(--cat)' },
  ]

  const kindsFor = (audience: string): { kinds: KindShare[]; reddit: RedditRead | null } => {
    if (input.kindRows == null) return { kinds: [], reddit: null }
    const n = perAudience.get(`${month}|${audience}`) ?? null
    const rowsHere = input.kindRows.filter((r) => monthStartOf(r.month) === month && r.audience === audience)
    if (n == null || rowsHere.length === 0) return { kinds: [], reddit: null }
    const asRows = rowsHere.map((r) => ({
      kind: r.kind,
      videos: r.videos,
      comments: r.comments,
      platform_mix: r.platform_mix ?? {},
    }))
    // `redditRead` takes the STORED rows, not the shares: a `KindShare` has
    // already collapsed the platform mix to one reddit count and dropped the
    // rest, so handing it shares gives a pooled read of nothing at all
    // (lib/reading/kinds.ts, and lib/pages/overview.ts does the same).
    return { kinds: kindShares(asRows, n), reddit: redditRead(asRows) }
  }

  /**
   * Did each drawn kind's share move? `buildCategory`'s rule, on this block's
   * rows (lib/pages/overview.ts) — one comparison per kind, the audience's own
   * video count as n on both sides, and null wherever either side is missing.
   *
   * The thin-month gate suppresses all of them together, exactly as it
   * suppresses the subject verdicts above: one gate, one answer, so a page
   * cannot print "too little data" on the line and a band on the kind under it.
   */
  const verdictsFor = (audience: string, kinds: readonly KindShare[]): Record<string, Verdict | null> => {
    const out: Record<string, Verdict | null> = {}
    if (input.kindRows == null) return out
    const n = perAudience.get(`${month}|${audience}`) ?? null
    const prevN = perAudience.get(`${prevMonth}|${audience}`) ?? null
    const before = input.kindRows.filter((r) => monthStartOf(r.month) === prevMonth && r.audience === audience)
    for (const k of kinds) {
      const prev = before.find((r) => r.kind === k.kind)
      out[k.kind] =
        thin || n == null || prevN == null || prev == null
          ? null
          : kindChange({
              kind: k.kind,
              audience,
              curr: { month, k: k.videos, videos: n },
              prev: { month: prevMonth, k: prev.videos, videos: prevN },
              comparability: pairFor(prevMonth, month, audience),
            })
    }
    return out
  }

  return sides.map((s) => {
    const series = input.seriesFor(subject.id, s.audience)
    const byMonth = series ? pointsByMonth(series) : new Map()
    const wordLine = input.word ? input.word.seriesFor(subject.id, s.audience) : series
    const wordByMonth = wordLine ? pointsByMonth(wordLine) : new Map()
    const here = byMonth.get(month) ?? null
    const before = byMonth.get(prevMonth) ?? null
    const n = perAudience.get(`${month}|${s.audience}`) ?? null
    const k = here?.k ?? null
    const observed = n != null && k != null
    const silence: SubjectSide['silence'] = n == null ? 'not_tracked' : k == null ? 'no_reading' : null

    const point = (m: string, from: Map<string, MonthPoint> = byMonth): SeriesPoint => {
      const p = from.get(m) ?? null
      return {
        month: m,
        videos: perAudience.get(`${m}|${s.audience}`) ?? null,
        k: p?.k ?? null,
        audience: s.audience,
        // A subject's membership is not a clustering artefact, so its months
        // are comparable across a boundary a theme's are not.
        regime: 'n/a',
      }
    }
    const verdict = thin || !observed
      ? null
      : monthChange({
          object: { kind: 'subject', id: subject.id, label: subject.name },
          audience: s.audience,
          curr: point(month),
          prev: point(prevMonth),
          comparability: pairFor(prevMonth, month, s.audience),
        })
    const { kinds, reddit } = kindsFor(s.audience)
    return {
      audience: s.audience,
      label: s.label,
      kind: s.kind,
      color: s.color,
      k,
      n,
      pct: pctOf(k, n),
      observed,
      silence,
      verdict,
      direction: thin ? null : directionWord((input.word?.axis ?? axis).map((m) => point(m, wordByMonth)), { asOf: input.asOf, comparable: comparableFor(s.audience) }),
      previous: before ? { month: prevMonth, pct: pctOf(before.k, before.videos) } : null,
      kinds,
      kindVerdicts: verdictsFor(s.audience, kinds),
      reddit,
    }
  })
}

// ---- SU2's voices --------------------------------------------------------------

/**
 * Six voices on the subject, across the audiences.
 *
 * The same gate Overview's two voices pass (`readsAsHeroQuote`, item 8): a
 * quote that cannot be read is not evidence, and the cache's own language
 * answer decides rather than a guess about the alphabet. The words themselves
 * are resolved at render — a snapshot keeps the ref and empties the text
 * (lib/renderables/quotes-freeze.ts).
 */
async function loadVoices(
  supabase: SupabaseClient,
  clientId: string,
  insightIds: readonly string[],
  opts?: VoiceReadOptions,
): Promise<VoiceRead> {
  const read = await loadVoicesMany(supabase, clientId, [{ key: 'one', insightIds }], opts)
  return read.get('one') ?? NO_VOICES
}

/** What one subject's voice read answers with. */
export interface VoiceRead {
  voices: SubjectVoice[]
  /** How many citations were looked at — inside the month, where one was
   *  asked for. */
  from: number
  /** Whether either cap bit, so the block stops claiming a denominator. */
  sampled: boolean
  /** How many citations passed the readability gate BEFORE any month filter.
   *  Zero is "nothing about this subject can be quoted at all", which is a
   *  different silence from "nothing was quotable this month". */
  readable: number
}

const NO_VOICES: VoiceRead = { voices: [], from: 0, sampled: false, readable: 0 }

export interface VoiceReadOptions {
  /** Keep only citations whose COMMENT falls in this month ('2026-09' or its
   *  first day). A monthly artefact asks for one; so does the Subjects page
   *  since WP2.2 (§2.3 S5: voices dated in the reading month). */
  month?: string
  /** The market only (WP2.2, §2.3 S5): the category's voices, then the
   *  tracked brands', and none from the client's audience (decision E: it is
   *  not the market; `voicePools`). Off by default, so the monthly's order is
   *  unchanged. */
  marketFirst?: boolean
  /** The reading month's maker videos (`loadMarketMakers`), so a voice under
   *  one is marked (decision F). A promise is awaited only after the voices'
   *  own reads, so the two run side by side. */
  makers?: ReadonlySet<string> | null | Promise<ReadonlySet<string> | null>
  /** The quote gate (walkthrough, 29 Sep; lib/quote-gate.ts), read on each
   *  voice's video: what fails it is not drawn, what passes is ranked by it
   *  inside each audience, and one video gives one voice. Absent (the monthly
   *  report's call), the voices are drawn as they were. */
  gate?: GateOptions
}

/**
 * The same read, for many subjects at once, in a fixed number of statements.
 *
 * WHY IT IS NOT A LOOP OVER `loadVoices`. The monthly report asks for one voice
 * on every active subject, and a `Promise.all` over that is one chunked
 * membership read plus a citations read plus a chunked comments read plus a
 * chunked videos read PER SUBJECT — eight subjects is thirty-odd statements
 * fired at one instance at once, on the send path. The morning of 2026-09-16 is
 * what that costs: five agents reading production together exhausted the
 * instance's IO budget and the live app returned 504s to paying users. Three
 * reads here, whatever N is.
 *
 * AND THE RANKING IS STILL PER SUBJECT. One query across every subject would
 * rank a loud subject's citations above a quiet one's and print the same quote
 * twice; the reads are shared, the pool, the caps, the de-duplication and the
 * round-robin are each drawn inside one subject exactly as they were.
 */
async function loadVoicesMany(
  supabase: SupabaseClient,
  clientId: string,
  groups: readonly { key: string; insightIds: readonly string[] }[],
  opts?: VoiceReadOptions,
): Promise<Map<string, VoiceRead>> {
  const out = new Map<string, VoiceRead>(groups.map((g) => [g.key, NO_VOICES]))
  const capped = groups.map((g) => ({
    key: g.key,
    asked: g.insightIds.length,
    ids: [...g.insightIds].slice(0, VOICES_POOL_INSIGHTS),
  }))
  const union = [...new Set(capped.flatMap((g) => g.ids))]
  if (union.length === 0) return out
  const citations = await fetchQuoteCitationsByAudience(supabase, union)

  const pools = capped.map((g) => {
    const pool: QuoteCitation[] = []
    const seen = new Set<string>()
    for (const id of g.ids) {
      for (const c of (citations.get(id) ?? []).sort((a, b) => a.rank - b.rank)) {
        const text = cleanQuote(c.quote)
        const key = text.toLowerCase()
        if (!text || seen.has(key)) continue
        if (!readsAsHeroQuote(text, c)) continue
        seen.add(key)
        pool.push({ ...c, quote: text })
      }
    }
    // WHAT WAS LOOKED AT, AND WHETHER THAT WAS ALL OF IT. Both caps are the
    // block's to say: past either one the six are drawn from a sample and the
    // meta line stops claiming a denominator.
    return {
      key: g.key,
      sampled: g.asked > VOICES_POOL_INSIGHTS || pool.length > VOICES_POOL_CITATIONS,
      considered: pool.slice(0, VOICES_POOL_CITATIONS),
    }
  })

  const commentIds = [
    ...new Set(pools.flatMap((p) => p.considered.map((c) => c.commentId).filter((id): id is string => Boolean(id)))),
  ]
  type CommentMeta = { platform: string | null; comment_date: string | null; video_id: string | null; comment_id: string | null; author?: string | null; likes?: number | null }
  const meta = new Map<string, CommentMeta>()
  if (commentIds.length > 0) {
    const read = await readByIds<CommentMeta & { id: string }>(commentIds, (part) =>
      supabase
        .from('comments')
        .select('id, platform, comment_date, video_id, comment_id, author, likes')
        .eq('client_id', clientId)
        .in('id', part)
        .order('id', { ascending: true }),
    )
    for (const c of read) meta.set(c.id, c)
  }

  const nativeIds = [...new Set([...meta.values()].map((m) => m.video_id).filter((v): v is string => Boolean(v)))]
  const urlByKey = new Map<string, string>()
  const audienceByKey = new Map<string, string>()
  // Which of those videos the tenant actually PUBLISHED. `source` is the only
  // column that knows: `is_client` is true of a stranger's review too, which
  // is what made every cite read "under a post of yours" (voiceFrom).
  const ownPostKeys = new Set<string>()
  // The video's own account and its row id: a comment by the account that
  // posted the video is the video talking, not the market (§4.0 quotes), and
  // the row id is what the reading month's maker set is keyed by.
  const accountByKey = new Map<string, string>()
  const idByKey = new Map<string, string>()
  // What the quote gate reads of each video, where a gate is asked for.
  const gateVideoByKey = new Map<string, QuoteVideo>()
  if (nativeIds.length > 0) {
    type V = {
      id?: string | null; platform: string | null; video_id: string | null; video_url: string | null; source: string | null; is_client: boolean | null
      is_competitor: boolean | null; competitor_name: string | null; account_name?: string | null
      caption?: string | null; hashtags?: string[] | null; topics?: string[] | null
    }
    const read = await readByIds<V>(nativeIds, (part) =>
      supabase
        .from('videos')
        // caption, hashtags and topics are the quote gate's (lib/quote-gate.ts).
        .select('id, platform, video_id, video_url, source, is_client, is_competitor, competitor_name, account_name, caption, hashtags, topics')
        .eq('client_id', clientId)
        .in('video_id', part)
        .order('video_id', { ascending: true }),
    )
    for (const v of read) {
      if (!v.video_id) continue
      const key = `${v.platform}::${v.video_id}`
      if (v.video_url) urlByKey.set(key, v.video_url)
      if (v.source === 'owned') ownPostKeys.add(key)
      if (v.account_name) accountByKey.set(key, v.account_name)
      if (v.id) idByKey.set(key, String(v.id))
      if (opts?.gate) {
        gateVideoByKey.set(key, {
          platform: v.platform, videoId: v.video_id, caption: v.caption ?? null, hashtags: v.hashtags ?? null, topics: v.topics ?? null,
          accountName: v.account_name ?? null, isClient: v.is_client, isCompetitor: v.is_competitor, competitorName: v.competitor_name,
          source: v.source, segment: null,
        })
      }
      audienceByKey.set(
        key,
        v.is_client ? CLIENT_AUDIENCE : v.is_competitor ? rivalKey(v.competitor_name ?? 'unknown') : INDUSTRY_AUDIENCE,
      )
    }
  }

  const makerSet = opts?.makers ? await opts.makers : null
  for (const p of pools) {
    // A PERIOD IS DATED BY THE COMMENT (AGENTS.md), so a caller that asks for a
    // month gets the citations whose comment falls in it and no others — a
    // citation whose comment cannot be dated is not in any month. Without this
    // an artefact headed September prints a June comment under it.
    const inMonthOnly = opts?.month
      ? p.considered.filter((c) => {
          const date = c.commentId ? meta.get(c.commentId)?.comment_date ?? null : null
          return date != null && date.slice(0, 7) === opts.month!.slice(0, 7)
        })
      : p.considered
    // NEVER FROM THE VIDEO'S OWN ACCOUNT (§4.0 quotes; WP2.2): a creator
    // answering under their own post is the video talking. Matched as the
    // front page matches it (`accountKey`: letters and digits, one case).
    const considered = inMonthOnly.filter((c) => {
      const m = c.commentId ? meta.get(c.commentId) : undefined
      const key = m?.platform && m.video_id ? `${m.platform}::${m.video_id}` : null
      const author = accountKey(m?.author ?? null)
      return !(author && key && author === accountKey(accountByKey.get(key) ?? null))
    })
    if (considered.length === 0) {
      out.set(p.key, { voices: [], from: 0, sampled: p.sampled, readable: p.considered.length })
      continue
    }
    const audienceOf = (c: QuoteCitation): string => {
      const m = c.commentId ? meta.get(c.commentId) : undefined
      const key = m?.platform && m.video_id ? `${m.platform}::${m.video_id}` : null
      return (key ? audienceByKey.get(key) : null) ?? INDUSTRY_AUDIENCE
    }

    // Grouped by the audience the quote was HEARD in, then drawn round-robin so
    // one loud side cannot fill the list. On the market (S5) your own audience
    // is not drawn at all (`voicePools`).
    //
    // THROUGH THE QUOTE GATE where one is asked for: each audience's voices
    // are the ones that pass, best first, one per video (a video is filed
    // under one audience, so one per video in each is one per video in all).
    const gate = opts?.gate
    const gateView = (c: QuoteCitation) => {
      const m = c.commentId ? meta.get(c.commentId) : undefined
      const key = m?.platform && m.video_id ? `${m.platform}::${m.video_id}` : null
      const video = key ? gateVideoByKey.get(key) ?? null : null
      const maker = makerSet && key && idByKey.has(key) ? makerSet.has(idByKey.get(key)!) : false
      return { text: c.quote, lang: c.lang ?? null, english: c.english ?? null, video: video ? { ...video, segment: maker ? 'maker' : video.segment } : null }
    }
    const used = new Set<string>()
    const pools = voicePools(considered, audienceOf, opts?.marketFirst === true)
      .map((pool) => (gate ? { ...pool, items: pickEligible(pool.items, gateView, pool.items.length, { ...gate, used }) } : pool))
      .filter((pool) => pool.items.length > 0)
    const heard = pools.reduce((n, x) => n + x.items.length, 0)
    if (heard === 0) {
      out.set(p.key, { voices: [], from: 0, sampled: p.sampled, readable: p.considered.length })
      continue
    }
    // Six on the market (§2.3 S5): still one audience at a time, but with the
    // client's audience out a side may give more than VOICES_PER_AUDIENCE, so
    // a subject heard in the category and one brand still prints six.
    const shown = voicesAcross(pools, VOICES_SHOWN, opts?.marketFirst ? VOICES_SHOWN : VOICES_PER_AUDIENCE)

    // ON-SCREEN TEXT, BY VIDEO. `video_text` evidence is words printed on the
    // cover frame; where one of the six is a creator SPEAKING and that same
    // video also carries on-screen text, the two belong together — the mock
    // prints them as a pair. Built from the citations already read, so the
    // pairing costs no statement.
    //
    // AND IT CARRIES ITS OWN EVIDENCE ID. The frame's words are a third
    // party's, so they travel the way every other quote on this page travels —
    // as a ref the snapshot freezes and the render resolves. The id is one
    // field away on the citation that supplied the words; it was being dropped.
    const onScreenByVideo = new Map<string, Quote>()
    for (const c of considered) {
      if (c.source === 'video_text' && c.videoId && !onScreenByVideo.has(c.videoId)) {
        onScreenByVideo.set(c.videoId, {
          ref: quoteRef.evidence(c.evidenceId),
          text: c.quote,
          ...(c.lang != null ? { lang: c.lang, english: c.english ?? null } : {}),
        } as Quote)
      }
    }

    const voices = shown.map((c) => {
      const m = c.commentId ? meta.get(c.commentId) : undefined
      const key = m?.platform && m.video_id ? `${m.platform}::${m.video_id}` : null
      // THE ONE FACT, READ ONCE. Both the comment cite and the transcript cite
      // turn on whether the tenant PUBLISHED this video; `voiceFrom` takes it
      // and the transcript arm used to recover it by matching the sentence
      // voiceFrom had just returned (`from.startsWith('under a post of
      // yours')`). That made a copy edit two functions away silently drop the
      // "· yours" suffix with no test failing — the cite would still read
      // "creator video, transcript" and simply stop saying whose.
      const ownPost = key !== null && ownPostKeys.has(key)
      const from = voiceFrom(audienceOf(c), { ownPost })
      const source = c.source ?? 'comment'
      // WHERE, IN THE RIGHT WORDS FOR THE KIND OF EVIDENCE IT IS. "under a
      // category video" is true of a COMMENT; a creator's own sentence was not
      // written under anything, and the cite said it was.
      const where = source === 'comment'
        ? from
        : source === 'video'
          ? `creator video, transcript${ownPost && audienceOf(c) === CLIENT_AUDIENCE ? ' · yours' : ''}`
          : 'on-screen text'
      // THE PLATFORM IS NOT IN THE WORDS (fix pass). It is carried by the
      // glyph the block draws in front of this line, so leading the cite with
      // `m.platform` printed it twice — once as a mark and once as a raw
      // column value, a proper noun lower-cased on a client page ("⟨glyph⟩
      // tiktok · 14 Sep"). The `platform` field below is what the glyph reads;
      // the email arm, which has no glyph, prints `platformLabel(platform)` in
      // front of this string itself.
      const cite = [m?.comment_date ? shortDate(m.comment_date) : null, where]
        .filter(Boolean).join(' · ')
      const url = key ? urlByKey.get(key) ?? null : null
      const videoId = c.videoId ?? m?.video_id ?? null
      return {
        quote: {
          ref: quoteRef.evidence(c.evidenceId),
          text: c.quote,
          ...(c.lang != null ? { lang: c.lang, english: c.english ?? null } : {}),
        } as Quote,
        cite,
        href: citationLink(m?.platform ?? null, url, m?.comment_id ?? null).href,
        from,
        platform: m?.platform ?? null,
        source,
        onScreen: source === 'video' && videoId ? onScreenByVideo.get(videoId) ?? null : null,
        likes: typeof m?.likes === 'number' && m.likes > 0 ? m.likes : null,
        ...(makerSet && key && idByKey.has(key) ? { maker: makerSet.has(idByKey.get(key)!) } : {}),
      }
    })
    out.set(p.key, { voices, from: heard, sampled: p.sampled, readable: p.considered.length })
  }
  return out
}

/**
 * The audiences a subject's voices are drawn from, in order, each with its
 * citations (the caller's relevance order kept).
 *
 * ON THE MARKET (`marketFirst`, §2.3 S5, lens M): the category's, then each
 * tracked brand's, and NEVER the client's audience. Decision E's market is
 * everything read except the client's audience (MF1 `market_month_videos`
 * leaves `is_client` videos out), so a comment under your own post, or under
 * a stranger's video filed as naming you, is not the market's voice (the
 * deploy-3 review: staging's Community & purpose drew two of its six there).
 * Otherwise (the monthly's older order), your audience first and the category
 * last, as before.
 */
export function voicePools<T>(items: readonly T[], audienceOf: (c: T) => string, marketFirst: boolean): { audience: string; items: T[] }[] {
  const byAudience = new Map<string, T[]>()
  for (const c of items) {
    const audience = audienceOf(c)
    if (marketFirst && audience === CLIENT_AUDIENCE) continue
    byAudience.set(audience, [...(byAudience.get(audience) ?? []), c])
  }
  const rivalsHeard = [...byAudience.keys()].filter((a) => a !== CLIENT_AUDIENCE && a !== INDUSTRY_AUDIENCE).sort()
  const order = marketFirst
    ? [INDUSTRY_AUDIENCE, ...rivalsHeard]
    : [CLIENT_AUDIENCE, ...rivalsHeard, INDUSTRY_AUDIENCE]
  return order.filter((a) => byAudience.has(a)).map((a) => ({ audience: a, items: byAudience.get(a) ?? [] }))
}

/**
 * SU2's voices, by their outside name (Phase 1 WP18, one wrapper, additive).
 *
 * The monthly report prints ONE voice per subject where this page prints six on
 * one, and it must draw them through the same gate — `readsAsHeroQuote`, the
 * round-robin across audiences, the cite and the link — or the two surfaces
 * would quote the same subject differently. A wrapper rather than a rename:
 * `loadVoices` is a private name two loaders in this directory happen to share,
 * and renaming it would touch a WP12 call site for nothing.
 */
export function loadSubjectVoices(
  supabase: SupabaseClient,
  clientId: string,
  insightIds: readonly string[],
): Promise<VoiceRead> {
  return loadVoices(supabase, clientId, insightIds)
}

/**
 * The same, for every subject at once — three statements, not three per subject.
 *
 * WHAT THE MONTHLY REPORT ACTUALLY ASKS FOR. One voice on each of N subjects is
 * one question, and asking it N times is how a send path fires thirty
 * concurrent statements at an instance whose IO budget a single morning of
 * parallel readers can exhaust. The ranking, the caps and the round-robin stay
 * inside one subject; only the reads are shared.
 */
export function loadSubjectVoicesMany(
  supabase: SupabaseClient,
  clientId: string,
  groups: readonly { key: string; insightIds: readonly string[] }[],
  opts?: VoiceReadOptions,
): Promise<Map<string, VoiceRead>> {
  return loadVoicesMany(supabase, clientId, groups, opts)
}

// ---- SU3 -----------------------------------------------------------------------

interface UnansweredInput {
  /** The period the reader chose, as half-open instants. Both halves of SU3
   *  are read inside it: the question videos AND your own posts. */
  window: { from: string; to: string }
  /** The period the reader chose, as `periodPhrase` words it. */
  period: string
  /** The update whose clustering names the questions. Null where no update has
   *  produced themes — then there is nothing to group by and the block says so
   *  rather than printing pipeline slugs. */
  themedRunId: string | null
  /** The subject, for the post-and-claim judge's filing (sw-2 item 2).
   *  Optional: absent, the touch is the word check alone. */
  subjectId?: string
}

/**
 * Questions the category asks on this subject that your posts never answer.
 *
 * COUNTS, NOT SHARES, and the reason is on the module header: the k here is
 * taken from the current analysis and every other n on this page is
 * comment-dated. The gate is the design's — fewer than ten question videos on
 * the subject IN THE PERIOD SHOWN and the block says so rather than ranking
 * noise.
 *
 * THE QUESTION IS NAMED BY THE CLUSTERING, NOT BY THE INSIGHT. The obvious key
 * is `audience_insights.theme`, and it is wrong twice over: it is a snake_case
 * machine slug ("prosthetic_functionality", "product_availability"), which is
 * pipeline vocabulary in front of a client, and it is nearly unique — measured
 * read-only on 2026-09-16, Össur's 696 live question insights carry 547
 * distinct values over 553 videos, so grouping by it is barely grouping at all.
 * The clustering's own label is a sentence a person wrote the product's way
 * ("Which backpack should I choose", "Questions about prosthetic function"),
 * and every one of both tenants' live question insights is reachable from the
 * newest themed update's `supporting_insight_ids` — 696 of 696 and 567 of 567.
 * So the key is the REGISTRY id (labels churn ~88% run to run, AGENTS.md) and
 * the words are the registry's canonical label.
 */
async function loadUnanswered(
  supabase: SupabaseClient,
  clientId: string,
  insightIds: readonly string[],
  input: UnansweredInput,
): Promise<UnansweredBlock> {
  const empty: UnansweredBlock = {
    rows: [], questionVideos: 0, yourPosts: 0,
    lead: null, basis: UNANSWERED_BASIS, claims: UNANSWERED_CLAIMS_UNREADABLE,
    reddit: null, refusal: null,
  }
  if (insightIds.length === 0) {
    return { ...empty, refusal: 'Nothing has been matched to this subject yet.' }
  }

  // Id-set lookup on the base table: a membership row cascades with its
  // insight, so every id that resolves is live (AGENTS.md). Every id, in
  // chunks — a slice of them is a sample, and every number below is computed
  // off this read.
  const insights = await readByIds<InsightRow>(insightIds, (part) =>
    supabase
      .from('audience_insights')
      .select('id, category, theme, source_video_id')
      .eq('client_id', clientId)
      .eq('category', 'question')
      .in('id', part)
      .order('id', { ascending: true }),
  )
  const videoIds = [...new Set(insights.map((i) => i.source_video_id).filter((v): v is string => Boolean(v)))]
  if (videoIds.length === 0) {
    return { ...empty, refusal: 'Nobody has asked a question about this subject in the videos we have read.' }
  }

  // THE QUESTION VIDEOS ARE THE ONES IN THE PERIOD SHOWN. The design gates on
  // "≥ 10 question videos on the subject IN THE WINDOW" and its example says
  // "this quarter"; both the gate and every row's count were whole-corpus, so
  // the horizon control moved the post count and nothing else. A video is
  // placed by the day it was posted — the one date this read has — and both
  // tenants' videos carry one (0 undated of 4,450 and 3,927, measured
  // read-only 2026-09-16).
  const videos = await readByIds<VideoRow>(videoIds, (part) =>
    supabase
      .from('videos')
      .select('id, platform, is_client, is_competitor, competitor_name, topics, upload_date')
      .eq('client_id', clientId)
      .in('id', part)
      .gte('upload_date', input.window.from.slice(0, 10))
      .lt('upload_date', input.window.to.slice(0, 10))
      .order('id', { ascending: true }),
  )
  const byId = new Map(videos.map((v) => [v.id, v]))

  // Your own posts in the drawn window, and what they are about.
  const ownVideos = await selectAll<VideoRow>(() =>
    supabase
      .from('videos')
      .select('id, platform, is_client, is_competitor, competitor_name, topics, upload_date')
      .eq('client_id', clientId)
      .eq('is_client', true)
      .gte('upload_date', input.window.from.slice(0, 10))
      .lt('upload_date', input.window.to.slice(0, 10))
      .order('id', { ascending: true }),
  )
  // WHAT YOUR POSTS ARE ABOUT, AND NOT WHAT THEY CLAIM. The obvious second
  // half of this haystack is `video_claims` — and `video_claims` carries RLS
  // with NO tenant SELECT policy until M8 (WP16), verified on production
  // 2026-09-16: relrowsecurity true, zero policies. A signed-in member's read
  // of it returns zero rows and NO error, so the claims half was silently
  // empty on every page a client will ever open, and a question one of your
  // posts did answer printed as a gap. The OV4 precedent is the answer: the
  // half we cannot read is named rather than pretended (OWN_POSTS_UNREADABLE),
  // and it arrives the day M8 does. Reading it on the service role instead
  // would work and is refused: `reading.client` is the month tables' client,
  // and "one careless `reading.client.from('<not a month table>')` away from an
  // RLS bypass" is the rule that file states about itself.

  const nonOwned = new Set<string>()
  const questionInsights: InsightRow[] = []
  for (const i of insights) {
    const v = i.source_video_id ? byId.get(i.source_video_id) : null
    if (!v || v.is_client) continue
    nonOwned.add(v.id)
    questionInsights.push(i)
  }

  const questionVideos = nonOwned.size
  if (questionVideos === 0) {
    return {
      ...empty,
      yourPosts: ownVideos.length,
      refusal: 'Nobody has asked a question about this subject in the videos we have read over this period.',
    }
  }
  if (questionVideos < UNANSWERED_GATE) {
    return {
      ...empty,
      questionVideos,
      yourPosts: ownVideos.length,
      refusal:
        `${fmtInt(questionVideos)} video${questionVideos === 1 ? '' : 's'} asked something about this subject; ` +
        `we do not rank a gap under ${fmtInt(UNANSWERED_GATE)}.`,
    }
  }

  const named = await nameQuestions(supabase, clientId, input.themedRunId, questionInsights.map((i) => i.id))
  if (named.size === 0) {
    return {
      ...empty,
      questionVideos,
      yourPosts: ownVideos.length,
      refusal:
        `${fmtInt(questionVideos)} videos asked something about this subject, and no update has grouped those ` +
        'questions yet. They are counted here and named with the next update.',
    }
  }

  const groups = new Map<string, { label: string; videos: Set<string>; reddit: Set<string> }>()
  for (const i of questionInsights) {
    const at = named.get(i.id)
    if (!at) continue
    const v = i.source_video_id ? byId.get(i.source_video_id) : null
    if (!v) continue
    const g = groups.get(at.registryId) ?? { label: at.label, videos: new Set<string>(), reddit: new Set<string>() }
    g.videos.add(v.id)
    if ((v.platform ?? '').toLowerCase() === 'reddit') g.reddit.add(v.id)
    groups.set(at.registryId, g)
  }

  const ranked = [...groups.entries()]
    .sort((a, b) => b[1].videos.size - a[1].videos.size || a[1].label.localeCompare(b[1].label))
    .map(([registryId, g]) => ({
      id: registryId,
      label: g.label,
      videos: g.videos.size,
      reddit: g.reddit.size,
      // PER POST (WP2.5): one of your posts shares two or more of the
      // question's non-generic words; two words from two posts are not one.
      answered: postsSharing(g.label, ownVideos).matched.length > 0,
      // NO ONWARD LINK. The obvious one is Voice's `?themes=`, and that
      // parameter matches on `themes.member_themes` SLUGS, not on a registry
      // id — a link that would silently filter to nothing. VO3 (WP13) is where
      // a question opens in full.
    }))
  // THE TOP QUESTIONS, TOUCHED OR NOT (WP2.2, §2.3 S4): each row says whether
  // one of your posts shared two or more of its words, so a "none" can be
  // read against the rows it is about; an answered row is no longer dropped.
  const shown = ranked.slice(0, UNANSWERED_SHOWN)
  const redditVideos = [...groups.values()].reduce((n, g) => n + g.reddit.size, 0)

  // WHETHER YOUR POSTS TOUCHED THE SUBJECT, YOUR MOVES' WAY (sw-2 item 2): two
  // or more words shared with one of the questions shown, or the post-and-claim
  // judge filed the post as about the subject (`own_post_subjects`). This page
  // said "None of your 25 posts shared two or more of its words" while Your
  // moves counted the judge's filing too.
  const filings = input.subjectId
    ? await loadOwnPostSubjects(supabase, clientId).catch((error: unknown) => {
      console.error(`[pages] subjects.unanswered filings: ${(error as { message?: string })?.message ?? String(error)}`)
      return null
    })
    : null
  const touch = questionTouch({
    labels: shown.map((r) => r.label),
    posts: ownVideos.map((v) => ({ id: v.id, topics: v.topics, upload_date: v.upload_date, video_url: null })),
    ...(input.subjectId ? { judge: { subjectId: input.subjectId, filings: filings ? ownPostFilings(filings) : null } } : {}),
  })

  return {
    touch,
    rows: shown,
    questionVideos,
    yourPosts: ownVideos.length,
    lead: unansweredLead(shown, ownVideos.length, input.period),
    basis: UNANSWERED_BASIS,
    claims: UNANSWERED_CLAIMS_UNREADABLE,
    reddit: redditVideos > 0 ? REDDIT_THREAD_CAP : null,
    refusal: ranked.length > 0 && ranked.every((r) => r.answered)
      ? 'Your posts touch every question the category asks on this subject.'
      : null,
  }
}

/**
 * Which grouped question each insight belongs to, in the reader's words.
 *
 * `themes.supporting_insight_ids` is the durable link — the one WP2's research
 * settled on for the same reason, and the one measured at 100% coverage of both
 * tenants' live question insights. The registry id is the KEY and the
 * registry's canonical label is the words; the run's own label is the fallback,
 * because a registry row can be newer than its canonical label.
 */
export async function nameQuestions(
  supabase: SupabaseClient,
  clientId: string,
  themedRunId: string | null,
  insightIds: readonly string[],
): Promise<Map<string, { registryId: string; label: string }>> {
  const out = new Map<string, { registryId: string; label: string }>()
  if (!themedRunId || insightIds.length === 0) return out

  const themes = await selectAll<ThemeRow>(() =>
    supabase
      .from('themes')
      .select('registry_id, label, supporting_insight_ids')
      .eq('client_id', clientId)
      .eq('run_id', themedRunId)
      .not('registry_id', 'is', null)
      .order('id', { ascending: true }),
  )
  const wanted = new Set(insightIds)
  const labelOf = new Map<string, string>()
  for (const t of themes) {
    if (!t.registry_id) continue
    labelOf.set(t.registry_id, t.label ?? '')
    for (const id of t.supporting_insight_ids ?? []) {
      // FIRST THEME WINS. One insight can support two themes in one run, and a
      // reader counting a video under two questions would see the same video
      // twice in one list. The rows are ordered by id, so the choice is stable
      // across two renders of the same reading.
      if (wanted.has(id) && !out.has(id)) out.set(id, { registryId: t.registry_id, label: t.label ?? '' })
    }
  }
  if (out.size === 0) return out

  // The registry's own words where it has them — the run's label churns ~88%
  // run to run and the registry is what VO3 and the ledger name (AGENTS.md).
  const registryIds = [...new Set([...out.values()].map((v) => v.registryId))]
  const canonical = new Map<string, string>()
  try {
    const registry = await readByIds<{ id: string; canonical_label: string | null }>(registryIds, (part) =>
      supabase
        .from('theme_registry')
        .select('id, canonical_label')
        .eq('client_id', clientId)
        .in('id', part)
        .order('id', { ascending: true }),
    )
    for (const r of registry) {
      if (r.canonical_label) canonical.set(r.id, r.canonical_label)
    }
  } catch {
    // The run's own labels stand. A registry that cannot be read costs the
    // canonical wording, never the rows.
  }
  for (const [id, at] of out) {
    const label = canonical.get(at.registryId) ?? labelOf.get(at.registryId) ?? at.label
    if (label) out.set(id, { registryId: at.registryId, label })
  }
  return out
}

// ---- WP2.2 · the subject on the market ------------------------------------------
//
// §2.3 S1-S6: the rail and the pane read the market (decision E), a subject's
// kinds and its makers are read on its own market videos, and the months are
// one pooled line whose refused steps are drawn broken. PURE below; the loader
// reads the rows.

/**
 * One member insight of the selected subject, with what the month rule reads
 * off it (`loadSubjectMembers`: the subject's memberships, each with its
 * insight, the insight's video and its evidence with each comment's date).
 */
export interface SubjectMember {
  insightId: string
  /** `audience_insights.category`: the kind of thing said. */
  kind: string | null
  videoId: string | null
  /** The video is filed under the client (`videos.is_client`): its own posts
   *  and videos that name it, which are not the market (decision E). */
  client: boolean
  /** The video carries a current analysis (`videos.analyzed_run_id`). */
  analysed: boolean
  evidence: readonly { source: string | null; commentDate: string | null }[]
}

const inMonth = (day: string | null, month: string): boolean => {
  if (!day) return false
  const d = day.slice(0, 10)
  const from = monthStartOf(month)
  return d >= from && d < nextMonth(from)
}

/**
 * The subject's MARKET videos in a month, by the month reading's own rule
 * (MF2 `lens_readings`' two arms, which reproduce `month_subject_readings`):
 * a member insight cited on a comment dated in the month counts its video; a
 * member whose only evidence is on camera or on the frame counts its video
 * when that video occupies the month (`occupies`: videos with a comment dated
 * in it). A comment's video is its insight's own (staging, 26 Sep: 0 of every
 * comment citation sits on another video). The client's audience is not the
 * market, and a video with no current analysis is not read.
 *
 * `byKind` holds the same videos by the kind of the member that placed them:
 * what was said ABOUT the subject (§2.3 S3). A video counts once per kind and
 * may carry several kinds, so the kinds do not sum to the whole.
 *
 * Staging, September, Sealand (26 Sep): the set equals the pooled stored k on
 * all six read subjects (Looks & style 103, Comfort 43, Durability 39,
 * Repair & warranty 36, Waterproofing 29, Price 25).
 */
export function subjectMonthVideos(
  members: readonly SubjectMember[],
  month: string,
  occupies: ReadonlySet<string> | null,
): { videos: Set<string>; byKind: Map<string, Set<string>> } {
  const videos = new Set<string>()
  const byKind = new Map<string, Set<string>>()
  for (const m of members) {
    if (!m.videoId || m.client || !m.analysed) continue
    const comments = m.evidence.filter((e) => e.source === 'comment')
    const cited = comments.some((e) => inMonth(e.commentDate, month))
    const onCamera = comments.length === 0
      && m.evidence.some((e) => e.source === 'video' || e.source === 'video_text')
      && (occupies?.has(m.videoId) ?? false)
    if (!cited && !onCamera) continue
    videos.add(m.videoId)
    if (m.kind) {
      const held = byKind.get(m.kind) ?? new Set<string>()
      held.add(m.videoId)
      byKind.set(m.kind, held)
    }
  }
  return { videos, byKind }
}

/** The six big kinds, printed on every subject even at 0 (the preview's
 *  "Hitting a problem · no video"); any other kind prints where it has a video. */
export const SUBJECT_KINDS: readonly string[] = ['praise', 'purchase_intent', 'feature_request', 'objection', 'question', 'pain_point']

/** The kinds inside a subject, largest first (ties in `SUBJECT_KINDS`' order,
 *  then `KIND_ORDER`'s), each with its market label. */
export function kindsInRows(byKind: ReadonlyMap<string, ReadonlySet<string>>): { kind: string; label: string; k: number }[] {
  const kinds = [...SUBJECT_KINDS, ...[...byKind.keys()].filter((k) => !SUBJECT_KINDS.includes(k) && (byKind.get(k)?.size ?? 0) > 0)]
  const rank = (kind: string) => {
    const i = SUBJECT_KINDS.indexOf(kind)
    return i >= 0 ? i : SUBJECT_KINDS.length + Math.max(KIND_ORDER.indexOf(kind), 0)
  }
  return kinds
    .map((kind) => ({ kind, label: marketKindLabel(kind), k: byKind.get(kind)?.size ?? 0 }))
    .sort((a, b) => b.k - a.k || rank(a.kind) - rank(b.kind))
}

/** A kind as a noun, for the lead's "almost all of it is praise". Only the
 *  six big kinds: any other kind leads in the plain form. */
const KIND_NOUNS: Readonly<Record<string, string>> = {
  praise: 'praise',
  question: 'questions',
  pain_point: 'problems',
  purchase_intent: 'readiness to buy',
  objection: 'pushback',
  feature_request: 'requests',
}

/**
 * The kinds block's one-line answer (the preview's "Almost all of it is praise:
 * 92 of its 102 videos."). A share word only where the subject carries a share
 * (100 videos) and the kind 10 of its own; otherwise the count, "Most often,
 * hitting a problem: 11 of its 29 videos." No line where no kind has a video,
 * or where two kinds tie for the lead (neither leads).
 */
export function kindsInLead(kindsIn: { of: number; rows: readonly { kind: string; label: string; k: number }[] }): string | null {
  const [top, second] = kindsIn.rows
  if (!top || top.k <= 0 || kindsIn.of <= 0) return null
  if (second && second.k === top.k) return null
  const of = `${fmtInt(top.k)} of its ${fmtInt(kindsIn.of)} videos`
  const noun = KIND_NOUNS[top.kind]
  const share = top.k / kindsIn.of
  if (noun && carriesShare(kindsIn.of) && top.k >= (SHARE_BAND.minK ?? 10)) {
    if (share >= 0.85) return `Almost all of it is ${noun}: ${of}.`
    if (share > 0.5) return `Most of it is ${noun}: ${of}.`
  }
  return `Most often, ${top.label.toLowerCase()}: ${of}.`
}

/**
 * The subject's pooled market line over `months` (decision E): each month's k
 * summed over the market's audiences (`pooledSide`) and n the market's videos,
 * k null in a month the subject was not read in. The points carry the
 * category line's month state, status and origin (one denominator table, one
 * clock); the line's audience is `MARKET_LINE`, which the month-pair judge
 * reads as the market view.
 */
export const MARKET_LINE = 'market'

export function marketLineOf(input: {
  subjectId: string
  label: string
  months: readonly string[]
  /** The subject's line in each market audience (the category's first). */
  lines: readonly MonthSeries[]
  counts: ReadonlyMap<string, MarketCount>
  rivalAudiences: readonly string[]
  read: (month: string) => boolean
}): MonthSeries | null {
  const template = input.lines.find((l) => l.audience === INDUSTRY_AUDIENCE) ?? input.lines[0] ?? null
  if (!template) return null
  const byAudience = input.lines.map((l) => ({ audience: l.audience, points: pointsByMonth(l) }))
  const tpl = pointsByMonth(template)
  const points = input.months.map((m) => {
    const month = monthStartOf(m)
    const base = tpl.get(month) ?? null
    const rows = byAudience
      .map((l) => ({ audience: l.audience, point: l.points.get(month) ?? null }))
      .filter((r) => r.point != null && r.point.videos != null)
      .map((r) => ({ month, audience: r.audience, k: r.point!.k }))
    const read = input.read(month)
    const side = pooledSide(rows, input.counts, month, input.rivalAudiences, { read })
    const k = read ? side.k : null
    const n = side.n
    return {
      month,
      state: base?.state ?? 'missing',
      videos: n,
      comments: input.counts.get(month)?.comments ?? null,
      k,
      kComments: null,
      pct: k != null && n != null && n > 0 ? Math.round((k / n) * 1000) / 10 : null,
      audience: MARKET_LINE,
      status: base?.status ?? null,
      origin: base?.origin ?? null,
      readAt: base?.readAt ?? null,
      runId: base?.runId ?? null,
      frozenAt: base?.frozenAt ?? null,
      clusteringKey: null,
      labels: [],
    } as MonthSeries['points'][number]
  })
  return {
    audience: MARKET_LINE,
    names: [MARKET_LINE],
    objectId: input.subjectId,
    objectLabel: input.label,
    points,
    notes: [],
    firstReadable: points.find((p) => p.k != null && carriesShare(p.videos))?.month ?? null,
    substrate: template.substrate,
  }
}

/** The months a subject was read in, on the market line (k and n both there). */
export const monthsReadOf = (line: MonthSeries | null | undefined): MonthSeries['points'] =>
  (line?.points ?? []).filter((p) => p.k != null && p.videos != null && p.videos > 0)

/**
 * The pane's trail, "Aug 10% of 377 · Sep 16% of 654": the last three months
 * read, each a level on the market's base (`marketLevel`: a whole percent at
 * 100 videos and 10 of its own, the count under) with its "of N" (§4.0: every
 * level prints its base). Levels side by side, never a direction.
 */
export function marketTrail(line: MonthSeries | null | undefined): { month: string; text: string; of: string }[] {
  // ONLY THE MONTHS SINCE THE LATEST REFUSED STEP (T0a, SB-17; the one
  // condition): "Aug 10% of 377 · Sep 16% of 654" across a refused pair is
  // the comparison the judge refused, chip or no chip. The line carries its
  // refused steps (`refusedSteps`, judged on the market view).
  const breaks = Object.keys(line?.refusedSteps ?? {}).map(monthStartOf).sort()
  const since = breaks.length > 0 ? breaks[breaks.length - 1] : null
  return monthsReadOf(line).filter((p) => since == null || monthStartOf(p.month) >= since).slice(-3).flatMap((p) => {
    const level = marketLevel(p.k, p.videos)
    return level ? [{ month: p.month, text: level.text, of: `of ${fmtInt(p.videos as number)}` }] : []
  })
}

/**
 * The share of each subject's market videos this month that are makers', from
 * MF2 `lens_readings` rows read over the month's maker videos (per audience;
 * pooled over the market here), against the subject's pooled k. Null where
 * the subject has no k, or the maker read did not happen.
 */
export function makerKOf(rows: readonly { audience: string; object_kind: string; object_id: string; k: number }[] | null, subjectId: string, rivalAudiences: readonly string[]): number | null {
  if (!rows) return null
  const market = new Set(marketAudiences(rivalAudiences))
  return rows
    .filter((r) => r.object_kind === 'subject' && r.object_id === subjectId && market.has(r.audience))
    .reduce((n, r) => n + (Number.isFinite(r.k) ? r.k : 0), 0)
}

/**
 * The words a Month by month card prints under its month.
 *
 * A month read: "final" once frozen, "so far" while it runs, "updates paused"
 * where none is coming, else "ended · still filling until the {date} update"
 * (the first scheduled update after its freeze line). A month still to come:
 * "so far from {day} · ended from {1st}", the day the pages switch to it
 * (`READING_SWITCH_FRACTION` of the month, decision A); the later month of the
 * next comparable pair: "settles with the {date} update". "Complete" is never
 * a state (§4.0).
 */
export function monthCardState(input: {
  month: string
  now: string
  read: boolean
  status: MonthStatus | null
  paused: boolean
  nextUpdateAfter: ((instant: string) => string | null) | null
  settlesWith?: string | null
}): string {
  const m = monthStartOf(input.month)
  const nowMs = Date.parse(input.now)
  const ended = nowMs >= Date.parse(`${nextMonth(m)}T00:00:00.000Z`)
  const after = input.nextUpdateAfter
  if (input.read) {
    if (input.status === 'frozen') return 'final'
    if (!ended) return 'so far'
    if (input.paused) return 'updates paused'
    const settle = after ? after(freezeBoundary(m)) : null
    return settle ? `ended · still filling until the ${shortDate(settle)} update` : 'ended'
  }
  if (input.settlesWith) return `settles with the ${shortDate(input.settlesWith)} update`
  const days = daysInMonth(m)
  const day = Math.ceil(days * READING_SWITCH_FRACTION)
  const from = `${m.slice(0, 8)}${String(day).padStart(2, '0')}`
  return `so far from ${shortDate(from)} · ended from ${shortDate(nextMonth(m))}`
}

// ---- WP2.5 · the questions each subject was asked, for the front page -------------

/** One subject's questions over a window: the videos that asked (not your
 *  own), and the question insights behind them. */
export interface SubjectQuestions {
  subjectId: string
  questionVideos: number
  insights: { id: string; videoId: string }[]
}

/**
 * Every subject's question videos over a window, in ONE paged read (WP2.5):
 * the members that are question insights, embedded with their video's
 * upload day and whose audience it is. The same count SU3 prints on the
 * Subjects page (`loadUnanswered`: non-owned videos, placed by the day they
 * were posted), for all subjects at once, so the front page can name the one
 * asked about most. Null where M4 is not applied.
 */
export async function loadQuestionsBySubject(
  supabase: SupabaseClient,
  clientId: string,
  subjectIds: readonly string[],
  window: { from: string; to: string },
): Promise<SubjectQuestions[] | null> {
  if (subjectIds.length === 0) return []
  type Row = {
    subject_id: string
    audience_insight_id: string
    audience_insights: { source_video_id: string | null; videos: { is_client: boolean | null; upload_date: string | null } | { is_client: boolean | null; upload_date: string | null }[] | null } | null
  }
  try {
    const rows = await selectAll<Row>(() =>
      supabase
        .from(TABLE_SUBJECT_MEMBERSHIPS)
        .select('subject_id, audience_insight_id, audience_insights!inner(source_video_id, videos(is_client, upload_date))')
        .eq('client_id', clientId)
        .in('subject_id', [...subjectIds])
        .eq('member', true)
        .eq('audience_insights.category', 'question')
        .order('audience_insight_id', { ascending: true }) as never,
    )
    const from = window.from.slice(0, 10)
    const to = window.to.slice(0, 10)
    const out = new Map<string, { videos: Set<string>; insights: { id: string; videoId: string }[] }>(subjectIds.map((id) => [id, { videos: new Set(), insights: [] }]))
    for (const r of rows) {
      const ai = r.audience_insights
      const v = Array.isArray(ai?.videos) ? ai?.videos[0] ?? null : ai?.videos ?? null
      const day = v?.upload_date?.slice(0, 10) ?? null
      if (!ai?.source_video_id || !v || v.is_client || !day || day < from || day >= to) continue
      const held = out.get(r.subject_id)
      if (!held) continue
      held.videos.add(ai.source_video_id)
      held.insights.push({ id: r.audience_insight_id, videoId: ai.source_video_id })
    }
    return [...out.entries()].map(([subjectId, h]) => ({ subjectId, questionVideos: h.videos.size, insights: h.insights }))
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

// ---- what the blocks declare ----------------------------------------------------

/** The figures the selected subject's hero prints, by token. */
/**
 * The pane's headline figure (market page default M-b): the subject's level in
 * the market, on the rail's own base, so one screen shows one base: "Waterproofing
 * came up in 29 of 654 September videos in your market (4%)." The preview's
 * pane sentence ("came up in 104 of 626 September category videos (17%)"),
 * read on the market the rail prints. The share through `levelText`: a whole
 * percent at 100 videos or more, and the count alone under it.
 *
 * Null where the pane has no market figure (a stored pane, a failed subject,
 * or one the month was not read for, which says "no reading yet" in its word's
 * place instead). The Phase 1 brand comparison (the gap line and the sides)
 * stays below it, unchanged.
 */
export function paneMarketLead(
  pane: Pick<SubjectPane, 'name' | 'calibration' | 'market' | 'unread'>,
  month: string,
): string | null {
  const m = pane.market
  if (!m || pane.unread || readCalibration(pane.calibration) === 'failed') return null
  const level = levelText(m.k, m.n)
  if (!level) return null
  const when = longMonth(month)
  return level.kind === 'share'
    ? `${pane.name} came up in ${fmtInt(m.k)} of ${fmtInt(m.n)} ${when} videos in your market (${level.text}).`
    : `${pane.name} came up in ${level.text} ${when} videos in your market.`
}

export function sideFigures(pane: SubjectPane | null): FigureTable {
  const out: FigureTable = {}
  if (!pane) return out
  // The headline's market figure (default M-b), under the keys it prints.
  const m = pane.market
  if (m && !pane.unread && readCalibration(pane.calibration) !== 'failed' && levelText(m.k, m.n)) {
    out.subject_market_videos = { value: m.k, unit: 'videos', label: `${pane.name}, videos in your market this month` }
    if (levelText(m.k, m.n)?.kind === 'share') {
      out.subject_market_share = { value: Math.round((m.k / m.n) * 100), unit: 'pct', label: `${pane.name}, share of your market this month` }
    }
  }
  for (const s of paneSides(pane)) {
    if (s.pct == null || s.k == null || s.n == null) continue
    const token = `subject_${s.kind}_${s.audience.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`
    const whose = sideWhose(s)
    out[`${token}_share`] = { value: s.pct, unit: 'pct', label: `${pane.name}, ${whose} share this month` }
    out[`${token}_videos`] = { value: s.k, unit: 'videos', label: `${pane.name}, ${whose} videos this month` }
  }
  return out
}

/** Whose figure this is, in a label a reader and the cover prompt both see.
 *  Your own side is "your", never "You's"; a name that already ends in s takes
 *  the bare apostrophe. */
export function sideWhose(side: Pick<SubjectSide, 'kind' | 'label'>): string {
  if (side.kind === 'you') return 'your'
  return side.label.endsWith('s') ? `${side.label}’` : `${side.label}’s`
}
