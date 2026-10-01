// WHO SEES YOUR STATEMENTS (fresh review M3; lead's ruling 5, 1 Oct evening).
//
// Your statements is HELD FROM TENANTS until Heinrich decides (open ruling
// #7). Its stance split moves by up to a fifth between measurements, and the
// numbers would face Sealand's owners from the first day. So, while this is
// false:
//   · a tenant's Your moves draws no Your statements section and no add form
//     (app/dashboard/market/page.tsx does not even read the statements);
//   · the add, edit and remove actions refuse a tenant's session before
//     anything is written, so nothing is measured on a tenant's behalf
//     (lib/actions/statements.ts: the measurement on add runs only after a
//     write the operator made);
//   · the operator sees and uses it as built, on any workspace they view: the
//     section, the form, the measurement on add, and the weekly re-measure
//     inside `ask-reevaluate`, which reads only statements someone added.
//
// To open it to clients, flip this one constant: the page and the actions
// both read `maySeeStatements`, so that is the whole change.
export const STATEMENTS_TENANT_VISIBLE = false

/** May this session see Your statements and change them? The operator
 *  always; a tenant's own user only once the constant is true. Pure: the
 *  flag is an argument, so both answers stay tested (AGENTS.md). */
export function maySeeStatements(session: { operator?: unknown | null }, tenantVisible: boolean = STATEMENTS_TENANT_VISIBLE): boolean {
  return session.operator != null || tenantVisible
}

/** What the actions answer a tenant's session while the section is held. No
 *  page draws a control that reaches it. */
export const STATEMENTS_HELD = 'Statements are not open in your workspace yet.'
