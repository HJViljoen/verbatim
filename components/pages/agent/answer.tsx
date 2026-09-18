import type { ReactNode } from 'react'
import Link from 'next/link'
import { CalendarLine } from '@/components/charts/calendar-line'
import { BlockMovement } from '@/components/blocks/movement'
import { QuoteBlock } from '@/components/quote-block'
import { Tile, TileBlock } from '@/components/shell/tile'
import { askBasisLine, type AskBasis } from '@/lib/agent/basis'
import { INTERPRETATION_CAVEAT, TOO_FEW, type AnswerMeasure, type FindingMeasure } from '@/lib/agent/measure'
import { JUDGEMENT_HEADING, NEAREST_HEADING, citationWhere, saidHeading } from '@/lib/agent/types'
import { monthlyLineLabel } from '@/lib/pages/overview'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import type { Citation, ThreadAnswer, Turn } from '@/lib/pages/agent-thread'
import { findingKey } from '@/lib/pages/agent-thread'
import { DirectionWord, FindingLevel, InferencePill } from './marks'

// The answer, as the artboard draws it (Block D wave 2, E-ask · `ask.thread.*`,
// `ask.grounded.*`, `ask.quotes`, `ask.judgement`, `ask.followup`).
//
// WHAT THIS PAGE WAS AND WHAT IT IS NOW. Ask's answer was prose: a 17px
// sentence, then one bordered card per finding carrying the model's sentence, a
// bare "N conversations" and its quotes. Every figure on the screen was a
// number a model had typed, checked by nothing — `PROSE_POLICY.agent_answer`
// has said `'both'` since WP7 and `scrubProse` was never called from
// `lib/agent/**`. Wave 1 fixed the measurement half: `measureAnswer` reads the
// same comment-dated months the movement block reads and `scrubAnswer` licenses
// the prose against it. This is the half that reaches a reader.
//
// SO EVERY FIGURE HERE IS CODE'S. The model's sentence is a `data-copy="prose"`
// node and a digit inside one fails the build (rule (a)); the levels, the
// bands, the prior month and the chart all come off `FindingMeasure`. A
// commenter's own words are a sibling node with their own ref and are never
// scrubbed (rule (c)'s `quote` exemption), which is why the quotes are their
// own register rather than spans inside a finding's paragraph.
//
// THREE THINGS THE ARTBOARD DRAWS THAT ARE PRINTED DIFFERENTLY, each recorded
// in the status note:
//   · the lead sentence stays SANS. The mock sets it in Plex Serif 17/500;
//     serif in this product is speech and nothing else (globals.css, DESIGN.md,
//     P0's ruling), and the answer is ours.
//   · "Strong evidence" becomes the COUNTED PAIR and no ladder word at all. A
//     tier chip belongs to a conclusion (D11), and the prevalence ladder that
//     first replaced it is legacy vocabulary defined over run-indexed
//     conversations — outside `ASK_LEGEND`, which is the whole list this
//     surface may print. See `./marks.tsx`.
//   · the chart draws ONE line, the side that has the n. The mock draws
//     Freitag beside it, and a rival's months are out of Ask's scope by
//     construction: retrieval drops every rival voice before an answer is
//     written (`scopeToClientVoices`), `loadMovement` reads `client` and
//     `industry-other`, and `readableMonthCount` filters rivals — precisely so
//     a tenant is not told a rival's months stand behind a claim about their
//     own audience.

/** "answered 28 Sep", or nothing where the turn has no answer to date. */
export const answeredMeta = (turn: Turn): string | null =>
  turn.answer ? `answered ${shortDate(turn.askedAt)}` : null

/**
 * One finding's measurement — the row of marks under its sentence.
 *
 * ORDER IS THE ARGUMENT: the level first (what is true), then the banded
 * comparison (whether it moved), then the direction word (only where three
 * readings in one regime earned it), then the month it is a level of. A badge
 * before a level is a change with nothing to change.
 */
