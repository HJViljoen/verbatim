import type { Block, BlockContext } from '@/lib/blocks/types'
import type { PageModule, Renderable, Slide } from '@/lib/renderables/types'
import { blockContext } from '@/lib/blocks/types'
import type { GlossaryKey } from '@/lib/calibration'
import { fullDate } from '@/lib/format'
import { EMAIL } from '@/lib/email/theme'
import { appBaseUrl } from '@/lib/site'
import { ExportMenu, ExportScope } from '@/components/export-menu'
import { HowToRead } from '@/components/how-to-read'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import { loadSubjectsPage, type SubjectsData } from '@/lib/pages/subjects'
import { subjectsList } from './list'
import { subjectsOwnPosts } from './own-posts'
import { subjectsSayHear } from './say-hear'
import { subjectsSubject } from './subject'
import { subjectsLine } from './line'
import { subjectsKinds } from './kinds'
import { subjectsVoices } from './voices'
import { subjectsUnanswered } from './unanswered'

// Subjects — the page (Phase 1 WP12, design §3 SU1–SU3, the mock's
// Subjects.dc.html).
//
// A RAIL AND A COLUMN, as the mock draws it: three narrow tiles on the left —
// the subject set, what you published, what you claimed — and the selected
// subject in full on the right. The selection is in the URL (`?item=`), which
// is how OV2's rows link here and how a reader can send a colleague the subject
// rather than the page.
//
// THE RAIL IS 240px, NOT THREE OF TWELVE COLUMNS (wave 2). The twelve-column
// PageGrid is the right frame for a page of equal tiles and the wrong one for
// this page: the mock's rail is a fixed 240 and its main column takes whatever
// is left, and the nearest span (3 of 12 = 280px at 1440) makes the chart 40px
// narrower than it was drawn. So the app arm composes the mock's own grid and
// `PageGrid` stays for the state where there is nothing to lay out. Every tile
// is still a `Tile`, so `data-col` / `data-row` still address it in print mode
// and `layoutFor` still decides what an export puts on a slide.

/** The words this page is measured against — the subject, the level under every
 *  figure, the band behind every change, and the two nouns the denominators are
 *  counted in. From `THIRTEEN_WORDS`, never invented here. */
const GLOSSARY_ITEMS: GlossaryKey[] = ['subject', 'level', 'change', 'audience', 'video', 'month']

export const SUBJECT_BLOCKS: readonly Block<SubjectsData>[] = [
  subjectsList,
  subjectsOwnPosts,
  subjectsSayHear,
  subjectsSubject,
  subjectsLine,
  subjectsKinds,
  subjectsVoices,
  subjectsUnanswered,
]

/** Column span and row height per block, in the grid's 12 columns and 116px row
 *  units — the print/export geometry, and the stacked geometry below `xl`. */
const LAYOUT: Record<string, { col: number; row: number }> = {
  'subjects.list': { col: 3, row: 4 },
  'subjects.ownposts': { col: 3, row: 3 },
  'subjects.sayhear': { col: 3, row: 2 },
  'subjects.subject': { col: 9, row: 2 },
  // FOUR ROWS, NOT THREE. A tile clips what does not fit (overflow-hidden), and
  // at three the chart's own footer link was cut in half.
  'subjects.line': { col: 9, row: 4 },
  'subjects.kinds': { col: 6, row: 3 },
  'subjects.unanswered': { col: 6, row: 3 },
  'subjects.voices': { col: 12, row: 3 },
}

/** The mock's own minimum heights, so a tile spreads to the shape it was drawn
 *  at instead of collapsing onto its shortest reading. */
const MIN_H: Record<string, string> = {
  'subjects.list': 'xl:min-h-[380px]',
  'subjects.ownposts': 'xl:min-h-[265px]',
  'subjects.sayhear': 'xl:min-h-[183px]',
  'subjects.subject': 'xl:min-h-[216px]',
  'subjects.line': 'xl:min-h-[340px]',
  'subjects.kinds': 'xl:min-h-[280px]',
  'subjects.unanswered': 'xl:min-h-[280px]',
  'subjects.voices': 'xl:min-h-[300px]',
}

/**
 * What the page draws, and how big.
 *
 * THE PAGE DECIDES WHAT TO DROP — that is the block contract's own division of
 * labour ("a tile keeps its size; a report drops a slide; an email drops a
 * section"). With no subject selected, five of the eight blocks are about a
 * subject that is not there, and drawing all eight printed the SAME sentence
 * eight times down two screens of empty tiles. Honest, and unreadable. The
 * three that are about the workspace rather than about a subject stay, at the
 * height of what they have to say.
 */
