import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { TileColumns } from '@/components/shell/page-grid'
import { UpdateSeriesChart } from './series-chart'
import { BlockQuote } from '@/components/blocks/quote'
import { BlockStat } from '@/components/blocks/stat'
import { TokenProse } from '@/components/blocks/prose'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, longMonth, monthName } from '@/lib/format'
import { baselineFormingLine, contributionLine, flagFigures, type UnusualFlag, type WeekData } from '@/lib/pages/week'
import { updateSeriesHead, updateSeriesLine, type UpdateNote, type UpdateSeries } from '@/lib/reading/updates'
import type { FigureTable } from '@/lib/reading/verdicts'

// WK1 · Unusual this week (design §3 WK1, item 40; the mock's §1).
//
// THE LEAD SECTION OF THIS PAGE IS USUALLY EMPTY, AND THAT IS THE DESIGN. The
// Phase 0 replay over eleven weeks raised exactly one flag on the paying tenant
// and none at all on the trial one, and the design's answer is to print
// "Nothing unusual this week" in full rather than hide the section — a check
// that only ever appears when it fires is a check nobody can calibrate. So this
// block has SIX states and each of them is a different sentence:
//
//   flagged           the check ran and these cleared. Printed in full.
//   nothing_unusual   the check ran, nothing cleared. The commonest answer.
//   refused           the check ran and declined to read the week — a thin
//                     update, a run with no window. The reason is NAMED.
//   baseline_forming  the check cannot speak yet, and the page says WHEN it
//                     will: "the check starts with the November reading".
//   not_checked       nothing has ever looked at this update.
//   unreadable        the check's own row says flags were raised and the flags
//                     could not be read. A failed read, never a quiet week.
//
// THE LAST THREE ARE NOT THE SAME AS THE SECOND, and keeping them apart is what
// `anomaly_checks` exists for (WP8's migration says so at length). "Nothing was
// unusual" is a reading; "nobody has looked" is not, and a surface that prints
// the first for the second is telling a paying client their week was quiet on
// the strength of an absent table.
//
// NO DIRECTION WORD ANYWHERE. A flag states a level, the level behind it and
// the band between them. It never says growing or rising: it compares one
// week's share with three months pooled, which is two readings and not three,
// and the direction vocabulary is reserved for what three consecutive monthly
// readings under one grouping have earned (D1). The one movement word here —
// `MovementBadge` — is not used; the change is printed as points with its band
// beside it, inside a verdict node.

