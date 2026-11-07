'use client'

import { useState, useTransition } from 'react'
import { BTN_SECONDARY, BTN_SM } from '@/components/v2/look'
import { confirmSubjectAction } from '@/lib/actions/subjects'
import { cn } from '@/lib/utils'

/** "Confirm" on a suggestion: the write that starts the counting (decision E),
 *  the same action the row's menu offers, drawn where the reader looks first.
 *  A refusal (the ceiling, a member, a stopped subject) is said beside it;
 *  under the tenant lock it is drawn disabled (decision 7). */
export function ConfirmSubject({ id, name, locked = false }: { id: string; name: string; locked?: boolean }) {
  const [said, setSaid] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const confirm = () => start(async () => {
    const result = await confirmSubjectAction(id)
    setSaid(result.ok ? null : result.message)
  })
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" disabled={pending || locked} onClick={confirm} aria-label={`Confirm ${name}`} className={cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>
        {pending ? 'Confirming' : 'Confirm'}
      </button>
      {said ? <span role="status" className="max-w-[260px] text-right text-[13px] leading-[1.45] text-caution">{said}</span> : null}
    </span>
  )
}
