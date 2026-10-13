'use client'

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { buttonClass } from '@/components/pages/studio/ui'
import {
  addProduct,
  addProductAlias,
  addProductGroup,
  editProduct,
  renameProductGroup,
  retireProduct,
  retireProductAlias,
  retireProductGroup,
  type ProductFormState,
} from '@/lib/actions/products'
import type { AliasChip } from '@/lib/settings/products'
import { cn } from '@/lib/utils'

// The tab's controls (board E8-Settings-Products): "+ Add a category" under
// the list, "Rename" and "+ Add a product" on the open category, "+ Add a
// name" at the end of a product's names, and "Edit" on its row. Each opens the
// least it can in place (one field, or a small card under the button) and
// posts to its server action (lib/actions/products.ts), which checks the role
// and the tenant lock itself; the page draws these for owners and admins only.
//
// REMOVING IS RETIRING. "Remove" asks once, says what goes with it, and
// retires: the action never deletes, and what was already read keeps its
// numbers.

type Action = (prev: ProductFormState, form: FormData) => Promise<ProductFormState>

const INITIAL: ProductFormState = { ok: false, message: '' }

const FIELD = 'h-[34px] min-w-0 rounded-[10px] border border-[#E4E2DC] bg-white px-3 text-[13px] text-[#26292C] outline-none focus-visible:border-[#26292C]'
/** The board's `.btn`: on the ground, no border. */
const GROUND_BUTTON = 'inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#F7F6F2] px-3.5 text-[13.5px] font-semibold text-[#26292C] transition-colors hover:bg-[#ECEAE4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26292C]/40 disabled:opacity-50'
/** The board's `.btn.ink`. */
const INK_BUTTON = 'inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#26292C] px-3.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26292C]/40 disabled:opacity-50'
/** The board's `.addc`: a dashed chip at the end of a row of names. */
const ADD_CHIP = 'mb-1.5 mr-1.5 inline-flex items-center rounded-[6px] border border-dashed border-[#C9C6BE] bg-transparent px-2 py-[3px] text-[12.5px] text-[#5F656B] hover:border-[#26292C] hover:text-[#26292C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26292C]/40'

/** One action's state, closing what it opened on a save that landed. */
function useSave(action: Action, onSaved: () => void) {
  return useActionState(async (prev: ProductFormState, form: FormData) => {
    const out = await action(prev, form)
    if (out.ok) onSaved()
    return out
  }, INITIAL)
}

function Said({ state }: { state: ProductFormState }) {
  if (!state.message || state.ok) return null
  return <p role="status" className="m-0 text-[12px] text-orange-text">{state.message}</p>
}

/** Escape closes whatever is open. */
function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
}

/** A small card under the button that opened it, on the panel's shadow. */
function Pop({ children, align = 'right', label }: { children: ReactNode; align?: 'left' | 'right'; label: string }) {
  return (
    <div
      role="dialog"
      aria-label={label}
      className={cn(
        'absolute top-[calc(100%+6px)] z-20 flex w-[300px] max-w-[calc(100vw-48px)] flex-col gap-3 rounded-[12px] border border-[#E4E2DC] bg-white p-3.5 text-left text-[13px] font-normal text-[#26292C] shadow-panel',
        align === 'right' ? 'right-0' : 'left-0',
      )}
    >
      {children}
    </div>
  )
}

function CommonWord({ id }: { id: string }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-[12.5px] leading-[1.4] text-[#5F656B]">
      <input id={id} type="checkbox" name="common" className="mt-0.5 size-3.5 shrink-0 accent-[#26292C]" />
      <span>An everyday word as well: check each mention before it counts</span>
    </label>
  )
}

// ---- Categories ---------------------------------------------------------------------

/** "+ Add a category", under the list. */
export function AddCategory() {
  const [open, setOpen] = useState(false)
  const [state, run, pending] = useSave(addProductGroup, () => setOpen(false))
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) input.current?.focus() }, [open])
  if (!open) {
    return (
      <div className="flex flex-col gap-1.5 px-2 pt-2.5 pb-1">
        <button type="button" onClick={() => setOpen(true)} className={cn(GROUND_BUTTON, 'w-full')}>
          <Plus aria-hidden className="size-[15px]" strokeWidth={2} />Add a category
        </button>
        {state.ok && state.message ? <p role="status" className="m-0 text-[12px] text-[#5F656B]">{state.message}</p> : null}
      </div>
    )
  }
  return (
    <form action={run} className="flex flex-col gap-2 px-2 pt-2.5 pb-1">
      <label htmlFor="add-category" className="sr-only">The category&apos;s name</label>
      <input ref={input} id="add-category" name="name" required maxLength={60} placeholder="The category, as you name it" className={FIELD}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass('primary', 'small')}>{pending ? 'Saving' : 'Add'}</button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'small')}>Cancel</button>
      </div>
      <Said state={state} />
    </form>
  )
}

