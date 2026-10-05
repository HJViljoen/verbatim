import { calibrateSure } from '../documents/scrub'
import type { AllocatedIdea, Allocation, BriefRole, GroundedPoint, IdeaDraft } from './types'
import { BRIEF_ROLES, isBriefRole } from './types'

// One idea, one home (pure). Point 1 of the rebuild: each of the month's
// ideas is argued in exactly one brief, the one whose reader acts on it, and
// the others name it in a line. The ideas call drafts the ideas and says whose
// they are; code decides what stands:
//
//  1. RESOLVED. An idea keeps the usable points it cites (an invented id, or a
//     point that is makers' talk or counts nothing, is dropped) and is held
//     when none is left.
//  2. EVIDENCED. Its points' distinct counted videos must reach `reasonable`
//     on the document engine's own rule (`calibrateSure`, five videos), and
//     some of them must be the brief's month: a September brief does not
//     lead with talk from July.
//  3. DISTINCT. In evidence order, an idea that rests mostly on what a
//     stronger idea already rests on (half or more of the smaller one's
//     points, or of its videos) is the same idea told again, and is held.
//     That is the 30 Sep failure in one rule: eleven findings, five ideas.
//  4. HOMED. The call's reader, while that brief has room (`PER_BRIEF`); a
//     brief that is full passes the idea to the call's second reader, then to
//     the reader whose research produced most of its points; with no room
//     anywhere it is held.
//  5. FILLED. A brief left with no idea takes one from a brief holding two,
//     only one its own research helped ground (`FILL_AFFINITY` of the idea's
//     points), so the move is to a reader who has a stake in it.

/** Ideas a brief argues at most. */
export const PER_BRIEF = 2
/** Ideas a month carries at most. */
export const IDEAS_MAX = 6
/** Half or more of the smaller idea's points, or videos, is the same idea. */
export const SAME_IDEA_OVERLAP = 0.5
/** The share of an idea's points a brief's own research must have produced
 *  for the idea to be moved there to fill it. */
export const FILL_AFFINITY = 0.25

const emptyByRole = (): Record<BriefRole, string[]> => ({ sales: [], marketing: [], content: [], leadership: [] })

/** The share of an idea's points each role's research produced. */
export function affinityOf(points: readonly Pick<GroundedPoint, 'role'>[]): Record<BriefRole, number> {
  const out: Record<BriefRole, number> = { sales: 0, marketing: 0, content: 0, leadership: 0 }
  if (points.length === 0) return out
  for (const p of points) out[p.role] += 1
  for (const r of BRIEF_ROLES) out[r] = Math.round((out[r] / points.length) * 1000) / 1000
  return out
}

/** How much of the smaller set the larger shares (0 where either is empty). */
export function overlapOfSmaller(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a)
  const B = new Set(b)
  if (A.size === 0 || B.size === 0) return 0
  let shared = 0
  for (const x of A) if (B.has(x)) shared += 1
  return shared / Math.min(A.size, B.size)
}

interface Resolved {
  draft: IdeaDraft
  points: GroundedPoint[]
  videoIds: string[]
  months: { month: string; videos: number }[]
  affinity: Record<BriefRole, number>
}

function resolve(draft: IdeaDraft, byId: ReadonlyMap<string, GroundedPoint>): Resolved {
  const ids = [...new Set(draft.basedOn.map((x) => String(x).trim().toUpperCase()))]
  const points = ids.map((id) => byId.get(id)).filter((p): p is GroundedPoint => p != null && p.usable)
  const videos = new Set(points.flatMap((p) => p.videoIds))
  const months = new Map<string, Set<string>>()
  for (const p of points) for (const [m, vs] of Object.entries(p.monthVideoIds)) {
    const s = months.get(m) ?? new Set<string>()
    for (const v of vs) s.add(v)
    months.set(m, s)
  }
  return {
    draft,
    points,
    videoIds: [...videos].sort(),
    months: [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, s]) => ({ month, videos: s.size })),
    affinity: affinityOf(points),
  }
}

/** The roles in the order an idea would rather live in them: the call's
 *  reader, its second, then by the share of points each produced. */
