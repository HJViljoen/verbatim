// Evidence-led quote selection, shared by the data pages (Market, Competitive,
// Dashboard). A card leads with the real customer voices; the claim beneath is
// the annotation (Redesign Spec §1 — "in their own words"). The durable source
// of a card's lead quote is the pipeline's `hero_quote` (chosen by the model that
// read every comment); this heuristic picker is the fallback that fills the rest
// and covers rows/runs that predate hero_quote.

export interface QuoteRow {
  quote: string
  rank: number
}

export const cleanQuote = (q: string) => q.replace(/\s+/g, ' ').trim()

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
const wordsOf = (s: string) => s.toLowerCase().match(/[a-z']+/g) ?? []
const englishHits = (q: string) => wordsOf(q).reduce((n, w) => n + (ENGLISH_WORDS.has(w) ? 1 : 0), 0)

/** Content keywords of a claim, for scoring how on-topic a quote is. */
export const keywordsOf = (text: string) =>
  new Set((text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !ENGLISH_WORDS.has(w)))

// A quote earns its place by reading as English AND speaking to the claim it sits
// under — generic praise that merely scans well must not outrank an on-topic voice.
function quoteScore(q: string, keywords: Set<string>): number {
  const len = q.length
  if (len < 18 || len > 170) return -1
  const eng = englishHits(q)
  if (eng < 2) return -1 // reject non-English / transliteration fragments
  let s = Math.min(eng, 5)
  if (len >= 30 && len <= 140) s += 2
  const content = new Set(q.toLowerCase().match(/[a-z']{4,}/g) ?? [])
  let rel = 0
  for (const w of content) if (keywords.has(w)) rel++
  s += rel * 3 // strongly prefer quotes that touch the claim's own words
  return s
}

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

/** Minimal shape of a Supabase-style client for the evidence read. Kept as a
 *  local cast target so callers can pass their fully-typed client without TS
 *  trying to reconcile Postgrest's deeply-recursive builder type ("excessively
 *  deep") against this structural interface. */
interface EvidenceClient {
  from(table: string): {
    select(cols: string): {
      in(col: string, vals: string[]): PromiseLike<{ data: unknown[] | null; error: unknown }>
    }
  }
}

/** Fetch evidence quotes for a set of audience-insight ids (chunked to stay under
 *  the PostgREST URL cap), keyed by audience-insight id. */
export async function fetchQuotesByAudience(
  client: unknown,
  audienceIds: string[],
): Promise<Map<string, QuoteRow[]>> {
  const c = client as EvidenceClient
  const byAudience = new Map<string, QuoteRow[]>()
  for (let i = 0; i < audienceIds.length; i += 120) {
    const { data } = await c
      .from('insight_evidence')
      .select('audience_insight_id, quote, relevance_rank')
      .in('audience_insight_id', audienceIds.slice(i, i + 120))
    for (const r of (data ?? []) as { audience_insight_id: string; quote: string | null; relevance_rank: number | null }[]) {
      if (!r.quote) continue
      const arr = byAudience.get(r.audience_insight_id) ?? []
      arr.push({ quote: r.quote, rank: r.relevance_rank ?? 99 })
      byAudience.set(r.audience_insight_id, arr)
    }
  }
  return byAudience
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
      for (const { quote, rank } of quotesByAudience.get(aid) ?? []) {
        const q = cleanQuote(quote)
        const key = q.toLowerCase()
        if (used.has(key) || localKeys.has(key)) continue
        const base = quoteScore(q, keywords)
        if (base <= 0) continue
        cand.push({ q, score: base + themeBonus, rank })
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
