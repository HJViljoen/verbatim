import { longMonth, shortDate } from '../format'
import type { ConfigActor } from '../config-log'

// Queued tracking edits (market-first decision I, plan §2.10 D5 and WP3.10):
// a term, rival or handle edit from a locked tenant's owner or admin is not
// refused any more. It waits in `tracking_config_queue` (MF3, plan §4.2) and
// lands on the 1st of a month, the first no earlier than 1 Jan 2027, so
// October, November and December are read the same way. The run's `open-run`
// applies what is due (mf/s3-run's lib/pipeline/tracking-queue.ts, deploy 4),
// logged with the actor who queued it; this file writes the rows and says what
// is waiting, and holds the pure half of the apply so the two cannot disagree
// about a field.
//
// WHAT QUEUES, AND WHAT DOES NOT.
//   - the four term lists (your name, brands you track, the category, "not
//     these"), the rival list and the account handles: each a column, `after`
//     holds the WHOLE new value, and the newest queued row of a field wins;
//   - NOT a rival rename: it is one logged operation (`renameRival`, the
//     `rename_rival` RPC), not a column, and MF3's field CHECK holds columns
//     only, so a rename is still refused;
//   - NOT communities: decision I holds them still and §2.10 queues terms,
//     rivals and handles only, so a community edit is still refused;
//   - NOT the cadence: the report day and period are sending, not searching,
//     and a cadence-only change is refused in its own words.
//
// THE APPLY (mf/s3-run): `dueRows` then `queuedPatch`, written through
// `updateWithActor` with the queued row's actor, then `applied_at` stamped. A
// rival list that lands wants what an unlocked save does after its write:
// `ensureRivals` for each new name. Its search terms are queued beside it
// (`derive`), so the patch already carries them.
//
// BEFORE MF3 (Tue 3 Nov) THERE IS NO QUEUE. A read of the table that says it
// does not exist hands the caller back the deploy-1 refusal, so nothing reads
// as queued that was not.

export const QUEUE_TABLE = 'tracking_config_queue'

/** Decision I: no queued change lands before this. */
export const QUEUE_FLOOR = '2027-01-01'

/** The tracking_configs columns a queued row may set from Settings: terms,
 *  rivals and handles (§2.10). MF3's field CHECK admits these and more (the
 *  platforms, the communities and the cadence); Settings queues these only. */
export const QUEUE_COLUMNS = [
  'brand_keywords', 'competitor_keywords', 'industry_keywords', 'exclude_terms',
  'competitor_names', 'competitor_handles', 'own_handles',
] as const
export type QueueColumn = (typeof QUEUE_COLUMNS)[number]
export type QueueField = QueueColumn
export const QUEUE_FIELDS: readonly QueueField[] = QUEUE_COLUMNS
/** The two whose value is an object (a platform → handle map); the rest are lists. */
const OBJECT_COLUMNS: readonly QueueColumn[] = ['competitor_handles', 'own_handles']

/** What each field is called on the page. */
export const QUEUE_FIELD_WORDS: Readonly<Record<QueueField, string>> = {
  brand_keywords: 'Your name',
  competitor_keywords: 'Brands you track',
  industry_keywords: 'The category',
  exclude_terms: 'Not these',
  // The list itself, beside its searches ("Brands you track" above), in the
  // page's words for it (WP3.10), never "rivals".
  competitor_names: 'The brands you track',
  competitor_handles: 'Accounts of the brands you track',
  own_handles: 'Your accounts',
}

/** One queue row, as MF3 pins it (plan §4.2). */
export interface QueuedRow {
  id?: string
  field: string
  after: unknown
  effective_month: string
  queued_by?: string | null
  queued_label: string
  queued_at: string
  applied_at?: string | null
}

/** The month a change queued now lands in: the 1st of the next month, and
 *  never before 1 Jan 2027. 'YYYY-MM-01'. */
export function effectiveMonth(nowIso: string): string {
  const d = new Date(nowIso)
  if (Number.isNaN(d.getTime())) throw new Error(`effectiveMonth: not a date: ${nowIso}`)
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
  return next < QUEUE_FLOOR ? QUEUE_FLOOR : next
}

/** "1 January 2027". */
export function effectiveWords(month: string): string {
  return `1 ${longMonth(month)} ${month.slice(0, 4)}`
}

/** What a save that queued says. */
export function queuedMessage(month: string): string {
  return `Queued for ${effectiveWords(month)}. Searches are held still until then so October and November can be compared.`
}

/** A list compared as a set of trimmed, case-folded entries (a reorder is not
 *  an edit); an object by its sorted entries. */
export function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b)
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return JSON.stringify([...new Set(v.map((x) => String(x).trim().toLowerCase()).filter(Boolean))].sort())
  if (v && typeof v === 'object') {
    return JSON.stringify(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]))
  }
  if (v == null) return '[]'
  return JSON.stringify(v)
}

