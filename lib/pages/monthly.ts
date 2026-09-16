import type { SupabaseClient } from '@supabase/supabase-js'
import { shortDate } from '../format'
import { composeInterpretation, type Interpretation } from '../prose/interpret'
import { proseFigures } from '../prose/figures'
import type { Scope } from '../renderables/types'
import { nextMonth, prevMonth as previousMonthOf } from '../reading/month-key'
import { loadMonthSeries, readingHandle, type ReadingHandle } from '../reading/read'
import { mergeNotes, mergeSeriesNotes, pointsByMonth, type MonthLabel } from '../reading/series'
import type { MonthStatus } from '../reading/types'
import { isAnswer, type FigureTable, type Verdict } from '../reading/verdicts'
import {
  MONTHLY_MOVERS,
  leadVerdict,
  monthlySubject,
  seriesTrail,
  shortMonth,
  type MonthlyStatus,
} from '../reports/monthly'
import { confirmingLine } from '../reports/monthly'
import { loadSentFigures, newestByObject, sentReadingOf, type StoredSentFigure } from '../reports/sent-figures'
import { loadOverview, type LedgerRow, type Mover, type OverviewData } from './overview'
import { loadVoiceSurface, type GoneQuiet, type VoiceSurfaceData } from './voice-surface'
import {
  loadMemberInsightIdsBySubject,
  loadSubjectRows,
  loadSubjectVoicesMany,
  type SubjectVoice,
} from './subjects'

/**
 * The monthly report's loader (Phase 1 WP18, design item 13).
 *
 * THE ARTEFACT IS THE PAGES' OWN READING, NOT A SECOND ONE. Six of the eight
 * sections are Overview's loader unchanged, the seventh is Voice's movers with
 * the list expanded, and the eighth is one quote per subject off Subjects' own
 * voice read. The report cannot say something the pages cannot, because it IS
 * the pages — the rule WP17 set for the weekly report and the reason neither
 * artefact has a loader of its own to disagree with.
 *
 * WHAT IS MONTHLY-ONLY, and it is only three things: the per-row series under
 * each mover (Overview's `Mover` carries a level and a verdict but no line), one
 * voice per subject rather than six voices on one subject, and the labelled
 * interpretation slot in section 7.
 *
 * WHAT DEGRADES, AND HOW. M1–M8 are not applied in production and M9 lands in
 * the R2 window. Every read that needs one is guarded by name and answers in
 * words — the `isMissing*` precedent — so the artefact has the SAME EIGHT
 * SECTIONS every month, and a section that cannot say something says so rather
 * than printing a zero for a thing nobody counted.
 */

// ---- the shapes ---------------------------------------------------------------

/** How many months a mover's own line draws. Six, as OV2's subject sparks do,
 *  so the two lines on one artefact are the same length. */
export const MONTHLY_SPARK_MONTHS = 6

/** One row of section 3 — Voice's mover, with the line the mock draws under it. */
export interface MoverRow extends Mover {
  /** The last `MONTHLY_SPARK_MONTHS` readings, nulls where unreadable. */
  spark: (number | null)[]
  /** The months `spark` is indexed by, same length — a line that cannot be
   *  drawn still says which months it had. */
  sparkMonths: string[]
  /** "Jul 5.1% → Aug 6.8% → Sep 9.4%" — the reading in words, for the email,
   *  which has no stylesheet and may have no images. */
  trail: string
}

export interface MoversSection {
  growing: MoverRow[]
  fading: MoverRow[]
  /** First heard this month. A flag on a row, printed with the level and never
   *  with a change: a first month has no baseline to be banded against. */
  newcomers: Mover[]
  goneQuiet: GoneQuiet[]
  /** The audience these were read in, in the reader's words. */
  audienceLabel: string
  /** The months the trails span, for the block's own meta line. */
  span: string
  note: string | null
  rereadNote: string | null
  /** The reading caveats of the series these lines were drawn from. Carried
   *  rather than dropped: MR3 draws a six-month trail and a sparkline PER ROW,
   *  and a run of months whose clustering was never recorded is exactly what a
   *  line across them must be read against. Merged with the page's own at the
   *  artefact's level, so the reader is told once. */
  notes: MonthLabel[]
  href: string
}

/** One row of section 6 — a subject, and one thing somebody said about it. */
export interface SubjectVoiceRow {
  subjectId: string
  subject: string
  voice: SubjectVoice | null
  /** Why there is no voice, where there is none. */
  note: string | null
  href: string
}

