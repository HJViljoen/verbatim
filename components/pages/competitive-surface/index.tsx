import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { ExportMenu, ExportScope } from '@/components/export-menu'
import { HowToRead } from '@/components/how-to-read'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import type { GlossaryKey } from '@/lib/calibration'
import type { MethodLines } from '@/lib/reading/method'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import { competitiveRivals } from './rivals'
import { competitiveStandings } from './standings'
import { competitiveHeadToHead } from './head-to-head'
import { competitiveOwnClaims } from './own-claims'
import { competitiveSaidAbout } from './said-about'
import { competitiveQuestions } from './questions'
import { competitivePlaybook } from './playbook'
import { competitiveUnlocks } from './unlocks'

// Competitive — the page (Phase 1 WP14, design §3 CO1–CO7; ported to the
// artboard in Block D wave 2).
//
// THE SELECTION SCOPES THE SURFACE. CO1 is first because everything under it is
// about one rival; `?vs=` carries that selection, and the horizon control
// carries the reader's window through every link the page draws.
//
// THE ARTBOARD'S COMPOSITION, NOT A STACK OF FULL-WIDTH BANDS. Every block was
// `col={12}`, so the page was four bands down a twelve-column grid where the
// artboard runs 12 / 7+5 / 3+4+5 / 12 — roughly nine tiles against four, in
// about half the vertical space per unit of content (mock-gap's own measure).
// `SPAN` below is read off the artboard's own `grid-column: span N`
// declarations rather than guessed.
//
// CO1 IS NOT A TILE ANY MORE. The artboard puts the rival selection inline
// under the soundness band — a pill row outside any card — because it is a
// CONTROL for the page and not a reading of it. A full-width card with an
// uppercase eyebrow and a block question, which is what it was, gave a selector
// the weight of a finding.
//
// THE FINDINGS RAIL (CO6) IS STILL NOT BUILT, and its five columns are where
// "Not on this page yet" now sits, so the artboard's third row still adds to
// twelve. CO6 needs a finding identity that survives an update: `recurrenceOf`
// is built and waiting, and nothing loads a `monthsSeen` for it to key on.

export const COMPETITIVE_BLOCKS: readonly Block<CompetitiveSurfaceData>[] = [
  competitiveRivals,
  competitiveStandings,
  competitiveHeadToHead,
  competitiveOwnClaims,
  competitiveSaidAbout,
  competitiveQuestions,
  competitivePlaybook,
  competitiveUnlocks,
]

/** The blocks that are TILES, in the artboard's order. CO1 is drawn inline
 *  above the grid and is deliberately absent. */
export const COMPETITIVE_TILES: readonly Block<CompetitiveSurfaceData>[] = [
  competitiveStandings,
  competitiveHeadToHead,
  competitiveOwnClaims,
  competitiveSaidAbout,
  competitiveQuestions,
  competitiveUnlocks,
  competitivePlaybook,
]

/** The artboard's twelve-column grid: `span 12` · `span 7` + `span 5` ·
 *  `span 3` + `span 4` + `span 5` · `span 12`. Rows are 116px units. */
const SPAN: Record<string, { col: number; row: number }> = {
  'competitive.months': { col: 12, row: 6 },
  'competitive.h2h': { col: 7, row: 4 },
  'competitive.ownclaims': { col: 5, row: 4 },
  'competitive.saidabout': { col: 3, row: 4 },
  'competitive.questions': { col: 4, row: 4 },
  'competitive.unlocks': { col: 5, row: 4 },
  'competitive.playbook': { col: 12, row: 3 },
}

/** The app's context: RELATIVE links. */
export function competitiveContext(params: Record<string, string | undefined> = {}): BlockContext {
  return blockContext('', EMAIL, params)
}

/** The words this page is measured against. Every one is in `THIRTEEN_WORDS`
 *  (lib/calibration.ts) — a new reading surface prints no term outside the
 *  thirteen and the two flags, and the legend may not explain one it does not
 *  print. */
const LEGEND: GlossaryKey[] = ['audience', 'rival', 'video', 'level', 'change', 'month']

/**
 * The method footnote across the page foot (the artboard's §3.16).
 *
 * LOCAL, AND NOT `components/print/method-note.tsx`. That one takes
 * `MethodNoteData` — a company, a period, a platform list and two counts — and
 * is mounted on printed and shared artefacts. This page holds `MethodLines`,
 * which is the composed sentences plus the BASIS each of them is stated on,
 * and widening the shared component to take a second shape would be a change
 * to a file this wave says to leave alone. Same markup, same 9.5px mono, same
 * place on the page.
 */
function PageMethod({ method }: { method: MethodLines }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
      {method.lines.map((line, i) => (
        <p key={i} className="m-0">
          {i === 0 ? <span className="text-secondary-foreground">{line}</span> : line}
        </p>
      ))}
    </div>
  )
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
    <ExportScope page="competitive" params={params} tiles={COMPETITIVE_TILES.map((b) => ({ key: b.key, title: b.title }))}>
      <PageFrame>
        <SurfacePageBar
          nav="competitive"
          params={params}
          context={{ brand: data.brand, month: data.month, status: data.monthStatus, readingAt: data.readingAt }}
          record={{ line: data.record.line, lines: data.record.lines }}
        >
          <ExportMenu />
          <HowToRead items={LEGEND} basePath="/dashboard/competitive" anchor="competitive" />
        </SurfacePageBar>
        {/* CO1, inline: the artboard's RIVAL pill row, under the band and
            outside any card. */}
        {competitiveRivals.render(data, 'app', ctx)}
        <PageGrid>
          {COMPETITIVE_TILES.map((block) => {
            const span = SPAN[block.key] ?? { col: 12, row: 2 }
            return (
              <Tile key={block.key} col={span.col} row={span.row} exportKey={block.key} distribute="between">
                {block.render(data, 'app', ctx)}
              </Tile>
            )
          })}
        </PageGrid>
        {/* THE METHOD FOOTNOTE. `MethodNote` existed and was mounted only on
            printed and shared artefacts, so no app page printed one and the
            platform mix, the videos analysed and "comparisons refused: 2" lived
            in a drawer. */}
        {data.method ? <PageMethod method={data.method} /> : null}
      </PageFrame>
    </ExportScope>
  )
}
