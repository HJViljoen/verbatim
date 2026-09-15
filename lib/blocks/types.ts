import type { ReactNode } from 'react'
import type { EmailTheme } from '../email/theme'
import type { FigureTable, Verdict } from '../reading/verdicts'

/**
 * The Block contract — what every Overview / Subjects / Voice / Market /
 * Competitive block is, and the ONE render mode list the product has
 * (Phase 1 WP10, decision O).
 *
 * WHY A SECOND SPINE BESIDE `Renderable`. `lib/renderables/types.ts` is the
 * Reports & Exports spine of 2026-08-29: a page is a loader and a bag of
 * renderables, each of which draws a TILE for the app and for paper, with an
 * OPTIONAL second function (`Renderable.email`) that draws the same tile again,
 * from scratch, in table markup. That worked while the email was a digest of
 * the dashboard. It stops working when the weekly report, the monthly report,
 * the share page and the app page are supposed to be the same reading: two
 * functions per tile is two chances to answer one question two ways, and the
 * product has already shipped that bug (a page that claimed "no email is sent"
 * while Resend sent).
 *
 * So a Block renders ONCE, and takes the mode as an argument. `render(data,
 * mode, ctx)` returns app markup, print markup or email markup from one body
 * of code, and the primitives under `components/blocks/` are the pieces that
 * know how to be three things (`components/blocks/*.tsx`). A block that cannot
 * say something in an email says so in words rather than dropping it — the
 * empty state is part of the contract, not an afterthought.
 *
 * WHAT A BLOCK OWES BESIDES MARKUP. Three optional answers, each of which
 * exists because something downstream must not have to read the markup to get
 * it:
 *   `figures()`  the numbers this block prints, by token — what a model may
 *                name (design item 9: a model explains, code rates), and what
 *                WP11's 30-number budget is asserted over.
 *   `verdicts()` the banded comparisons behind its direction words. A direction
 *                word may be printed only from a `Verdict` that carries one
 *                (WP0's copy contract rule (c)); this is where a reviewer, a
 *                prompt and a test all read them from.
 *   `quotes()`   the refs it shows, so a snapshot can freeze ids and resolve
 *                words at render (lib/renderables/quotes-freeze.ts).
 *
 * LEGACY IS UNTOUCHED. `Renderable`, `Renderable.email?` and every
 * `components/pages/*` module keep working exactly as they are; they simply
 * never receive `'email'` as a mode, because their email is a different
 * function. This file does not replace that spine — the two run side by side
 * until the pages they belong to retire (`OLD_PAGES_RETIRE_ON`).
 */

/**
 * The three things a block can be asked to be.
 *
 * DEFINED HERE, ONCE. `lib/renderables/types.ts` re-exports this type rather
 * than declaring its own, so the codebase has exactly one `RenderMode` and a
 * component that takes a mode can be handed one by either spine. Widening the
 * legacy union costs those call sites nothing: every one of them asks
 * `mode === 'print'` and treats everything else as the screen, which is the
 * right answer for markup that is not going into an email anyway.
 *
 * `'email'` is not "print, smaller". It is table markup with inline styles, no
 * classes, no CSS variables, no flex and no grid, because Outlook lays out with
 * Word — the constraint every primitive in `components/email/` is built under.
 */
export type RenderMode = 'app' | 'print' | 'email'

/**
 * What a block may reach for besides its data.
 *
 * The three email fields are NOT optional, and a context built for the app
 * answers them honestly rather than leaving them undefined: `image` returns
 * null (nothing was rendered), `theme` is the same palette in literal hex. A
 * block that reads them therefore never has to guard, and an app-mode block
 * that accidentally reads `theme` gets the right colours rather than a crash.
 */
export interface BlockContext {
  /** Absolute origin for every link a block draws. A relative link works in
   *  the app and nowhere else: print goes into a PDF and email into a client
   *  that has no idea what host it came from. */
  appUrl: string
  /** The inline image (`cid:…`) the runner rendered for this key, or null when
   *  it rendered none — in which case the block says it in words rather than
   *  showing a hole. Only ever non-null in email mode. */
  image(key: string): string | null
  /** The literal-hex palette. The app and print read CSS variables; an email
   *  client reads no stylesheet at all. */
  theme: EmailTheme
  /** The page's own URL params, verbatim, so a block draws links that carry
   *  the reader's selection (`?item=`, `?theme=`, `?vs=`). */
  params?: Record<string, string | undefined>
}

/**
 * One block: a question, an answer, and what the answer rests on.
 *
 * `key` is `<page>.<block>` and is a STORED CONTRACT the same way a
 * renderable's key is — it names a section inside a built report, a PNG export
 * and a snapshot's tile. Renaming one orphans every artefact that named it.
 */