export interface VoicesSection {
  rows: SubjectVoiceRow[]
  /** Said instead of the rows where the subjects themselves are not recorded. */
  note: string | null
  href: string
}

/** Section 7 — what to decide before the next reading. */
export interface DecideSection {
  /** The labelled slot. `label` is the word printed above it. */
  interpretation: Interpretation
  /** The table its `[[token]]`s substitute from. */
  figures: FigureTable
  /** The standing advice, where there is one — the mock's own metadata line. */
  ledger: LedgerRow | null
  /** When the next monthly reading lands, so a decision has a deadline. */
  nextReading: string
  href: string
}

/** The Marketing brief, attached BY LINK. */
export interface BriefLink {
  title: string
  /** Where it opens — a share link where the workspace has minted one, and the
   *  in-app viewer otherwise. */
  href: string
  /** Whether that link is readable with nothing else — no account, no password. */
  public: boolean
  /** A share link that will ask for a password. Real and forwardable, and not
   *  the same promise as a public one. */
  locked: boolean
  /** When it was last built. */
  builtAt: string
  /** True where the latest build pre-dates this reading — the brief is real and
   *  it is not this month's. */
  stale: boolean
}

export interface MonthlyData {
  brand: string
  month: string
  monthStatus: MonthStatus
  readingAt: string
  /** The reading's caveats, said once for the whole artefact. */
  notes: MonthLabel[]
  /** Sections 1, 2, 4, 5 and 8, verbatim from the page. */
  overview: OverviewData
  movers: MoversSection
  voices: VoicesSection
  decide: DecideSection
  brief: BriefLink | null
  /**
   * Last month's artefact, confirmed. One sentence, or null where there is
   * nothing to confirm — no artefact was sent about that month, or the one that
   * was went out after it had already closed and printed the final figure.
   */
  confirming: string | null
  /** The largest banded change, which the subject line leads with. */
  lead: Verdict | null
  subject: string
}

// ---- the pure half ------------------------------------------------------------

/**
 * The months a mover's line is drawn on: the reading month and the five before
 * it, oldest first. Keys as the reading layer writes them — a month is its
 * first day, which is what `pointsByMonth` is indexed by.
 *
 * GENERATED, NOT READ. A month with no row has to occupy its own slot or the
 * line closes the gap up and misdates every point after it — the same rule
 * `monthAxis` keeps for the page's charts and `Sparkline` keeps for its nulls.
 */
export function sparkMonths(month: string, count: number = MONTHLY_SPARK_MONTHS): string[] {
  const out: string[] = []
  for (let m = month, i = 0; i < count; i += 1, m = previousMonthOf(m)) out.unshift(m)
  return out
}

/** "Apr – Sep" — what the trails span, for the block's meta line. Through
 *  `shortMonth`, so the meta line and the trails under the rows abbreviate a
 *  month the same way. */
export function spanOf(months: readonly string[]): string {
  if (months.length === 0) return ''
  return months.length === 1
    ? shortMonth(months[0])
    : `${shortMonth(months[0])} – ${shortMonth(months[months.length - 1])}`
}

/**
 * Why a subject shows no voice this month.
 *
 * FOUR SILENCES AND THEY ARE NOT ONE. "Nothing has been said about it at all"
 * is a reading of the whole corpus; "nothing readable was said" is a reading of
 * what we could quote (a quote must pass the same gate Overview's two voices
 * pass — item 8); "nothing quotable was said THIS MONTH" is a reading of the
 * month; and the fourth is this artefact's own doing — the same comment can be
 * a member of two subjects and it is printed once. One sentence for all four
 * would tell a client their customers were quiet when what happened is that we
 * quoted them one section earlier.
 *
 * AND IT ALWAYS SAYS SOMETHING. A row with no voice and no note renders an
 * empty paragraph under a subject's name, which reads as a bug rather than as a
 * silence.
 *
 * NO ARM MAY CLAIM A MONTH THE POOL IS NOT SCOPED TO. `readable` counts the
 * whole corpus and `inMonth` counts the month, because the citations are
 * filtered by their comment's date (AGENTS.md: a period is dated by the
 * comment) — so the month is named only in the arm that is about it.
 */
