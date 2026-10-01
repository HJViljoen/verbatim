'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUp, FileUp, Loader2, Sparkles } from 'lucide-react'
import { ASK_WINDOW_WORDS, type AskWindowChoice } from '@/lib/agent/scope'

// The Agent's question box (pages rebuild, 1 Oct; Page-Agent.dc.html). One
// card: the question, "Check a plan", the window, the month's allowance and
// Ask. No starter questions, no "comments reach back to …", nothing about what
// an answer reads (the owner's review of 1 Oct).
//
// THE SAME TWO REQUESTS AS EVER. A question posts JSON to /api/agent and opens
// its thread; a plan posts the PDF as multipart to the same endpoint (the
// engine branches on content type). `canSend` is computed on the server; when
// it is false the box is drawn and disabled, with the reason in the box.

/** The shortest string the endpoint will treat as a question. */
const MIN_QUESTION = 8
const TOO_SHORT = 'A question needs a few more words before it can be answered.'
const FAILED = 'That did not work. Try again shortly.'

export interface AskCardProps {
  canSend: boolean
  /** What the box says while it is disabled. */
  disabledNote?: string
  /** A question another page sent the reader here with (`?ask=`). */
  ask?: string
  window: { current: AskWindowChoice; href: Record<AskWindowChoice, string> }
  /** "0 of 40 questions asked this month", where the month could be read. */
  asked: { asked: number; cap: number } | null
  /** "PDF, up to 4 MB". */
  planLimit: string
}

export function AskCard({ canSend, disabledNote = 'Only an owner or admin can ask here', ask, window, asked, planLimit }: AskCardProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [question, setQuestion] = useState(ask ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const live = canSend && !busy

  async function send() {
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
        body: JSON.stringify({ question: q, ...(window.current === 'all' ? { window: 'all' } : {}) }),
      })
      const data = (await res.json()) as { threadId?: string; error?: string }
      if (!res.ok || !data.threadId) {
        setError(data.error ?? FAILED)
        return
      }
      router.push(`/dashboard/agent/${data.threadId}`)
    } catch {
      setError(FAILED)
    } finally {
      setBusy(false)
    }
  }

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

  return (
    <form
      className="m-0 flex w-full flex-col leading-[normal]"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <div className="flex flex-col gap-5 rounded-[20px] bg-white px-8 pt-[30px] pb-[26px] shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_24px_rgba(0,0,0,0.05)] max-sm:px-5">
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#FFD43B]">
            <Sparkles className="size-5 text-[#26292C]" aria-hidden />
          </div>
          <div className="flex flex-col gap-[3px]">
            <h2 className="m-0 text-[22px] font-bold text-[#26292C]">What does your market say about this?</h2>
            <p className="m-0 text-[15px] leading-[1.5] text-[#5F656B]">Ask what your market thinks about anything: a product, a price, a claim, a competitor.</p>
          </div>
        </div>

        <label className="flex flex-col gap-2">
          <span className="sr-only">Your question</span>
          <textarea
            rows={6}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (live) void send()
              }
            }}
            disabled={!canSend || busy}
            placeholder={canSend ? 'Ask about anything your market talks about' : disabledNote}
            className="box-border min-h-[190px] w-full resize-y rounded-[14px] border-[1.5px] border-[#26292C] bg-white px-5 py-[18px] text-[17px] leading-[1.5] text-[#26292C] placeholder:text-[#5F656B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-[18px]">
            <label
              className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-[#E4E2DC] bg-white px-3.5 text-[14px] font-semibold text-[#26292C] hover:bg-[#F7F6F2] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${live ? '' : 'pointer-events-none opacity-50'}`}
            >
              <FileUp className="size-4" aria-hidden />
              Check a plan
              <input ref={fileRef} type="file" accept="application/pdf" onChange={onFile} disabled={!live} className="sr-only" />
            </label>
            <span className="text-[13px] text-[#5F656B]">{planLimit}</span>
          </div>

          <div className="flex flex-wrap items-center gap-[18px]">
            <div className="flex items-center gap-2.5">
              <span className="text-[13px] text-[#5F656B]">Window</span>
              <div role="group" aria-label="Window" className="inline-flex gap-0.5 rounded-[10px] bg-[#F7F6F2] p-[3px]">
                {(['days90', 'all'] as const).map((w) => (
                  <Link
                    key={w}
                    href={window.href[w]}
                    aria-current={window.current === w ? 'true' : undefined}
                    className={`inline-flex h-[30px] items-center rounded-[8px] px-3 text-[13px] no-underline ${
                      window.current === w
                        ? 'bg-white font-semibold text-[#26292C] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                        : 'bg-transparent font-medium text-[#5F656B] hover:text-[#26292C]'
                    }`}
                  >
                    {ASK_WINDOW_WORDS[w]}
                  </Link>
                ))}
              </div>
            </div>
            {asked ? (
              <span className="text-[13px] text-[#5F656B]">
                <span data-copy="figure" className="font-mono text-[#26292C]">{asked.asked}</span> of{' '}
                <span data-copy="figure" className="font-mono text-[#26292C]">{asked.cap}</span> questions asked this month
              </span>
            ) : null}
            <button
              type="submit"
              disabled={!live}
              className="inline-flex h-11 items-center gap-2 rounded-[10px] border-none bg-[#26292C] px-[22px] text-[15px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
            >
              Ask
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowUp className="size-4" aria-hidden />}
            </button>
          </div>
        </div>

        {error ? <p className="m-0 text-[13px] text-negative" role="alert">{error}</p> : null}
      </div>
    </form>
  )
}
