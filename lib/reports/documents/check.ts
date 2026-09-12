import type { SupabaseClient } from '@supabase/supabase-js'
import { verdictPass } from '../../ask/engine'
import type { WriterOutput } from './write'

/**
 * The self-check (decision 13, built 2026-08-31): each written finding's
 * CLAIM, its headline, goes through the document-check engine's verdict pass
 * as if a client had asserted it. The conversation echoes it, is silent on
 * it, or contradicts it. A contradicted finding is dropped and the build is
 * flagged for review; silent is ignored, because the theme-level check is
 * coarser than the agent's retrieval that produced the finding.
 *
 * Why the headline and not the paragraphs: the first run on Össur dropped a
 * true finding because one side sentence in "what we saw" (about friction
 * being about access rather than failure) drew a contradiction while the
 * headline's own claims echoed. The paragraphs restate grounded points the
 * agent already cited; the headline is the claim the brief makes. One
 * verdict call for all findings (≈ 20 s, cents), no extraction, no judgement.
 *
 * A custom brief is checked for one more thing (WP7d, 2026-09-12): that the
 * operator's OWN brief was answered. The template's anchors reach the check
 * through the findings they produced; an operator's brief has no anchor of
 * its own to stand on, so it is checked directly, here, and for nothing:
 * the brief's subject words against everything the writer wrote.
 */

export type CheckVerdict = 'echoes' | 'contradicts' | 'silent'

/** Words a brief uses to give an instruction rather than to name its subject.
 *  Kept short on purpose: the test below only has to find ONE subject word in
 *  the document, so a stop word left in costs nothing and a subject word
 *  wrongly stopped costs a false flag. */
const BRIEF_STOP = new Set([
  'the', 'and', 'for', 'but', 'not', 'with', 'from', 'into', 'about', 'that', 'this', 'these', 'those', 'their', 'them', 'they', 'our', 'your', 'you', 'its',
  'what', 'how', 'why', 'when', 'where', 'which', 'who', 'has', 'have', 'had', 'was', 'were', 'are', 'is', 'been', 'being', 'does', 'did', 'can', 'will', 'would',
  'write', 'written', 'writing', 'review', 'reviewing', 'report', 'reports', 'brief', 'briefing', 'summary', 'summarise', 'summarize', 'analysis', 'analyse', 'analyze',
  'tell', 'show', 'explain', 'give', 'cover', 'covering', 'read', 'reader', 'readers', 'want', 'wants', 'need', 'needs', 'please', 'make', 'take', 'look', 'find', 'say', 'says', 'said',
  'update', 'updates', 'month', 'months', 'week', 'weeks', 'quarter', 'year', 'years', 'last', 'next', 'latest', 'recent', 'again', 'also', 'more', 'most', 'some', 'any', 'all',
])

/** The brief's own subject words: what it is asking ABOUT, at most a dozen. */
export function briefSubjects(brief: string | null | undefined): string[] {
  const words = (brief ?? '').toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []
  const out: string[] = []
  for (const w of words) {
    const word = w.replace(/[^a-z]+$/, '')
    if (word.length < 3 || BRIEF_STOP.has(word) || out.includes(word)) continue
    out.push(word)
  }
  return out.slice(0, 12)
}

/**
 * Was the operator's own brief answered? Pure and free. The brief's subject
 * words against everything the writer wrote: a document that touches NONE of
 * them did not answer the brief and the build is flagged for a person to
 * look at, never dropped. It is deliberately a floor and not a grade: a
 * faithful answer may paraphrase every word of the brief, and this test
 * cannot see that, so it only catches the writer that went somewhere else
 * entirely.
 */
export function briefAnswered(brief: string | null | undefined, written: WriterOutput): { answered: boolean; subjects: string[]; missed: string[] } {
  const subjects = briefSubjects(brief)
  if (!subjects.length) return { answered: true, subjects, missed: [] }
  const haystack = writtenText(written)
  const hit = (w: string) => haystack.includes(w) || haystack.includes(singular(w))
  const missed = subjects.filter((w) => !hit(w))
  return { answered: missed.length < subjects.length, subjects, missed }
}

/** Enough of a stemmer for one job: the brief says "batteries" and the brief
 *  writer wrote "battery". */
