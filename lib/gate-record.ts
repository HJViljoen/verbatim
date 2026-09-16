/**
 * Who may read the gate's record, and how a reader finds out (Phase 1 WP16).
 *
 * `gate_verdicts` has two regimes and the difference is invisible to the
 * reader unless it is stated here.
 *
 * ON THE SERVICE-ROLE CLIENT every column is readable and always has been.
 * That is the pipeline, the scripts, the operator console, and an operator
 * standing in another workspace (lib/auth.ts applyOperatorView hands such a
 * session the service-role client).
 *
 * ON A TENANT SESSION there are two states and neither is "everything":
 *   · BEFORE M8 the table is `is_superadmin()`-only. RLS FILTERS — it does not
 *     error — so the read comes back as zero rows with no error at all, and a
 *     composer turns that silence into "what was looked at and set aside is not
 *     recorded at all" for a workspace with 1,700 verdicts. There is nothing in
 *     the answer itself to detect, which is why the probe is a different table:
 *     `gate_appeals` is created by M8 and does not exist before it, and a GET on
 *     a table PostgREST has never heard of returns PGRST205 with the table
 *     named. The absence of the appeals table is how a reader learns that the
 *     counts it is about to read cannot be trusted.
 *   · AFTER M8 nine columns are granted and three — `caption_excerpt`,
 *     `account_name`, `reason` — are not. PostgreSQL requires SELECT on a
 *     column named in a WHERE clause, not only in the select list, so a count
 *     filtered on `reason` is refused outright ("permission denied for table
 *     gate_verdicts") rather than silently emptied. A tenant-session reader
 *     therefore asks for neither the text nor a count that filters on it.
 *
 * So every reader of this table says which regime it is in, and the loaders
 * branch on that rather than on what a read happens to return.
 */

export const GATE_APPEALS_TABLE = 'gate_appeals'

/** PostgREST's two ways of saying "no such table", for the appeals probe. */
export function isMissingGateAppeals(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string | null; message?: string | null }
  const code = e.code ?? ''
  return (code === 'PGRST205' || code === '42P01') && (e.message ?? '').includes(GATE_APPEALS_TABLE)
}

/**
 * Which client a gate read is running on. NOT a guess: the caller knows which
 * client it built, and a probe cannot tell a service-role client from a tenant
 * session that RLS has quietly emptied.
 */
export type GateAccess =
  /** The service-role client: every column, no policy. */
  | 'service'
  /** A tenant session: the nine granted columns after M8, and nothing before
   *  it. */
  | 'tenant'

/**
 * Which regime a page's `session.supabase` is in, from the one fact that
 * decides it: lib/auth.ts applyOperatorView swaps in the service-role client
 * for an operator viewing ANOTHER workspace, and for nobody else. An operator
 * standing in their own workspace holds their own session client and is a
 * tenant here, which is the conservative answer and the true one.
 */
export const gateAccessFor = (operator: { isHome: boolean } | null): GateAccess =>
  operator !== null && !operator.isHome ? 'service' : 'tenant'
