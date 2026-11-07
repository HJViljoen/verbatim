'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, SEG, SEG_ITEM, SEG_ON } from '@/components/v2/look'
import { ASK_WINDOW_WORDS, type AskWindowChoice } from '@/lib/agent/scope'

// The ask box. Since the audit design (7 Nov, Agent.dc.html): a labelled
// field ("Your question", visible; a thread's follow-up keeps its name as
// `aria-label`), the yellow "Ask" beside it, outside the field, and under
// them, on a hairline, "Check a plan" as a secondary button with its limit,
// the window as the white segmented control and the month's allowance in
// tabular sans. It was a pill with the arrow inside it from 1 Oct (Heinrich:
// "a few versions back the AI chat had a pill in the centre"); what the
// rebuild added around it, the plan, the window and the allowance, stays.
//
// ONE CONTROL, BOTH ROUTES. The Agent page draws it in its tile
// (`size="large"`, with the window and the allowance); a thread draws the
// same box a size down for a follow-up and for a new question. The requests
// are the ones the box has always made: a question posts JSON to /api/agent
// and opens (or refreshes) its thread; a plan posts the PDF as multipart to
// the same endpoint, which branches on content type.
//
// `canSend` is computed on the SERVER and passed in. When it is false the box
// is drawn and disabled, with the reason as its placeholder: a reader should
// see what this page is and that answers live here, and "only an owner or
// admin can ask here" explains a STATE rather than teaching a mechanism.
//
// Its styles come from the kit's import-free `look.ts` (the client-bundle
// guard, lib/test/client-chains.test.ts).

/** The shortest string the endpoint will treat as a question. */
const MIN_QUESTION = 8

/** The rule, said rather than enforced in silence: next to the field as the
 *  reader types, and again if they press Ask anyway. */
const TOO_SHORT = 'A question needs a few more words before we can answer it.'
const FAILED = 'That did not work. Try again shortly.'
const PLAN_FAILED = 'That document could not be checked.'

/** How tall the field grows before it scrolls inside itself. */
const MAX_FIELD_PX = 220

const SIZES = {
  // The Agent page: the box in its tile (Agent.dc.html: a field two lines
  // tall, its own height growing with the question, and a 56px Ask).
  large: {
    gap: 'gap-[18px]',
    field: 'min-h-[78px] py-[14px] text-[16px] leading-[1.5]',
    send: 'h-14 px-[22px] text-[15px]',
  },
  // A thread: the same box, a size down, under the answer it follows.
  regular: {
    gap: 'gap-3',
    field: 'min-h-12 py-[11px] text-[15px] leading-[1.5]',
    send: 'h-12 px-5',
  },
} as const

/**
 * One line until there is more to say; a long question (or one another page
 * sent) stays readable instead of scrolling sideways out of a one-line field. An empty field is sized on its
 * placeholder, so a reason or a prompt that wraps on a phone is read whole
 * rather than cut at its first line.
 *
 * CSS does it where it can (`field-sizing: content`, which also sizes the
 * server's first paint); this measures for a browser that cannot.
 */
