import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'

import { ANALYSIS_TEMPERATURE, estimateCost } from '../config'
import { openai } from '../openai'
import { logAiCall } from '../pipeline/ai-log'
import { loadBrandClaims } from '../pipeline/claims'
import { createAdminClient, selectAll } from '../supabase-admin'
import {
  SUBJECTS_MAX,
  SUBJECT_JUDGE_MODEL,
  type SubjectOrigin,
} from './types'

// The subject proposer (design item 22): what to put in front of Heinrich so he
// can pick a tenant's 5-8 subjects, in the client's own words.
//
// TWO SOURCES, BECAUSE NEITHER IS ENOUGH ALONE.
//
//  * The client's OWN VOICE — video_claims rows on the client's own posts,
//    filtered by `ownVoice` (lib/pipeline/claims.ts). This is the brand saying
//    what it thinks it is about, which is exactly the register a subject has to
//    be named in. Measured 2026-09-15: 62 own-voice claims on Össur, 55 on
//    Sealand. Small enough that the whole pool is one prompt.
//  * The CATEGORY'S top themes by share of videos — what the audience is
//    actually talking about, whether or not the brand has a line about it.
//    `themes.evidence_count` already IS distinct supporting videos (verified:
//    1,810 of 1,810 rows on the two latest runs), so the share needs no
//    recomputation.
//
// AND A MODEL PASS, BECAUSE A RANK CUT IS NOT A SUBJECT LIST. Össur's top seven
// themes by share include "Audience identities and amputation types" and
// "Admiration for personal resilience". Both are real readings of the corpus
// and neither is a thing a brand can decide to be measured on — you cannot
// resolve to do more of your audience's amputation types. One gpt-4.1-mini call
// (~$0.002 at the measured shape, budgeted at $0.01) reads both pools and
// returns brand-nameable candidates with a description each, carrying the block
// it came from so the origin and the source_ref are recorded rather than
// guessed.
//
// WHAT THIS DELIBERATELY DOES NOT DO: write anything. It returns candidates.
// The set is Heinrich's to confirm per tenant in Settings before a single
// subject row is shown (decision E), and the confirmation is the write.

/** Own-voice claims to put in the prompt. `loadBrandClaims`'s own cap is
 *  MAX_CLAIMS_PER_ENTITY = 12, which is the prompt-sized side for Pass C; here
 *  the whole pool is 55-62 claims and the wider view is the point — a subject
 *  named from 12 of 62 is a subject named from whatever the newest run happened
 *  to say, and a cap of 40 would have said exactly that about the other 22.
 *
 *  120 is a ceiling, not a selection: it is twice today's largest pool, so it
 *  binds on neither tenant and the prompt stays one call (a claim is ~15 tokens;
 *  120 of them is under 2,000, well inside the ~$0.002 this pass costs). It
 *  exists at all so a tenant that one day has 4,000 claims does not silently
 *  send them. */
export const PROPOSE_CLAIM_CAP = 120

/** Category themes to put in the prompt, by share of the bucket's videos. Deep
 *  enough that a real subject sitting at rank 11 is reachable; shallow enough
 *  that the tail of single-video themes (the median theme carries ONE video)
 *  does not drown the list. */
export const PROPOSE_THEME_CAP = 15

/** Candidates to ask for. More than SUBJECTS_MAX on purpose: the point of the
 *  call is to give Heinrich something to choose from, and a proposer that
 *  returns exactly the number that will be kept has made the choice itself. */
export const PROPOSE_CANDIDATE_TARGET = 12

export const PROPOSE_PROMPT_VERSION = 'subject_propose_v1'
export const PROPOSE_PASS = 'subject_propose'

/** One thing the proposer was shown, with the ref the model answers by. */
export interface ProposalSource {
  /** `c1`, `t3` — never a raw uuid. The T#/S# ref-validation invariant: a
   *  prompt that carries uuids invites a model to invent one. */
  ref: string
  kind: 'claim' | 'theme'
  text: string
  /** video_claims.source_video_id or theme_registry.id, whichever this is. */
  sourceRef: string | null
  /** Themes only: distinct videos, and the share of the bucket they are. */
  videos?: number
  sharePct?: number
}

export interface SubjectCandidate {
  name: string
  description: string
  origin: SubjectOrigin
  /** The id of the claim's video or the theme's registry entry the candidate
   *  was drawn from — the first ref the model cited. Null when it cited
   *  nothing resolvable. */
  sourceRef: string | null
  /** Every ref the model cited, kept so a reader can see what a candidate was
   *  built out of rather than trusting one of them. */
  refs: string[]
  /** The model's own one-line case for it. */
  rationale: string
}

export interface ProposalResult {
  clientId: string
  sources: ProposalSource[]
  candidates: SubjectCandidate[]
  costUsd: number
  /** Set when the call produced nothing usable; the sources are still returned
   *  so a human can pick by hand. */
  error?: string
}

