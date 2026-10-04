import { quoteGate, readableEnglish } from '../../quote-gate'
import { quoteRef } from '../../renderables/quotes-freeze'
import { CLIENT_AUDIENCE } from '../../rivals'
import { gateInputOf, type DatedEvidence } from '../../written/evidence'
import { isOwnAccount } from '../../written/pool'
import { quoteForm, FORM_VALUE } from '../../written/substance'
import { aboutCitation, asJudged, briefGateFor } from './ground'
import { FIT, stemsOf, type Meaning } from './meaning'
import type { BriefQuote } from './types'

// Which real voices a brief prints (pure; one pool per brief SET).
//
// Code picks every quote, from the citations that COUNTED for the points an
// item rests on (ground.ts: the market or the client's own posts, the read
// lane, no maker, no insider, the tenant's gate), never from the Ask agent's
// own picks, which knew no gate.
//
// FIT BY MEANING (the fix pass, 4 Oct). A voice prints beside what it
// illustrates only where its INSIGHT (Pass A's paraphrase of the comment, the
// week read's rule, lib/written/fit.ts) sits close in meaning to what the item
// says (`Meaning`, at `FIT.quote`); shared words picked "So like what if I
// don't wanna spend 130$ on a bag" for a finding about the route to buy. Among
// those that fit, the closest wins, and a line that claims something beats a
// bare question or a fragment (lib/written/substance.ts). A creator answering
// under their own post is the video talking, not the market, and never prints.
//
// NEVER THE SAME VOICE TWICE IN A SET, and never two voices from one video
// beside one item: one pool serves the four briefs of a month, a ref printed
// once is spent, and the picks for one item come from one call that takes a
// video once.
//
// THE WORDS STAY IN MEMORY. A picked quote leaves as a `BriefQuote` with
// `text: ''`; `textOf` hands the words to a renderer and to nothing else.

/** A line a reader can take in on a page. */
export const QUOTE_MIN_CHARS = 30
export const QUOTE_MAX_CHARS = 280
/** A phrase to borrow: short, and a statement. */
export const PHRASE_MIN_CHARS = 16
export const PHRASE_MAX_CHARS = 120
/** A phrase says something: at least this many content words, and this many
 *  of them its point's own (a phrase to borrow is in the point's terms; the
 *  insight's fit alone let "I neeed the link for the first one" through). */
export const PHRASE_MIN_STEMS = 3
export const PHRASE_SHARED_STEMS = 2

const sharedStems = (a: string, b: string): number => {
  const B = stemsOf(b)
  let n = 0
  for (const s of stemsOf(a)) if (B.has(s)) n += 1
  return n
}

export interface PoolOptions {
  clientId: string
  company: string
  brandsOf: ReadonlyMap<string, readonly string[]>
  meaning: Meaning
}

interface Scored {
  e: DatedEvidence
  english: string
  fit: number
  value: number
}

const videoKey = (e: Pick<DatedEvidence, 'video'>) => `${e.video.platform.toLowerCase()}::${e.video.videoId}`

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

  /** Refs another write of the set already prints: never picked here. */
  spend(refs: readonly string[]): void {
    for (const r of refs) this.used.add(r)
  }

  /** Every ref picked so far. */
  picked(): string[] {
    return [...this.used]
  }

  /** The insight descriptions a pick for these points would weigh (for the
   *  embedding pass). */
  descriptions(pointIds: readonly string[]): string[] {
    return [...new Set(pointIds.flatMap((id) => (this.counted.get(id) ?? []).map((e) => e.description)).filter(Boolean))]
  }

  private candidates(pointIds: readonly string[], claim: string, videos: ReadonlySet<string>, minFit: number): Scored[] {
    const seen = new Set<string>()
    const out: Scored[] = []
    const gate = briefGateFor(this.o.clientId, null)
    for (const id of pointIds) {
      for (const e of this.counted.get(id) ?? []) {
        const ref = quoteRef.evidence(e.evidenceId)
        if (seen.has(ref) || this.used.has(ref)) continue
        seen.add(ref)
        if (isOwnAccount(e) || videos.has(videoKey(e))) continue
        const j = asJudged(e, gate)
        if (!quoteGate(gateInputOf(j.e), j.gate).ok) continue
        const english = readableEnglish(gateInputOf(e)) ?? ''
        const fit = claim.trim() ? this.o.meaning.sim(claim, e.description) : 0
        if (claim.trim() && fit < minFit) continue
        out.push({ e, english, fit, value: fit + 0.05 * FORM_VALUE[quoteForm(english)] })
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
   *  each from its own video, closest in meaning first. One call per item,
   *  so two quotes beside one finding never come from one video. */
  pick(pointIds: readonly string[], claim: string, n = 1, o: { minFit?: number } = {}): BriefQuote[] {
    const out: BriefQuote[] = []
    const videos = new Set<string>()
    for (let i = 0; i < n; i++) {
      const best = this.candidates(pointIds, claim, videos, o.minFit ?? FIT.quote)
        .find((s) => s.english.length >= QUOTE_MIN_CHARS && s.english.length <= QUOTE_MAX_CHARS && quoteForm(s.english) !== 'fragment')
      if (!best) break
      videos.add(videoKey(best.e))
      out.push(this.take(best))
    }
    return out
  }

  /** Short phrases people use, for "words to borrow" and "in its own
   *  words": one per point in turn, each the closest claim to THAT
   *  point's own text (a section's points pooled into one claim matched
   *  "That's so well fantastic good job"), with something specific in it
   *  (`PHRASE_MIN_STEMS` content words), each from its own video. */
  phrases(points: readonly { id: string; text: string }[], n: number, o: { minFit?: number } = {}): BriefQuote[] {
    const out: BriefQuote[] = []
    const videos = new Set<string>()
    for (let round = 0; round < n && out.length < n; round++) {
      let took = false
      for (const p of points) {
        if (out.length >= n) break
        const best = this.candidates([p.id], p.text, videos, o.minFit ?? FIT.phrase).find((s) =>
          s.english.length >= PHRASE_MIN_CHARS && s.english.length <= PHRASE_MAX_CHARS && quoteForm(s.english) === 'claim'
          && stemsOf(s.english).size >= PHRASE_MIN_STEMS && sharedStems(s.english, p.text) >= PHRASE_SHARED_STEMS)
        if (!best) continue
        videos.add(videoKey(best.e))
        out.push(this.take(best))
        took = true
      }
      if (!took) break
    }
    return out
  }
}
