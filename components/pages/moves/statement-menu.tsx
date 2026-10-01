'use client'

import { useState, useTransition } from 'react'
import { Ellipsis } from 'lucide-react'

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { editStatement, removeStatement } from '@/lib/actions/statements'
import { BTN_PRIMARY_SMALL, BTN_SECONDARY_SMALL } from './parts'
import { STATEMENT_MENU_LABEL } from './words'

// The row's "Edit or remove this statement" control (the artboard's 32px
// ghost button). Edit opens a sheet with the words; saving retires the old
// statement and adds the new one, which is measured again. Remove retires it.
// Owners and admins only: the block draws no menu for anyone else.

export function StatementMenu({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(text)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const remove = () => start(async () => {
    const r = await removeStatement(id)
    setError(r.ok ? null : r.message)
  })
  const save = () => start(async () => {
    const r = await editStatement(id, draft)
    if (r.ok) { setOpen(false); setError(null) } else setError(r.message)
  })

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger
          data-print-hide
          aria-label={STATEMENT_MENU_LABEL}
          title={error ?? undefined}
          disabled={pending}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[8px] border-none bg-transparent text-[#5F656B] hover:bg-[#F7F6F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26292C]/30 disabled:opacity-60"
        >
          <Ellipsis className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          <DropdownMenuItem onSelect={() => { setDraft(text); setError(null); setOpen(true) }} className="text-[13px]">Edit</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={remove} className="text-[13px]">Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && !open ? <p role="alert" className="absolute top-9 right-0 m-0 w-[180px] text-right text-[11.5px] leading-[1.4] text-negative">{error}</p> : null}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 bg-white p-0 data-[side=right]:sm:max-w-[28rem]">
          <SheetHeader className="border-b border-[#E4E2DC] px-5 py-4 pr-12">
            <SheetTitle className="text-[15px] font-semibold">Edit statement</SheetTitle>
            <SheetDescription className="text-[12.5px] leading-[1.5]">Change the words of this statement.</SheetDescription>
          </SheetHeader>
          <form
            className="flex flex-col gap-3 px-5 py-4"
            onSubmit={(e) => { e.preventDefault(); save() }}
          >
            <textarea
              name="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={200}
              rows={3}
              disabled={pending}
              className="w-full resize-none rounded-[10px] border-[1.5px] border-[#26292C] bg-white px-4 py-3 text-[15px] text-[#26292C] outline-none disabled:opacity-60"
            />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={pending} className={BTN_PRIMARY_SMALL}>{pending ? 'Saving…' : 'Save'}</button>
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className={BTN_SECONDARY_SMALL}>Cancel</button>
              {error ? <span role="alert" className="text-[12px] text-negative">{error}</span> : null}
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
