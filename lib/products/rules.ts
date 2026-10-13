import { createHash } from 'node:crypto'

import { brandPattern, brandRulesFor, type BrandRule, type RegexEngine } from '../brands/aliases'
import type { AliasKind, CatalogueAlias, Placement, ProductCatalogue } from './types'

// The product rules (depth redesign v2, T11; plan decision 3, option B): how a
// client's catalogue (product_aliases, read once with its version through
// product_catalogue) becomes patterns, and what a text's matches place.
//
// ONE ALIAS, ONE STRONG FORM, compiled the way lib/brands/aliases.ts compiles
// a watched brand (`watchedRule`): the whole name as written, case-insensitive,
// whole-word, spaces flexible, a hyphen optional ("Pro-Flex" reads "pro-flex",
// "pro flex" and "proflex"), through the brand compiler itself
// (`brandPattern`), so one alias is one pattern for both engines: the ARE
// brand_mention_candidates matches with `~*` (MF2), and JavaScript's twin the
// matcher reads full texts with. A category word also takes its plural
// ("liner" reads "liners"). An alias a person typed with a character the two
// engines might read apart is refused, never guessed at (`aliasBody` null).
//
// WHAT A MATCH PLACES (the T10 contract, lib/products/types.ts):
//   a product's `name` or `nickname`        named: that product (and its category)
//   a category's `name` or `nickname`       unclear: one of the client's products
//     (a product family, "Pro-Flex")        in that category, not which
//   a category's `category_word`            unbranded: the category in general,
//                                           UNLESS the client's own name stands
//                                           within CLIENT_NEAR characters of it,
//                                           in the same phrase, as a word, not a
//                                           hashtag ("my Össur liner"): then
//                                           unclear
// A match inside a longer match is not a match ("Pro-Flex" inside "Pro-Flex
// XC"; "Pro-Flex XC" inside "Pro-Flex XC Torsion"): the longest name wins. In
// one text, a category's strongest placement stands (named over unclear over
// unbranded), and every product it names is named.
//
// A GENERIC NAME (`needs_confirm`: "Unity", "Comfort", "Total Knee") places
// nothing by rule. Its hit goes to the confirm call (lib/products/classify.ts),
// and only a confirmed hit places, as a 'confirmed' row; until then the text
// counts as it would without that word. A generic name the text's other names
// already cover asks nothing (its product named, or its category standing as
// strongly: "Unloader One brace").
//
// A product name on its own never names the BRAND (Heinrich, 13 Oct; T15 as
// built): nothing here writes a brand_mentions row, and the client's own name
// is read here only to tell "my Össur liner" from "liners".
//
// VERSIONED twice. The data is the catalogue's version (product_catalogue's
// 'pc1_…', an md5 over the active rows), stored on every placement; the
// compiler is PRODUCT_RULE_VERSION, and a change to anything below that moves
// what a catalogue matches is a new one (lib/products/rules.test.ts pins the
// fingerprint of a fixed catalogue compiled).

export const PRODUCT_RULE_VERSION = 'product_rules_v1'

/** How near the client's own name must stand to a category word for the
 *  word to read as one of the client's products ("my Össur liner"), in
 *  characters between the two. Tighter than the brands' NEEDS_WINDOW (80): the
 *  name has to qualify the word, not share a long caption with it. */
export const CLIENT_NEAR = 40

/** The characters an alias may hold: letters, digits, spaces, and & . ' - +.
 *  Anything else is a character the two engines might read apart. */
