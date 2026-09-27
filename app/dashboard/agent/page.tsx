import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { longMonth } from '@/lib/format'
import { canAsk } from '@/lib/agent/access'
import { loadAskBasis, nothingSearchable } from '@/lib/agent/basis'
import { loadNotAnswered } from '@/lib/agent/measure'
import { ASK_WINDOW_PARAM, parseAskWindow, type AskWindowChoice } from '@/lib/agent/scope'
import { loadPlanChecks, type PlanCheckCard } from '@/lib/ask/plan-cards'
import { askPlanChip, askReads, loadAskFront, loadAskHistory, loadAskReading, NO_ASK_READING } from '@/lib/pages/agent-thread'
import { surface } from '@/lib/nav'
import { AgentComposer } from '@/components/agent-composer'
import { AskBoxTile, StarterCards } from '@/components/pages/agent/ask-box'
import { EarlierQuestionsTile, NotAnsweredTile, ReadsTile } from '@/components/pages/agent/rail'
import { ASK_TILE_ROW, AskIndexColumns, AskShell } from '@/components/pages/agent/surface'

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
// ONE WAVE. Round trips are the cost on this database — it pays a ~0.5s
// wake-up on the first request after idle and every sequential wave pays it
// again — so the role check, the basis, the history, the plans, the month's
// questions, the market reading and the front page's own load leave together.
//
// MARKET-FIRST (WP3.9, plan §2.8): the one-line bar, the window switch (the
// last 90 days, or all time), the starter questions written by code from the
// front page's biggest objects, and "What an answer reads" in place of the
// index's bookkeeping.

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
  const window = parseAskWindow(sp[ASK_WINDOW_PARAM])
  const reading = readingHandle(clientId)
  // The front page's own loader, on its default month: the starter questions
  // are written from ITS biggest objects (WP3.9), so they cannot name a
  // figure the front page does not print. It never takes the page down.
  const scope = { supabase, clientId, reading, params: { [ASK_WINDOW_PARAM]: sp[ASK_WINDOW_PARAM] } }
  const nowIso = new Date().toISOString()

  // THE PLAN CARDS ARE READ ONCE. `loadPlanChecks` is four capped reads by its
  // own docstring and this page needs them twice — for the ask box's chip and
  // for the history tile's crossings. Started here and handed to
  // `loadAskHistory`, they join its own `Promise.all` rather than serialising
  // behind it, so one wave answers both (AGENTS.md: one query in flight, and
  // never a second identical one beside it).
  const plansP = loadPlanChecks(scope).catch(() => [] as PlanCheckCard[])

  const [canSend, basis, history, plans, notAnswered, askReading, front, clientRes] = await Promise.all([
    // Computed server-side and passed down — never a client-side check.
    canAsk(role, userId),
    // Whether anything is searchable at all (AS3): the composer is switched
    // off before a reader spends a turn on an empty index.
    loadAskBasis(supabase, clientId),
    loadAskHistory(scope, plansP).catch(() => null),
    plansP,
    loadNotAnswered(scope).catch(() => null),
    loadAskReading(supabase, reading, nowIso).catch(() => NO_ASK_READING),
    loadAskFront({ supabase, clientId, reading }).catch((e: unknown) => {
      console.error(`[ask] starters: ${(e as { message?: string })?.message ?? String(e)}`)
      return null
    }),
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
  ])

  // THE ONE STATE WHERE ASKING CANNOT WORK. `match_insights` filters
  // `embedding is not null`, so a corpus with nothing embedded returns zero
  // rows for every question and `answerQuestion` throws — after the question
  // has been stored, which means after it has taken one of the month's forty
  // slots. The composer is switched off before the reader spends the turn.
  const blocked = nothingSearchable(basis)
  const brand = front?.brand ?? (clientRes.data?.company_name as string | undefined) ?? 'Your brand'
  const starters = front?.starters ?? []
  const startersFrom = askReading.reading
    ? `written from ${surface('overview').label} · ${longMonth(askReading.reading.month)}${askReading.reading.state === 'so_far' ? ' so far' : ''}`
    : null
  // Each window is an address. A question another page sent (`?ask=`) stays
  // in the box when the reader switches window.
  const href = (w: AskWindowChoice) => {
    const q = new URLSearchParams()
    if (ask) q.set('ask', ask)
    if (w === 'all') q.set(ASK_WINDOW_PARAM, 'all')
    const s = q.toString()
    return s ? `${surface('ask').href}?${s}` : surface('ask').href
  }

  return (
    <AskShell bar={{ brand, reading: askReading.reading }} params={sp}>
      {/* THE BOX OVER THE THREE, not beside them — see `AskIndexColumns`. This
          page has no answer on it yet, so the tiles that are a rail on a thread
          are the page itself here; composed as two columns it was a 130px tile
          over 900px of white with a rail alongside. */}
      <AskIndexColumns
        box={
          <AskBoxTile
            basis={basis}
            plan={askPlanChip(plans)}
            row={ASK_TILE_ROW}
            window={{ current: window, href: { days90: href('days90'), all: href('all') }, reachesBack: askReading.earliest ? askReading.earliest.slice(0, 4) : null }}
            asked={notAnswered ? { asked: notAnswered.asked, cap: notAnswered.cap } : null}
            starters={<StarterCards starters={starters} source={startersFrom} window={window} />}
            composer={
              <AgentComposer
                canSend={canSend && !blocked}
                disabledNote={blocked && canSend ? 'Nothing is searchable yet, so there is nothing to answer from' : undefined}
                placeholder="Ask about anything your market talks about"
                ask={ask}
                window={window}
              />
            }
          />
        }
        tiles={
          <>
            {/* THE TWO SHORT TILES STACK BESIDE THE TALL ONE (layout sweep
                2026-09-24). Three columns of four let the history set the
                row's height and left most of the other two white; stacked in
                one column they sit level with it. */}
            <EarlierQuestionsTile history={history} col={7} row={ASK_TILE_ROW} />
            <div className="flex min-w-0 flex-col gap-4 xl:col-span-5">
              <ReadsTile reads={askReads(askReading, null)} col={12} row={ASK_TILE_ROW} />
              <NotAnsweredTile notAnswered={notAnswered} col={12} row={ASK_TILE_ROW} />
            </div>
          </>
        }
      />
    </AskShell>
  )
}