export const weekUnusual: Block<WeekData> = {
  key: 'week.unusual',
  title: 'Unusual this week',
  question: 'Did anything this update read differently from the months behind it?',

  render(data, mode = 'app') {
    const u = data.unusual
    const empty = weekUnusual.emptyState(data)
    const email = mode === 'email'
    // THE LEFT HALF OF THE MOCK'S §1: what each update brought in, drawn and
    // then said in words. The words are printed in EVERY mode — an email
    // client is no place for an SVG, and the legend is the half of a chart
    // that carries the numbers anyway.
    // THE CHART CARRIES THE LEGEND'S NUMBERS, so where it is drawn the words
    // that repeat them are not printed (design review F4). `charted` is the
    // exact condition `UpdateSeriesChart` renders under.
    const charted = !email && u.series != null && u.series.points.length > 1
    // NO FLAG, NO EMPTY COLUMN (layout sweep 2026-09-24). With nothing to
    // list, the right half held one or two short lines beside a chart and its
    // readings, and left most of its column white. The readings move across to
    // sit under the state, so the chart has the left half to itself.
    const quiet = charted && u.flags.length === 0
    const series = <Series series={u.series} mode={mode} charted={charted} />
    const left = (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-2'}>
        {charted ? <UpdateSeriesChart series={u.series!} /> : null}
        {quiet ? null : series}
      </div>
    )
    const right = (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-2.5'}>
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}

        {u.state === 'baseline_forming' ? (
          <Line mode={mode}>{baselineFormingLine(u.baseline!, data.month)}</Line>
        ) : null}

        {u.state === 'refused' && u.updateVideos != null && u.medianVideos != null ? (
          <Line mode={mode}>
            This update analysed {fmtInt(u.updateVideos)} videos against a usual {fmtInt(Math.round(u.medianVideos))}.
          </Line>
        ) : null}

        {u.flags.map((flag, i) => (
          <Flag
            key={`${flag.objectKind}:${flag.objectId}`}
            flag={flag}
            n={i + 1}
            mode={mode}
            // THE WHOLE BLOCK'S TABLE, not one flag's. The explainer is shown
            // every flag's figures at once and writes ONE paragraph about all
            // of them (`anomaly-check.ts`: "one explanation covers the week's
            // flags"), so a sentence stored on flag 1 may cite
            // `[[flag_2_week_share]]` or the update's own `[[week_videos]]`.
            figures={weekUnusual.figures?.(data) ?? {}}
          />
        ))}

        {u.state === 'flagged' && u.flaggedCount > u.flags.length ? (
          <Line mode={mode}>
            {fmtInt(u.flags.length)} of {fmtInt(u.flaggedCount)} shown, the largest first
          </Line>
        ) : null}
        {quiet ? series : null}
      </div>
    )

    return (
      <BlockFrame
        title={weekUnusual.title}
        question={weekUnusual.question}
        mode={mode}
        meta={headerMeta(u, data.windowVideos)}
        // THE MOCK'S HAIRLINE FOOTER, WITH ITS NOTE ON THE LEFT (review W8).
        // The artboard's left-hand "See the 38 videos behind this →" has no
        // destination in this product: a flag's object is a KIND or a THEME,
        // and no route lists the videos behind one (deviation 5). The
        // evidence a reader can actually open is on the flag's own quotes,
        // which carry their citation links.
        //
        // BUT THE NOTE WAS STILL ON THE RIGHT, so the page's most important
        // tile ended on a hairline with two thirds of nothing under it —
        // drawing the frame of a slot that will never be filled, which is
        // what makes a deliberate omission read as a missing feature. The
        // note takes the left-hand slot instead, in its own quiet face, and
        // the footer reads as a footer rather than as half of one.
        footer={u.state === 'flagged' && u.flaggedCount <= u.flags.length
          ? <FooterNote mode={mode}>nothing else was unusual this update</FooterNote>
          : undefined}
      >
        {email ? <>{left}{right}</> : <TileColumns of={2}>{left}{right}</TileColumns>}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    data.unusual.flags.forEach((flag, i) => Object.assign(out, flagFigures(flag, i + 1)))
    // The page bar's own number and §1's n are the same number, so it is
    // declared once, here, by the block that states what it is the n OF.
    if (data.windowVideos != null) {
      out.week_videos = { value: data.windowVideos, unit: 'videos', label: 'videos this update covered' }
    }
    return out
  },

  quotes(data) {
    return data.unusual.flags.flatMap((f) => f.quotes.map((q) => q.quote.ref))
  },

  emptyState(data) {
    const u = data.unusual
    // NOT AN EMPTY STATE IN THE USUAL SENSE. Four of the five states have
    // something to say and only one of them is "we looked and found nothing";
    // they all come through here because a page, a slide and an email must
    // word one silence one way (lib/blocks/types.ts).
    switch (u.state) {
      case 'flagged':
        return null
      // THE SENTENCES SAY "UPDATE", AS THE QUESTION AND THE METAS DO (design
      // review F8). The tile carried both clocks: the question asked about
      // "this update", the footer said "nothing else was unusual this update",
      // and these three still said "week" — on a page where Sealand's newest
      // update covers thirty days, which is the exact confusion D6 exists to
      // prevent. The block's TITLE stays the artboard's "Unusual this week",
      // because that is what the page is called and the reader arrived by
      // clicking it; what was measured is an update, and every sentence that
      // states what was measured now says so.
      case 'nothing_unusual':
        return u.setSize != null
          ? `Nothing unusual in this update (${fmtInt(u.setSize)} watched).`
          : 'Nothing unusual in this update.'
      case 'refused':
        return u.note ?? 'This update was not compared with the months behind it.'
      case 'baseline_forming':
        return 'Not checked in this update.'
      case 'unreadable':
        // THE RECORD SAYS SOMETHING FIRED AND WE CANNOT SHOW IT. Every word
        // here is chosen against the sentence it replaces: "Nothing unusual
        // this week" would be a reading, and what happened is that the reading
        // could not be fetched.
        return u.flaggedCount > 0
          ? `This update’s check raised ${fmtInt(u.flaggedCount)} ${u.flaggedCount === 1 ? 'flag' : 'flags'} and they could not be read just now.`
          : 'This update’s check raised flags and they could not be read just now.'
      case 'not_checked':
      default:
        return 'No update has run this check for this workspace yet.'
    }
  },
}

