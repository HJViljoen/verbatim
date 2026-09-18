import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockCalendar } from '@/components/blocks/calendar'
import { CalendarLine } from '@/components/charts/calendar-line'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { chartId, type CalendarRule, type CalendarSeries } from '@/lib/charts/calendar'
import { fmtInt, fmtPct, monthName } from '@/lib/format'

/** "Jul" — the month alone, for the left half of a span whose right half
 *  carries the year. */
const shortMonth = (month: string): string => monthName(month).replace(/\s+\d{4}$/, '')
import { EMAIL, FONT } from '@/lib/email/theme'
import { NOT_OBSERVED, standingText, type StandingRow, type StandingShare } from '@/lib/reading/standings'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import { HORIZON_LABEL } from '@/lib/reading/horizon'
import { horizonHref } from '@/lib/shell/bar'
import { changeNote, mixLine, type CompetitiveSurfaceData, type StandingsBlock, type StandingsSeries } from '@/lib/pages/competitive-surface'

// CO2 · Standings over the months (design §3 CO2).
//
// TWO SHARES, TWO CHARTS, NO RANK. The design forbids a rank headline, and the
// table carries no rank column: a standings table is a reading of a month, not
// a league. Both denominators are printed with their platform mix and both are
// labelled — the whole block turns on WHAT the shares are shares of, and a
// percentage whose denominator is off-screen is the number this product exists
// to stop printing.
//
// A BRAND ABSENT FROM A MONTH READS "not observed", NEVER 0%. `standingText`
// owns that and the band never sees a zero it did not measure. A tracked rival
// with no row still gets a row: going quiet is a finding.
//
// THE RULE AT EVERY TRACKING CHANGE is drawn once per month, not once per
// change — Össur logged ten changes in September, and ten rules on one bar is
// a chart nobody can read.
//
// THE CHARTS ARE DRAWN ON ONE MONTH TOO (Block D wave 2). They used to be
// gated on `s.months.length > 1`, so on the view every reader opens first — the
// default horizon is one month — a block titled "Standings over the months"
// printed a sentence where the artboard draws two charts. `calendarGeometry`
// centres a single-month axis (`n <= 1`) and each brand draws as one dated
// point with its end label, which is a LEVEL and claims nothing about
// direction. The sentence stays, under the charts rather than instead of them,
// because a reader still needs to know why there is no line and where the line
// is.
//
// ATTENTION FIRST, AND ONE LEGEND UNDER BOTH. The artboard puts the comments
// share on the left and gives the pair a single legend; the build had the
// videos share first and a legend under each chart, which is the same identity
// printed twice. `CalendarLine` takes `legend`, so the app and print arms call
// it directly with the legend off and draw one beneath; the email arm keeps
// `BlockCalendar`, which is where the PNG-or-table fallback lives.
//
// THE CHARTS ARE THE BRANDS, AND THE REMAINDER IS THE TABLE'S. The pair drew
// every standings row, so on a real tenant a series at 86–93% ("the rest of
// the category") sat at the ceiling and left the two brands the block is about
// three pixels apart on the baseline with their end labels colliding — at half
// the artboard's chart height, because `CalendarLine`'s `height` is the
// viewBox's and sets an aspect ratio rather than pixels. Both are fixed here:
// `chartSeries` keeps the lines to the brands and names the omission,
// `height` is the number that actually renders the artboard's 196px.
//
// BOTH CHANGES ARE PRINTED, AND NEITHER CELL IS EVER BLANK. There was one
// change column, unlabelled as to which of the two shares it was (the content
// one), while `attentionVerdict` was computed, declared in `verdicts()` and
// never shown. And a null verdict rendered nothing — so on Sealand the
// CLIENT'S OWN row printed three figures and then an empty cell, while
// Cotopaxi said "no clear change" and Freitag "too little data" (that badge
// now reads "too few to compare"; this line records what was on screen). A
// verdict is null for three different reasons and `changeNote` says which.

const COLOR: Record<StandingRow['role'], string> = {
  client: 'var(--you)',
  rival: 'var(--comp)',
  category: 'var(--cat)',
}

/** "share of the tracked set · Jun 2026 to Sep 2026 · both denominators
 *  printed" — the artboard's meta, over the axis this block was actually given
 *  rather than over the four months the mock happens to draw. */
