// Which quotes the app may print, and in what order (Sealand walkthrough
// finish-list items 1 and 2, 29 Sep 2026).
//
// THE PROBLEM IT ANSWERS. The numbers on the pages held up; the quotes did
// not. About forty of the ~120 quotes a Sealand reader met were off the
// market (Patagonia Provisions sardines under Durability, a Telugu flip-flop
// comment), about the wrong brand (an Osprey line under Cotopaxi), from a
// maker's audience praising the maker ("Bless your hands… what is the
// price?"), under a small seller's sale post ("so your bags cost K363 in
// Zambia?"), untranslated ("Super kani cost akuba…" with itself as its
// English), or five of six from one Reddit outfit post. Each surface picked
// its quotes its own way, and none of them asked all of these questions.
//
// ONE READ-TIME RULE, EVERY SURFACE. `quoteGate` says whether one quote may
// print in a block and how well it fits; `pickEligible` takes a block's
// candidates in their own order, drops what fails, ranks what passes, allows
// one quote per thread (video) and takes the first n. A block that runs out
// prints fewer, or none: nothing here pads.
//
// WHAT IT READS is what the data already holds, gathered per quote by
// `lib/quote-context.ts`: the video's caption, hashtags, topics, account and
// filing (client / rival / category), its segment label (`video_segments`,
// maker · noise · market, through `segments_for_videos`), the translation
// cache's language and English, and the comment's own words.
//
// THE GATES, in order (the first that fails names the reason):
//   1. readable   — English, or a real English rendering of another language.
//                   A "translation" equal to its original is no translation.
//   2. substance  — at least three words and fifteen letters of readable text
//                   ("Very dirty" is not a voice).
//   3. not a bot  — a moderator bot's copy of the post is the post.
//   4. not a sale — no sale ad in the words (`readsAsOffer` plus giveaways and
//                   "check my page"), and never under a seller's sale post
//                   (a price label, "available to order", "DM to order").
//   5. not a maker — never under a video labelled maker, or one whose words
//                   say a maker made the thing (handmade, "I made this"),
//                   and never a line praising the maker ("bless your hands").
//   6. the right brand — in a brand's block, under a video filed under that
//                   brand or naming it, and never naming only another brand;
//                   in a market block, never under a brand's own post.
//   7. on the market — for a tenant with a market lexicon (Sealand: bags,
//                   luggage, backpacks, carry accessories), the words name a
//                   carry good, or they sit under a video about one, point at
//                   the thing shown ("it", "this one") or speak to the block's
//                   claim, and name no product outside the market (food, a
//                   skirt, an iPad, a tent).
//   8. relevant   — where the block asks for it (a subject, a rival's claim),
//                   the words speak to the claim.
//
// TENANT-SCOPED WHERE THE WORDS ARE A MARKET'S. The carry lexicon and the
// extended maker words are Sealand's (as the segments_v1 maker rule is,
// lib/segments/rules.ts); another tenant gets gates 1-4, 6 and 8 only.
//
// PURE. No reads, no clock.

import { englishHits, readsAsHeroQuote } from './quotes'
import { makerHaystack, makerWordIn, segmentRulesEnabled } from './segments/rules'
import { readsAsOffer } from './pages/overview-market/offers'

// ---- The context a quote is judged in ---------------------------------------------

/** What the gate knows about the video a quote sits under. */
export interface QuoteVideo {
  platform?: string | null
  /** `videos.video_id`, the platform's own id: the thread. */
  videoId?: string | null
  caption?: string | null
  hashtags?: readonly string[] | null
  topics?: readonly string[] | null
  accountName?: string | null
  isClient?: boolean | null
  isCompetitor?: boolean | null
  competitorName?: string | null
  /** `videos.source`: 'owned', 'competitor_owned', 'discovered'. */
  source?: string | null
  /** `segments_for_videos`' answer ('maker' · 'noise' · 'market'), or null
   *  where it was not read (the inline v1 rule then answers for makers). */
  segment?: string | null
}

/** One quote, as the gate reads it. */
export interface GateInput {
  /** The words as written. */
  text: string
  /** The translation cache's language; absent or null where nothing has read
   *  the text. */
  lang?: string | null
  /** The cache's English rendering; null where the text is English. */
  english?: string | null
  /** The video behind it. `null` means "looked for and not found", which fails
   *  closed; `undefined` means "this caller has no video to give" and only the
   *  text gates apply. */
  video?: QuoteVideo | null
}

/** The market a tenant's quotes must be about. Only Sealand has one. */
export type QuoteMarket = 'carry'

