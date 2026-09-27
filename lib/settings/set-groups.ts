// The search set's groups, in the words the approved preview gives them
// (market-first WP3.10). No imports: the editor, a client component, reads them
// too.

/** The three searched groups of the set, in the page's words: each named for
 *  what it finds, with its line under the name (the approved preview). The
 *  editor's add control (components/settings/tracking/terms.tsx) names them
 *  the same way. */
export const SET_GROUPS = [
  { key: 'brand_keywords', label: 'Your name', sub: 'how people write it' },
  { key: 'competitor_keywords', label: 'Brands you track', sub: 'their products, by name' },
  { key: 'industry_keywords', label: 'The category', sub: 'what people call products like yours' },
] as const

/** The fourth, which filters and is never searched. */
export const NOT_THESE = { key: 'exclude_terms', label: 'Not these', sub: 'other meanings of the names we track' } as const