function singular(w: string): string {
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** Every word the writer wrote, in one lowercase string. */
function writtenText(w: WriterOutput): string {
  return [
    w.in_short?.summary ?? '',
    ...(w.findings ?? []).flatMap((f) => [f.headline, f.saw, f.means, f.sure_note, ...(f.practice ?? [])]),
    ...(w.competitors ?? []).flatMap((c) => [c.name, c.pitch, c.praise, c.hurt, c.read]),
    ...(w.persona_lines ?? []).flatMap((p) => [p.name, p.line]),
    ...(w.say_hear ?? []).flatMap((x) => [x.claim, x.read]),
    ...(w.care ?? []), ...(w.asked ?? []), ...(w.not_sure_yet ?? []),
    w.standing ?? '',
  ].join(' \n ').toLowerCase()
}

export interface FindingVerdict {
  headline: string
  verdict: CheckVerdict
  /** What the audience says where the check disagrees, in the engine's words. */
  theySay: string | null
}

export interface CheckResult {
  verdicts: FindingVerdict[]
  dropped: { headline: string; reason: string }[]
  flagged: boolean
  costUsd: number
  /** Custom briefs only: whether the operator's own brief was answered. */
  brief: { answered: boolean; subjects: string[]; missed: string[] } | null
}

/** Apply verdicts to the writer's output: contradicted findings leave, with
 *  the reason on record. Pure. */
export function applyCheck(written: WriterOutput, verdicts: FindingVerdict[]): { written: WriterOutput; dropped: CheckResult['dropped']; flagged: boolean } {
  const byHeadline = new Map(verdicts.map((v) => [v.headline, v]))
  const dropped: CheckResult['dropped'] = []
  const findings = (written.findings ?? []).filter((f) => {
    const v = byHeadline.get(f.headline)
    if (v?.verdict !== 'contradicts') return true
    dropped.push({ headline: f.headline, reason: v.theySay ? `the conversation contradicts it: ${v.theySay}` : 'the conversation contradicts it' })
    return false
  })
  return { written: { ...written, findings }, dropped, flagged: dropped.length > 0 }
}

export async function checkDocument(
  admin: SupabaseClient,
  args: { clientId: string; runId: string; companyName: string; written: WriterOutput; brief?: string | null },
): Promise<CheckResult & { written: WriterOutput }> {
  // The brief check first: it is free, it needs no run, and it must happen
  // even when there is nothing for the verdict pass to check.
  const brief = args.brief?.trim() ? briefAnswered(args.brief, args.written) : null
  if (brief && !brief.answered) console.warn(`[documents/check] the brief went unanswered: nothing written about ${brief.missed.join(', ')}`)
  const findings = (args.written.findings ?? []).filter((f) => f.headline.trim())
  if (!findings.length) return { verdicts: [], dropped: [], flagged: brief ? !brief.answered : false, costUsd: 0, brief, written: args.written }
  const claims = findings.map((f, i) => ({ ref: `C${i + 1}`, claim: f.headline.replace(/\[\[[a-z0-9_]+\]\]/gi, 'many').trim(), source: null }))
  let verdicts: FindingVerdict[]
  let costUsd = 0
  try {
    const out = await verdictPass(admin, { clientId: args.clientId, runId: args.runId, companyName: args.companyName, claims, persist: true })
    costUsd = out.costUsd
    const byRef = new Map(out.claims.map((c) => [c.ref, c]))
    verdicts = findings.map((f, i) => {
      const c = byRef.get(`C${i + 1}`)
      return { headline: f.headline, verdict: (c?.verdict as CheckVerdict | undefined) ?? 'silent', theySay: c?.verdict === 'contradicts' ? (c.theySay ?? null) : null }
    })
  } catch (e) {
    // The check could not run: keep every finding and record NOTHING, so the
    // workings say "not checked" rather than a silence that never happened.
    console.error('[documents/check] the verdict pass failed; findings kept unchecked:', e)
    return { verdicts: [], dropped: [], flagged: brief ? !brief.answered : false, costUsd: 0, brief, written: args.written }
  }
  const applied = applyCheck(args.written, verdicts)
  return { verdicts, dropped: applied.dropped, flagged: applied.flagged || (brief ? !brief.answered : false), costUsd, brief, written: applied.written }
}
