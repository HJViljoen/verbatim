import { Fragment, type ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import type { CalendarSeries } from '@/lib/charts/calendar'
import { EMAIL, FONT } from '@/lib/email/theme'
import { monthName } from '@/lib/format'

// The quarterly review's shared pieces (Phase 1 WP20).
//
// EIGHT PAGES, THREE MODES, ONE SET OF WORDS. Every page of this artefact is a
// heading, a rule, some rows and a note, and each of those needs an app arm, a
// print arm and a table-markup email arm. Written per page that is eight copies
// of the same ternary; written here it is one, and a change to how a caveat
// reads reaches all eight.
//
// NOTHING HERE STAMPS A `data-copy` MARKER EXCEPT WHERE IT OWNS THE WORDS.
// `Figure` marks itself (the digits are its whole job) and `Level` marks itself
// (rule (b) requires the "of N" inside the level node). A `Note` does not: its
// words are the calling block's, and a block that marked its own prose as
// something else would be claiming a provenance it does not have.

/** A quiet line under a table or a figure — the caveat, the denominator, the
 *  sentence that says what was not recorded. */
export function Note({ children, mode = 'app', tone = 'muted' }: { children: ReactNode; mode?: RenderMode; tone?: 'muted' | 'body' }) {
  if (children == null || children === '') return null
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5, color: tone === 'body' ? EMAIL.ink2 : EMAIL.muted, marginTop: 4 }}>
        {children}
      </div>
    )
  }
  return <p className={`m-0 mt-px text-[10px] leading-[1.38] ${tone === 'body' ? 'text-secondary-foreground' : 'text-muted-foreground'}`}>{children}</p>
}

/** A measured number, with what it is out of beside it. The "of N" is REQUIRED
 *  by copy-contract rule (b) wherever a level word is printed, and is good
 *  manners everywhere else. */
export function Figure({ value, of, mode = 'app' }: { value: ReactNode; of?: ReactNode; mode?: RenderMode }) {
  const body = (
    <>
      <span data-copy="figure">{value}</span>
      {of ? <> <span data-copy="figure">{of}</span></> : null}
    </>
  )
  if (mode === 'email') return <span style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.ink }}>{body}</span>
  return <span className="font-mono text-[12px] tabular-nums">{body}</span>
}

/** A calibrated word with its evidence. Both, or neither (WP10's rule). */
export function Level({ word, of, mode = 'app' }: { word: ReactNode; of: string; mode?: RenderMode }) {
  if (mode === 'email') {
    return <span data-copy="level" style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2 }}>{word} · {of}</span>
  }
  return <span data-copy="level" className="text-[12px] text-secondary-foreground">{word} · {of}</span>
}

/**
 * A STATE and its reason — the same shape as a `Level`, and deliberately not
 * one.
 *
 * "not settled · comparison refused" was marked `data-copy="level"`, which
 * rule (b) requires an "of N" inside. None of `unsettledItems`' four reasons
 * carries one ('comparison refused', 'not enough months behind it', 'band
 * ±3.4', 'too few to compare'), so page 8 broke the contract on every item it
 * printed — invisibly, because all four fixtures return zero items.
 *
 * "Not settled" is not a calibrated level at all: it is the product declining
 * to give a reading, and the number it would rest on is the one that is
 * missing. So the marker comes off rather than a denominator being
 * manufactured for it. The node is still swept by rule (c) like every other
 * piece of unmarked copy — nothing here buys an exemption — and the row's own
 * body beside it carries the evidence ("Fit read 1 of 9 videos in this window,
 * against 2 of 12 before it").
 */
export function State({ word, why, mode = 'app' }: { word: ReactNode; why: string; mode?: RenderMode }) {
  if (mode === 'email') {
    return <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2 }}>{word} · {why}</span>
  }
  return <span className="text-[12px] text-secondary-foreground">{word} · {why}</span>
}

/** One row of a page's list. A row is a label, a body and an optional aside;
 *  an email stacks them, because two things side by side in Outlook is another
 *  table and is never worth one. */
