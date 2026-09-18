import type { ReactNode } from 'react'
import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { horizonDates } from '@/lib/reading/horizon'
import { monthName } from '@/lib/format'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import type { VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { voiceAudience } from './audience'
import { voiceMovers } from './movers'
import { voiceTheme } from './theme'
import { voiceCast } from './cast'

// Voice — the page (Phase 1 WP13, design §3 VO1–VO4).
//
// FOUR BLOCKS, IN THE ORDER A READER ASKS THE QUESTIONS. Whose conversation is
// this (VO1) · what moved in it (VO2) · what exactly is being said (VO3) · who
// is saying it (VO4). Each block links onward: VO1 to Competitive, VO3 to the
// conclusion Market drew from the theme on screen, and every mover row into
// VO3 with that theme open.

export const VOICE_BLOCKS: readonly Block<VoiceSurfaceData>[] = [
  voiceAudience,
  voiceMovers,
  voiceTheme,
  voiceCast,
]

/**
 * NO FIXED-HEIGHT TILES ON THIS PAGE, and the first production render is why.
 *
 * `PageGrid` is `auto-rows-[116px]` and `Tile` is `overflow-hidden`, so a tile
 * is exactly as tall as the row span it asks for and everything past that is
 * CUT — not scrolled, not shrunk, not marked. Drawn that way, Sealand's page
 * lost three of the theme's six quotes, the spoken line, the on-screen text,
 * all four actions, the search box and three of the five groups in the cast,
 * with nothing on the page saying anything was missing. That is the worst
 * failure this product has: a surface quietly showing less than it read.
 *
 * Not one of these four blocks has a bounded height. VO1 grows with the kinds
 * (three today, ten when M5 lands); VO2 grows with the arms and doubles when a
 * reader expands it — four arms of ten rows is forty; VO3 grows with the
 * quotes and the evidence under them; VO4 grows with the cast. MASTER rule 7
 * retired the one-screen rule in August precisely so a page could scroll, and
 * a block whose height is its content's belongs in a box that grows. So the
 * page is a column of full-width sections wearing the tile's own surface —
 * one white surface, the ambient shadow, no border — rather than cells in a
 * fixed grid.
 *
 * Exported so `app/dashboard/voice/loading.tsx` stands in for the shape the
 * page actually draws rather than for a grid it abandoned.
 */
export function GrowingTile({ children }: { children: ReactNode }) {
  return (
    <section
      // print mode addresses a tile by these two attributes rather than by the
      // xl: span classes, which do not fire in Chrome's print media
      // (app/globals.css §Print mode).
      data-tile=""
      data-col={12}
      className="flex min-w-0 flex-col gap-2.5 rounded-lg bg-tile px-4 py-3.5 text-[12.5px] leading-[1.45] shadow-tile"
    >
      {children}
    </section>
  )
}

/**
 * The app's context: RELATIVE links, and the reader's params.
 *
 * `ctx.params` is what every mover row's href is built from, so a click from
 * VO2 into VO3 keeps the audience, the horizon and the `?themes=` deep link
 * the reader arrived with.
 */
export function voiceContext(params: Record<string, string | undefined> = {}): BlockContext {
  return blockContext('', EMAIL, params)
}

/**
 * `controls` IS THE ROUTE'S, NOT THE PAGE'S, and that is deliberate.
 *
 * The artboard's page bar carries a "How to read this page" pill, which is
 * `components/how-to-read.tsx` — a client component reading `useSearchParams`.
 * This page renders in three places and only one of them is a browser: the
 * render tier calls it through `renderToStaticMarkup` with no router mounted,
 * and the print path renders it inside Chrome with no app shell. So the route
 * passes the control in and the two other callers pass nothing, rather than
 * this component importing a hook that only one of its three callers can
 * satisfy.
 */
export function VoiceSurfacePage({
  data,
  params = {},
  controls,
}: {
  data: VoiceSurfaceData | null
  params?: Record<string, string | undefined>
  /** The page bar's right-hand end — the legend pill, from the route. */
  controls?: ReactNode
}) {
  if (!data) {
    return (
      <PageFrame>
        <SurfacePageBar nav="voice" params={params}>{controls}</SurfacePageBar>
        <PageGrid>
          <Tile col={12} row={2}>
            <TileEmpty>
              Nothing has been read for this workspace yet. The first reading of who is saying what lands with the first update.
            </TileEmpty>
          </Tile>
        </PageGrid>
      </PageFrame>
    )
  }

  const ctx = voiceContext(params)
  return (
    <PageFrame>
      <SurfacePageBar
        nav="voice"
        params={params}
        context={{ brand: data.brand, month: data.month, status: data.monthStatus, readingAt: data.readingAt }}
        record={{ line: data.record.line, lines: data.record.lines }}
      >
        {controls}
      </SurfacePageBar>
      {VOICE_BLOCKS.map((block) => (
        <GrowingTile key={block.key}>{block.render(data, 'app', ctx)}</GrowingTile>
      ))}
      {data.notes.length > 0 ? (
        <p className="m-0 text-[11px] text-muted-foreground">
          {/* ONE CAVEAT FOR A RUN OF MONTHS, never one per bar: the reading
              layer merges the series' notes by the union of their months and
              re-words the sentence from it (lib/reading/series.ts
              mergeSeriesNotes). */}
          {data.notes.map((n) => n.text).join(' ')}
        </p>
      ) : null}
      {/* THE METHOD FOOTNOTE — the one element of this artboard that was
          missing rather than different (D15). Five facts this page already
          holds and printed nowhere: who it was prepared for and when, how much
          was read in this window and where, how much of each video we managed
          to read, how much of what was said on camera was not in English, and
          the Reddit cap — which has never rendered on any reading surface at
          all. Each line states its own clock, which is the whole reason
          `methodLines` composes them in one place: read depth and language are
          ALL-TIME and the coverage line is this window's, and a footnote whose
          lines are on three clocks with only one of them labelled is the defect
          the module was written to end. */}
      {data.method ? (
        <p data-copy="figure" className="m-0 flex flex-col gap-0.5 pt-1 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
          {/* THE WINDOW THIS PAGE IS A READING OF, WHICH PRINTED NOWHERE. The
              artboard puts it beside the range pills ("1 Sep → 28 Sep"); the
              app's page bar has no room for it beside four horizon pills and
              the legend, and the bar is `main`'s file. So the footnote says
              it, in the unit the reading is drawn in: `horizonDates` is month
              granularity on purpose — the axis is dated by the comment and a
              day would imply a precision the freeze line does not have — and
              the month every figure above is a reading OF is named beside it,
              because the two are not the same span. */}
          <span>
            {`Months drawn: ${horizonDates(data.window)} · every figure above reads ${monthName(data.month)}`}
          </span>
          {data.method.lines.map((line) => <span key={line}>{line}</span>)}
        </p>
      ) : null}
    </PageFrame>
  )
}
