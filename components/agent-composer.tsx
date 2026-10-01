'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUp, Loader2 } from 'lucide-react'
import { FileUp } from '@/components/design-icons'
import { ASK_WINDOW_WORDS, type AskWindowChoice } from '@/lib/agent/scope'

// The ask box: THE PILL (Heinrich, 1 Oct: "a few versions back the AI chat had
// a pill in the centre where you could ask questions ... combine the new stuff
// with the pill"). The shape is the one 1671e484 introduced on 22 Aug and the
// 18 Sep port replaced with a block inside a tile: a rounded field with the
// arrow INSIDE it on the right. What the rebuild added stays, drawn under the
// pill rather than in a card around it: "Check a plan", the window switch and
// the month's allowance. No instructions around it; the shape says "type here
// and press the arrow".
//
// ONE CONTROL, BOTH ROUTES. The Agent page centres it (`size="large"`, with the
// window and the allowance); a thread draws the same pill for a follow-up and
// for a new question. The requests are the ones the box has always made: a
// question posts JSON to /api/agent and opens (or refreshes) its thread; a plan
// posts the PDF as multipart to the same endpoint, which branches on content
// type.
//
// `canSend` is computed on the SERVER and passed in. When it is false the pill
// is drawn and disabled, with the reason as its placeholder: a reader should
// see what this page is and that answers live here, and "only an owner or
// admin can ask here" explains a STATE rather than teaching a mechanism.

/** The shortest string the endpoint will treat as a question. */
const MIN_QUESTION = 8

/** The rule, said rather than enforced in silence: next to the field as the
 *  reader types, and again if they press the arrow anyway. */
const TOO_SHORT = 'A question needs a few more words before we can answer it.'
const FAILED = 'That did not work. Try again shortly.'
const PLAN_FAILED = 'That document could not be checked.'

/** How tall the field grows before it scrolls inside itself. */
const MAX_FIELD_PX = 220

const SIZES = {
  // The Agent page: the pill is the page.
  large: {
    form: 'min-h-16 rounded-[32px] py-2 pl-6 pr-2',
    field: 'py-[11px] text-[17px] leading-[26px] max-sm:text-[16px]',
    send: 'size-12',
  },
  // A thread: the same pill, a size down, under the answer it follows.
  regular: {
    form: 'min-h-14 rounded-[28px] py-1.5 pl-5 pr-1.5',
    field: 'py-[11px] text-[16px] leading-[22px] sm:text-[15px]',
    send: 'size-11',
  },
} as const

/**
 * One line until there is more to say, so the shape is a pill on arrival; a
 * long question (or one another page sent) stays readable instead of
 * scrolling sideways out of a one-line field. An empty field is sized on its
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
  /** The window switch under the pill, on the Agent page. Two links, not a
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

  // THE PILL GROWS WITH ITS QUESTION (`fitField`), and again when its width
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

  // LIVE IS THE ONLY GATE ON THE ARROW: grey for a reader who may not ask and
  // for a question in flight, never for "you have not typed yet" (19 Sep). The
  // length rule is said beside the field instead.
  const live = canSend && !busy
  const tooShort = canSend && question.trim().length > 0 && question.trim().length < MIN_QUESTION

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <form
        onSubmit={onSubmit}
        // The soft card shadow (brand/colour's elevation) and a hairline; the
        // ring that shows focus is the border turning ink, on the pill itself,
        // because the field inside it draws no outline of its own.
        className={`flex w-full min-w-0 items-end gap-2 border border-border bg-tile shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_14px_rgba(0,0,0,0.04)] transition-colors focus-within:border-foreground ${s.form}`}
      >
        <textarea
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
          aria-label={threadId ? 'Your follow-up' : 'Your question'}
          className={`block max-h-[220px] min-w-0 flex-1 resize-none bg-transparent px-0 field-sizing-content text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60 ${s.field}`}
        />
        <button
          type="submit"
          disabled={!live}
          aria-label="Ask"
          className={`grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 ${s.send}`}
        >
          {busy ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : <ArrowUp className="size-5" aria-hidden />}
        </button>
      </form>

      {/* What is happening, the rule, or what went wrong: one line, under the
          pill, before the controls. */}
      {busy ? (
        <p className="m-0 px-5 font-mono text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
          Reading the conversation · {elapsed}s
        </p>
      ) : error ? (
        <p className="m-0 px-5 text-[13px] text-negative" role="alert">{error}</p>
      ) : tooShort ? (
        <p className="m-0 px-5 text-[13px] text-muted-foreground">{TOO_SHORT}</p>
      ) : null}

      {/* Centred under the pill on a phone, where the row breaks into lines;
          from sm the plan at the left edge and the window and allowance at the
          right. */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 px-1 sm:justify-between">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          {/* LABELLED, AND ON BOTH ROUTES. The file input inside is `sr-only`
              and is the thing that takes focus, so the label wears the ring. */}
          <label
            className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-tile px-3.5 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-background has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${live ? '' : 'pointer-events-none opacity-50'}`}
          >
            <FileUp className="size-4" aria-hidden />
            Check a plan
            <input ref={fileRef} type="file" accept="application/pdf" onChange={onFile} disabled={!live} className="sr-only" />
          </label>
          {planLimit ? <span className="text-[13px] text-muted-foreground">{planLimit}</span> : null}
        </div>

        {windowSwitch || asked ? (
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {windowSwitch ? (
              <div className="flex items-center gap-2.5">
                <span className="text-[13px] text-muted-foreground">Window</span>
                <div role="group" aria-label="Window" className="inline-flex gap-0.5 rounded-full bg-track p-[3px]">
                  {(['days90', 'all'] as const).map((w) => (
                    <Link
                      key={w}
                      href={windowSwitch.href[w]}
                      aria-current={windowSwitch.current === w ? 'true' : undefined}
                      className={`inline-flex h-[30px] items-center rounded-full px-3.5 text-[13px] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        windowSwitch.current === w
                          ? 'bg-tile font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                          : 'font-medium text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {ASK_WINDOW_WORDS[w]}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {asked ? (
              <span className="text-[13px] text-muted-foreground">
                <span data-copy="figure" className="font-mono text-foreground">{asked.asked}</span> of{' '}
                <span data-copy="figure" className="font-mono text-foreground">{asked.cap}</span> questions asked this month
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
