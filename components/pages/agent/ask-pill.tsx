import { Sparkles } from '@/components/design-icons'
import { AgentComposer } from '@/components/agent-composer'
import type { AskWindowChoice } from '@/lib/agent/scope'

// The Agent page's question (Heinrich, 1 Oct): the pill in the centre, as the
// page was from 22 Aug (1671e484) until the 18 Sep port, with what the pages
// rebuild added drawn around it: "Check a plan", the window and the month's
// allowance, close under the pill and not in a card. The Agent's yellow mark
// stands where the 22 Aug figure stood (no crowd or figure: the pages carry no
// backdrop). No subheading and no how-it-works line: the shape explains itself.

export interface AskPillProps {
  canSend: boolean
  /** What the box says while it is disabled. */
  disabledNote?: string
  /** A question another page sent the reader here with (`?ask=`). */
  ask?: string
  window: { current: AskWindowChoice; href: Record<AskWindowChoice, string> }
  /** "6 of 40 questions asked this month", where the month could be read. */
  asked: { asked: number; cap: number } | null
  /** "PDF, up to 4 MB". */
  planLimit: string
}

export function AskPill({ canSend, disabledNote, ask, window, asked, planLimit }: AskPillProps) {
  return (
    <section aria-labelledby="agent-ask-title" className="flex w-full max-w-[800px] flex-col items-center gap-7 leading-[normal]">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-[14px] bg-brand" aria-hidden>
          <Sparkles className="size-[22px] text-brand-foreground" />
        </span>
        <h2 id="agent-ask-title" className="m-0 text-[28px] font-bold leading-[1.2] tracking-[-0.01em] text-foreground [text-wrap:balance] max-sm:text-[23px]">
          What does your market say about this?
        </h2>
      </div>
      <AgentComposer
        size="large"
        canSend={canSend}
        disabledNote={disabledNote}
        ask={ask}
        window={window.current}
        windowSwitch={window}
        asked={asked}
        planLimit={planLimit}
      />
    </section>
  )
}