/** How one block asks. */
export interface GateOptions {
  /** The tenant's market lexicon (`quoteMarketFor`), or null for none. */
  market?: QuoteMarket | null
  /** Whether the tenant's maker words apply (`segmentRulesEnabled`). */
  makerRule?: boolean
  /** What the block says the quote illustrates: a theme label, a subject's
   *  name and description, a rival's finding, a recommendation. Used to rank,
   *  and to require where `requireRelevance` says so. */
  claim?: string | null
  /** Print only a quote that speaks to `claim` (a subject's voices, a rival's
   *  claim). Where the claim carries no word to match, nothing is required. */
  requireRelevance?: boolean
  /** A brand's block: the quote must be that brand's. Without one the block
   *  is the market's, and never quotes from under a brand's own post. */
  brand?: string | null
  /** Comments under the client's own posts may print (Worth a reply, Your
   *  moves). Off by default: the client's audience is not the market
   *  (decision E). */
  allowOwn?: boolean
  /** Wordings already printed on the page: `pickEligible` skips them and adds
   *  its own, so no voice is printed twice. */
  used?: Set<string>
  /** Quotes one thread (video) may give a block. One. */
  perThread?: number
}

export type GateReason =
  | 'unreadable' | 'too_short' | 'bot' | 'sale_ad' | 'seller_post' | 'maker_video' | 'maker_praise'
  | 'own_post' | 'brand_post' | 'wrong_brand' | 'off_topic' | 'not_relevant' | 'no_video'

export type GateVerdict = { ok: true; score: number; relevance: number; thread: string | null } | { ok: false; reason: GateReason }

/** Which tenants' quotes carry a market lexicon: Sealand's, bags. */
export function quoteMarketFor(clientId: string): QuoteMarket | null {
  return segmentRulesEnabled(clientId) ? 'carry' : null
}

// ---- 1-2. Readable, and enough of it -------------------------------------------------

const isEnglishTag = (lang: string | null | undefined): boolean => {
  if (!lang) return false
  const l = lang.trim().toLowerCase()
  return l === 'en' || l === 'english' || /^en[-_]/.test(l)
}

/** Letters and digits only, one case: two spellings of the same words meet. */
const fold = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/**
 * The English a reader reads for this quote, or null where there is none.
 *
 * The cache's answer where it has one: English as written, or another language
 * with an English rendering that is not the original back again (the
 * translator returns a text it could not read unchanged, and the page printed
 * "Super kani cost akuba…" twice). Unread text falls back to the heuristic the
 * one English gate uses (`readsAsHeroQuote` without a reading).
 */
