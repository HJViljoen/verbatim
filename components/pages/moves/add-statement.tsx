'use client'

import { useActionState, useId } from 'react'

import { BTN_PRIMARY, INPUT, LBL } from '@/components/v2/look'
import { addStatement, type StatementActionState } from '@/lib/actions/statements'
import { STATEMENT_LABEL, STATEMENT_PLACEHOLDER } from './words'

// The add form (since the audit design, 7 Nov, Moves.dc.html): a visible
// label, the field and the yellow "Add" button, from the import-free look (a
// client file's style never comes from a page's parts). The statement is
// measured after the response; the row shows its words at once and nothing
// else until then.

const START: StatementActionState = { ok: true, message: '' }

export function AddStatement() {
  const [state, action, pending] = useActionState(addStatement, START)
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <form action={action} className="m-0 flex flex-col gap-1.5">
        <label htmlFor={id} className={LBL}>{STATEMENT_LABEL}</label>
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="text"
            name="text"
            required
            maxLength={200}
            autoComplete="off"
            placeholder={STATEMENT_PLACEHOLDER}
            disabled={pending}
            className={`${INPUT} min-w-0 flex-grow disabled:opacity-60`}
          />
          <button type="submit" disabled={pending} className={BTN_PRIMARY}>Add</button>
        </div>
      </form>
      {!state.ok && state.message ? (
        <p role="alert" className="m-0 text-[12px] text-negative">{state.message}</p>
      ) : null}
    </div>
  )
}
