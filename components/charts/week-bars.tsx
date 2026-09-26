import type { ReactNode } from 'react'

import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import {
  dueLabel, weekBarsAriaLabel, weekPlotMin, weekBarsLayout, weekBarsTable, weekChangeSentence, weekDetail, weekName,
  type WeekBarsLayout, type WeekBarsSize,
} from '@/lib/charts/week-bars'
import { dueHasPassed, firstComparisonDue, weekKindLabel, WEEK_LINE_EXCLUDED, WEEK_LINE_KINDS, type PendingWeekLine } from '@/lib/reading/week-line'
import { isoWeekOf, weekRuleGroupOf, type WeekRule, type WeekVolume, type WeekVolumesBlock } from '@/lib/reading/weeks'
import { WeekBarsHover } from './week-bars-hover'

// The weekly volume bars (market-first decision M, part 1; WP2.9 "Design"),
// drawn as the approved preview draws them: WeeklyLine.dc.html on the front
// page (inside "With this update") and ThisWeek.dc.html's "Week by week".
//
// COUNTS ONLY. Two rows on one week axis, videos then comments, each on its own
// scale; a count over each bar; no gridline, no y axis, no share, no arrow and
// no direction word anywhere (tested). A week with nothing gathered keeps its
// slot and one label spans the run; a week still being read ("so far", or
// "filling": ended with under two updates since) is drawn OUTLINED, with its
// word under the axis, so the state never rests on colour alone (the preview;
// the WP's 40% ink is superseded). Our changes are marks on the day they were
// made: a filled triangle for our searches, a hollow one for how we check
// relevance (a filing change moves no bar of the pooled market, decision E, so
// it is not drawn), with a dotted line down through both rows (the front page) or a
// row of marks under the axis (This week), and one key sentence under the
// chart, which is a key and not a note. How to read's "Week by week" holds the
// method.
//
// ONE SVG AT EVERY WIDTH, NO SCRIPT TO LAY IT OUT: heights in pixels, every
// horizontal position a percentage of the plot (`weekBarsLayout`), and under
// the plot's narrowest width the strip scrolls sideways and opens at the
// latest week, while the row names stay put. The hover card and This week's
// panel are the client leaf's (`WeekBarsHover`). Print draws the SVG and its
// key without the hover; an email gets a table of week labels and counts.

const pct = (f: number): string => `${(f * 100).toFixed(3)}%`

/** The changes the chart draws: our searches and our relevance check. A
 *  filing change moves no bar of the pooled market (decision E), so neither
 *  the marks, the key nor the text alternative names one. */
const drawnRules = (rules: readonly WeekRule[]): WeekRule[] => rules.filter((r) => weekRuleGroupOf(r.surface) !== 'filing')
const MONO = { fontFamily: 'var(--font-mono)' } as const
/** A state word where the plot's slots are narrow (under 640px of plot):
 *  "filling" beside "filling" must not touch. */
const NARROW_WORD = '@max-[640px]:text-[10px]'
const SANS = { fontFamily: 'var(--font-sans)' } as const
const HALO = (surface: 'inner' | 'tile') => ({ stroke: `var(--${surface})`, strokeWidth: 4, strokeLinejoin: 'round' as const, paintOrder: 'stroke' as const })

/** Our change's mark: filled for our searches, hollow for how we check
 *  relevance. A shape, never a "▲" in the text: it marks a day, it claims no
 *  rise. Drawn with its apex at (0, 0). */
export function ChangeMark({ mark, surface = 'tile' }: { mark: 'search' | 'other'; surface?: 'inner' | 'tile' }) {
  return mark === 'search'
    ? <path d="M0 0 l4.5 7.5 h-9 z" style={{ fill: 'var(--foreground)' }} />
    : <path d="M0 0.6 l4 6.4 h-8 z" style={{ fill: `var(--${surface})`, stroke: 'var(--foreground)', strokeWidth: 1.2, strokeLinejoin: 'round' }} />
}

