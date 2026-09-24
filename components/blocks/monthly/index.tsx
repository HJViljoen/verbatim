import type { Block } from '@/lib/blocks/types'
import {
  MONTHLY_BLOCK_KEYS,
  MONTHLY_MOVES_EMPTY,
  type MonthlyBlockKey,
} from '@/lib/reports/monthly'
import type { MonthlyData } from '@/lib/pages/monthly'
import type { OverviewData } from '@/lib/pages/overview'
import { overviewSubjects } from '@/components/pages/overview/subjects'
import { overviewRivals } from '@/components/pages/overview/rivals'
import { overviewMoves } from '@/components/pages/overview/moves'
import { overviewRecord } from '@/components/pages/overview/record'
import { fromOverview } from './adapt'
import { monthlySubjectsEmail } from './subjects'
import { monthlyRivalsEmail } from './rivals'
import { monthlyMovesEmail } from './moves'
import { monthlySoundEmail } from './sound'
import { monthlyMonth } from './month'
import { monthlyMovers } from './movers'
import { monthlyVoices } from './voices'
import { monthlyDecide } from './decide'

/**
 * The monthly report's eight blocks, by key (Phase 1 WP18).
 *
 * FIVE ARE OVERVIEW'S, THREE ARE THIS ARTEFACT'S. The five are adapted rather
 * than copied (`fromOverview`), so the report and the page cannot print one
 * month two ways; the three are the ones the page has no equivalent of — the
 * month's own opening, ten movers with a line each, one voice per subject and
 * the labelled decision.
 *
 * `MONTHLY_BLOCKS` is a RECORD and not an array, because a stored arrangement
 * is a list of keys and a build must be able to resolve one without scanning.
 *
 * AND THREE OF THE FIVE DRAW THEIR OWN EMAIL ARM (Block D wave 2, E-monthly).
 * The fourth argument to `fromOverview` replaces the MARKUP of one mode and
 * nothing else: same projected data, same fields, same verdicts, same words,
 * and `figures` / `verdicts` / `quotes` / `emptyState` still the page's. It
 * exists because a page's email arm is a fallback for a table three feet away,
 * while on this artefact the email IS the document — six subjects across four
 * aligned columns, seven rivals with a level and a band each — and Overview's
 * arm stacks all of it into full-width lines. The record block keeps the
 * page's arm, because a paragraph is a paragraph in every mode.
 */
export const MONTHLY_BLOCKS: Record<MonthlyBlockKey, Block<MonthlyData>> = {
  'monthly.month': monthlyMonth,
  'monthly.subjects': fromOverview('monthly.subjects', overviewSubjects, undefined, monthlySubjectsEmail),
  'monthly.movers': monthlyMovers,
  'monthly.rivals': fromOverview('monthly.rivals', overviewRivals, undefined, monthlyRivalsEmail),
  'monthly.moves': fromOverview('monthly.moves', overviewMoves, artefactMoves, monthlyMovesEmail),
  'monthly.voices': monthlyVoices,
  'monthly.decide': monthlyDecide,
  'monthly.sound': fromOverview('monthly.sound', overviewRecord, undefined, monthlySoundEmail),
}

/**
 * OV5, said the way an artefact has to say it.
 *
 * The page's two sentences name a control the reader can press and a page they
 * can open, and one of them is the build state of a feature that has not
 * shipped ("Scoring, and the pre-filled monthly card, are not built yet. They
 * will land on Market."). This artefact is emailed to a client's staff, some of
 * whom have no account. The rows, the masthead, the figures and the verdicts
 * are untouched — only the two sentences change.
 */
function artefactMoves(data: OverviewData): OverviewData {
  return { ...data, moves: { ...data.moves, unlock: '', empty: MONTHLY_MOVES_EMPTY } }
}

/**
 * The blocks a stored arrangement names, in its order.
 *
 * A KEY THIS BUILD NO LONGER KNOWS IS DROPPED, exactly as a report section's is
 * — an artefact stored a year ago must still render, minus whatever has since
 * retired, rather than throwing. An arrangement that names NONE of them comes
 * back empty and the deck says so on its own sheet; it does not silently
 * become the full report.
 */
export function monthlyBlocksFor(keys: readonly string[]): Block<MonthlyData>[] {
  return keys
    .filter((k): k is MonthlyBlockKey => (MONTHLY_BLOCK_KEYS as readonly string[]).includes(k))
    .map((k) => MONTHLY_BLOCKS[k])
}

/** Every block, in the design's order — what a build with no stored
 *  arrangement renders. */
export const ALL_MONTHLY_BLOCKS: Block<MonthlyData>[] = monthlyBlocksFor(MONTHLY_BLOCK_KEYS)