/** "Rename" on the open category, with its removal at the foot of the card. */
export function RenameCategory({ id, name, products }: { id: string; name: string; products: number }) {
  const [mode, setMode] = useState<'closed' | 'rename' | 'remove'>('closed')
  const close = () => setMode('closed')
  useEscape(mode !== 'closed', close)
  const [renamed, rename, renaming] = useSave(renameProductGroup, close)
  const [removed, remove, removing] = useSave(retireProductGroup, close)
  return (
    <div className="relative">
      <button type="button" aria-expanded={mode !== 'closed'} onClick={() => setMode((m) => (m === 'closed' ? 'rename' : 'closed'))} className={GROUND_BUTTON}>
        Rename
      </button>
      {mode === 'rename' ? (
        <Pop label={`Rename ${name}`}>
          <form action={rename} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={id} />
            <label htmlFor={`rename-${id}`} className="font-semibold">Rename {name}</label>
            <input id={`rename-${id}`} name="name" defaultValue={name} required maxLength={60} autoFocus className={FIELD} />
            <div className="flex gap-2">
              <button type="submit" disabled={renaming} className={buttonClass('primary', 'small')}>{renaming ? 'Saving' : 'Rename'}</button>
              <button type="button" onClick={close} className={buttonClass('ghost', 'small')}>Cancel</button>
            </div>
            <Said state={renamed} />
          </form>
          <div className="border-t border-[#E4E2DC] pt-2.5">
            <button type="button" onClick={() => setMode('remove')} className="text-[12.5px] font-semibold text-[#5F656B] underline underline-offset-2 hover:text-[#26292C]">
              Remove this category
            </button>
          </div>
        </Pop>
      ) : null}
      {mode === 'remove' ? (
        <Pop label={`Remove ${name}`}>
          <form action={remove} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={id} />
            <p className="m-0 font-semibold">Remove {name}?</p>
            <p className="m-0 text-[12.5px] leading-[1.45] text-[#5F656B]">
              {products > 0 ? 'Its products and their names leave your list from today. ' : 'It leaves your list from today. '}
              What was already read about them keeps its numbers.
            </p>
            <div className="flex gap-2">
              <button type="submit" disabled={removing} className={buttonClass('primary', 'small')}>{removing ? 'Removing' : 'Remove'}</button>
              <button type="button" onClick={close} className={buttonClass('ghost', 'small')}>Cancel</button>
            </div>
            <Said state={removed} />
          </form>
        </Pop>
      ) : null}
    </div>
  )
}

// ---- Products -----------------------------------------------------------------------

/** "+ Add a product" on the open category. */
export function AddProduct({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  useEscape(open, close)
  const [state, run, pending] = useSave(addProduct, close)
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={INK_BUTTON}>
        <Plus aria-hidden className="size-[15px]" strokeWidth={2} />Add a product
      </button>
      {open ? (
        <Pop label={`Add a product to ${groupName}`}>
          <form action={run} className="flex flex-col gap-2">
            <input type="hidden" name="group_id" value={groupId} />
            <label htmlFor={`add-product-${groupId}`} className="font-semibold">A product in {groupName}</label>
            <input id={`add-product-${groupId}`} name="name" required maxLength={80} autoFocus placeholder="Its name, as you sell it" className={FIELD} />
            <CommonWord id={`add-product-common-${groupId}`} />
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className={buttonClass('primary', 'small')}>{pending ? 'Saving' : 'Add'}</button>
              <button type="button" onClick={close} className={buttonClass('ghost', 'small')}>Cancel</button>
            </div>
            <Said state={state} />
          </form>
        </Pop>
      ) : null}
    </div>
  )
}

/** "+ Add a name": another name for a product, or a word or a range name on a
 *  category. Opens one field in place of the chip. */
export function AddName({ productId, groupId, kind, label, owner }: {
  productId?: string
  groupId?: string
  kind: 'nickname' | 'category_word'
  /** The chip's words: "Add a name", "Add a word". */
  label: string
  /** What the name is for, for the field's label. */
  owner: string
}) {
  const [open, setOpen] = useState(false)
  const [state, run, pending] = useSave(addProductAlias, () => setOpen(false))
  const key = productId ?? groupId ?? 'x'
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={ADD_CHIP}>
        + {label}
      </button>
    )
  }
  return (
    <form action={run} className="mb-1.5 flex w-full max-w-[340px] flex-col gap-2">
      {productId ? <input type="hidden" name="product_id" value={productId} /> : null}
      {groupId ? <input type="hidden" name="group_id" value={groupId} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <label htmlFor={`add-name-${key}-${kind}`} className="sr-only">{kind === 'category_word' ? `A word for ${owner}` : `Another name for ${owner}`}</label>
      <input id={`add-name-${key}-${kind}`} name="alias" required minLength={2} maxLength={80} autoFocus
        placeholder={kind === 'category_word' ? 'a word for the kind of product' : 'a nickname, a short form'} className={FIELD}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }} />
      <CommonWord id={`add-name-common-${key}-${kind}`} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass('primary', 'small')}>{pending ? 'Saving' : 'Add'}</button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'small')}>Cancel</button>
      </div>
      <Said state={state} />
    </form>
  )
}

