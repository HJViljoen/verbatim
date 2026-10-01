import type { ReactNode } from 'react'
import { weekdayDate } from '@/lib/format'
import type { Verdict } from '@/lib/ask/types'
import {
  agentThreadSlides, loadAgentThread, documentPages, findingKey, CLAIMS_PER_SLIDE, GROUNDED_PER_SLIDE,
  type AgentThreadData, type ThreadAnswer, type Turn,
} from '@/lib/pages/agent-thread'
import { fmtInt } from '@/lib/format'
import type { PageModule, Renderable } from '@/lib/renderables/types'
import { findingsBaseLine, ownBase, type AnswerMeasure, type FindingMeasure } from '@/lib/agent/measure'
import { DO_HEADING, JUDGEMENT_HEADING, NEAREST_HEADING, basedOnLine, saidHeading } from '@/lib/agent/types'
import { askBasisLine } from '@/lib/agent/basis'
import { surface } from '@/lib/nav'
import { translationLabel, translationNote } from '@/components/quote-block'

// The agent thread on paper (Reports & Exports T11, 2026-08-29). Question
// mode, in the screen's order (1 Oct): the question and the answer, "What I'd
// do", then "What people said", then anything not asked but close. Document
// mode: the client's own brief with the verdicts in the margin, then claim by
// claim, then the agent's reading.
//
// THE SCREEN'S WORDS AND NOTHING ELSE (§0a, 1 Oct): no "Answered against the
// update of", no line where a point was not measured, a replaced point as the
// product's plain finding, and no quotes and no appendix of them (Heinrich:
// "What people said" is the evidence). A reader must still never mistake "What
// I'd do" for a finding: it carries the screen's own trace to the findings.
//
// EVERY FIGURE ON THIS DECK IS THE SCREEN'S FIGURE (E-ask fix pass). The level
// comes off `AnswerMeasure`, resolved BY TURN through `findingKey`, with the
// screen's own base line (`findingsBaseLine`).

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
    </div>
  )
}

/**
 * A finding's level ON PAPER — the same counted pair the screen prints. Its
 * base is the section's one line (`findingsBaseLine`), as on screen: "13 of
 * 796" with nothing saying what 796 is, beside a Dashboard that says 834, is
 * the question Heinrich asked (1 Oct).
 */
