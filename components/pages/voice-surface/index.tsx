import type { ReactNode } from 'react'
import { PageBar } from '@/components/shell/page-grid'
import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { READER_FLAGS, THIRTEEN_WORDS } from '@/lib/calibration'
import { surface } from '@/lib/nav'
import { cn } from '@/lib/utils'
import type { VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { voiceAudience } from './audience'
import { voiceBoard } from './board'
import { voiceTheme } from './theme'
import { voiceCast } from './cast'
import { voiceWords } from './words'
import { voiceWhere } from './where'
import { ConvCard, ConversationBody } from './conversation'

// Conversation — the page (market-first WP2.4 and WP3.8, plan §2.4 C1–C6; it
// was Voice, Phase 1 WP13, and keeps the key `voice`).
//
// THE PAGE IS THE APPROVED ARTBOARD NOW (the pages build, 1 Oct;
// `./conversation.tsx`). The six blocks below are RETIRED FROM THE PAGE and
// kept registered, keys unchanged, for what still renders them (the registry
// sweep, the brand view under `?brand=`): how big was the market (C1) · every
// theme at 10 or more (C2) · one in full (C3) · who is talking (C4) · the
// market's words (C5) · where it talks (C6).

export const VOICE_BLOCKS: readonly Block<VoiceSurfaceData>[] = [
  voiceAudience,
  voiceBoard,
  voiceTheme,
  voiceCast,
  voiceWords,
  voiceWhere,
]

/**
 * NO FIXED-HEIGHT TILES ON THIS PAGE. `Tile` is `overflow-hidden`, and a tile
 * is only as tall as the row span it asks for, so a bounded tile CUTS what is
 * past it: the first production render of Voice lost half a block that way.
 * None of these six blocks has a bounded height (the board grows with the
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

/** The page's title row: the artboard's 26px title, and whatever control the
 *  route puts at its right-hand end (none today). */
export function ConversationTitle({ controls }: { controls?: ReactNode }) {
  return <PageBar title={surface('voice').label}>{controls}</PageBar>
}

/**
 * THE APPROVED ARTBOARD (Page-Conversation.dc.html, the pages build of 1 Oct):
 * the title, then every conversation beside one in full and where the market
 * talks, who is talking, and the market's words by kind
 * (`./conversation.tsx`). No page-bar line, no month chip, no Export and no
 * footnote: `?month=` still reads another month. The six legacy blocks stay
 * registered (`VOICE_BLOCKS`) for what still renders them; the page draws
 * none of them, except the board's brand view under `?brand=`.
 *
 * `controls` IS THE ROUTE'S, NOT THE PAGE'S: this page also renders under
 * `renderToStaticMarkup`, where no router is mounted.
 */
export function VoiceSurfacePage({
  data,
  params = {},
  controls,
}: {
  data: VoiceSurfaceData | null
  params?: Record<string, string | undefined>
  /** The title row's right-hand end, from the route. */
  controls?: ReactNode
}) {
  if (!data) {
    return (
      <div className="flex flex-col gap-[22px]">
        <ConversationTitle controls={controls} />
        <ConvCard className="px-7 py-6">
          <p className="m-0 text-[14px] text-[#5F656B]">Your market’s first month will appear here.</p>
        </ConvCard>
      </div>
    )
  }
  // `?brand=`: the brand's ninety days in the board's place, the legacy block
  // as the Brands page links to it (#board on its whole section).
  const board = data.brandView ? <ConvCard id="board">{voiceBoard.render(data, 'app', voiceContext(params))}</ConvCard> : undefined
  return (
    <div className="flex flex-col gap-[22px]">
      <ConversationTitle controls={controls} />
      <ConversationBody data={data} params={params} board={board} />
    </div>
  )
}
