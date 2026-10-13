import type { SupabaseClient } from '@supabase/supabase-js'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

import { estimateCost } from '../config'
import { dbSafeText } from '../db-text'
import { openai } from '../openai'
import { logAiCall } from '../pipeline/ai-log'
import type { ConfirmItem, MentionInsert, QueueItem } from './match'
import { PRODUCT_RULE_VERSION, type CompiledAlias, type CompiledCatalogue } from './rules'
import type { ProductCatalogue } from './types'

// The product model calls (depth redesign v2, T11; plan decision 3, option
// B): two call shapes for the two things the rules cannot decide, the
// classifier on gpt-4.1-mini and the confirm on gpt-4.1 (PRODUCT_CONFIRM_MODEL
// says why).
//
//   CONFIRM   a text holding a generic name (`needs_confirm`: "Unity",
//             "Proprio", "Total Knee", "socket"): does the word there mean the
//             catalogue item? One yes or no per word (`confirmSchema`). A yes
//             is a 'confirmed' row placing the word's own target (a product
//             named, a family unclear, a category word unbranded); a text with
//             no yes gets one 'confirmed' row of placement 'none', the record
//             that it was read.
//   CLASSIFY  a comment under a category-relevant video that the rules placed
//             nowhere: named, unclear, unbranded or none (`classifySchema`),
//             with the comment's own WORDS that make it so. Every answer is a
//             'model' row, 'none' included, so a comment is paid for once per
//             catalogue version.
//
// THE MODEL IS CHECKED, NOT TRUSTED (the hand check of 13 Oct, t12-handcheck.md:
// a first prompt that asked both questions at once confirmed Italian "proprio"
// as the Proprio Foot, read a game engine as Unity, and named an i-Limb under
// "you need a Winter Soldier arm"). `classifyRows` holds every answer to what
// the comment says:
//   - the words must be in the comment (case and spacing aside), or the answer
//     is the read's 'none';
//   - a 'named' product must be in the words (its name or another name, one
//     slip of a letter allowed: "propio foot"), or be the ONE product the
//     video names (the "how long does it last?" case); otherwise 'none';
//   - an 'unclear' answer must have the client's own name, one of its product
//     families or a client product of that category in the comment or the
//     video; otherwise it is read as the category in general ('unbranded');
//   - an 'unbranded' answer must name the category in its words (a word for
//     it, one slip allowed), unless MODEL_PLACES_PARAPHRASE is on; otherwise
//     'none'.
// An answer whose number is outside the batch or repeated, or whose code is
// unknown, writes no row, and the text is offered again next run.
//
// WHAT IT SEES: the client's name, its catalogue (categories, products, the
// other names people use), each item's text, and for a comment under a video
// whose content names the client's products, those names (for "it" and
// "this"). Never a caption, and never another comment.
//
// COST. gpt-4.1-mini at $0.40/$1.60 per 1M tokens (gpt-4.1 at $2/$8 for the
// few confirm calls), CLASSIFY_BATCH items a call. `estimateBatchUsd` prices a call from its prompt before it is made
// (the dry run's price, and the hard cap's worst case); the ledger
// (ai_call_log, pass PRODUCT_CLASSIFY_PASS) holds what was spent.

export const PRODUCT_CLASSIFY_MODEL = 'gpt-4.1-mini'
/** The confirm call's model: gpt-4.1, not -mini. On the 290 generic-name texts
 *  of Össur's June to October (the hand check of 13 Oct) -mini read a hip's
 *  "ball and socket", a game's "arm cannon and blade" and Italian "proprio"
 *  as the catalogue's; gpt-4.1 read them as what they are, at about $0.12 for
 *  the whole back-read and pennies a run (a confirm is a few dozen texts). */
export const PRODUCT_CONFIRM_MODEL = 'gpt-4.1'
/** The model a call shape uses. */
export const modelFor = (kind: ClassifyKind): string => (kind === 'confirm' ? PRODUCT_CONFIRM_MODEL : PRODUCT_CLASSIFY_MODEL)
export const PRODUCT_CLASSIFY_PROMPT_VERSION = 'product_classify_v1'
export const PRODUCT_CLASSIFY_PASS = 'product-classify'
/** A model or confirm row's rule_version: the matcher that chose what to ask,
 *  and the prompt that answered (brand_mentions' CONFIRM_SUFFIX shape). */
