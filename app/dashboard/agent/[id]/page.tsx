import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { AgentDocumentSplit } from '@/components/agent-document-split'
import { ExportScope } from '@/components/export-menu'
import { Tile, TileEmpty } from '@/components/shell/tile'
import { canAsk } from '@/lib/agent/access'
import { askBasisLine, nothingSearchable } from '@/lib/agent/basis'
import { shortDate } from '@/lib/format'
import { loadAgentThread } from '@/lib/pages/agent-thread'
import { AgentComposer } from '@/components/agent-composer'
import { AnswerTile } from '@/components/pages/agent/answer'
import { AskBoxTile } from '@/components/pages/agent/ask-box'
import { DrawsTile, EarlierQuestionsTile, NotAnsweredTile } from '@/components/pages/agent/rail'
import { ASK_TILE_ROW, AskColumns, AskShell } from '@/components/pages/agent/surface'

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
  const { supabase, clientId, userId, role } = await getSessionContext()
  const [canSend, data] = await Promise.all([
    canAsk(role, userId),
    loadAgentThread({ supabase, clientId, reading: readingHandle(clientId), params: { ...sp, thread: id } }),
  ])
  if (!data) notFound()
  // The one state where a follow-up cannot work, read off the basis this page
  // already loads (the landing page's own predicate, same sentence).
  const blocked = nothingSearchable(data.basis)
  const disabledNote = blocked && canSend ? 'Nothing is searchable yet, so there is nothing to answer from' : undefined
  const record = data.record ? { line: data.record.lines[0], lines: data.record.lines } : null

  // The index is the TURN's index, not the answered-turns' — `agent.answer:<i>`
  // renders turn i, so filtering before mapping would point at the wrong one.
  const exportTiles = data.kind === 'question'
    ? data.turns
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t.answer)
        .map(({ i }) => ({ key: `agent.answer:${i}`, title: data.turns.length > 1 ? `Answer ${i + 1}` : 'The answer' }))
    : []

  const back = (
    <Link
      href="/dashboard/agent"
      className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      All questions
    </Link>
  )

  const rail = (
    <>
      <EarlierQuestionsTile history={data.history} row={ASK_TILE_ROW} />
      <DrawsTile
        draws={data.draws}
        asAt={data.basis.lastEmbeddedAt ? shortDate(data.basis.lastEmbeddedAt) : null}
        row={ASK_TILE_ROW}
      />
      <NotAnsweredTile notAnswered={data.notAnswered} row={ASK_TILE_ROW} />
    </>
  )

  // A document thread takes the left column: the check on the left, their
  // document on the right, each scrolling independently. Same shape as an
  // artifact panel, and the reason Heinrich's idea works — the annotation is
  // markup over text WE rendered, so their file is never stored or edited.
  if (data.document) {
    const doc = data.document
    return (
      <ExportScope page="agent" params={{ thread: id }} tiles={[]}>
        <AskShell context={data.bar.context} record={record} params={sp}>
          {back}
          <Tile col={12} row={6} eyebrow="The plan check" meta={data.method.period}>
            {/* AS3, as the exported deck carries it: what this document was
                CHECKED against. A document thread has no answer to hang it
                under, which is how the screen and the deck both came to leave
                it off. */}
            <p className="m-0 font-mono text-[11px] text-muted-foreground">
              {askBasisLine(data.basis, { asked: true, verb: 'Checked' })}
            </p>
            <AgentDocumentSplit
              claims={doc.claims}
              summary={doc.summary}
              judgement={doc.judgement}
              quotesByClaim={new Map(Object.entries(doc.quotesByClaim).map(([ref, qs]) => [ref, qs.map((q) => q.text)]))}
              segments={doc.segments}
              anchored={doc.anchored}
              notice={doc.notice}
            />
          </Tile>
        </AskShell>
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
        <AskShell context={data.bar.context} record={record} params={sp}>
          {back}
          <AskColumns rail={rail}>
            <Tile col={12} row={2} eyebrow="The plan check" meta="nothing saved">
              <TileEmpty>
                Nothing was saved against this document. Either nothing in it read as a claim about customers or the
                market, or the check failed on our side before it finished. It still counted as one of this
                month&rsquo;s questions, and you can bring the document again from the box on Ask.
              </TileEmpty>
            </Tile>
          </AskColumns>
        </AskShell>
      </ExportScope>
    )
  }

  return (
    <ExportScope page="agent" params={{ thread: id }} tiles={exportTiles}>
      <AskShell context={data.bar.context} record={record} params={sp}>
        {back}
        <AskColumns rail={rail}>
          {/* THE ASK BOX STAYS ABOVE THE ANSWER, as the artboard draws it: a
              reader with an answer in front of them is one keystroke from the
              next question, and the plan chip lives on this tile. */}
          <AskBoxTile
            basis={data.basis}
            plan={data.planChip}
            row={ASK_TILE_ROW}
            composer={<AgentComposer canSend={canSend && !blocked} disabledNote={disabledNote} />}
          />
          {/* ONE FOLLOW-UP CONTROL, ON THE LAST ANSWER. Every tile used to get
              its own, all with the same threadId, the same placeholder and the
              same aria-label — a five-turn thread rendered six ask boxes and a
              screen reader six controls with one name and no way to tell them
              apart. The artboard draws one follow-up, under the answer, which
              is also where a reader who has just finished reading is. */}
          {data.turns.map((turn, i) => (
            <AnswerTile
              key={turn.askedAt + i}
              turn={turn}
              turnIndex={i}
              measure={data.measure}
              citations={data.citations}
              basis={data.basis}
              // AS3 where it CHANGES, not under every answer — a five-turn
              // thread answered inside one week printed the same two-line mono
              // paragraph five times (`AnswerTile.prevUpdateAt`).
              prevUpdateAt={i > 0 ? data.turns[i - 1].updateAt : undefined}
              row={ASK_TILE_ROW}
              composer={
                i === data.turns.length - 1 ? (
                  <AgentComposer
                    canSend={canSend && !blocked}
                    disabledNote={disabledNote}
                    threadId={id}
                    placeholder="Ask a follow-up in this thread"
                  />
                ) : undefined
              }
            />
          ))}
        </AskColumns>
      </AskShell>
    </ExportScope>
  )
}