/**
 * The header's own line — the mock's "one theme cleared its band · of 312
 * videos this week".
 *
 * BOTH HALVES ARE REAL OR NEITHER IS PRINTED. The count of what cleared comes
 * off the check's own row; the denominator is the windowed read, which is not
 * installed on either tenant today, so where it is absent the line states the
 * count and the SET IT WAS DRAWN FROM instead of a denominator it does not
 * have. "Objects watched · testable" is kept for every state but `flagged`,
 * because on a quiet update that pair is the only evidence the check ran at all.
 */
function headerMeta(u: WeekData['unusual'], windowVideos: number | null): string | undefined {
  const watched = u.setSize != null ? `${fmtInt(u.setSize)} objects watched · ${fmtInt(u.tested ?? 0)} testable` : undefined
  if (u.state !== 'flagged' || u.flaggedCount === 0) return watched
  const cleared = `${fmtInt(u.flaggedCount)} of ${fmtInt(u.tested ?? u.flaggedCount)} tested cleared its band`
  // "· across 205 videos", NOT "· of 205 videos" (code review C10). The two
  // halves have different denominators — the first counts OBJECTS the check
  // tested, the second counts the VIDEOS the update covered — and joining two
  // "of"s with a dot read as one count over two denominators.
  return windowVideos != null ? `${cleared} · across ${fmtInt(windowVideos)} videos this update` : cleared
}

/** One flag, in full: the object, the week, the months behind it, the band,
 *  the n, and the explanation labelled as an interpretation. */
