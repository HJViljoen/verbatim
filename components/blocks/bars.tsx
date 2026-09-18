import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { Bar, RankedRow, text as emailText } from '@/components/email/primitives'
import { RankedBar } from '@/components/charts/ranked-bar'
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
  segments, of, mode = 'app', legend = 'percent',
}: {
  segments: readonly BlockSegment[]
  of: string
  mode?: RenderMode
  /**
   * What the legend prints beside each label (Block D wave 2, design review
   * F14).
   *
   * A PERCENTAGE OF A SMALL SET IS NOISE. The default is the share, which is
   * right for a partition of hundreds of videos — "Positive 62%". This week's
   * reply queue is a partition of SIX picked comments, where "Buying signals
   * 50% · Questions 33% · Objections 17%" reads as a score and loses the counts
   * the artboard prints ("questions 7 · complaints 3 · wanting to buy 2"). A
   * caller whose set is small asks for the counts instead; the bar is the same
   * bar either way.
   */
  legend?: 'percent' | 'count'
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
              {s.label} <span data-copy="figure">{legend === 'count' ? s.count : `${s.pct}%`}</span>
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
            {s.label} <span data-copy="figure">{legend === 'count' ? s.count : `${s.pct}%`}</span>
          </span>
        ))}
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
  rows, mode = 'app', countWidth, barWidth,
}: {
  rows: readonly BlockRankedRow[]
  mode?: RenderMode
  /** Width of the app arm's count cell, in px (`RankedBar.countWidth`). The
   *  email arm needs none: its count is a table cell that sizes itself. */
  countWidth?: number
  /** Width of the app arm's bar, in px. The default 110 is right in a
   *  full-width tile and eats the label in a span-5 one, where the artboard's
   *  own bar is 84. */
  barWidth?: number
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
          countWidth={countWidth}
          barWidth={barWidth}
          dot
        />
      ))}
    </div>
  )
}

/** The email palette, re-exported so a block that needs one literal colour for
 *  a table cell does not reach past this layer for it. */
export { EMAIL, FONT }
