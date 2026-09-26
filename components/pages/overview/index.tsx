import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { THIRTEEN_WORDS, READER_FLAGS } from '@/lib/calibration'
import { ExportMenu, ExportScope } from '@/components/export-menu'
import { HowToRead } from '@/components/how-to-read'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { barContext } from '@/lib/shell/bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import { fmtInt, shortDate } from '@/lib/format'
import type { OverviewData } from '@/lib/pages/overview'
import { overviewBar } from './bar'
import { overviewSentence } from './sentence'
import { overviewSubjects } from './subjects'
import { overviewCategory } from './category'
import { overviewRivals } from './rivals'
import { overviewMoves } from './moves'
import { overviewThemes } from './themes'
import { overviewAsks } from './asks'
import { overviewChange } from './change'
import { MARKET_SENTENCE_TITLE } from './sentence'
import { MARKET_KINDS_TITLE } from './market-kinds'
import { MARKET_SUBJECTS_TITLE } from './market-subjects'
import { MARKET_BRANDS_TITLE } from './rivals'
import { isMarketPage } from './market'

// Overview — the page (Phase 1 WP11, design §3 OV0–OV5; ported to the artboard
// in Block D wave 2, `mock-sealand/artboards/Main.dc.html`).
//
// SIX BLOCKS IN THE MONTHLY REPORT'S ORDER, and that order is the point: the
// page and the artefact are the same reading, so a reader who has seen one has
// seen the other. Each block links onward to the page that carries it in full.
//
// NO OV6 (25 Sep rulings, market-first WP1.2). "How sound is this month"
// (`overview.record`) left the front page with the "How sound" pill. The
// block itself stays, because the monthly renders it as `monthly.sound` until
// WP2.1 rebuilds that artefact, and `OverviewData.record` stays as data
// because the weekly reads `record.line`.

export const OVERVIEW_BLOCKS: readonly Block<OverviewData>[] = [
  overviewBar,
  overviewSentence,
  overviewThemes,
  overviewCategory,
  overviewAsks,
  overviewSubjects,
  overviewRivals,
  overviewChange,
  overviewMoves,
]

/**
 * YOUR MARKET, IN ITS ORDER (market-first WP1.6, plan §2.2; deploy 2's
 * column: blocks 0 to 2, 4 to 6, 9 as one line, and 10). The order is the
 * argument: the market in full, then brands, then what changed and what is
 * ours. "With this update", "What it means for you" and "What you published"
 * join with deploy 3 (WP2.7, WP2.5); "How sound is this month" is gone (25 Sep
 * rulings). `overview.moves` stays in the registry above, because stored
 * exports and the briefs name it, and is not on the page.
 */
export const FRONT_PAGE_BLOCKS: readonly Block<OverviewData>[] = [
  overviewSentence,
  overviewThemes,
  overviewCategory,
  overviewAsks,
  overviewSubjects,
  overviewRivals,
  overviewChange,
]

/**
 * What each block is called on the front page. The four reworked blocks keep
 * their Phase 1 registry titles, which a stored copy and the monthly (until
 * WP2.1) still render under; on the page and in its exports they carry these.
 */
export const MARKET_TITLES: Readonly<Record<string, string>> = {
  'overview.sentence': MARKET_SENTENCE_TITLE,
  'overview.themes': overviewThemes.title,
  'overview.category': MARKET_KINDS_TITLE,
  'overview.asks': overviewAsks.title,
  'overview.subjects': MARKET_SUBJECTS_TITLE,
  'overview.rivals': MARKET_BRANDS_TITLE,
  'overview.change': overviewChange.title,
}

/** The front page's spans: every block the width of the page, except the
 *  subjects and the brands' one line, which share a row (the preview's
 *  8 : 4 split). */
const FRONT_COLS: Record<string, 4 | 8 | 12> = {
  'overview.subjects': 8,
  'overview.rivals': 4,
}

/**
 * How tall each block's tile is BELOW `xl`, where the page is one stacked
 * column and `Tile`'s `MIN_H` gives each tile a floor so the page keeps its
 * rhythm as it scrolls.
 *
 * AT `xl` THE GRID SIZES TO CONTENT AND THESE ARE SPANS, NOT HEIGHTS — see the
 * `xl:auto-rows-auto` on `PageGrid` below, and why it is there. A number here
 * is a proportion, not a measurement.
 */
