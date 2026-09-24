import type { SupabaseClient } from '@supabase/supabase-js'

import { COMPETITIVE_MIN_VIDEOS } from '../config'
import { QUARTER_UNLOCKS_AT } from '../reading/bands'
import { monthStartOf } from '../reading/month-key'
import { belowMedian, type FormatRow } from '../reading/formats'
import { methodLines, REDDIT_CAP_LINE, type MethodLines } from '../reading/method'
import {
  loadRecordInputs,
  monthRecordWindow,
  recordLines,
  totalPlatformMix,
  totalVideos,
  type RecordInputs,
} from '../reading/record'
import { platformShareLine } from '../reading/method'
import { deliveryRecord } from '../settings/delivery'
import { loadUpdates } from '../settings/record-load'
import { buildPlaybook, loadPlaybookVideos, type PlaybookBlock } from './playbook'
import { readingsCounter } from './overview'
import { fmtInt, fmtPct, fullDate, longMonth } from '../format'
import { CLIENT_AUDIENCE } from '../rivals'
import type { MonthStatus } from '../reading/types'
import { freezeStateFor } from '../reading/monthly'
import type { Scope } from '../renderables/types'

/**
 * The content brief's OWN surface (Block D wave 2, package E-content).
 *
 * WHY A SURFACE AND NOT A PAGE. Every other brief section borrows a block from
 * a reading surface a client already looks at, which is the rule that keeps a
 * brief from becoming a second measurement of the same month
 * (`lib/reports/documents/sections.ts`). Two of the content brief's pages have
 * no such surface: the mock's page 3 (formats, hooks, engagement) is `CO7`,
 * which Competitive has not mounted yet, and the mock's page 5 wants the
 * RECORD — the delivery line, the read depth, the tracking changes, the
 * refusals — which is a Settings drawer and not a reading block at all. Both
 * are genuinely the brief's, so they get a surface of their own rather than a
 * tile pushed onto a page that did not ask for one.
 *
 * NOTHING HERE IS A SECOND MEASUREMENT. `buildPlaybook` (wave 1, pure) is the
 * same function CO7 will call; `methodLines` / `recordLines` are the same
 * functions the five reading surfaces and Settings › The record call;
 * `deliveryRecord` is the composer Settings › The record prints; and
 * `readingsCounter` is Overview's own. This module reads the inputs and hands
 * them to those.
 *
 * THE TWO CLOCKS ARE NAMED, NOT RECONCILED (mock-gap D9, D5). A format, a hook
 * and an engagement rate are properties of a VIDEO and are dated by
 * `videos.upload_date`; every other figure on the brief is dated by the
 * comment. `PlaybookBlock.basisLine` says which on every figure it draws, and
 * the record's own lines say which window each of their figures is on. A brief
 * that put the two under one month label without saying so is the failure item
 * 43 exists to remove.
 */

// ── the record slide ────────────────────────────────────────────────────────

/** One row of the mock's "This brief in numbers" card that the deck's own
 *  method page does not build. Label left, value right — the artboard's `<dl>`. */
export interface NumberRow {
  label: string
  value: string
  /** True where the value is a measured figure rather than a sentence: the
   *  renderer marks those as figures and leaves a sentence unmarked. */
  figure: boolean
}

/**
 * The record's sentences, grouped into paragraphs.
 *
 * `recordLines` returns THIRTEEN complete sentences — delivery, coverage, read
 * depth, language, what was set aside, the instrument, the change log, the
 * refusals, the reading instant, the freeze — and a brief slide set one per
 * line ran off the bottom of a 1123 × 631 sheet with four of them unread. The
 * artboard's method page is four paragraphs, so the sentences are grouped into
 * four rather than shortened: nothing the record says is dropped, and the one
 * thing a reader loses is a line break.
 *
 * Grouped by COUNT and not by meaning, deliberately. Every line is a complete
 * sentence about how the reading was made, the order is `recordLines`' own, and
 * a hand-written grouping here would be a second place that has to be updated
 * when a line is added to that function.
 */
export function recordParagraphs(lines: readonly string[], paragraphs = 4): string[] {
  if (lines.length === 0) return []
  const per = Math.ceil(lines.length / Math.max(1, paragraphs))
  const out: string[] = []
  for (let i = 0; i < lines.length; i += per) out.push(lines.slice(i, i + per).join(' '))
  return out
}

