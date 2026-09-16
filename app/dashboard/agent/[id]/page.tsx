import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { Card, CardContent } from '@/components/ui/card'
import { AgentComposer } from '@/components/agent-composer'
import { AgentAnswerView } from '@/components/agent-answer'
import { askBasisLine } from '@/lib/agent/basis'
import { AgentDocumentSplit } from '@/components/agent-document-split'
import { ExportMenu, ExportScope } from '@/components/export-menu'
import { canAsk } from '@/lib/agent/access'
import { loadAgentThread } from '@/lib/pages/agent-thread'

// One thread, at its own URL. The whole exchange, oldest first, so it reads as
// the conversation it was rather than as a list of results. The data comes
// from lib/pages/agent-thread.ts (Reports & Exports, 2026-08-29) — the same
// loader the export renders from, so what leaves as a PDF is what is on
// screen: quotes resolved live from stored ids, never stored words.

export default async function AgentThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, clientId, userId, role } = await getSessionContext()
  const [canSend, data] = await Promise.all([
    canAsk(role, userId),
    loadAgentThread({ supabase, clientId, reading: readingHandle(clientId), params: { thread: id } }),
  ])
  if (!data) notFound()

  // The index is the TURN's index, not the answered-turns' — `agent.answer:<i>`
  // renders turn i, so filtering before mapping would point at the wrong one.
  const exportTiles = data.kind === 'question'
    ? data.turns
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t.answer)
        .map(({ i }) => ({ key: `agent.answer:${i}`, title: data.turns.length > 1 ? `Answer ${i + 1}` : 'The answer' }))
    : []
  const head = (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Link
          href="/dashboard/agent"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All questions
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{data.title}</h1>
      </div>
      <div className="mt-1 shrink-0"><ExportMenu /></div>
    </div>
  )

  // A document thread takes over the pane: the check on the left, their
  // document on the right, each scrolling independently. Same shape as an
  // artifact panel, and the reason Heinrich's idea works — the annotation is
  // markup over text WE rendered, so their file is never stored or edited.
  if (data.document) {
    const doc = data.document
    return (
      <ExportScope page="agent" params={{ thread: id }} tiles={[]}>
        <div className="agent-fixed relative flex min-h-0 flex-1 flex-col gap-4">
          {head}
          <AgentDocumentSplit
            claims={doc.claims}
            summary={doc.summary}
            judgement={doc.judgement}
            quotesByClaim={new Map(Object.entries(doc.quotesByClaim).map(([ref, qs]) => [ref, qs.map((q) => q.text)]))}
            segments={doc.segments}
            anchored={doc.anchored}
            notice={doc.notice}
          />
        </div>
      </ExportScope>
    )
  }

  // A DOCUMENT THREAD WITH NO CHECK ON IT. The cap slot is taken before the
  // spend (app/api/agent/route.ts), so a check that fails after the thread is
  // written leaves this behind: the model call failed, the document held no
  // claim about customers or the market, or the check ran and could not be
  // saved. Before this it fell through to the question branch and read "that
  // QUESTION did not get an answer — something went wrong on our side rather
  // than in your data", which for the middle case is false twice over: it was
  // not a question, and the route had just told the reader the fault was a fact
  // about their document. WHICH of the three it was is not recorded — the
  // outcome column is checked to ('answered','partial','silent') and widening
  // it is a migration — so the sentence names both possibilities instead of
  // picking one, and says the thing the reader cannot see: it still counted.
  //
  // No composer either. "Push back, or narrow it down" belongs under an answer;
  // there is nothing here to push back on, and the way to retry a document is
  // to bring it again from the box on the Ask page.
  if (data.kind === 'document') {
    return (
      <ExportScope page="agent" params={{ thread: id }} tiles={[]}>
        <div className="space-y-6">
          {head}
          <Card className="bg-popover">
            <CardContent className="py-5">
              <p className="text-[15px] leading-relaxed text-foreground">
                Nothing was saved against this document. Either nothing in it read as a claim about
                customers or the market, or the check failed on our side before it finished.
              </p>
              <p className="mt-3 text-[13px] text-muted-foreground">
                It still counted as one of this month&rsquo;s questions. You can bring the document
                again from the box on the Ask page.
              </p>
            </CardContent>
          </Card>
        </div>
      </ExportScope>
    )
  }

  const last = data.turns[data.turns.length - 1]
  return (
    <ExportScope page="agent" params={{ thread: id }} tiles={exportTiles}>
      <div className="space-y-6">
        {head}

        <div className="space-y-5">
          {data.turns.map((t, i) => (
            <div key={t.askedAt + i} className="space-y-5">
              {/* The heading above IS the first question — printing it again
                  directly underneath reads as a stutter. Follow-ups still show,
                  because in a thread they are the turn that changed the answer. */}
              {i > 0 && <p className="text-[15px] font-medium text-foreground">{t.question}</p>}
              {(t.answer || t.prose) && (
                <Card className="bg-popover">
                  <CardContent className="py-5">
                    {t.answer ? <AgentAnswerView answer={t.answer} citations={data.citations} /> : <p className="text-[15px] leading-relaxed text-foreground">{t.prose}</p>}
                    {/* AS3 under the answer it is about: which update it was
                        answered against, and how much of the corpus could be
                        searched when it was. The index facts are today's — a
                        thread read today is searched today — and the update is
                        this answer's own. */}
                    <p className="mt-5 border-t border-border/60 pt-3 text-[11.5px] text-muted-foreground">
                      {askBasisLine({ ...data.basis, updateAt: t.updateAt }, { asked: true })}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          ))}
          {/* A question with no answer after it: the call failed and was
              deliberately not written as a silent answer. Saying so is better
              than an exchange that just stops. */}
          {last && !last.answer && !last.prose && (
            <p className="text-sm text-negative">
              That question did not get an answer &mdash; something went wrong on our side rather than in
              your data. Asking it again is safe.
            </p>
          )}
        </div>

        <AgentComposer canSend={canSend} threadId={id} placeholder="Push back, or narrow it down" />
      </div>
    </ExportScope>
  )
}