/** The key's marks, as the preview draws them before its sentence. */
function KeyMarks({ search, other }: { search: boolean; other: boolean }) {
  const w = (search ? 11 : 0) + (other ? 11 : 0)
  return (
    <svg width={w} height={20} viewBox={`0 0 ${w} 20`} aria-hidden className="mt-0.5 flex-none">
      {search ? <g transform="translate(4.5 5.5)"><ChangeMark mark="search" /></g> : null}
      {other ? <g transform={`translate(${search ? 15.5 : 4.5} 5.5)`}><ChangeMark mark="other" /></g> : null}
    </svg>
  )
}

function Plot({ L, surface, ticks, label }: { L: WeekBarsLayout; surface: 'inner' | 'tile'; ticks: 'top' | 'row'; label: string }) {
  const tickRowY = (row: number): number => 4 + row * 20
  return (
    <svg width="100%" height={L.height} role="img" aria-label={label} className="relative block overflow-visible">
      {/* The dotted lines first, under the bars. */}
      {ticks === 'top' ? L.ticks.map((t) => (
        <line key={`l${t.date}`} x1={pct(t.x)} x2={pct(t.x)} y1={tickRowY(t.row) + 10} y2={L.comments.base} style={{ stroke: 'var(--cat)', strokeWidth: 1, strokeDasharray: '2 3' }} />
      )) : null}
      <line x1="0" x2="100%" y1={L.videos.base + 0.5} y2={L.videos.base + 0.5} style={{ stroke: 'var(--border)', strokeWidth: 1 }} />
      <line x1="0" x2="100%" y1={L.comments.base + 0.5} y2={L.comments.base + 0.5} style={{ stroke: 'var(--border)', strokeWidth: 1 }} />
      {L.columns.map((c) => {
        const bar = (b: { y: number; h: number }, key: string) => c.outlined
          ? <rect key={key} x={pct(c.cx - c.w / 2)} width={pct(c.w)} y={b.y + 0.75} height={Math.max(0, b.h - 0.75)} rx={2} style={{ fill: `var(--${surface})`, stroke: 'var(--foreground)', strokeWidth: 1.5 }} />
          : <rect key={key} x={pct(c.cx - c.w / 2)} width={pct(c.w)} y={b.y} height={b.h} rx={2} style={{ fill: 'var(--foreground)' }} />
        return (
          <g key={c.week}>
            {c.videos ? bar(c.videos, 'v') : null}
            {c.videos ? <text x={pct(c.cx)} y={c.videos.y - 8} textAnchor="middle" fontSize={13} fontWeight={600} style={{ ...MONO, fill: 'var(--foreground)', ...HALO(surface) }}>{c.videos.label}</text> : null}
            {c.comments && c.comments.h > 0 ? bar(c.comments, 'c') : null}
            {c.comments ? <text x={pct(c.cx)} y={c.comments.y - 7} textAnchor="middle" fontSize={12} fontWeight={500} style={{ ...MONO, fill: 'var(--secondary-foreground)', ...HALO(surface) }}>{c.comments.label}</text> : null}
            <text x={pct(c.cx)} y={L.axis.dayY} textAnchor="middle" fontSize={12} style={{ ...MONO, fill: 'var(--secondary-foreground)' }}>{c.dayLabel}</text>
            {c.monthLabel ? <text x={pct(c.cx)} y={L.axis.monthY} textAnchor="middle" fontSize={12} style={{ ...MONO, fill: 'var(--muted-foreground)' }}>{c.monthLabel}</text> : null}
            {c.stateWord ? <text x={pct(c.cx)} y={L.axis.stateY} textAnchor="middle" fontSize={12} fontWeight={500} className={NARROW_WORD} style={{ ...MONO, fill: 'var(--secondary-foreground)' }}>{c.stateWord}</text> : null}
          </g>
        )
      })}
      {L.gaps.map((g, i) => (
        <text key={`g${i}`} x={pct(g.cx)} y={L.axis.stateY} textAnchor="middle" fontSize={12} fontWeight={500} className={NARROW_WORD} style={{ ...MONO, fill: 'var(--secondary-foreground)' }}>{g.label}</text>
      ))}
      {/* The marks and their days last, over the lines. Each sits in its own
          viewport at its x, so its shape and its label keep their pixel sizes
          at every width. */}
      {ticks === 'top' ? L.ticks.map((t) => (
        <svg key={`t${t.date}`} x={pct(t.x)} y={tickRowY(t.row)} width={1} height={1} overflow="visible">
          <ChangeMark mark={t.mark} surface={surface} />
          <text x={t.side === 'start' ? 10 : -10} y={8} textAnchor={t.side === 'start' ? 'start' : 'end'} fontSize={12} fontWeight={t.mark === 'search' ? 500 : 400} style={{ ...MONO, fill: t.mark === 'search' ? 'var(--secondary-foreground)' : 'var(--muted-foreground)', ...HALO(surface) }}>{t.label}</text>
        </svg>
      )) : null}
      {ticks === 'row' && L.axis.marksY != null ? L.marks.map((m) => {
        const widths = m.items.map((it) => 12 + it.day.length * 7.4)
        const total = widths.reduce((a, b) => a + b, 0) + (m.items.length - 1) * 6
        let x = -total / 2
        return (
          <svg key={`m${m.cx}`} x={pct(m.cx)} y={L.axis.marksY! - 9} width={1} height={1} overflow="visible">
            {m.items.map((it, i) => {
              const at = x
              x += widths[i] + 6
              return (
                <g key={i} transform={`translate(${at + 4.5} 1)`}>
                  <ChangeMark mark={it.mark} surface={surface} />
                  <text x={8} y={8} fontSize={12} style={{ ...MONO, fill: 'var(--secondary-foreground)' }}>{it.day}</text>
                </g>
              )
            })}
          </svg>
        )
      }) : null}
    </svg>
  )
}

