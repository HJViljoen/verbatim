/**
 * Settings › What you track: the words, and nothing that reaches a server.
 * Client components import this module, so it imports nothing that does.
 */

import { effectiveWords } from '@/lib/settings/queue'
import { CONTACT_EMAIL } from '@/lib/legal'

export interface TermLists {
  brand_keywords: string[]
  industry_keywords: string[]
  competitor_keywords: string[]
  exclude_terms: string[]
}

export type TermKey = keyof TermLists

/** The artboard's four groups, in its order, with its words. */
export const TERM_GROUPS: readonly { key: TermKey; name: string; note: string; add: string }[] = [
  { key: 'brand_keywords', name: 'Your name', note: 'Videos that mention you', add: 'Add a term' },
  { key: 'industry_keywords', name: 'The category', note: 'What your market talks about', add: 'Add a term' },
  { key: 'competitor_keywords', name: 'Brands you track', note: 'How people name the brands you track', add: 'Add a term' },
  { key: 'exclude_terms', name: 'Not these', note: 'Videos with these words are left out', add: 'Add a word' },
]

/** What a save says on this page, in the client's words: no searches, no
 *  update, no comparison talk (rule 1). A locked tenant's edit waits for the
 *  1st, and says the date. */
export function saveWords(state: { ok: boolean; message: string; queued?: string; unchanged?: boolean }, lockRefusals: readonly string[] = []): string {
  if (!state.message) return ''
  if (state.queued) return `Saved. This takes effect on ${effectiveWords(state.queued)}.`
  if (state.unchanged) return 'Nothing to change: that is already on the list.'
  if (state.ok) return 'Saved.'
  if (lockRefusals.includes(state.message)) return `This can change from 1 January. Write to ${CONTACT_EMAIL} and we will note it.`
  return state.message
}
