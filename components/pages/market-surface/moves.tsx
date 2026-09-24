import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { CalendarLine, type CalendarSeries } from '@/components/charts/calendar-line'
import { MovementBadge } from '@/components/delta-badge'
import { TileBlock } from '@/components/shell/tile'
import { fmtInt, fmtPct, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import { audiencePhrase } from '@/lib/reading/afterwards'
import type { MoveReading, MoveSeries } from '@/lib/reading/moves'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { MarketSurfaceData } from '@/lib/pages/market-surface'

// MK4 · Your moves (design §3 MK4; ported to the artboard, Block D wave 2).
//
// WAVE 1 BUILT THE READING AND NOTHING DREW IT. `MovesBlock.readings` is one
// `MoveReading` per move: the client's own months, every untouched audience
// beside it as a control, the one banded verdict a move earns, and `chartNote`
// — which says whether a line may be DRAWN at all. This block is what the
// artboard's chart, legend, band line and verdict sentence become.
//
// A CHART IS A DIRECTION CLAIM TOO (AGENTS.md, D3). `moveChartNote` refuses a
// line under three readings in one regime and names the months instead, in the
// same words `monthlyLineLabel` uses on OV2 — one picture, one threshold. Where
// there are three, the line is `CalendarLine`: a DATED axis, so a month with no
// reading keeps its slot instead of the line closing the hole up and misdating
// everything after it.
//
// THE CONTROL SITS BESIDE, NEVER SUBTRACTED (D8). `MOVE_PROMISE` is "we never
// claim you caused it", and a synthetic control differenced into one figure is
// the strongest causal claim a page can make. `readMove` keeps them apart —
// `verdict` is your side, `control` is every audience the move did not touch —
// and so does this: two rows a reader compares, never one number we compared
// for them.
//
// THE ARTBOARD'S "Up 5 points since 12 August" IS NOT PRINTED. It is a WINDOW
// read dated by a declaration rather than by a month boundary, so under
// AGENTS.md it comes from `window_denominators` / `window_theme_readings` (M3)
// and never from a subtraction of month levels. What prints instead is the
// comparison `readMove` actually drew: the newest readable month after the
// declaration against the newest before it, both sides with their k and n, and
// the band beside the word or neither (D2).
//
// THE ARTBOARD'S FOOTER LINK IS NOT BUILT EITHER. "The 10 videos behind your
// figure →" needs `month_evidence_refs` (M3), and "themes you are not working
// on: +0.4 per 100 videos" has no field and no function anywhere. The footer
// carries what the reading itself knows — when the move was declared, and how
// many complete months it has been read against.

/** Whose line it is, in the product's colours: yours, a rival's, the rest. */
function seriesColour(audience: string): string {
  if (audience.startsWith('competitor:')) return 'var(--comp)'
  if (audience === 'industry-other') return 'var(--muted-foreground)'
  return 'var(--you)'
}

/** The last month of a series that carried a reading — what a legend's
 *  denominator is taken from, so "10 of 84" names a month a reader can find. */
function lastRead(series: MoveSeries): { month: string; k: number; n: number } | null {
  const read = series.points.filter((p) => p.k != null && p.n != null && p.n > 0)
  const p = read[read.length - 1]
  return p ? { month: p.month, k: p.k as number, n: p.n as number } : null
}

function toCalendar(series: MoveSeries): CalendarSeries {
  const last = lastRead(series)
  return {
    label: series.label,
    color: seriesColour(series.audience),
    endNote: last ? `of ${fmtInt(last.n)}` : undefined,
    points: series.points.map((p) => ({
      month: p.month,
      value: p.pct,
      // A MONTH WITH NO ROW IS HOLLOW, never a zero: "nobody said anything"
      // and "we read nothing" are two facts and only one of them is a point.
      state: p.k != null && p.n != null && p.n > 0 ? ('read' as const) : ('hollow' as const),
      k: p.k,
      n: p.n,
    })),
  }
}

/** The artboard's legend: one row per series, each with its own denominator. */
function Legend({ series, mode }: { series: readonly MoveSeries[]; mode: RenderMode }) {
  const email = mode === 'email'
  const rows = series.map((s) => {
    const last = lastRead(s)
    return {
      key: s.audience,
      colour: seriesColour(s.audience),
      text: last ? `${s.label} · ${fmtInt(last.k)} of ${fmtInt(last.n)} videos` : `${s.label} · no month read`,
      level: last != null,
    }
  })
  if (email) {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 4 }}>
        {rows.map((r) => <span key={r.key} data-copy={r.level ? 'level' : undefined} style={{ marginRight: 12 }}>{r.text}</span>)}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1">
      {rows.map((r) => (
        <span key={r.key} data-copy={r.level ? 'level' : undefined} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: r.colour }} />
          {r.text}
        </span>
      ))}
    </div>
  )
}

