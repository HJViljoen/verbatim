import { z } from 'zod'
import { promptText } from '../lib/gather/transcript'
import { fold, str } from '../lib/gather/util'
import type { AttrCandidate, AttributionJudge, JudgeItem } from '../lib/gather/attribution'
import type { GatherConfig } from '../lib/gather/types'

// The EARLIER attribution judges, frozen, so scripts/eval-attribution.ts can
// score the current judge against them on the same gold set. Nothing in the
// product imports this file. Each prompt is a verbatim copy of the text as it
// stood at the commit named, so a baseline number stays reproducible after the
// judge in lib/gather/attribution.ts moves on.

const BRAND = 'BRAND'
const NONE = 'NONE'
const MODEL = 'gpt-4.1-mini'

/** v1 and v2 answered in this shape: the label first, then the reason. */
const legacySchema = z.object({
  verdicts: z.array(z.object({ index: z.number().int(), entity: z.string(), reason: z.string() })),
})
const legacyVerdicts = (parsed: unknown) => (parsed as z.infer<typeof legacySchema>).verdicts

function exclusionLines(config: GatherConfig): string[] {
  const excluded = (config.exclude_terms ?? []).map((t) => `${t}`.trim()).filter(Boolean)
  return excluded.length > 0
    ? [
        '',
        `For THIS client, matches about any of these are NOT about the brand: ${excluded.join(', ')}.`,
        'They name other senses of the names, not banned words — a video genuinely about the company',
        'or its products stays attributed even if one of them appears in it.',
      ]
    : []
}

// ---- v1: main at 5fad8c83 -------------------------------------------------------

function v1System(config: GatherConfig): string {
  const brand = config.brand_keywords?.[0] ?? 'the brand'
  const category = (config.industry_keywords ?? []).join(', ') || 'the brand’s category'
  return [
    `You attribute social videos to a brand ("${brand}") or its competitors for a consumer-intelligence report.`,
    `The brand and its competitors make: ${category}.`,
    '',
    'Each video already matched one or more entity NAMES by keyword. Those matches are CANDIDATES only.',
    'Decide which ONE entity the video is genuinely ABOUT — it shows, reviews, mentions, compares, or',
    'discusses that company or its products — or NONE if every match is coincidental.',
    '',
    'Reject coincidental matches — a brand name that is also a common word or a place:',
    '- "Freitag" is German for "Friday"; a video about a day, the weather, or news is NOT the bag brand.',
    '- "Patagonia" and "Cotopaxi" are regions in South America; travel/scenery content is NOT the brand.',
    'When the name is used as the ordinary word or the place, answer NONE.',
    '',
    'If the brand is genuinely featured, prefer BRAND. Otherwise return the exact competitor name it is about.',
    'Return exactly one of the candidate labels listed for that video, or NONE.',
    ...exclusionLines(config),
  ].join('\n')
}

/** main's user prompt, with ONE deliberate difference: its cuts are made by
 *  code point (promptText). main cut by UTF-16 unit, which splits an emoji at
 *  unit 199 and 400s the whole batch — that measures the transport bug, not the
 *  prompt, and the transport bug is fixed on this branch. */
function v1User(items: JudgeItem[]): string {
  const lines = ['VIDEOS — for each, pick which candidate it is genuinely about (or NONE):']
  items.forEach(({ cand, labels }, i) => {
    const caption = promptText(str(cand.caption), 200)
    const tags = (cand.hashtags ?? []).slice(0, 8).map((h) => promptText(str(h), 60)).join(' ')
    lines.push(
      `[${i}] candidates=[${labels.join(', ')}] | account=${promptText(str(cand.account_name), 100) || '(none)'} | caption=${caption || '(none)'} | hashtags=${tags || '(none)'}`,
    )
  })
  return lines.join('\n')
}

// ---- v2: attribution_v2 at a355687a (the staging rehearsal's judge) -----------

const CAPTION_HEAD = 200
const HASHTAGS_SHOWN = 8
const ACCOUNT_CHARS = 100
const HASHTAG_CHARS = 60
const MENTION_CONTEXT = 60

