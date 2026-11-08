import Link from 'next/link'
import type { ReactNode } from 'react'
import { BTN_PRIMARY, CHIP, INPUT, LBL, ROW, TAP } from '@/components/v2/look'
import { surface } from '@/lib/nav'
import type { AgentBox, AgentTry } from '@/lib/pages/v2/home'
import { cn } from '@/lib/utils'
import { TILE, TT } from './parts'

// THE AGENT BOX, drawn to the audit design's board (Dashboard.dc.html, the
// last tile, 7 Nov): the label opening the Agent, "Ask your market" as the
// heading, one line, then a question and Ask, which opens the Agent with the
// question in its box (`/dashboard/agent?ask=`). A plain GET form, so it
// works before any script has loaded, drawn at once. Under it, the week's
// two biggest conversations to ask about (`agentTries`: the read's, else the
// ones the Market tile leads with), each a chip that opens the Agent asking
// what the market says about it; none where neither holds a conversation.

/** The box's line (the board's; "rival", the board's word for a competitor). */
export const AGENT_LINE = 'About a product, a price, a claim or a rival.'
/** The heading, and the question box's name. */
export const AGENT_ASK = 'Ask your market'

/** The box: its head, the heading, the line and the question box, and
 *  `children` (the questions to try) under it. */
export function AgentBoxShell({ action, children }: { action: string; children?: ReactNode }) {
  const agent = surface('ask').href
  return (
    <article aria-labelledby="home-agent" data-tile="agent" className={cn(TILE, 'min-[1180px]:col-span-1')}>
      <Link href={agent} id="home-agent" className={cn(LBL, 'self-start no-underline underline-offset-4 hover:underline', TAP)}>Agent</Link>
      <h2 className={TT}><Link href={agent} className={ROW}>{AGENT_ASK}</Link></h2>
      <p className="m-0 text-[14.5px] leading-[1.5] text-secondary-foreground">{AGENT_LINE}</p>
      <form action={action} method="get" className="flex gap-2">
        <label htmlFor="home-ask" className="sr-only">{AGENT_ASK}</label>
        <input
          id="home-ask"
          name="ask"
          type="text"
          placeholder="What does my market say about…"
          className={cn(INPUT, 'min-w-0 flex-1 text-[14px]')}
        />
        <button type="submit" className={BTN_PRIMARY}>Ask</button>
      </form>
      {children}
    </article>
  )
}

/** The conversations to ask about, each a chip that opens the Agent with its
 *  question asked. */
export function AgentTries({ tries }: { tries: readonly AgentTry[] }) {
  if (tries.length === 0) return null
  return (
    <div data-agent-tries="" className="flex flex-wrap gap-2">
      {tries.map((t) => (
        <Link key={t.href} href={t.href} aria-label={t.question} className={cn(CHIP, 'h-auto min-h-[34px] whitespace-normal py-1.5 text-left no-underline')}>
          <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>
        </Link>
      ))}
    </div>
  )
}

export function AgentBoxView({ box }: { box: AgentBox }) {
  return <AgentBoxShell action={box.action}><AgentTries tries={box.tries} /></AgentBoxShell>
}