export function voiceNote(input: { citations: number; readable: number; inMonth: number }): string {
  if (input.citations === 0) return 'nothing has been said about this one yet'
  if (input.readable === 0) return 'what was said about this one could not be quoted — too short, or nothing but a handle'
  if (input.inMonth === 0) return 'nothing quotable was said about this one this month'
  return 'the voices from this month are already quoted above'
}

/** When the next monthly reading lands: the first of the month after this one.
 *  A decision with no date on it is a note, not a decision. */
export function nextReadingOf(month: string): string {
  return `${nextMonth(month)}T00:00:00.000Z`
}

// ---- the loader ---------------------------------------------------------------

/**
 * The whole artefact, for one tenant, over the month the page is reading.
 *
 * Null is the first-run empty state: a tenant whose first update has not landed
 * has no reading of anything, and the send path marks itself `skipped` on it
 * rather than delivering an empty report.
 *
 * THE HORIZON IS PINNED TO THE MONTH. A monthly report over "last 12" would be
 * an artefact whose title and whose numbers disagree, and the horizon lives in
 * the URL precisely so a reader's selection travels — which is right for an
 * export of a page and wrong for a dated artefact. So the scope handed to both
 * page loaders names `this_month`, whatever the caller was looking at.
 */
export async function loadMonthly(scope: Scope): Promise<MonthlyData | null> {
  const supabase = scope.supabase as SupabaseClient
  const reading: ReadingHandle = scope.reading ?? readingHandle(scope.clientId)
  const monthScope: Scope = { ...scope, reading, params: { ...scope.params, horizon: 'this_month' } }

  const overview = await loadOverview(monthScope)
  if (!overview) return null

  const { month, monthStatus, readingAt } = overview
  const [voice, voices, brief, confirming] = await Promise.all([
    // VOICE'S OWN MOVERS, WITH THE LIST EXPANDED. `?movers=all` is what VO2's
    // own "show ten" control sets, so the artefact prints exactly what a reader
    // who pressed it would see.
    loadVoiceSurface({ ...monthScope, params: { ...monthScope.params, movers: 'all' } }),
    loadSubjectVoicesPerSubject(supabase, scope.clientId, month),
    loadBriefLink(supabase, scope.clientId, readingAt),
    loadConfirming(reading.client, scope.clientId, month),
  ])

  const moversSection = await buildMovers(reading, scope.clientId, overview, voice)

  // ── section 7 · what to decide ────────────────────────────────────────
  //
  // ONE LABELLED SLOT ON THE ARTEFACT, AND IT IS HERE. OV1 composes
  // `interpretation_monthly` for the page, and section 1 prints OV1's CODE
  // sentence; printing the interpretation there as well would put the same
  // paragraph on one artefact twice, under two headings, three sections apart.
  // Heinrich's revision 6 puts the decision at the end — "what to decide before
  // the next reading" — so the slot travels with it, carrying the standing
  // advice as its metadata exactly as the mock draws it.
  const verdicts = overview.sentence.verdicts
  const figures = proseFigures(overview.sentence.figures)
  const decide: DecideSection = {
    interpretation: composeInterpretation(
      'interpretation_monthly',
      verdicts,
      figures,
      overview.sentence.voices.map((v) => ({ ref: v.quote.ref })),
    ),
    figures: overview.sentence.figures,
    ledger: overview.sentence.ledger,
    nextReading: nextReadingOf(month),
    href: '/dashboard/market',
  }

  const lead = leadVerdict(verdicts.filter((v) => isAnswer(v.state)))
  return {
    brand: overview.brand,
    month,
    monthStatus,
    readingAt,
    // ONE CAVEAT FOR THE WHOLE ARTEFACT, over both reads. The page's own notes
    // are about the themes Overview drew; MR3's are about the series its per-row
    // lines are drawn from, and the two overlap. Merged, so a run of months
    // whose clustering was never recorded is said once and names the union of
    // its months — the convention Block B set, applied to the one surface a
    // client reads unaccompanied.
    notes: mergeNotes([overview.notes, moversSection.notes]),
    overview,
    movers: moversSection,
    voices,
    decide,
    brief,
    confirming,
    lead,
    subject: monthlySubject(overview.brand, month, lead),
  }
}

/**
 * Section 3 — ten a side, each with its own line.
 *
 * The rows are Voice's (`MOVERS_EXPANDED` is ten, and `?movers=all` is what
 * sets it); what is added here is the series, which Overview's `Mover` does not
 * carry because no surface before this one drew one per row. ONE series read
 * for every theme on both sides, in one call, rather than twenty.
 *
 * VOICE UNREADABLE IS NOT AN EMPTY SECTION. A tenant whose voice page cannot be
 * loaded at all still gets the section with the sentence saying so, because the
 * artefact keeps the same eight sections every month (the design's own gate).
 */