export function layoutFor(data: SubjectsData): { block: Block<SubjectsData>; col: number; row: number }[] {
  if (data.selected) {
    return SUBJECT_BLOCKS.map((block) => ({ block, ...(LAYOUT[block.key] ?? { col: 12, row: 2 }) }))
  }
  // TWO FULL ROWS OF TWELVE, not a ragged L. These spans are what the page
  // DRAWS in this state (the app arm reads them now), so they have to add up:
  // 4 + 8 and 6 + 6.
  return [
    { block: subjectsList, col: 4, row: 3 },
    { block: subjectsSubject, col: 8, row: 3 },
    { block: subjectsOwnPosts, col: 6, row: 3 },
    { block: subjectsSayHear, col: 6, row: 2 },
  ]
}

/** The app's context: RELATIVE links, so `next/link` navigates on the client
 *  instead of reloading the application to reach its own next page. */
export function subjectsContext(params: Record<string, string | undefined> = {}): BlockContext {
  return blockContext('', EMAIL, params)
}

/**
 * The context an EXPORT renders in — absolute, from `appBaseUrl()`.
 *
 * A RELATIVE LINK IS NOT A LINK ONCE IT LEAVES THE APP (fix pass). The page
 * module bound `subjectsContext()` for every mode, so a PDF, a scheduled email
 * and a `/r/<token>` share page all printed "the 26 videos behind your figure
 * →" pointing at `/dashboard/videos?subject=…` — relative to wherever the
 * reader happens to be. The render route already binds the right value for the
 * other block spine (`blockContext(appBaseUrl(), EMAIL)`, app/render/
 * [snapshotId]/page.tsx); this binds the same one here, and the app arm keeps
 * its relative links because on the app they are what makes `next/link`
 * navigate instead of reloading.
 */
function subjectsExportContext(): BlockContext {
  return blockContext(appBaseUrl(), EMAIL)
}

/**
 * One tile, at the mock's height, spreading its content (MASTER rule 8).
 *
 * THE SPAN COMES FROM `layoutFor`, NOT FROM `LAYOUT` (fix pass). This read
 * `LAYOUT[block.key]` directly, so the four spans `layoutFor` returns for the
 * no-selection arm — the arm production is in today — were dead: the page kept
 * the selected arm's 3 / 9 / 3 / 2 geometry and drew one 216px tile beside a
 * 1,150px rail with about 930px of white next to it. Two sources of truth for
 * one geometry, disagreeing on the only arm a real tenant sees.
 *
 * `minH` is the mock's own tile height and it belongs to the arm that has
 * something to fill it with: a 380px minimum under three lines of a refusal is
 * 250px of blank.
 */
function BlockTile({ block, data, ctx, col, row, minH = true, className }: {
  block: Block<SubjectsData>
  data: SubjectsData
  ctx: BlockContext
  col: number
  row: number
  minH?: boolean
  className?: string
}) {
  return (
    <Tile
      col={col}
      row={row}
      distribute="between"
      exportKey={block.key}
      className={[minH ? MIN_H[block.key] ?? '' : '', className ?? ''].filter(Boolean).join(' ')}
    >
      {block.render(data, 'app', ctx)}
    </Tile>
  )
}

