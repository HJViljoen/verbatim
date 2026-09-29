import { SEALAND_CLIENT_ID } from './config'

// The billing page's words (29 Sep 2026). A DEFAULT CHOSEN ON HEINRICH'S
// BEHALF, in its own commit so it is easy to revert.
//
// Sealand's workspace is comped in the database (plan 'design_partner',
// is_comped), so the page said "Complimentary access. This workspace has
// complimentary full access and is never charged." and "Plan: Design_partner",
// while Heinrich's email asks R3,500 a month after the trial. Until the terms
// are settled, the page says it is a free trial whose testing-round pricing is
// agreed with him, and prints no raw plan key. Access is untouched:
// `billingAccess` still reads the comp, so nothing is gated differently.

/** Workspaces on a free trial whose price is agreed with Heinrich directly. */
export const TRIAL_BY_AGREEMENT: ReadonlySet<string> = new Set([SEALAND_CLIENT_ID])

export const TRIAL_BY_AGREEMENT_LABEL = 'Free trial'
export const TRIAL_BY_AGREEMENT_LINE = 'Free trial. Pricing for the testing round is agreed directly with Heinrich.'

/** A stored plan key in words: "design_partner" → "Design partner". Never
 *  the key itself. */
export function planLabel(plan: string | null | undefined): string {
  if (!plan) return '—'
  const words = plan.replace(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '—'
}