function RowLabels({ L, sub, marks }: { L: WeekBarsLayout; sub: boolean; marks: boolean }) {
  const name = (title: string, subTitle: string | null, base: number) => (
    <span className="absolute left-0 flex flex-col" style={{ top: base - (subTitle ? 40 : 22) }}>
      <span className="text-[15px] font-semibold leading-[20px] text-foreground">{title}</span>
      {subTitle ? <span className="text-[13px] leading-[20px] text-muted-foreground">{subTitle}</span> : null}
    </span>
  )
  return (
    <>
      {name('Videos', sub ? 'a week' : null, L.videos.base)}
      {name('Comments', sub ? 'own scale' : null, L.comments.base)}
      {marks && L.axis.marksY != null ? (
        <span className="absolute left-0 text-[13px] leading-[20px] text-muted-foreground" style={{ top: L.axis.marksY - 14 }}>Our changes</span>
      ) : null}
    </>
  )
}

/** The email's form (tables and inline styles only): a row of week labels and
 *  a row each of videos and comments. */
function WeekBarsEmailTable({ weeks }: { weeks: readonly WeekVolume[] }) {
  const t = weekBarsTable(weeks)
  const cell = { fontFamily: FONT.mono, fontSize: 11, color: EMAIL.ink, padding: '3px 6px', textAlign: 'right' as const, borderTop: `1px solid ${EMAIL.hairline}`, whiteSpace: 'nowrap' as const }
  const head = { ...cell, color: EMAIL.muted, borderTop: 0 }
  const name = { ...cell, fontFamily: FONT.sans, textAlign: 'left' as const, color: EMAIL.ink2 }
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
      <tbody>
        <tr><td style={{ ...head, textAlign: 'left' }}>Week of</td>{t.head.map((h, i) => <td key={i} style={head}>{h}</td>)}</tr>
        <tr><td style={name}>Videos</td>{t.videos.map((v, i) => <td key={i} style={cell}><span data-copy="figure">{v}</span></td>)}</tr>
        <tr><td style={name}>Comments</td>{t.comments.map((v, i) => <td key={i} style={cell}><span data-copy="figure">{v}</span></td>)}</tr>
      </tbody>
    </table>
  )
}

/**
 * The bars. `variant`: 'front' is the front page's (WeeklyLine: tall rows, the
 * row names with their sub-lines, the marks above with dotted lines, a hover
 * card); 'week' is This week's (ThisWeek: shorter rows, the marks in a row
 * under the axis, the selected week's facts in a panel beside the chart).
 */