export interface RecordSlide {
  /** The month this brief is a reading of, `YYYY-MM-01`. */
  month: string
  monthLabel: string
  monthStatus: MonthStatus
  /** The footnote, in print order — `methodLines`. Null where the record
   *  behind it could not be read. */
  method: MethodLines | null
  /** The record's own sentences — delivery, coverage, read depth, language,
   *  what was set aside, themes per video, tracking changes, refusals. */
  lines: string[]
  /** The same sentences, grouped into the artboard's four paragraphs. */
  paragraphs: string[]
  /** "Every update we have delivered · 23 updates since 6 Apr 2026 · longest
   *  gap 35 days · last on 27 Sep 2026" — `deliveryRecord`'s own sentence with
   *  its SCOPE in front of it (`DELIVERY_SCOPE`). */
  delivery: string | null
  /** "your 3rd monthly reading · the quarter view needs 6". Null where the
   *  month tables have never been seeded here, which is not a zeroth reading. */
  counter: string | null
  /** The mock's numbers card, minus the six rows the deck already prints. */
  numbers: NumberRow[]
  /**
   * The two raw figures the slide draws, carried rather than parsed back out of
   * the sentences it renders (code review 4).
   *
   * `figures()` used to recover the instrument by regex from a rendered English
   * sentence — `find('Themes per video')!.value.match(/^[\d.]+/)` — so a
   * re-wording of `instrumentRow` would have turned the published figure into 0
   * with no test failing. A block does not read its own prose.
   */
  videosRead: number | null
  themesPerVideo: number | null
  /** The Reddit clause, printed once under the card. */
  reddit: string
  /** The labels caveat — a fixed rule assigns a format and a hook, never a
   *  model. Composed here because nothing in the product said it. */
  labels: string
  empty: string | null
}

/**
 * The mock's "The unit" row, in the product's own words.
 *
 * TAKEN FROM THE QUARTERLY'S OWN METHOD PAGE (`lib/pages/quarterly.ts`), not
 * re-worded: two artefacts of one product may not define the unit every share
 * on them is a share of in two sentences.
 */
export const BRIEF_UNIT = 'A video with an analysed comment written in the month.'

/**
 * "Format and hook labels are assigned by a fixed rule from counted data —
 * never worded by the AI."
 *
 * TRUE, AND CHECKABLE. `videos.classified_type` and `videos.hook_style` are
 * enum columns written by the classifier; `workedLabel` (lib/pages/week.ts)
 * humanises the stored value through a fixed table and falls through to the
 * slug. No model call writes either column and no prose slot touches them,
 * which is why this sentence may be printed flat rather than hedged.
 */
export const LABEL_RULE =
  'Format and hook labels are assigned by a fixed rule from counted data, never worded by the AI.'

/**
 * The period row — the window this reading covers, and the updates inside it.
 *
 * THE ARTBOARD'S FIRST ROW, AND THE ONE THAT NAMES THE SCOPE (design review 10
 * and 3). The card stopped at 59% of a 482px body while the prose column ran
 * the full height, and the two rows the artboard has and this card did not —
 * Period and Conversations — are exactly the two that say what the sheet's two
 * delivery records are each counted over. `MethodPage` prints its own Period
 * from `DocumentSnapshotData.method`; this one is built from `RecordInputs`,
 * which is what this block has, and the two are the same window by
 * construction (`monthRecordWindow`).
 *
 * `r.delivery` here is the WINDOW's delivery record — `loadRecordInputs` is
 * handed the window — so the update count in this row is the prose's count and
 * not the all-time one under it (`DELIVERY_SCOPE`).
 */
export function periodRow(r: RecordInputs): NumberRow {
  // "READ OVER", NOT "PERIOD", AND NO UPDATE COUNT (content, wave-3 merge).
  // The sheet's prose says "3 updates delivered, 1 Sep to 13 Sep 2026" \u2014 a
  // DELIVERY span, the first and last update inside the window \u2014 and this row
  // carried "Period \u00b7 1 Sep 2026 \u2192 18 Sep 2026 \u00b7 3 updates", which is the
  // WINDOW. Two date ranges about the same three updates, 300px apart, with
  // the row labelled "Period" being the one that is NOT the delivery span: a
  // reader who read both could only conclude that one of them was wrong.
  //
  // The row states the window and nothing else; the count stays in the prose,
  // beside the dates it is actually counted over. "Period" was carrying the
  // ambiguity \u2014 it is not one of THIRTEEN_WORDS either \u2014 and "read over" says
  // which of the two spans this is.
  return {
    label: 'Read over',
    value: `${fullDate(r.window.from)} \u2192 ${fullDate(r.window.to)}`,
    figure: true,
  }
}

