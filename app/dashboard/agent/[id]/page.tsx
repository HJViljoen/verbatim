import { notFound } from 'next/navigation'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { AgentDocumentSplit } from '@/components/agent-document-split'
import { PlanJudgement } from '@/components/agent-document'
import { ExportMenu, ExportScope } from '@/components/export-menu'
import { LevelBar } from '@/components/shell/level-bar'
import { PageFrame } from '@/components/shell/page-grid'
import { CARD, EmptyBox } from '@/components/v2'
import { LBL } from '@/components/v2/look'
import { cn } from '@/lib/utils'
import { canAsk } from '@/lib/agent/access'
import { mayDeleteThread } from '@/lib/agent/delete-thread'
import { DeleteThread } from '@/components/pages/agent/delete-thread'
import { nothingSearchable } from '@/lib/agent/basis'
import { loadAgentThread } from '@/lib/pages/agent-thread'
import { AgentComposer } from '@/components/agent-composer'
import { AnswerTile } from '@/components/pages/agent/answer'
import { AskBoxTile } from '@/components/pages/agent/ask-box'
import { EarlierQuestionsTile, NotAnsweredTile, ReadsTile } from '@/components/pages/agent/rail'
import { AskColumns, AskShell, askSub, planCheckStats } from '@/components/pages/agent/surface'
import { ASK_PDF_MAX_BYTES } from '@/lib/config'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('ask').label }

// One thread, at its own URL — and, since Block D wave 2, the SAME surface the
// Ask index is: the page bar, a left column of tiles and the rail beside them.
// It used to be a different page with a different shell (a back link, an <h1>
// and a stack of bordered cards), so a reader who followed their own question
// from the box arrived somewhere that did not look like where they came from
// and lost the rail entirely.
//
// The data comes from lib/pages/agent-thread.ts — the same loader the export
// renders from, so what leaves as a PDF is what is on screen: quotes resolved
// live from stored ids, never stored words.

