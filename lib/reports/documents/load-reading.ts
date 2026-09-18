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
import { methodLines } from '../../reading/method'
import { deliveryRecord } from '../../settings/delivery'
import { loadUpdates } from '../../settings/record-load'
import { DEFAULT_HORIZON } from '../../reading/horizon'
import type { Scope } from '../../renderables/types'
import type { Block } from '../../blocks/types'
import { blockReading, denominatorsOf, mergeReadings, monthAndYear, type BriefReading } from './reading'
import type { Gap } from '../../reading/gap'
import { briefMap, missingInputs, missingSentence, sectionsOf, surfacesOf, untrackedNotes, type BriefEntry, type BriefSurface, type MissingInput, type ReadinessLike, type UntrackedNote } from './sections'
import {
  cannotTell,
  crosscheckLine,
  monthLine,
  scriptedLines,
  switchingFigure,
  type CannotTell,
  type MonthLine,
  type ScriptedLine,
  type SwitchingFigure,
  type SwitchingVideo,
} from './figures'
import { monthlyLineLabel } from '../../pages/overview'
import { CLIENT_AUDIENCE } from '../../rivals'
import { selectAll } from '../../supabase-admin'
import { fold } from '../../gather/util'
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

/**
 * The figures a BRIEF'S SLIDES may print that no page block declares
 * (package D7).
 *
 * NOT `documentFigures`, WHICH IS TWENTY LINES AWAY IN THIS DIRECTORY.
 * `compose.ts` exports `documentFigures(signals, answers): FigureTable` — the
 * MODEL's figure-key table, the `[[key]]`s a written sentence may name. This
 * is slide DATA. Given how carefully the two `FigureTable`s are kept apart
 * (AGENTS.md), two things called "document figures" in one directory is an
 * invitation, so this one says whose figures it is and what they are for.
 *
 * WHY THEY HANG OFF THE RESULT AND NOT OFF `BriefReading`. `BriefReading` is
 * what a snapshot freezes and what the method page is composed from — the
 * month, its denominators, its verdicts. These four are slide material for
 * three slides of one brief, and two of them (the pool, the drafted sentence)
 * are not month readings at all. Keeping them here means a build that does not
 * want them pays nothing and a reader of `BriefReading` is not handed a shape
 * whose basis is different from everything beside it.
 */
export interface BriefSlideFigures {
  /** `sales.p7.cannottell` — the refusals this reading declined, printed. */
  cannotTell: CannotTell
  /** `sales.p5.figure`. Null where nothing named both. */
  switching: SwitchingFigure | null
  /** `sales.p5.crosscheck`. Null where there is no objection to square it
   *  against. */
  crosscheck: string | null
  /** `sales.p6.rows`. Empty where no objection cleared the floor. */
  scripted: ScriptedLine[]
  /** `sales.p2.chart`. Null where the month axis could not be read. */
  line: MonthLine | null
  /** `sales.p4.untracked` — what is not tracked, and whose job it is, by role. */
  untracked: UntrackedNote[]
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
  /** What this brief's slides may print beyond the blocks (package D7). */
  slideFigures: BriefSlideFigures
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
  const readiness = await readinessFor(scope, readingAt)
  const missing = missingInputs(map, readiness)
  const sections = briefSections(map, surfaces, missing)
  const untracked = untrackedNotes(map, readiness)

  if (!overview) {
    return {
      reading: null,
      surfaces,
      missing,
      map,
      sections,
      slideFigures: { cannotTell: cannotTell([]), switching: null, crosscheck: null, scripted: [], line: null, untracked },
    }
  }

  const parts = loaded
    .filter(([surface, data]) => data != null && wanted.includes(surface))
    .map(([surface, data]) => blockReading(BLOCKS[surface], data as never))
  const merged = mergeReadings(parts.length > 0 ? parts : [blockReading(BLOCKS.overview, overview as never)])

