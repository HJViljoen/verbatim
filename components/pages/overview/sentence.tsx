import Link from 'next/link'
import type { Block, QuoteRef, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockQuote } from '@/components/blocks/quote'
import { RecStatusMenu, RecStatusWord } from '@/components/rec-status'
import { TileBlock } from '@/components/shell/tile'
import { TileColumns } from '@/components/shell/page-grid'
import { INTERPRETATION_LABEL } from '@/lib/prose/interpret'
import { fmtInt, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import { onScreenText } from '@/lib/pages/overview'
import type { AnomalyLine, LedgerRow, OverviewData, Voice } from '@/lib/pages/overview'
import { TokenProse } from '@/components/blocks/prose'

// OV1 · In one sentence, anything unusual, and the one thing to do
// (design §3 OV1; ported to `Main.dc.html` §1 in Block D wave 2).
//
// THE ARTBOARD'S ONE HERO. This is the section the mock sets apart from every
// other: the month's sentence at serif 17px/500, the unusual line and the
// recommendation under it, and the month's two voices beside them behind a
// rule. The build printed all five things stacked at 13.5px sans in one column,
// which is the single biggest visual gap on the page (mock-gap §Visual
// fidelity). Nothing about the READING changes here — every element below is a
// field that already existed — except the recommendation's provenance, which
// had no fields at all and now has three.

/** The anomaly line, in the reader's words. One line, with its band, its n and
 *  one quote — and ABSENT when nothing fired, never replaced by a reassurance:
 *  a block that prints "nothing unusual" every week trains the reader to skip
 *  it. ("Nothing unusual this week" is printed on This week and on the weekly
 *  report, where it answers a question the reader arrived with.) */
function anomalySentence(a: AnomalyLine): string {
  return `${a.label} — ${fmtInt(a.k)} of ${fmtInt(a.n)} ${a.denominator} in the week of ${shortDate(a.weekStart)}, against the three months behind it (band ±${Math.abs(a.bandPts)} points).`
}

/**
 * "Two voices" — the artboard's heading (`main.sentence.voices.label`).
 *
 * AND THE POPULATION UNDER IT, NOT INSTEAD OF IT. The build printed "2 of 37
 * voices", which is disposition #18's point: a reader has to be able to see
 * that two were CHOSEN and not that two were all there was. The mock's heading
 * is the better heading and the count is the better fact, so the heading is the
 * mock's and the count moves to a mono line under it where it does not have to
 * compete with it.
 */
const COUNT_WORD: Record<number, string> = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four' }

export function voicesLabel(shown: number): string {
  const word = COUNT_WORD[shown]
  return word ? `${word} ${shown === 1 ? 'voice' : 'voices'}` : `${fmtInt(shown)} voices`
}


/**
 * "first on record 3 months ago · repeated across 3 updates · 412 videos behind
 * it" — each clause only where there is one (`main.sentence.rec.provenance`).
 *
 * THREE FIELDS THAT WERE ALL ABSENT. `monthsOld` was a hard null,
 * `AdviceRow.timesMade` was Market's alone, and `groundingFor` had never been
 * called on this page — so the cell under the recommendation printed the
 * decision stamp and nothing else. The mock prints all three.
 *
 * AND THE WORDS ARE NOT THE MOCK'S, on purpose:
 *
 *   · "first RAISED 3 months ago" becomes "first ON RECORD", because that is
 *     what the date is (D14: a "since" date is earliest evidence, not a start
 *     date — the advice may well be older than the oldest copy we still hold);
 *   · "repeated 3 updates running" becomes "repeated across 3 updates",
 *     because "running" claims they were consecutive and nothing counts that
 *     (D9: an update count is the run clock's own bookkeeping, and it keeps the
 *     word "update" in it so it can never read as a period);
 *   · "grounded in 412 videos" is `Grounding.line`, which says what the count
 *     is counted over — and says the EVIDENCE IS GONE where it is, rather than
 *     printing the "0" all twelve of this tenant's live rows would print.
 */
export function provenanceLine(l: LedgerRow): string | null {
  const parts: string[] = []
  if (l.monthsOld != null && l.monthsOld > 0) {
    parts.push(`first on record ${fmtInt(l.monthsOld)} ${l.monthsOld === 1 ? 'month' : 'months'} ago`)
  }
  if (l.timesMade > 1) parts.push(`repeated across ${fmtInt(l.timesMade)} updates`)
  if (l.grounding) parts.push(l.grounding.line)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** "you marked it on 2 Sep", or the honest absence. Mono, and its own node: the
 *  artboard sets the stamp in mono under the control where the build set it in
 *  sans inside a sentence (`main.sentence.rec.stamp`). */
export function decisionStamp(l: LedgerRow): string {
  return l.decidedAt ? `you marked it on ${shortDate(l.decidedAt)}` : 'no decision recorded'
}


/** "update of 13 Sep" — the newest update delivered into this month, or the
 *  honest absence. `BarBlock.updateDates` are already formatted short dates, so
 *  this is the last of them and never a second date formatter. */
export function lastUpdateMeta(data: OverviewData): string {
  const dates = data.bar.updateDates
  return dates.length > 0 ? `update of ${dates[dates.length - 1]}` : 'no update yet this month'
}

/** One voice: the quote behind its green-tinted rule, the video's own on-screen
 *  text where the OCR pass read any, and the cite tail. */
function VoiceRow({ voice, mode }: { voice: Voice; mode: RenderMode }) {
  const cite = voice.href
    ? <a href={voice.href} rel="noreferrer" target="_blank" style={mode === 'email' ? { color: EMAIL.muted } : undefined}>{voice.cite}</a>
    : voice.cite
  // THE ON-SCREEN LINE IS A SIBLING NODE, NEVER A SPAN INSIDE THE QUOTE. It is
  // a DIFFERENT speaker — the brand's or the creator's words, burnt into the
  // frame — and folding it into the blockquote would attribute it to the
  // commenter. It carries no `data-copy` mark of its own, so rule (c) applies
  // to it as it applies to any unmarked markup on the block.
  //
  // IT IS A QUOTE AND IT CARRIES ITS OWN REF (`t:<videos.id>`, code review C1),
  // so a stored export holds the ref and re-resolves the words at render, and
  // a video the retention sweep removes takes its line with it. `data-copy`
  // says `quote` for the reason the kind exists: these are somebody's actual
  // words and not model prose — "1 bag. 3 years. 0 regrets" is a digit rule (a)
  // may not police, exactly as a commenter's "three winters" is.
  const onScreenLine = onScreenText(voice.onScreen?.text ?? null)
  const onScreen = onScreenLine ? (
    mode === 'email'
      ? <div data-copy="quote" style={{ fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.ink2, marginTop: 3 }}>on-screen text on the same video: “{onScreenLine}”</div>
      // AND IT SITS IN THE QUOTE'S OWN TEXT COLUMN (Block D wave 3, M17).
      // `QuoteBlock` indents its words past a 2px rule and 12px of padding;
      // this line was a sibling at the container's indent, level with the
      // eyebrow, so a scanner reading down the voices column saw two quotes
      // and then a loose unattributed sentence. `pl-[14px]` puts it under the
      // words it belongs beside. It takes no rule of its own, which is the
      // point: it is attached to the VIDEO and it is not inside the
      // blockquote, because the speaker is a different one.
      : <span data-copy="quote" className="block pl-[14px] font-mono text-[10.5px] text-secondary-foreground">on-screen text on the same video: “{onScreenLine}”</span>
  ) : null
  if (mode === 'email') {
    return <div><BlockQuote quote={voice.quote} cite={cite} mode={mode} />{onScreen}</div>
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <BlockQuote quote={voice.quote} cite={cite} mode={mode} />
      {onScreen}
    </div>
  )
}

export const overviewSentence: Block<OverviewData> = {
  key: 'overview.sentence',
  title: 'In one sentence',
  question: 'What moved this month, and what should we do about it?',

  render(data, mode = 'app', ctx) {
    const s = data.sentence
    const email = mode === 'email'
    const market = `${ctx.appUrl}/dashboard/market`
    const week = `${ctx.appUrl}/dashboard/week`

    // THE MONTH'S SENTENCE, AT THE HERO RAMP. Serif 17px/500, `1.35`,
    // `-0.005em`, `text-wrap:pretty` — the §1 ramp `Tile variant="hero"` sets
    // for its own `lead`, printed by the BLOCK rather than by the tile because
    // the monthly report renders this block with no tile around it and the
    // sentence must not lose its weight on paper. Code's own sentence, so it is
    // not marked `prose`: it is allowed its numbers, and the tokens in it are
    // substituted from the block's own figure table.
    const head = (
      <div className={email ? undefined : 'flex flex-wrap items-baseline gap-x-2 gap-y-1'}>
        <TokenProse
          body={s.body}
          figures={s.figures}
          mode={mode}
          // THE FIGURES TAKE THE SENTENCE'S OWN FACE (Block D wave 3, M1).
          // `TokenProse` DERIVES the face from `size` — `inherit` in a hero,
          // `mono` in a body sentence — and this caller hand-rolls the serif
          // ramp through `className` rather than passing `size`. So `hero` was
          // false, the face fell to `mono`, and every substituted figure
          // rendered `font-mono tabular-nums` inside a 17px IBM Plex Serif
          // line: "9 . 4%" and "1 , 388", which is the exact defect that
          // prop's own docblock names.
          //
          // `size="hero"` IS NOT THE FIX HERE. `size` also drives the EMAIL
          // arm, where `hero` means the MonthlyReport artboard's 23px serif —
          // and this block's email arm is the 13.5px sans one, which the
          // monthly report composes around. So the face is stated directly,
          // the way This week's two hand-rolled heroes state it
          // (week/unusual.tsx:337,350).
          figureFace="inherit"
          // AND A MEASURE (design review Medium 19). With no voices column
          // beside it — the refused state, which is what production is in
          // today — the sentence ran the tile's full 1,150px at 17px serif,
          // about 120 characters a line. 68ch is the house measure for
          // continuous prose and it costs the populated state nothing, where
          // the column already holds the line to about that.
          className="m-0 max-w-[68ch] font-serif text-[17px] font-medium leading-[1.35] tracking-[-0.005em] [text-wrap:pretty]"
        />
        {s.lead ? <BlockMovement verdict={s.lead} unit="pts" mode={mode} /> : null}
      </div>
    )

    // ONE LINE WITH THE AMBER DOT — the artboard's shape. It was a tinted
    // paragraph block, which gave a single sentence the weight of a section on
    // the page's densest tile.
    const unusual = s.anomaly ? (
      email ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 8 }}>
          <strong style={{ color: EMAIL.ink }}>Unusual this week:</strong> {anomalySentence(s.anomaly)}
        </div>
      ) : (
        <p className="m-0 flex min-w-0 items-baseline gap-2 text-[12.5px]">
          <span aria-hidden className="mt-1 size-1.5 shrink-0 self-start rounded-full bg-mixed" />
          <span className="min-w-0">
            <span className="font-medium">Unusual this week:</span> {anomalySentence(s.anomaly)}
            {/* NOT ON PAPER (package E-marketing, fix pass). The marketing
                brief borrows this block onto a landscape sheet, where "This
                week →" is an instruction to press a control the reader of a
                PDF has not got — the rule `MONTHLY_MOVES_EMPTY` was written
                under. The anomaly sentence carries itself; only the link
                goes. E-main's ported layout keeps the dot and the baseline
                row. */}
            {mode === 'print' ? null : (
              <> <Link href={week} className="whitespace-nowrap font-medium underline underline-offset-[3px]">This week →</Link></>
            )}
          </span>
        </p>
      )
    ) : null

    const read = s.interpretation.sentences.length > 0 ? (
      <div className={email ? undefined : 'flex flex-col gap-1'}>
        <span
          className={email ? undefined : 'w-fit rounded-full bg-inner px-2 py-px text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted } : undefined}
        >
          {INTERPRETATION_LABEL}
        </span>
        <TokenProse body={s.interpretation.sentences.join(' ')} figures={s.figures} mode={mode} model />
      </div>
    ) : null

    // THE TITLE IS A MODEL'S WORDS READ BACK OUT OF A COLUMN, so it carries the
    // `stored` kind and names the slot that wrote it — the exemption WP14
    // argued and won for exactly this slot on Market (advice.tsx). WP11 did
    // not, and Overview passed rule (c) only by luck: `topRecommendation` ranks
    // by priority then grounding over a table deleted and reinserted every
    // update, and two of Össur's live ledger titles fail it — "Increase Content
    // Volume to Improve Share of Voice" twice, "Increase Brand Presence to
    // Capitalize on Low Competitor…" once.
    const provenance = s.ledger ? provenanceLine(s.ledger) : null
    const ledger = s.ledger ? (
      email ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, marginTop: 8 }}>
          {/* The marker wraps the model's value and nothing else — the meta
              line below it is code's and stays under rule (c). */}
          <span data-copy="stored" data-slot="pass_d_b_recommendation">{s.ledger.title}</span>
          <div style={{ fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted, marginTop: 2 }}>
            {[provenance, `${s.ledger.statusLabel} · ${decisionStamp(s.ledger)}`].filter(Boolean).join(' · ')}
          </div>
        </div>
      ) : (
        // THE ONE ROW THAT SAYS WHAT TO DO IS DRAWN AS THE ONE ROW THAT SAYS
        // WHAT TO DO (design review High 6). Sampled from the render, this
        // block, the "no longer being said" flag strip and the moves card were
        // the identical #F6F7F8 inner block — so the recommendation looked
        // exactly like the row reporting that a theme stopped mattering, and
        // the page had no focal point at all.
        //
        // IT IS MARKED BY ELEVATION AND WEIGHT, NEVER BY TONE. `Tile
        // variant="warm"` (MASTER's clay ring, reserved for this row) was
        // RETIRED on 2026-09-18 with the cream identity — it painted nothing
        // and had no call site — and MASTER's own rule is "depth is elevation,
        // never tone". So: the primary rail the sidebar uses to mark the active
        // row, and a heavier lead. No new colour, no second palette.
        <TileBlock className="flex items-center gap-4 border-l-2 border-primary pl-3">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">Top recommendation</span>
            <Link data-copy="stored" data-slot="pass_d_b_recommendation" href={s.ledger.href} className="text-[13.5px] font-semibold underline-offset-2 hover:underline">{s.ledger.title}</Link>
            {provenance ? <span className="font-mono text-[10.5px] tabular-nums text-secondary-foreground">{provenance}</span> : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {/* THE CONTROL, NOT A WORD (`main.sentence.rec.status`). The status
                is a decision the reader makes and Market has had the menu since
                WP14; Overview printed the word inside a sentence, so the one
                action on the page's most important row was somewhere else.
                Print and email get the word — nothing there is clickable. */}
            {mode === 'app'
              ? <RecStatusMenu id={s.ledger.id} status={s.ledger.status} />
              : <RecStatusWord status={s.ledger.status} />}
            <span className="font-mono text-[10.5px] text-secondary-foreground">{decisionStamp(s.ledger)}</span>
          </div>
        </TileBlock>
      )
    ) : null

    // A43: "chosen from the N voices…" is cut; a reader knows quotes are a
    // selection.
    const voices = s.voices.length > 0 ? (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-2.5'}>
        <span
          className={email ? undefined : 'text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted } : undefined}
        >
          {voicesLabel(s.voices.length)}
        </span>
        {s.voices.map((v) => <VoiceRow key={v.quote.ref} voice={v} mode={mode} />)}
      </div>
    ) : null

    const empty = overviewSentence.emptyState(data)
    const left = (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-2.5'}>
        {head}
        {unusual}
        {read}
        {ledger}
      </div>
    )

    return (
      <BlockFrame
        title={overviewSentence.title}
        // THE PAGE PRINTS ONE QUESTION, IN THE PAGE BAR (Block D wave 3, M8).
        // Parsed from `Main.dc.html`: all six blocks go straight from
        // `</header>` into their content grid, and the artboard's only question
        // is "What is this month's reading?" in the bar — which
        // `SurfacePageBar` already prints (`lib/nav.ts`, `page-bar.tsx:65`).
        // Six sub-lines under six eyebrows cost about 156px and put a second
        // narrator over every tile. The block keeps its `question` field, which
        // is its contract with the reader and what the nav and the legend read;
        // what stops is drawing it a second time inside the block.
        mode={mode}
        // "update of 13 Sep" — the last update this month, and NOT the mock's
        // "next 4 Oct" beside it (D14): the next update's date is a promise,
        // and nothing in the product holds one.
        meta={lastUpdateMeta(data)}
        footer={openLink(mode, market, 'Open Market →')}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {email ? (
          <div>{left}{voices}</div>
        ) : voices ? (
          // THE ARTBOARD'S TWO COLUMNS, through P0's primitive: the reading on
          // the left, the month's voices behind a rule on the right. It
          // collapses to one stacked column under `xl`, where two comparisons
          // squeezed into half a phone are two unreadable comparisons.
          //
          // `rail={400}` IS `Main.dc.html`'s OWN SPLIT (SH15). An even 584/584
          // is what `of={2}` means without it, and this pair is not a pair of
          // equals: the left column is the month's reading and the right is the
          // evidence behind it. At 584 the 17px serif sentence wrapped to two
          // lines — most of this tile's 292px -> 459px growth against the
          // artboard — while the voices column ran about 184px wider than its
          // citations need and every tail ended in a ragged gutter. SH15 built
          // the parameter for this caller and named it in its own commit; this
          // is the caller.
          <TileColumns of={2} rail={400}>
            {left}
            <div className="min-w-0 xl:pl-4">{voices}</div>
          </TileColumns>
        ) : left}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = { ...data.sentence.figures }
    const a = data.sentence.anomaly
    if (a) {
      out.unusual_week_videos = { value: a.k, unit: 'videos', label: `videos that raised ${a.label} this week` }
      out.unusual_week_of = { value: a.n, unit: 'videos', label: 'videos read in the week' }
    }
    return out
  },

  verdicts(data): Verdict[] {
    return data.sentence.lead ? [data.sentence.lead] : []
  },

  quotes(data): QuoteRef[] {
    const refs = data.sentence.voices.map((v) => v.quote.ref)
    return data.sentence.anomaly?.quote ? [...refs, data.sentence.anomaly.quote.ref] : refs
  },

  emptyState(data) {
    const s = data.sentence
    if (s.lead || s.anomaly || s.ledger || s.voices.length > 0) return null
    return 'There is nothing to report on this month yet.'
  },
}

