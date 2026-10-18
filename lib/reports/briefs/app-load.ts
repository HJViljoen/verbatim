import type { SupabaseClient } from '@supabase/supabase-js'

import { postIdeasEnabled, productReadingsEnabled, subjectReadsEnabled } from '../../config'
import { buildPlaybook, loadPlaybookVideos, type PlaybookVideo } from '../../pages/playbook'
import { loadContentPage, postsBlock, typicalRate, worksBlock, type ContentMonth } from '../../pages/v2/content'
import { readCited, readCore, readMoveCards, waitingAdvice } from '../../pages/v2/moves'
import { adviceHref } from '../../pages/v2/moves'
import { loadProducts } from '../../pages/v2/products'
import {
  buildBrands, buildGroups, clientCountsOf, crossKeys, monthWordsOf, personasOf, readGroupProducts, type GroupProducts,
} from '../../pages/v2/voices'
import { printsMedicalLine } from '../../post-ideas/medical'
import { loadPostIdeas } from '../../post-ideas/types'
import { marketProductMonth } from '../../products/market-month'
import { isMissingProductsSchema, loadMonthProductReadings } from '../../products/types'
import { loadBrandCrosses, loadBrandMonthPairs, loadBrandRefs, loadGroupSubjects, loadLatestProfile, loadMarketAudiences, loadMarketVideos } from '../../reading/cross'
import { marketAudiences } from '../../reading/market'
import { readingMonthLabel } from '../../reading/month-label'
import { monthStartOf, nextMonth } from '../../reading/month-key'
import { ownedPosts, summariseOwnedPosts } from '../../reading/owned'
import { loadPairOn, readingHandle } from '../../reading/read'
import { MONTH_PARAM } from '../../reading/reading-month'
import { loadMarketRivalAudiences } from '../../reading/reading-view'
import type { Scope } from '../../renderables/types'
import { isMissingWeekReads, WEEK_READS_TABLE } from '../../written/store'
import type { StandingFact, WeekReadData } from '../../written/types'
import { subjectsPart } from '../weekly-read-v3-build'
import {
  hooksOf, ideasOf, movesOf, namedOf, peopleOf, productsOf,
  type BriefAppInputs, type BriefMovesIn, type BriefSubjectRead,
} from './app'
import { yyyymm } from './app-words'
import { leftMs, type BriefClock } from './clock'
import type { BriefHooks, BriefIdeas, BriefNamed, BriefPeople, BriefProducts } from './types'

// WHAT THE OCTOBER CANVAS READS FROM THE APP, for one month (the I/O half of
// app.ts). Read ONCE, in `plan-briefs` (`loadBriefSetInputs`), with the
// pipeline's own client and a reading handle over it (the weekly email's
// shape, lib/reports/weekly-read-lines-load.ts: no session, every reader
// filters by the client id it is handed), and carried to the compose step in
// the plan's frozen inputs. NO MODEL CALL: Your moves' advice is read
// unfolded here (`waitingAdvice` with no vectors, which is the page's own
// fallback) and folded in the compose step by that step's own embedding batch
// (app.ts `movesSection`), so this half embeds nothing.
//
// EACH PAGE THE APP'S OWN READERS: Voices' (`loadGroupSubjects`,
// `buildGroups`, `readGroupProducts`, `loadBrandMonthPairs`,
// `loadBrandCrosses`, `buildBrands`, as `loadVoices` composes them, for the
// brief's month), Your products' (`loadProducts`, with `?month=`), Content's
// (`loadContentPage`: the ideas the month-closing run wrote; `buildPlaybook`
// with `clientSide: 'owned'`, `postsBlock`, `worksBlock`), Your moves'
// (`readCore` with `?month=`, `readCited`, `readMoveCards`), and Market's
// subject reads off the run's own week row (`subjectsPart`, the weekly
// issue's rule). EACH PART SOFT: a read that fails, or a table not in this
// database, loses that part (its page is left out, PAGE_NEEDS) and nothing
// else, and is said once in the log.

/** A failed read loses its part, never the set. */
function soft<T>(what: string, p: () => Promise<T>): Promise<T | null> {
  return p().catch((e: unknown) => {
    console.warn(`[briefs] the ${what} were not read from the app; the brief prints without that page: ${e instanceof Error ? e.message : String(e)}`)
    return null
  })
}

