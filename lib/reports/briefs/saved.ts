import { z } from 'zod'

import { alsoOnlyPrinted } from './build'
import { footnotesOnlyPrinted, type QuoteWordsOf } from './compose'
import { planDeck } from './deck'
import { hydrateBrief, inShortStillHolds } from './inshort'
import { briefPrints, briefSnapshotRow } from './store'
import type { AllocatedIdea, BriefRole, MonthlyBriefData } from './types'
import { BRIEF_NAME, BRIEF_ROLES } from './types'

// A DRY BUILD, SAVED TO BE STORED AS IT IS (scripts/monthly-briefs.ts
// `--write --from <dir>`). `--write` calls the models again, so its words
// differ from the dry build Heinrich read; `--from` stores the dry build's
// own briefs, with no model call. The dry build saves, beside each brief's
// `<role>.json` (`{ data, texts }`: the brief, quotes as refs, and the words
// each ref resolves to, kept local), one `set.json`: whose briefs they are,
// the run they are stored under, when they were read, what the set cost and
// each role's ledger fields (ready or thin, its share of the cost, its
// evidence ids), the pages the deck drew, the In short check's record and
// the month's ideas.
//
// NOTHING IS STORED UNLESS EVERY CHECK PASSES (`checkSavedSet`, then the
// script's draw): each saved brief parses against the stored-brief shape of
// this code (`savedBriefSchema`, held equal to the type at compile time),
// belongs to the client and month named, has the status, evidence ids and
// pages the dry build recorded under the current deck, keeps In short to what
// its pages print (inshort.ts `inShortStillHolds`), names only what the other
// briefs print, and draws with no clipping. `texts` is never stored: a stored
// brief holds refs, and its words resolve at render (AGENTS.md: exports and
// reports freeze numbers, never words).

export const SAVED_SET_FILE = 'set.json'

