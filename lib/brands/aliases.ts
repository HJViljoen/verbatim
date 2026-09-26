import { createHash } from 'node:crypto'

import { SEALAND_CLIENT_ID } from '../config'

// Brand topics v1 (market-first decision E, WP2.6): the per-brand names and the
// guards against their other meanings, in ONE place. A brand "comes up" in a
// video when its content names it, or when a comment on it does; each match is
// checked here for other meanings before it counts (Freitag is German for
// Friday, Patagonia a region, Cotopaxi a volcano and a province, Sealand a
// micronation, "old school" and "freedom of movement" plain English).
//
// WHY A LIST OF ITS OWN. main has no static alias or homonym list to reuse (plan
// WP2.6, GF seam 1): the fix branch (merged 25 Sep) files a video with the
// attribution_v3 GPT judge, `accountStems` and the tenant-wide
// `tracking_configs.exclude_terms`, none of which is a per-brand rule. So the
// rules live here, and they are the only brand rules the mention layer reads.
//
// HOW A RULE READS ONE TEXT (a content field, or a comment):
//   - a STRONG form counts wherever it appears (a handle, a web address, the
//     name with a product word beside it);
//   - a WEAK form (the bare name) counts only when
//       · it is not right after a `notPreceded` word ("am Freitag", "in
//         Patagonia", "de Cotopaxi"),
//       · it is not right before a `notFollowed` word ("Patagonia Chilena",
//         "Freitag der 13", "north face of"),
//       · no `notWith` word appears anywhere in the same text (a region, a
//         volcano, a German weekday),
//       · and, where the rule has `needs`, one of those words stands within
//         NEEDS_WINDOW characters of it (a brand whose bare name is mostly
//         another word counts only beside a company sign: Freitag, Sealand).
//   Every form and guard word is whole-word and case-insensitive.
//
// ONE RULE, TWO ENGINES. `brandPattern(rule, 'are')` is the POSIX ARE the SQL
// function brand_mention_candidates (MF2) matches with `~*`; `brandPattern(rule,
// 'js')` is the same pattern for JavaScript (the tests, the staging stand-in).
// Fragments use only the syntax both engines read the same way (`\s`, `\d`,
// `\.`, bracket lists of literal characters, `(?:…)`, `|`, `?`, `*`, `+`,
// `{m,n}`); `lib/brands/aliases.test.ts` refuses anything else.
//
// VERSIONED. The rows the script writes carry BRAND_RULE_VERSION; a change to
// any list is a new version (the test pins the lists' fingerprint), and rows
// of the old version stay (brand_mentions is append-only, plan §4.0 rule 4).

export const BRAND_RULE_VERSION = 'brands_v1'

/** The plan's floor (WP2.6): a brand whose hand-checked precision is under
 *  this prints "mostly another word · not counted". */
export const BRAND_PRECISION_FLOOR = 0.8

export type BrandKeyRef = { kind: 'client' } | { kind: 'rival'; name: string } | { kind: 'watched'; name: string }

export interface BrandRule {
  /** The brand as the tenant names it (competitor_names, or the client). */
  brand: string
  key: BrandKeyRef
  /** Forms that count wherever they appear. */
  strong: readonly string[]
  /** The bare name: counts only past the guards below. */
  weak: readonly string[]
  notPreceded?: readonly string[]
  notFollowed?: readonly string[]
  notWith?: readonly string[]
  needs?: readonly string[]
  /** One line: what the guards are for, and where they come from. */
  why: string
}

// Words that sit right before a German weekday used as a day ("am Freitag",
// "schönen Freitag", "ab Freitag"). From staging's Freitag matches (Aug to
// 20 Sep): every German "Friday" there is one of these or has no company sign.
const GERMAN_DAY_BEFORE = [
  'am', 'an', 'ab', 'bis', 'seit', 'vom', 'zum', 'jeden', 'jedem', 'diesen', 'dieser', 'diesem', 'letzten', 'letzter',
  'nächsten', 'nächster', 'naechsten', 'kommenden', 'kommender', 'vergangenen', 'schönen', 'schönes', 'schöner',
  'wunderschönen', 'wundervollen', 'entspannten', 'guten', 'einen', 'einem', 'endlich', 'heute', 'morgen', 'gestern',
  'happy',
]
const GERMAN_WEEKDAYS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'samstag', 'sonntag', 'sonnabend', 'wochenende', 'feierabend']

