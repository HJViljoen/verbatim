import type { SupabaseClient } from '@supabase/supabase-js'

import { loadObjectReadings, type MarketObjectRef } from '../agent/movement'
import { subjectReadsEnabled } from '../config'
import { topAsked, topContent, type TopAsked } from '../pages/v2/content'
import { topMoves } from '../pages/v2/moves'
import { topProducts } from '../pages/v2/products'
import { topVoices } from '../pages/v2/voices'
import { loadAppPairOn } from '../reading/gather-flags'
import { readingHandle } from '../reading/read'
import { marketRivalAudiences } from '../reading/reading-view'
import type { Scope } from '../renderables/types'
import { loadTrackedRivals } from '../rivals'
import { subjectCalibration } from '../subjects/calibration-state'
import { loadActiveSubjects } from '../subjects/membership'
import { isMissingSubjects } from '../subjects/types'
import { closesMonth, endedMonthOf } from '../written/longrun'
import { loadPublishedLongRun } from '../written/published'
import { factsFromReadings, marketComparable } from '../written/standing'
import type { StoredLongRun } from '../written/store'
import type { WeekReadData } from '../written/types'
import { weeklyReadLines, type LineTops, type WeeklyReadLine } from './weekly-read-lines'
import type { WeeklyMonthClose, WeeklyPages, WeeklySubjectRead } from './weekly-read-v3'
import { monthClosePart, pagesPart, subjectsPart } from './weekly-read-v3-build'

// The level-1 email's page lines, read when the snapshot is built (depth v2,
// T11b; Phase 4 fix round): EACH PAGE'S OWN `top<Page>()`, the reader the
// Dashboard's tile calls, so the line is the tile (lib/reports/weekly-read-
// lines.ts). Until the fix round the build read its own small versions, and
// two of them drifted from their pages: products ranked without the client's
// audience and ignored PRODUCT_READINGS_ENABLED, the advice list was not
// folded by its vectors as Your moves folds it (`waitingAdvice`), and Voices
// had no line at all.
//
// THE BUILD'S CONTEXT. A route handler, no session: the admin client is both
// the tenant's client and the reading handle's (the export path's shape,
// lib/reports/build.ts), and every top reader filters by the client id it is
// handed. The memoised reads (lib/reading/memo.ts) are scoped to that client,
// so the four tops share their month, runs and rivals as the Dashboard's do.
// Your moves' short list makes the page's embedding call (cached per server,
// a fraction of a cent, five seconds at most, unmerged on a failure).
//
// Each top on its own: a page whose read fails, or whose table is not in this
// database yet (the products migration, `post_ideas`), loses its line and
// nothing else; a top that answers an empty or switched-off state gives no
// line either.

/** A failed read loses its line, never the build. */
function soft<T>(what: string, p: Promise<T>): Promise<T | null> {
  return p.catch((e: unknown) => {
    console.error(`[weekly-read lines] ${what}: ${e instanceof Error ? e.message : String(e)}`)
    return null
  })
}

/** Each page's tile data, as the Dashboard reads it, on the build's client. */
export async function loadLineTops(admin: SupabaseClient, clientId: string): Promise<LineTops> {
  const reading = readingHandle(clientId, admin)
  const scope: Scope = { supabase: admin, reading, clientId, params: {} }
  const [voices, products, content, moves] = await Promise.all([
    soft('voices', topVoices({ supabase: admin, clientId, reading })),
    soft('products', topProducts({ supabase: admin, clientId, reading })),
    soft('content', topContent(scope)),
    // No one decides from an email: the tile's Accept and Not for us are off.
    soft('moves', topMoves(scope, { canDecide: false })),
  ])
  return { voices, products, content, moves }
}

