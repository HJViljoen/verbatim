import type { CSSProperties } from 'react'

import { MOVEMENT_WORDS, MovementBadge } from '@/components/delta-badge'
import type { RenderMode } from '@/lib/blocks/types'
import { weekPlotMin } from '@/lib/charts/week-bars'
import {
  WEEK_LINE_EMPTY, WEEK_LINE_ROW, weekLineLayout, weekLineStripLayout, weekLineTable, type WeekLineColumn, type WeekLineRowLayout,
} from '@/lib/charts/week-line'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { Verdict } from '@/lib/reading/verdicts'
import type { WeekLineBlock } from '@/lib/reading/week-line'

// The same-age weekly line, as rows (market-first decision M, part 2; WP3.13
// "Design of the line"), standalone: it needs neither WP2.7's "With this
// update" block nor WP2.9's bars. Wave 2 embeds the rows under the bars'
// week axis in "Read at the same age" (Your market) and in Looks & style's
// week strip (Subjects), handing each week's x from that axis (`columns`).
//
// SMALL MULTIPLES: one row per object, 24 px tall and 8 px apart; the name at
// the left in sans 12 px, the row's highest and lowest shares as 9 px mono
// ticks, a 1.5 px line in the market ink with points ringed in --tile, and at
// the right the latest share with its "of N" in mono and the latest pair's
// verdict through MovementBadge ("no clear change" muted; a subject not yet
// ready prints "provisional" and no verdict, decision C). A pair not read the
// same way draws both points and no segment, and the figure line under the
// rows gives the reason. Each point answers a hover with the WP's sentence
// (an SVG <title>, so no script). No direction word on any path.
//
// PRINT draws the same rows without the hover targets; EMAIL is a table of the
// weeks' levels and the latest verdict, with the figure line under it.

const MONO = { fontFamily: 'var(--font-plex-mono), ui-monospace, monospace' } as const
const pct = (f: number): string => `${(f * 100).toFixed(3)}%`

/** The latest verdict in the email's words: the badge's vocabulary, never a direction word. */
function verdictWords(v: Verdict | null): string | null {
  if (!v) return null
  if (v.state === 'moved' && v.changePts != null) return `${v.changePts > 0 ? '▲' : '▼'} ${Math.abs(v.changePts)} pts`
  return v.state === 'moved' ? MOVEMENT_WORDS.too_little_data : MOVEMENT_WORDS[v.state]
}

/** The rows' empty state: the line prints and no week is kept yet. */
export const weekLineEmpty = (b: WeekLineBlock | null | undefined): boolean => !b || b.rows.length === 0

/** A row's marks: the segments of the pairs read the same way (1.5 px, the
 *  market ink), then the points, solid and ringed in --tile, each answering a
 *  hover with the WP's sentence (an SVG <title>, so no script). */
function RowMarks({ row, mode }: { row: WeekLineRowLayout; mode: RenderMode }) {
  const R = WEEK_LINE_ROW
  return (
    <>
      {row.segments.map((s) => (
        <line
          key={`${s.from}-${s.to}`}
          x1={pct(s.x1)} y1={s.y1} x2={pct(s.x2)} y2={s.y2}
          strokeWidth={R.line}
          strokeLinecap="round"
          style={{ stroke: 'var(--foreground)' }}
        />
      ))}
      {row.points.map((p) => (
        <svg key={p.week} x={pct(p.cx)} y={p.y} width={1} height={1} overflow="visible">
          <g>
            <title>{p.hover}</title>
            {/* The hover target: the row's height across the point's slot (app only). */}
            {mode === 'app' ? <rect x={-12} y={-p.y} width={24} height={R.height} fill="transparent" /> : null}
            <circle cx={0} cy={0} r={p.r} strokeWidth={R.ring} style={{ fill: 'var(--foreground)', stroke: 'var(--tile)' }} />
          </g>
        </svg>
      ))}
    </>
  )
}

/** The email's form (tables and inline styles only): the weeks shown as
 *  columns, one row per object, each cell a level with its "of N", and the
 *  latest verdict in the badge's words. */
