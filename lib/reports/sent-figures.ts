import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAll } from '../supabase-admin'
import type { FigureTable, Verdict } from '../reading/verdicts'
import type { MonthlyStatus, SentReading } from './monthly'

/**
 * The record of what a delivered artefact actually printed (Phase 1 WP18,
 * design item 13, migration M9).
 *
 * THE PROBLEM IT SOLVES, IN ONE SENTENCE. A month keeps filling for thirty days
 * after it ends, so the report a client read on the 1st and the page they open
 * on the 20th disagree about the same month — both correctly — and today the
 * product shows the second and says nothing about the first. A reader who acted
 * on a number is entitled to know it has since moved, and to be told what it
 * finally closed at.
 *
 * WHY IT IS NOT A READER OVER `report_snapshots`. Measured read-only on
 * production 2026-09-15 (research/refute-10): `created_at` is the build instant
 * and six builds of one brief share one reading; `data.figures` holds display
 * STRINGS with no n, no denominator and no band; and its keys are rank slots
 * (`top_theme`) and build-local prompt ids (`g1_conversations`), so the same key
 * names a different object next month. Three of the four things the line needs
 * are absent from the schema and the fourth — a pair of readings of one artefact
 * in two calendar months — has never existed in the data.
 *
 * WRITTEN AT SEND TIME AND NEVER REWRITTEN. `sent_figures` holds SELECT and
 * INSERT for the service role and nothing else, plus a BEFORE UPDATE trigger
 * that raises. A preview deletes its own snapshot and writes nothing; a test
 * send leaves no artifact and writes nothing. The record starts small and every
 * row in it is a statement that was actually put in front of somebody.
 *
 * AND IT DEGRADES HONESTLY UNTIL M9 LANDS. M9 applies in the R2 window, which
 * is after the branch deploys; every read and every write here is guarded by
 * name (`isMissingSentFigures`, the `isMissing*` precedent every Block A package
 * set) and answers with "not recorded" rather than throwing or inventing.
 */

export const SENT_FIGURES_TABLE = 'sent_figures'

/** What `object_kind` may be. The fifth is the escape for the artefact-level
 *  numbers that are about no object at all — a month's own denominator — and it
 *  is marked as what it is so a reader joining on objects never picks one up. */
export type SentObjectKind = 'subject' | 'theme' | 'rival' | 'kind' | 'figure'

export type SentUnit = 'pct' | 'videos' | 'comments' | 'pts'

/**
 * What the row's two sides count — and part of the grain, not decoration.
 *
 * ONE OBJECT, TWO READINGS, TWO ROWS. A rival's block prints its cut of the
 * panel's videos AND its cut of the panel's comments; both verdicts carry the
 * same objectKind, the same objectId and the same audience (`Verdict.countedOver`
 * says why). Keyed by the object alone they collide: the record kept the first
 * and dropped the second, and `sent_figures`' primary key would have refused it
 * anyway. The measure is therefore in the key here and in the primary key there.
 *
 * 'videos' is the product's default population and what a row carries when its
 * verdict says nothing else — the same default `Counted` documents.
 */
export type SentMeasure = 'videos' | 'comments'

/** One row, as it is written. Every field here is a column; nothing is derived
 *  at read time, because a record that has to be recomputed to be read is not a
 *  record. */
export interface SentFigureRow {
  month: string
  audience: string
  objectKind: SentObjectKind
  objectId: string
  label: string
  value: number
  unit: SentUnit
  /** What k and n count. Part of the grain — see `SentMeasure`. */
  measure: SentMeasure
  k: number | null
  n: number | null
  denominator: string
  changePts: number | null
  bandPts: number | null
  verdict: Verdict['state'] | null
  direction: 'growing' | 'fading' | 'flat' | null
  monthStatus: MonthlyStatus
  artefact: string
}

// ---- the pure half ------------------------------------------------------------

/**
 * The separator an object key is built with, and the one place it is decided.
 *
 * A unit separator (U+001F), not a colon and not a NUL. Not a colon because an
 * audience string IS `competitor:Topo Designs` and a colon-joined key would be
 * ambiguous the day a rival's name contains one; not a literal NUL because a
 * source file with a zero byte in it reads as binary to grep, to a diff and to
 * half the tools anybody will use on this repository.
 */
