import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, mapWithLimit, MULTI_ROW_IN_CHUNK, READ_CONCURRENCY } from '../chunk'
import { fmtInt, fmtPct, longMonth, monthName, platformLabel, shortDate } from '../format'
import { cleanQuote, fetchQuoteCitationsByAudience, readsAsHeroQuote, type QuoteCitation } from '../quotes'
import { citationLink } from '../evidence-cite'
import type { EvidenceSource } from '../pipeline/pass-a'
import { quoteRef } from '../renderables/quotes-freeze'
import type { Quote, Scope } from '../renderables/types'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, loadTrackedRivals, rivalKey, type TrackedRival } from '../rivals'
import { audienceLabel } from '../readiness/types'
import { SHARE_BAND } from '../report-bands'
import { directionWord, monthChange, thinMonth, type Direction, type SeriesPoint } from '../reading/bands'
import { horizonWindow, HORIZON_LABEL, parseHorizon, sinceStart, type Horizon } from '../reading/horizon'
import { kindChange, kindShares, redditRead, type KindShare, type RedditRead } from '../reading/kinds'
import {
  claimEcho,
  ownCensusWithClaims,
  type ClaimEcho,
  type OwnPostCensus,
  type OwnPostInput,
} from '../reading/own-posts'
import { claimCounts, ledgerRows, type ClaimCounts } from '../market-tiles'
import type { SayVsHearEntry } from '../pipeline/schemas'
import { isMissingKindMoodAttention } from '../reading/attention'
import { freezeStateFor, isMissingMonthTable } from '../reading/monthly'
import { monthStartOf, nextMonth } from '../reading/month-key'
import { gapBetween, type Gap, type GapSide } from '../reading/gap'
import { loadMonthSeries, type ReadingHandle } from '../reading/read'
import { methodLines, type MethodLines } from '../reading/method'
import { countRefused, howSoundLine, loadRecordInputs, monthRecordWindow, recordLines, refusals, type RecordInputs } from '../reading/record'
import { pointsByMonth, type MonthLabel, type MonthSeries, type Substrate } from '../reading/series'
import type { MonthStatus } from '../reading/types'
import type { FigureTable, RefusedReason, Verdict } from '../reading/verdicts'
import {
  isMissingSubjects,
  subjectCalibration,
  TABLE_SUBJECTS,
  TABLE_SUBJECT_MEMBERSHIPS,
  TABLE_MOVES,
  type Move,
  type Subject,
  type SubjectCalibration,
} from '../subjects/types'
import { selectAll } from '../supabase-admin'
import { fetchRunningRunIds } from './latest-video-run'
import { fetchThemedRunId } from './themed-run'

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
  'Counted in the videos we have read on this subject over the period shown, each placed by the day it was posted — not by the calendar month the rest of this page reads. So these are counts, not shares, and carry no change.'

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
  'We match these against what your posts are about. What your posts claim is not readable yet.'

/**
 * What SU5 says when it cannot read the claims ledger at all.
 *
 * ITS OWN SENTENCE, NOT THE CENSUS'S (fix pass). Say vs hear answers "what did
 * we claim, and did anyone take it up?" and printed
 * `OwnPostCensus.claimsNote` — "These are the posts you published…" — which is
 * the answer to a different question, on a tile that is not about posts, and
 * printed a second time by Your own posts one tile above. The unreadable half
 * is the same half; the sentence is this block's.
 *
 * And it carries no readiness owner either, for the reason above.
 */
export const SAY_HEAR_CLAIMS_UNREADABLE =
  'What your posts claim is not readable on this page yet, so there is no ledger to report.'

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
  calibration: SubjectCalibration
  /** Your own side this month, as a level. Null while the subject is
   *  calibrating — a share nobody has measured the precision of is not shown
   *  to a client (design :891). */
  level: { k: number; n: number; pct: number | null } | null
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
   * where the month is too thin to band anything on this page.
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
}