export const PRODUCT_MODEL_RULE_VERSION = `${PRODUCT_RULE_VERSION}+${PRODUCT_CLASSIFY_PROMPT_VERSION}`

/**
 * May the classifier place a comment under a category IN GENERAL from what
 * it paraphrases, with no word for the category in it ("my sleeve makes me
 * sweat")? NO, for now: on Össur's production comments (the hand check of
 * 13 Oct, t12-handcheck.md) the answers of that kind were right about one
 * time in three, with gpt-4.1-mini and with gpt-4.1 alike ("the shoes", "the
 * socks", "afford those legs" read as feet). Off, such an answer is the
 * read's 'none', and a category answer counts only where the comment's own
 * words name the category (a misspelt "prostetic foot"). Turning it on is a
 * new PRODUCT_CLASSIFY_PROMPT_VERSION (every comment is read again) and
 * Heinrich's call.
 */
export const MODEL_PLACES_PARAPHRASE = false

/** Items a call. translate-quotes' 25, the measured efficient shape. */
export const CLASSIFY_BATCH = 25
/** Characters of an item's text the model sees. */
export const ITEM_CHARS = 500
/** Output tokens an item costs at most, for the worst case. */
const OUTPUT_TOKENS_PER_ITEM: Record<ClassifyKind, number> = { classify: 40, confirm: 15 }

export type ClassifyKind = 'confirm' | 'classify'

/** The video a comment sits under, as the model is shown it and the checks
 *  read it. */
export interface VideoContext {
  videoId: string
  caption: string | null
  /** Catalogue names the rules found in its content ("Pro-Flex XC (Feet)"). */
  names: string[]
  /** The client's products its content names (ids). */
  products?: string[]
  /** The categories its content stands under as the client's (named or
   *  unclear), by id. */
  clientGroups?: string[]
}

/** One item of a call. */
export type ClassifyItem =
  | { kind: 'confirm'; item: ConfirmItem }
  | { kind: 'classify'; item: QueueItem }

export interface Codes {
  group: Map<string, string>
  product: Map<string, string>
  groupOf: Map<string, string>
  productOf: Map<string, string>
  product2group: Map<string, string>
}

/** The catalogue's codes, in display order: C1… a category, P1… a product. */
export function catalogueCodes(catalogue: Pick<ProductCatalogue, 'groups' | 'products'>): Codes {
  const group = new Map<string, string>()
  const groupOf = new Map<string, string>()
  const product = new Map<string, string>()
  const productOf = new Map<string, string>()
  const product2group = new Map<string, string>()
  const groups = [...catalogue.groups].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  groups.forEach((g, i) => { group.set(`C${i + 1}`, g.id); groupOf.set(g.id, `C${i + 1}`) })
  let n = 0
  for (const g of groups) {
    for (const p of [...catalogue.products].filter((x) => x.group_id === g.id).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))) {
      n++
      product.set(`P${n}`, p.id)
      productOf.set(p.id, `P${n}`)
      product2group.set(p.id, g.id)
    }
  }
  return { group, product, groupOf, productOf, product2group }
}

/** One line of at most `max` characters, cut between code points, and safe
 *  for the request's JSON body (a lone surrogate, which a cut emoji or a
 *  scraped comment can carry, fails the whole call: dbSafeText). */
const oneLine = (s: string | null | undefined, max: number): string => {
  const chars = Array.from(dbSafeText((s ?? '').replace(/\s+/g, ' ').trim()))
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('')
}

const aliasesOf = (catalogue: ProductCatalogue, target: { product?: string; group?: string }, kinds: readonly string[]) =>
  catalogue.aliases.filter((a) => (target.product ? a.product_id === target.product : a.group_id === target.group) && kinds.includes(a.kind)).map((a) => a.alias)

