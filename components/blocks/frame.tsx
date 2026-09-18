import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { cn } from '@/lib/utils'

/**
 * The block primitives (Phase 1 WP10, decision O).
 *
 * Every visual an Overview / Subjects / Voice / Market / Competitive block uses
 * lives in `components/blocks/` and knows how to be three things. The reason is
 * in `lib/blocks/types.ts`: a block renders ONCE and takes the mode, so the
 * weekly report, the monthly report, the share page and the app page are the
 * same reading rather than four chances to answer one question four ways.
 *
 * THE EMAIL ARM IS NOT "SMALLER". It is `<table>` with inline styles, no
 * classes, no CSS variables, no flex and no grid, because Outlook lays out with
 * Word. Every primitive here delegates that arm to `components/email/
 * primitives.tsx`, which has been under that constraint since Stage 3, rather
 * than growing a second set of email markup beside it.
 *
 * COLOURS CROSS THE BOUNDARY THROUGH `tokenHex`. A caller passes one colour —
 * `var(--you)` — and the email arm resolves it to literal hex. An unknown token
 * resolves to the muted grey, so a new token can never paint an email black.
 *
 * MARKERS ARE THE PRIMITIVE'S JOB, NOT THE BLOCK'S. Each of these stamps its
 * own `data-copy` (figure / level / verdict), so a block that uses them keeps
 * the copy contract by construction and only has to mark its own prose
 * (lib/test/copy-contract.ts).
 */

/**
 * A block's chrome: its heading, the one question it answers, its body and a
 * footer.
 *
 * The question is the mock's own device — every artboard prints one under the
 * block's title — and it is the block's contract with the reader, so it is
 * chrome rather than content and lives here.
 */
export function BlockFrame({
  title, question, mode = 'app', footer, footerNote, meta, heading = false, lead, actions, children, className,
}: {
  title: string
  question?: string
  mode?: RenderMode
  /**
   * Set the title as the block's own HEADING rather than as the tile eyebrow —
   * sans 20px/600 at `-0.01em`, in sentence case (Block D wave 2, additive).
   *
   * ONE BLOCK ON A PAGE MAY BE THE PAGE'S SUBJECT, and on the artboards that
   * block prints its name at heading scale while every other tile prints a
   * 10.5px uppercase eyebrow. Subjects' detail pane is the first: it is named
   * for the thing the whole page is about, and at eyebrow scale "DURABILITY"
   * read as one more tile label instead of as the answer to the rail the reader
   * just clicked. Default false, so every existing caller is unchanged.
   */
  heading?: boolean
  /** The block's one sentence, under the heading — serif 17px/500 at
   *  `1.35`/`-0.005em`, the mock's §1 hero lead. Drawn only with `heading`,
   *  which is why the two are tested together. */
  lead?: ReactNode
  /** Controls at the header's right-hand end — the app's buttons. A caller
   *  passing these on a print or email arm is passing a picture of a button,
   *  so it is the caller that branches, not this. */
  actions?: ReactNode
  /** The line along the bottom, LEFT: a link deeper. */
  footer?: ReactNode
  /** The line along the bottom, RIGHT: the artboard's quiet mono note — the
   *  basis, the window, the population ("all-time", "of 1,388 videos").
   *
   *  A SEPARATE SLOT BECAUSE IT IS A SEPARATE THING (Block D wave 1, P0
   *  item 1). `components/shell/tile.tsx` has had this pair since the
   *  redesign; BlockFrame, which is what every Phase 1 block draws itself in,
   *  had one node and a comment claiming it held both. So a block with a basis
   *  to state had two choices: drop it, or put it in the body where it reads
   *  as a finding. Six of Main's footer notes alone do one or the other today
   *  (mock-gap §5). The mono face is the point: a footer note is metadata, and
   *  the eye should skip it until it wants it. */
  footerNote?: ReactNode
  /** The top-right note — "September 2026 · still filling". */
  meta?: ReactNode
  children: ReactNode
  className?: string
}) {
  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0, marginTop: 22 }}>
        <tbody>
          <tr>
            <td style={{ padding: '0 0 6px' }}>
              <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
                <tbody>
                  <tr>
                    <td style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: EMAIL.muted, textTransform: 'uppercase', letterSpacing: '.6px' }}>{title}</td>
                    {meta ? <td align="right" style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.faint }}>{meta}</td> : null}
                  </tr>
                </tbody>
              </table>
              {question ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.muted, marginTop: 3 }}>{question}</div> : null}
            </td>
          </tr>
          <tr><td>{children}</td></tr>
          {footer || footerNote ? (
            <tr>
              <td style={{ paddingTop: 8, borderTop: `1px solid ${EMAIL.hairline}` }}>
                {/* The footer's two halves, as a table row — the email arm
                    cannot put two things at opposite ends of a line any other
                    way (no flex, Outlook lays out with Word). */}
                <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2 }}>{footer}</td>
                      {footerNote ? <td align="right" style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}>{footerNote}</td> : null}
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    )
  }

  // PAPER IS DENSER THAN THE SCREEN, NOT BIGGER (P0 item 1). The print arm
  // used to set the block's title LARGER than the app's — 12px against
  // 10.5px — on a slide that is already zoomed to .902 and whose own section
  // heading is 15px above it. Two headings, the inner one bigger, and the
  // seventeen artboards' printed blocks run at 11px / 11.5px. The deck's own
  // green-ruled eyebrow (components/print/document-deck.tsx `Eyebrow`) is the
  // "block heading on paper" the mock's §5 draws; this is the heading INSIDE
  // such a block, and it gets out of its way.
  const big = mode === 'print'
  return (
    <section className={cn('flex min-w-0 flex-col gap-2.5', className)}>
      <header className={cn('flex gap-2', heading ? 'items-center justify-between gap-4' : 'items-baseline justify-between')}>
        {heading ? (
          <span className="flex min-w-0 items-baseline gap-2.5">
            <h2 className="m-0 whitespace-nowrap text-[20px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
            {meta ? <span className="flex-none whitespace-nowrap font-mono text-[11px] text-muted-foreground">{meta}</span> : null}
          </span>
        ) : (
          <>
            <h2 className={cn('m-0 font-semibold uppercase tracking-[0.06em] text-secondary-foreground', big ? 'text-[11px]' : 'text-[10.5px]')}>{title}</h2>
            {meta ? <span className="flex-none whitespace-nowrap font-mono text-[11px] text-muted-foreground">{meta}</span> : null}
          </>
        )}
        {actions ? <span className="flex flex-none items-center gap-2">{actions}</span> : null}
      </header>
      {question ? <p className={cn('m-0 text-muted-foreground', big ? 'text-[11.5px]' : 'text-[12.5px]')}>{question}</p> : null}
      {heading && lead ? (
        <p className="m-0 font-serif text-[17px] font-medium leading-[1.35] tracking-[-0.005em] text-foreground [text-wrap:pretty]">{lead}</p>
      ) : null}
      {children}
      {footer || footerNote ? (
        <footer className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-2 text-[12px] font-medium text-foreground">
          {/* TRUNCATE, AS `Tile`'s OWN FOOTER HAS SINCE THE REDESIGN. The note
              on the right is `shrink-0`, so with `min-w-0` alone the link on
              the left broke onto four lines the moment a block had a long
              basis to state — "Open the content brief →" set one word per
              line. A footer link is one line or it is not a footer link. */}
          <span className="min-w-0 truncate">{footer}</span>
          {footerNote ? <span className="shrink-0 font-mono text-[11px] font-normal text-muted-foreground">{footerNote}</span> : null}
        </footer>
      ) : null}
    </section>
  )
}

