import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { citationLink } from '../evidence-cite'
import { cleanQuote } from '../quotes'
import { quoteGate, type GateOptions, type QuoteVideo } from '../quote-gate'
import { quoteRef } from '../renderables/quotes-freeze'
import type { Quote } from '../renderables/types'
import { marketAudiences, pooledSide, type MarketCount } from '../reading/market'
import { monthStartOf, nextMonth } from '../reading/month-key'
import { marketKindLabel, quotable, readsAsOffer, THEME_FLOOR, type QuoteCandidate } from './overview-market'
import { isMissingRelation } from './overview'
import { rows as readRows } from './read'

// C5 · The market's words (market-first WP3.8, plan §2.4 C5; key `voice.words`,
// new, deploy 5). It answers cuts #44–45: a bank of REAL QUOTES, not of
// repeated phrases (no phrase repeats, F31), for the kinds of thing the market
// said in the reading month.
//
// ONE CARD PER KIND. The six kinds the market says most (the week line's six,
// `lib/reading/week-line.ts`), each at 10 videos or more in the month, biggest
// first. The card's count is the kind's videos in the MARKET (decision E: kinds
// are read on the pooled market, as the front page's "What people did in the
// comments" reads them, so the two pages print one number).
//
// THE QUOTES ARE THE TOP THEMES' OWN EVIDENCE. The themes are the board's rows:
// every category theme at 10 videos or more that is not led by makers or by
// off-topic videos (decision F). A quote printed under a kind is the evidence
// of one of those themes' own insights (`theme_observations.member_insight_ids`
// on the themed update), of that kind, dated in the reading month, never from
// the video's own account (plan §4.0 "Quotes"), readable (the one English
// gate), and not a sale offer or an ad (default M-c). A quote under a maker's
// video is printed and marked; one under an off-topic video is not printed.
//
// ANCHORED ON COMMENT IDS (S14). Each quote's comment is one the month's own
// record of that theme rests on (`month_evidence_refs.comment_ids`), and the
// quote travels as `c:<comments.id>`, never as `e:<insight_evidence.id>`: the
// prune deletes a superseded insight's evidence rows within a week or two
// (IO F49–F50), and an `e:` ref dies with its row, where a `c:` ref resolves
// while ANY evidence row still cites the comment. `c:` resolves to the
// comment's FIRST unredacted excerpt by evidence id (lib/quotes.ts), so a
// quote is offered only where that excerpt is these very words: a stored
// export then prints exactly what the page printed, and never another
// insight's excerpt of the same comment under the wrong kind.
//
// "MOST-LIKED" IS THE TIE-BREAK, NEVER THE RULE (plan §4.0). WP3.8 asks for the
// three most-liked per kind for the top themes; §4.0 forbids likes as the
// selection rule, because the most-liked comments were fans asking small
// makers for their own products (DR F35). So a card takes, in order: the
// themes OF ITS KIND first (a question theme's question, as the front page's
// asks lists and the theme pane pick theirs; staging's pain card otherwise led
// with "It also fits in EVERY overhead bin … which is amazing", a pain insight's
// excerpt inside a question theme), then the evidence's own relevance rank
// (the reader's judgement of what best evidences the insight), then the
// bigger theme (the preview's "from the biggest themes"), then likes, then the
// comment id. At most one quote per theme in a card, so a card's three quotes
// are the best evidence of three themes, the biggest of its own kind first,
// and one comment is printed once on the whole bank.
//
// PURE HALF FIRST, THEN THE READS.

/** The kinds a card is drawn for, in the week line's order (the six big
 *  kinds; `buying_trigger`, `demographic_signal` and `switching_signal` are
 *  thin or not quotable). */
export const WORDS_KINDS = ['praise', 'purchase_intent', 'question', 'pain_point', 'feature_request', 'objection'] as const

/** Quotes a card prints at most. */
export const WORDS_PER_KIND = 3

/** Candidates per kind that reach the translation read, and per theme among
 *  them: enough that the English gate, the offer rule and the quote gate
 *  (lib/quote-gate.ts: makers, sellers, off the market) can each drop some and
 *  still leave three themes to choose from (walkthrough, 29 Sep: 24 and 4
 *  before the quote gate). */