const role = z.enum(['sales', 'marketing', 'content', 'leadership'])
const about = z.union([z.literal('client'), z.literal('market'), z.templateLiteral(['rival:', z.string()])])
const aboutPart = z.strictObject({ about, videos: z.number() })
const quote = z.strictObject({
  ref: z.string().min(1), text: z.literal(''), date: z.string().nullable(), platform: z.string().nullable(), about, ownPost: z.boolean(), lang: z.string().nullable(),
})
const measure = z.strictObject({
  pct: z.number().optional(), median: z.number().nullable().optional(), above: z.boolean().optional(),
  own: z.number().nullable().optional(), ownOf: z.number().nullable().optional(), rival: z.number().nullable().optional(), rivalOf: z.number().nullable().optional(),
  comments: z.number().optional(), videos: z.number().optional(),
})
const item = z.strictObject({
  title: z.string().optional(), text: z.string(), detail: z.string().optional(), tag: z.string().optional(),
  named: z.union([z.strictObject({ brief: role, idea: z.string() }), z.strictObject({ brief: role, item: z.string() })]).optional(),
  videos: z.number().optional(), who: z.array(aboutPart).optional(), basedOn: z.array(z.string()).optional(), videoIds: z.array(z.string()).optional(),
  measure: measure.optional(), pill: z.string().optional(), muted: z.boolean().optional(),
  persona: z.strictObject({ want: z.string().optional(), stops: z.string().optional(), moves: z.string().optional(), forSale: z.string().optional() }).optional(),
  status: z.enum(['heard_back', 'not_echoed', 'heard_as_values', 'tested', 'confused']).optional(),
  you: z.boolean().optional(), quote: quote.nullable().optional(),
  href: z.string().optional(), slot: z.literal('week_read').optional(),
})
const shareBar = z.strictObject({ client: z.number(), rivals: z.number(), rest: z.number(), line: z.string() })
// The October canvas's parts (types.ts), field for field.
const level = z.strictObject({ k: z.number(), n: z.number() })
const verdict = z.strictObject({ state: z.enum(['moved', 'no_clear_change', 'too_little_data', 'baseline_forming']), change: z.number().nullable(), band: z.number().nullable() })
const people = z.strictObject({
  month: z.string(), market: z.number(),
  groups: z.array(z.strictObject({
    key: z.string(), name: z.string(), oneLiner: z.string(), wants: z.string(), stops: z.string(), tips: z.string(), videos: z.number(),
    top: z.strictObject({ id: z.string(), label: z.string(), k: z.number(), href: z.string() }).nullable(),
    products: z.array(z.strictObject({ name: z.string(), k: z.number(), href: z.string() })).nullable(),
    href: z.string(),
  })),
  rest: z.array(z.strictObject({ name: z.string(), videos: z.number(), href: z.string() })).optional(),
})
const moves = z.strictObject({
  month: z.string(),
  waiting: z.array(z.strictObject({
    lineageId: z.string(), title: z.string(), firstMade: z.string(),
    aim: z.strictObject({ label: z.string(), k: z.number().nullable(), n: z.number().nullable(), href: z.string().nullable() }).nullable(),
    href: z.string(),
  })),
  waitingCount: z.number(),
  moves: z.array(z.strictObject({
    id: z.string(), title: z.string(), kind: z.enum(['subject', 'theme', 'advice']), status: z.string(), day: z.string(),
    label: z.string().nullable(), labelHref: z.string().nullable(),
    slots: z.array(z.strictObject({ month: z.string(), k: z.number().nullable(), n: z.number().nullable(), soFar: z.boolean(), why: z.enum(['pending', 'cut', 'unread', 'move', 'unknown']).nullable() })),
    sentence: z.string(), verdict: verdict.nullable(), axis: z.string().nullable(), href: z.string(),
  })),
  record: z.strictObject({ total: z.number(), decided: z.number(), since: z.string().nullable(), href: z.string() }),
  href: z.string(),
})
const products = z.strictObject({
  month: z.string(), cameUp: z.number(), products: z.number(), videos: z.number().nullable(), market: z.number().nullable(),
  categories: z.array(z.strictObject({
    id: z.string(), name: z.string(), videos: z.number(), named: z.number(),
    products: z.array(z.strictObject({ name: z.string(), videos: z.number(), first: z.boolean(), href: z.string() })), href: z.string(),
  })),
  standouts: z.array(z.strictObject({ kind: z.enum(['first', 'gap', 'general', 'praised', 'focus']), label: z.string(), name: z.string(), text: z.string(), href: z.string() })),
  href: z.string(),
})
const named = z.strictObject({
  month: z.string(), base: z.number(),
  rows: z.array(z.strictObject({
    label: z.string(), you: z.boolean(), named: level, verdict: verdict.nullable(), praised: level.nullable(), complained: level.nullable(),
    top: z.strictObject({ label: z.string(), k: z.number(), n: z.number() }).nullable(), href: z.string(),
  })),
  notNamed: z.array(z.string()), href: z.string(),
})
const recipe = z.strictObject({ label: z.string(), multiple: z.number().nullable() })
const ideas = z.strictObject({
  month: z.string(), read: z.strictObject({ from: z.string(), to: z.string(), label: z.string() }), since: z.string(), medical: z.boolean(),
  ideas: z.array(z.strictObject({
    id: z.string(), rank: z.number(), title: z.string(), read: level.nullable(), month: level.nullable(), groups: z.array(z.string()),
    own: z.strictObject({ state: z.enum(['touched', 'none', 'no_posts', 'unread']), touched: z.number(), posts: z.number(), since: z.string() }),
    asks: z.array(z.strictObject({ label: z.string(), videos: z.number() })), asksOf: z.number().nullable(),
    format: recipe.nullable(), opening: recipe.nullable(), href: z.string(),
  })),
  asked: z.array(z.strictObject({ label: z.string(), videos: z.number(), href: z.string() })),
  replies: z.string(), href: z.string(),
})
const hookTable = z.strictObject({
  of: z.number(), ownOf: z.number().nullable(), rivalOf: z.number().nullable(),
  rows: z.array(z.strictObject({ label: z.string(), share: z.number(), own: z.number().nullable(), rival: z.number().nullable(), multiple: z.number().nullable() })),
})
const hooks = z.strictObject({
  month: z.string(), rival: z.string().nullable(), formats: hookTable.nullable(), openings: hookTable.nullable(),
  posts: z.strictObject({
    total: z.number(), byPlatform: z.array(z.strictObject({ platform: z.string(), posts: z.number() })),
    response: z.strictObject({ multiple: z.number(), rated: z.number() }).nullable(), sentence: z.string().nullable(),
    best: z.strictObject({ platform: z.string(), date: z.string(), format: z.string().nullable(), multiple: z.number(), href: z.string() }).nullable(),
    href: z.string(),
  }).nullable(),
  basis: z.string(), href: z.string(),
})
const section = z.strictObject({
  key: z.enum([
    'sales.buyers', 'sales.deciders', 'sales.stops', 'sales.settle', 'sales.triggers', 'sales.rivals', 'sales.care',
    'marketing.believe', 'marketing.words', 'marketing.say_hear', 'marketing.recall', 'marketing.rivals',
    'content.questions', 'content.formats', 'content.watch', 'content.more', 'content.confusion', 'content.borrow',
    'leadership.market', 'leadership.shares', 'leadership.weigh', 'leadership.risks', 'leadership.decisions', 'leadership.holds',
    'sales.groups', 'marketing.products', 'marketing.named', 'content.ideas', 'content.hooks', 'leadership.subjects', 'leadership.groups', 'leadership.moves',
  ]),
  title: z.string(), lead: z.string().optional(),
  groups: z.array(z.strictObject({ label: z.string().optional(), items: z.array(item), lines: z.array(z.string()).optional(), base: z.string().optional() })),
  base: z.string().optional(), sub: z.string().optional(), lines: z.array(z.string()).optional(),
  quote: quote.nullable().optional(), voices: z.array(quote).optional(), note: z.string().optional(), also: z.string().optional(),
  chips: z.array(z.strictObject({ label: z.string(), words: z.array(z.string()) })).optional(),
  panel: z.strictObject({ title: z.string(), rows: z.array(item) }).optional(),
  kinds: z.strictObject({ base: z.string(), rows: z.array(z.strictObject({ label: z.string(), pct: z.number() })) }).optional(),
  mood: z.strictObject({ base: z.string(), rows: z.array(z.strictObject({ mood: z.string(), label: z.string(), pct: z.number() })) }).optional(),
  shares: z.strictObject({ comments: shareBar, videos: shareBar.nullable() }).optional(),
  posts: z.strictObject({ title: z.string(), rows: z.array(z.strictObject({ name: z.string(), you: z.boolean(), posts: z.number(), five: z.number(), pct: z.number() })) }).optional(),
  position: item.nullable().optional(),
  rival: z.string().optional(),
  link: z.strictObject({ href: z.string(), text: z.string() }).optional(), foot: z.string().optional(),
  people: people.optional(), moves: moves.optional(), products: products.optional(), named: named.optional(), ideas: ideas.optional(), hooks: hooks.optional(),
})
const finding = z.strictObject({
  ideaId: z.string(), headline: z.string(), basedOn: z.array(z.string()), saw: z.array(z.string()), means: z.string(), practice: z.array(z.string()),
  months: z.array(z.strictObject({ month: z.string(), videos: z.number() })), videos: z.number(), who: z.array(aboutPart), quotes: z.array(quote),
  short: z.string().optional(), subjectLine: z.string().optional(),
  heardFor: z.array(z.strictObject({ name: z.string(), you: z.boolean(), phrase: z.string() })).optional(),
})

