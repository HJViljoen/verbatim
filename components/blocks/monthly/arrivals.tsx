import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { surface } from '@/lib/nav'
import type { MonthlyArrivals } from '@/lib/reports/monthly-slots'
import type { FigureTable } from '@/lib/reading/verdicts'
import { T, presentation } from './email-table'
import { slotSection } from './slot'

/**
 * 3 · With this update (market-first WP2.1; the front page's block 3, WP2.7's
 * slot). The came-in lines only: the monthly carries no weekly volume bars
 * (plan §2.9). Absent until WP2.7 fills the slot.
 *
 * FIRST CUT, IN THE PLAN'S WORDS (§2.2 block 3): "With the 11 Oct update: {N}
 * videos read in your market for the first time, and {C} more September
 * comments came in. October so far: {V} videos after 2 updates." and "Heard
 * for the first time with 10+ videos this month: …, each with how many of its
 * videos came from searches added this month". Counts that add to months,
 * never a verdict over a week (§9.1 #5). WP2.7 moves these words beside its
 * front-page block, and both print them from there.
 */

const fig = (n: number, mode: RenderMode): ReactNode => (
  <span data-copy="figure" className={mode === 'email' ? undefined : 'font-mono font-semibold tabular-nums text-foreground'} style={mode === 'email' ? { fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink } : undefined}>{fmtInt(n)}</span>
)

/** The came-in sentence for the month the artefact reads, and the month so
 *  far after it. */
function cameIn(a: MonthlyArrivals, month: string, mode: RenderMode): ReactNode {
  const read = a.months.find((m) => m.month.slice(0, 7) === month.slice(0, 7)) ?? null
  const name = longMonth(month)
  return (
    <>
      {read ? (
        <>With the {shortDate(a.run.date)} update: {fig(read.videosFirstRead, mode)} videos read in your market for the first time, and {fig(read.commentsCaptured, mode)} more {name} comments came in.</>
      ) : (
        <>Nothing more of {name} came in with the {shortDate(a.run.date)} update.</>
      )}
      {a.current.month.slice(0, 7) !== month.slice(0, 7) && a.current.videos != null ? (
        <> {longMonth(a.current.month)} so far: {fig(a.current.videos, mode)} videos after {fmtInt(a.current.updates)} {a.current.updates === 1 ? 'update' : 'updates'}.</>
      ) : null}
    </>
  )
}

function heard(a: MonthlyArrivals, month: string, mode: RenderMode): ReactNode {
  const name = longMonth(month)
  if (a.newThemes.length === 0) return <>No theme was heard for the first time with 10+ videos in {name}.</>
  return (
    <>
      With 10+ videos in {name}:{' '}
      {a.newThemes.map((t, i) => (
        <span key={t.registryId}>
          {i > 0 ? '; ' : ''}“<span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>” {fig(t.k, mode)}, {fig(t.fromNewSearches, mode)} of them from searches added in {name}
        </span>
      ))}
      .
    </>
  )
}

function body(a: MonthlyArrivals, month: string, mode: RenderMode): ReactNode {
  if (mode === 'email') {
    const col = (title: string, words: ReactNode) => (
      <td className="vb-m-col" style={{ width: '50%', verticalAlign: 'top', paddingRight: 12 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '22px', fontWeight: 600, color: EMAIL.ink }}>{title}</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2, marginTop: 8 }}>{words}</div>
      </td>
    )
    return (
      <table width="100%" {...presentation} style={T}>
        <tbody><tr>{col('Came in', cameIn(a, month, mode))}{col('Heard for the first time', heard(a, month, mode))}</tr></tbody>
      </table>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2" data-print-cols="2">
      <div className="flex flex-col gap-2"><p className="m-0 text-[15px] font-semibold">Came in</p><p className="m-0 text-[15px] leading-[1.6] text-secondary-foreground">{cameIn(a, month, mode)}</p></div>
      <div className="flex flex-col gap-2"><p className="m-0 text-[15px] font-semibold">Heard for the first time</p><p className="m-0 text-[15px] leading-[1.6] text-secondary-foreground">{heard(a, month, mode)}</p></div>
    </div>
  )
}

function figures(a: MonthlyArrivals, month: string): FigureTable {
  const out: FigureTable = {}
  const read = a.months.find((m) => m.month.slice(0, 7) === month.slice(0, 7))
  const name = longMonth(month)
  if (read) {
    out.arrivals_videos_first_read = { value: read.videosFirstRead, unit: 'videos', label: `videos read in your market for the first time with the ${shortDate(a.run.date)} update` }
    out.arrivals_comments_captured = { value: read.commentsCaptured, unit: 'comments', label: `${name} comments that came in with the ${shortDate(a.run.date)} update` }
  }
  return out
}

export const monthlyArrivals = slotSection({
  key: 'monthly.arrivals',
  title: 'With this update',
  slot: 'arrivals',
  link: () => {
    const page = surface('week')
    return { href: page.href, label: `Open ${page.label} →` }
  },
  stub: 'What came in with the latest update is read here once it is counted.',
  body: (value, data, mode) => body(value, data.month, mode),
  figures: (value, data) => figures(value, data.month),
})
