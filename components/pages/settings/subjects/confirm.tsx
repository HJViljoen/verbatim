'use client'

import { useState, useTransition } from 'react'
import { buttonClass } from '@/components/pages/studio/ui'
import { confirmSubjectAction } from '@/lib/actions/subjects'

/** "Confirm" on a suggestion: the write that starts the counting (decision E),
 *  the same action the row's menu offers, drawn where the reader looks first.
 *  A refusal (the ceiling, a member, a stopped subject) is said beside it. */
export function ConfirmSubject({ id, name }: { id: string; name: string }) {
  const [said, setSaid] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const confirm = () => start(async () => {
    const result = await confirmSubjectAction(id)
    setSaid(result.ok ? null : result.message)
  })
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={confirm} aria-label={`Confirm ${name}`} className={buttonClass('secondary', 'small')}>
        {pending ? 'Confirming' : 'Confirm'}
      </button>
      {said ? <span role="status" className="max-w-[260px] text-right text-[12px] text-orange-text">{said}</span> : null}
    </span>
  )
}
