import { fullDate, monthName, shortDate } from '../format'
import { audienceLabel } from '../readiness/types'
import type { ActorKind, ConfigChange } from '../config-log'
import type { LoggedSurface } from '../config-surfaces-mf1'

/**
 * The change log, read by the person whose configuration it is (Phase 1 WP16,
 * design ST7, decision U).
 *
 * `lib/config-log.ts` already decided the client/operator split and wrote it
 * down: `note` is the sentence — no command line, no dollars, no internal
 * vocabulary — because the log is readable by every member of the tenant;
 * `actor_label` is where the command and the cost go. This module is the other
 * half of that rule, and it enforces it by construction: a `ClientChange`
 * carries no `actor_label` field at all, so a surface cannot print one by
 * accident. (`actor_label` holds `postgres`, `scripts/regate-corpus.ts --apply`
 * and ` · OpenAI $0.01234` on live rows.)
 *
 * THE COUNTING RULE IS INHERITED, NOT RE-DECIDED. `lib/readiness/load.ts`
 * counts only `source <> 'reconstructed'`, because the boundary sentence
 * `changeLogBoundary` says the record begins at the first LOGGED row and
 * everything before it is inference. The same split is made here: recorded
 * rows are the record, reconstructed rows dated BEFORE it began are a
 * prehistory, and the two are never summed. Readiness and this page must not
 * disagree about where the record begins.
 *
 * A reconstructed change dated AFTER the record began is not prehistory.
 * scripts/log-tracking-eras.ts writes the relevance-gate fix and attribution
 * v3 (and a capped update, when there is one) as `source 'reconstructed'`
 * rows, dated at the actual deploy days after the record began: a change of
 * ours no setting logged, written down afterwards at a known date. Filed
 * under "Before the record began" it would sit beside July's inferred term
 * sets, so it joins the record, keeps `reconstructed: true`, and its break
 * clause, when it has none, says "Not recorded." like any logged row (the
 * "worked out afterwards" sentence belongs to the prehistory). Readiness
 * still does not count it (its query filters on the source), which is the
 * one place the two differ: readiness counts rows, this page one entry per
 * change, so they never printed the same number anyway.
 *
 * Pure. The caller reads the rows and supplies the viewer.
 */

/**
 * `config_changes.affects_audiences` / `.affects_months` arrive with M1, and
 * the log itself arrived a migration earlier — so there is a real window in
 * which the table exists and those two columns do not. It is the live state of
 * production as this is written.
 *
 * A reader that named them in its select got "column
 * config_changes.affects_audiences does not exist" and took the page down,
 * which is the failure the readiness module's guards exist to prevent. The
 * honest degradation is already written into the column's own doc comment:
 * NULL means "not known", and 91 of the 93 stored rows carry null on both
 * halves anyway. So the reader retries without them and `breakClause` says
 * "not recorded" — the same sentence it says for a row that has them and left
 * them empty.
 */
export function isMissingAffects(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!/affects_audiences|affects_months/.test(text)) return false
  return code === undefined || ['42703', 'PGRST204', 'PGRST205'].includes(code) || /does not exist/i.test(text)
}

// ---- Who -------------------------------------------------------------------

/**
 * The six actor kinds in the client's words.
 *
 * `operator`, `script` and `sql` all collapse to "Verbatim". They are three
 * different hands on our side — a person in the console, a command, a hand-run
 * statement — and that distinction is ours to care about, not the client's: to
 * them it is us either way, and printing "a script" would say that a machine
 * decided something a person decided.
 *
 * `user` splits on whether the viewer is the person named. "You" is worth
 * having: on a workspace with five members, "who changed the terms" is most
 * often answered by "I did, last Tuesday", and a log that made you look up your
 * own email address to find that out would be answering a different question.
 */
