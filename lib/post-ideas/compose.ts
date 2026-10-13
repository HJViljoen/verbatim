import { addScrubCounts, NO_SCRUB, scrubIdeaText, type IdeaScrubCounts } from './scrub'
import { clearsEvidenceFloor, isQuestionShaped, POST_IDEA_SUBQUESTIONS_MAX, POST_IDEAS_MAX, type IdeaCandidate } from './select'
import { subquestionCounts, type PostIdeaCover, type PostIdeaRank, type PostIdeaRow, type PostIdeaSubquestion } from './types'
import type { PostIdeasOutput, WrittenSubquestion } from './write'

// The writer's output, made into the ideas that are stored (depth v2, T13).
// Pure and deterministic, so a saved dry run composes again under changed
// code with no model call (scripts/post-ideas.ts --recompose).
//
// THE WRITER'S WORDS, CODE'S FIGURES. The writer gives each conversation (by
// its handle, Q1…) a title, a cover and sub-questions as labels over comment
// HANDLES (c1…). Code takes the conversations in its own rank order, scrubs
// every field (lib/post-ideas/scrub.ts), maps each handle back to the comment
// and video ids of THAT conversation (a handle the writer invented or took
// from another conversation is dropped, and a comment counts under one
// sub-question at most, and only where it asks: `isQuestionShaped`), and
// orders the sub-questions by their videos, then their comments, counted from
// the ids (`subquestionCounts`). The first three conversations whose title
// and cover survive and whose sub-questions clear the evidence floor
// (`clearsEvidenceFloor`: three asking comments across two videos; under it
// the idea is held 'thin') are the ideas, ranked 1 to 3;
// the format, the opening and the length are code's (`choosePlay`).
//
// NEVER A COMMENT'S WORDS AS OURS (AGENTS.md: the words resolve at render, a
// stored artefact holds refs). A title or a sub-question label that is a sent
// comment word for word, or sits inside one (`copiesAComment`), is held: the
// writer is told to write in its own words, and this is what holds when it
// does not.

/** One idea, ready to store. */
export interface PostIdeaDraft {
  rank: PostIdeaRank
  registryId: string
  title: string
  cover: PostIdeaCover
  subquestions: PostIdeaSubquestion[]
  format: string | null
  formatMultiple: number | null
  opening: string | null
  openingMultiple: number | null
}

/** A conversation the writer was given and no idea came of, and why. */
export interface HeldIdea {
  question: string
  label: string
  reason: string
}

/** A row as the step upserts it. */
export type PostIdeaInsert = Omit<PostIdeaRow, 'id' | 'created_at'>

