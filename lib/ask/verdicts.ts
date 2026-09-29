// Pure half of the Ask engine: shortlist the themes a claim could possibly be
// about, then validate what the model says about them.
//
// Generalised from say_vs_hear (lib/pipeline/pass-d.ts), which does exactly
// this for the client's own video claims. Three things change: the claims come
// from a user's document instead of transcripts, there is no cap of 3 (a plan
// yields 15–40), and the verdict model is shown theme DESCRIPTIONS and quotes
// rather than labels alone — label-only matching under-recalls badly once the
// claims are as varied as a marketing plan's.

import { cosine } from '../pipeline/cluster'
import { CITATION_RELEVANCE_FLOOR } from '../config'
import type { ClaimResult, ExtractedClaim, Judgement, ThemeRef, Verdict } from './types'
import { PLAN_VERDICT_MIN_VIDEOS, VERDICT_NEW_EVIDENCE_SHARE, VERDICTS } from './types'

export { PLAN_VERDICT_MIN_VIDEOS, VERDICT_NEW_EVIDENCE_SHARE }

/** A theme as the engine handles it: identity, prose, grounding, embedding. */
export interface AskTheme {
  themeId: string
  registryId: string | null
  label: string
  description: string
  bucket: string
  insightIds: string[]
  videoIds: string[]
  embedding: number[] | null
}

/** Themes shortlisted for one claim, ordered best first. */
export interface Shortlist {
  claim: ExtractedClaim
  themes: AskTheme[]
}

/**
 * Shortlist by embedding similarity.
 *
 * Two reasons this exists rather than showing the model every theme. A run
 * carries hundreds of themes — far past what one prompt can weigh — and
 * relevance decided by cosine is reproducible, where relevance decided inside a
 * reasoning model is not.
 *
 * The floor is the same one Pass C/D-a use for citations: a theme that merely
 * exists is not evidence that a claim is echoed.
 */
export function shortlistThemes(
  claims: ExtractedClaim[],
  claimVectors: number[][],
  themes: AskTheme[],
  opts: { perClaim: number; floor?: number },
): Shortlist[] {
  const floor = opts.floor ?? CITATION_RELEVANCE_FLOOR
  const usable = themes.filter((t) => Array.isArray(t.embedding) && t.embedding.length > 0)
  return claims.map((claim, i) => {
    const vec = claimVectors[i]
    if (!vec?.length) return { claim, themes: [] }
    const scored = usable
      .map((t) => ({ t, score: cosine(vec, t.embedding as number[]) }))
      .filter((s) => s.score >= floor)
      .sort((a, b) => b.score - a.score || a.t.themeId.localeCompare(b.t.themeId))
    return { claim, themes: scored.slice(0, opts.perClaim).map((s) => s.t) }
  })
}

/** What the model returns per claim, before validation. */
export interface RawVerdict {
  claim_ref: string
  verdict: string
  they_say: string | null
  theme_refs: string[]
}

/** Normalise a bracket ref the way every pass here does — the model wraps them
 *  in whatever punctuation it likes, and an unresolved ref silently drops a
 *  whole verdict. */