/** One name in the Edit card, with its Remove. */
function NameRow({ alias }: { alias: AliasChip }) {
  const [state, run, pending] = useActionState(retireProductAlias, INITIAL)
  return (
    <form action={run} className="flex items-center justify-between gap-2">
      <input type="hidden" name="id" value={alias.id} />
      <span className="min-w-0 truncate font-mono text-[12.5px]">{alias.alias}</span>
      <button type="submit" disabled={pending} aria-label={`Remove the name ${alias.alias}`} className="inline-flex size-7 shrink-0 items-center justify-center rounded-[6px] text-[#5F656B] hover:bg-[#F7F6F2] hover:text-[#26292C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26292C]/40">
        <X aria-hidden className="size-3.5" strokeWidth={2} />
      </button>
      {state.message && !state.ok ? <span role="status" className="sr-only">{state.message}</span> : null}
    </form>
  )
}

/** "Edit" on a product: its name and category, its names, and its removal. */
export function EditProduct({ id, name, groupId, aliases, choices }: {
  id: string
  name: string
  groupId: string
  aliases: AliasChip[]
  choices: { id: string; name: string }[]
}) {
  const [mode, setMode] = useState<'closed' | 'edit' | 'remove'>('closed')
  const close = () => setMode('closed')
  useEscape(mode !== 'closed', close)
  const [saved, save, saving] = useSave(editProduct, close)
  const [removed, remove, removing] = useSave(retireProduct, close)
  return (
    <div className="relative justify-self-end">
      <button type="button" aria-label={`Edit ${name}`} aria-expanded={mode !== 'closed'} onClick={() => setMode((m) => (m === 'closed' ? 'edit' : 'closed'))} className={GROUND_BUTTON}>
        Edit
      </button>
      {mode === 'edit' ? (
        <Pop label={`Edit ${name}`}>
          <form action={save} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={id} />
            <label htmlFor={`product-name-${id}`} className="font-semibold">Name</label>
            <input id={`product-name-${id}`} name="name" defaultValue={name} required maxLength={80} autoFocus className={FIELD} />
            {choices.length > 1 ? (
              <>
                <label htmlFor={`product-group-${id}`} className="font-semibold">Category</label>
                <select id={`product-group-${id}`} name="group_id" defaultValue={groupId} className={FIELD}>
                  {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </>
            ) : <input type="hidden" name="group_id" value={groupId} />}
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className={buttonClass('primary', 'small')}>{saving ? 'Saving' : 'Save'}</button>
              <button type="button" onClick={close} className={buttonClass('ghost', 'small')}>Cancel</button>
            </div>
            <Said state={saved} />
          </form>
          {aliases.length > 0 ? (
            <div className="flex flex-col gap-1 border-t border-[#E4E2DC] pt-2.5">
              <p className="m-0 font-semibold">Other names people use</p>
              {aliases.map((a) => <NameRow key={a.id} alias={a} />)}
            </div>
          ) : null}
          <div className="border-t border-[#E4E2DC] pt-2.5">
            <button type="button" onClick={() => setMode('remove')} className="text-[12.5px] font-semibold text-[#5F656B] underline underline-offset-2 hover:text-[#26292C]">
              Remove this product
            </button>
          </div>
        </Pop>
      ) : null}
      {mode === 'remove' ? (
        <Pop label={`Remove ${name}`}>
          <form action={remove} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={id} />
            <p className="m-0 font-semibold">Remove {name}?</p>
            <p className="m-0 text-[12.5px] leading-[1.45] text-[#5F656B]">It and its names leave your list from today. What was already read about it keeps its numbers.</p>
            <div className="flex gap-2">
              <button type="submit" disabled={removing} className={buttonClass('primary', 'small')}>{removing ? 'Removing' : 'Remove'}</button>
              <button type="button" onClick={close} className={buttonClass('ghost', 'small')}>Cancel</button>
            </div>
            <Said state={removed} />
          </form>
        </Pop>
      ) : null}
    </div>
  )
}
