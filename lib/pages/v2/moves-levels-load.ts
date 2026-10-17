import type { SupabaseClient } from '@supabase/supabase-js'

import { brandRulesFor } from '../../brands/aliases'
import { loadCommentNamings, trackedBrands } from '../../brands/attribution'
import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../../chunk'
import { gateFor } from '../../quote-context'
import { readTranslations } from '../../quotes'
import { joins } from '../../reading/comparability'
import { marketAudiences } from '../../reading/market'
import { monthStartOf, prevMonth } from '../../reading/month-key'
import { readingMonthLabel } from '../../reading/month-label'
import type { Scope } from '../../renderables/types'
import { loadCompetitors } from '../../rivals'
import { selectAll } from '../../supabase-admin'
import { audienceOfVideo } from '../../written/evidence'
import { adviceVectors } from '../advice-shortlist'
import { fetchRunningRunIds } from '../latest-video-run'
import { WHAT_THEY_SELL } from '../market-frame'
import {
  buildAdviceRows, lineageKey, loadDecisions, loadMoveDatable, orderedTargets, registryIdsByInsight,
  type AdviceRow, type RecCopy,
} from '../market-surface'
import { row } from '../read'
import { loadRegistryLabels } from '../registry-labels'
import { loadMemberInsightIdsBySubject } from '../subjects'
import { fetchThemedRunId } from '../themed-run'
import { personasOf, type BrandsState, type ConvEvidenceRow, type ConvVideoRow, type PersonaLink } from './market'
import {
  adviceCardOf, logAs, moveCards, readAudience, readCited, readCore, readMoveCards, readMoveLevels, recordRows,
  RECOMMENDATION_COLUMNS, subjectsOf, waitingAdvice, type AdviceCard, type Core, type MoveCard,
} from './moves'
import {
  adviceConversationsOf, adviceCrumbs, adviceMenu, adviceNumbersOf, adviceQuotesOf, argumentParts, askAfterMoveHref, LINE_MONTHS,
  moveCrumbs, moveEvidenceOf, moveFactsOf, moveMenu, recordCrumbs, recordGroupsOf, wouldMoveLineOf, MOVE_EVIDENCE_EMPTY,
  type AdviceConversations, type AdviceNumbers, type AdviceQuote, type LevelCitation, type MoveEvidence, type MoveFacts, type MovePageData,
  type RecordPageData, type WouldMoveLine,
} from './moves-levels'
import type { Crumb } from '../crumbs'
import { earliestMoveDay } from '../../subjects/move-day'

// YOUR MOVES' LEVEL PAGES, READ (levels as pages, 17 Oct; the G6 boards).
// Each page reads only what it prints, on the reads the root already makes
// (`readCore`, `readCited`, `readAudience`, `readMoveLevels`), plus the few the
// board report names as new (data 1 to 7): the advice's conversations and
// their descriptions, its cited comments (one read a 250 insights, each
// comment embedded and the session's client's alone), its videos, the
// tracked brands its comments name, and a move's comments since its day. Every
// read names the session's client; every id from the URL is honoured only
// among the tenant's own rows (a foreign or unknown id is `missing`, the
// calm line). Nothing is stored and no comment's words are kept: an excerpt
// is resolved at render.

// ---- the shared reads -------------------------------------------------------------

/** The cited comments of these insights (`insight_evidence`, comment
 *  citations, each comment embedded and the session's client's alone), dated
 *  in `[from, to)` where a window is given; one read a 250 insights, paged past
 *  the 1,000-row cap on a unique order. Never a comment's own text: the
 *  excerpt is the citation's. */
