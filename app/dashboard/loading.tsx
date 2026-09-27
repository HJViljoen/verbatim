import type { ReactNode } from 'react'
import { PageGrid } from '@/components/shell/page-grid'
import { SkeletonSurface, SkeletonTile, Bone, BoneLines, BoneBars } from '@/components/shell/skeleton'
import { FRONT_TILE_KEYS, frontTile } from '@/components/pages/overview/tiles'

// Mirrors components/pages/overview/index.tsx (OverviewPage), Your market as
// deploy 3 draws it: the surface bar with Export alone (the preview's bar; How
// to read is in Settings) and its one line (no horizon row, no "How sound"
// band), then the page's own tiles in its order, with its widths, pairs and
// floors taken from the same table (`frontTile`, ./tiles.ts): the month (its
// size and clause beside the voices) · the theme board · with this update ·
// the kinds and mood · the asks · the subjects (8) beside what it means for
// you (4) · what you published (6) beside the brands (6) · what changed. The
// grid is `xl:auto-rows-auto` there, so it is here: the tiles are as tall as
// their bones, which are sized to the blocks, and a pair as tall as the taller
// of its two, as the page's pairs stretch. A bone the page will not draw is
// a jump when the page lands (about 5s on staging), so the order and the pairs
// are the page's own. No tile carries a meta bone: a block header is its title
// alone (25 Sep rulings).
//
// `lib/dashboard-loading.test.ts` fails a page that has no loader of its own
// or a named shared one.
/** The front page's frame: each block draws a 32px inset and 24px between
 *  its title and body (`BlockFrame`'s `roomy`), so the skeleton does too. */
const ROOMY = 'gap-6 px-4 py-6 sm:px-8 sm:py-8'

/** Each block's bones, sized to what it draws. */
const BONES: Record<(typeof FRONT_TILE_KEYS)[number], ReactNode> = {
  // The month beside its voices.
  'overview.sentence': (
    <div className="grid grid-cols-1 gap-x-16 gap-y-6 xl:grid-cols-[minmax(0,1fr)_304px]">
      <div className="flex flex-col gap-3">
        <Bone className="h-7 w-3/4" />
        <Bone className="h-7 w-1/2" />
        <BoneLines lines={3} />
      </div>
      <div className="flex flex-col gap-3 rounded-md bg-inner p-6">
        <BoneLines lines={2} />
        <BoneLines lines={3} />
      </div>
    </div>
  ),
  // Ten board rows and the makers line.
  'overview.themes': (
    <>
      <BoneBars rows={10} />
      <Bone className="h-10 w-full rounded-[6px]" />
    </>
  ),
  // With this update: its lines, then the weeks' bars.
  'overview.arrivals': (
    <>
      <BoneLines lines={2} />
      <BoneBars rows={4} />
    </>
  ),
  // The kinds beside the mood.
  'overview.category': (
    <div className="grid grid-cols-1 gap-x-16 gap-y-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
      <BoneBars rows={8} />
      <BoneBars rows={4} />
    </div>
  ),
  // Three short lists.
  'overview.asks': (
    <div className="grid grid-cols-1 gap-x-12 gap-y-6 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => <BoneLines key={i} lines={4} />)}
    </div>
  ),
  // The market by subject: eight rows.
  'overview.subjects': <BoneBars rows={8} />,
  // What it means for you: its line-ups.
  'overview.foryou': (
    <>
      <BoneLines lines={3} />
      <BoneLines lines={4} />
    </>
  ),
  // What you published: the posts and their audience.
  'overview.moves': (
    <>
      <Bone className="h-7 w-1/3" />
      <BoneLines lines={3} />
    </>
  ),
  // Brands: the name line, then a row a brand.
  'overview.rivals': (
    <>
      <BoneLines lines={2} />
      <BoneBars rows={7} />
    </>
  ),
  // Two lines and the month strip.
  'overview.change': <BoneLines lines={3} />,
}

export default function DashboardLoading() {
  return (
    <SkeletonSurface nav="overview" button>
      <PageGrid className="gap-6 xl:auto-rows-auto">
        {FRONT_TILE_KEYS.map((key) => {
          const tile = frontTile(key, false)
          return (
            <SkeletonTile key={key} col={tile.col} row={tile.row} className={`${tile.className} ${ROOMY}`}>
              {BONES[key]}
            </SkeletonTile>
          )
        })}
      </PageGrid>
    </SkeletonSurface>
  )
}