// ---- Pure -------------------------------------------------------------------

/** The model's answer shape. `refs` is an array because a good subject usually
 *  spans several of the blocks it was shown — a name drawn from one claim and
 *  two themes is a better subject than one drawn from a single row. */
export const ProposeSubjectsSchema = z.object({
  subjects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      refs: z.array(z.string()),
      rationale: z.string(),
    }),
  ),
})
export type ProposeSubjectsOutput = z.infer<typeof ProposeSubjectsSchema>

/** Normalised claim text, the key the video lookup below joins on. The same
 *  normalisation `selectClaims` dedupes with, so two spellings of one claim
 *  cannot resolve to two different videos. */
const normClaim = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Which video each claim came off.
 *
 * `BrandClaim` does not carry `source_video_id` — it is the prompt-side shape
 * and three callers compare it with `toEqual`, so widening it to serve this one
 * reader would change what every Pass C snapshot holds. The provenance is
 * recovered instead by joining on the claim text, which is what the dedupe key
 * is already made of. A claim whose text appears on two videos is ambiguous and
 * gets NO source_ref rather than the first one that happens to sort: a wrong
 * provenance is worse than none, because nobody would ever check it.
 */
export function attachClaimVideos(
  claims: readonly { claim: string }[],
  rows: readonly { claim: string; source_video_id: string }[],
): (string | null)[] {
  const byText = new Map<string, string | null>()
  for (const r of rows) {
    const key = normClaim(r.claim)
    if (!byText.has(key)) byText.set(key, r.source_video_id)
    else if (byText.get(key) !== r.source_video_id) byText.set(key, null)
  }
  return claims.map((c) => byText.get(normClaim(c.claim)) ?? null)
}

/** The claim side of the prompt, refs assigned. Own voice only: the `about`
 *  bucket is third parties talking about the brand, which is evidence but not
 *  the brand's own register. */
export function claimSources(
  claims: readonly { claim: string }[],
  videoIds: readonly (string | null)[] = [],
  cap = PROPOSE_CLAIM_CAP,
): ProposalSource[] {
  return claims.slice(0, cap).map((c, i) => ({
    ref: `c${i + 1}`,
    kind: 'claim' as const,
    text: c.claim.trim(),
    sourceRef: videoIds[i] ?? null,
  }))
}

/** The theme side, ranked by distinct videos and carrying the share it is of
 *  the bucket — the share is what makes "rank 3" mean anything. A theme with no
 *  registry id is dropped: it has no cross-run identity, so a subject named
 *  from it would have no provenance to record. */
export function themeSources(
  themes: readonly { label: string; registry_id: string | null; videos: number }[],
  bucketVideos: number,
  cap = PROPOSE_THEME_CAP,
): ProposalSource[] {
  return [...themes]
    .filter((t) => t.registry_id !== null)
    .sort((a, b) => b.videos - a.videos || a.label.localeCompare(b.label))
    .slice(0, cap)
    .map((t, i) => ({
      ref: `t${i + 1}`,
      kind: 'theme' as const,
      text: t.label.trim(),
      sourceRef: t.registry_id,
      videos: t.videos,
      sharePct: bucketVideos > 0 ? Math.round((1000 * t.videos) / bucketVideos) / 10 : 0,
    }))
}

export function buildProposeSystemPrompt(): string {
  return [
    'You help a consumer-intelligence product name the 5-8 SUBJECTS one brand wants to be measured on over the coming year.',
    '',
    'A subject is a thing the brand could decide to be known for, in the words its own customers and marketers use: "comfort", "price", "how it looks", "how long it lasts", "getting help when something goes wrong". It has to be:',
    '- something a person could plausibly say in a comment, so it can be counted in comments;',
    '- something the brand could set out to change, so tracking it means something;',
    '- true of the category, not of one product launch or one campaign.',
    '',
    'It is NOT:',
    '- a description of who the audience is ("audience identities and amputation types") — a brand cannot resolve to do more of that;',
    '- a feeling the audience has about people rather than about the product ("admiration for personal resilience");',
    '- a restatement of the brand name or the category name;',
    '- two subjects joined by "and".',
    '',
    'You are shown two kinds of block. [c#] blocks are the brand speaking in its own posts — the register a subject should be named in. [t#] blocks are what the category is actually talking about, with the share of videos each one carries — the evidence a subject would be measured against. The best candidates draw on both.',
    '',
    `Return ${PROPOSE_CANDIDATE_TARGET} candidates, best first. For each: a short lowercase "name" (1-4 words, no brand names), a "description" of one sentence saying what counts as this subject and what does not — it will be read by a model deciding which customer comments belong to it, so be concrete — a "refs" array naming every block it draws on, and a one-line "rationale" a person can judge it by.`,
    '',
    'Never invent a ref. If a candidate is your own synthesis and rests on no block, return an empty refs array and say so in the rationale.',
  ].join('\n')
}