/** The waiting rows: not applied, the newest per field. */
export function pendingByField(rows: readonly QueuedRow[]): Map<string, QueuedRow> {
  const out = new Map<string, QueuedRow>()
  for (const r of rows) {
    if (r.applied_at) continue
    const held = out.get(r.field)
    if (!held || r.queued_at > held.queued_at) out.set(r.field, r)
  }
  return out
}

/**
 * The rows a save queues: one per column whose posted value differs from what
 * it will be (the waiting row's value, else the stored one). A value put back
 * to what is stored while a change waits queues the stored value, which then
 * wins as the newest. Nothing where nothing moved.
 */
export function queueRows(input: {
  posted: Partial<Record<QueueColumn, unknown>>
  stored: Partial<Record<QueueColumn, unknown>> | null
  pending: readonly QueuedRow[]
  actor: ConfigActor
  now: string
}): Omit<QueuedRow, 'id' | 'applied_at'>[] {
  const waiting = pendingByField(input.pending)
  const month = effectiveMonth(input.now)
  const out: Omit<QueuedRow, 'id' | 'applied_at'>[] = []
  for (const field of QUEUE_COLUMNS) {
    if (!(field in input.posted)) continue
    const next = input.posted[field]
    const will = waiting.has(field) ? waiting.get(field)!.after : input.stored?.[field] ?? null
    if (sameValue(next, will)) continue
    out.push({
      // MF3's CHECK: a list is a JSON array, a handle map an object, never null.
      field, after: next ?? (OBJECT_COLUMNS.includes(field) ? {} : []), effective_month: month,
      queued_by: input.actor.user_id, queued_label: input.actor.label ?? input.actor.kind, queued_at: input.now,
    })
  }
  return out
}

// ---- The apply's pure half (called by the run on the 1st) --------------------------

/** The rows due at a run: waiting, in a month that has started, and never
 *  before the floor, whatever a row says (a row naming an earlier month waits
 *  for the floor). */
export function dueRows(rows: readonly QueuedRow[], runIso: string): QueuedRow[] {
  const today = runIso.slice(0, 10)
  return rows.filter((r) => !r.applied_at && (r.effective_month < QUEUE_FLOOR ? QUEUE_FLOOR : r.effective_month) <= today)
}

/** The tracking_configs patch the due rows make: the newest row per field.
 *  Any field MF3 admits is carried as it stands (the run may queue more than
 *  Settings does); the value is already the column's shape. */
export function queuedPatch(rows: readonly QueuedRow[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const [field, row] of pendingByField(rows)) patch[field] = row.after
  return patch
}

// ---- What the page says ------------------------------------------------------------

export interface QueueLine {
  field: QueueField
  label: string
  /** "adds travel gear; takes out upcycled bag", or "accounts changed". */
  words: string
  month: string
  queuedAt: string
  queuedBy: string
}

function listDiff(before: unknown, after: unknown): { added: string[]; removed: string[] } {
  const norm = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])
  const b = norm(before), a = norm(after)
  const key = (s: string) => s.toLowerCase()
  return {
    added: a.filter((x) => !b.some((y) => key(y) === key(x))),
    removed: b.filter((x) => !a.some((y) => key(y) === key(x))),
  }
}

/** The waiting changes, one line per field, against what is stored now. */
export function queueLines(rows: readonly QueuedRow[], stored: Partial<Record<QueueColumn, unknown>> | null): QueueLine[] {
  const lines: QueueLine[] = []
  const waiting = [...pendingByField(rows).values()]
  for (const r of waiting.sort((x, y) => (x.queued_at < y.queued_at ? -1 : 1))) {
    const field = (QUEUE_FIELDS as readonly string[]).includes(r.field) ? (r.field as QueueField) : null
    if (!field) continue
    let words: string
    if (OBJECT_COLUMNS.includes(field)) {
      words = 'accounts changed'
    } else {
      const d = listDiff(stored?.[field as QueueColumn], r.after)
      const parts = [d.added.length ? `adds ${d.added.join(', ')}` : null, d.removed.length ? `takes out ${d.removed.join(', ')}` : null].filter(Boolean)
      words = parts.length ? parts.join('; ') : 'puts back what is searched now'
    }
    lines.push({ field, label: QUEUE_FIELD_WORDS[field], words, month: r.effective_month, queuedAt: r.queued_at, queuedBy: r.queued_label })
  }
  return lines
}

/** The search set's one line: "queued for January: none yet", or the count. */
export function queueSummary(lines: readonly QueueLine[], nowIso: string): string {
  const month = effectiveMonth(nowIso)
  if (lines.length === 0) return `queued for ${longMonth(month)}: none yet`
  const months = [...new Set(lines.map((l) => l.month))].sort()
  const when = months.map((m) => longMonth(m)).join(' and ')
  return `queued for ${when}: ${lines.length} ${lines.length === 1 ? 'change' : 'changes'}`
}

/** "Queued 12 Oct by daniela@sealand.example". */
export function queuedByWords(line: Pick<QueueLine, 'queuedAt' | 'queuedBy'>): string {
  const who = line.queuedBy.split(' · ')[0]
  return `queued ${shortDate(line.queuedAt)} by ${who}`
}

