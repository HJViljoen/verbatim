// The recommendation decision ledger, as both halves of the product read it
// (design item 17, 2026-09-15).
//
// This lives one directory up from `lib/pipeline/rec-lineage.ts`, where the rest
// of the lineage logic is, for one reason: the browser's write site
// (app/dashboard/market/actions.ts) needs the same two things, and importing
// rec-lineage would pull `./cluster` → `../openai` — an OpenAI client
// constructed on every request that loads a dashboard server action, for a
// module that does no arithmetic and calls nothing. rec-lineage re-exports both
// so the pipeline side reads as one module.
//
// Pure: no I/O, no clients, no environment.

/** The table. Named once so the read, the write site and the guard below cannot
 *  drift apart. */
export const REC_DECISIONS_TABLE = 'rec_decisions'

/**
 * How many decisions the pipeline reads per update, newest first.
 *
 * Not a choice about how much to read: PostgREST caps a select at 1000 rows and
 * says nothing when it does, so this is that cap written down, where the read
 * living under it can be DESIGNED for it. The ledger is append-only and never
 * pruned — a tenant who reclassifies weekly passes a thousand decisions
 * eventually, and the only question then is which thousand come back.
 * Newest-first makes the answer "the ones that decide the status", and every row
 * lost is one a later decision has already superseded.
 */
export const REC_DECISIONS_READ_LIMIT = 1000

/** One row of `rec_decisions`, as a read hands it over. */
export interface RecDecision {
  /** The primary key — what settles two decisions at the same instant. */
  id: string
  lineage_id: string
  /** One of REC_STATUSES — the DB CHECK is the guarantee. */
  status: string
  /** ISO 8601, as PostgREST returns a timestamptz. */
  decided_at: string
}

/**
 * The status a lineage carries into the next update: its LATEST decision,
 * unless that decision is 'new'.
 *
 * Latest, not "latest that is not 'new'": moving a recommendation back to New is
 * a decision like any other (the menu offers it), and answering a reset with the
 * "Done" that preceded it would undo the client's own correction on their next
 * update, silently. 'new' is the column default, so returning null for it says
 * the same thing the ledger does — take the default.
 *
 * Latest by (`decided_at`, `id`), worked out here rather than taken from the
 * order the rows arrived in. The caller reads newest-first under a LIMIT, so
 * that order is the opposite of what it was when this function was written, and
 * a pure function whose answer flips with someone else's ORDER BY is a trap. Two
 * decisions at the same instant fall to the higher `id` — which is also the one
 * the database's own `decided_at desc, id desc` read returns first.
 */
export function inheritedStatus(lineageId: string, decisions: RecDecision[]): string | null {
  let latest: RecDecision | null = null
  for (const d of decisions) {
    if (d.lineage_id !== lineageId) continue
    if (!latest || isLaterDecision(d, latest)) latest = d
  }
  if (!latest || latest.status === 'new') return null
  return latest.status
}

/** Is `a` the later of two decisions? `decided_at` decides it; `id` settles the
 *  same instant. Rows carrying neither fall to whichever was passed last, which
 *  is all the caller's own order can tell us. */
function isLaterDecision(a: RecDecision, b: RecDecision): boolean {
  const at = a.decided_at ?? '', bt = b.decided_at ?? ''
  if (at !== bt) return at > bt
  return (a.id ?? '') >= (b.id ?? '')
}

/**
 * Is this error "the decision ledger is not there yet"?
 *
 * `20260915093000_rec_decisions.sql` is applied by hand, so a deploy can reach
 * production before it does. Without this test the lineage read would report
 * `lineage_error` on every update and every status write in the browser would
 * fail in front of the client, for a table that is coming on Thursday. Narrow on
 * purpose — the same shape as `isMissingMonthlyReading` (WP3): this table's own
 * name, and one of the codes that means "no such relation".
 */
export function isMissingRecDecisions(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes(REC_DECISIONS_TABLE)) return false
  // PGRST205 the table (and PGRST204 a column of it) from PostgREST's schema
  // cache; 42P01 / 42703 the same two from Postgres itself.
  if (code && ['PGRST205', 'PGRST204', '42P01', '42703'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}
