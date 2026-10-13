import { canManageTenant, type Role } from './roles'

// WHO MAY DECIDE ON ADVICE AND DATE A MOVE (depth v2, T7).
//
// A LEAF, LIKE lib/roles.ts. The four writes Your moves offers call it before
// they read anything (lib/actions/accept-advice.ts, rec-status.ts,
// date-move.ts, and `setMoveStatusAction` in subjects.ts), and the page calls
// it to decide whether the controls are drawn at all, so the affordance and
// the refusal are one rule and one sentence.
//
// THE RULE CHANGED HERE. Until T7 the four were open to any member: "a member
// saying we did this one" (rec-status.ts) and "a move is the client SAYING
// they did something" (subjects.ts). The depth plan, approved by Heinrich on
// 13 Oct, gates them on the tenant's write role, the same `canManageTenant`
// Settings and the subject writes use: accepting advice and dating a move
// put a line on the record every page then reads, which is the same kind of
// act as changing the set of subjects. An operator viewing a tenant arrives
// as its owner (lib/auth.ts applyOperatorView) and passes.
//
// THE DATABASE STILL LETS A MEMBER THROUGH. `moves` grants members INSERT and
// UPDATE (status), `recommendations` grants them `status`, and `rec_decisions`
// lets them insert, all under own-tenant policies that name no role. This is
// the sentence, one turn earlier; the policy change that would make it the
// boundary (the Block B shape `subjects` got: `get_my_role() = any
// (array['owner','admin'])`) is a migration for Heinrich to decide on.

/** May this reader accept or decline advice, date a move or change a move's
 *  status? The tenant's owners and admins (and the operator viewing it). */
export function mayDecideMoves(role: Role): boolean {
  return canManageTenant(role)
}

/** What a reader who may not is told: printed where the controls would have
 *  been, and returned by each of the four writes when it is called anyway. */
export const MOVES_WRITE_REFUSED =
  'Only an owner or an admin can accept advice, date a move or change how one stands.'