export function metaLine(s: StandingsBlock): string {
  // THE ARTBOARD'S ARROW, AND THE YEAR ONCE. It read "Jul 2026 to Sep 2026"
  // where the mock (and the brief) write "Jun → Sep". The year stays — a span
  // that crosses a year boundary is ambiguous without it, which is deviation
  // 4's argument on the head-to-head — but it is printed on the end month
  // only, and "to" becomes the arrow.
  const span = s.months.length > 0
    ? s.months.length === 1
      ? monthName(s.months[0])
      : `${shortMonth(s.months[0])} → ${monthName(s.months[s.months.length - 1])}`
    : null
  return ['share of the tracked set', span, 'both denominators printed'].filter((x): x is string => x != null).join(' · ')
}

/** One change cell: the banded verdict, or the reason there is none. */
function Change({ verdict, observed, prevMonthLabel, mode }: {
  verdict: Verdict | null
  observed: boolean
  prevMonthLabel: string | null
  mode: RenderMode
}) {
  if (verdict) return <BlockMovement verdict={verdict} unit="pts" mode={mode} />
  const text = changeNote(observed, prevMonthLabel)
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>{text}</span>
    : <span className="text-[11.5px] text-muted-foreground">{text}</span>
}

/**
 * One share cell: the artboard's bar, the level, and the "of N" the artboard
 * pushes into a footnote (D8/D10 — the build's form wins).
 *
 * THE BAR IS PER ROW, AGAINST ITS OWN DENOMINATOR, and is not a segment of
 * anything. Each row is one audience's share of the month's total, and those
 * DO happen to sum — but drawn as one stacked bar they would read as a
 * partition a reader could do arithmetic on across months whose denominators
 * differ, which is the reading the whole layer exists to stop. So: one track
 * per cell, filled to that cell's own percentage, in the ENTITY's colour and
 * never the rank's (`components/charts/ranked-bar.tsx`'s own rule).
 *
 * AND IT IS DRAWN AGAINST THE COLUMN'S LARGEST ROW, NOT AGAINST 100%. The
 * artboard's bar fills its column because the mock's shares are 6–39%; on a
 * real tenant they are 1–9% beside one remainder at 93%, so a track filled to
 * the absolute percentage drew 2.7px for 4.2% and floored 1.3% to the same 2%
 * several other rows got — a line of specks costing ~72px of table width,
 * twice. The number beside it is the absolute one and carries its own "k of N";
 * the bar is the comparison BETWEEN the rows of its column, which is the only
 * thing a 64px track can actually show, and `BAR_BASIS` says so under the
 * table. `Medians` in the playbook has drawn its bars this way since it
 * landed.
 *
 * No bar where there is no reading. `NOT_OBSERVED` is a brand absent from the
 * month, and an empty track beside it reads as a measured zero.
 */
export const BAR_BASIS =
  'Each bar is drawn against the largest share in its own column, never against 100% — the percentage beside it is the share itself.'

function Share({ share, role, top, mode }: { share: StandingShare | null; role: StandingRow['role']; top: number; mode: RenderMode }) {
  if (share == null || share.pct == null) {
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{NOT_OBSERVED}</span>
      : <span className="text-[12px] text-muted-foreground">{NOT_OBSERVED}</span>
  }
  const body = <>
    <span data-copy="figure">{standingText(share)}</span>{' '}
    <span data-copy="figure">{fmtInt(share.k)} of {fmtInt(share.n)}</span>
  </>
  if (mode === 'email') return <span style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.ink }}>{body}</span>
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-[64px] shrink-0 overflow-hidden rounded-full bg-inner" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, top > 0 ? (share.pct / top) * 100 : 0))}%`, background: COLOR[role] }} />
      </span>
      <span className="font-mono text-[12px] tabular-nums">{body}</span>
    </span>
  )
}

/**
 * One of the pair, with its own label above and NO legend of its own.
 *
 * ITS SCALE IS ITS OWN, AND THAT IS THE ONE PLACE THIS DIVERGES FROM THE
 * ARTBOARD. The mock's legend says "both charts on the same 0\u201345% scale", and
 * the shared-scale note below is printed only once that is true, which it is
 * not: `CalendarLine` derives its scale from the series it is handed
 * (`valueScale`, zero-based, 12% headroom) and takes no scale from a caller,
 * and `components/charts/*` belongs to another package in this wave — a change
 * there is a prop added by its owner, not by a porter. It is also the reading
 * mock-gap argued for: on a real tenant `industry-other` runs at 86\u201393% of the
 * corpus, so a fixed 0\u201345% axis would flatten every brand line into the bottom
 * tenth of the plot and clip the category off the top of both charts.
 */
