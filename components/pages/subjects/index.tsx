import type { Block, BlockContext } from '@/lib/blocks/types'
import type { PageModule, Renderable, Slide } from '@/lib/renderables/types'
import { blockContext } from '@/lib/blocks/types'
import { fullDate } from '@/lib/format'
import { EMAIL } from '@/lib/email/theme'
import { appBaseUrl } from '@/lib/site'
import { loadSubjectsPage, selectedNotReady, type SubjectsData } from '@/lib/pages/subjects'
import { printsMarket } from '@/lib/subjects/calibration-state'
import { subjectsList } from './list'
import { subjectsOwnPosts } from './own-posts'
import { subjectsSayHear } from './say-hear'
import { subjectsSubject } from './subject'
import { subjectsLine } from './line'
import { subjectsKinds } from './kinds'
import { subjectsVoices } from './voices'
import { subjectsUnanswered } from './unanswered'

// Subjects: the page module and its blocks (Phase 1 WP12).
//
// THE PAGE ITSELF MOVED (pages rebuild, 1 Oct): `/dashboard/subjects` renders
// `SubjectsPage` from ./page, built to Page-Subjects.dc.html. The blocks below
// left the page and stay in the registry, because stored snapshots and the
// briefs' borrowed sections still render them by key (`subjects.list`,
// `subjects.voices`, …), and a key that resolves to nothing is an empty tile in
// a sent artefact. Nothing here is drawn on the app any more.

export { SubjectsPage } from './page'

/** The blocks a subject that is not ready does not draw (T0a, ruling U6). */
const WITHHELD_WHEN_NOT_READY: readonly Block<SubjectsData>[] = [subjectsKinds, subjectsUnanswered, subjectsLine]

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
  // THE MARKET PAGE (WP2.2, the approved preview): with nothing selected (no
  // subject named, Össur) the rail says so in one line, and the pane, which
  // would only repeat it, is not drawn.
  if (isMarketSubjects(data) && !data.selected) {
    return [
      { block: subjectsList, col: 12, row: 2 },
      { block: subjectsOwnPosts, col: 6, row: 3 },
      { block: subjectsSayHear, col: 6, row: 2 },
    ]
  }
  // A SELECTED SUBJECT THAT IS NOT READY (T0a, SB-15; ruling U6): what people
  // do in its comments, the questions counted on it and its months all rest
  // on its unverified matching, so those three blocks are left out, not drawn
  // empty. Its name, its pane and its voices stay.
  if (isMarketSubjects(data) && data.selected && !printsMarket(data.selected.calibration)) {
    const withheld = new Set<string>(WITHHELD_WHEN_NOT_READY.map((b) => b.key))
    return SUBJECT_BLOCKS.filter((block) => !withheld.has(block.key)).map((block) => ({ block, ...(LAYOUT[block.key] ?? { col: 12, row: 2 }) }))
  }
  if (data.selected) {
    return SUBJECT_BLOCKS.map((block) => ({ block, ...(LAYOUT[block.key] ?? { col: 12, row: 2 }) }))
  }
  // TWO FULL ROWS OF TWELVE, not a ragged L. These spans are what the page
  // DRAWS in this state (the app arm reads them now), so they have to add up:
  // 4 + 8 and 6 + 6.
  // AND AT THE HEIGHT OF WHAT THEY HAVE TO SAY. The two tiles in the top row
  // hold three lines and one line of refusal; at the selected reading's own
  // heights they were 520px boxes of white.
  return [
    { block: subjectsList, col: 4, row: 2 },
    { block: subjectsSubject, col: 8, row: 2 },
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

/** Was this page built on the market (WP2.2)? The loader sets the rail's
 *  base on every page since; a stored page has none. */
export const isMarketSubjects = (data: SubjectsData): boolean => data.list.base !== undefined

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
    // THREE SLIDES WITH A SUBJECT, ONE WITHOUT, IN THE PAGE'S OWN ORDER. The
    // set and what you published are
    // about the workspace; everything after the rule is about the one subject
    // the export was taken of, and a subject that is not selected takes no
    // slide about itself.
    const first: Slide = { title: 'Your subjects', keys: ['subjects.list', 'subjects.ownposts', 'subjects.sayhear'], layout: 'grid' }
    if (!data.selected) return [first]
    // A SUBJECT THAT IS NOT READY TAKES NO SLIDE ITS PAGE DOES NOT DRAW (T0a,
    // ruling U6; review finding 3): its months, what people do in its comments
    // and the questions counted on it rest on unverified matching. Its name,
    // its pane and its voices stay, as on the page (`layoutFor`).
    const withheld = selectedNotReady(data) ? new Set<string>(WITHHELD_WHEN_NOT_READY.map((b) => b.key)) : new Set<string>()
    const keep = (keys: string[]) => keys.filter((k) => !withheld.has(k))
    return [
      first,
      { title: data.selected.name, keys: keep(['subjects.subject', 'subjects.line']), layout: 'grid' },
      { title: `${data.selected.name} · what is being said`, keys: keep(['subjects.kinds', 'subjects.unanswered', 'subjects.voices']), layout: 'grid' },
    ]
  },
  renderables,
  snapshotTitle: (data) => `Subjects · ${data.brand} · ${fullDate(data.readingAt)}`,
}