// SOFT IN TIME TOO (the fresh check, 18 Oct). The parts are read inside
// `plan-briefs`, whose route Vercel kills at 300 s, before the body's own
// catch can store a failed row or alert (clock.ts); the pipeline's `.catch`
// then returns null and the ended month is never written, with nobody told.
// So the app's pages share one deadline: a part still reading at it is left
// out (its page with it), as a read that failed is, and the step goes on.

/** The most the app's pages may take, all of them at once. */
export const APP_PARTS_BUDGET_MS = 90_000
/** What the step keeps after them: the inputs frozen, the questions, its
 *  return. */
export const APP_PARTS_RESERVE_MS = 20_000

/** The time the app's pages may take: the cap, or what the step's clock has
 *  left after the reserve, whichever is less; the cap alone with no clock
 *  (the script). Never negative. Pure. */
export function appPartsBudgetMs(clock?: BriefClock | null): number {
  if (!clock) return APP_PARTS_BUDGET_MS
  return Math.max(0, Math.min(APP_PARTS_BUDGET_MS, leftMs(clock) - APP_PARTS_RESERVE_MS))
}

const LATE = Symbol('late')

/** `soft`, held to `ms`: a part still reading then is null, said once. */
export async function softWithin<T>(what: string, p: () => Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<typeof LATE>((resolve) => { timer = setTimeout(() => resolve(LATE), Math.max(0, ms)) })
  try {
    const got = await Promise.race([soft(what, p), late])
    if (got !== LATE) return got
    console.warn(`[briefs] the ${what} were not read from the app within ${Math.round(ms / 1000)} s; the brief prints without that page`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Market's subject reads for the month, off the run's own week row
 * (`data.subjectReads`, written by `write-subject-reads` before
 * `plan-briefs`): each READY subject's (ruling U6: the standing facts' ready
 * ones, in Market's order) headline and what it means, or a thin read's
 * line. None where the tenant's reads are off, the row holds none, or they are
 * of another month (a closing run whose week starts in the next month).
 */
export async function loadSubjectReads(admin: SupabaseClient, a: { clientId: string; runId: string; month: string; standing: readonly StandingFact[] }): Promise<BriefSubjectRead[] | null> {
  if (!subjectReadsEnabled(a.clientId)) return null
  const res = await admin.from(WEEK_READS_TABLE).select('data').eq('client_id', a.clientId).eq('run_id', a.runId).eq('kind', 'week').maybeSingle()
  if (res.error) {
    if (isMissingWeekReads(res.error)) return null
    throw new Error(`week_reads (subject reads): ${res.error.message}`)
  }
  const read = (res.data as { data: WeekReadData | null } | null)?.data ?? null
  if (!read || read.version !== 2 || !read.subjectReads || monthStartOf(read.month) !== monthStartOf(a.month)) return null
  const order = a.standing.filter((f) => f.calibration === 'ready').map((f) => ({ id: f.subjectId, name: f.name }))
  const reads = subjectsPart({ order, read, readsOn: true })
  return reads.length ? reads.map((r) => ({ id: r.id, status: r.status, headline: r.headline, means: r.means, line: r.line })) : null
}

/**
 * Voices for the month: its groups (each with its persona's words in full and
 * the products named in its videos) and its brands table. Voices' own reads,
 * as `loadVoices` composes them, with the month given.
 */
export async function loadVoicesParts(admin: SupabaseClient, a: { clientId: string; month: string; now: string }): Promise<{ people: BriefPeople | null; named: BriefNamed | null }> {
  const handle = readingHandle(a.clientId, admin)
  const month = monthStartOf(a.month)
  const params = { month: yyyymm(month) }
  const refsAhead = loadBrandRefs(handle).catch(() => undefined)
  // The profile is the groups' alone: a read of it that fails loses the
  // groups' pages (as on Voices, `failed`) and never the brands'.
  const [rivals, read, pair] = await Promise.all([
    loadMarketRivalAudiences(admin, a.clientId),
    loadLatestProfile(handle).catch((e: unknown) => { console.warn(`[briefs] Voices' profile: ${e instanceof Error ? e.message : String(e)}`); return undefined }),
    loadPairOn(handle, a.now),
  ])
  const profile = read ?? null
  const audiences = rivals ? marketAudiences(rivals) : await loadMarketAudiences(handle)
  const market = await loadMarketVideos(handle, month, audiences)
  const [groupRead, pairs] = await Promise.all([
    profile ? loadGroupSubjects(handle, { month, audiences, market, profile }).catch((e: unknown) => { console.warn(`[briefs] Voices' groups: ${e instanceof Error ? e.message : String(e)}`); return undefined }) : Promise.resolve(undefined),
    refsAhead.then((r) => (r === undefined ? undefined : loadBrandMonthPairs(handle, { month, now: a.now, pair, audiences }))).catch(() => undefined),
  ])
  const groups = buildGroups({ profile, read: groupRead ?? null, platformOf: new Map(), params, failed: read === undefined || (profile != null && groupRead == null) })
  const videosOf = new Map((groupRead?.videos ?? []).map((v) => [v.key, v.videoIds]))
  const products = new Map<string, GroupProducts>()
  for (const c of groups.cards) products.set(c.key, await readGroupProducts(handle, a.clientId, month, monthWordsOf(month, false), videosOf.get(c.key) ?? [], params))
  const keys = pairs ? crossKeys(pairs) : []
  const crosses = keys.length > 0 ? await loadBrandCrosses(handle, { month, base: 'any', audiences, market, brandKeys: keys }).catch(() => null) : null
  const brands = buildBrands({
    clientId: a.clientId, month, pairs: pairs === undefined ? [] : pairs, crosses, note: null, params, failed: pairs === undefined,
    clientCounts: clientCountsOf(a.clientId, month, pairs ?? null, crosses),
  })
  return {
    people: peopleOf({ month, market: new Set(market.map((v) => v.id)).size, groups, personas: personasOf(profile), products }),
    named: namedOf(brands),
  }
}

/** Your products for the month (Össur only, behind `PRODUCT_READINGS_ENABLED`):
 *  the page's own load, and the month's rows for each category's videos
 *  naming one of the company's products. */
export async function loadProductsPart(admin: SupabaseClient, a: { clientId: string; company: string; month: string; now: string }): Promise<BriefProducts | null> {
  if (!productReadingsEnabled(a.clientId)) return null
  const handle = readingHandle(a.clientId, admin)
  const month = monthStartOf(a.month)
  const data = await loadProducts({ supabase: admin, clientId: a.clientId, reading: handle, params: { month: yyyymm(month) }, role: 'member', now: a.now })
  if (data.state !== 'ready' || monthStartOf(data.month) !== month) return null
  const rows = await loadMonthProductReadings(handle.client, a.clientId, [month]).catch((e: unknown) => {
    if (isMissingProductsSchema(e)) return []
    throw e
  })
  return productsOf(data, a.company, (id) => marketProductMonth(rows, month, id)?.k_named ?? null)
}

/** Content's ideas, as the month-closing run wrote them (`loadContentPage` at
 *  the month: the page anchors on the newest run's week, which on the run
 *  that closes the month is that run). */
export async function loadIdeasPart(admin: SupabaseClient, a: { clientId: string; month: string; now: Date }): Promise<BriefIdeas | null> {
  if (!postIdeasEnabled(a.clientId)) return null
  const scope: Scope = { supabase: admin, reading: readingHandle(a.clientId, admin), clientId: a.clientId, params: { period: 'month' } }
  const page = await loadContentPage(scope, { now: a.now })
  const rows = await loadPostIdeas(admin, a.clientId)
  return ideasOf(page, rows, { month: a.month, medical: printsMedicalLine(a.clientId) })
}

/** Content's measure for the month: the market's formats and openings with
 *  their response (`clientSide: 'owned'`, the first rival's column beside),
 *  and "Your posts in {month}". The playbook's videos are the set's own where
 *  it read them already. */
export async function loadHooksPart(admin: SupabaseClient, a: { clientId: string; company: string; month: string; rival: string | null; videos?: readonly PlaybookVideo[] | null }): Promise<BriefHooks | null> {
  const month = monthStartOf(a.month)
  const videos = a.videos ?? await loadPlaybookVideos(admin, a.clientId, month)
  const playbook = buildPlaybook({ month, brand: a.company, rival: a.rival, videos, clientSide: 'owned' })
  const window = { from: month, to: nextMonth(month) }
  const read = await ownedPosts({ supabase: admin, clientId: a.clientId }, window)
  const owned = summariseOwnedPosts(read.posts, window)
  const cm: ContentMonth = { month, complete: true, from: `${month}T00:00:00.000Z`, to: `${nextMonth(month)}T00:00:00.000Z` }
  const works = worksBlock({ playbook, owned, month: cm })
  return hooksOf({ month, rival: a.rival, playbook, posts: postsBlock({ owned, typical: typicalRate(playbook), month: cm }), sentence: works.sentence })
}

/** Your moves at the month (`?month=`): the current advice unfolded (the
 *  compose step folds it), what each would move, the dated moves' cards, the
 *  record. */
export async function loadMovesPart(admin: SupabaseClient, a: { clientId: string; month: string }): Promise<BriefMovesIn | null> {
  const month = monthStartOf(a.month)
  const scope: Scope = { supabase: admin, reading: readingHandle(a.clientId, admin), clientId: a.clientId, params: { [MONTH_PARAM]: yyyymm(month) } }
  const core = await readCore(scope)
  if (!core || monthStartOf(core.month) !== month) return null
  const waiting = waitingAdvice(core.adviceRows, null)
  const byLineage = new Map(core.adviceRows.map((r) => [r.lineageId, r]))
  const moveLineages = (core.moves ?? []).filter((m) => m.kind === 'advice' && m.lineage_id).map((m) => m.lineage_id as string)
  const cites = [...waiting, ...moveLineages.map((id) => byLineage.get(id)).filter((r): r is NonNullable<typeof r> => r != null)]
  const cited = await readCited(core.supabase, a.clientId, cites.flatMap((r) => r.basedOn))
  const read = await readMoveCards(core, core.moves ?? [], cited.market, waiting.map((r) => r.lineageId))
  return movesOf({
    month,
    monthLabel: readingMonthLabel(month, core.readingAt),
    rows: core.adviceRows,
    aims: read.aims,
    cards: read.cards,
    adviceHref,
  })
}

/**
 * Every part the October canvas reads, for one month. Never throws, and never
 * outlasts its budget (`appPartsBudgetMs`): each part on its own, a part that
 * fails or is still reading at the deadline left out (`softWithin`).
 */
export async function loadBriefAppParts(
  admin: SupabaseClient,
  a: {
    clientId: string; company: string; month: string; now: Date
    /** The run whose week row holds the subjects' reads: the month-closing
     *  run in the pipeline, the newest delivered run by hand. */
    runId: string
    standing: readonly StandingFact[]
    /** The first rival with videos in the month (the formats' rival column). */
    rival: string | null
    /** The playbook's videos where the set read them already. */
    videos?: readonly PlaybookVideo[] | null
    /** `plan-briefs`' clock: the parts end inside it. None by hand. */
    clock?: BriefClock | null
  },
): Promise<BriefAppInputs> {
  const month = monthStartOf(a.month)
  const now = a.now.toISOString()
  const none: BriefAppInputs = { month, subjectReads: null, people: null, named: null, products: null, ideas: null, hooks: null, moves: null }
  const ms = appPartsBudgetMs(a.clock)
  if (ms <= 0) {
    console.warn('[briefs] no time was left in the step to read the app\'s pages; the briefs print without them')
    return none
  }
  const [subjectReads, voices, products, ideas, hooks, moves] = await Promise.all([
    softWithin('subject reads', () => loadSubjectReads(admin, { clientId: a.clientId, runId: a.runId, month, standing: a.standing }), ms),
    softWithin('groups and brands', () => loadVoicesParts(admin, { clientId: a.clientId, month, now }), ms),
    softWithin('products', () => loadProductsPart(admin, { clientId: a.clientId, company: a.company, month, now }), ms),
    softWithin('post ideas', () => loadIdeasPart(admin, { clientId: a.clientId, month, now: a.now }), ms),
    softWithin('formats and openings', () => loadHooksPart(admin, { clientId: a.clientId, company: a.company, month, rival: a.rival, videos: a.videos }), ms),
    softWithin('advice and moves', () => loadMovesPart(admin, { clientId: a.clientId, month }), ms),
  ])
  return { ...none, subjectReads, people: voices?.people ?? null, named: voices?.named ?? null, products, ideas, hooks, moves }
}
