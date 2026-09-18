import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockCalendar } from '@/components/blocks/calendar'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import type { CalendarRule, CalendarSeries } from '@/lib/charts/calendar'
import { fmtInt, fmtPct } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import { NOT_OBSERVED, standingText, type StandingRow, type StandingShare } from '@/lib/reading/standings'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import { HORIZON_LABEL } from '@/lib/reading/horizon'
import { horizonHref } from '@/lib/shell/bar'
import { changeNote, mixLine, type CompetitiveSurfaceData, type StandingsSeries } from '@/lib/pages/competitive-surface'

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
// THE CHARTS NEED MORE THAN ONE MONTH, AND THE DEFAULT HORIZON IS ONE. So on
// the view every reader opens first, a block titled "Standings over the months"
// is a one-row-per-brand table reading "1 of 1", where the approved artboard is
// "two small line charts side by side … Jun to Sep". That is the horizon
// default meeting this block rather than a defect in either, and until it is
// decided the block says so and hands the reader the address that draws the
// line, instead of a title promising months over a table of one.
//
// BOTH CHANGES ARE PRINTED, AND NEITHER CELL IS EVER BLANK. There was one
// change column, unlabelled as to which of the two shares it was (the content
// one), while `attentionVerdict` was computed, declared in `verdicts()` and
// never shown. And a null verdict rendered nothing — so on Sealand the
// CLIENT'S OWN row printed three figures and then an empty cell, while
// Cotopaxi said "no clear change" and Freitag "too few to compare". A verdict is
// null for three different reasons and `changeNote` says which.

const COLOR: Record<StandingRow['role'], string> = {
  client: 'var(--you)',
  rival: 'var(--comp)',
  category: 'var(--cat)',
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
        meta="no rank is printed"
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
        {s.rows.length > 0 && s.months.length <= 1 ? (
          <p
            className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}
          >
            A line needs more than one month, and this reading is one.{' '}
            {mode === 'app'
              ? <Link href={`${ctx.appUrl}${horizonHref('/dashboard/competitive', ctx.params ?? {}, 'last_3')}`} className="hover:underline">Open {HORIZON_LABEL.last_3} →</Link>
              : <>Open {HORIZON_LABEL.last_3} to draw it.</>}
          </p>
        ) : null}
        {s.series.length > 0 && s.months.length > 1 ? (
          <div className={email ? undefined : 'grid grid-cols-1 gap-3 lg:grid-cols-2'}>
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
          </div>
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