export async function loadInsightCitations(
  db: SupabaseClient,
  clientId: string,
  insightIds: readonly string[],
  window: { from: string; to: string } | null = null,
): Promise<ConvEvidenceRow[]> {
  const ids = [...new Set(insightIds)].filter(Boolean)
  if (ids.length === 0) return []
  type Comment = { comment_date: string | null; platform: string; video_id: string; author: string | null }
  type Row = { id: string; audience_insight_id: string; comment_id: string | null; quote: string | null; relevance_rank: number | null; redacted: boolean | null; comments: Comment | Comment[] | null }
  const pages = await mapWithLimit(chunk(ids, UUID_IN_CHUNK), READ_CONCURRENCY, (part) =>
    selectAll<Row>(() => {
      let q = db.from('insight_evidence')
        .select('id, audience_insight_id, comment_id, quote, relevance_rank, redacted, comments!inner(client_id, comment_date, platform, video_id, author)')
        .in('audience_insight_id', part).eq('source', 'comment').eq('comments.client_id', clientId)
      if (window) q = q.gte('comments.comment_date', window.from).lt('comments.comment_date', window.to)
      return q.order('id')
    }))
  return pages.flat().flatMap((r) => {
    const c = Array.isArray(r.comments) ? r.comments[0] : r.comments
    if (!c || !r.comment_id) return []
    return [{
      evidenceId: String(r.id), insightId: String(r.audience_insight_id), commentId: String(r.comment_id), quote: r.quote ?? null,
      rank: r.relevance_rank ?? 99, redacted: r.redacted === true,
      comment: { date: c.comment_date, platform: c.platform, videoId: String(c.video_id), author: c.author ?? null },
    }]
  })
}

const VIDEO_COLUMNS = 'id, platform, video_id, video_url, account_name, caption, comments_count, upload_date, is_client, is_competitor, competitor_name, hashtags, topics, source'

/** Videos by their row ids, the session's client's alone: one read a 250. */
export async function loadVideosById(db: SupabaseClient, clientId: string, ids: readonly string[]): Promise<ConvVideoRow[]> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return []
  const parts = await mapWithLimit(chunk(unique, UUID_IN_CHUNK), READ_CONCURRENCY, (part) =>
    selectAll<ConvVideoRow>(() => db.from('videos').select(VIDEO_COLUMNS).eq('client_id', clientId).in('id', part).order('id')))
  return parts.flat()
}

/** Videos by the platform's own ids (a comment names its video so), the
 *  session's client's alone, kept only where the platform matches too: one
 *  read a 250. */
export async function loadVideosByPlatformId(db: SupabaseClient, clientId: string, keys: readonly { platform: string; videoId: string }[]): Promise<ConvVideoRow[]> {
  const wanted = new Set(keys.map((k) => `${k.platform}::${k.videoId}`))
  const ids = [...new Set(keys.map((k) => k.videoId))].filter(Boolean)
  if (ids.length === 0) return []
  const parts = await mapWithLimit(chunk(ids, UUID_IN_CHUNK), READ_CONCURRENCY, (part) =>
    selectAll<ConvVideoRow>(() => db.from('videos').select(VIDEO_COLUMNS).eq('client_id', clientId).in('video_id', part).order('id')))
  return parts.flat().filter((v) => wanted.has(`${v.platform}::${v.video_id}`))
}

/** The latest consumer profile's personas (key, name, insight ids). */
async function loadPersonas(db: SupabaseClient, clientId: string): Promise<PersonaLink[]> {
  const res = await db.from('consumer_profiles').select('personas').eq('client_id', clientId)
    .order('run_date', { ascending: false }).limit(1).maybeSingle()
  if (res.error) throw new Error(`consumer_profiles: ${res.error.message}`)
  return personasOf((res.data as { personas?: unknown } | null)?.personas)
}

/** The tracked brands these comments name, and whether a split may print at
 *  all (Market's rule: no brand rules is `not_read`, rules and no row yet
 *  `not_counted`). */
