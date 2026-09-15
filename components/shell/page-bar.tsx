import Link from 'next/link'
import type { ReactNode } from 'react'
import { BarPill, PageBar } from '@/components/shell/page-grid'
import { HowSound } from '@/components/shell/how-sound'
import { hasHorizon, surface, type NavKey } from '@/lib/nav'
import { contextLine, horizonOptions, updateLine, type ContextLineInput } from '@/lib/shell/bar'
import { parseHorizon } from '@/lib/reading/horizon'

/**
 * The page bar every Phase 1 surface wears (item 42, the mock's §3.2).
 *
 * Title · the one question · the context line · the horizon · "how sound is
 * this" · Export, in that order, composed from lib/nav.ts so the label a
 * reader clicked in the sidebar and the title at the top of the page it opened
 * are the same string.
 *
 * THREE BARS, ONE COMPONENT. A reading surface (Overview, Subjects, Voice,
 * Market, Competitive) carries the month context and the horizon. This week
 * carries the two updates it compares and NO horizon — it is dated by the
 * update, and a month control on it would offer a window the page does not
 * read. Ask, Reports and Settings carry the title alone; nothing on them is a
 * reading of a period, so a horizon or a soundness counter would be furniture.
 * Which one a surface takes is `Surface.bar` — a field in the table, not a
 * judgement made per page.
 */

export interface PageBarProps {
  /** Which of the nine this is. */
  nav: NavKey
  /** The page's own URL params, verbatim — the horizon links carry them
   *  through so changing the horizon never drops the reader's selection. */
  params?: Record<string, string | undefined>
  /** The month reading's context, on a reading surface. */
  context?: ContextLineInput | null
  /** This week's two updates. */
  updates?: { update: string; previous?: string | null } | null
  /** WP7's composed record: the one line for the pill, the lines behind it. */
  record?: { line: string; lines: string[] } | null
  /** Export and anything else the page puts at the right-hand end. */
  children?: ReactNode
}

export function SurfacePageBar({ nav, params = {}, context = null, updates = null, record = null, children }: PageBarProps) {
  const s = surface(nav)
  const horizon = parseHorizon(params.horizon)
  const line = s.bar === 'week'
    ? (updates ? updateLine(updates) : null)
    : s.bar === 'reading' && context
      ? contextLine(context)
      : null

  return (
    <PageBar title={s.label} context={line ?? undefined} subtitle={s.question ?? undefined}>
      {hasHorizon(s) && <HorizonControl basePath={s.href} params={params} current={horizon} />}
      {record && <HowSound basePath={s.href} line={record.line} lines={record.lines} />}
      {children}
    </PageBar>
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
    <nav aria-label="How far back" className="flex shrink-0 items-center gap-1" data-print-hide>
      {options.map((o) => (
        <Link key={o.horizon} href={o.href} aria-current={o.active ? 'page' : undefined} className="cursor-pointer">
          <BarPill active={o.active}>{o.label}</BarPill>
        </Link>
      ))}
    </nav>
  )
}