const KEY_SEP = String.fromCharCode(31)

/** The key a live surface and the record look an object up by. ONE shape, here,
 *  so a page and the record cannot spell it two ways. The measure is the fourth
 *  part because an object read on two populations is two readings; it defaults
 *  to the product's own default population, so a caller that has never heard of
 *  the second one asks the question it means. */
export const objectKey = (
  audience: string,
  kind: string,
  id: string,
  measure: SentMeasure = 'videos',
): string => [audience, kind, id, measure].join(KEY_SEP)

/**
 * The audience an artefact-level token is filed under.
 *
 * NOT A BUCKET STRING, AND SAID SO. Every other value in this column is the
 * literal audience a reading was taken in — 'client', 'industry',
 * 'competitor:<name>' — which is the rule `month_denominators.audience` carries
 * and what WP19's archive joins on. A token is the month's own size or the
 * count of videos behind it: it belongs to no audience at all, and filing it
 * under one would say a reading was taken in a slice it was not. The sentinel
 * is spelled once, here; it is not a legal bucket string (a rival's is prefixed
 * `competitor:`, and the three pooled ones are named constants), so it can
 * never collide with one, and `object_kind = 'figure'` marks the same rows a
 * second time for a reader who joins on the kind instead.
 */
export const FIGURE_AUDIENCE = 'artefact'

/**
 * Every figure an artefact printed, from the blocks' own answers.
 *
 * TWO SOURCES, AND THEY ARE NOT THE SAME THING.
 *
 *   `verdicts()` gives the OBJECT-KEYED rows — a subject, a theme, a rival, a
 *   kind, each with the audience it was read in, the two sides of its share, the
 *   band it was compared against and the direction word it was printed with.
 *   These are what next month's confirming line joins on, and they are the only
 *   rows that survive a re-clustering with their meaning intact.
 *
 *   `figures()` gives the TOKENS — the artefact-level quantities that belong to
 *   no object ("the category's videos this month"). They are kept because "the
 *   report of {date} read X" is most often about exactly one of those, and they
 *   are filed under `object_kind = 'figure'` so nothing joins them to an object
 *   by accident.
 *
 * A TOKEN THAT A VERDICT ALREADY COVERS IS DROPPED, and `covers` is a real
 * test rather than a key comparison. The first cut of this rule keyed both
 * halves through `objectKey` and then checked `seen` — but a token's kind is
 * the literal 'figure' and a verdict's is theme | subject | rival | kind, so
 * the two key spaces cannot collide and the rule never fired once. Measured on
 * production: Össur's September would have written eleven rows, of which
 * `theme / Admiration for personal resilience / 8.8 pct`, MR1's `t1_share`
 * ("Admiration…'s share of the month", 8.8 pct) and MR3's `moved_…_share`
 * ("Admiration…, share of the month", 8.8 pct) are one reading, plus two rows
 * carrying the identical label "videos that raised Admiration for personal
 * resilience / 34 videos". Two themes arriving as eleven statements is the
 * opposite of a record that can be compared against.
 *
 * So a token is dropped when a verdict ALREADY RECORDED NAMES ITS OBJECT and
 * states the same number: the token's label contains the verdict's object label
 * (every such label is built from it — `${label}'s share of the month`,
 * `videos that raised ${label}`) and the token's value is either that verdict's
 * share or its numerator. Both halves are required, so an unrelated token that
 * happens to read 8.8% survives and the month's own denominator — which names
 * no object — is never touched. The verdict wins, because it is the one that
 * carries an identity.
 *
 * AND TWO TOKENS THAT PRINT THE SAME WORDS ABOUT THE SAME NUMBER ARE ONE
 * STATEMENT. Two blocks reaching the same figure declare it under two token
 * ids; the record keeps the first and drops the second rather than filing one
 * reading twice under two build-local names.
 *
 * `audience` on a verdict is the literal bucket string, which is a NAME and not
 * an identity: renaming a rival leaves its sent figures under the old string and
 * nothing re-keys them. Same rule as `month_denominators.audience`, same reason
 * — and the reason a rename is a logged break rather than an edit.
 */
