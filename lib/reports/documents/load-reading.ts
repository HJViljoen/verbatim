import type { SupabaseClient } from '@supabase/supabase-js'

import { OVERVIEW_BLOCKS } from '../../../components/pages/overview'
import { SUBJECT_BLOCKS } from '../../../components/pages/subjects'
import { VOICE_BLOCKS } from '../../../components/pages/voice-surface'
import { MARKET_BLOCKS } from '../../../components/pages/market-surface'
import { COMPETITIVE_BLOCKS } from '../../../components/pages/competitive-surface'
import { audienceInLabel, loadOverview, type OverviewData } from '../../pages/overview'
import { loadSubjectsPage } from '../../pages/subjects'
import { loadVoiceSurface } from '../../pages/voice-surface'
import { loadMarketSurface } from '../../pages/market-surface'
import { loadCompetitiveSurface } from '../../pages/competitive-surface'
import { computeReadiness } from '../../readiness/compute'
import { loadReadiness } from '../../readiness/load'
import { OWNER_LABEL } from '../../readiness/types'
import { loadRecordInputs, monthRecordWindow, totalPlatformMix } from '../../reading/record'
import { DEFAULT_HORIZON } from '../../reading/horizon'
import type { Scope } from '../../renderables/types'
import type { Block } from '../../blocks/types'
import { blockReading, denominatorsOf, mergeReadings, monthAndYear, type BriefReading } from './reading'
import { briefMap, missingInputs, missingSentence, sectionsOf, surfacesOf, type BriefEntry, type BriefSurface, type MissingInput, type ReadinessLike } from './sections'
import type { DocBriefSection, DocumentRole } from './types'

/**
 * The I/O half of a brief's reading (Phase 1 WP19).
 *
 * Kept out of `reading.ts` so the pure half is testable under the repo's own
 * rule — tests are pure logic; nothing here mocks a page loader to prove a
 * page loader works.
 *
 * WHAT IT LOADS AND WHAT IT DOES NOT. Only the surfaces this brief's section
 * map actually names (`surfacesOf`). A page loader is seconds of reads against
 * the tenant's whole corpus, and the leadership brief has no business paying
 * for Market's because the content brief wants it.
 *
 * EVERY READ DEGRADES RATHER THAN THROWS. M1–M8 are authored and unapplied;
 * a surface that cannot be read leaves its sections empty and the brief prints
 * what it has, which is the same rule the blocks themselves already follow.
 * A brief that fails to build because a migration is a day behind is worse
 * than a brief that says what it could not read.
 */

/** Every surface's block array, by key. The one table; a surface that is not
 *  in it cannot be named by a section map (asserted in sections.test.ts). */
const BLOCKS: Record<BriefSurface, readonly Block<never>[]> = {
  overview: OVERVIEW_BLOCKS as readonly Block<never>[],
  subjects: SUBJECT_BLOCKS as readonly Block<never>[],
  voice: VOICE_BLOCKS as readonly Block<never>[],
  market: MARKET_BLOCKS as readonly Block<never>[],
  competitive: COMPETITIVE_BLOCKS as readonly Block<never>[],
}

export const blocksFor = (surface: BriefSurface): readonly Block<never>[] => BLOCKS[surface]

type SurfaceLoader = (scope: Scope) => Promise<unknown | null>

const LOADERS: Record<BriefSurface, SurfaceLoader> = {
  overview: loadOverview as SurfaceLoader,
  subjects: loadSubjectsPage as SurfaceLoader,
  voice: loadVoiceSurface as SurfaceLoader,
  market: loadMarketSurface as SurfaceLoader,
  competitive: loadCompetitiveSurface as SurfaceLoader,
}

export interface BriefReadingOptions {
  role: DocumentRole
  /** The instant this brief reads at. Frozen once per build and passed in;
   *  see `researchStep`. */
  now?: string
}

export interface BriefReadingResult {
  /** Null where the workspace has no monthly reading at all. */
  reading: BriefReading | null
  /** Each named surface's loader output, frozen into the snapshot so the deck
   *  can render its blocks in print mode. */
  surfaces: Partial<Record<BriefSurface, unknown>>
  missing: MissingInput[]
  map: readonly BriefEntry[]
  /** The borrowed blocks, resolved against what was actually read. */
  sections: DocBriefSection[]
}

