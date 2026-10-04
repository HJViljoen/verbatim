import { quoteGate, readableEnglish, stem } from '../../quote-gate'
import { quoteRef } from '../../renderables/quotes-freeze'
import { CLIENT_AUDIENCE } from '../../rivals'
import { gateInputOf, type DatedEvidence } from '../../written/evidence'
import { isOwnAccount } from '../../written/pool'
import { quoteForm, FORM_VALUE } from '../../written/substance'
import { aboutCitation, asJudged, briefGateFor } from './ground'
import type { BriefQuote } from './types'

// Which real voices a brief prints (pure; one pool per brief SET).
//
// Code picks every quote, from the citations that COUNTED for the points an
// item cites (ground.ts: the market or the client's own posts, the read lane,
// no maker, no insider, the tenant's gate), never from the Ask agent's own
// picks, which knew no gate. Each is judged again against what the item says
// (the gate's relevance to the claim), and its form decides the rest: a line
// that claims something beats a bare question or a fragment
// (lib/written/substance.ts). A creator answering under their own post is the
// video talking, not the market, and never prints.
//
// NEVER THE SAME VOICE TWICE IN A SET. The 30 Sep drafts led three briefs with
// the same Spanish quote; one pool is shared by the four briefs of a month, so
// a ref printed once is spent, and a brief never prints two voices from one
// thread.
//
// THE WORDS STAY IN MEMORY. A picked quote leaves as a `BriefQuote` with
// `text: ''`; `textOf` hands the words to a renderer and to nothing else.

/** A line a reader can take in on a page. */
export const QUOTE_MIN_CHARS = 30
export const QUOTE_MAX_CHARS = 280
/** A phrase to borrow: short, and a statement. */
export const PHRASE_MIN_CHARS = 16
export const PHRASE_MAX_CHARS = 120

/** A claim word that most of the voices on offer share ("bag", "people",
 *  "use") says nothing about which voice fits: past this share of the
 *  candidates it is not counted. Read from the candidates themselves, so it
 *  holds for any tenant and any market without a word list. */
export const GENERIC_SHARE = 0.4
/** Candidates needed before any word is called generic. */
export const GENERIC_MIN_CANDIDATES = 5

const WORD = /[\p{L}]{4,}/gu
const FILLER = new Set([
  'that', 'this', 'with', 'they', 'them', 'their', 'there', 'when', 'what', 'which', 'from', 'have', 'into', 'about', 'than', 'then', 'also',
  'more', 'some', 'only', 'just', 'over', 'even', 'very', 'will', 'would', 'could', 'should', 'does', 'were', 'been', 'being', 'your', 'ours',
  // Words a comment uses whatever it is about.
  'like', 'love', 'want', 'wanna', 'need', 'make', 'made', 'know', 'think', 'really', 'much', 'many', 'good', 'great', 'nice', 'look', 'looks',
  'people', 'thing', 'things', 'still', 'well', 'back', 'best', 'never', 'always', 'every', 'here', 'where', 'other', 'because', 'thank', 'thanks',
])
export const stemsOf = (text: string): Set<string> =>
  new Set((text.toLowerCase().match(WORD) ?? []).filter((w) => !FILLER.has(w)).map(stem))

/**
 * How many of the claim's SPECIFIC words a voice says: the claim's stems,
 * less those most of the candidates share. Pure.
 */
export function specificRelevance(claim: ReadonlySet<string>, voice: ReadonlySet<string>, generic: ReadonlySet<string>): number {
  let n = 0
  for (const s of claim) if (!generic.has(s) && voice.has(s)) n += 1
  return n
}

/** The claim's stems that most of the candidates share. Pure. */
export function genericStems(claim: ReadonlySet<string>, voices: readonly ReadonlySet<string>[]): Set<string> {
  const out = new Set<string>()
  if (voices.length < GENERIC_MIN_CANDIDATES) return out
  for (const s of claim) if (voices.filter((v) => v.has(s)).length / voices.length > GENERIC_SHARE) out.add(s)
  return out
}

export interface PoolOptions {
  clientId: string
  company: string
  brandsOf: ReadonlyMap<string, readonly string[]>
}

interface Scored {
  e: DatedEvidence
  english: string
  value: number
}

export class QuotePool {
  private readonly used = new Set<string>()
  private readonly words = new Map<string, { text: string; english: string | null; lang: string | null }>()

  constructor(
    private readonly counted: ReadonlyMap<string, readonly DatedEvidence[]>,
    private readonly o: PoolOptions,
  ) {}

