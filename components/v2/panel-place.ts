import type { CSSProperties } from 'react'

/**
 * WHERE AN OPEN PANEL SITS IN ITS GRID (depth v2, T9: the phone pass).
 *
 * A v2 page lays its cards out in a grid whose columns change with the width:
 * three groups across at 1280 and two at 768 on Voices, the hero and two
 * cards at 6 · 3 · 3 on Market, one column on a phone. The open panel
 * (`InPlacePanel`) has to sit directly under the ROW that holds the clicked
 * card at every one of those widths, with its notch over the card. Drawing it
 * after the whole grid put it under the last card on a phone, three cards
 * away from the one that opened it.
 *
 * ONE ELEMENT, PLACED BY CSS `order`. Every card in the grid takes the order
 * `2 × its index` (`panelItemOrder`). The panel is ONE more child of the same
 * grid, spanning every column (`PanelSlot`), whose order is `2 × the last
 * index in the clicked card's row + 1`, worked out here for each breakpoint.
 * So it lands after that row and before the next, wherever the row breaks,
 * and its content is in the DOM once (one id, one set of quotes, one Close).
 * The page puts the slot right after the clicked card in the markup where it
 * can (a screen reader then meets the panel after the card that opened it,
 * which is also the phone's visual order).
 *
 * THE MODEL. Per breakpoint, each card's width in columns of `of`, in the
 * document's order; a row breaks where the next card no longer fits (CSS
 * grid's own sparse auto-placement). A width of 0 stacks a card under the one
 * before it in the same cell (Content's Worth a reply over Your posts, one
 * column of the row). The notch points at the middle of the clicked card's
 * cell: `(start + width / 2) / of`. Gaps are left out of the arithmetic; at
 * 20px against a card's width the difference is a few pixels.
 *
 * THE BREAKPOINTS are the ones the v2 pages' grids use: Tailwind's `sm`, `md`,
 * `lg` and `xl`, and Your moves' `min-[1180px]` (`w1180`, the board's own
 * breakpoint). A breakpoint left out takes the layout of the one below it.
 */

export const PANEL_BREAKPOINTS = ['base', 'sm', 'md', 'lg', 'w1180', 'xl'] as const
export type PanelBreakpoint = (typeof PANEL_BREAKPOINTS)[number]

/** One breakpoint's row model: each card's width in columns of `of`, in
 *  document order (0: stacked under the card before it, in its cell). */
export interface PanelRow {
  spans: readonly number[]
  of: number
}

export type PanelLayout = { base: PanelRow } & Partial<Record<Exclude<PanelBreakpoint, 'base'>, PanelRow>>

/** Per breakpoint, a value (an order, or the notch's place from 0 to 1). */
export type PerBreakpoint = Record<PanelBreakpoint, number>

export interface PanelPlacement {
  /** The panel's CSS order at each breakpoint. */
  order: PerBreakpoint
  /** Where the notch points at each breakpoint, 0 to 1 of the panel's width. */
  notch: PerBreakpoint
}

/** A grid of `n` equal columns holding `count` cards. */
export function equalColumns(n: number, count: number): PanelRow {
  return { spans: Array.from({ length: Math.max(0, count) }, () => 1), of: Math.max(1, n) }
}

/** Each card's row, first column and width under one row model. */
export function packRow(row: PanelRow): { row: number; start: number; span: number }[] {
  const of = Math.max(1, row.of)
  const out: { row: number; start: number; span: number }[] = []
  let r = 0
  let col = 0
  for (let i = 0; i < row.spans.length; i++) {
    const raw = row.spans[i]
    const prev = out[i - 1]
    if (raw === 0 && prev) {
      out.push({ ...prev })
      continue
    }
    const span = Math.min(of, Math.max(1, Math.round(Number.isFinite(raw) ? raw : of)))
    if (col > 0 && col + span > of) {
      r += 1
      col = 0
    }
    out.push({ row: r, start: col, span })
    col += span
    if (col >= of) {
      r += 1
      col = 0
    }
  }
  // A card that filled its row moved the counter on; a stacked card after it
  // keeps the row it copied, so rows are read from `out`, not from `r`.
  return out
}

/** The panel's order and notch for the card at `index`, under one row model.
 *  An index past the model's cards is treated as a full-width card after
 *  them (the panel then follows it). */
function placeIn(index: number, row: PanelRow): { order: number; notch: number } {
  const cells = packRow(row)
  const at = cells[index]
  if (!at) return { order: 2 * Math.max(0, index) + 1, notch: 0.5 }
  let end = index
  for (let i = index + 1; i < cells.length; i++) {
    if (cells[i].row !== at.row) break
    end = i
  }
  const of = Math.max(1, row.of)
  return { order: 2 * end + 1, notch: (at.start + at.span / 2) / of }
}

/** Where the panel opened from the card at `index` sits, at every breakpoint. */
export function panelPlacement(index: number, layout: PanelLayout): PanelPlacement {
  const order = {} as PerBreakpoint
  const notch = {} as PerBreakpoint
  let row: PanelRow = layout.base
  for (const bp of PANEL_BREAKPOINTS) {
    row = (bp === 'base' ? layout.base : layout[bp]) ?? row
    const p = placeIn(index, row)
    order[bp] = p.order
    notch[bp] = Math.round(p.notch * 10000) / 10000
  }
  return { order, notch }
}

/** The order a grid's card at `index` takes, so a panel can be placed among
 *  the cards (`style={panelItemOrder(i)}`). */
export function panelItemOrder(index: number): CSSProperties {
  return { order: 2 * Math.max(0, index) }
}

/** The slot's custom properties: one order per breakpoint, which the slot's
 *  fixed classes read (`PANEL_SLOT_CLASS`). */
export function panelSlotStyle(order: PerBreakpoint): CSSProperties {
  const style: Record<string, string> = {}
  for (const bp of PANEL_BREAKPOINTS) style[`--panel-o-${bp}`] = String(order[bp])
  return style as CSSProperties
}

/** The notch's custom properties: one place per breakpoint, as percentages,
 *  which the notch's fixed classes read (`InPlacePanel`). */
export function notchStyle(notch: PerBreakpoint): CSSProperties {
  const style: Record<string, string> = {}
  for (const bp of PANEL_BREAKPOINTS) style[`--notch-${bp}`] = notchPct(notch[bp])
  return style as CSSProperties
}

/** A notch's place, 0 to 1 (clamped), as the percentage the notch is drawn at. */
export function notchPct(at: number): string {
  const v = Math.min(1, Math.max(0, Number.isFinite(at) ? at : 0.5))
  return `${Math.round(v * 10000) / 100}%`
}

/** True where every breakpoint points the notch at the same place, so the
 *  panel can draw it as a single position. */
export function sameEverywhere(notch: PerBreakpoint): boolean {
  return PANEL_BREAKPOINTS.every((bp) => notch[bp] === notch.base)
}

/**
 * The slot's classes: it spans the grid's every column, and `panel-slot`
 * (app/globals.css) takes the order its custom property names at each
 * breakpoint (`panelSlotStyle`). The breakpoints are plain CSS there, not
 * Tailwind variants, because Tailwind sorts an arbitrary `min-[1180px]:`
 * before the named breakpoints and `md:` would win over it at 1180 to 1279.
 */
export const PANEL_SLOT_CLASS = 'panel-slot col-span-full min-w-0'

/** The notch's class: `--notch` is the breakpoint's own place (`notchStyle`,
 *  the rules in app/globals.css), which the notch's `left` reads. */
export const NOTCH_VAR_CLASS = 'panel-notch'
