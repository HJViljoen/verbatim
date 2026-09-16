import { getSessionContext } from '@/lib/auth'
import { AgentComposer } from '@/components/agent-composer'
import { AgentCrowdRing } from '@/components/agent-stage'
import { AgentHistory, type ThreadRow } from '@/components/agent-history'
import { canAsk } from '@/lib/agent/access'
import { askBasisLine, loadAskBasis } from '@/lib/agent/basis'

// The Verbatim Agent — arrive with a question from your own work, get an answer
// built from what your customers actually said.
//
// This page does not scroll. The composer and the figure hold the centre of the
// frame and the crowd stands around them; that composition IS the page, and a
// scrollbar would let it drift off the top. Earlier questions therefore live in
// a sheet parked off the bottom edge rather than in a column underneath.
//
// No subheading either. The profile page lost its tagline in the July pass for
// the same reason: a description is read once and then it is furniture.

/** `?ask=` is a question another page sent the reader here with — Subjects'
 *  "Ask about this" is the first. It fills the box and nothing else: the
 *  reader reads it, edits it, and presses send. */
export default async function AgentPage({ searchParams }: { searchParams?: Promise<{ ask?: string }> }) {
  const { supabase, clientId, userId, role } = await getSessionContext()
  const ask = (await searchParams)?.ask?.slice(0, 300)
  // The admin check and the thread list are independent — one wave (round
  // trips, not rows, are the cost: the DB pays a ~0.5s wake-up on the first
  // requests after idle, and every sequential wave pays it again).
  const [canSend, { data: rows }, basis] = await Promise.all([
    // Computed server-side and passed down — never a client-side check.
    canAsk(role, userId),
    supabase
      .from('agent_threads')
      .select('id, title, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50),
    // What a question asked from this box will be answered against (AS3).
    loadAskBasis(supabase, clientId),
  ])
  const threads = (rows ?? []) as ThreadRow[]

  return (
    // .agent-fixed is the hook a CSS rule uses to stop <main> scrolling and
    // make it a column (see globals.css). flex-1 + min-h-0 then takes exactly
    // the height left over — which is the whole pane normally, and the pane
    // minus the billing banner when a tenant has one, instead of assuming.
    //
    // NOT overflow-hidden here: that would clip the history sheet, which
    // reaches past the dashboard's padding to sit flush with the bottom edge.
    // The clipping happens at <main> instead, one level up.
    <div className="agent-fixed relative flex-1 min-h-0">
      <AgentCrowdRing />
      <div className="agent-centre-in relative z-10 grid h-full place-items-center">
        <div className="w-full pb-24">  {/* clears the taller peek below */}
          <AgentComposer canSend={canSend} showFigure ask={ask} />
          {/* AS3, under the box rather than over it: the reader came here to
              ask, and what the answer will be drawn from is the second thing
              they need, not the first. Said before a question is spent, because
              "none of 2,872 findings searchable" is the difference between a
              silent answer and a broken index. */}
          <p className="mx-auto mt-4 max-w-2xl text-center text-[11.5px] text-muted-foreground">
            {askBasisLine(basis)}
          </p>
        </div>
      </div>
      <AgentHistory threads={threads} />
    </div>
  )
}