/**
 * The comments row — the artboard's "Conversations", in the word this product
 * uses for the thing.
 *
 * NOT "CONVERSATIONS". AGENTS.md keeps `conversations` on the legacy pages that
 * still compute it, and a new reading surface draws its vocabulary from
 * THIRTEEN_WORDS: a comment is a comment, and `video`'s own glossary entry says
 * so out loud ("Comments are counted separately, as comments").
 *
 * Pooled across audiences exactly as `videosRow` pools videos, so the two rows
 * are counted over the same set.
 */
export function commentsRow(r: RecordInputs): NumberRow | null {
  if (r.coverage == null || r.coverage.length === 0) return null
  const comments = r.coverage.reduce((n, c) => n + c.comments, 0)
  return { label: 'Comments', value: `${fmtInt(comments)} read in this reading`, figure: true }
}

/** The language row, with its basis stated (D15). Null where no language was
 *  ever recorded — which is not "all English". */
export function languageRow(r: RecordInputs['language']): NumberRow | null {
  const known = r.english + r.notEnglish
  if (r.analysed === 0 || known === 0) return null
  return {
    label: 'Languages',
    // THE BASIS IS IN THE VALUE, not in a footnote beside it. The mock prints
    // "27% not in English" under a month heading; the share is of what was said
    // ON CAMERA, all-time, and a reader who is not told reads it as a fact
    // about this month's comments.
    value: `${fmtPct((r.notEnglish / known) * 100, 0)} of what was said on camera was not in English: ${fmtInt(r.notEnglish)} of ${fmtInt(known)} videos whose language we know`,
    figure: true,
  }
}

/** The held-back row: comparisons this reading declined, and why. */
export function heldBackRow(r: RecordInputs): NumberRow | null {
  if (r.comparisonsRefused == null) return null
  const n = r.comparisonsRefused
  return {
    label: 'Held back',
    value: n === 0
      ? 'No comparison was refused in this reading.'
      : `${fmtInt(n)} comparison${n === 1 ? '' : 's'} not drawn`,
    figure: n > 0,
  }
}

/** The sources row: the platform mix as shares, and the communities behind it. */
export function sourcesRow(r: RecordInputs): NumberRow | null {
  if (r.coverage == null || r.coverage.length === 0) return null
  const mix = platformShareLine(totalPlatformMix(r.coverage))
  if (!mix) return null
  return { label: 'Sources', value: mix, figure: true }
}

/** The instrument row — themes attached per analysed video, on the run clock
 *  and saying so (D9). */
export function instrumentRow(r: RecordInputs): NumberRow | null {
  const n = r.instrument.themesPerVideo
  if (n == null) return null
  return {
    label: 'Themes per video',
    value: `${n} ${n === 1 ? 'theme' : 'themes'} per analysed video, on the most recent update`,
    figure: true,
  }
}

/** The videos row — what carried conversation in the window, with the window
 *  named. */
export function videosRow(r: RecordInputs): NumberRow | null {
  if (r.coverage == null || r.coverage.length === 0) return null
  const videos = totalVideos(r.coverage)
  return {
    label: 'Videos',
    value: `${fmtInt(videos)} carried conversation in this reading`,
    figure: true,
  }
}

/**
 * The rows the mock's numbers card has and the deck's own method card does not.
 *
 * DELIBERATELY NOT THE WHOLE CARD. `MethodPage` (components/print/document-
 * deck.tsx) already prints Period, Conversations, Videos, Sources, Held back
 * and Findings from `DocumentSnapshotData.method`, and that component belongs
 * to another package in this wave. Printing eight rows here and six there would
 * put two cards on one document, so this block prints what the other one
 * cannot: the unit every share is a share of, the language basis, the
 * instrument, and the refusals with their reasons.
 */
export function numberRows(r: RecordInputs | null): NumberRow[] {
  const rows: NumberRow[] = [{ label: 'The unit', value: BRIEF_UNIT, figure: false }]
  if (!r) return rows
  // PERIOD AND COMMENTS LEAD (design review 10): the window this reading is of,
  // then what was read in it, then what the reading is made of. The unit stays
  // first because every row under it is counted in that unit.
  const maybe = [periodRow(r), videosRow(r), commentsRow(r), sourcesRow(r), languageRow(r.language), instrumentRow(r), heldBackRow(r)]
  for (const row of maybe) if (row) rows.push(row)
  return rows
}