const ALIAS_CHARS = /^[\p{L}\p{N} &.'+-]+$/u

/**
 * An alias's pattern body (no word bounds): the words as written, lowercased,
 * `\s*` between them, a hyphen optional or a space, a dot and a plus literal;
 * a category word takes an optional plural. Null for an alias the matcher will
 * not read: under two characters with a letter or digit, or a character
 * outside ALIAS_CHARS. PURE.
 */
export function aliasBody(alias: string, kind: AliasKind): string | null {
  const trimmed = alias.trim()
  if (!ALIAS_CHARS.test(trimmed)) return null
  if ([...trimmed.replace(/[^\p{L}\p{N}]/gu, '')].length < 2) return null
  const words = trimmed.toLowerCase().split(/\s+/).map((w) => w.replace(/[.+]/g, (c) => `\\${c}`).replace(/-/g, '[- ]?'))
  const body = words.join('\\s*')
  return kind === 'category_word' ? `${body}(?:s|es)?` : body
}

/** One alias as the brand compiler reads it: a strong form, no bare name. */
function aliasRule(alias: string, body: string): BrandRule {
  return { brand: alias, key: { kind: 'watched', name: alias }, strong: [body], weak: [], why: 'a catalogue alias: the whole name only' }
}

/** One alias, compiled. */
export interface CompiledAlias {
  aliasId: string
  alias: string
  kind: AliasKind
  needsConfirm: boolean
  /** The product it names; null for a category's alias. */
  productId: string | null
  /** The category: the alias's own, or its product's. */
  groupId: string
  /** What a match places, before CLIENT_NEAR: named, unclear or unbranded. */
  placement: Exclude<Placement, 'none'>
  /** The alias's pattern body, before the word bounds (`aliasBody`). */
  body: string
  /** brandPattern of the alias, per engine (whole-word). */
  pattern: Record<RegexEngine, string>
  /** The JS pattern, compiled once ('gisu'; reset before each use). */
  re: RegExp
}

export interface CompiledCatalogue {
  version: string
  /** Every alias the matcher reads, in the catalogue's order. */
  aliases: CompiledAlias[]
  /** Aliases the matcher refused (a character it will not read), with why. */
  refused: { aliasId: string; alias: string; why: string }[]
  groupName: ReadonlyMap<string, string>
  productName: ReadonlyMap<string, string>
  /** product id → its category. */
  productGroup: ReadonlyMap<string, string>
  /** The client's own name (its brand rule), for CLIENT_NEAR; null without one. */
  client: { rule: BrandRule; js: string; re: RegExp } | null
  /** Every alias at once ('isu'): a text it does not match holds none. */
  any: RegExp | null
}

const globalRe = (pattern: string): RegExp => new RegExp(pattern, 'gisu')

const placementOf = (a: Pick<CatalogueAlias, 'kind' | 'product_id'>): Exclude<Placement, 'none'> =>
  a.product_id ? 'named' : a.kind === 'category_word' ? 'unbranded' : 'unclear'

/** The catalogue as the matcher reads it. `clientId` picks the client's own
 *  brand rule (lib/brands/aliases.ts) for CLIENT_NEAR; a tenant without one
 *  reads every category word as the category in general. PURE. */
export function compileCatalogue(catalogue: ProductCatalogue, clientId: string | null): CompiledCatalogue {
  const productGroup = new Map(catalogue.products.map((p) => [p.id, p.group_id]))
  const groups = new Set(catalogue.groups.map((g) => g.id))
  const aliases: CompiledAlias[] = []
  const refused: CompiledCatalogue['refused'] = []
  for (const a of catalogue.aliases) {
    const groupId = a.product_id ? productGroup.get(a.product_id) : a.group_id
    if (!groupId || !groups.has(groupId)) { refused.push({ aliasId: a.id, alias: a.alias, why: 'its product or category is not in the active catalogue' }); continue }
    if (a.kind === 'category_word' && a.product_id) { refused.push({ aliasId: a.id, alias: a.alias, why: 'a category word belongs to a category' }); continue }
    const body = aliasBody(a.alias, a.kind)
    if (!body) { refused.push({ aliasId: a.id, alias: a.alias, why: 'not a name the matcher can read as it stands' }); continue }
    const rule = aliasRule(a.alias, body)
    aliases.push({
      aliasId: a.id, alias: a.alias, kind: a.kind, needsConfirm: a.needs_confirm,
      productId: a.product_id, groupId, placement: placementOf(a), body,
      pattern: { are: brandPattern(rule, 'are'), js: brandPattern(rule, 'js') },
      re: globalRe(brandPattern(rule, 'js')),
    })
  }
  const clientRule = clientId ? brandRulesFor(clientId).find((r) => r.key.kind === 'client') ?? null : null
  return {
    version: catalogue.version,
    aliases,
    refused,
    groupName: new Map(catalogue.groups.map((g) => [g.id, g.name])),
    productName: new Map(catalogue.products.map((p) => [p.id, p.name])),
    productGroup,
    client: clientRule ? { rule: clientRule, js: brandPattern(clientRule, 'js'), re: globalRe(brandPattern(clientRule, 'js')) } : null,
    any: aliases.length ? new RegExp(brandPattern(aliasRule('catalogue', `(?:${aliases.map((a) => a.body).join('|')})`), 'js'), 'isu') : null,
  }
}

/** One pattern for the whole catalogue: what brand_mention_candidates is asked
 *  for (one scan, not one per alias): every alias's body in one alternation,
 *  inside one pair of word bounds (the same match set as an alternation of
 *  each alias's own pattern, far smaller for the ARE engine). Null for a
 *  catalogue with nothing the matcher reads. PURE. */
export function cataloguePattern(compiled: CompiledCatalogue, engine: RegexEngine): string | null {
  if (compiled.aliases.length === 0) return null
  return brandPattern(aliasRule('catalogue', `(?:${compiled.aliases.map((a) => a.body).join('|')})`), engine)
}

/** A stable fingerprint of a catalogue AS COMPILED (the compiler's output, not
 *  the catalogue's rows): the test pins it over a fixed catalogue against
 *  PRODUCT_RULE_VERSION, so a compiler change without a new version fails. */
export function compilerFingerprint(compiled: CompiledCatalogue): string {
  const lines = compiled.aliases.map((a) => [a.aliasId, a.placement, a.needsConfirm, a.pattern.are, a.pattern.js])
  return createHash('sha256').update(JSON.stringify([lines, CLIENT_NEAR, compiled.client?.js ?? null])).digest('hex').slice(0, 16)
}

// ---- reading one text -----------------------------------------------------------

/** One match in a text: the alias and where it stands. */
export interface AliasMatch { alias: CompiledAlias; start: number; end: number }

/** Every alias's matches in `text`, less any match inside a longer one. PURE
 *  (the compiled expressions' lastIndex is reset before each use). */
export function matchAliases(compiled: CompiledCatalogue, text: string | null | undefined): AliasMatch[] {
  if (!text || !compiled.any || !compiled.any.test(text)) return []
  const found: AliasMatch[] = []
  for (const alias of compiled.aliases) {
    const re = alias.re
    re.lastIndex = 0
    for (let m = re.exec(text); m; m = re.exec(text)) {
      found.push({ alias, start: m.index, end: m.index + m[0].length })
      if (m[0].length === 0) re.lastIndex++
    }
  }
  return found.filter((f) => !found.some((g) => g !== f && g.start <= f.start && g.end >= f.end && g.end - g.start > f.end - f.start))
}

/** Where the client's own name stands in `text` (its brand rule's matches),
 *  as a word: a hashtag (#ossur) is a tag on the post, not a word qualifying
 *  the product beside it ("RoadKnee Hydraulic Knee … #ossur #HydraulicKnee"
 *  is not one of Össur's knees; the hand check of 13 Oct). */
function clientSpans(compiled: CompiledCatalogue, text: string): { start: number; end: number }[] {
  if (!compiled.client) return []
  const out: { start: number; end: number }[] = []
  const re = compiled.client.re
  re.lastIndex = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (text[m.index - 1] !== '#') out.push({ start: m.index, end: m.index + m[0].length })
    if (m[0].length === 0) re.lastIndex++
  }
  return out
}