export function buildProposeUserPrompt(sources: readonly ProposalSource[]): string {
  const claims = sources.filter((s) => s.kind === 'claim')
  const themes = sources.filter((s) => s.kind === 'theme')
  const lines: string[] = []
  if (claims.length) {
    lines.push('THE BRAND IN ITS OWN POSTS')
    for (const c of claims) lines.push(`[${c.ref}] ${c.text}`)
  }
  if (themes.length) {
    if (lines.length) lines.push('')
    lines.push('WHAT THE CATEGORY IS TALKING ABOUT (share of the category’s videos)')
    for (const t of themes) lines.push(`[${t.ref}] ${t.text} — ${t.videos} videos, ${t.sharePct}%`)
  }
  if (!lines.length) lines.push('(nothing on file for this tenant yet)')
  return lines.join('\n')
}

/**
 * Map the model's answer back onto candidates.
 *
 * Refs are resolved against the blocks that were actually sent; an unknown ref
 * is dropped, never guessed, and a candidate whose every ref was unknown keeps
 * its name and loses its provenance rather than borrowing someone else's. A
 * candidate's ORIGIN is the kind of its first resolvable ref — claim first if
 * it cites any claim at all, because that is the stronger provenance: the brand
 * said it — and `client` when it cites nothing, which is the honest label for a
 * name the model synthesised.
 */
export function validateProposal(
  parsed: ProposeSubjectsOutput,
  sources: readonly ProposalSource[],
): SubjectCandidate[] {
  const byRef = new Map(sources.map((s) => [s.ref, s]))
  const seen = new Set<string>()
  const out: SubjectCandidate[] = []
  for (const s of parsed.subjects) {
    const name = s.name.trim().toLowerCase()
    if (!name) continue
    if (seen.has(name)) continue
    seen.add(name)
    const refs = [...new Set(s.refs.map((r) => r.trim().toLowerCase()))].filter((r) => byRef.has(r))
    const claimRef = refs.find((r) => byRef.get(r)?.kind === 'claim')
    const anchor = claimRef ?? refs[0]
    const source = anchor ? byRef.get(anchor) : undefined
    out.push({
      name,
      description: s.description.trim(),
      origin: source ? (source.kind === 'claim' ? 'own_claims' : 'category_theme') : 'client',
      sourceRef: source?.sourceRef ?? null,
      refs,
      rationale: s.rationale.trim(),
    })
  }
  return out
}

/** What the operator sees. One line per candidate, in the order the model
 *  ranked them, with the evidence it leaned on — because the decision this
 *  output exists for is a human one. */
export function proposalSummary(r: ProposalResult): string {
  if (r.error) return `no candidates: ${r.error}`
  if (r.candidates.length === 0) return 'no candidates'
  const originWord: Record<SubjectOrigin, string> = {
    own_claims: 'own voice',
    category_theme: 'category',
    client: 'synthesis',
  }
  return r.candidates
    .map((c, i) => {
      const refs = c.refs.length ? ` [${c.refs.join(' ')}]` : ''
      return `${String(i + 1).padStart(2)}. ${c.name} (${originWord[c.origin]})${refs}\n    ${c.description}\n    why: ${c.rationale}`
    })
    .join('\n')
}

// ---- I/O --------------------------------------------------------------------

/**
 * The run whose clustering is the newest this tenant HAS — read off `themes`
 * itself, not off `pipeline_runs.status`.
 *
 * Two facts make the obvious query wrong. `themes` is not replaced each run
 * (AGENTS.md says it is; measured 2026-09-15 it holds 7 runs for Össur and 10
 * for Sealand), so "the client's theme rows" is not one clustering. And a run
 * can write its themes and fail afterwards: Sealand's newest run at the time of
 * writing produced 1,002 industry-other themes over 769 videos and then failed,
 * so a `status in ('completed','partial')` filter silently reads five days
 * older and a completely different set of labels — 594 bucket videos instead of
 * 769, and not one label in common, because labels churn ~88% run to run.
 *
 * The newest theme row's run is the newest clustering, which is the question.
 */
export async function newestThemeRun(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('themes')
    .select('run_id')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { run_id: string } | null)?.run_id ?? null
}

interface ThemeRow {
  label: string
  registry_id: string | null
  supporting_video_ids: string[] | null
  evidence_count: number | null
}

/**
 * The two pools, read for one tenant.
 *
 * The theme side reads the newest THEME ROW's run (`newestThemeRun`, and its
 * doc says why that is not the newest completed run) and its
 * `industry-other` bucket — the category audience, which is the only one whose
 * months clear the product's floor on either tenant (4 of 5 on Össur, 2 on
 * Sealand; every client and rival month is below 100 videos). A subject
 * proposed off a bucket with no n behind it would be a subject nobody could
 * ever be given a banded number for.
 */