function Marks({ f }: { f: FindingMeasure }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FindingLevel value={f.value} />
      {/* The band travels with the change or neither is printed — D2. The
          non-answer arm prints the word alone and never a magnitude beside it,
          which is what `MovementBadge` already enforces. */}
      <BlockMovement verdict={f.verdict} unit="pts" />
      <DirectionWord direction={f.direction} />
      <span className="font-mono text-[11px] text-muted-foreground">
        in {f.audienceLabel.toLowerCase()} · <span data-copy="figure">{longMonth(f.verdict?.window.from ?? '')}</span>
      </span>
    </div>
  )
}

/** The month before, where a comparison was drawn against one. Code's counted
 *  pair, so it is a figure node and not a sentence. */
function Baseline({ f }: { f: FindingMeasure }) {
  const prev = f.verdict?.baseline
  const from = f.verdict?.basis?.from
  if (!prev || !from) return null
  return (
    <p className="m-0 font-mono text-[11px] text-muted-foreground">
      the month before:{' '}
      <span data-copy="figure">
        {fmtInt(prev.k)} of {fmtInt(prev.n)} videos in {longMonth(from)}
      </span>
    </p>
  )
}

/**
 * The client's own side of a finding, where they have one.
 *
 * NEVER A SECOND LINE ON THE CHART. Sealand's own audience runs tens of videos
 * a month against a floor of a hundred, so the own side is a caveat: the counts
 * with their denominator, and the badge's own word for a side that cannot
 * carry a comparison. The theme's LABEL is deliberately not repeated here —
 * it is model prose (`pass_b_theme`) and the sentence around it is code's.
 */
function OwnSide({ f }: { f: FindingMeasure }) {
  if (!f.own) return null
  return (
    <p className="m-0 text-[12.5px] leading-[1.5] text-secondary-foreground">
      In your own audience:{' '}
      <span data-copy="figure">
        {fmtInt(f.own.value.k)} of {fmtInt(f.own.value.n)} videos
      </span>
      {f.own.thin ? <> — <span className="text-[12px] font-medium text-muted-foreground">{TOO_FEW}</span></> : null}
    </p>
  )
}

/**
 * The finding's chart.
 *
 * D3: a chart is a direction claim too, so a line is drawn only where there is
 * a line to draw. Under three readings the axis is LABELLED instead —
 * `monthlyLineLabel` is the product's existing answer to exactly this ("Aug →
 * Sep only"), the words the approved mock itself prints on four rows of Main,
 * and reusing it means Ask and Overview cannot refuse a line in two different
 * vocabularies.
 */
function FindingChart({ f }: { f: FindingMeasure }) {
  const values = f.chart.line.points.map((p) => p.value)
  const label = monthlyLineLabel(values, f.chart.axis)
  const readable = values.filter((v) => v != null).length
  if (label) {
    return (
      <div className="flex w-[380px] shrink-0 flex-col justify-center gap-1">
        <p className="m-0 font-mono text-[11px] text-muted-foreground">{label}</p>
        <p className="m-0 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
          {readable === 0
            ? 'No month on this axis carries a reading, so there is no line to draw.'
            : 'Two readings are not a trend, so the months are named rather than drawn.'}
        </p>
      </div>
    )
  }
  return (
    <div className="w-[380px] shrink-0">
      <CalendarLine
        axis={f.chart.axis}
        series={[f.chart.line]}
        width={380}
        // The artboard's box is 300 wide with the plot ending at x=200 and the
        // end label beside it. The end label here carries the AUDIENCE's own
        // words and the denominator ("The category 9.4% of 1,388") where the
        // mock's carries a rival's short name and a bare percentage, so the
        // box is 80px wider and the right gutter 66px deeper — a clipped
        // denominator is a level without its "of N".
        height={104}
        padL={30}
        padR={170}
        legend={false}
        format={(v) => `${v}%`}
        label={`${f.audienceLabel}, month by month`}
        caption={`share of videos · ${f.audienceLabel.toLowerCase()} · to ${longMonth(f.chart.axis[f.chart.axis.length - 1] ?? '')}`}
      />
    </div>
  )
}

