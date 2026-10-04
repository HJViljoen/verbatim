import { quoteGate, readableEnglish } from '../../quote-gate'
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
    const out: Scored[] = []
    const gate = briefGateFor(this.o.clientId, claim)
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
        // A voice that says nothing about what the item says does not print
        // beside it, however well it reads.
        if (!v.ok || (claim.trim() && v.relevance < minRelevance)) continue
        const english = readableEnglish(gateInputOf(e)) ?? ''
        const form = quoteForm(english)
        out.push({ e, english, value: v.relevance * 2 + FORM_VALUE[form] * 3 + Math.min(v.score, 6) * 0.25 })
      }
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
