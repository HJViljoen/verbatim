import { OSSUR_CLIENT_ID } from '../config'

// THE MEDICAL TEAM LINE (depth v2, T6; plan T13's done-when: "the 'check with
// your medical team' line is always printed").
//
// A post idea is advice about what to publish. In a medical market (Össur's:
// prostheses, liners, sockets, bracing) a post that explains how long a liner
// lasts or what to do when a knee is refused is close to clinical guidance, so
// every printed idea for such a workspace carries one line under it, and the
// line is CODE's, never the model's: the writer cannot drop it, reword it or
// forget it, and the stored row does not carry it (T13 stores no line), so an
// idea written before a workspace was marked still prints it.
//
// WHICH WORKSPACES. No tenant attribute says what a market is (there is no
// `clients.industry`, and `tracking_configs` holds search words, not a
// category), so the set is one constant in one place, the way the per-tenant
// spend switches are (lib/config.ts). Össur is in it; Sealand (bags) is not. A
// new medical workspace is one line here.

/** The line printed under every post idea in a medical market. */
export const MEDICAL_LINE = 'Check any clinical claim with your medical team before posting.'

/** The workspaces whose market is medical. */
export const MEDICAL_MARKET_CLIENTS: ReadonlySet<string> = new Set([OSSUR_CLIENT_ID])

/** Does this workspace print the medical team line under its post ideas? */
export function printsMedicalLine(clientId: string): boolean {
  return MEDICAL_MARKET_CLIENTS.has(clientId)
}
