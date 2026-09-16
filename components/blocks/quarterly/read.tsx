import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { BlockQuotes } from '@/components/blocks/quote'
import { TokenProse } from '@/components/blocks/prose'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { hasQuote } from '@/lib/renderables/quotes-freeze'
import type { QuarterlyData } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, quarterLabel } from '@/lib/reports/quarterly'
import { Level, Note, Row, Stored } from './parts'

// QR2 · Our read — the interpretation slot, labelled (design §7 item 9).
//
// THE ONE PAGE OF THIS ARTEFACT A MODEL MAY ARGUE ON, and the label is what
// makes that legible. `composeInterpretation('interpretation_quarterly', …)`
// runs both scrubbers over the draft and falls back to code-composed prose when
// nothing usable survives — and SAYS SO, in the note, because a reader who
// cannot tell our sentence from the model's cannot calibrate either.
//
// THE SENTENCES CARRY `[[token]]`s AND NOT DIGITS. The model never saw a value;
// the surface substitutes here. A sentence marked `data-copy="prose"` is then
// checked by rule (a) for digits the model typed itself — which is precisely
// what the marker is for, and why the fallback's sentences are NOT marked as
// prose: code is allowed its numbers.
//
// THE QUOTES ARE SIBLINGS OF THE PROSE, never spans inside it: a quote travels
// as a ref and resolves at render, so an erasure reaches a stored artefact.

export const quarterlyRead: Block<QuarterlyData> = {
  key: 'quarterly.read',
  title: QUARTER_PAGE_TITLE.read,
  question: QUARTER_PAGE_QUESTION.read,

  render(data, mode = 'app') {
    const r = data.read
    const voices = r.quotes.filter(hasQuote)
    const i = r.interpretation
    return (
      <BlockFrame
        title={quarterlyRead.title}
        question={quarterlyRead.question}
        mode={mode}
        meta={quarterLabel(data.quarter)}
      >
        <div>
          <div
            data-copy="verdict"
            style={mode === 'email' ? { fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, letterSpacing: '.6px', textTransform: 'uppercase', color: EMAIL.muted } : undefined}
            className={mode === 'email' ? undefined : 'text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'}
          >
            {i.label}
          </div>
          <Note mode={mode}>
            Our reading of the counted data, not a counted result. Every figure below is printed with what it is out of.
          </Note>
          {i.sentences.map((sentence, n) => (
            <TokenProse key={n} body={sentence} figures={r.figures} mode={mode} model={!i.fallback} />
          ))}
          {i.note ? <Note mode={mode}>{i.note}</Note> : null}

          {r.counted.length > 0 ? (
            <div className={mode === 'email' ? undefined : 'mt-3'}>
              <Note mode={mode} tone="body">What is counted under it</Note>
              {r.counted.map((line, n) => (
                <Row key={n} mode={mode}>{line}</Row>
              ))}
            </div>
          ) : null}

          {/* THE QUOTES THAT SURVIVED, and a wrapper is not one. A withdrawn
              comment leaves `{ quote: null, cite }` behind (the quote is a
              FIELD here, not an array member, so `resolveQuotes` nulls it
              rather than dropping it) — this list counted those and then read
              `q.quote.ref`. */}
          {voices.length > 0 ? (
            <div className={mode === 'email' ? undefined : 'mt-3'}>
              <BlockQuotes mode={mode} quotes={voices.map((q) => ({ quote: q.quote, cite: q.cite }))} />
            </div>
          ) : null}

          {r.advice.length > 0 ? (
            <div className={mode === 'email' ? undefined : 'mt-3'}>
              <Note mode={mode} tone="body">Standing advice, by age</Note>
              {r.advice.map((a) => (
                <Row
                  key={a.id}
                  mode={mode}
                  label={<Stored slot="pass_d_b_recommendation">{a.title}</Stored>}
                  aside={<Note mode={mode}>{a.status} · {a.decidedAt ? `you decided ${fullDate(a.decidedAt)}` : 'no decision yet'}</Note>}
                >
                  {a.age}
                </Row>
              ))}
            </div>
          ) : (
            <Note mode={mode}>{r.adviceNote ?? 'No advice stands on this workspace yet.'}</Note>
          )}

          <div className={mode === 'email' ? undefined : 'mt-3'}>
            <Level mode={mode} word={`Confidence: ${r.confidence.word}`} of={r.confidence.why} />
          </div>
        </div>
      </BlockFrame>
    )
  },

  figures(data) {
    return data.read.figures
  },

  verdicts(data) {
    return data.read.verdicts
  },

  quotes(data) {
    return data.read.quotes.filter(hasQuote).map((q) => q.quote.ref).filter(Boolean)
  },

  emptyState(data) {
    // An interpretation slot is never empty — the composer writes the read
    // itself when the model says nothing usable, and says that it did.
    return data.read.interpretation.sentences.length > 0
      ? null
      : 'Nothing this quarter cleared a band, so there is no read to write over it.'
  },
}