  // THE RECORD, AND THE DELIVERY RECORD BESIDE IT. The first is the month's,
  // comment-dated; the second is all-time and run-dated, and it is the one
  // figure a run's own clock is the honest index for. Two reads, in parallel,
  // and neither recomputes anything an app surface already computes:
  // `deliveryRecord` is the same composer Settings › The record prints, so a
  // brief and that page cannot disagree about how many updates a workspace
  // has had.
  const [record, updates] = await Promise.all([
    loadRecordInputs(
      scope.reading.client as SupabaseClient,
      scope.clientId,
      monthRecordWindow(overview.month, readingAt),
      { now: readingAt },
    ).catch((e) => {
      console.error(`[documents] brief record: ${(e as { message?: string })?.message ?? String(e)}`)
      return null
    }),
    loadUpdates(scope.reading.client as SupabaseClient, scope.clientId).catch((e) => {
      console.error(`[documents] brief delivery: ${(e as { message?: string })?.message ?? String(e)}`)
      return null
    }),
  ])

  const reading: BriefReading = {
    month: overview.month,
    monthLabel: monthAndYear(overview.month),
    monthStatus: overview.monthStatus,
    readingAt,
    window: overview.window,
    measured: merged.measured,
    figures: merged.figures,
    verdicts: merged.verdicts,
    // D1 · the two-audience gaps, off Overview's own subject rows. The brief
    // borrows the page's reading rather than taking a second one, which is the
    // rule this module exists to keep: a brief's numbers are the numbers the
    // reader saw.
    gaps: Object.values(overview.subjects.gaps).filter((g): g is Gap => g != null),
    denominators: denominatorsOf(record?.coverage ?? null, audienceInLabel),
    platformMix: record?.coverage ? totalPlatformMix(record.coverage) : {},
    notes: overview.notes.map((n) => n.text).filter(Boolean),
    // Decision L: a reading crosses a clustering boundary with the label, never
    // without it. The series already names the stretches it could not compare
    // like for like; a build inherits the same caveat rather than inventing a
    // second rule for the same fact.
    crossesClustering: overview.notes.some((n) => n.kind === 'clustering_changed' || n.kind === 'split_keys'),
    method: record ? methodLines(record, { brand: overview.brand, readingAt }) : null,
    delivery: updates ? deliveryRecord({ updates: updates.updates, slotsRecorded: updates.slotsRecorded }).line : null,
    // OFF THE OVERVIEW THIS BRIEF ALREADY LOADED, never recomputed. Both are
    // sentences the page composes and no document has ever printed; the
    // caveat matters MORE on a PDF, where the reader cannot see the column
    // that carries the month.
    counter: overview.bar.counter,
    hollow: overview.subjects.note,
  }

  // WHAT THE DOCUMENTS MAY PRINT BEYOND THE BLOCKS (package D7). Every one of
  // these is built from what was ALREADY read above, except the switching
  // pool, which is one bounded read of the tenant's own videos. Nothing here
  // can fail the brief: each arm answers with the honest absence.
  const slideFigures = await briefSlideFigures(scope, {
    reading,
    overview,
    readingAt,
    untracked,
  })
  return { reading, surfaces, missing, map, sections, slideFigures }
}

// ── the document-only figures ──────────────────────────────────────────────

/**
 * The switching pool: the tenant's OWN videos whose account, caption or
 * hashtags also name a tracked rival.
 *
 * THE SAME RULE `month_denominators.dual_mention` USES, in the same words —
 * fold to lowercase, strip diacritics, plain substring, over
 * `account + caption + hashtags`. The naive alternative the plan allowed
 * (`is_client and competitor_name is not null`) is 0 on every row in
 * production, because `tagVideo` gives the client tag priority and clears
 * `competitor_name` when it fires; this rule finds the 54 Össur videos that
 * fallback misses. Measured read-only 2026-09-18: 54 on Össur, 0 on Sealand.
 *
 * AND IT IS DATED BY `upload_date`, NOT BY THE COMMENT. "This video names both
 * and leans this way" is a property of the VIDEO — its caption and its stored
 * sentiment — so the video's own date is the honest key, and the basis travels
 * with the figure because a reader who is not told will read it as a month
 * reading. (AGENTS.md: a figure that is genuinely a property of a video is
 * dated by `videos.upload_date` and says so.)
 */
