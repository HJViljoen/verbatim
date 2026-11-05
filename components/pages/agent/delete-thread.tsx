'use client'

import { useActionState, useState } from 'react'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { deleteThreadAction, type DeleteThreadState } from '@/lib/actions/agent-threads'

/** What the control is called, and what the confirm says, for each kind of
 *  thread. */
export function deleteThreadWords(kind: 'question' | 'document'): { open: string; ask: string } {
  return kind === 'document'
    ? { open: 'Delete this check', ask: 'Delete this check and what it found? It goes for everyone in this workspace, and it can’t be undone. The plan it checked stays on Your moves.' }
    : { open: 'Delete this question', ask: 'Delete this question and its answers? It goes for everyone in this workspace, and it can’t be undone.' }
}

const START: DeleteThreadState = { ok: false, message: null }

/**
 * "Delete this question", at the foot of a thread (5 Nov). Drawn only for a
 * platform operator (`mayDeleteThread`, for now); the action decides again on
 * the server.
 * The confirm is the page's own, in place: the control opens a line asking
 * whether to, with Delete and Keep it, never the browser's dialog. A delete
 * lands on the Agent's page (the action redirects); a refusal or a failure is
 * said beside the buttons.
 */
export function DeleteThread({ threadId, kind }: { threadId: string; kind: 'question' | 'document' }) {
  const [asking, setAsking] = useState(false)
  const [state, action, pending] = useActionState(deleteThreadAction, START)
  const words = deleteThreadWords(kind)
  if (!asking) {
    return (
      <div data-print-hide className="flex w-full justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(true)} className="gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
          <Trash2 className="size-3.5" aria-hidden />
          {words.open}
        </Button>
      </div>
    )
  }
  return (
    <form action={action} data-print-hide role="group" aria-label={words.open} className="flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-2 rounded-lg bg-inner px-3 py-2.5">
      <input type="hidden" name="thread_id" value={threadId} />
      <p className="m-0 min-w-0 flex-1 basis-[18rem] text-[12.5px] leading-[1.45] text-foreground">{words.ask}</p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setAsking(false)}>Keep it</Button>
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>{pending ? 'Deleting…' : 'Delete'}</Button>
      </div>
      {state.message ? <p aria-live="polite" className="m-0 w-full text-right text-[11.5px] text-negative">{state.message}</p> : null}
    </form>
  )
}