export const WORDS_SHORTLIST = 48
export const WORDS_SHORTLIST_PER_THEME = 8

/** One quote the bank may print: an evidence excerpt on a comment, with what
 *  the rules and the cite need. */
export interface WordsCandidate extends QuoteCandidate {
  /** The theme whose member insight this is evidence of. */
  themeId: string
  likes: number | null
  platform: string | null
  /** The platform's own comment id, for a comment-level link. */
  nativeCommentId: string | null
  /** `videos.id` of the video the comment is under (its segment's key). */
  videoId: string | null
  videoUrl: string | null
  /** `c:<commentId>` resolves to exactly these words: the comment's first
   *  unredacted evidence excerpt, by evidence id, is this one. */
  resolves: boolean
}

export interface WordsQuote {
  /** `c:<comments.id>`: anchored on the comment, so it outlives the prune. */
  quote: Quote
  themeId: string
  /** The theme's label (Pass B's words), as the board prints it. */
  theme: string
  platform: string | null
  /** The comment's own date. */
  date: string | null
  likes: number | null
  /** The video the comment is under is read as a maker's (decision F: makers
   *  stay in, marked). */
  maker: boolean
  /** Where it was said; null where the video has no public URL. */
  href: string | null
}

export interface WordsKind {
  kind: string
  /** The kind in the market's words ("Praising it"). */
  label: string
  /** The kind's videos in the market this month (decision E). */
  videos: number
  quotes: WordsQuote[]
}

export interface WordsBlock {
  month: string
  /** Whether the videos' segments were read: `measured` marks a maker's video
   *  and leaves out an off-topic one; `unknown` (MF1 missing, or the read
   *  failed) prints no mark; `no_rule` is a tenant with no maker rule. */
  segments: 'measured' | 'unknown' | 'no_rule'
  /** The themes the quotes are drawn from (the board's rows). */
  themes: number
  /** Every kind of the six at 10 videos or more, biggest first. */
  kinds: WordsKind[]
}

/** What the bank knows of a theme it draws from: its label (Pass B's words,
 *  after the brand check), its kind and its videos in the month. */
export interface WordsTheme {
  label: string
  kind: string | null
  k: number
}

/** The order a card takes candidates in: a theme of the card's own kind
 *  first, then the evidence's own rank, then the bigger theme, then likes
 *  (the tie-break), then the comment id, so it does not depend on how the
 *  rows came back. */
export function wordsOrder(themes: ReadonlyMap<string, Pick<WordsTheme, 'kind' | 'k'>>): (a: WordsCandidate, b: WordsCandidate) => number {
  const own = (c: WordsCandidate): number => (themes.get(c.themeId)?.kind === c.insightKind ? 0 : 1)
  return (a, b) =>
    own(a) - own(b)
    || a.rank - b.rank
    || (themes.get(b.themeId)?.k ?? 0) - (themes.get(a.themeId)?.k ?? 0)
    || (b.likes ?? 0) - (a.likes ?? 0)
    || String(a.commentId).localeCompare(String(b.commentId))
}

/** Is a candidate one the bank may consider, before its translation is read:
 *  of a kind the bank prints, anchored in the theme's month record, resolving
 *  to its own words, dated in the month, not the video's own account, not
 *  under an off-topic video. `anchors` null means the record could not be
 *  read, and the month's date alone decides. */
function eligible(c: WordsCandidate, month: string, anchors: ReadonlyMap<string, ReadonlySet<string>> | null): boolean {
  if (!c.commentId || !c.resolves) return false
  if (!(WORDS_KINDS as readonly string[]).includes(c.insightKind ?? '')) return false
  if (anchors && !anchors.get(c.themeId)?.has(c.commentId)) return false
  if (c.segment === 'noise') return false
  // The month, the own-account rule and the kind; the English gate waits for
  // the translation (`quotable` again, in `buildWords`).
  const from = monthStartOf(month)
  const day = (c.commentDate ?? '').slice(0, 10)
  return day >= from && day < nextMonth(from)
}

/**
 * The candidates worth a translation read: per kind, in the bank's order, at
 * most `WORDS_SHORTLIST_PER_THEME` from any one theme and `WORDS_SHORTLIST` in
 * all. Pure.
 */
