import { Fragment } from 'react'
import Link from 'next/link'
import { CalendarLine } from '@/components/charts/calendar-line'
import { Tile, TileBlock } from '@/components/shell/tile'
import { answerFallback, findingSentence, findingSentenceParts, findingsBaseLine, ownBase, type AnswerMeasure, type FindingMeasure } from '@/lib/agent/measure'
import { DO_HEADING, NEAREST_HEADING, basedOnLine, saidHeading } from '@/lib/agent/types'
import { monthlyLineLabel } from '@/lib/pages/overview'
import { fmtInt, longMonth, monthName, shortDate } from '@/lib/format'
import type { ThreadAnswer, Turn } from '@/lib/pages/agent-thread'
import type { ObjectReading } from '@/lib/agent/movement'
import { kindLabel } from '@/lib/reading/kinds'
import { priorPrintable, type Verdict } from '@/lib/reading/verdicts'
import { printsMarket } from '@/lib/subjects/calibration-state'
import { monthStartOf } from '@/lib/reading/month-key'
import { marketLevel } from '@/lib/pages/overview-market/kinds'
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
//     Freitag beside it; a rival's filed videos are read only when a question
//     names that rival (WP3.9's market scope), and its months stay the brands
//     view's, so a finding's line is never a rival's drawn beside the market.
//
// AND NOTHING ON IT ABOUT HOW IT WAS MADE (§0a, 1 Oct). Heinrich, on Sealand's
// live answer: "what's this 796 number". The page said "The sentence here named
// a figure we did not measure, so this is the reading instead", "Sep only /
// Two readings: months named, not drawn", "measured on …", "in the category"
// beside a base the Dashboard calls 834, and "Answered against the update of".
// Now: an emptied point is the product's plain finding; a base is worded
// against the market (`findingBase`); a finding with no line to draw has an
// empty right column; what a point covers is one short line; the update line,
// the "Interpretation, not counted." note and the quotes register are gone
// (Heinrich, 1 Oct: "What people said" is the evidence); and "What I'd do"
// sits under the answer, as part of it. `answer-copy.test.tsx` guards the
// words.

/**
 * The comparison beside a level, where one was drawn AND answered: "▲ 2.6 pts"
 * (the usual swing it beat in its tooltip) or "no clear change". Nothing for a
 * refused pair or one with too few videos on a side (§0a.2: only what has
 * something to say), and never "±0 pts" beside a non-answer. Ask's own, so the
 * shared badge's wording ("the margin of this measurement") stays off this
 * page.
 */
function Comparison({ v }: { v: Verdict | null | undefined }) {
  if (!v || !priorPrintable(v)) return null
  if (v.state === 'moved' && v.changePts != null && v.changePts !== 0) {
    return (
      <span
        data-copy="verdict"
        title={v.bandPts != null ? `more than the usual month-to-month swing of ${v.bandPts} points` : undefined}
        className={`whitespace-nowrap text-xs font-semibold ${v.changePts > 0 ? 'text-positive' : 'text-negative'}`}
      >
        {v.changePts > 0 ? '▲' : '▼'} {Math.abs(v.changePts).toLocaleString('en-US')} pts
      </span>
    )
  }
  if (v.state === 'no_clear_change') return <span data-copy="verdict" className="text-xs font-medium text-muted-foreground">no clear change</span>
  return null
}

/**
 * One finding's measurement — the row of marks under its sentence.
 *
 * ORDER IS THE ARGUMENT: the level first (what is true), then the comparison
 * (whether it moved), then the direction word (only where three months in one
 * regime earned it). A badge before a level is a change with nothing to change.
 * The base is the section's line (`findingsBaseLine`), said once; a finding on
 * another audience carries its own (`ownBase`).
 */
