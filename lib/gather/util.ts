// Small pure helpers for the gather normalisers. Apify actor output is messy and
// varies between actor versions, so extraction is deliberately defensive — the
// same `first(...)`-with-fallbacks pattern the original n8n code used, kept here
// as typed utilities rather than copy-pasted into every node.

import type { GatherConfig } from './types'

/** Coerce anything to a finite number; 0 otherwise (handles "12", "35.3K …" → 0). */
export const num = (x: unknown): number => {
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) ? n : 0
}

/** Coerce to a trimmed string; '' for null/undefined. */
export const str = (x: unknown): string => (x == null ? '' : String(x)).trim()

/** First defined, non-null, non-empty value. */
export const first = <T>(...vals: T[]): T | undefined =>
  vals.find((v) => v !== undefined && v !== null && v !== '')

/** Safe nested getter: getPath(obj, ['channel', 'name']). */
export const getPath = (o: unknown, path: string[]): unknown =>
  path.reduce<unknown>((a, k) => (a == null ? undefined : (a as Record<string, unknown>)[k]), o)

/** Round to 2dp (engagement_rate is numeric(5,2)). */
export const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Coerce the first parseable date-ish value to 'YYYY-MM-DD' (videos.upload_date
 * is a DATE). Handles unix seconds/ms and assorted string formats. null if none parse.
 */
export const toDateOnly = (...vals: unknown[]): string | null => {
  for (const v of vals) {
    if (v == null || v === '') continue
    let d: Date
    if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) {
      const n = Number(v)
      d = new Date(String(v).length <= 10 ? n * 1000 : n)
    } else {
      d = new Date(String(v))
    }
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return null
}

/** Blended engagement over view-bearing platforms. null when there are no views
 *  (Instagram never exposes them — kept out of any engagement number). */
export const engagementRate = (
  views: number | null,
  likes: number,
  shares: number,
  comments: number,
): number | null => (views && views > 0 ? round2(((likes + shares + comments) / views) * 100) : null)

/** Combined Apify search terms: brand + competitor + industry keywords. */
export const searchTerms = (config: GatherConfig): string[] =>
  [
    ...(config.brand_keywords ?? []),
    ...(config.competitor_keywords ?? []),
    ...(config.industry_keywords ?? []),
  ]
    .map((s) => str(s))
    .filter(Boolean)

/** Instagram hashtags must be alphanumeric — strip '#', spaces, punctuation. */
export const cleanHashtag = (s: string): string => s.replace(/[^a-z0-9]/gi, '')

/** Stable dedupe by a string key, keeping first occurrence. */
export const dedupeBy = <T>(arr: T[], key: (x: T) => string): T[] => {
  const seen = new Set<string>()
  const out: T[] = []
  for (const x of arr) {
    const k = key(x)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(x)
  }
  return out
}
