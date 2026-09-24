import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { BlockQuotes } from '@/components/blocks/quote'
import { TokenProse } from '@/components/blocks/prose'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { splitSentences } from '@/lib/prose/scrub'
import { hasQuote } from '@/lib/renderables/quotes-freeze'
import type { QuarterlyData, ReadPage } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, quarterLabel, withoutReadingCounter } from '@/lib/reports/quarterly'
import { Bullet, Card, Chip, Column, Columns, Dots, Eyebrow, Level, Note, Row, Stored } from './parts'

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
//
// ---- the port (Block D wave 2) -------------------------------------------------
//
// THE ARTBOARD SPLITS THIS PAGE 7fr / 5fr. Left is the argument: the eyebrow
// with its amber Interpretation chip, then the argument's own first sentence as
// a 24px headline, then the rest at reading size, then the quote and its cite.
// Right is a hairline card holding the corpus meta, "What it means", the
// standing advice by age, and the confidence dots at the foot.
//
// THE HEADLINE IS THE SLOT'S FIRST SENTENCE, NOT A SECOND PIECE OF PROSE.
// mock-gap `qr.p2.headline`: "the argument's first sentence prints at body size
// in the same stack as the rest" and the mock's 24px line "has no counterpart
// node". It has one now, and it is the same sentence through the same
// `TokenProse` — still scrubbed, still figure-tokenised, just set larger.
//
// AND "WHAT IT MEANS" IS THE SLOT'S LAST SENTENCE (`qr.p2.whatitmeans`, the one
// element on this page wave 1 found needs no new code). It is split off only
// where the slot wrote THREE OR MORE sentences: below that the argument is one
// or two lines and cutting the last one out of it leaves a headline with no
// body and a card with an orphan. Where it is not split the card says so
// through `interpretation.note`, which is also where the fallback declares
// itself.

/**
 * The interpretation, cut the way the artboard lays it out.
 *
 * IT SPLITS SENTENCES, NOT ARRAY ELEMENTS. `Interpretation.sentences` is one
 * MODEL sentence per element where a model wrote it (`splitSentences` in
 * `composeInterpretation`) and one composed CLAUSE GROUP per element where the
 * code did — and the quarterly fallback's first element is two sentences:
 * "Durability cleared the band this quarter. Everything else on this page is a
 * level, not a change." Cutting on elements therefore set the whole argument
 * at 22px on every state this branch can render, which is not a headline; it
 * is the slot in a larger face. Splitting first makes the headline one
 * sentence wherever the words came from.
 */
function argument(i: ReadPage['interpretation']): { headline: string | null; body: string[]; means: string | null } {
  const s = i.sentences.flatMap((sentence) => {
    const parts = splitSentences(sentence)
    return parts.length > 0 ? parts : [sentence]
  })
  if (s.length === 0) return { headline: null, body: [], means: null }
  if (s.length < 3) return { headline: s[0], body: s.slice(1), means: null }
  return { headline: s[0], body: s.slice(1, -1), means: s[s.length - 1] }
}