export default async function AgentThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const session = await getSessionContext()
  const { supabase, clientId, userId, role } = session
  const [canSend, data] = await Promise.all([
    canAsk(role, userId),
    loadAgentThread({ supabase, clientId, reading: readingHandle(clientId), params: { ...sp, thread: id } }),
  ])
  if (!data) notFound()
  // A platform operator's alone, for now (the monthly cap is counted on the
  // thread's rows); the action decides again on the session.
  const deleteControl = mayDeleteThread(session) ? <DeleteThread threadId={id} kind={data.kind === 'document' || data.document ? 'document' : 'question'} /> : null
  // The one state where a follow-up cannot work, read off the basis this page
  // already loads (the landing page's own predicate, same sentence).
  const blocked = nothingSearchable(data.basis)
  const disabledNote = blocked && canSend ? 'Nothing is searchable yet, so there is nothing to answer from' : undefined
  const planLimit = `PDF, up to ${Math.round(ASK_PDF_MAX_BYTES / (1024 * 1024))} MB`

  // The index is the TURN's index, not the answered-turns' — `agent.answer:<i>`
  // renders turn i, so filtering before mapping would point at the wrong one.
  const exportTiles = data.kind === 'question'
    ? data.turns
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t.answer)
        .map(({ i }) => ({ key: `agent.answer:${i}`, title: data.turns.length > 1 ? `Answer ${i + 1}` : 'The answer' }))
    : []

  /**
   * ONE WAY BACK PER SCREEN. A question thread's is the rail's "All
   * questions"; the plan check, which composes no rail, has the crumb "All
   * questions / {plan}" (Agent-Thread.dc.html), which replaced the arrowed
   * back link it had.
   */
  const rail = (
    <>
      <EarlierQuestionsTile history={data.history} openThread />
      <ReadsTile reads={data.reads} />
      <NotAnsweredTile notAnswered={data.notAnswered} />
    </>
  )

  // THE PLAN CHECK (Agent-Thread.dc.html, the audit design): the crumb "All
  // questions / {plan}", the title "The plan check" with "{brand}, {month}"
  // under it and Export beside it, the figures row, then the check and their
  // document as two tiles that flow with the page, and "What I'd take from
  // that" under both. The annotation is markup over text WE rendered, so
  // their file is never stored or edited.
  if (data.document) {
    const doc = data.document
    return (
      <ExportScope page="agent" params={{ thread: id }} tiles={[]}>
        <PageFrame>
          <LevelBar
            crumbs={[{ label: 'All questions', href: '/dashboard/agent' }, { label: data.title, href: null }]}
            level="plan"
            title="The plan check"
            sub={askSub({ brand: data.brand, reading: data.bar.reading })}
            controls={<ExportMenu variant="secondary" />}
            stats={planCheckStats(data)}
          />
          <AgentDocumentSplit
            claims={doc.claims}
            quotesByClaim={new Map(Object.entries(doc.quotesByClaim).map(([ref, qs]) => [ref, qs.map((q) => ({ text: q.text, lang: q.lang, english: q.english }))]))}
            segments={doc.segments}
            anchored={doc.anchored}
            notice={doc.notice}
            was={doc.was}
          />
          <PlanJudgement claims={doc.claims} judgement={doc.judgement} />
          {deleteControl}
        </PageFrame>
      </ExportScope>
    )
  }

  // A DOCUMENT THREAD WITH NO CHECK ON IT. The cap slot is taken before the
  // spend (app/api/agent/route.ts), so a check that fails after the thread is
  // written leaves this behind: the model call failed, the document held no
  // claim about customers or the market, or the check ran and could not be
  // saved. WHICH of the three it was is not recorded — the outcome column is
  // checked to ('answered','partial','silent') and widening it is a migration —
  // so the sentence names both possibilities instead of picking one, and says
  // the thing the reader cannot see: it still counted.
  if (data.kind === 'document') {
    return (
      <ExportScope page="agent" params={{ thread: id }} tiles={[]}>
        <AskShell bar={{ brand: data.brand, reading: data.bar.reading }}>
          <AskColumns rail={rail}>
            <section aria-label="The plan check" className={CARD}>
              <h2 className={cn('m-0', LBL)}>The plan check</h2>
              <EmptyBox title="Nothing was saved against this document">
                Either nothing in it read as a claim about customers or the market, or the check failed on our side
                before it finished. It still counted as one of this month&rsquo;s questions, and you can bring the
                document again from the Agent&rsquo;s box.
              </EmptyBox>
            </section>
            {deleteControl}
          </AskColumns>
        </AskShell>
      </ExportScope>
    )
  }

  return (
    <ExportScope page="agent" params={{ thread: id }} tiles={exportTiles}>
      <AskShell bar={{ brand: data.brand, reading: data.bar.reading }}>
        <AskColumns rail={rail}>
          {/* THE ASK BOX STAYS ABOVE THE ANSWER, as the artboard draws it: a
              reader with an answer in front of them is one keystroke from the
              next question, and the plan chip lives on this tile. Its control
              is the Agent page's box. */}
          <AskBoxTile
            basis={data.basis}
            plan={data.planChip}
            composer={<AgentComposer canSend={canSend && !blocked} disabledNote={disabledNote} planLimit={planLimit} />}
          />
          {data.turns.map((turn, i) => (
            <AnswerTile
              key={turn.askedAt + i}
              turn={turn}
              turnIndex={i}
              measure={data.measure}
              // What the question NAMES, read on the market (WP3.9): a
              // subject's own figure and trail, under the first answer.
              about={i === 0 ? data.about : undefined}
            />
          ))}
          {/* ONE FOLLOW-UP CONTROL, AT THE BOTTOM OF THE THREAD: the same box
              as the Agent page, on the page's ground under the last answer,
              where a reader who has just finished reading is (Heinrich, 1 Oct;
              the 22 Aug thread drew it here too). One of it, never one per
              turn: a five-turn thread once drew six boxes with one name. */}
          <div className="w-full pt-1">
            <AgentComposer
              canSend={canSend && !blocked}
              disabledNote={disabledNote}
              threadId={id}
              placeholder="Ask a follow-up in this thread"
              // A follow-up is read over the window the thread was.
              window={data.window ?? undefined}
              planLimit={planLimit}
            />
          </div>
          {deleteControl}
        </AskColumns>
      </AskShell>
    </ExportScope>
  )
}
