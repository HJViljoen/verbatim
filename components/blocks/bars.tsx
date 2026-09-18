import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { Bar, RankedRow, text as emailText } from '@/components/email/primitives'
import { RankedBar } from '@/components/charts/ranked-bar'
import { fmtPct } from '@/lib/format'
import { EMAIL, FONT, tokenHex } from '@/lib/email/theme'

// The two bars, in three modes (Phase 1 WP10). See components/blocks/frame.tsx.

export interface BlockSegment {
  label: string
  count: number
  /** 0–100. */
  pct: number
  /** The entity's colour — `var(--you)`, `var(--comp)` — resolved to hex for
   *  the email by `tokenHex`. */
  color: string
}

/**
 * A proportional bar and its legend.
 *
 * IDENTITY IS NEVER COLOUR-ALONE (MASTER.md), so the legend is not optional and
 * not a prop: a bar without its dot legend is four coloured stripes. The legend
 * carries each segment's percentage, marked as a figure.
 *
 * `of` names the unit the counts are counts OF, so the tooltip reads "Positive
 * · 261 videos (62%)" rather than "Positive · 261".
 */
export function BlockProportion({
  segments, of, mode = 'app',
}: {
  segments: readonly BlockSegment[]
  of: string
  mode?: RenderMode
}) {
  const shown = segments.filter((s) => s.pct > 0)
  if (!shown.length) return null

  if (mode === 'email') {
    return (
      <div>
        <Bar segments={shown.map((s) => ({ pct: s.pct, color: tokenHex(s.color), label: `${s.label} · ${s.count} ${of} (${s.pct}%)` }))} height={10} />
        <div style={{ marginTop: 8 }}>
          {shown.map((s) => (
            <span key={s.label} style={{ ...emailText.small, marginRight: 12, whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9999, background: tokenHex(s.color), marginRight: 6 }} />
              {s.label} <span data-copy="figure">{s.pct}%</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex h-2.5 w-full shrink-0 gap-0.5 overflow-hidden rounded-full">
        {shown.map((s) => (
          <span
            key={s.label}
            className="first:rounded-l-full last:rounded-r-full"
            style={{ width: `${Math.max(2, s.pct)}%`, background: s.color }}
            title={`${s.label} · ${s.count} ${of} (${s.pct}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {shown.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label} <span data-copy="figure">{s.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * ONE share, drawn against a stated axis, with a rule where it stood before.
 *
 * The artboards draw this under Voice's big figure: a 10px bar, the month's
 * share filling part of it, and a 2px rule at the previous month's. It is the
 * one bar in the product that is not a partition — `BlockProportion` divides a
 * whole into its parts; this places a single reading on a scale.
 *
 * THE SCALE IS PRINTED, WHICH IS THE WHOLE ARGUMENT FOR THE COMPONENT. The
 * artboard fills 62.7% of the bar for a reading of 9.4% and rules at 45.3% for
 * one of 6.8% — a silent 15% axis, which is a bar a reader cannot weigh: at a
 * glance it says two thirds. So `max` is required, it is named at the
 * right-hand end of the axis, and the caller derives it from the readings
 * rather than from taste (`reachAxisMax`). Drawn as a true share of 100 the
 * same reading is a sliver nobody can compare with anything; drawn against a
 * silent maximum it is six times its own size. Printed, it is a measurement.
 *
 * The rule carries its own words, because a rule with no label is a line.
 */
export function BlockReach({
  pct, max, rule = null, ruleLabel, axisLabel, mode = 'app',
}: {
  /** The reading, 0–100. */
  pct: number
  /** The top of the axis, 0–100, and it is printed. */
  max: number
  /** Where the previous reading stood, 0–100, or null for no rule. */
  rule?: number | null
  /** "rule at Aug 6.8% · Sep 9.4%" — code's own figures. */
  ruleLabel?: ReactNode
  /** "share of category videos". */
  axisLabel: string
  mode?: RenderMode
}) {
  const top = Math.max(max, pct, rule ?? 0)
  if (top <= 0) return null
  const width = Math.max(1, Math.min(100, (pct / top) * 100))
  const at = rule == null ? null : Math.max(0, Math.min(100, (rule / top) * 100))
  const scale = `${axisLabel}, axis to ${fmtPct(top, 0)}`

  if (mode === 'email') {
    return (
      <div>
        <Bar segments={[{ pct: width, color: tokenHex('var(--cat)'), label: scale }]} height={10} />
        <div style={{ ...emailText.small, marginTop: 4 }}>
          <span data-copy="figure">{ruleLabel ? <>{ruleLabel} · </> : null}{scale}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="relative w-full">
        <div className="flex h-2.5 w-full shrink-0 overflow-hidden rounded-full bg-inner">
          <span className="rounded-full" style={{ width: `${width}%`, background: 'var(--cat)' }} />
        </div>
        {/* THE RULE IS A SIBLING OF THE BAR, not a child: the bar clips to its
            own rounded corners, and a rule inside it loses the 3px it stands
            proud above and below — which is the only thing that makes it read
            as a rule rather than as a seam in the fill. */}
        {at != null ? (
          <span className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-foreground" style={{ left: `${at}%` }} aria-hidden />
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-2 font-mono text-[10px] tabular-nums text-muted-foreground">
        <span data-copy="figure">0</span>
        {ruleLabel ? <span data-copy="figure">{ruleLabel}</span> : <span />}
        <span data-copy="figure">{scale}</span>
      </div>
    </div>
  )
}

export interface BlockRankedRow {
  label: ReactNode
  /** 0–100, relative to the list's maximum. */
  pct: number
  color: string
  count?: ReactNode
  badge?: ReactNode
  href?: string
}

/**
 * A ranked list. Bar colour follows the ENTITY, never the rank
 * (components/charts/ranked-bar.tsx's own rule, kept).
 *
 * The email arm drops `href` — a whole row is not a link in an email client
 * that renders a table cell — and keeps the count and the badge, which are what
 * the row is for.
 */
export function BlockRanked({
  rows, mode = 'app',
}: {
  rows: readonly BlockRankedRow[]
  mode?: RenderMode
}) {
  if (!rows.length) return null

  if (mode === 'email') {
    return (
      <div>
        {rows.map((r, i) => (
          <RankedRow
            key={i}
            label={r.label}
            pct={r.pct}
            color={tokenHex(r.color)}
            count={r.count}
            badge={r.badge}
            dot
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {rows.map((r, i) => (
        <RankedBar
          key={i}
          label={r.label}
          pct={r.pct}
          color={r.color}
          count={r.count != null ? <span data-copy="figure">{r.count}</span> : undefined}
          badge={r.badge}
          href={r.href}
          dot
        />
      ))}
    </div>
  )
}

/** The email palette, re-exported so a block that needs one literal colour for
 *  a table cell does not reach past this layer for it. */
export { EMAIL, FONT }
