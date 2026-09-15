import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import { competitiveRivals } from './rivals'
import { competitiveStandings } from './standings'
import { competitiveQuestions } from './questions'
import { competitiveUnlocks } from './unlocks'

// Competitive — the page (Phase 1 WP14, design §3 CO1–CO7).
//
// THE SELECTION SCOPES THE SURFACE. CO1 is first because everything under it is
// about one rival; `?vs=` carries that selection, and the horizon control
// carries the reader's window through every link the page draws.

export const COMPETITIVE_BLOCKS: readonly Block<CompetitiveSurfaceData>[] = [
  competitiveRivals,
  competitiveStandings,
  competitiveQuestions,
  competitiveUnlocks,
]

/** How tall each block's tile is, in the grid's 116px row units. */
const ROWS: Record<string, number> = {
  'competitive.rivals': 1,
  'competitive.months': 6,
  'competitive.questions': 5,
  'competitive.unlocks': 3,
}

/** The app's context: RELATIVE links. */
export function competitiveContext(params: Record<string, string | undefined> = {}): BlockContext {
  return blockContext('', EMAIL, params)
}

export function CompetitiveSurfacePage({
  data,
  params = {},
}: {
  data: CompetitiveSurfaceData | null
  params?: Record<string, string | undefined>
}) {
  if (!data) {
    return (
      <PageFrame>
        <SurfacePageBar nav="competitive" params={params} />
        <PageGrid>
          <Tile col={12} row={2}>
            <TileEmpty>
              Nothing has been read for this workspace yet. Your rivals&rsquo; standings land with the first update.
            </TileEmpty>
          </Tile>
        </PageGrid>
      </PageFrame>
    )
  }

  const ctx = competitiveContext(params)
  return (
    <PageFrame>
      <SurfacePageBar
        nav="competitive"
        params={params}
        context={{ brand: data.brand, month: data.month, status: data.monthStatus, readingAt: data.readingAt }}
        record={{ line: data.record.line, lines: data.record.lines }}
      />
      <PageGrid>
        {COMPETITIVE_BLOCKS.map((block) => (
          <Tile key={block.key} col={12} row={ROWS[block.key] ?? 2}>
            {block.render(data, 'app', ctx)}
          </Tile>
        ))}
      </PageGrid>
    </PageFrame>
  )
}
