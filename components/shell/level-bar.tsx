import Link from 'next/link'
import { Fragment, type ReactElement, type ReactNode } from 'react'
import { hasSiblings, type Crumb } from '@/lib/pages/crumbs'
import { cn } from '@/lib/utils'
import { BackLink, CrumbRow, Switcher } from './crumbs'
import { BoxesGlyph, BoxGlyph, BubbleGlyph, CalendarGlyph, LayersGlyph } from './level-glyphs'

// THE PATH, THEN THE PAGE NAMING ITS LEVEL (F3-Market-Nav, 17 Oct). A level
// page under Market opens with the slim crumb row (`CrumbRow`, the path and
// its switchers, a hairline under it edge to edge of the column) and, under
// it, the title block: an icon tile, a small level label, the 28px title (the
// page's one h1) and the mono meta line, the page's control (the period
// switch) at the right-hand end, level with the block's foot. The tile says
// the level, so a subject and a conversation never look alike:
//   subject       stacked layers on the kit's yellow, "Subject"
//   conversation  a speech bubble on the neutral, "Conversation in {subject}"
//                 (the subject a link up), or "Conversation" where no ready
//                 subject holds it
//   week          a calendar on the yellow, "The week's read"
// Market's top page keeps its own bar (`PageBar`) and has no crumb row.
//
// ON A PHONE (F3's phone boards): the row becomes the way back ("‹ Market"),
// above the level label and the title; the page's own chevron rides after
// the title; the meta breaks into its lines (a week figure stays beside its
// month on its line); the control goes under the block.

export type LevelKind = 'subject' | 'conversation' | 'week' | 'category' | 'product'

// Your products' two levels (G4, 17 Oct): a category is three boxes on the
// kit's yellow (a hub, as a subject is), a product a single box on the
// neutral (evidence, as a conversation is). `LevelTile` draws all five.

/** A level another page names and draws its own tile for (depth as pages,
 *  17 Oct): Content's post idea, reply list and your posts. Closed, so a
 *  typo is a compile error: a page that moves over adds its own. */
export type PageLevelKind = 'idea' | 'replies' | 'posts'

/** `LevelTile`'s levels (Market's three, Your products' two) take no tile;
 *  another page's level must bring its own, so a level `LevelTile` cannot
 *  draw never reaches it. `level` is also the bar's `data-level-bar`. */
type LevelAndTile =
  | { level: LevelKind; tile?: undefined }
  | { level: PageLevelKind; tile: ReactElement }

const TILE: Record<LevelKind, string> = {
  subject: 'bg-accent text-orange-text',
  conversation: 'bg-track text-secondary-foreground',
  week: 'bg-accent text-orange-text',
  category: 'bg-accent text-orange-text',
  product: 'bg-track text-secondary-foreground',
}

const GLYPH: Record<LevelKind, typeof LayersGlyph> = {
  subject: LayersGlyph,
  conversation: BubbleGlyph,
  week: CalendarGlyph,
  category: BoxesGlyph,
  product: BoxGlyph,
}

/** The level's tile: 46px, its glyph 22px (38px and 19px on a phone). */
export function LevelTile({ level }: { level: LevelKind }) {
  const Glyph = GLYPH[level]
  return (
    <span aria-hidden data-level-tile={level} className={cn('flex size-[46px] shrink-0 items-center justify-center rounded-[11px] max-sm:size-[38px] max-sm:rounded-[10px]', TILE[level])}>
      <Glyph className="size-[22px] max-sm:size-[19px]" />
    </span>
  )
}

export function LevelBar({ crumbs, level, tile, label, title, meta, controls, open }: LevelAndTile & {
  /** The path; its last segment is the page (its menu rides after the title
   *  on a phone). */
  crumbs: readonly Crumb[]
  /** "Subject", "Conversation in {subject}", "The week's read". */
  label: ReactNode
  /** The page's h1: the path's last segment by default. */
  title?: ReactNode
  /** The mono meta line as its phone lines: each line's parts joined by
   *  " · ", the lines joined by " · " from 640 and broken on a phone. */
  meta?: ReactNode[][] | null
  /** The period switch, or nothing (the week's read has none). */
  controls?: ReactNode
  /** Draw the page's own switcher open (the board's open state, for the
   *  render tier and the shots). */
  open?: 'current'
}) {
  const current = crumbs[crumbs.length - 1]
  const menu = current?.menu
  const named = title ?? (current?.slot ? <span data-copy="subject" data-slot={current.slot}>{current.label}</span> : current?.label)
  const lines = (meta ?? []).filter((l) => l.length > 0)
  return (
    <header data-level-bar={level} className="flex flex-col">
      <CrumbRow crumbs={crumbs} open={open} />
      <BackLink crumbs={crumbs} />
      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-x-5 gap-y-3.5 max-sm:mt-1 max-sm:block">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3.5 max-sm:gap-3">
            {tile ?? <LevelTile level={level as LevelKind} />}
            <div className="min-w-0">
              <p data-level-label="" className="m-0 text-[13px] leading-[18px] font-semibold text-muted-foreground">{label}</p>
              <div className="flex min-w-0 items-center gap-1">
                <h1 className="m-0 mt-0.5 min-w-0 text-[28px] leading-[1.15] font-bold tracking-[-0.015em] text-foreground max-sm:mt-0 max-sm:text-[24px] max-sm:leading-[1.2]">{named}</h1>
                {/* On a phone the page's own chevron rides after its title;
                    from 640 it sits in the crumb row. */}
                {hasSiblings(menu) ? <span className="relative shrink-0 sm:hidden"><Switcher menu={menu} /></span> : null}
              </div>
            </div>
          </div>
          {lines.length > 0 ? (
            <p data-bar-meta="" className="m-0 mt-3 font-mono text-[12.5px] leading-[1.5] text-muted-foreground max-sm:mt-2.5 max-sm:leading-[1.55]">
              {lines.map((line, li) => (
                <span key={li} className="max-sm:block">
                  {li > 0 ? <span className="max-sm:hidden"> · </span> : null}
                  {line.map((part, pi) => <Fragment key={pi}>{pi > 0 ? ' · ' : null}{part}</Fragment>)}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        {controls ? <div data-level-controls="" className="shrink-0 max-sm:mt-3">{controls}</div> : null}
      </div>
    </header>
  )
}

/** "Conversation in {subject}", the subject a link up its page; or
 *  "Conversation" where no ready subject holds it. */
export function ConversationLabel({ parent }: { parent: Crumb | null }) {
  if (!parent?.href) return <>Conversation</>
  return (
    <>Conversation in <Link href={parent.href} className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-[3px] hover:text-foreground">{parent.label}</Link></>
  )
}