/**
 * The findings THIS TURN produced, in the turn's own order.
 *
 * ONE MEASUREMENT PER THREAD, INDEXED BY TURN. `AnswerMeasure.findings` holds
 * the whole thread's findings and `answerFindings` emits them in turn order
 * (`['0:G1','0:G2','1:G1', …]`), so `findings[0]` is turn 0's first grounded
 * point on EVERY turn. The footer read it directly and printed the first
 * answer's k under the second answer's prose — a counted figure under an answer
 * that did not produce it, on the one surface whose whole argument is that
 * every figure on it was counted for the answer it sits under. `Finding` has
 * always resolved by `findingKey`; this is that resolution, for the tile.
 */
function turnFindings(
  turn: Turn,
  measure: AnswerMeasure | null,
  turnIndex: number,
): FindingMeasure[] {
  return (turn.answer?.grounded ?? [])
    .map((p) => measure?.findings.find((x) => x.findingId === findingKey(turnIndex, p.id)))
    .filter((f): f is FindingMeasure => Boolean(f))
}

/** One grounded point: its number, the model's sentence, the measurement under
 *  it and — where three readings earned one — the line beside it. */
function Finding({
  point, index, measure, turnIndex,
}: {
  point: ThreadAnswer['grounded'][number]
  index: number
  measure: AnswerMeasure | null
  turnIndex: number
}) {
  const f = measure?.findings.find((x) => x.findingId === findingKey(turnIndex, point.id)) ?? null
  return (
    <div className="flex items-start gap-3">
      <span className="w-3.5 shrink-0 font-mono text-[12px] font-semibold leading-[1.5] text-primary tabular-nums">
        {index + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* A REPLACED POINT IS MUTED, not hidden: its own sentence named a
            figure nothing measured, the text here is the product's reading in
            its place, and the quotes it rested on are untouched. */}
        <p
          data-copy={point.replaced ? undefined : 'prose'}
          className={`m-0 text-[12.5px] leading-[1.5] ${point.replaced ? 'text-muted-foreground' : 'text-foreground'}`}
        >
          {point.text}
        </p>
        {f ? (
          <>
            <Marks f={f} />
            <Baseline f={f} />
            <OwnSide f={f} />
          </>
        ) : (
          // NO MEASUREMENT IS A STATE, NOT A ZERO. The months are not recorded
          // for this workspace, or this point rests on no theme the months
          // carry. Either way the sentence stands on its quotes alone and the
          // page says so rather than printing a level of nothing.
          <p className="m-0 font-mono text-[11px] text-muted-foreground">
            no month reading stands behind this one
          </p>
        )}
        {point.themeRefs.length > 0 && (
          <p className="m-0 text-[11px] text-muted-foreground">
            {/* The theme's label is the model's words (`pass_b_theme`), which
                the prose policy never direction-scrubs — so the node names its
                slot rather than silencing rule (c) for free. */}
            <span data-copy="subject" data-slot="pass_b_theme">
              {point.themeRefs.map((t) => t.label).filter(Boolean).join(' · ')}
            </span>
          </p>
        )}
      </div>
      {f ? <FindingChart f={f} /> : null}
    </div>
  )
}

/** Where one quoted voice was said (AS4) — the deck's own number, so the
 *  superscript here, the appendix on paper and a share link name one voice. */
function Provenance({ q, meta }: { q: ThreadAnswer['grounded'][number]['quotes'][number]; meta?: Citation }) {
  const where = citationWhere(meta)
  return (
    <span className="tabular-nums">
      {q.n}
      {where ? ` · ${where}` : ' · source on file'}
      {meta?.href && (
        <>
          {' · '}
          <a
            href={meta.href}
            target="_blank"
            rel="noreferrer"
            className="font-sans text-[12px] font-medium text-foreground hover:underline"
          >
            {meta.commentLevel ? 'the comment →' : 'the post →'}
          </a>
        </>
      )}
    </span>
  )
}

/**
 * "In their words" — a register of its own, not quotes nested in each card.
 *
 * The artboard's arrangement, and the honest one: a quote is the speaker's
 * words with its own ref and its own provenance, and rule (c) may not police
 * it. Nesting it inside a finding's card invites a reader to read it as
 * evidence OF that sentence rather than as what somebody said.
 */