/** A move's one comparison, or a control's — both sides with their counts, the
 *  band beside the word or neither. */
function Side({ verdict, mode, control = false }: { verdict: Verdict; mode: RenderMode; control?: boolean }) {
  const v = verdict
  const email = mode === 'email'
  const pct = (k: number, n: number) => (n > 0 ? fmtPct((k / n) * 100, 0) : '—')
  // `whitespace-nowrap`: a level and its "of N" are one unbreakable unit —
  // this sentence is long enough to wrap in a 7-column tile and rule (b) is
  // about what the reader SEES, not about what the markup holds.
  const mono = email ? undefined : 'whitespace-nowrap font-mono text-[11.5px] tabular-nums text-foreground'
  const monoStyle = email ? { fontFamily: FONT.mono } : undefined
  const body = (
    <>
      {control ? 'Beside it, ' : ''}{audiencePhrase(v.audience)}{' '}
      <span data-copy="level" className={mono} style={monoStyle}>
        {fmtInt(v.value.k)} of {fmtInt(v.value.n)} videos ({pct(v.value.k, v.value.n)})
      </span>
      {v.baseline ? (
        <>
          {' '}against{' '}
          <span data-copy="level" className={mono} style={monoStyle}>
            {fmtInt(v.baseline.k)} of {fmtInt(v.baseline.n)} ({pct(v.baseline.k, v.baseline.n)})
          </span>{' '}before it was declared
        </>
      ) : null}
    </>
  )
  if (email) {
    return <div data-copy="verdict" style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, padding: '2px 0' }}>{body}</div>
  }
  return (
    <span data-copy="verdict" className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 text-[12px] text-secondary-foreground">{body}</span>
      <MovementBadge verdict={v} unit="pts" good="neutral" bandTip={mode === 'app'} />
    </span>
  )
}

