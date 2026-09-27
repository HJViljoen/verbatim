import type { ReactNode } from 'react'
import { renderMarketSubjects, MARKET_SUBJECTS_TITLE, marketSubjectsLine, prevCell, printsFigures, rowMakers, rowTag, marketSubjectsFigures } from '@/components/pages/overview/market-subjects'
import { barAxis, shortMonthName } from '@/components/pages/overview/market'
import { BlockFrame } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { byMarketSize, marketLevel } from '@/lib/pages/overview-market'
import type { WeeklyData } from '@/lib/pages/weekly'
import type { FigureTable } from '@/lib/reading/verdicts'
import { Bar, ChipLine, Inner, Num, RowLabel, Table } from './email'
import { redress, type WeeklyBlock } from './section'

// WR2 · The market by subject (market-first WP3.7; the approved preview's
// WeeklyReport): the front page's subjects on the reading month, the market's
// rows ranked by size, each with its calibration word and maker share as row
// tags (decision C), the month before beside, and what this update put into
// each ("With this update", WP2.7's `window_subject_readings` read: the
// update's days in the reading month, on the market). The market pair's one
// chip under the table. No footer: the preview draws none on this card.
//
// A ROW THAT PRINTS NO FIGURE PRINTS NO "+N" EITHER, and where the update's
// days miss the reading month (1 to 15 of a month) the column is "·", never a
// "+0" that reads as a quiet week (the deploy-3 review).

/** A share at 100 videos and 10 of its own, else a dot (the Videos column
 *  carries the count). */
const shareCell = (k: number | null | undefined, n: number | null | undefined): string => {
  const l = marketLevel(k ?? null, n ?? null)
  return l?.kind === 'share' ? l.text : '·'
}

/** A row's "With this update" cell. */
export function addedCell(data: WeeklyData, id: string): string {
  const j = data.contributions?.[id]
  return j == null ? '·' : `+${fmtInt(j)}`
}

function subjectsEmail(data: WeeklyData): ReactNode {
  const o = data.overview
  const line = marketSubjectsLine(o)
  if (line) return <Inner marginTop={0}><div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2 }}>{line}</div></Inner>
  const rows = [...o.subjects.rows].sort(byMarketSize)
  const n = o.subjects.market?.n ?? null
  const prev = o.subjects.market?.prev ?? null
  const axis = barAxis(rows.map((r) => (printsFigures(r) && n ? (r.market?.k as number) / n : null)))
  return (
    <>
      <Table
        columns={[
          { head: 'Subject' },
          { head: '', width: 64, className: 'vb-m-bar' },
          { head: 'Videos', align: 'right', width: 52 },
          { head: <span data-copy="level">{shortMonthName(o.month)}<br />of {n == null ? '·' : fmtInt(n)}</span>, align: 'right', width: 52 },
          ...(prev ? [{ head: <span data-copy="level">{shortMonthName(prev.month)}<br />of {prev.n == null ? '·' : fmtInt(prev.n)}</span>, align: 'right' as const, width: 52 }] : []),
          { head: <>With this<br />update</>, align: 'right', width: 64 },
        ]}
        rows={rows.map((r) => {
          const figures = printsFigures(r)
          const k = r.market?.k ?? null
          const under = figures && k != null && marketLevel(k, n)?.kind === 'count'
          const tag = [rowTag(r), rowMakers(r), under ? 'under 10, a count only' : null].filter(Boolean).join(' · ') || null
          return [
            <RowLabel key="l" tag={tag}>{r.label}</RowLabel>,
            <div key="b" style={{ paddingTop: 8 }}>{figures && !under ? <Bar share={n ? (k as number) / n : null} axis={axis} width={56} /> : null}</div>,
            figures ? <Num key="k">{fmtInt(k as number)}</Num> : null,
            figures ? <Num key="s" weight={400}>{shareCell(k, n)}</Num> : null,
            ...(prev ? [figures ? <Num key="p" prev>{prevCell(r.marketPrev?.k, prev.n)}</Num> : null] : []),
            figures ? <Num key="a" prev>{addedCell(data, r.id)}</Num> : null,
          ]
        })}
      />
      <ChipLine words={o.sentence.chip ?? null} />
    </>
  )
}

/** The page's table has no "With this update" column; on the share page and
 *  on paper it is said in one line under it, each subject by name. */
function addedLine(data: WeeklyData): ReactNode {
  const rows = [...data.overview.subjects.rows].sort(byMarketSize).filter((r) => printsFigures(r) && data.contributions?.[r.id] != null)
  if (rows.length === 0) return null
  return (
    <p className="m-0 text-[14px] leading-[1.55] text-secondary-foreground">
      <strong className="font-semibold text-foreground">With this update:</strong>{' '}
      {rows.map((r, i) => (
        <span key={r.id}>{i > 0 ? ' · ' : ''}{r.label} <span data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{addedCell(data, r.id)}</span></span>
      ))}
    </p>
  )
}

export const weeklySubjects: WeeklyBlock = {
  key: 'weekly.subjects',
  title: MARKET_SUBJECTS_TITLE,

  render(data, mode = 'app', ctx) {
    if (mode === 'email') return <BlockFrame title={MARKET_SUBJECTS_TITLE} mode={mode} card>{subjectsEmail(data)}</BlockFrame>
    return redress(renderMarketSubjects(data.overview, mode, ctx.appUrl), { title: MARKET_SUBJECTS_TITLE, mode, footer: undefined, extra: addedLine(data) })
  },

  figures(data): FigureTable {
    const out: FigureTable = { ...marketSubjectsFigures(data.overview) }
    for (const [id, j] of Object.entries(data.contributions ?? {})) {
      const row = data.overview.subjects.rows.find((r) => r.id === id)
      if (!row || !printsFigures(row)) continue
      out[`weekly_subject_${id.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_added`] = { value: j, unit: 'videos', label: `videos on ${row.label} this update put into your market` }
    }
    return out
  },

  emptyState(data) {
    return marketSubjectsLine(data.overview)
  },
}