/**
 * The record's two absences, which used to be one (code review 6 — the same
 * shape as the playbook's above).
 *
 * `record == null && delivery == null` printed "has not been read for this
 * workspace yet", a sentence about our schedule. But `loadRecordInputs` returns
 * a `RecordInputs` for every workspace, degrading field by field on a fresh
 * database — so a null one means the read THREW, and the only true reading of
 * that sentence was the one it could never have.
 */
/**
 * THE SCOPE OF THE MONO TAIL, SAID IN WORDS (design review 3).
 *
 * Two delivery records land on this sheet and neither named its scope. The
 * prose's first sentence is `recordLines`', built over `monthRecordWindow` —
 * "3 updates delivered, 1 Sep to 13 Sep 2026, longest gap 7 days." — and the
 * mono tail 500px below it is `deliveryRecord` over EVERY update ever run: "4
 * updates since 6 Sep 2026 · longest gap 7 days · last on 27 Sep 2026". Both
 * end "longest gap 7 days", so they read as one statistic stated twice with
 * two counts and two last dates; in production they differ by construction.
 *
 * The artboard names each one ("across four updates — 6, 13, 20 and 27
 * September" in the prose, "Tracking since 6 Apr · 23 updates delivered" in
 * the mono line). We name the one we compose. `deliveryRecord`'s own sentence
 * is not rewritten — it belongs to Settings › The record, which prints it
 * under a heading that already says what it is — so the scope is a prefix,
 * and it is the scope the reader cannot infer from the dates alone.
 *
 * NOT "Tracking since" (D14): `DeliveryRecord` carries EARLIEST EVIDENCE, not
 * a start date, and this sheet may not claim one.
 */
export const DELIVERY_SCOPE = 'Every update we have delivered'

export function deliveryScoped(line: string | null): string | null {
  return line ? `${DELIVERY_SCOPE} \u00b7 ${line}` : null
}

export const RECORD_GONE = 'The record behind this brief could not be read.'
export const RECORD_UNREAD = 'The record behind this brief has not been read for this workspace yet.'

export function buildRecordSlide(input: {
  month: string
  monthStatus: MonthStatus
  record: RecordInputs | null
  /** Did the read happen? FALSE means it threw — see `RECORD_GONE`. */
  read: boolean
  delivery: string | null
  readings: number | null
}): RecordSlide {
  const month = monthStartOf(input.month)
  return {
    month,
    monthLabel: longMonth(month),
    monthStatus: input.monthStatus,
    method: input.record ? methodLines(input.record) : null,
    lines: input.record ? recordLines(input.record) : [],
    paragraphs: input.record ? recordParagraphs(recordLines(input.record)) : [],
    delivery: deliveryScoped(input.delivery),
    counter: input.readings == null ? null : readingsCounter(input.readings),
    numbers: numberRows(input.record),
    videosRead: input.record?.coverage?.length ? totalVideos(input.record.coverage) : null,
    themesPerVideo: input.record?.instrument.themesPerVideo ?? null,
    reddit: REDDIT_CAP_LINE,
    labels: LABEL_RULE,
    empty: input.record != null || input.delivery != null
      ? null
      : input.read ? RECORD_UNREAD : RECORD_GONE,
  }
}

/** How many monthly readings this counter is of, said in the counter's own
 *  terms. Exposed so a test can assert the quarter clause without re-deriving
 *  `QUARTER_UNLOCKS_AT`. */
export const QUARTER_NEEDS = QUARTER_UNLOCKS_AT

// ── the playbook slide ──────────────────────────────────────────────────────

export interface PlaybookSlide {
  playbook: PlaybookBlock | null
  /** Your own formats running under your own median video. Empty where no
   *  median could be read; never an instruction. */
  below: FormatRow[]
  /** The brand, for the column that is yours. */
  brand: string
  /** The rival the third column is, or null where none is tracked. */
  rival: string | null
  empty: string | null
}

/**
 * THREE ABSENCES, THREE SENTENCES — and they used to be one (design review 1,
 * code review 1).
 *
 * `empty` was `drawn ? null : PLAYBOOK_EMPTY`, so a caught read error and a
 * corpus nobody has classified yet both printed a claim about the WORLD: "no
 * video was published in this month by you, your rival or the category". A
 * PostgREST schema-cache miss — AGENTS.md records one taking the app down for
 * two hours — put that sentence on a client's document. It is the same class as
 * the `ct.ways` block-key bug this package was told to fix first, and the same
 * class as the page that claimed "no email is sent" while Resend sent.
 *
 * So the slide is told whether the READ happened, separately from what the read
 * found, and each state says only what it knows:
 *
 *   · the read threw            → PLAYBOOK_GONE ("could not be read")
 *   · read, nothing published   → PLAYBOOK_EMPTY (and it says "has been read
 *                                 for", never "was published": a month we
 *                                 gathered nothing in is not a month nobody
 *                                 posted in)
 *   · read, published, none classified → the count, and what is missing
 */
