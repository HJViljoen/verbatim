import { createLucideIcon } from 'lucide-react'

/**
 * FOUR GLYPHS DRAWN AS THE ARTBOARDS DRAW THEM (integration, 1 Oct; the lead's
 * list A). Every `Page-*.dc.html` sidebar and Agent mark is written from
 * `sidebar2.py`'s Lucide paths, an older Lucide than the one installed, and
 * four of them changed since:
 *
 *   Sparkles            the installed one has a ring at the lower left; the
 *                       artboards' a small "+" (M4 17v2 / M5 18H3)
 *   MessageSquareText   the installed one has three text lines; the artboards'
 *                       two (M13 8H7 / M17 12H7)
 *   List                the installed one's rows sit at 5/12/19; the
 *                       artboards' at 6/12/18
 *   SlidersVertical     the installed one's handles moved; the artboards' are
 *                       M2 14h4 / M10 8h4 / M18 16h4
 *
 * So these are built with Lucide's own factory from the artboards' exact
 * paths: the same component, props and output as a Lucide icon (16px, stroke
 * 2, currentColor), so every caller is unchanged but the glyph is the design's.
 * The paths are copied verbatim from `sidebar2.py`.
 */

export const Sparkles = createLucideIcon('sparkles', [
  ['path', { d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z', key: 'path0' }],
  ['path', { d: 'M20 3v4', key: 'path1' }],
  ['path', { d: 'M22 5h-4', key: 'path2' }],
  ['path', { d: 'M4 17v2', key: 'path3' }],
  ['path', { d: 'M5 18H3', key: 'path4' }],
])

export const MessageSquareText = createLucideIcon('message-square-text', [
  ['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', key: 'path0' }],
  ['path', { d: 'M13 8H7', key: 'path1' }],
  ['path', { d: 'M17 12H7', key: 'path2' }],
])

export const List = createLucideIcon('list', [
  ['path', { d: 'M3 12h.01', key: 'path0' }],
  ['path', { d: 'M3 18h.01', key: 'path1' }],
  ['path', { d: 'M3 6h.01', key: 'path2' }],
  ['path', { d: 'M8 12h13', key: 'path3' }],
  ['path', { d: 'M8 18h13', key: 'path4' }],
  ['path', { d: 'M8 6h13', key: 'path5' }],
])

export const SlidersVertical = createLucideIcon('sliders-vertical', [
  ['path', { d: 'M4 21v-7', key: 'path0' }],
  ['path', { d: 'M4 10V3', key: 'path1' }],
  ['path', { d: 'M12 21v-9', key: 'path2' }],
  ['path', { d: 'M12 8V3', key: 'path3' }],
  ['path', { d: 'M20 21v-5', key: 'path4' }],
  ['path', { d: 'M20 12V3', key: 'path5' }],
  ['path', { d: 'M2 14h4', key: 'path6' }],
  ['path', { d: 'M10 8h4', key: 'path7' }],
  ['path', { d: 'M18 16h4', key: 'path8' }],
])
