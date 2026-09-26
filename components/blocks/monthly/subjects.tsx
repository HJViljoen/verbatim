import type { ReactNode } from 'react'
import { overviewSubjects } from '@/components/pages/overview/subjects'
import { MARKET_SUBJECTS_TITLE, marketSubjectsLine, prevCell, printsFigures, rowTag } from '@/components/pages/overview/market-subjects'
import { barAxis, shortMonthName } from '@/components/pages/overview/market'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import { byMarketSize, marketLevel } from '@/lib/pages/overview-market'
import type { MonthlyData } from '@/lib/pages/monthly'
import { fromFrontPage } from './adapt'
import { Bar, Inner, Num, RowLabel, Table } from './email'

/**
 * 6 · The market by subject (market-first WP2.1; the front page's block 6):
 * each subject's market rows ranked by size, with its calibration word as a
 * row tag (decision C). A subject being re-described prints no figure; a
 * subject never read says so. The page's block in the app and on paper; the
 * artboard's table in an inbox.
 *
 * REWORKED, SAME KEY. `monthly.subjects` printed Phase 1's three sides (you,
 * a rival, the category) with a verdict each; version 2 prints the market's
 * rows and no verdict, as the front page does. A stored version 1 row prints
 * `STALE_ARTEFACT_LINE` instead (`staleMonthlySnapshot`).
 */

/** A row's level: a share at 100 videos and 10 of its own, else a dot. */
const shareCell = (k: number | null | undefined, n: number | null | undefined): string => {
  const l = marketLevel(k ?? null, n ?? null)
  return l?.kind === 'share' ? l.text : '·'
}

function subjectsEmail(data: MonthlyData): ReactNode {
  const o = data.overview
  const line = marketSubjectsLine(o)
  if (line) {
    return <Inner marginTop={0}><div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2 }}>{line}</div></Inner>
  }
  const rows = [...o.subjects.rows].sort(byMarketSize)
  const n = o.subjects.market?.n ?? null
  const prev = o.subjects.market?.prev ?? null
  const axis = barAxis(rows.map((r) => (printsFigures(r) && n ? (r.market?.k as number) / n : null)))
  return (
    <Table
      columns={[
        { head: 'Subject' },
        { head: '', width: 88, className: 'vb-m-bar' },
        { head: 'Videos', align: 'right', width: 56 },
        { head: <span data-copy="level">{shortMonthName(o.month)}<br />of {n == null ? '·' : fmtInt(n)}</span>, align: 'right', width: 56 },
        ...(prev ? [{ head: <span data-copy="level">{shortMonthName(prev.month)}<br />of {prev.n == null ? '·' : fmtInt(prev.n)}</span>, align: 'right' as const, width: 56 }] : []),
      ]}
      rows={rows.map((r) => {
        const figures = printsFigures(r)
        const k = r.market?.k ?? null
        const under = figures && k != null && marketLevel(k, n)?.kind === 'count'
        const tag = rowTag(r)
        return [
          <RowLabel key="l" tag={[tag, under ? 'under 10, a count only' : null].filter(Boolean).join(' · ') || null}>{r.label}</RowLabel>,
          <div key="b" style={{ paddingTop: 8 }}>{figures && !under ? <Bar share={n ? (k as number) / n : null} axis={axis} /> : null}</div>,
          figures ? <Num key="k">{fmtInt(k as number)}</Num> : null,
          figures ? <Num key="s" weight={400}>{shareCell(k, n)}</Num> : null,
          ...(prev ? [figures ? <Num key="p" prev>{prevCell(r.marketPrev?.k, prev.n)}</Num> : null] : []),
        ]
      })}
    />
  )
}

export const monthlySubjects = fromFrontPage({
  key: 'monthly.subjects',
  title: MARKET_SUBJECTS_TITLE,
  block: overviewSubjects,
  link: () => {
    const page = surface('subjects')
    return { href: page.href, label: `Open ${page.label} →` }
  },
  email: subjectsEmail,
})