async function loadSwitchingPool(
  scope: Scope,
  window: { from: string; to: string },
): Promise<{ videos: SwitchingVideo[]; rivals: string[] } | null> {
  try {
    const admin = scope.reading.client as SupabaseClient
    const configRes = await admin
      .from('tracking_configs')
      .select('competitor_names')
      .eq('client_id', scope.clientId)
      .limit(1)
    const names = ((configRes.data?.[0] as { competitor_names?: string[] } | undefined)?.competitor_names ?? [])
      .map((n) => fold(n))
      .filter(Boolean)
    if (names.length === 0) return null
    const own = await selectAll<{ id: string; sentiment: string | null; account_name: string | null; caption: string | null; hashtags: string[] | null }>(
      () =>
        admin
          .from('videos')
          .select('id, sentiment, account_name, caption, hashtags')
          .eq('client_id', scope.clientId)
          .eq('is_client', true)
          .gte('upload_date', window.from.slice(0, 10))
          .lt('upload_date', window.to.slice(0, 10))
          .order('id', { ascending: true }),
    )
    const videos = own
      .filter((v) => {
        const hay = fold(`${v.account_name ?? ''} ${v.caption ?? ''} ${(v.hashtags ?? []).join(' ')}`)
        return names.some((n) => hay.includes(n))
      })
      .map((v) => ({ id: v.id, sentiment: v.sentiment }))
    return { videos, rivals: names }
  } catch (e) {
    console.error(`[documents] switching pool: ${(e as { message?: string })?.message ?? String(e)}`)
    return null
  }
}

/** The one subject row `sales.p2.chart` is drawn from, named for what it is. */
export interface ChartLead {
  months: readonly string[]
  label: string
  points: (number | null)[]
}

/**
 * The lead subject's series, labelled with the subject AND the category.
 *
 * THE LABEL NAMES THE SUBJECT, BECAUSE THE NUMBERS ARE THE SUBJECT'S.
 * `SubjectRow.spark` is that subject's share of the CATEGORY's month
 * (lib/pages/overview.ts) — not the category's own series — and labelling it
 * `category.label` printed the category's name over one subject's line. The
 * quarterly's chart, built in this same package, names it
 * `${subject} · ${category}` (lib/pages/quarterly.ts); two surfaces of one
 * product must not disagree about what the same numbers are called.
 *
 * AND THE LEAD IS THE FIRST ROW THAT HAS A SERIES. Taken blind, `rows[0]`
 * whose spark is all nulls yields a chart that silently has nothing in it —
 * the same guard the quarterly already applies, applied here.
 *
 * ONE SIDE, NOT TWO. The brief asked for a two-series line; the tenant's own
 * side carries no month series on a subject row, so there is one side here and
 * the shape says so rather than drawing a second line off the same numbers.
 */
export function chartLead(
  rows: readonly { label: string; spark: (number | null)[]; sparkMonths: string[] }[],
  categoryLabel: string,
): ChartLead | null {
  const lead = rows.find((r) => r.spark.some((p) => p != null)) ?? null
  if (!lead) return null
  return { months: lead.sparkMonths, label: `${lead.label} · ${categoryLabel}`, points: lead.spark }
}

