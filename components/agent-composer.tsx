'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MessageSquare, Paperclip, Search } from 'lucide-react'

// The ask box. Client state because an answer takes tens of seconds and a form
// post that just hangs reads as broken.
//
// THE MOCK'S SHAPE, NOT THE STAGE'S (Block D wave 2, E-ask). This was a 56px
// rounded-full pill in a centred `max-w-2xl` column, with a paperclip hidden
// inside its left edge and a 40px circular arrow on its right — an ask box that
// looked like a search field on a landing page. The artboard draws a control
// INSIDE a tile: a 44px `--inner` block at radius 4 with a search glyph, a
// labelled "Check a plan" secondary button beside it, and a labelled green
// "Ask" pill. Three changes, and each of them is a word where there was a
// glyph:
//
//   · the attach control says "Check a plan" instead of being a paperclip with
//     a `title` — and it is present in BOTH composers, where before it was
//     suppressed inside a thread. Checking a plan from a follow-up is the same
//     action as checking one from the box.
//   · the submit says "Ask".
//   · the placeholder names the four things that can be asked about rather
//     than "your customers", which is only one of them.
//
// No instructions around it. A hint is useful for about a week and then it is
// furniture — the shape of the control says "type here and press Ask" without
// being told.
//
// `canSend` is computed on the SERVER and passed in. When it is false the box
// is visible and disabled rather than hidden: a reader should be able to see
// what this page is and that answers live here. That one line stays, because
// it explains a STATE rather than teaching a mechanism — and since decision B
// the state is "not yours", not "not built": every answer on this page is
// readable by the member looking at the disabled box.

export function AgentComposer({
  canSend,
  threadId,
  placeholder = 'Ask about a subject, a rival, a claim or a plan',
  disabledNote = 'Only an owner or admin can ask here',
  ask,
}: {
  canSend: boolean
  threadId?: string
  placeholder?: string
  /** What the box says while it is disabled. The default is the role gate,
   *  which is the usual reason; a page that disables it for a different reason
   *  passes its own, because "only an owner or admin can ask here" shown to an
   *  owner is a wrong answer to a question they did not ask. */
  disabledNote?: string
  /** A question the box opens with, so a page that sends a reader here can
   *  send WHAT they were reading with them. The reader owns it from the first
   *  keystroke: it is the initial value of the box, never a controlled one. */
  ask?: string
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [question, setQuestion] = useState(ask ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  // A live count, not a promise. The old copy said "an answer takes about half
  // a minute" whether or not it did; this says what is actually happening, and
  // it disappears the moment there is an answer — so it is state, not a hint
  // that outstays its usefulness.
  useEffect(() => {
    if (!busy) return
    setElapsed(0)
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250)
    return () => clearInterval(id)
  }, [busy])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (q.length < 8) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q, threadId }),
      })
      const data = (await res.json()) as { threadId?: string; error?: string }
      if (!res.ok || !data.threadId) {
        setError(data.error ?? 'That did not work. Try again shortly.')
        return
      }
      setQuestion('')
      if (threadId) router.refresh()
      else router.push(`/dashboard/agent/${data.threadId}`)
    } catch {
      setError('That did not work. Try again shortly.')
    } finally {
      setBusy(false)
    }
  }

  // A document goes to the SAME endpoint, as multipart. The route branches on
  // content type and hands it to the Ask engine that already ships — the agent
  // gains a second face, not a second engine.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch('/api/agent', { method: 'POST', body: form })
      const data = (await res.json()) as { threadId?: string; error?: string }
      if (!res.ok || !data.threadId) {
        setError(data.error ?? 'That document could not be checked.')
        return
      }
      router.push(`/dashboard/agent/${data.threadId}`)
    } catch {
      setError('That document could not be checked.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const ready = canSend && !busy && question.trim().length >= 8
  const live = canSend && !busy

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <form onSubmit={onSubmit} className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[4px] bg-inner px-3.5">
          {/* The glyph the artboard puts inside the block: a search mark on the
              box, a speech mark on the follow-up — the one thing that
              distinguishes the two controls at a glance. */}
          {threadId
            ? <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            : <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={busy || !canSend}
            placeholder={canSend ? placeholder : disabledNote}
            aria-label="Ask about a subject, a rival, a claim or a plan"
            className="h-full w-full min-w-0 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
          />
        </div>

        {/* LABELLED, AND IN BOTH COMPOSERS. A paperclip with a `title` is a
            control only a reader who hovers it knows about, and inside a thread
            there was no control at all. */}
        <label
          className={`inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-[6px] bg-tile px-3.5 text-[12px] font-medium text-secondary-foreground ring-1 ring-border transition-colors hover:bg-inner ${live ? '' : 'pointer-events-none opacity-40'}`}
        >
          <Paperclip className="size-4" aria-hidden />
          <span>Check a plan</span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={onFile}
            disabled={busy || !canSend}
            className="sr-only"
          />
        </label>

        <button
          type="submit"
          disabled={!ready}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[6px] bg-primary px-5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Ask
        </button>
      </form>

      {busy && (
        <p className="font-mono text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
          Reading the conversation · {elapsed}s
        </p>
      )}

      {error && <p className="text-[12px] text-negative">{error}</p>}
    </div>
  )
}
