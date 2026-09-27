import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import type { WeekData, WorkedRow } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'
import { RULE, SCALE } from '@/components/pages/overview/market'

// "What worked" (market-first WP3.7; the approved preview's This week): the
// update's formats and hooks against its own median video, side by side, and
// your own hooks in the month on one line under them.
//
// A MULTIPLE NEEDS ITS N. Under `WORKED_FLOOR` videos a row prints its count
// only ("count only"), never a multiple one video can make; the rows that
// clear it are listed by their multiple, the counts after them.
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings):
// how many videos carry an engagement figure, and which platform has none, are
// How to read's, not a meta line or a footnote.

export const WORKED_TITLE = 'What worked'

/** Videos a format or hook needs before its multiple prints. */
export const WORKED_FLOOR = 10

/** The rows as the preview lists them: the ones at the floor by multiple, then
 *  the counts. */
export function workedOrder(rows: readonly WorkedRow[]): { row: WorkedRow; counted: boolean }[] {
  const read = rows.filter((r) => r.videos >= WORKED_FLOOR).sort((a, b) => b.multiple - a.multiple || b.videos - a.videos)
  const counts = rows.filter((r) => r.videos < WORKED_FLOOR).sort((a, b) => b.videos - a.videos)
  return [...read.map((row) => ({ row, counted: false })), ...counts.map((row) => ({ row, counted: true }))]
}

const multiple = (m: number): string => `${m.toFixed(1)}×`

/** The bar against the median: its length the multiple on the table's axis,
 *  a tick at 1×. Decoration: the figure beside it is the reading. */
function MedianBar({ m, axis }: { m: number; axis: number }) {
  const pct = (v: number) => Math.max(0, Math.min(100, (v / axis) * 100))
  return (
    <span aria-hidden className="relative block h-1.5 w-full min-w-[64px]">
      <span className="absolute inset-y-0 left-0 rounded-[2px] bg-foreground" style={{ width: `${pct(m)}%` }} />
      <span className="absolute -top-[5px] h-4 w-[2px] rounded-[1px] bg-cat" style={{ left: `calc(${pct(1)}% - 1px)` }} />
    </span>
  )
}

