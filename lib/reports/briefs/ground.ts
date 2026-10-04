import { aboutNamed, whoSplit, type WhoVideo } from '../../brands/attribution'
import type { AboutPart } from '../../brands/labels'
import { COMMENTS_READ_LANE } from '../../pipeline/pass-a'
import { gateFor } from '../../quote-context'
import type { GateOptions } from '../../quote-gate'
import { monthStartOf } from '../../reading/month-key'
import { judge, type DatedEvidence } from '../../written/evidence'
import { isMakerLed } from '../../written/pool'
import type { BriefRole, GroundedPoint } from './types'

// The research, grounded in the comment evidence (pure).
//
// THE 30 SEP DRAFTS' LEAD FINDING WAS MAKERS' BUYERS. The research path (the
// Ask agent) used neither the quote gate nor the maker exclusion, so "the
// route to buy stays unclear" rested on 52 videos of which 26 were crafters'
// own posts, and its quote came from a sewing maker's thread. Every research
// point is now counted the way the written read counts a theme over a long
// window (lib/written/longrun.ts `judgeLongRunTheme`):
//  · a citation counts when its video is in the market or is the client's own
//    post (talk under the client's posts is talk about the client), on the
//    read lane, not a maker's video, not a brand insider, and it passes the
//    tenant's lenient gate (`briefGateFor`: the gate's quality rules, the
//    point's text as the claim to rank by, nothing required);
//  · a point is usable when at least one citation counts and its talk is not
//    makers talking to makers (`isMakerLed`, the product's one line).
// The gate is the tenant's own (`gateFor`): Sealand's market lexicon and
// maker rule apply to Sealand only, and another tenant gets the quality rules
// alone, so nothing here assumes what a tenant sells.

/** The tenant's lenient gate, with the client's own posts allowed. */
export const briefGateFor = (clientId: string, claim: string | null): GateOptions => ({ ...gateFor(clientId, { claim }), allowOwn: true })

/** May this citation count at all (before the gate)? */
export function countsForTheBrief(e: Pick<DatedEvidence, 'video' | 'context'>, universe: ReadonlySet<string>): boolean {
  return universe.has(e.video.audience) && e.video.lane === COMMENTS_READ_LANE && e.context?.segment !== 'maker'
}

export interface PointGrounding {
  videoIds: string[]
  monthVideoIds: Record<string, string[]>
  whoVideos: WhoVideo[]
  who: AboutPart[]
  seenVideos: number
  makerVideos: number
  usable: boolean
  /** The citations that counted, best first by the gate's score: the quotes
   *  a section may print. In memory only (they carry the words). */
  counted: DatedEvidence[]
}

/**
 * One point: its insights' citations, counted. `evidence` may hold other
 * points' rows; `brandsOf` is each comment's named tracked brands (already
 * hand-check gated, lib/brands/attribution.ts).
 */
export function groundPoint(a: {
  clientId: string
  company: string
  insightIds: readonly string[]
  claim: string
  evidence: readonly DatedEvidence[]
  universe: ReadonlySet<string>
  brandsOf: ReadonlyMap<string, readonly string[]>
}): PointGrounding {
  const members = new Set(a.insightIds)
  const onLane = a.evidence
    .filter((e) => members.has(e.insightId) && a.universe.has(e.video.audience) && e.video.lane === COMMENTS_READ_LANE)
    .sort((x, y) => x.rank - y.rank || x.evidenceId.localeCompare(y.evidenceId))
  const seen = new Set(onLane.map((e) => e.video.uuid))
  const makers = new Set(onLane.filter((e) => e.context?.segment === 'maker').map((e) => e.video.uuid))
  const gate = briefGateFor(a.clientId, a.claim)
  const scored: { e: DatedEvidence; score: number }[] = []
  for (const e of onLane) {
    if (!countsForTheBrief(e, a.universe)) continue
    const v = judge(e, gate)
    if (v.ok) scored.push({ e, score: v.score })
  }
  const byMonth = new Map<string, Set<string>>()
  const byVideo = new Map<string, { audience: string; named: Set<string> }>()
  for (const { e } of scored) {
    const m = monthStartOf(e.commentDate)
    const set = byMonth.get(m) ?? new Set<string>()
    set.add(e.video.uuid)
    byMonth.set(m, set)
    const v = byVideo.get(e.video.uuid) ?? { audience: e.video.audience, named: new Set<string>() }
    for (const n of a.brandsOf.get(e.commentId) ?? []) v.named.add(n)
    byVideo.set(e.video.uuid, v)
  }
  const whoVideos = [...byVideo.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([id, v]) => ({ id, audience: v.audience, named: [...v.named].sort() }))
  const judged = { seenVideos: seen.size, makerVideos: makers.size }
  return {
    videoIds: [...byVideo.keys()].sort(),
    monthVideoIds: Object.fromEntries([...byMonth.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([m, s]) => [m, [...s].sort()])),
    whoVideos,
    who: whoSplit(whoVideos, a.company),
    ...judged,
    usable: byVideo.size > 0 && !isMakerLed(judged),
    counted: scored.sort((x, y) => y.score - x.score || x.e.rank - y.e.rank || x.e.evidenceId.localeCompare(y.e.evidenceId)).map((s) => s.e),
  }
}

/** A grounded point as the brief keeps it (no words), from the research
 *  point and its grounding. */
export function groundedPointOf(p: { id: string; text: string; insightIds: string[]; questionId: string }, role: BriefRole, g: PointGrounding): GroundedPoint {
  return {
    id: p.id,
    role,
    questionId: p.questionId,
    text: p.text,
    insightIds: [...p.insightIds],
    videoIds: g.videoIds,
    monthVideoIds: g.monthVideoIds,
    who: g.who,
    seenVideos: g.seenVideos,
    makerVideos: g.makerVideos,
    usable: g.usable,
  }
}

/** What a set of points rests on together: distinct videos, by month, and who
 *  they are about. A video two points share counts once. Pure. */
export function unionOf(
  points: readonly Pick<GroundedPoint, 'videoIds' | 'monthVideoIds'>[],
  whoVideos: readonly WhoVideo[],
  company: string,
): { videos: number; videoIds: string[]; months: { month: string; videos: number }[]; who: AboutPart[] } {
  const ids = new Set(points.flatMap((p) => p.videoIds))
  const months = new Map<string, Set<string>>()
  for (const p of points) for (const [m, vs] of Object.entries(p.monthVideoIds)) {
    const set = months.get(m) ?? new Set<string>()
    for (const v of vs) set.add(v)
    months.set(m, set)
  }
  return {
    videos: ids.size,
    videoIds: [...ids].sort(),
    months: [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, s]) => ({ month, videos: s.size })),
    who: whoSplit(whoVideos.filter((v) => ids.has(v.id)), company),
  }
}

/** Who a single citation is about, for its quote's attribution. */
export function aboutCitation(e: Pick<DatedEvidence, 'commentId' | 'video'>, brandsOf: ReadonlyMap<string, readonly string[]>, company: string): AboutPart['about'] {
  return aboutNamed({ audience: e.video.audience, named: brandsOf.get(e.commentId) ?? [] }, company)
}