function Marks({ f, level = true }: { f: FindingMeasure; level?: boolean }) {
  // A REPLACED POINT'S SENTENCE IS ITS LEVEL AND COMPARISON ALREADY
  // (`findingSentence`), so the row keeps only the direction word, the one
  // thing that sentence does not say, and is not drawn without one.
  if (!level) return f.direction ? <div className="flex flex-wrap items-center gap-2"><DirectionWord direction={f.direction} /></div> : null
  const base = ownBase(f)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FindingLevel value={f.value} />
      <Comparison v={f.verdict} />
      {/* THE WORD AND ITS SCOPE WRAP TOGETHER: a direction word separated from
          the audience it is a direction IN is not checkable. */}
      <span className="inline-flex items-center gap-2">
        <DirectionWord direction={f.direction} />
        {base ? <span data-copy="figure" className="font-mono text-[11px] text-muted-foreground">{base}</span> : null}
      </span>
    </div>
  )
}

/** The month before, where a comparison was drawn against one. Code's counted
 *  pair, so it is a figure node and not a sentence. */
function Baseline({ f }: { f: FindingMeasure }) {
  const prev = f.verdict?.baseline
  const from = f.verdict?.basis?.from
  // Only beside a comparison that was drawn (T0a, AK-14): a refused one, even
  // stored with its baseline, prints the month read alone.
  if (!prev || !from || !priorPrintable(f.verdict)) return null
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
 * The client's own side of a finding, where it says something.
 *
 * NEVER A SECOND LINE ON THE CHART, and ONLY WHERE IT CLEARS THE FLOOR (round
 * 2, 1 Oct; §0a.2): Sealand's own audience runs tens of videos a month against
 * a floor of a hundred, and "0 of 10 videos · too few to compare" under every
 * finding said nothing but that. The theme's LABEL is deliberately not
 * repeated here: it is model prose (`pass_b_theme`) and the sentence around
 * it is code's.
 */
function OwnSide({ f }: { f: FindingMeasure }) {
  if (!f.own || f.own.thin) return null
  return (
    <p className="m-0 text-[12.5px] leading-[1.5] text-secondary-foreground">
      In your own audience:{' '}
      <span data-copy="figure">
        {fmtInt(f.own.value.k)} of {fmtInt(f.own.value.n)} videos
      </span>
    </p>
  )
}

/**
 * THE CHART'S BOX — the one rule that makes a finding survive a narrow screen.
 *
 * It was `w-[380px] shrink-0` inside a row that could not wrap, beside a
 * `min-w-0 flex-1` prose column, so the sentence got whatever 380px left over.
 * Measured on the populated fixture: at 768 (sidebar on, tile 496px) the prose
 * column was ~46px and rendered one short word per line — "The / wet- /
 * commute / question / is / the / one no / tracked / brand / answers / on /
 * camera" — and at 390 the SVG painted OVER the words while `Tile`'s
 * `overflow-hidden` cut the end label to "The category 9.4", a level with its
 * denominator gone, which is the one thing this page may not print. Neither
 * width showed a scrollbar, so an overflow probe reported the page clean.
 *
 * `basis-[380px]` is the width the chart ASKS for and `grow-0` stops it taking
 * more; the default `flex-shrink: 1` with `min-w-0` is what lets it come down
 * to the tile's width on a phone, where `CalendarLine`'s SVG is already
 * `width="100%"` over a viewBox and so scales rather than clips. Paired with
 * the row's `flex-wrap` and the prose column's `basis-[16rem]`, the chart drops
 * BELOW the sentence the moment the two cannot both be had — and the chart is
 * the right one to move, because `MonthTrail` under it prints the same months
 * as figures.
 */
const CHART_BOX = 'min-w-0 basis-[380px] grow-0'

/**
 * The finding's chart.
 *
 * D3: a chart is a direction claim too, so a line is drawn only where there is
 * a line to draw (three months or more, `monthlyLineLabel`). Where there is
 * not, the column is EMPTY: it printed "Sep only" over "Two readings: months
 * named, not drawn." (on one month) and "no month reads" over "No month on
 * this axis carries a reading.", which is our machinery explaining a chart
 * that is not there (§0a). The finding's level and month are on the row
 * beside it already.
 */
function FindingChart({ f }: { f: FindingMeasure }) {
  const values = f.chart.line.points.map((p) => p.value)
  if (monthlyLineLabel(values, f.chart.axis)) return null
  return (
    <div className={`flex flex-col gap-1 ${CHART_BOX}`}>
      <CalendarLine
        axis={f.chart.axis}
        series={[f.chart.line]}
        width={380}
        // The artboard's box is 300 wide with the plot ending at x=200 and the
        // end label beside it. The end label here carries the AUDIENCE's own
        // words and the denominator ("The category 17% of 626", Sealand's Looks & style in September) where the
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
      <MonthTrail f={f} />
    </div>
  )
}

/**
 * The months, as numbers: "Jul 5.1% → Aug 6.8% → Sep 9.4%".
 *
 * THE BRIEF ASKS FOR IT AND THE CHART CANNOT DO ITS JOB WITHOUT IT. The shared
 * `CalendarLine` labels the baseline and one midline — `niceMid` over a scale
 * with 12% headroom — so in a 104px box the only labelled gridline sits BELOW
 * the data and a reader has to interpolate to read a magnitude off the line.
 * Two labelled gridlines do define a scale, but "the axis says 0 and 5 and the
 * line ends somewhere above 5" is not a figure anyone can check, which is the
 * whole promise of this half of the page.
 *
 * Changing the axis would be a change to `components/charts/*` and
 * `lib/charts/calendar.ts`, which every reading surface draws through — one
 * surface with a different axis from the other five is worse than this. So the
 * plotted values are printed, in order: every month on the line, with its own
 * number, in the reader's own words. `MeasuredPoint.pct` is null for a month
 * that could not be read, and a null prints as a dash rather than as a zero.
 *
 * AND EACH MONTH CARRIES ITS OWN DENOMINATOR, which is the whole reason
 * `MeasuredPoint` has one ("its monthly series WITH denominators",
 * `lib/agent/measure.ts:86`). It printed `Jul 5.1% → Aug 6.8% → Sep 9.4%` —
 * three levels, no "of N" between them — and the chart's end label carries the
 * denominator for the newest month only. A level without its "of N" is a
 * score, which this product does not show, and marking the run
 * `data-copy="figure"` meant rule (b) never looked: a `figure` is a number
 * code computed, and these are levels.
 *
 * So each month is its OWN node: `level` where it has a counted pair, which
 * rule (b) then inspects and which carries the pair inside one node the way
 * `FindingLevel` does; `figure` for a month that could not be read, whose text
 * is a dash and states no level at all. The separators sit outside both, so
 * neither node's text is something the contract has to reason about.
 */
function MonthTrail({ f }: { f: FindingMeasure }) {
  // THE MONTHS SINCE THE LATEST REFUSED STEP ONLY (T0a, AK-14). A finding
  // measured today carries only those; one stored before the rule carries the
  // refused step on its line (`brokenBefore`), and nothing before it is
  // listed, because " → " across a refused step is the comparison itself.
  const breaks = f.chart.line.points.filter((p) => p.brokenBefore).map((p) => monthStartOf(p.month)).sort()
  const since = breaks.length > 0 ? breaks[breaks.length - 1] : null
  const months = f.series.filter((p) => f.chart.axis.includes(p.month) && (since == null || monthStartOf(p.month) >= since))
  if (months.length === 0) return null
  return (
    <p className="m-0 font-mono text-[10px] leading-[1.4] text-muted-foreground">
      {months.map((p, i) => {
        const when = monthName(p.month).split(' ')[0]
        const read = p.pct != null && p.k != null && p.n != null
        return (
          <Fragment key={p.month}>
            {i > 0 ? ' → ' : null}
            {read ? (
              <span data-copy="level" className="whitespace-nowrap">
                {when} {p.pct}% ({fmtInt(p.k as number)} of {fmtInt(p.n as number)})
              </span>
            ) : (
              <span data-copy="figure" className="whitespace-nowrap">{when}:</span>
            )}
          </Fragment>
        )
      })}
    </p>
  )
}

/**
 * The product's own sentence for a finding (`findingSentence`), set as the
 * page sets a finding: the counted pair in the level's own weight, inside the
 * sentence and never highlighted (Heinrich's ban). The theme's label is marked as the model's words it is
 * (`pass_b_theme`): a label can carry a direction word ("Frustration with
 * declining product quality") that is the subject's name, not a claim of ours.
 */
function Sentence({ f }: { f: FindingMeasure }) {
  const { label, level, base, after } = findingSentenceParts(f)
  return <><span data-copy="subject" data-slot="pass_b_theme">{label}</span>: <FindingLevel value={level} />{base ? <> <span data-copy="figure">{base}</span></> : null}.{after}</>
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
  // WHAT THE POINT COVERS: its themes' names, the model's words. Not where
  // the point's own sentence is the product's and names the one theme it
  // covers, which would be the same name twice.
  const labels = point.themeRefs.map((t) => t.label).filter(Boolean)
  const covers = point.replaced && f && labels.length === 1 && labels[0] === f.label ? [] : labels
  // A point with nothing to say is not drawn (§0a.2): its sentence was
  // emptied, nothing measured it and it names no theme.
  if (!point.text && !f && covers.length === 0) return null
  return (
    // WRAPS, AND THE PROSE HAS A FLOOR — see `CHART_BOX`. `basis-[16rem]` is
    // the hypothetical size the wrap is decided on: with `flex-1` (basis 0) the
    // line always "fitted" and the sentence was squeezed to whatever the chart
    // left over.
    <div className="flex flex-wrap items-start gap-3">
      <span className="w-3.5 shrink-0 font-mono text-[12px] font-semibold leading-[1.5] text-primary tabular-nums">
        {index + 1}
      </span>
      <div className="flex min-w-0 grow basis-[16rem] flex-col gap-1.5">
        {/* A REPLACED POINT READS AS A FINDING: its sentence is the product's
            own (`findingSentence`, code's digits, so not a `prose` node), in
            the same ink as any other, and nothing says it was replaced. */}
        {point.replaced && f && point.text === findingSentence(f) ? (
          <p className="m-0 text-[12.5px] leading-[1.5] text-foreground"><Sentence f={f} /></p>
        ) : point.text ? (
          <p data-copy={point.replaced ? undefined : 'prose'} className="m-0 text-[12.5px] leading-[1.5] text-foreground">
            {point.text}
          </p>
        ) : null}
        {/* NO MEASUREMENT PRINTS NOTHING, never a zero and never a line about
            it: the point stands on its sentence and what it covers. */}
        {f ? (
          <>
            <Marks f={f} level={!point.replaced} />
            <Baseline f={f} />
            <OwnSide f={f} />
          </>
        ) : null}
        {covers.length > 0 && (
          // ONE SHORT LINE: what the point covers. It said "measured on", our
          // word for our method (§0a). The separator is a dot because a label
          // can carry a comma ("Buy less, make it better").
          <p className="m-0 font-mono text-[11px] text-muted-foreground">
            Covers:{' '}
            {/* The theme's label is the model's words (`pass_b_theme`), which
                the prose policy never direction-scrubs — so the node names its
                slot rather than silencing rule (c) for free. */}
            <span data-copy="subject" data-slot="pass_b_theme" className="text-secondary-foreground">
              {covers.join(' · ')}
            </span>
          </p>
        )}
      </div>
      {f ? <FindingChart f={f} /> : null}
    </div>
  )
}

/**
 * "What I'd do": the judgement register, under the answer it belongs to.
 *
 * UNDER THE ANSWER, ABOVE THE EVIDENCE (Heinrich, 1 Oct): it reads as part of
 * the answer, and the findings below are what it is based on. Old answers get
 * the same order; only the heading and the trace line changed words.
 *
 * THE PILL IS ON THE BLOCK, NOT ON THE POINTS THAT CITE NOTHING. The build
 * marked only an uncited point as inference, so a well-cited judgement carried
 * no marker at all and read as a finding. The whole register is inference, and
 * the pill says so; the note under it ("Interpretation, not counted.") said it
 * again in our method's words, and is gone (§0a). The per-point line stays: it
 * is the trace to the findings below.
 */
function Judgement({ answer }: { answer: ThreadAnswer }) {
  if (answer.judgement.length === 0) return null
  const numberOf = new Map(answer.grounded.map((g, i) => [g.id, i + 1]))
  return (
    <TileBlock className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{DO_HEADING}</h3>
        <InferencePill />
      </div>
      {answer.judgement.map((j, i) => {
        const cites = j.basedOn.map((ref) => numberOf.get(ref)).filter((n): n is number => Boolean(n)).sort((a, b) => a - b)
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <p data-copy="prose" className="m-0 max-w-[82ch] text-[12.5px] leading-[1.5] text-foreground">{j.text}</p>
            <p className="m-0 text-[11px] text-muted-foreground">{basedOnLine(cites, answer.grounded.length > 0 ? 'below' : null)}</p>
          </div>
        )
      })}
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
  // NEVER "Open the 0 videos behind this" (walkthrough item 4): a link to
  // nothing is the one footer this tile may not print.
  if (!f || f.value.k <= 0) return null
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

/**
 * A named object's trail, as the Subjects pane prints a subject's
 * (`marketTrail`): the last three months read, each a level on the market's
 * base (`marketLevel`: a whole percent at 100 videos and 10 of its own, the
 * count under) with its "of N". A month with no reading is not a month read,
 * so it is never "0 of N". Pure.
 */
export function aboutTrail(r: Pick<ObjectReading, 'trail'>): { month: string; text: string; of: string }[] {
  return r.trail
    .filter((p) => p.k != null && p.n != null && p.n > 0)
    .slice(-3)
    .flatMap((p) => {
      const level = marketLevel(p.k, p.n)
      return level ? [{ month: p.month, text: level.text, of: `of ${fmtInt(p.n as number)}` }] : []
    })
}

/** What a named object is, in the reader's words, as the block titles it. */
function aboutLabel(r: ObjectReading): string {
  const o = r.object
  if (o.kind === 'kind') return kindLabel(o.id)
  if (o.kind === 'mood') return 'The mood, positive of the videos judged'
  return o.label
}

/**
 * WHAT THE QUESTION NAMED, READ ON THE MARKET (WP3.9, S7).
 *
 * "Ask about this" on a subject asks about that subject, so the answer opens
 * on the subject's own figure: its level in the market in the month read, its
 * trail month by month, and the month pair's answer, which on a refused pair
 * is the refusal in the pair rule's own words and never "moved". The figures
 * are the product's, counted off the same rows Subjects prints (decision E),
 * never a model's. A subject that is not ready, and an object nothing has
 * counted yet, is its name alone: no figure and no word about why (§0a).
 */
export function AboutReadings({ readings }: { readings: readonly ObjectReading[] }) {
  if (readings.length === 0) return null
  return (
    <section className="flex flex-col gap-2.5" aria-label="What you asked about, in your market">
      <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">In your market</h3>
      {readings.map((r) => {
        const label = aboutLabel(r)
        // A SUBJECT THAT IS NOT READY IS ITS NAME ALONE (T0a, AK-24; ruling
        // U6): no level, trail, verdict or word.
        const failed = r.object.kind === 'subject' && !printsMarket(r.object.calibration)
        const unread = r.state === 'unread'
        // A REFUSED PAIR PRINTS THE MONTH READ ALONE (T0a, AK-24): no trail
        // across the refusal and no sentence about it.
        const refused = r.verdict != null && !priorPrintable(r.verdict)
        const trail = refused ? aboutTrail(r).slice(-1) : aboutTrail(r)
        const current = trail.length > 0 ? trail[trail.length - 1].month : null
        // THE SUBJECT PANE'S OWN TRAIL (S7): the last three months read, each
        // a level on its own base with its "of N", the month read in bold.
        const trailLine = trail.length > 1 || (unread && trail.length > 0) ? (
          <p className="m-0 flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] tabular-nums text-muted-foreground">
            {trail.map((t, i) => (
              <span key={t.month} className="inline-flex items-baseline gap-2">
                {i > 0 ? <span aria-hidden>·</span> : null}
                <span data-copy="level">{monthName(t.month).split(' ')[0]} <span className={t.month === current && !unread ? 'font-semibold text-foreground' : undefined}>{t.text}</span> {t.of}</span>
              </span>
            ))}
          </p>
        ) : null
        return (
          <TileBlock key={`${r.object.kind}:${r.object.id}`} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground">{label}</span>

            </div>
            {failed ? null : unread ? (
              trailLine
            ) : r.state === 'not_read' || !r.curr || r.curr.n == null || r.curr.k == null ? (
              // NOTHING COUNTED IT YET: the name alone, never "not read yet"
              // or "no reading yet", which are our process (§0a).
              null
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <FindingLevel value={{ k: r.curr.k, n: r.curr.n }} />
                  {r.verdict && !refused ? <Comparison v={r.verdict} /> : null}
                  <DirectionWord direction={r.direction} />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    in your market · <span data-copy="figure">{longMonth(r.curr.month)}</span>
                  </span>
                </div>
                {trailLine}
              </>
            )}
          </TileBlock>
        )
      })}
    </section>
  )
}

export function AnswerTile({
  turn,
  turnIndex,
  measure,
  row = 6,
  about,
}: {
  turn: Turn
  turnIndex: number
  measure: AnswerMeasure | null
  row?: number
  /** What the question named, read on the market (WP3.9), under the first
   *  answer. */
  about?: readonly ObjectReading[]
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
      // TITLE ALONE, LINKS ALONE (25 Sep rulings, WP3.9): the "answered"
      // meta is the "You asked" line's own date, and the footer's audience
      // note is on the finding the link opens.
      eyebrow={turnIndex === 0 ? 'The answer' : 'The follow-up'}
      exportKey={`agent.answer:${turnIndex}`}
      footer={<AnswerFooter f={f} />}
    >
      {/* The question, under a mono eyebrow — the artboard's device, and the
          one the build printed only on paper. */}
      <div className="flex flex-col gap-1">
        {/* The un-faded token: `/80` at 10px is about 3.3:1 on white against a
            4.5:1 floor, and this eyebrow carries a date. Every other eyebrow on
            the page uses the token straight. */}
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
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
              plain finding for this turn (`answerFallback`), or "too little in
              your market" (`tooLittleToAnswer`). It is not a `prose` node: the
              product wrote it, and the digits in it are code's. */}
          {answer.answer.trim() !== '' ? (
            <p data-copy="prose" className="m-0 text-[17px] font-medium leading-[1.35] tracking-[-0.005em] text-foreground [text-wrap:pretty]">
              {answer.answer}
            </p>
          ) : answer.fallback ? (
            <p className="m-0 text-[15px] leading-[1.45] text-foreground">
              {/* The turn's own findings, labels marked, where that is what
                  the fallback is; any other fixed sentence as it stands. */}
              {measure && answer.fallback === answerFallback(measure, answer.grounded.map((g) => findingKey(turnIndex, g.id)))
                ? turnFindings(turn, measure, turnIndex).slice(0, 3).map((x, i) => <Fragment key={x.findingId}>{i > 0 ? ' ' : null}<Sentence f={x} /></Fragment>)
                : answer.fallback}
            </p>
          ) : null}

          {/* WHAT I'D DO, AS PART OF THE ANSWER (Heinrich, 1 Oct): directly
              under it and above the evidence it is based on. */}
          <Judgement answer={answer} />

          {about && about.length > 0 ? <AboutReadings readings={about} /> : null}

          {answer.grounded.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">
                {/* The heading follows the evidence: "your customers" is a claim
                    about whose audience spoke and is said only where every point
                    rests on the client's own videos. */}
                {saidHeading(answer.grounded)}
              </h3>
              {/* THE BASE, ONCE (round 2): "Counted out of the 796 September
                  videos about your category in general: your market's 834,
                  less the 38 about brands you track." Each finding then reads
                  "13 of 796 videos". */}
              {(() => {
                const line = findingsBaseLine(turnFindings(turn, measure, turnIndex))
                return line ? <p data-copy="figure" className="m-0 text-[12px] leading-[1.45] text-muted-foreground">{line}</p> : null
              })()}
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

          {/* NO QUOTES REGISTER (Heinrich, 1 Oct): "What people said" is the
              evidence, and the videos behind it are one link away in the
              footer. NO UPDATE LINE: "Answered against the update of …" named
              our update as an event (§0a.1); the question's own date is above. */}
        </>
      ) : turn.prose ? (
        <p className="m-0 text-[15px] leading-[1.45] text-foreground">{turn.prose}</p>
      ) : (
        <p className="m-0 text-[12.5px] text-negative">
          That question did not get an answer. Asking it again is safe.
        </p>
      )}
    </Tile>
  )
}