export function SubjectsPage({
  data,
  params = {},
}: {
  data: SubjectsData | null
  params?: Record<string, string | undefined>
}) {
  if (!data) {
    return (
      <PageFrame>
        <SurfacePageBar nav="subjects" params={params}>
          <HowToRead items={GLOSSARY_ITEMS} basePath="/dashboard/subjects" anchor="subjects" />
        </SurfacePageBar>
        <PageGrid>
          <Tile col={12} row={2}>
            <TileEmpty>
              Nothing has been read for this workspace yet. Your subjects start being counted with the first update
              after you confirm them.
            </TileEmpty>
          </Tile>
        </PageGrid>
      </PageFrame>
    )
  }

  const ctx = subjectsContext(params)
  const layout = layoutFor(data)
  const drawn = new Map(layout.map((l) => [l.block.key, l]))
  // The rail-and-column composition is the SELECTED reading's; with nothing
  // selected there is no detail to sit beside, and `layoutFor` has already
  // said which four tiles survive and how wide each one is.
  const tile = (block: Block<SubjectsData>, className?: string) => {
    const at = drawn.get(block.key)
    return at
      ? <BlockTile block={block} data={data} ctx={ctx} col={LAYOUT[block.key]?.col ?? at.col} row={LAYOUT[block.key]?.row ?? at.row} className={className} />
      : null
  }

  return (
    <ExportScope
      page="subjects"
      params={params}
      tiles={layoutFor(data).map((l) => ({ key: l.block.key, title: l.block.title }))}
    >
      <PageFrame>
        <SurfacePageBar
          nav="subjects"
          params={params}
          context={{ brand: data.brand, month: data.month, status: data.monthStatus, readingAt: data.readingAt }}
          record={{ line: data.record.line, lines: data.record.lines }}
        >
          <HowToRead items={GLOSSARY_ITEMS} basePath="/dashboard/subjects" anchor="subjects" />
          <ExportMenu />
        </SurfacePageBar>

        {data.selected ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)] xl:items-start">
            <div className="flex flex-col gap-4">
              {tile(subjectsList)}
              {tile(subjectsOwnPosts)}
              {tile(subjectsSayHear)}
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              {tile(subjectsSubject)}
              {tile(subjectsLine)}
              {/* The mock's 1.35 : 1 pair — the kind mix reads as three rows of
                  bars and needs the width; the questions list is a list.
                  FLEX, NOT A GRID, and that is not a preference: `Tile` carries
                  `xl:col-span-N` for the PAGE's twelve columns, and a Tile
                  dropped into a two-column grid spans six of two and takes the
                  whole row. Flex ignores the span, so the two tiles sit side by
                  side and the same Tile still addresses itself correctly on a
                  printed slide. */}
              {drawn.has(subjectsKinds.key) ? (
                <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
                  {tile(subjectsKinds, 'h-full min-w-0 xl:basis-0 xl:grow-[1.35]')}
                  {tile(subjectsUnanswered, 'h-full min-w-0 xl:basis-0 xl:grow')}
                </div>
              ) : null}
            </div>
          </div>
          {tile(subjectsVoices)}
        </div>
        ) : (
          // NOTHING SELECTED: the twelve-column grid, at the spans `layoutFor`
          // returns — two full rows rather than one narrow tile beside a rail
          // and 930px of white. No minimum height either: the mock's tile
          // heights are for tiles with a reading in them, and a 380px floor
          // under three lines of a refusal is blank space that reads as a
          // rendering fault.
          <PageGrid>
            {layout.map(({ block, col, row }) => (
              <BlockTile key={block.key} block={block} data={data} ctx={ctx} col={col} row={row} minH={false} />
            ))}
          </PageGrid>
        )}

        {data.notes.length > 0 ? (
          <p className="m-0 text-[11px] text-muted-foreground">
            {/* ONE CAVEAT FOR A RUN OF MONTHS, never one per bar: the reading
                layer merges the series' notes by the union of their months
                (lib/reading/series.ts mergeSeriesNotes). */}
            {data.notes.map((n) => n.text).join(' ')}
          </p>
        ) : null}

        {/* THE METHOD FOOTNOTE (`subjects.method.footer`, D15). The mock ends
            the page on the mono line that says which clock each figure is on,
            what was read and what changed about our own tracking; the build had
            those facts only in the record drawer at the TOP of the page, where
            a reader who has just finished reading a figure is not looking.
            `methodLines` composes them once for every surface, so this page and
            the next cannot word the language share differently. */}
        {data.method ? (
          <p data-copy="figure" className="m-0 flex flex-col gap-0.5 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
            {data.method.lines.map((line, i) => (
              <span key={i} className={i === 0 ? 'text-secondary-foreground' : undefined}>{line}</span>
            ))}
          </p>
        ) : null}
      </PageFrame>
    </ExportScope>
  )
}

// ---- the renderable module (`subjects.shell`, the Export control) ------------

/**
 * Subjects, in the renderables registry.
 *
 * WHY IT WAS NOT THERE. Every Phase 1 surface renders through blocks and none
 * of them had a `PageModule`, so `/api/export` had no scope for this page and
 * the page bar had no Export — the one control the mock draws at the top right
 * of every artboard. A block already answers `render(data, mode, ctx)` for all
 * three modes, so a renderable is that call with the page's own context bound;
 * nothing here re-decides what a tile says.
 *
 * THE KEY IS THE BLOCK'S KEY. `report_snapshots.tile_key` and every stored PNG
 * are addressed by it, so `subjects.line` is `subjects.line` on paper, in an
 * email and in the app for as long as this page exists.
 */
const renderables: Record<string, Renderable<SubjectsData>> = Object.fromEntries(
  SUBJECT_BLOCKS.map((block) => [
    block.key,
    {
      key: block.key,
      title: block.title,
      render: (data: SubjectsData, mode) => block.render(data, mode, subjectsExportContext()),
      email: (data: SubjectsData) => block.render(data, 'email', subjectsExportContext()),
    } satisfies Renderable<SubjectsData>,
  ]),
)

export const subjectsPage: PageModule<SubjectsData> = {
  key: 'subjects',
  title: 'Subjects',
  async load(scope) {
    return loadSubjectsPage(scope)
  },
  slides(data): Slide[] {
    // TWO SLIDES, IN THE PAGE'S OWN ORDER. The set and what you published are
    // about the workspace; everything after the rule is about the one subject
    // the export was taken of, and a subject that is not selected takes no
    // slide about itself.
    const first: Slide = { title: 'Your subjects', keys: ['subjects.list', 'subjects.ownposts', 'subjects.sayhear'], layout: 'grid' }
    if (!data.selected) return [first]
    return [
      first,
      { title: data.selected.name, keys: ['subjects.subject', 'subjects.line'], layout: 'grid' },
      { title: `${data.selected.name} · what is being said`, keys: ['subjects.kinds', 'subjects.unanswered', 'subjects.voices'], layout: 'grid' },
    ]
  },
  renderables,
  snapshotTitle: (data) => `Subjects · ${data.brand} · ${fullDate(data.readingAt)}`,
}
