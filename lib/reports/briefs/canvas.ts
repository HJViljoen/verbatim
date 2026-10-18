import type { BriefRole, SectionKey, StoredBriefData } from './types'

// What the canvas draws (pure, and light: the deck imports it, and the deck is
// drawn in the browser as well as on the server).
//
// TWO CANVASES, ONE BRIEF EACH, NEVER MIXED.
//
// V1, the canvas Heinrich approved on 12 Oct ("Verbatim reports and colour",
// page "Monthly briefs", Brief-{Sales,Marketing,Content,Leadership}-*; "look
// just like the design", no deviations). Every brief stored before the October
// canvas (September's) is drawn on it, exactly as it always was: a brief with
// no `fromApp` is a v1 brief. Three sections the engine writes have no page on
// it: who else is in the decision, how the company is remembered, and words
// to borrow. They are still built and stored with the brief (its data keeps
// them, and so does the ledger's `held`), and they do not print.
// `PRINT_UNDRAWN_SECTIONS` is the one switch that would print them again, each
// on a page of the canvas's rows pattern; it is off because that page is not
// on the canvas.
//
// V2, the October boards (briefs-2026-10, approved 18 Oct with the designer's
// recommendations), which extend v1 and copy its kit exactly. A brief that
// carries `fromApp` is drawn on it: the role's pages are `V2_PAGES`, in that
// order, after its findings (Leadership's after where the market and the
// company stand). The pages v2 changed are new sections read from the app
// (`fromApp`): Who is buying is Voices' real groups (`sales.groups`, in place
// of the writer's buyer types), Where the market stands is each subject's own
// read on Market (`leadership.subjects`), Hooks and formats is Content's
// measure (`content.hooks`), and What to post next (`content.ideas`) stands
// where The questions people ask stood. The writer's sections v2 no longer
// draws (the buyer types, the questions people ask, what buyers weigh, the
// old formats table and the writer's market page) are still written and
// stored, and not printed.

export type Canvas = 'v1' | 'v2'

/** The canvas a brief is drawn on: v2 where it carries the app's pages. */
export const canvasOf = (d: Pick<StoredBriefData, 'fromApp'>): Canvas => (d.fromApp ? 'v2' : 'v1')

/** The sections the engine writes that the v1 canvas draws no page for. */
export const UNDRAWN_SECTIONS: readonly SectionKey[] = ['sales.deciders', 'marketing.recall', 'content.borrow']

/** Print the sections the v1 canvas draws no page for. Off: the canvas is the
 *  page set (Heinrich, 12 Oct). Their material stays in the stored brief. */
export const PRINT_UNDRAWN_SECTIONS = false

/** The October canvas's pages after the findings, per role, in order (the
 *  boards' page lists, 18 Oct). What they want settled first prints on What
 *  stops them's page, and the questions for the business under the risks, as
 *  on v1. */
export const V2_PAGES: Readonly<Record<BriefRole, readonly SectionKey[]>> = {
  sales: ['sales.groups', 'sales.stops', 'sales.triggers', 'sales.rivals', 'sales.care'],
  marketing: ['marketing.believe', 'marketing.words', 'marketing.say_hear', 'marketing.rivals', 'marketing.products', 'marketing.named'],
  content: ['content.ideas', 'content.hooks', 'content.watch', 'content.more', 'content.confusion'],
  leadership: ['leadership.subjects', 'leadership.groups', 'leadership.shares', 'leadership.risks', 'leadership.moves', 'leadership.holds'],
}

const V2_PRINTED: ReadonlySet<SectionKey> = new Set([...Object.values(V2_PAGES).flat(), 'sales.settle', 'leadership.decisions'])

/** Does this section print in the deck, on this canvas? Pure. */
export const printsSection = (key: SectionKey, canvas: Canvas = 'v1'): boolean =>
  canvas === 'v2' ? V2_PRINTED.has(key) : PRINT_UNDRAWN_SECTIONS || !UNDRAWN_SECTIONS.includes(key)

/** Where the findings print: after the last of these sections that prints,
 *  or straight after In short (none). Leadership opens on where the market
 *  and the company stand, as the canvas draws it (v2: and who is in the
 *  market). */
export const FINDINGS_AFTER: Readonly<Record<BriefRole, readonly SectionKey[]>> = {
  sales: [],
  marketing: [],
  content: [],
  leadership: ['leadership.market', 'leadership.shares'],
}
export const V2_FINDINGS_AFTER: Readonly<Record<BriefRole, readonly SectionKey[]>> = {
  sales: [],
  marketing: [],
  content: [],
  leadership: ['leadership.subjects', 'leadership.groups', 'leadership.shares'],
}

/** The findings' anchor on a brief's canvas. Pure. */
export const findingsAfter = (role: BriefRole, canvas: Canvas): readonly SectionKey[] => (canvas === 'v2' ? V2_FINDINGS_AFTER : FINDINGS_AFTER)[role]
