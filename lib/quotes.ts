// Evidence-led quote selection, shared by the data pages (Market, Competitive,
// Dashboard). A card leads with the real customer voices; the claim beneath is
// the annotation (Redesign Spec §1 — "in their own words"). The durable source
// of a card's lead quote is the pipeline's `hero_quote` (chosen by the model that
// read every comment); this heuristic picker is the fallback that fills the rest
// and covers rows/runs that predate hero_quote.

import { chunk, HASH_IN_CHUNK, mapWithLimit, READ_CONCURRENCY } from './chunk'
import { memoRead } from './reading/memo'
import { audienceOf } from './rivals'
import { selectAll } from './supabase-admin'
import { VIDEO_QUOTE_BONUS } from './config'
import { quoteTextHash } from './quote-text'
import type { EvidenceSource } from './pipeline/pass-a'

export interface QuoteRow {
  quote: string
  rank: number
  /** insight_evidence.id — the ref a snapshot keeps in place of the words
   *  (Reports & Exports, 2026-08-29). */
  evidenceId: string
  /** insight_evidence.source, carried through as itself. 'video' means a
   *  creator said it on camera rather than typing it (WP7a); 'video_text' is
   *  words printed on the cover frame (WP7b) — neither is a comment, and
   *  relabelling one as 'comment' made fetchQuoteCitationsByAudience emit a
   *  citation with no comment behind it. Absent on rows read before the
   *  pickers scored it. Only onCameraBonus reads this, and only for 'video'. */
  source?: EvidenceSource
  /** The language this text was written in, as comment_translations recorded
   *  it. Absent means "nothing has read this text yet", which is not the same
   *  as English — before the cache fills, every row is absent (item 8,
   *  2026-09-18). */
  lang?: string | null
  /** The machine translation, or null for "this text is already English". A
   *  reading aid shown BESIDE the original, never in place of it, and never
   *  frozen: it is resolved at render exactly as the original is. */
  english?: string | null
}

/** A quote plus what it can be traced back to. The agent's grounded register
 *  may only carry quotes of this shape — "a quote carries a comment id" is the
 *  citation half of the access-is-not-authority rule. */
export interface QuoteCitation extends QuoteRow {
  commentId: string | null
  videoId: string | null
}

export const cleanQuote = (q: string) => q.replace(/\s+/g, ' ').trim()

/** insight_evidence.source as the pipeline wrote it. Anything unknown — and a
 *  NULL on a row written before the column was scored — reads as a comment,
 *  which is what it was. */
const evidenceSource = (s: string | null): EvidenceSource =>
  s === 'video' || s === 'video_text' ? s : 'comment'

