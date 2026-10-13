'use client'

import { useActionState, useId, useState } from 'react'
import { tagProduct, type ProductTagState } from '@/lib/actions/product-tags'
import { cn } from '@/lib/utils'
import { BTN, BTN_INK } from './buttons'

// "Tag the product" (board E4-Products-Liners, the couldn't-tell-which list):
// a person says which of the client's products a comment (or a video as a
// whole) is about, or that it is about none of them. The control posts to
// T11's `tagProduct` (lib/actions/product-tags.ts), which checks the role and
// resolves the text against the session's tenant itself; the page draws this
// control only for an owner or an admin (and the operator), so the
// affordance and the refusal are one rule.
//
// THE STATES, each its own render (`TagControlView`, tested statically):
//   closed   the ink button "Tag the product";
//   open     the button and a small card under it: the category's products,
//            "one of yours, not sure which", the category in general, none
//            of yours (`tagOptions`, in the catalogue's order), Save, Cancel;
//   pending  the card's Save disabled while the action runs;
//   answered the action's own sentence under the button (`tagSaid`): done, kept
//            (a closed month's comment: the tag stands, the frozen counts do
//            not move), already, or why not.
// The options are computed on the server and handed in: this file imports
// nothing that reads a database.

/** One choice, as the server worked it out (`TagOption`, value and label). */
export interface TagChoiceView {
  value: string
  label: string
}

export const TAG_INITIAL: ProductTagState = { ok: false, outcome: 'unread', message: '' }

/** What the control says after an answer, and in which voice. PURE. */
export function tagSaid(state: ProductTagState | null): { tone: 'done' | 'kept' | 'already' | 'error'; message: string } | null {
  if (!state || !state.message) return null
  if (!state.ok) return { tone: 'error', message: state.message }
  if (state.outcome === 'written_closed') return { tone: 'kept', message: state.message }
  if (state.outcome === 'already') return { tone: 'already', message: state.message }
  return { tone: 'done', message: state.message }
}

const FIELD = 'h-[38px] w-full min-w-0 rounded-[8px] border border-border bg-card px-2.5 text-[13.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

export interface TagControlViewProps {
  videoId: string
  commentId: string | null
  options: readonly TagChoiceView[]
  /** The text the control tags, for its name ("Tag the product for this comment"). */
  label: string
  open: boolean
  pending?: boolean
  state?: ProductTagState | null
  onToggle?: () => void
  action?: (form: FormData) => void
}

/** The control as drawn in each state (the hooks are `TagControl`'s). */
export function TagControlView({ videoId, commentId, options, label, open, pending = false, state = null, onToggle, action }: TagControlViewProps) {
  const id = useId()
  const said = tagSaid(state)
  return (
    <div className="relative flex flex-col items-end gap-1.5" data-tag-control={open ? 'open' : 'closed'}>
      <button type="button" className={BTN_INK} aria-expanded={open} aria-controls={open ? id : undefined} onClick={onToggle}>
        Tag the product
      </button>
      {open ? (
        <form
          id={id}
          action={action}
          aria-label={`Tag the product: ${label}`}
          className="absolute top-[calc(100%+6px)] right-0 z-20 flex w-[300px] max-w-[calc(100vw-48px)] flex-col gap-3 rounded-[12px] border border-border bg-card p-3.5 text-left text-[13px] text-foreground shadow-panel"
        >
          <input type="hidden" name="videoId" value={videoId} />
          {commentId ? <input type="hidden" name="commentId" value={commentId} /> : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-muted-foreground">Which is it about?</span>
            <select name="choice" className={FIELD} defaultValue={options[0]?.value} disabled={pending}>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN} onClick={onToggle} disabled={pending}>Cancel</button>
            <button type="submit" className={BTN_INK} disabled={pending}>{pending ? 'Saving' : 'Save'}</button>
          </div>
        </form>
      ) : null}
      {said ? (
        <p role={said.tone === 'error' ? 'alert' : 'status'} data-said={said.tone} className={cn('m-0 max-w-[300px] text-right text-[12px] leading-[1.4]', said.tone === 'error' ? 'text-negative' : 'text-muted-foreground')}>
          {said.message}
        </p>
      ) : null}
    </div>
  )
}

/** The control, live: open and closed, the action's answer. */
export function TagControl({ videoId, commentId, options, label }: { videoId: string; commentId: string | null; options: readonly TagChoiceView[]; label: string }) {
  const [open, setOpen] = useState(false)
  const [state, run, pending] = useActionState(async (prev: ProductTagState, form: FormData) => {
    const out = await tagProduct(prev, form)
    if (out.ok) setOpen(false)
    return out
  }, TAG_INITIAL)
  return (
    <TagControlView
      videoId={videoId}
      commentId={commentId}
      options={options}
      label={label}
      open={open}
      pending={pending}
      state={state}
      onToggle={() => setOpen((x) => !x)}
      action={run}
    />
  )
}
