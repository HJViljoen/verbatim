'use client'

import { useEffect } from 'react'
import { panelScrollPlan, type Span } from './panel-scroll'

/**
 * The panel's one piece of client behaviour (depth v2, T9): once it is drawn
 * after the navigation that opened it, bring it into view if its head is out
 * of sight (`panelScrollPlan`). It renders nothing and runs once per panel it
 * is mounted for; a panel already on screen never moves the page.
 *
 * The visible area is the panel's scroll container (the shell's `<main>`, the
 * nearest ancestor that scrolls vertically) cut to the window, so on a phone
 * the top bar above `<main>` is never counted as space the panel shows in.
 */

function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY
    if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

export function PanelScrollIn({ target }: { target: string }) {
  useEffect(() => {
    const el = document.getElementById(target)
    if (!el || typeof el.scrollIntoView !== 'function') return
    // A frame later, so the page around the panel has its final layout.
    const frame = requestAnimationFrame(() => {
      const scroller = scrollerOf(el)
      const box = scroller?.getBoundingClientRect()
      const view: Span = {
        top: Math.max(0, box?.top ?? 0),
        bottom: Math.min(window.innerHeight, box?.bottom ?? window.innerHeight),
      }
      const r = el.getBoundingClientRect()
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      const plan = panelScrollPlan({ top: r.top, bottom: r.bottom }, view, { reducedMotion })
      if (plan) el.scrollIntoView(plan)
    })
    return () => cancelAnimationFrame(frame)
  }, [target])
  return null
}