async function buildMovers(
  reading: ReadingHandle,
  clientId: string,
  overview: OverviewData,
  voice: VoiceSurfaceData | null,
): Promise<MoversSection> {
  const months = sparkMonths(overview.month)
  const href = '/dashboard/voice?movers=all'
  const audienceLabel = voice?.audience.label ?? overview.category.label

  if (!voice) {
    return {
      growing: [],
      fading: [],
      newcomers: [],
      notes: [],
      goneQuiet: [],
      audienceLabel,
      span: spanOf(months),
      note: 'What grew and faded has not been read for this workspace yet.',
      rereadNote: null,
      href,
    }
  }

  const growing = voice.movers.growing.slice(0, MONTHLY_MOVERS)
  const fading = voice.movers.fading.slice(0, MONTHLY_MOVERS)
  const ids = [...new Set([...growing, ...fading].map((m) => m.id))]

  let byObject = new Map<string, (number | null)[]>()
  let seriesNotes: MonthLabel[] = []
  if (ids.length > 0) {
    const set = await loadMonthSeries(reading.client, clientId, {
      from: months[0],
      to: overview.month,
      audiences: [voice.audience.selected],
      objectKind: 'theme',
      objectIds: ids,
      // NO `updatesByMonth` AND NO `firstRunMonth`. Both exist for the thin-month
      // rule, which decides whether a COMPARISON may be drawn; this read draws
      // no comparison — every band on these rows was already computed by Voice
      // — and asking for them would be a second `pipeline_runs` scan for a
      // gate nothing here consults.
      updatesByMonth: {},
    })
    byObject = new Map(
      set.series
        .filter((s) => s.objectId != null)
        .map((s) => {
          const points = pointsByMonth(s)
          return [s.objectId as string, months.map((m) => points.get(m)?.pct ?? null)] as const
        }),
    )
    // AND WHAT THE SERIES SAY ABOUT THEMSELVES. These lines cross the same
    // months the page's caveat is about — a run whose clustering was never
    // recorded is not strictly comparable — and this read's notes were being
    // dropped on the floor while the block drew a trail and a sparkline across
    // exactly them. Merged rather than concatenated, so twenty themes present
    // in different months still produce one sentence.
    seriesNotes = mergeSeriesNotes(set.series)
  }

  const withSpark = (m: Mover): MoverRow => {
    const spark = byObject.get(m.id) ?? months.map(() => null)
    return { ...m, spark, sparkMonths: months, trail: seriesTrail(months, spark) }
  }

  return {
    growing: growing.map(withSpark),
    fading: fading.map(withSpark),
    newcomers: voice.movers.newcomers,
    goneQuiet: voice.movers.goneQuiet,
    audienceLabel,
    span: spanOf(months),
    note: voice.movers.note,
    rereadNote: voice.movers.rereadNote,
    notes: seriesNotes,
    href,
  }
}

/**
 * Section 6 — one voice per subject.
 *
 * SUBJECTS' OWN VOICE READ, ONE ROW EACH. `loadSubjectVoicesMany` draws six
 * voices across the audiences for each subject and this keeps the first, which
 * is the highest-ranked citation that passes the readability gate. The ranking
 * is still per subject — a single ranking across every subject would put one
 * loud subject's citations above another's — and only the READS are shared.
 *
 * AND THE READS ARE THE POINT. A `Promise.all` over the subjects asked for one
 * chunked membership read plus four more reads EACH, so eight subjects fired
 * roughly thirty-five statements at one instance at once, on the send path.
 * Two reads now cover every subject's memberships and citations whatever N is
 * (lib/pages/subjects.ts `loadVoicesMany`).
 *
 * ONE PER SUBJECT AND NEVER TWO OF THE SAME WORDS. A comment can be a member of
 * two subjects; printing it twice under two headings reads as a copy-paste
 * error, so a quote already shown is skipped and the next one taken.
 */
