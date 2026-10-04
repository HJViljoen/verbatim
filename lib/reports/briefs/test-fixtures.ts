import type { DatedEvidence } from '../../written/evidence'
import type { BriefRole, GroundedPoint } from './types'

// Fixtures for the monthly briefs' tests: made-up citations and points shaped
// like the research the engine grounds. Nothing here is a reading.

let n = 0
export function cite(o: {
  insight: string
  video: string
  audience?: string
  date?: string
  text?: string
  english?: string | null
  lang?: string | null
  lane?: string
  segment?: string | null
  insider?: boolean
  author?: string
  account?: string
  /** The insight's paraphrase; the quote's text where not given. */
  description?: string
}): DatedEvidence {
  n += 1
  const audience = o.audience ?? 'industry-other'
  return {
    insightId: o.insight,
    kind: 'objection',
    description: o.description ?? o.text ?? 'I would buy the knee brace if the straps held up after a month of walking.',
    evidenceId: `ev${n}`,
    rank: n,
    commentId: `c${n}`,
    commentDate: o.date ?? '2026-09-12T10:00:00Z',
    author: o.author ?? `person${n}`,
    text: o.text ?? 'I would buy the knee brace if the straps held up after a month of walking.',
    lang: o.lang ?? null,
    english: o.english ?? null,
    video: { uuid: o.video, platform: 'youtube', videoId: `yt-${o.video}`, audience, lane: o.lane ?? 'full', accountName: o.account ?? 'a channel' },
    context: {
      platform: 'youtube', videoId: `yt-${o.video}`, caption: 'a video', accountName: o.account ?? 'a channel',
      isClient: audience === 'client', isCompetitor: audience.startsWith('competitor:'), competitorName: audience.startsWith('competitor:') ? audience.slice(11) : null,
      source: 'discovered', segment: o.segment ?? 'market',
    },
    insider: o.insider ?? false,
  }
}


let seq = 0
/** A usable point with `n` videos of its own, heard in the months given
 *  (September by default). */
export function point(id: string, role: BriefRole, n: number, opts: { months?: string[]; usable?: boolean; videos?: string[]; text?: string; questionId?: string } = {}): GroundedPoint {
  const videos = opts.videos ?? Array.from({ length: n }, () => `pv${++seq}`)
  const months = opts.months ?? ['2026-09-01']
  return {
    id, role, questionId: opts.questionId ?? `${role}.q`, text: opts.text ?? `point ${id}`, insightIds: [`i-${id}`],
    videoIds: videos,
    monthVideoIds: Object.fromEntries(months.map((m) => [m, videos])),
    who: [{ about: 'market', videos: videos.length }],
    seenVideos: videos.length, makerVideos: 0, usable: opts.usable ?? true,
  }
}
