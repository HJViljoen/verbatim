import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
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

/** How tall each block's tile is, in the grid's 116px row units. A block that
 *  grows past its box scrolls with the page — the one-screen rule retired in
 *  2026-08 (MASTER rule 7). */
const ROWS: Record<string, number> = {
  'voice.audience': 2,
  'voice.moved': 4,
  'voice.theme': 6,
  'voice.cast': 4,
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

export function VoiceSurfacePage({
  data,
  params = {},
}: {
  data: VoiceSurfaceData | null
  params?: Record<string, string | undefined>
}) {
  if (!data) {
    return (
      <PageFrame>
        <SurfacePageBar nav="voice" params={params} />
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
      />
      <PageGrid>
        {VOICE_BLOCKS.map((block) => (
          <Tile key={block.key} col={12} row={ROWS[block.key] ?? 2}>
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
  )
}