export function shortlistWords(
  candidates: readonly WordsCandidate[],
  month: string,
  anchors: ReadonlyMap<string, ReadonlySet<string>> | null,
  themes: ReadonlyMap<string, Pick<WordsTheme, 'kind' | 'k'>>,
): WordsCandidate[] {
  const out: WordsCandidate[] = []
  for (const kind of WORDS_KINDS) {
    const perTheme = new Map<string, number>()
    let taken = 0
    for (const c of candidates.filter((x) => x.insightKind === kind && eligible(x, month, anchors)).sort(wordsOrder(themes))) {
      if (taken >= WORDS_SHORTLIST) break
      const held = perTheme.get(c.themeId) ?? 0
      if (held >= WORDS_SHORTLIST_PER_THEME) continue
      perTheme.set(c.themeId, held + 1)
      out.push(c)
      taken++
    }
  }
  return out
}

/**
 * The bank. Pure.
 *
 * `kindVideos` is each kind's videos in the market this month (null where the
 * month's kinds were not read: then there is no card to draw). `themes` are
 * the board's rows by registry id, and a theme not here is not drawn from.
 */
export function buildWords(input: {
  month: string
  candidates: readonly WordsCandidate[]
  kindVideos: ReadonlyMap<string, number> | null
  themes: ReadonlyMap<string, WordsTheme>
  anchors: ReadonlyMap<string, ReadonlySet<string>> | null
  segments: WordsBlock['segments']
  /** The quote gate (walkthrough, 29 Sep; lib/quote-gate.ts): a quote prints
   *  only where it passes, ranked by the card's order as before, and a card
   *  takes one quote per video. Absent, the bank is drawn as it was. */
  gate?: GateOptions
}): WordsBlock {
  const month = monthStartOf(input.month)
  const kinds = WORDS_KINDS
    .map((kind) => ({ kind, videos: input.kindVideos?.get(kind) ?? 0 }))
    .filter((k) => k.videos >= THEME_FLOOR)
    .sort((a, b) => b.videos - a.videos || WORDS_KINDS.indexOf(a.kind) - WORDS_KINDS.indexOf(b.kind))
  // One comment, one wording: printed once on the whole bank, under the
  // biggest kind that can take it.
  const usedComments = new Set<string>()
  const usedWords = new Set<string>()
  const out: WordsKind[] = []
  for (const { kind, videos } of kinds) {
    const themes = new Set<string>()
    const threads = new Set<string>()
    const quotes: WordsQuote[] = []
    const ordered = input.candidates
      .filter((c) => c.insightKind === kind && input.themes.has(c.themeId) && eligible(c, month, input.anchors))
      .sort(wordsOrder(input.themes))
    for (const c of ordered) {
      if (quotes.length >= WORDS_PER_KIND) break
      if (themes.has(c.themeId) || usedComments.has(c.commentId as string)) continue
      if (!quotable(c, month, kind)) continue
      if (readsAsOffer(c.quote) || readsAsOffer(c.english)) continue
      const words = cleanQuote(c.quote).toLowerCase()
      if (usedWords.has(words)) continue
      if (input.gate) {
        const theme = input.themes.get(c.themeId) as WordsTheme
        const verdict = quoteGate({
          text: c.quote,
          lang: c.lang ?? null,
          english: c.english ?? null,
          video: c.context === undefined ? undefined : c.context === null ? null : { ...c.context, segment: c.segment ?? c.context.segment ?? null },
        }, { ...input.gate, claim: theme.label })
        if (!verdict.ok) continue
        if (verdict.thread) {
          if (threads.has(verdict.thread)) continue
          threads.add(verdict.thread)
        }
      }
      themes.add(c.themeId)
      usedComments.add(c.commentId as string)
      usedWords.add(words)
      quotes.push({
        quote: {
          ref: quoteRef.comment(c.commentId as string),
          text: cleanQuote(c.quote),
          ...(c.lang != null ? { lang: c.lang, english: c.english ?? null } : {}),
        },
        themeId: c.themeId,
        theme: (input.themes.get(c.themeId) as WordsTheme).label,
        platform: c.platform,
        date: c.commentDate,
        likes: c.likes,
        maker: input.segments === 'measured' && c.segment === 'maker',
        href: citationLink(c.platform, c.videoUrl, c.nativeCommentId).href,
      })
    }
    out.push({ kind, label: marketKindLabel(kind), videos, quotes })
  }
  return { month, segments: input.segments, themes: input.themes.size, kinds: out }
}