/**
 * Rated videos a format needs before the slide's ONE takeaway may name it.
 *
 * The product's own floor for resting a finding on a bucket — Pass C is told
 * "never rest a finding on one" below it — reused rather than chosen, because a
 * second number here would be a second answer to one question.
 */
export const LEAD_MIN_RATED = COMPETITIVE_MIN_VIDEOS

export const PLAYBOOK_EMPTY =
  'Nothing published in this month has been read for you, your rival or the category, so there is no format to read.'

export const PLAYBOOK_GONE = 'The formats behind this brief could not be read.'

/** Videos were published and read, and the classifier has reached none of
 *  them: a share of nothing classified is not zero, it is unmeasured. */
export function playbookUnclassified(published: number, monthLabel: string): string {
  return `${fmtInt(published)} ${published === 1 ? 'video' : 'videos'} published in ${monthLabel} have been read and none of them has been classified yet, so no format share can be stated.`
}

export function buildPlaybookSlide(input: {
  playbook: PlaybookBlock | null
  /**
   * Did the read happen? FALSE means `loadPlaybookVideos` threw — not that it
   * returned nothing. Required rather than defaulted: a default is exactly how
   * the two states were conflated, and every caller knows which one it is.
   */
  read: boolean
  brand: string
  monthLabel: string
  rival: string | null
}): PlaybookSlide {
  const p = input.playbook
  return {
    playbook: p,
    below: p ? p.below : [],
    brand: input.brand,
    rival: input.rival,
    empty: playbookAbsence(p, input.read, input.monthLabel),
  }
}

function playbookAbsence(p: PlaybookBlock | null, read: boolean, monthLabel: string): string | null {
  if (!read) return PLAYBOOK_GONE
  // A read that happened and built nothing is the same fact as a read that
  // built a table with no rows; the surface only ever produces the second.
  if (p == null) return PLAYBOOK_EMPTY
  if (p.formats.keys.length > 0) return null
  const published = p.formats.sides.reduce((n, s) => n + s.published, 0)
  return published === 0 ? PLAYBOOK_EMPTY : playbookUnclassified(published, monthLabel)
}

// ── the surface ─────────────────────────────────────────────────────────────

export interface ContentBriefData {
  brand: string
  month: string
  monthLabel: string
  monthStatus: MonthStatus
  readingAt: string
  playbook: PlaybookSlide
  record: RecordSlide
}

/**
 * The content brief's surface.
 *
 * FOUR READS, AND THEY ARE THE FOUR NOTHING ELSE IN THIS BUILD MAKES.
 * `loadPlaybookVideos` is one `selectAll` of two months of videos by upload
 * date; `loadRecordInputs` is the record; `loadUpdates` is the delivery record;
 * and one narrow `month_denominators` read is the reading counter. The brief
 * already loads Overview, Market and Subjects for its other sections, and none
 * of those is re-run here.
 *
 * THE RECORD READ IS DUPLICATED, AND THAT IS A DEBT THIS MODULE NAMES.
 * `lib/reports/documents/load-reading.ts` already calls `loadRecordInputs` for
 * every brief and keeps only `coverage` off it; the rest — the delivery line,
 * `methodLines`, the counter — is computed there and dropped. The section
 * render path hands a block its SURFACE and nothing else, so this block cannot
 * reach that `BriefReading`, and the one-line fix (thread the reading into
 * `SectionBody`) is in a file another package owns this wave. Until then the
 * record is read twice on a content brief and once on the other three.
 *
 * EVERY READ DEGRADES. M1–M9 are authored and unapplied on a fresh database;
 * a surface that throws would drop a brief that could have printed most of
 * itself, which is the rule every other brief surface already follows.
 */