function Move({ reading, index, mode }: { reading: MoveReading; index: number; mode: RenderMode }) {
  const email = mode === 'email'
  const r = reading
  const meta = `declared ${shortDate(r.declaredAt)} · ${r.on}`
  const heading = `Move ${fmtInt(index)} — ${r.title}`

  const body = (
    <>
      {!email && r.chartNote == null && r.months.length > 0 ? (
        <CalendarLine
          axis={r.months}
          series={r.series.map(toCalendar)}
          format={(v) => fmtPct(v, 0)}
          legend={false}
          // THE VIEWBOX IS THE BOX IT IS DRAWN IN, near enough. `CalendarLine`
          // scales its 880-wide drawing uniformly into whatever container it
          // gets — the tile is seven of twelve columns, about 630px at 1440 —
          // so the default was rendering every 11px label at 7px and every
          // 13px label gap at 8px: a plot of ~95 CSS px for a 0–30% range with
          // the two closest series' end labels stacked on top of each other.
          // Drawn at the size it is shown at, the chart's own spacing holds.
          width={630}
          height={200}
          padL={44}
          // The end labels live in the right-hand pad and the tile clips what
          // runs past it: at 120 "The category 11% of 1,388" lost its
          // denominator to the tile's edge, which is the one thing a level may
          // not lose.
          padR={158}
          // THE DECLARATION IS ON THE CHART. The verdict under it says "before
          // it was declared" and the line carried no mark for where "before"
          // ended; `MoveReading.declaredAt` was in hand and printed two lines
          // above in the meta. `CalendarRule.kind` is the PEN, not the
          // taxonomy — the four kinds are the config events the chart was
          // built for and a fifth cannot be added from here (components/charts
          // is the subjects package's), so the declaration borrows the dashed
          // grey rule and says what it is in its own label and tick.
          rules={[{ month: r.declaredAt.slice(0, 7) + '-01', label: `Move declared — ${r.title}`, kind: 'tracking_change', at: r.declaredAt }]}
          label={`${r.title}, month by month`}
          id={`move-${r.moveId}`}
        />
      ) : null}
      {r.chartNote != null ? (
        <span
          className={email ? undefined : 'font-mono text-[11px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted } : undefined}
        >
          {/* A LINE NEEDS THREE READINGS IN ONE REGIME, and this one has fewer.
              The months it does have are named rather than drawn. */}
          {r.chartNote} — too few readings to draw a line
        </span>
      ) : null}

      {r.series.length > 0 ? <Legend series={r.series} mode={mode} /> : null}

      {r.verdict ? (
        email ? (
          <div style={{ marginTop: 4 }}>
            <Side verdict={r.verdict} mode={mode} />
            {r.control.map((c) => <Side key={c.audience} verdict={c} mode={mode} control />)}
          </div>
        ) : (
          <TileBlock className="flex min-w-0 flex-col gap-1">
            <Side verdict={r.verdict} mode={mode} />
            {r.control.map((c) => <Side key={c.audience} verdict={c} mode={mode} control />)}
          </TileBlock>
        )
      ) : (
        <span
          className={email ? undefined : 'text-[12px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted } : undefined}
        >
          {r.unread}
        </span>
      )}
    </>
  )

  if (email) {
    return (
      <div style={{ padding: '6px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: EMAIL.ink2 }}>{heading}</div>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{meta}</div>
        {body}
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{r.line}</div>
      </div>
    )
  }
  return (
    <section className="flex min-w-0 flex-col gap-2.5 border-t border-border/70 pt-2.5 first:border-t-0 first:pt-0">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{heading}</h3>
        <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground">{meta}</span>
      </header>
      {body}
      <span className="font-mono text-[11px] text-muted-foreground">{r.line}</span>
    </section>
  )
}

export const marketMoves: Block<MarketSurfaceData> = {
  key: 'market.moves',
  title: 'Your moves',
  question: 'What have we said we are doing, and is it working?',

  render(data, mode = 'app', ctx) {
    const m = data.moves
    const email = mode === 'email'
    const empty = marketMoves.emptyState(data)
    const href = `${ctx.appUrl}/dashboard/subjects`
    // A READING PER MOVE WHERE THERE IS ONE, and the dated line for a move the
    // reading layer holds nothing for yet — two states of one move, and the
    // block prints whichever it has rather than one sentence for both.
    // `?? []` for a snapshot frozen before the field — see
    // components/pages/overview/moves.tsx for the reason.
    const readings = m.readings ?? []
    const scored = new Set(readings.map((r) => r.moveId))
    const unscored = m.rows.filter((row) => !scored.has(row.id))

    return (
      <BlockFrame
        title={marketMoves.title}
        question={marketMoves.question}
        mode={mode}
        meta={m.rows.length > 0 ? `${fmtInt(m.rows.length)} declared · ${m.card ? '1 card waiting' : 'no card'}` : undefined}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Subjects →</a>
          : <Link href={href} className="hover:underline">Open Subjects →</Link>}
        footerNote={readings.length > 0 ? `${fmtInt(readings.length)} read against a month` : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {readings.length > 0 ? (
          <div className={email ? undefined : 'flex min-w-0 flex-col gap-2.5'}>
            {readings.map((r, i) => <Move key={r.moveId} reading={r} index={i + 1} mode={mode} />)}
          </div>
        ) : null}
        {unscored.length > 0 ? (
          <div className={email ? undefined : 'flex flex-col gap-1'}>
            {unscored.map((row) =>
              email
                ? <div key={row.id} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '2px 0' }}>{row.line}</div>
                : <p key={row.id} className="m-0 text-[12.5px]">{row.line}</p>,
            )}
          </div>
        ) : null}
        {/* No MOVES_UNLOCK footer: each unscored row already says which
            reading its first comparison lands with, and the rule is written
            once in Settings › How to read (copy de-clutter B66). */}
      </BlockFrame>
    )
  },

  // NO FIGURES. A move's numbers live inside its own `Verdict`s — both sides,
  // the change and the band — which is where a comparison's figures belong. A
  // count of moves is a count of things the client typed.
  figures(): FigureTable {
    return {}
  },

  // THE MOVE'S OWN COMPARISON AND EVERY CONTROL BESIDE IT. Both are drawn
  // through `MovementBadge`, so both are declared — a control is a reading of
  // an audience the move did not touch, and a brief folding this block has to
  // know it was stated beside the move and never subtracted from it.
  verdicts(data): Verdict[] {
    return (data.moves.readings ?? []).flatMap((r) => [...(r.verdict ? [r.verdict] : []), ...r.control])
  },

  emptyState(data) {
    return data.moves.empty
  },
}
