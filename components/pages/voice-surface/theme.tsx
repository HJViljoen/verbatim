import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockCalendar } from '@/components/blocks/calendar'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockProportion, BlockReach } from '@/components/blocks/bars'
import { BlockQuotes } from '@/components/blocks/quote'
import { BlockStat } from '@/components/blocks/stat'
import { PlatformIcon } from '@/components/charts/platform-icon'
import { TileColumns } from '@/components/shell/page-grid'
import { DirectionWord } from '@/components/pages/overview/subjects'
import { STATE_LABEL, type CalendarSeries } from '@/lib/charts/calendar'
import { PREVALENCE_LABEL } from '@/lib/calibration'
import { fmtInt, fmtPct, monthName } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { QuoteRef } from '@/lib/blocks/types'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { OnScreenLine, SpokenLine, ThemeBlock, VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { VOICES_WORD, heardLine, reachAxisMax } from '@/lib/pages/voice-surface'

// VO3 · A theme, in full (design §3 VO3; ported to the artboard, Block D
// wave 2).
//
// THE STRONGEST EVIDENCE CHAIN IN THE PRODUCT, and this block's job is to keep
// every link of it visible: the share with the count it rests on, the months it
// was read in on a dated calendar line, the tone of the audience around it, six
// voices in the words they were written in, the speech and the on-screen text
// behind the strongest of them, and what was counted but may not be quoted.
//
// THE ARTBOARD'S TWO COLUMNS. The figure, the bar under it and the tone go on
// the left; the month-by-month line goes on the right, beside the figure it
// draws rather than a screen below it. The six voices then run across three
// columns under both, which is what turns this from a column of evidence a
// reader scrolls into a page a reader reads. `TileColumns({ rule: false })`:
// these are not two readings of one axis, so there is no rule between them.
//
// WHAT WE CONCLUDED IS A LINK (decision Q). The mock draws Market's conclusion
// list at the foot of this page too, and a tinted "What we conclude" row inside
// this block. Two lists of conclusions is two lists, so MK1 owns it and this
// block carries the reader there with the theme selected.
//
// THE TONE LINE IS THE AUDIENCE'S, AND THE HEADING SAYS SO. Sentiment is judged
// per video and stored per audience-month; there is no per-theme sentiment row,
// and attributing the category's distribution to a theme that occupies 9% of it
// would be a number about the category wearing a theme's name. The mock's own
// caption is "Tone · category, all judged videos".
//
// THE TITLE ROW CARRIES A PREVALENCE LEVEL, NOT A TIER CHIP (D11). The mock
// puts "Strong evidence" beside the theme's name in the green tint. That word
// is a CONCLUSION's tier (`lib/curation.ts gateTier`, printed by Market), and a
// theme's month reading earns a different ladder — "Recurring · 130 of 1,388
// videos", the rung `prevalenceTier` assigns those two numbers. The chip's
// SHAPE is ported and its colour is not: the green does
// four jobs in this product and "a measurement exists" is not one of them.

/** How much of the theme's name the chart's end label can hold — see
 *  `themeSeries`. Thirty characters of 11px sans is about 186 units, which
 *  with the reading beside it is what CHART_PAD reserves. Measured against the
 *  geometry, not chosen. */
const CHART_LABEL = 30

/** The month line's geometry in this block's right-hand column.
 *
 *  `CalendarLine` scales its viewBox uniformly to the box it is given, so the
 *  intrinsic width is really a TYPE SIZE: at 620 units in the ~560px column
 *  this block draws at 1440, the chart's 10px axis labels come out near 9px.
 *  `CHART_PAD` is the room reserved to the right of the last point for the end
 *  label, which is drawn outside the plot area and which the 180-unit default
 *  is far too small for — a theme's name is the model's words. */
const CHART_W = 620
const CHART_H = 200
const CHART_PAD = 260

const MOOD_COLOR: Record<string, string> = {
  positive: 'var(--positive)',
  mixed: 'var(--mixed)',
  neutral: 'var(--neutral-seg)',
  negative: 'var(--negative)',
}

/** One line of the block, with its own heading — so a line that is absent is
 *  visibly absent rather than silently missing. `note` is the artboard's
 *  right-hand basis, in mono, on the heading's own row. */
function Line({ label, note, mode, children }: { label: string; note?: ReactNode; mode: RenderMode; children: ReactNode }) {
  if (mode === 'email') {
    return (
      <div style={{ paddingTop: 8 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>{label}</div>
        {note ? <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}>{note}</div> : null}
        <div style={{ marginTop: 2 }}>{children}</div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        {/* A HEADING, NOT A STYLED SPAN. Every sub-section inside these blocks
            was a `<span>`: the page had one h1, four h2s and one h3 for some
            fifteen sections, so heading navigation dropped a screen-reader
            user into the middle of a tile with no way to move within it. The
            level is h4 because the theme's own name is the h3 under the
            block's h2 — `BlockFrame` owns that one. */}
        <h4 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{label}</h4>
        {note ? <span className="flex-none whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">{note}</span> : null}
      </div>
      {children}
    </div>
  )
}

/** "2 of 182 voices", or just "Voices" when there are none to count.
 *
 *  `voices` IS THE BLOCK'S ONE WORD FOR `themes.evidence_count` (VOICES_WORD,
 *  lib/pages/voice-surface.ts). The on-camera figure's basis prints the same
 *  number — the loader assigns `quotesOf` and `onCameraOf` from that one
 *  column — and called it "quotes" until wave 3. */
function voicesLabel(t: ThemeBlock): string {
  const cap = `${VOICES_WORD[0].toUpperCase()}${VOICES_WORD.slice(1)}`
  if (t.quotes.length === 0) return cap
  if (t.quotesOf == null) return `${fmtInt(t.quotes.length)} ${t.quotes.length === 1 ? 'voice' : VOICES_WORD}`
  return `${fmtInt(t.quotes.length)} of ${fmtInt(t.quotesOf)} ${VOICES_WORD}`
}

/** The prior month's share of its OWN month, off the verdict's other side. */
function baselinePct(verdict: Verdict | null): number | null {
  const b = verdict?.baseline
  if (!b || b.k == null || b.n == null || b.n <= 0) return null
  return Math.round((b.k / b.n) * 1000) / 10
}

/** The month that side was read in — the basis's `from`, never the clock. */
const baselineMonth = (verdict: Verdict | null): string | null => verdict?.basis?.from ?? null

/** The spoken line or the on-screen text, with where it came from.
 *
 *  BOTH SHAPES, ONE COMPONENT, and the difference is which of them can carry a
 *  ref: the on-screen line is `videos.ocr_text` and travels as a `Quote` under
 *  `t:<videos.id>`; the spoken line is `videos.transcript`, for which no ref
 *  kind exists (see `SpokenLine`). The words are read off whichever the caller
 *  passed and nothing else here changes. */
function Said({ line, label, mode }: { line: SpokenLine | OnScreenLine; label: string; mode: RenderMode }) {
  const text = 'quote' in line ? line.quote.text : line.text
  const cite = (
    <span className={mode === 'email' ? undefined : 'font-mono text-[10.5px] text-muted-foreground'} style={mode === 'email' ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>
      {line.cite}
    </span>
  )
  const body = (
    <>
      {/* SOMEONE'S OWN WORDS, MARKED AS THEIRS — the `quote` kind of the copy
          contract. Unmarked, a transcript that says "growing" is a direction
          word this block would be claiming, and rule (c) does not spare
          unmarked markup. */}
      <span data-copy="quote" className={mode === 'email' ? undefined : 'text-[12.5px]'} style={mode === 'email' ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}>
        “{text}”
      </span>{' '}
      {/* A DEAD LINK IS WORSE THAN NO LINK. A video with no public URL prints
          its provenance as words and is not wrapped in an anchor. */}
      {line.href && mode !== 'email'
        ? <a href={line.href} className="underline-offset-2 hover:underline" rel="noreferrer noopener" target="_blank">{cite}</a>
        : cite}
    </>
  )
  return <Line label={label} mode={mode}>{body}</Line>
}

/** The theme's own monthly line — the share of this audience's videos, month by
 *  month, on a generated calendar so a month with no reading keeps its slot. */
function themeSeries(t: ThemeBlock): CalendarSeries | null {
  const points = t.points.filter((p) => t.axis.includes(p.month))
  if (points.length === 0) return null
  return {
    // THE CHART'S LABEL IS SHORTENED AND THE BLOCK'S IS NOT, and the limit is
    // the drawing's own geometry rather than a taste: `CalendarLine` draws the
    // series name at the right-hand end of the line, OUTSIDE the plot area, in
    // the 180 units `padR` reserves for it. At the 560-unit intrinsic width
    // this column draws at, 180 units is about thirty characters of 11px sans;
    // past that the name runs out of the tile, which is what Össur's
    // "Admiration for personal resilience" did on the production render. The
    // full label is the heading two lines above and the caption under the
    // chart names every reading, so this one only has to identify the line.
    label: t.label.length > CHART_LABEL ? `${t.label.slice(0, CHART_LABEL - 1).trimEnd()}…` : t.label,
    // The model's words, so the chart marks them (see CalendarSeries.labelSlot).
    labelSlot: 'pass_b_theme',
    color: 'var(--cat)',
    // NO END NOTE, AND THE CAPTION CARRIES EVERY MONTH'S INSTEAD. `of 1,388`
    // after the end label is fifty more units of a string already too long for
    // the room — but the claim that stood here, that "the chart's own
    // accessible rows carry it per month", was not true of anything a reader
    // can read: the only per-month `of N` is `columnTitle`'s hover `<title>`,
    // which is mouse-only and absent from print and from a PDF. September's
    // denominator is printed five times on this block and July's was printed
    // nowhere. `seriesCaption` is where all three of them go.
    points: points.map((p) => ({
      month: p.month,
      value: p.pct,
      // A month with no reading is `hollow`, which is the chart's own token
      // for "we have no numerator here" — never a zero, and never dropped:
      // the axis is a calendar and a missing month keeps its slot or the line
      // closes the gap and misdates everything after it.
      state: p.pct == null ? ('hollow' as const) : p.status === 'filling' ? ('filling' as const) : ('read' as const),
      k: p.k,
      n: p.videos,
    })),
  }
}

/** "Jul 5.9% of 1,200 · Aug 6.8% of 1,200 · Sep 9.4% of 1,388" — the
 *  artboard's caption under the line, with the denominators the artboard
 *  leaves off.
 *
 *  EVERY POINT KEEPS ITS MONTH, and a month with no reading says so rather
 *  than being skipped, which would close a gap the chart above draws open.
 *
 *  AND EVERY POINT KEEPS ITS OWN n. The mock's caption is three bare shares;
 *  deviation 6 of this port refuses exactly that form on the mover rows and on
 *  the big figure, for the reason the chart itself exists to show — the three
 *  months have different denominators, which is the whole reason the change
 *  between two of them is banded. A caption is not the place the rule stops
 *  applying. */
function seriesCaption(t: ThemeBlock): string | null {
  const points = t.points.filter((p) => t.axis.includes(p.month))
  if (points.length < 2) return null
  const parts = points.map((p) => {
    const month = monthName(p.month).slice(0, 3)
    if (p.pct == null) return `${month} not read`
    const reading = p.videos == null ? `${month} ${fmtPct(p.pct)}` : `${month} ${fmtPct(p.pct)} of ${fmtInt(p.videos)}`
    // THE ONE WORD THE LEGEND USED TO CARRY. The chart's legend is off on this
    // block (see the `legend={false}` below), and its only gutter token here
    // is `filling` — a month that may still be rewritten, which is the
    // distinction this whole product is built on. It says so in the caption
    // instead, in the chart's own word (STATE_LABEL.filling).
    return p.status === 'filling' ? `${reading}, ${STATE_LABEL.filling}` : reading
  })
  return `share of ${t.audienceLabel.toLowerCase()} videos · ${parts.join(' · ')}`
}

export const voiceTheme: Block<VoiceSurfaceData> = {
  key: 'voice.theme',
  title: 'A theme, in full',
  question: 'What exactly is being said, and how do we know?',

  render(data, mode = 'app', ctx) {
    const t = data.theme
    const email = mode === 'email'
    const empty = voiceTheme.emptyState(data)
    const search = t.search

    const searchBox = email ? null : (
      // THE PILL IS THE CONTROL, SO THE PILL TAKES THE FOCUS RING. The port
      // moved the border off the `<input>` and put `outline-none` on it with
      // nothing in its place; a `<form>` never receives `:focus`, so the one
      // text control on the page went from the UA ring to no indication at
      // all. `focus-within` is what a composed control focuses with, and the
      // ring is the house one (components/ui/input.tsx).
      //
      // AND THE BOX HOLDS ITS OWN PLACEHOLDER. The inline label is half the
      // control; at `max-w-[300px]` the placeholder rendered as "search every
      // theme evei" at 1440 — the one width this page is reviewed at — and was
      // only legible below the breakpoint, where the box widens.
      <form action="/dashboard/voice" method="get" className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-3.5 py-1.5 ring-1 ring-border focus-within:ring-2 focus-within:ring-ring/60 xl:max-w-[430px]">
        {/* The reader's whole selection travels with the search, so a result
            opens in the same audience and horizon they were reading in. */}
        {Object.entries(data.params)
          .filter(([key, value]) => key !== 'q' && key !== 'theme' && Boolean(value))
          .map(([key, value]) => <input key={key} type="hidden" name={key} value={value as string} />)}
        <label htmlFor="voice-theme-search" className="flex-none text-[11.5px] text-muted-foreground">Have we seen this before?</label>
        <input
          id="voice-theme-search"
          name="q"
          defaultValue={search.q}
          placeholder="search every theme ever named"
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12px] outline-none"
        />
      </form>
    )

    if (empty) {
      return (
        <BlockFrame title={voiceTheme.title} mode={mode}>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
          {searchBox}
        </BlockFrame>
      )
    }

    const series = themeSeries(t)
    const caption = seriesCaption(t)
    const trackHref = `${ctx.appUrl}/dashboard/market?track=${encodeURIComponent(t.trackRegistryId ?? '')}`
    const prevPct = baselinePct(t.verdict)
    const prevMonth = baselineMonth(t.verdict)
    const prevLine = prevPct != null && prevMonth && t.verdict?.baseline?.n != null
      ? `${monthName(prevMonth).slice(0, 3)} ${fmtPct(prevPct)} of ${fmtInt(t.verdict.baseline.n)}`
      : null
    // The on-camera figure, drawn as the mock's second stat — with its own
    // basis under it, which is the condition D15 puts on printing it at all.
    // The sentence version stays in `notes` for the arm where the numbers are
    // absent; where the stat draws, the note would say it twice.
    const onCameraStat = t.onCameraSaid != null && t.onCameraOf != null
    const notes = onCameraStat ? t.notes.filter((n) => n !== t.onCamera) : t.notes

    const level = t.prevalence && t.k != null && t.n != null
      ? `${PREVALENCE_LABEL[t.prevalence]} · ${fmtInt(t.k)} of ${fmtInt(t.n)} videos`
      : null

    const stats = (
      // SIDE BY SIDE, as the artboard has them, which a flex row will not do:
      // the on-camera figure's basis is a sentence, so its max-content width
      // wraps the whole stat onto its own line. A two-column grid gives each
      // figure half the column and lets the basis wrap inside it.
      <div className={email ? undefined : 'grid grid-cols-1 items-end gap-x-7 gap-y-3 sm:grid-cols-2'}>
        <BlockStat
          mode={mode}
          size="lg"
          value={t.pct == null ? '—' : fmtPct(t.pct)}
          unit={`of ${t.audienceLabel.toLowerCase()} videos`}
          // THIS BASIS WRAPS TOO, for the reason the prop exists (D15): with
          // the prior month beside it this line is 231px against the 226px
          // half-column at 1280, so it clipped to "… · Aug 6.8% of 1,20" —
          // a denominator cut mid-number, which takes the figure with it.
          baseWrap
          base={<>{fmtInt(t.k ?? 0)} of {fmtInt(t.n ?? 0)} this month{prevLine ? ` · ${prevLine}` : ''}</>}
        />
        {onCameraStat ? (
          <BlockStat
            mode={mode}
            size="sm"
            value={fmtInt(t.onCameraSaid as number)}
            unit="said it on camera"
            baseWrap
            // THE BASIS TRAVELS WITH THE FIGURE (D15). This is the run's whole
            // evidence for the theme, however many months that reaches — not
            // this month's videos, one line above a reach note that divides
            // this month's platform mix. Production printed those two together
            // and they contradicted each other.
            // AND IN THE BLOCK'S ONE WORD FOR THIS POPULATION (`VOICES_WORD`).
            // `onCameraOf` and `quotesOf` are both `themes.evidence_count` —
            // the loader assigns them from the same column, so they are always
            // equal — and this line called them "quotes" while the heading
            // three inches above called them "voices". The artboard's word is
            // the heading's.
            base={<>of the {fmtInt(t.onCameraOf as number)} {VOICES_WORD} behind this theme, counted over the whole update, not this month</>}
          />
        ) : null}
      </div>
    )

    return (
      <BlockFrame
        title={voiceTheme.title}
        // NO QUESTION LINE ON THIS BLOCK, and it is the only one of the four
        // without one (mock-gap §7: the question is the build's single most
        // repeated extra). The theme's own name and its level sit immediately
        // under the eyebrow in the artboard, and a 12.5px question between them
        // pushes the figure this block exists for below the fold.
        mode={mode}
        meta={`${t.audienceLabel.toLowerCase()} · ${t.n == null ? '—' : fmtInt(t.n)} videos · ${monthName(data.month)}`}
        footer={email
          ? <a href={`${ctx.appUrl}${t.conclusionHref}`} style={{ color: EMAIL.ink }}>What we concluded from this →</a>
          : (
            <span className="flex flex-wrap items-center gap-4">
              <Link href={t.videosHref} className="hover:underline">The {fmtInt(t.k ?? 0)} videos behind this →</Link>
              <Link href={t.conclusionHref} className="hover:underline">What we concluded from this →</Link>
            </span>
          )}
        footerNote={t.n != null ? `of ${fmtInt(t.n)} videos in this audience · ${monthName(data.month)}` : undefined}
      >
        <div className={email ? undefined : 'flex flex-col gap-3'}>
          {/* THE TITLE ROW, the artboard's: the name, what it is running at,
              the word it earned over three months, the change with its band,
              and the months it has been heard in. */}
          <div className={email ? undefined : 'flex flex-wrap items-center gap-2.5'}>
            {/* THE LABEL CARRIES THE SAME KIND AS THE DESCRIPTION BELOW IT.
                Both are `pass_b_theme`, both are never direction-scrubbed, and
                the label is the half that ranks onto other surfaces. */}
            <h3 data-copy="subject" data-slot="pass_b_theme" className={email ? undefined : 'm-0 text-[15px] font-semibold tracking-[-0.01em]'} style={email ? { fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: EMAIL.ink } : undefined}>
              {t.label}
            </h3>
            {level ? (
              <span data-copy="level" className={email ? undefined : 'inline-block rounded-full bg-inner px-2 py-0.5 text-[12px] font-medium text-secondary-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2 } : undefined}>
                {level}
              </span>
            ) : null}
            {t.direction ? (
              <span className={email ? undefined : 'inline-block rounded-full bg-inner px-2 py-0.5 text-[12px] font-medium'}>
                <DirectionWord direction={t.direction} mode={mode} />
              </span>
            ) : null}
            <BlockMovement verdict={t.verdict} unit="pts" mode={mode} />
            <span className={email ? undefined : 'font-mono text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
              {/* THE MONTHS, AND ONLY THE MONTHS. The on-camera count is the
                  update's, over every month it read, and printed here it sat
                  one line above a reach note divided out of THIS month's
                  platform mix. It is a stat of its own now, with its own
                  basis. */}
              {heardLine({ firstHeard: t.firstHeard, firstHeardOnAxis: t.firstHeardOnAxis, monthsSeen: t.monthsSeen, monthsDrawn: t.monthsDrawn })}
            </span>
          </div>

          {t.description ? (
            // THE MODEL'S OWN WORDS ABOUT THE SUBJECT, so `subject` and not
            // `prose`: PROSE_POLICY marks `pass_b_theme` 'none' — a theme's
            // label and description are the one slot the product never
            // direction-scrubs, because a direction word in them is about the
            // thing rather than about a reading of it.
            <p data-copy="subject" data-slot="pass_b_theme" className={email ? undefined : 'm-0 text-[12.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.muted } : undefined}>
              {t.description}
            </p>
          ) : null}

          {email ? (
            <>
              {stats}
              {series ? (
                <Line label="Month by month" mode={mode} note={caption ?? undefined}>
                  <BlockCalendar
                    blockKey={voiceTheme.key} axis={t.axis} series={[series]} mode={mode} ctx={ctx}
                    format={(v) => fmtPct(v)} label={`${t.label}, share of ${t.audienceLabel.toLowerCase()} videos, by month`}
                  />
                </Line>
              ) : null}
            </>
          ) : (
            <TileColumns of={2} rule={false}>
              <div className="flex min-w-0 flex-col gap-3">
                {stats}
                {/* THE REACH BAR, with the rule where last month stood. Its
                    axis maximum is printed beside it: the artboard draws 9.4%
                    at 62.7% of the bar against a silent 15% axis. */}
                {t.pct != null ? (
                  <BlockReach
                    mode={mode}
                    pct={t.pct}
                    max={reachAxisMax([t.pct, prevPct])}
                    rule={prevPct}
                    ruleLabel={prevPct != null && prevMonth
                      ? `rule at ${monthName(prevMonth).slice(0, 3)} ${fmtPct(prevPct)} · ${monthName(data.month).slice(0, 3)} ${fmtPct(t.pct)}`
                      : undefined}
                    axisLabel={`share of ${t.audienceLabel.toLowerCase()} videos`}
                  />
                ) : null}
                <Tone t={t} mode={mode} />
              </div>
              {/* THE DRAWING KEEPS ITS DESIGNED SIZE BELOW THE BREAKPOINT.
                  `CalendarLine` scales its viewBox uniformly to the box it is
                  given, and 42% of that width is the pad the end label sits
                  in — right in this 560px column, and at 1024, where the tile
                  falls to one column and the chart stretches to ~900px, it is
                  a 530×230 box with the plot in its left 58%. Capped at the
                  width it was drawn for, it is the same chart rather than a
                  mostly-empty box; the caption under it carries every month. */}
              <div className="flex min-w-0 max-w-[560px] flex-col gap-1 xl:max-w-none">
                {series ? (
                  <Line label="Month by month" mode={mode}>
                    <BlockCalendar
                      blockKey={voiceTheme.key}
                      axis={t.axis}
                      series={[series]}
                      mode={mode}
                      ctx={ctx}
                      format={(v) => fmtPct(v)}
                      width={CHART_W}
                      height={CHART_H}
                      padR={CHART_PAD}
                      // ONE NAME, TWICE, THE WAY THE ARTBOARD HAS IT: the
                      // block's heading and the label at the line's end. The
                      // legend was a third and a fourth rendering of the same
                      // string — and it prints the SERIES label, which is the
                      // one shortened to thirty characters, so the refused
                      // state showed "Admiration for personal resil…" twice
                      // with the full name two lines above. The one word it
                      // carried besides the name, "still filling", is in the
                      // caption.
                      legend={false}
                      label={`${t.label}, share of ${t.audienceLabel.toLowerCase()} videos, by month`}
                    />
                  </Line>
                ) : null}
                {caption ? (
                  <span data-copy="figure" className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{caption}</span>
                ) : null}
              </div>
            </TileColumns>
          )}

          {email ? <Tone t={t} mode={mode} /> : null}

          {/* "0 OF THE VOICES" IS NOT ENGLISH AND NAMES NO DENOMINATOR. The
              label read `${n} of the voices` — rendered on production as
              Össur's "0 of the voices", above "No comment behind this theme can
              be quoted". Overview's equivalent is "2 of 83 voices", and this
              block already knows the 83. */}
          <Line
            label={voicesLabel(t)}
            note={t.quotes.length > 0 ? 'original first, English beneath when translated' : undefined}
            mode={mode}
          >
            {t.quotes.length > 0 ? (
              <BlockQuotes
                mode={mode}
                columns={3}
                quotes={t.quotes.map((q, i) => ({
                  quote: q,
                  cite: (
                    <span className={email ? undefined : 'flex flex-col gap-1'}>
                      {/* THE VIDEO'S OWN ON-SCREEN TEXT, under the quote from
                          THAT video and no other — and marked as a quote,
                          because it is one: someone wrote those words on the
                          screen. */}
                      {t.quoteOnScreen[i] ? (
                        <span className={email ? undefined : 'font-sans text-[11.5px] text-muted-foreground'}>
                          On-screen text on the same video:{' '}
                          <span data-copy="quote" className={email ? undefined : 'text-secondary-foreground'}>{t.quoteOnScreen[i]?.text}</span>
                        </span>
                      ) : null}
                      {/* THE ARTBOARD'S GLYPH BEFORE THE PLATFORM'S NAME.
                          Decoration only — `aria-hidden`, and the cite still
                          says the word, because a glyph is a second rendering
                          of a fact and never the only one. */}
                      <span className={email ? undefined : 'inline-flex items-center gap-1'}>
                        {!email && t.quotePlatforms[i] ? <PlatformIcon platform={t.quotePlatforms[i] as string} /> : null}
                        {t.quoteCites[i] ?? ''}
                      </span>
                    </span>
                  ),
                }))}
              />
            ) : (
              <BlockEmpty mode={mode}>No comment behind this theme can be quoted.</BlockEmpty>
            )}
          </Line>

          {t.spoken ? <Said line={t.spoken} label="Said on camera" mode={mode} /> : null}
          {t.onScreen ? <Said line={t.onScreen} label="On screen" mode={mode} /> : null}

          {/* THE COUNTED-BUT-NOT-QUOTED LINE HAS A HEADING AND AN EMPTY STATE.
              It printed only when there was something to count, so at zero it
              vanished and a reader could not tell "nothing was withheld" from
              "we do not do this". The mock's "Counted with the first update."
              is not our sentence — the counting is not deferred, there is
              simply nothing in this theme that describes who is speaking. */}
          <div className={email ? undefined : 'flex flex-wrap items-baseline justify-between gap-3 border-t border-border/70 pt-2.5'}>
            {email ? (
              <span style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>
                Who these commenters are — counted, not quoted
              </span>
            ) : (
              <h4 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">
                Who these commenters are — counted, not quoted
              </h4>
            )}
            <span className={email ? undefined : 'min-w-0 flex-1 text-[12px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted } : undefined}>
              {t.withheld > 0
                ? <><span data-copy="figure">{fmtInt(t.withheld)}</span> comments describe who these commenters are and are counted rather than quoted.</>
                : 'Nothing behind this theme describes who the commenters are.'}
            </span>
          </div>

          {notes.length > 0 ? (
            // The notes carry code's own counts (the reach line, the no-speech
            // line), so the paragraph is a figure node rather than prose.
            <p data-copy="figure" className={email ? undefined : 'm-0 text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>
              {notes.join(' ')}
            </p>
          ) : null}

          {email ? null : (
            <div className="flex flex-wrap items-center gap-2.5">
              {/* TRACK THIS is the page's primary action, and it is a LINK into
                  Market where a move is named and confirmed, never a one-click
                  write from a reading surface: a declaration is the line a
                  client draws, and it should be drawn deliberately. The green
                  is the primary button's, which is one of the four jobs the
                  green has. */}
              {t.trackRegistryId ? (
                <Link href={trackHref} className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-accent-foreground">
                  Track this
                </Link>
              ) : null}
              <Link href={t.askHref} className="inline-flex h-9 items-center rounded-full bg-tile px-4 text-[12.5px] font-medium text-foreground ring-1 ring-border transition-colors hover:bg-inner">
                Ask about this
              </Link>
              <span className="ml-auto flex min-w-0 flex-1 justify-end">{searchBox}</span>
            </div>
          )}

          {search.rows.length > 0 ? (
            <ul className={email ? undefined : 'm-0 flex list-none flex-col gap-1 p-0'}>
              {search.rows.map((r) => (
                <li key={r.id} className={email ? undefined : 'text-[12px]'}>
                  <Link data-copy="subject" data-slot="pass_b_theme" href={r.href} className="underline-offset-2 hover:underline">{r.label}</Link>{' '}
                  {/* THE RECORD'S MONTH, IN THE PAGE'S OWN WORDS. This line
                      printed `theme_registry.first_seen_at` as "first heard
                      2026-09" — the day a run opened the register entry, two
                      lines under a chart drawing the same theme back to 2022,
                      and in raw ISO where the rest of the page says
                      "September 2026". */}
                  <span className={email ? undefined : 'text-muted-foreground'}>
                    {r.firstHeard
                      ? `first heard ${monthName(r.firstHeard)} · `
                      : `not read in ${t.audienceLabel.toLowerCase()} · `}
                    <span data-copy="figure">{fmtInt(r.updates)}</span> updates have carried it
                  </span>
                </li>
              ))}
            </ul>
          ) : search.q ? (
            <BlockEmpty mode={mode}>Nothing in the register matches “{search.q}”.</BlockEmpty>
          ) : null}
          {/* The matches, not the rows — `total` counts what was found, so it
              is printed where it changes what a reader concludes from a list
              of twelve. */}
          {search.total > search.rows.length ? (
            <p className={email ? undefined : 'm-0 text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>
              Showing <span data-copy="figure">{fmtInt(search.rows.length)} of {fmtInt(search.total)}</span> matches — type more of the phrase to narrow it.
            </p>
          ) : null}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const t = data.theme
    const out: FigureTable = {}
    if (t.pct != null) out.theme_share = { value: t.pct, unit: 'pct', label: `${t.label}, share of this audience's month` }
    if (t.k != null) out.theme_videos = { value: t.k, unit: 'videos', label: `videos that raised ${t.label}` }
    if (t.tone) {
      const negative = t.tone.shares.find((s) => s.mood === 'negative')
      if (negative?.pct != null) out.theme_tone_negative = { value: negative.pct, unit: 'pct', label: 'the cold share of what this audience said' }
    }
    return out
  },

  verdicts(data): Verdict[] {
    const t = data.theme
    return [t.verdict, t.tone?.verdict ?? null].filter((v): v is Verdict => v != null)
  },

  quotes(data): QuoteRef[] {
    const t = data.theme
    // EVERY SET OF WORDS THIS BLOCK PRINTS, not just the six in the grid. The
    // nested on-screen lines and the block-level one are a creator's own words
    // and travel under `t:<videos.id>`; a block that declared only the comment
    // quotes handed the quote-freeze walk a shorter list than it draws.
    // `spoken` is absent because `videos.transcript` has no ref kind to be
    // declared by — see `SpokenLine`.
    return [
      ...t.quotes.map((q) => q.ref),
      ...t.quoteOnScreen.filter((q) => q != null).map((q) => (q as { ref: string }).ref),
      ...(t.onScreen ? [t.onScreen.quote.ref] : []),
    ]
  },

  emptyState(data) {
    const t = data.theme
    if (t.state === 'none') {
      return t.notes[0] ?? 'No theme in this audience carried enough of this month to be opened.'
    }
    return null
  },
}

/** The audience's tone for the month, in the artboard's tinted inner block. */
function Tone({ t, mode }: { t: ThemeBlock; mode: RenderMode }) {
  const email = mode === 'email'
  const prev = baselinePct(t.tone?.verdict ?? null)
  const prevMonth = baselineMonth(t.tone?.verdict ?? null)
  const body = t.tone ? (
    <>
      <BlockProportion
        mode={mode}
        of="videos"
        segments={t.tone.shares
          .filter((s) => s.pct != null)
          .map((s) => ({ label: s.label, count: s.videos, pct: s.pct as number, color: MOOD_COLOR[s.mood] ?? 'var(--neutral-seg)' }))}
      />
      <p className={email ? undefined : 'm-0 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 } : undefined}>
        {/* THE OTHER SIDE OF THE BADGE'S COMPARISON, with its own judged count.
            The mock prints "Aug 16% → Sep 18%"; the cold share's baseline is on
            the verdict and was rendered nowhere, so "no clear change" stood
            beside nothing. */}
        {prev != null && prevMonth && t.tone.verdict?.baseline?.n != null ? (
          <span data-copy="figure">cold {monthName(prevMonth)} {fmtPct(prev)} of {fmtInt(t.tone.verdict.baseline.n)}</span>
        ) : null}
        <BlockMovement verdict={t.tone.verdict} unit="pts" mode={mode} />
      </p>
    </>
  ) : (
    <BlockEmpty mode={mode}>{t.toneNote ?? 'Nothing in this month has been judged yet.'}</BlockEmpty>
  )
  const inner = (
    <Line
      label={`Tone · ${t.audienceLabel.toLowerCase()}, all judged videos`}
      note={t.tone ? `of ${fmtInt(t.tone.judged)} judged` : undefined}
      mode={mode}
    >
      {body}
    </Line>
  )
  return email ? inner : <div className="rounded bg-inner px-3 py-2.5">{inner}</div>
}