const SEALAND_RULES: readonly BrandRule[] = [
  {
    brand: 'Sealand',
    key: { kind: 'client' },
    strong: ['sealand\\s*gear[a-z_]*', 'sealand\\s+bags?', 'sealand\\s+(?:backpacks?|moonbags?|duffels?|duffles?|x)'],
    weak: ['sealand'],
    needs: [
      'bags?', 'backpacks?', 'moonbags?', 'duffels?', 'duffles?', 'slings?', 'crossbody', 'totes?', 'apparel', 'gear', 'stores?',
      'brand', 'upcycl[a-z]*', 'recycl[a-z]*', 'sustainab[a-z]*', 'cape\\s*town', 'hout\\s*bay', 'south\\s*africa[a-z]*',
    ],
    notWith: [
      'micronations?', 'principality', 'roughs\\s+tower', 'polybags?', 'dongguan', 'marine\\s+toilets?', 'toilets?',
      'vacuflush', 'dometic', 'maersk',
    ],
    why: 'the brand keywords count as they are; the bare name needs a bag, gear, shop or Cape Town sign, and never counts beside the micronation (principality, Roughs Tower), polybags, Dongguan or the marine toilet (plan WP2.6; staging: a hashtag list of countries names #sealand)',
  },
  {
    brand: 'Cotopaxi',
    key: { kind: 'rival', name: 'Cotopaxi' },
    strong: [
      '@cotopaxi', 'cotopaxi\\.com',
      'cotopaxi\\s*(?:backpacks?|bags?|packs?|daypacks?|jackets?|pants|fleeces?|slings?|totes?|hoodies?)',
      'cotopaxi\\s+(?:allpa|del\\s+d[ií]a|batac|luz[oó]n|fuego|kappa|viaje|trozo|todo|teca|chumbo|tasra|mente|capa|bataan|campus|big\\s+daddy|empacable)',
    ],
    weak: ['cotopaxi', 'cotapaxi', 'cotipaxi'],
    notPreceded: [
      'de', 'del', 'en', 'climbing', 'climb', 'climbed', 'summit', 'summited', 'mount', 'mt\\.?', 'volc[aá]n',
      'volcano', 'nacional', 'provincia', 'province',
    ],
    notWith: [
      'volcano(?:es)?', 'volc[aá]n', 'volcanes', '🌋', 'ecuador', 'ecuatorian[oa]s?', '🇪🇨', 'quito', 'latacunga',
      'parque\\s+nacional', 'provincia', 'ind[ií]genas?', 'micc', 'machala', 'ipiales', 'alcald[ií]a', 'c[aá]rcel',
      'refugio', 'chimborazo', 'pichincha',
    ],
    why: 'the volcano and the province: Ecuador, volcano, Latacunga, Parque Nacional, "de Cotopaxi" (plan WP2.6; staging Aug to 20 Sep: 9 of 54 content matches)',
  },
  {
    brand: 'Freitag',
    key: { kind: 'rival', name: 'Freitag' },
    strong: [
      'freitag\\.ch', '@freitag[a-z_]*', 'freitag\\s*lab', 'freitag\\s*bags?',
      'freitag\\s+(?:taschen?|rucksack|backpacks?|messenger|stores?|shops?|f\\d{2,3})',
    ],
    weak: ['freitag', 'frtg'],
    needs: [
      'bags?', 'taschen?', 'rucksack', 'backpacks?', 'messenger', 'tarps?', 'truck', 'lkw', 'planen?', 'stores?', 'shops?',
      'brand', 'marke', 'recycl[a-z]*', 'upcycl[a-z]*', 'z[uü]rich', 'slings?', 'wallets?', 'totes?', 'pouch', 'f\\d{2,3}',
    ],
    notPreceded: GERMAN_DAY_BEFORE,
    notFollowed: ['der\\s+13', 'der\\s+dreizehnte', 'abends?', 'morgens?', 'nachmittags?', 'mittags?', 'nachts?', 'früh', '\\d+'],
    notWith: GERMAN_WEEKDAYS,
    why: 'German for Friday: counts only beside a company sign (bag, Tasche, store, tarp, truck, F-number, Zürich), never after "am", "schönen", "ab" and the like or beside another German weekday (plan WP2.6; research F7: name precision about 14%)',
  },
  {
    brand: 'Rareform',
    key: { kind: 'rival', name: 'Rareform' },
    strong: ['@?rareform', 'rare\\s*form\\s+(?:bags?|backpacks?|totes?)'],
    weak: [],
    why: '"rare form" is an English phrase, so only the one-word name, its handle or the name with a bag word counts',
  },
  {
    brand: 'The North Face',
    key: { kind: 'rival', name: 'The North Face' },
    strong: [
      '@thenorthface', 'thenorthface',
      'north\\s*face\\s+(?:borealis|jester|recon|surge|vault|pivoter|isabella|base\\s+camp|fusebox|nuptse|denali|backpacks?|bags?|jackets?|duffels?|duffles?|fleeces?|puffers?|vests?)',
    ],
    weak: ['(?:the\\s+)?north\\s*face', 'tnf'],
    notFollowed: ['of', 'route', 'routes', 'wall', 'direct'],
    notWith: ['eiger', 'matterhorn', 'jorasses', 'nfl', 'football', 'touchdowns?', 'thursday\\s+night'],
    why: '"north face" and "tnf" count without "The" (plan WP2.6); a mountain\'s north face ("the north face of the Eiger") and Thursday Night Football do not',
  },
  {
    brand: 'Patagonia',
    key: { kind: 'rival', name: 'Patagonia' },
    strong: [
      '@patagonia', 'patagonia\\.com',
      'patagonia\\s+(?:black\\s*hole|blackhole|mlc|mini\\s+mlc|houdini|nano\\s*puff|micro\\s+puff|hyperpuff|torrent\\s*shell|baggies|synchilla|r1|capilene|better\\s+sweater|down\\s+sweater|atom|refugio|terravia|terrebonne|guidewater|totepacks?|provisions|worn\\s+wear|jackets?|fleeces?|bags?|backpacks?|duffels?|duffles?|clothing|gear|stuff|vests?|shirts?|shorts|stores?)',
    ],
    weak: ['patagonia'],
    notPreceded: [
      'in', 'to', 'toward', 'towards', 'through', 'across', 'around', 'visit', 'visiting', 'visited', 'explore', 'exploring',
      'explored', 'chilean', 'argentine', 'argentinian', 'argentinean', 'southern', 'wild', 'remote', 'la', 'en', 'del',
    ],
    notFollowed: ['chilena', 'chileno', 'argentina', 'austral', 'region', 'regi[oó]n'],
    notWith: [
      'chile', 'chilean[oa]?s?', 'chilen[oa]s?', 'argentin[a-z]*', 'torres\\s+del\\s+paine', 'punta\\s*arenas', 'coyhaique',
      'ays[eé]n', 'chubut', 'bariloche', 'ushuaia', 'tierra\\s+del\\s+fuego', 'chalt[eé]n', 'fitz\\s*roy', 'perito\\s+moreno',
      'malvinas', 'pumas?', '🇨🇱', '🇦🇷', 'w\\s+trek', 'glaciers?', 'gauchos?', 'trapananda',
    ],
    why: 'the region: "in Patagonia", "la Patagonia", "Patagonia Chilena", and any text naming Chile, Argentina, Torres del Paine and the like (plan WP2.6; staging Aug to 20 Sep: 20 of 64 content matches)',
  },
  {
    brand: 'Freedom of Movement',
    key: { kind: 'rival', name: 'Freedom of Movement' },
    strong: ['@?fombrand', 'freedom\\s+of\\s+movement\\s+(?:bags?|backpacks?|brand|packs?|slings?|totes?)'],
    weak: [],
    why: '"freedom of movement" is a plain phrase (and a border-policy term), so only the brand handle or the name with a bag word counts',
  },
  {
    brand: 'Old School',
    key: { kind: 'rival', name: 'Old School' },
    strong: ['@?oldschool_?ltd', 'old\\s*school\\s+ltd'],
    weak: [],
    why: '"old school" is a plain phrase (staging Aug to 20 Sep: all 13 matches), so only the brand\'s handle counts',
  },
]