/** A composed brief as this code builds it, and as a dry build saves it: the
 *  stored brief, with what it held and what it cost (the ledger's). */
export const savedBriefSchema = z.strictObject({
  version: z.literal(1), kind: z.literal('monthly_brief'), role, title: z.string(), company: z.string(), noun: z.string().nullable().optional(),
  month: z.string().regex(/^\d{4}-\d{2}-01$/), heardMonths: z.array(z.string()),
  inShort: z.strictObject({
    summary: z.string(),
    figures: z.array(z.strictObject({ value: z.string(), label: z.string() })),
    also: z.array(z.strictObject({ headline: z.string(), brief: role })),
  }),
  findings: z.array(finding), sections: z.array(section), fromApp: z.array(section).optional(),
  held: z.array(z.strictObject({ what: z.string(), reason: z.string() })),
  promptVersion: z.string(), model: z.string(), costUsd: z.number(),
})

// The schema IS the type: a field added to MonthlyBriefData (or taken from
// it) fails to compile here until the schema says the same.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const schemaIsTheType: Same<z.infer<typeof savedBriefSchema>, MonthlyBriefData> = true
void schemaIsTheType

const words = z.strictObject({ text: z.string(), english: z.string().nullable().optional(), lang: z.string().nullable().optional() })
/** A brief's file: the brief and its quotes' words (local only). */
export const savedFileSchema = z.strictObject({ data: savedBriefSchema, texts: z.record(z.string(), words) })
export type SavedFile = z.infer<typeof savedFileSchema>

