import type { BriefRole, SectionKey } from './types'

// What the canvas draws (pure, and light: the deck imports it, and the deck is
// drawn in the browser as well as on the server).
//
// THE CANVAS DRAWS THESE AND NOTHING ELSE (Heinrich, 12 Oct: "look just like
// the design", no deviations; the "Monthly briefs" page of the canvas
// "Verbatim reports and colour", Brief-{Sales,Marketing,Content,Leadership}-*).
// Three sections the engine writes have no page on the canvas: who else is in
// the decision, how the company is remembered, and words to borrow. They are
// still built and stored with the brief (its data keeps them, and so does the
// ledger's `held`), and they do not print. `PRINT_UNDRAWN_SECTIONS` is the one
// switch that would print them again, each on a page of the canvas's rows
// pattern; it is off because that page is not on the canvas.

/** The sections the engine writes that the canvas draws no page for. */
export const UNDRAWN_SECTIONS: readonly SectionKey[] = ['sales.deciders', 'marketing.recall', 'content.borrow']

/** Print the sections the canvas draws no page for. Off: the canvas is the
 *  page set (Heinrich, 12 Oct). Their material stays in the stored brief. */
export const PRINT_UNDRAWN_SECTIONS = false

/** Does this section print in the deck? Pure. */
export const printsSection = (key: SectionKey): boolean => PRINT_UNDRAWN_SECTIONS || !UNDRAWN_SECTIONS.includes(key)

/** Where the findings print: after the last of these sections that prints,
 *  or straight after In short (none). Leadership opens on where the market
 *  and the company stand, as the canvas draws it. */
export const FINDINGS_AFTER: Readonly<Record<BriefRole, readonly SectionKey[]>> = {
  sales: [],
  marketing: [],
  content: [],
  leadership: ['leadership.market', 'leadership.shares'],
}