/** Each of the six kinds' videos in the market this month (decision E: the
 *  category's and the tracked brands' audiences pooled), from the month's
 *  `month_kind_readings` rows. Pure. */
export function marketKindVideos(
  rowsIn: readonly { month: string; audience: string; kind: string; videos: number | null }[],
  counts: ReadonlyMap<string, MarketCount>,
  month: string,
  rivalAudiences: readonly string[],
): Map<string, number> {
  const out = new Map<string, number>()
  const m = monthStartOf(month)
  const audiences = new Set(marketAudiences(rivalAudiences))
  const read = rowsIn.some((r) => monthStartOf(r.month) === m && audiences.has(r.audience))
  for (const kind of WORDS_KINDS) {
    const side = pooledSide(
      rowsIn.filter((r) => r.kind === kind).map((r) => ({ month: r.month, audience: r.audience, k: r.videos })),
      counts,
      m,
      rivalAudiences,
      { read },
    )
    if (side.k != null) out.set(kind, side.k)
  }
  return out
}

// ---- the reads ----------------------------------------------------------------

export const TABLE_KIND_READINGS = 'month_kind_readings'

/** The month's kind rows for the market's audiences: one read. Null where the
 *  table is not there or the read failed (no card is drawn then). */
export async function loadKindRows(
  client: SupabaseClient,
  clientId: string,
  month: string,
  rivalAudiences: readonly string[],
): Promise<{ month: string; audience: string; kind: string; videos: number | null }[] | null> {
  const res = await client
    .from(TABLE_KIND_READINGS)
    .select('month, audience, kind, videos')
    .eq('client_id', clientId)
    .eq('month', monthStartOf(month))
    .in('audience', marketAudiences(rivalAudiences))
    .in('kind', [...WORDS_KINDS])
  if (res.error) {
    if (!isMissingRelation(res.error, TABLE_KIND_READINGS)) readRows(res as never, 'voice.words.kinds')
    return null
  }
  return ((res.data ?? []) as { month: string; audience: string; kind: string; videos: number | null }[])
}

type EvidenceRead = {
  id: string
  category: string | null
  videos: {
    id: string; video_url: string | null; account_name: string | null
    platform?: string | null; video_id?: string | null; caption?: string | null; hashtags?: string[] | null; topics?: string[] | null
    is_client?: boolean | null; is_competitor?: boolean | null; competitor_name?: string | null; source?: string | null
  } | null
  insight_evidence: {
    id: string
    quote: string | null
    relevance_rank: number | null
    comment_id: string | null
    comments: {
      id: string
      comment_date: string | null
      likes: number | null
      author: string | null
      platform: string | null
      native: string | null
      insight_evidence: { id: string; quote: string | null }[] | null
    } | null
  }[] | null
}

/**
 * The embedded read: each member insight of the six kinds, its video, and its
 * comment evidence dated in the month with each comment's date, likes, author
 * and every other unredacted excerpt that cites it (for the `c:` rule). One
 * request per `UUID_IN_CHUNK` insights: on staging's September, the 14 board
 * themes hold 521 member insights, three requests. Every evidence filter is on
 * the embedded rows, so an insight with nothing dated in the month does not
 * come back at all.
 */
const WORDS_SELECT = [
  'id, category,',
  'videos(id, video_url, account_name, platform, video_id, caption, hashtags, topics, is_client, is_competitor, competitor_name, source),',
  'insight_evidence!inner(id, quote, relevance_rank, comment_id,',
  'comments!inner(id, comment_date, likes, author, platform, native:comment_id, insight_evidence(id, quote)))',
].join(' ')