/** Characters that end a phrase: the client's name on one side of one and a
 *  category word on the other are two phrases ("Metiz Hydraulic Knee | Ossur
 *  Foot" is not an Össur knee; the hand check of 13 Oct). */
const PHRASE_BREAK = /[|/•·\n.!?;]/

const near = (text: string, a: { start: number; end: number }, b: { start: number; end: number }): boolean => {
  const [x, y] = a.start <= b.start ? [a, b] : [b, a]
  const gap = Math.max(0, y.start - x.end)
  return gap <= CLIENT_NEAR && !PHRASE_BREAK.test(text.slice(x.end, y.start))
}

/** What a text's rules place: per category, its strongest placement, and
 *  every product it names. */
export interface TextPlacement {
  placement: Exclude<Placement, 'none'>
  groupId: string
  productId: string | null
  /** The aliases that placed it (for the hand check; never stored). */
  aliases: string[]
}

export interface TextReading {
  /** What the rules place, generic names left out. */
  placements: TextPlacement[]
  /** The generic names the text holds, for the confirm call: each alias once. */
  generic: CompiledAlias[]
}

const RANK: Record<Exclude<Placement, 'none'>, number> = { named: 3, unclear: 2, unbranded: 1 }

/**
 * What the rules read in one text (see the header). A generic name's match is
 * set aside for the confirm call and places nothing here. PURE.
 */
