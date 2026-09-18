'use client'

import { useState, useTransition } from 'react'
import { acceptAdvice } from '@/lib/actions/accept-advice'

// "Accept this advice" — MK5's one button that writes (Phase 1 WP14).
//
// APP ONLY, and the block that draws it decides that: an export must not render
// a control nobody can press, and a print or an email says the way exists in
// words instead.
//
// It names a LINEAGE, never a recommendation row id. Pass D-b deletes and
// reinserts every recommendation each update, so the id in this button's props
// is gone by Sunday and the lineage is not.
//
// ONE GREEN ON THE PAGE, AND THIS IS IT (MASTER rule 1, and the artboard's own
// button row). Green is for a page's primary action; the artboard spends it on
// "Confirm this month's card", which is the press that is not built, so on the
// built page the one control that actually writes is this one. It sits in its
// own slot in "How a move is made", at the artboard's 44px, and there is still
// no green button per ledger row.

export function AcceptAdviceButton({ lineageId, title }: { lineageId: string; title: string }) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  if (result?.ok) {
    return <span className="text-[12px] text-positive">{result.message}</span>
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-print-hide
        disabled={pending}
        onClick={() => start(async () => setResult(await acceptAdvice(lineageId, title)))}
        className="inline-flex h-[44px] cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-accent-foreground disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Accept this advice'}
      </button>
      {/* A FAILED WRITE LOOKS LIKE ONE. This rendered in the same muted grey as
          the explanatory notes around it, so the one message on the page that
          says "your press did not save" read as another hint. */}
      {result && !result.ok ? <span role="alert" className="text-[11.5px] font-medium text-negative">{result.message}</span> : null}
    </span>
  )
}
