import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The record page's own chrome (block E wave 2, the SettingsRecord artboard).
 *
 * THE ARTBOARD IS ONE DOCUMENT, NOT FIVE FORMS. `SettingsRecord.dc.html` draws
 * the sub-page as a single white column of hairline-divided sections —
 * `border-top:1px solid #DCDFE3`, `padding:20px 0 24px`, an uppercase 10.5px
 * eyebrow and a mono 11px meta sharing one baseline in each header — and the
 * build drew five filled `bg-inner` cards with 13px sentence-case titles over
 * 12px explanatory sentences. That is one nesting level deeper and softer, and
 * it is the reason the page has no typographic hierarchy above body size
 * anywhere below the page bar.
 *
 * So the record page gets its own section vocabulary rather than
 * `SettingsCard`. It is NOT a second settings vocabulary competing with
 * `components/settings-frame.tsx`: that file's `SettingsCard` is the idiom for
 * a FORM — a block a reader edits — and every other sub-page is forms. The
 * record is the one sub-page that edits nothing, and the artboard sets it as a
 * printed record accordingly.
 *
 * Pure presentation. Every figure, every sentence and every refusal is composed
 * in `lib/` and handed in; nothing here decides what is true.
 */

/** A hairline-divided section: eyebrow · mono meta · an optional right-hand
 *  mono note, then the body. */
export function RecordSection({
  title, meta, note, children, className,
}: {
  title: string
  /** The mono line beside the eyebrow — the section's basis or its count. */
  meta?: ReactNode
  /** The right-aligned mono note. Metadata about the section itself, which is
   *  why it is set quietly and at the far end. */
  note?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3.5 border-t border-border pt-5 pb-6', className)}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="m-0 shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{title}</h3>
        {meta ? <span className="min-w-0 font-mono text-[11px] text-muted-foreground">{meta}</span> : null}
        {note ? <span className="font-mono text-[10.5px] text-muted-foreground md:ml-auto md:shrink-0">{note}</span> : null}
      </header>
      {children}
    </section>
  )
}

/**
 * The 172px label gutter the artboard uses for "This month" and "Monthly
 * readings": a label and its sub-count on the left, the content on the right.
 * It stacks under the gutter width on a phone, where a 172px column would take
 * nearly half the screen.
 */
export function LabelRow({ label, sub, children }: { label: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-y-1.5 md:grid-cols-[172px_minmax(0,1fr)] md:gap-x-6">
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

/** The artboard's dated pill. `ghost` is drawn for a date nothing has promised
 *  — and the record page draws none, because nothing in the product records
 *  when the next gather runs. */
export function DatePill({ children, ghost = false }: { children: ReactNode; ghost?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-3 py-[5px] font-mono text-[11.5px]',
        ghost ? 'text-muted-foreground ring-1 ring-border' : 'bg-inner text-secondary-foreground',
      )}
    >
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
