import type { SupabaseClient } from '@supabase/supabase-js'

import {
  TABLE_OWN_POST_SUBJECTS, isMissingOwnPostSubjects, postsTouching, touchWords,
  type OwnPostFilings, type OwnPostSubjectRow, type TouchPost,
} from '../reading/own-posts'
import { selectAll } from '../supabase-admin'

// WHETHER ONE OF YOUR POSTS TOUCHED A SUBJECT, ONE WAY ON EVERY PAGE (sw-2
// item 2). Your moves counted a post as touching a subject when it shared two
// or more words with one of the subject's question groups OR the post-and-claim
// judge filed it as about the subject (MF3 `own_post_subjects`); Your market
// and Subjects ran the word check alone, so one subject read "19 of your 61
// posts" on Your moves, "0 of your 61 posts" on Your market and "None of your
// 25 posts shared two or more of its words" on Subjects. The rule, the judge's
// rows and their loader now live here, and the three pages call them.
//
// Moved from lib/pages/market-surface.ts, which re-exports `questionTouch`,
// `QuestionPost` and `QuestionTouch` for the importers it had.

/** The words every page prints for a post that touched a subject. */
export const TOUCHED_WORDS = 'touched on it'

/** Whether your posts touched a question, and how that was checked. */
export interface QuestionTouch {
  /** Your posts in the period the row is read over. Null: not readable. */
  posts: number | null
  /** Each post that touched it, with the words it shared (`words`: the WP2.5
   *  word check; `judge`: the post-and-claim judge's filing). */
  matched: { id: string; postedOn: string | null; href: string | null; words: string[]; by: 'words' | 'judge' }[]
  /** The question's words a post had to share, printed where none did. */
  checked: string[]
  /**
   * `touched`: a post shared two or more of its words, or the judge filed one
   *   as about it.
   * `none`: no post did, and nothing is left unchecked.
   * `unchecked`: no post shared its words, and the judge has not filed every
   *   post for this subject (before MF3, none): "not checked yet", never a
   *   false "none" (WP3.6 done-when 6). Subject rows only.
   * `unread`: your posts could not be read.
   */
  state: 'touched' | 'none' | 'unchecked' | 'unread'
  /** Subject rows: posts the judge has not filed for the subject. */
  unfiled?: number
}

/** One of your posts as the question rows read it: what it is about
 *  (`videos.topics`), the day it was posted, and where it lives. */
export interface QuestionPost extends TouchPost {
  upload_date: string | null
  video_url: string | null
}

/**
 * One row's touch: the word check over `labels` (a post touches on two or more
 * of one label's words), and for a subject row the judge's filing.
 *
 * Pure. `posts` null is "could not read your posts": the row says so and
 * claims nothing either way.
 */
export function questionTouch(input: {
  labels: readonly string[]
  posts: readonly QuestionPost[] | null
  /** A subject row: the subject, and the judge's filings (null: MF3 is not
   *  applied, so nothing is filed). Absent on a theme row. */
  judge?: { subjectId: string; filings: OwnPostFilings | null }
}): QuestionTouch {
  // ONE WORD ONCE ACROSS THE LABELS: "Price and sale questions" and a group
  // naming "prices" check one word, and it prints once, as the first label
  // spelled it (the rule's own stem, `touchWords`).
  const stem = (w: string): string => touchWords(w)[0] ?? w
  const merge = (held: readonly string[], more: readonly string[]): string[] => {
    const out = [...held]
    const seen = new Set(out.map(stem))
    for (const w of more) if (!seen.has(stem(w))) { seen.add(stem(w)); out.push(w) }
    return out
  }
  let checked: string[] = []
  const byPost = new Map<string, string[]>()
  for (const label of input.labels) {
    const r = postsTouching(label, input.posts ?? [])
    checked = merge(checked, r.checked)
    for (const m of r.matched) byPost.set(m.id, merge(byPost.get(m.id) ?? [], m.words))
  }
  if (input.posts == null) return { posts: null, matched: [], checked, state: 'unread' }
  const posts = input.posts
  const postOf = new Map(posts.map((p) => [p.id, p]))
  const matched: QuestionTouch['matched'] = [...byPost.entries()].map(([id, words]) => ({
    id, postedOn: postOf.get(id)?.upload_date?.slice(0, 10) ?? null, href: postOf.get(id)?.video_url ?? null, words, by: 'words' as const,
  }))
  let unfiled: number | undefined
  if (input.judge) {
    const { subjectId, filings } = input.judge
    const touching = filings?.touching.get(subjectId)
    for (const p of posts) {
      if (byPost.has(p.id)) continue
      const words = touching?.get(p.id)
      if (words) matched.push({ id: p.id, postedOn: p.upload_date?.slice(0, 10) ?? null, href: p.video_url ?? null, words, by: 'judge' })
    }
    unfiled = filings == null ? posts.length : posts.filter((p) => !filings.postFiled.has(`${p.id}|${subjectId}`)).length
  }
  matched.sort((a, b) => (a.postedOn ?? '').localeCompare(b.postedOn ?? '') || a.id.localeCompare(b.id))
  const state: QuestionTouch['state'] = matched.length > 0 ? 'touched' : (unfiled ?? 0) > 0 ? 'unchecked' : 'none'
  return { posts: posts.length, matched, checked, state, ...(unfiled != null ? { unfiled } : {}) }
}

/** The judge's rows (MF3 `own_post_subjects`). Null before MF3: nothing is
 *  filed, which the rows read as "not checked yet". */
export async function loadOwnPostSubjects(supabase: SupabaseClient, clientId: string): Promise<OwnPostSubjectRow[] | null> {
  try {
    return await selectAll<OwnPostSubjectRow>(() =>
      supabase
        .from(TABLE_OWN_POST_SUBJECTS)
        .select('video_id, claim_id, subject_id, touches, matched_words, method, judge_version, decided_at')
        .eq('client_id', clientId)
        .order('decided_at', { ascending: true })
        .order('video_id', { ascending: true })
        .order('subject_id', { ascending: true })
        .order('claim_id', { ascending: true, nullsFirst: true }),
    )
  } catch (error) {
    if (isMissingOwnPostSubjects(error)) return null
    throw error
  }
}
