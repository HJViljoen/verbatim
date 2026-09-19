import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockCalendar } from '@/components/blocks/calendar'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockQuotes } from '@/components/blocks/quote'
import { Sparkline } from '@/components/charts/sparkline'
import { panelRule } from '@/components/pages/overview/category'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, monthName } from '@/lib/format'
import type { CalendarSeries } from '@/lib/charts/calendar'
import { monthlyLineLabel, type Mover } from '@/lib/pages/overview'
import { hasQuote } from '@/lib/renderables/quotes-freeze'
import type { CategoryPage, QuarterlyData, QuarterMover } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE } from '@/lib/reports/quarterly'
import { Card, ChartEndings, Chip, Column, Columns, Eyebrow, Line, Note } from './parts'

// QR4 · What the category talked about (mock page 4).
//
// MOVERS AND THE MIX ARE A MONTH, AND THE PAGE SAYS SO IN ITS FIRST LINE.
// This is the one page of a quarterly review most likely to be misread: a
// reader holding a document headed "Q3" will take every figure on it for a
// quarter figure unless told otherwise, and the movers, the kind mix, the mood
// and the attention line are all this month against last. The mock's own note
// says it; `CategoryPage.basis` composes it; it is printed before any row.
//
// THE QUARTER'S OWN READING, where the window pair could be taken, is a
// SEPARATE list below, banded by `quarterChange` over distinct videos. Where
// M3 is unapplied the list is empty and the page says the comparison is not
// recorded — it does not add three months together to fill the gap.
//
// A THEME'S LABEL IS THE MODEL's WORDS (`pass_b_theme` policy 'none'), so every
// site that prints one marks it `data-copy="subject"`. Six blocks failed rule
// (c) on live labels in the Block B fix pass for exactly this.
//
// ---- the port (Block D wave 2) -------------------------------------------------
//
// THE ARTBOARD'S 7fr / 5fr, AND THE TWO MOVER COLUMNS. What it does NOT take
// from the artboard:
//
//   · "Movers of the quarter" as a heading (D6). They are a month against the
//     month before it and on the normal send that month is outside the quarter.
//   · "Growing" / "Fading" as column headings (rule (c) — both are in
//     `DIRECTION_WORDS`). The monthly report's own headings are the precedent:
//     "Cleared their band · a larger share than last month", which is code
//     naming what was done to a number beside the band that earned it.
//   · the stacked partition bar and its "Other kinds" remainder (D4). Kinds are
//     INDEPENDENT shares of one denominator — measured at 175% and 228% summed
//     — so each is a row with its own "of N" and nothing reads as a whole.
//   · "▼ 18% since June" on the attention panel (D7, D8). The panel re-froze on
//     3 September, so that span compares two sets of accounts; the chart draws
//     the RULE at the re-freeze and the badge is `AttentionBlock.verdict`,
//     which on this corpus is the refusal.
//
// What it does take: the sparkline column (`Mover.spark`, added additively in
// wave 2), the month series under each row, the two READER_FLAGS as their own
// tinted block, the quote, and the mood's four rows with "of N judged" — Mixed
// included, which the mock folds away (D15).

/** A theme's label is the MODEL's words (`pass_b_theme`, policy 'none'), so it
 *  is marked and its slot is named — that is what buys the rule-(c) exemption,
 *  and a marker with no slot buys nothing. An AUDIENCE's name is code's, and
 *  marking it would claim a provenance it does not have. */
function ObjectLabel({ label, model, mode }: { label: string; model: boolean; mode: RenderMode }): ReactNode {
  if (!model) return mode === 'email' ? <strong>{label}</strong> : <span className="font-medium">{label}</span>
  return mode === 'email'
    ? <strong data-copy="subject" data-slot="pass_b_theme">{label}</strong>
    : <span data-copy="subject" data-slot="pass_b_theme" className="font-medium">{label}</span>
}

/** The months a mover's own series carried, named — the artboard's
 *  "Jul 5.1 · Aug 6.8 · Sep 9.4". A month with no reading is not named, which
 *  is why this is not simply the axis. */
function seriesLine(mover: Mover): string | null {
  const spark = mover.spark
  const months = mover.sparkMonths
  if (!spark || !months) return null
  // WITH THE UNIT. `Mover.spark` holds the same share the `FigureCell` above
  // the line prints, so a line reading "Jul 5.1 · Aug 6.8 · Sep 9.4" dropped
  // the `%` off three copies of a figure printed with it two rows up.
  const read = months
    .map((m, i) => {
      const v = spark[i]
      return v == null ? null : `${monthName(m).split(' ')[0]} ${fmtPct(v)}`
    })
    .filter((v): v is string => v != null)
  // THE LAST FOUR, WHICH IS WHAT THE ARTBOARD DRAWS. A six-month line wraps to
  // two rows on a column this narrow and the older half is already in the
  // sparkline beside it; `firstHeard` says how far back the object goes.
  return read.length ? read.slice(-4).join(' · ') : null
}

