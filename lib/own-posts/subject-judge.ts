import { z } from 'zod'

import { ANALYSIS_MODEL, estimateCost } from '../config'

// The post-and-claim-to-subject judge (market-first WP3.6; plan §2.6 Y1 and
// Y3; MF3 `own_post_subjects`).
//
// WHAT IT FILES. Each of your own posts, and each claim on it, against each of
// your active subjects: does this post (or this claim) talk about the subject,
// and on which of its own words. One call per post, with the post's claims in
// it, so a claim is judged with its post in view. One row per (post or claim,
// subject) pair the model answered for; a pair it did not answer stays
// UNFILED and the page reads it "not checked yet", never "no" (done-when 6).
//
// THE WORDS ARE THE POST'S OWN, CHECKED. A word the model returns is kept only
// where it appears in the text it was judging (the post's caption, topics and
// transcript excerpt, or the claim and its quote); a "touches" with no word
// that survives is filed as not touching, so every "yes" the page prints comes
// with words a reader can find in the post.
//
// PURE BUT FOR THE CALL, WHICH IS INJECTED. Nothing here imports the OpenAI
// client: `judgePosts` takes a `call` (the script's, behind its spend flag;
// a test's mock), so a dry run cannot reach a model by accident. About $0.06
// once for Sealand (the default window, June to September on staging, 67
// posts, and the 8 older posts that carry a claim: 75 posts) and about $0.01
// a month after, at gpt-4.1-mini's price (`estimateCost`,
// `judgeCostEstimate`).

export const OWN_POST_JUDGE_VERSION = 'own_post_subjects_v1'
export const OWN_POST_JUDGE_MODEL = ANALYSIS_MODEL
export const OWN_POST_JUDGE_PASS = 'own_post_subject_judge'

/** How much of a transcript the judge reads: the opening, where a post says
 *  what it is about. The caption and topics are read whole. */
export const TRANSCRIPT_CHARS = 1200
export const CAPTION_CHARS = 1500
/** Words kept per decision. */
export const WORDS_KEPT = 6
/** The shape of a call, measured on the prompt below: about 900 tokens in and
 *  300 out for a post with a handful of claims and eight subjects. */
export const JUDGE_CALL_TOKENS = { input: 900, output: 300 } as const

export const judgeCostEstimate = (posts: number): number =>
  posts * estimateCost(OWN_POST_JUDGE_MODEL, JUDGE_CALL_TOKENS.input, JUDGE_CALL_TOKENS.output)

/** One of your posts as the judge reads it. */
export interface JudgePost {
  id: string
  caption: string | null
  topics: readonly string[] | null
  transcript: string | null
  claims: readonly { id: string; claim: string; quote: string | null }[]
}

export interface JudgeSubject {
  id: string
  name: string
  description: string | null
}

export const OwnPostJudgeSchema = z.object({
  decisions: z.array(
    z.object({
      /** `P` for the post as a whole, `C1`… for its claims. */
      ref: z.string(),
      /** `S1`… */
      subject: z.string(),
      touches: z.boolean(),
      words: z.array(z.string()),
      reason: z.string(),
    }),
  ),
})
export type OwnPostJudgeOutput = z.infer<typeof OwnPostJudgeSchema>

/** One `own_post_subjects` row as the script inserts it (MF3's pinned shape). */
export interface OwnPostSubjectInsert {
  client_id: string
  video_id: string
  claim_id: string | null
  subject_id: string
  touches: boolean
  matched_words: string[]
  method: 'judge'
  judge_version: string
  reason: string
  decided_at: string
  actor_label: string
}

const clip = (s: string | null | undefined, n: number): string => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** The text a post is judged on, and so the text its words must come from. */
export function postText(p: JudgePost): string {
  return [clip(p.caption, CAPTION_CHARS), (p.topics ?? []).join(', '), clip(p.transcript, TRANSCRIPT_CHARS)].filter(Boolean).join('\n')
}

/** A claim's text: the claim, and the words it was said in. */
export const claimText = (c: JudgePost['claims'][number]): string => [c.claim, c.quote ?? ''].filter(Boolean).join('\n')

export function buildJudgeSystemPrompt(): string {
  return [
    'You file a brand’s OWN social posts, and the claims the brand made in them, against the SUBJECTS the brand follows.',
    '',
    'For the post as a whole (ref P) and for each claim (refs C1, C2…), decide for EVERY subject (S1, S2…) whether it talks about that subject.',
    'Judge what the post or claim is ABOUT, not its mood. A post about a beach clean-up is about community and purpose; it is not about waterproofing because it was filmed near the sea.',
    'Say no when the subject is only adjacent. A subject that swallows everything measures nothing.',
    '',
    'For each decision, give the words from the post or claim ITSELF that show it (copied exactly, at most six), and a short reason. With no such words, the answer is no.',
    'Return one decision for every ref and every subject. Never invent a ref or a subject.',
  ].join('\n')
}

