'use client'

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react'

// THE WEEK CHARTS' TOOLTIP, ONE BEHAVIOUR FOR ALL THREE (Heinrich, 5 Oct: "make
// it so the numbers show when I hover over the bar in the graph? Because
// currently there's no numbers, it's just like a shape"). The Dashboard's
// "Week by week", Your market's and This week's weekly bars each put a button
// over every week they draw, and a week's numbers show:
//   - while a mouse is over its bar (or its comments point, which sits in the
//     same column);
//   - while its button has keyboard focus;
//   - from a tap on a phone (touch or pen), until a second tap on it, a tap
//     anywhere outside the chart, or Escape.
// Escape also hides what a hover or focus showed. Nothing here computes: the
// caller draws the bars and hands each button the facts it drew.

/**
 * The tooltip's card: the weekly bars' hover card (Your market's), on the
 * tile with its own soft edge. The caller adds its width, padding and place.
 */
export const WEEK_TIP_CARD =
  'pointer-events-none absolute z-10 rounded-[6px] bg-tile text-[13px] leading-[18px] text-secondary-foreground shadow-[0_0_0_1px_rgba(38,41,44,.05),0_2px_6px_rgba(38,41,44,.07),0_0_24px_rgba(38,41,44,.13)]'

/** Is this focus one a keyboard gave (the browser would draw its ring)? A
 *  tap or a click focuses a button too, and that must not open the week. */
function keyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

/**
 * The state of one chart's tooltip. `open` is the week shown before anything
 * is hovered, focused or tapped (a static render; null on the pages). Returns
 * the week shown (or null), the ref for the chart's box (a tap outside it
 * closes a tapped week), and the handlers for week `i`'s button.
 */
export function useWeekTip(open: number | null = null) {
  const [active, setActive] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(open)
  const pointer = useRef<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pinned == null) return
    const outside = (e: globalThis.PointerEvent) => {
      if (box.current && e.target instanceof Node && !box.current.contains(e.target)) setPinned(null)
    }
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(null)
        setActive(null)
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [pinned])

  const target = (i: number) => ({
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') setActive(i)
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') setActive((a) => (a === i ? null : a))
    },
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      pointer.current = e.pointerType
    },
    // A tap pins the week and a second tap on it lets it go. A mouse shows it
    // on hover already, and Enter or Space on a focused button (no pointer)
    // shows it through the focus.
    onClick: () => {
      const kind = pointer.current
      pointer.current = null
      if (kind === 'touch' || kind === 'pen') setPinned((p) => (p === i ? null : i))
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (keyboardFocus(e.currentTarget)) setActive(i)
    },
    onBlur: () => setActive((a) => (a === i ? null : a)),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Escape') {
        setActive(null)
        setPinned(null)
      }
    },
  })

  return { shown: active ?? pinned, box, target }
}