  /** The words behind a picked ref, for a renderer. */
  textOf(ref: string): { text: string; english: string | null; lang: string | null } | null {
    return this.words.get(ref) ?? null
  }

  /** Every ref picked so far. */
  picked(): string[] {
    return [...this.used]
  }

  private candidates(pointIds: readonly string[], claim: string, threads: ReadonlySet<string>, minRelevance = 1): Scored[] {
    const seen = new Set<string>()
    const passed: { e: DatedEvidence; english: string; score: number; stems: Set<string> }[] = []
    // The gate judges quality only here (no claim): which voice FITS is
    // measured below on the claim's specific words.
    const gate = briefGateFor(this.o.clientId, null)
    for (const id of pointIds) {
      for (const e of this.counted.get(id) ?? []) {
        const ref = quoteRef.evidence(e.evidenceId)
        if (seen.has(ref) || this.used.has(ref)) continue
        seen.add(ref)
        if (isOwnAccount(e)) continue
        const thread = `${e.video.platform.toLowerCase()}::${e.video.videoId}`
        if (threads.has(thread)) continue
        const j = asJudged(e, gate)
        const v = quoteGate(gateInputOf(j.e), j.gate)
        if (!v.ok) continue
        const english = readableEnglish(gateInputOf(e)) ?? ''
        passed.push({ e, english, score: v.score, stems: stemsOf(english) })
      }
    }
    const want = stemsOf(claim)
    const generic = genericStems(want, passed.map((p) => p.stems))
    const out: Scored[] = []
    for (const p of passed) {
      // A voice that says nothing specific about what the item says does not
      // print beside it, however well it reads.
      const relevance = specificRelevance(want, p.stems, generic)
      if (claim.trim() && relevance < minRelevance) continue
      out.push({ e: p.e, english: p.english, value: relevance * 2 + FORM_VALUE[quoteForm(p.english)] * 3 + Math.min(p.score, 6) * 0.25 })
    }
    return out.sort((a, b) => b.value - a.value || a.e.rank - b.e.rank || a.e.evidenceId.localeCompare(b.e.evidenceId))
  }

  private take(s: Scored): BriefQuote {
    const ref = quoteRef.evidence(s.e.evidenceId)
    this.used.add(ref)
    const translated = s.e.english != null && s.e.english.trim() !== '' && s.e.english.trim() !== s.e.text.trim()
    this.words.set(ref, { text: s.e.text, english: translated ? s.e.english ?? null : null, lang: translated ? s.e.lang ?? null : null })
    return {
      ref,
      text: '',
      date: s.e.commentDate ? s.e.commentDate.slice(0, 10) : null,
      platform: s.e.video.platform,
      about: aboutCitation(s.e, this.o.brandsOf, this.o.company),
      ownPost: s.e.video.audience === CLIENT_AUDIENCE,
      lang: translated ? s.e.lang ?? null : null,
    }
  }

  /** Up to `n` quotes for an item that rests on `pointIds` and says `claim`,
   *  from different threads, best first. */
  pick(pointIds: readonly string[], claim: string, n = 1, o: { minRelevance?: number } = {}): BriefQuote[] {
    const out: BriefQuote[] = []
    const threads = new Set<string>()
    for (let i = 0; i < n; i++) {
      const best = this.candidates(pointIds, claim, threads, o.minRelevance ?? 1).find((s) => s.english.length >= QUOTE_MIN_CHARS && s.english.length <= QUOTE_MAX_CHARS)
      if (!best) break
      threads.add(`${best.e.video.platform.toLowerCase()}::${best.e.video.videoId}`)
      out.push(this.take(best))
    }
    return out
  }

  /** Short phrases people use, for "words to borrow": statements, not
   *  questions or fragments, each from its own thread. */
  phrases(pointIds: readonly string[], claim: string, n: number): BriefQuote[] {
    const out: BriefQuote[] = []
    const threads = new Set<string>()
    for (let i = 0; i < n; i++) {
      const best = this.candidates(pointIds, claim, threads).find((s) =>
        s.english.length >= PHRASE_MIN_CHARS && s.english.length <= PHRASE_MAX_CHARS && ['claim', 'statement'].includes(quoteForm(s.english)))
      if (!best) break
      threads.add(`${best.e.video.platform.toLowerCase()}::${best.e.video.videoId}`)
      out.push(this.take(best))
    }
    return out
  }
}
