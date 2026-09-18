import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { canAsk } from '@/lib/agent/access'
import { askBasisLine, loadAskBasis, nothingSearchable } from '@/lib/agent/basis'
import { loadNotAnswered } from '@/lib/agent/measure'
import { loadPlanChecks } from '@/lib/ask/plan-cards'
import { askDraws, askPlanChip, askRecordHref, askRecordLines, loadAskHistory } from '@/lib/pages/agent-thread'
import { AgentComposer } from '@/components/agent-composer'
import { AskBoxTile } from '@/components/pages/agent/ask-box'
import { DrawsTile, EarlierQuestionsTile, NotAnsweredTile } from '@/components/pages/agent/rail'
import { AskColumns, AskShell } from '@/components/pages/agent/surface'

// Ask — "what does the conversation say about this?" (Block D wave 2, E-ask).
//
// THE STAGE IS GONE. This page was a non-scrolling composition: a crowd
// backdrop, a standing figure over one centred rounded-full composer, one
// sentence under it, and earlier questions in a drawer parked off the bottom
// edge. It had no page bar, no tiles and no rail — so the surface's own
// question, the legend, Export, the plan a reader had already checked, what an
// answer draws on and what could not be answered this month were all either
// absent or hidden behind a hover. The artboard draws the ask box as a tile
// with three tiles beside it, which is the same composition the thread page
// wears; this page is that page without an answer in it yet.
//
// SIX READS, ONE WAVE. Round trips are the cost on this database — it pays a
// ~0.5s wake-up on the first request after idle and every sequential wave pays
// it again — so the role check, the basis, the history, the plans, the month's
// questions and the delivered count leave together.

/** `?ask=` is a question another page sent the reader here with — Subjects'
 *  "Ask about this" is the first. It fills the box and nothing else: the
 *  reader reads it, edits it, and presses Ask. */
export default async function AgentPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const { supabase, clientId, userId, role } = await getSessionContext()
  const sp = (await searchParams) ?? {}
  const ask = sp.ask?.slice(0, 300)
  const scope = { supabase, clientId, reading: readingHandle(clientId), params: sp }

  const [canSend, basis, history, plans, notAnswered, deliveredRes] = await Promise.all([
    // Computed server-side and passed down — never a client-side check.
    canAsk(role, userId),
    // What a question asked from this box will be answered against (AS3).
    loadAskBasis(supabase, clientId),
    loadAskHistory(scope).catch(() => null),
    loadPlanChecks(scope).catch(() => []),
    loadNotAnswered(scope).catch(() => null),
    supabase.from('pipeline_runs').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
  ])

  // THE ONE STATE WHERE ASKING CANNOT WORK. `match_insights` filters
  // `embedding is not null`, so a corpus with nothing embedded returns zero
  // rows for every question and `answerQuestion` throws — after the question
  // has been stored, which means after it has taken one of the month's forty
  // slots. The basis in the bar already says "none of N findings searchable";
  // this is that fact reaching the control, so the reader is told before they
  // spend the turn rather than after.
  const blocked = nothingSearchable(basis)
  const delivered = deliveredRes.error ? null : deliveredRes.count ?? null
  const recordLines = askRecordLines(basis, delivered)

  return (
    <AskShell context={askBasisLine(basis)} record={{ line: recordLines[0], lines: recordLines }} params={sp}>
      <AskColumns
        rail={
          <>
            <EarlierQuestionsTile history={history} row={3} />
            <DrawsTile draws={askDraws(basis, delivered)} recordHref={askRecordHref()} delivered={delivered} row={2} />
            <NotAnsweredTile notAnswered={notAnswered} row={2} />
          </>
        }
      >
        <AskBoxTile
          basis={basis}
          plan={askPlanChip(plans)}
          row={2}
          composer={
            <AgentComposer
              canSend={canSend && !blocked}
              disabledNote={blocked && canSend ? 'Nothing is searchable yet, so there is nothing to answer from' : undefined}
              ask={ask}
            />
          }
        />
      </AskColumns>
    </AskShell>
  )
}