/** The rules per tenant. A tenant with none (Össur, paused) gets no rows. */
export const BRAND_RULES: Readonly<Record<string, readonly BrandRule[]>> = {
  [SEALAND_CLIENT_ID]: SEALAND_RULES,
}

export function brandRulesFor(clientId: string): readonly BrandRule[] {
  return BRAND_RULES[clientId] ?? []
}

/** A stable fingerprint of every tenant's rules AS COMPILED (the lists and the
 *  compiler both: NEEDS_WINDOW or a guard's shape changes what matches). The
 *  test pins it against BRAND_RULE_VERSION, so a change without a new version
 *  fails. */
export function brandRulesFingerprint(rules: Readonly<Record<string, readonly BrandRule[]>> = BRAND_RULES): string {
  const compiled = Object.keys(rules).sort().map((client) => [client, rules[client].map((r) => [r.brand, r.key, brandPattern(r, 'are'), barePattern(r, 'are')])])
  return createHash('sha256').update(JSON.stringify(compiled)).digest('hex').slice(0, 16)
}

// ---- the compiler -----------------------------------------------------------

export type RegexEngine = 'are' | 'js'

const WORD: Record<RegexEngine, string> = { are: '[[:alnum:]_]', js: '[\\p{L}\\p{N}_]' }
const NOT_WORD: Record<RegexEngine, string> = { are: '[^[:alnum:]_]', js: '[^\\p{L}\\p{N}_]' }