async function loadSubjectVoicesPerSubject(
  supabase: SupabaseClient,
  clientId: string,
  month: string,
): Promise<VoicesSection> {
  const href = '/dashboard/subjects'
  const subjects = await loadSubjectRows(supabase, clientId)
  if (subjects == null) {
    return { rows: [], note: 'Your subjects are not recorded for this workspace yet.', href }
  }
  const active = subjects.filter((s) => s.status === 'active')
  if (active.length === 0) {
    return { rows: [], note: 'No subject has been confirmed yet, so there is nothing to hear one voice on.', href }
  }

  const members = await loadMemberInsightIdsBySubject(supabase, clientId, active.map((s) => s.id))
  const reads = await loadSubjectVoicesMany(
    supabase,
    clientId,
    active.map((s) => ({ key: s.id, insightIds: members?.get(s.id) ?? [] })),
    // THE MONTH THE ARTEFACT IS ABOUT, and the block asks "what does this month
    // actually sound like?" — so the pool is dated by the comment rather than
    // taken from the whole corpus and printed under a September heading.
    { month },
  )

  const shown = new Set<string>()
  const rows: SubjectVoiceRow[] = active.map((subject) => {
    const ids = members?.get(subject.id) ?? []
    const read = reads.get(subject.id) ?? { voices: [], from: 0, sampled: false, readable: 0 }
    const voice = read.voices.find((v) => !shown.has(v.quote.ref)) ?? null
    if (voice) shown.add(voice.quote.ref)
    return {
      subjectId: subject.id,
      subject: subject.name,
      voice,
      note: voice
        ? null
        : voiceNote({ citations: ids.length, readable: read.readable, inMonth: read.from }),
      href: `/dashboard/subjects?item=${encodeURIComponent(subject.id)}`,
    }
  })
  return { rows, note: null, href }
}

/**
 * The Marketing brief, by LINK.
 *
 * NO DOUBLE BUILD, which is the WP's own instruction and is a cost decision as
 * much as a design one: a brief is a document the agent writes over minutes and
 * several model calls, and building a second one to attach to a report that
 * already contains its numbers would spend that twice for one reading.
 *
 * A SHARE LINK IF THERE IS ONE, THE APP IF THERE IS NOT — and the block says
 * which. This artefact is emailed to a list that may include people with no
 * account, and a `/dashboard` link handed to one of them is a login screen.
 *
 * A LOCKED LINK IS NOT A PUBLIC ONE. `share_links.password_hash` was not read,
 * so a password-protected link came back `public: true` and the artefact told a
 * recipient the brief was attached for a page that will ask them for a password
 * they have not been given. It is still the right link — the workspace can hand
 * the password over — so the link stands and the sentence says what opening it
 * will ask for.
 *
 * AND IT SAYS WHEN THE BRIEF WAS BUILT. Sealand's newest marketing brief was
 * built on 12 September; a report sent on 1 October that links to it without
 * saying so is offering a reader last month's document as this month's
 * companion.
 */