const savedRole = z.strictObject({
  status: z.enum(['ready', 'thin']),
  file: z.string().regex(/^[a-z]+\.json$/),
  /** The ledger's `cost_usd`. */
  costUsd: z.number().nonnegative(),
  /** What the snapshot's `evidence_ids` are. */
  evidenceIds: z.array(z.string()),
  /** The deck's pages as the dry build drew them, by their header. */
  pages: z.array(z.string()),
  /** The In short check's record (build.ts `BriefSet.briefs[].printed`). */
  inShort: z.strictObject({ read: z.array(z.string()), kept: z.array(z.string()) }),
})
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
export const savedSetSchema = z.strictObject({
  kind: z.literal('monthly_brief_set'), version: z.literal(1),
  clientId: uuid, company: z.string(), month: z.string().regex(/^\d{4}-\d{2}-01$/),
  /** The run the briefs are stored under. */
  runId: uuid,
  /** When the dry build read the month: the snapshots' reading stamp. */
  asOf: z.string().refine((x) => !Number.isNaN(Date.parse(x)), 'not a time'),
  /** The set's spend, every model call. */
  costUsd: z.number().nonnegative(),
  /** The month's ideas and the brief each was homed in. */
  ideas: z.array(z.strictObject({ id: z.string(), headline: z.string(), home: role })),
  roles: z.strictObject({ sales: savedRole, marketing: savedRole, content: savedRole, leadership: savedRole }),
})
export type SavedSet = z.infer<typeof savedSetSchema>

/** The page headers a deck draws, in order ("Cover" for the cover). Pure. */
export const deckHeaders = (d: Parameters<typeof planDeck>[0]): string[] => planDeck(d).pages.map((p) => p.eyebrow || 'Cover')

/** The words a set of saved files resolves its refs to. */
const wordsOfFiles = (files: readonly SavedFile[]): QuoteWordsOf => {
  const all = new Map(files.flatMap((f) => Object.entries(f.texts)))
  return (ref) => {
    const w = all.get(ref)
    return w?.text ? { text: w.text, english: w.english ?? null, lang: w.lang ?? null } : null
  }
}

/**
 * What a dry build saves (pure): `set.json` and each role's file. Every role
 * is saved, a thin one too (its ledger row keeps what it held); `pages` is
 * the deck as drawn with the saved words.
 */
export function savedSetOf(a: {
  clientId: string; company: string; month: string; runId: string; asOf: string; costUsd: number
  costByRole: Readonly<Record<BriefRole, number>>
  ideas: readonly Pick<AllocatedIdea, 'id' | 'headline' | 'home'>[]
  briefs: readonly { data: MonthlyBriefData; texts: SavedFile['texts']; printed: { read: string[]; kept: string[] } }[]
}): { manifest: SavedSet; files: Record<BriefRole, SavedFile> } {
  const files = {} as Record<BriefRole, SavedFile>
  const roles = {} as SavedSet['roles']
  for (const r of BRIEF_ROLES) {
    const b = a.briefs.find((x) => x.data.role === r)
    if (!b) throw new Error(`the set has no ${BRIEF_NAME[r]}`)
    const prints = briefPrints(b.data)
    files[r] = { data: b.data, texts: prints ? b.texts : {} }
    roles[r] = {
      status: prints ? 'ready' : 'thin',
      file: `${r}.json`,
      costUsd: Math.round(a.costByRole[r] * 10_000) / 10_000,
      evidenceIds: prints ? briefSnapshotRow(b.data).evidenceIds : [],
      pages: prints ? deckHeaders(hydrateBrief(b.data, wordsOfFiles([files[r]]))) : [],
      inShort: b.printed,
    }
  }
  return {
    manifest: {
      kind: 'monthly_brief_set', version: 1, clientId: a.clientId, company: a.company, month: a.month, runId: a.runId, asOf: a.asOf,
      costUsd: Math.round(a.costUsd * 10_000) / 10_000,
      ideas: a.ideas.map((x) => ({ id: x.id, headline: x.headline, home: x.home })),
      roles,
    },
    files,
  }
}

const issues = (e: z.ZodError): string => e.issues.slice(0, 3).map((x) => `${x.path.join('.') || '(top)'}: ${x.message}`).join('; ')
const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && new Set(a).size === new Set([...a, ...b]).size

export interface CheckedSet {
  manifest: SavedSet
  briefs: MonthlyBriefData[]
  texts: Record<BriefRole, SavedFile['texts']>
  /** The ledger's cost per role. */
  costUsd: Record<BriefRole, number>
}

/**
 * Everything `--from` checks before it stores, that needs no database and no
 * browser (pure): the set file and each brief parse against this code's
 * shapes; they are the client's, the month's and the run's named; each
 * brief's status, evidence ids and pages are what the dry build recorded,
 * under the current deck; its In short holds to its printed pages; its
 * "Also this month" names only a finding a brief of the set prints; and no
 * footnote names what the other brief does not print. Any problem, and
 * nothing is stored.
 */