/** How near a `needs` word must stand to the bare name, in characters: a
 *  company sign is the name's neighbour, not a word somewhere in a long
 *  caption (staging: a German craft haul's shopping list named a bag hundreds
 *  of characters away from its "Halloween Freitag"). */
export const NEEDS_WINDOW = 80

const alt = (xs: readonly string[]): string => `(?:${xs.join('|')})`
const whole = (e: RegexEngine, x: string): string => `(?<!${WORD[e]})${x}(?!${WORD[e]})`

/** The bare name past the negative guards only (no `needs`). */
function negativeCore(rule: BrandRule, e: RegexEngine): string {
  const w = WORD[e]
  const nw = NOT_WORD[e]
  let core = whole(e, alt(rule.weak))
  if (rule.notPreceded?.length) core = `(?<!(?:^|${nw})${alt(rule.notPreceded)}\\s+)${core}`
  if (rule.notFollowed?.length) core = `${core}(?!\\s+${alt(rule.notFollowed)}(?!${w}))`
  if (rule.notWith?.length) {
    const n = alt(rule.notWith)
    core = `(?<!(?:^|${nw})${n}(?:${nw}.*)?)${core}(?!(?:.*${nw})?${n}(?!${w}))`
  }
  return core
}

function weakPattern(rule: BrandRule, e: RegexEngine): string | null {
  if (rule.weak.length === 0) return null
  const core = negativeCore(rule, e)
  if (!rule.needs?.length) return core
  const w = WORD[e]
  const nw = NOT_WORD[e]
  const n = alt(rule.needs)
  const near = `.{0,${NEEDS_WINDOW}}`
  return `(?:(?<=(?:^|${nw})${n}(?:${nw}${near})?)${core}|${core}(?=(?:${near}${nw})?${n}(?!${w})))`
}

/** The whole rule as one pattern: a strong form, or the bare name past its
 *  guards. For `~*` ('are') or `new RegExp(p, 'isu')` ('js'). */