/** Every page's line for one run's snapshot. Never throws. */
export async function loadWeeklyReadLines(
  admin: SupabaseClient,
  a: { clientId: string; runId: string; read: WeekReadData },
  tops: (admin: SupabaseClient, clientId: string) => Promise<LineTops> = loadLineTops,
): Promise<WeeklyReadLine[]> {
  try {
    return weeklyReadLines(await tops(admin, a.clientId))
  } catch (e) {
    console.error(`[weekly-read lines] ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

// ---- Version 3 (18 Oct; the H7 boards) ------------------------------------------------------
//
// What a version-3 snapshot freezes beside the read: every READY subject's
// own stored read in Market's order, each page's part (the same tops as the
// lines, plus the Content tile's stand-in question where there is no idea for
// this week), and the month-closing line. Each read on its own and soft: a
// read that fails loses its part and nothing else, and the build never
// throws for one.

/**
 * THE READY SUBJECTS IN MARKET'S ORDER (`subjectOrder` over the board's rows,
 * which `factsFromReadings` ranks): those with a level in the month, the
 * month's videos about it first, then the name; then the ready ones the month
 * holds no reading for, by name. The readings are Market's and the
 * Dashboard's (`loadObjectReadings` under the month-pair judge). A reading
 * that fails leaves the ready subjects in name order, which is Market's own
 * order where none has a level. A subject whose check has not passed is never
 * handed on (ruling U6). A missing subjects table is none.
 */
export async function loadReadySubjectOrder(admin: SupabaseClient, clientId: string, month: string, now: string = new Date().toISOString()): Promise<{ id: string; name: string }[]> {
  let subjects: Awaited<ReturnType<typeof loadActiveSubjects>>
  try {
    subjects = await loadActiveSubjects(admin as never, clientId)
  } catch (error) {
    if (isMissingSubjects(error)) return []
    throw error
  }
  const ready = subjects.filter((s) => s.name && subjectCalibration(s) === 'ready').map((s) => ({ subject: { id: s.id, name: s.name }, calibration: 'ready' as const }))
  if (ready.length === 0) return []
  const byName = [...ready].sort((a, b) => a.subject.name.localeCompare(b.subject.name)).map((x) => x.subject)
  try {
    const reading = readingHandle(clientId, admin)
    const rivals = await soft('subjects.rivals', loadTrackedRivals(admin, clientId))
    const pair = await loadAppPairOn(reading, now)
    const objects: MarketObjectRef[] = ready.map(({ subject, calibration }) => ({ kind: 'subject' as const, id: subject.id, label: subject.name, calibration }))
    const readings = await loadObjectReadings(admin, { clientId, objects, month, pair, asOf: now, rivalAudiences: rivals ? marketRivalAudiences(rivals) : null })
    const readingOf = new Map(readings.map((r) => [r.object.id, r]))
    const facts = factsFromReadings(ready.map((x) => ({ ...x, reading: readingOf.get(x.subject.id) ?? null })), marketComparable(pair, month))
    return facts.map((f) => ({ id: f.subjectId, name: f.name }))
  } catch (e) {
    console.error(`[weekly-read subjects] the subjects' readings: ${e instanceof Error ? e.message : String(e)}; ready subjects by name`)
    return byName
  }
}

export interface WeeklyReadParts {
  subjects: WeeklySubjectRead[]
  pages: WeeklyPages
  monthClose: WeeklyMonthClose | null
}

/** The readers `loadWeeklyReadParts` calls, for a test. */
export interface WeeklyReadPartReaders {
  tops: (admin: SupabaseClient, clientId: string) => Promise<LineTops>
  asked: (admin: SupabaseClient, clientId: string) => Promise<TopAsked | null>
  order: (admin: SupabaseClient, clientId: string, month: string) => Promise<{ id: string; name: string }[]>
  longRun: (admin: SupabaseClient, clientId: string, month: string) => Promise<StoredLongRun | null>
}

const PART_READERS: WeeklyReadPartReaders = {
  tops: loadLineTops,
  asked: (admin, clientId) => topAsked({ supabase: admin, reading: readingHandle(clientId, admin), clientId, params: {} }),
  order: (admin, clientId, month) => loadReadySubjectOrder(admin, clientId, month),
  longRun: (admin, clientId, month) => loadPublishedLongRun(admin, clientId, { month }),
}

/**
 * Every version-3 part for one run's snapshot, from the STORED read (the one
 * that carries `subjectReads`; the snapshot keeps the read without them).
 * Never throws: a part whose read fails is left out, and the issue renders
 * without it.
 */
export async function loadWeeklyReadParts(
  admin: SupabaseClient,
  a: { clientId: string; runId: string; read: WeekReadData },
  readers: Partial<WeeklyReadPartReaders> = {},
): Promise<WeeklyReadParts> {
  const r = { ...PART_READERS, ...readers }
  const closing = closesMonth(a.read.window)
  const [tops, order, longRun] = await Promise.all([
    r.tops(admin, a.clientId).catch((e: unknown) => { console.error(`[weekly-read parts] tops: ${e instanceof Error ? e.message : String(e)}`); return {} as LineTops }),
    soft('subjects', r.order(admin, a.clientId, a.read.month)),
    closing ? soft('longRun', r.longRun(admin, a.clientId, endedMonthOf(a.read.window))) : Promise.resolve(null),
  ])
  // The Content tile's stand-in (`withAsked`): read only where no idea for
  // this week prints.
  const idea = tops.content?.state === 'ready' && tops.content.idea?.ideasWeek.current
  const asked = idea ? null : await soft('asked', r.asked(admin, a.clientId))
  return {
    subjects: subjectsPart({ order: order ?? [], read: a.read, readsOn: subjectReadsEnabled(a.clientId) }),
    pages: pagesPart({ ...tops, asked }, a.read),
    monthClose: monthClosePart(a.read.window, longRun),
  }
}