export function Row({ label, children, aside, mode = 'app' }: { label?: ReactNode; children: ReactNode; aside?: ReactNode; mode?: RenderMode }) {
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        {label ? <strong>{label}</strong> : null}
        <div style={{ marginTop: 2 }}>{children}</div>
        {aside ? <div style={{ marginTop: 2 }}>{aside}</div> : null}
      </div>
    )
  }
  return (
    <div className="border-t border-border/70 py-[3px] text-[12px] leading-[1.35]">
      {label ? <span className="font-medium">{label}</span> : null}
      <div>{children}</div>
      {aside ? <div className="flex flex-wrap items-center gap-1.5">{aside}</div> : null}
    </div>
  )
}

/**
 * ONE LINE: a label, its figure and its badge, on a single row.
 *
 * WHY, AND IT IS NOT TASTE. `Row` stacks its three parts, which is right for a
 * row whose body is a sentence and wrong for a row whose body is a figure — and
 * the deck is full of the second kind: the kind mix, the mood shares, the
 * quarter's own readings, a move's control audiences. Stacked, each of those
 * costs about 70px on a slide whose whole body is 561; the artboard draws them
 * at about 30 and fits three sections in a column where the build fitted one.
 * Measured on this artefact: pages 4, 5 and 6 clipped by 631, 434 and 325px
 * before these rows were flattened.
 *
 * It marks nothing. The label is the caller's, the figure marks itself
 * (`FigureCell`) and the badge marks itself (`BlockMovement`).
 */
export function Line({ label, figure, badge, note, mode = 'app' }: {
  label: ReactNode
  figure?: ReactNode
  badge?: ReactNode
  note?: ReactNode
  mode?: RenderMode
}) {
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, padding: '3px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        <strong>{label}</strong>
        {figure ? <> — {figure}</> : null}
        {badge ? <> {badge}</> : null}
        {note ? <div style={{ fontSize: 10.5, color: EMAIL.muted }}>{note}</div> : null}
      </div>
    )
  }
  return (
    <div className="flex flex-col border-t border-border/70 py-[2px]">
      <div className="flex min-w-0 items-baseline justify-between gap-2 text-[12px] leading-[1.3]">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {figure ? <span className="flex-none">{figure}</span> : null}
        {badge ? <span className="flex-none">{badge}</span> : null}
      </div>
      {note ? <span className="text-[10px] text-muted-foreground">{note}</span> : null}
    </div>
  )
}

/**
 * A model's words, read back out of a column, with the call that wrote them
 * named.
 *
 * THE SLOT IS WHAT BUYS THE EXEMPTION. `data-copy="stored"` on its own used to
 * silence rule (c) over a node's text for nothing; the contract now requires a
 * `data-slot` that names a real entry in PROSE_POLICY, so the exemption is
 * checkable against the policy that decided it. A caller passes the slot its
 * words actually came from and never a convenient one.
 */
export function Stored({ slot, children }: { slot: string; children: ReactNode }) {
  return <span data-copy="stored" data-slot={slot}>{children}</span>
}

/** The words the artefact holds itself to, printed on the page rather than
 *  kept in a comment. Italic on screen and on paper; plain in an email, where
 *  italic at 11.5px is unreadable in half the clients. */
export function Rule({ children, mode = 'app' }: { children: ReactNode; mode?: RenderMode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 10 }}>{children}</div>
  }
  return <p className="m-0 mt-1.5 text-[10.5px] italic text-muted-foreground">{children}</p>
}

// ---- the artboard's own furniture (Block D wave 2, E-quarterly) ----------------
//
// THE MOCK IS THE SPEC. Everything below is the markup `QuarterlyReview.dc.html`
// draws, in three modes. It lives here for the reason the rest of this file
// does: eight pages draw the same eyebrow, the same hairline card, the same
// 5-column table row and the same pill, and eight copies of each is eight
// chances for one of them to drift.
//
// THE EMAIL ARM IS STILL A TABLE. `blocks.test.tsx` asserts that the email
// markup carries no class, no CSS variable, no `display:flex` and no
// `display:grid` — so every primitive here collapses to a stacked, inline-styled
// block in that mode rather than laying out the artboard's grid.