function WeekLineEmailTable({ block, columns }: { block: WeekLineBlock; columns: readonly WeekLineColumn[] }) {
  const t = weekLineTable(block, columns)
  const cell = { fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.ink2, padding: '3px 10px 3px 0', borderTop: `1px solid ${EMAIL.hairline}`, whiteSpace: 'nowrap' as const }
  const head = { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, color: EMAIL.muted, padding: '0 10px 2px 0', textAlign: 'left' as const }
  return (
    <table cellPadding={0} cellSpacing={0} role="presentation" style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={head}>Week of</th>
          {t.head.map((h) => <th key={h} style={head}>{h}</th>)}
          <th style={head}>Latest</th>
        </tr>
      </thead>
      <tbody>
        {t.rows.map((r) => (
          <tr key={r.key}>
            <td style={{ ...cell, fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink }}>{r.label}</td>
            {r.cells.map((c, i) => <td key={i} style={cell}><span data-copy={c === '·' ? undefined : 'level'}>{c}</span></td>)}
            <td style={{ ...cell, fontFamily: FONT.sans, color: EMAIL.muted }}>
              {r.provisional ? 'provisional' : <span data-copy="verdict">{verdictWords(r.verdict)}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function WeekLine({ block, columns, mode, labelWidth = WEEK_LINE_ROW.labelWidth, endWidth = WEEK_LINE_ROW.endWidth }: {
  block: WeekLineBlock
  /** Each week's centre on the caller's plot, a fraction of its width (the caller's week axis). */
  columns: readonly WeekLineColumn[]
  mode: RenderMode
  labelWidth?: number
  endWidth?: number
}) {
  if (weekLineEmpty(block) || columns.length === 0) {
    return mode === 'email'
      ? <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '20px', color: EMAIL.ink2 }}>{WEEK_LINE_EMPTY}</div>
      : <p className="m-0 text-[13px] leading-5 text-secondary-foreground">{WEEK_LINE_EMPTY}</p>
  }

  if (mode === 'email') {
    const L = weekLineLayout(block, columns)
    return (
      <div>
        <WeekLineEmailTable block={block} columns={columns} />
        {L.figureLine ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '18px', color: EMAIL.ink2, marginTop: 8 }}>{L.figureLine}</div> : null}
      </div>
    )
  }

  const L = weekLineLayout(block, columns)
  const R = WEEK_LINE_ROW
  // WIDE (the rows' own container at 640 px or more): one grid row per object,
  // the name | the plot | the latest reading, 24 px tall and 8 px apart, the
  // gutters the caller aligns its week axis with. NARROW (under 640 px, a
  // container query, so an embed that hands the rows a wide scrolling strip
  // keeps the grid): the name, then the latest reading, over a full-width
  // 24 px plot, so every week, the latest included, is in view with no
  // sideways scroll.
  const gutters = { '--wl-label': `${labelWidth}px`, '--wl-end': `${endWidth}px` } as CSSProperties
  return (
    <div className="@container flex min-w-0 flex-col gap-3" data-week-line="" style={gutters}>
      <div className="flex flex-col gap-y-2 @max-[640px]:gap-y-3">
        {L.rows.map((row) => (
          <div
            key={row.key}
            data-week-line-row={row.key}
            className="grid h-6 grid-cols-[var(--wl-label)_minmax(0,1fr)_var(--wl-end)] items-center @max-[640px]:flex @max-[640px]:h-auto @max-[640px]:flex-wrap @max-[640px]:gap-x-3 @max-[640px]:gap-y-1"
          >
            <span className="truncate pr-9 text-[12px] leading-6 text-foreground @max-[640px]:max-w-full @max-[640px]:flex-none @max-[640px]:pr-0 @max-[640px]:leading-5" title={row.label}>{row.label}</span>
            <div className="h-6 min-w-0 @max-[640px]:order-last @max-[640px]:basis-full @max-[640px]:pl-8">
              <svg width="100%" height={R.height} role="img" aria-label={row.aria} className="block overflow-visible">
                {row.ticks.map((t) => (
                  <text key={t.text} x={-8} y={t.y} dy="0.32em" textAnchor="end" fontSize={R.tickPx} style={{ ...MONO, fill: 'var(--muted-foreground)' }}>{t.text}</text>
                ))}
                <RowMarks row={row} mode={mode} />
              </svg>
            </div>
            <span className="flex items-center justify-end gap-3 whitespace-nowrap pl-4 @max-[640px]:basis-full @max-[640px]:flex-wrap @max-[640px]:justify-start @max-[640px]:gap-x-2 @max-[640px]:gap-y-0 @max-[640px]:whitespace-normal @max-[640px]:pl-0">
              {row.latest ? <span className="font-mono text-[12px] tabular-nums text-secondary-foreground" data-copy="level">{row.latest.level}</span> : null}
              {row.provisional
                ? <span className="text-xs font-medium text-muted-foreground">provisional</span>
                : row.latest?.verdict
                  ? <span data-copy="verdict"><MovementBadge verdict={row.latest.verdict} unit="pts" bandTip={mode === 'app'} /></span>
                  : null}
            </span>
          </div>
        ))}
      </div>
      {L.figureLine ? <p className="m-0 text-[13px] leading-5 text-secondary-foreground [text-wrap:pretty]">{L.figureLine}</p> : null}
    </div>
  )
}

// ---- The strip: the rows on the page's own week axis (WP3.13 display, deploy 3w) ------
//
// Your market's "Read at the same age" (under WP2.9's bars, inside "With this
// update") and Subjects' week strip (§2.3 S6) draw the line here, on the
// page's week axis, so each point sits under the bar of the week it reads.
//
// THE BARS' GRID, WEEK FOR WEEK. The plot takes the bars' own row-name gutter
// (88 px, 116 px from xl: `WeekBarsHover`'s 'wide') and no right gutter, and
// never narrows under the bars' own narrowest plot (`weekPlotMin`): below it,
// the strip scrolls sideways and opens at the latest week, exactly as the bars
// do, so the latest weeks line up at every width. The gutter stays put while
// the plot scrolls under it (sticky, on the strip's ground), as the bars' label
// column does, so the strip shows the same weeks as the bars above it and each
// row's ticks stay in view. With no right gutter to hold them, each row's name
// and latest reading sit on a line over its 24 px plot, held in view while the
// plot scrolls (sticky, the scroll box's width), the reading wrapping under
// the name where the two do not fit; its ticks sit in the gutter beside the
// plot.
//
// Under the rows, the axis row: WP2.9's due-date labels for weeks not yet read
// at their age, "left out", "not kept", one label over the weeks before the
// line's first, then the week and month labels as the bars print them. Pairs
// not read the same way carry no chip (T0a).

/** The axis row's height and its lines, from its top. */
const AXIS_ROW = { height: 92, dueY: 13, dateY: 31, wordY: 22, baseY: 46.5, dayY: 68, monthY: 86 } as const

export function WeekLineStrip({ block, axis, mode, surface = 'inner' }: {
  block: WeekLineBlock
  /** The page's week axis: the Mondays its bars draw, oldest first. */
  axis: readonly string[]
  mode: RenderMode
  /** The ground the strip sits on (the due labels' halo). */
  surface?: 'inner' | 'tile'
}) {
  if (weekLineEmpty(block) || axis.length === 0) {
    return mode === 'email'
      ? <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '20px', color: EMAIL.ink2 }}>{WEEK_LINE_EMPTY}</div>
      : <p className="m-0 text-[15px] leading-[1.6] text-secondary-foreground">{WEEK_LINE_EMPTY}</p>
  }
  const S = weekLineStripLayout(block, axis)
  if (mode === 'email') {
    return (
      <div>
        <WeekLineEmailTable block={block} columns={S.columns} />
      </div>
    )
  }
  const R = WEEK_LINE_ROW
  const plotMin = weekPlotMin(S.n)
  // The bars' gutter, and so their plot: `WeekBarsHover`'s 'wide' columns.
  const cols = 'grid-cols-[88px_minmax(0,1fr)] xl:grid-cols-[116px_minmax(0,1fr)]'
  const widths = { '--wl-min': `${88 + plotMin}px`, '--wl-min-xl': `${116 + plotMin}px` } as CSSProperties
  const MONO_TEXT = { fontFamily: 'var(--font-mono)' } as const
  const halo = { stroke: `var(--${surface})`, strokeWidth: 4, strokeLinejoin: 'round' as const, paintOrder: 'stroke' as const }
  // The gutter, held at the scroll box's start on the strip's ground, over the plot scrolling under it.
  const gutter = `sticky left-0 z-[1] ${surface === 'tile' ? 'bg-tile' : 'bg-inner'}`
  return (
    <div className="flex min-w-0 flex-col gap-4" data-week-line-strip="">
      {/* THE SCROLL BOX ITSELF IS THE REVERSED ROW, as the bars' is: it opens
          at its end, the latest week, with no script. It is also the size
          container the held line takes its width from (100cqw). */}
      <div className="@container flex min-w-0 flex-row-reverse overflow-x-auto overflow-y-hidden">
        <div className="flex min-w-[var(--wl-min)] flex-1 shrink-0 flex-col gap-2 xl:min-w-[var(--wl-min-xl)]" style={widths}>
          {S.rows.map((row) => (
            <div key={row.key} data-week-line-row={row.key} className="flex flex-col gap-1">
              <div className="sticky left-0 flex w-[100cqw] flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <span className="text-[12px] leading-5 text-foreground">{row.label}</span>
                <span className="ml-auto flex flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5">
                  {row.latest ? <span data-copy="level" className="whitespace-nowrap font-mono text-[12px] leading-5 tabular-nums text-secondary-foreground">{row.latest.level}</span> : null}
                  {row.provisional
                    ? <span className="text-xs font-medium text-muted-foreground">provisional</span>
                    : row.latest?.verdict
                      ? <span data-copy="verdict" className="whitespace-nowrap"><MovementBadge verdict={row.latest.verdict} unit="pts" good="neutral" bandTip={mode === 'app'} /></span>
                      : null}
                </span>
              </div>
              <div className={`grid h-6 ${cols}`}>
                {/* The row's own scale: its highest and lowest shares, 9 px mono, beside the plot. */}
                <span aria-hidden className={gutter}>
                  {row.ticks.map((t) => (
                    <span key={t.text} className="absolute right-2 font-mono text-[9px] leading-[9px] tabular-nums text-muted-foreground" style={{ top: t.y - 4.5 }}>{t.text}</span>
                  ))}
                </span>
                <svg width="100%" height={R.height} role="img" aria-label={row.aria} className="block overflow-visible">
                  <RowMarks row={row} mode={mode} />
                </svg>
              </div>
            </div>
          ))}
          <div className={`grid pt-2 ${cols}`}>
            <span aria-hidden className={gutter} />
            <svg width="100%" height={AXIS_ROW.height} role="img" aria-label={S.axisAria} className="block overflow-visible">
              {S.slots.map((sl) => (
                <g key={sl.week}>
                  {sl.state === 'due' ? (
                    <>
                      <text x={pct(sl.cx)} y={AXIS_ROW.dueY} textAnchor="middle" fontSize={12} style={{ ...MONO_TEXT, fill: 'var(--muted-foreground)' }}>due</text>
                      <text x={pct(sl.cx)} y={AXIS_ROW.dateY} textAnchor="middle" fontSize={13} fontWeight={500} className="@max-[640px]:text-[11px]" style={{ ...MONO_TEXT, fill: 'var(--foreground)' }}>{sl.due}</text>
                    </>
                  ) : sl.state === 'left_out' || sl.state === 'not_kept' ? (
                    <text x={pct(sl.cx)} y={AXIS_ROW.wordY} textAnchor="middle" fontSize={12} className="@max-[640px]:text-[10px]" style={{ ...MONO_TEXT, fill: 'var(--muted-foreground)', ...halo }}>{sl.state === 'left_out' ? 'left out' : 'not kept'}</text>
                  ) : null}
                  <text x={pct(sl.cx)} y={AXIS_ROW.dayY} textAnchor="middle" fontSize={12} style={{ ...MONO_TEXT, fill: 'var(--secondary-foreground)' }}>{sl.day}</text>
                  {sl.month ? <text x={pct(sl.cx)} y={AXIS_ROW.monthY} textAnchor="middle" fontSize={12} style={{ ...MONO_TEXT, fill: 'var(--muted-foreground)' }}>{sl.month}</text> : null}
                </g>
              ))}
              {S.before ? (
                <text x={pct(S.before.cx)} y={S.before.lines.length > 1 ? AXIS_ROW.dueY : AXIS_ROW.wordY} textAnchor="middle" fontSize={12} className="@max-[640px]:text-[10px]" style={{ ...MONO_TEXT, fill: 'var(--muted-foreground)' }}>
                  {S.before.lines.map((l, i) => <tspan key={l} x={pct(S.before!.cx)} dy={i === 0 ? 0 : 16}>{l}</tspan>)}
                </text>
              ) : null}
              <line x1="0" x2="100%" y1={AXIS_ROW.baseY} y2={AXIS_ROW.baseY} style={{ stroke: 'var(--border)', strokeWidth: 1 }} />
            </svg>
          </div>
        </div>
      </div>
      {/* No chip for a pair of weeks not read the same way (T0a: a refused
          comparison is not explained). The strip is latent behind
          `WEEK_LINE.print`. */}
    </div>
  )
}
