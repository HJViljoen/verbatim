// Your moves' furniture (depth v2, T7; boards E6-Moves and E6-Moves-Open):
// the board's two buttons, its orange text link and its chips, written out
// whole so Tailwind's scanner sees them, in the app's tokens (palette A; no
// literal colour, no shadow of our own: cards are the kit's `CARD`).

/** The board's `.btn`: 38px, the inner ground, ink words. */
export const BTN =
  'inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-inner px-3.5 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60'

/** The board's `.btn.ink`: the same, ink with white words. */
export const BTN_INK =
  'inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3.5 text-[13.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60'

/** The board's `.olink`: the orange text link (the text-safe orange). */
export const OLINK = 'text-[13.5px] font-semibold text-orange-text no-underline hover:underline underline-offset-2'

/** The board's `.tag`: the pale yellow, ink on it. */
export const TAG_CHIP = 'inline-block whitespace-nowrap rounded-md bg-accent px-2 py-[3px] text-[12px] leading-[1.3] text-accent-foreground'

/** The board's section head over a run of cards: 19px, its note at the right. */
export const SECTION_TITLE = 'm-0 text-[19px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground'
export const SECTION_SUB = 'm-0 text-[13px] leading-[1.4] text-muted-foreground'

/** A priority's chip: high is an attention mark (the orange fill, ink on it),
 *  medium the pale yellow, low on the ground. */
export const PRIORITY_CHIP: Record<string, string> = {
  'High priority': 'bg-orange text-brand-foreground',
  'Medium priority': 'bg-accent text-accent-foreground',
  'Low priority': 'bg-inner text-muted-foreground',
}

/** The mono figure style the board uses for counts beside words. */
export const MONO = 'font-mono tabular-nums'