export function actorWords(
  kind: ActorKind,
  args: { actorUserId?: string | null; actorEmail?: string | null; viewerUserId?: string | null } = {},
): string {
  if (kind === 'user') {
    if (args.actorUserId && args.viewerUserId && args.actorUserId === args.viewerUserId) return 'You'
    return args.actorEmail ?? 'Someone on your team'
  }
  if (kind === 'pipeline') return 'An automatic update'
  if (kind === 'reconstructed') return 'Reconstructed, not recorded'
  return 'Verbatim'
}

// ---- What ------------------------------------------------------------------

/** Each surface, named the way the client would go looking for it. `knobs` and
 *  `platforms` are operator levers a client cannot edit, and they still appear
 *  — a log that hid the changes we made to a workspace would be worse than no
 *  log. */
export const SURFACE_WORDS: Record<LoggedSurface, string> = {
  terms: 'Search terms',
  rivals: 'Rivals',
  handles: 'Accounts we read',
  platforms: 'Platforms',
  subreddits: 'Communities',
  cadence: 'Cadence',
  knobs: 'How deeply we read',
  schedule: 'Reports and recipients',
  subjects: 'Subjects',
  entity_retag: 'Who a post is about',
  regate: 'What was kept',
  prompt_version: 'How we read',
  rival_rename: 'A rival was renamed',
  other: 'Configuration',
  // Three changes of ours that no setting records (MF1, WP1.4): the relevance
  // check's rule, how posts are filed under a brand, and how makers and
  // off-topic videos are marked. A mark never takes a video out of a count.
  // (lib/config-surfaces-mf1.ts holds the three until the 4 Oct run.)
  gate_rule: 'How we check relevance',
  attribution: 'How posts are filed by brand',
  segment: 'How makers and off-topic videos are marked',
}

// ---- What it broke ---------------------------------------------------------

/** A Postgres daterange literal over months, `[2021-12-01,2026-10-01)`, read
 *  back into its two ends. Null on anything unparseable, including the empty
 *  range — "not known" and "no months" must not both become a month. */