export interface SubjectPane {
  id: string
  name: string
  description: string | null
  namedAt: string
  origin: Subject['origin']
  calibration: SubjectCalibration
  index: number
  of: number
  sides: SubjectSide[]
  /** The chart's lines, one per side, in axis order. */
  series: MonthSeries[]
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
  horizon: Horizon
  axis: string[]
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
  record: SubjectsRecordBlock
  /**
   * The method footnote, composed once for every surface (block D, D9).
   *
   * ONE FIELD, ONE CALL LINE, ON EVERY PAGE, from the `RecordInputs` this page
   * already loads — so the language share and the read-depth basis cannot come
   * to be worded differently here and on the next surface. Null only where the
   * record behind it could not be read. See lib/reading/method.ts.
   */
  method: MethodLines | null
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

/** Why this subject's share is not being shown. Null when it is.
 *
 *  THREE DIFFERENT SILENCES AND THEY READ DIFFERENTLY. "Not counted yet" is
 *  about the CONSENT — the subject is named and nobody has confirmed it, so
 *  nothing has ever looked. "Calibrating" is about the MEASUREMENT — nobody
 *  has checked how often the judge is right, so the number exists and may not
 *  be printed. "No reading yet" is about the RECORD — the month holds no row.
 *  Collapsing them into one sentence was how the old product told a client its
 *  data was missing when its method was. */
export function railNote(
  calibration: SubjectCalibration,
  read: boolean,
  status: Subject['status'] = 'active',
): string | null {
  if (status === 'proposed') return 'not counted yet — confirm it and counting starts with the next update'
  if (calibration === 'calibrating') return 'still checking how often we get this right'
  if (!read) return 'no reading yet'
  return null
}

/** Which subject the page is about: the one asked for, else the first
 *  confirmed one, else nothing. A subject that is not this tenant's, or is
 *  retired, is not selected by a URL — it simply is not in the list. */
export function selectSubject(rail: readonly { id: string }[], asked: string | undefined): string | null {
  if (asked && rail.some((r) => r.id === asked)) return asked
  return rail[0]?.id ?? null
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
  const tail = 'original first, English beneath when translated'
  return sampled
    ? `${fmtInt(shown)} shown, drawn from a sample of what was said on this subject · ${tail}`
    : `${fmtInt(shown)} of ${fmtInt(from)} · ${tail}`
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
  const want = matchWords(label)
  if (want.length < 2) return false
  const pool = new Set(haystack.flatMap(matchWords))
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
    ? `Questions grouped as “${lead.label}” came up in ${fmtInt(lead.videos)} of the videos we have read — ${lead.posts}.`
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
  if (side.kind === 'you') return brand ? `You — ${brand}` : 'You'
  if (side.kind === 'category') return 'Category — no brand'
  return side.label.includes(' — ') ? side.label : `${side.label} — rival`
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
  if (side.kind === 'you') return brand ? `${brand} — you` : 'You'
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
): string | null {
  const hollow = sides.filter((s) => s.observed && (s.n ?? 0) < floorN)
  const names = (of: readonly SubjectSide[]) => of.map((s) => s.label).join(' and ')
  const parts: string[] = []
  if (hollow.length > 0) {
    parts.push(
      `${names(hollow)} carried too few videos this month to compare ` +
      `(${hollow.map((s) => `${fmtInt(s.n ?? 0)}`).join(', ')}) — drawn hollow, with a level and no change.`,
    )
  }
  // TWO SILENCES, TWO SENTENCES. An audience we never read is "not tracked";
  // an audience we read that carried nothing on this subject has "no reading
  // yet", and the second is the one a newly confirmed subject is in on the
  // client's OWN side.
  const noReading = sides.filter((s) => s.silence === 'no_reading')
  const notTracked = sides.filter((s) => s.silence === 'not_tracked')
  if (noReading.length > 0) parts.push(`${names(noReading)} — no reading yet on this subject.`)
  if (notTracked.length > 0) parts.push(`${names(notTracked)} — not tracked.`)

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

interface RunRow {
  id: string
  started_at: string
}

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

/** A stored month table, read straight. Null — never [] — when the migration
 *  that creates it has not been applied here (the WP11 precedent). */
async function readStoredMonths<T>(
  client: SupabaseClient,
  table: string,
  clientId: string,
  months: readonly string[],
  order: readonly string[],
  missing: (error: unknown) => boolean,
): Promise<T[] | null> {
  if (months.length === 0) return []
  try {
    return await selectAll<T>(() => {
      let q = client
        .from(table)
        .select('*')
        .eq('client_id', clientId)
        .gte('month', months[0])
        .lte('month', months[months.length - 1])
      for (const col of order) q = q.order(col, { ascending: true })
      return q
    })
  } catch (error) {
    if (missing(error) || isMissingMonthTable(error)) return null
    throw error
  }
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

/** The member insight ids of one subject, at any judge version. Id-set lookups
 *  stay on the base tables (AGENTS.md): a membership row cascades with its
 *  insight, so an id that resolves is an insight that is still live. */
export async function loadMemberInsightIds(
  supabase: SupabaseClient,
  clientId: string,
  subjectId: string,
): Promise<string[] | null> {
  try {
    const rowsOut = await selectAll<MembershipRow>(() =>
      supabase
        .from(TABLE_SUBJECT_MEMBERSHIPS)
        .select('audience_insight_id')
        .eq('client_id', clientId)
        .eq('subject_id', subjectId)
        .eq('member', true)
        .order('audience_insight_id', { ascending: true }),
    )
    return [...new Set(rowsOut.map((r) => r.audience_insight_id))]
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
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
      membership = (subjects ?? [])
        .filter((s) => bySubject.has(s.id))
        .map((s) => ({ subjectId: s.id, label: s.name, videoIds: [...(bySubject.get(s.id) ?? [])] }))
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

/**
 * One echo per census claim, counted rather than asserted.
 *
 * THE CHAIN, AND WHY IT IS GUARDED. A claim's echo is "how many videos in your
 * own audience carried what this claim rests on, of how many" — which means
 * `run_summary.say_vs_hear.supporting_theme_ids` (durable audience-insight
 * ids) → the `theme_registry` entries holding them in the client bucket →
 * `month_theme_readings` for this month through `loadMonthSeries`. Two reads.
 * They are skipped entirely when the census has no claims to echo, which is
 * every tenant today while `video_claims` is closed — so the page pays nothing
 * for this until the day it has something to say.
 *
 * ONE CLAIM'S READING IS ITS STRONGEST THEME, NOT THE SUM OF THEM. Adding the
 * themes behind a claim double-counts every video that carried two of them,
 * and a k above its own n is not a proportion. The maximum is the honest
 * single reading: "the most-carried thing this claim rests on reached k of n".
 */
export async function loadClaimEchoes(
  supabase: SupabaseClient,
  reading: ReadingHandle,
  clientId: string,
  month: string,
  claims: readonly { claim: string }[],
  entries: readonly SayVsHearEntry[],
): Promise<ClaimEcho[]> {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const stanceOf = new Map(entries.map((e) => [norm(e.you_say), e]))
  const matched = claims.map((c) => stanceOf.get(norm(c.claim)) ?? null)
  const insightIds = [...new Set(matched.flatMap((e) => e?.supporting_theme_ids ?? []))]
  const none = (): ClaimEcho[] =>
    claims.map(() => claimEcho({ audience: CLIENT_AUDIENCE, audienceLabel: 'You', reading: null }))
  if (insightIds.length === 0) return none()

  const registry = await selectAll<{ id: string; member_insight_ids: string[] | null }>(() =>
    supabase
      .from('theme_registry')
      .select('id, member_insight_ids')
      .eq('client_id', clientId)
      .eq('bucket', CLIENT_AUDIENCE)
      .overlaps('member_insight_ids', insightIds)
      .order('id', { ascending: true }),
  ).catch(() => [] as { id: string; member_insight_ids: string[] | null }[])
  if (registry.length === 0) return none()

  const set = await loadMonthSeries(reading.client, clientId, {
    from: month,
    to: month,
    audiences: [CLIENT_AUDIENCE],
    objectKind: 'theme',
    objectIds: registry.map((r) => r.id),
    updatesByMonth: {},
  })
  if (set.numeratorSubstrate === 'missing') return none()
  const readingOf = new Map<string, { k: number | null; videos: number | null }>()
  for (const s of set.series) {
    if (!s.objectId) continue
    const point = pointsByMonth(s).get(monthStartOf(month))
    if (point) readingOf.set(s.objectId, { k: point.k, videos: point.videos })
  }

  return claims.map((_, i) => {
    const entry = matched[i]
    const ids = new Set(entry?.supporting_theme_ids ?? [])
    let best: { k: number; n: number } | null = null
    for (const r of registry) {
      if (!(r.member_insight_ids ?? []).some((id) => ids.has(id))) continue
      const point = readingOf.get(r.id)
      if (!point || point.k == null || point.videos == null) continue
      if (!best || point.k > best.k) best = { k: point.k, n: point.videos }
    }
    return claimEcho({ audience: CLIENT_AUDIENCE, audienceLabel: 'You', reading: best, stance: entry?.audience ?? null })
  })
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
  const horizon = parseHorizon(params.horizon)

  // Wave 1 holds what the empty-state guard itself needs and what the page
  // cannot be shaped without; anything else starts on the line after the guard,
  // so a tenant that draws nothing pays for nothing.
  const [clientRes, runsRaw, rivals, subjectRows, moveRows] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    selectAll<RunRow>(() =>
      supabase.from('pipeline_runs').select('id, started_at')
        .eq('client_id', clientId).in('status', ['completed', 'partial'])
        .order('started_at', { ascending: true }),
    ),
    loadTrackedRivals(supabase, clientId),
    loadSubjectRows(supabase, clientId),
    loadSubjectMoves(supabase, clientId),
  ])
  const brand = (clientRes.data as { company_name?: string | null } | null)?.company_name ?? 'Your brand'
  if (runsRaw.length === 0) return null

  // WHICH SUBJECT IS SELECTED IS A PURE FUNCTION OF WAVE 1 AND THE URL, so it
  // is answered here rather than after the axis — the themed run is the only
  // read that depends on the answer, and asking it early is what lets that read
  // overlap wave 2 instead of sitting alone between two waves.
  const active = (subjectRows ?? []).filter((s) => s.status === 'active')
  const proposed = (subjectRows ?? []).filter((s) => s.status === 'proposed')
  const selectedId = selectSubject(active, params.item)

  // THE THEMED RUN, STARTED HERE AND TAKEN WHERE IT IS USED (WP23). It waits
  // on the running-run ids and on nothing else, and it used to be read inside
  // the selected subject's branch, behind the whole axis. Started here it
  // overlaps wave 2 — and ONLY WHEN A SUBJECT IS SELECTED, because the pane is
  // the only thing that reads it: a rail with nothing open makes the two reads
  // it made before this package, not two more.
  const themedRunAhead = selectedId
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
  const window = horizonWindow(horizon, readingAt, started.from)
  const axis = window.months
  const month = axis[axis.length - 1]
  // The page reads one month wider than it draws: "this month" is a one-month
  // axis, and the comparison is the calendar's, not the horizon's (OV0's rule).
  const prevMonth = previousMonthOf(month)
  const readAxis = axis[0] <= prevMonth ? axis : [prevMonth, ...axis]
  const monthStatus = freezeStateFor(month, readingAt)

  // The record's reads depend on the month alone; its refusals are arithmetic
  // over verdicts the page has not made yet and are added below.
  const recordAhead = loadRecordInputs(reading.client, clientId, monthRecordWindow(month, readingAt), { now: readingAt })
  recordAhead.catch(() => {})

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
  ownPostsAhead.catch(() => {})
  sayHearAhead.catch(() => {})

  const [subjectSet, kindRows] = await Promise.all([
    selectedId
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
    readStoredMonths<StoredKindRow>(
      reading.client, 'month_kind_readings', clientId, readAxis,
      ['month', 'audience', 'kind'], isMissingKindMoodAttention,
    ),
  ])

  const seriesFor = (subjectId: string, audience: string): MonthSeries | null =>
    subjectSet?.series.find((s) => s.objectId === subjectId && s.audience === audience) ?? null

  // CONFIRMED FIRST, THEN NAMED-BUT-NOT-CONFIRMED, and both in the ONE list.
  // A proposed subject was kept out of the rail at first and listed underneath
  // as prose, which left the only control that can start it counting — Confirm
  // — on a row a client could not reach. The editor is the whole live set; the
  // row says which of the two it is.
  const rail: SubjectRail[] = [...active, ...proposed].slice(0, RAIL_MAX).map((s) => {
    const calibration = subjectCalibration(s)
    const own = seriesFor(s.id, CLIENT_AUDIENCE)
    const byMonth = own ? pointsByMonth(own) : new Map()
    const point = byMonth.get(month) ?? null
    const before = byMonth.get(prevMonth) ?? null
    const read = s.status === 'active' && point != null && point.k != null && point.videos != null
    const railPoint = (m: string, p: { k: number | null } | null): SeriesPoint => ({
      month: m,
      videos: perAudience.get(`${m}|${CLIENT_AUDIENCE}`) ?? null,
      k: p?.k ?? null,
      audience: CLIENT_AUDIENCE,
      // A subject's membership is not a clustering artefact — buildSides'
      // own line, for the same reason.
      regime: 'n/a',
    })
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      origin: s.origin,
      namedAt: s.named_at,
      status: s.status,
      calibration,
      level: read && calibration === 'ready'
        ? { k: point!.k!, n: point!.videos!, pct: pctOf(point!.k, point!.videos) }
        : null,
      note: railNote(calibration, read, s.status),
      verdict: thin || !read || calibration !== 'ready'
        ? null
        : monthChange({
            object: { kind: 'subject', id: s.id, label: s.name },
            audience: CLIENT_AUDIENCE,
            curr: railPoint(month, point),
            prev: railPoint(prevMonth, before),
          }),
      selected: s.id === selectedId,
      href: s.status === 'active' ? `/dashboard/subjects?item=${encodeURIComponent(s.id)}` : '',
    }
  })

  const list: SubjectListBlock = {
    rows: rail,
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
    const sides = buildSides({
      subject,
      rivals,
      leadRival,
      month,
      prevMonth,
      axis: readAxis,
      perAudience,
      kindRows,
      seriesFor,
      thin,
    })
    const series = sides.map((side) => seriesFor(subject.id, side.audience)).filter((s): s is MonthSeries => s != null)

    const memberIds = await loadMemberInsightIds(supabase, clientId, subject.id)
    const themedRunId = themedRunAhead ? await themedRunAhead : null
    const [voices, unanswered] = await Promise.all([
      loadVoices(supabase, clientId, memberIds ?? []),
      loadUnanswered(supabase, clientId, memberIds ?? [], {
        window: { from: window.from, to: window.to },
        period: periodPhrase(horizon, month),
        themedRunId,
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

    selected = {
      id: subject.id,
      name: subject.name,
      description: subject.description,
      namedAt: subject.named_at,
      origin: subject.origin,
      calibration: subjectCalibration(subject),
      index: active.findIndex((s) => s.id === subject.id) + 1,
      of: active.length,
      sides,
      series,
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
      axisNote: axisNote(sides, FLOOR_N, series),
      notRecorded: subjectSet?.numeratorSubstrate === 'missing'
        ? 'This subject has no monthly reading recorded for this workspace yet.'
        : null,
    }
  }

  // ── SU4 · your own posts, and the claims ledger ───────────────────────
  const census = await ownPostsAhead
  const sayHear = await sayHearAhead
  // The echo reads run only where there is a claim to echo — which is nowhere
  // until `video_claims` opens to a tenant session. See `loadClaimEchoes`.
  const ownPosts: OwnPostCensus = census.claims.length === 0
    ? census
    : await loadClaimEchoes(supabase, reading, clientId, month, census.claims, sayHear.entries).then((echoes) => ({
        ...census,
        claims: census.claims.map((c, i) => ({ ...c, echo: echoes[i] ?? c.echo })),
      }))

  // ── the record ────────────────────────────────────────────────────────
  const pageVerdicts = (selected?.sides ?? []).map((s) => s.verdict).filter((v): v is Verdict => v != null)
  const recordInputs: RecordInputs = {
    ...(await recordAhead),
    comparisonsRefused: countRefused(pageVerdicts),
    refusals: refusals(pageVerdicts),
  }

  return {
    brand,
    month,
    monthStatus,
    readingAt,
    horizon,
    axis,
    substrate: subjectSet?.numeratorSubstrate ?? history.substrate,
    notes: subjectNotes(subjectSet?.notes),
    list,
    selected,
    ownPosts,
    sayHear: sayHear.counts,
    record: {
      line: howSoundLine(recordInputs),
      lines: recordLines(recordInputs),
    },
    method: methodLines(recordInputs, { brand }),
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
  perAudience: Map<string, number>
  kindRows: StoredKindRow[] | null
  seriesFor: (subjectId: string, audience: string) => MonthSeries | null
  thin: boolean
}

/**
 * You, each rival and the category, as the three sides of one subject.
 *
 * WHAT A SIDE MAY CARRY IS DECIDED BY ITS OWN n, NOT BY THE PAGE'S. On the
 * paying tenant your own audience carries 84 videos in a month and the category
 * 1,388, so the category is the only side of the three that can carry a monthly
 * change — and a page that printed the same verdict shape on all three would
 * print "too few to compare" on two of them for ever without saying why. The level
 * is real on every side and is always shown; the CHANGE is drawn where the band
 * can be, and `axisNote` says in one sentence which lines those are.
 */
export function buildSides(input: SidesInput): SubjectSide[] {
  const { subject, month, prevMonth, axis, perAudience, thin } = input
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
      label: r.retiredAt ? `${r.name} — stopped` : r.name,
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
            })
    }
    return out
  }

  return sides.map((s) => {
    const series = input.seriesFor(subject.id, s.audience)
    const byMonth = series ? pointsByMonth(series) : new Map()
    const here = byMonth.get(month) ?? null
    const before = byMonth.get(prevMonth) ?? null
    const n = perAudience.get(`${month}|${s.audience}`) ?? null
    const k = here?.k ?? null
    const observed = n != null && k != null
    const silence: SubjectSide['silence'] = n == null ? 'not_tracked' : k == null ? 'no_reading' : null

    const point = (m: string): SeriesPoint => {
      const p = byMonth.get(m) ?? null
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
      direction: thin ? null : directionWord(axis.map(point)),
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
): Promise<VoiceRead> {
  const read = await loadVoicesMany(supabase, clientId, [{ key: 'one', insightIds }])
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
   *  first day). A monthly artefact asks for one; the Subjects page, which is
   *  read over a horizon and says so, asks for none. */
  month?: string
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
  type CommentMeta = { platform: string | null; comment_date: string | null; video_id: string | null; comment_id: string | null }
  const meta = new Map<string, CommentMeta>()
  if (commentIds.length > 0) {
    const read = await readByIds<CommentMeta & { id: string }>(commentIds, (part) =>
      supabase
        .from('comments')
        .select('id, platform, comment_date, video_id, comment_id')
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
  if (nativeIds.length > 0) {
    type V = { platform: string | null; video_id: string | null; video_url: string | null; source: string | null; is_client: boolean | null; is_competitor: boolean | null; competitor_name: string | null }
    const read = await readByIds<V>(nativeIds, (part) =>
      supabase
        .from('videos')
        .select('platform, video_id, video_url, source, is_client, is_competitor, competitor_name')
        .eq('client_id', clientId)
        .in('video_id', part)
        .order('video_id', { ascending: true }),
    )
    for (const v of read) {
      if (!v.video_id) continue
      const key = `${v.platform}::${v.video_id}`
      if (v.video_url) urlByKey.set(key, v.video_url)
      if (v.source === 'owned') ownPostKeys.add(key)
      audienceByKey.set(
        key,
        v.is_client ? CLIENT_AUDIENCE : v.is_competitor ? rivalKey(v.competitor_name ?? 'unknown') : INDUSTRY_AUDIENCE,
      )
    }
  }

  for (const p of pools) {
    // A PERIOD IS DATED BY THE COMMENT (AGENTS.md), so a caller that asks for a
    // month gets the citations whose comment falls in it and no others — a
    // citation whose comment cannot be dated is not in any month. Without this
    // an artefact headed September prints a June comment under it.
    const considered = opts?.month
      ? p.considered.filter((c) => {
          const date = c.commentId ? meta.get(c.commentId)?.comment_date ?? null : null
          return date != null && date.slice(0, 7) === opts.month!.slice(0, 7)
        })
      : p.considered
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
    // one loud side cannot fill the list.
    const byAudience = new Map<string, QuoteCitation[]>()
    for (const c of considered) {
      const audience = audienceOf(c)
      byAudience.set(audience, [...(byAudience.get(audience) ?? []), c])
    }
    const order = [CLIENT_AUDIENCE, ...[...byAudience.keys()].filter((a) => a !== CLIENT_AUDIENCE && a !== INDUSTRY_AUDIENCE).sort(), INDUSTRY_AUDIENCE]
    const shown = voicesAcross(
      order.filter((a) => byAudience.has(a)).map((a) => ({ audience: a, items: byAudience.get(a) ?? [] })),
    )

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
      }
    })
    out.set(p.key, { voices, from: considered.length, sampled: p.sampled, readable: p.considered.length })
  }
  return out
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
  const haystack = ownVideos.flatMap((v) => v.topics ?? [])

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
        `${fmtInt(questionVideos)} video${questionVideos === 1 ? '' : 's'} asked something about this subject — ` +
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
        'questions yet — they are counted here and named with the next update.',
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
      answered: answeredBy(g.label, haystack),
      // NO ONWARD LINK. The obvious one is Voice's `?themes=`, and that
      // parameter matches on `themes.member_themes` SLUGS, not on a registry
      // id — a link that would silently filter to nothing. VO3 (WP13) is where
      // a question opens in full.
    }))
  const shown = ranked.filter((r) => !r.answered).slice(0, UNANSWERED_SHOWN)
  const redditVideos = [...groups.values()].reduce((n, g) => n + g.reddit.size, 0)

  return {
    rows: shown,
    questionVideos,
    yourPosts: ownVideos.length,
    lead: unansweredLead(shown, ownVideos.length, input.period),
    basis: UNANSWERED_BASIS,
    claims: UNANSWERED_CLAIMS_UNREADABLE,
    reddit: redditVideos > 0 ? REDDIT_THREAD_CAP : null,
    refusal: shown.length === 0
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
async function nameQuestions(
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

// ---- what the blocks declare ----------------------------------------------------

/** The figures the selected subject's hero prints, by token. */
export function sideFigures(pane: SubjectPane | null): FigureTable {
  const out: FigureTable = {}
  if (!pane) return out
  for (const s of pane.sides) {
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
