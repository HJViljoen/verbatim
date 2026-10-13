import type { SupabaseClient } from '@supabase/supabase-js'

// The run's post ideas (depth redesign v2, T13; plan decision 5): up to three
// question conversations of the week that the client's own posts do not
// answer, biggest first, each with what a post on it should cover and the
// sub-questions people ask inside it. The table is `post_ideas`
// (supabase/migrations/20261109090000_products.sql); lib/products-migration.test.ts
// holds the columns here equal to it.
//
// WHO WRITES WHAT. The model writes the title and the cover, and sorts the
// conversation's question comments into sub-questions BY COMMENT ID. Code
// counts the sub-questions (`subquestionCounts`: the ids, never a number the
// model typed) and picks the format and the opening from the market's own
// videos on the question, with their response multiples. No comment's words
// are stored: the ids resolve at render, as a stored read's quotes do.

export const TABLE_POST_IDEAS = 'post_ideas'

/** The table's natural key, for an upsert's `onConflict`: one set per run. */
export const POST_IDEAS_ON_CONFLICT = 'run_id,rank'

/** At most three a run, ranked 1 to 3 (the CHECK). */
export const POST_IDEA_RANKS = [1, 2, 3] as const
export type PostIdeaRank = (typeof POST_IDEA_RANKS)[number]

/** What the post should cover, as the model wrote it after the scrub. An
 *  object so the writer can add to it without a migration. */
export interface PostIdeaCover {
  text: string
}

/** One thing people want to know inside the conversation: the model's label
 *  over the comment ids it grouped, and those comments' videos. */
export interface PostIdeaSubquestion {
  label: string
  commentIds: string[]
  videoIds: string[]
}

export interface PostIdeaRow {
  id: string
  client_id: string
  run_id: string
  /** The run's frozen window, half-open [window_start, window_end). */
  window_start: string
  window_end: string
  rank: PostIdeaRank
  /** The question conversation (theme_registry.id). */
  registry_id: string
  title: string
  cover: PostIdeaCover
  subquestions: PostIdeaSubquestion[]
  /** A classified_type value and its response multiple; null where the
   *  market's videos on the question are too few to choose one. */
  format: string | null
  format_multiple: number | null
  /** A hook_style value and its response multiple, likewise. */
  opening: string | null
  opening_multiple: number | null
  model: string
  prompt_version: string
  created_at: string
}

export const POST_IDEA_COLUMNS =
  'id, client_id, run_id, window_start, window_end, rank, registry_id, title, cover, subquestions, format, format_multiple, opening, opening_multiple, model, prompt_version, created_at'

// ---- Reading ----------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
/** PostgREST returns a numeric column as a string past float precision; a
 *  multiple is a ratio, so a finite number either way. */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN
  return Number.isFinite(n) ? n : null
}

/** A stored row as a `PostIdeaRow`, or null when its jsonb is not the shape
 *  this code writes (a reader never guesses at a cover or a count). PURE. */
export function parsePostIdeaRow(raw: unknown): PostIdeaRow | null {
  if (!isObj(raw)) return null
  const rank = raw.rank
  if (!(POST_IDEA_RANKS as readonly unknown[]).includes(rank)) return null
  const cover = raw.cover
  if (!isObj(cover) || typeof cover.text !== 'string') return null
  const subs = raw.subquestions
  if (!Array.isArray(subs)) return null
  const subquestions: PostIdeaSubquestion[] = []
  for (const s of subs) {
    if (!isObj(s) || typeof s.label !== 'string' || !isStrList(s.commentIds) || !isStrList(s.videoIds)) return null
    subquestions.push({ label: s.label, commentIds: s.commentIds, videoIds: s.videoIds })
  }
  for (const key of ['id', 'client_id', 'run_id', 'window_start', 'window_end', 'registry_id', 'title', 'model', 'prompt_version', 'created_at']) {
    if (typeof raw[key] !== 'string') return null
  }
  const format = typeof raw.format === 'string' ? raw.format : null
  const opening = typeof raw.opening === 'string' ? raw.opening : null
  return {
    id: raw.id as string,
    client_id: raw.client_id as string,
    run_id: raw.run_id as string,
    window_start: raw.window_start as string,
    window_end: raw.window_end as string,
    rank: rank as PostIdeaRank,
    registry_id: raw.registry_id as string,
    title: raw.title as string,
    cover: { ...cover, text: cover.text } as PostIdeaCover,
    subquestions,
    format,
    format_multiple: format === null ? null : num(raw.format_multiple),
    opening,
    opening_multiple: opening === null ? null : num(raw.opening_multiple),
    model: raw.model as string,
    prompt_version: raw.prompt_version as string,
    created_at: raw.created_at as string,
  }
}

/** A sub-question's counts, from its ids: distinct comments and distinct
 *  videos. The only place a sub-question's number comes from. PURE. */
export function subquestionCounts(s: PostIdeaSubquestion): { comments: number; videos: number } {
  return { comments: new Set(s.commentIds).size, videos: new Set(s.videoIds).size }
}

/** Is this error "post_ideas is not there" (the migration not applied)? */
export function isMissingPostIdeas(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes(TABLE_POST_IDEAS)) return false
  if (code && ['PGRST205', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/**
 * One run's ideas in rank order: the given run's, or the client's newest
 * run's (the latest window that has any). Empty when there are none, or the
 * table is not there yet. A row whose jsonb this code does not read is left
 * out rather than guessed at.
 */
export async function loadPostIdeas(db: SupabaseClient, clientId: string, runId?: string): Promise<PostIdeaRow[]> {
  let run = runId ?? null
  if (!run) {
    const newest = await db.from(TABLE_POST_IDEAS).select('run_id')
      .eq('client_id', clientId).order('window_end', { ascending: false }).order('created_at', { ascending: false }).limit(1)
    if (newest.error) {
      if (isMissingPostIdeas(newest.error)) return []
      throw new Error(`${TABLE_POST_IDEAS}: ${newest.error.message}`)
    }
    run = (newest.data?.[0] as { run_id?: string } | undefined)?.run_id ?? null
    if (!run) return []
  }
  const { data, error } = await db.from(TABLE_POST_IDEAS).select(POST_IDEA_COLUMNS)
    .eq('client_id', clientId).eq('run_id', run).order('rank')
  if (error) {
    if (isMissingPostIdeas(error)) return []
    throw new Error(`${TABLE_POST_IDEAS}: ${error.message}`)
  }
  return (data ?? []).map(parsePostIdeaRow).filter((r): r is PostIdeaRow => r !== null)
}
