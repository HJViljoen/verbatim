import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { canAsk } from '@/lib/agent/access'
import { loadAskBasis, nothingSearchable } from '@/lib/agent/basis'
import { loadNotAnswered } from '@/lib/agent/measure'
import { ASK_WINDOW_PARAM, parseAskWindow, sentQuestion, type AskWindowChoice } from '@/lib/agent/scope'
import { ASK_PDF_MAX_BYTES } from '@/lib/config'
import { loadAskHistory } from '@/lib/pages/agent-thread'
import { surface } from '@/lib/nav'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { AskCard } from '@/components/pages/agent/ask-card'
import { EarlierQuestions } from '@/components/pages/agent/earlier'
import type { Metadata } from 'next'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('ask').label }

/** Earlier questions drawn on this page (the thread page's rail draws three). */
const EARLIER_SHOWN = 20

// The Agent (renamed from Ask; pages rebuild, 1 Oct; Page-Agent.dc.html): a
// clean question box with the month's allowance inside it, and earlier
// questions once there are any. No starters, no "what an answer reads", no
// "not answered this month", no context line and no Export.
//
// ONE WAVE: the role check, whether anything is searchable, the history and
// the month's asking leave together. `?ask=` is a question another page sent
// the reader here with (the Dashboard's box, "Ask the Agent"); it fills the box
// and nothing else.
export default async function AgentPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const { supabase, clientId, userId, role } = await getSessionContext()
  const sp = (await searchParams) ?? {}
  const ask = sentQuestion(sp.ask)
  const window = parseAskWindow(sp[ASK_WINDOW_PARAM])
  const scope = { supabase, clientId, reading: readingHandle(clientId), params: {} }

  const [canSend, basis, history, notAnswered] = await Promise.all([
    // Computed server-side and passed down, never a client-side check.
    canAsk(role, userId),
    loadAskBasis(supabase, clientId),
    loadAskHistory(scope, [], 50, EARLIER_SHOWN).catch(() => null),
    loadNotAnswered(scope).catch(() => null),
  ])

  // THE ONE STATE WHERE ASKING CANNOT WORK: nothing embedded, so every
  // question would take one of the month's slots and come back empty.
  const blocked = nothingSearchable(basis)
  // Each window is an address; a question another page sent stays in the box.
  const href = (w: AskWindowChoice) => {
    const q = new URLSearchParams()
    if (ask) q.set('ask', ask)
    if (w === 'all') q.set(ASK_WINDOW_PARAM, 'all')
    const s = q.toString()
    return s ? `${surface('ask').href}?${s}` : surface('ask').href
  }

  return (
    <PageFrame className="gap-[22px]">
      <PageBar title={surface('ask').label} />
      <AskCard
        // Keyed by the sent question: a new `?ask=` opens a new box.
        key={ask ?? ''}
        canSend={canSend && !blocked}
        disabledNote={blocked && canSend ? 'Nothing is searchable yet, so there is nothing to answer from' : undefined}
        ask={ask}
        window={{ current: window, href: { days90: href('days90'), all: href('all') } }}
        asked={notAnswered ? { asked: notAnswered.asked, cap: notAnswered.cap } : null}
        planLimit={`PDF, up to ${Math.round(ASK_PDF_MAX_BYTES / (1024 * 1024))} MB`}
      />
      <EarlierQuestions history={history} />
    </PageFrame>
  )
}