function Quotes({ answer, citations }: { answer: ThreadAnswer; citations: readonly Citation[] }) {
  const metaByRef = new Map(citations.map((c) => [c.ref, c]))
  const quotes = answer.grounded.flatMap((g) => g.quotes)
  if (quotes.length === 0) return null
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">In their words</h3>
      <div className="flex flex-col gap-2.5">
        {quotes.map((q) => (
          <QuoteBlock
            key={q.ref + q.n}
            quote={{ text: q.text, lang: q.lang, english: q.english }}
            cite={<Provenance q={q} meta={metaByRef.get(q.ref)} />}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * The judgement register, with the block-level inference pill.
 *
 * THE PILL IS ON THE BLOCK, NOT ON THE POINTS THAT CITE NOTHING. The build
 * marked only an uncited point as inference, so a well-cited judgement carried
 * no marker at all and read as a finding. The whole register is inference — it
 * is the product arguing from findings, not a count — and the caveat under it
 * says so in the fixed sentence `measureAnswer` owes (`INTERPRETATION_CAVEAT`).
 * The per-point citation line stays: it is the trace back to the evidence.
 */
function Judgement({
  answer, measure,
}: {
  answer: ThreadAnswer
  measure: AnswerMeasure | null
}) {
  if (answer.judgement.length === 0) return null
  const numberOf = new Map(answer.grounded.map((g, i) => [g.id, i + 1]))
  const caveats = measure?.caveats ?? [INTERPRETATION_CAVEAT]
  return (
    <TileBlock className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{JUDGEMENT_HEADING}</h3>
        <InferencePill />
      </div>
      {answer.judgement.map((j, i) => {
        const cites = j.basedOn.map((ref) => numberOf.get(ref)).filter((n): n is number => Boolean(n)).sort((a, b) => a - b)
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <p data-copy="prose" className="m-0 max-w-[82ch] text-[12.5px] leading-[1.5] text-foreground">{j.text}</p>
            <p className="m-0 text-[11px] text-muted-foreground">
              {cites.length > 0
                ? `Reasoning from ${cites.length === 1 ? 'finding' : 'findings'} ${cites.join(', ')} above.`
                : 'Not drawn from any single finding above.'}
            </p>
          </div>
        )
      })}
      {/* The caveats `measureAnswer` says are owed — the interpretation
          sentence first, then the client's own thin side of each finding.
          Code's sentences, with code's digits in them. */}
      {caveats.map((c) => (
        <p key={c} className="m-0 text-[11.5px] leading-[1.45] text-muted-foreground">{c}</p>
      ))}
    </TileBlock>
  )
}

/**
 * The footer rail: the videos behind the answer's best-evidenced finding, and
 * what population that is.
 *
 * The artboard's "Open the 130 videos behind the wet-commute question →". The
 * figure is `FindingMeasure.value.k` — the month table's own k, never
 * `GroundedPoint.conversationCount`, which is the agent's retrieval count and
 * has no denominator.
 */
function AnswerFooter({ f }: { f: FindingMeasure | null }) {
  if (!f) return null
  return (
    <>
      {/* THE AUDIENCE TRAVELS WITH THE FIGURE. The k is the audience's own —
          the category's, usually — and Voice picks its own audience when it is
          not told one (`pickAudience` defaults to `industry-other`, which is
          why this read right by accident). The HORIZON deliberately does not
          travel: Voice's horizons are rolling windows and this figure is a
          calendar month, so pinning one would be a claim that the two are the
          same period. The footer note beside this names the month instead. */}
      <Link
        href={`/dashboard/voice?theme=${encodeURIComponent(f.verdict?.objectId ?? '')}&audience=${encodeURIComponent(f.audience)}`}
        className="hover:underline"
      >
        Open the <span data-copy="figure">{fmtInt(f.value.k)}</span> videos behind this →
      </Link>
    </>
  )
}

export function AnswerTile({
  turn,
  turnIndex,
  measure,
  citations,
  basis,
  composer,
  row = 6,
}: {
  turn: Turn
  turnIndex: number
  measure: AnswerMeasure | null
  citations: readonly Citation[]
  basis: AskBasis
  /**
   * The follow-up control, as a SLOT.
   *
   * `AgentComposer` is a client component that calls `useRouter`, and the
   * render tier is one `renderToStaticMarkup` per block with no jsdom and no
   * router — so a block that constructs it cannot be rendered in a test at
   * all, which is a block whose printed words nothing checks. The route mounts
   * the control; this block owns where it sits and what the rail under it
   * says. (lib/test/render.ts: "a block that needs a click needs a different
   * kind of test and probably a different kind of block".)
   */
  composer?: ReactNode
  row?: number
}) {
  const answer = turn.answer
  // THIS TURN's best-evidenced finding, never the thread's first — see
  // `turnFindings`. A turn that measured nothing prints no footer rather than
  // another turn's figure.
  const f = turnFindings(turn, measure, turnIndex)[0] ?? null
  return (
    <Tile
      col={12}
      row={row}
      eyebrow={turnIndex === 0 ? 'The answer' : 'The follow-up'}
      meta={answeredMeta(turn) ?? undefined}
      exportKey={`agent.answer:${turnIndex}`}
      footer={<AnswerFooter f={f} />}
      footerNote={f ? `${f.audienceLabel.toLowerCase()} · ${longMonth(measure?.month ?? '')}` : undefined}
    >
      {/* The question, under a mono eyebrow — the artboard's device, and the
          one the build printed only on paper. */}
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
          You asked · {shortDate(turn.askedAt)}
        </span>
        <p className="m-0 text-[15px] font-semibold text-foreground">{turn.question}</p>
      </div>

      {answer ? (
        <>
          {answer.notice && (
            <p className="m-0 rounded-[4px] bg-inner px-3 py-2 text-[12px] text-muted-foreground">{answer.notice}</p>
          )}

          {/* THE FALLBACK IS PRINTED INSTEAD OF THE ANSWER, never beside it. A
              scrub that removes every sentence used to render as an empty
              paragraph over a page of evidence; `fallback` is the product's own
              reading of the same verdicts and says in its first sentence that
              it is. It is not a `prose` node — the product wrote it, and the
              digits in it are code's. */}
          {answer.answer.trim() !== '' ? (
            <p data-copy="prose" className="m-0 text-[17px] font-medium leading-[1.35] tracking-[-0.005em] text-foreground [text-wrap:pretty]">
              {answer.answer}
            </p>
          ) : answer.fallback ? (
            <p className="m-0 text-[15px] leading-[1.45] text-muted-foreground">{answer.fallback}</p>
          ) : null}

          {answer.grounded.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">
                {/* The heading follows the evidence: "your customers" is a claim
                    about whose audience spoke and is said only where every point
                    rests on the client's own videos. */}
                {saidHeading(answer.grounded)}
              </h3>
              {answer.grounded.map((point, i) => (
                <Finding key={point.id} point={point} index={i} measure={measure} turnIndex={turnIndex} />
              ))}
            </section>
          )}

          {answer.nearest.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{NEAREST_HEADING}</h3>
              {answer.nearest.map((n, i) => (
                <p key={i} data-copy="prose" className="m-0 text-[12.5px] leading-[1.5] text-secondary-foreground">{n.text}</p>
              ))}
            </section>
          )}

          <Quotes answer={answer} citations={citations} />
          <Judgement answer={answer} measure={measure} />

          {/* AS3 under the answer it is about: which update it was answered
              against, and how much of the corpus could be searched when it was.
              Mono here as it is on the deck — it is metadata, and the eye
              should skip it until it wants it. */}
          <p className="m-0 font-mono text-[11px] leading-[1.45] text-muted-foreground">
            {askBasisLine({ ...basis, updateAt: turn.updateAt }, { asked: true })}
          </p>
        </>
      ) : turn.prose ? (
        <p className="m-0 text-[15px] leading-[1.45] text-foreground">{turn.prose}</p>
      ) : (
        <p className="m-0 text-[12.5px] text-negative">
          That question did not get an answer &mdash; something went wrong on our side rather than in your data.
          Asking it again is safe.
        </p>
      )}

      {/* The follow-up composer INSIDE the answer tile, above the footer rail —
          where the artboard puts it. It carries "Check a plan" now, which the
          thread page suppressed. */}
      {composer ? <div className="border-t border-border/70 pt-3">{composer}</div> : null}
    </Tile>
  )
}