export function preferenceOf(r: Pick<Resolved, 'draft' | 'affinity'>): BriefRole[] {
  const byAffinity = [...BRIEF_ROLES].sort((a, b) => r.affinity[b] - r.affinity[a] || BRIEF_ROLES.indexOf(a) - BRIEF_ROLES.indexOf(b))
  const asked = [r.draft.home, r.draft.second].filter((x): x is BriefRole => isBriefRole(x))
  return [...new Set([...asked, ...byAffinity])]
}

export function allocateIdeas(
  drafts: readonly IdeaDraft[],
  points: readonly GroundedPoint[],
  opts: { month: string; perBrief?: number; max?: number },
): Allocation {
  const perBrief = opts.perBrief ?? PER_BRIEF
  const max = opts.max ?? IDEAS_MAX
  const byId = new Map(points.map((p) => [p.id.toUpperCase(), p]))
  const held: Allocation['held'] = []
  const month = opts.month.slice(0, 7)

  // 1 and 2: resolved and evidenced.
  const candidates: Resolved[] = []
  for (const d of drafts) {
    const headline = d.headline.trim()
    if (!headline) continue
    const r = resolve({ ...d, headline }, byId)
    if (r.points.length === 0) { held.push({ headline, reason: 'it rests on no usable point' }); continue }
    const sure = calibrateSure([{ conversationCount: r.videoIds.length }]).sure
    if (sure === 'thin') { held.push({ headline, reason: `too little evidence (${r.videoIds.length} videos)` }); continue }
    if (!r.months.some((m) => m.month.slice(0, 7) === month && m.videos > 0)) { held.push({ headline, reason: 'nothing of it was heard in the month' }); continue }
    candidates.push(r)
  }

  // 3: distinct, strongest first.
  candidates.sort((a, b) => b.videoIds.length - a.videoIds.length || a.draft.headline.localeCompare(b.draft.headline))
  const distinct: Resolved[] = []
  for (const c of candidates) {
    const same = distinct.find((k) =>
      overlapOfSmaller(k.points.map((p) => p.id), c.points.map((p) => p.id)) >= SAME_IDEA_OVERLAP
      || overlapOfSmaller(k.videoIds, c.videoIds) >= SAME_IDEA_OVERLAP)
    if (same) { held.push({ headline: c.draft.headline, reason: `the same idea as "${same.draft.headline}"` }); continue }
    if (distinct.length >= max) { held.push({ headline: c.draft.headline, reason: 'over the month\'s cap' }); continue }
    distinct.push(c)
  }

  // 4: homed.
  const home = new Map<Resolved, { role: BriefRole; placed: AllocatedIdea['placed'] }>()
  const count = (role: BriefRole) => [...home.values()].filter((h) => h.role === role).length
  for (const c of distinct) {
    const prefs = preferenceOf(c)
    const role = prefs.find((r) => count(r) < perBrief)
    if (!role) { held.push({ headline: c.draft.headline, reason: 'no brief had room' }); continue }
    home.set(c, { role, placed: role === prefs[0] ? 'asked' : 'cap' })
  }

  // 5: filled. Weakest-first donors, so the stronger idea stays where it was asked for.
  for (const empty of BRIEF_ROLES) {
    if (count(empty) > 0) continue
    const movable = [...home.entries()]
      .filter(([c, h]) => count(h.role) >= 2 && c.affinity[empty] >= FILL_AFFINITY)
      .sort((a, b) => b[0].affinity[empty] - a[0].affinity[empty] || a[0].videoIds.length - b[0].videoIds.length)
    const pick = movable[0]
    if (pick) home.set(pick[0], { role: empty, placed: 'fill' })
  }

  const ideas: AllocatedIdea[] = distinct.filter((c) => home.has(c)).map((c, i) => ({
    id: `I${i + 1}`,
    headline: c.draft.headline,
    home: home.get(c)!.role,
    placed: home.get(c)!.placed,
    points: c.points.map((p) => p.id),
    videos: c.videoIds.length,
    months: c.months,
    affinity: c.affinity,
  }))
  const byRole = emptyByRole()
  for (const idea of ideas) byRole[idea.home].push(idea.id)
  return { ideas, byRole, held }
}

/** The month's other ideas, as one brief names them: everything not argued
 *  there, with the brief that argues it, in the month's evidence order. */
export function referencesFor(role: BriefRole, allocation: Pick<Allocation, 'ideas'>): { headline: string; brief: BriefRole }[] {
  return allocation.ideas.filter((i) => i.home !== role).map((i) => ({ headline: i.headline, brief: i.home }))
}