/**
 * A figure over its denominator, stacked — the artboards' table cell.
 *
 * WHY A PRIMITIVE AND NOT A `<td>` EACH BLOCK WRITES. Rule (b) of the copy
 * contract is that a level prints its "of N", and the way it has been broken
 * every time is by putting the two in separate cells and then letting a column
 * fall off a narrow layout. The artboards answer that by stacking them: the
 * figure on top in mono 13/600 at `line-height:1`, the evidence under it in
 * mono 10.5 muted, one pixel apart. Counted across the seventeen artboards on
 * 2026-09-18, and recounted 2026-09-18 after the review disputed where the
 * right-aligned ones are: taking a cell to be a text node that is ONLY the
 * denominator ("of 1,388", "3 of 475", "6 of 14 videos"), 146 of them are
 * drawn, 124 sit left in their column and 22 are set `text-align:right`. The
 * 22 are on TWO artboards, not one — 13 of them the head-to-head table on the
 * Marketing brief and 9 on Competitive's standings — and every other artboard
 * is left throughout. So `align` defaults to LEFT and a numeric column asks
 * for right, and a port of either of those two tables asks for it explicitly.
 * That is the opposite of what the density note in mock-gap/Main.md implies,
 * and on Main specifically the note is simply wrong: Main draws 20 such cells
 * and right-aligns none. The count is here so the next reader does not have to
 * redo it — and, if they do, the measure above is the one to redo.
 *
 * It stamps its own `data-copy` — `figure` on the value, `level` on the pair —
 * exactly as BlockStat does, so a block using it keeps the contract by
 * construction. `of` is optional and omitting it is a DELIBERATE statement:
 * this count is not a share of anything (a number of rivals tracked, a number
 * of months read), so there is no denominator to hide. A share that leaves it
 * off is the score this product does not show, and the block's own render test
 * is what catches that.
 */
export function FigureCell({
  value, of, align = 'left', mode = 'app',
}: {
  value: ReactNode
  /** "of 142". Omitted ONLY for a count that is not a share of anything. */
  of?: ReactNode
  align?: 'left' | 'right'
  mode?: RenderMode
}) {
  const right = align === 'right'
  if (mode === 'email') {
    return (
      <div style={{ textAlign: right ? 'right' : 'left' }}>
        <div data-copy="figure" style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 600, lineHeight: '1', color: EMAIL.ink }}>{value}</div>
        {of ? <div data-copy="level" style={{ fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted, marginTop: 2 }}>{of}</div> : null}
      </div>
    )
  }
  const cell = (
    <span className={cn('flex min-w-0 flex-col gap-px', right && 'items-end text-right')}>
      <span data-copy="figure" className="font-mono text-[13px] font-semibold leading-none tabular-nums">{value}</span>
      {of ? <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{of}</span> : null}
    </span>
  )
  // The "of N" carries the level, so the PAIR is the level node: rule (b)
  // reads a level node's whole text and would fail on a bare denominator.
  return of ? <span data-copy="level" className={cn('flex min-w-0', right && 'justify-end')}>{cell}</span> : cell
}

/**
 * The block's honest empty state — one line, the block's own words.
 *
 * `Block.emptyState(data)` computes the sentence without rendering; this is
 * what prints it. A tile keeps its size, a slide keeps its box, an email keeps
 * its section: the emptiness is information, not a hole.
 */
export function BlockEmpty({ children, mode = 'app' }: { children: ReactNode; mode?: RenderMode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{children}</div>
  }
  return <p className="m-0 text-[12px] text-muted-foreground">{children}</p>
}
