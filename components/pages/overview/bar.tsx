import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { BlockStat } from '@/components/blocks/stat'
import { horizonDates } from '@/lib/reading/horizon'
import { fmtInt } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { OverviewData } from '@/lib/pages/overview'
import { longMonth, sentLineForToken } from '@/lib/pages/overview'

/**
 * OV0 · the month so far (design §3 OV0).
 *
 * The page bar states WHEN the reading is and how finished it is
 * (components/shell/page-bar.tsx, WP9); this block states how far through the
 * month the numbers below it are, and — the part that makes Overview worth
 * opening between months — what the same point in the previous month read.
 *
 * NO WEEKLY FIGURE. The design's absent-by-design list ends with "any figure
 * computed over this week alone", and the month-to-date count against the same
 * point last month is precisely the reading that makes one unnecessary: the
 * month is a growing number, and it is shown growing against its own
 * predecessor rather than against nothing.
 *
 * THE UPDATE COUNT IS NOT IN `figures()`. A figure here is a reading with a
 * unit — videos, comments, points, per cent — and a count of delivered updates
 * is none of those: it is the run clock's own bookkeeping, which is never a
 * period key for anything (AGENTS.md). It is printed, because a reader needs to
 * know how many times we looked; it is not a figure a model may cite.
 */
export const overviewBar: Block<OverviewData> = {
  key: 'overview.bar',
  title: 'This month so far',

  render(data, mode = 'app', ctx) {
    void ctx
    const b = data.bar
    const meta = horizonDates(data.window)
    // WHAT THE LAST REPORT READ, where the month has moved since (WP18, item
    // 13). The month's own size is the figure a reader notices moving, and this
    // is the one place on the page it is stated as a headline. Absent — and
    // printing nothing — where nothing was sent, where the figure has not
    // moved, or where the month was already closed when the artefact went out.
    const sentLine = sentLineForToken(data.sent, 'month_videos', b.videos)
    if (mode === 'email') {
      return (
        <BlockFrame title={overviewBar.title} mode={mode} meta={meta}>
          <div style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink }}>{b.line}</div>
          <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 }}>{b.counter}</div>
          {b.updateDates.length > 0 ? (
            <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, marginTop: 4 }}>{b.updateDates.join(' · ')}</div>
          ) : null}
          {sentLine ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 }}>{sentLine}</div> : null}
        </BlockFrame>
      )
    }
    return (
      <BlockFrame title={overviewBar.title} mode={mode} meta={meta}>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <BlockStat
            value={b.videos == null ? '—' : fmtInt(b.videos)}
            unit="videos"
            mode={mode}
            size="lg"
            base={`${longMonth(b.month)}${b.daysIn == null ? ', complete' : `, ${b.daysIn} ${b.daysIn === 1 ? 'day' : 'days'} in`}`}
          />
          {/* Drawn only where the comparison exists. An em dash under "last
              month at this point" is a stat that says nothing, beside a line
              that already says why — and two ways of printing the same absence
              is one too many. */}
          {b.atLastMonthKnown && b.atLastMonth != null ? (
            <BlockStat value={fmtInt(b.atLastMonth)} unit="videos" mode={mode} base="last month at this point" />
          ) : null}
          <BlockStat
            value={fmtInt(b.updates)}
            unit={b.updates === 1 ? 'update' : 'updates'}
            mode={mode}
            base={b.updateDates.join(' · ') || 'none yet this month'}
          />
        </div>
        <p className="m-0 text-[12px] text-muted-foreground">{b.line}</p>
        {/* THE ONE COUNTER (design §3 OV0). Where this tenant is in the ramp,
            and the only place the page says it: not the delivery record, which
            is OV6's, and not a second month label. */}
        <p className="m-0 text-[11.5px] text-muted-foreground">{b.counter}</p>
        {sentLine ? <p className="m-0 text-[11.5px] text-muted-foreground">{sentLine}</p> : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const b = data.bar
    const out: FigureTable = {
      month_videos: { value: b.videos ?? 0, unit: 'videos', label: 'videos read into this month' },
    }
    if (b.expected != null) out.month_expected = { value: Math.round(b.expected), unit: 'videos', label: 'the trailing median month' }
    if (b.atLastMonthKnown && b.atLastMonth != null) {
      out.month_at_last_month = { value: b.atLastMonth, unit: 'videos', label: 'videos at this point last month' }
    }
    return out
  },

  emptyState(data) {
    return data.bar.videos == null ? 'Nothing has been read into this month yet.' : null
  },
}