export function readText(compiled: CompiledCatalogue, text: string | null | undefined, opts: { clientNear?: boolean } = {}): TextReading {
  const matches = matchAliases(compiled, text)
  if (matches.length === 0) return { placements: [], generic: [] }
  // A bag of tags (the hashtags field) has no phrases: nothing in it is near.
  const client = opts.clientNear === false ? [] : clientSpans(compiled, text ?? '')
  const generic = new Map<string, CompiledAlias>()
  // category → the strongest rank seen, and what holds it
  const byGroup = new Map<string, { rank: number; named: Map<string, string[]>; aliases: string[] }>()
  for (const m of matches) {
    if (m.alias.needsConfirm) { generic.set(m.alias.aliasId, m.alias); continue }
    let placement = m.alias.placement
    if (placement === 'unbranded' && client.some((c) => near(text ?? '', c, m))) placement = 'unclear'
    const g = byGroup.get(m.alias.groupId) ?? { rank: 0, named: new Map<string, string[]>(), aliases: [] }
    if (placement === 'named' && m.alias.productId) {
      g.named.set(m.alias.productId, [...(g.named.get(m.alias.productId) ?? []), m.alias.alias])
      g.rank = RANK.named
    } else if (RANK[placement] > g.rank) {
      g.rank = RANK[placement]
      g.aliases = [m.alias.alias]
    } else if (RANK[placement] === g.rank && g.rank < RANK.named) g.aliases.push(m.alias.alias)
    byGroup.set(m.alias.groupId, g)
  }
  const placements: TextPlacement[] = []
  for (const [groupId, g] of byGroup) {
    if (g.rank === RANK.named) {
      for (const [productId, aliases] of g.named) placements.push({ placement: 'named', groupId, productId, aliases: [...new Set(aliases)] })
    } else {
      placements.push({ placement: g.rank === RANK.unclear ? 'unclear' : 'unbranded', groupId, productId: null, aliases: [...new Set(g.aliases)] })
    }
  }
  placements.sort((a, b) => `${a.groupId}|${a.productId ?? ''}`.localeCompare(`${b.groupId}|${b.productId ?? ''}`))
  // A generic name the text's placements already cover asks nothing: its
  // product is already named, or its category already stands as strongly
  // ("Unloader One brace": the brace is the named product's category).
  const covered = (a: CompiledAlias): boolean => {
    const g = byGroup.get(a.groupId)
    if (!g) return false
    return a.productId ? g.named.has(a.productId) : g.rank >= RANK[a.placement]
  }
  return { placements, generic: [...generic.values()].filter((a) => !covered(a)) }
}