export function buildJudgeUserPrompt(post: JudgePost, subjects: readonly JudgeSubject[]): string {
  return [
    'SUBJECTS',
    ...subjects.map((s, i) => `[S${i + 1}] ${s.name}${s.description ? `: ${clip(s.description, 240)}` : ''}`),
    '',
    'THE POST [P]',
    postText(post),
    ...(post.claims.length > 0 ? ['', 'ITS CLAIMS', ...post.claims.map((c, i) => `[C${i + 1}] ${clip(c.claim, 400)}${c.quote ? ` (said as: "${clip(c.quote, 300)}")` : ''}`)] : []),
  ].join('\n')
}

const fold = (s: string): string => s.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase()

/** The words the model gave that the text actually contains (whole words,
 *  case- and accent-folded), in its order, at most `WORDS_KEPT`. */
export function wordsIn(text: string, words: readonly string[]): string[] {
  const hay = ` ${fold(text).replace(/[^a-z0-9]+/g, ' ')} `
  const out: string[] = []
  for (const w of words) {
    const needle = fold(w).replace(/[^a-z0-9]+/g, ' ').trim()
    if (!needle || out.includes(w.trim())) continue
    if (hay.includes(` ${needle} `)) out.push(w.trim())
    if (out.length >= WORDS_KEPT) break
  }
  return out
}

/**
 * The rows one answer becomes. Bad refs and subjects (unknown, out of range,
 * repeated) are dropped, never guessed; a pair the model did not answer is
 * absent, and so unfiled.
 */
export function judgeRows(input: {
  parsed: OwnPostJudgeOutput
  post: JudgePost
  subjects: readonly JudgeSubject[]
  clientId: string
  decidedAt: string
  actorLabel: string
}): OwnPostSubjectInsert[] {
  const { post, subjects } = input
  const seen = new Set<string>()
  const out: OwnPostSubjectInsert[] = []
  for (const d of input.parsed.decisions) {
    const ref = d.ref.trim().toUpperCase()
    const claim = ref === 'P' ? null : /^C(\d+)$/.exec(ref) ? post.claims[Number(ref.slice(1)) - 1] ?? undefined : undefined
    if (claim === undefined) continue
    const sm = /^S(\d+)$/.exec(d.subject.trim().toUpperCase())
    const subject = sm ? subjects[Number(sm[1]) - 1] : undefined
    if (!subject) continue
    const key = `${claim?.id ?? ''}|${subject.id}`
    if (seen.has(key)) continue
    seen.add(key)
    const words = wordsIn(claim ? claimText(claim) : postText(post), d.words)
    out.push({
      client_id: input.clientId,
      video_id: post.id,
      claim_id: claim?.id ?? null,
      subject_id: subject.id,
      touches: d.touches && words.length > 0,
      matched_words: words,
      method: 'judge',
      judge_version: OWN_POST_JUDGE_VERSION,
      reason: clip(d.reason, 240),
      decided_at: input.decidedAt,
      actor_label: input.actorLabel,
    })
  }
  return out
}

/** What a model call returns to the judge: the parsed answer, or why not. */
export interface JudgeCallResult {
  parsed: unknown
  usage: { prompt_tokens: number; completion_tokens: number }
  error: string | null
}
export type JudgeCall = (req: { system: string; user: string; post: JudgePost }) => Promise<JudgeCallResult>

export interface JudgeRunResult {
  rows: OwnPostSubjectInsert[]
  calls: number
  costUsd: number
  /** Posts whose answer did not parse: they stay unfiled. */
  failed: string[]
  budgetStopped: boolean
}

/**
 * Judge each post in turn, within a budget. A call that fails or does not
 * parse files nothing for its post (it stays "not checked yet"); the budget
 * stops before a call that would start past it.
 */
export async function judgePosts(input: {
  posts: readonly JudgePost[]
  subjects: readonly JudgeSubject[]
  clientId: string
  call: JudgeCall
  budgetUsd: number
  now: () => string
  actorLabel: string
}): Promise<JudgeRunResult> {
  const out: JudgeRunResult = { rows: [], calls: 0, costUsd: 0, failed: [], budgetStopped: false }
  if (input.subjects.length === 0) return out
  const system = buildJudgeSystemPrompt()
  for (const post of input.posts) {
    if (out.costUsd >= input.budgetUsd) { out.budgetStopped = true; break }
    out.calls++
    const res = await input.call({ system, user: buildJudgeUserPrompt(post, input.subjects), post })
    out.costUsd += estimateCost(OWN_POST_JUDGE_MODEL, res.usage.prompt_tokens, res.usage.completion_tokens)
    const parsed = res.error ? null : OwnPostJudgeSchema.safeParse(res.parsed)
    if (!parsed || !parsed.success) { out.failed.push(post.id); continue }
    out.rows.push(...judgeRows({ parsed: parsed.data, post, subjects: input.subjects, clientId: input.clientId, decidedAt: input.now(), actorLabel: input.actorLabel }))
  }
  return out
}

/**
 * The rows still to insert: a (post, claim, subject) pair already filed under
 * this judge version is skipped, because MF3's unique index refuses a second
 * judge row for it (a changed answer is a new judge version or an override).
 */