/** The deck's block heading: a 2×16px green rule, then mono uppercase at
 *  .08em. `design-system.md` §5 "Deck eyebrow" — every block heading on paper. */
export function Eyebrow({ children, aside, mode = 'app' }: { children: ReactNode; aside?: ReactNode; mode?: RenderMode }) {
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: EMAIL.muted, marginTop: 12, marginBottom: 4 }}>
        {children}{aside ? <> · {aside}</> : null}
      </div>
    )
  }
  return (
    <p className="m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
      <span aria-hidden className="inline-block h-[2px] w-4 flex-none rounded-full bg-primary" />
      <span>{children}</span>
      {aside}
    </p>
  )
}

/** The artboards' hairline document card — `#DCDFE3` on white, radius 6. Never
 *  a shadow: Chrome prints a blurred box-shadow as a grey slab (design-system
 *  §5). */
export function Card({ children, mode = 'app', className }: { children: ReactNode; mode?: RenderMode; className?: string }) {
  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0, marginTop: 8 }}>
        <tbody><tr><td style={{ border: `1px solid ${EMAIL.border}`, borderRadius: 6, padding: '12px 14px' }}>{children}</td></tr></tbody>
      </table>
    )
  }
  return <div className={`flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-tile px-3 py-2 text-[12px] leading-[1.35] ${className ?? ''}`}>{children}</div>
}

/**
 * The artboard's slide columns — `grid-template-columns:7fr 5fr` and friends.
 *
 * `TileColumns` (P0) is the primitive for equal columns inside one tile and is
 * used where the artboard draws equal ones. The deck also draws UNEVEN pairs
 * (7fr 5fr, 8fr 4fr) and a three-column page, which is what `weights` is for:
 * the same grid, the artboard's own ratio, and no second gutter convention.
 *
 * `data-print-cols` is not enough on its own here — that hook only restores an
 * equal `xl:` grid in print — so the template is written on the element and the
 * `.vb-print` arm inherits it.
 */
export function Columns({ weights, gap = 48, children, mode = 'app' }: {
  /** The artboard's own `grid-template-columns` fractions, e.g. `[7, 5]`. */
  weights: readonly number[]
  gap?: number
  children: ReactNode
  mode?: RenderMode
}) {
  // AN EMAIL HAS NO COLUMNS. Two readings side by side in Outlook is another
  // nested table and is never worth one (the rule `Row` already follows).
  if (mode === 'email') return <div>{children}</div>
  return (
    <div
      // `lg:` AND NOT `xl:`, BECAUSE THIS THING IS PRINTED. A print media query
      // is evaluated against the PAGE BOX, and the deck's page is 297mm —
      // 1122.5px — so `xl:` (1280px) never fires on paper and the columns
      // collapse into one stacked flow that then clips. `lg:` (1024px) fires on
      // the sheet and on the share page's 880px column it correctly does not.
      // The template travels as a custom property because it is the artboard's
      // own ratio and there is one per table.
      className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-y-4 text-[12.5px] leading-[1.4] lg:gap-y-0 lg:[grid-template-columns:var(--qr-cols)]"
      style={{ ['--qr-cols' as string]: weights.map((w) => `${w}fr`).join(' '), columnGap: gap }}
    >
      {children}
    </div>
  )
}

/** One column of a `Columns`, as a flex stack — the artboard's inner
 *  `display:flex;flex-direction:column;gap:…`. */
export function Column({ gap = 6, children, mode = 'app', className }: { gap?: number; children: ReactNode; mode?: RenderMode; className?: string }) {
  if (mode === 'email') return <div>{children}</div>
  return <div className={`flex min-w-0 flex-col text-[12.5px] leading-[1.4] ${className ?? ''}`} style={{ gap }}>{children}</div>
}

