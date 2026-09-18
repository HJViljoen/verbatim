import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { THIRTEEN_WORDS, READER_FLAGS } from '@/lib/calibration'
import { ExportMenu, ExportScope } from '@/components/export-menu'
import { HowToRead } from '@/components/how-to-read'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import { fmtInt, shortDate } from '@/lib/format'
import type { OverviewData } from '@/lib/pages/overview'
import { sentLineForToken } from '@/lib/pages/overview'
import { overviewBar } from './bar'
import { overviewSentence } from './sentence'
import { overviewSubjects } from './subjects'
import { overviewCategory } from './category'
import { overviewRivals } from './rivals'
import { overviewMoves } from './moves'
import { overviewRecord } from './record'

// Overview — the page (Phase 1 WP11, design §3 OV0–OV6; ported to the artboard
// in Block D wave 2, `mock-sealand/artboards/Main.dc.html`).
//
// SEVEN BLOCKS IN THE MONTHLY REPORT'S ORDER, and that order is the point: the
// page and the artefact are the same reading, so a reader who has seen one has
// seen the other. Each block links onward to the page that carries it in full.

export const OVERVIEW_BLOCKS: readonly Block<OverviewData>[] = [
  overviewBar,
  overviewSentence,
  overviewSubjects,
  overviewCategory,
  overviewRivals,
  overviewMoves,
  overviewRecord,
]

/** How tall each block's tile is, in the grid's 116px row units. A block that
 *  grows past its box scrolls with the page — the one-screen rule retired in
 *  2026-08 (MASTER rule 7). */
const ROWS: Record<string, number> = {
  'overview.bar': 1,
  'overview.sentence': 3,
  'overview.subjects': 3,
  'overview.category': 4,
  'overview.rivals': 3,
  'overview.moves': 3,
  'overview.record': 1,
}

/**
 * The one block the artboard draws as a HERO (Block D wave 2,
 * `main.sentence.hero`).
 *
 * `Tile variant="hero"` is P0's, built in wave 1 and used by nothing: 12px gaps,
 * 16/20 padding, and the serif ramp for the page's one sentence. The artboard
 * gives §1 that treatment and every other section the default tile, so the map
 * is one entry rather than a flag per block — and the block itself prints the
 * serif line, because the monthly report renders it with no Tile around it at
 * all and the sentence must not lose its weight on paper.
 */
const HERO = 'overview.sentence'

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
      tiles={OVERVIEW_BLOCKS.map((b) => ({ key: b.key, title: b.title }))}
    >
      <PageFrame>
        <SurfacePageBar
          nav="overview"
          params={params}
          range={horizonRange(data)}
          context={{
            brand: data.brand,
            month: data.month,
            status: data.monthStatus,
            readingAt: data.readingAt,
            // WHAT THE LAST REPORT READ (WP18, item 13). The month's own size is
            // the figure the bar is about, so it is the one the bar quotes; null
            // — and printed as nothing — where nothing was sent, where it has not
            // moved, or where the month had already closed when it went out.
            sent: sentLineForToken(data.sent, 'month_videos', data.bar.videos),
          }}
          record={{ line: data.record.line, lines: data.record.lines }}
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
        <PageGrid>
          {OVERVIEW_BLOCKS.map((block) => (
            <Tile
              key={block.key}
              col={12}
              row={ROWS[block.key] ?? 2}
              variant={block.key === HERO ? 'hero' : 'default'}
              // A tile that exports names itself. The key is `<page>.<tile>`
              // and it is stable — it names stored PNG artefacts — so it is the
              // block's own key and never a position.
              exportKey={block.key}
            >
              {block.render(data, 'app', ctx)}
            </Tile>
          ))}
        </PageGrid>
        {data.notes.length > 0 ? (
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