const handleKey = (h: string): string => (h ?? '').trim().toLowerCase().replace(/^[[(]+|[\])]+$/g, '')
const titleKey = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** A copied phrase is held where it is a whole comment, or sits inside one
 *  and runs to this many words ("How much it costs" inside "how much it costs
 *  in Sao Paulo"); under it, a phrase is ordinary English, not a copy. */
export const COPY_MIN_WORDS = 4

/**
 * Is this title or label a sent comment word for word, or inside one? Case,
 * punctuation and spacing aside (`titleKey`). `sent` is the comments' own
 * normalised words. Pure.
 */
export function copiesAComment(text: string, sent: readonly string[]): boolean {
  const key = titleKey(text)
  if (!key) return false
  const long = key.split(' ').length >= COPY_MIN_WORDS
  return sent.some((c) => c === key || (long && ` ${c} `.includes(` ${key} `)))
}

/** The sent comments' words, normalised for `copiesAComment`. */
export const sentWords = (candidates: readonly Pick<IdeaCandidate, 'comments'>[]): string[] =>
  candidates.flatMap((c) => c.comments.map((x) => titleKey(x.text))).filter(Boolean)

/**
 * One conversation's sub-questions: the writer's labels, scrubbed, over the
 * comments its handles name in THIS conversation, each comment once, merged
 * where two labels read the same, biggest first, at most
 * `POST_IDEA_SUBQUESTIONS_MAX`. Pure.
 */
export function subquestionsOf(
  candidate: Pick<IdeaCandidate, 'comments'>,
  written: readonly WrittenSubquestion[],
  opts: { allow?: readonly string[]; sent?: readonly string[] } = {},
): { subquestions: PostIdeaSubquestion[]; scrub: IdeaScrubCounts } {
  const byHandle = new Map(candidate.comments.map((c) => [handleKey(c.handle), c]))
  const sent = opts.sent ?? sentWords([candidate])
  const used = new Set<string>()
  const merged = new Map<string, { label: string; commentIds: string[]; videoIds: Set<string> }>()
  let scrub = NO_SCRUB
  for (const s of written) {
    const label = scrubIdeaText(s.label, 'label', opts)
    scrub = addScrubCounts(scrub, label.counts)
    if (!label.text) continue
    if (copiesAComment(label.text, sent)) { scrub = addScrubCounts(scrub, { ...NO_SCRUB, medical: [], dropped: 1, droppedCopied: 1, leaked: true }); continue }
    const named = (s.comments ?? []).map((h) => byHandle.get(handleKey(h))).filter((c): c is NonNullable<typeof c> => c != null && !used.has(c.commentId))
    // A comment that does not ask is never a sub-question's (none should
    // reach the writer: lib/post-ideas/select.ts sends only those that do).
    const comments = named.filter((c) => isQuestionShaped(c.text))
    if (comments.length < named.length) scrub = addScrubCounts(scrub, { ...NO_SCRUB, medical: [], droppedNotAsking: named.length - comments.length })
    if (comments.length === 0) continue
    for (const c of comments) used.add(c.commentId)
    const key = titleKey(label.text)
    const held = merged.get(key) ?? { label: label.text, commentIds: [], videoIds: new Set<string>() }
    for (const c of comments) { held.commentIds.push(c.commentId); held.videoIds.add(c.videoId) }
    merged.set(key, held)
  }
  const subquestions = [...merged.values()]
    .map((m) => ({ label: m.label, commentIds: m.commentIds, videoIds: [...m.videoIds].sort() }))
    .sort((a, b) => {
      const x = subquestionCounts(a)
      const y = subquestionCounts(b)
      return y.videos - x.videos || y.comments - x.comments || a.label.localeCompare(b.label)
    })
    .slice(0, POST_IDEA_SUBQUESTIONS_MAX)
  return { subquestions, scrub }
}

/**
 * The ideas from the candidates (in rank order) and the writer's output. A
 * conversation with no written idea, whose title or cover the scrub empties,
 * whose title copies a comment, or left with no sub-question, is held with
 * the reason, and the next one takes its rank. Pure.
 */
export function composePostIdeas(
  candidates: readonly IdeaCandidate[],
  output: PostIdeasOutput | null,
  opts: { allow?: readonly string[] } = {},
): { ideas: PostIdeaDraft[]; held: HeldIdea[]; scrub: IdeaScrubCounts } {
  const ideas: PostIdeaDraft[] = []
  const held: HeldIdea[] = []
  const titles = new Map<string, string>()
  const sent = sentWords(candidates)
  let scrub = NO_SCRUB
  for (const c of candidates) {
    if (ideas.length >= POST_IDEAS_MAX) break
    const hold = (reason: string) => held.push({ question: c.handle, label: c.label, reason })
    const written = (output?.ideas ?? []).find((i) => handleKey(i.question) === handleKey(c.handle))
    if (!written) { hold('not written'); continue }
    const title = scrubIdeaText(written.title, 'title', opts)
    const cover = scrubIdeaText(written.cover, 'cover', opts)
    const subs = subquestionsOf(c, written.subquestions ?? [], { ...opts, sent })
    scrub = addScrubCounts(addScrubCounts(addScrubCounts(scrub, title.counts), cover.counts), subs.scrub)
    if (!title.text) { hold(`title held${title.counts.medical.length ? ` (${title.counts.medical.join(', ')})` : ''}`); continue }
    if (!cover.text) { hold(`cover held${cover.counts.medical.length ? ` (${cover.counts.medical.join(', ')})` : ''}`); continue }
    if (copiesAComment(title.text, sent)) { scrub = addScrubCounts(scrub, { ...NO_SCRUB, medical: [], dropped: 1, droppedCopied: 1, leaked: true }); hold('title copies a comment'); continue }
    // The evidence floor, on what the sub-questions hold after every drop
    // (`POST_IDEA_MIN_COMMENTS` across `POST_IDEA_MIN_VIDEOS`): under it the
    // idea is thin, and a thin week prints its one line, never a padded idea.
    const evidence = {
      comments: new Set(subs.subquestions.flatMap((q) => q.commentIds)).size,
      videos: new Set(subs.subquestions.flatMap((q) => q.videoIds)).size,
    }
    if (!clearsEvidenceFloor(evidence)) { hold('thin'); continue }
    const same = titles.get(titleKey(title.text))
    if (same) { hold(`the same question as ${same}`); continue }
    titles.set(titleKey(title.text), c.handle)
    ideas.push({
      rank: (ideas.length + 1) as PostIdeaRank,
      registryId: c.themeId,
      title: title.text,
      cover: { text: cover.text, ...(c.play.length ? { length: c.play.length } : {}), asked: c.asked },
      subquestions: subs.subquestions,
      format: c.play.format,
      formatMultiple: c.play.format ? c.play.formatMultiple : null,
      opening: c.play.opening,
      openingMultiple: c.play.opening ? c.play.openingMultiple : null,
    })
  }
  return { ideas, held, scrub }
}

/** The rows the step upserts on (run_id, rank). Pure. */
export function postIdeaRows(a: {
  clientId: string
  runId: string
  window: { from: string; to: string }
  ideas: readonly PostIdeaDraft[]
  model: string
  promptVersion: string
}): PostIdeaInsert[] {
  return a.ideas.map((i) => ({
    client_id: a.clientId,
    run_id: a.runId,
    window_start: a.window.from,
    window_end: a.window.to,
    rank: i.rank,
    registry_id: i.registryId,
    title: i.title,
    cover: i.cover,
    subquestions: i.subquestions,
    format: i.format,
    format_multiple: i.format ? i.formatMultiple : null,
    opening: i.opening,
    opening_multiple: i.opening ? i.openingMultiple : null,
    model: a.model,
    prompt_version: a.promptVersion,
  }))
}
