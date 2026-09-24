'use client'

import { useEffect, useRef } from 'react'
import { closeDrawer } from '@/components/shell/drawer-link'

/**
 * Focus, for the two drawers this app opens without a router round trip
 * (Block D wave 3, SH20).
 *
 * `HowToRead` and `HowSound` are `role="dialog" aria-modal="true"`, and an
 * aria-modal dialog makes three promises a screen reader acts on: it has a
 * name, focus moves into it, and focus cannot leave it while it is open.
 * Neither kept any of them. They open by `pushState`, so nothing about the
 * page changes except a query parameter — focus stayed wherever it was, Tab
 * walked straight out of the card and into the page behind it, and Escape did
 * nothing, on an overlay whose only other exit is a mouse click on a ✕.
 *
 * THE NAME IS THE CALLER'S JOB, not this hook's: each drawer already draws an
 * `<h2>` saying what it is, so it points `aria-labelledby` at that rather than
 * repeating the string in an attribute where the two can drift.
 *
 * Returns the ref to put on the dialog's own element. It is a no-op while
 * closed, and it restores focus to whatever had it when the drawer opened —
 * which, since the trigger does NOT unmount here, is the trigger.
 */
export function useDialogFocus(open: boolean, closeHref: string) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const el = ref.current
    if (!el) return
    const restore = document.activeElement as HTMLElement | null
    const reachable = (): HTMLElement[] =>
      Array.from(el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((n) => n.offsetParent !== null || n === document.activeElement)
    // The first reachable control, which on both drawers is the overlay's own
    // close link — so Enter closes and a screen reader reads the card's name
    // and then its way out.
    ;(reachable()[0] ?? el).focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDrawer(closeHref)
        return
      }
      if (e.key !== 'Tab') return
      const items = reachable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const inside = active instanceof Node && el.contains(active)
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      restore?.focus?.()
    }
  }, [open, closeHref])
  return ref
}
