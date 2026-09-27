import type { SupabaseClient } from '@supabase/supabase-js'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

import { estimateCost } from '../config'
import { openai } from '../openai'
import { logAiCall } from '../pipeline/ai-log'
import { jsRegex, strongPattern } from './aliases'
import type { MentionRow, PlannedMention } from './mentions'
import type { ReadBrand } from './readings'

// The GPT confirm of ambiguous brand hits (market-first plan WP3.5, decision
// L: under $0.10 once, pennies a run). An AMBIGUOUS hit is a match of a
// brand's bare name that no strong form backs ("Patagonia" with no handle, no
// product word): the rule already passed its guards, and the confirm asks the
// model whether the excerpt names the company or the word's other meaning.
//
// OFF FOR EVERY TENANT (BRAND_CONFIRM_ENABLED, lib/config.ts, pinned by
// lib/config.test.ts) until Heinrich says yes, with deploy 5. While it is off,
// an ambiguous hit counts as the rule match it is, and a page prints a brand
// only once its hand-checked precision clears BRAND_PRECISION_FLOOR. The step
// calls the judge only with the switch on AND a judge handed in; the tests
// mock it; nothing here runs on the $0 path.
//
// A VERDICT IS A NEW ROW, never an edit: brand_mentions is append-only. A
// confirmed or rejected hit is written with method 'confirmed' or 'rejected'
// under its rule version plus CONFIRM_SUFFIX (the unique index holds one row
// per rule version), and a reading leaves out every rule match a newer
// 'rejected' row names.

export const BRAND_CONFIRM_MODEL = 'gpt-4.1-mini'
export const BRAND_CONFIRM_PROMPT_VERSION = 'brand_confirm_v1'
export const CONFIRM_SUFFIX = `+${BRAND_CONFIRM_PROMPT_VERSION}`
export const CONFIRM_BATCH = 40

/** A hit's identity across rule versions: the same video, brand, source and comment. */
export const hitKey = (r: Pick<MentionRow, 'video_id' | 'brand_key' | 'source' | 'comment_id'>): string =>
  `${r.video_id}|${r.brand_key}|${r.source}|${r.comment_id ?? ''}`

/** The ambiguous hits: a brand with a bare name, and an excerpt no strong
 *  form of it matches. PURE. */
export function ambiguousMentions(mentions: readonly PlannedMention[], brands: readonly ReadBrand[]): PlannedMention[] {
  const strong = new Map(brands.map((b) => [b.brandKey, strongPattern(b.rule, 'js')]))
  const bare = new Set(brands.filter((b) => b.rule.weak.length > 0).map((b) => b.brandKey))
  return mentions.filter((m) => {
    if (!bare.has(m.row.brand_key)) return false
    const p = strong.get(m.row.brand_key) ?? null
    return !(p !== null && m.excerpt && jsRegex(p).test(m.excerpt))
  })
}

export interface ConfirmItem { key: string; brand: string; excerpt: string }
export type ConfirmJudge = (items: readonly ConfirmItem[]) => Promise<{ verdicts: Map<string, boolean>; costUsd: number }>

/** The rows the verdicts give: 'confirmed' or 'rejected', under the rule
 *  version plus CONFIRM_SUFFIX. A hit with no verdict gets no row. PURE. */
export function confirmRows(ambiguous: readonly PlannedMention[], verdicts: ReadonlyMap<string, boolean>): MentionRow[] {
  const out: MentionRow[] = []
  for (const m of ambiguous) {
    const v = verdicts.get(hitKey(m.row))
    if (v === undefined) continue
    out.push({ ...m.row, method: (v ? 'confirmed' : 'rejected') as MentionRow['method'], rule_version: `${m.row.rule_version}${CONFIRM_SUFFIX}` })
  }
  return out
}

/** Does a rule match count? Not when a 'rejected' row names its hit. */
export function countedUnlessRejected(rejected: ReadonlySet<string>): (m: PlannedMention) => boolean {
  return (m) => !rejected.has(hitKey(m.row))
}

/** Ask the judge, a batch at a time, about the hits no confirm row holds yet. */
export async function confirmAmbiguous(ambiguous: readonly PlannedMention[], judge: ConfirmJudge, alreadyJudged: ReadonlySet<string>): Promise<{ rows: MentionRow[]; costUsd: number; asked: number }> {
  const todo = ambiguous.filter((m) => !alreadyJudged.has(hitKey(m.row)) && m.excerpt)
  const verdicts = new Map<string, boolean>()
  let costUsd = 0
  for (let i = 0; i < todo.length; i += CONFIRM_BATCH) {
    const batch = todo.slice(i, i + CONFIRM_BATCH).map((m) => ({ key: hitKey(m.row), brand: m.brand, excerpt: m.excerpt! }))
    const r = await judge(batch)
    costUsd += r.costUsd
    for (const [k, v] of r.verdicts) verdicts.set(k, v)
  }
  return { rows: confirmRows(todo, verdicts), costUsd, asked: todo.length }
}

const schema = z.object({ verdicts: z.array(z.object({ index: z.number().int(), company: z.boolean() })) })

/** The real judge: one gpt-4.1-mini call a batch, logged to ai_call_log.
 *  Reached only with BRAND_CONFIRM_ENABLED on for the tenant. */
export function openAiConfirmJudge(admin: SupabaseClient, clientId: string, runId: string | null): ConfirmJudge {
  let call = 0
  return async (items) => {
    call++
    const system = [
      'You read short excerpts from social videos and their comments. Each names a word that is also a company or brand name.',
      'For each excerpt, answer company: true only if the excerpt is about the named company or its products;',
      'false if it uses the word in another meaning (a place, a mountain, a weekday, a plain phrase).',
    ].join('\n')
    const user = items.map((it, i) => `[${i}] brand=${it.brand} | ${it.excerpt.replace(/\s+/g, ' ').slice(0, 200)}`).join('\n')
    const started = Date.now()
    const res = await openai.chat.completions.parse({
      model: BRAND_CONFIRM_MODEL,
      temperature: 0,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: zodResponseFormat(schema, 'verdicts'),
    })
    const usage = { prompt_tokens: res.usage?.prompt_tokens ?? 0, completion_tokens: res.usage?.completion_tokens ?? 0 }
    const parsed = res.choices[0]?.message.parsed ?? { verdicts: [] }
    const verdicts = new Map<string, boolean>()
    for (const v of parsed.verdicts) if (items[v.index]) verdicts.set(items[v.index].key, v.company)
    await logAiCall(admin, {
      clientId, runId, pass: 'brand_confirm', callIndex: call, model: BRAND_CONFIRM_MODEL, promptVersion: BRAND_CONFIRM_PROMPT_VERSION,
      systemPrompt: system, userPrompt: user, response: parsed, error: null, usage, durationMs: Date.now() - started, validationStatus: 'ok',
    })
    return { verdicts, costUsd: estimateCost(BRAND_CONFIRM_MODEL, usage.prompt_tokens, usage.completion_tokens) }
  }
}