function Flag({ flag, n, mode, figures }: { flag: UnusualFlag; n: number; mode: 'app' | 'print' | 'email'; figures: FigureTable }) {
  const email = mode === 'email'
  const weekPct = pct(flag.week.k, flag.week.n)
  const basePct = pct(flag.baseline.k, flag.baseline.n)
  const months = flag.baselineMonths.map(monthName).join(', ')

  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-2'} style={email ? { marginTop: n > 1 ? 14 : 0 } : undefined}>
      {/* THE MOCK'S ONE-LINE ASSERTION, IN ITS SLOT AND IN THE HONEST FORM.
          The artboard reads "“Zips failing after a year” is running at 3.1× its
          usual rate, mostly under Freitag content." Both halves are refused:
          a bare multiple is a movement claim with neither n nor band (D3), and
          nothing decomposes a flag by the audience it sat under, so "mostly
          under Freitag content" has no field at all. What the code can write is
          the banded k-of-n — the level, the level behind it, the difference and
          the band it had to clear — and it is written here, at the mock's size
          and weight, as the block's lead.
          SANS, NOT THE ARTBOARD'S SERIF. Serif is speech in this product
          (P0's ruling, the in-app quote); a claim the code composed is not
          speech. Recorded as a deviation. */}
      <span
        className={email ? undefined : 'text-[15px] font-medium leading-[1.35] tracking-[-0.005em] text-foreground [text-wrap:pretty]'}
        style={email ? { fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: EMAIL.ink } : undefined}
      >
        {/* THE LABEL IS THE MODEL'S WORDS AND IS MARKED AS THE MODEL'S (code
            review C6 / design review F9). `flag.label` is a `pass_b_theme`
            string a reasoning model wrote, and the whole sentence used to be
            ONE `data-copy="verdict"` span — the contract's widest exemption,
            whose entire range rule (c) cuts out of the block-wide sweep. So a
            register label reading "Concerns about declining quality" printed a
            direction word in the page's lead sentence with nothing checking it,
            and read as the product's own movement claim because the rest of the
            span is one. The sibling block on this page has always done it
            correctly (`rising.tsx`); the lead sentence now does too: the label
            names its slot, the claim code composed stays a verdict, and the
            span around them is marked nothing and is checked like any prose. */}
        <span data-copy="subject" data-slot="pass_b_theme">{flag.label}</span>{' '}
        <span data-copy="verdict">
          ran at {fmtPct(weekPct, 1)} of this update against {fmtPct(basePct, 1)} across {months}, a difference of{' '}
          {flag.changePts.toFixed(1)} points, on a band of {flag.bandPts.toFixed(1)}.
        </span>
      </span>
      <BlockStat
        mode={mode}
        size="lg"
        value={fmtInt(flag.week.k)}
        unit="videos this update"
        // THE SAME LABEL, THE SAME MARKER. `BlockStat.level` takes a NODE for
        // exactly this: rule (b) reads the level node's whole text, marked
        // descendants included, so the "of N" is still enforced while the
        // model's words carry their own slot.
        level={{
          word: <span data-copy="subject" data-slot="pass_b_theme">{flag.label}</span>,
          of: `of ${fmtInt(flag.week.n)} videos this update covered`,
        }}
        // THE DENOMINATOR'S OWN QUALIFIER, AND NOTHING ELSE (design review F4).
        // It used to end "· against 3.5% across Jun 2026, Jul 2026, Aug 2026",
        // which is the second half of the claim line four lines above it and
        // the second half of the model's opening sentence below it: one
        // comparison, stated three times in 200px.
        base={flag.denominator}
      />
      {/* AND THEY ARE ONE PARAGRAPH, NOT TWO LINES (review W7): both qualify
          the SAME comparison — the three months behind the flag — so stacking
          them at equal rank under the figure they qualify read as two more
          facts about the flag rather than as its small print. */}
      {baselineCaveats(flag).length > 0 ? (
        <Line mode={mode}>{baselineCaveats(flag).join(' ')}</Line>
      ) : null}

      {flag.sentences.length > 0 ? (
        <Interpretation sentences={flag.sentences} model={flag.explanationModel} mode={mode} figures={figures} />
      ) : null}

      {flag.quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={q.cite} mode={mode} />)}
    </div>
  )
}

/**
 * The model's paragraph, labelled — with its figure tokens written in.
 *
 * `Interpretation.sentences` CARRY `[[key]]` TOKENS INTACT (lib/prose/
 * interpret.ts), because the explainer is instructed to cite every figure as a
 * placeholder and `explanationJson` stores exactly what it wrote. Printing the
 * string as it stands puts a literal `[[flag_1_week_share]]` in front of a
 * paying client, which is what this block did until 2026-09-16 — the fixture's
 * hand-written token-free prose meant no test ever saw it.
 *
 * So the sentences go through `TokenProse`, the same door Overview's
 * interpretation uses: the value is substituted from the block's own measured
 * table, marked `data-copy="figure"` so the contract can tell code's number
 * from the model's words, and any sentence citing a key the table lacks is
 * dropped WHOLE rather than printed with a gap in it.
 *
 * Joined with a space and substituted once: `substituteFigures` splits on
 * sentences itself, so the drop stays per sentence.
 */
