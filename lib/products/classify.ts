import type { SupabaseClient } from '@supabase/supabase-js'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

import { estimateCost } from '../config'
import { openai } from '../openai'
import { logAiCall } from '../pipeline/ai-log'
import type { ConfirmItem, MentionInsert, QueueItem } from './match'
import { PRODUCT_RULE_VERSION, type CompiledCatalogue } from './rules'
import type { ProductCatalogue } from './types'

// The product classifier (depth redesign v2, T11; plan decision 3, option B):
// ONE gpt-4.1-mini call shape for the two things the rules cannot decide.
//
//   CONFIRM   a text holding a generic name (`needs_confirm`: "Unity",
//             "Comfort", "Total Knee"): does the word there mean the client's
//             product? Yes is a 'confirmed' row placing it; anything else a
//             'confirmed' row of placement 'none', the record that it was read.
//   CLASSIFY  a comment under a category-relevant video that the rules placed
//             nowhere: named (one of the client's products), unclear (one of
//             theirs in a category, not which), unbranded (the category in
//             general, or another company's product in it) or none. Every
//             answer is a 'model' row, 'none' included, so a comment is paid
//             for once per catalogue version.
//
// THE CONTRACT (`classifyRows`, tested on fixtures): the model answers each
// numbered item with a placement and catalogue CODES (C1 a category, P3 a
// product), never ids or names; the join is the item number, and an answer is
// refused when its number is outside the batch or repeated, a code is unknown,
// a 'named' answer names no product, an 'unclear' or 'unbranded' answer names
// no category, or a confirm item's answer is not the product (or category) its
// generic word names. A refused answer writes no row and the text is offered
// again next run.
//
// WHAT IT SEES: the client's name, its catalogue (categories, products, the
// other names people use), each item's text, and for a comment the video it
// sits under: up to VIDEO_CONTEXT_CHARS of its caption and the catalogue
// names the rules found in its content. Never another comment.
//
// COST. gpt-4.1-mini at $0.40/$1.60 per 1M tokens, CLASSIFY_BATCH items a
// call: a few hundred tokens of catalogue, the items, about twenty output
// tokens an item. `estimateBatchUsd` prices a call from its prompt before it
// is made (the dry run's price, and the hard cap's worst case); the ledger
// (ai_call_log, pass PRODUCT_CLASSIFY_PASS) holds what was spent.

export const PRODUCT_CLASSIFY_MODEL = 'gpt-4.1-mini'
export const PRODUCT_CLASSIFY_PROMPT_VERSION = 'product_classify_v1'
export const PRODUCT_CLASSIFY_PASS = 'product-classify'
/** A model or confirm row's rule_version: the matcher that chose what to ask,
 *  and the prompt that answered (brand_mentions' CONFIRM_SUFFIX shape). */
export const PRODUCT_MODEL_RULE_VERSION = `${PRODUCT_RULE_VERSION}+${PRODUCT_CLASSIFY_PROMPT_VERSION}`

/** Items a call. translate-quotes' 25, the measured efficient shape. */
export const CLASSIFY_BATCH = 25
/** Characters of a video's caption the model sees as context. */
export const VIDEO_CONTEXT_CHARS = 240
/** Characters of an item's text the model sees. */
export const ITEM_CHARS = 500
/** Output tokens an item costs at most, for the worst case (an answer is
 *  about twenty: {"n":12,"placement":"unbranded","products":[],"category":"C2"}). */
const OUTPUT_TOKENS_PER_ITEM = 30

export type ClassifyKind = 'confirm' | 'classify'

/** The video a comment sits under, as the model is shown it. */
export interface VideoContext {
  videoId: string
  caption: string | null
  /** Catalogue names the rules found in its content ("Pro-Flex XC (Feet)"). */
  names: string[]
}

/** One item of a call. */
export type ClassifyItem =
  | { kind: 'confirm'; item: ConfirmItem }
  | { kind: 'classify'; item: QueueItem }

export interface Codes {
  group: Map<string, string>
  product: Map<string, string>
  groupOf: Map<string, string>
  product2group: Map<string, string>
}