export async function loadProposalSources(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
): Promise<ProposalSource[]> {
  const { data: config } = await admin
    .from('tracking_configs')
    .select('competitor_names, brand_keywords, own_handles, competitor_handles')
    .eq('client_id', clientId)
    .maybeSingle()
  const cfg = (config ?? {}) as {
    competitor_names?: string[] | null
    brand_keywords?: string[] | null
    own_handles?: Record<string, string> | null
    competitor_handles?: Record<string, Record<string, string>> | null
  }

  const claims = await loadBrandClaims(
    admin,
    clientId,
    cfg.competitor_names ?? [],
    cfg.brand_keywords ?? [],
    cfg.own_handles ?? {},
    cfg.competitor_handles ?? {},
    PROPOSE_CLAIM_CAP,
  )

  const runId = await newestThemeRun(admin, clientId)

  let themes: ProposalSource[] = []
  if (runId) {
    const rows = await selectAll<ThemeRow>(() =>
      admin
        .from('themes')
        .select('label, registry_id, supporting_video_ids, evidence_count')
        .eq('client_id', clientId)
        .eq('run_id', runId)
        .eq('bucket', 'industry-other')
        .order('id', { ascending: true }),
    )
    // The bucket's denominator is its own distinct videos — the same set
    // step-a2.ts's `bucketVideoCount` builds, and the only honest denominator
    // for "share of the category's conversation".
    const bucketVideos = new Set(rows.flatMap((r) => r.supporting_video_ids ?? [])).size
    themes = themeSources(
      rows.map((r) => ({
        label: r.label,
        registry_id: r.registry_id,
        videos: r.supporting_video_ids?.length ?? r.evidence_count ?? 0,
      })),
      bucketVideos,
    )
  }

  // The provenance join (see attachClaimVideos). One read of the tenant's own
  // claim rows — 460 on Össur, 376 on Sealand — never one per claim.
  const claimRows = await selectAll<{ claim: string; source_video_id: string }>(() =>
    admin
      .from('video_claims')
      .select('claim, source_video_id')
      .eq('client_id', clientId)
      .eq('entity', 'client')
      .order('id', { ascending: true }),
  )
  const videoIds = attachClaimVideos(claims.client, claimRows)

  return [...claimSources(claims.client, videoIds), ...themes]
}

/**
 * One call. One per tenant, and the whole reason the spend is a rounding error:
 * both pools fit in a single prompt, so there is nothing to batch.
 *
 * `runId` is null here by design — this is not part of an update, it is the
 * thing that happens before a tenant has subjects at all — and `logAiCall`
 * takes a null run.
 */
export async function proposeSubjects(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  opts: { dryRun?: boolean } = {},
): Promise<ProposalResult> {
  const sources = await loadProposalSources(admin, clientId)
  if (opts.dryRun) return { clientId, sources, candidates: [], costUsd: 0, error: 'dry run — nothing was sent' }

  const systemPrompt = buildProposeSystemPrompt()
  const userPrompt = buildProposeUserPrompt(sources)
  const startedAt = Date.now()

  const completion = await openai.chat.completions.parse({
    model: SUBJECT_JUDGE_MODEL,
    temperature: ANALYSIS_TEMPERATURE,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: zodResponseFormat(ProposeSubjectsSchema, 'propose_subjects'),
  })
  const msg = completion.choices[0]?.message
  const parsed = (msg?.parsed ?? null) as ProposeSubjectsOutput | null
  const usage = completion.usage ?? { prompt_tokens: 0, completion_tokens: 0 }
  const costUsd = estimateCost(SUBJECT_JUDGE_MODEL, usage.prompt_tokens, usage.completion_tokens)

  await logAiCall(admin, {
    clientId,
    runId: null,
    pass: PROPOSE_PASS,
    callIndex: 1,
    model: SUBJECT_JUDGE_MODEL,
    promptVersion: PROPOSE_PROMPT_VERSION,
    systemPrompt,
    userPrompt,
    response: parsed,
    error: msg?.refusal ?? (parsed ? null : 'no parsed output'),
    usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens },
    durationMs: Date.now() - startedAt,
    validationStatus: parsed ? 'valid' : 'parse_error',
  })

  if (!parsed) {
    return { clientId, sources, candidates: [], costUsd, error: msg?.refusal ?? 'no parsed output' }
  }
  const candidates = validateProposal(parsed, sources)
  return { clientId, sources, candidates, costUsd }
}

/** The ceiling the Settings editor holds the confirmed set to. Exported here so
 *  the proposer and the editor cannot disagree about it. */
export const PROPOSE_KEEP_MAX = SUBJECTS_MAX