export async function loadBriefReading(scope: Scope, options: BriefReadingOptions): Promise<BriefReadingResult> {
  const map = briefMap(options.role)
  const wanted = surfacesOf(map)
  const readingAt = options.now ?? new Date().toISOString()
  // A BRIEF IS A READING OF ONE MONTH, AND THE SURFACES ARE READ ON THAT
  // MONTH. The reading's stamp, its denominators and the method page's basis
  // are all the single current month (`overview.month`, and
  // `monthRecordWindow` around it) — there is no second vocabulary for them.
  // Handing the loaders any other horizon therefore produced window-scoped
  // figures under a month label: measured on production, the sales brief's
  // "videos carrying a question in this window" read 10 at `this_month` and 47
  // at `last_12`, under an identical "September 2026" stamp and an identical
  // denominator line. The window control is withdrawn until the stamp, the
  // denominators and the basis paragraph can all carry a window; a number over
  // the wrong period under a month label is the failure item 43 exists to
  // remove.
  const surfaceScope: Scope = { ...scope, params: { ...scope.params, horizon: DEFAULT_HORIZON } }

  // Overview is always loaded: it is where the month, its status and the
  // reading's own caveats come from, and three of the four maps borrow from it
  // anyway. A map that names none of its blocks still gets the stamp.
  const needed = wanted.includes('overview') ? wanted : (['overview', ...wanted] as BriefSurface[])
  const loaded = await Promise.all(
    needed.map(async (surface) => {
      try {
        return [surface, await LOADERS[surface](surfaceScope)] as const
      } catch (e) {
        console.error(`[documents] brief surface ${surface}: ${(e as { message?: string })?.message ?? String(e)}`)
        return [surface, null] as const
      }
    }),
  )
  const surfaces: Partial<Record<BriefSurface, unknown>> = {}
  for (const [surface, data] of loaded) if (data != null && wanted.includes(surface)) surfaces[surface] = data

  const overview = (loaded.find(([s]) => s === 'overview')?.[1] ?? null) as OverviewData | null
  const missing = await missingFor(scope, map, readingAt)
  const sections = briefSections(map, surfaces, missing)

  if (!overview) return { reading: null, surfaces, missing, map, sections }

  const parts = loaded
    .filter(([surface, data]) => data != null && wanted.includes(surface))
    .map(([surface, data]) => blockReading(BLOCKS[surface], data as never))
  const merged = mergeReadings(parts.length > 0 ? parts : [blockReading(BLOCKS.overview, overview as never)])

  const record = await loadRecordInputs(
    scope.reading.client as SupabaseClient,
    scope.clientId,
    monthRecordWindow(overview.month, readingAt),
    { now: readingAt },
  ).catch((e) => {
    console.error(`[documents] brief record: ${(e as { message?: string })?.message ?? String(e)}`)
    return null
  })

  const reading: BriefReading = {
    month: overview.month,
    monthLabel: monthAndYear(overview.month),
    monthStatus: overview.monthStatus,
    readingAt,
    window: overview.window,
    measured: merged.measured,
    figures: merged.figures,
    verdicts: merged.verdicts,
    denominators: denominatorsOf(record?.coverage ?? null, audienceInLabel),
    platformMix: record?.coverage ? totalPlatformMix(record.coverage) : {},
    notes: overview.notes.map((n) => n.text).filter(Boolean),
    // Decision L: a reading crosses a clustering boundary with the label, never
    // without it. The series already names the stretches it could not compare
    // like for like; a build inherits the same caveat rather than inventing a
    // second rule for the same fact.
    crossesClustering: overview.notes.some((n) => n.kind === 'clustering_changed' || n.kind === 'split_keys'),
  }
  return { reading, surfaces, missing, map, sections }
}

/**
 * The borrowed blocks, resolved.
 *
 * A section's `empty` is the ONE line printed in its place, and the order of
 * preference is the design's: the missing-input sentence first, because
 * "we have not recorded your subjects, and here is who closes it" is a better
 * answer than the block's own "nothing to show"; then the surface's own failure
 * to read; then the block's empty state; then null, which means the block has
 * something to draw.
 */
export function briefSections(
  map: readonly BriefEntry[],
  surfaces: Partial<Record<BriefSurface, unknown>>,
  missing: readonly MissingInput[],
): DocBriefSection[] {
  const byId = new Map(missing.map((m) => [m.id, m]))
  return sectionsOf(map).map((s) => {
    const blocked = s.needs.map((n) => byId.get(n)).find(Boolean)
    const data = surfaces[s.surface]
    const block = BLOCKS[s.surface].find((b) => b.key === s.block)
    const empty = blocked
      ? missingSentence(blocked)
      : data == null
        ? 'This section could not be read for this month.'
        : block
          ? block.emptyState(data as never)
          : 'This section names a block this build does not know how to draw.'
    return { id: s.id, block: s.block, surface: s.surface, title: s.title, framing: s.framing, empty }
  })
}

/** What this brief needed and the workspace has not recorded. Read through the
 *  readiness rows, which already carry the input's client wording, its owner
 *  and the act that closes it — so a brief and Settings › Readiness cannot
 *  come to say different things about one gap. */
async function missingFor(scope: Scope, map: readonly BriefEntry[], now: string): Promise<MissingInput[]> {
  try {
    const inputs = await loadReadiness(scope.reading.client as SupabaseClient, scope.clientId, new Date(now))
    const rows: ReadinessLike[] = computeReadiness(inputs).map((r) => ({
      id: r.id,
      input: r.input,
      status: r.status,
      owner: OWNER_LABEL[r.owner],
      ownerRole: r.owner,
      unlocks: r.unlocks,
    }))
    return missingInputs(map, rows)
  } catch (e) {
    // A readiness read that failed is not thirteen missing inputs. The brief
    // prints its sections and says nothing it cannot support.
    console.error(`[documents] brief readiness: ${(e as { message?: string })?.message ?? String(e)}`)
    return []
  }
}