/** The catalogue's codes, in display order: C1… a category, P1… a product. */
export function catalogueCodes(catalogue: Pick<ProductCatalogue, 'groups' | 'products'>): Codes {
  const group = new Map<string, string>()
  const groupOf = new Map<string, string>()
  const product = new Map<string, string>()
  const product2group = new Map<string, string>()
  const groups = [...catalogue.groups].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  groups.forEach((g, i) => { group.set(`C${i + 1}`, g.id); groupOf.set(g.id, `C${i + 1}`) })
  let n = 0
  for (const g of groups) {
    for (const p of [...catalogue.products].filter((x) => x.group_id === g.id).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))) {
      n++
      product.set(`P${n}`, p.id)
      product2group.set(p.id, g.id)
    }
  }
  return { group, product, groupOf, product2group }
}

const oneLine = (s: string | null | undefined, max: number): string => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** The system prompt for a catalogue: the same for every call of a run (so
 *  the provider's prompt cache can reuse it). PURE. */
export function buildSystemPrompt(clientName: string, catalogue: ProductCatalogue): string {
  const codes = catalogueCodes(catalogue)
  const aliasesOf = (target: { product?: string; group?: string }, kinds: string[]) =>
    catalogue.aliases.filter((a) => (target.product ? a.product_id === target.product : a.group_id === target.group) && kinds.includes(a.kind))
      .map((a) => a.alias)
  const lines: string[] = []
  for (const [code, groupId] of codes.group) {
    const g = catalogue.groups.find((x) => x.id === groupId)!
    const words = aliasesOf({ group: groupId }, ['category_word'])
    const families = aliasesOf({ group: groupId }, ['name', 'nickname'])
    lines.push(`${code} ${g.name}${words.length ? ` (words for it: ${words.join(', ')})` : ''}${families.length ? `; ${clientName}'s product families here: ${families.join(', ')}` : ''}`)
    for (const [pcode, productId] of codes.product) {
      if (codes.product2group.get(productId) !== groupId) continue
      const p = catalogue.products.find((x) => x.id === productId)!
      const other = aliasesOf({ product: productId }, ['name', 'nickname']).filter((a) => a.toLowerCase() !== p.name.toLowerCase())
      lines.push(`  ${pcode} ${p.name}${other.length ? ` (also: ${other.join(', ')})` : ''}`)
    }
  }
  return [
    `You sort social-media comments and video texts about prosthetics, orthotics and mobility under ${clientName}'s product catalogue. ${clientName} is the company; the catalogue lists its products by category, with a code for each.`,
    '',
    'CATALOGUE',
    ...lines,
    '',
    'For EACH numbered item, answer what the text is about, using only the text and, where given, the video it was posted under:',
    `- "named": it is about one or more of ${clientName}'s listed products specifically: named, nicknamed, misspelt or translated, or plainly meant ("this foot", "it") under a video that shows exactly one of ${clientName}'s products. Give the product codes in "products".`,
    `- "unclear": it is about one of ${clientName}'s products in a category, but you cannot tell which ("my ${clientName} liner", "your knees", or "it" under a video showing several of ${clientName}'s products in that category). Give the category code in "category".`,
    `- "unbranded": it is about the category in general, or about another company's product in that category, not about one of ${clientName}'s. Give the category code in "category".`,
    '- "none": it is not about anything in these categories: feelings, thanks, compliments, the person, the video itself, other topics, or prosthetics in general with no one category meant.',
    '',
    'Rules:',
    '- Decide from what the text says. Never guess a product from a category word alone.',
    '- When unsure between "named" and "unclear", answer "unclear". When unsure between "unclear" and "unbranded", answer "unbranded". When unsure whether the text is about a category at all, answer "none".',
    '- A text about two categories: answer the one it is mostly about.',
    '- Items marked CHECK hold a word that is also an ordinary word or another thing\'s name, and is the name of the catalogue item given. Answer "named" (or for a category word, "unbranded") ONLY if the word there means that item; otherwise answer "none".',
    '- Comments may be in any language. Read them as written.',
    '',
    'Return one entry per item, with n matching the item number. Never merge, reorder or drop items.',
  ].join('\n')
}

/** The user message for one call. Videos are listed once, each item points at
 *  its video. PURE. */
export function buildUserPrompt(items: readonly ClassifyItem[], videos: ReadonlyMap<string, VideoContext>, catalogue: ProductCatalogue, compiled: CompiledCatalogue): string {
  const codes = catalogueCodes(catalogue)
  const refs = new Map<string, string>()
  const videoLines: string[] = []
  for (const it of items) {
    const v = it.kind === 'classify' ? videos.get(it.item.videoId) : null
    if (!v || refs.has(v.videoId)) continue
    const ref = `V${refs.size + 1}`
    refs.set(v.videoId, ref)
    videoLines.push(`[${ref}] ${oneLine(v.caption, VIDEO_CONTEXT_CHARS) || '(no caption)'}${v.names.length ? ` | names: ${v.names.join(', ')}` : ''}`)
  }
  const codeOf = (a: ConfirmItem['aliases'][number]) => (a.productId ? [...codes.product].find(([, id]) => id === a.productId)?.[0] : codes.groupOf.get(a.groupId)) ?? '?'
  const itemLines = items.map((it, i) => {
    if (it.kind === 'confirm') {
      const words = it.item.aliases.map((a) => `"${a.alias}" = ${codeOf(a)} ${a.productId ? compiled.productName.get(a.productId) ?? '' : compiled.groupName.get(a.groupId) ?? ''}`.trim()).join('; ')
      return `${i + 1}. CHECK ${words} | ${oneLine(it.item.text, ITEM_CHARS)}`
    }
    const ref = refs.get(it.item.videoId)
    return `${i + 1}. ${ref ? `[${ref}] ` : ''}${oneLine(it.item.text, ITEM_CHARS)}`
  })
  return [...(videoLines.length ? ['VIDEOS', ...videoLines, ''] : []), 'ITEMS', ...itemLines].join('\n')
}

export const classifySchema = z.object({
  items: z.array(z.object({
    n: z.number(),
    placement: z.enum(['named', 'unclear', 'unbranded', 'none']),
    products: z.array(z.string()),
    category: z.string().nullable(),
  })),
})
export type ClassifyAnswer = z.infer<typeof classifySchema>['items'][number]

/**
 * Turn one call's answers into product_mentions rows (see the header). The
 * item number is the join. Returns the rows and how many items had no usable
 * answer. PURE.
 */
export function classifyRows(args: {
  clientId: string
  version: string
  items: readonly ClassifyItem[]
  answers: readonly ClassifyAnswer[]
  codes: Codes
}): { rows: MentionInsert[]; unplaced: number } {
  const { clientId, version, items, codes } = args
  const rows: MentionInsert[] = []
  const used = new Set<number>()
  for (const a of args.answers) {
    const i = Math.trunc(a.n) - 1
    if (!Number.isFinite(a.n) || i < 0 || i >= items.length || used.has(i)) continue
    const it = items[i]
    const base = it.kind === 'confirm'
      ? { video_id: it.item.videoId, source: it.item.source, field: it.item.source === 'content' ? it.item.field : null, comment_id: it.item.commentId, comment_month: it.item.commentMonth }
      : { video_id: it.item.videoId, source: 'comment' as const, field: null, comment_id: it.item.commentId, comment_month: it.item.commentMonth }
    const method = it.kind === 'confirm' ? 'confirmed' as const : 'model' as const
    const make = (placement: MentionInsert['placement'], groupId: string | null, productId: string | null): MentionInsert => ({
      client_id: clientId, ...base, placement, product_id: productId, group_id: groupId, method,
      rule_version: PRODUCT_MODEL_RULE_VERSION, catalogue_version: version,
      model: PRODUCT_CLASSIFY_MODEL, prompt_version: PRODUCT_CLASSIFY_PROMPT_VERSION, tag_id: null,
    })
    let out: MentionInsert[] | null = null
    if (a.placement === 'none') out = [make('none', null, null)]
    else if (a.placement === 'named') {
      const ids = [...new Set(a.products.map((c) => codes.product.get(c.trim().toUpperCase())))]
      if (ids.length > 0 && ids.every((x): x is string => !!x)) out = ids.map((p) => make('named', codes.product2group.get(p)!, p))
    } else {
      const g = a.category ? codes.group.get(a.category.trim().toUpperCase()) : undefined
      if (g) out = [make(a.placement, g, null)]
    }
    if (!out) continue
    if (it.kind === 'confirm') {
      // A confirm answer counts only for the generic word's own target: the
      // product it names, or (a family, a category word) its category at
      // the alias's own placement. Anything else is a 'none'.
      const fits = (r: MentionInsert) => it.item.aliases.some((al) => (al.productId
        ? r.placement === 'named' && r.product_id === al.productId
        : r.placement === al.placement && r.group_id === al.groupId))
      const kept = out.filter((r) => r.placement !== 'none' && fits(r))
      out = kept.length ? kept : [make('none', null, null)]
    }
    used.add(i)
    rows.push(...out)
  }
  return { rows, unplaced: items.length - used.size }
}

// ---- pricing ------------------------------------------------------------------------

/** A token count for a text, from its characters: about four characters a
 *  token for Latin script, about one and a half for CJK, Indic, Arabic and
 *  Thai (scripts/translate-transcripts.ts' bounds). An estimate, not a
 *  tokenizer: billing is the truth. PURE. */
export function estimateTokens(text: string): number {
  let latin = 0
  let other = 0
  for (const ch of text) {
    if (/[֐-ࣿऀ-෿฀-໿ᄀ-ᇿ　-鿿가-힯豈-﫿]/u.test(ch)) other++
    else latin++
  }
  return Math.ceil(latin / 4 + other / 1.5)
}

/** A call's price before it is made: its prompt's tokens and the most output
 *  its items can take (the worst case the hard cap holds). PURE. */
export function estimateBatchUsd(system: string, user: string, items: number): { input: number; output: number; usd: number } {
  const input = estimateTokens(system) + estimateTokens(user) + 12
  const output = items * OUTPUT_TOKENS_PER_ITEM + 10
  return { input, output, usd: estimateCost(PRODUCT_CLASSIFY_MODEL, input, output) }
}

/** Items as calls: confirm items first (they decide which videos are
 *  relevant), then the queue, CLASSIFY_BATCH a call. PURE. */
export function batchItems(items: readonly ClassifyItem[], size = CLASSIFY_BATCH): ClassifyItem[][] {
  const out: ClassifyItem[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// ---- the call ---------------------------------------------------------------------

export interface ClassifyOutcome {
  answers: ClassifyAnswer[]
  usage: { prompt_tokens: number; completion_tokens: number }
  durationMs: number
}

/** One call to the model. Throws on a failure the caller records for the
 *  whole batch. */
export type Classifier = (system: string, user: string) => Promise<ClassifyOutcome>

/** The real classifier: gpt-4.1-mini, temperature 0, structured output, one
 *  retry, a minute's timeout. */
export const openAiClassifier: Classifier = async (system, user) => {
  const started = Date.now()
  const res = await openai.chat.completions.parse({
    model: PRODUCT_CLASSIFY_MODEL,
    temperature: 0,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: zodResponseFormat(classifySchema, 'placements'),
  }, { timeout: 60_000, maxRetries: 1 })
  const msg = res.choices[0]?.message
  if (!msg?.parsed) throw new Error(msg?.refusal ?? 'no parsed placements')
  return {
    answers: msg.parsed.items,
    usage: { prompt_tokens: res.usage?.prompt_tokens ?? 0, completion_tokens: res.usage?.completion_tokens ?? 0 },
    durationMs: Date.now() - started,
  }
}

export interface RunClassifyResult {
  rows: MentionInsert[]
  /** Items sent in a call that answered. */
  asked: number
  answered: number
  /** Asked, and the answer refused (classifyRows): offered again next run. */
  unplaced: number
  /** Items never sent: the budget, the clock or a rate limit stopped them. */
  deferred: number
  /** Items in a call that failed: offered again next run. */
  failed: number
  failedCalls: number
  costUsd: number
  rateLimited: boolean
  errors: string[]
}

/**
 * Ask the model about `items`, a call at a time in waves of `parallel`, and
 * write each call's rows the moment it returns (`write`; a dry run passes
 * none). NEVER THROWS for a model failure (translate-quotes' rule: a thrown
 * step is retried and re-bills every call): a failed call's items are left for
 * the next run. THE HARD CAP: before each wave, the spend so far plus every
 * call's worst case (`estimateBatchUsd`) must fit `budgetUsd`, and the clock
 * `deadline` (ms since the epoch) must not have passed; otherwise the rest is
 * deferred.
 */
export async function runClassifier(args: {
  admin: SupabaseClient | null
  clientId: string
  runId: string | null
  clientName: string
  catalogue: ProductCatalogue
  compiled: CompiledCatalogue
  items: readonly ClassifyItem[]
  videos: ReadonlyMap<string, VideoContext>
  budgetUsd: number
  deadline?: number
  parallel?: number
  classifier?: Classifier
  write?: (rows: MentionInsert[]) => Promise<void>
  now?: () => number
}): Promise<RunClassifyResult> {
  const out: RunClassifyResult = { rows: [], asked: 0, answered: 0, unplaced: 0, deferred: 0, failed: 0, failedCalls: 0, costUsd: 0, rateLimited: false, errors: [] }
  const call = args.classifier ?? openAiClassifier
  const now = args.now ?? Date.now
  const codes = catalogueCodes(args.catalogue)
  const system = buildSystemPrompt(args.clientName, args.catalogue)
  const batches = batchItems(args.items)
  const parallel = Math.max(1, args.parallel ?? 4)
  let callIndex = 0
  for (let w = 0; w < batches.length; w += parallel) {
    const wave = batches.slice(w, w + parallel).map((items) => ({ items, user: buildUserPrompt(items, args.videos, args.catalogue, args.compiled) }))
    const worst = wave.reduce((s, b) => s + estimateBatchUsd(system, b.user, b.items.length).usd, 0)
    if (out.costUsd + worst > args.budgetUsd || (args.deadline !== undefined && now() >= args.deadline) || out.rateLimited) {
      out.deferred += batches.slice(w).reduce((s, b) => s + b.length, 0)
      break
    }
    const results = await Promise.all(wave.map(async (b) => {
      const index = ++callIndex
      try {
        return { b, index, r: await call(system, b.user), error: null as string | null }
      } catch (e) {
        return { b, index, r: null, error: e instanceof Error ? e.message : String(e) }
      }
    }))
    for (const { b, index, r, error } of results) {
      if (!r) {
        out.failedCalls++
        out.failed += b.items.length
        if (/\b429\b|rate limit|insufficient_quota/i.test(error ?? '')) out.rateLimited = true
        out.errors.push(`call ${index}: ${(error ?? '').slice(0, 200)}`)
        continue
      }
      out.asked += b.items.length
      const cost = estimateCost(PRODUCT_CLASSIFY_MODEL, r.usage.prompt_tokens, r.usage.completion_tokens)
      out.costUsd += cost
      const { rows, unplaced } = classifyRows({ clientId: args.clientId, version: args.compiled.version, items: b.items, answers: r.answers, codes })
      out.unplaced += unplaced
      out.answered += b.items.length - unplaced
      let writeError: string | null = null
      if (args.write && rows.length) {
        try { await args.write(rows) } catch (e) { writeError = e instanceof Error ? e.message : String(e) }
      }
      if (writeError) out.errors.push(`write ${index}: ${writeError.slice(0, 200)}`)
      else out.rows.push(...rows)
      if (args.admin) {
        try {
          await logAiCall(args.admin as never, {
            clientId: args.clientId, runId: args.runId, pass: PRODUCT_CLASSIFY_PASS, callIndex: index, model: PRODUCT_CLASSIFY_MODEL,
            promptVersion: PRODUCT_CLASSIFY_PROMPT_VERSION, systemPrompt: system, userPrompt: b.user,
            // Counts and placements, never the comments' words (they are in the request).
            response: { items: b.items.length, placed: rows.filter((x) => x.placement !== 'none').length, none: rows.filter((x) => x.placement === 'none').length, unplaced },
            error: writeError, usage: r.usage, durationMs: r.durationMs,
            validationStatus: writeError ? 'write_failed' : unplaced ? 'partial' : 'ok',
          })
        } catch (e) {
          console.warn(`[product-classify] ai_call_log insert threw: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
  }
  return out
}