const ROWS: Record<string, number> = {
  'overview.bar': 1,
  'overview.sentence': 3,
  'overview.subjects': 3,
  // Floors, not sizes. Lowered in the layout sweep (2026-09-24): the category
  // block lost its absence-only column, so the old floors left a tile of white
  // under it below xl.
  'overview.category': 3,
  'overview.rivals': 3,
  'overview.moves': 3,
  'overview.themes': 4,
  'overview.asks': 3,
  'overview.change': 2,
}


/**
 * The blocks the APP page draws as tiles — every one but OV0 (Block D wave 3,
 * M7).
 *
 * `Main.dc.html` draws six sections and none of them is "This month so far".
 * Its facts are the bar's and the horizon range's (`horizonRange`), so it spent
 * a 12-column, 156px tile plus its gap at the top of the page restating them,
 * and the page's actual lead, "In one sentence", began under them. (It once
 * moved one fact into the "How sound is this" band; that band left every page
 * with the 25 Sep rulings.)
 *
 * OV0 IS NOT REMOVED FROM `OVERVIEW_BLOCKS`, and that is why there are two
 * lists. The registry is what the export module, the print slides, the monthly
 * email and the brief section maps resolve `overview.bar` through — and a PDF
 * sheet, a PNG and an email carry no page bar and no horizon pills, so
 * on those surfaces the tile is the only place any of the four facts appears
 * and it keeps its slide (`page.tsx` `overviewSlides`). The duplication this
 * drops is an APP duplication, which is what the finding measured.
 */
const NOT_TILED: ReadonlySet<string> = new Set([overviewBar.key])
export const TILE_BLOCKS = FRONT_PAGE_BLOCKS.filter((b) => !NOT_TILED.has(b.key))

/**
 * The app's context: RELATIVE links.
 *
 * `ctx.appUrl` is an absolute origin everywhere a link leaves the app — a PDF,
 * an email — and the empty string in the app itself, so `next/link` gets
 * `/dashboard/market` and navigates on the client instead of reloading the
 * whole application to reach its own next page.
 */
export function overviewContext(params: Record<string, string | undefined> = {}): BlockContext {
  return blockContext('', EMAIL, params)
}

/**
 * "4 updates · 1 Sep → 28 Sep" — what the selected horizon pill resolves to
 * (`main.bar.horizon.range`).
 *
 * BOTH HALVES COME OFF THE RUN ROW AND THE WINDOW, never off the clock. The
 * update count is `BarBlock.updates` (the updates delivered into this window)
 * and the span is the window the page was opened at (`OverviewData.window`),
 * whose instants were frozen when it was parsed. A pill that says "This month"
 * says nothing about which days are in it, and on a tenant whose newest update
 * covers thirty days that is the difference between a week and a month.
 */
export function horizonRange(data: OverviewData): string | null {
  const w = data.window
  if (!w.from || !w.to) return null
  // The window is half-open `[from, to)`: the last day a reading covers is the
  // day before `to`, and printing `to` itself would date the range one day into
  // a month the page has not read.
  const lastDay = new Date(new Date(w.to).getTime() - 24 * 60 * 60 * 1000).toISOString()
  const span = `${shortDate(w.from)} → ${shortDate(lastDay)}`
  const updates = data.bar.updates
  return updates > 0 ? `${fmtInt(updates)} ${updates === 1 ? 'update' : 'updates'} · ${span}` : span
}

/** The words this page's legend explains. THIRTEEN_WORDS plus the two reader
 *  flags, which is the vocabulary every new reading surface draws from
 *  (lib/calibration.ts) — not a hand-picked subset, so the legend and the page
 *  can never come to disagree about which words are in play. */
export const OVERVIEW_LEGEND = [...THIRTEEN_WORDS, ...READER_FLAGS]