export function unfiledRows(
  rows: readonly OwnPostSubjectInsert[],
  existing: readonly { video_id: string; claim_id: string | null; subject_id: string; judge_version: string | null; method: string }[],
): OwnPostSubjectInsert[] {
  const held = new Set(existing.filter((e) => e.method === 'judge').map((e) => `${e.video_id}|${e.claim_id ?? ''}|${e.subject_id}|${e.judge_version ?? ''}`))
  return rows.filter((r) => !held.has(`${r.video_id}|${r.claim_id ?? ''}|${r.subject_id}|${r.judge_version}`))
}

/** Posts every active subject already has a post-level judge row for, under
 *  this version: they need no call. */
export function postsToJudge<T extends { id: string }>(
  posts: readonly T[],
  subjects: readonly { id: string }[],
  existing: readonly { video_id: string; claim_id: string | null; subject_id: string; judge_version: string | null; method: string }[],
): T[] {
  const filed = new Set(existing
    .filter((e) => e.method === 'judge' && e.claim_id == null && e.judge_version === OWN_POST_JUDGE_VERSION)
    .map((e) => `${e.video_id}|${e.subject_id}`))
  return posts.filter((p) => subjects.some((s) => !filed.has(`${p.id}|${s.id}`)))
}

// ---- the script's rules (scripts/own-post-subjects.ts), pure so they are tested --

/** What a run of the script does, from its flags. */
export type JudgeMode =
  /** Read-only: the plan and its price. No model, no write. */
  | 'plan'
  /** Calls the model (`--spend`) and writes the rows to a local file only. */
  | 'judge'
  /** Calls the model and inserts (`--spend --apply`). */
  | 'judge_apply'
  /** Inserts a file an earlier `--spend` wrote (`--apply --from-file`): no model. */
  | 'apply_file'

/**
 * The mode, or a refusal in words. The model is reached ONLY with `--spend`;
 * a row is written ONLY with `--apply` (and the script's allow-listed
 * `--project`, checked by `parseScriptArgs`). `--apply` alone judges nothing
 * and so has nothing to write: refused rather than read as a dry run.
 */
export function judgeMode(f: { apply: boolean; spend: boolean; fromFile: string | null }): JudgeMode {
  if (f.fromFile && f.spend) throw new Error('own-post-subjects: give --spend (judge now) or --from-file (write an earlier judgement), not both')
  if (f.fromFile) {
    if (!f.apply) throw new Error('own-post-subjects: --from-file writes rows, so it needs --apply')
    return 'apply_file'
  }
  if (f.spend) return f.apply ? 'judge_apply' : 'judge'
  if (f.apply) throw new Error('own-post-subjects: --apply needs --spend (judge now, about six cents) or --from-file <rows.json>; nothing was judged, so nothing would be written')
  return 'plan'
}

/** The posts a run judges by default: the current month and the three before
 *  it (UTC). The page reads the reading month and the two before it, and the
 *  reading month is the month BEFORE the current one for the first half of a
 *  month (`readingMonthFor`: September until about 15 Oct), so a run on 3 Nov
 *  must reach back to August for the page's August to October. */
export function defaultSince(nowIso: string): string {
  const d = new Date(nowIso)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 3, 1)).toISOString().slice(0, 10)
}

/**
 * The posts outside the window that carry one of your claims. The page counts
 * your claims READ TO DATE by subject (Y3), so a claim on an older post the
 * judge never read would read "not checked yet" for good (Sealand, staging:
 * 65 of 98 distinct claims sit on 8 posts older than July). They are judged
 * too; a handful of posts, about a cent. Sorted, one id each.
 */
export function claimPostsOutside(
  windowPostIds: readonly string[],
  claims: readonly { source_video_id: string }[],
): string[] {
  const inWindow = new Set(windowPostIds)
  return [...new Set(claims.map((c) => c.source_video_id).filter((id) => !inWindow.has(id)))].sort()
}

/** A rows file (`--out`, then `--from-file`), checked before anything is
 *  written: every row this client's, this judge's version, and MF3's shape. */
export function readRowsFile(json: unknown, clientId: string): OwnPostSubjectInsert[] {
  const rows = (json as { rows?: unknown })?.rows
  if (!Array.isArray(rows)) throw new Error('own-post-subjects: the file holds no "rows" array')
  return rows.map((r, i) => {
    const x = r as Partial<OwnPostSubjectInsert>
    const ok = x.client_id === clientId && typeof x.video_id === 'string' && (x.claim_id === null || typeof x.claim_id === 'string') &&
      typeof x.subject_id === 'string' && typeof x.touches === 'boolean' && Array.isArray(x.matched_words) && x.method === 'judge' &&
      x.judge_version === OWN_POST_JUDGE_VERSION && typeof x.decided_at === 'string' && typeof x.actor_label === 'string'
    if (!ok) throw new Error(`own-post-subjects: row ${i + 1} of the file is not a ${OWN_POST_JUDGE_VERSION} row for client ${clientId}`)
    return x as OwnPostSubjectInsert
  })
}
