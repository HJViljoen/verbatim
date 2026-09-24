'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// The tiles are the app's own, and some carry links into /dashboard — the
// rest of a finding, the page a theme lives on. A reader of a share link has
// no account to land in, so those links go quiet here with one honest line;
// links out to the platforms (a comment, a video) still open.
//
// AND THE APP'S URL IS NOT THE PAGE'S OWN ORIGIN. The blocks build ABSOLUTE
// hrefs from `ctx.appUrl`, and the share page passes NEXT_PUBLIC_SITE_URL —
// the marketing apex, empty in .env.example — while the page itself is served
// from app.verbatimintel.com. Neither the leading-slash test nor the
// same-origin one matched, so an outside reader clicking "This week →" on a
// shared monthly or quarterly left for a host that serves no /dashboard
// instead of being told where it lives. `appUrl` is the third test, and it is
// the one the blocks actually write.
/**
 * Does this href lead back into the app, where the reader has no account?
 *
 * Pure and exported so the three tests that matter can be run without a DOM:
 * the relative href the app writes, the absolute one the blocks write off
 * `ctx.appUrl`, and the /r/ link that must stay open because it is a page a
 * reader with no account CAN read.
 */
export function leadsIntoTheApp(href: string, origin: string, appUrl?: string): boolean {
  const under = (base: string) => base.length > 0 && href.startsWith(base) && !href.startsWith(`${base}/r/`)
  if (href.startsWith('/')) return !href.startsWith('/r/')
  return under(origin) || under((appUrl ?? '').replace(/\/$/, ''))
}

export function LinkGuard({ children, appUrl }: { children: ReactNode; appUrl?: string }) {
  const [note, setNote] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return (
    <div
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest('a')
        if (!a) return
        const href = a.getAttribute('href') ?? ''
        if (!leadsIntoTheApp(href, window.location.origin, appUrl)) return
        e.preventDefault()
        e.stopPropagation()
        setNote({ x: e.clientX, y: e.clientY })
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setNote(null), 2200)
      }}
    >
      {children}
      {note && (
        <p role="status" style={{ left: Math.min(note.x, window.innerWidth - 260), top: note.y + 12 }}
          className="pointer-events-none fixed z-50 rounded-md bg-foreground px-2.5 py-1.5 text-[12px] text-tile shadow-tile-hover">
          That lives in Verbatim. Ask whoever sent this.
        </p>
      )}
    </div>
  )
}