export async function briefSlideFigures(
  scope: Scope,
  a: { reading: BriefReading; overview: OverviewData; readingAt: string; untracked: UntrackedNote[] },
): Promise<BriefSlideFigures> {
  const pool = await loadSwitchingPool(scope, a.reading.window)
  const switching = pool
    ? switchingFigure({
        window: { kind: 'month', from: a.reading.window.from, to: a.reading.window.to },
        audience: CLIENT_AUDIENCE,
        audienceLabel: audienceInLabel(CLIENT_AUDIENCE),
        videos: pool.videos,
        basis: 'dated by when each video was posted, not by when the conversation under it happened',
      })
    : null

  // THE OBJECTION KIND, WITH ITS OWN DENOMINATOR. `month_kind_readings` is the
  // only place an objection is counted, and a kind is an independent share of
  // ONE denominator — so this is never divided into anything or added to
  // anything (decision T: measured, the per-kind counts run to 228% of
  // Sealand's September).
  const objectionKind = a.overview.category.kinds.find((k) => k.kind === 'objection') ?? null
  const objection = objectionKind && objectionKind.denominator > 0
    ? { label: objectionKind.label, value: { k: objectionKind.videos, n: objectionKind.denominator } }
    : null

  // NOT A "BECAUSE" LIST — "ALSO RUNNING". The mock prints three bare phrases
  // under the objection, and the three the loader can count are the month's
  // biggest SUBJECTS. A subject and a kind are orthogonal dimensions over
  // different denominators: nothing here measured a relation between them, so
  // the same three would appear under any objection whatever it was. Each
  // carries its own n and is printed as context of the same month, never as a
  // cause — the standard `figures.ts` holds one line above ("A REASON WITH NO
  // DENOMINATOR IS NOT A REASON") and this loader was quietly failing.
  const alsoRunning = a.overview.subjects.rows
    .map((row) => ({ label: row.label, value: { k: row.category.k ?? 0, n: row.category.n ?? 0 } }))
    .filter((b) => b.value.n > 0 && b.value.k > 0)
    .sort((x, y) => y.value.k - x.value.k)
    .slice(0, 3)

  const scripted = objection
    ? scriptedLines({
        figures: a.reading.measured,
        lines: [
          {
            // ONE ROW, AND IT SAYS WHAT IT IS. The mock asks for a row per
            // objection THEME; `theme_registry` carries no kind, so the only
            // place an objection is counted on this corpus is the aggregate
            // kind share — one row, with no registry identity and `source`
            // saying so, rather than several rows we cannot substantiate or a
            // synthetic id a render would follow into nothing.
            objection: { label: objection.label, registryId: null, source: 'kind', value: objection.value },
            // No reason for this objection was measured, so none is claimed.
            because: [],
            alsoRunning,
            // NO DRAFT AND NO MODEL CALL. The scripted sentence is the writer's
            // and reaches this shape through the build that wrote it; a loader
            // that invented one would be the one thing `scrubProse` exists to
            // stop. Until a build passes one in, the row is the objection and
            // its reasons — short, and true.
            draft: null,
            quote: a.overview.sentence.voices[0]?.quote ?? null,
          },
        ],
      })
    : []

  // THE TWO-SERIES LINE. Only the side with the n is drawn, and below three
  // readings `monthlyLineLabel` names the months instead — the build's own
  // answer to D3, applied to a document.
  const lead = chartLead(a.overview.subjects.rows, a.overview.category.label)
  const line = lead
    ? monthLine({ months: lead.months, labelFor: monthlyLineLabel, series: [{ label: lead.label, points: lead.points }] })
    : null

  return {
    cannotTell: cannotTell(a.reading.verdicts),
    switching,
    crosscheck: switching ? crosscheckLine(switching, objection) : null,
    scripted,
    line,
    untracked: a.untracked,
  }
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
    // `sheet` / `span` travel onto the snapshot, because pagination is decided
    // from the frozen artefact and never from today's map: a brief built
    // before the sheets were cut must keep paginating the way it printed.
    return {
      id: s.id, block: s.block, surface: s.surface, title: s.title, framing: s.framing, empty,
      ...(s.sheet ? { sheet: s.sheet } : {}),
      ...(s.span ? { span: s.span } : {}),
    }
  })
}

/** What this brief needed and the workspace has not recorded. Read through the
 *  readiness rows, which already carry the input's client wording, its owner
 *  and the act that closes it — so a brief and Settings › Readiness cannot
 *  come to say different things about one gap. */
async function readinessFor(scope: Scope, now: string): Promise<ReadinessLike[]> {
  try {
    const inputs = await loadReadiness(scope.reading.client as SupabaseClient, scope.clientId, new Date(now))
    return computeReadiness(inputs).map((r) => ({
      id: r.id,
      input: r.input,
      status: r.status,
      owner: OWNER_LABEL[r.owner],
      ownerRole: r.owner,
      unlocks: r.unlocks,
    }))
  } catch (e) {
    // A readiness read that failed is not thirteen missing inputs. The brief
    // prints its sections and says nothing it cannot support.
    console.error(`[documents] brief readiness: ${(e as { message?: string })?.message ?? String(e)}`)
    return []
  }
}
