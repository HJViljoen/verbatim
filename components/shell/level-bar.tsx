import type { ReactNode } from 'react'
import { hasSiblings, type Crumb } from '@/lib/pages/crumbs'
import { cn } from '@/lib/utils'
import { StatStrip, type StatItem } from '@/components/v2/ui'
import { BackLink, CrumbRow, Switcher } from './crumbs'

// THE PATH, THEN THE PAGE NAMING ITS LEVEL (F3-Market-Nav, 17 Oct; since the
// audit design, 7 Nov, the boards' title block). A level page opens with the
// slim crumb row (`CrumbRow`, the path and its switchers) and, under it, the
// title block: the 28px h1 (the page's one h1) with the page's controls at
// the right of its row, then `sub` (14.5px secondary, which may hold a link
// up), then `tags` (a row of `Tag`s), then the figures row (`StatStrip`). No
// tile and no label above the h1: the tile, the level label and the mono meta
// line went with the tidy-up (T12.1), once no page drew them.
//
// ON A PHONE: the row becomes the way back ("Market"), above the title; the
// page's own chevron rides after the title; the controls go under the block.
// Market's top page keeps its own bar (`PageBar`) and has no crumb row.

export type LevelKind = 'subject' | 'conversation' | 'week' | 'category' | 'product'

/** Another page's levels (depth as pages, 17 Oct): Content's post idea,
 *  reply list and your posts; Your moves' piece of advice, dated move and
 *  advice record; Voices' group, brand and creator. Closed, so a typo is a
 *  compile error: a page that moves over adds its own. */
export type PageLevelKind =
  | 'idea' | 'replies' | 'posts'
  | 'advice' | 'move' | 'record'
  | 'group' | 'brand' | 'creator'
  // The Agent's plan check (Agent-Thread.dc.html) and the Studio's viewer
  // and New report (Studio-Weekly / -Brief / -New).
  | 'plan' | 'report'

/** What every title block takes. */
interface LevelBarCommon {
  /** The path; its last segment is the page (its menu rides after the title
   *  on a phone). */
  crumbs: readonly Crumb[]
  /** The page's h1: the path's last segment by default. */
  title?: ReactNode
  /** The period switch, or nothing (the week's read has none). */
  controls?: ReactNode
  /** Draw the page's own switcher open (the board's open state, for the
   *  render tier and the shots). */
  open?: 'current'
}

/** The title block: the line under the h1, its tags and the figures row. */
type AuditBlock = {
  /** The level, a closed set (`data-level-bar`). */
  level: LevelKind | PageLevelKind
  /** The line under the h1 ("A group in your market"); may hold a `GoLink`. */
  sub?: ReactNode
  /** A row of `Tag`s under the line (Your moves' advice: its kind and its
   *  priority). */
  tags?: ReactNode
  /** The figures row (`StatStrip`). */
  stats?: readonly StatItem[]
  /** Its columns from 900px, where the board keeps a wider grid than its
   *  cells (`StatStrip`'s `columns`). */
  statsColumns?: number
}

export function LevelBar(props: LevelBarCommon & AuditBlock) {
  const { crumbs, level, title, controls, open, sub, tags, stats, statsColumns } = props
  const current = crumbs[crumbs.length - 1]
  const menu = current?.menu
  const named = title ?? (current?.slot ? <span data-copy="subject" data-slot={current.slot}>{current.label}</span> : current?.label)
  return (
      <header data-level-bar={level} data-level-block="audit" className="flex flex-col">
        <CrumbRow crumbs={crumbs} open={open} />
        <BackLink crumbs={crumbs} />
        {/* The title and the line under it on the left, the controls at the
            right beside both (the Voices boards' switch carries a line of
            its own under it, so it stands taller than the title). */}
        <div className={cn('mt-2.5 flex flex-wrap justify-between gap-x-5 gap-y-3 max-sm:mt-1', sub != null ? 'items-start' : 'items-center')}>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1">
              <h1 className="m-0 min-w-0 text-[28px] leading-[1.2] font-bold tracking-[-0.01em] text-foreground">{named}</h1>
              {/* On a phone the page's own chevron rides after its title;
                  from 640 it sits in the crumb row. */}
              {hasSiblings(menu) ? <span className="relative shrink-0 sm:hidden"><Switcher menu={menu} /></span> : null}
            </div>
            {sub != null ? <p data-level-sub="" className="m-0 mt-1.5 text-[14.5px] leading-[1.5] text-secondary-foreground">{sub}</p> : null}
          </div>
          {controls ? <div data-level-controls="" className="shrink-0">{controls}</div> : null}
        </div>
        {tags != null ? <div data-level-tags="" className="mt-3 flex flex-wrap items-center gap-2">{tags}</div> : null}
        {stats && stats.length > 0 ? <div className="mt-5"><StatStrip items={stats} columns={statsColumns} /></div> : null}
      </header>
  )
}
