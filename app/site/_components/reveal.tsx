'use client'

import { useEffect, useRef, type ReactNode } from 'react'

// Adds `is-on` to its wrapper the first time it scrolls into view. The CSS in
// site.css does the animating (bars grow, tiles fade in); under reduced motion
// the same rules resolve instantly. One IntersectionObserver per wrapper,
// disconnected after it fires.
//
// ARMED, NOT HIDDEN BY DEFAULT (sw-2 item 7). The start state (tiles at 0
// opacity, bars at 0 width) used to be the base CSS, so the panels were blank
// wherever the observer never fired: without JavaScript, in a print or a
// full-page capture, and for anyone who reached them faster than the
// threshold. Now the content is drawn as it ends, and the wrapper takes
// `reveal-armed` (the start state) only where the reveal can be seen: motion
// allowed, and the panel below the fold when the page loads.
export function Reveal({ className, threshold = 0.4, children }: { className?: string; threshold?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return
    if (el.getBoundingClientRect().top < window.innerHeight) return
    el.classList.add('reveal-armed')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add('is-on')
            io.disconnect()
          }
        }
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