function ChartPane({
  label, meta, axis, series, rules, chartKey,
}: {
  label: string
  /** The artboard's mono note at the right of the chart's own title row. */
  meta: string
  axis: readonly string[]
  series: readonly CalendarSeries[]
  rules: readonly CalendarRule[]
  chartKey: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {/* THE ARTBOARD'S REGISTER, NOT A THIRD ALL-CAPS ONE. The pane title was
          mono 10px uppercase — the same face as the table's column heads and
          the legend note — which gave one tile three shouting registers. The
          mock sets a chart's own title in sans 12.5/500 with its mono meta at
          the right, and that is what this is. */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-[12.5px] font-medium">{label}</span>
        <span className="shrink-0 whitespace-nowrap font-mono text-[10px] text-muted-foreground">{meta}</span>
      </div>
      <CalendarLine
        axis={axis}
        series={series}
        rules={rules}
        legend={false}
        // `height` IS THE viewBox'S, NOT A PIXEL HEIGHT — the SVG is emitted
        // `width:100%` with `height:auto`, so this prop sets an ASPECT RATIO of
        // `height / 880`. The previous comment here claimed 168 "buys the block
        // 42px", which is not a mechanism the code has: at 1440 this tile gives
        // each chart a 674px pane, and 168/880 of that rendered the chart 107px
        // tall against the artboard's 196; dropping from 210 saved 27px, not
        // 42. 256 is the number that renders 196 in a 674px pane, measured with
        // the repo's own Chromium rather than reasoned about.
        height={256}
        format={(v) => fmtPct(v)}
        label={label}
        id={chartId([chartKey, ...series.map((x) => x.label), axis[0], axis[axis.length - 1]])}
      />
    </div>
  )
}

/**
 * THE CATEGORY IS NOT DRAWN AS A LINE, AND THE TILE SAYS SO AND WHY.
 *
 * "The rest of the category" is the REMAINDER of the month, not a brand: on
 * Össur it runs at 86–93% of the corpus, so plotting it beside the two brands
 * the block is actually about put a series at the ceiling and left Össur at
 * 1.3% and Ottobock at 5.7% three pixels apart on the baseline, their end
 * labels colliding. The chart's biggest element then carried one fact — the
 * category is nearly all of it — that the table below states better, with its
 * own "k of N" beside it.
 *
 * SO IT COMES OUT OF THE LINES AND STAYS IN THE TABLE, with a sentence naming
 * the omission and pointing at where its figure is. That is a drawing decision,
 * not a reading one: no row is dropped, no denominator changes, and nothing is
 * hidden — the thing a reader must not be allowed to do is read two brand lines
 * against an axis that has been silently rescaled, which is why the note is not
 * optional.
 */
const chartSeries = (series: readonly StandingsSeries[]): StandingsSeries[] =>
  series.filter((x) => x.role !== 'category')

export const CATEGORY_NOT_DRAWN =
  'The rest of the category is not drawn: it is the remainder of the month, not a brand, and at its size every other line sits on the baseline beside it. Its share is in the table below, with its own denominator.'

/**
 * ONE legend under BOTH charts (the artboard's own device), with each series
 * annotated by the months it was actually read in.
 *
 * "Poler \u00b7 Sep only" in the mock is the same fact as a series whose earlier
 * points are hollow, and the build had the data and printed it nowhere. A
 * series read in every month on the axis carries no annotation \u2014 an annotation
 * on every row is noise, and the one that matters is the row that is short.
 *
 * AND THE SCALE NOTE IS THE TRUE ONE. The mock's "both charts on the same
 * 0\u201345% scale" is printed only where it is true; here each chart is scaled to
 * its own highest month, and a reader comparing the two by eye has to be told
 * that before they do it.
 */
/** The months a series was READ in — either side counts, because a month with
 *  videos read and no comments kept is a month we read. ONE rule, used by the
 *  legend and by the table's own column: they disagreed, and one tile printed
 *  "2 of 3 months" beside "3 of 3" for the same brand. */
export const monthsRead = (series: StandingsSeries | null): number =>
  series ? series.points.filter((p) => p.content != null || p.attention != null).length : 0

function SharedLegend({ series, axis, drops }: { series: readonly StandingsSeries[]; axis: readonly string[]; drops: boolean }) {
  if (series.length === 0) return null
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {series.map((x) => {
          const read = monthsRead(x)
          return (
            <span key={x.audience} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full" style={{ background: COLOR[x.role] }} aria-hidden />
              {x.label}
              {read < axis.length ? (
                <span data-copy="level" className="font-mono tabular-nums">
                  <span data-copy="figure">{fmtInt(read)} of {fmtInt(axis.length)}</span> months
                </span>
              ) : null}
            </span>
          )
        })}
      </div>
      <p className="m-0 font-mono text-[10px] leading-[1.4] text-muted-foreground">
        Each chart is scaled to its own highest month, so the two are read separately and never against each other.
        {drops ? <> {CATEGORY_NOT_DRAWN}</> : null}
      </p>
    </div>
  )
}