export function WeekBars({ block, mode, variant, surface }: { block: WeekVolumesBlock; mode: RenderMode; variant: 'front' | 'week'; surface: 'inner' | 'tile' }) {
  if (mode === 'email') return <WeekBarsEmailTable weeks={block.weeks} />
  const size: WeekBarsSize = variant === 'front' ? 'large' : 'medium'
  const ticks = variant === 'front' ? 'top' : 'row'
  const rules = drawnRules(block.rules)
  const L = weekBarsLayout(block.weeks, rules, { size, ticks })
  const details = block.weeks.map(weekDetail)
  // THE PANEL'S DEFAULT WEEK: the latest one with anything gathered that is no
  // longer "so far" (the preview's week of 7 Sep), else the latest with any.
  const withData = block.weeks.map((w, i) => ({ w, i })).filter((e) => e.w.state !== 'none_gathered' && e.w.videos > 0)
  const initial = (withData.filter((e) => e.w.state !== 'so_far').pop() ?? withData.pop())?.i ?? null
  return (
    <WeekBarsHover
      details={details}
      labels={<RowLabels L={L} sub={variant === 'front'} marks={ticks === 'row'} />}
      plot={<Plot L={L} surface={surface} ticks={ticks} label={weekBarsAriaLabel(block.weeks, rules)} />}
      height={L.height}
      minWidth={weekPlotMin(L.n)}
      labelWidth="wide"
      surface={surface}
      detail={variant === 'front' ? 'card' : 'panel'}
      initial={initial}
      interactive={mode === 'app'}
    />
  )
}

/** The key under the chart: our changes' marks and one sentence naming their
 *  days. Nothing where no change is on the chart. */
export function WeekBarsKey({ block, mode }: { block: WeekVolumesBlock; mode: RenderMode }) {
  const sentence = weekChangeSentence(drawnRules(block.rules))
  if (!sentence) return null
  if (mode === 'email') return <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '20px', color: EMAIL.ink2, marginTop: 8 }}>{sentence}</div>
  const L = weekBarsLayout(block.weeks, drawnRules(block.rules), { size: 'large', ticks: 'top' })
  const search = L.ticks.some((t) => t.mark === 'search')
  const other = L.ticks.some((t) => t.mark === 'other')
  return (
    <div className="flex gap-3 pt-2">
      <KeyMarks search={search} other={other} />
      <p className="m-0 text-[15px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]">{sentence}</p>
    </div>
  )
}

// ---- "Read at the same age" (the pending row) ------------------------------------------

/**
 * The same-age line before it prints (WP2.9's pending row, drawn as the
 * preview draws it): on the bars' own week axis, a hollow circle in each slot
 * from the line's first week with "due" over it and the update it is due with
 * under it, a dotted hairline joining them, "left out" in the week the old and
 * the fixed relevance check both ran in, and over the first pair a bracket:
 * "first comparison, with the 25 Oct update". No reading is drawn and no
 * point: a circle here is a date, never a value. Weeks before the first week
 * are left blank. Tenants with no entry (Össur) get no row at all.
 */
