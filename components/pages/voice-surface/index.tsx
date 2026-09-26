import type { ReactNode } from 'react'
import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { READER_FLAGS, THIRTEEN_WORDS } from '@/lib/calibration'
import { PRIVACY_LINE } from '@/lib/reading/method'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { barContext } from '@/lib/shell/bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import { cn } from '@/lib/utils'
import type { VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { voiceAudience } from './audience'
import { voiceBoard } from './board'
import { voiceTheme } from './theme'
import { voiceCast } from './cast'

// Conversation — the page (market-first WP2.4, plan §2.4 C1–C4; it was Voice,
// Phase 1 WP13, and keeps the key `voice`).
//
// FOUR BLOCKS, IN THE ORDER A READER ASKS: how big was the market and where
// are its themes grouped (C1) · every theme it talked about at 10 or more (C2)
// · one of them in full (C3) · who is talking (C4). A row on the board opens
// its theme in C3.

export const VOICE_BLOCKS: readonly Block<VoiceSurfaceData>[] = [
  voiceAudience,
  voiceBoard,
  voiceTheme,
  voiceCast,
]

/** The anchor each block's section carries: the board's rows open the pane
 *  at `#theme`, and the pane's "in full below" link points at it. */
const ANCHORS: Readonly<Record<string, string>> = { 'voice.theme': 'theme' }

/**
 * NO FIXED-HEIGHT TILES ON THIS PAGE. `Tile` is `overflow-hidden`, and a tile
 * is only as tall as the row span it asks for, so a bounded tile CUTS what is
 * past it: the first production render of Voice lost half a block that way.
 * None of these four blocks has a bounded height (the board grows with the
 * month's themes: 21 on staging's September, 23 on production's), so the page
 * is a column of full-width sections wearing the tile's own surface.
 *
 * `flush` is the page's: each block draws its own 32px inset (`roomy` on its
 * frame), as the front page's do. The skeleton (app/dashboard/voice/
 * loading.tsx) takes the padded form, since bones have no frame.
 */
export function GrowingTile({ children, flush = false, id }: { children: ReactNode; flush?: boolean; id?: string }) {
  return (
    <section
      id={id}
      // print mode addresses a tile by these two attributes rather than by the
      // xl: span classes, which do not fire in Chrome's print media
      // (app/globals.css §Print mode).
      data-tile=""
      data-col={12}
      className={cn(
        'flex min-w-0 scroll-mt-6 flex-col rounded-lg bg-tile shadow-tile',
        !flush && 'gap-2.5 px-4 py-3.5 text-[12.5px] leading-[1.45]',
      )}
    >
      {children}
    </section>
  )
}

/**
 * The app's context: RELATIVE links, and the reader's params, so a row on the
 * board opens its theme in the same month the reader is reading.
 */
export function voiceContext(params: Record<string, string | undefined> = {}): BlockContext {
  return blockContext('', EMAIL, params)
}

/** The words this page's legend explains — THIRTEEN_WORDS plus the two reader
 *  flags, the vocabulary every new reading surface draws from
 *  (lib/calibration.ts). Exported so the route and the review shots mount the
 *  same legend. */
export const VOICE_LEGEND = [...THIRTEEN_WORDS, ...READER_FLAGS]

/**
 * `controls` IS THE ROUTE'S, NOT THE PAGE'S: the legend pill reads
 * `useSearchParams`, and this page also renders under `renderToStaticMarkup`
 * and on the print path, where no router is mounted.
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
              Nothing has been read for this workspace yet. The first reading of what your market talked about lands with the first update.
            </TileEmpty>
          </Tile>
        </PageGrid>
      </PageFrame>
    )
  }

  const ctx = voiceContext(params)
  return (
    <PageFrame className="gap-6">
      <SurfacePageBar
        nav="voice"
        params={params}
        // The brand, the month selector and "as at the {update} update · next
        // update {date}" (25 Sep rulings). No horizon: the page reads one
        // month (lib/nav.ts).
        context={barContext(data)}
      >
        {controls}
      </SurfacePageBar>
      {VOICE_BLOCKS.map((block) => (
        <GrowingTile key={block.key} flush id={ANCHORS[block.key]}>{block.render(data, 'app', ctx)}</GrowingTile>
      ))}
      {/* NO FOOTNOTE UNDER A BLOCK (25 Sep rulings): the page prints no
          method paragraph and no caveat under its blocks. The privacy line is
          a legal line, not method, and stays. */}
      <p className="m-0 pt-1 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">{PRIVACY_LINE}</p>
    </PageFrame>
  )
}
