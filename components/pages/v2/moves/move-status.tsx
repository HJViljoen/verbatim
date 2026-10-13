'use client'

import { useState, useTransition } from 'react'

import { setMoveStatusAction } from '@/lib/actions/subjects'
import type { MoveStatus } from '@/lib/subjects/types'
import { MOVE_STATUS_SET } from '@/lib/pages/v2/moves'

// A move's status control (depth v2, T7): `setMoveStatusAction`, mounted on
// Your moves at last (it lived only in the legacy subject block). A running
// move is marked done or stopped (stored `dropped`); a finished one runs
// again. Its line is kept
// either way: nothing here deletes. An owner's or an admin's
// (lib/moves-access.ts): the page draws it for no one else.

const LINK = 'cursor-pointer text-[12.5px] font-semibold text-foreground underline-offset-2 hover:underline disabled:cursor-default disabled:opacity-50'
const QUIET = 'cursor-pointer text-[12.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:cursor-default disabled:opacity-50'

export function MoveStatusControl({ id, status }: { id: string; status: MoveStatus }) {
  const [pending, start] = useTransition()
  const [said, setSaid] = useState<{ ok: boolean; message: string } | null>(null)
  const set = (next: MoveStatus) => start(async () => {
    const r = await setMoveStatusAction(id, next)
    setSaid(r.ok ? { ok: true, message: MOVE_STATUS_SET[next] } : r)
  })
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1" data-print-hide>
      {status === 'active' ? (
        <>
          <button type="button" disabled={pending} className={LINK} onClick={() => set('done')}>Mark done</button>
          <button type="button" disabled={pending} className={QUIET} onClick={() => set('dropped')}>Stop it</button>
        </>
      ) : (
        <button type="button" disabled={pending} className={QUIET} onClick={() => set('active')}>Track it again</button>
      )}
      {said?.message ? (
        <span role={said.ok ? 'status' : 'alert'} className={`text-[12px] ${said.ok ? 'text-muted-foreground' : 'text-negative'}`}>{said.message}</span>
      ) : null}
    </span>
  )
}
