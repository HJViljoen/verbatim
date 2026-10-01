'use client'

import { useEffect } from 'react'

// The dashboard's error boundary (fresh review H2, 1 Oct evening). A page
// that throws while it loads (a read that timed out, say) used to give the
// client Next's bare 500 with no sidebar. Now the sidebar stays (this wraps the
// pages, not app/dashboard/layout.tsx above it) and the pane shows one calm
// line and Try again, which re-fetches and re-renders the page. No word about
// what failed or why: client rule 1. The error's own message never reaches a
// client in production (Next sends a digest); it is logged here for the
// browser console and on the server by Next.
//
// Drawn like the pages' first-run line: a paper card on the ground, the muted
// 15px line, the ink button (Palette A literals, as the new pages use them).

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col gap-[22px] leading-[normal] text-[#26292C]">
      <section className="flex flex-col items-start gap-4 rounded-[16px] bg-white px-7 py-6">
        <p className="m-0 text-[15px] text-[#5F656B]">This page could not be shown just now.</p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="inline-flex h-[34px] cursor-pointer items-center justify-center whitespace-nowrap rounded-[10px] border border-[#26292C] bg-[#26292C] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26292C]/30"
        >
          Try again
        </button>
      </section>
    </div>
  )
}
