import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { BarPill, PageBar } from '@/components/shell/page-grid'
import { hasHorizon, surface, type NavKey } from '@/lib/nav'
import {
  contextLine,
  horizonOptions,
  monthHref,
  monthLabel,
  monthTitle,
  updateLabel,
  updateLine,
  type ContextLineInput,
  type UpdateLineInput,
} from '@/lib/shell/bar'
import { parseHorizon } from '@/lib/reading/horizon'
import { cn } from '@/lib/utils'

/**
 * The page bar every Phase 1 surface wears (item 42, the mock's §3.2; the 25
 * Sep rulings, market-first WP1.2).
 *
 * Title · the brand, the month selector and ONE quiet mono line · the horizon
 * and Export at the right-hand end, composed from lib/nav.ts so the label a
 * reader clicked in the sidebar and the title at the top of the page it opened
 * are the same string. No question under the title (24 Sep), and no "How sound
 * is this" band under it (25 Sep rulings: it leaves every page).
 *
 * THREE BARS, ONE COMPONENT. A reading surface (Overview, Subjects, Voice,
 * Market, Competitive) carries the month selector, "as at the {update} update ·
 * next update {date}", and the horizon. This week is dated by the update, so
 * its slot names the update and its line names the comment window instead of
 * "as at" (25 Sep rulings, item 2), and it offers no horizon. Ask, Reports and
 * Settings carry the title alone. Which one a surface takes is `Surface.bar`, a
 * field in the table and not a judgement made per page.
 */

export interface PageBarProps {
  /** Which of the nine this is. */
  nav: NavKey
  /** The page's own URL params, verbatim — the horizon and month links carry
   *  them through so changing either never drops the reader's selection. */
  params?: Record<string, string | undefined>
  /** The reading month, on a reading surface. */
  context?: ContextLineInput | null
  /** This week's update. */
  updates?: UpdateLineInput | null
  /** The tenant's name, where the bar has no reading month to carry it (This
   *  week). */
  brand?: string | null
  /** The window the horizon pills are showing, in the artboard's own words —
   *  "4 updates · 1 Sep → 28 Sep". Printed at the end of the pill row, mono,
   *  because it is the RANGE the selected pill resolves to and a pill named
   *  "This month" says nothing about which days are in it (Block D wave 2,
   *  `main.bar.horizon.range`). Composed by the page, which is the only thing
   *  that holds both the run count and the window. */
  range?: ReactNode
  /** Export and anything else the page puts at the right-hand end. */
  children?: ReactNode
}

/** The selector's chip, and This week's update slot in the same place. */
const SELECTOR_CHIP = '-my-1 inline-flex h-8 items-center gap-1 rounded-lg bg-inner px-2 font-semibold text-foreground'
/** The bar's one quiet line, in the preview's mono. */
const LINE_MONO = 'font-mono text-[13px] leading-[1.5] text-muted-foreground'

/** The line with each of its clauses kept whole, so a phone breaks it at the
 *  " · " and never inside a date ("next update Sun 4 / Oct"). The words are
 *  the line's own. */
function LineClauses({ line }: { line: string }) {
  return (
    <span className={LINE_MONO}>
      {line.split(' · ').map((clause, i) => (
        <Fragment key={i}>{i > 0 ? ' · ' : null}<span className="whitespace-nowrap">{clause}</span></Fragment>
      ))}
    </span>
  )
}

/** "Sealand · September 2026 ▾  as at the 24 Sep update · next update Sun 27 Sep". */
export function ReadingContext({
  context, basePath, params,
}: { context: ContextLineInput; basePath: string; params: Record<string, string | undefined> }) {
  const label = monthLabel(context.reading.month)
  const title = monthTitle(context.reading)
  const other = context.other ?? null
  return (
    <>
      <span>{context.brand}</span>
      <span aria-hidden className="text-muted-foreground">·</span>
      {/* THE PREVIEW'S SELECTOR (WP1.6 design check): a 32px tinted chip, the
          chevron at 14px, set into the 24px line without growing it. The
          chevron is drawn only where the chip changes month: with no other
          month to offer (1 to 3 Oct, before October has a row, decision A)
          the chip is the month's name and its tooltip, not a control. */}
      {other ? (
        <Link
          href={monthHref(basePath, params, other)}
          title={title}
          aria-label={`${label}, ${title}. Change month to ${monthLabel(other.month)}`}
          className={cn(SELECTOR_CHIP, 'cursor-pointer hover:bg-muted')}
        >
          {label}
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-secondary-foreground" strokeWidth={2} data-print-hide />
        </Link>
      ) : (
        <span title={title} className={SELECTOR_CHIP}>{label}</span>
      )}
      <LineClauses line={contextLine(context)} />
    </>
  )
}


/** "Sealand · The 20 Sep update  comments written 10 to 20 Sep · next update Sun 27 Sep". */
export function UpdateContext({ brand, updates }: { brand?: string | null; updates: UpdateLineInput }) {
  return (
    <>
      {brand ? (
        <>
          <span>{brand}</span>
          <span aria-hidden className="text-muted-foreground">·</span>
        </>
      ) : null}
      <span className={SELECTOR_CHIP}>{updateLabel(updates.update)}</span>
      <LineClauses line={updateLine(updates)} />
    </>
  )
}

export function SurfacePageBar({ nav, params = {}, context = null, updates = null, brand = null, range = null, children }: PageBarProps) {
  const s = surface(nav)
  const horizon = parseHorizon(params.horizon)
  const line = s.bar === 'week'
    ? (updates ? <UpdateContext brand={brand ?? context?.brand ?? null} updates={updates} /> : null)
    : s.bar === 'reading' && context
      ? <ReadingContext context={context} basePath={s.href} params={params} />
      : null

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <PageBar title={s.label} line={line ?? undefined}>
        {children}
      </PageBar>
      {hasHorizon(s) && (
        <div className="flex flex-wrap items-center gap-2">
          <HorizonControl basePath={s.href} params={params} current={horizon} />
          {/* THE RANGE BESIDE THE PILLS, NOT INSIDE THEM. The artboard puts the
              horizon on its own row under the question with the window's own
              dates at the end of it; the control used to sit at the right-hand
              end of the TITLE row, beside Export, where four pills and two
              controls competed for one line. */}
          {range ? <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">{range}</span> : null}
        </div>
      )}
    </div>
  )
}

/**
 * The horizon control (decision M). Four links, not a menu: the horizon is in
 * the URL, so each option IS an address, and an address can be shared, opened
 * in a new tab and frozen into an export's params the way a menu's internal
 * state cannot.
 */
export function HorizonControl({
  basePath, params, current,
}: { basePath: string; params: Record<string, string | undefined>; current: ReturnType<typeof parseHorizon> }) {
  const options = horizonOptions(basePath, params, current)
  return (
    // IT WRAPS ON A PHONE (deploy 2 integration): four pills are about 404px
    // wide, so on a 390px screen a row that could not wrap pushed the page to
    // 428px. `min-w-0` lets the row take the width it is given.
    <nav aria-label="How far back" className="flex min-w-0 flex-wrap items-center gap-1" data-print-hide>
      {options.map((o) => (
        <Link key={o.horizon} href={o.href} aria-current={o.active ? 'page' : undefined} className="cursor-pointer">
          <BarPill active={o.active}>{o.label}</BarPill>
        </Link>
      ))}
    </nav>
  )
}
