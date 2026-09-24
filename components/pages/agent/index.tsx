import type { ReactNode } from 'react'
import { weekdayDate } from '@/lib/format'
import type { Verdict } from '@/lib/ask/types'
import {
  agentThreadSlides, loadAgentThread, documentPages, findingKey, CITATIONS_PER_SLIDE, GROUNDED_PER_SLIDE,
  type AgentThreadData, type ThreadAnswer, type Turn,
} from '@/lib/pages/agent-thread'
import { fmtInt } from '@/lib/format'
import type { PageModule, Renderable } from '@/lib/renderables/types'
import type { AnswerMeasure, FindingMeasure } from '@/lib/agent/measure'
import { JUDGEMENT_HEADING, NEAREST_HEADING, citationDestination, citationWhere, saidHeading } from '@/lib/agent/types'
import { askBasisLine } from '@/lib/agent/basis'
import { surface } from '@/lib/nav'
import { translationLabel, translationNote } from '@/components/quote-block'

// The agent thread on paper (Reports & Exports T11, 2026-08-29). Question
// mode: the question, the answer, "what your customers said" with a
// superscript per quote, then the evidence appendix — every quoted voice
// with platform · date · link — and, honestly, the questions nothing in the
// data spoke to. Document mode: the client's own brief with the verdicts in
// the margin, then claim by claim, then the agent's reading.
//
// The three registers keep their words: what the customers said · not what you
// asked, but close · what I'd take from that. A reader must never mistake the
// third for the first.
//
// EVERY FIGURE ON THIS DECK IS THE SCREEN'S FIGURE (E-ask fix pass). Each
// grounded point printed `conversationCount` — a retrieval count with no
// denominator, in the noun AGENTS.md reserves for the legacy pages — while the
// screen beside it printed the month table's k with its n. The route that
// mounts Export says in its own header that what leaves as a PDF is what is on
// screen, so the level comes off `AnswerMeasure`, resolved BY TURN through
// `findingKey`, and a point nothing measured says so rather than printing a
// count instead.

type D = AgentThreadData

const VERDICT: Record<Verdict, { label: string; cls: string; mark: string }> = {
  echoes: { label: 'Supported', cls: 'bg-accent text-accent-foreground', mark: 'bg-primary/15' },
  contradicts: { label: 'Contradicted', cls: 'bg-negative/12 text-negative', mark: 'bg-negative/12' },
  silent: { label: 'Untested', cls: 'bg-muted text-muted-foreground', mark: '' },
}

function Sup({ n }: { n: number }) {
  return <sup className="ml-0.5 font-mono text-[9px] text-muted-foreground">{n}</sup>
}

function Question({ t, first, d }: { t: Turn; first: boolean; d: D }) {
  return (
    <div className="mb-4">
      {!first && <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Follow-up</p>}
      <p className="font-serif text-[19px] font-medium leading-snug [text-wrap:pretty]">{t.question}</p>
      <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">{d.brand} · {weekdayDate(t.askedAt)}</p>
      {/* AS3 on the artefact. A deck that leaves the building carries what it
          was answered against, or a reader six weeks later has no way to know
          which update — or how much of the corpus — is behind it. */}
      <p className="mt-1 font-mono text-[9.5px] text-muted-foreground">{askBasisLine({ ...d.basis, updateAt: t.updateAt }, { asked: true })}</p>
    </div>
  )
}

/**
 * A finding's level ON PAPER — the same counted pair the screen prints.
 *
 * WHAT THIS REPLACED, AND WHY IT HAD TO. This slide printed
 * `GroundedPoint.conversationCount` as "130 conversations": a bare retrieval
 * count with no denominator, in the one noun AGENTS.md reserves for the legacy
 * pages that still compute it, and the exact figure `AnswerFooter`'s own
 * docstring says must never be used. The route that mounts Export states in its
 * header that "what leaves as a PDF is what is on screen" — and the screen
 * prints the month table's k with its n. A deck that disagrees with the screen
 * about one answer is worse than a deck with no figure on it.
 */