export function readableEnglish(q: Pick<GateInput, 'text' | 'lang' | 'english'>): string | null {
  const text = (q.text ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (q.lang != null) {
    if (isEnglishTag(q.lang)) return text
    const english = (q.english ?? '').replace(/\s+/g, ' ').trim()
    if (!english || fold(english) === fold(text)) return null
    return english
  }
  return readsAsHeroQuote(text) || (text.length > 170 && englishHits(text) >= 4) ? text : null
}

const MIN_WORDS = 3
const MIN_LETTERS = 15

/** Enough words to be a voice: three words and fifteen letters. */
export function hasSubstance(english: string): boolean {
  const words = english.match(/[\p{L}\p{N}']+/gu) ?? []
  const letters = (english.match(/\p{L}/gu) ?? []).length
  return words.length >= MIN_WORDS && letters >= MIN_LETTERS
}

// ---- 3-4. Bots and sales ---------------------------------------------------------------

const BOT = /\boriginal copy of (the )?post|\bi am a bot\b|\bautomoderator\b|\bthis action was performed automatically\b/i

/** A sale ad in the comment's own words: `readsAsOffer`'s five shapes, and the
 *  few it leaves to the page — a giveaway, "check out my page", a code. */
const SALE_WORDS = /\bgive-?aways?\b|\bcheck (out )?(my|our) (page|shop|store|profile|bio|account)\b|\b(visit|follow) (my|our) (page|shop|store)\b|\b(use|with) (my |our |the )?code\b|\bdiscount code\b|\bwe (sell|ship worldwide|deliver)\b/i

export const readsAsSaleAd = (text: string | null | undefined): boolean =>
  readsAsOffer(text) || SALE_WORDS.test(text ?? '')

/** A post that is a seller's sale ad: a price label, an order instruction, a
 *  giveaway, a shop pointer. Reddit is a community thread, not a shop window,
 *  and a price there is a deal someone found ("PSA: Porter 46 $99"), so it is
 *  never read as a seller's post. */
const SELLER_POST = /\bprices?\s*[:=–-]|\bprices? (start|from)\b|\bavailable (to|for) (order|purchase|pre-?order|sale)\b|\b(dm|inbox|message|whatsapp|call|text)( me| us)? (to|for) (order|orders|ordering|purchase|buy|price|prices|pricing|enquir\w*|inquir\w*|details)\b|\bdm to pur|\bto order\b|\border (now|yours|today|here)\b|\bplace your orders?\b|\bpre-?orders?\b|\bfor sale\b|\bwholesale\b|\bwhats ?app\b|\bfree (delivery|shipping)\b|\b(nationwide|worldwide|countrywide|same day) (delivery|shipping)\b|\bdelivery (available|nationwide|worldwide)\b|\bin stock\b|\bgive-?aways?\b|\bshop (is )?(now )?(open|live)\b|\b(shop|store|link) (is )?(in|on) (my |our |the )?(bio|profile)\b|\blink in (my |our |the )?(bio|profile)\b|\betsy\b|#(bags?forsale|smallbusiness|shopsmall|onlineshop|onlinestore|bagvendor|bagseller|forsale|bagsforsale)\b|#handmadebagsin[a-z]+\b/i

/** An account name that is a shop's: "SLIPPERS/SHOES/BAGS IN IBADAN.",
 *  "Ranuja Bags House", "… Enterprises". */
const SELLER_ACCOUNT = /\b(shop|store|boutique|vendor|wholesale|enterprises?|ventures)\b|\bbags? in [a-z]+|\bbags? (house|hub|plug|empire|world)\b/i

const COMMUNITY = (platform: string | null | undefined): boolean => (platform ?? '').toLowerCase() === 'reddit'

const videoWords = (v: QuoteVideo): string => `${v.caption ?? ''} ${(v.hashtags ?? []).map((h) => `#${h}`).join(' ')}`

/** Is this video a seller's sale post? */
export function isSellerPost(v: QuoteVideo): boolean {
  if (COMMUNITY(v.platform)) return false
  return SELLER_POST.test(videoWords(v)) || SELLER_ACCOUNT.test(v.accountName ?? '')
}

// ---- 5. Makers -------------------------------------------------------------------------

/** A maker's post, in words the segments_v1 rule does not carry (and must not:
 *  it is counted, and frozen). Read for quotes only: "handmade", "I made
 *  this", a knitting account ("örgü"), a custom-order studio. Not on Reddit,
 *  where the poster is usually a buyer asking about a handmade bag. */
const MAKER_POST = /\bhand ?-?made\b|handmade|\bhand ?-?crafted\b|handcrafted|\bi made (this|these|it|my|a|an|some)\b|\bhow i made\b|\bmade (this|these|it) (from|out of|with|using)\b|\bwhat i made\b|\bmy (small )?(business|atelier|studio)\b|örgü|\borgu\b|tejid[oa]s?\b|artesan[ai]|\bcustom (orders?|made|bags?)\b|\bcommissions? (open|available)\b|\bupcycl\w* (project|by me|diy)\b|\bmaking (a|this|my) bag\b|\bi (make|sew|craft|crochet|knit) (bags?|leather\w*|\w*craft\w*|handbags?|totes?|purses?|wallets?)\b/i

/** Is this video a maker's? Its stored segment first; where that was not read,
 *  the v1 rule inline; then, for a tenant with the maker rule, the wider words. */
export function isMakerPost(v: QuoteVideo, makerRule: boolean): boolean {
  if (v.segment === 'maker') return true
  if (!makerRule) return false
  if (v.segment == null && makerWordIn(makerHaystack(v)) != null) return true
  if (COMMUNITY(v.platform)) return false
  return MAKER_POST.test(`${videoWords(v)} ${(v.topics ?? []).join(' · ')} ${v.accountName ?? ''}`)
}

/** A line to the maker, not about the thing: "bless your hands", "you're so
 *  talented", "how do you make it", "tutorial please". */
const MAKER_PRAISE = /\bbless (your|ur) hands\b|\bellerinize sağlık|\beline sağlık|\bemeğine sağlık|\bellerine sağlık|\b(you('re| are)|ur|so) (so )?talented\b|\b(love|amazing|beautiful|great|nice|incredible|awesome|lovely|gorgeous) (your|ur) (work|craft|craftsmanship|talent|skills?|creativity|creation)\b|\b(your|ur) (work|craft|craftsmanship|talent|skills?|creativity) (is|are)\b|\byou made (this|it|these|that)\b|\bdid you make\b|\bhow (did|do|can) (you|i) make\b|\bhow to make\b|\btutorial\b|\bpattern (please|pls|link)\b|\bwhere (is|can i (get|find)) the pattern\b|\bhow do you do (it|this|that)\b|\bwhat (material|fabric|machine|thread)s? (did|do) you use\b|\bsewing machine\b|\bteach me\b/i

export const readsAsMakerPraise = (...texts: (string | null | undefined)[]): boolean =>
  texts.some((t) => t != null && MAKER_PRAISE.test(t))

// ---- 6. Brands -------------------------------------------------------------------------

/** Bag brands a comment may be about, beyond the tenant's tracked rivals: the
 *  brands the category's threads name most (Reddit's r/onebag, r/ManyBaggers;
 *  YouTube reviews). A post BY one of them is that brand's own post. */
export const KNOWN_BAG_BRANDS: readonly string[] = [
  'Patagonia', 'The North Face', 'Cotopaxi', 'Freitag', 'Rareform',
  'Osprey', 'Bellroy', 'Peak Design', 'Aer', 'Tom Bihn', 'Fjallraven', 'Herschel', 'Samsonite', 'Away', 'Monos',
  'Beis', 'Longchamp', 'Eastpak', 'JanSport', 'Nomatic', 'Tortuga', 'Think Tank', 'Wotancraft', 'Gregory', 'Deuter',
  'Mystery Ranch', 'Topo Designs', 'Db Journey', 'Timbuk2', 'Chrome Industries', 'Mission Workshop', 'Evergoods',
  'Able Carry', 'Alpaka', 'Bagsmart', 'CabinZero', 'Tumi', 'Rimowa', 'Briggs & Riley', 'Travelpro', 'Delsey',
  'Kipling', 'Pacsafe', 'Stubble & Co', 'Matein', 'Kavu', 'Baggu', 'Lululemon', "Arc'teryx", 'Ronning',
  'Cole Buxton', 'Coach', 'Poler',
]

/** Brand names that are also everyday words ("gave it away", "a coach"): a
 *  post BY them is still theirs, but a comment using the word names nobody. */
const DICTIONARY_BRANDS = new Set(['away', 'coach'])

/** The ways a brand is written: its name with or without spaces, and the
 *  handful of tracked names people shorten. */
const BRAND_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'the north face': ['north face', 'tnf', 'northface'],
  'freedom of movement': ['fom', 'fombrand'],
  'freitag': ['frtg', 'フライターグ'],
  'cotopaxi': ['코토팍시', 'allpa'],
  'patagonia': ['patagucci', 'black hole'],
  'think tank': ['tt bag', 'tt bags'],
  'fjallraven': ['fjällräven', 'kanken', 'kånken'],
  'cabinzero': ['cabin zero'],
  'osprey': ['porter 46', 'daylite'],
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function brandPattern(name: string): RegExp {
  const key = name.trim().toLowerCase()
  const forms = [key, key.replace(/\s+/g, ''), key.replace(/^the\s+/, ''), ...(BRAND_ALIASES[key] ?? []), ...(BRAND_ALIASES[key.replace(/^the\s+/, '')] ?? [])]
  const alts = [...new Set(forms.filter(Boolean))].map((f) => escapeRe(f).replace(/\\?\s+/g, '\\s*'))
  // Word-bounded on the Latin side; a CJK alias carries no word boundary.
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'iu')
}

const PATTERNS = new Map<string, RegExp>()
const patternFor = (name: string): RegExp => {
  const key = name.trim().toLowerCase()
  let p = PATTERNS.get(key)
  if (!p) PATTERNS.set(key, (p = brandPattern(name)))
  return p
}

/** Does the text name this brand? */
export const namesBrand = (name: string, ...texts: (string | null | undefined)[]): boolean =>
  texts.some((t) => t != null && patternFor(name).test(t))

const sameBrand = (a: string | null | undefined, b: string | null | undefined): boolean =>
  fold(a ?? '') !== '' && fold(a ?? '') === fold(b ?? '')

/** An account suffix a brand's own channel carries ("Think Tank Photo",
 *  "freitagjapan", "cotopaxiofficial"). */
const BRAND_ACCOUNT_SUFFIX = /^(official|photo|bags?|gear|store|shop|co|hq|global|usa|us|uk|eu|europe|japan|jp|korea|kr|lab|brand|packs?|travel|outdoor|outdoors)?$/

/** Is this account a brand's own (a known bag brand, or a tracked one)? */
export function brandOfAccount(account: string | null | undefined, extra: readonly string[] = []): string | null {
  const key = fold(account ?? '')
  if (!key) return null
  for (const b of [...extra, ...KNOWN_BAG_BRANDS]) {
    const bk = fold(b)
    if (bk.length < 3 || !key.startsWith(bk)) continue
    if (BRAND_ACCOUNT_SUFFIX.test(key.slice(bk.length))) return b
  }
  return null
}

/** The known brands a text names, other than `except`. */
function otherBrandsNamed(texts: readonly string[], except: string): string[] {
  const out: string[] = []
  for (const b of KNOWN_BAG_BRANDS) {
    if (sameBrand(b, except) || fold(b).length < 3 || DICTIONARY_BRANDS.has(fold(b))) continue
    if (namesBrand(b, ...texts)) out.push(b)
  }
  return out
}

// ---- 7. On the market: carry goods -------------------------------------------------

/** Bag words that are not a bag anyone carries. Removed before the test. */
const NOT_A_CARRY_BAG = /\b(trash|garbage|bin|rubbish|plastic|paper|grocery|zip-?lock|ziploc|tea|sleeping|body|punching|bean|air|sand|money|goody|grab|mixed|dirt|douche|scum|sad)[ -]?bags?\b|\bbags? (of|under)\b|\bin the bag\b|\bbag lad(y|ies)\b|\bbackpacking\b/gi

/** The carry goods Sealand's market is: bags, luggage, backpacks and the
 *  things that carry with them. Word-bounded, on English. */
const CARRY_WORD = /\b(bags?|baggage|backpacks?|back ?packs?|rucksacks?|knapsacks?|day ?packs?|packs?|packing|packed|duffels?|duffles?|totes?|totepacks?|purses?|handbags?|clutch(es)?|wallets?|pouch(es)?|slings?|cross-?body|fanny ?packs?|bum ?bags?|belt ?bags?|hip ?packs?|waist ?bags?|messenger|satchels?|briefcases?|luggage|suitcases?|carry-?ons?|carryon|personal items?|roller ?bags?|trolley|packing cubes?|organi[sz]ers?|laptop sleeves?|straps?|zippers?|zips?|pockets?|compartments?|hip ?belts?|sternum|lit(er|re)s?|\d+ ?l|one ?bag|keychains?|key ?holders?|carry|carrying|carried|shopper)\b/i

/** Hashtags run words together ("#bagtok", "#totebagaesthetic"). */
const CARRY_TAG = /(bags?|backpack|luggage|purse|tote|wallet|suitcase|carryon|onebag|handbag|daypack|duffel|duffle|rucksack|crossbody|fannypack|beltbag|pouch)/i
const NOT_A_CARRY_TAG = /(garbage|cabbage|bagel|baguette|baggy|bagpipe|sleepingbag|teabag|trashbag|punchingbag|beanbag|backpacking)/i

/** A product outside the market, named where no carry good is. */
const OFF_MARKET = /\b(food|foods|canned|cans|sardines?|tuna|curry|rice|coffee|beer|wine|snacks?|recipes?|meals?|eat|eating|tastes?|delicious|provisions|skirts?|dress|dresses|shirts?|t-?shirts?|blouses?|jackets?|coats?|parkas?|pants|trousers|jeans|shorts|leggings|sweaters?|hoodies?|fleeces?|shoes?|sneakers?|boots|sandals?|flip-?flops?|slippers?|chappals?|socks?|underwear|bras?|hats?|beanies?|garters?|suspenders?|outfits?|ootd|merino|ipads?|tablets?|iphones?|phones?|e-?sims?|sim cards?|data plans?|hotspot|printers?|headphones?|earbuds?|airpods?|chargers?|kindles?|tents?|stoves?|knives|knife|military|army|soldiers?|navy|president|trump|election|lawsuit|sues?|sued|poker|movie|episode|thrift\w*|goodwill|laundry|clothes|clothing|wash|washing|washed|dryer|tsa)\b/i

/** Idioms that name a product and mean something else ("the straight jacket
 *  feature" of a harness). Taken off before the off-market test. */
const NOT_A_PRODUCT = /\bstra(igh)?t ?-?jackets?\b/gi

/** A pointer at the thing shown: "it", "this", "that one". */
const POINTS_AT_IT = /\b(it|its|it's|this|that|these|those|them|one|ones)\b/i

const carryText = (s: string): string => s.replace(NOT_A_CARRY_BAG, ' ')

/** Does the text name a carry good? */
export const namesCarryGood = (text: string): boolean => CARRY_WORD.test(carryText(text))

/** Is the video about a carry good (its caption, hashtags or topics)? */
export function isCarryVideo(v: QuoteVideo): boolean {
  if (CARRY_WORD.test(carryText(`${v.caption ?? ''} ${(v.topics ?? []).join(' · ')}`))) return true
  return (v.hashtags ?? []).some((h) => CARRY_TAG.test(h) && !NOT_A_CARRY_TAG.test(h))
}

// ---- 8. Relevance ------------------------------------------------------------------------

/** What a claim can be about, and the words that speak to it. A claim takes a
 *  concept where `claim` matches; a quote speaks to it where `quote` does. */
const CONCEPTS: readonly { claim: RegExp; quote: RegExp }[] = [
  { // durability
    claim: /\bdurab|\blast(s|ed|ing)?\b|\blong-?lasting|\btough|\bwithstand|\bsturd|\bquality|\blongevity|\bwear\b|\bbuy it for life/i,
    quote: /\bdurab\w*|\blast(s|ed|ing)?\b|\blong-?lasting\b|\byears?\b|\bsturd\w*|\btough\w*|\brugged\b|\bhold(s|ing)? up\b|\bheld up\b|\bwear(s|ing)?\b|\bworn\b|\btears?\b|\btorn\b|\brip(s|ped)?\b|\bbroke\b|\bbroken\b|\bbreak(s|ing)?\b|\bfray\w*|\bquality\b|\bwell[- ]made\b|\bwithstand\w*|\bdelaminat\w*|\bfell apart\b|\bfalling apart\b|\bstill going\b|\bfor life\b|\bbifl\b/i,
  },
  { // price
    claim: /\bpric|\bcost|\bexpensive|\bcheap|\bafford|\bvalue\b|\bmoney\b|\bsale\b|\bdiscount|\bdeal\b|\bbudget/i,
    quote: /\bpric\w*|\bcosts?\b|\bcosted\b|\bexpensive\b|\bcheap\w*|\bafford\w*|\bworth\b|\bvalue\b|\bmoney\b|\bbudget\b|\bsale\b|\bdiscount\w*|\bdeals?\b|[$€£₹]\s?\d|\b\d+\s?(dollars|bucks|euros?|usd|eur|rands?|zar)\b|\bhow much\b|\boverpriced\b|\bpaid\b|\bpay\b/i,
  },
  { // buying and ordering
    claim: /\bbuy|\bbought|\bpurchas|\border|\bshop\b|\bshopping|\bcheckout|\bavailab|\bstock\b|\bintent to\b/i,
    quote: /\bbuy(ing)?\b|\bbought\b|\bpurchas\w*|\border(ed|ing|s)?\b|\bcheckout\b|\bcart\b|\b(in|out of) stock\b|\brestock\w*|\bsold out\b|\bavailab\w*|\bwhere (can|do|did|to|could) (i|you|we|one) (get|buy|find|order|purchase)\b|\blink\b|\bwebsite\b|\bin store\b|\bpre-?order\w*|\bcop(ped)?\b|\b(decided|going|want|need|have) to (get|buy|order)\b/i,
  },
  { // shipping and delivery
    claim: /\bship|\bdeliver|\barriv|\bpostage|\bcustoms/i,
    quote: /\bship(s|ped|ping)?\b|\bdeliver\w*|\barriv\w*|\bpostage\b|\bcustoms\b|\bdispatch\w*|\btracking\b|\bsend (it )?to\b|\binternational\w*/i,
  },
  { // looks and style
    claim: /\blook|\bstyl|\baesthet|\bbeaut|\bfashion|\bcolou?r|\bdesign|\bpretty/i,
    quote: /\blooks?\b|\blooking\b|\bstyl\w*|\baesthetic\w*|\bbeaut\w*|\bpretty\b|\bgorgeous\b|\bcute\b|\bfashion\w*|\bcolou?rs?\b|\bcolou?rway\w*|\bdesign\w*|\bchic\b|\bsleek\b|\bugly\b|\belegant\b|\bvibe\b|\bblack\b|\bpink\b|\bnavy\b|\bgreen\b|\bbrown\b|\bwhite\b|\bgr[ae]y\b|\bblue\b|\bred\b|\bshade\b|\bpattern\w*|\bprint\b/i,
  },
  { // comfort and carry
    claim: /\bcomfort|\bstrap|\bcarry\b|\bweight|\bergonom|\bshoulder|\bstructure/i,
    quote: /\bcomfort\w*|\buncomfort\w*|\bstraps?\b|\bshoulders?\b|\bback\b|\bhips?\b|\bweigh\w*|\bheavy\b|\blight(weight)?\b|\bpadd\w*|\bergonom\w*|\bdigs?\b|\bsweat\w*|\bhurts?\b|\bpain\b|\bharness\b|\bhip ?belt\b|\bsternum\b|\bcarry\w*|\bfits?\b|\bstructure\w*/i,
  },
  { // waterproofing
    claim: /\bwater|\brain\b|\bwet\b|\bdry\b|\bweather/i,
    quote: /\bwaterproof\w*|\bwater\b|\brain\w*|\bwet\b|\bdry\b|\bresistant\b|\bweather\w*|\bstorm\b|\bsoak\w*|\bleak\w*|\bsplash\w*|\bdwr\b/i,
  },
  { // repair and warranty
    claim: /\brepair|\bwarrant|\bfix|\bguarantee|\breplace/i,
    quote: /\brepair\w*|\bwarrant\w*|\bfix(ed|ing)?\b|\bguarantee\w*|\breplac\w*|\bbroke\b|\bbroken\b|\bseams?\b|\bzip(per)?s?\b|\bstitch\w*|\bmend\w*|\breturn(ed)?\b/i,
  },
  { // community and purpose
    claim: /\bcommunit|\bpurpose|\bmission|\bcause|\bclean-?up|\bocean|\bwildlife|\bsustainab|\bethic|\benvironment|\bupcycl|\brecycl|\bsecondhand|\bplanet/i,
    quote: /\bcommunit\w*|\bmission\b|\bpurpose\b|\bcause\b|\bclean-?ups?\b|\bbeach\w*|\bocean\w*|\bplastic\b|\brecycl\w*|\bupcycl\w*|\bsustainab\w*|\bethic\w*|\benvironment\w*|\bplanet\b|\bwildlife\b|\bb ?corp\b|\bcharit\w*|\bgive back\b|\bdonat\w*|\bwaste\b|\bsecond-?hand\b|\breuse\w*|\bmaterials?\b/i,
  },
  { // organisation
    claim: /\borgani[sz]|\bfeature|\bpocket|\bcompartment|\blayout/i,
    quote: /\borgani[sz]\w*|\bpockets?\b|\bcompartments?\b|\bdividers?\b|\bsleeves?\b|\bpouch\w*|\blayout\b|\bsections?\b|\baccess\w*|\bfeatures?\b|\bpanel\b|\bclamshell\b|\bbottle\b|\bkeys?\b|\blaptop\b/i,
  },
  { // size and measurement
    claim: /\bsize|\bsizing|\bmeasure|\bdimension|\bcapacity|\bfit\b|\bairline|\bcarry-?on|\bpersonal item/i,
    quote: /\bsizes?\b|\bsizing\b|\bsizer\b|\bmeasur\w*|\bdimensions?\b|\binch(es)?\b|\bcm\b|\blit(er|re)s?\b|\b\d+ ?l\b|\bcapacity\b|\bbig(ger)?\b|\bsmall(er)?\b|\blarge\b|\btall\b|\bfits?\b|\bfitting\b|\bcarry-?on\b|\boverhead\b|\bpersonal item\b|\bunder ?seat\b|\bx\s?\d+\b/i,
  },
  { // packing and travel
    claim: /\bpack|\btravel|\btrip|\bairline|\bflight|\bluggage/i,
    quote: /\bpack(s|ed|ing)?\b|\bcubes?\b|\bluggage\b|\btrips?\b|\btravel\w*|\bflights?\b|\bfly(ing)?\b|\bairlines?\b|\bryanair\b|\bcarry-?on\b|\bsuitcase\b|\bweekend\w*|\bvacation\b|\bholiday\b/i,
  },
  { // recommendations and comparison
    claim: /\brecommend|\bsuggest|\bcompar|\balternativ|\bversus\b|\bmodel\b|\bwhich\b/i,
    quote: /\brecommend\w*|\bsuggest\w*|\balternativ\w*|\bcompar\w*|\bvs\.?\b|\bversus\b|\bbetter\b|\binstead\b|\bwhich (one|bag|brand|pack)\b|\bwhat (bag|brand|backpack|model)\b|\blook(ing)? at\b|\bconsider\w*|\bcheck out\b|\bmodel\b/i,
  },
  { // product details and questions
    claim: /\bdetail|\bcurio|\bquestion|\bhow it works|\bfeatured/i,
    quote: /\?|\bwhat (is|size|brand|bag|kind|colou?r|material)\b|\bwhere (is|did|can)\b|\bhow (much|big|does|do|is)\b|\bmaterials?\b|\bfabric\b|\bmade of\b|\bdetails?\b/i,
  },
]

/** Words a claim uses about itself that say nothing about what it claims. */
const CLAIM_FILLER = new Set([
  'comments', 'comment', 'about', 'products', 'product', 'their', 'there', 'people', 'feels', 'feel', 'matter', 'matters',
  'questions', 'question', 'curiosity', 'seeking', 'praise', 'intent', 'ready', 'specific', 'with', 'from', 'into', 'over',
  'depends', 'some', 'turns', 'away', 'bags', 'bag', 'brand', 'brands', 'category', 'against', 'where', 'versus', 'stands',
  'content', 'differs', 'shoppers', 'shopper', 'appeal', 'appealing', 'excluding', 'such', 'whether', 'owners', 'what',
  'which', 'that', 'this', 'these', 'those', 'they', 'them', 'and', 'the', 'for', 'more', 'less', 'much', 'many', 'most',
  'status', 'featured', 'choices', 'achievable', 'rewarding', 'proof', 'rules', 'confusion', 'trust', 'love', 'things',
])

/** A crude stem: plural, -ing, -ed, -ly, -ment, -ation off; doubled end
 *  consonant folded ("shipping" → "ship"); the first five letters kept. */
export function stem(word: string): string {
  let w = word.toLowerCase()
  for (const s of ['ations', 'ation', 'ments', 'ment', 'ingly', 'ing', 'ies', 'ied', 'es', 'ed', 'ly', 's']) {
    if (w.length - s.length >= 4 && w.endsWith(s)) { w = w.slice(0, -s.length); break }
  }
  if (/([b-df-hj-np-tv-z])\1$/.test(w)) w = w.slice(0, -1)
  return w.slice(0, 5)
}

const contentStems = (text: string): Set<string> =>
  new Set((text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !CLAIM_FILLER.has(w)).map(stem))

/** The claim's own words, with any "excluding …" clause taken off (a subject's
 *  description names what it is NOT, and those words must not count). */
const claimBody = (claim: string): string => claim.split(/\bexcluding\b/i)[0]

/** How a claim reads: the concepts it takes and its own content stems. */
export interface ClaimReading { concepts: number[]; stems: Set<string> }

export function readClaim(claim: string | null | undefined): ClaimReading {
  const body = claimBody(claim ?? '')
  const concepts: number[] = []
  CONCEPTS.forEach((c, i) => { if (c.claim.test(body)) concepts.push(i) })
  return { concepts, stems: contentStems(body) }
}

/** How well a quote speaks to a claim: one per concept it answers, one per
 *  content stem it shares. Zero is "says nothing the claim is about". */
export function relevanceTo(claim: ClaimReading, english: string): number {
  let r = 0
  for (const i of claim.concepts) if (CONCEPTS[i].quote.test(english)) r++
  if (claim.stems.size > 0) {
    const own = contentStems(english)
    for (const s of claim.stems) if (own.has(s)) r++
  }
  return r
}

const claimHasWords = (c: ClaimReading): boolean => c.concepts.length > 0 || c.stems.size > 0

// ---- The gate ------------------------------------------------------------------------------

/** The thread a quote sits in: the platform and the video's own id. */
export const threadOf = (v: QuoteVideo | null | undefined): string | null =>
  v?.videoId ? `${(v.platform ?? '').toLowerCase()}::${v.videoId}` : null

/**
 * May this quote print in this block, and how well does it fit?
 *
 * The score orders what passes: speaking to the claim first, then naming the
 * carry good, then a card-length English original. The caller's own order
 * breaks ties (`pickEligible` sorts stably).
 */
export function quoteGate(q: GateInput, o: GateOptions = {}): GateVerdict {
  const english = readableEnglish(q)
  if (!english) return { ok: false, reason: 'unreadable' }
  if (!hasSubstance(english)) return { ok: false, reason: 'too_short' }
  if (BOT.test(q.text) || BOT.test(english)) return { ok: false, reason: 'bot' }
  if (readsAsSaleAd(q.text) || readsAsSaleAd(english)) return { ok: false, reason: 'sale_ad' }
  if (readsAsMakerPraise(q.text, english)) return { ok: false, reason: 'maker_praise' }

  const v = q.video
  if (v === null) return { ok: false, reason: 'no_video' }
  const makerRule = o.makerRule ?? o.market != null
  if (v) {
    if (isMakerPost(v, makerRule)) return { ok: false, reason: 'maker_video' }
    if (isSellerPost(v)) return { ok: false, reason: 'seller_post' }
  }

  // The right brand.
  const words = [q.text, english]
  if (o.brand) {
    const filed = v ? v.isCompetitor === true && sameBrand(v.competitorName, o.brand) : false
    const named = namesBrand(o.brand, ...words)
    if (!filed && !named) return { ok: false, reason: 'wrong_brand' }
    if (!named && otherBrandsNamed(words, o.brand).length > 0) return { ok: false, reason: 'wrong_brand' }
  } else if (v) {
    if (v.isClient === true && !o.allowOwn) return { ok: false, reason: 'own_post' }
    if (v.source === 'competitor_owned' || (v.isClient !== true && brandOfAccount(v.accountName) != null)) {
      return { ok: false, reason: 'brand_post' }
    }
  }

  // On the market.
  const claim = readClaim(o.claim)
  const relevance = o.claim ? relevanceTo(claim, english) : 0
  const carry = o.market === 'carry' ? namesCarryGood(english) : false
  if (o.market === 'carry' && !carry) {
    const aboutIt = v ? isCarryVideo(v) : false
    if (!aboutIt || OFF_MARKET.test(english.replace(NOT_A_PRODUCT, ' ')) || !(POINTS_AT_IT.test(english) || relevance > 0)) {
      return { ok: false, reason: 'off_topic' }
    }
  }

  if (o.requireRelevance && claimHasWords(claim) && relevance === 0) return { ok: false, reason: 'not_relevant' }

  const len = english.length
  const score = relevance * 4 + (carry ? 2 : 0) + (len >= 30 && len <= 220 ? 1 : 0) + (english === q.text.replace(/\s+/g, ' ').trim() ? 1 : 0)
  return { ok: true, score, relevance, thread: threadOf(v) }
}

/**
 * A block's quotes: the candidates that pass, best first (the caller's order
 * breaking ties), at most one per thread and one per wording, at most `n`.
 *
 * `used` carries wordings across blocks on one page where the caller wants no
 * voice printed twice. Fewer than `n` come back when fewer pass: a block that
 * runs out prints what it has.
 */
export function pickEligible<T>(
  items: readonly T[],
  view: (item: T) => GateInput,
  n: number,
  o: GateOptions = {},
): T[] {
  const judged: { item: T; score: number; thread: string | null; key: string; at: number }[] = []
  items.forEach((item, at) => {
    const g = view(item)
    const verdict = quoteGate(g, o)
    if (!verdict.ok) return
    judged.push({ item, score: verdict.score, thread: verdict.thread, key: fold(g.text), at })
  })
  judged.sort((a, b) => b.score - a.score || a.at - b.at)
  const perThread = o.perThread ?? 1
  const threads = new Map<string, number>()
  const seen = new Set<string>()
  const out: T[] = []
  for (const j of judged) {
    if (out.length >= n) break
    if (!j.key || seen.has(j.key) || o.used?.has(j.key)) continue
    if (j.thread) {
      const t = threads.get(j.thread) ?? 0
      if (t >= perThread) continue
      threads.set(j.thread, t + 1)
    }
    seen.add(j.key)
    out.push(j.item)
  }
  for (const k of seen) o.used?.add(k)
  return out
}

/** Why a quote failed, or null where it passes: for tests and operator tools. */
export function whyNot(q: GateInput, o: GateOptions = {}): GateReason | null {
  const v = quoteGate(q, o)
  return v.ok ? null : v.reason
}
