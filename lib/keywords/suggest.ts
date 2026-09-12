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

// Prompt-side bounds. MAX_OUTPUT_TOKENS caps only the completion; the fields
// below are POSTed by the caller and pasted straight into the user prompt, so
// without these the "~$0.001 a call" figure holds only for well-behaved input.
// Every real value is far under them — Össur's whole config is ~120 characters.
const MAX_NAME_CHARS = 80
const MAX_TERM_CHARS = 40
const MAX_LIST = 15

export interface SuggestInput {
  company_name: string
  competitor_names: string[]
  industry_keywords: string[]
  website?: string
}

/**
 * Cut the caller's input down to something a prompt can safely hold. Pure, so
 * both callers (onboarding and Settings) bound identically and a test can pin
 * it — the settings action's inputs come from the DB and are already bounded by
 * the CHECK constraints, but the onboarding one comes from a form POST.
 */
export function boundSuggestInput(input: SuggestInput): SuggestInput {
  const clip = (s: string, n: number) => `${s}`.trim().replace(/\s+/g, ' ').slice(0, n)
  const list = (xs: string[]) => (xs ?? []).map((x) => clip(x, MAX_TERM_CHARS)).filter(Boolean).slice(0, MAX_LIST)
  return {
    company_name: clip(input.company_name, MAX_NAME_CHARS),
    competitor_names: list(input.competitor_names),
    industry_keywords: list(input.industry_keywords),
    ...(input.website ? { website: clip(input.website, MAX_NAME_CHARS) } : {}),
  }
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
    `- brand: up to ${PER_GROUP} DISTINCTIVE ways people write THIS company's name. Never the bare`,
    '  one-word name on its own, and never a name that is also a place, a weekday or an ordinary',
    '  noun unless it is paired with a product word. Prefer two- and three-word forms',
    '  ("<name> backpack", "<name> review") and real misspellings. If a name has no distinctive',
    '  form, return fewer terms rather than the bare name.',
    `- competitors: for EACH competitor named, up to ${PER_GROUP} terms under the same rule.`,
    `- category: up to ${PER_GROUP} phrases for what the company SELLS, in buyers' words, not`,
    '  marketing words — what someone types when they are shopping for or discussing this kind',
    '  of product.',
    '',
    'Rules:',
    `- Every term is at least ${MIN_KEYWORD_CHARS} characters. No hashes, no quotes, no punctuation.`,
    '- Lowercase unless the word is a proper name.',
    '- No single common English word that means something else too ("gear", "seal", "pole") —',
    '  a term like that returns the whole internet, not this market.',
    '- Skip anything that is a common English word, a place name, or a day of the week, even when',
    '  it is spelled the way the company spells it ("Cotopaxi" is a volcano, "Freitag" is Friday).',
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
  const bounded = boundSuggestInput(input)
  if (!bounded.company_name) return empty

  const completion = await openai.chat.completions.parse({
    model: ANALYSIS_MODEL,
    temperature: ANALYSIS_TEMPERATURE,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: userPrompt(bounded) },
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
  const byName = new Map(bounded.competitor_names.map((n) => [n.toLowerCase().trim(), n]))
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