function fitField(el: HTMLTextAreaElement | null) {
  if (!el || (typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content'))) return
  const empty = el.value === ''
  if (empty) el.value = el.placeholder
  el.style.height = 'auto'
  const h = Math.min(el.scrollHeight, MAX_FIELD_PX)
  const overflows = el.scrollHeight > MAX_FIELD_PX
  if (empty) el.value = ''
  el.style.height = `${h}px`
  el.style.overflowY = overflows ? 'auto' : 'hidden'
}

export interface AgentComposerProps {
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
  /** The window the page is set to (WP3.9): "all" when the reader switched
   *  to all time; absent is the last 90 days. Posted with the question. */
  window?: AskWindowChoice
  size?: keyof typeof SIZES
  /** The window switch under the box, on the Agent page. Two links, not a
   *  control: the window is in the URL, so each option is an address. */
  windowSwitch?: { current: AskWindowChoice; href: Record<AskWindowChoice, string> }
  /** "6 of 40 questions asked this month", where the month could be read. */
  asked?: { asked: number; cap: number } | null
  /** "PDF, up to 4 MB", beside Check a plan. */
  planLimit?: string
}

export function AgentComposer({
  canSend,
  threadId,
  placeholder = 'Ask about anything your market talks about',
  disabledNote = 'Only an owner or admin can ask here',
  ask,
  window,
  size = 'regular',
  windowSwitch,
  asked,
  planLimit,
}: AgentComposerProps) {
  const router = useRouter()
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [question, setQuestion] = useState(ask ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const s = SIZES[size]
  const fieldId = useId()

  // A live count, not a promise. The old copy said "an answer takes about half
  // a minute" whether or not it did; this says what is actually happening, and
  // it disappears the moment there is an answer.
  useEffect(() => {
    if (!busy) return
    setElapsed(0)
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250)
    return () => clearInterval(id)
  }, [busy])

  // THE FIELD GROWS WITH ITS QUESTION (`fitField`), and again when its width
  // changes, which is the only other thing that moves where a line breaks.
  useLayoutEffect(() => fitField(fieldRef.current), [question, canSend])
  useEffect(() => {
    const el = fieldRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fitField(el)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (q.length < MIN_QUESTION) {
      setError(TOO_SHORT)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q, threadId, ...(window === 'all' ? { window } : {}) }),
      })
      const data = (await res.json()) as { threadId?: string; error?: string }
      if (!res.ok || !data.threadId) {
        setError(data.error ?? FAILED)
        return
      }
      setQuestion('')
      if (threadId) router.refresh()
      else router.push(`/dashboard/agent/${data.threadId}`)
    } catch {
      setError(FAILED)
    } finally {
      setBusy(false)
    }
  }

  // A document goes to the SAME endpoint, as multipart. The route branches on
  // content type and hands it to the Ask engine: a second face, not a second
  // engine.
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
        setError(data.error ?? PLAN_FAILED)
        return
      }
      router.push(`/dashboard/agent/${data.threadId}`)
    } catch {
      setError(PLAN_FAILED)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // LIVE IS THE ONLY GATE ON ASK: grey for a reader who may not ask and
  // for a question in flight, never for "you have not typed yet" (19 Sep). The
  // length rule is said beside the field instead.
  const live = canSend && !busy
  const tooShort = canSend && question.trim().length > 0 && question.trim().length < MIN_QUESTION

  return (
    <div className={cn('flex w-full min-w-0 flex-col', s.gap)}>
      <form onSubmit={onSubmit} className="flex w-full min-w-0 flex-col gap-2">
        {/* A visible label on the Agent page; a follow-up is named by its
            place under the answer and keeps its name for a screen reader. */}
        {threadId ? null : (
          <label htmlFor={fieldId} className="text-[14px] font-semibold leading-[1.3] text-secondary-foreground">
            Your question
          </label>
        )}
        <div className="flex w-full min-w-0 items-start gap-2.5">
          <textarea
            id={fieldId}
            ref={fieldRef}
            rows={1}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              // Enter asks, as a one-line field does; Shift+Enter is a new line.
              if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
              e.preventDefault()
              if (live) e.currentTarget.form?.requestSubmit()
            }}
            disabled={busy || !canSend}
            placeholder={canSend ? placeholder : disabledNote}
            aria-label={threadId ? 'Your follow-up' : undefined}
            className={cn(INPUT, 'block h-auto max-h-[220px] min-w-0 flex-1 resize-none rounded-[10px] px-4 field-sizing-content disabled:opacity-60', s.field)}
          />
          <button type="submit" disabled={!live} className={cn(BTN_PRIMARY, 'shrink-0 rounded-[10px]', s.send)}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Ask
          </button>
        </div>
      </form>

      {/* What is happening, the rule, or what went wrong: one line, under the
          field, before the controls. */}
      {busy ? (
        <p className="m-0 text-[13px] tabular-nums text-muted-foreground" aria-live="polite">
          Reading the conversation, {elapsed}s
        </p>
      ) : error ? (
        <p className="m-0 text-[13px] text-negative" role="alert">{error}</p>
      ) : tooShort ? (
        <p className="m-0 text-[13px] text-muted-foreground">{TOO_SHORT}</p>
      ) : null}

      {/* On the Agent page the controls sit on a hairline under the field:
          the plan at the left, the window, the allowance at the right; they
          wrap onto their own lines on a phone. */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-x-7 gap-y-4',
          (windowSwitch || asked) && 'border-t border-track pt-[18px]',
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* LABELLED, AND ON BOTH ROUTES. The file input inside is `sr-only`
              and is the thing that takes focus, so the label wears the ring. */}
          <label
            className={cn(
              BTN_SECONDARY,
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foreground max-sm:h-11',
              !live && 'pointer-events-none opacity-50',
            )}
          >
            Check a plan
            <input ref={fileRef} type="file" accept="application/pdf" onChange={onFile} disabled={!live} className="sr-only" />
          </label>
          {planLimit ? <span className="text-[14px] text-muted-foreground">{planLimit}</span> : null}
        </div>

        {windowSwitch ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[14px] text-secondary-foreground">Window</span>
            <div role="group" aria-label="Window" className={SEG}>
              {(['days90', 'all'] as const).map((w) => (
                <Link
                  key={w}
                  href={windowSwitch.href[w]}
                  aria-current={windowSwitch.current === w ? 'true' : undefined}
                  className={cn(SEG_ITEM, windowSwitch.current === w && SEG_ON)}
                >
                  {ASK_WINDOW_WORDS[w]}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        {asked ? (
          <span className="text-[14px] tabular-nums text-secondary-foreground">
            <span data-copy="figure">{asked.asked}</span> of <span data-copy="figure">{asked.cap}</span> questions asked this month
          </span>
        ) : null}
      </div>
    </div>
  )
}