export function brandPattern(rule: BrandRule, e: RegexEngine): string {
  const parts = [rule.strong.length ? whole(e, alt(rule.strong)) : null, weakPattern(rule, e)].filter((p): p is string => p !== null)
  if (parts.length === 0) throw new Error(`brand rule ${rule.brand}: no form to match`)
  return parts.length === 1 ? parts[0] : `(?:${parts.join('|')})`
}

/** The bare name with no guard: where it matches a video's content and the
 *  rule does not, the video names the word in its other meaning. Null for a
 *  rule with no bare name, or one whose bare name needs no guard. */
export function barePattern(rule: BrandRule, e: RegexEngine): string | null {
  const guarded = !!(rule.notPreceded?.length || rule.notFollowed?.length || rule.notWith?.length || rule.needs?.length)
  return rule.weak.length > 0 && guarded ? whole(e, alt(rule.weak)) : null
}

/** The bare name past the negative guards only (`notPreceded`, `notFollowed`,
 *  `notWith`), without `needs`: a text the bare name matches and this does not
 *  names the word in its other meaning, which is evidence; a text that only
 *  lacks a company sign is not. Null where `barePattern` is null. */
export function negativePattern(rule: BrandRule, e: RegexEngine): string | null {
  return barePattern(rule, e) === null ? null : negativeCore(rule, e)
}

/** A strong form alone (the comment rule's override on a homonym video). */
export function strongPattern(rule: BrandRule, e: RegexEngine): string | null {
  return rule.strong.length ? whole(e, alt(rule.strong)) : null
}

/** JavaScript's copy of a pattern: case-insensitive, `.` across lines (as ARE
 *  reads it), Unicode classes. */
export const jsRegex = (pattern: string): RegExp => new RegExp(pattern, 'isu')

/** Does this rule count this text? (The JS engine; the SQL reads the ARE.) */
export function ruleMatches(rule: BrandRule, text: string | null | undefined): boolean {
  return !!text && jsRegex(brandPattern(rule, 'js')).test(text)
}

// ---- watched brands (WP3.5) -------------------------------------------------
//
// Brands the market names that we do not search (Peak Design, tomtoc, Osprey,
// Matador, Bellroy, BAGSMART on Sealand's staging captions: 13, 12, 11, 9, 7
// and 7 in August and September), listed by the operator in
// tracking_configs.watched_brands (MF3; operator-only, logged through
// recordConfigChange). Counted without adding a search. A watched name has no
// guard list of its own, so it counts only as the whole name, as written: its
// precision is checked by hand before a page prints it (a brand under
// BRAND_PRECISION_FLOOR prints as not counted), and a name that needs guards
// graduates to a rule above, under a new BRAND_RULE_VERSION. Its rows carry
// WATCHED_RULE_VERSION and brand_key 'watched:<slug>'.

export const WATCHED_RULE_VERSION = 'watched_v1'

/** 'Peak Design' → 'peak-design'. */
export const watchedSlug = (name: string): string =>
  name.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export const watchedKey = (name: string): string => `watched:${watchedSlug(name)}`

/** A watched name's rule: the whole name, spaces flexible, as a strong form.
 *  Null for a name with nothing to match or with characters the two engines
 *  might read apart (only letters, digits, spaces, '&', '.', '-' and an
 *  apostrophe are taken). */
export function watchedRule(name: string): BrandRule | null {
  const trimmed = name.trim()
  if (!watchedSlug(trimmed) || !/^[\p{L}\p{N} &.'-]+$/u.test(trimmed)) return null
  const body = trimmed.toLowerCase().split(/\s+/).map((w) => w.replace(/[.]/g, '\\.').replace(/-/g, '[- ]?')).join('\\s*')
  return {
    brand: trimmed,
    key: { kind: 'watched', name: trimmed },
    strong: [body],
    weak: [],
    why: 'a watched brand (tracking_configs.watched_brands): the whole name only, no guards; printed only once its hand-checked precision clears the floor',
  }
}

