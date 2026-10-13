import Link from 'next/link'
import { NAV_ICON } from '@/components/nav-icons'
import type { AgentBox } from '@/lib/pages/v2/home'
import { cn } from '@/lib/utils'
import { TILE, TileHead } from './parts'

// THE AGENT BOX (Design v2, T8; E1-Dashboard's last card): a question and Ask,
// which opens the Agent with the question in its box (`/dashboard/agent?ask=`).
// A plain GET form, so it works before any script has loaded. Under it, two
// questions to try, the Agent's own question about each of the week's two
// biggest conversations (`agentTries`), each a link that opens the Agent with
// it asked; none where the read froze no conversations.

/** The box's line (the board's; "rival", the board's word for a competitor). */
export const AGENT_LINE = 'Ask what your market thinks about anything: a product, a price, a claim, a rival.'
/** The phone board's shorter line. */
export const AGENT_LINE_PHONE = 'Ask the Agent about anything in your market'

export function AgentBoxView({ box }: { box: AgentBox }) {
  return (
    <article aria-labelledby="home-agent" data-tile="agent" className={cn(TILE, 'col-span-12 min-[1180px]:col-span-4')}>
      <div className="max-sm:hidden"><TileHead icon={NAV_ICON.ask} name="Agent" id="home-agent" href={null} /></div>
      <form action={box.action} method="get" className="flex flex-col gap-3">
        <label htmlFor="home-ask" className="text-[13px] leading-[1.45] text-muted-foreground max-sm:font-medium max-sm:text-foreground">
          <span className="max-sm:hidden">{AGENT_LINE}</span>
          <span className="sm:hidden">{AGENT_LINE_PHONE}</span>
        </label>
        <div className="flex gap-2">
          <input
            id="home-ask"
            name="ask"
            type="text"
            placeholder="What does my market say about…"
            className="min-w-0 flex-1 rounded-lg border border-comp bg-inner px-3 py-2.5 font-[inherit] text-[14px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            className="inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-brand px-3.5 text-[13.5px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Ask
          </button>
        </div>
      </form>
      {box.tries.length > 0 ? (
        <div className="flex flex-col gap-1 text-[13px] leading-[1.45] max-sm:hidden">
          <span className="text-muted-foreground">Try</span>
          {box.tries.map((t) => (
            <Link key={t.href} href={t.href} className="text-foreground no-underline underline-offset-[3px] hover:underline">
              {/* The Agent's question, about a conversation by its label. */}
              <span data-copy="subject" data-slot="pass_b_theme">{t.question}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  )
}
