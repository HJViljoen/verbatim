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
// Quiet chrome until it is pressed (MASTER rule 1): the primary action on this
// page is reading the ledger, not filing a decision, and a green button per row
// would be the page shouting at the client to click something.

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
        className="inline-flex h-[26px] cursor-pointer items-center rounded-full bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-accent-foreground disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Accept this advice'}
      </button>
      {result && !result.ok ? <span className="text-[11.5px] text-muted-foreground">{result.message}</span> : null}
    </span>
  )
}