export function sentFigureRows(input: {
  month: string
  monthStatus: MonthlyStatus
  artefact: string
  verdicts: readonly Verdict[]
  figures: FigureTable
  /** The audience a token belongs to when it names none of its own.
   *  `FIGURE_AUDIENCE` unless a caller has a real bucket for it. */
  figureAudience?: string
}): SentFigureRow[] {
  const out: SentFigureRow[] = []
  const seen = new Set<string>()
  const key = objectKey

  for (const v of verdictsWorthRecording(input.verdicts)) {
    const kind = objectKindOf(v.objectKind)
    if (!kind) continue
    const measure = v.countedOver?.measure ?? 'videos'
    const k = key(v.audience, kind, v.objectId, measure)
    // A VERDICT NAMED TWICE BY TWO BLOCKS IS ONE READING. Both the subjects
    // table and the movers list can carry the same theme in the same audience;
    // the primary key would refuse the second insert anyway, and a row dropped
    // here is a row a batch insert does not have to survive a conflict over.
    // TWO MEASURES OF ONE OBJECT ARE NOT THAT, which is why the measure is in
    // the key: a rival's two verdicts are one object read on two populations
    // and both are statements the artefact made.
    if (seen.has(k)) continue
    seen.add(k)
    out.push({
      month: input.month,
      audience: v.audience,
      objectKind: kind,
      objectId: v.objectId,
      label: v.objectLabel,
      value: share(v.value.k, v.value.n),
      unit: 'pct',
      measure,
      k: v.value.k,
      n: v.value.n,
      denominator: denominatorOf(v),
      changePts: v.changePts,
      bandPts: v.bandPts,
      verdict: v.state,
      direction: v.direction ?? null,
      monthStatus: input.monthStatus,
      artefact: input.artefact,
    })
  }

  // What the verdicts above already state, for the covering test. Built once
  // and from `out`, so it is exactly the rows that were kept.
  const stated = out.map((r) => ({ label: r.label.toLowerCase(), pct: r.value, k: r.k }))
  const said = new Set<string>()

  const audience = input.figureAudience ?? FIGURE_AUDIENCE
  for (const [token, figure] of Object.entries(input.figures)) {
    // A TOKEN'S MEASURE IS ITS OWN UNIT where that is a population, and the
    // product's default where it is not: a share or a movement in this product
    // is a share of videos, bar the one the standings draw.
    const measure: SentMeasure = figure.unit === 'comments' ? 'comments' : 'videos'
    const k = key(audience, 'figure', token, measure)
    if (seen.has(k)) continue
    const value = round1(figure.value)
    if (coveredByVerdict(figure.label, figure.unit, value, stated)) continue
    const words = [figure.label.trim().toLowerCase(), figure.unit, value].join(KEY_SEP)
    if (said.has(words)) continue
    said.add(words)
    seen.add(k)
    out.push({
      month: input.month,
      audience,
      objectKind: 'figure',
      objectId: token,
      label: figure.label,
      value,
      unit: figure.unit,
      measure,
      // A TOKEN HAS NO SIDES. `FigureTable` holds a value, a unit and a label
      // and nothing else — which is exactly why the object-keyed half exists —
      // so k and n are null here rather than guessed from the label.
      k: null,
      n: null,
      denominator: figure.label,
      changePts: null,
      bandPts: null,
      verdict: null,
      direction: null,
      monthStatus: input.monthStatus,
      artefact: input.artefact,
    })
  }
  return out
}

/** One recorded verdict, reduced to what a covering test needs. */
interface StatedReading {
  label: string
  pct: number
  k: number | null
}

/**
 * Does a verdict already recorded say this token's number about this token's
 * object?
 *
 * BOTH HALVES, ALWAYS. The label test alone would drop a second, different
 * reading of the same theme ("videos that raised X" beside "X's share"); the
 * value test alone would drop any token that happened to read 8.8% in a month
 * where some theme did. Together they identify the case that actually occurs:
 * a block declaring, as a citable number, the very reading its own verdict
 * carries with an identity.
 *
 * The labels are built FROM the object's label — `${label}'s share of the
 * month`, `${label}, share of the month`, `videos that raised ${label}` — so
 * containment is the join, case-folded because one surface lower-cases its
 * label on the way in. A verdict with an empty label matches nothing.
 */