function Interpretation({
  sentences, model, mode, figures,
}: {
  sentences: readonly string[]
  model: string | null
  mode: 'app' | 'print' | 'email'
  figures: FigureTable
}) {
  const email = mode === 'email'
  const label = model ? 'Interpretation · written by a model, from the figures above' : 'Interpretation'
  const body = sentences.join(' ')
  if (email) {
    return (
      <div style={{ background: EMAIL.inner, borderRadius: 4, padding: '10px 12px', marginTop: 8 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>{label}</div>
        <TokenProse body={body} figures={figures} mode={mode} model figureFace="inherit" />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5 rounded bg-muted/50 px-3 py-2.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      {/* THE FIGURES IN THE SENTENCE'S OWN FACE (design review F6). A mono
          glyph is one advance wide whatever it is, so the decimal points in
          "13.7%" and "3.5%" got a digit's worth of air on both sides — six
          lines under a claim line that sets the same two numbers in sans and
          reads correctly, one page printing one figure two ways. Weight marks
          them instead; the contract's marker is unchanged. */}
      <TokenProse body={body} figures={figures} mode={mode} model figureFace="inherit" className="m-0 text-[12.5px] leading-relaxed" />
    </div>
  )
}

/**
 * The thirteen-update series, in words — the mock's chart legend
 * (`week.unusual.chart.legend`), which is the half of it that carries the
 * numbers. The chart itself is drawn in wave 2 off `UnusualBlock.series`.
 *
 * THE BASIS IS PRINTED BESIDE THE BAND, AND IT SAYS "UPDATES". The mock's axis
 * is thirteen WEEKS; this one is thirteen deliveries, which is a chart of our
 * own cadence and not of the conversation — so the axis's own words go on the
 * block rather than in a caption somewhere a reader may not reach. And the band
 * says "videos", because the other band in this block (a flag's) is in
 * percentage points and two unlabelled bands on one block is how 4.9 points
 * gets read as five videos.
 *
 * DRAWN IN EVERY STATE, including the four where the check cannot speak: what
 * each update brought in is a fact about our reading, and it is true whether or
 * not there are three months to compare it with.
 *
 * AND EVERY COUNT HERE IS RESTATED AS A CONTRIBUTION TO ITS MONTH. This week is
 * the one surface dated by the delivery rather than the month, and the rule it
 * lives under is that a count stated against the run's own frozen window is
 * stated again against the month it falls in — "that second half is what stops
 * a reader treating a week as a period, and it is not optional decoration"
 * (AGENTS.md). The legend states three window-dated counts (this update's, the
 * band's low and high) and the axis a fourth, so the newest point's own
 * contribution is printed under them, from the SAME windowed read clipped the
 * same way that §4 prints it from — which is why the two sections cannot
 * disagree. Where there is no contribution to state, the line says so rather
 * than leaving four window counts standing alone.
 */
function Series({ series, mode, charted }: { series: UpdateSeries | null; mode: 'app' | 'print' | 'email'; charted: boolean }) {
  if (!series || series.points.length === 0) return null
  const newest = series.points[series.points.length - 1]
  const smallPrint = [...(charted ? [] : [`${series.basis}.`]), ...caveats(series, charted).map((n) => n.text)]
  return (
    <>
      {/* WHERE THE CHART IS DRAWN, ITS LEGEND IS THIS SENTENCE (design review
          F4): the legend prints the band, its "typical", and how many updates
          found nothing, so printing `updateSeriesLine` and `series.note` under
          it said the same two facts twice, two lines apart, in one column.
          Where there is no chart — the email arm, and a series of one point —
          these ARE the chart and they are printed in full. */}
      {/* THE TWO READINGS FIRST, AT READING RANK: what the newest update
          found, and what it put into its month. */}
      <Line mode={mode} rank="reading">{charted ? updateSeriesHead(series) : updateSeriesLine(series)}</Line>
      {/* Where the contribution cannot be stated, §4 "What came in" says so
          once; §1 printed it twice more (copy de-clutter C25, C27). */}
      {newest.contribution.map((c) => (
        <Line key={c.month} mode={mode} rank="reading">{contributionLine(c.month, c.videos, c.of)}</Line>
      ))}
      {/* THEN THE SMALL PRINT, AS ONE PARAGRAPH (review W7). The axis's own
          words — thirteen deliveries at the dates those deliveries covered,
          which is what keeps a reader from reading thirteen windows as
          thirteen periods — and then EVERY CAVEAT EXCEPT THE ONE THE PICTURE
          ALREADY MADE (design review F4). `notes` carries each with its kind;
          where the chart is drawn it has already put the quiet updates in the
          gutter and counted them in its legend, so printing the `quiet` note
          under it said the same fact twice. Every other kind — a windowless
          update, a short series, no band, an absent windowed reading — is
          printed in both arms, because nothing draws those. Joined, not
          stacked: they are one body of apparatus, and four paragraphs of it
          read as four facts competing with the two above. */}
      {/* Where the chart is drawn its meta already names the updates, so the
          basis is printed only where the chart is absent (copy de-clutter C30). */}
      {smallPrint.length > 0 ? <Line mode={mode}>{smallPrint.join(' ')}</Line> : null}
    </>
  )
}

/**
 * A line under a reading, at one of TWO ranks (review W7).
 *
 * §1 stacked eight of these — four under the chart and four down the right
 * column — all 11.5px, all `muted-foreground`, all the same weight, with the
 * sentences that state a MEASUREMENT sitting at the same rank as the
 * sentences that qualify one. The wave-2 pass (F4) removed the repetition; it
 * did not rank what was left, and an unranked stack is a reader's problem
 * whether or not every line in it is a rule in force. Every one of them is,
 * and none is deleted here.
 *
 *   `reading`  a sentence that STATES something measured — what the newest
 *              update found, what it contributed to its month. 12px, in the
 *              secondary ink, because it is an answer.
 *   `caveat`   the apparatus and its qualifications — what a point is, what
 *              the series cannot say, whether the comparison is like for
 *              like. 11.5px muted, and the adjacent ones are joined into ONE
 *              paragraph rather than stacked as separate lines, because they
 *              are one body of small print and four paragraphs of it reads as
 *              four facts.
 */
/** The footer's note, in the LEFT slot — so it keeps its quiet face rather
 *  than taking the footer's own 12px/500 link styling. */
function FooterNote({ mode, children }: { mode: 'app' | 'print' | 'email'; children: React.ReactNode }) {
  if (mode === 'email') {
    return <span style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}>{children}</span>
  }
  return <span className="font-mono text-[11px] font-normal text-muted-foreground">{children}</span>
}

function Line({ mode, rank = 'caveat', children }: { mode: 'app' | 'print' | 'email'; rank?: 'reading' | 'caveat'; children: React.ReactNode }) {
  const reading = rank === 'reading'
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: reading ? 12 : 11.5, color: reading ? EMAIL.ink2 : EMAIL.muted, marginTop: 4 }}>
        {children}
      </div>
    )
  }
  return <p className={reading ? 'm-0 text-[12px] text-secondary-foreground' : 'm-0 text-[11.5px] text-muted-foreground'}>{children}</p>
}

