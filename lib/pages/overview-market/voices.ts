import { cleanQuote, readsAsHeroQuote } from '../../quotes'
import { pickEligible, type GateOptions, type QuoteVideo } from '../../quote-gate'
import { monthStartOf, nextMonth } from '../../reading/month-key'
import { readsAsOffer } from './offers'

// Which quotes the front page may print (market-first WP1.6; plan §4.0
// "Quotes", §7.11).
//
// A QUOTE PRINTED FOR A THEME IS THE EVIDENCE OF ONE OF THAT THEME'S OWN
// INSIGHTS, OF THE RIGHT KIND, DATED IN THE READING MONTH, and never from the
// video's own account. Each of those four is a filter here, on candidates the
// loader read (the theme's insights on the latest themed run, their evidence,
// the comments and the videos behind them):
//
//   - own insight: the candidate is the evidence of an insight the theme names
//     (`themes.supporting_insight_ids`); the loader reads no other;
//   - right kind: the insight's kind is the list's (a question under "Asked"),
//     or, for the lead's voices, the theme's own kind where it has one;
//   - dated in the month: the comment's date falls inside the reading month,
//     so June Cotopaxi quotes never stand under a September headline (GR F9,
//     F10);
//   - not the video's own account: a creator answering under their own post is
//     the video talking, not the market.
//
// AND, FOR THE HEADLINE'S VOICES, NEVER A SALE OFFER OR AN AD (default M-c,
// `./offers.ts`): "300rs pair + shipping . DM for order." is someone selling
// to the market, not the market talking. The next eligible voice is used.
//
// AND, FOR THE HEADLINE'S VOICES, NEVER FROM A MAKER'S VIDEO (decision F:
// makers stay in every count and "never supply the headline's quotes"). The
// lead theme may be up to a quarter makers, so its own evidence can sit under
// a maker's post; where the tenant has a segment rule, a voice is printed only
// from a video the reader precedence marks 'market' (MF1 `segments_for_videos`),
// and a video whose segment was not read is not printed (fail closed). The
// asks keep the four rules above.
//
// "Most-liked" is never the rule. The order is the evidence's own relevance
// rank, then its id, so the choice does not depend on how the rows came back.
// A quote a reader cannot read (another language with no English yet, or out
// of length) is not offered (`readsAsHeroQuote`, the one English gate).
//
// PURE.

export interface QuoteCandidate {
  evidenceId: string
  quote: string
  rank: number
  lang?: string | null
  english?: string | null
  /** `audience_insights.category` of the insight the evidence belongs to. */
  insightKind: string | null
  /** The comment behind it; null for a video-sourced quote, which is never
   *  offered here (it carries no date of its own). */
  commentId: string | null
  commentDate: string | null
  author: string | null
  /** The video's own account (`videos.account_name`), for the own-account
   *  rule. */
  videoAccount: string | null
  /** The segment of the video behind the quote (MF1 `segments_for_videos`:
   *  'maker', 'noise' or 'market'), where it was read. Absent or null where it
   *  was not; `marketVideosOnly` then refuses it. */
  segment?: string | null
  /** The video behind the quote as the quote gate reads it (lib/quote-gate.ts):
   *  its words, filing and segment. Absent where the loader did not read it;
   *  null where it looked and found none. */
  context?: QuoteVideo | null
}

/**
 * An account name as two spellings of it compare: its letters and digits
 * only, in one case (Unicode-aware, after NFKC folding).
 *
 * NOT JUST THE "@" AND THE CASE (WP1.6 review). On YouTube the comment's
 * author is the channel's handle ("@azsewing") while `videos.account_name` is
 * the channel's title ("A-Z Sewing"); stripping the "@" alone matched 7 of
 * September's 7,517 YouTube comments on staging against the channel's own
 * videos, letters and digits 77. A handle that is not its title's letters
 * (a title "The Bag Lady" over "@baglady123") still escapes: the videos store
 * no handle beside the title.
 *
 * REDDIT CANNOT BE CAUGHT HERE: its `account_name` is the subreddit
 * ("r/onebag"), and the videos store no post author, so the post's own author
 * replying in its thread is not recognisable (recorded for WP1.8 and the copy
 * read).
 */
export const accountKey = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** Is this candidate one the page may print for this month and kind? */
export function quotable(c: QuoteCandidate, month: string, kind: string | null): boolean {
  if (!c.commentId || !c.commentDate) return false
  const from = monthStartOf(month)
  const day = c.commentDate.slice(0, 10)
  if (!(day >= from && day < nextMonth(from))) return false
  if (kind && c.insightKind !== kind) return false
  const author = accountKey(c.author)
  if (author && author === accountKey(c.videoAccount)) return false
  return readsAsHeroQuote(cleanQuote(c.quote), { lang: c.lang ?? null, english: c.english ?? null })
}

/** Up to `count` quotes, by the evidence's own rank then its id, one per
 *  wording (the same comment quoted twice prints once). `marketVideosOnly`
 *  (the headline's voices where a segment rule applies, decision F) takes a
 *  quote only from a video whose segment was read as 'market'. `skipOffers`
 *  (the headline's voices, default M-c) skips a quote that reads as a sale
 *  offer or an ad, in its own words or its English (`readsAsOffer`), and the
 *  next eligible one is used.
 *
 *  `gate` (the walkthrough's quote rule, lib/quote-gate.ts): every candidate
 *  also passes the shared gate on its `context` — readable, not a maker's or a
 *  seller's, the right brand, on the market, relevant where the block asks —
 *  and the ones that pass are ranked by it, one per thread. Fewer come back
 *  where fewer pass. */
export function pickQuotes(candidates: readonly QuoteCandidate[], opts: { month: string; kind: string | null; count: number; marketVideosOnly?: boolean; skipOffers?: boolean; gate?: GateOptions }): QuoteCandidate[] {
  const seen = new Set<string>()
  const out: QuoteCandidate[] = []
  const ordered = [...candidates].sort((a, b) => a.rank - b.rank || a.evidenceId.localeCompare(b.evidenceId))
  const limit = opts.gate ? ordered.length : opts.count
  for (const c of ordered) {
    if (out.length >= limit) break
    if (opts.marketVideosOnly && c.segment !== 'market') continue
    if (opts.skipOffers && (readsAsOffer(c.quote) || readsAsOffer(c.english))) continue
    if (!quotable(c, opts.month, opts.kind)) continue
    const key = cleanQuote(c.quote).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  if (!opts.gate) return out
  return pickEligible(out, (c) => ({
    text: c.quote,
    lang: c.lang ?? null,
    english: c.english ?? null,
    video: c.context === undefined ? undefined : c.context === null ? null : { ...c.context, segment: c.context.segment ?? c.segment ?? null },
  }), opts.count, opts.gate)
}
