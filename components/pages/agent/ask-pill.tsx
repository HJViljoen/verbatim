import { AgentComposer } from '@/components/agent-composer'
import { CARD } from '@/components/v2'
import { cn } from '@/lib/utils'
import type { AskWindowChoice } from '@/lib/agent/scope'

// The Agent page's question. Since the audit design (7 Nov, Agent.dc.html):
// one tile, at most 1000px wide, holding a 26px heading and the box (its
// visible label, the field, the yellow Ask, then "Check a plan", the window
// and the month's allowance on a hairline). No mark in a square, no starters
// (decision 11: the page does not load the week's conversations they would
// come from) and no how-it-works line: the shape explains itself.

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
    <section
      aria-labelledby="agent-ask-title"
      className={cn(CARD, 'w-full max-w-[1000px] gap-[18px] p-[30px] max-sm:gap-4 max-sm:p-[18px]')}
    >
      <h2 id="agent-ask-title" className="m-0 text-[26px] font-bold leading-[1.25] tracking-[-0.01em] text-foreground [text-wrap:balance] max-sm:text-[22px]">
        What does your market say about this?
      </h2>
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
