// What "Accept this advice" tells the client, from what the move actually did
// (Phase 1 WP14).
//
// A SEPARATE FILE BECAUSE THE ACTION WRITES. `accept-advice.ts` is
// `'use server'` and pulls in `next/cache` and the session; this is the
// decision it makes, with nothing in it but the decision, so the arm
// production is actually in has a test instead of a mock.

/** What to do once the move has been attempted. Pure, and separated from the
 *  action so the one arm production is actually in can be tested: this file
 *  writes, and a test of a writer is a test of a mock. */
export type AcceptPlan =
  /** The move failed for a reason the client can act on. Nothing else is written. */
  | { do: 'refuse'; message: string }
  /** M4 is not applied here. The status still lands, and the sentence says
   *  what did and did not happen — never "could not save" over a row that
   *  saved. */
  | { do: 'mark-only'; message: string }
  /** The move landed. The status lands beside it. */
  | { do: 'mark'; message: string }

export const MOVE_UNRECORDED_MESSAGE =
  'Marked as Done. Tracking what happens afterwards is not switched on for this workspace yet.'

export const ACCEPTED_MESSAGE = 'Tracking it from today.'

/**
 * What the client is told, from what the move actually did.
 *
 * `declared.missing` IS THE TEST, and it is a code because the prose is not
 * one. This read `declared.message.includes('not switched on')`, and on an
 * advice-kinded move there is no subject to pre-read — so the only failure
 * path is the INSERT, whose message is couldNotSave's "Could not save. Try
 * again, and tell us if it keeps happening." The match therefore never fired
 * on the one state production is in: the status write ran anyway, the ledger
 * above said Done, and the sentence below it told the client to press again,
 * which wrote a second `rec_decisions` row.
 */
export function planAfterMove(declared: { ok: boolean; message: string; missing?: boolean }): AcceptPlan {
  if (declared.ok) return { do: 'mark', message: ACCEPTED_MESSAGE }
  if (declared.missing) return { do: 'mark-only', message: MOVE_UNRECORDED_MESSAGE }
  return { do: 'refuse', message: declared.message }
}