function Table({ title, rows, mode }: { title: string; rows: readonly WorkedRow[]; mode: RenderMode }) {
  const ordered = workedOrder(rows)
  const axis = Math.max(2, ...ordered.filter((o) => !o.counted).map((o) => o.row.multiple)) * 1.08
  if (mode === 'email') {
    const cell = { fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink, padding: '6px 8px 6px 0', borderTop: `1px solid ${EMAIL.hairline}` }
    const num = { ...cell, fontFamily: FONT.mono, textAlign: 'right' as const }
    const head = { ...cell, borderTop: 0, fontSize: 11, color: EMAIL.muted }
    return (
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%', marginTop: 10 }}>
        <thead><tr><th style={{ ...head, textAlign: 'left' }}>{title}</th><th style={{ ...head, textAlign: 'right' }}>Against median</th><th style={{ ...head, textAlign: 'right' }}>Videos</th></tr></thead>
        <tbody>
          {ordered.map(({ row, counted }) => (
            <tr key={row.label}>
              <td style={cell}>{row.label}</td>
              <td style={num}>{counted ? 'count only' : <span data-copy="figure">{multiple(row.multiple)}</span>}</td>
              <td style={num}><span data-copy="figure">{fmtInt(row.videos)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  // A NARROW TABLE (a phone, or half a tile): the bar leaves and "count only"
  // takes the multiple's cell, as the front page's tables do (container query).
  const cols = 'grid-cols-[minmax(0,1fr)_76px_56px] gap-x-3 @min-[520px]:grid-cols-[minmax(0,1fr)_minmax(64px,140px)_64px_56px] @min-[520px]:gap-x-4'
  const WIDE = '@max-[520px]:hidden'
  return (
    <div className="@container min-w-0">
    <div role="table" className="flex min-w-0 flex-col">
      <div role="row" className={`grid ${cols} items-end ${RULE.head}`}>
        <span role="columnheader" className={SCALE.head}>{title}</span>
        <span role="columnheader" className={`${WIDE} inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground`}><span aria-hidden className="h-3.5 w-[2px] rounded-[1px] bg-cat" />the median video</span>
        <span role="columnheader" className="flex flex-col items-end text-right leading-[1.35]"><span className="text-[13px] font-medium text-muted-foreground">Against</span><span className="font-mono text-[12px] text-muted-foreground">median</span></span>
        <span role="columnheader" className={`text-right ${SCALE.head}`}>Videos</span>
      </div>
      {ordered.map(({ row, counted }) => (
        <div key={row.label} role="row" className={`grid ${cols} min-h-11 items-center py-1.5 ${RULE.row}`}>
          <span role="rowheader" className={`min-w-0 ${SCALE.row}`}>{row.label}</span>
          <span className={`block ${WIDE}`}>{counted ? <span className={SCALE.tag}>count only</span> : <MedianBar m={row.multiple} axis={axis} />}</span>
          <span className={`${SCALE.num} font-semibold`}>{counted ? <><span className={`font-normal text-muted-foreground ${WIDE}`}>·</span><span className={`${SCALE.tag} @min-[520px]:hidden`}>count only</span></> : <span data-copy="figure">{multiple(row.multiple)}</span>}</span>
          <span className={SCALE.prev}><span data-copy="figure">{fmtInt(row.videos)}</span></span>
        </div>
      ))}
    </div>
    </div>
  )
}

/** "Your own hooks in September: Bold claim 6 · Personal story 4 · Question
 *  1, of 11 posts with a hook". Your own posts, by the month they were
 *  published. */
function OwnHooks({ data, mode }: { data: WeekData; mode: RenderMode }): ReactNode {
  const sides = data.worked.sides
  const side = sides?.hooks.sides[0] ?? null
  if (!sides || !side) return null
  const month = longMonth(data.month)
  const cells = sides.hooks.keys
    .map(({ key, label }) => ({ label, k: side.byKey[key]?.value.k ?? 0 }))
    .filter((c) => c.k > 0)
    .slice(0, 4)
  const head = `Your own hooks in ${month}:`
  const body: ReactNode = side.unread
    ? side.unread
    : cells.length === 0
      ? `none of the ${fmtInt(side.of)} you published carries a hook we could read.`
      : (
        <>
          {cells.map((c, i) => (
            <span key={c.label}>{i > 0 ? ' · ' : ''}{c.label} <span data-copy="figure" className={mode === 'email' ? undefined : 'font-mono font-semibold tabular-nums text-foreground'}>{fmtInt(c.k)}</span></span>
          ))}
          , <span data-copy="level">of <span className={mode === 'email' ? undefined : 'font-mono font-semibold tabular-nums text-foreground'}>{fmtInt(side.of)}</span> posts with a hook</span>
        </>
      )
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink2, background: EMAIL.inner, borderRadius: 6, padding: '10px 12px', marginTop: 10 }}><strong style={{ color: EMAIL.ink }}>{head}</strong> {body}</div>
  }
  return (
    <p className="m-0 flex items-baseline gap-3 rounded-md bg-inner px-6 py-4 text-[15px] leading-[1.55] text-secondary-foreground">
      <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] rounded-[2px] bg-you" />
      <span className="min-w-0"><strong className="font-semibold text-foreground">{head}</strong> {body}</span>
    </p>
  )
}

export const weekWorked: Block<WeekData> = {
  key: 'week.worked',
  title: WORKED_TITLE,
  question: 'Which formats and hooks earned attention in this update?',

  render(data, mode = 'app', ctx) {
    const w = data.worked
    const href = `${ctx.appUrl}/dashboard/reports`
    const footer = openLink(mode, href, 'Open the content brief →')
    const empty = weekWorked.emptyState(data)
    if (empty) return <BlockFrame title={WORKED_TITLE} mode={mode} footer={footer} roomy card><BlockEmpty mode={mode}>{empty}</BlockEmpty></BlockFrame>
    return (
      <BlockFrame title={WORKED_TITLE} mode={mode} footer={footer} roomy card>
        <div className={mode === 'email' ? undefined : 'flex min-w-0 flex-col gap-8'}>
          <div className={mode === 'email' ? undefined : 'grid grid-cols-1 gap-x-12 gap-y-8 xl:grid-cols-2'} data-print-cols="2">
            {w.formats.length > 0 ? <Table title="Format" rows={w.formats} mode={mode} /> : null}
            {w.hooks.length > 0 ? <Table title="Hook" rows={w.hooks} mode={mode} /> : null}
          </div>
          <OwnHooks data={data} mode={mode} />
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    data.worked.formats.forEach((r, i) => {
      out[`format_${i + 1}_videos`] = { value: r.videos, unit: 'videos', label: `${r.label}: videos this update` }
    })
    data.worked.hooks.forEach((r, i) => {
      out[`hook_${i + 1}_videos`] = { value: r.videos, unit: 'videos', label: `${r.label}: videos this update` }
    })
    return out
  },

  emptyState(data) {
    if (data.worked.unread) return data.worked.unread
    if (data.worked.formats.length === 0 && data.worked.hooks.length === 0) return 'No video this update carries an engagement figure to read a format or a hook against.'
    return null
  },
}