function coveredByVerdict(
  label: string,
  unit: SentUnit,
  value: number,
  stated: readonly StatedReading[],
): boolean {
  const l = label.trim().toLowerCase()
  if (!l) return false
  return stated.some(
    (s) =>
      s.label.length > 0 &&
      l.includes(s.label) &&
      ((unit === 'pct' && s.pct === value) || (unit === 'videos' && s.k != null && s.k === value)),
  )
}

/**
 * Which verdicts enter the record.
 *
 * ALL OF THEM THAT HAVE A LEVEL, including the refusals — and that is
 * deliberate. A verdict that refused to compare still PRINTED a level on the
 * artefact ("22% · 305 of 1,388, comparison refused"), and that level is a
 * statement about the month exactly as a moved one is. What the record keeps
 * separate is the verdict STATE, so a later reader can tell "we said it moved"
 * from "we said we would not say".
 *
 * What is dropped is a verdict with no population at all: n = 0 is not a
 * reading of zero percent, it is an audience nobody read, and a row saying 0%
 * of nothing would be a number this product does not print.
 */
function verdictsWorthRecording(verdicts: readonly Verdict[]): Verdict[] {
  return verdicts.filter((v) => v.value.n > 0 && Boolean(v.objectId) && Boolean(v.audience))
}

/** The union `sent_figures.object_kind` takes. A verdict about something else
 *  is not written rather than being filed under a kind that does not fit. */
function objectKindOf(kind: Verdict['objectKind']): SentObjectKind | null {
  return kind === 'subject' || kind === 'theme' || kind === 'rival' || kind === 'kind' ? kind : null
}

/**
 * What the share is a share OF, in words.
 *
 * STORED RATHER THAN ASSUMED. The same subject is read against three
 * denominators on one page — your videos, your lead rival's, the category's —
 * and a share quoted without its population cannot be checked against next
 * month's.
 *
 * THE VERDICT'S OWN ANSWER FIRST, AND THE AUDIENCE ONLY AFTER IT. Deriving the
 * words from the audience string alone is right for every verdict whose
 * audience IS its population and wrong for the two the standings draw, where
 * the audience names the OBJECT and n is the panel's: `competitor:Freitag` read
 * that way stored "15 pct · k 6,200 · n 41,200 · Freitag's videos this month"
 * about a share of the panel's COMMENTS. `Verdict.countedOver` is the verdict
 * saying what it counted; this falls back to the audience only where it says
 * nothing.
 */
export function denominatorOf(v: Pick<Verdict, 'audience' | 'countedOver'>): string {
  if (v.countedOver) return v.countedOver.population
  if (v.audience === 'client') return 'your own videos this month'
  if (v.audience.startsWith('competitor:')) return `${v.audience.slice('competitor:'.length)}’s videos this month`
  if (v.audience === 'industry' || v.audience === 'industry-other') return 'the category’s videos this month'
  return `${v.audience} videos this month`
}

const round1 = (n: number): number => Math.round(n * 10) / 10
const share = (k: number, n: number): number => (n > 0 ? round1((k / n) * 100) : 0)

/** A stored row, read back, as the live surfaces take it. */
export function sentReadingOf(row: SentFigureRow & { readingAt: string }): SentReading {
  return {
    readingAt: row.readingAt,
    value: row.value,
    unit: row.unit,
    k: row.k,
    n: row.n,
    monthStatus: row.monthStatus,
  }
}

/**
 * The newest sent reading per object, out of a set of rows.
 *
 * NEWEST, NOT FIRST, and the reason is the weekly report: four weekly artefacts
 * and one monthly one can all carry a reading of September, and "the report of
 * {date} read X" means the last thing we told this client, not the first.
 * Ordered by `reading_at` and never by `sent_at` — two artefacts built from one
 * reading and delivered ten minutes apart are one statement.
 */
export function newestByObject(rows: readonly StoredSentFigure[]): Map<string, StoredSentFigure> {
  const out = new Map<string, StoredSentFigure>()
  for (const r of rows) {
    const key = objectKey(r.audience, r.objectKind, r.objectId, r.measure)
    const held = out.get(key)
    if (!held || readingMs(r) > readingMs(held)) out.set(key, r)
  }
  return out
}