export function monthsOfRange(range: string | null | undefined): { from: string; to: string } | null {
  const m = (range ?? '').match(/^([[(])(\d{4}-\d{2})-\d{2},(\d{4}-\d{2})-\d{2}([\])])$/)
  if (!m) return null
  const [, , from, toExclusive] = m
  // The stored range is [first, last+1) over calendar months, so the last month
  // a reader should see is the month BEFORE the exclusive end.
  const [y, mo] = toExclusive.split('-').map(Number)
  const to = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`
  return from <= to ? { from, to } : { from, to: from }
}

/**
 * What a change broke, in one clause — decision U's left-hand column.
 *
 * NULL means "not known", which is the honest value on every row written before
 * the columns existed, and it is a different sentence from "nothing". 91 of the
 * 93 rows the reconstruction writes carry null on both halves.
 */
export function breakClause(change: Pick<ConfigChange, 'affects_audiences' | 'affects_months' | 'source'>): string {
  const audiences = (change.affects_audiences ?? []).filter(Boolean)
  const months = monthsOfRange(change.affects_months)
  if (audiences.length === 0 && !months) {
    return change.source === 'reconstructed'
      ? 'Not known: this change was worked out afterwards, not written down at the time.'
      : 'Not recorded.'
  }
  // IN THE READER'S WORDS, like every other audience in the product. This
  // printed `affects_audiences[0]` RAW ("competitor:Ottobock", "industry-other")
  // and its months as "2026-09", in a file that already imports `fullDate` and
  // beside a codebase that routes every audience through `audienceLabel`.
  // Latent until M1 lands — the two columns do not exist on production yet, so
  // every row reads "Not recorded." — which is why it is worth closing now.
  const parts: string[] = []
  if (audiences.length > 0) {
    parts.push(audiences.length === 1 ? audienceLabel(audiences[0]) : `${audiences.length} audiences`)
  }
  if (months) {
    const from = monthName(`${months.from}-01`)
    const to = monthName(`${months.to}-01`)
    parts.push(from === to ? from : `${from} to ${to}`)
  }
  return parts.join(' · ')
}

// ---- The row ---------------------------------------------------------------

export interface ClientChange {
  id: string
  /** `YYYY-MM-DD`, dated by the wall clock the change was made on. NOT a
   *  period key: a run has carried two dates, and no reading is indexed by
   *  this. */
  on: string
  date: string
  /** The same date in the artboard's form, "3 Sep". The long form stays on
   *  `date` because the quarterly deck's change log prints it beside dates a
   *  year apart, and there "3 Sep" beside "3 Sep" is two different Septembers
   *  (lib/format.ts's own reason for `fullDate`). The record page's table is
   *  one workspace's own recent history in a column 100px wide. */
  dateShort: string
  surface: LoggedSurface
  what: string
  /** The plain sentence from `note`, or a composed one when the row has none
   *  (trigger rows carry before/after and no note). */
  said: string
  who: string
  /** What the change moved, for the second column. */
  breaks: string
  /** Rendered before/after, per surface, never raw jsonb. Null where neither
   *  side is renderable. */
  before: string | null
  after: string | null
  rowsAffected: number | null
  /** True for a row the reconstruction wrote: a label, not a record. */
  reconstructed: boolean
}

/** A list is a list of strings, a scalar is a scalar, and anything else is
 *  named rather than dumped. The alternative — `JSON.stringify` — puts a jsonb
 *  blob of handles or subreddit probe objects on a client's screen. */
export function renderSide(surface: LoggedSurface, value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) {
    const items = value.map((v) => (typeof v === 'string' ? v : (v as { name?: string })?.name)).filter(Boolean) as string[]
    if (items.length === 0) return value.length === 0 ? 'nothing' : `${value.length} entries`
    return items.length <= 8 ? items.join(', ') : `${items.slice(0, 8).join(', ')} and ${items.length - 8} more`
  }
  if (typeof value === 'string') return value || 'nothing'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const keys = Object.keys(value as Record<string, unknown>)
  if (surface === 'handles') return keys.length === 0 ? 'nothing' : keys.join(', ')
  return keys.length === 0 ? 'nothing' : `${keys.length} settings`
}

/** The sentence a row with no `note` gets. Trigger rows are the case: the
 *  database cannot write prose, so it writes the field and the two sides, and
 *  the sentence is composed here from the same three facts. */
function composedNote(change: ConfigChange): string {
  const what = SURFACE_WORDS[change.surface] ?? SURFACE_WORDS.other
  const field = change.field ? ` (${change.field})` : ''
  return `${what}${field} changed.`
}

/** How many rows of the log a card shows at once. The page names everything
 *  else it hides (the communities remainder, the prehistory count), so this one
 *  says so too. */
export const CHANGE_LOG_ROWS = 20

/** "Showing the 20 most recent of 33." Null when the table IS the list — a
 *  count of what is hidden when nothing is hidden is noise. */
export function showingLine(shown: number, total: number): string | null {
  if (total <= shown) return null
  return `Showing the ${shown.toLocaleString('en-GB')} most recent of ${total.toLocaleString('en-GB')}.`
}

export interface ReadChangeLogArgs {
  rows: readonly ConfigChange[]
  viewerUserId?: string | null
  /** user id → email, for rows made by a teammate. The log stores an id; the
   *  page resolves it, and an unresolved id prints as "someone on your team"
   *  rather than as a uuid. */
  emails?: Readonly<Record<string, string>>
}

export interface ChangeLogView {
  /** Rows the product wrote down as they happened, and the reconstructed
   *  changes of ours dated after the record began (`reconstructed: true`). */
  recorded: ClientChange[]
  /** Rows worked out afterwards from what each update searched, dated before
   *  the record began — a label, not a record, and never summed with the
   *  recorded ones. */
  prehistory: ClientChange[]
  /** The first recorded change, or null while only prehistory exists. */
  firstLoggedAt: string | null
}

/**
 * The rows of ONE change, grouped, so the record shows each change once (MF1,
 * WP1.4): rows on the same surface, by the same actor, within
 * `RECORD_GROUP_WINDOW_MS` of the group's first row. The audit trigger writes
 * one row per column in one UPDATE (the 17 Sep script: three `terms` rows at
 * 16:02:56), the reconstruction wrote one row per term (the 9 Sep swap:
 * fourteen at 18:17:56), and a community edit writes the trigger's row and its
 * own logged row a few milliseconds apart. The grouping is `changesFromLog`'s
 * (lib/reading/comparability.ts, its CHANGE_GROUP_WINDOW_MS, which the test
 * pins equal to this one), so a group's id is the change id that
 * `config_change_reach` points at; the record adds the actor to the key, so
 * two people's edits never become one entry. Oldest first within a group.
 */
export const RECORD_GROUP_WINDOW_MS = 60_000

export function groupChangeRows(rows: readonly ConfigChange[]): ConfigChange[][] {
  const sorted = rows
    .map((row) => ({ row, ms: Date.parse(row.changed_at) }))
    .sort((a, b) => (Number.isNaN(a.ms) ? 1 : 0) - (Number.isNaN(b.ms) ? 1 : 0) || a.ms - b.ms || a.row.id.localeCompare(b.row.id))
  const groups: { startMs: number; rows: ConfigChange[] }[] = []
  const open = new Map<string, { startMs: number; rows: ConfigChange[] }>()
  for (const { row, ms } of sorted) {
    if (Number.isNaN(ms)) {
      groups.push({ startMs: ms, rows: [row] })
      continue
    }
    const key = `${row.surface}\u0000${row.field === 'attention_panel' ? 'panel' : ''}\u0000${row.actor_kind}\u0000${row.actor_user_id ?? ''}`
    const g = open.get(key)
    if (g && ms - g.startMs <= RECORD_GROUP_WINDOW_MS) {
      g.rows.push(row)
      continue
    }
    const fresh = { startMs: ms, rows: [row] }
    groups.push(fresh)
    open.set(key, fresh)
  }
  return groups.map((g) => g.rows)
}

/** One side of a group: the row's own rendering for a single row; for several,
 *  each row's rendered side, joined, so the 9 Sep swap reads its seven removed
 *  terms before and its seven added terms after. A rendering several rows
 *  share prints once (deploy 2 review): six object rows each rendered "6
 *  settings", and the side read "6 settings; 6 settings; …" six times. */
function groupSide(surface: LoggedSurface, rows: readonly ConfigChange[], side: 'before' | 'after'): string | null {
  const parts = [...new Set(rows.map((r) => renderSide(surface, r[side])).filter((x): x is string => x != null))]
  if (parts.length === 0) return null
  return parts.join('; ')
}

/** The whole reader: rows in, two lists out, newest first in each, ONE entry
 *  per change (`groupChangeRows`). A group is prehistory when every row is
 *  reconstructed AND it is dated before the first recorded group (see the
 *  module header). */
export function readChangeLog(args: ReadChangeLogArgs): ChangeLogView {
  const { rows, viewerUserId = null, emails = {} } = args
  const view = (group: readonly ConfigChange[], prehistoric: boolean): ClientChange => {
    const change = group[0]
    const withNote = group.find((r) => r.note?.trim())
    const withAffects = group.find((r) => (r.affects_audiences?.length ?? 0) > 0 || r.affects_months) ?? change
    const counted = group.filter((r) => r.rows_affected != null)
    return {
      id: change.id,
      on: change.changed_at.slice(0, 10),
      date: fullDate(change.changed_at),
      dateShort: shortDate(change.changed_at),
      surface: change.surface,
      what: SURFACE_WORDS[change.surface] ?? SURFACE_WORDS.other,
      said: withNote?.note?.trim() || composedNote(change),
      who: actorWords(change.actor_kind, {
        actorUserId: change.actor_user_id,
        actorEmail: change.actor_user_id ? emails[change.actor_user_id] : null,
        viewerUserId,
      }),
      breaks: breakClause({ ...withAffects, source: prehistoric ? 'reconstructed' : 'logged' }),
      before: groupSide(change.surface, group, 'before'),
      after: groupSide(change.surface, group, 'after'),
      rowsAffected: counted.length > 0 ? counted.reduce((n, r) => n + (r.rows_affected ?? 0), 0) : null,
      reconstructed: group.every((r) => r.source === 'reconstructed'),
    }
  }

  const newestFirst = (a: ConfigChange[], b: ConfigChange[]) =>
    a[0].changed_at < b[0].changed_at ? 1 : a[0].changed_at > b[0].changed_at ? -1 : 0
  const groups = groupChangeRows(rows).sort(newestFirst)
  const allReconstructed = (g: readonly ConfigChange[]) => g.every((r) => r.source === 'reconstructed')
  const logged = groups.filter((g) => !allReconstructed(g))
  const firstLogged = logged.length > 0 ? logged[logged.length - 1][0].changed_at : null
  const firstLoggedMs = firstLogged ? Date.parse(firstLogged) : Number.NaN
  // Before the record began: every row reconstructed, and dated earlier than
  // the first recorded change (or no recorded change at all yet).
  const prehistoric = (g: readonly ConfigChange[]) =>
    allReconstructed(g) && (Number.isNaN(firstLoggedMs) || !(Date.parse(g[0].changed_at) >= firstLoggedMs))
  return {
    recorded: groups.filter((g) => !prehistoric(g)).map((g) => view(g, false)),
    prehistory: groups.filter(prehistoric).map((g) => view(g, true)),
    firstLoggedAt: firstLogged,
  }
}

// ---- The artboard's month flag and the coverage row --------------------------

/** Was this change made inside the current calendar month? The artboard's amber
 *  flag. "This month" is the WALL CLOCK, which is what a change is dated by
 *  (`ClientChange.on` is `changed_at`), not the month its comments were
 *  written in. */
export function madeThisMonth(change: ClientChange, now: string): boolean {
  return change.on.slice(0, 7) === now.slice(0, 7)
}

/**
 * The coverage grid's "Tracking changes · 1 — Poler added 3 Sep" clause.
 *
 * The count itself is `ChangeRecord.inWindow`, read off the same table by
 * `lib/reading/record.ts`; this NAMES the change, which the record loader
 * cannot, because it counts rows and never reads their notes.
 *
 * THE TWO HALVES DO NOT COUNT THE SAME ROWS, AND THE CLAUSE SAYS SO. `inWindow`
 * counts `all`, reconstructed rows included; this reads `view.recorded` only,
 * because a reconstructed row is a label and is never summed with the record.
 * So a window holding one logged change and one reconstructed one printed
 * "2 — Poler added as a rival, 3 Sep", naming one of two as though it were the
 * only one (code review finding 4). `counted` is the figure this clause sits
 * beside: where it exceeds the rows named here, the clause says "the newest",
 * which is true of both counts. Where nothing recorded falls inside the window
 * there is nothing to name and the clause is null, as it always was.
 */
export function changeNote(
  view: ChangeLogView,
  window: { from: string; to: string },
  opts: { counted?: number | null } = {},
): string | null {
  const inside = view.recorded.filter((c) => c.on >= window.from && c.on <= window.to)
  if (inside.length === 0) return null
  const counted = opts.counted ?? inside.length
  const newest = inside[0]
  const said = newest.said.replace(/\.$/, '')
  return inside.length === 1 && counted <= 1
    ? `${said}, ${newest.dateShort}`
    : `the newest ${said}, ${newest.dateShort}`
}