/**
 * A row of the artboard's dense tables.
 *
 * ONE TEMPLATE PER TABLE, PASSED IN. The artboard writes
 * `grid-template-columns:116px 136px 136px 126px 125px` on the header and on
 * every row, which is what keeps the columns aligned; a table whose rows each
 * decided their own widths is not a table. So the caller states the template
 * once and hands it to the head and to each row.
 *
 * An email stacks: `label` in bold, then each cell on its own line. A grid in
 * Outlook is laid out by Word and there is no version of this that works.
 */
export function TableHead({ template, cells, mode = 'app' }: { template: string; cells: readonly ReactNode[]; mode?: RenderMode }) {
  if (mode === 'email') return null
  return (
    <div
      className="hidden items-end gap-x-2 border-b border-border pb-1.5 lg:grid lg:[grid-template-columns:var(--qr-tab)]"
      style={{ ['--qr-tab' as string]: template }}
    >
      {cells.map((c, i) => (
        <span key={i} className="text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{c}</span>
      ))}
    </div>
  )
}

export function TableRow({ template, cells, mode = 'app' }: { template: string; cells: readonly ReactNode[]; mode?: RenderMode }) {
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        {cells.map((c, i) => (
          <div key={i} style={i === 0 ? { fontWeight: 600 } : { marginTop: 2 }}>{c}</div>
        ))}
      </div>
    )
  }
  return (
    <div
      className="grid grid-cols-1 items-start gap-x-2 gap-y-1 border-b border-border/70 py-[3px] lg:gap-y-0 lg:[grid-template-columns:var(--qr-tab)]"
      style={{ ['--qr-tab' as string]: template }}
    >
      {cells.map((c, i) => (
        <span key={i} className={i === 0 ? 'text-[12.5px] font-medium leading-[1.35]' : 'flex min-w-0 flex-col gap-[3px]'}>{c}</span>
      ))}
    </div>
  )
}

/** The cell that says a column was not drawn — the artboard's "— not compared".
 *  Code's words, so unmarked. */
export function NotDrawn({ children = '— not compared', mode = 'app' }: { children?: ReactNode; mode?: RenderMode }) {
  if (mode === 'email') return <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{children}</span>
  return <span className="text-[12px] text-muted-foreground">{children}</span>
}

export type ChipTone = 'plain' | 'green' | 'amber' | 'muted'

/** The artboard's single-line pill. `rounded-full` is for one line only
 *  (design-system §3.6), so it never wraps. */
export function Chip({ tone = 'plain', children, mode = 'app' }: { tone?: ChipTone; children: ReactNode; mode?: RenderMode }) {
  if (mode === 'email') {
    const bg = tone === 'green' ? EMAIL.greenTint : tone === 'amber' ? 'rgba(230,176,60,.20)' : EMAIL.inner
    const fg = tone === 'green' ? EMAIL.link : tone === 'muted' ? EMAIL.muted : EMAIL.ink2
    return <span style={{ fontFamily: FONT.mono, fontSize: 10.5, lineHeight: 1.3, background: bg, color: fg, padding: '2px 8px', borderRadius: 9999 }}>{children}</span>
  }
  const cls =
    tone === 'green' ? 'bg-positive/15 text-positive'
      : tone === 'amber' ? 'bg-warning/20 text-foreground'
        : tone === 'muted' ? 'bg-inner text-muted-foreground'
          : 'bg-inner text-secondary-foreground'
  return <span className={`inline-flex w-fit items-center whitespace-nowrap rounded-full px-2 py-[2px] font-mono text-[10.5px] leading-[1.3] ${cls}`}>{children}</span>
}