async function loadNamings(
  db: SupabaseClient,
  clientId: string,
  a: { commentIds: readonly string[]; company: string; rivals: readonly { id: string; name: string }[] },
): Promise<{ mentions: { comment_id: string; video_id: string; name: string }[]; brands: BrandsState }> {
  if (brandRulesFor(clientId).length === 0) return { mentions: [], brands: 'not_read' }
  const tracked = trackedBrands(clientId, a.company, a.rivals)
  const namings = a.commentIds.length > 0 ? await loadCommentNamings(db, { clientId, commentIds: a.commentIds, brands: tracked }) : []
  if (namings.length === 0) {
    const probe = await db.from('brand_mentions').select('id').eq('client_id', clientId).limit(1)
    if (probe.error) throw new Error(`brand_mentions probe: ${probe.error.message}`)
    if ((probe.data ?? []).length === 0) return { mentions: [], brands: 'not_counted' }
  }
  return { mentions: namings.map((n) => ({ comment_id: n.commentId, video_id: n.videoId, name: n.name })), brands: 'counted' }
}

/** A read beside the page that must not take it down: logged, and its block
 *  says it could not be read. */
async function soft<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p
  } catch (error) {
    return logAs(`levels.${label}`, fallback)(error)
  }
}

/** The themed update (the one whose clustering the reading names). */
async function themedRun(core: Pick<Core, 'supabase' | 'clientId' | 'latestRunId'>): Promise<string> {
  const ids = await fetchRunningRunIds(core.supabase, core.clientId, 'moves-v2')
  return (await fetchThemedRunId(core.supabase, core.clientId, ids, 'moves-v2')) ?? core.latestRunId
}

const videoKey = (platform: string, videoId: string): string => `${platform}::${videoId}`

// ---- the advice record (/dashboard/moves/advice) -----------------------------------

/**
 * THE ADVICE RECORD (board G6-Moves-Record): every piece of advice grouped by
 * what was decided. Reads the latest delivered update (none: the first-run
 * line), the advice and its decisions, and the short list's vectors (cached
 * per server), the one waiting list the root and the Dashboard count.
 */
export async function loadRecordPage(scope: Scope): Promise<RecordPageData | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope
  const [latestRes, copies, decisions] = await Promise.all([
    supabase.from('pipeline_runs').select('id')
      .eq('client_id', clientId).in('status', ['completed', 'partial'])
      .order('started_at', { ascending: false }).limit(1).maybeSingle(),
    selectAll<RecCopy>(() =>
      supabase.from('recommendations').select(RECOMMENDATION_COLUMNS)
        .eq('client_id', clientId).order('created_at', { ascending: true }).order('id', { ascending: true })),
    loadDecisions(supabase, clientId),
  ])
  if (!row<{ id: string }>(latestRes, 'moves-levels.latestRun')) return null
  const rows = buildAdviceRows(copies, decisions)
  const vectors = await adviceVectors(rows).catch(logAs('record.vectors', null))
  const waiting = waitingAdvice(rows, vectors)
  const all = scope.params.all === '1'
  const since = rows.map((r) => r.firstMade).filter(Boolean).sort()[0] ?? null
  return {
    total: rows.length,
    since,
    decided: rows.filter((r) => r.status !== 'new').length,
    waiting: waiting.length,
    groups: recordGroupsOf(recordRows(rows, rows.length), waiting.map((r) => r.lineageId), all),
    all,
    crumbs: recordCrumbs(),
  }
}

// ---- a piece of advice (/dashboard/moves/advice/<id>) -------------------------------

export interface AdvicePageData {
  brand: string
  /** What the tenant sells, for "the market"'s words (`WHAT_THEY_SELL`). */
  noun: string | null
  /** The reading month, `YYYY-MM-01`. */
  month: string
  monthLabel: string | null
  readingAt: string
  canDecide: boolean
  /** "Accept and date it as a move": the day's window where MF5 is applied
   *  (null dates it today); absent where the reader may not decide. */
  dating: { today: string; earliest: string } | null
  card: AdviceCard
  argument: { lead: string | null; rest: string[] }
  conversations: AdviceConversations | 'unread'
  line: WouldMoveLine | null | 'unread'
  numbers: AdviceNumbers | 'unread'
  quotes: AdviceQuote[] | 'unread'
  moves: { cards: MoveCard[]; recorded: boolean } | 'unread'
  record: { total: number }
  crumbs: Crumb[]
}

