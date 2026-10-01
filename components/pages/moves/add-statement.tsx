'use client'

import { useActionState } from 'react'
import { Plus } from 'lucide-react'

import { addStatement, type StatementActionState } from '@/lib/actions/statements'
import { BTN_PRIMARY } from './parts'
import { STATEMENT_LABEL, STATEMENT_PLACEHOLDER } from './words'

// The add form under the block's lead (the artboard): one 44px field with an
// ink border, and the ink "Add" button. The statement is measured after the
// response; the row shows its words at once and nothing else until then.

const START: StatementActionState = { ok: true, message: '' }

export function AddStatement() {
  const [state, action, pending] = useActionState(addStatement, START)
  return (
    <div className="flex flex-col gap-1.5">
      <form action={action} className="m-0 flex items-center gap-[10px]">
        <label className="flex min-w-0 flex-grow">
          <span className="sr-only">{STATEMENT_LABEL}</span>
          <input
            type="text"
            name="text"
            required
            maxLength={200}
            autoComplete="off"
            placeholder={STATEMENT_PLACEHOLDER}
            disabled={pending}
            className="h-11 min-w-0 flex-grow rounded-[10px] border-[1.5px] border-[#26292C] bg-white px-4 text-[15px] text-[#26292C] outline-none placeholder:text-[#5F656B] focus-visible:ring-2 focus-visible:ring-[#26292C]/20 disabled:opacity-60"
          />
        </label>
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          <Plus className="size-4" aria-hidden />
          Add
        </button>
      </form>
      {!state.ok && state.message ? (
        <p role="alert" className="m-0 text-[12px] text-negative">{state.message}</p>
      ) : null}
    </div>
  )
}