/**
 * One mover row: the label, the figure with its "of N", the sparkline, the
 * badge, the flags and the months.
 *
 * THE LINE IS REFUSED BELOW THREE READINGS AND THE MONTHS ARE NAMED INSTEAD —
 * `monthlyLineLabel`, the same rule OV2 and the printed deck already apply. A
 * chart is a direction claim too, and two points are not a direction.
 */
function MoverRow({ mover, mode }: { mover: QuarterMover; mode: RenderMode }) {
  const email = mode === 'email'
  const drawn = (mover.spark ?? []).filter((v) => v != null).length >= 3
  const label = mover.spark && mover.sparkMonths ? monthlyLineLabel(mover.spark, mover.sparkMonths) : null
  const months = seriesLine(mover)
  return (
    <div
      className={email ? undefined : 'flex flex-col gap-0.5 border-b border-border/70 pb-2 text-[12.5px] leading-[1.35]'}
      style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` } : undefined}
    >
      <ObjectLabel label={mover.label} model mode={mode} />
      <div className={email ? undefined : 'flex items-center justify-between gap-2'}>
        <FigureCell
          mode={mode}
          value={mover.pct == null ? '—' : fmtPct(mover.pct)}
          of={`${fmtInt(mover.k)} of ${fmtInt(mover.n)}`}
        />
        {!email && drawn ? <Sparkline values={mover.spark as (number | null)[]} color="var(--cat)" animate={false} width={72} height={22} /> : null}
      </div>
      <div className={email ? undefined : 'flex flex-wrap items-center gap-1.5'}>
        <BlockMovement verdict={mover.verdict} unit="pts" mode={mode} />
        {/* THE FLAG IS NOT A DIRECTION, AND IT SITS INSIDE A VERDICT NODE. Both
            `new` and `gone quiet` are in `DIRECTION_WORDS`, so rule (c) sweeps
            them anywhere else; the wording is the build's own ("first read in
            September"), which is a fact about the record and not about a
            series. */}
        {mover.flags.includes('new') ? (
          <span data-copy="verdict" className={email ? undefined : 'text-[11px] text-muted-foreground'}>first read this month</span>
        ) : null}
      </div>
      {months ? (
        <span data-copy="figure" className={email ? undefined : 'font-mono text-[10px] text-muted-foreground'}>
          {months}{!drawn && label ? ` · ${label}` : ''}
          {mover.firstHeard ? ` · first read ${monthName(mover.firstHeard)}` : ''}
        </span>
      ) : null}
    </div>
  )
}

/** The panel's months, as the calendar draws them. Not a share — the panel is a
 *  fixed set of accounts and the figure is the comment count under their
 *  videos, so there is no denominator and no floor. The same series
 *  `components/pages/overview/category.tsx` draws, so the page and the deck
 *  cannot disagree about the shape of it. */
function attentionSeries(c: CategoryPage, month: string): CalendarSeries[] {
  if (!c.attention || c.attention.months.length === 0) return []
  return [{
    label: c.label,
    color: 'var(--cat)',
    points: c.attention.months.map((m) => ({
      month: m.month,
      value: m.comments,
      state: m.month === month ? ('filling' as const) : ('read' as const),
      k: null,
      n: null,
    })),
  }]
}

export const quarterlyCategory: Block<QuarterlyData> = {
  key: 'quarterly.category',
  title: QUARTER_PAGE_TITLE.category,
  question: QUARTER_PAGE_QUESTION.category,

  render(data, mode = 'app') {
    const c = data.category
    const email = mode === 'email'
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={quarterlyCategory.title}
        question={quarterlyCategory.question}
        mode={mode}
        meta={c.denominator != null ? `${c.label} · ${fmtInt(c.denominator)} videos in ${c.monthLabel}` : c.label}
      >
        {children}
      </BlockFrame>
    )
    const empty = quarterlyCategory.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    const voices = c.quotes.filter(hasQuote)
    const panel = attentionSeries(c, data.monthStatus === 'filling' ? data.month : '')

    // THE MOVERS' OWN NOTE IS PRINTED ONCE. It is the sentence that says what
    // the mover list is and why it may be empty, and both the empty arm and
    // the flags block below printed it — so `thinMonthFixture()` read "What
    // moved most · Nothing moved clearly this month. · Nothing this artefact
    // follows has stopped being said. · Nothing moved clearly this month."
    const anyMover = c.growing.length + c.fading.length > 0
    // THE DISTINGUISHING WORD COMES FIRST, AND THE QUALIFIER IS SAID ONCE.
    // "Cleared their band · a larger share than last month" and "…a smaller
    // share…" are byte-identical until the FIFTH word, and at 10.5px uppercase
    // in a 1fr track both wrapped to two lines — so the only token telling the
    // two columns apart sat mid-line-one of a two-line all-caps block, on the
    // deck's tightest sheet, at two lines a column. The refusal of GROWING /
    // FADING is right and traced (D5); nothing asked for a seven-word heading.
    // "Larger share than last month" opens on the word that distinguishes it,
    // sets on one line, and the band — which is what both headings were
    // carrying — is stated once beside the section they are both under, where
    // it costs no line at all.
    const moverHead = (word: 'Larger' | 'Smaller') =>
      `${word} share than last month`
    const movers = (
      <Column mode={mode} gap={10}>
        {/* A SPAN, NOT A `Note`. `Eyebrow` is a `<p>`, and a `<p>` inside a
            `<p>` is closed by the parser before it opens — the aside came out
            as a sibling on its own line and cost the sheet 24px instead of
            nothing. */}
        <Eyebrow
          mode={mode}
          aside={
            mode === 'email'
              ? <span style={{ textTransform: 'none', letterSpacing: 0 }}>each cleared its own band</span>
              : <span className="font-sans text-[10px] normal-case tracking-normal text-muted-foreground">each cleared its own band</span>
          }
        >
          What moved most
        </Eyebrow>
        {anyMover ? (
          <Columns weights={[1, 1]} gap={24} mode={mode}>
            <Column mode={mode} gap={8}>
              <span className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'}>
                {moverHead('Larger')}
              </span>
              {c.growing.map((m) => <MoverRow key={m.id} mover={m} mode={mode} />)}
              {c.growing.length === 0 ? <Note mode={mode}>Nothing took a larger share than last month.</Note> : null}
            </Column>
            <Column mode={mode} gap={8}>
              <span className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'}>
                {moverHead('Smaller')}
              </span>
              {c.fading.map((m) => <MoverRow key={m.id} mover={m} mode={mode} />)}
              {c.fading.length === 0 ? <Note mode={mode}>Nothing took a smaller share than last month.</Note> : null}
            </Column>
          </Columns>
        ) : (
          <Note mode={mode}>{c.moversNote ?? 'Nothing moved clearly this month.'}</Note>
        )}

        {/* `qr.p4.flags` · the two READER_FLAGS in the mock's tinted block.
            "Gone quiet" is the REGISTER's own dormancy rule, read here exactly
            as Voice and the monthly report read it — never a second rule for
            one word — and the month beside it is the last month the theme
            carried a reading on this axis. */}
        <div
          className={email ? undefined : 'flex flex-col gap-1.5 rounded-md bg-inner px-3 py-2.5'}
        >
          {c.quiet && c.quiet.length > 0 ? (
            c.quiet.map((q) => (
              <p key={q.id} className={email ? undefined : 'm-0 flex items-start gap-2 text-[12.5px] leading-[1.4]'}>
                {/* THE MOCK'S CHIP, INSIDE A VERDICT NODE. "gone quiet" and
                    "new" are both in `DIRECTION_WORDS`, so rule (c) sweeps them
                    wherever they are not inside one — the marker is what says
                    this is the register's flag and not a claim about a series.
                    The wording and the month beside it are the build's own, the
                    same two Voice and the monthly movers print. */}
                <span data-copy="verdict"><Chip tone="plain" mode={mode}>gone quiet</Chip></span>
                <span>
                  <ObjectLabel label={q.label} model mode={mode} />
                  {q.lastHeard ? ` — last read ${monthName(q.lastHeard)}` : ''}
                </span>
              </p>
            ))
          ) : (
            <Note mode={mode}>{c.quietNote}</Note>
          )}
          {anyMover && c.moversNote ? <Note mode={mode}>{c.moversNote}</Note> : null}
        </div>


        {/* THE QUARTER'S OWN VOLUME, AND NOT ITS OBJECT ROWS.
            `countedLines` on page 2 already prints the three largest quarter
            readings with both sides' k of n, off the SAME list, under the
            paragraph that argues from them — so a second copy here was one
            artefact stating one comparison twice, and it cost 279px of a 561px
            slide. What is only here is the volume, which is a pair of counts
            and belongs to the page that names the audience.

            TWO COUNTS, NOT A BADGE, and no `of` on the cell. A volume is not a
            share of anything, which is what omitting `of` says; rule (b) reads
            a level node for an "of N" this figure cannot have. The first cut
            banded it against itself and printed "4,147 of 4,147 · no clear
            change" for every audience on the page. */}
        {c.quarterVolume ? (
          <Line
            mode={mode}
            label="Videos read this quarter"
            figure={<FigureCell mode={mode} value={fmtInt(c.quarterVolume.videos)} align="right" />}
            // THE POINTER NAMES A PAGE, NOT A PAGE NUMBER (D13). Only the
            // print deck paginates (`quarterly-deck.tsx` numbers slides by
            // block order); the share shell stacks eight sections with no
            // numbers and the email has none at all, so "on page 2" printed
            // a reference two of the three modes could not resolve. It was
            // order-fragile as well: a snapshot whose `keys` omit
            // `quarterly.read` renumbers the deck and moves the pointer
            // silently. The page's own title resolves everywhere and does
            // not move.
            note={`against ${fmtInt(c.quarterVolume.before)} in the quarter before it · the three largest quarter readings are under ${QUARTER_PAGE_TITLE.read}`}
          />
        ) : null}
        {c.quarterNote ? <Note mode={mode}>{c.quarterNote}</Note> : null}

        {/* ONE QUOTE, WHICH IS WHAT THE ARTBOARD DRAWS. `quotes()` still
            declares every ref the page is entitled to — a snapshot freezes the
            ids, and which of them a layout SHOWS is the layout's business. */}
        {voices.length > 0 ? (
          <BlockQuotes mode={mode} quotes={voices.slice(0, 1).map((q) => ({ quote: q.quote, cite: q.cite }))} />
        ) : null}
      </Column>
    )

    const kindMix = (
        <div className={email ? undefined : 'flex flex-col gap-2'}>
          <Eyebrow mode={mode}>Kind of thing said</Eyebrow>
          {c.kinds.length > 0 ? (
            <>
              {c.kinds.map((k) => (
                <Line
                  key={k.kind}
                  mode={mode}
                  label={k.label}
                  figure={
                    <FigureCell
                      mode={mode}
                      value={k.pct == null ? '—' : fmtPct(k.pct)}
                      of={`${fmtInt(k.videos)} of ${fmtInt(k.denominator)}`}
                      align="right"
                    />
                  }
                  badge={<BlockMovement verdict={c.kindVerdicts[k.kind] ?? null} unit="pts" mode={mode} />}
                />
              ))}
              {/* D4 · WHY THERE IS NO BAR HERE. Said once, under the rows. */}
              <Note mode={mode}>
                Independent shares of the same <span data-copy="figure">{fmtInt(c.kinds[0].denominator)}</span> videos;
                they do not add up to them.
                {c.reddit && c.reddit.pct != null ? (
                  <> Reddit carried <span data-copy="figure">{fmtInt(c.reddit.reddit)} of {fmtInt(c.reddit.videos)}</span> of the question-and-objection videos{c.reddit.exact ? '' : ', a video carrying both counted in each'}.</>
                ) : null}
              </Note>
            </>
          ) : (
            <Note mode={mode}>{c.kindsNote ?? 'What kind of thing was said is not recorded for this workspace yet.'}</Note>
          )}
        </div>
    )

    const moodBlock = (
        <div className={email ? undefined : 'flex flex-col gap-2'}>
          <Eyebrow mode={mode}>Mood</Eyebrow>
          {c.mood ? (
            <>
              {c.mood.shares.map((m) => (
                <Line
                  key={m.mood}
                  mode={mode}
                  label={m.label}
                  figure={
                    <FigureCell
                      mode={mode}
                      value={m.pct == null ? '—' : fmtPct(m.pct)}
                      of={`${fmtInt(m.videos)} of ${fmtInt(m.judged)} judged`}
                      align="right"
                    />
                  }
                />
              ))}
              <div className={email ? undefined : 'flex flex-wrap items-center gap-2'}>
                <BlockMovement verdict={c.mood.verdict} unit="pts" mode={mode} />
                {c.mood.framingPct != null ? (
                  <Note mode={mode}>
                    <span data-copy="figure">{fmtPct(c.mood.framingPct)}</span> judged on the video’s own framing, not a comment.
                  </Note>
                ) : null}
              </div>
            </>
          ) : (
            <Note mode={mode}>{c.moodNote ?? 'The mood of the category is not recorded for this workspace yet.'}</Note>
          )}
        </div>
    )

    // TWO NARROW SECTIONS SIDE BY SIDE, AND THE CHART UNDER THEM.
    //
    // WHY, AND IT IS MEASURED. This is the deck's most over-set sheet. At the
    // artboard's 7fr/5fr the aside stacked three sections and stood 611px tall
    // against a 428px grid, while the movers beside it sat at 436 and left the
    // bottom of a 589px column blank. Stacked is not the only way to read
    // three independent sections: the kind mix and the mood are both short
    // label-and-figure lists and read beside each other, and the chart — the
    // tall one — keeps the width it needs underneath them.
    //
    // AND THE CHART IS SCALED, NOT CAPPED. `CalendarLine` scales its viewBox
    // uniformly to its container, so a WIDER box draws a TALLER chart — this
    // same chart is 84px at 300 and 164px at 589. The first answer to that was
    // `max-w-[300px]` inside a ~443px card, which bought the height back by
    // leaving 45% of the card blank and bunching Jul, Aug and Sep into the left
    // half of a plot with room for twice that.
    //
    // The scale factor is the INTRINSIC width (`width`), not the box: raising
    // it from 330 to 490 draws the same 92-unit chart at the same ~83px on the
    // sheet, across the whole card, with the type it was drawn at (10px at
    // 443/490 is 9.0px, against 9.1px at 300/330 — measured, not estimated).
    // The plot gains 143px of horizontal room and the page loses nothing.
    const aside = (
      <Column mode={mode} gap={10}>
        <Columns weights={[1, 1]} gap={18} mode={mode}>
          {kindMix}
          {moodBlock}
        </Columns>
        <div className={email ? undefined : 'flex flex-col gap-2'}>
          <Eyebrow mode={mode}>Attention, month by month</Eyebrow>
          {panel.length > 0 ? (
            <Card mode={mode}>
              <BlockCalendar
                blockKey={`${quarterlyCategory.key}.attention`}
                axis={c.attention?.axis ?? []}
                series={panel}
                rules={panelRule(c)}
                mode={mode}
                height={92}
                // THE SCALE FACTOR, AND IT IS THE CARD'S OWN WIDTH. See above:
                // 490 draws the chart across the whole card at the height 330
                // drew it across two thirds of one.
                width={490}
                padL={40}
                // THE GUTTER IS OFF (see `ChartEndings`): at 96px it cut
                // "The category 41,200" to "The category 41,2" on the one
                // output this artefact has.
                padR={16}
                endLabels={false}
                format={(v) => fmtInt(v)}
                label="comments under the panel's videos, month by month"
              />
              <ChartEndings series={panel} format={(v) => fmtInt(v)} mode={mode} />
              <div className={email ? undefined : 'flex flex-wrap items-center gap-2'}>
                <BlockMovement verdict={c.attention?.verdict ?? null} unit="pts" mode={mode} />
                <Note mode={mode}>
                  {c.attention?.accountCount != null
                    ? <>Comments under a fixed panel of <span data-copy="figure">{fmtInt(c.attention.accountCount)}</span> accounts;</>
                    : 'Comments under a fixed panel of accounts;'}
                  {' '}the rule marks where it was re-frozen.
                </Note>
              </div>
            </Card>
          ) : (
            <Note mode={mode}>{c.attentionNote ?? 'No panel has been frozen for this workspace yet, so attention is not read.'}</Note>
          )}
        </div>
      </Column>
    )

    return frame(
      <div className={email ? undefined : 'flex min-h-0 flex-1 flex-col gap-2'}>
        <Note mode={mode} tone="body">{c.gate ? `${c.basis} ${c.gate}` : c.basis}</Note>
        <Columns weights={[7, 5]} mode={mode}>
          {movers}
          {aside}
        </Columns>

      </div>,
    )
  },

  // `qr.p4.quote`, on the same rule as page 3: refs, resolved at render.
  quotes(data) {
    return data.category.quotes.map((q) => q.quote.ref)
  },

  verdicts(data) {
    return [
      ...data.category.growing.map((m) => m.verdict),
      ...data.category.fading.map((m) => m.verdict),
      ...Object.values(data.category.kindVerdicts).filter((v): v is NonNullable<typeof v> => v != null),
      ...data.category.quarter,
    ]
  },

  emptyState(data) {
    const c = data.category
    if (c.denominator == null && c.growing.length === 0 && c.fading.length === 0) {
      return 'Nothing has been read for the category in this quarter yet.'
    }
    return null
  },
}
