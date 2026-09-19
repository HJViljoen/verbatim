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
  title, question, mode = 'app', footer, footerNote, meta, heading = false, header = true, lead, actions,
  truncateFooter = false, children, className, accent = false,
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
  /**
   * Draw the block's own heading row at all (Block D wave 2, E-content —
   * ADDITIVE, default unchanged).
   *
   * NAMED `header`, NOT `heading` (merge, Block D wave 2). E-subjects landed a
   * `heading` in the same wave and it is a different question — the SCALE the
   * title is set at — so two booleans with one name and opposite defaults
   * would have been one silent behaviour change per call site.
   *
   * A BORROWED BLOCK ON A BRIEF ALREADY HAS A HEADING: the slide's `<h1>` is
   * the section's title (components/print/slide.tsx) and the block's own
   * `<h2>` prints the same idea again, in caps, one line under it — two
   * headings for one section, which the artboards draw once. A block that
   * knows it is inside a titled sheet passes `header={false}` and keeps the
   * footer and the footer note, which are the block's and not the section's.
   * Nothing else changes: the default is true and every existing call site is
   * untouched.
   *
   * THE META GOES WITH THE HEADING (E-content design review 7, code review 9).
   * It was re-emitted as a right-aligned mono paragraph, which put "September"
   * two lines under a slide header already reading "Content brief · September
   * 2026", "September · still filling" under another and "64 in the ledger ·
   * oldest first" under a third — none of them in the artboard, each landing in
   * the dead space between the framing line and the first eyebrow. `meta` is
   * the right-hand half of the heading ROW; a slide that prints no heading
   * prints no heading row, and a block with something to say about its own
   * basis says it in the body or in the footer note, where a reader can see
   * what it is about.
   */
  header?: boolean
  /** The line along the bottom, LEFT: a link deeper. */
  footer?: ReactNode
  /**
   * Keep that link on ONE LINE, clipping it rather than wrapping it.
   *
   * OPT-IN, AND IT HAS TO BE (fix pass). This landed as a change to the
   * DEFAULT, which silently clipped the footer link of all 56 `footer={…}`
   * call sites across Overview, Voice, Market, Competitive, Week and the
   * documents — to solve a problem that is one page's: on a 240px rail, with a
   * basis in the note beside it, "Open the content brief →" set one word per
   * line. The wave's rule is that a package needing a change to a P0 primitive
   * adds an optional prop and never edits a default; and a footer that has the
   * whole tile's width is better off wrapping than clipped.
   */
  truncateFooter?: boolean
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
  /**
   * The artboards' RULED EYEBROW (Block D wave 2, E-monthly — ADDITIVE, and
   * the default is off, so every existing caller is byte-identical).
   *
   * Every one of the seventeen artboards heads a section the same way: a
   * 2 x 16px green rule, then the title in MONO 11 uppercase at `.08em`. The
   * built frame sets it in sans 12/600 at `.6px` with no mark, which is why
   * the built pages read softer and less instrument-like than the artboards
   * do — mock-gap's own diagnosis for the MonthlyReport, where it is the
   * largest remaining chrome difference once the tables are ported.
   *
   * IT IS A FLAG AND NOT A COLOUR. The mark is the product's one accent and a
   * caller may not choose another: a second green would be a second meaning.
   *
   * Left off by default deliberately. Turning it on for every block in the
   * product is a change to seventeen surfaces at once and belongs to whoever
   * merges this wave, not to the one package that needed it first.
   */
  accent?: boolean
}) {
  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0, marginTop: 22 }}>
        <tbody>
          <tr>
            {/* A RULE ABOVE THE HEADER, NOT BELOW THE BODY (Block D wave 3,
                SH11). The block's only hairline was on the FOOTER row, inside
                the block, and sections were separated by `marginTop: 22`
                alone — so the one rule on the artefact read as belonging to
                "Open This week →" and the section boundary read as nothing at
                all. Every artboard heads each section with a full-bleed
                hairline, and that device is what makes a 6,500px scroll
                legible as six sections rather than as one column of text. The
                first section wears one too: under the masthead it is the line
                that says the reading has started. */}
            <td style={{ padding: '14px 0 6px', borderTop: `1px solid ${EMAIL.hairline}` }}>
              <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
                <tbody>
                  <tr>
                    {accent ? (
                      <>
                        {/* THE MARK IS A SPAN INSIDE THE CELL, not the cell's
                            own background. A `<td>` with a background fills
                            whatever height the row takes from the title beside
                            it, so a 2px rule painted on the cell rendered as a
                            16px green square. */}
                        <td width={16} style={{ width: 16, verticalAlign: 'middle', lineHeight: 0 }}>
                          <span style={{ display: 'inline-block', width: 16, height: 2, borderRadius: 2, background: EMAIL.green, fontSize: 0, lineHeight: 0 }} />
                        </td>
                        <td width={8} style={{ width: 8, fontSize: 1 }}>&nbsp;</td>
                      </>
                    ) : null}
                    <td style={accent
                      ? { fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, textTransform: 'uppercase', letterSpacing: '.08em' }
                      : { fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: EMAIL.muted, textTransform: 'uppercase', letterSpacing: '.6px' }}
                    >
                      {title}
                    </td>
                    {/* `EMAIL.muted`, NOT `EMAIL.faint` (Block D wave 3,
                        SH10). `#9AA0A6` is 2.64:1 on the card, and what this
                        slot holds is "2 named", "attention share", "Apr – Sep",
                        "2 dated", "4 named" — a section's count is how a reader
                        knows what the section is OF, which is apparatus and not
                        decoration. `#6E7378` is already the hex this arm uses
                        everywhere else. */}
                    {meta ? <td align="right" style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}>{meta}</td> : null}
                  </tr>
                </tbody>
              </table>
              {/* NO QUESTION ON PAPER OR IN AN INBOX (Block D wave 3, SH6).
                  See the app arm below: counted across the seventeen
                  artboards, every PRINTED one prints zero questions. */}
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
                      {/* `ink2` is the colour of the footer's own WORDS. The
                          link inside it paints itself — `openLink`
                          (components/blocks/open-link.tsx) is the one place
                          the product's email link style is decided, and an
                          `<a>` does not inherit either colour or underline
                          from this cell in a mail client (SH24). */}
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
      {/* FOUR ADDITIVE FLAGS IN ONE HEADER (merge, Block D wave 2).
          `header` (E-content) says whether the row is drawn at ALL — a block
          borrowed onto a titled brief sheet already has the slide's `<h1>`
          above it, and its own `<h2>` printed the same idea again one line
          under it. The question and the meta go with the row, because the meta
          is the row's right-hand half.
          `heading` (E-subjects) sets the title at heading scale for the one
          block a page is about; `accent` (E-monthly) is the artboards' ruled
          mono eyebrow; `actions` (E-subjects) is the app's controls at the
          right-hand end. They are orthogonal and all three default off, so a
          caller passing none renders what it always did — except for the
          header element's own class ORDER, which `cn` now emits as
          "flex gap-2 items-baseline justify-between"; E-monthly's byte-for-byte
          test on that string is updated with this reason. `heading` wins over
          `accent` where a caller passes both: a 20px heading with a 2px rule
          before it is neither of the two things the artboards draw. */}
      {/* AND IT WRAPS RATHER THAN CRUSHES (Block D wave 3, SH5) — the rule the
          FOOTER already follows, applied to the header. `meta` was
          `flex-none whitespace-nowrap`, so at 768 Competitive's standings meta
          (455px in a 472px pane) took its width out of the title, which wrapped
          to three lines and was cut mid-phrase. With `flex-wrap` the meta
          drops to its own line instead, and a header that already fits is
          unchanged apart from the class. */}
      {header ? (
      <header className={cn('flex flex-wrap gap-2', heading ? 'items-center justify-between gap-4' : 'items-baseline justify-between')}>
        {heading ? (
          <span className="flex min-w-0 items-baseline gap-2.5">
            <h2 className="m-0 whitespace-nowrap text-[20px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
            {meta ? <span className="min-w-0 font-mono text-[11px] text-muted-foreground">{meta}</span> : null}
          </span>
        ) : (
          <>
            {/* AND `accent` IS ADDITIVE ON THE SCREEN TOO (E-monthly's fix
                pass, review finding [Important]). The flex classes were
                outside the branch, so an omitted `accent` still turned the
                title into a flex container and — through `min-w-0` — newly let
                it shrink below its own min-content inside this
                `items-baseline` header, where it used to push `meta` out. They
                live inside the branch. */}
            <h2 className={cn(
              'm-0',
              accent
                ? 'flex min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-secondary-foreground'
                : cn('font-semibold uppercase tracking-[0.06em] text-secondary-foreground', big ? 'text-[11px]' : 'text-[10.5px]'),
            )}>
              {accent ? <span aria-hidden className="inline-block h-[2px] w-4 flex-none rounded-full bg-positive" /> : null}
              {title}
            </h2>
            {meta ? <span className="min-w-0 font-mono text-[11px] text-muted-foreground">{meta}</span> : null}
          </>
        )}
        {actions ? <span className="flex flex-none items-center gap-2">{actions}</span> : null}
      </header>
      ) : null}
      {/* THE QUESTION IS A SCREEN DEVICE (Block D wave 3, SH6). The docblock
          above justified it as "the mock's own device — every artboard prints
          one", and that is true of the artboards a reader SCROLLS: Ask prints
          6, Competitive 7, This week 5, Voice 4. Counted on the printed ones
          it is zero, every time — MarketingBrief, SalesBrief, ContentBrief,
          LeadershipBrief, WeeklyReport, MonthlyReport and QuarterlyReview all
          print none. A sheet has a title and a framing note above it and an
          inbox has a subject line; the question is what orients a reader who
          arrived at a tile with no preamble. So it is drawn in `app` alone,
          and a page that wants one on paper says it in the block's own words.
          The per-page app-mode calls it leaves standing are M8 and MK11. */}
      {header && question && mode === 'app' ? <p className="m-0 text-[12.5px] text-muted-foreground">{question}</p> : null}
      {heading && lead ? (
        <p className="m-0 font-serif text-[17px] font-medium leading-[1.35] tracking-[-0.005em] text-foreground [text-wrap:pretty]">{lead}</p>
      ) : null}
      {children}
      {footer || footerNote ? (
        <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/70 pt-2 text-[12px] font-medium text-foreground">
          {/* IT WRAPS RATHER THAN CRUSHES. The note on the right is
              `shrink-0`, so where the two halves do not fit on one line the
              LINK took the whole squeeze and set one word per line — measured
              at 1024 on the voices tile, whose note is a full sentence. With
              `flex-wrap` the note drops to its own line instead, and a footer
              that already fits is unchanged. A block that would rather clip
              than wrap its link asks for that — `truncateFooter` — and every
              block that has not asked keeps the wrap it has always had. */}
          <span className={cn('min-w-0', truncateFooter && 'truncate')}>{footer}</span>
          {/* `shrink-0` inside an `overflow-hidden` Tile is a clip with no
              signal: Overview's rivals note measures 825px against 768 and
              lost its closing "41 did this month." — and `scrollWidth ===
              clientWidth` throughout, so the no-horizontal-scroll check passed
              over it. The footer already wraps; the note now wraps INSIDE its
              line too. */}
          {footerNote ? <span className="min-w-0 font-mono text-[11px] font-normal text-muted-foreground">{footerNote}</span> : null}
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
  value, of, align = 'left', mode = 'app', size = 'md',
}: {
  value: ReactNode
  /** "of 142". Omitted ONLY for a count that is not a share of anything. */
  of?: ReactNode
  align?: 'left' | 'right'
  mode?: RenderMode
  /**
   * How loud the figure is (Block D wave 2, E-monthly — ADDITIVE, and the
   * default is untouched).
   *
   * `md` (13px) is what every existing caller gets and is the artboards' size
   * in a dense table. `lg` is 17px, which is what the MonthlyReport artboard
   * sets on the three columns of section 2: six subjects × three sides is the
   * one table on that artefact where the figure is meant to be read before the
   * label, and at 13px it reads as metadata. The "of N" does NOT grow with it —
   * the denominator is evidence rather than headline, and the artboard keeps it
   * at 10.5 in both sizes.
   *
   * AND `lg` IS SET IN THE SANS, TABULAR (the fix pass, review finding
   * [Medium]). The artboard sets mono here and only ever puts whole
   * percentages in the slot, so it never met the thing mono does at this
   * size: every glyph takes one advance, so "79.1%" sets as "79 . 1%" and the
   * figure reads as two numbers. It is the same effect this artefact's own
   * hero sentence already refuses at 23px ("1 , 388"), one size down.
   * `tabular-nums` keeps the column aligned, which is what the artboard's mono
   * was buying. `md` is untouched — at 13px the advance is small enough that
   * the point stays attached, and every other caller is on `md`.
   */
  size?: 'md' | 'lg'
}) {
  const right = align === 'right'
  const big = size === 'lg'
  if (mode === 'email') {
    return (
      <div style={{ textAlign: right ? 'right' : 'left' }}>
        {/* THE SANS IN BOTH TIERS (Block D wave 3, SH12). E-monthly's
            deviation 26 records why mono was dropped at 17px — every glyph
            takes one advance, so "79.1%" sets as "79 . 1%" and the figure
            reads as two numbers — and applied it to `lg` alone. The monthly
            rivals row is `md`, and it is the one place on that artefact with a
            decimal, so it printed exactly the thing the deviation was written
            about. In an inbox it is worse than on the glass: a client that has
            not loaded Plex Mono falls back to Courier, whose advance is wider
            again. `tabular-nums` is what the mono was buying and it survives
            in both tiers. The app arm keeps its mono, where the real face is
            loaded and 13px is the artboards' dense-table size. */}
        <div data-copy="figure" style={{ fontFamily: FONT.sans, fontSize: big ? 17 : 13, fontWeight: 600, lineHeight: '1', letterSpacing: big ? '-.01em' : undefined, fontVariantNumeric: 'tabular-nums', color: EMAIL.ink }}>{value}</div>
        {/* AND THE DENOMINATOR DOES NOT BREAK. It carried no white-space rule,
            so at 375 every rival row set "2,400 / of / 41,200" on three lines
            — the exact share-and-denominator separation `movers.tsx` made the
            trail points unbreakable to prevent. A level that loses its "of N"
            to a line break has become a score. */}
        {of ? <div data-copy="level" style={{ fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted, marginTop: big ? 3 : 2, whiteSpace: 'nowrap' }}>{of}</div> : null}
      </div>
    )
  }
  const cell = (
    <span className={cn('flex min-w-0 flex-col gap-px', right && 'items-end text-right')}>
      <span data-copy="figure" className={cn('font-semibold leading-none tabular-nums', big ? 'text-[17px] tracking-[-0.01em]' : 'font-mono text-[13px]')}>{value}</span>
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