/** The piece of advice an address names, among the tenant's own: by lineage,
 *  else by a recommendation id (an old `?rec=` link), resolved to its
 *  lineage. Null for anything else. Pure. */
export function adviceNamed(rows: readonly AdviceRow[], copies: readonly Pick<RecCopy, 'id' | 'lineage_id'>[], id: string): AdviceRow | null {
  const key = id.trim()
  if (!key) return null
  const byLineage = rows.find((r) => r.lineageId === key || r.recommendationId === key)
  if (byLineage) return byLineage
  const copy = copies.find((c) => c.id === key)
  return copy ? rows.find((r) => r.lineageId === lineageKey(copy)) ?? null : null
}

/**
 * A PIECE OF ADVICE, THE HUB (board G6-Moves-Advice). Null is the first-run
 * line; `'missing'` an id this tenant's advice does not hold (another
 * workspace's, an unknown one), which prints one calm line and the way back.
 */
export async function loadAdvicePage(scope: Scope, id: string, options: { canDecide: boolean }): Promise<AdvicePageData | 'missing' | null> {
  const core = await readCore(scope)
  if (!core) return null
  const r = adviceNamed(core.adviceRows, core.copies, id)
  if (!r) return 'missing'
  const db = core.reading.client
  const { clientId } = core
  const decide = options.canDecide && r.status === 'new'

  const vectorsAhead = adviceVectors(core.adviceRows).catch(logAs('advice.vectors', null))
  const runAhead = themedRun(core)
  const personasAhead = soft('advice.personas', loadPersonas(db, clientId), [] as PersonaLink[])
  const datableAhead = decide && core.moves != null ? loadMoveDatable(core.supabase, clientId).catch(() => false) : Promise.resolve(false)
  const rivalsAhead = soft('advice.rivals', loadCompetitors(db, clientId), [] as { id: string; name: string }[])
  for (const p of [vectorsAhead, runAhead, personasAhead, datableAhead, rivalsAhead]) p.catch(() => {})

  // WHAT IT RESTS ON AND THE VIDEOS BEHIND IT ARE THE PAGE. Read as none, a
  // failed read would print "since replaced", "no evidence" and "no
  // conversation" for advice that has them, so it throws instead and the
  // page keeps the shell (app/dashboard/error.tsx).
  let evidenceFailed = false
  const evidenceUnread = () => { evidenceFailed = true }
  const cited = await readCited(core.supabase, clientId, r.basedOn, evidenceUnread)
  const evidence = [...new Set(r.basedOn.flatMap((b) => cited.market.get(b)?.evidence ?? []))]
  const [audience, citationsRead, runId] = await Promise.all([
    readAudience(core.supabase, clientId, evidence, { kinds: true, onError: evidenceUnread }),
    soft<ConvEvidenceRow[] | null>('advice.citations', loadInsightCitations(db, clientId, evidence), null),
    runAhead.catch(() => core.latestRunId),
  ])
  if (evidenceFailed) throw new Error('moves-v2.advice: what it rests on could not be read')
  // THE CONVERSATIONS ITS VIDEOS SIT IN: the themed update's themes, by the
  // registry bridge (never a label), with Pass B's descriptions.
  type ThemeRow = { supporting_insight_ids: string[] | null; registry_id: string | null; description: string | null; category: string | null }
  const themesRead = await soft<ThemeRow[] | null>('advice.themes', selectAll<ThemeRow>(() =>
    db.from('themes').select('supporting_insight_ids, registry_id, description, category').eq('client_id', clientId).eq('run_id', runId).order('id')), null)
  const registryByInsight = registryIdsByInsight(themesRead ?? [])
  const target = orderedTargets(evidence, registryByInsight)[0] ?? null
  const convIds = [...new Set(evidence.flatMap((i) => registryByInsight.get(i) ?? []))]
  const descriptions = new Map<string, string>()
  const kinds = new Map<string, string | null>()
  for (const t of themesRead ?? []) {
    const d = (t.description ?? '').trim()
    if (t.registry_id && d && !descriptions.has(t.registry_id)) descriptions.set(t.registry_id, d)
    if (t.registry_id && t.category && !kinds.get(t.registry_id)) kinds.set(t.registry_id, t.category)
  }
  // The moves made on it, read on its target as the root reads them.
  const onIt = (core.moves ?? []).filter((m) => m.kind === 'advice' && m.lineage_id === r.lineageId)
  const targets = new Map(target ? [[r.lineageId, target]] : [])
  let levelsFailed = false
  let from = monthStartOf(core.month)
  for (let i = 1; i < LINE_MONTHS; i++) from = prevMonth(from)
  const videoIds = [...new Set(evidence.map((i) => audience.videoByInsight.get(i)).filter((v): v is string => Boolean(v)))]
  // A label read that failed is said as one, never as "no conversation".
  let labelsFailed = false
  const [labels, levels, videosRead, rivals] = await Promise.all([
    soft('advice.labels', loadRegistryLabels(core.supabase, clientId, convIds, () => { labelsFailed = true }), new Map<string, string>()),
    readMoveLevels(core, onIt, targets, convIds, () => { levelsFailed = true }, from),
    soft<ConvVideoRow[] | null>('advice.videos', loadVideosById(db, clientId, videoIds), null),
    rivalsAhead,
  ])
  const citations = citationsRead ?? []
  const namingsRead = citationsRead
    ? await soft('advice.namings', loadNamings(db, clientId, { commentIds: [...new Set(citations.map((c) => c.commentId))], company: core.brand, rivals }), null)
    : null

  const reading = monthStartOf(core.month)
  const levelOf = (themeId: string): { k: number; n: number } | null => {
    const k = levels('theme', themeId, reading)
    const n = core.marketN(reading)
    return k != null && n != null && n > 0 ? { k, n } : null
  }
  // The themes or their labels unread: the conversations, and the line their
  // target is read on, say so (never "no conversation read month by month").
  const groupingUnread = themesRead == null || labelsFailed
  const conversations = groupingUnread ? 'unread' as const : adviceConversationsOf({
    evidence, registryByInsight, videoByInsight: audience.videoByInsight, labels, descriptions, kinds, level: levelOf, target, month: core.month,
  })
  const monthLabel = readingMonthLabel(core.month, core.readingAt)
  const targetLabel = target ? labels.get(target)?.trim() ?? null : null
  const line = levelsFailed || groupingUnread ? 'unread' as const
    : target && targetLabel
      ? wouldMoveLineOf({
          themeId: target, label: targetLabel, month: core.month, monthLabel, now: core.readingAt,
          level: (m) => levels('theme', target, m), n: core.marketN,
          joined: (prev, m) => joins(core.pair(prev, m, 'market')), pair: core.pair,
        })
      : null

  // Its videos and its cited comments, keyed both ways.
  const videos = new Map((videosRead ?? []).map((v) => [v.id, v]))
  const byKey = new Map((videosRead ?? []).map((v) => [videoKey(v.platform, v.video_id), v.id]))
  const levelCitations: LevelCitation[] = citations.map((c) => ({ ...c, video: byKey.get(videoKey(c.comment.platform, c.comment.videoId)) ?? null }))
  const personas = await personasAhead
  const numbers = videosRead == null || citationsRead == null ? 'unread' as const : adviceNumbersOf({
    lineageId: r.lineageId, title: r.title, month: core.month, now: core.readingAt,
    evidence, videoByInsight: audience.videoByInsight, kindByInsight: audience.kindById, videos,
    citations: levelCitations, personas,
    mentions: namingsRead?.mentions ?? [], brands: namingsRead?.brands ?? 'not_read', brand: core.brand,
    noun: WHAT_THEY_SELL[clientId] ?? null, audienceOf: audienceOfVideo,
  })

  // THREE COMMENTS, EACH FROM ITS CONVERSATION: the English read only for the
  // candidates of the conversations the row could print.
  let quotes: AdviceQuote[] | 'unread' = 'unread'
  if (conversations !== 'unread' && citationsRead && videosRead) {
    const top = conversations.rows.slice(0, 6)
    const membersOf = new Map(top.map((c) => [c.id, new Set(evidence.filter((i) => (registryByInsight.get(i) ?? []).includes(c.id)))]))
    const wanted = new Set(top.flatMap((c) => [...(membersOf.get(c.id) ?? [])]))
    const texts = levelCitations.filter((c) => !c.redacted && c.quote && wanted.has(c.insightId)).map((c) => c.quote as string)
    const translations = await readTranslations(db, texts)
    const named = new Map<string, string[]>()
    const counted = new Set(citations.map((c) => c.commentId))
    for (const m of namingsRead?.mentions ?? []) if (counted.has(m.comment_id)) named.set(m.video_id, [...(named.get(m.video_id) ?? []), m.name])
    quotes = adviceQuotesOf({
      conversations: top, membersOf, citations: levelCitations, videos, translations,
      gate: (claim) => gateFor(clientId, { claim, requireRelevance: true }),
      named, brand: core.brand, brands: namingsRead?.brands ?? 'not_read',
    })
  }

  // The moves made on it, as the root's cards.
  const moves = levelsFailed ? 'unread' as const : {
    cards: moveCards({
      moves: onIt, month: core.month, now: core.readingAt, subjects: subjectsOf(core),
      themes: labels, adviceTargets: targets, levels, n: core.marketN,
      joined: (prev, m) => joins(core.pair(prev, m, 'market')), pair: core.pair,
    }),
    recorded: core.moves != null,
  }

  const [vectors, datable] = await Promise.all([vectorsAhead, datableAhead])
  const card: AdviceCard = {
    ...adviceCardOf(core, r, { cited, videoByInsight: audience.videoByInsight, slugById: audience.slugById, onPage: new Set() }),
    aim: target && targetLabel ? { label: targetLabel, month: reading, level: levelOf(target) } : null,
  }
  const waiting = waitingAdvice(core.adviceRows, vectors)
  const today = core.readingAt.slice(0, 10)
  return {
    brand: core.brand,
    noun: WHAT_THEY_SELL[clientId] ?? null,
    month: core.month,
    monthLabel,
    readingAt: core.readingAt,
    canDecide: options.canDecide,
    dating: decide && datable ? { today, earliest: earliestMoveDay(today) } : null,
    card,
    argument: argumentParts(r.why),
    conversations,
    line,
    numbers,
    quotes,
    moves,
    record: { total: core.adviceRows.length },
    crumbs: adviceCrumbs(card, adviceMenu({ waiting, current: { lineageId: card.lineageId, title: card.title, untitled: card.untitled }, total: core.adviceRows.length })),
  }
}

