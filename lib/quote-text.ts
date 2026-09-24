import { createHash } from 'crypto'

/**
 * The text a translation is keyed on, and the key itself.
 *
 * Its own tiny module so that both ends of the cache — the pipeline step that
 * writes a row and the read path that resolves one at render — agree on the
 * key without either importing the other's world (the writer pulls in the
 * OpenAI client; the reader runs inside a page loader).
 *
 * `normaliseQuoteText` is the same whitespace collapse `cleanQuote`
 * (lib/quotes.ts) applies before a quote is rendered, so the text that was
 * hashed is the text a reader sees. It is deliberately NOT the aggressive fold
 * `normForMatch` (lib/pipeline/quote-match.ts) uses to validate a verbatim
 * against a transcript: that one lower-cases, strips emoji and folds smart
 * quotes, and two texts that differ in exactly those ways are two different
 * things to translate — an all-caps comment and a calm one do not read the
 * same, and an emoji is frequently the whole message.
 */
export function normaliseQuoteText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** sha-256 (hex) of the normalised text — comment_translations.text_hash.
 *
 *  The half of the cache key that survives an edit. The nightly YouTube refresh
 *  upserts a due comment on (client_id, platform, comment_id), so a comment
 *  whose author changed it keeps its row id and gets new text; keyed on the id
 *  alone the cache would serve an English rendering of words the commenter has
 *  replaced. Different text is a different row, and the stale row is simply
 *  never asked for again. */
export function quoteTextHash(text: string): string {
  return createHash('sha256').update(normaliseQuoteText(text), 'utf8').digest('hex')
}