/** The insight's video as the quote gate reads it; null where it has none. */
function gateVideo(v: EvidenceRead['videos']): QuoteVideo | null {
  if (!v) return null
  return {
    platform: v.platform ?? null, videoId: v.video_id ?? null, caption: v.caption ?? null, hashtags: v.hashtags ?? null,
    topics: v.topics ?? null, accountName: v.account_name, isClient: v.is_client ?? null, isCompetitor: v.is_competitor ?? null,
    competitorName: v.competitor_name ?? null, source: v.source ?? null, segment: null,
  }
}

/** The first unredacted excerpt a `c:` ref resolves to (lowest evidence id). */
export function firstExcerpt(rowsIn: readonly { id: string; quote: string | null }[]): { id: string; quote: string | null } | null {
  let best: { id: string; quote: string | null } | null = null
  for (const r of rowsIn) if (r.quote && (!best || r.id < best.id)) best = r
  return best
}

/**
 * The bank's candidates for these themes: two steps, the members (one read of
 * `theme_observations` on the themed update) and then the embedded evidence
 * read above. Null where nothing could be read (no themed update, or a
 * failure), which the block says rather than printing an empty bank.
 */
export async function loadWordsCandidates(
  supabase: SupabaseClient,
  clientId: string,
  themedRunId: string | null,
  themeIds: readonly string[],
  month: string,
): Promise<WordsCandidate[] | null> {
  if (!themedRunId) return null
  if (themeIds.length === 0) return []
  const obsRes = await supabase
    .from('theme_observations')
    .select('theme_id, member_insight_ids')
    .eq('client_id', clientId)
    .eq('run_id', themedRunId)
    .in('theme_id', [...themeIds])
  if (obsRes.error) {
    readRows(obsRes as never, 'voice.words.members')
    return null
  }
  const themesOf = new Map<string, string[]>()
  for (const o of (obsRes.data ?? []) as { theme_id: string; member_insight_ids: string[] | null }[]) {
    for (const id of o.member_insight_ids ?? []) themesOf.set(String(id), [...(themesOf.get(String(id)) ?? []), String(o.theme_id)])
  }
  const insightIds = [...themesOf.keys()]
  if (insightIds.length === 0) return []
  const from = `${monthStartOf(month)}T00:00:00.000Z`
  const to = `${nextMonth(monthStartOf(month))}T00:00:00.000Z`
  let failed = false
  const pages = await mapWithLimit(chunk(insightIds, UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
    const res = await supabase
      .from('audience_insights')
      .select(WORDS_SELECT)
      .eq('client_id', clientId)
      .in('id', part)
      .in('category', [...WORDS_KINDS])
      // Demographic evidence cites but never quotes (counts-not-quotes), the
      // rule every quote read keeps, here and on the comment's other excerpts.
      .eq('insight_evidence.redacted', false)
      .eq('insight_evidence.source', 'comment')
      .gte('insight_evidence.comments.comment_date', from)
      .lt('insight_evidence.comments.comment_date', to)
      .eq('insight_evidence.comments.insight_evidence.redacted', false)
    if (res.error) {
      failed = true
      readRows(res as never, 'voice.words.evidence')
      return [] as EvidenceRead[]
    }
    return (res.data ?? []) as unknown as EvidenceRead[]
  })
  if (failed) return null
  const out: WordsCandidate[] = []
  for (const insight of pages.flat()) {
    for (const e of insight.insight_evidence ?? []) {
      const c = e.comments
      if (!e.quote || !e.comment_id || !c) continue
      const first = firstExcerpt(c.insight_evidence ?? [])
      const resolves = first != null && (first.id === e.id || cleanQuote(first.quote ?? '') === cleanQuote(e.quote))
      for (const themeId of themesOf.get(String(insight.id)) ?? []) {
        out.push({
          evidenceId: e.id,
          quote: e.quote,
          rank: e.relevance_rank ?? 99,
          insightKind: insight.category,
          commentId: e.comment_id,
          commentDate: c.comment_date,
          author: c.author,
          videoAccount: insight.videos?.account_name ?? null,
          themeId,
          likes: typeof c.likes === 'number' ? c.likes : null,
          platform: c.platform,
          nativeCommentId: c.native,
          videoId: insight.videos?.id ?? null,
          videoUrl: insight.videos?.video_url ?? null,
          resolves,
          context: gateVideo(insight.videos),
        })
      }
    }
  }
  return out
}