// Common English function words. The corpus is heavily multilingual and full of
// Latin-script transliterations that aren't English, so a latin-character ratio
// isn't enough — a real English sentence carries several of these.
const ENGLISH_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'for', 'and', 'or', 'but',
  'my', 'your', 'his', 'her', 'their', 'our', 'it', 'its', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'them', 'us', 'who', 'how', 'what', 'when', 'where', 'why',
  'with', 'have', 'has', 'had', 'do', 'does', 'did', 'get', 'got', 'can', 'could', 'will', 'would',
  'need', 'want', 'so', 'not', 'no', 'on', 'in', 'at', 'as', 'if', 'just', 'really', 'still', 'more', 'than', 'about',
])
// Accents are folded BEFORE tokenising, or the split is the bug: `[a-z']+`
// breaks an accented word at its own diacritic, and the stubs land on the
// English list. "doía" became `do` + `a` — two hits, neither a word anyone
// wrote — which is how a Portuguese comment led an English brief's finding
// (2026-09-05). The corpus's biggest non-English languages are the most
// accented, so the test scored them as the most English.
const foldAccents = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '')
const wordsOf = (s: string) => foldAccents(s.toLowerCase()).match(/[a-z']+/g) ?? []
export const englishHits = (q: string) => wordsOf(q).reduce((n, w) => n + (ENGLISH_WORDS.has(w) ? 1 : 0), 0)

// Counting English words alone cannot separate the corpus: Spanish and
// Portuguese carry English function words of their own — `me`, `a`, `no`,
// `so`, `do`, `as` — so a real Romance comment scores 2 or 3, exactly where
// short real English lands ("Waiting for my new leg." = 2). Measured over 212
// card-length quotes from Össur's own corpus, the count is not separable in
// that band. What does separate them is a word only one of the languages has,
// so these vote against English and the majority decides.
const ROMANCE_WORDS = new Set([
  // articles, pronouns, possessives
  'el', 'la', 'los', 'las', 'lo', 'un', 'una', 'uns', 'unas', 'um', 'uma', 'os', 'ao', 'aos',
  'yo', 'tu', 'vc', 'voce', 'eu', 'ele', 'ela', 'nos', 'ellos', 'elas', 'te', 'lhe', 'seu', 'sua', 'meu', 'minha', 'mi', 'mis', 'nuestro',
  // verbs that carry a sentence
  'es', 'esta', 'estan', 'son', 'ser', 'sou', 'sao', 'tem', 'tengo', 'tenho', 'tiene', 'tinha', 'tenia', 'hay', 'hace', 'fue', 'foi', 'era', 'esta', 'estou', 'quiero', 'quero', 'puedo', 'posso', 'sabe', 'conhece', 'segue', 'ajudem', 'adquirir', 'conseguir',
  // conjunctions, prepositions, adverbs
  'que', 'porque', 'pero', 'mas', 'mais', 'muy', 'muito', 'tambien', 'tambem', 'nao', 'sim', 'como', 'cuando', 'quando', 'donde', 'onde', 'para', 'por', 'con', 'com', 'sem', 'sin', 'sobre', 'desde', 'entre', 'hasta', 'ate', 'del', 'da', 'do', 'das', 'dos', 'na', 'no', 'em', 'ya', 'ja', 'aqui', 'ali', 'ahora', 'agora', 'siempre', 'sempre', 'nunca', 'todo', 'toda', 'todos', 'todas', 'otro', 'outra', 'outro', 'mismo', 'esa', 'ese', 'esta', 'este', 'isso', 'essa', 'esse', 'aquele', 'pues', 'entonces', 'entao',
  // the politeness that opens a comment
  'favor', 'gracias', 'obrigado', 'obrigada', 'saludos', 'amigo', 'irma', 'irmao', 'hermano', 'dios', 'deus',
])
// `no` and `do` are on BOTH lists — Spanish "no", Portuguese "do" against
// English "no"/"do" — so they cancel rather than deciding, which is the
// honest reading of a token that tells us nothing.
const romanceHits = (q: string) => wordsOf(q).reduce((n, w) => n + (ROMANCE_WORDS.has(w) && !ENGLISH_WORDS.has(w) ? 1 : 0), 0)

/** Whether a verbatim can carry a card as its lead quote — in card-length range
 *  and reads as English (the corpus is heavily multilingual; "Yo quiero 🙌🙌"
 *  led a run-1 card). Used by the pipeline to order the hero-quote pool —
 *  a preference, not a hard gate: thin quotes still ground, they just stop
 *  being offered first. */
export const readsAsHeroQuote = (q: string, t?: QuoteLanguage): boolean => {
  const c = cleanQuote(q)
  if (c.length < 18 || c.length > 170) return false
  // With a reading from the cache, the question is whether this reader can read
  // it — not whether it happens to be English. Without one, the heuristic is
  // still the only answer there is.
  if (t && t.lang != null) return quoteAvailability({ text: c, ...t }) !== 'untranslated'
  return englishHits(c) >= 2 && englishHits(c) > romanceHits(c)
}

/** What the cache knows about one text. */
export interface QuoteLanguage {
  lang?: string | null
  english?: string | null
}

/**
 * Can this reader read this quote, and how?
 *
 * THE ONE ENGLISH GATE (item 8, decision A, 2026-09-18). Three disagreeing
 * rules used to answer this: quoteScore's hard `englishHits < 2 → reject`,
 * readsAsHeroQuote used as a filter in two places and as an ordering in two
 * others, and lib/engage.ts's own length-plus-englishHits pair. They differed
 * by about twenty points of the corpus. They now all ask this.
 *
 *   'english'      — written in English. Nothing to add.
 *   'translated'   — written in another language, and an English rendering
 *                    exists. It shows underneath the original, stamped.
 *   'untranslated' — written in another language with no rendering yet, OR
 *                    nothing has read it at all. These are told apart by
 *                    `lang`: absent means unread, which before the cache fills
 *                    is every quote in the corpus, so the heuristic still has
 *                    to answer for those.
 *
 * The inversion item 8 performs is here, in one place: the filter stops meaning
 * "keep only what reads as English" and starts meaning "keep what this reader
 * can read". An export's "English available" is `availability !== 'untranslated'`.
 */
export type QuoteAvailability = 'english' | 'translated' | 'untranslated'

export function quoteAvailability(q: { text: string } & QuoteLanguage): QuoteAvailability {
  if (q.lang == null) {
    // Unread. Fall back to the heuristic that has always answered this, and
    // say 'english' only where that heuristic would have let it through.
    const c = cleanQuote(q.text)
    return englishHits(c) >= 2 && englishHits(c) > romanceHits(c) ? 'english' : 'untranslated'
  }
  if (isEnglishTag(q.lang)) return 'english'
  return q.english && q.english.trim() ? 'translated' : 'untranslated'
}

/** ISO 639-1 'en', 'english', or a regional tag like 'en-GB'. The same test
 *  isEnglishLang (lib/pipeline/translate.ts) applies to a transcript label,
 *  restated here so the read path does not import the pipeline. */
const isEnglishTag = (lang: string | null | undefined): boolean => {
  if (!lang) return false
  const l = lang.trim().toLowerCase()
  return l === 'en' || l === 'english' || /^en[-_]/.test(l)
}

/** Everything a reader can read, original or rendered — the export filter. */
export const readableQuote = (q: { text: string } & QuoteLanguage): boolean =>
  quoteAvailability(q) !== 'untranslated'

/** Content keywords of a claim, for scoring how on-topic a quote is. */
export const keywordsOf = (text: string) =>
  new Set((text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !ENGLISH_WORDS.has(w)))

// A quote earns its place by reading as English AND speaking to the claim it sits
// under — generic praise that merely scans well must not outrank an on-topic voice.
function quoteScore(q: string, keywords: Set<string>, t?: QuoteLanguage): number {
  const len = q.length
  if (len < 18 || len > 170) return -1
  const eng = englishHits(q)
  // The gate is READABILITY, not Englishness (item 8). This is the collapse the
  // plan asks for — quoteScore, readsAsHeroQuote and the inbox gate all ask one
  // question — and it MOVES THE PRE-CACHE ANSWER, in one direction, which the
  // first version of this comment wrongly denied.
  //
  // This line used to be `if (eng < 2) return -1`. The unread fallback is
  // readsAsHeroQuote's rule, `englishHits >= 2 && englishHits > romanceHits`,
  // so it is STRICTLY TIGHTER: a Romance-majority comment carrying two
  // incidental English function words ("no me gusta pero es muy bueno para mi
  // hermano" — `no`, `me`, and `a` inside the accent fold) used to score and now
  // does not. It is the same text the 2026-09-05 fix already kept out of the
  // hero pool while quoteScore went on offering it to cards, and keeping two
  // answers to one question is what item 8 exists to end — so the pool shrinks
  // by that class the moment this deploys, and the backfill hands the same
  // quotes back as 'translated', with an English rendering under them, rather
  // than as English they never were. Pinned by a test that names the movement.
  if (!readableQuote({ text: q, ...t })) return -1
  let s = Math.min(eng, 5)
  if (len >= 30 && len <= 140) s += 2
  const content = new Set(q.toLowerCase().match(/[a-z']{4,}/g) ?? [])
  let rel = 0
  for (const w of content) if (keywords.has(w)) rel++
  s += rel * 3 // strongly prefer quotes that touch the claim's own words
  return s
}

/** A verbatim someone said ON CAMERA edges an equally good typed comment
 *  (WP7a — the costly-signal thesis, already live in the Pass A prompt).
 *  quoteScore and the theme bonus move in whole numbers, so VIDEO_QUOTE_BONUS
 *  can only break a tie: any comment that scores even one point better still
 *  leads the card. `=== 'video'` on purpose: nobody SAID a title card, so
 *  'video_text' earns no on-camera bonus. */
const onCameraBonus = (source: QuoteRow['source']): number => (source === 'video' ? VIDEO_QUOTE_BONUS : 0)

/** Theme-slug overlap with a claim — surfaces the on-topic audience insights
 *  before the generic, high-volume ones (an "access" claim reaches insurance/cost). */
function themeRelevance(id: string, kw: Set<string>, themeSlugById: Map<string, string>): number {
  const theme = themeSlugById.get(id) ?? ''
  let r = 0
  for (const w of theme.split('_')) if (kw.has(w)) r++
  return r
}

/** Order audience-insight ids by how well their theme matches a claim (used to
 *  build a focused quote-fetch pool before the generic voices crowd it out). */
export function rankByTheme(ids: string[], claimText: string, themeSlugById: Map<string, string>): string[] {
  const kw = keywordsOf(claimText)
  return [...ids].sort((a, b) => themeRelevance(b, kw, themeSlugById) - themeRelevance(a, kw, themeSlugById))
}

// ---- entity-bucket scoping (teardown 2026-07-09 §Run 1, defect 1) -----------
// A quote's entity bucket is its source video's — 'client', 'competitor:<name>',
// or 'industry-other' — derived in Step A2 and persisted per theme. Quote pools
// used to fan out across buckets, so a claim about the client could lead with
// another brand's customers. The rule: client-facing claims (Dashboard, Market)
// quote client + category-audience voices; a competitive card quotes that
// competitor's audience.

export interface ThemeBucketRow {
  bucket: string
  supporting_insight_ids: string[] | null
}

/** audience_insight id → entity bucket, from the run's persisted themes. */
export function bucketByAudienceId(themes: ThemeBucketRow[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const t of themes) for (const id of t.supporting_insight_ids ?? []) map.set(id, t.bucket)
  return map
}

/** Keep the client's own + category-audience voices — never a competitor's
 *  customers under a claim about the client. Unmapped ids pass through: the map
 *  is built from the same themes the evidence came from, so a miss means legacy
 *  data (or no themes rows at all), not a competitor voice. */
export function scopeToClientVoices(ids: string[], bucketById: Map<string, string>): string[] {
  if (bucketById.size === 0) return ids
  return ids.filter((id) => !bucketById.get(id)?.startsWith('competitor:'))
}

/** Keep the named competitor's audience. Pass C's competitor_name is model
 *  prose (unvalidated against video.competitor_name), so the bucket match is
 *  case-insensitive; when nothing matches — or the card names no competitor —
 *  fall back to every non-client bucket: a cross-bucket finding may quote the
 *  category, but the client's own customers must never appear as a
 *  competitor's. Unmapped ids are dropped here for the same reason. */
export function scopeToCompetitor(ids: string[], bucketById: Map<string, string>, competitorName: string | null): string[] {
  if (bucketById.size === 0) return ids
  const want = competitorName ? `competitor:${competitorName.trim().toLowerCase()}` : null
  const haveNamed = want != null && [...bucketById.values()].some((b) => b.toLowerCase() === want)
  return ids.filter((id) => {
    const b = bucketById.get(id)
    if (!b) return false
    return haveNamed ? b.toLowerCase() === want : b !== 'client'
  })
}

/** Minimal shape of a Supabase-style client for the evidence read. Kept as a
 *  local cast target so callers can pass their fully-typed client without TS
 *  trying to reconcile Postgrest's deeply-recursive builder type ("excessively
 *  deep") against this structural interface.
 *
 *  A builder reaches `fetchChunks` un-awaited and ends at `.order(...)`, because
 *  each chunk is PAGED: `selectAll` calls the builder afresh per page and closes
 *  it with `.range()`. */
type Page = PromiseLike<{ data: unknown[] | null; error: unknown }>
interface Rows {
  range(from: number, to: number): Page
}
interface Ordered extends Rows {
  order(col: string): Ordered
}
interface EvidenceClient {
  from(table: string): {
    select(cols: string): {
      in(col: string, vals: string[]): Ordered & { eq(col: string, val: boolean): Ordered }
    }
  }
}

/** Split an id list into PostgREST-URL-sized chunks, fetch them ALL AT ONCE,
 *  and page each chunk past the 1000-row cap.
 *
 *  `size` IS IN IDS AND THE LIMIT IS IN BYTES, so a caller whose ids are not
 *  uuids has to say so — readTranslations passes HASH_IN_CHUNK because a
 *  sha-256 hex hash is nearly twice a uuid. The failure is a rejected chunk
 *  that fails the whole Promise.all and takes every reading on the page with
 *  it, so both sizes keep a wide margin under the measured cap (lib/chunk.ts:
 *  500 uuids succeed, 700 do not).
 *
 *  AND THE SIZE IS PART OF WHAT THE PAGE PRINTS, which is why it is still 120
 *  and not `UUID_IN_CHUNK` (lib/chunk.ts, 250 — measured, and what the other
 *  chunked readers now use). The callers below key their result Map by
 *  `audience_insight_id` in the order the EVIDENCE ROWS arrive, and the rows
 *  arrive ordered by evidence id WITHIN each chunk — so the order the insights
 *  land in the Map, and therefore the order a picker meets them, depends on
 *  where the chunk boundaries fall. Raising the size to 250 changed four of
 *  Sealand's "For sales" quotes (verified by diffing the loader's whole output
 *  against the same read before the change; every other page on both tenants
 *  was byte-identical). A performance constant must not choose which sentence
 *  a client reads, so this one stays where it is until the order is settled by
 *  something other than the chunk boundary.
 *
 *  Two different caps, and chunking only answers the first. 120 ids keeps the
 *  request URL short (PostgREST's other limit); it does nothing about the
 *  RESPONSE, and evidence rows per insight are unbounded — one Sealand insight
 *  carries 104, and its 120 densest sum to 1,914. A bare select would drop the
 *  overflow silently, which on the print/export path (up to 40 items × 120 ids)
 *  is quotes simply missing from a deck with nothing saying so. The same
 *  reasoning, and the same shape, as lib/engage.ts `chunkedIn` and the Voice
 *  page's export read.
 *
 *  These helpers used to await one chunk at a time; Market and Voice pass
 *  hundreds to thousands of ids, so a page paid 5–30 serial round trips here —
 *  each one, after an idle spell, at the DB's wake-up price. Chunks are
 *  disjoint by id, so processing the results in chunk order gives the same
 *  per-id ordering the serial loop did. */
async function fetchChunks<R>(ids: string[], fetch: (ids: string[]) => Rows, size = 120): Promise<R[]> {
  const pages = await mapWithLimit(chunk(ids, size), READ_CONCURRENCY, (part) =>
    selectAll<R>(() => fetch(part) as { range: (from: number, to: number) => PromiseLike<{ data: R[] | null; error: unknown }> }),
  )
  return pages.flat()
}



/**
 * Attach the cache's reading to a set of texts.
 *
 * Keyed on the TEXT HASH alone, not on the comment id — three reasons, and the
 * last is the one that decides it:
 *   * the read path frequently has the words and not the comment behind them
 *     (an `e:` ref resolves through insight_evidence, whose comment_id is one
 *     more join away, and an `h:` hero quote has no comment row at all);
 *   * the hash IS the identity of a text, so two comments that say the same
 *     thing share one reading and that is correct rather than a collision;
 *   * a row IS its text's reading, so serving it across tenants is correct
 *     rather than a leak.
 *
 * THAT LAST POINT IS THE DELICATE ONE, and it is not the same as saying this
 * read is tenant-scoped, because it is not. With a session client RLS injects
 * client_id = get_my_client_id() and comment_translations_client_hash_idx
 * serves it. With the ADMIN client — a snapshot hydrate (lib/snapshots.ts), a
 * document build (lib/reports/documents/steps.ts), a scheduled digest and a
 * share link at /r/<token> — there is no client predicate at all, so two
 * tenants whose commenters wrote byte-identical text share whichever row is
 * found first, and tenant A's erasure (which cascades A's row away) leaves B's
 * row answering A's hash. That is harmless HERE and only here: the row holds a
 * machine translation of the exact bytes asked about and nothing tenant-shaped,
 * and a quote whose ORIGINAL does not resolve is dropped before this is
 * consulted (fetchQuoteTextsByRefs resolves through insight_evidence, which the
 * erasure empties). It would stop being harmless the moment a row carried
 * anything a tenant owns — so it must not.
 *
 * 20260918095000 carries comment_translations_hash_idx for the unscoped read:
 * the primary key leads with comment_id and PostgreSQL 17 has no skip scan, so
 * without it every admin chunk sequentially scans the table.
 *
 * Degrades to "nothing is known" on any read failure, including the one that
 * matters before 20260918095000 is applied. A quote with no reading renders as
 * it always has.
 *
 * Exported alongside `readingOf` for the one page that does NOT reach its
 * renderables through a picker: Voice builds a theme pane's quotes straight off
 * insight_evidence rows, so it attaches the reading itself. Every other surface
 * gets it from fetchQuotesByAudience / fetchQuoteCitationsByAudience.
 */
/**
 * The ONLY columns the unscoped read may select, named once so a test can hold
 * it.
 *
 * The cross-tenant read above is correct by argument — a row holds a machine
 * translation of the exact bytes asked about and nothing tenant-shaped — and
 * the argument was load-bearing with nothing enforcing it. The header's own
 * sentence is the condition: "It would stop being harmless the moment a row
 * carried anything a tenant owns." A column added to comment_translations and
 * selected here would breach it silently; a test on this constant makes the
 * breach a red build instead, and the table comment says the same thing to
 * whoever adds the column.
 */
export const TRANSLATION_COLUMNS = 'text_hash, language, english'

/**
 * Is the translation cache reachable at all, asked ONCE per request.
 *
 * WHY A PROBE. The chunked read degrades on failure, which is right, but it
 * degrades ONE CHUNK AT A TIME: with `20260918095000` unapplied, a page asking
 * about 3,600 quote texts sent 60 requests that each took roughly a second to
 * come back "Could not find the table 'public.comment_translations' in the
 * schema cache", and This week sent 71 of them across its two quote loads.
 * Measured against production on 16 September, that was 99 s of Össur's
 * summed read time and 570 s of Sealand's — for an answer that was settled by
 * the first one. A page cannot be under three seconds while it is asking a
 * missing table seventy questions.
 *
 * One cheap row, asked before the chunks go out, and a YES memoised on the
 * client so it is reached once per request whichever loader asks first. The
 * cost when the table IS there is one small extra round trip per request and
 * one extra hop before the chunks; the cost when it is not is one request per
 * load instead of one per chunk — seventy-one became four.
 *
 * ANY failure is "not reachable", not only a missing table. A cache that
 * cannot be read is a page of quotes without their English, which is exactly
 * what the catch below already produced — this only reaches that answer
 * sooner, and says the same thing in the same place.
 *
 * BUT ONLY THE YES IS REMEMBERED. The probe THROWS its "no" rather than
 * returning one, so `memoRead`'s own rule applies to it: a rejection is evicted
 * before it is handed on, and the next caller in the same request asks again.
 * The two failures are not the same failure. A missing table is SETTLED — every
 * chunk of every load would have been told the same thing, which is what makes
 * seventy-one reads into one. A TIMED-OUT ROUND TRIP IS NOT SETTLED, and this
 * instance produces them: an empty read measured 1.9 s and a one-row read
 * 12.6 s on a bad minute of the same afternoon. Remembering that "no" would
 * take the English off every quote in the whole request — This week loads
 * quotes twice, Voice twice — for one unlucky probe, where before the probe
 * existed a flaky read cost its own chunk and no more. So the settled answer is
 * sticky and the flaky one is retried; a caller pays at most one wasted probe.
 */
function translationsReachable(client: unknown): Promise<true> {
  return memoRead(client, 'quotes:translations-reachable', async () => {
    const c = client as unknown as {
      from(table: string): { select(cols: string): { limit(n: number): PromiseLike<{ error: unknown }> } }
    }
    const { error } = await c.from('comment_translations').select('text_hash').limit(1)
    if (error) throw new Error((error as { message?: string }).message ?? String(error))
    return true as const
  })
}

export async function readTranslations(client: unknown, texts: readonly string[]): Promise<Map<string, { lang: string; english: string | null }>> {
  const out = new Map<string, { lang: string; english: string | null }>()
  const hashes = [...new Set(texts.map((t) => cleanQuote(t)).filter(Boolean).map(quoteTextHash))]
  if (!hashes.length) return out
  try {
    await translationsReachable(client)
  } catch (e) {
    console.warn(`[quotes] translation read degraded — ${hashes.length} texts on this page show with no English: ${e instanceof Error ? e.message : String(e)}`)
    return out
  }
  try {
    const c = client as EvidenceClient
    const rows = await fetchChunks<{ text_hash: string; language: string | null; english: string | null }>(
      hashes,
      // `.order('text_hash')` alone is not a unique order, and range paging on
      // a non-unique order can repeat or skip a row. One popular emoji comment
      // shared by a thousand videos would be enough. The primary key is
      // (comment_id, text_hash), so comment_id is the tiebreaker that makes it
      // total — and it need not be selected to be ordered on.
      (part) => c.from('comment_translations').select(TRANSLATION_COLUMNS).in('text_hash', part).order('text_hash').order('comment_id') as unknown as Rows,
      HASH_IN_CHUNK,
    )
    for (const r of rows) if (r.language) out.set(r.text_hash, { lang: r.language, english: r.english })
  } catch (e) {
    // Never fatal: an English rendering is an addition to a quote, and a page
    // that cannot reach the cache shows the originals it has always shown.
    //
    // It is also INVISIBLE on the surface — a quote with no reading renders
    // exactly like one nothing has read — so the log line is the only place it
    // is ever said, and it says how much was lost rather than only that
    // something was. A whole page's worth here means every non-English quote on
    // it showed bare.
    console.warn(`[quotes] translation read degraded — ${hashes.length} texts on this page show with no English: ${e instanceof Error ? e.message : String(e)}`)
  }
  return out
}

/** The reading for one text, or nothing. */
export const readingOf = (
  translations: Map<string, { lang: string; english: string | null }>,
  text: string | null,
): { lang?: string | null; english?: string | null } => {
  const t = text ? translations.get(quoteTextHash(cleanQuote(text))) : undefined
  return t ? { lang: t.lang, english: t.english } : {}
}

/** Fetch evidence quotes for a set of audience-insight ids (chunked to stay under
 *  the PostgREST URL cap), keyed by audience-insight id. */
export async function fetchQuotesByAudience(
  client: unknown,
  audienceIds: string[],
): Promise<Map<string, QuoteRow[]>> {
  const c = client as EvidenceClient
  const byAudience = new Map<string, QuoteRow[]>()
  // redacted = false: demographic_signal evidence cites but never quotes
  // (counts-not-quotes, 2026-08-22); its rows carry quote '' and must never
  // reach a picker.
  const rows = await fetchChunks<{ id: string; audience_insight_id: string; quote: string | null; relevance_rank: number | null; source: string | null }>(
    audienceIds,
    (chunk) => c.from('insight_evidence').select('id, audience_insight_id, quote, relevance_rank, source').in('audience_insight_id', chunk).eq('redacted', false).order('id'),
  )
  const translations = await readTranslations(client, rows.map((r) => r.quote ?? ''))
  for (const r of rows) {
    if (!r.quote) continue
    const arr = byAudience.get(r.audience_insight_id) ?? []
    arr.push({ quote: r.quote, rank: r.relevance_rank ?? 99, evidenceId: r.id, source: evidenceSource(r.source), ...readingOf(translations, r.quote) })
    byAudience.set(r.audience_insight_id, arr)
  }
  return byAudience
}

/** As fetchQuotesByAudience, but carrying the CITATION ids the Verbatim Agent
 *  needs: a quote it shows must be traceable to a real comment on a real video.
 *
 *  A separate function rather than widening the one above, because the pages
 *  that call that one want a bare string to render and nothing else — but it
 *  lives here, beside it, so the `redacted = false` rule stays in one file. If
 *  that filter is ever changed, it must be changed in both. */
export async function fetchQuoteCitationsByAudience(
  client: unknown,
  audienceIds: string[],
): Promise<Map<string, QuoteCitation[]>> {
  const c = client as EvidenceClient
  const byAudience = new Map<string, QuoteCitation[]>()
  // redacted = false: demographic_signal evidence cites but never quotes
  // (counts-not-quotes, 2026-08-22). Same rule as fetchQuotesByAudience.
  const rows = await fetchChunks<{
    id: string
    audience_insight_id: string
    quote: string | null
    relevance_rank: number | null
    comment_id: string | null
    source_video_id: string | null
    source: string | null
  }>(
    audienceIds,
    (chunk) => c.from('insight_evidence').select('id, audience_insight_id, quote, relevance_rank, comment_id, source_video_id, source').in('audience_insight_id', chunk).eq('redacted', false).order('id'),
  )
  const translations = await readTranslations(client, rows.map((r) => r.quote ?? ''))
  for (const r of rows) {
    if (!r.quote) continue
    // A quote with neither a comment nor a video behind it cannot be cited,
    // and an uncitable quote is exactly what the grounded register must not
    // carry. Drop it here rather than let it reach the enforcement step.
    if (!r.comment_id && !r.source_video_id) continue
    const arr = byAudience.get(r.audience_insight_id) ?? []
    arr.push({
      quote: r.quote,
      rank: r.relevance_rank ?? 99,
      evidenceId: r.id,
      source: evidenceSource(r.source),
      commentId: r.comment_id,
      videoId: r.source_video_id,
      ...readingOf(translations, r.quote),
    })
    byAudience.set(r.audience_insight_id, arr)
  }
  return byAudience
}

/** Resolve quote TEXT for a set of comment ids, through insight_evidence.
 *
 *  Deliberately NOT through `comments`: insight_evidence is where the
 *  redacted=false rule lives, and it is what erase-commenter deletes. Reading
 *  the words back through it means an erased comment stops resolving
 *  everywhere at once — which is the property that lets a stored answer carry
 *  ids instead of words. Reading `comments` directly would resolve text the
 *  erasure sweep had already dealt with.
 *
 *  Unresolvable ids are simply absent from the map; the caller drops them. */
export async function fetchQuoteTextsByCommentId(
  client: unknown,
  commentIds: string[],
): Promise<Map<string, string>> {
  const c = client as EvidenceClient
  const out = new Map<string, string>()
  const unique = [...new Set(commentIds.filter(Boolean))]
  const rows = await fetchChunks<{ comment_id: string | null; quote: string | null }>(
    unique,
    (chunk) => c.from('insight_evidence').select('comment_id, quote').in('comment_id', chunk).eq('redacted', false).order('id'),
  )
  for (const r of rows) {
    if (r.comment_id && r.quote && !out.has(r.comment_id)) out.set(r.comment_id, r.quote)
  }
  return out
}

const HERO_TABLES = new Set(['recommendations', 'market_insights', 'competitive_insights', 'account_events'])

/** What a failed read of one kind of ref costs the caller: the quotes, or the
 *  whole call. `fetchQuoteTextsByRefs` takes it; see `refReader` for which
 *  caller asks for which, and why. */
export type QuoteRefReadErrors = 'degrade' | 'throw'

/**
 * One kind of ref's read, and what a failure of it costs.
 *
 * Used ONLY by `fetchQuoteTextsByRefs`, and the asymmetry is the point.
 * `fetchChunks` pages through `selectAll`, which throws on any PostgREST error
 * — right for a live page (it reloads) and for a pipeline step (it retries).
 *
 * 'degrade' is for the HYDRATION boundary of an already-frozen artefact: the
 * Sunday digest send (lib/schedules/deliver.ts), the share link and the
 * PDF/PNG export (app/render/[snapshotId]), the schedule preview and the
 * Studio editor. Those are one-shot renders of numbers that are already final,
 * fired two tenants at a time into a 5-slot account at 06:00 — exactly when a
 * connection reset or a statement timeout on the 120-id comment read is most
 * likely. One transient error on one of eight parallel reads must not be the
 * difference between the digest going out with a few quotes missing and the
 * digest not going out at all. Refs that do not resolve are absent from the
 * map and the resolver drops them by contract, so a failed read degrades
 * exactly as an erased comment does, loudly in the log with the ref kind and
 * how many were being asked for.
 *
 * 'throw' is for the one caller that is COMPOSING an artefact rather than
 * rendering one, inside a context that can retry: the `build-document` freeze
 * step (lib/reports/documents/steps.ts). Its snapshot is the record — a
 * document frozen from fewer quotes than the build asked for is wrong for
 * ever, with nothing on the page saying so — and the step's own retry is the
 * cheap answer to a transient read. The failures are collected and raised
 * once every read has SETTLED rather than propagated as they happen: these
 * reads run in parallel, and a rejection nobody is left to await takes the
 * process down instead of the step.
 */
function refReader(mode: QuoteRefReadErrors) {
  const failed: string[] = []
  const read = async <T>(kind: string, count: number, run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run()
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      if (mode === 'throw') failed.push(`${count} ${kind} ref(s): ${why}`)
      else console.error(`[quotes] ${count} ${kind} ref(s) did not resolve, rendering without them: ${why}`)
      return fallback
    }
  }
  const settle = () => {
    if (failed.length) throw new Error(`[quotes] ${failed.length} ref read(s) failed — ${failed.join(' · ')}`)
  }
  return { read, settle }
}

/** Resolve quote TEXT for snapshot refs — 'e:<insight_evidence.id>',
 *  'c:<comments.id>', 'v:<videos.id>', 'h:<table>:<row id>'
 *  (lib/renderables/quotes-freeze.ts). Same rule and same reason as
 *  fetchQuoteTextsByCommentId: through insight_evidence, redacted = false, so
 *  a stored export re-renders without any voice the erasure sweep has removed.
 *  Hero refs read the row's hero_quote, which that sweep nulls by string
 *  match. Refs that do not resolve are absent from the map and the resolver
 *  drops them.
 *
 *  `onReadError` says what a failed read costs, and defaults to the hydration
 *  path's answer: 'degrade', where a failure of one read costs those quotes
 *  and not the whole render. The build-document freeze step passes 'throw' —
 *  see `refReader` for why this one boundary has two answers where every other
 *  reader in this file has one. */
export async function fetchQuoteTextsByRefs(
  client: unknown,
  refs: string[],
  opts: { onReadError?: QuoteRefReadErrors } = {},
): Promise<Map<string, string>> {
  const c = client as EvidenceClient
  const { read, settle } = refReader(opts.onReadError ?? 'degrade')
  const out = new Map<string, string>()
  const by = { e: [] as string[], c: [] as string[], v: [] as string[], m: [] as string[], p: [] as string[] }
  const heroes = new Map<string, string[]>()
  const brandVoice = new Map<string, number[]>()
  for (const ref of new Set(refs)) {
    const h = /^h:([a-z_]+):(.+)$/.exec(ref)
    if (h) {
      if (HERO_TABLES.has(h[1])) heroes.set(h[1], [...(heroes.get(h[1]) ?? []), h[2]])
      continue
    }
    const b = /^b:([^:]+):(\d+)$/.exec(ref)
    if (b) {
      brandVoice.set(b[1], [...(brandVoice.get(b[1]) ?? []), Number(b[2])])
      continue
    }
    const m = /^([ecvmp]):(.+)$/.exec(ref)
    if (m) by[m[1] as 'e' | 'c' | 'v' | 'm' | 'p'].push(m[2])
  }
  const heroReads = [...heroes.entries()].map(([table, ids]) =>
    read(`h:${table}`, ids.length, async () => {
      const rows = await fetchChunks<{ id: string; hero_quote: string | null }>(
        ids,
        (chunk) => c.from(table).select('id, hero_quote').in('id', chunk).order('id') as unknown as Rows,
      )
      for (const r of rows) if (r.hero_quote) out.set(`h:${table}:${r.id}`, cleanQuote(r.hero_quote))
    }, undefined),
  )
  // "Said about you" claims quoted from videos: run_summary.brand_voice.about[n].
  const brandVoiceRead = brandVoice.size
    ? read('b: (said about you)', brandVoice.size, async () => {
        const rows = await fetchChunks<{ run_id: string; brand_voice: { about?: { quote?: string | null }[] } | null }>(
          [...brandVoice.keys()],
          (chunk) => c.from('run_summary').select('run_id, brand_voice').in('run_id', chunk).order('id') as unknown as Rows,
        )
        for (const r of rows) {
          for (const n of brandVoice.get(r.run_id) ?? []) {
            const q = r.brand_voice?.about?.[n]?.quote
            if (q) out.set(`b:${r.run_id}:${n}`, cleanQuote(q))
          }
        }
      }, undefined)
    : Promise.resolve()
  // m: the comment as posted — read from `comments`, but only for ids an
  // evidence row still cites (redacted = false), so the sweep's deletion and
  // the counts-not-quotes rule reach it exactly as they reach the excerpt.
  const messageRead = by.m.length
    ? read('m: (comment as posted)', by.m.length, async () => {
        const cited = await fetchChunks<{ comment_id: string | null }>(
          by.m,
          (chunk) => c.from('insight_evidence').select('comment_id').in('comment_id', chunk).eq('redacted', false).order('id'),
        )
        const ok = new Set(cited.map((r) => r.comment_id).filter((id): id is string => !!id))
        const rows = await fetchChunks<{ id: string; text: string | null }>(
          [...ok],
          (chunk) => c.from('comments').select('id, text').in('id', chunk).order('id') as unknown as Rows,
        )
        for (const r of rows) if (r.text) out.set(`m:${r.id}`, cleanQuote(r.text))
      }, undefined)
    : Promise.resolve()
  // p: a customer phrase — language_samples by id (cascade-deleted with its comment).
  const phraseRead = by.p.length
    ? read('p: (customer phrase)', by.p.length, async () => {
        const rows = await fetchChunks<{ id: string; phrase: string | null }>(
          by.p,
          (chunk) => c.from('language_samples').select('id, phrase').in('id', chunk).order('id') as unknown as Rows,
        )
        for (const r of rows) if (r.phrase) out.set(`p:${r.id}`, r.phrase)
      }, undefined)
    : Promise.resolve()
  const [byId, byComment, byVideo] = await Promise.all([
    read('e: (evidence)', by.e.length, () => fetchChunks<{ id: string; quote: string | null }>(
      by.e,
      (chunk) => c.from('insight_evidence').select('id, quote').in('id', chunk).eq('redacted', false).order('id'),
    ), []),
    read('c: (comment)', by.c.length, () => fetchChunks<{ comment_id: string | null; quote: string | null }>(
      by.c,
      (chunk) => c.from('insight_evidence').select('comment_id, quote').in('comment_id', chunk).eq('redacted', false).order('id'),
    ), []),
    read('v: (video)', by.v.length, () => fetchChunks<{ source_video_id: string | null; quote: string | null }>(
      by.v,
      (chunk) => c.from('insight_evidence').select('source_video_id, quote').in('source_video_id', chunk).eq('redacted', false).order('id'),
    ), []),
  ])
  await Promise.all([...heroReads, brandVoiceRead, messageRead, phraseRead])
  // Every read has settled; under 'throw' this is where their failures arrive.
  settle()
  for (const r of byId) if (r.quote && !out.has(`e:${r.id}`)) out.set(`e:${r.id}`, r.quote)
  for (const r of byComment) if (r.comment_id && r.quote && !out.has(`c:${r.comment_id}`)) out.set(`c:${r.comment_id}`, r.quote)
  for (const r of byVideo) if (r.source_video_id && r.quote && !out.has(`v:${r.source_video_id}`)) out.set(`v:${r.source_video_id}`, r.quote)
  return out
}

/**
 * As fetchQuoteTextsByRefs, plus the reading: for each ref, the original words
 * and — where the cache has one — the language and the English rendering.
 *
 * THE HYDRATION DOOR FOR ITEM 8. A snapshot stores a ref and nothing else; the
 * words come back here, and so does their English. That is the only shape
 * consistent with "exports and reports freeze numbers, never words": if the
 * rendering were stored on the frozen quote it would be a third party's words
 * inside report_snapshots.data, which is precisely what the freeze exists to
 * prevent — and it would outlive the erasure that took the original.
 *
 * `onReadError` behaves exactly as it does on the text read. The translation
 * read is never part of that contract: it degrades on its own, always, because
 * a digest that goes out with the originals and no English beside them is a
 * lesser artefact, and a digest that does not go out is not one at all.
 */
export async function fetchQuoteResolutionsByRefs(
  client: unknown,
  refs: string[],
  opts: { onReadError?: QuoteRefReadErrors } = {},
): Promise<Map<string, QuoteResolution>> {
  const texts = await fetchQuoteTextsByRefs(client, refs, opts)
  const translations = await readTranslations(client, [...texts.values()])
  const out = new Map<string, QuoteResolution>()
  for (const [ref, text] of texts) out.set(ref, { text, ...readingOf(translations, text) })
  return out
}

/** What one ref resolves to at render: the original, and the reading. */
export interface QuoteResolution {
  text: string
  lang?: string | null
  english?: string | null
}

/** audience-insight id → entity bucket, resolved through each insight's source
 *  video's CURRENT tags. Insights with no source video are absent from the map
 *  (the caller falls back to the stored theme bucket for those).
 *
 *  DEFERRED, deliberately (2026-09-11): the other half of this problem is that
 *  `scripts/run-tagging.ts --write` moves videos.is_client and re-buckets no
 *  stored theme, so every surface that still reads `themes.bucket` (Dashboard,
 *  Market, Pass C/D) keeps the pre-re-tag answer until the next full run. This
 *  function fixes the agent and Ask paths by reading live; making run-tagging
 *  trigger a Step A2 re-bucket would fix the rest. Not done — no tenant has been
 *  re-tagged since its last run, so it changes nothing today. */
export async function fetchLiveBucketsByAudience(
  client: unknown,
  insights: { id: string; source_video_id: string | null }[],
): Promise<Map<string, string>> {
  const c = client as EvidenceClient
  const videoIds = [...new Set(insights.map((i) => i.source_video_id).filter((v): v is string => Boolean(v)))]
  if (!videoIds.length) return new Map()
  const rows = await fetchChunks<{
    id: string
    is_client: boolean | null
    is_competitor: boolean | null
    competitor_name: string | null
  }>(videoIds, (chunk) =>
    c.from('videos').select('id, is_client, is_competitor, competitor_name').in('id', chunk).order('id'),
  )
  // A short read here is not cosmetic. This map decides whether the agent may
  // say "your customers" (lib/agent/enforce.ts → components/agent-answer.tsx),
  // and an empty one silently reverts that decision to the stale stored bucket
  // — the exact failure this gate was built to end. It must never be the first
  // anyone hears of it.
  if (rows.length < videoIds.length) {
    console.warn(
      `[quotes] live entity read resolved ${rows.length}/${videoIds.length} videos — ` +
      `insights whose video did not resolve fall back to their stored theme bucket`,
    )
  }
  const bucketByVideo = new Map(rows.map((r) => [r.id, audienceOf(r)]))
  const out = new Map<string, string>()
  for (const i of insights) {
    if (!i.source_video_id) continue
    const b = bucketByVideo.get(i.source_video_id)
    if (b) out.set(i.id, b)
  }
  return out
}

/** Insight fields for a SET OF IDS, chunked to stay under the PostgREST URL cap.
 *  Reads the BASE table, never `audience_insights_current`: ids stored by the
 *  run a page is displaying must still resolve while a NEWER run has superseded
 *  those videos' rows but not yet pruned them, and after a failed run whose
 *  Pass A moved pointers its themes never used (incremental Pass A, 2026-08-17).
 *  Population reads ("all current insights") use the view instead. */
export async function fetchInsightsByIds<T>(client: unknown, ids: string[], select: string): Promise<T[]> {
  const c = client as EvidenceClient
  const unique = [...new Set(ids)]
  return fetchChunks<T>(unique, (chunk) => c.from('audience_insights').select(select).in('id', chunk).order('id'))
}

/** A per-page quote picker with cross-card de-duplication (no voice repeats on a
 *  page). Lead with the pipeline's `heroQuote` when present, then fill from the
 *  heuristic pool. */
export function createQuotePicker(
  quotesByAudience: Map<string, QuoteRow[]>,
  themeSlugById: Map<string, string>,
) {
  const used = new Set<string>()

  return function pick(audienceIds: string[], n: number, claimText: string, heroQuote?: string | null): string[] {
    const chosen: string[] = []
    const localKeys = new Set<string>()
    const take = (raw: string) => {
      const q = cleanQuote(raw)
      const key = q.toLowerCase()
      if (!q || used.has(key) || localKeys.has(key)) return
      localKeys.add(key)
      used.add(key)
      chosen.push(q)
    }

    // The model's pick leads and bypasses the English/relevance gate — it was
    // chosen by the pass that read every comment.
    if (heroQuote) take(heroQuote)
    if (chosen.length >= n) return chosen

    const keywords = keywordsOf(claimText)
    const cand: { q: string; score: number; rank: number }[] = []
    for (const aid of audienceIds) {
      const themeBonus = themeRelevance(aid, keywords, themeSlugById) * 2
      for (const { quote, rank, source, lang, english } of quotesByAudience.get(aid) ?? []) {
        const q = cleanQuote(quote)
        const key = q.toLowerCase()
        if (used.has(key) || localKeys.has(key)) continue
        const base = quoteScore(q, keywords, { lang, english })
        if (base <= 0) continue
        cand.push({ q, score: base + themeBonus + onCameraBonus(source), rank })
      }
    }
    cand.sort((a, b) => b.score - a.score || a.rank - b.rank)
    for (const c of cand) {
      if (chosen.length >= n) break
      take(c.q)
    }
    return chosen
  }
}

/** A quote the spine can freeze: the words plus the ref they resolve through.
 *  `lang` and `english` ride along for the render and are stripped by the
 *  freeze — an English rendering is a third party's words and no more belongs
 *  in report_snapshots.data than the original does. */
export interface CitedQuote {
  ref: string
  text: string
  lang?: string | null
  english?: string | null
}

/** As createQuotePicker, returning CITED quotes — { ref: 'e:<evidence id>',
 *  text } — so a page loader's output can be frozen into a snapshot with the
 *  words stripped and resolved live at render. Same scoring, same cross-card
 *  de-duplication, same hero-quote lead; a hero quote carries no evidence id
 *  (it is a copy in the parent row), so it is cited by the parent row —
 *  `heroRef` — which the caller supplies (e.g. 'e:' + the evidence row that
 *  matched it, or nothing, in which case the hero quote is skipped here and
 *  the caller renders it from the row itself). */
export function createCitedQuotePicker(
  quotesByAudience: Map<string, QuoteRow[]>,
  themeSlugById: Map<string, string>,
) {
  const used = new Set<string>()

  return function pick(audienceIds: string[], n: number, claimText: string, heroQuote?: string | null): CitedQuote[] {
    const chosen: CitedQuote[] = []
    const localKeys = new Set<string>()
    const take = (raw: string, ref: string, t?: QuoteLanguage) => {
      const q = cleanQuote(raw)
      const key = q.toLowerCase()
      if (!q || used.has(key) || localKeys.has(key)) return
      localKeys.add(key)
      used.add(key)
      chosen.push(t && t.lang != null ? { ref, text: q, lang: t.lang, english: t.english ?? null } : { ref, text: q })
    }

    // The model's hero quote leads when the pool can vouch for it — i.e. an
    // evidence row carries the same words. A hero quote with no evidence row
    // behind it cannot be frozen honestly, so it is left to the caller.
    if (heroQuote) {
      const want = cleanQuote(heroQuote).toLowerCase()
      let ref: string | null = null
      let reading: QuoteLanguage | undefined
      outer: for (const aid of audienceIds) {
        for (const row of quotesByAudience.get(aid) ?? []) {
          if (cleanQuote(row.quote).toLowerCase() === want) {
            ref = `e:${row.evidenceId}`
            reading = { lang: row.lang, english: row.english }
            break outer
          }
        }
      }
      if (ref) take(heroQuote, ref, reading)
    }
    if (chosen.length >= n) return chosen

    const keywords = keywordsOf(claimText)
    const cand: { q: string; ref: string; score: number; rank: number; lang?: string | null; english?: string | null }[] = []
    for (const aid of audienceIds) {
      const themeBonus = themeRelevance(aid, keywords, themeSlugById) * 2
      for (const { quote, rank, evidenceId, source, lang, english } of quotesByAudience.get(aid) ?? []) {
        const q = cleanQuote(quote)
        const key = q.toLowerCase()
        if (used.has(key) || localKeys.has(key)) continue
        const base = quoteScore(q, keywords, { lang, english })
        if (base <= 0) continue
        cand.push({ q, ref: `e:${evidenceId}`, score: base + themeBonus + onCameraBonus(source), rank, lang, english })
      }
    }
    cand.sort((a, b) => b.score - a.score || a.rank - b.rank)
    for (const c of cand) {
      if (chosen.length >= n) break
      take(c.q, c.ref, { lang: c.lang, english: c.english })
    }
    return chosen
  }
}