export const quarterlyRead: Block<QuarterlyData> = {
  key: 'quarterly.read',
  title: QUARTER_PAGE_TITLE.read,
  question: QUARTER_PAGE_QUESTION.read,

  render(data, mode = 'app') {
    const r = data.read
    const voices = r.quotes.filter(hasQuote)
    const i = r.interpretation
    const { headline, body, means } = argument(i)
    const email = mode === 'email'

    const left = (
      <Column mode={mode} gap={9}>
        <Eyebrow mode={mode} aside={<Chip tone="amber" mode={mode}>{i.label}</Chip>}>The quarter in one argument</Eyebrow>
        {/* THE ARTBOARD'S OWN SIZE, THROUGH THE DECK'S ZOOM.
            `.vb-slide-body` lays out at 1168px and is zoomed to 0.902 to fit
            the 297mm sheet, so a nominal px value lands at 90% of the drawing
            at the same physical size: the artboard's 24px headline is 21.7px
            of paper when it is coded as 24, and it was coded as 22 — 19.8px,
            close enough to the 12.5px body around it that it did not read as
            a headline at all. 27 and 15 are the artboard's 24 and 14 DIVIDED
            by the zoom, which is what makes them the drawing's size on paper.
            The rest of the deck keeps the nominal scale, and that is a
            recorded deviation, not an oversight: every other sheet spends the
            difference on rows, and page 2 is the one with room. */}
        {/* THE SIZE GOES ON THE `<p>`, NOT ON A WRAPPER AROUND IT.
            `TokenProse` renders `className ?? 'm-0 text-[13.5px]
            leading-relaxed'`, so a size set on a parent div was overridden by
            the paragraph's own default and the "headline" has been 13.5px on
            every sheet this branch ever rendered — the same size as the body
            beside it. It is the artboard's own 24px divided by the deck's
            0.902 zoom, which is what makes it the drawing's size on paper. */}
        {headline ? (
          <TokenProse
            body={headline}
            figures={r.figures}
            mode={mode}
            model={!i.fallback}
            className={email ? undefined : 'm-0 max-w-[30ch] text-[27px] font-semibold leading-[1.15] tracking-[-0.02em] [text-wrap:balance]'}
          />
        ) : null}
        <div className={email ? undefined : 'flex max-w-[66ch] flex-col gap-2'}>
          {body.map((sentence, n) => (
            <TokenProse
              key={n}
              body={sentence}
              figures={r.figures}
              mode={mode}
              model={!i.fallback}
              className={email ? undefined : 'm-0 text-[15px] leading-[1.5]'}
            />
          ))}
        </div>

        {r.counted.length > 0 ? (
          <div className={email ? undefined : 'mt-1'}>
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
          <div className={email ? undefined : 'mt-auto'}>
            <BlockQuotes mode={mode} quotes={voices.map((q) => ({ quote: q.quote, cite: q.cite }))} />
          </div>
        ) : null}
      </Column>
    )

    const right = (
      <Column mode={mode} gap={12}>
        <Card mode={mode}>
          {/* THE CORPUS THE ARGUMENT RESTS ON, beside the argument. Three facts
              that existed on pages 1 and 7 and never on the page that argues. */}
          <p className={email ? undefined : 'm-0 font-mono text-[11.5px] leading-[1.5] text-muted-foreground'}
            style={email ? { fontFamily: FONT.mono, fontSize: 11.5, lineHeight: 1.5, color: EMAIL.muted } : undefined}
          >
            <span data-copy="figure">{withoutReadingCounter(r.meta)}</span>
          </p>

          {means ? (
            <div className={email ? undefined : 'flex flex-col gap-2'}>
              <Eyebrow mode={mode}>What it means</Eyebrow>
              <TokenProse
                body={means}
                figures={r.figures}
                mode={mode}
                model={!i.fallback}
                className={email ? undefined : 'm-0 text-[13px] leading-[1.45]'}
              />
            </div>
          ) : null}
          {/* NO PROVENANCE NOTE (copy de-clutter L9): a review frozen with one
              still carries it, and it is not printed. */}

          <div className={email ? undefined : 'flex flex-col gap-2'}>
            <Eyebrow mode={mode}>Standing advice, by age</Eyebrow>
            {r.advice.length > 0 ? (
              r.advice.map((a) => (
                <Bullet key={a.id} mode={mode}>
                  <Stored slot="pass_d_b_recommendation">{a.title}</Stored>
                  {' · '}{a.age}{'. '}
                  {/* `qr.p2.standingadvice` · the grounding count, and the
                      PRUNED sentence where a later update replaced every row
                      the advice cited. `Grounding.line` names the population
                      it is a count of; a zero with no explanation would be a
                      claim about the evidence rather than about our own
                      re-analysis. */}
                  {a.grounded ? <><span data-copy="figure">{a.grounded.line.replace(/,? counted over everything we have read for you.*$/, '')}</span>{' '}</> : null}
                  {a.status}{a.decidedAt ? ` · you decided ${fullDate(a.decidedAt)}` : ' · no decision yet'}
                </Bullet>
              ))
            ) : (
              <Note mode={mode}>{r.adviceNote ?? 'No advice stands on this workspace yet.'}</Note>
            )}
          </div>

          <div className={email ? undefined : 'mt-auto flex flex-col gap-1.5 border-t border-border pt-3'}>
            <p className={email ? undefined : 'm-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground'}
              style={email ? { fontFamily: FONT.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: EMAIL.muted } : undefined}
            >
              Confidence <Dots word={r.confidence.word} mode={mode} />
            </p>
            <Level mode={mode} word={r.confidence.word} of={r.confidence.why} />
          </div>
        </Card>
      </Column>
    )

    return (
      <BlockFrame
        title={quarterlyRead.title}
        question={quarterlyRead.question}
        mode={mode}
        meta={quarterLabel(data.quarter)}
      >
        <Columns weights={[7, 5]} mode={mode}>
          {left}
          {right}
        </Columns>
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