function v2System(config: GatherConfig): string {
  const brand = config.brand_keywords?.[0] ?? 'the brand'
  const category = (config.industry_keywords ?? []).join(', ') || 'the brand’s category'
  return [
    `You attribute social videos to a brand ("${brand}") or its competitors for a consumer-intelligence report.`,
    `The brand and its competitors make: ${category}.`,
    '',
    'Each video already matched one or more entity NAMES by keyword. Those matches are CANDIDATES only.',
    'Decide which ONE entity the video is genuinely ABOUT — it shows, reviews, mentions, compares, or',
    'discusses that company or its products — or NONE if every match is coincidental.',
    '',
    'Reject coincidental matches — a brand name that is also a common word or a place:',
    '- "Freitag" is German for "Friday"; a video about a day, the weather, or news is NOT the bag brand.',
    '- "Patagonia" and "Cotopaxi" are regions in South America; travel/scenery content is NOT the brand.',
    'When the name is used as the ordinary word or the place, answer NONE.',
    'A name that is also a common word, a day, a date, a place or a person needs visible sign of the company or its products (what the brand and its competitors make, above), a store, or the company’s own handle; otherwise NONE — German day phrasings such as "am/ab/diesen/jeden Freitag", "Freitag 21.8.", "#friday" or "Freitagskracher" are the day, not the brand.',
    'A video that lists, ranks or rounds up many brands, or names the company only in a gear list or affiliate links, is NONE unless that company is its main subject.',
    'If the candidate name is not visible in the text shown for that video (account, caption, hashtags or mentions), answer NONE.',
    '',
    'mentions=[…] quotes the words around a candidate name that sits further into a long caption than the part shown.',
    '',
    'If the brand is genuinely featured, prefer BRAND. Otherwise return the exact competitor name it is about.',
    'Return exactly one of the candidate labels listed for that video, or NONE.',
    ...exclusionLines(config),
  ].join('\n')
}

function foldedIndexOf(points: readonly string[], needle: string): { start: number; end: number } | null {
  if (!needle) return null
  let folded = ''
  const origin: number[] = []
  points.forEach((cp, i) => {
    const f = cp.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    for (let j = 0; j < f.length; j++) origin.push(i)
    folded += f
  })
  const at = folded.indexOf(needle)
  if (at < 0) return null
  return { start: origin[at], end: origin[at + needle.length - 1] + 1 }
}

function v2Snippets(cand: AttrCandidate, labels: readonly string[], config: GatherConfig): string[] {
  const caption = str(cand.caption).replace(/\s+/g, ' ').trim()
  const shown = fold([
    promptText(str(cand.account_name), ACCOUNT_CHARS),
    promptText(caption, CAPTION_HEAD),
    ...(cand.hashtags ?? []).slice(0, HASHTAGS_SHOWN).map((h) => promptText(str(h), HASHTAG_CHARS)),
  ].join(' '))
  const hay = fold([cand.account_name, caption, ...(cand.hashtags ?? [])].join(' '))
  const points = [...caption]
  const out: string[] = []
  for (const label of labels) {
    if (label === NONE) continue
    const names = label === BRAND
      ? (config.brand_keywords ?? []).map(fold).filter((k) => k !== '' && hay.includes(k))
      : [fold(label)]
    if (names.length === 0 || names.some((n) => shown.includes(n))) continue
    const name = names[0]
    const hit = foldedIndexOf(points, name)
    if (hit) {
      const from = Math.max(0, hit.start - MENTION_CONTEXT)
      const to = Math.min(points.length, hit.end + MENTION_CONTEXT)
      const words = `${from > 0 ? '…' : ''}${points.slice(from, to).join('')}${to < points.length ? '…' : ''}`
      out.push(`${label}: ${promptText(words, 2 * MENTION_CONTEXT + name.length + 2)}`)
      continue
    }
    const tag = (cand.hashtags ?? []).slice(HASHTAGS_SHOWN).find((h) => fold(h).includes(name))
    if (tag) out.push(`${label}: ${promptText(str(tag), HASHTAG_CHARS)}`)
  }
  return out
}

function v2User(items: JudgeItem[], config: GatherConfig, withMentions: boolean): string {
  const lines = ['VIDEOS — for each, pick which candidate it is genuinely about (or NONE):']
  items.forEach(({ cand, labels }, i) => {
    const caption = promptText(str(cand.caption), CAPTION_HEAD)
    const tags = (cand.hashtags ?? []).slice(0, HASHTAGS_SHOWN).map((h) => promptText(str(h), HASHTAG_CHARS)).filter(Boolean).join(' ')
    const account = promptText(str(cand.account_name), ACCOUNT_CHARS)
    const mentions = withMentions ? v2Snippets(cand, labels, config) : []
    lines.push(
      `[${i}] candidates=[${labels.join(', ')}] | account=${account || '(none)'} | caption=${caption || '(none)'} | hashtags=${tags || '(none)'}` +
      (mentions.length > 0 ? ` | mentions=[${mentions.join('; ')}]` : ''),
    )
  })
  return lines.join('\n')
}

export const FROZEN_JUDGES: Record<string, AttributionJudge> = {
  v1: {
    version: 'attribution_v1', model: MODEL, systemPrompt: v1System,
    userPrompt: (items) => v1User(items), schema: legacySchema, verdicts: legacyVerdicts,
  },
  v2: {
    version: 'attribution_v2', model: MODEL, systemPrompt: v2System,
    userPrompt: (items, config) => v2User(items, config, true), schema: legacySchema, verdicts: legacyVerdicts,
  },
  // The same v2 system prompt, with the mentions= snippets left out of the
  // user prompt — the ablation for "the snippets make it confirm gear lists".
  'v2-nosnip': {
    version: 'attribution_v2 (no mentions=)', model: MODEL, systemPrompt: v2System,
    userPrompt: (items, config) => v2User(items, config, false), schema: legacySchema, verdicts: legacyVerdicts,
  },
}
