import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// THE LEVELS' GLYPHS (F3-Market-Nav, 17 Oct), drawn exactly as the boards
// draw them, so each level says what it is before a word is read: stacked
// layers for a subject (the hub, its conversations stacked inside it), a
// speech bubble for a conversation, a calendar for the week's read, and a
// play mark for a video on a conversation's page. Plain SVG, no client code:
// the title block, the cards and the video cards all draw them.

type Glyph = { className?: string; strokeWidth?: number }

function Svg({ className, strokeWidth = 1.9, children }: Glyph & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn('shrink-0', className)}>
      {children}
    </svg>
  )
}

/** A subject: stacked layers. */
export function LayersGlyph(p: Glyph) {
  return <Svg {...p}><path d="M12 2.5 2.5 7.25 12 12l9.5-4.75z" /><path d="m2.5 16.75 9.5 4.75 9.5-4.75" /><path d="m2.5 12 9.5 4.75L21.5 12" /></Svg>
}

/** A conversation: a speech bubble. */
export function BubbleGlyph(p: Glyph) {
  return <Svg {...p}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></Svg>
}

/** The week's read: a calendar. */
export function CalendarGlyph(p: Glyph) {
  return <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>
}

/** A video: a play mark. */
export function PlayGlyph(p: Glyph) {
  return <Svg {...p}><path d="m8 6 10 6-10 6z" /></Svg>
}