// ---- The write ---------------------------------------------------------------------

/** The two clients a queued save needs: the session's to read (tenants hold
 *  SELECT on the queue and their own config), the admin's to write (tenants
 *  hold no INSERT on the queue: MF3 grants them SELECT only). */
interface ReadClient { from: (table: string) => unknown }

export type QueueOutcome =
  | { state: 'queued'; month: string; rows: number }
  | { state: 'unchanged' }
  | { state: 'unavailable' }
  | { state: 'failed'; error: string }

function isMissingQueue(error: unknown): boolean {
  const e = (error ?? {}) as { code?: string; message?: string }
  const text = e.message ?? String(error)
  if (!text.includes(QUEUE_TABLE)) return e.code === '42P01' || e.code === 'PGRST205'
  return /schema cache|does not exist|Could not find/i.test(text) || e.code === '42P01' || e.code === 'PGRST205'
}

/**
 * Queue a locked tenant's tracking edit. Reads what waits and what is stored on
 * `read`, writes the new rows on `write` (the admin client, after the caller's
 * role check), each carrying the actor. `unavailable` before MF3.
 */
export async function queueTrackingEdit(args: {
  read: ReadClient
  write: ReadClient
  clientId: string
  posted: Partial<Record<QueueColumn, unknown>>
  /** Columns that follow from the posted ones, computed from what each column
   *  WILL be (the waiting row's value, else the stored one): the rival list's
   *  search terms, as `updateTrackingConfig` derives them for an unlocked save. */
  derive?: (will: Partial<Record<QueueColumn, unknown>>) => Partial<Record<QueueColumn, unknown>>
  actor: ConfigActor
  now: string
}): Promise<QueueOutcome> {
  type Q = PromiseLike<{ data: unknown; error: unknown }>
  const q = (client: ReadClient, table: string) => client.from(table) as {
    select: (cols: string) => { eq: (c: string, v: string) => { is: (c: string, v: null) => { order: (c: string) => Q }; maybeSingle: () => Q } }
    insert: (rows: unknown[]) => Q
  }
  const pendingRead = await q(args.read, QUEUE_TABLE)
    .select('id, field, after, effective_month, queued_by, queued_label, queued_at, applied_at')
    .eq('client_id', args.clientId).is('applied_at', null).order('queued_at')
  if (pendingRead.error) {
    if (isMissingQueue(pendingRead.error)) return { state: 'unavailable' }
    return { state: 'failed', error: String((pendingRead.error as { message?: string }).message ?? pendingRead.error) }
  }
  const pending = (pendingRead.data ?? []) as QueuedRow[]
  const storedRead = await q(args.read, 'tracking_configs').select(QUEUE_COLUMNS.join(', ')).eq('client_id', args.clientId).maybeSingle()
  if (storedRead.error) return { state: 'failed', error: String((storedRead.error as { message?: string }).message ?? storedRead.error) }
  const stored = (storedRead.data ?? null) as Partial<Record<QueueColumn, unknown>> | null
  const waiting = pendingByField(pending)
  const will: Partial<Record<QueueColumn, unknown>> = {}
  for (const f of QUEUE_COLUMNS) will[f] = waiting.has(f) ? waiting.get(f)!.after : stored?.[f] ?? null
  const posted = { ...(args.derive ? args.derive(will) : {}), ...args.posted }
  const rows = queueRows({ posted, stored, pending, actor: args.actor, now: args.now })
  if (rows.length === 0) return { state: 'unchanged' }
  const written = await q(args.write, QUEUE_TABLE).insert(rows.map((r) => ({ client_id: args.clientId, ...r })))
  if (written.error) {
    if (isMissingQueue(written.error)) return { state: 'unavailable' }
    return { state: 'failed', error: String((written.error as { message?: string }).message ?? written.error) }
  }
  return { state: 'queued', month: rows[0].effective_month, rows: rows.length }
}

/** What waits, for the page: the rows not yet applied, or `unavailable`
 *  before MF3. A failed read is not a queue with nothing in it; it throws to
 *  the page's own error handling. */
export async function loadQueue(read: ReadClient, clientId: string): Promise<{ state: 'available'; rows: QueuedRow[] } | { state: 'unavailable' }> {
  const res = await (read.from(QUEUE_TABLE) as {
    select: (c: string) => { eq: (c: string, v: string) => { is: (c: string, v: null) => { order: (c: string) => PromiseLike<{ data: unknown; error: unknown }> } } }
  }).select('id, field, after, effective_month, queued_by, queued_label, queued_at, applied_at').eq('client_id', clientId).is('applied_at', null).order('queued_at')
  if (res.error) {
    if (isMissingQueue(res.error)) return { state: 'unavailable' }
    throw new Error(`${QUEUE_TABLE}: ${String((res.error as { message?: string }).message ?? res.error)}`)
  }
  return { state: 'available', rows: (res.data ?? []) as QueuedRow[] }
}
