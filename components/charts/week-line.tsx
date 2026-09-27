import type { CSSProperties } from 'react'

import { MOVEMENT_WORDS, MovementBadge } from '@/components/delta-badge'
import type { RenderMode } from '@/lib/blocks/types'
import {
  WEEK_LINE_EMPTY, WEEK_LINE_ROW, weekLineLayout, weekLineTable, type WeekLineColumn,
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
    const t = weekLineTable(block, columns)
    const L = weekLineLayout(block, columns)
    const cell = { fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.ink2, padding: '3px 10px 3px 0', borderTop: `1px solid ${EMAIL.hairline}`, whiteSpace: 'nowrap' as const }
    const head = { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, color: EMAIL.muted, padding: '0 10px 2px 0', textAlign: 'left' as const }
    return (
      <div>
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
