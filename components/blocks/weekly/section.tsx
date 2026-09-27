import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import type { Block, BlockContext, RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import type { WeeklyData } from '@/lib/pages/weekly'
import type { WeeklyBlockKey } from '@/lib/reports/weekly'
import { WeeklyLink } from './email'

// The weekly's sections (market-first WP3.7): a Block over the weekly's
// reading. The sections that are the front page's blocks (the subjects, the
// board, the change block) print the page's block in the app and on paper,
// re-dressed with the section's title and footer, exactly as the monthly
// does (`components/blocks/monthly/adapt.tsx`); in an inbox each section draws
// the approved preview's email card from the same data and the same pure
// helpers, so the markup changes and never a number.

export interface WeeklyBlock extends Block<WeeklyData> {
  key: WeeklyBlockKey
}

/** A section footer's link, in the mode's own idiom: the page's link in the
 *  app, nothing on paper, the preview's underlined link in an inbox. */
export function weeklyFooter(mode: RenderMode, ctx: BlockContext, link: { href: string; label: string } | null): ReactNode {
  if (!link) return undefined
  const href = `${ctx.appUrl}${link.href}`
  if (mode === 'email') return <WeeklyLink href={href} label={link.label} />
  return openLink(mode, href, link.label)
}

/** A page block's frame with the section's title and footer (and the card in
 *  an inbox), with `extra` drawn after its body. A block that returned
 *  something other than a frame is framed rather than lost. */
export function redress(el: ReactNode, o: { title: string; mode: RenderMode; footer: ReactNode; extra?: ReactNode }): ReactNode {
  const props = { title: o.title, footer: o.footer, ...(o.mode === 'email' ? { card: true } : {}) }
  if (isValidElement(el) && el.type === BlockFrame) {
    const frame = el as ReactElement<{ children?: ReactNode }>
    return cloneElement(frame as ReactElement<Record<string, unknown>>, props, <>{frame.props.children}{o.extra}</>)
  }
  return <BlockFrame mode={o.mode} {...props} roomy>{el}{o.extra}</BlockFrame>
}