export interface Block<D> {
  /** `<page>.<block>`, e.g. `overview.subjects`. Stable. */
  key: string
  /** The block's heading, in the reader's words. */
  title: string
  /** The one question this block answers, printed under the heading on the
   *  reading surfaces (the mock draws one per block). Absent where the title
   *  already is the question. */
  question?: string
  /**
   * The block, in one of three modes. Pure: everything it prints comes from
   * `data` and `ctx`, never from a clock, a database or a model.
   *
   * Returning `null` is allowed ONLY where `emptyState` also returns null —
   * i.e. the block has decided it has nothing to say AND that saying so would
   * be noise. Anything else returns markup, including the empty state.
   */
  render(data: D, mode: RenderMode, ctx: BlockContext): ReactNode
  /** The figures this block prints, by token. What a model may name and what a
   *  number budget is counted over. */
  figures?(data: D): FigureTable
  /** The banded comparisons behind anything this block says moved. */
  verdicts?(data: D): Verdict[]
  /** The quote refs this block shows, so ids can be frozen and words resolved
   *  at render. */
  quotes?(data: D): QuoteRef[]
  /**
   * The one honest line to print when this block has nothing — or null when it
   * does have something to say.
   *
   * A STRING, not markup, and computed without rendering: a page decides its
   * own layout from it (a tile keeps its size; a report drops a slide; an email
   * drops a section), a test asserts the sentence, and no two surfaces word the
   * same emptiness differently.
   */
  emptyState(data: D): string | null
}

/**
 * The quotes a block shows, by ref alone — `e:<insight_evidence.id>`,
 * `c:<comments.id>`, `v:<videos.id>` (lib/renderables/quotes-freeze.ts).
 *
 * The WORDS are deliberately not part of this answer. They are a third party's
 * and they resolve at render, so that an erasure reaches a stored artefact
 * (decision H); a block that handed back text would be a second place for text
 * to leak into a snapshot.
 */
export type QuoteRef = string

/** A block's own answers, gathered — what a report, a prompt or a budget test
 *  reads off a page without rendering it. */
export interface BlockAnswers {
  figures: FigureTable
  verdicts: Verdict[]
  quotes: QuoteRef[]
  empty: string | null
}

/** Every answer a block owes, with the absent ones filled in as empty rather
 *  than undefined — so a caller folding twelve blocks writes no `?? []`. */
export function blockAnswers<D>(block: Block<D>, data: D): BlockAnswers {
  return {
    figures: block.figures?.(data) ?? {},
    verdicts: block.verdicts?.(data) ?? [],
    quotes: block.quotes?.(data) ?? [],
    empty: block.emptyState(data),
  }
}

/** Every figure token a set of blocks prints, merged. A token printed by two
 *  blocks with two different values is a bug in one of them, so the LAST one
 *  wins and `figureConflicts` is what names it. */
export function mergeFigures(tables: readonly FigureTable[]): FigureTable {
  const out: FigureTable = {}
  for (const t of tables) for (const [token, figure] of Object.entries(t)) out[token] = figure
  return out
}

/** Tokens two blocks disagree about — same token, different value or unit.
 *  Empty is the healthy answer; a non-empty list is a page saying one number
 *  twice, two ways. */
export function figureConflicts(tables: readonly FigureTable[]): string[] {
  const seen = new Map<string, { value: number; unit: string }>()
  const bad = new Set<string>()
  for (const t of tables) {
    for (const [token, figure] of Object.entries(t)) {
      const held = seen.get(token)
      if (held && (held.value !== figure.value || held.unit !== figure.unit)) bad.add(token)
      else if (!held) seen.set(token, { value: figure.value, unit: figure.unit })
    }
  }
  return [...bad].sort()
}

/**
 * How many distinct numbers a set of blocks puts in front of a reader.
 *
 * WP11's budget (30 on Overview) is counted over figure TABLES rather than over
 * rendered digits, because the same figure named by two blocks is one number to
 * a reader and two digits in the markup — and because a table is countable
 * before anything is rendered.
 */
export function figureCount(tables: readonly FigureTable[]): number {
  return Object.keys(mergeFigures(tables)).length
}

/** An app- or print-mode context. The email fields answer honestly: nothing
 *  was rendered as an image, and the palette is the same one in hex. */
export function blockContext(
  appUrl: string,
  theme: EmailTheme,
  params?: Record<string, string | undefined>,
): BlockContext {
  return { appUrl, image: () => null, theme, ...(params ? { params } : {}) }
}