/** A bulleted line with the artboard's 6px green dot. */
export function Bullet({ children, mode = 'app' }: { children: ReactNode; mode?: RenderMode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 12.5, lineHeight: 1.45, color: EMAIL.ink, marginTop: 6 }}>· {children}</div>
  }
  return (
    <p className="m-0 flex items-start gap-2 text-[12px] leading-[1.4]">
      <span aria-hidden className="mt-[7px] inline-block size-[6px] flex-none rounded-full bg-primary" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/**
 * The confidence dots — three, filled to the word the verdicts earned.
 *
 * THE WORD IS STILL THE MEASURE; THE DOTS ARE ITS PICTURE. `confidenceOf`
 * decides the word off the drawn verdicts and the sentence beside it says how
 * many comparisons were answered — the dots add no claim, and a reader who
 * cannot see colour still has both. `aria-hidden` for that reason.
 */
export const CONFIDENCE_DOTS: Record<string, number> = { solid: 3, reasonable: 2, thin: 1 }

export function Dots({ word, mode = 'app' }: { word: string; mode?: RenderMode }) {
  const filled = CONFIDENCE_DOTS[word] ?? 1
  if (mode === 'email') return null
  return (
    <span aria-hidden className="inline-flex items-center gap-1.5 align-middle">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`inline-block size-[9px] rounded-full ${i < filled ? 'bg-primary' : 'bg-border'}`} />
      ))}
    </span>
  )
}

/** The artboard's tinted serif pull quote — the `#F6F7F8` block on page 2. */
export function Pull({ children, mode = 'app' }: { children: ReactNode; mode?: RenderMode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.serif, fontSize: 13, fontStyle: 'italic', lineHeight: 1.45, color: EMAIL.ink2, background: EMAIL.inner, padding: '11px 16px', borderRadius: 6, marginTop: 8 }}>{children}</div>
  }
  return <div className="max-w-[66ch] rounded-md bg-inner px-3 py-2 font-serif text-[12px] italic leading-[1.4] text-secondary-foreground">{children}</div>
}

/**
 * THE LAST READING OF EACH LINE, UNDER THE CHART.
 *
 * `CalendarLine` normally prints a line's name and its last value in the right
 * gutter, at a fixed 11px inside the viewBox. A deck column is narrow by
 * construction and nothing clips that text, so on this artefact it painted
 * past the slide's own edge on page 3 and off the end of its card on page 4 —
 * and on a PDF, which is what this deck is, a label that overflows is simply
 * gone, taking the only place either series was named with it. The deck's
 * charts turn the gutter off (`endLabels={false}`), which also gives the plot
 * the width back, and print the reading here instead: at the block's own type
 * size, in the flow, where it cannot overflow anything.
 *
 * The month is named once, because every line ends on the same axis and a
 * value with no month on a page of three clocks is not a reading.
 */
export function ChartEndings({ series, format, mode = 'app' }: {
  series: readonly CalendarSeries[]
  format: (v: number) => string
  mode?: RenderMode
}) {
  const ends = series
    .map((s) => {
      const last = [...s.points].reverse().find((p) => p.value != null)
      return last == null || last.value == null ? null : { label: s.label, month: last.month, text: format(last.value) }
    })
    .filter((e): e is { label: string; month: string; text: string } => e != null)
  if (ends.length === 0) return null
  return (
    <Note mode={mode}>
      {monthName(ends[ends.length - 1].month)}
      {ends.map((e) => (
        <Fragment key={e.label}>
          {' · '}{e.label} <span data-copy="figure">{e.text}</span>
        </Fragment>
      ))}
    </Note>
  )
}

/** A `<dl>` of label → value, the artboard's method table (design-system §5
 *  "Method page"). Stacked in an email. */
export function DefList({ rows, mode = 'app' }: { rows: readonly { label: ReactNode; value: ReactNode }[]; mode?: RenderMode }) {
  if (mode === 'email') {
    return (
      <div>
        {rows.map((r, i) => (
          <div key={i} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
            <strong>{r.label}</strong>
            <div style={{ marginTop: 2 }}>{r.value}</div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-[5px] lg:grid-cols-[100px_1fr]">
      {rows.map((r, i) => (
        <Fragment key={i}>
          <dt className="pt-[2px] font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">{r.label}</dt>
          <dd className="m-0 text-[11.5px] leading-[1.35]">{r.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
