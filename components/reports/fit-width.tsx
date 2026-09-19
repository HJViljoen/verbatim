'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** The scale a pane of `paneWidth` gives a `base`-wide child: never above 1,
 *  never below `min`. Pure and exported so the CSS fallback below and the
 *  measured value cannot come to disagree about what "fit" means. */
export const fitZoom = (paneWidth: number, base: number, min: number): number =>
  Math.max(min, Math.min(1, paneWidth / base))

/**
 * The same thing in CSS, resolved by the browser at first paint.
 *
 * WHY IT EXISTS (wave 3, `sales`-10). `zoom` was `null` until the effect ran,
 * and the unmeasured render used `Math.max(0.5, min)` — a guess. So a share
 * link's server HTML painted a paid document at HALF SIZE and then jumped to
 * ~0.86 at 1024 or to 1.0 at 1440, and the first impression of the artefact
 * was a layout jump. No measurement can fix that: the server does not know the
 * pane's width. The browser does, at parse time, through a container query
 * unit — `100cqw` against the wrapper, which is the pane — so the FIRST paint
 * is already the fitted one and the effect below confirms rather than corrects
 * it. `--fw-base` and `--fw-min` carry the caller's two numbers.
 *
 * A browser without length-by-length division in `calc()` drops the whole
 * declaration as invalid and paints at 1, sideways-scrolling, until the effect
 * lands — which is this component's own documented behaviour below `min`, and
 * not a document at half size.
 */
const CSS_FIT = 'max(var(--fw-min), min(1, calc(100cqw / var(--fw-base))))'

/** `useLayoutEffect` measures before the browser paints, so the hydrated tree
 *  never shows an unfitted frame; React rightly warns about it on the server,
 *  where there is no layout to read. */
const useFitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Scales a fixed-width child (a 297 mm slide = 1123 px) to the pane it sits
 *  in with CSS zoom, so the Studio preview is the print layout, smaller. */
export function FitWidth({ base, min = 0, children }: { base: number; /** Never scale below this (the pane scrolls sideways instead). */ min?: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<number | null>(null)
  useFitEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setZoom(fitZoom(el.clientWidth, base, min))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [base, min])
  return (
    <div
      ref={ref}
      className="w-full"
      // The container the `100cqw` above is a percentage OF. Inline-size only:
      // the pane's height is still its content's.
      style={{ containerType: 'inline-size', '--fw-base': `${base}px`, '--fw-min': String(min) } as React.CSSProperties}
    >
      <div style={{ zoom: zoom ?? CSS_FIT, width: base }}>{children}</div>
    </div>
  )
}
