import { lensesOf } from './pool'
import type { PoolCandidate, QuoteRef, StandingFact, WeekPool } from './types'

// Fixtures for the written read's tests (compose, write, scrub, step). Made-up
// words and ids shaped like Sealand's 27 Sep pool; nothing here is a reading.

export const WINDOW = { from: '2026-09-20T04:18:00+00:00', to: '2026-09-27T04:03:00+00:00' }
export const SEP = '2026-09-01'

export const ref = (id: string, thread: string): QuoteRef => ({ ref: `e:${id}`, text: '', date: '2026-09-24', platform: 'youtube', thread: `youtube::${thread}` })

/** A candidate with `gated` distinct gated videos (ids `v-<id>-<n>` unless
 *  `videoIds` names them). */
export function candidate(o: Partial<PoolCandidate> & { id: string; gated?: number; videoIds?: string[] }): PoolCandidate {
  const gatedVideoIds = o.videoIds ?? o.gatedVideoIds ?? Array.from({ length: o.gated ?? 6 }, (_, i) => `v-${o.id}-${i}`)
  const kinds = o.kinds ?? ['objection']
  return {
    themeId: o.themeId ?? `th-${o.id.toLowerCase()}`,
    label: o.label ?? `Theme ${o.id}`,
    description: o.description ?? `What ${o.id} is about.`,
    kinds,
    dominantKind: o.dominantKind ?? kinds[0] ?? null,
    lenses: o.lenses ?? lensesOf(kinds),
    weekVideos: o.weekVideos ?? gatedVideoIds.length + 4,
    gatedVideos: gatedVideoIds.length,
    gatedVideoIds,
    monthK: o.monthK ?? gatedVideoIds.length * 3,
    monthN: o.monthN ?? 814,
    subjectId: o.subjectId ?? null,
    isNew: o.isNew ?? false,
    quoteRefs: o.quoteRefs ?? [ref(`${o.id.toLowerCase()}q1`, `${o.id.toLowerCase()}t1`), ref(`${o.id.toLowerCase()}q2`, `${o.id.toLowerCase()}t2`)],
    notes: o.notes ?? [`People describe ${o.id}.`],
    id: o.id,
  }
}

export function pool(candidates: PoolCandidate[], over: Partial<WeekPool> = {}): WeekPool {
  return {
    clientId: 'client-1',
    runId: 'run-27',
    window: WINDOW,
    month: SEP,
    weekVideos: 262,
    weekComments: 4528,
    monthVideos: 814,
    candidates,
    thin: candidates.length < 3,
    ...over,
  }
}

export function fact(o: Partial<StandingFact> & { subjectId: string; name: string }): StandingFact {
  const calibration = o.calibration ?? 'ready'
  const level = o.level !== undefined ? o.level : calibration === 'ready' || calibration === 'provisional' ? { k: 58, n: 852 } : null
  return {
    calibration,
    level,
    rank: o.rank ?? (level ? 1 : 0),
    trail: o.trail ?? [],
    verdict: o.verdict ?? null,
    direction: o.direction ?? null,
    rung: o.rung ?? (calibration === 'ready' && level ? 'level' : 'none'),
    contents: o.contents ?? [],
    notes: o.notes ?? [],
    quoteRef: o.quoteRef ?? null,
    subjectId: o.subjectId,
    name: o.name,
  }
}
