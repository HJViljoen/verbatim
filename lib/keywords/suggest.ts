import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { openai } from '../openai'
import { ANALYSIS_MODEL, ANALYSIS_TEMPERATURE, estimateCost } from '../config'
import { cleanTerms, MIN_KEYWORD_CHARS } from '../onboarding-config'

// Search-term suggestions (WP5, 2026-09-11). The vault has asked for this since
// the first strategy note: "if a Head of Marketing has to figure out what
// industry_keywords means, they'll bounce." A new tenant knows its own name and
// who it competes with — it does not know what people TYPE when they talk about
// the category, which is the only thing a search can find.
//
// Human-confirmed by construction: this returns candidates, the form shows them
// as chips, and nothing reaches tracking_configs until someone keeps them.
// Cheap by construction too — one gpt-4.1-mini call, bounded output, ~$0.001.

/** Terms offered per group. Six is a screenful of chips, and the buckets cap at 15. */
const PER_GROUP = 6
/** Bounds the spend of one call to fractions of a cent whatever the model does. */
const MAX_OUTPUT_TOKENS = 700

export interface SuggestInput {
  company_name: string
  competitor_names: string[]
  industry_keywords: string[]
  website?: string
}

export interface TermSuggestions {
  brand: string[]
  /** Competitor name → the terms people use for it. Keys are the names given. */
  competitors: Record<string, string[]>
  category: string[]
  costUsd: number
}

// Structured output, not a Record: OpenAI's strict schema rejects an object with
// open-ended keys (additionalProperties), so competitors come back as a list and
// are keyed here.
const schema = z.object({
  brand: z.array(z.string()),
  competitors: z.array(z.object({ name: z.string(), terms: z.array(z.string()) })),
  category: z.array(z.string()),
})

function systemPrompt(): string {
  return [
    'You propose SEARCH TERMS for a social-listening product. The terms are typed into TikTok,',
    'YouTube, Instagram and Reddit search, so each one must be something real people actually',
    'write in a caption, a hashtag or a comment about this market.',
    '',
    'Return three groups:',
    `- brand: up to ${PER_GROUP} ways people write THIS company's name — the name itself, common`,
    '  misspellings, the name plus its main product word. Never a generic word on its own.',
    `- competitors: for EACH competitor named, up to ${PER_GROUP} terms the same way.`,
    `- category: up to ${PER_GROUP} phrases for what the company SELLS, in buyers' words, not`,
    '  marketing words — what someone types when they are shopping for or discussing this kind',
    '  of product.',
    '',
    'Rules:',
    `- Every term is at least ${MIN_KEYWORD_CHARS} characters. No hashes, no quotes, no punctuation.`,
    '- Lowercase unless the word is a proper name.',
    '- No single common English word that means something else too ("gear", "seal", "pole") —',
    '  a term like that returns the whole internet, not this market.',
    '- Two to four words is the useful length for a category phrase.',
    '- Suggest nothing you are not reasonably confident about. Fewer, better terms.',
  ].join('\n')
}

function userPrompt(input: SuggestInput): string {
  const lines = [`Company: ${input.company_name}`]
  if (input.website) lines.push(`Website: ${input.website}`)
  lines.push(`Competitors: ${input.competitor_names.join(', ') || '(none given)'}`)
  lines.push(`What they say they sell: ${input.industry_keywords.join(', ') || '(not given — infer it from the name and the competitors)'}`)
  return lines.join('\n')
}

/**
 * One model call. Returns tidy, capped terms and what the call cost. Never
 * throws on a model refusal or a malformed answer — an empty suggestion is a
 * fine outcome for a button that only ever offers.
 */
export async function suggestSearchTerms(input: SuggestInput): Promise<TermSuggestions> {
  const empty: TermSuggestions = { brand: [], competitors: {}, category: [], costUsd: 0 }
  if (!input.company_name.trim()) return empty

  const completion = await openai.chat.completions.parse({
    model: ANALYSIS_MODEL,
    temperature: ANALYSIS_TEMPERATURE,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: userPrompt(input) },
    ],
    response_format: zodResponseFormat(schema, 'search_terms'),
  })

  const costUsd = completion.usage
    ? estimateCost(ANALYSIS_MODEL, completion.usage.prompt_tokens, completion.usage.completion_tokens)
    : 0
  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) return { ...empty, costUsd }

  // Key the competitor lists by the names the caller gave, so a model that
  // rewrites "Ottobock" as "Otto Bock" still lands in the right group.
  const byName = new Map(input.competitor_names.map((n) => [n.toLowerCase().trim(), n]))
  const competitors: Record<string, string[]> = {}
  for (const c of parsed.competitors) {
    const name = byName.get(`${c.name}`.toLowerCase().trim())
    if (!name) continue
    competitors[name] = cleanTerms(c.terms).slice(0, PER_GROUP)
  }

  return {
    brand: cleanTerms(parsed.brand).slice(0, PER_GROUP),
    competitors,
    category: cleanTerms(parsed.category).slice(0, PER_GROUP),
    costUsd,
  }
}

/** Every competitor term as one flat list — what the Settings bucket holds. */
export function flattenCompetitorTerms(s: Pick<TermSuggestions, 'competitors'>): string[] {
  return cleanTerms(Object.values(s.competitors).flat())
}
