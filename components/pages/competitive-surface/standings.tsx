import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockCalendar } from '@/components/blocks/calendar'
import { CalendarLine } from '@/components/charts/calendar-line'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { chartId, type CalendarRule, type CalendarSeries } from '@/lib/charts/calendar'
import { fmtInt, fmtPct, monthName } from '@/lib/format'
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
  const span = s.months.length > 0
    ? s.months.length === 1
      ? monthName(s.months[0])
      : `${monthName(s.months[0])} to ${monthName(s.months[s.months.length - 1])}`
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

function Share({ share, mode }: { share: StandingShare | null; mode: RenderMode }) {
  if (share == null || share.pct == null) {
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{NOT_OBSERVED}</span>
      : <span className="text-[12px] text-muted-foreground">{NOT_OBSERVED}</span>
  }
  const body = <>
    <span data-copy="figure">{standingText(share)}</span>{' '}
    <span data-copy="figure">{fmtInt(share.k)} of {fmtInt(share.n)}</span>
  </>
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.ink }}>{body}</span>
    : <span className="font-mono text-[12px] tabular-nums">{body}</span>
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
  label, axis, series, rules, chartKey,
}: {
  label: string
  axis: readonly string[]
  series: readonly CalendarSeries[]
  rules: readonly CalendarRule[]
  chartKey: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <CalendarLine
        axis={axis}
        series={series}
        rules={rules}
        legend={false}
        format={(v) => fmtPct(v)}
        label={label}
        id={chartId([chartKey, ...series.map((x) => x.label), axis[0], axis[axis.length - 1]])}
      />
    </div>
  )
}

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
function SharedLegend({ series, axis }: { series: readonly StandingsSeries[]; axis: readonly string[] }) {
  if (series.length === 0) return null
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {series.map((x) => {
          const read = x.points.filter((p) => p.content != null || p.attention != null).length
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
      <p className="m-0 font-mono text-[10px] text-muted-foreground">
        Each chart is scaled to its own highest month, so the two are read separately and never against each other.
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

    const notes = (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'}>
        <p
          className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
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
        <p
          className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
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
        {s.caveat ? (
          <p
            className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
          >
            {s.caveat}
          </p>
        ) : null}
        {s.rules.length > 0 ? (
          <p
            className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
          >
            {s.rules.map((r) => r.text).join(' ')}
          </p>
        ) : null}
        <p
          className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
        >
          {s.unlock}
        </p>
      </div>
    )

    return (
      <BlockFrame
        title={competitiveStandings.title}
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
                series={seriesFor(s.series, s.months, 'attention')}
                rules={rules}
                mode={mode}
                ctx={ctx}
                format={(v) => fmtPct(v)}
                label="Share of the month’s comments, by brand"
              />
              <BlockCalendar
                blockKey={`${competitiveStandings.key}.content`}
                axis={s.months}
                series={seriesFor(s.series, s.months, 'content')}
                rules={rules}
                mode={mode}
                ctx={ctx}
                format={(v) => fmtPct(v)}
                label="Share of the month’s videos, by brand"
              />
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-2">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <ChartPane
                  label="Share of the month’s comments, by brand"
                  axis={s.months}
                  series={seriesFor(s.series, s.months, 'attention')}
                  rules={rules}
                  chartKey={`${competitiveStandings.key}.attention`}
                />
                <ChartPane
                  label="Share of the month’s videos, by brand"
                  axis={s.months}
                  series={seriesFor(s.series, s.months, 'content')}
                  rules={rules}
                  chartKey={`${competitiveStandings.key}.content`}
                />
              </div>
              <SharedLegend series={s.series} axis={s.months} />
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
                    videos <Share share={row.content} mode={mode} /> <Change verdict={row.contentVerdict} observed={row.observed} prevMonthLabel={s.prevMonthLabel} mode={mode} />
                    {' · '}comments <Share share={row.attention} mode={mode} /> <Change verdict={row.attentionVerdict} observed={row.observed} prevMonthLabel={s.prevMonthLabel} mode={mode} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="py-1 pr-3 font-semibold">Brand</th>
                    <th className="py-1 pr-3 font-semibold">Share of videos</th>
                    <th className="py-1 pr-3 font-semibold">Share of comments</th>
                    <th className="py-1 pr-3 font-semibold">Months in the set</th>
                    <th className="py-1 pr-3 font-semibold">Videos, on last month</th>
                    <th className="py-1 font-semibold">Comments, on last month</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {s.rows.map((row) => {
                    const months = s.series.find((x) => x.audience === row.audience)?.points.filter((p) => p.content != null).length ?? 0
                    return (
                      <tr key={row.audience}>
                        <td className="py-1.5 pr-3 text-[12.5px] font-medium">{row.label}</td>
                        <td className="py-1.5 pr-3"><Share share={row.content} mode={mode} /></td>
                        <td className="py-1.5 pr-3"><Share share={row.attention} mode={mode} /></td>
                        <td className="py-1.5 pr-3 font-mono text-[11.5px] tabular-nums text-muted-foreground">{fmtInt(months)} of {fmtInt(s.months.length)}</td>
                        <td className="py-1.5 pr-3"><Change verdict={row.contentVerdict} observed={row.observed} prevMonthLabel={s.prevMonthLabel} mode={mode} /></td>
                        <td className="py-1.5"><Change verdict={row.attentionVerdict} observed={row.observed} prevMonthLabel={s.prevMonthLabel} mode={mode} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
