import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import type { Block, BlockContext, RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import type { OverviewData } from '@/lib/pages/overview'
import type { MonthlyData } from '@/lib/pages/monthly'
import type { MonthlyBlockKey } from '@/lib/reports/monthly'
import { MonthlyLink } from './email'

/**
 * A monthly section: a Block over the monthly's reading, with one question
 * more than a page block answers, whether the section is ABSENT from the
 * artefact (a slot another package has not filled yet; plan WP2.1, "Depends
 * on": "the missing sections are absent rather than empty"). A section that
 * is absent is dropped by the arrangement in every mode.
 */
export interface MonthlyBlock extends Block<MonthlyData> {
  key: MonthlyBlockKey
  absent?(data: MonthlyData): boolean
}

/** A section footer's link: where it goes, and its words. */
export interface SectionLink {
  href: string
  label: string
}

/** The footer, in the mode's own idiom: the page's link in the app, nothing
 *  on paper (`openLink`), and the preview's underlined link in an inbox. */
export function sectionFooter(mode: RenderMode, ctx: BlockContext, link: SectionLink | null): ReactNode {
  if (!link) return undefined
  const href = `${ctx.appUrl}${link.href}`
  if (mode === 'email') return <MonthlyLink href={href} label={link.label} />
  return openLink(mode, href, link.label)
}

/**
 * A front page block, as a monthly section (market-first WP2.1).
 *
 * THE MONTHLY PRINTS THE FRONT PAGE'S BLOCKS, NOT COPIES OF THEM. `MonthlyData.overview`
 * IS the front page's `OverviewData`, built as "Your market" on the month
 * that has just ended, so the section is the page's block on that reading:
 * the same rows, the same figures, the same words, and `figures` /
 * `verdicts` / `quotes` / `emptyState` forwarded, so the record the send
 * writes is what the section prints.
 *
 * WHAT THE MONTHLY CHANGES IS CHROME, AND ONLY CHROME. The page's block
 * returns its `BlockFrame`; the monthly re-dresses that element (React's
 * `cloneElement`) with the section's title, the section's footer link (the
 * preview names the page the section opens, which is not always the page
 * block's own link) and, in an inbox, the section card (`BlockFrame`'s
 * `card`). The body is untouched, and the element is still a `BlockFrame`,
 * so the 25 Sep rulings' sweep reads its header and footer as it reads the
 * page's.
 *
 * AND IN AN INBOX THE BODY MAY BE THE MONTHLY'S OWN (`email`). The page's
 * email arm is a courtesy fallback for a table three feet away; the monthly's
 * email IS the document, and the preview draws its tables in full. The
 * override reads the same data and the same pure helpers and prints the same
 * figures: markup changes, never a number.
 */
export function fromFrontPage(opts: {
  key: MonthlyBlockKey
  title: string
  block: Block<OverviewData>
  link: ((data: MonthlyData) => SectionLink | null) | null
  /** The section's own body in an inbox; the page's email arm otherwise. */
  email?: (data: MonthlyData, ctx: BlockContext) => ReactNode
  /** The reading the page block is handed. Words only, never a number (a
   *  withdrawn quote's wrapper is dropped here, for one). */
  project?: (overview: OverviewData) => OverviewData
}): MonthlyBlock {
  const view = (data: MonthlyData): OverviewData => (opts.project ? opts.project(data.overview) : data.overview)
  return {
    key: opts.key,
    title: opts.title,
    ...(opts.block.question ? { question: opts.block.question } : {}),
    render(data, mode, ctx) {
      const footer = sectionFooter(mode, ctx, opts.link?.(data) ?? null)
      const empty = opts.block.emptyState(view(data))
      if (mode === 'email' && opts.email && !empty) {
        return <BlockFrame title={opts.title} mode={mode} card footer={footer}>{opts.email(data, ctx)}</BlockFrame>
      }
      return redress(opts.block.render(view(data), mode, ctx), { title: opts.title, mode, footer })
    },
    figures(data) {
      return opts.block.figures?.(view(data)) ?? {}
    },
    verdicts(data) {
      return opts.block.verdicts?.(view(data)) ?? []
    },
    quotes(data) {
      return opts.block.quotes?.(view(data)) ?? []
    },
    emptyState(data) {
      return opts.block.emptyState(view(data))
    },
  }
}

/** The page block's frame with the section's title and footer, and the card
 *  in an inbox. A block that returned something other than a frame (none of
 *  the front page's does) is framed rather than lost. */
function redress(el: ReactNode, o: { title: string; mode: RenderMode; footer: ReactNode }): ReactNode {
  const props = { title: o.title, footer: o.footer, ...(o.mode === 'email' ? { card: true } : {}) }
  if (isValidElement(el) && el.type === BlockFrame) return cloneElement(el as ReactElement<Record<string, unknown>>, props)
  return <BlockFrame mode={o.mode} {...props}>{el}</BlockFrame>
}