export function WeekPendingRow({ weeks, pending, mode, surface }: { weeks: readonly WeekVolume[]; pending: PendingWeekLine; mode: RenderMode; surface: 'inner' | 'tile' }) {
  const kinds = WEEK_LINE_KINDS.map(weekKindLabel)
  const firstComparison = firstComparisonDue({ firstWeek: pending.firstWeek, ageDays: pending.ageDays === 21 ? 21 : 14 })
  const kept = new Set((pending.kept ?? []).map(isoWeekOf))
  // A DATE THAT HAS PASSED IS NOT "DUE" (the deploy-3 review). As at an update
  // after it, a week is kept or, where the kept weeks were read, not kept (a
  // missed capture is a gap for good); and the first comparison's promise is
  // not repeated once its update has come.
  const passed = (d: string): boolean => dueHasPassed(d, pending.passedBefore)
  const stateOf = (w: string, d: string): 'kept' | 'not kept' | 'due' =>
    kept.has(w) ? 'kept' : passed(d) && pending.keptRead ? 'not kept' : 'due'
  const promise = !passed(firstComparison)
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '20px', color: EMAIL.ink2, marginTop: 8 }}>
        Read at the same age: pending.{promise ? <> The first comparison is due with the {dueLabel(firstComparison).replace(/^due /, '')} update, if a check on real data passes.</> : null}
      </div>
    )
  }
  const n = Math.max(1, weeks.length)
  const axis = weeks.map((w) => isoWeekOf(w.week))
  const due = new Map(pending.due.map((d) => [isoWeekOf(d.week), d.date]))
  const slots = axis.map((w, i) => ({ w, i, cx: (i + 0.5) / n, date: due.get(w) ?? null }))
  const dueSlots = slots.filter((s) => s.date != null)
  // The week of 21 Sep: the old and the fixed relevance check both ran in it.
  const leftOut = slots.filter((s) => WEEK_LINE_EXCLUDED.includes(s.w))
  // The bracket spans the first pair: the first week's slot to the next due
  // slot. Only once BOTH weeks are on the axis (the deploy-3 review: on 2 Oct,
  // before the week of 5 Oct joined it, a bracket with one leg ran off the
  // plot); until then the words stand alone at the plot's end.
  const first = dueSlots[0] ?? null
  const bracket = first && dueSlots[1] ? { from: first.cx - 0.3 / n, to: dueSlots[1].cx + 0.3 / n } : null
  // 14px of headroom over the preview's rows, for the bracket's words on two
  // lines where the strip scrolls.
  const TOP = 14
  const H = 160 + TOP
  const circleY = 64
  const base = 112.5
  const date = (d: string): string => dueLabel(d).replace(/^due /, '')
  const firstWords = `first comparison, with the ${date(firstComparison)} update`
  const said = (w: string, d: string): string => {
    const st = stateOf(w, d)
    return st === 'kept' ? `is kept with the ${date(d)} update` : st === 'not kept' ? `was not kept with the ${date(d)} update` : `is due with the ${date(d)} update`
  }
  const plot = (
    <svg width="100%" height={H} role="img" aria-label={`Read at the same age, pending. ${dueSlots.map((s) => `The week of ${weekName(s.w)} ${said(s.w, s.date as string)}.`).join(' ')}${promise ? ` The first comparison is due with the ${date(firstComparison)} update.` : ''}`} className="relative block overflow-visible">
      <g transform={`translate(0 ${TOP})`}>
      {/* One line where the strip is wide; two where it scrolls (under
          640px), so the words fit the strip's first view. */}
      {promise ? <text x={pct(bracket?.to ?? 1)} y={12} textAnchor="end" fontSize={13} fontWeight={600} className="max-sm:hidden" style={{ ...SANS, fill: 'var(--foreground)' }}>{firstWords}</text> : null}
      {promise ? (
        <text x={pct(bracket?.to ?? 1)} y={-4} textAnchor="end" fontSize={12} fontWeight={600} className="sm:hidden" style={{ ...SANS, fill: 'var(--foreground)' }}>
          <tspan x={pct(bracket?.to ?? 1)} dy={0}>first comparison,</tspan>
          <tspan x={pct(bracket?.to ?? 1)} dy={15}>with the {date(firstComparison)} update</tspan>
        </text>
      ) : null}
      {bracket && promise ? (
        <>
          <line x1={pct(bracket.from)} x2={pct(bracket.to)} y1={26} y2={26} style={{ stroke: 'var(--secondary-foreground)', strokeWidth: 1.25 }} />
          <line x1={pct(bracket.from)} x2={pct(bracket.from)} y1={26} y2={34} style={{ stroke: 'var(--secondary-foreground)', strokeWidth: 1.25 }} />
          <line x1={pct(bracket.to)} x2={pct(bracket.to)} y1={26} y2={34} style={{ stroke: 'var(--secondary-foreground)', strokeWidth: 1.25 }} />
        </>
      ) : null}
      {dueSlots.slice(1).map((s, i) => (
        <line key={`j${s.w}`} x1={pct(dueSlots[i].cx)} x2={pct(s.cx)} y1={circleY} y2={circleY} style={{ stroke: 'var(--cat)', strokeWidth: 1.25, strokeDasharray: '1 3' }} />
      ))}
      {dueSlots.map((s) => (
        <g key={s.w}>
          <text x={pct(s.cx)} y={50} textAnchor="middle" fontSize={12} style={{ ...MONO, fill: 'var(--muted-foreground)' }}>{stateOf(s.w, s.date as string)}</text>
          <svg x={pct(s.cx)} y={circleY} width={1} height={1} overflow="visible">
            <circle cx={0} cy={0} r={5} style={{ fill: `var(--${surface})`, stroke: 'var(--secondary-foreground)', strokeWidth: 1.5 }} />
          </svg>
          <text x={pct(s.cx)} y={92} textAnchor="middle" fontSize={13} fontWeight={500} className="@max-[640px]:text-[11px]" style={{ ...MONO, fill: 'var(--foreground)' }}>{date(s.date as string)}</text>
        </g>
      ))}
      {leftOut.map((s) => (
        <text key={`o${s.w}`} x={pct(s.cx)} y={68} textAnchor="middle" fontSize={12} style={{ ...MONO, fill: 'var(--muted-foreground)' }}>left out</text>
      ))}
      <line x1="0" x2="100%" y1={base} y2={base} style={{ stroke: 'var(--border)', strokeWidth: 1 }} />
      {/* The bars' own week axis, again, so each date sits over its week. */}
      {slots.map((sl, i) => {
        const here = isoWeekOf(sl.w)
        const prev = i > 0 ? slots[i - 1].w : null
        const month = prev == null || prev.slice(5, 7) !== here.slice(5, 7) ? weekName(here).split(' ')[1] : null
        return (
          <g key={`a${sl.w}`}>
            <text x={pct(sl.cx)} y={base + 21.5} textAnchor="middle" fontSize={12} style={{ ...MONO, fill: 'var(--secondary-foreground)' }}>{weekName(here).split(' ')[0]}</text>
            {month ? <text x={pct(sl.cx)} y={base + 39.5} textAnchor="middle" fontSize={12} style={{ ...MONO, fill: 'var(--muted-foreground)' }}>{month}</text> : null}
          </g>
        )
      })}
      </g>
    </svg>
  )
  const labels = (
    <span className="absolute left-0 flex flex-col" style={{ top: 44 + TOP }}>
      <span className="text-[15px] font-semibold leading-[20px] text-foreground">Kept points</span>
      <span className="text-[13px] leading-[20px] text-muted-foreground">{kept.size > 0 ? `${kept.size} kept` : 'none yet'}</span>
    </span>
  )
  return (
    <div className="flex flex-col gap-4">
      <WeekBarsHover
        details={[]}
        labels={labels}
        plot={plot}
        height={H}
        minWidth={weekPlotMin(n)}
        labelWidth="wide"
        surface={surface}
        detail="card"
        initial={null}
        interactive={false}
      />
      <p className="m-0 pt-2 text-[15px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]">
        <span className="text-muted-foreground">Each week is kept for</span> {kinds.join(' · ')}.
      </p>
    </div>
  )
}

/** A frame for an inner block: the preview's flat grey inset with its title. */
export function InnerBlock({ title, tag, children, mode }: { title: string; tag?: string; children: ReactNode; mode: RenderMode }) {
  if (mode === 'email') {
    return (
      <div style={{ background: EMAIL.inner, borderRadius: 6, padding: '12px 14px', marginTop: 12 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: EMAIL.ink, marginBottom: 8 }}>{title}{tag ? <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 400, color: EMAIL.muted }}> {tag}</span> : null}</div>
        {children}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-[6px] bg-inner p-4 sm:p-6">
      <div className="flex min-h-7 items-center gap-3">
        <h3 className="m-0 text-[15px] font-semibold leading-6 text-foreground">{title}</h3>
        {tag ? <span className="whitespace-nowrap font-mono text-[12px] text-muted-foreground">{tag}</span> : null}
      </div>
      {children}
    </div>
  )
}
