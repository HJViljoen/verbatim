'use client'

import { useState } from 'react'
import { deleteReport } from '@/app/dashboard/studio/actions'
import { BTN_SECONDARY, BTN_SM } from '@/components/v2/look'
import { cn } from '@/lib/utils'

/** Two clicks, no browser dialog: the first arms, the second deletes. Since
 *  the audit design (Studio.dc.html) "Delete" is the small white button. */
export function DeleteReport({ id }: { id: string }) {
  const [armed, setArmed] = useState(false)
  return (
    <form action={deleteReport} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {armed ? (
        <>
          <button type="submit" className={cn(BTN_SECONDARY, BTN_SM, 'border-negative text-negative max-sm:h-11')}>Delete this report</button>
          <button type="button" onClick={() => setArmed(false)} className={cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>Keep it</button>
        </>
      ) : (
        <button type="button" onClick={() => setArmed(true)} className={cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>Delete</button>
      )}
    </form>
  )
}