/** The catalogue as the model reads it, one line a category and a product. */
function catalogueLines(clientName: string, catalogue: ProductCatalogue): string[] {
  const codes = catalogueCodes(catalogue)
  const lines: string[] = []
  for (const [code, groupId] of codes.group) {
    const g = catalogue.groups.find((x) => x.id === groupId)!
    const words = aliasesOf(catalogue, { group: groupId }, ['category_word'])
    const families = aliasesOf(catalogue, { group: groupId }, ['name', 'nickname'])
    lines.push(`${code} ${g.name}${words.length ? ` (words for it: ${words.join(', ')})` : ''}${families.length ? `; ${clientName}'s product families here: ${families.join(', ')}` : ''}`)
    for (const [pcode, productId] of codes.product) {
      if (codes.product2group.get(productId) !== groupId) continue
      const p = catalogue.products.find((x) => x.id === productId)!
      const other = aliasesOf(catalogue, { product: productId }, ['name', 'nickname']).filter((a) => a.toLowerCase() !== p.name.toLowerCase())
      lines.push(`  ${pcode} ${p.name}${other.length ? ` (also: ${other.join(', ')})` : ''}`)
    }
  }
  return lines
}

/** The classifier's system prompt for a catalogue: the same for every call of
 *  a run (so the provider's prompt cache can reuse it). PURE. */
export function buildSystemPrompt(clientName: string, catalogue: ProductCatalogue): string {
  const codes = catalogueCodes(catalogue)
  const firstProduct = catalogue.products.find((p) => codes.productOf.has(p.id))
  const pcode = firstProduct ? codes.productOf.get(firstProduct.id)! : 'P1'
  const firstGroup = catalogue.groups.find((g) => g.id === codes.group.get('C1'))
  const word = (firstGroup && aliasesOf(catalogue, { group: firstGroup.id }, ['category_word'])[0]) || 'product'
  return [
    `You read social-media comments about prosthetics, orthotics and mobility, and decide which part of ${clientName}'s catalogue each one is about. ${clientName} is a company; its catalogue lists its products by category, each with a code.`,
    '',
    'CATALOGUE',
    ...catalogueLines(clientName, catalogue),
    '',
    'For EACH numbered comment, answer one placement:',
    `- "named": the comment itself is about one or more of ${clientName}'s listed products specifically. It names the product (or another name, a misspelling, a translation), or says "this foot", "that knee", "it" about the ONE ${clientName} product the video names. Give the product codes in "products".`,
    `- "unclear": the comment is about a ${clientName} product of one category without saying which: it names ${clientName} or one of its product families together with that kind of product ("my ${clientName} ${word}"), or says "it" about a video that names several ${clientName} products of that category. Give the category code in "category".`,
    `- "unbranded": the comment is about that KIND of product itself, in general or another company's: how it fits, feels, works, lasts, costs, where to get it. The comment has to name or plainly describe the device or the part (the socket, the liner, the sleeve, the foot, the knee, the hand, the brace, the blade, the pin, the valve). Give the category code in "category".`,
    '- "none": everything else. MOST COMMENTS ARE NONE: reactions, praise, thanks, jokes, questions about the person, their body, story, health, amputation or surgery, walking, sport, shoes, socks or clothes, the video, other topics, and prosthetics or limbs in general ("my leg", "my prosthesis", "your arm", "bigger legs") when no one category\'s device or part is named.',
    '',
    'Rules:',
    '- "words": copy, exactly as written, the few words of the comment that name the product or the device ("my proflex", "the liner", "that knee"). For "none", null.',
    '- "sure": true only when the comment leaves no doubt. A placement you are not sure of is "none".',
    '- A comment counts only for what IT says. The video is context for "it" and "this", never a reason by itself.',
    '- Never name a product the comment does not name or point at. Never answer "named" from a category word alone, a film character, or a body part.',
    '- When unsure between "named" and "unclear", answer "unclear"; between "unclear" and "unbranded", "unbranded"; between a category and "none", "none".',
    '- Comments may be in any language. Read them as written.',
    '',
    'Examples (not from the items):',
    `- "${firstProduct?.name ?? 'The product'} feels great on hills" → named, products ["${pcode}"], words "${firstProduct?.name ?? 'The product'}", sure`,
    `- "How long does it last?" under a video naming only ${firstProduct?.name ?? 'one product'} → named, products ["${pcode}"], words "it", sure`,
    `- "My ${word} always makes me sweat" → unbranded, category "C1", words "My ${word}", sure`,
    `- "Is it comfortable?" under a video about ${word}s in general → none`,
    '- "You are so strong 💪", "I just got my first prosthetic leg", "You need an Iron Man arm", "It takes me longer to put my shoes on", "Can you get taller legs?" → none',
    '',
    'Return one entry per comment, with n matching its number. Never merge, reorder or drop entries.',
  ].join('\n')
}

/** The classifier's user message for one call. A video is listed (once) only
 *  where its content names the client's products, and then by those names
 *  alone, for a comment's "it" and "this": a caption or a category word read
 *  as context made the model place "the shoes" and "the socks" under feet
 *  (the hand check of 13 Oct). PURE. */
export function buildUserPrompt(items: readonly ClassifyItem[], videos: ReadonlyMap<string, VideoContext>): string {
  const refs = new Map<string, string>()
  const videoLines: string[] = []
  for (const it of items) {
    const v = videos.get(it.item.videoId)
    if (!v || refs.has(v.videoId) || (v.products ?? []).length + (v.clientGroups ?? []).length === 0) continue
    const ref = `V${refs.size + 1}`
    refs.set(v.videoId, ref)
    videoLines.push(`[${ref}] a video that names: ${v.names.join(', ')}`)
  }
  const itemLines = items.map((it, i) => {
    const ref = refs.get(it.item.videoId)
    return `${i + 1}. ${ref ? `[${ref}] ` : ''}${oneLine(it.item.text, ITEM_CHARS)}`
  })
  return [...(videoLines.length ? ['VIDEOS', ...videoLines, ''] : []), 'COMMENTS', ...itemLines].join('\n')
}

/** The confirm call's system prompt. PURE. */
export function buildConfirmSystemPrompt(clientName: string): string {
  return [
    'You check single words in social-media texts about prosthetics, orthotics and mobility.',
    `Each numbered item gives a WORD, what it would mean as part of ${clientName}'s catalogue, and the TEXT it appears in.`,
    `Answer means: true ONLY if, in this text, the word refers to that catalogue item: ${clientName}'s product or product family, or, for a kind of product, that prosthetic or orthotic product.`,
    'Answer means: false if the word is used in any other sense: an ordinary word in English or in another language (Italian "proprio", "rebound" in sport), a person\'s or a place\'s name, another company\'s product, software or a game, a body part ("eye socket", "shoulder blade"), dental braces, tools, or anything else.',
    'When unsure, false. Return one entry per item, with n matching its number.',
  ].join('\n')
}

/** What a generic word would mean, in a confirm line. */
function meaning(a: CompiledAlias, compiled: CompiledCatalogue, clientName: string): string {
  const group = compiled.groupName.get(a.groupId) ?? ''
  if (a.productId) return `${clientName}'s product ${compiled.productName.get(a.productId) ?? a.alias} (${group})`
  if (a.kind === 'category_word') return `the kind of product in ${group} (a prosthetic or orthotic product)`
  return `${clientName}'s product family ${a.alias} (${group})`
}

/** One confirm question: a text and one of its generic words. */
export interface ConfirmQuestion { item: ConfirmItem; alias: CompiledAlias }

/** A confirm item as questions, one per generic word. PURE. */
export const confirmQuestions = (items: readonly ConfirmItem[]): ConfirmQuestion[] => items.flatMap((item) => item.aliases.map((alias) => ({ item, alias })))

/** The confirm call's user message. PURE. */
export function buildConfirmUserPrompt(questions: readonly ConfirmQuestion[], compiled: CompiledCatalogue, clientName: string): string {
  return questions.map((q, i) => `${i + 1}. WORD "${q.alias.alias}" = ${meaning(q.alias, compiled, clientName)} | TEXT: ${oneLine(q.item.text, ITEM_CHARS)}`).join('\n')
}

export const classifySchema = z.object({
  items: z.array(z.object({
    n: z.number(),
    placement: z.enum(['named', 'unclear', 'unbranded', 'none']),
    products: z.array(z.string()),
    category: z.string().nullable(),
    words: z.string().nullable(),
    sure: z.boolean(),
  })),
})
export type ClassifyAnswer = z.infer<typeof classifySchema>['items'][number]

export const confirmSchema = z.object({ items: z.array(z.object({ n: z.number(), means: z.boolean() })) })
export type ConfirmAnswer = z.infer<typeof confirmSchema>['items'][number]

// ---- the checks ---------------------------------------------------------------------------

/** Lowercase letters and digits only, accents dropped: "Pro-Flex XC" → "proflexxc". */
export const squashName = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Is `a` within one edit (a letter added, dropped or changed) of `b`? */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/** Do the words name this form: the form in them, or (a form of five or more
 *  letters) a stretch of them one slip away from it? PURE. */
export function wordsName(words: string, form: string): boolean {
  const w = squashName(words)
  const f = squashName(form)
  if (f.length < 3 || !w) return false
  if (w.includes(f)) return true
  if (f.length < 5) return false
  for (const len of [f.length - 1, f.length, f.length + 1]) {
    for (let k = 0; k + len <= w.length; k++) if (withinOneEdit(w.slice(k, k + len), f)) return true
  }
  return false
}

/** Are the words in the text (case and spacing aside)? */
const inText = (words: string, text: string): boolean => {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const w = n(words)
  return w.length > 0 && n(text).includes(w)
}

export interface CheckContext {
  catalogue: ProductCatalogue
  compiled: CompiledCatalogue
  videos: ReadonlyMap<string, VideoContext>
}

/** Every name of a product (its name and other names), and of a category's
 *  families. */
const productForms = (catalogue: ProductCatalogue, productId: string): string[] => {
  const p = catalogue.products.find((x) => x.id === productId)
  return [...(p ? [p.name] : []), ...aliasesOf(catalogue, { product: productId }, ['name', 'nickname'])]
}
const familyForms = (catalogue: ProductCatalogue, groupId: string): string[] => aliasesOf(catalogue, { group: groupId }, ['name', 'nickname'])
const categoryForms = (catalogue: ProductCatalogue, groupId: string): string[] => aliasesOf(catalogue, { group: groupId }, ['category_word'])

/** The client's own name in a text (its brand rule)? */
const namesClient = (compiled: CompiledCatalogue, text: string): boolean => {
  if (!compiled.client) return false
  compiled.client.re.lastIndex = 0
  return compiled.client.re.test(text)
}

// ---- answers as rows ------------------------------------------------------------------------

const rowBase = (clientId: string, version: string, method: 'model' | 'confirmed', where: Pick<MentionInsert, 'video_id' | 'source' | 'field' | 'comment_id' | 'comment_month'>) =>
  (placement: MentionInsert['placement'], groupId: string | null, productId: string | null): MentionInsert => ({
    client_id: clientId, ...where, placement, product_id: productId, group_id: groupId, method,
    rule_version: PRODUCT_MODEL_RULE_VERSION, catalogue_version: version,
    model: modelFor(method === 'confirmed' ? 'confirm' : 'classify'), prompt_version: PRODUCT_CLASSIFY_PROMPT_VERSION, tag_id: null,
  })

export interface RowsResult {
  rows: MentionInsert[]
  /** Items with no usable answer: offered again next run. */
  unplaced: number
  /** Answers the checks turned to 'none' or 'unbranded' (see the header). */
  downgraded: number
}

/**
 * The classifier's answers as rows, every answer held to what the comment
 * says (see the header). The item number is the join. PURE.
 */
export function classifyRows(args: {
  clientId: string
  version: string
  items: readonly ClassifyItem[]
  answers: readonly ClassifyAnswer[]
  codes: Codes
  check: CheckContext
}): RowsResult {
  const { clientId, version, items, codes, check } = args
  const rows: MentionInsert[] = []
  const used = new Set<number>()
  let downgraded = 0
  for (const a of args.answers) {
    const i = Math.trunc(a.n) - 1
    if (!Number.isFinite(a.n) || i < 0 || i >= items.length || used.has(i)) continue
    const it = items[i]
    if (it.kind !== 'classify') continue
    const q = it.item
    const make = rowBase(clientId, version, 'model', { video_id: q.videoId, source: 'comment', field: null, comment_id: q.commentId, comment_month: q.commentMonth })
    const video = check.videos.get(q.videoId)
    const words = a.words ?? ''
    let out: MentionInsert[] | null = null
    if (a.placement === 'none') out = [make('none', null, null)]
    else if (!a.sure) { out = [make('none', null, null)]; downgraded++ }
    else if (a.placement === 'named') {
      const ids = [...new Set(a.products.map((c) => codes.product.get(c.trim().toUpperCase())))]
      if (ids.length > 0 && ids.every((x): x is string => !!x)) {
        const onlyOne = (video?.products ?? []).length === 1 ? video!.products![0] : null
        const kept = inText(words, q.text)
          ? ids.filter((p) => productForms(check.catalogue, p).some((f) => wordsName(words, f)) || p === onlyOne)
          : []
        if (kept.length) out = kept.map((p) => make('named', codes.product2group.get(p)!, p))
        else { out = [make('none', null, null)]; downgraded++ }
      }
    } else {
      const g = a.category ? codes.group.get(a.category.trim().toUpperCase()) : undefined
      if (g) {
        if (!inText(words, q.text)) { out = [make('none', null, null)]; downgraded++ }
        else if (a.placement === 'unclear') {
          const theirs = namesClient(check.compiled, q.text) || familyForms(check.catalogue, g).some((f) => wordsName(q.text, f))
            || (video?.clientGroups ?? []).includes(g)
          if (theirs) out = [make('unclear', g, null)]
          else { out = [make('unbranded', g, null)]; downgraded++ }
        } else if (MODEL_PLACES_PARAPHRASE || categoryForms(check.catalogue, g).some((f) => wordsName(words, f))) {
          out = [make('unbranded', g, null)]
        } else { out = [make('none', null, null)]; downgraded++ }
      }
    }
    if (!out) continue
    used.add(i)
    rows.push(...out)
  }
  return { rows, unplaced: items.filter((it) => it.kind === 'classify').length - used.size, downgraded }
}

/**
 * The confirm call's answers as rows: per text, a 'confirmed' row for each
 * generic word the model said means its catalogue item (its own target), or
 * one 'none' row when none did. A text with a question unanswered writes
 * nothing (it is asked again). PURE.
 */
export function confirmRows(args: { clientId: string; version: string; questions: readonly ConfirmQuestion[]; answers: readonly ConfirmAnswer[] }): RowsResult {
  const verdict = new Map<number, boolean>()
  for (const a of args.answers) {
    const i = Math.trunc(a.n) - 1
    if (!Number.isFinite(a.n) || i < 0 || i >= args.questions.length || verdict.has(i)) continue
    verdict.set(i, a.means)
  }
  const byText = new Map<string, { item: ConfirmItem; yes: CompiledAlias[]; answered: boolean }>()
  args.questions.forEach((q, i) => {
    const t = byText.get(q.item.key) ?? { item: q.item, yes: [], answered: true }
    if (!verdict.has(i)) t.answered = false
    else if (verdict.get(i)) t.yes.push(q.alias)
    byText.set(q.item.key, t)
  })
  const rows: MentionInsert[] = []
  let unplaced = 0
  for (const t of byText.values()) {
    if (!t.answered) { unplaced++; continue }
    const make = rowBase(args.clientId, args.version, 'confirmed', {
      video_id: t.item.videoId, source: t.item.source, field: t.item.source === 'content' ? t.item.field : null,
      comment_id: t.item.commentId, comment_month: t.item.commentMonth,
    })
    if (t.yes.length === 0) { rows.push(make('none', null, null)); continue }
    const seen = new Set<string>()
    for (const al of t.yes) {
      const key = `${al.placement}|${al.groupId}|${al.productId ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(make(al.placement, al.groupId, al.productId))
    }
  }
  return { rows, unplaced, downgraded: 0 }
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
export function estimateBatchUsd(system: string, user: string, items: number, kind: ClassifyKind = 'classify'): { input: number; output: number; usd: number } {
  const input = estimateTokens(system) + estimateTokens(user) + 12
  const output = items * OUTPUT_TOKENS_PER_ITEM[kind] + 10
  return { input, output, usd: estimateCost(modelFor(kind), input, output) }
}

/** Items as calls, CLASSIFY_BATCH a call. PURE. */
export function batchItems<T>(items: readonly T[], size = CLASSIFY_BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// ---- the calls ---------------------------------------------------------------------

export interface ClassifyOutcome {
  answers: unknown[]
  usage: { prompt_tokens: number; completion_tokens: number }
  durationMs: number
}

/** One call to the model. Throws on a failure the caller records for the
 *  whole batch. */
export type Classifier = (req: { kind: ClassifyKind; system: string; user: string }) => Promise<ClassifyOutcome>

/** The real calls: gpt-4.1-mini, temperature 0, structured output, one retry,
 *  a minute's timeout. */
export const openAiClassifier: Classifier = async ({ kind, system, user }) => {
  const started = Date.now()
  const schema = kind === 'confirm' ? confirmSchema : classifySchema
  const res = await openai.chat.completions.parse({
    model: modelFor(kind),
    temperature: 0,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: zodResponseFormat(schema, kind === 'confirm' ? 'verdicts' : 'placements'),
  }, { timeout: 60_000, maxRetries: 1 })
  const msg = res.choices[0]?.message
  if (!msg?.parsed) throw new Error(msg?.refusal ?? 'no parsed answers')
  return {
    answers: (msg.parsed as { items: unknown[] }).items,
    usage: { prompt_tokens: res.usage?.prompt_tokens ?? 0, completion_tokens: res.usage?.completion_tokens ?? 0 },
    durationMs: Date.now() - started,
  }
}

export interface RunClassifyResult {
  rows: MentionInsert[]
  /** Items sent in a call that answered (a confirm item counts once, however
   *  many generic words it holds). */
  asked: number
  answered: number
  /** Asked, and no usable answer: offered again next run. */
  unplaced: number
  /** Answers the checks turned down (classifyRows). */
  downgraded: number
  /** Items never sent: the budget, the clock or a rate limit stopped them. */
  deferred: number
  /** Items in a call that failed: offered again next run. */
  failed: number
  failedCalls: number
  costUsd: number
  rateLimited: boolean
  errors: string[]
}

interface PlannedCall { kind: ClassifyKind; items: ClassifyItem[]; system: string; user: string; questions?: ConfirmQuestion[] }

/** The calls a list of items makes: the confirm questions first, then the
 *  comments, CLASSIFY_BATCH a call. PURE. */
export function planCalls(items: readonly ClassifyItem[], ctx: { clientName: string; catalogue: ProductCatalogue; compiled: CompiledCatalogue; videos: ReadonlyMap<string, VideoContext> }): PlannedCall[] {
  const confirmItems = items.filter((x): x is Extract<ClassifyItem, { kind: 'confirm' }> => x.kind === 'confirm')
  const classifyItems = items.filter((x) => x.kind === 'classify')
  const calls: PlannedCall[] = []
  const confirmSystem = buildConfirmSystemPrompt(ctx.clientName)
  // A confirm batch holds whole texts (every question of a text in one call),
  // about CLASSIFY_BATCH questions a call.
  let batch: Extract<ClassifyItem, { kind: 'confirm' }>[] = []
  let size = 0
  const flush = () => {
    if (!batch.length) return
    const questions = confirmQuestions(batch.map((b) => b.item))
    calls.push({ kind: 'confirm', items: batch, system: confirmSystem, user: buildConfirmUserPrompt(questions, ctx.compiled, ctx.clientName), questions })
    batch = []
    size = 0
  }
  for (const it of confirmItems) {
    if (size + it.item.aliases.length > CLASSIFY_BATCH) flush()
    batch.push(it)
    size += it.item.aliases.length
  }
  flush()
  const system = buildSystemPrompt(ctx.clientName, ctx.catalogue)
  for (const b of batchItems(classifyItems)) calls.push({ kind: 'classify', items: b, system, user: buildUserPrompt(b, ctx.videos) })
  return calls
}

/** The price of a call (its worst case). */
export const callUsd = (c: PlannedCall): ReturnType<typeof estimateBatchUsd> =>
  estimateBatchUsd(c.system, c.user, c.questions?.length ?? c.items.length, c.kind)

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
  const out: RunClassifyResult = { rows: [], asked: 0, answered: 0, unplaced: 0, downgraded: 0, deferred: 0, failed: 0, failedCalls: 0, costUsd: 0, rateLimited: false, errors: [] }
  const call = args.classifier ?? openAiClassifier
  const now = args.now ?? Date.now
  const codes = catalogueCodes(args.catalogue)
  const check: CheckContext = { catalogue: args.catalogue, compiled: args.compiled, videos: args.videos }
  const calls = planCalls(args.items, { clientName: args.clientName, catalogue: args.catalogue, compiled: args.compiled, videos: args.videos })
  const parallel = Math.max(1, args.parallel ?? 4)
  let callIndex = 0
  let w = 0
  while (w < calls.length) {
    // The confirm calls go before the comments: never one wave across both.
    const first = calls[w].kind
    let end = w
    while (end < calls.length && end < w + parallel && calls[end].kind === first) end++
    const wave = calls.slice(w, end)
    const worst = wave.reduce((s, c) => s + callUsd(c).usd, 0)
    if (out.costUsd + worst > args.budgetUsd || (args.deadline !== undefined && now() >= args.deadline) || out.rateLimited) {
      out.deferred += calls.slice(w).reduce((s, c) => s + c.items.length, 0)
      break
    }
    const results = await Promise.all(wave.map(async (c) => {
      const index = ++callIndex
      try {
        return { c, index, r: await call({ kind: c.kind, system: c.system, user: c.user }), error: null as string | null }
      } catch (e) {
        return { c, index, r: null, error: e instanceof Error ? e.message : String(e) }
      }
    }))
    for (const { c, index, r, error } of results) {
      if (!r) {
        out.failedCalls++
        out.failed += c.items.length
        if (/\b429\b|rate limit|insufficient_quota/i.test(error ?? '')) out.rateLimited = true
        out.errors.push(`call ${index}: ${(error ?? '').slice(0, 200)}`)
        continue
      }
      out.asked += c.items.length
      out.costUsd += estimateCost(modelFor(c.kind), r.usage.prompt_tokens, r.usage.completion_tokens)
      const got = c.kind === 'confirm'
        ? confirmRows({ clientId: args.clientId, version: args.compiled.version, questions: c.questions!, answers: parseAnswers(confirmSchema, r.answers) })
        : classifyRows({ clientId: args.clientId, version: args.compiled.version, items: c.items, answers: parseAnswers(classifySchema, r.answers), codes, check })
      out.unplaced += got.unplaced
      out.downgraded += got.downgraded
      out.answered += c.items.length - got.unplaced
      let writeError: string | null = null
      if (args.write && got.rows.length) {
        try { await args.write(got.rows) } catch (e) { writeError = e instanceof Error ? e.message : String(e) }
      }
      if (writeError) out.errors.push(`write ${index}: ${writeError.slice(0, 200)}`)
      else out.rows.push(...got.rows)
      if (args.admin) {
        try {
          await logAiCall(args.admin as never, {
            clientId: args.clientId, runId: args.runId, pass: PRODUCT_CLASSIFY_PASS, callIndex: index, model: modelFor(c.kind),
            promptVersion: PRODUCT_CLASSIFY_PROMPT_VERSION, systemPrompt: c.system, userPrompt: c.user,
            // Counts, never the comments' words (they are in the request).
            response: { kind: c.kind, items: c.items.length, placed: got.rows.filter((x) => x.placement !== 'none').length, none: got.rows.filter((x) => x.placement === 'none').length, unplaced: got.unplaced, downgraded: got.downgraded },
            error: writeError, usage: r.usage, durationMs: r.durationMs,
            validationStatus: writeError ? 'write_failed' : got.unplaced ? 'partial' : 'ok',
          })
        } catch (e) {
          console.warn(`[product-classify] ai_call_log insert threw: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
    w = end
  }
  return out
}

/** The answers that parse; the rest are dropped (their items are unplaced). */
function parseAnswers<T>(schema: z.ZodType<{ items: T[] }>, answers: unknown[]): T[] {
  const out: T[] = []
  for (const a of answers) {
    const r = schema.safeParse({ items: [a] })
    if (r.success) out.push(r.data.items[0])
  }
  return out
}
