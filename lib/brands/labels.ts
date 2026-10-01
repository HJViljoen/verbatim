// Who talk is about, as a page PRINTS it: the type, the one order and the one
// wording (lib/brands/attribution.ts holds the rule and the reads, and
// re-exports these). Split out at integration because a client component
// draws a brand line too (Your moves' statement form): this module imports
// nothing, so it is safe in a client bundle, where attribution's reads (and
// the brand matcher's node:crypto behind them) are not.

/** Who an item is about: the client, one tracked rival by name, or the market. */
export type About = 'client' | `rival:${string}` | 'market'

/** One part of a split: who, and how many distinct videos. */
export interface AboutPart {
  about: About
  videos: number
}

/** The market's words: long ("Other bags in your market", a lone label),
 *  short ("other bags", inside a split) and inline ("other bags in your
 *  market", inside a sentence). */
export interface MarketLabels {
  long: string
  short: string
  inline: string
}

/** The market's words from the noun for what the tenant sells ("bags"), or
 *  the noun-less fallback. THE one wording. */
export function marketLabelsOf(noun: string | null | undefined): MarketLabels {
  const n = (noun ?? '').trim()
  return n
    ? { long: `Other ${n} in your market`, short: `other ${n}`, inline: `other ${n} in your market` }
    : { long: 'Others in your market', short: 'others', inline: 'others in your market' }
}

/** The printed name an `About` stands for (the market is the caller's). */
export function aboutName(about: About, brands: { client: string }): string | null {
  if (about === 'client') return brands.client
  if (about === 'market') return null
  return about.slice('rival:'.length)
}

/** The one order (the design's): the client first, then the rivals by
 *  videos (most first, then by name), the market last. */
export function sortParts(parts: readonly AboutPart[], brands: { client: string }): AboutPart[] {
  const rank = (p: AboutPart): number => (p.about === 'client' ? 0 : p.about === 'market' ? 2 : 1)
  return [...parts]
    .filter((p) => p.videos > 0)
    .sort((a, b) => rank(a) - rank(b) || b.videos - a.videos || (aboutName(a.about, brands) ?? '').localeCompare(aboutName(b.about, brands) ?? ''))
}