function Level({ f }: { f: FindingMeasure | null }) {
  if (!f) {
    // Absent, not zero — the screen's own sentence for the same state.
    return <span className="shrink-0 font-mono text-[10px] text-muted-foreground">no month reading behind this</span>
  }
  return (
    <span data-copy="level" className="shrink-0 font-mono text-[10.5px] text-foreground tabular-nums">
      {fmtInt(f.value.k)} of {fmtInt(f.value.n)} videos
    </span>
  )
}

/** This TURN's measurement for one grounded point, by the key the loader wrote
 *  — never `findings[0]`, which is turn 0's on every turn. */
const levelFor = (measure: AnswerMeasure | null, turnIndex: number, id: string): FindingMeasure | null =>
  measure?.findings.find((x) => x.findingId === findingKey(turnIndex, id)) ?? null

function AnswerBody({ a, from, to, measure, turnIndex }: {
  a: ThreadAnswer
  from: number
  to: number
  measure: AnswerMeasure | null
  turnIndex: number
}) {
  const points = a.grounded.slice(from, to)
  return (
    <div className="space-y-4">
      {from === 0 && a.notice && <p className="rounded-lg border border-dashed border-border/60 px-4 py-3 text-[12.5px] text-muted-foreground">{a.notice}</p>}
      {/* Instead of, never beside — see AgentAnswerView. A deck that leaves the
          building may not carry a blank where the answer was. */}
      {from === 0 && a.answer.trim() !== '' && <p className="text-[15px] leading-relaxed text-foreground">{a.answer}</p>}
      {from === 0 && a.answer.trim() === '' && a.fallback && <p className="text-[15px] leading-relaxed text-muted-foreground">{a.fallback}</p>}
      {points.length > 0 && (
        <section className="space-y-3">
          {/* The heading FOLLOWS THE EVIDENCE, as it does on screen. It was
              hard-coded here while the field that decides it travelled through
              the loader untouched — so the one renderer that leaves the
              building was the one that could print "your customers" over
              another brand's audience. Judged over the whole answer, not over
              this slide's two points, or a spill onto page two could disagree
              with page one about whose customers spoke. */}
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{saidHeading(a.grounded)}{from > 0 ? ' (continued)' : ''}</h3>
          <div className="grid grid-cols-2 gap-3">
            {points.map((p, i) => (
              <div key={p.id} className="space-y-2 rounded-lg bg-inner p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 flex-1 text-[13px] leading-snug"><span className="mr-2 font-mono text-[10.5px] font-semibold text-muted-foreground">{from + i + 1}</span>{p.text}</p>
                  <Level f={levelFor(measure, turnIndex, p.id)} />
                </div>
                {p.quotes.map((q) => (
                  <blockquote key={q.n} className="border-l-2 border-border pl-2.5 font-serif text-[12.5px] leading-[1.45] text-foreground">“{q.text}”<Sup n={q.n} /><PdfEnglish q={q} /></blockquote>
                ))}
                {p.themeRefs.length > 0 && <p className="text-[10.5px] text-muted-foreground">{p.themeRefs.map((t) => t.label).filter(Boolean).join(' · ')}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function MoreBody({ a }: { a: ThreadAnswer }) {
  const numberOf = new Map(a.grounded.map((g, i) => [g.id, i + 1]))
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-8">
      {a.nearest.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{NEAREST_HEADING}</h3>
          {a.nearest.map((n, i) => (
            // NO FIGURE ON A NEAREST POINT. It is not a finding, nothing
            // measured it, and the count that used to sit here was the same
            // denominator-less retrieval figure. The screen prints none either.
            <div key={i} className="rounded-lg border border-dashed border-border/60 p-3">
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-foreground/90">{n.text}</p>
            </div>
          ))}
        </section>
      )}
      {a.judgement.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{JUDGEMENT_HEADING}</h3>
          <div className="space-y-3 rounded-lg bg-muted p-3">
            {a.judgement.map((j, i) => {
              const cites = j.basedOn.map((r) => numberOf.get(r)).filter((n): n is number => !!n).sort((x, y) => x - y)
              return (
                <div key={i} className="space-y-1">
                  <p className="text-[13px] leading-snug text-foreground/85">{j.text}</p>
                  <p className="text-[10.5px] text-muted-foreground">{cites.length ? `Reasoning from ${cites.length === 1 ? 'finding' : 'findings'} ${cites.join(', ')}.` : 'Not drawn from any single finding. This one is inference.'}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function Citations({ d, from, to }: { d: D; from: number; to: number }) {
  const rows = d.citations.slice(from, to)
  return (
    <div className="grid h-full min-h-0 grid-cols-3 gap-x-6 gap-y-3 content-start">
      {rows.map((c) => (
        <div key={c.n} className="flex gap-2 text-[12px] leading-[1.4]">
          <span className="w-5 shrink-0 font-mono text-[10.5px] text-muted-foreground">{c.n}</span>
          <div className="min-w-0">
            <p className="font-serif text-foreground">“{c.text}”</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
              {/* The screen's own rendering, through the shared helper: this
                  appendix printed the stored `2026-08-30` while the answer on
                  screen said "30 Aug" for the same numbered quote. */}
              {citationWhere(c) || 'source on file'}
              {c.href && <> · <a href={c.href} className="underline decoration-dotted underline-offset-2">{citationDestination(c)}</a></>}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function Silent({ d }: { d: D }) {
  return (
    <div className="max-w-[46rem] space-y-4">
      <p className="text-[13px] text-secondary-foreground">The conversation analysed for {d.brand} did not speak to these.</p>
      <ul className="space-y-2">
        {d.silentQuestions.map((q, i) => <li key={i} className="font-serif text-[15px] leading-snug">“{q}”</li>)}
      </ul>
    </div>
  )
}

/** The client's brief with the verdicts in the margin. */
function DocumentPage({ d, page }: { d: D; page: number }) {
  const doc = d.document!
  const [from, to] = documentPages(doc.segments)[page] ?? [0, 0]
  const segs = doc.segments.slice(from, to)
  const numberOf = new Map(doc.claims.map((c, i) => [c.ref, i + 1]))
  const refsHere = [...new Set(segs.map((s) => s.ref).filter((r): r is string => !!r))]
  const claimsHere = doc.claims.filter((c) => refsHere.includes(c.ref))
  return (
    <div className="grid h-full min-h-0 grid-cols-[3fr_1.3fr] gap-8">
      <div className="min-h-0 overflow-hidden">
        {page === 0 && (
          <p className="mb-3 font-mono text-[10.5px] text-muted-foreground">
            {doc.summary.supported} supported · {doc.summary.contradicted} contradicted · {doc.summary.untested} untested
          </p>
        )}
        {/* AS3 on the document deck. The clipped-reading notice below says how
            much of the document was read; this says what it was read AGAINST,
            which a reader six weeks from now has no other way to recover. The
            question deck has carried it since AS3 landed and this one did not —
            agentThreadSlides returns early for a document, so none of its
            slides passed through the Question component that renders it. */}
        {page === 0 && (
          <p className="mb-3 font-mono text-[9.5px] text-muted-foreground">
            {askBasisLine(d.basis, { asked: true, verb: 'Checked' })}
          </p>
        )}
        {/* Where the reading stopped, on the page that leaves the building. A
            deck showing verdicts over a document it only half read, without
            saying so, is the one thing a PDF must not do. */}
        {page === 0 && doc.notice && (
          <p className="mb-3 text-[11px] text-muted-foreground">{doc.notice}</p>
        )}
        <p className="whitespace-pre-wrap font-serif text-[12.5px] leading-[1.6] text-foreground">
          {segs.map((s, i) => {
            const claim = s.ref ? doc.claims.find((c) => c.ref === s.ref) : null
            if (!claim || claim.verdict === 'silent') return <span key={i}>{s.text}</span>
            return <mark key={i} className={`rounded-[2px] px-0.5 ${VERDICT[claim.verdict].mark}`}>{s.text}<Sup n={numberOf.get(claim.ref) ?? 0} /></mark>
          })}
        </p>
      </div>
      <div className="min-h-0 space-y-2 overflow-hidden">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">In the margin</p>
        {claimsHere.length === 0 && <p className="text-[12px] text-muted-foreground">No claim on this page.</p>}
        {claimsHere.map((c) => (
          <div key={c.ref} className="rounded-lg bg-inner p-2.5">
            <div className="flex items-start gap-2">
              <span className="font-mono text-[10.5px] text-muted-foreground">{numberOf.get(c.ref)}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${VERDICT[c.verdict].cls}`}>{VERDICT[c.verdict].label}</span>
            </div>
            <p className="mt-1 text-[12px] leading-snug">{c.claim}</p>
            {c.verdict !== 'silent' && c.theySay && <p className="mt-1 text-[11px] leading-snug text-secondary-foreground">{c.theySay}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function ClaimsPage({ d, page }: { d: D; page: number }) {
  const doc = d.document!
  const claims = doc.claims.slice(page * GROUNDED_PER_SLIDE, page * GROUNDED_PER_SLIDE + GROUNDED_PER_SLIDE)
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-4 content-start">
      {claims.map((c) => {
        const i = doc.claims.indexOf(c)
        const quotes = doc.quotesByClaim[c.ref] ?? []
        return (
          <div key={c.ref} className="space-y-2 rounded-lg bg-inner p-3">
            <div className="flex items-start gap-3">
              <span className="font-mono text-[10.5px] font-semibold text-muted-foreground">{i + 1}</span>
              <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{c.claim}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${VERDICT[c.verdict].cls}`}>{VERDICT[c.verdict].label}</span>
            </div>
            {!doc.anchored.includes(c.ref) && <p className="text-[10.5px] text-muted-foreground">Not stated directly in the document.</p>}
            {c.verdict !== 'silent' && (
              <div className="space-y-2 border-l-2 border-border pl-2.5">
                {quotes.map((q, k) => <blockquote key={k} className="font-serif text-[12px] leading-[1.45]">“{q.text}”<PdfEnglish q={q} /></blockquote>)}
                {c.theySay && <p className="text-[12px] leading-snug text-foreground/85">{c.theySay}</p>}
                {/* The theme names alone. The count that stood here was the
                    same denominator-less retrieval figure, and the document
                    screen (`AgentDocumentSplit`) prints none. */}
                {c.themeRefs?.length ? <p className="text-[10.5px] text-muted-foreground">{c.themeRefs.map((t) => t.label).filter(Boolean).join(' · ')}</p> : null}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DocJudgement({ d }: { d: D }) {
  const doc = d.document!
  const numberOf = new Map(doc.claims.map((c, i) => [c.ref, i + 1]))
  return (
    <div className="max-w-[46rem] space-y-3 rounded-lg bg-muted p-4">
      {doc.judgement.map((j, i) => {
        const cites = (j.basedOnRefs ?? []).map((r) => numberOf.get(r)).filter((n): n is number => !!n).sort((x, y) => x - y)
        return (
          <div key={i} className="space-y-1">
            <p className="text-[13.5px] leading-snug text-foreground/85">{j.text}</p>
            <p className="text-[10.5px] text-muted-foreground">{cites.length ? `Reasoning from ${cites.length === 1 ? 'claim' : 'claims'} ${cites.join(', ')}.` : 'Not drawn from any single claim. This one is inference.'}</p>
          </div>
        )
      })}
    </div>
  )
}

/** One answer as a standalone card (PNG export): the question and the whole answer. */
function AnswerCard({ d, turn }: { d: D; turn: number }) {
  const t = d.turns[turn]
  if (!t) return null
  return (
    <div data-tile="" style={{ '--vb-span': 8 } as React.CSSProperties} className="space-y-4 rounded-lg bg-tile p-6">
      <Question t={t} first={turn === 0} d={d} />
      {t.answer ? <AnswerBody a={t.answer} from={0} to={t.answer.grounded.length} measure={d.measure} turnIndex={turn} /> : <p className="text-[13px]">{t.prose}</p>}
      {t.answer && t.answer.judgement.length > 0 && <MoreBody a={{ ...t.answer, nearest: [] }} />}
      <p className="border-t border-border/70 pt-2 font-mono text-[9.5px] text-muted-foreground">Prepared by {d.brand} · with Verbatim · quoted voices are real comments, on file</p>
    </div>
  )
}

/** Keys are computed (`agent.turn:<i>:<p>`, `agent.citations:<c>`, …), so a
 *  Proxy resolves them; the static map lists what is stable. */
function resolve(key: string): Renderable<D> | undefined {
  const mk = (title: string, render: (d: D) => ReactNode): Renderable<D> => ({ key, title, render })
  let m: RegExpExecArray | null
  if ((m = /^agent\.turn:(\d+):(\d+|more)$/.exec(key))) {
    const i = Number(m[1]); const part = m[2]
    return mk('Answer', (d) => {
      const t = d.turns[i]; if (!t) return null
      if (part === 'more') return t.answer ? <MoreBody a={t.answer} /> : null
      const p = Number(part)
      return (
        <div className="min-h-0 overflow-hidden">
          {p === 0 && <Question t={t} first={i === 0} d={d} />}
          {t.answer ? <AnswerBody a={t.answer} from={p * GROUNDED_PER_SLIDE} to={p * GROUNDED_PER_SLIDE + GROUNDED_PER_SLIDE} measure={d.measure} turnIndex={i} /> : <p className="text-[13px]">{t.prose ?? 'That question did not get an answer. Something went wrong on our side rather than in the data.'}</p>}
        </div>
      )
    })
  }
  if ((m = /^agent\.citations:(\d+)$/.exec(key))) { const c = Number(m[1]); return mk('Evidence', (d) => <Citations d={d} from={c * CITATIONS_PER_SLIDE} to={c * CITATIONS_PER_SLIDE + CITATIONS_PER_SLIDE} />) }
  if (key === 'agent.silent') return mk('Nothing in the data speaks to this', (d) => <Silent d={d} />)
  if ((m = /^agent\.doc:(\d+)$/.exec(key))) { const p = Number(m[1]); return mk('The brief, checked', (d) => (d.document ? <DocumentPage d={d} page={p} /> : null)) }
  if ((m = /^agent\.claims:(\d+)$/.exec(key))) { const p = Number(m[1]); return mk('Claim by claim', (d) => (d.document ? <ClaimsPage d={d} page={p} /> : null)) }
  if (key === 'agent.judgement') return mk(JUDGEMENT_HEADING, (d) => (d.document ? <DocJudgement d={d} /> : null))
  if ((m = /^agent\.answer:(\d+)$/.exec(key))) { const i = Number(m[1]); return mk(`Answer ${i + 1}`, (d) => <AnswerCard d={d} turn={i} />) }
  return undefined
}

const renderables: Record<string, Renderable<D>> = new Proxy({} as Record<string, Renderable<D>>, {
  get: (_t, key: string | symbol) => (typeof key === 'string' ? resolve(key) : undefined),
  has: (_t, key: string | symbol) => typeof key === 'string' && !!resolve(key),
})

/**
 * WHAT THIS SURFACE IS CALLED, FROM THE ONE TABLE.
 *
 * These three strings said "Verbatim Agent", "Agent" and "Verbatim Agent"
 * while `lib/nav.ts` — whose own docstring is about exactly this ("the sidebar
 * label AND the page title — one string, deliberately") — and the artboard
 * both say **Ask**. `lib/reports/build.ts:69` puts `printContext` in the slide
 * header, so a deck reached from a sidebar item called Ask carried a header
 * saying "Verbatim Agent" over a footer saying "the agent". Reading the label
 * off `surface('ask')` means the day it is renamed again, it is renamed once.
 */
const ASK = surface('ask').label

export const agentPage: PageModule<D> = {
  key: 'agent',
  title: ASK,
  load: loadAgentThread,
  slides: agentThreadSlides,
  renderables,
  snapshotTitle: (d) => `${d.kind === 'document' ? 'Document check' : ASK} · ${d.title.slice(0, 80)} · ${weekdayDate(d.createdAt)}`,
  printContext: (d) => `${d.kind === 'document' ? 'Document check' : ASK} · ${d.brand} · ${weekdayDate(d.createdAt)}`,
}

/** A voice's English on paper, under the original with the language stamp,
 *  in the order every quote renderer keeps (QuoteBlock). The deck printed the
 *  raw words alone, so a Korean question read untranslated here while the same
 *  quote on screen carried its English (sweep 2026-09-24). */
function PdfEnglish({ q }: { q: { lang?: string | null; english?: string | null } }) {
  const note = translationNote(q)
  const label = translationLabel(note)
  if (!label) return null
  return (
    <>
      <span className="mt-1 block font-mono text-[9.5px] not-italic text-muted-foreground">{label}</span>
      {note.english ? <span data-copy="quote" className="block text-[12px] text-muted-foreground">{note.english}</span> : null}
    </>
  )
}
