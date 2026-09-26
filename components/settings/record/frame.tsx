import type { ReactNode } from 'react'

import { BlockFrame } from '@/components/blocks/frame'
import { cn } from '@/lib/utils'

/**
 * The record page's own chrome (block E wave 2, the SettingsRecord artboard;
 * tiles since market-first WP1.6).
 *
 * The Phase 1 artboard drew the sub-page as one white column of hairline-
 * divided sections; the approved market-first preview (25 Sep) draws each
 * section as its own tile, and that is what `RecordSection` now draws. It is
 * still not `SettingsCard`: that file's card is the idiom for a FORM, a block
 * a reader edits, and the record edits nothing.
 *
 * Pure presentation. Every figure, every sentence and every refusal is composed
 * in `lib/` and handed in; nothing here decides what is true.
 */

/**
 * A section of the record, as a TILE (market-first WP1.6; Heinrich's default,
 * 26 Sep, from the approved preview's Settings › What we changed). The
 * preview sets every section as its own white tile on the page's ground,
 * lifted by the tile shadow, with a 32px inset, the title at 13px in capitals
 * and 24px between the title and the body and between the body's groups: the
 * same frame as Your market's blocks (`BlockFrame`'s `roomy`), which this
 * draws, so the two pages cannot drift apart. It replaces the hairline-divided
 * document the Phase 1 artboard drew.
 *
 * `meta` and `note` are the Phase 1 header's two notes; the 25 Sep rulings
 * take them off every section (below, in the same package).
 */
export function RecordSection({
  title, meta, note, footer, id, children, className,
}: {
  title: string
  /** The tile's anchor, for a link that opens this section. */
  id?: string
  /** The mono line beside the eyebrow — the section's basis or its count. */
  meta?: ReactNode
  /** The right-aligned mono note. */
  note?: ReactNode
  /** The footer: links only (25 Sep rulings). */
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div id={id} data-record-section="" className={cn('min-w-0 scroll-mt-6 rounded-lg bg-tile shadow-tile', className)}>
      <BlockFrame title={title} mode="app" roomy meta={meta} footerNote={note} footer={footer}>
        {children}
      </BlockFrame>
    </div>
  )
}

/**
 * The 172px label gutter the artboard uses for "This month" and "Monthly
 * readings": a label and its sub-count on the left, the content on the right.
 * It stacks under the gutter width, where a 172px column would take nearly
 * half of what is left.
 *
 * THE GUTTER OPENS AT `lg`, NOT `md` (Block D wave 3, RC2). `md` is exactly
 * where BOTH 224px rails arrive — the app's (`components/ui/sidebar.tsx`) and
 * SettingsFrame's own — so at a 768px viewport the content pane is 240px and
 * the row was splitting it 172 │ 24 │ 44. The September date pills stacked one
 * per line in a 44px column beside a 172px label. Measured pane / content
 * column: 768 → 240/44, 820 → 292/96, 900 → 372/176, 1024 → 496/300. The
 * change log (`change-log.tsx`) and the coverage grid (`coverage.tsx`) in this
 * same package already moved to `lg` for precisely this reason.
 */
export function LabelRow({ label, sub, children }: { label: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-y-1.5 lg:grid-cols-[172px_minmax(0,1fr)] lg:gap-x-6">
      <div className="flex flex-col gap-px pt-px">
        <span className="text-[12.5px] font-medium">{label}</span>
        {sub ? <span className="font-mono text-[10.5px] text-muted-foreground">{sub}</span> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * One of the delivery block's stat cells: a 24px mono figure, an optional unit
 * beside it, a caption under it.
 *
 * NOT `FigureCell` (components/blocks/frame.tsx). That primitive is the
 * artboards' TABLE cell — a 13px figure over a mono "of N" — and it stamps
 * `data-copy="level"` on the pair, which is right for a share and wrong here:
 * "6 Apr" and "27 Sep" are dates, "23 updates" is a count of everything there
 * is, and none of the four is a share of anything. A level marker on a date
 * would make the copy contract demand a denominator that does not exist.
 */
export function StatCell({ figure, unit, caption }: { figure: ReactNode; unit?: ReactNode; caption: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-baseline gap-1.5">
        <span data-copy="figure" className="font-mono text-[24px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{figure}</span>
        {unit ? <span className="text-[12px] font-medium text-muted-foreground">{unit}</span> : null}
      </span>
      <span className="text-[11.5px] text-muted-foreground">{caption}</span>
    </div>
  )
}

/**
 * The artboard's dated pill.
 *
 * ONE VARIANT, BECAUSE THERE IS ONE KIND OF DATE (Block D wave 3, RC11). It
 * carried a `ghost` prop for the artboard's "next 4 Oct" pill — a date nothing
 * has promised — and dropping that pill was correct, because nothing in the
 * product records when the next gather runs. The prop and its `ring-1
 * ring-border` branch had no caller and could not get one without the page
 * first learning something it does not know. A variant kept for a feature we
 * refused is a claim that the refusal is temporary; if the schedule ever
 * becomes a thing the product holds, this comes back with the caller that
 * needs it.
 */
export function DatePill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-inner px-3 py-[5px] font-mono text-[11.5px] text-secondary-foreground">
      {children}
    </span>
  )
}

/** The amber "this month" flag beside a change. The one saturated colour on the
 *  page, and it is the theme's `--warning`, which is the artboard's own
 *  `rgba(230,176,60,.2)`. */
export function MonthFlag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-full bg-warning/20 px-2 py-px text-[10.5px] font-semibold text-foreground">
      {children}
    </span>
  )
}

/**
 * The page's footer row: the rule about what the record IS, and whatever
 * control sits beside it.
 *
 * The artboard's control is "Export the record". The page has none, and the
 * reason is structural rather than an oversight — see `ScopeStatement` below.
 */
export function RecordFooter({ children, rule }: { children?: ReactNode; rule: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 border-t border-border pt-5 md:flex-row md:items-center">
      {children}
      <p className="m-0 min-w-0 flex-1 text-[12.5px] text-muted-foreground">{rule}</p>
    </div>
  )
}