export function normaliseRef(ref: string): string {
  return String(ref ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** What the verdicts are checked against: which insights still exist, which of
 *  them actually carry a quotable comment, and which video each came from. */
export interface Grounding {
  liveInsightIds: Set<string>
  quotedInsightIds: Set<string>
  videoByInsightId: Map<string, string>
}

/**
 * Turn the model's verdicts into the grounded register.
 *
 * The rules that are ENFORCED, not trusted:
 * - A verdict for a claim that was not asked about is dropped.
 * - One verdict per claim; the first wins.
 * - `silent` carries no audience voice and no themes. The model saying
 *   "silent" and then quoting the audience is the model contradicting itself,
 *   and the silent reading is the conservative one.
 * - A non-silent verdict with no `they_say`, or whose themes all failed to
 *   resolve, becomes `silent`. This is the reverse contract: a claim the model
 *   asserted but could not ground is untested, not supported.
 * - **A non-silent verdict must have at least one real comment behind it.**
 *   Without this the register is only structurally grounded: the verdict, the
 *   count and the theme ids are all checked, while `theySay` — the sentence the
 *   reader actually reads — is free prose. Requiring a quotable insight means a
 *   claim can only be reported as supported or contradicted when a person
 *   really did say something, and the page can show it.
 * - Cited evidence is intersected with the insights that STILL EXIST. Themes
 *   outlive their insights (prune-stale-analysis), so a check re-evaluated
 *   against an older run would otherwise count rows that are gone.
 * - Counts are distinct SOURCE VIDEOS of the surviving cited insights — a
 *   conversation is one video and the comments it sparked — cumulative over the
 *   run, not month-scoped. The theme's own
 *   total breadth is not the claim's evidence.
 */
export function validateVerdicts(
  raw: RawVerdict[],
  claims: ExtractedClaim[],
  themesByClaimRef: Map<string, AskTheme[]>,
  grounding?: Grounding,
  opts: { minVideos?: number } = {},
): ClaimResult[] {
  const minVideos = opts.minVideos ?? PLAN_VERDICT_MIN_VIDEOS
  const byRef = new Map(claims.map((c) => [normaliseRef(c.ref), c]))
  const seen = new Set<string>()
  const results = new Map<string, ClaimResult>()

  for (const item of raw ?? []) {
    const key = normaliseRef(item?.claim_ref ?? '')
    const claim = byRef.get(key)
    if (!claim || seen.has(key)) continue
    seen.add(key)

    const verdict: Verdict = (VERDICTS as readonly string[]).includes(item.verdict)
      ? (item.verdict as Verdict)
      : 'silent'

    if (verdict === 'silent') {
      results.set(key, silentResult(claim))
      continue
    }

    const pool = themesByClaimRef.get(key) ?? []
    const byThemeRef = new Map(pool.map((t, i) => [normaliseRef(`T${i + 1}`), t]))
    const picked: AskTheme[] = []
    const usedThemes = new Set<string>()
    for (const r of item.theme_refs ?? []) {
      const t = byThemeRef.get(normaliseRef(r))
      if (!t || usedThemes.has(t.themeId)) continue
      usedThemes.add(t.themeId)
      picked.push(t)
    }

    const theySay = item.they_say?.trim() || ''
    if (!theySay || picked.length === 0) {
      // Asserted but ungrounded — the honest reading is that the conversation
      // has not tested this claim.
      results.set(key, silentResult(claim))
      continue
    }

    const cited = [...new Set(picked.flatMap((t) => t.insightIds))]
    const live = grounding ? cited.filter((id) => grounding.liveInsightIds.has(id)) : cited
    const quotable = grounding ? live.filter((id) => grounding.quotedInsightIds.has(id)) : live
    if (!quotable.length) {
      // Nobody actually said anything we can show. Supported-with-nothing-to-
      // show is the shape a bluff takes, so it reads as untested instead.
      results.set(key, silentResult(claim))
      continue
    }

    const videos = grounding
      ? new Set(quotable.map((id) => grounding.videoByInsightId.get(id)).filter(Boolean) as string[])
      : new Set(picked.flatMap((t) => t.videoIds))
    // THE FLOOR (item 5): a verdict on fewer videos than this is not one.
    if (videos.size < minVideos) {
      results.set(key, silentResult(claim))
      continue
    }

    results.set(key, {
      ref: claim.ref,
      claim: claim.claim,
      verdict,
      theySay,
      conversationCount: videos.size,
      themeRefs: picked.map(
        (t): ThemeRef => ({ themeId: t.themeId, registryId: t.registryId, label: t.label }),
      ),
      insightIds: quotable,
      // Carried through untouched. The verdict pass has no business editing
      // where a claim came from.
      source: claim.source ?? null,
    })
  }

  // Every submitted claim gets an answer, in submission order.
  return claims.map((c) => results.get(normaliseRef(c.ref)) ?? silentResult(c))
}

function silentResult(claim: ExtractedClaim): ClaimResult {
  return {
    ref: claim.ref,
    claim: claim.claim,
    verdict: 'silent',
    theySay: null,
    conversationCount: 0,
    themeRefs: [],
    insightIds: [],
    source: claim.source ?? null,
  }
}

/** A claim's verdict stands on real support: supported or contradicted, on
 *  at least the floor's videos. */
export const verdictStands = (c: ClaimResult): boolean =>
  c.verdict !== 'silent' && c.conversationCount >= PLAN_VERDICT_MIN_VIDEOS

/**
 * Hold each claim's verdict unless the evidence behind it has moved
 * (walkthrough item 5).
 *
 * THE RE-READING IS A FRESH MODEL CALL, AND IT FLIPPED ON NO NEW EVIDENCE.
 * Sealand's mock plan went Contradicted → Supported → Untested → Contradicted
 * on one claim in three weeks, and "Supported → Untested" on four others,
 * while the videos behind them had not changed. So a re-reading proposes and
 * this decides, per claim, against the verdict printed last:
 *
 *   - the same verdict: the fresh reading is taken (its count and evidence are
 *     the newer);
 *   - the last one was untested, or under the floor: a fresh untested stands,
 *     and a fresh verdict is printed only when the re-reading before it
 *     proposed the same one (`pending`) — two readings in a row agree;
 *   - the last one stood on real support and the fresh one is untested: the
 *     last one is kept. Plan-check evidence is protected from pruning
 *     (AGENTS.md), so the videos it stood on are still there;
 *   - it stood and the fresh one says the opposite: printed only where at
 *     least `VERDICT_NEW_EVIDENCE_SHARE` of the fresh verdict's videos are
 *     new, else the last one is kept.
 *
 * `videosOf` names the videos behind a claim's evidence; the caller resolves
 * them (a re-read of a video mints new insight ids, so the ids alone would
 * read as new evidence).
 */
export function holdVerdicts(
  previous: readonly ClaimResult[],
  fresh: readonly ClaimResult[],
  videosOf: (c: ClaimResult) => ReadonlySet<string>,
): ClaimResult[] {
  const prev = new Map(previous.map((c) => [normaliseRef(c.ref), c]))
  return fresh.map((f) => {
    const p = prev.get(normaliseRef(f.ref))
    const freshClaim = withoutPending(f)
    if (!p) return freshClaim
    if (p.verdict === f.verdict) return freshClaim
    if (!verdictStands(p)) {
      if (f.verdict === 'silent') return freshClaim
      if (p.pending?.verdict === f.verdict) return freshClaim
      const base = p.verdict === 'silent' ? p : { ...silentResult(p), source: p.source ?? null }
      return { ...base, claim: f.claim, pending: { verdict: f.verdict } }
    }
    if (f.verdict === 'silent') return keep(p, f)
    const before = videosOf(p)
    const after = [...videosOf(f)]
    const fresher = after.length === 0 ? 0 : after.filter((v) => !before.has(v)).length / after.length
    return fresher >= VERDICT_NEW_EVIDENCE_SHARE ? freshClaim : keep(p, f)
  })
}

/** The printed verdict carried forward: its evidence, the claim's current
 *  words, and nothing pending. */
function keep(p: ClaimResult, f: ClaimResult): ClaimResult {
  return { ...withoutPending(p), claim: f.claim }
}

function withoutPending(c: ClaimResult): ClaimResult {
  const out = { ...c }
  delete out.pending
  return out
}

export function summarise(claims: ClaimResult[]) {
  return {
    supported: claims.filter((c) => c.verdict === 'echoes').length,
    contradicted: claims.filter((c) => c.verdict === 'contradicts').length,
    untested: claims.filter((c) => c.verdict === 'silent').length,
  }
}

/**
 * Keep judgement in its own register.
 *
 * Refs are resolved against the claims so a proposal cannot cite evidence that
 * does not exist, but a judgement whose refs all fail is KEPT with no refs
 * rather than dropped — it is visibly the model's own view either way, and
 * silently deleting the model's reasoning would leave the reader thinking the
 * evidence was all there was.
 */
export function validateJudgement(
  raw: { text?: string; based_on_refs?: string[] }[],
  claims: ClaimResult[],
): Judgement[] {
  const valid = new Set(claims.map((c) => normaliseRef(c.ref)))
  return (raw ?? [])
    .map((j) => ({
      text: (j?.text ?? '').trim(),
      basedOnRefs: [...new Set((j?.based_on_refs ?? []).map(normaliseRef))]
        .filter((r) => valid.has(r))
        .map((r) => claims.find((c) => normaliseRef(c.ref) === r)!.ref),
    }))
    .filter((j) => j.text.length > 0)
}

/** Verdict changes between two evaluations of the same plan — the reason the
 *  evaluations table exists. Claims are matched on ref, which is stable because
 *  re-evaluation re-reads the stored input text. */
export function diffVerdicts(
  previous: ClaimResult[],
  current: ClaimResult[],
): { ref: string; claim: string; from: Verdict; to: Verdict }[] {
  const prev = new Map(previous.map((c) => [normaliseRef(c.ref), c]))
  const moved: { ref: string; claim: string; from: Verdict; to: Verdict }[] = []
  for (const c of current) {
    const before = prev.get(normaliseRef(c.ref))
    if (!before || before.verdict === c.verdict) continue
    moved.push({ ref: c.ref, claim: c.claim, from: before.verdict, to: c.verdict })
  }
  return moved
}