export function OverviewPage({
  data,
  params = {},
}: {
  data: OverviewData | null
  params?: Record<string, string | undefined>
}) {
  if (!data) {
    return (
      <PageFrame>
        <SurfacePageBar nav="overview" params={params} />
        <PageGrid>
          <Tile col={12} row={2}>
            <TileEmpty>
              Nothing has been read for this workspace yet. The first monthly reading lands with the first update.
            </TileEmpty>
          </Tile>
        </PageGrid>
      </PageFrame>
    )
  }

  const ctx = overviewContext(params)
  return (
    <ExportScope
      page="overview"
      params={params}
      tiles={TILE_BLOCKS.map((b) => ({ key: b.key, title: MARKET_TITLES[b.key] ?? b.title }))}
    >
      <PageFrame>
        <SurfacePageBar
          nav="overview"
          params={params}
          // The brand, the month selector and "as at the {update} update ·
          // next update {date}" (25 Sep rulings, market-first WP1.2). No "How
          // sound is this" band: it left every page on 25 Sep.
          context={barContext(data)}
        >
          {/* THE TWO CONTROLS THE ARTBOARD PUTS AT THE RIGHT-HAND END, and the
              two `/dashboard` has never had (`main.bar.howtoread`,
              `main.bar.export`). Both were wired into the five LEGACY pages and
              neither into the page that replaced them, because `SurfacePageBar`
              renders its control slot from `children` and this page passed
              none. */}
          <HowToRead items={OVERVIEW_LEGEND} basePath="/dashboard" anchor="overview" />
          <ExportMenu />
        </SurfacePageBar>
        {/* THE GRID SIZES TO ITS CONTENT ON THIS PAGE, and that is a fix
            rather than a preference. `PageGrid`'s rows WERE a fixed 116px track
            (they are `minmax(116px, auto)` everywhere since 2026-09-24; this
            page keeps `auto` so its spans set no floor above xl)
            and `Tile` is `overflow-hidden`, so a block taller than its span is
            CUT OFF — which is what the first side-by-side of this port showed:
            Moves lost the bottom of its card and the record lost most of its
            second paragraph. Tuning the spans against the fixture would only
            move the cliff: the fixture carries two subjects and three rivals
            where a live tenant carries eight and ten, and the eighth subject
            row would vanish on production with nothing in a test to see it.
            Every tile on Overview is `col={12}` and alone in its row, so a
            content-sized track costs the page nothing and the spans below stay
            meaningful under `xl`, where `Tile`'s own `min-h` is the floor. */}
        <PageGrid className="xl:auto-rows-auto">
          {TILE_BLOCKS.map((block) => (
            <Tile
              key={block.key}
              col={FRONT_COLS[block.key] ?? 12}
              row={ROWS[block.key] ?? 2}
              // NOT THE INVERTED HERO (market-first WP1.6): the approved
              // preview sets "The month" on the same white as every block.
              variant="default"
              // A tile that exports names itself. The key is `<page>.<tile>`
              // and it is stable — it names stored PNG artefacts — so it is the
              // block's own key and never a position.
              exportKey={block.key}
              // THE BLOCK FILLS ITS TILE, WHICH IS WHAT `distribute` IS FOR.
              // `Tile`'s body is a flex column with `flex-1`; `BlockFrame`'s
              // own `<section>` is not, so every block sat at the natural
              // height of its content with the tile's remaining row span as
              // dead space UNDER its footer — visible on Subjects and Rivals in
              // the side-by-side, and the reason the artboard's even,
              // edge-to-edge density did not survive (mock-gap §Visual
              // fidelity). The selector is here rather than in `BlockFrame`
              // because the frame is P0's and shared: a block rendered into an
              // email or a slide has no tile to fill.
              bodyClassName="[&>section]:min-h-0 [&>section]:flex-1"
              distribute="between"
            >
              {block.render(data, 'app', ctx)}
            </Tile>
          ))}
        </PageGrid>
        {/* NO FOOTNOTE UNDER YOUR MARKET (25 Sep rulings): its blocks print
            levels and each block's one chip says why nothing is compared, so
            the reading's caveats print only under a stored Phase 1 copy. */}
        {data.notes.length > 0 && !isMarketPage(data) ? (
          <p className="m-0 text-[11px] text-muted-foreground">
            {/* ONE CAVEAT FOR A RUN OF MONTHS, never one per bar: the reading
                layer merges the series' notes by the union of their months and
                re-words the sentence from it (lib/reading/series.ts
                mergeSeriesNotes). */}
            {data.notes.map((n) => n.text).join(' ')}
          </p>
        ) : null}
      </PageFrame>
    </ExportScope>
  )
}