/**
 * When a reading was taken, as an instant.
 *
 * NOT A STRING COMPARE. `reading_at` reaches here as whatever PostgREST
 * rendered a `timestamptz` as, and two rows rendered with different offsets —
 * '2026-10-01T08:00:00+02:00' beside '2026-10-01T07:00:00+00:00' — sort the
 * wrong way round as text while naming the later and the earlier instant. "The
 * report of {date} read X" would then quote the older artefact. The ordering
 * this file is built on is an ordering of instants, so it compares instants.
 *
 * An unreadable value sorts OLDEST, so a row nobody can date never displaces
 * one that can be.
 */
function readingMs(row: { readingAt: string }): number {
  const t = Date.parse(row.readingAt)
  return Number.isNaN(t) ? -Infinity : t
}

export interface StoredSentFigure extends SentFigureRow {
  snapshotId: string
  readingAt: string
  sentAt: string
}

// ---- the record itself --------------------------------------------------------

/**
 * Is M9 simply not applied here?
 *
 * The named predicate, not a widened one: "a table does not exist" still has to
 * name the table we own, so an unrelated outage is never read as a missing
 * migration and silently swallowed.
 */
export function isMissingSentFigures(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes(SENT_FIGURES_TABLE)) return false
  if (code && ['PGRST204', 'PGRST205', '42P01', '42703'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/** The grain, named where the write happens: `sent_figures`' primary key. */
const SENT_FIGURES_CONFLICT = 'client_id,snapshot_id,audience,object_kind,object_id,measure'

/**
 * Write what this artefact printed. Returns how many rows were written, or null
 * where the record does not exist here yet.
 *
 * NON-FATAL, ALWAYS. This runs after the email has been handed to Resend and
 * the share link created; a failure to write the record must not fail a send
 * that has already happened, and must not be retried into a second send. The
 * caller logs and carries on — the `keyword-discovery` precedent AGENTS.md
 * names for a record kept alongside a report.
 *
 * `ON CONFLICT DO NOTHING`, and the grant is why: the table gives the service
 * role INSERT and no UPDATE, and `DO UPDATE` needs UPDATE even on a row that
 * does not conflict (the mistake `month_evidence_refs` documents). A retry of
 * the same send therefore writes nothing and succeeds, which is the behaviour a
 * retry wants.
 *
 * AND IT TAKES `.upsert(…, { ignoreDuplicates: true })` TO GET THAT. `.insert()`
 * sends a bare INSERT — postgrest-js 2.116's own documentation says "if any of
 * the inserts fail, none of the rows are inserted" — so a second delivery of one
 * snapshot raised 23505 and, being all-or-nothing, wrote none of the rows, not
 * even the ones that were missing. `ignoreDuplicates` is the header that makes
 * PostgREST emit DO NOTHING, and the conflict target is named rather than left
 * to the primary key so the grain this table is keyed by is written down where
 * the write happens.
 */
export async function writeSentFigures(
  admin: SupabaseClient,
  args: { clientId: string; snapshotId: string; readingAt: string; rows: readonly SentFigureRow[] },
): Promise<number | null> {
  if (args.rows.length === 0) return 0
  const payload = args.rows.map((r) => ({
    client_id: args.clientId,
    snapshot_id: args.snapshotId,
    month: monthDate(r.month),
    audience: r.audience,
    object_kind: r.objectKind,
    object_id: r.objectId,
    label: r.label,
    value: r.value,
    unit: r.unit,
    measure: r.measure,
    k: r.k,
    n: r.n,
    denominator: r.denominator,
    change_pts: r.changePts,
    band_pts: r.bandPts,
    verdict: r.verdict,
    direction: r.direction,
    month_status: r.monthStatus,
    artefact: r.artefact,
    reading_at: args.readingAt,
  }))
  const { error } = await admin
    .from(SENT_FIGURES_TABLE)
    .upsert(payload, { onConflict: SENT_FIGURES_CONFLICT, ignoreDuplicates: true })
  if (error) {
    if (isMissingSentFigures(error)) return null
    throw error
  }
  return payload.length
}

/** 'YYYY-MM' → 'YYYY-MM-01'. The column is a `date` and the month is its first
 *  day, which is how every month key in this product is stored. */
export function monthDate(month: string): string {
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : month.slice(0, 10)
}

/**
 * What we last told this tenant about a month, by object.
 *
 * Null — not an empty map — where M9 is not applied, so a caller can tell "we
 * have never sent anything about this month" from "this product cannot answer
 * that yet" and word the two differently.
 */
export async function loadSentFigures(
  admin: SupabaseClient,
  args: { clientId: string; month: string },
): Promise<StoredSentFigure[] | null> {
  try {
    const rows = await selectAll<Record<string, unknown>>(() =>
      admin
        .from(SENT_FIGURES_TABLE)
        .select('snapshot_id, month, audience, object_kind, object_id, label, value, unit, measure, k, n, denominator, change_pts, band_pts, verdict, direction, month_status, artefact, reading_at, sent_at')
        .eq('client_id', args.clientId)
        .eq('month', monthDate(args.month))
        .order('reading_at', { ascending: true }),
    )
    return rows.map(hydrate)
  } catch (error) {
    if (isMissingSentFigures(error)) return null
    throw error
  }
}

function hydrate(row: Record<string, unknown>): StoredSentFigure {
  const num = (v: unknown): number | null => (v == null ? null : Number(v))
  return {
    snapshotId: String(row.snapshot_id ?? ''),
    // A `date` comes back as 'YYYY-MM-DD'; every month key in the reading layer
    // is 'YYYY-MM', and a reader joining the two must not have to know that.
    month: String(row.month ?? '').slice(0, 7),
    audience: String(row.audience ?? ''),
    objectKind: row.object_kind as SentObjectKind,
    objectId: String(row.object_id ?? ''),
    label: String(row.label ?? ''),
    value: Number(row.value ?? 0),
    unit: row.unit as SentUnit,
    measure: (row.measure as SentMeasure | null) ?? 'videos',
    k: num(row.k),
    n: num(row.n),
    denominator: String(row.denominator ?? ''),
    changePts: num(row.change_pts),
    bandPts: num(row.band_pts),
    verdict: (row.verdict ?? null) as Verdict['state'] | null,
    direction: (row.direction ?? null) as StoredSentFigure['direction'],
    monthStatus: row.month_status as MonthlyStatus,
    artefact: String(row.artefact ?? ''),
    readingAt: String(row.reading_at ?? ''),
    sentAt: String(row.sent_at ?? ''),
  }
}


// ---- what a live surface shows beside its own figure ---------------------------

/**
 * The last reading we SENT about this month, ready for a page to print beside
 * the number it is showing now (design item 13).
 *
 * WHY A LIVE SURFACE NEEDS THIS AT ALL. A month keeps filling for thirty days
 * after it ends. A client read "19% of 1,388" in the report of the 1st and
 * opens the page on the 20th to "22% of 1,540" — both correct, and the second
 * one silently contradicts the thing they acted on. The page can now say what
 * we said, and when.
 *
 * NULL, NOT AN EMPTY INDEX, where M9 is not applied — so a surface can tell
 * "we have never sent anything about this month" from "this product cannot
 * answer that yet" and word them differently if it ever needs to.
 */
export interface SentMonth {
  /** When the newest artefact about this month was read. */
  readingAt: string
  /** Which artefact that was — 'weekly', 'monthly', 'brief:<who>'. */
  artefact: string
  /** Whether the month was still filling when it went out. A frozen one cannot
   *  have moved since, so nothing is printed beside it. */
  monthStatus: MonthlyStatus
  /** The object-keyed readings, by `objectKey`. */
  byObject: Record<string, SentReading>
  /** The artefact-level tokens, by figure token. */
  byToken: Record<string, SentReading>
}

export function sentMonthOf(rows: readonly StoredSentFigure[] | null): SentMonth | null {
  if (rows == null || rows.length === 0) return null
  const newest = [...newestByObject(rows).values()]
  const byObject: Record<string, SentReading> = {}
  const byToken: Record<string, SentReading> = {}
  for (const r of newest) {
    if (r.objectKind === 'figure') byToken[r.objectId] = sentReadingOf(r)
    else byObject[objectKey(r.audience, r.objectKind, r.objectId, r.measure)] = sentReadingOf(r)
  }
  // THE NEWEST ARTEFACT, not the newest row: four weekly readings and a monthly
  // one can all carry September, and "the report of {date}" means the last
  // thing we told this client about it.
  const lead = [...rows].sort((a, b) => readingMs(b) - readingMs(a))[0]
  return {
    readingAt: lead.readingAt,
    artefact: lead.artefact,
    monthStatus: lead.monthStatus,
    byObject,
    byToken,
  }
}