// ---- a dated move (/dashboard/moves/<id>) -------------------------------------------

/**
 * A DATED MOVE, THE EVIDENCE (board G6-Moves-Move). Null is the first-run
 * line; `'missing'` an id among none of this tenant's moves.
 */
export async function loadMovePage(scope: Scope, id: string, options: { canDecide: boolean }): Promise<MovePageData | 'missing' | null> {
  const core = await readCore(scope)
  if (!core) return null
  const dated = core.moves ?? []
  const m = dated.find((x) => x.id === id.trim())
  if (!m) return 'missing'
  const db = core.reading.client
  const { clientId } = core
  const p = scope.params

  // Its line, beside every other move's (the switcher and "Your other moves"
  // are their cards): the root's own reads.
  let citedFailed = false
  const lineages = dated.filter((x) => x.kind === 'advice' && x.lineage_id).map((x) => x.lineage_id as string)
  const cited = await readCited(core.supabase, clientId, lineages.flatMap((l) => core.adviceRows.find((r) => r.lineageId === l)?.basedOn ?? []), () => { citedFailed = true })
  const [movesRead, personas, rivals, runId] = await Promise.all([
    readMoveCards(core, dated, cited.market).catch(logAs('move.cards', null as Awaited<ReturnType<typeof readMoveCards>> | null)),
    soft('move.personas', loadPersonas(db, clientId), [] as PersonaLink[]),
    soft('move.rivals', loadCompetitors(db, clientId), [] as { id: string; name: string }[]),
    // The themed update names a conversation's members, for a move on a
    // theme or on advice; a subject's members are its memberships, so a
    // subject's move reads no run for it.
    m.kind === 'subject' ? Promise.resolve(core.latestRunId) : themedRun(core).catch(() => core.latestRunId),
  ])
  // ITS LINE IS THE PAGE. A failed read under the moves' lines (what an advice
  // move is on, the labels, the months) would print "names nothing the market
  // is read on" or "no reading of this yet", and a failed read of them all
  // "no dated move at this address", for a move that has them: the page
  // throws instead and keeps the shell (app/dashboard/error.tsx). The move is
  // this tenant's (found among `core.moves` above), so this is never the
  // calm missing line.
  if (!movesRead || movesRead.aimsFailed || citedFailed) throw new Error('moves-v2.move: its line could not be read')
  const cards = movesRead.cards
  const found = cards.find((c) => c.id === m.id)
  if (!found) return 'missing'
  const subjects = subjectsOf(core)
  // WHY A FAILED SUBJECT SHOWS NO FIGURE IS SAID ONCE A PAGE (14 Oct, the
  // lead's ruling): `moveCards` says it on the first card of the subject's and
  // "not measured yet" on any later one. On a move's page its own card is the
  // only one that prints why, so it says it, whichever card it was.
  const failedSubject = found.object?.kind === 'subject' && subjects.get(found.object.id)?.calibration === 'failed'
  const card: MoveCard = found.unread === 'not_measured' && failedSubject ? { ...found, unread: 'not_ready' } : found
  const reading = monthStartOf(core.month)
  const object = card.object ?? null
  const ready = object?.kind === 'subject' ? subjects.get(object.id)?.calibration === 'ready' : object != null
  const readingPoint = card.points.find((pt) => pt.month === reading) ?? null
  const now = core.readingAt
  const window = { from: `${card.day}T00:00:00.000Z`, to: now }

  // WHAT PEOPLE SAID AFTER IT: the comments about what it is on, dated from
  // its day on, by the members of its subject (ready ones only: U6) or its
  // conversation in the themed update.
  let evidence: MoveEvidence = MOVE_EVIDENCE_EMPTY(object ? (ready ? 'unread' : 'held') : 'nothing')
  let facts: MoveFacts | null = null
  if (object && ready) {
    // A conversation's kind rides with its members, so the gate holds its
    // comments to it as Market's conversation page does; a subject has none.
    let kind: string | null = null
    const membersRead = await soft<string[] | null>('move.members', object.kind === 'subject'
      ? loadMemberInsightIdsBySubject(db, clientId, [object.id]).then((byId) => byId?.get(object.id) ?? [])
      : selectAll<{ member_insight_ids: string[] | null; category: string | null }>(() =>
          db.from('theme_observations').select('member_insight_ids, category').eq('client_id', clientId).eq('run_id', runId).eq('theme_id', object.id).order('theme_id'),
        ).then((rows) => {
          kind = rows.find((r) => r.category)?.category ?? null
          return [...new Set(rows.flatMap((r) => (r.member_insight_ids ?? []).map(String)))]
        }), null)
    if (membersRead) {
      const members = new Set(membersRead)
      const citationsRead = await soft<ConvEvidenceRow[] | null>('move.citations', loadInsightCitations(db, clientId, membersRead, window), null)
      const videosRead = citationsRead
        ? await soft<ConvVideoRow[] | null>('move.videos', loadVideosByPlatformId(db, clientId, citationsRead.map((c) => ({ platform: c.comment.platform, videoId: c.comment.videoId }))), null)
        : null
      if (citationsRead && videosRead) {
        // The market's videos alone: the category and the tracked rivals,
        // never the client's own posts (the line's base).
        const market = new Set(marketAudiences(core.rivals))
        const kept = videosRead.filter((v) => market.has(audienceOfVideo(v)))
        const keys = new Set(kept.map((v) => videoKey(v.platform, v.video_id)))
        const counted = citationsRead.filter((c) => keys.has(videoKey(c.comment.platform, c.comment.videoId)))
        const commentIds = new Set(counted.map((c) => c.commentId))
        const [namings, kinds] = await Promise.all([
          soft('move.namings', loadNamings(db, clientId, { commentIds: [...commentIds], company: core.brand, rivals }), null),
          readAudience(core.supabase, clientId, [...new Set(counted.map((c) => c.insightId))], { kinds: true }),
        ])
        const named = new Map<string, string[]>()
        for (const x of namings?.mentions ?? []) if (commentIds.has(x.comment_id)) named.set(x.video_id, [...(named.get(x.video_id) ?? []), x.name])
        const label = card.label ?? ''
        const gate = gateFor(clientId, { claim: label, requireRelevance: true })
        const shownBase = moveEvidenceOf({
          moveId: card.id, claim: label, videoIds: kept.map((v) => v.id), commentIds, members, videos: kept, evidence: counted,
          translations: new Map(), named, brand: core.brand, brands: namings?.brands ?? 'not_read', gate, kind,
          p: { video: typeof p.video === 'string' && /^[0-9a-f-]{36}$/i.test(p.video) ? p.video.toLowerCase() : null, videos: p.videos === 'all' },
        })
        // The English, read only for the comments of the videos shown.
        const shown = new Set(shownBase.videos.map((v) => v.id))
        const shownKeys = new Set(kept.filter((v) => shown.has(v.id)).map((v) => videoKey(v.platform, v.video_id)))
        const texts = counted.filter((c) => !c.redacted && c.quote && shownKeys.has(videoKey(c.comment.platform, c.comment.videoId))).map((c) => c.quote as string)
        const translations = await readTranslations(db, texts)
        evidence = translations.size > 0 ? moveEvidenceOf({
          moveId: card.id, claim: label, videoIds: kept.map((v) => v.id), commentIds, members, videos: kept, evidence: counted,
          translations, named, brand: core.brand, brands: namings?.brands ?? 'not_read', gate, kind,
          p: { video: typeof p.video === 'string' && /^[0-9a-f-]{36}$/i.test(p.video) ? p.video.toLowerCase() : null, videos: p.videos === 'all' },
        }) : shownBase
        facts = moveFactsOf({
          moveId: card.id, title: card.title, day: card.day, now, month: core.month,
          videos: kept, citations: counted, kindByInsight: kinds.kindById, members, personas,
          mentions: namings?.mentions ?? [], brands: namings?.brands ?? 'not_read', brand: core.brand,
          noun: WHAT_THEY_SELL[clientId] ?? null, audienceOf: audienceOfVideo,
        })
      }
    }
  }

  const label = card.label
  return {
    brand: core.brand,
    noun: WHAT_THEY_SELL[clientId] ?? null,
    month: core.month,
    monthLabel: readingMonthLabel(core.month, core.readingAt),
    readingAt: core.readingAt,
    canDecide: options.canDecide,
    card,
    on: object && label ? { kind: object.kind, label, href: card.onHref, level: ready && readingPoint ? { k: readingPoint.k, n: readingPoint.n } : null, ready } : null,
    window,
    evidence,
    facts,
    others: cards.filter((c) => c.id !== card.id),
    // "Your next move" only where the reader may date one: an owner or an
    // admin, where moves are recorded, with something to date it on.
    invite: options.canDecide && core.moves != null && (subjects.size > 0 || core.adviceRows.length > 0),
    crumbs: moveCrumbs(card, moveMenu(cards, card.id)),
    askHref: askAfterMoveHref(label, card.day),
  }
}

