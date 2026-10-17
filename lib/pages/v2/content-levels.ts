import type { SupabaseClient } from '@supabase/supabase-js'

import { fmtInt } from '../../format'
import type { PostIdeaRow } from '../../post-ideas/types'
import { marketAudiences } from '../../reading/market'
import type { Counted } from '../../reading/verdicts'
import { marketRivalAudiences } from '../../reading/reading-view'
import type { Scope } from '../../renderables/types'
import { loadTrackedRivals } from '../../rivals'
import { loadPublishedWeekRead, type PublishedWeekRead } from '../../written/published'
import type { Crumb } from '../crumbs'
import {
  anchorOf, contentMonth, ideasStale, ideasWeekOf, IDEAS_EMPTY, monthWords, readIdeas, readWindows, repliesWindowOf, soft,
  type ContentMonth, type ContentWeek, type IdeasState, type IdeasWeek, type SentencePart,
} from './content'
import { CONTENT_POSTS_PATH, CONTENT_ROOT, contentIdeaPath, contentRepliesHref } from './content-address'

// WHAT CONTENT'S LEVEL PAGES SHARE (depth as pages, 17 Oct; the G5 boards):
// the root's anchor (the week the root reads, its month and the post ideas it
// prints), the path back to the root, and "Elsewhere on Content", the two
// evidence pages' way across to the other pages under the root.
//
// THE ANCHOR IS THE ROOT'S OWN RULE (`anchorOf`, `ideasStale`, `contentMonth`),
// read the same way, so a level page and the card that opened it never
// disagree about which week, which month or which ideas.

export interface ContentAnchor {
  /** The root's ideas state, as its row prints it. */
  ideasState: IdeasState
  /** The ideas the root prints (none where they are too old). */
  ideas: PostIdeaRow[]
  week: ContentWeek | null
  ideasWeek: IdeasWeek | null
  month: ContentMonth
  published: PublishedWeekRead | null
}

/** The root's anchor: its ideas and the published week read (two reads for
 *  the ideas, one for the read), the week the newer of the two, the month it
 *  is restated against. Never throws. */
export async function readAnchor(db: SupabaseClient, admin: SupabaseClient, clientId: string, now: Date): Promise<ContentAnchor> {
  const [ideasRead, published] = await Promise.all([
    soft('levels.ideas', readIdeas(db, clientId)),
    soft('levels.published', loadPublishedWeekRead(admin, clientId)),
  ])
  return anchorFrom(ideasRead, published, now)
}

/** The anchor from what was read. Pure. */
export function anchorFrom(ideasRead: { state: IdeasState; rows: PostIdeaRow[] } | null, published: PublishedWeekRead | null, now: Date): ContentAnchor {
  const week = anchorOf(ideasRead?.rows ?? [], published)
  const stale = ideasStale(ideasRead?.rows ?? [], week)
  const ideas = stale ? [] : ideasRead?.rows ?? []
  const ideasState: IdeasState = !ideasRead ? 'unread' : stale ? 'stale' : ideasRead.state === 'ready' && ideas.length === 0 ? 'none' : ideasRead.state
  return { ideasState, ideas, week, ideasWeek: ideasWeekOf(ideas, week), month: contentMonth(week, now), published }
}

/** The path up to the root: "Content", a link. */
export const contentCrumb = (): Crumb => ({ label: 'Content', href: CONTENT_ROOT })

// ---- Elsewhere on Content -------------------------------------------------------------

/** An idea as the evidence pages' foot names it: its title, "Post idea 1",
 *  its videos over the days its set read beside its month (decision 1: the
 *  four weeks never without their month). */
export interface ElsewhereIdea {
  id: string
  rank: number
  title: string
  /** Over the days the ideas read, of the market's then. */
  read: Counted | null
  /** Its videos in the month beside them. */
  month: number | null
  /** "14 Sep to 11 Oct". */
  readLabel: string
  /** "in October so far". */
  monthWords: string
  href: string
}

export interface Elsewhere {
  /** The root's first two ideas. */
  ideas: ElsewhereIdea[]
  /** Print the medical team line under each idea (a medical market,
   *  `printsMedicalLine`): every printed idea carries it, as the root's cards
   *  and the Dashboard's tile do (AGENTS.md's Content bullet). Absent on a
   *  page dumped before it. */
  medical?: boolean
  /** Where there is no idea to name: why, in the root row's words. */
  ideasLine: string | null
  /** The other evidence page: its name, its address and one line. */
  page: { label: string; href: string; line: SentencePart[] }
}

/** The ideas the foot names. */
export const ELSEWHERE_IDEAS = 2

/** The ideas' cards for the foot, from the root's figures. Pure. */
export function elsewhereIdeas(anchor: Pick<ContentAnchor, 'ideas' | 'ideasWeek'>, read: { market: number | null; themes: Map<string, number> | null; month: { market: number | null; themes: Map<string, number> | null } } | null): ElsewhereIdea[] {
  const week = anchor.ideasWeek
  if (!week) return []
  return anchor.ideas.slice(0, ELSEWHERE_IDEAS).map((idea) => {
    const n = read?.market ?? null
    const month = read?.month.themes && read.month.market ? read.month.themes.get(idea.registry_id) ?? 0 : null
    return {
      id: idea.id,
      rank: idea.rank,
      title: idea.title,
      // The four weeks only beside their month (decision 1).
      read: read?.themes && n != null && n > 0 && month != null ? { k: read.themes.get(idea.registry_id) ?? 0, n } : null,
      month,
      readLabel: week.read.label,
      monthWords: monthWords(week.month),
      href: contentIdeaPath(idea.id),
    }
  })
}

/** Why the foot names no idea, in the root row's words. */
export const elsewhereIdeasLine = (state: IdeasState): string | null => (state === 'ready' ? null : IDEAS_EMPTY[state])

/** "9 posts in October so far". */
export function postsLine(total: number | null, month: Pick<ContentMonth, 'month' | 'complete'>): SentencePart[] {
  return total == null ? ['Your posts could not be read just now.'] : [{ figure: fmtInt(total) }, ` ${total === 1 ? 'post' : 'posts'} ${monthWords(month)}`]
}

/** "Comments written between 5 and 11 Oct worth an answer from you": the
 *  root card's own words (no count: the list's count is its page's, and the
 *  foot does not read the list). */
export function repliesLine(week: ContentWeek | null, month: ContentMonth): SentencePart[] {
  const w = repliesWindowOf('week', week, month)
  return [w ? `Comments written ${w.phrase} worth an answer from you` : 'The comments worth an answer from you']
}

/** The ideas' figures for the foot: the days the ideas read and their month,
 *  pooled over the market's audiences, under the root's run (two window
 *  reads, and the rivals for the audiences). Null where there are no ideas. */
export async function readElsewhereFigures(scope: Scope, anchor: ContentAnchor): Promise<Parameters<typeof elsewhereIdeas>[1]> {
  if (!anchor.ideasWeek || anchor.ideas.length === 0) return null
  const rivals = await soft('levels.rivals', loadTrackedRivals(scope.supabase as SupabaseClient, scope.clientId))
  const audiences = marketAudiences(marketRivalAudiences(rivals ?? []))
  const windows = await soft('levels.windows', readWindows(scope, anchor.week, anchor.month, audiences, { trend: false, week: false, ideas: anchor.ideasWeek }))
  return windows?.ideas ?? null
}

/** The foot's other evidence page. */
export const POSTS_PAGE = { label: 'Your posts', href: CONTENT_POSTS_PATH }
export const REPLIES_PAGE = { label: 'Worth a reply', href: contentRepliesHref() }
