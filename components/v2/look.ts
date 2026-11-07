// THE AUDIT DESIGN'S LOOK (7 Nov; the boards in
// ~/.claude/plans/verbatim-audit-design/boards, Market-After.dc.html the
// reference): the class strings every screen is drawn from, and the two pure
// functions that say how long a bar is. One set, replacing the pages' own
// copies (`OLINK`, `EYEBROW`, `CAPS`, `TH`, `BTN`, `PRIORITY_CHIP`, …).
//
// NO IMPORTS, ON PURPOSE. Client components (the advice actions, the move
// status, the tag control, the Agent composer) take their styles from here,
// and a client file's style must come from a client-safe module, never from a
// page's `parts` that import its loader (AGENTS.md; the client-bundle guard,
// lib/test/client-chains.test.ts). A module with no imports cannot start a
// chain. `components/v2/ui.tsx` draws the components on top of these.
//
// Tailwind reads the strings as they are written here (MASTER rule 1: never
// interpolated). Where two are combined (`CHIP` with `CHIP_ON`, a button with
// `BTN_SM`), combine them with `cn` so the later one wins.

/** A label: sentence case, never uppercase, never an orange eyebrow. */
export const LBL = 'text-[13px] font-semibold leading-[1.3] text-secondary-foreground'

/** A link that says where it goes, with no arrow: ink, underlined in the
 *  control grey, the underline turning ink on hover. */
export const GO =
  'text-[14px] font-medium text-foreground underline decoration-control underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground'

/** A row's or a card's title that opens a page: ink at 600, no underline at
 *  rest, the link's underline on hover. */
export const ROW =
  'font-semibold text-foreground no-underline decoration-control underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground'

/** A filter chip, and the chosen one (combine: `cn(CHIP, CHIP_ON)`). */
export const CHIP =
  'inline-flex h-[34px] cursor-pointer items-center whitespace-nowrap rounded-[8px] border border-border bg-card px-3 text-[14px] text-foreground transition-colors hover:bg-inner focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground'
export const CHIP_ON = 'border-transparent bg-accent font-semibold hover:bg-accent'

/** The primary button: the brand yellow with ink words (decision 8; the
 *  `--primary` token stays ink for print and the login button). */
export const BTN_PRIMARY =
  'inline-flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[8px] bg-brand px-[18px] text-[14px] font-semibold text-brand-foreground transition-colors hover:bg-brand/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50'

/** The secondary button: the same box, white with the control grey's edge. */
export const BTN_SECONDARY =
  'inline-flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[8px] border border-control bg-card px-[18px] text-[14px] font-semibold text-foreground transition-colors hover:bg-inner focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50'

/** The small size of either button (combine: `cn(BTN_SECONDARY, BTN_SM)`). */
export const BTN_SM = 'h-9 px-3.5'

/** A tag: a short, single-line word on a tone. */
export const TAG = 'inline-flex items-center whitespace-nowrap rounded-[6px] px-2 py-[3px] text-[13px] font-semibold leading-[1.4]'

/** A tag's tones: `hi` high priority or contradicted (the caution pair), `mid`
 *  medium or untested (the track), `tint` a flag or a name (the pale yellow). */
export const TAG_TONE = {
  hi: 'bg-caution-soft text-caution',
  mid: 'bg-track text-secondary-foreground',
  tint: 'bg-accent text-accent-foreground',
} as const

/** A table with horizontal rules only, sentence-case heads, tabular numbers. */
export const TBL = 'w-full border-collapse text-[15px]'
export const TH = 'pb-2 pr-4 text-left align-bottom text-[13px] font-medium text-muted-foreground'
export const TD = 'border-t border-track py-3.5 pr-4 align-top leading-[1.5]'
export const TD_NUM = 'text-right tabular-nums'

/** A table that STACKS ON A PHONE (decision 14: the app keeps its own
 *  points where columns stack; below 640 each row is a block and the head is
 *  hidden, so the first column reads whole and the key figure stays on
 *  screen). `STACK` on the table and its tbody, `STACK_HEAD` on the thead,
 *  `STACK_ROW` on each row and `STACK_CELL` on each cell that stays; a cell
 *  only the wide table needs takes `max-sm:hidden`, its words said in the
 *  row's phone line instead. A table's `min-w` takes `sm:`. */
export const STACK = 'max-sm:block'
export const STACK_HEAD = 'max-sm:hidden'
export const STACK_ROW = 'max-sm:flex max-sm:flex-col max-sm:gap-1.5 max-sm:border-t max-sm:border-track max-sm:py-3.5'
export const STACK_CELL = 'max-sm:border-0 max-sm:p-0 max-sm:text-left'

/** The white segmented control (small call 2; the boards' period control):
 *  the group, an item, and the chosen item (combine: `cn(SEG_ITEM, SEG_ON)`).
 *  `PeriodSwitch` draws the same values; this is the client-safe copy for a
 *  client component's own switch (the Agent's window). Each item is 44px to
 *  tap on a phone. */
export const SEG = 'inline-flex max-w-full shrink-0 flex-wrap gap-1 rounded-[10px] border border-border bg-card p-1'
export const SEG_ITEM =
  'inline-flex h-9 cursor-pointer items-center whitespace-nowrap rounded-[7px] px-3.5 text-[14.5px] leading-[1.2] text-foreground no-underline transition-colors hover:bg-inner focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground max-sm:h-11'
export const SEG_ON = 'bg-accent font-semibold text-accent-foreground hover:bg-accent'

/** The dashed box a thin or empty state is said in (decision 4). */
export const EMPTY = 'rounded-[10px] border border-dashed border-control px-[18px] py-4 text-[14.5px] leading-[1.55] text-secondary-foreground'

/** Every input's field. */
export const INPUT =
  'h-10 rounded-[8px] border border-input-line bg-card px-3 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground'

/** A person's own quoted words (depth pages only): the serif, leaning. */
export const QUOTE = 'font-serif text-[16px] italic leading-[1.6]'

/** How long each bar of a list is, 0 to 100, against the list's largest row
 *  (decision 5: the largest bar is full). An empty list, or one with nothing
 *  above zero, draws every bar at 0. */
export function toMax(values: readonly number[]): (v: number) => number {
  return toMaxAtLeast(values, 0)
}

/** As `toMax`, but the scale is never shorter than `floor`: What works draws
 *  multiples against the largest one and never below 1×, so the "typical"
 *  tick (at `100 / max`) stays on the bar. */
export function toMaxAtLeast(values: readonly number[], floor: number): (v: number) => number {
  let max = Number.isFinite(floor) && floor > 0 ? floor : 0
  for (const v of values) if (Number.isFinite(v) && v > max) max = v
  return (v) => (max > 0 && Number.isFinite(v) && v > 0 ? Math.min(100, (v / max) * 100) : 0)
}
