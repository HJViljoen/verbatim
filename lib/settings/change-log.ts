import { fullDate, monthName } from '../format'
import { audienceLabel } from '../readiness/types'
import type { ActorKind, ConfigChange, ConfigSurface } from '../config-log'

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
 * rows are the record, reconstructed rows are a prehistory, and the two are
 * never summed. Readiness and this page must not disagree about how many
 * changes a workspace has.
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
export const SURFACE_WORDS: Record<ConfigSurface, string> = {
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
      ? 'Not known — this change was worked out afterwards, not written down at the time.'
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
  surface: ConfigSurface
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
export function renderSide(surface: ConfigSurface, value: unknown): string | null {
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
  /** Rows the product wrote down as they happened. */
  recorded: ClientChange[]
  /** Rows worked out afterwards from what each update searched — a label, not
   *  a record, and never summed with the recorded ones. */
  prehistory: ClientChange[]
  /** The first recorded change, or null while only prehistory exists. */
  firstLoggedAt: string | null
}

/** The whole reader: rows in, two lists out, newest first in each. */
export function readChangeLog(args: ReadChangeLogArgs): ChangeLogView {
  const { rows, viewerUserId = null, emails = {} } = args
  const view = (change: ConfigChange): ClientChange => ({
    id: change.id,
    on: change.changed_at.slice(0, 10),
    date: fullDate(change.changed_at),
    surface: change.surface,
    what: SURFACE_WORDS[change.surface] ?? SURFACE_WORDS.other,
    said: change.note?.trim() || composedNote(change),
    who: actorWords(change.actor_kind, {
      actorUserId: change.actor_user_id,
      actorEmail: change.actor_user_id ? emails[change.actor_user_id] : null,
      viewerUserId,
    }),
    breaks: breakClause(change),
    before: renderSide(change.surface, change.before),
    after: renderSide(change.surface, change.after),
    rowsAffected: change.rows_affected,
    reconstructed: change.source === 'reconstructed',
  })

  const sorted = [...rows].sort((a, b) => (a.changed_at < b.changed_at ? 1 : a.changed_at > b.changed_at ? -1 : 0))
  const recorded = sorted.filter((r) => r.source !== 'reconstructed')
  const prehistory = sorted.filter((r) => r.source === 'reconstructed')
  const firstLogged = recorded.length > 0 ? recorded[recorded.length - 1].changed_at : null
  return {
    recorded: recorded.map(view),
    prehistory: prehistory.map(view),
    firstLoggedAt: firstLogged,
  }
}