async function loadBriefLink(
  supabase: SupabaseClient,
  clientId: string,
  readingAt: string,
): Promise<BriefLink | null> {
  type ReportRow = { id: string; title: string; latest_snapshot_id: string | null; updated_at: string }
  const { data } = await supabase
    .from('reports')
    .select('id, title, latest_snapshot_id, updated_at')
    .eq('client_id', clientId)
    .eq('audience', 'marketing')
    .eq('status', 'built')
    .not('latest_snapshot_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
  const report = (data as ReportRow[] | null)?.[0]
  if (!report?.latest_snapshot_id) return null

  // The token is withheld from the authenticated grant, so this read only
  // answers on the service-role path — which is the send path, and the one that
  // needs a link a recipient can actually open.
  type LinkRow = { token: string; expires_at: string | null; password_hash: string | null }
  const { data: links } = await supabase
    .from('share_links')
    .select('token, expires_at, password_hash')
    .eq('client_id', clientId)
    .eq('snapshot_id', report.latest_snapshot_id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(5)
  const live = ((links as LinkRow[] | null) ?? []).find(
    (l) => !l.expires_at || l.expires_at > readingAt,
  )

  return {
    title: report.title,
    href: live ? `/r/${live.token}` : `/dashboard/reports?view=${encodeURIComponent(report.latest_snapshot_id)}`,
    public: Boolean(live) && !live?.password_hash,
    locked: Boolean(live?.password_hash),
    builtAt: report.updated_at,
    // The brief is this reading's companion only if it was built during it.
    stale: report.updated_at < monthStartOfReading(readingAt),
  }
}

/** The first instant of the month this reading is in — what "built during this
 *  reading" means. */
function monthStartOfReading(readingAt: string): string {
  return `${readingAt.slice(0, 7)}-01T00:00:00.000Z`
}

/**
 * Last month's artefact, confirmed.
 *
 * THE OTHER HALF OF ITEM 13's LOOP. "the report of {date} read X" is printed on
 * the live surfaces while a month is still moving; this is printed here, once,
 * about the month BEFORE this one — which by now has closed — and it says what
 * that month finally settled at against what we told the client at the time.
 *
 * THE OBJECT IT CONFIRMS IS THE ONE WE LED WITH. A confirming line naming
 * every figure would be a second report; the one a reader remembers is the one
 * the subject line was about, and that is the row with the largest movement.
 */
async function loadConfirming(
  client: SupabaseClient,
  clientId: string,
  month: string,
): Promise<string | null> {
  const last = previousMonthOf(month)
  const sent = await loadSentFigures(client, { clientId, month: last })
  if (sent == null || sent.length === 0) return null

  // ONLY WHAT CAN BE RE-READ AS A SERIES. `loadMonthSeries` has a numerator
  // table for a theme and for a subject and for nothing else: a kind's months
  // live in `month_kind_readings` under a different shape, a rival's figure is
  // a reading of an AUDIENCE rather than of an object inside one, and a
  // 'figure' row is an artefact-level token with no object at all. Confirming
  // one of those would mean re-deriving a standings table a month later under
  // whatever clustering is current now, which is exactly the like-for-like
  // comparison AGENTS.md refuses. The line names what it can confirm and stays
  // silent about the rest rather than confirming it wrongly.
  const newest = [...newestByObject(sent).values()].filter(
    (r): r is ReadableSent => r.objectKind === 'theme' || r.objectKind === 'subject',
  )
  const led = pickLed(newest)
  if (!led) return null

  // What that month closed at, read now, off the stored months.
  const set = await loadMonthSeries(client, clientId, {
    from: last,
    to: last,
    audiences: [led.audience],
    objectKind: led.objectKind,
    objectIds: [led.objectId],
    updatesByMonth: {},
  })
  const point = set.series
    .map((s) => pointsByMonth(s).get(last) ?? null)
    .find((p) => p != null)
  // AND THE MONTH'S OWN STATE TRAVELS WITH THE NUMBER. A month keeps filling
  // for thirty days after it ends, and nothing ties this artefact to the 1st:
  // an `every_update` schedule pointed at the monthly report sends it on a
  // Sunday, and a preview or an in-app build can happen on any day. Without
  // the state, a build on 10 September told a reader "August has closed at
  // 7.1%" while August was still filling.
  const closed = point?.pct == null ? null : { value: point.pct, frozen: point.state === 'frozen' }
  const line = confirmingLine(last, sentReadingOf(led), closed)
  return line ? `${led.label} — ${line}` : null
}

/** A sent row whose object CAN be re-read as a month series. The narrowing is
 *  what lets the caller pass `objectKind` straight through. */
export type ReadableSent = StoredSentFigure & { objectKind: 'theme' | 'subject' }

/**
 * The row the subject line would have led with: the largest movement that
 * cleared its band, and NOTHING where none did.
 *
 * THE FALLBACK WAS THE DEFECT. It sorted the rows that had not moved by the
 * absolute value of a change that is null on every one of them — so the sort
 * was a no-op and the line named whichever object `newestByObject` happened to
 * emit first, and then said "<that theme> — September has closed at 7.1%, which
 * is what the report of 1 Oct read." on a client's artefact about a figure the
 * artefact never led with. `leadVerdict` (lib/reports/monthly.ts), which is the
 * rule this one mirrors, returns null in exactly this case: a month in which
 * nothing cleared its band has no lead, and a confirming line about no lead is
 * a sentence with no reason to exist.
 */
export function pickLed(rows: readonly ReadableSent[]): ReadableSent | null {
  const moved = rows.filter((r) => r.verdict === 'moved' && r.changePts != null)
  if (moved.length === 0) return null
  return [...moved].sort((a, b) => Math.abs(b.changePts ?? 0) - Math.abs(a.changePts ?? 0))[0]
}

/** The status a stored month carries, in the monthly report's own vocabulary —
 *  the two types are the same two strings and this is where they meet. */
export const monthlyStatusOf = (status: MonthStatus): MonthlyStatus => status

export const briefStaleLine = (brief: BriefLink): string =>
  `Built ${shortDate(brief.builtAt)}, before this reading — the numbers in it are that day’s.`