function Level({ f }: { f: FindingMeasure }) {
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

/** The answer itself: the notice, then the model's paragraph or, instead of
 *  it and never beside it, the product's own sentence. */
function Lead({ a }: { a: ThreadAnswer }) {
  return (
    <div className="space-y-4">
      {a.notice && <p className="rounded-lg border border-dashed border-border/60 px-4 py-3 text-[12.5px] text-muted-foreground">{a.notice}</p>}
      {a.answer.trim() !== ''
        ? <p data-copy="prose" className="text-[15px] leading-relaxed text-foreground">{a.answer}</p>
        : a.fallback ? <p className="text-[15px] leading-relaxed text-foreground">{a.fallback}</p> : null}
    </div>
  )
}

/** "What I'd do", as the screen draws it: under the answer, each entry with
 *  its trace to the findings (on the sheets after it, so no "below"). */
function DoBody({ a }: { a: ThreadAnswer }) {
  if (a.judgement.length === 0) return null
  const numberOf = new Map(a.grounded.map((g, i) => [g.id, i + 1]))
  return (
    <section className="mt-5 space-y-3">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{DO_HEADING}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-muted p-3">
        {a.judgement.map((j, i) => {
          const cites = j.basedOn.map((r) => numberOf.get(r)).filter((n): n is number => !!n).sort((x, y) => x - y)
          return (
            <div key={i} className="space-y-1">
              <p data-copy="prose" className="text-[13px] leading-snug text-foreground/85">{j.text}</p>
              <p className="text-[10.5px] text-muted-foreground">{basedOnLine(cites, null)}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** "What people said": the findings, with no quotes under them (1 Oct). */
function FindingsBody({ a, from, to, measure, turnIndex }: {
  a: ThreadAnswer
  from: number
  to: number
  measure: AnswerMeasure | null
  turnIndex: number
}) {
  const points = a.grounded.slice(from, to)
  if (points.length === 0) return null
  return (
    <section className="space-y-3">
      {/* The heading FOLLOWS THE EVIDENCE, as it does on screen, judged over
          the whole answer so a spill onto the next sheet cannot disagree with
          the first about whose customers spoke. */}
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{saidHeading(a.grounded)}{from > 0 ? ' (continued)' : ''}</h3>
      {/* The base, once a sheet, as the screen says it once (round 2). */}
      {(() => {
        const line = findingsBaseLine(a.grounded.map((g) => levelFor(measure, turnIndex, g.id)).filter((f): f is FindingMeasure => f != null))
        return line ? <p data-copy="figure" className="text-[11px] text-muted-foreground">{line}</p> : null
      })()}
      <div className="grid grid-cols-2 gap-3">
        {points.map((p, i) => {
          const f = levelFor(measure, turnIndex, p.id)
          // A replaced point's sentence is its level and base already.
          const measured = f && !p.replaced ? f : null
          const labels = p.themeRefs.map((t) => t.label).filter(Boolean)
          return (
            <div key={p.id} className="space-y-1.5 rounded-lg bg-inner p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 flex-1 text-[13px] leading-snug"><span className="mr-2 font-mono text-[10.5px] font-semibold text-muted-foreground">{from + i + 1}</span><span data-copy={p.replaced ? undefined : 'prose'}>{p.text}</span></p>
                {measured ? <Level f={measured} /> : null}
              </div>
              {measured && ownBase(measured) ? <p data-copy="figure" className="font-mono text-[10px] text-muted-foreground">{ownBase(measured)}</p> : null}
              {labels.length > 0 && <p className="text-[10.5px] text-muted-foreground">Covers: <span data-copy="subject" data-slot="pass_b_theme">{labels.join(' · ')}</span></p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function NearestBody({ a }: { a: ThreadAnswer }) {
  if (a.nearest.length === 0) return null
  return (
    <section className="max-w-[46rem] space-y-3">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{NEAREST_HEADING}</h3>
      {a.nearest.map((n, i) => (
        // NO FIGURE ON A NEAREST POINT. It is not a finding and nothing
        // measured it. The screen prints none either.
        <div key={i} className="rounded-lg border border-dashed border-border/60 p-3">
          <p data-copy="prose" className="min-w-0 flex-1 text-[13px] leading-snug text-foreground/90">{n.text}</p>
        </div>
      ))}
    </section>
  )
}

function Silent({ d }: { d: D }) {
  return (
    <div className="max-w-[46rem] space-y-4">
      <p className="text-[13px] text-secondary-foreground">Nothing in {d.brand}&rsquo;s market speaks to these questions.</p>
      <ul className="space-y-2">
        {d.silentQuestions.map((q, i) => <li key={i} className="font-serif text-[15px] leading-snug">“{q}”</li>)}
      </ul>
    </div>
  )
}

const NO_ANSWER = 'That question did not get an answer. Asking it again is safe.'

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
  const claims = doc.claims.slice(page * CLAIMS_PER_SLIDE, page * CLAIMS_PER_SLIDE + CLAIMS_PER_SLIDE)
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
              <div className="space-y-2">
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

/** One answer as a standalone card (PNG export): the question and the whole
 *  answer, in the screen's order. */
function AnswerCard({ d, turn }: { d: D; turn: number }) {
  const t = d.turns[turn]
  if (!t) return null
  return (
    <div data-tile="" style={{ '--vb-span': 8 } as React.CSSProperties} className="space-y-4 rounded-lg bg-tile p-6">
      <Question t={t} first={turn === 0} d={d} />
      {t.answer ? (
        <>
          <Lead a={t.answer} />
          <DoBody a={t.answer} />
          <FindingsBody a={t.answer} from={0} to={t.answer.grounded.length} measure={d.measure} turnIndex={turn} />
        </>
      ) : <p className="text-[13px]">{t.prose ?? NO_ANSWER}</p>}
      <p className="border-t border-border/70 pt-2 font-mono text-[9.5px] text-muted-foreground">Prepared by {d.brand} · with Verbatim</p>
    </div>
  )
}

/** Keys are computed (`agent.turn:<i>:<part>`, …), so a Proxy resolves them.
 *  A turn's parts, in order: `lead` (the question and the answer), `do`
 *  ("What I'd do"), `0`, `1`, … (the findings, `GROUNDED_PER_SLIDE` a sheet)
 *  and `more` (not what was asked, but close). */
function resolve(key: string): Renderable<D> | undefined {
  const mk = (title: string, render: (d: D) => ReactNode): Renderable<D> => ({ key, title, render })
  let m: RegExpExecArray | null
  if ((m = /^agent\.turn:(\d+):(lead|do|\d+|more)$/.exec(key))) {
    const i = Number(m[1]); const part = m[2]
    return mk('Answer', (d) => {
      const t = d.turns[i]; if (!t) return null
      if (part === 'more') return t.answer ? <NearestBody a={t.answer} /> : null
      if (part === 'do') return t.answer ? <DoBody a={t.answer} /> : null
      if (part === 'lead') {
        return (
          <div className="min-h-0 overflow-hidden">
            <Question t={t} first={i === 0} d={d} />
            {t.answer ? <Lead a={t.answer} /> : <p className="text-[13px]">{t.prose ?? NO_ANSWER}</p>}
          </div>
        )
      }
      const p = Number(part)
      return t.answer ? <FindingsBody a={t.answer} from={p * GROUNDED_PER_SLIDE} to={p * GROUNDED_PER_SLIDE + GROUNDED_PER_SLIDE} measure={d.measure} turnIndex={i} /> : null
    })
  }
  if (key === 'agent.silent') return mk('Nothing in your market speaks to this', (d) => <Silent d={d} />)
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