/** One chart's worth of series, in the axis's order. A month a brand was not
 *  observed in is a `hollow` point and never a zero. */
function seriesFor(series: readonly StandingsSeries[], axis: readonly string[], side: 'content' | 'attention'): CalendarSeries[] {
  return series.map((s) => ({
    label: s.label,
    color: COLOR[s.role],
    points: axis.map((month) => {
      const p = s.points.find((x) => x.month === month)
      const value = p ? p[side] : null
      return { month, value, state: value == null ? ('hollow' as const) : ('read' as const) }
    }),
  }))
}

export const competitiveStandings: Block<CompetitiveSurfaceData> = {
  key: 'competitive.months',
  title: 'Standings over the months',
  question: 'How much of this conversation is each of us?',

  render(data, mode = 'app', ctx) {
    const s = data.standings
    const email = mode === 'email'
    const empty = competitiveStandings.emptyState(data)
    const rules: CalendarRule[] = s.rules.map((r) => ({ month: r.month, label: r.label, kind: 'tracking_change' as const }))
    const latest = s.denominators[s.denominators.length - 1] ?? null
    // The largest share in each column — what its bars are drawn against.
    const topOf = (pick: (r: StandingRow) => StandingShare | null): number =>
      s.rows.reduce((m, r) => Math.max(m, pick(r)?.pct ?? 0), 0)
    const topContent = topOf((r) => r.content)
    const topAttention = topOf((r) => r.attention)

    // THE APRON'S SENTENCES ARE ABOUT THE TABLE, SO TWO OF THEM WAIT FOR IT.
    // With no month read the tile printed the honest refusal ("No month has
    // been read for this workspace yet…") and then three sentences about a
    // table nobody could see — "the videos on the left, the comments we kept on
    // the right" and "the count of those is beside this table." The two that
    // name the table are gated on there being one; the tracking rules, the
    // caveat and the attention-index unlock are true whether or not a row was
    // read and stay.
    const hasTable = s.rows.length > 0
    // THE ARTBOARD'S APRON IS MONO 10, NOT FOUR SANS PARAGRAPHS. These were
    // 11.5px sans, full width — the tile's largest block of text, sitting above
    // a footer that says less. Same words, the register the mock gives a note.
    const apron = email ? undefined : 'm-0 font-mono text-[10px] leading-[1.45] text-muted-foreground'
    const notes = (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'}>
        {hasTable ? (
        <p
          className={apron}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 } : undefined}
        >
          {s.denominatorLine}
          {/* LABELLED WITH THE ROW'S OWN MONTH. `latest` is the newest month
              that HAS stored rows; naming it with the month in hand printed
              September's 449 videos under "October 2026" for every day between
              midnight on the 1st and that month's first update. */}
          {latest ? (
            <> {latest.label}: <span data-copy="figure">{fmtInt(latest.videos)}</span> videos ({mixLine(latest.platformMix)}) and <span data-copy="figure">{fmtInt(latest.comments)}</span> comments.</>
          ) : null}
        </p>
        ) : null}
        {hasTable ? (
        <p
          className={apron}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
        >
          {s.precedence}
          {/* THE COUNT, OR THE WORD. The sentence promises the number is beside
              it, so a zero has to be said out loud — "the count of those is
              beside this table." with nothing after it is the sentence
              breaking its own promise. Null is a third state: the month holds
              no client row at all, and there is nothing to count. */}
          {s.dualMention == null ? null : s.dualMention > 0
            ? <> <span data-copy="figure">{fmtInt(s.dualMention)}</span> did this month.</>
            : <> None did this month.</>}
        </p>
        ) : null}
        {s.caveat ? (
          <p
            className={apron}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
          >
            {s.caveat}
          </p>
        ) : null}
        {s.rules.length > 0 ? (
          <p
            className={apron}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
          >
            {s.rules.map((r) => r.text).join(' ')}
          </p>
        ) : null}
        <p
          className={apron}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
        >
          {s.unlock}
        </p>
      </div>
    )

    return (
      <BlockFrame
        title={competitiveStandings.title}
        // THE BLOCK FILLS ITS TILE, WHICH IS WHAT PUTS ITS FOOTER ON THE
        // FLOOR. `Tile`'s body is `flex-1 flex-col`, but the block renders as
        // its ONE child and was never stretched, so `BlockFrame`'s `mt-auto`
        // footer had no spare height to push against and floated mid-card with
        // up to 431px of empty tile beneath it. `distribute="between"` could
        // not help either: `justify-between` needs two children to spread.
        className={mode === 'app' ? 'h-full' : undefined}
        question={competitiveStandings.question}
        mode={mode}
        // THE ARTBOARD'S META, WITH THE MONTHS IT IS ACTUALLY DRAWN OVER.
        // "no rank is printed" was the whole meta and the mock carries it in
        // the FOOTER definition line; what the mock puts here is what the
        // shares are of and over what span, which is the thing a reader needs
        // before they read a single row.
        meta={metaLine(s)}
        // A REAL FOOTER, AT LAST. `BlockFrame` has had the slot since WP10 and
        // not one Competitive block passed one, so "Open the record →" lived
        // only in the page bar's soundness band and the definition line was
        // split across a meta and two body paragraphs.
        footer={
          mode === 'app'
            ? <Link href="/dashboard/settings?detail=record" className="hover:underline">Open the record →</Link>
            : 'Open the record.'
        }
        footerNote="no rank is printed"
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {s.behind ? (
          <p
            className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}
          >
            {s.behind}
          </p>
        ) : null}
        {s.series.length > 0 ? (
          email ? (
            <div>
              <BlockCalendar
                blockKey={`${competitiveStandings.key}.attention`}
                axis={s.months}
                series={seriesFor(chartSeries(s.series), s.months, 'attention')}
                rules={rules}
                mode={mode}
                ctx={ctx}
                format={(v) => fmtPct(v)}
                label="Share of the month’s comments, by brand"
              />
              <BlockCalendar
                blockKey={`${competitiveStandings.key}.content`}
                axis={s.months}
                series={seriesFor(chartSeries(s.series), s.months, 'content')}
                rules={rules}
                mode={mode}
                ctx={ctx}
                format={(v) => fmtPct(v)}
                label="Share of the month’s videos, by brand"
              />
              {s.series.length !== chartSeries(s.series).length ? (
                <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 4 }}>{CATEGORY_NOT_DRAWN}</div>
              ) : null}
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-2">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <ChartPane
                  label="Attention share"
                  meta="share of the month’s comments"
                  axis={s.months}
                  series={seriesFor(chartSeries(s.series), s.months, 'attention')}
                  rules={rules}
                  chartKey={`${competitiveStandings.key}.attention`}
                />
                <ChartPane
                  label="Content share"
                  meta="share of the month’s videos"
                  axis={s.months}
                  series={seriesFor(chartSeries(s.series), s.months, 'content')}
                  rules={rules}
                  chartKey={`${competitiveStandings.key}.content`}
                />
              </div>
              <SharedLegend series={chartSeries(s.series)} axis={s.months} drops={s.series.length !== chartSeries(s.series).length} />
            </div>
          )
        ) : null}
        {s.rows.length > 0 && s.months.length <= 1 ? (
          <p
            className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}
          >
            A line needs more than one month, and this reading is one — each brand is drawn as its single dated point.{' '}
            {mode === 'app'
              ? <Link href={`${ctx.appUrl}${horizonHref('/dashboard/competitive', ctx.params ?? {}, 'last_3')}`} className="hover:underline">Open {HORIZON_LABEL.last_3} →</Link>
              : <>Open {HORIZON_LABEL.last_3} to draw it.</>}
          </p>
        ) : null}

        {s.rows.length > 0 ? (
          email ? (
            <div>
              {s.rows.map((row) => (
                <div key={row.audience} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
                  <strong>{row.label}</strong>
                  <div style={{ marginTop: 2 }}>
                    comments <Share share={row.attention} role={row.role} top={topAttention} mode={mode} /> <Change verdict={row.attentionVerdict} observed={row.observed} prevMonthLabel={s.prevMonthLabel} mode={mode} />
                    {' · '}videos <Share share={row.content} role={row.role} top={topContent} mode={mode} /> <Change verdict={row.contentVerdict} observed={row.observed} prevMonthLabel={s.prevMonthLabel} mode={mode} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {/* ONE ORDER FOR THE WHOLE TILE, AND IT IS THE CHARTS'.
                        The pair above runs attention then content (the brief's
                        "attention FIRST"); this table ran content then
                        attention and both change columns followed it, so a
                        reader who took the left chart and dropped to the first
                        share column compared the wrong pair. */}
                    <th className="py-1 pr-3 font-semibold">Brand</th>
                    <th className="py-1 pr-3 font-semibold">Share of comments</th>
                    <th className="py-1 pr-3 font-semibold">Share of videos</th>
                    <th className="py-1 pr-3 font-semibold">Months in the set</th>
                    <th className="py-1 pr-3 font-semibold">Comments, on last month</th>
                    <th className="py-1 font-semibold">Videos, on last month</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {s.rows.map((row) => {
                    // ONE RULE FOR "MONTHS READ", AND IT IS `monthsRead`'s.
                    // This cell counted `p.content != null` alone while the
                    // legend counted either side, so a month with videos read
                    // and no comments kept (the loader can produce exactly
                    // that) made one tile print "2 of 3 months" beside "3 of 3".
                    const months = monthsRead(s.series.find((x) => x.audience === row.audience) ?? null)
                    return (
                      <tr key={row.audience}>
                        <td className="py-1.5 pr-3 text-[12.5px] font-medium">{row.label}</td>
                        <td className="py-1.5 pr-3"><Share share={row.attention} role={row.role} top={topAttention} mode={mode} /></td>
                        <td className="py-1.5 pr-3"><Share share={row.content} role={row.role} top={topContent} mode={mode} /></td>
                        <td className="py-1.5 pr-3 font-mono text-[11.5px] tabular-nums text-muted-foreground">{fmtInt(months)} of {fmtInt(s.months.length)}</td>
                        <td className="py-1.5 pr-3"><Change verdict={row.attentionVerdict} observed={row.observed} prevMonthLabel={s.prevMonthLabel} mode={mode} /></td>
                        <td className="py-1.5"><Change verdict={row.contentVerdict} observed={row.observed} prevMonthLabel={s.prevMonthLabel} mode={mode} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="m-0 pt-1.5 font-mono text-[10px] text-muted-foreground">{BAR_BASIS}</p>
            </div>
          )
        ) : null}
        {notes}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    const latest = data.standings.denominators[data.standings.denominators.length - 1]
    if (latest) {
      out.standings_videos = { value: latest.videos, unit: 'videos', label: `videos read in ${data.standings.monthLabel}` }
      out.standings_comments = { value: latest.comments, unit: 'comments', label: `comments kept in ${data.standings.monthLabel}` }
    }
    for (const row of data.standings.rows) {
      if (row.content?.pct == null) continue
      out[`standing_${row.audience.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_content`] = {
        value: row.content.pct,
        unit: 'pct',
        label: `${row.label}, share of the month’s videos`,
      }
    }
    if (data.standings.dualMention != null && data.standings.dualMention > 0) {
      out.dual_mention_videos = { value: data.standings.dualMention, unit: 'videos', label: 'videos of yours that also named a rival' }
    }
    return out
  },

  verdicts(data): Verdict[] {
    return data.standings.rows.flatMap((r) => [r.contentVerdict, r.attentionVerdict].filter((v): v is Verdict => v != null))
  },

  emptyState(data) {
    return data.standings.empty
  },
}