export async function loadContentBrief(scope: Scope): Promise<ContentBriefData | null> {
  const supabase = scope.supabase as SupabaseClient
  const reading = scope.reading
  const { clientId } = scope
  const readingAt = new Date().toISOString()
  const month = monthStartOf(readingAt)

  const [clientRes, configRes] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    supabase.from('tracking_configs').select('competitor_names').eq('client_id', clientId).maybeSingle(),
  ])
  const brand = (clientRes.data as { company_name?: string | null } | null)?.company_name ?? 'Your brand'
  // THE FIRST TRACKED RIVAL IS THE THIRD COLUMN, and the column is headed with
  // its name. A brief cannot ask the reader which rival they meant, and a table
  // whose third column is the pooled "every rival" would be a share of a
  // population nobody named.
  const rival = ((configRes.data as { competitor_names?: string[] | null } | null)?.competitor_names ?? [])
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean)[0] ?? null

  const [videos, record, updates, readings] = await Promise.all([
    loadPlaybookVideos(reading.client as SupabaseClient, clientId, month).catch((e) => {
      console.error(`[pages] content-brief.playbook: ${message(e)}`)
      return null
    }),
    loadRecordInputs(reading.client as SupabaseClient, clientId, monthRecordWindow(month, readingAt), { now: readingAt }).catch((e) => {
      console.error(`[pages] content-brief.record: ${message(e)}`)
      return null
    }),
    loadUpdates(reading.client as SupabaseClient, clientId).catch((e) => {
      console.error(`[pages] content-brief.delivery: ${message(e)}`)
      return null
    }),
    countReadings(reading.client as SupabaseClient, clientId, month).catch((e) => {
      console.error(`[pages] content-brief.readings: ${message(e)}`)
      return null
    }),
  ])

  if (videos == null && record == null && updates == null) return null

  // THE TAKEAWAY MAY NOT REST ON FOUR VIDEOS (design review 5). The brief
  // promotes `formats.conclusion` into the slide's one bulleted sentence, so it
  // passes the floor the product already refuses to rest a finding on
  // (`COMPETITIVE_MIN_VIDEOS`, lib/pipeline/pass-c.ts: "never rest a finding on
  // one"). Every row stays in the table with its own n — the floor is on what
  // may LEAD.
  const playbook = videos
    ? buildPlaybook({ month, brand, rival, videos, conclusionMinRated: LEAD_MIN_RATED })
    : null

  return {
    brand,
    month,
    monthLabel: longMonth(month),
    monthStatus: freezeStateFor(month, readingAt),
    readingAt,
    // `read` IS `videos != null`, AND THAT IS THE WHOLE POINT: the catch above
    // turns a failed read into null, and a null that reached the slide used to
    // print "no video was published in this month".
    playbook: buildPlaybookSlide({ playbook, read: videos != null, brand, monthLabel: longMonth(month), rival }),
    record: buildRecordSlide({
      month,
      monthStatus: freezeStateFor(month, readingAt),
      record,
      // BOTH READS THREW IS THE ONLY WAY TO REACH THE EMPTY ARM, and that is a
      // fact about this request, not about the workspace.
      read: record != null || updates != null,
      delivery: updates ? deliveryRecord({ updates: updates.updates, slotsRecorded: updates.slotsRecorded }).line : null,
      readings,
    }),
  }
}

const message = (e: unknown): string => (e as { message?: string })?.message ?? String(e)

/**
 * How many monthly readings this workspace has, up to and including this month.
 *
 * COUNTED OFF `month_denominators`, THE CLIENT'S OWN AUDIENCE — one month, one
 * row, which is what "a monthly reading" is. Overview counts the same thing off
 * the series it has already built (`readingsSoFar`, lib/pages/overview.ts) and
 * the two agree wherever the client audience has a denominator in every month
 * it was read in, which is what the monthly job writes. Null — never 0 — where
 * the table is not applied here: "we have not started counting" and "no month
 * has been read" are different sentences and the counter prints one of them.
 */
async function countReadings(client: SupabaseClient, clientId: string, month: string): Promise<number | null> {
  const res = await client
    .from('month_denominators')
    .select('month')
    .eq('client_id', clientId)
    .eq('audience', CLIENT_AUDIENCE)
    .lte('month', month)
  if (res.error) return null
  const months = new Set((res.data ?? []).map((r) => String((r as { month: string }).month).slice(0, 10)))
  return months.size
}

/** Your own formats under your own median, for a surface that wants them
 *  without the whole playbook. Pure; `belowMedian`'s own rule. */
export function ownBelowMedian(playbook: PlaybookBlock | null): FormatRow[] {
  if (!playbook) return []
  const mine = playbook.formats.sides.find((s) => s.audience === CLIENT_AUDIENCE)
  if (!mine) return []
  return playbook.below
}

export { belowMedian }