export function checkSavedSet(
  input: { manifest: unknown; files: Partial<Record<BriefRole, unknown>> },
  expect: { clientId: string; month: string; runId: string; company: string },
): { problems: string[]; set: CheckedSet | null } {
  const problems: string[] = []
  const m = savedSetSchema.safeParse(input.manifest)
  if (!m.success) return { problems: [`${SAVED_SET_FILE} does not parse: ${issues(m.error)}`], set: null }
  const manifest = m.data
  if (manifest.clientId !== expect.clientId) problems.push(`the saved set is client ${manifest.clientId}, not ${expect.clientId}`)
  if (manifest.month !== expect.month) problems.push(`the saved set is the ${manifest.month.slice(0, 7)} briefs, not ${expect.month.slice(0, 7)}`)
  if (manifest.runId !== expect.runId) problems.push(`the saved set is stored under run ${manifest.runId}, not ${expect.runId}`)
  if (manifest.company !== expect.company) problems.push(`the saved set is ${manifest.company}'s, and this client is ${expect.company}`)

  const files: SavedFile[] = []
  for (const r of BRIEF_ROLES) {
    const f = savedFileSchema.safeParse(input.files[r])
    if (!f.success) { problems.push(`${manifest.roles[r].file} (the ${BRIEF_NAME[r]}) does not parse against the stored-brief shape: ${input.files[r] === undefined ? 'the file is missing' : issues(f.error)}`); continue }
    if (f.data.data.role !== r) { problems.push(`${manifest.roles[r].file} holds the ${BRIEF_NAME[f.data.data.role]}, not the ${BRIEF_NAME[r]}`); continue }
    files.push(f.data)
  }
  if (files.length < BRIEF_ROLES.length) return { problems, set: null }

  const wordsOf = wordsOfFiles(files)
  const briefs = files.map((f) => f.data)
  for (const d of briefs) {
    const saved = manifest.roles[d.role]
    const name = BRIEF_NAME[d.role]
    if (d.month !== expect.month) problems.push(`the ${name} is about ${d.month.slice(0, 7)}, not ${expect.month.slice(0, 7)}`)
    if (d.company !== expect.company) problems.push(`the ${name} is written for ${d.company}, not ${expect.company}`)
    const prints = briefPrints(d)
    if ((saved.status === 'ready') !== prints) problems.push(`the ${name} was saved ${saved.status}, and under the current deck it ${prints ? 'prints' : 'is thin'}`)
    if (!prints) continue
    if (!sameSet(saved.evidenceIds, briefSnapshotRow(d).evidenceIds)) problems.push(`the ${name}'s evidence ids are not the ones the dry build saved`)
    const pages = deckHeaders(hydrateBrief(d, wordsOf))
    if (pages.join('\n') !== saved.pages.join('\n')) problems.push(`the ${name} draws ${pages.length} pages under the current deck (${pages.join(', ')}), and the dry build drew ${saved.pages.length} (${saved.pages.join(', ')})`)
    const inShort = inShortStillHolds(d, saved.inShort, wordsOf)
    if (!inShort.holds) problems.push(`the ${name}: ${inShort.why}`)
  }

  // "Also this month" and the footnotes, across the set as it prints.
  const also = alsoOnlyPrinted(briefs, { ideas: manifest.ideas as AllocatedIdea[] })
  also.forEach((d, k) => {
    if (d.inShort.also.length !== briefs[k].inShort.also.length) problems.push(`the ${BRIEF_NAME[d.role]}'s "Also this month" names an idea no brief of the set prints`)
  })
  const named = footnotesOnlyPrinted(briefs, wordsOf)
  named.forEach((d, k) => {
    if (d.held.length !== briefs[k].held.length) problems.push(`the ${BRIEF_NAME[d.role]} has a footnote naming what the other brief does not print: ${d.held[d.held.length - 1].what}`)
  })

  if (problems.length) return { problems, set: null }
  return {
    problems,
    set: {
      manifest,
      briefs,
      texts: Object.fromEntries(files.map((f) => [f.data.role, f.texts])) as Record<BriefRole, SavedFile['texts']>,
      costUsd: Object.fromEntries(BRIEF_ROLES.map((r) => [r, manifest.roles[r].costUsd])) as Record<BriefRole, number>,
    },
  }
}