/**
 * What the three months behind a flag cannot promise.
 *
 * `baseline_filling_months` says the baseline is still moving;
 * `baseline_regime` says whether the three were read under one grouping at
 * all, and the check reports the flag either way (decision L's posture,
 * available to it because an anomaly reading never speaks a direction word).
 * Printing the first and not the second told a reader the comparison would
 * move without telling them it may not be like for like. `not_grouped` is not
 * a caveat — a kind is a kind and has no grouping to be like-for-like about —
 * and `null` means the column is not there to ask.
 */
function baselineCaveats(flag: UnusualFlag): string[] {
  // The grouping caveat is the page-foot note's, said once for the page
  // (copy de-clutter C34); the filling caveat is this flag's own.
  const out: string[] = []
  if (flag.baselineFilling.length > 0) {
    out.push(flag.baselineFilling.length === flag.baselineMonths.length
      ? 'Every month behind it was still filling when this was read, so the comparison will move.'
      : `${flag.baselineFilling.map(longMonth).join(' and ')} had not finished when this was read, so the comparison will move.`)
  }
  return out
}

/** The series' caveats a surface still has to say in words. */
function caveats(series: UpdateSeries, charted: boolean): UpdateNote[] {
  // `notes` is empty on a series built before the kinds existed — a frozen
  // snapshot, a hand-made fixture — and `note` is then the only thing to
  // print, so the joined string stands in as one unkinded caveat.
  if (series.notes.length === 0) return series.note ? [{ kind: 'short', text: series.note }] : []
  // The windowed reading's absence is said once, in §4 (copy de-clutter C27).
  const notes = series.notes.filter((n) => n.kind !== 'window_read')
  return charted ? notes.filter((n) => n.kind !== 'quiet') : notes
}

const pct = (k: number, n: number): number => (n > 0 ? (k / n) * 100 : 0)
