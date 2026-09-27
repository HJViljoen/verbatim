// The evidence reads of lib/quotes.ts WITHOUT THEIR TRANSLATION READ, for the
// page loaders that keep a few of the quotes they read.
//
// WHY. lib/quotes.ts reads the English of every evidence quote it returns
// (`readTranslations`, 150 texts a request) before it returns them. A loader
// that reads the evidence behind a thousand insights to keep the few hundred a
// window allows, or the one row that vouches for a hero quote, pays for the
// English of all of it: on This week, 48 of the page's 256 reads on staging
// (27 Sep, Sealand), about 7,000 texts, on the critical path of two sections.
// These return the same rows with no reading on them, and the caller reads the
// English (`readTranslations`) for the quotes it keeps. A text's reading is
// keyed on its hash alone, so each kept quote gets the reading it would have
// had.
//
// WHY A COPY, AND WHY HERE. The split belongs in lib/quotes.ts, as an option on
// the functions these copy. lib/quotes.ts is on the freeze-months path (plan
// §7.11, `scripts/pipeline-closure.sh`), where nothing may change before the
// 4 Oct run. So each function here is its original's read line for line: the
// same columns, the same `redacted = false` (demographic_signal evidence cites
// but never quotes), the same 120-id chunks issued the same way, the same row
// filter and the same row shape. THE CHUNK SIZE AND THE ORDER ARE PART OF THE
// OUTPUT, not tuning: a caller's Map is keyed in the order the evidence rows
// arrive, chunk by chunk, and that order decides which quotes a page prints
// (see `fetchChunks` in lib/quotes.ts). Once the freeze lifts, move these into
// lib/quotes.ts and delete this file; until then, a change to the rule there
// must be made here too.

import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, mapWithLimit, READ_CONCURRENCY } from '../chunk'
import type { QuoteCitation, QuoteRow } from '../quotes'
import { memoRead } from '../reading/memo'
import { selectAll } from '../supabase-admin'

/** lib/quotes.ts `fetchChunks`' size, which the reads here copy. */
const EVIDENCE_CHUNK = 120

/** lib/quotes.ts `evidenceSource`: anything unknown, and a NULL on a row
 *  written before the column was scored, reads as a comment. */
const evidenceSource = (s: string | null): NonNullable<QuoteCitation['source']> =>
  s === 'video' || s === 'video_text' ? s : 'comment'

/** Every chunk of one `.in()` evidence read, in chunk order — `fetchChunks`. */
async function evidenceChunks<R>(
  ids: string[],
  read: (part: string[]) => Parameters<typeof selectAll<R>>[0],
): Promise<R[]> {
  const pages = await mapWithLimit(chunk(ids, EVIDENCE_CHUNK), READ_CONCURRENCY, (part) => selectAll<R>(read(part)))
  return pages.flat()
}

/** `fetchQuoteCitationsByAudience`, with no reading on the rows. */
export async function citationsUntranslated(
  supabase: SupabaseClient,
  audienceIds: string[],
): Promise<Map<string, QuoteCitation[]>> {
  const rows = await evidenceChunks<{
    id: string
    audience_insight_id: string
    quote: string | null
    relevance_rank: number | null
    comment_id: string | null
    source_video_id: string | null
    source: string | null
  }>(audienceIds, (part) => () =>
    supabase.from('insight_evidence').select('id, audience_insight_id, quote, relevance_rank, comment_id, source_video_id, source').in('audience_insight_id', part).eq('redacted', false).order('id'),
  )
  const byAudience = new Map<string, QuoteCitation[]>()
  for (const r of rows) {
    if (!r.quote) continue
    // A quote with neither a comment nor a video behind it cannot be cited.
    if (!r.comment_id && !r.source_video_id) continue
    const arr = byAudience.get(r.audience_insight_id) ?? []
    arr.push({
      quote: r.quote,
      rank: r.relevance_rank ?? 99,
      evidenceId: r.id,
      source: evidenceSource(r.source),
      commentId: r.comment_id,
      videoId: r.source_video_id,
    })
    byAudience.set(r.audience_insight_id, arr)
  }
  return byAudience
}

/** `fetchQuotesByAudience`, with no reading on the rows. */
export async function quotesUntranslated(
  supabase: SupabaseClient,
  audienceIds: string[],
): Promise<Map<string, QuoteRow[]>> {
  const rows = await evidenceChunks<{
    id: string
    audience_insight_id: string
    quote: string | null
    relevance_rank: number | null
    source: string | null
  }>(audienceIds, (part) => () =>
    supabase.from('insight_evidence').select('id, audience_insight_id, quote, relevance_rank, source').in('audience_insight_id', part).eq('redacted', false).order('id'),
  )
  const byAudience = new Map<string, QuoteRow[]>()
  for (const r of rows) {
    if (!r.quote) continue
    const arr = byAudience.get(r.audience_insight_id) ?? []
    arr.push({ quote: r.quote, rank: r.relevance_rank ?? 99, evidenceId: r.id, source: evidenceSource(r.source) })
    byAudience.set(r.audience_insight_id, arr)
  }
  return byAudience
}

/**
 * lib/quotes.ts `translationsReachable`, started early (d3 speed pass).
 *
 * `readTranslations` asks the cache one one-row question ("is
 * comment_translations there at all?") before its chunks, memoised per client
 * under this key, so the first English read of a request pays a round trip in
 * front of it. A loader that knows the English is coming can put that
 * question in flight beside the reads before it; `readTranslations` then finds
 * it answered (the same key, the same client) and reads the chunks at once.
 * The same read and the same rule: the yes is remembered, a no is evicted and
 * asked again by the next caller (`memoRead`). WHY A COPY, AND WHY HERE: this
 * file's own reason; lib/quotes.ts is on the freeze-months path, so the probe
 * cannot be exported from it yet, and the key must stay the one it uses.
 */
export function warmTranslationProbe(client: unknown): void {
  memoRead(client, 'quotes:translations-reachable', async () => {
    const c = client as unknown as {
      from(table: string): { select(cols: string): { limit(n: number): PromiseLike<{ error: unknown }> } }
    }
    const { error } = await c.from('comment_translations').select('text_hash').limit(1)
    if (error) throw new Error((error as { message?: string }).message ?? String(error))
    return true as const
  }).catch(() => {})
}
