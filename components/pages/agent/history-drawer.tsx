'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronUp } from 'lucide-react'
import { shortDate } from '@/lib/format'
import type { AskHistory } from '@/lib/pages/agent-thread'

// Earlier questions, as a sheet at the bottom of the Agent page (Heinrich,
// 1 Oct: "the chat history at the bottom with the thing you can click on so it
// comes up"). The 22 Aug page parked it off the bottom edge with a grab bar
// (bafd0357, 759ce1a3); the 18 Sep port turned it into a list under the box.
// It is back at the bottom: a handle, centred under the pill, that raises the
// list and lowers it again.
//
// A DRAWER, NOT A MODAL: no scroll lock, no dimmed page. Opening it moves
// focus to the newest question; Escape closes it and gives focus back to the
// handle; a press outside it, or tabbing out of it, closes it. While it is down
// the list is `inert`, so nothing below the edge can be tabbed into or read.
//
// Drawn only once there is a question (rule 2), as the list it replaces was.

export function HistoryDrawer({ history, defaultOpen = false }: {
  history: AskHistory | null
  /** Drawn raised. The shots harness's, which renders without a click. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const sheetRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLButtonElement>(null)
  // Focus moves into the list only when the READER raised it, never on mount.
  const raised = useRef(false)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
      handleRef.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!sheetRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  useEffect(() => {
    if (!open || !raised.current) return
    raised.current = false
    sheetRef.current?.querySelector<HTMLElement>('[data-history-row]')?.focus({ preventScroll: true })
  }, [open])

  if (!history || history.rows.length === 0) return null

  return (
    // Sticks to the bottom of the pane, flush with its edge: the negative
    // margins and offset cancel <main>'s own padding (24px on a phone, 40px
    // under it from md; a sticky box is held inside its scroller's padding),
    // so the handle reads as the top of something below the screen.
    <div className="pointer-events-none sticky -bottom-6 z-30 -mx-6 -mb-6 h-[58px] shrink-0 md:-bottom-10 md:mx-0 md:-mb-10">
      {/* A light veil over the page while the sheet is up, so the list reads
          as the layer in front; a press on it closes the sheet. It reaches the
          pane's edges and is clipped by <main>, never over the sidebar. */}
      <div
        aria-hidden
        className={`absolute inset-x-0 bottom-0 h-dvh bg-foreground/[0.07] transition-opacity duration-300 motion-reduce:transition-none md:-inset-x-10 ${open ? 'pointer-events-auto opacity-100' : 'opacity-0'}`}
      />
      <div
        ref={sheetRef}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null
          if (open && next && !e.currentTarget.contains(next)) setOpen(false)
        }}
        className="pointer-events-auto absolute inset-x-0 bottom-0 mx-auto flex max-w-[840px] flex-col rounded-t-[24px] bg-tile shadow-[0_-1px_2px_rgba(0,0,0,0.04),0_-6px_24px_rgba(0,0,0,0.07)]"
      >
        <button
          ref={handleRef}
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            raised.current = !open
            setOpen((v) => !v)
          }}
          className="group flex h-[58px] w-full shrink-0 flex-col items-center justify-center gap-[7px] rounded-t-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="h-1 w-9 rounded-full bg-border transition-colors group-hover:bg-muted-foreground/50" aria-hidden />
          <span className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
            Earlier questions
            <ChevronUp
              className={`size-4 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </span>
        </button>

        {/* The list rises with the sheet: its row of the grid grows from 0fr
            to 1fr, so the sheet is as tall as what it holds, up to a ceiling. */}
        <div
          id={listId}
          inert={!open}
          className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="min-h-0 overflow-hidden">
            <ul className="m-0 flex max-h-[min(56dvh,520px)] list-none flex-col overflow-y-auto border-t border-border px-3 pt-1 pb-4 md:px-4">
              {history.rows.map((r, i) => (
                <li key={r.threadId} className={i > 0 ? 'border-t border-border' : undefined}>
                  <Link
                    href={`/dashboard/agent/${r.threadId}`}
                    data-history-row=""
                    className="-mx-1 flex items-baseline justify-between gap-4 rounded-[12px] px-4 py-3 text-[15px] text-foreground no-underline transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {/* The thread's title is model prose (`ask_extract_title`). */}
                    <span data-copy="subject" data-slot="ask_extract_title" className="min-w-0 font-semibold">{r.title}</span>
                    <span data-copy="figure" className="shrink-0 text-[13px] text-muted-foreground">{shortDate(r.askedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
