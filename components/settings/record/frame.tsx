import type { ReactNode } from 'react'

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
 * THE 25 SEP RULINGS, FOR EVERY SECTION OF THE TAB (Heinrich's default, 26
 * Sep): the header is the title alone, so the section takes no meta and no
 * note (the Phase 1 header carried both); the footer is links only; and no
 * explanatory or method line sits under a section's data. Where a method needs
 * saying, that is Settings › How to read's job.
 *
 * SINCE THE AUDIT DESIGN (7 Nov, Settings-Record.dc.html): the tile draws its
 * own head, the title a 21px heading in sentence case (it was `BlockFrame`'s
 * 13px capitals; `BlockFrame` itself is untouched, it reaches email and
 * print), the body 20px under it and its groups 24px apart, the footer links
 * in a row. Still the title alone in the header (the 25 Sep rulings).
 */
export function RecordSection({
  title, footer, id, children, className,
}: {
  title: string
  /** The tile's anchor, for a link that opens this section. */
  id?: string
  /** The footer: links only. */
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} data-record-section="" className={cn('flex min-w-0 scroll-mt-6 flex-col gap-5 rounded-[12px] bg-tile p-[30px] shadow-tile max-sm:p-[18px]', className)}>
      <header>
        <h2 className="m-0 text-[21px] font-semibold leading-[1.3]">{title}</h2>
      </header>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      {footer ? <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-track pt-4">{footer}</footer> : null}
    </section>
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
        <span className="text-[15px] font-medium leading-[1.5]">{label}</span>
        {sub ? <span className="text-[13px] text-muted-foreground">{sub}</span> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * One of the delivery block's stat cells, in a `<dl>`: its label first, then
 * a 28px figure with an optional unit beside it (the board's strip: "First
 * update on record", then "6 Apr"; the audit design's review of Phase 11),
 * on the scale of What we changed's cells (fresh design check, 26 Sep: this
 * tab set two stat cells at two scales, and these captions at 11.5px).
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
      <dt className="text-[14px] leading-[1.45] text-secondary-foreground [text-wrap:pretty]">{caption}</dt>
      <dd className="m-0 flex items-baseline gap-1.5">
        <span data-copy="figure" className="text-[28px] font-semibold leading-none tracking-[-0.01em] tabular-nums">{figure}</span>
        {unit ? <span className="text-[15px] text-muted-foreground">{unit}</span> : null}
      </dd>
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
    <span className="inline-flex items-center whitespace-nowrap rounded-[6px] bg-inner px-2.5 py-[3px] text-[13px] tabular-nums text-secondary-foreground">
      {children}
    </span>
  )
}

/** The "this month" flag beside a change: since the audit design the kit's
 *  pale-yellow tag (`TAG`, `TAG_TONE.tint`), no amber (outside palette A). */
export function MonthFlag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-[6px] bg-accent px-2 py-[3px] text-[13px] font-semibold leading-[1.4] text-accent-foreground">
      {children}
    </span>
  )
}
