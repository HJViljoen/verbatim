import type { SupabaseClient } from '@supabase/supabase-js'

import { loadAskFrame, type AskFrame } from '../../agent/answer'
import { askWindow } from '../../agent/scope'
import { loadCommentNamings, namesByComment, trackedBrands, type WhoVideo } from '../../brands/attribution'
import { brandCountState } from '../../brands/precision'
import { WHAT_THEY_SELL } from '../../pages/market-frame'
import { buildPlaybook, loadPlaybookVideos, type PlaybookBlock } from '../../pages/playbook'
import type { SayVsHearEntry } from '../../pipeline/schemas'
import { marketAudiences, pooledDenominators } from '../../reading/market'
import { buildMarketKinds } from '../../pages/overview-market/kinds'
import { OWN_POST_COMMENT_FLOOR } from '../../reading/own-posts'
import { selectAll } from '../../supabase-admin'
import { WEEK_READS_TABLE, isLongRunData, isMissingWeekReads } from '../../written/store'
import { TABLE_SUBJECT_MEMBERSHIPS, isMissingSubjects } from '../../subjects/types'
import { monthStartOf, nextMonth, prevMonth } from '../../reading/month-key'
import { readingHandle } from '../../reading/read'
import { loadMarketRivalAudiences, loadReadingMonth } from '../../reading/reading-view'
import { CLIENT_AUDIENCE, isRivalAudience, loadCompetitors, rivalNameOf } from '../../rivals'
import { checkWeekRead } from '../../written/check'
import { loadCompanyContext, type CompanyContext } from '../../written/company'
import { loadDatedEvidence, loadTrackedBrands, type DatedEvidence } from '../../written/evidence'
import { themedRunAsOf } from '../../written/longrun'
import { marketFiguresOf } from '../../written/pool'
import { loadStanding } from '../../written/standing'
import type { StandingFact } from '../../written/types'
import type { ParseClient } from '../../written/write-model'
import { allPoints, runResearch, type ResearchAnswer } from '../documents/research'
import { allocateIdeas } from './allocate'
import { composeBrief, footnotesOnlyPrinted, namedAcross, summaryAgainstPrinted, SHARE_MIN_VIDEOS, type AudienceRow, type LongRunIn, type MarketKindsIn, type OwnPostCount, type QuoteWordsOf } from './compose'
import { Meaning } from './meaning'
import { applyRepeats, REPEATS_IDEA_CHARS, repeatItemsOf, verdictsOf, type RepeatItem, type RepeatsOutput, type RepeatVerdict } from './repeats'
import { capText } from '../documents/scrub'
import { splitSentences } from '../../prose/scrub'
import { embedTexts } from '../../pipeline/cluster'
import { fetchQuoteResolutionsByRefs } from '../../quotes'
import { collectQuoteRefs } from '../../renderables/quotes-freeze'
import type { QuoteResolution } from '../../renderables/types'
import { EMBEDDING_MODEL, estimateCost } from '../../config'
import { groundPoint, groundedPointOf } from './ground'
import { applyInShort, inShortItems, printedLines, printedPages, type InShortDrop, type InShortItem, type InShortOutput } from './inshort'
import { BRIEF_MODEL, checkInShort, draftIdeas, judgeRepeats, writeBrief } from './model'
import { allBriefQuestions, type BriefQuestion } from './questions'
import { QuotePool } from './quotes'
import type { Allocation, BriefRole, GroundedPoint, IdeaDraft, MonthlyBriefData } from './types'
import { callOptions, checkBudget, type BriefClock } from './clock'
import { BRIEF_NAME, BRIEF_ROLES, isBriefRole } from './types'
import { scrubBriefText } from './scrub'
import { BRIEF_MAX, type BriefOutput, type IdeasOutput } from './write'

// The month's four briefs, end to end (the I/O half; every decision is in the
// pure modules beside it). READ-ONLY but for the model calls' `ai_call_log`
// rows, and not those where `log` is false. One set at a time: allocation
// needs all four departments' research before any brief is written.
//
//   inputs (one wave of light reads) → research (the Ask agent, every role's
//   questions in one run, so the point ids are unique across the set) →
//   ground (the evidence of every point, counted) → ideas (one call) →
//   self-check (the ideas' headlines, one verdict call) → allocate → four
//   briefs (one call each) → compose.
//
// TENANT-GENERAL. Nothing here names a tenant: what the tenant sells is
// `WHAT_THEY_SELL` where the product has a noun for it and the industry
// keywords otherwise; the quote gate is the tenant's own (ground.ts); a
// subject that is not calibrated prints no figure (compose.ts); a rival is
// named only where the research names it (sections.ts).

export interface BriefSetInputs {
  clientId: string
  company: string
  /** `YYYY-MM-01`. */
  month: string
  noun: string | null
  industryKeywords: string[]
  /** Every rival the tenant tracks, by name. */
  tracked: string[]
  /** The rivals worth naming in a question: tracked, with videos in the
   *  month, most first. */
  rivals: string[]
  audiences: AudienceRow[] | null
  market: { videos: number | null; comments: number | null } | null
  context: CompanyContext | null
  standing: StandingFact[]
  playbook: PlaybookBlock | null
  sayVsHear: SayVsHearEntry[]
  /** The run whose themes the self-check reads. */
  themedRunId: string | null
  /** The latest completed run, for the research (the agent's runId). */
  runId: string
  /** Every brand a commenter may work for (the insider rule). */
  brands: string[]
  rivalAudiences: string[]
  /** The company's own giveaway posts' comments in the month (flagged on the
   *  shares line), or null where none or not read. */
  giveaway?: { posts: number; comments: number } | null
  /** What people did in the comments and the mood, pooled over the market
   *  (Leadership's "Where the market stands"); null where not read. */
  kinds?: MarketKindsIn | null
  /** Each brand's own posts published in the month and how many drew five or
   *  more comments (Marketing's "How rivals are heard"); null where not read. */
  posts?: OwnPostCount[] | null
  /** The month's long-run read, as "What holds so far" prints it
   *  (Leadership); null where none is ready. */
  longRun?: LongRunIn | null
}

/** What people did in the comments and the mood, for the month, pooled over
 *  the market as Your market reads them (`buildMarketKinds`). Two small reads
 *  of the month's rows; null where the tables are not there. */
export async function loadMarketKinds(
  admin: SupabaseClient,
  clientId: string,
  month: string,
  denominators: readonly { audience: string; videos: number; comments: number }[],
  rivalAudiences: readonly string[],
): Promise<MarketKindsIn | null> {
  const [kindRes, statsRes] = await Promise.all([
    admin.from('month_kind_readings').select('month, audience, kind, videos').eq('client_id', clientId).eq('month', month),
    admin.from('month_audience_stats').select('month, audience, judged, positive, negative, neutral, mixed').eq('client_id', clientId).eq('month', month),
  ])
  if (kindRes.error || statsRes.error) throw new Error(`briefs: kinds and mood: ${(kindRes.error ?? statsRes.error)?.message}`)
  const counts = pooledDenominators(denominators.map((d) => ({ ...d, month })), rivalAudiences)
  const m = buildMarketKinds({
    kindRows: (kindRes.data ?? []) as { month: string; audience: string; kind: string; videos: number }[],
    statsRows: (statsRes.data ?? []) as { month: string; audience: string; judged: number; positive: number; negative: number; neutral: number; mixed: number }[],
    counts, month, prevMonth: null, rivalAudiences, chip: null,
  })
  return { n: m.n, kinds: m.kinds.map((k) => ({ kind: k.kind, k: k.k })), judged: m.judged, mood: m.mood.map((x) => ({ mood: x.mood, k: x.k })) }
}

/** Each brand's own posts published in the month (upload-dated: the
 *  own-post census's clock, lib/reading/own-posts.ts), and how many drew
 *  `OWN_POST_COMMENT_FLOOR` comments or more: the company's, and each tracked
 *  rival's whose accounts are read. One read of the month's own posts. */
export async function loadOwnPostCounts(admin: SupabaseClient, clientId: string, month: string, company: string, tracked: readonly string[]): Promise<OwnPostCount[]> {
  const from = monthStartOf(month)
  const to = nextMonth(from)
  const rows = await selectAll<{ id: string; competitor_name: string | null; is_client: boolean | null; source: string | null; comments_count: number | null }>(() =>
    admin.from('videos').select('id, competitor_name, is_client, source, comments_count').eq('client_id', clientId)
      .in('source', ['owned', 'competitor_owned']).gte('upload_date', from).lt('upload_date', to).order('id'))
  const fold = (x: string) => x.toLowerCase().trim()
  const count = (vs: typeof rows) => ({ posts: vs.length, five: vs.filter((v) => Number(v.comments_count ?? 0) >= OWN_POST_COMMENT_FLOOR).length })
  const own = rows.filter((v) => v.is_client === true)
  return [
    { name: company, you: true, ...count(own) },
    ...tracked.map((t) => ({ name: t, you: false, ...count(rows.filter((v) => v.source === 'competitor_owned' && fold(v.competitor_name ?? '') === fold(t))) })),
  ].filter((r) => r.posts > 0)
}

/** Which subjects each of these insights is a member of (the subjects the
 *  brief reads, `member` true): what a finding's "Part of {subject}" line is
 *  counted from. One small read a chunk of insights; empty where the table is
 *  not there. */
export async function loadInsightSubjects(admin: SupabaseClient, clientId: string, insightIds: readonly string[], subjectIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const ids = [...new Set(insightIds)]
  if (ids.length === 0 || subjectIds.length === 0) return out
  for (let k = 0; k < ids.length; k += 150) {
    const res = await admin.from(TABLE_SUBJECT_MEMBERSHIPS).select('subject_id, audience_insight_id').eq('client_id', clientId)
      .in('audience_insight_id', ids.slice(k, k + 150)).in('subject_id', [...subjectIds]).eq('member', true)
    if (res.error) {
      if (isMissingSubjects(res.error)) return new Map()
      throw new Error(`briefs: subject memberships: ${res.error.message}`)
    }
    for (const r of (res.data ?? []) as { subject_id: string; audience_insight_id: string }[]) {
      const held = out.get(r.audience_insight_id) ?? []
      if (!held.includes(r.subject_id)) held.push(r.subject_id)
      out.set(r.audience_insight_id, held)
    }
  }
  return out
}

/** The month's long-run read, as "What holds so far" prints it: a ready read
 *  of the month, one the month's closing run wrote before one written early
 *  (`partialThrough`). Null where none is ready or the table is not there. */
export async function loadMonthLongRun(admin: SupabaseClient, clientId: string, month: string): Promise<LongRunIn | null> {
  const res = await admin.from(WEEK_READS_TABLE).select('data, created_at').eq('client_id', clientId).eq('kind', 'month').eq('status', 'ready')
    .eq('month', monthStartOf(month)).not('data', 'is', null).order('created_at', { ascending: false }).limit(10)
  if (res.error) {
    if (isMissingWeekReads(res.error)) return null
    throw new Error(`briefs: long-run read: ${res.error.message}`)
  }
  const reads = ((res.data ?? []) as { data: unknown }[]).map((r) => r.data).filter(isLongRunData)
  const read = reads.find((d) => !d.partialThrough) ?? reads[0] ?? null
  if (!read) return null
  return { months: [...read.months], ideas: read.ideas.map((i) => ({ headline: i.headline, videos: i.videos, months: i.months.map((m) => ({ month: m.month, videos: m.videos })) })) }
}

/** A caption that runs a giveaway or a competition: its comments are entries,
 *  not talk about the product (Sealand's DELI2SEA giveaway carried about 149
 *  of its 256 September comments). Not "prizes": an event post that names
 *  its prizes is not a giveaway (Sealand's Move for the Coast posts). */
export const GIVEAWAY = /\b(?:give\s?-?aways?|win\s+(?:a|an|one|this|your)\b|competition|enter\s+to\s+win|to\s+enter\b|tag\s+(?:a|your|two|three|\d+)\s+(?:friends?|mates?))\b/i

/** The company's own giveaway posts and their comments dated in the month.
 *  Two small reads; null where none or not read. */
export async function loadGiveaway(admin: SupabaseClient, clientId: string, month: string): Promise<{ posts: number; comments: number } | null> {
  const from = prevMonth(prevMonth(monthStartOf(month)))
  const to = nextMonth(monthStartOf(month))
  const own = await admin.from('videos').select('video_id, caption').eq('client_id', clientId).eq('is_client', true).gte('upload_date', from).lt('upload_date', to)
  if (own.error) throw new Error(`briefs: own posts: ${own.error.message}`)
  const ids = ((own.data ?? []) as { video_id: string | null; caption: string | null }[]).filter((v) => v.video_id && GIVEAWAY.test(v.caption ?? '')).map((v) => v.video_id as string)
  if (ids.length === 0) return null
  const res = await admin.from('comments').select('id', { count: 'exact', head: true }).eq('client_id', clientId).in('video_id', ids)
    .gte('comment_date', `${monthStartOf(month)}T00:00:00.000Z`).lt('comment_date', `${to}T00:00:00.000Z`)
  if (res.error) throw new Error(`briefs: giveaway comments: ${res.error.message}`)
  return (res.count ?? 0) > 0 ? { posts: ids.length, comments: res.count ?? 0 } : null
}

const warn = (what: string) => (e: unknown) => {
  console.warn(`[briefs] ${what} not read; the brief has less: ${e instanceof Error ? e.message : String(e)}`)
  return null
}

/** The month's window, `[month start, next month start)`. */
export const monthWindow = (month: string) => ({ from: `${monthStartOf(month)}T00:00:00.000Z`, to: `${nextMonth(monthStartOf(month))}T00:00:00.000Z` })

export async function loadBriefSetInputs(
  admin: SupabaseClient,
  opts: {
    clientId: string; month: string; now: Date
    /** The run the research reads (its themes) and the model calls are logged
     *  under. The pipeline's step passes ITS run, which is not completed yet
     *  (and whose themes have replaced the last one's); the script, the newest
     *  delivered run. */
    runId?: string
  },
): Promise<BriefSetInputs> {
  const { clientId } = opts
  const month = monthStartOf(opts.month)
  const window = monthWindow(month)
  const [client, config, run] = await Promise.all([
    admin.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    admin.from('tracking_configs').select('competitor_names, industry_keywords').eq('client_id', clientId).maybeSingle(),
    opts.runId
      ? Promise.resolve({ data: { id: opts.runId }, error: null })
      : admin.from('pipeline_runs').select('id').eq('client_id', clientId).in('status', ['completed', 'partial']).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (client.error) throw new Error(`briefs: client: ${client.error.message}`)
  if (config.error) throw new Error(`briefs: tracking config: ${config.error.message}`)
  if (run.error) throw new Error(`briefs: run: ${run.error.message}`)
  const company = String((client.data as { company_name?: string } | null)?.company_name ?? '').trim() || 'the company'
  const runId = (run.data as { id?: string } | null)?.id
  if (!runId) throw new Error('briefs: no completed run')
  const cfg = (config.data ?? {}) as { competitor_names?: string[]; industry_keywords?: string[] }
  const tracked = (cfg.competitor_names ?? []).map((n) => String(n).trim()).filter(Boolean)

  const rows = await admin.from('month_denominators').select('audience, videos, comments, platform_mix').eq('client_id', clientId).eq('month', month)
  const audiences = rows.error ? null : ((rows.data ?? []) as (AudienceRow & { platform_mix?: Record<string, number> | null })[]).map((r) => ({
    audience: r.audience, videos: Number(r.videos), comments: Number(r.comments),
    platforms: r.platform_mix ? Object.fromEntries(Object.entries(r.platform_mix).map(([k, v]) => [k, Number(v)])) : null,
  }))
  const rivalAudiences = (await loadMarketRivalAudiences(admin, clientId).catch(warn('rival audiences'))) ?? []
  const rivals = (audiences ?? [])
    .filter((r) => isRivalAudience(r.audience) && r.videos >= SHARE_MIN_VIDEOS)
    .map((r) => ({ name: rivalNameOf(r.audience) ?? '', videos: r.videos }))
    .filter((r) => tracked.some((t) => t.toLowerCase() === r.name.toLowerCase()))
    .sort((a, b) => b.videos - a.videos || a.name.localeCompare(b.name))
    .map((r) => r.name)
  const market = audiences ? marketFiguresOf({ week: null, month: audiences, rivals: rivalAudiences }).month : null

  const brands = (await loadTrackedBrands(admin, clientId).catch(warn('tracked brands'))) ?? [company, ...tracked]
  const context = await loadCompanyContext(admin, { clientId, window }).catch(warn('company context'))
  const standing = (await loadStanding(admin, { clientId, month, window, asOf: opts.now, brands }).catch(warn('standing'))) ?? []
  const playbook = await loadPlaybookVideos(admin, clientId, month)
    .then((videos) => buildPlaybook({ month, brand: company, rival: rivals[0] ?? null, videos }))
    .catch(warn('playbook'))
  const sh = await admin.from('run_summary').select('say_vs_hear').eq('client_id', clientId).eq('run_id', runId).maybeSingle()
  const themedRunId = await themedRunAsOf(admin, clientId, opts.now.toISOString()).catch(warn('themed run'))
  const giveaway = await loadGiveaway(admin, clientId, month).catch(warn('giveaway posts'))
  const kinds = audiences ? await loadMarketKinds(admin, clientId, month, audiences, rivalAudiences).catch(warn('kinds and mood')) : null
  const posts = await loadOwnPostCounts(admin, clientId, month, company, tracked).catch(warn('own posts'))
  const longRun = await loadMonthLongRun(admin, clientId, month).catch(warn('long-run read'))
  return {
    clientId,
    company,
    month,
    noun: WHAT_THEY_SELL[clientId] ?? null,
    industryKeywords: (cfg.industry_keywords ?? []).map((k) => String(k).trim()).filter(Boolean),
    tracked,
    rivals,
    audiences,
    market,
    context,
    standing,
    playbook,
    sayVsHear: ((sh.data as { say_vs_hear?: SayVsHearEntry[] } | null)?.say_vs_hear ?? []).filter((e) => e && e.you_say),
    themedRunId,
    runId,
    brands,
    rivalAudiences,
    giveaway,
    kinds,
    posts,
    longRun,
  }
}

/** The set's questions for these inputs. */
export const questionsFor = (i: Pick<BriefSetInputs, 'company' | 'industryKeywords' | 'rivals'>): BriefQuestion[] =>
  allBriefQuestions({ company: i.company, industryKeywords: i.industryKeywords, rivals: i.rivals })

/**
 * Every role's questions, asked of the Ask agent in one run, over the 90 days
 * that end with the brief's month (its reading month set explicitly, so a
 * brief for September written in October reads to the end of September).
 */
export async function researchBriefSet(
  admin: SupabaseClient,
  i: Pick<BriefSetInputs, 'clientId' | 'company' | 'runId' | 'month'>,
  questions: readonly BriefQuestion[],
  opts: { now: Date; budgetUsd: number; parallel?: number; persist?: boolean },
): Promise<{ answers: ResearchAnswer[]; window: { from: string; to: string } | null; costUsd: number }> {
  const { frame, window } = await briefResearchFrame(admin, i, opts.now)
  const r = await runResearch(admin, { clientId: i.clientId, companyName: i.company, runId: i.runId, questions: [...questions], budgetUsd: opts.budgetUsd, frame, now: opts.now, parallel: opts.parallel, persist: opts.persist })
  return { answers: r.answers, window, costUsd: r.costUsd }
}

/** The research's frame (the Ask agent's, its reading month set to the
 *  brief's) and the 90 days it reads. Read once and shared by every question
 *  asked with it. */
export async function briefResearchFrame(
  admin: SupabaseClient,
  i: Pick<BriefSetInputs, 'clientId' | 'month'>,
  now: Date,
): Promise<{ frame: AskFrame; window: { from: string; to: string } | null }> {
  const frame = await loadAskFrame(admin, i.clientId, now)
  const reading = await loadReadingMonth(admin, readingHandle(i.clientId, admin), now.toISOString(), { explicit: i.month }).catch(warn('reading month'))
  const framed = { ...frame, reading: reading ?? frame.reading }
  return { frame: framed, window: askWindow(framed.reading, 'days90', now.toISOString()) }
}

/** The answers of several research runs (the pipeline asks them a wave per
 *  step), in question order, their points numbered G1… across all of them,
 *  as one run numbers them (`runResearch`), so every id is unique in the set.
 *  Pure. */
export function numberPoints(answers: readonly ResearchAnswer[], questions: readonly Pick<BriefQuestion, 'id'>[]): ResearchAnswer[] {
  const order = new Map(questions.map((q, n) => [q.id, n]))
  const sorted = [...answers].sort((a, b) => (order.get(a.question.id) ?? 999) - (order.get(b.question.id) ?? 999))
  let g = 0
  return sorted.map((a) => ({ ...a, grounded: a.grounded.map((p) => ({ ...p, id: `G${++g}` })) }))
}

export interface Grounded {
  points: GroundedPoint[]
  /** Each point's counted citations, best first (they carry the words). */
  counted: Map<string, DatedEvidence[]>
  whoVideos: Map<string, WhoVideo[]>
  brandsOf: Map<string, string[]>
}

/** Every point's evidence over the research window, counted. */
export async function groundBriefResearch(
  admin: SupabaseClient,
  i: Pick<BriefSetInputs, 'clientId' | 'company' | 'brands' | 'rivalAudiences'>,
  answers: readonly ResearchAnswer[],
  questions: readonly BriefQuestion[],
  window: { from: string; to: string },
): Promise<Grounded> {
  const points = allPoints([...answers])
  const ids = [...new Set(points.flatMap((p) => p.insightIds))]
  const period = { from: `${window.from.slice(0, 10)}T00:00:00.000Z`, to: `${window.to.slice(0, 10)}T00:00:00.000Z` }
  const evidence = await loadDatedEvidence(admin, i.clientId, ids, period, { brands: i.brands })
  const competitors = await loadCompetitors(admin, i.clientId).catch(() => [])
  const tracked = trackedBrands(i.clientId, i.company, competitors.map((c) => ({ id: String(c.id), name: c.name })))
  const namings = await loadCommentNamings(admin, { clientId: i.clientId, commentIds: evidence.map((e) => e.commentId), brands: tracked }).catch(() => [])
  const brandsOf = namesByComment(namings)
  const universe = new Set([...marketAudiences(i.rivalAudiences), CLIENT_AUDIENCE])
  const roleOf = new Map(questions.map((q) => [q.id, q.role]))
  const byInsight = new Map<string, DatedEvidence[]>()
  for (const e of evidence) byInsight.set(e.insightId, [...(byInsight.get(e.insightId) ?? []), e])
  const out: Grounded = { points: [], counted: new Map(), whoVideos: new Map(), brandsOf }
  for (const p of points) {
    const role = roleOf.get(p.questionId)
    if (!role) continue
    const rows = p.insightIds.flatMap((id) => byInsight.get(id) ?? [])
    const g = groundPoint({ clientId: i.clientId, company: i.company, insightIds: p.insightIds, claim: p.text, evidence: rows, universe, brandsOf })
    out.points.push(groundedPointOf(p, role, g))
    out.counted.set(p.id, g.counted)
    out.whoVideos.set(p.id, g.whoVideos)
  }
  return out
}

/** The ideas call's output as drafts, each headline through the brief's
 *  scrub (it prints in every brief: as a finding's headline in one and as the
 *  line that names it in the others). A headline the scrub empties is no
 *  idea. Pure. */
export function draftsOf(out: IdeasOutput | null, company: string): IdeaDraft[] {
  return (out?.ideas ?? []).map((d) => ({
    headline: scrubBriefText(d.headline ?? '', Math.round(BRIEF_MAX.headline * 1.25), { company, field: 'headline', whole: true }).text,
    basedOn: d.based_on ?? [],
    home: isBriefRole(d.home) ? d.home : null,
    second: isBriefRole(d.second) ? d.second : null,
  })).filter((d) => d.headline)
}

export interface BriefSet {
  inputs: BriefSetInputs
  questions: BriefQuestion[]
  grounded: Grounded
  ideas: { raw: IdeasOutput; costUsd: number; prompts: { system: string; user: string } }
  check: {
    contradicted: [string, string | null][]; ran: boolean; costUsd: number
    summaries: { contradicted: [string, string | null][]; verdicts: { headline: string; verdict: string }[]; ran: boolean }
  }
  allocation: Allocation
  briefs: Record<BriefRole, {
    data: MonthlyBriefData; raw: BriefOutput | null; prompts: { system: string; user: string } | null; costUsd: number; scrub: unknown
    /** The In short check's record: every line of the printed pages it read,
     *  and the sentences it found they carry (`--from` holds a saved brief to
     *  both, without a model call). */
    printed: { read: string[]; kept: string[] }
  }>
  quotes: QuotePool
  /** Every quote ref the set prints, with the words it resolves to: the
   *  pool's, and the rest (a subject's voice) read once, as the deck will
   *  draw them. Kept in memory and in a dry build's local files; never stored. */
  texts: Map<string, QuoteResolution>
  /** The In short check (inshort.ts): its sentences, its answer, what it
   *  dropped and what it cost. */
  inShort: { items: InShortItem[]; raw: InShortOutput | null; dropped: InShortDrop[]; costUsd: number }
  repeats: { raw: RepeatsOutput; items: RepeatItem[]; verdicts: RepeatVerdict[]; costUsd: number }
  vectors: Map<string, number[]>
  embedUsd: number
  costUsd: number
}

/** The month's ideas, their self-check and where each lives: the set's first
 *  half after the research. One ideas call, one verdict pass, the pure
 *  allocation. A dry run may hand back the ideas and verdicts it kept. */
export async function ideasForSet(
  admin: SupabaseClient,
  i: BriefSetInputs,
  questions: readonly BriefQuestion[],
  points: readonly GroundedPoint[],
  opts: { log: boolean; client?: ParseClient; clock?: BriefClock; ideas?: { raw: IdeasOutput; contradicted: [string, string | null][] } },
): Promise<{
  raw: IdeasOutput; costUsd: number; prompts: { system: string; user: string }
  check: { contradicted: Map<string, string | null>; ran: boolean; costUsd: number }
  allocation: Allocation
}> {
  const call = { admin, clientId: i.clientId, runId: i.runId, log: opts.log, client: opts.client, clock: opts.clock }
  const ideas = opts.ideas
    ? { output: opts.ideas.raw, costUsd: 0, prompts: { system: '', user: '' } }
    : await draftIdeas(call, { company: i.company, month: i.month, noun: i.noun, points: [...points], questions: [...questions], context: i.context })
  const drafts = draftsOf(ideas.output, i.company)
  const check = opts.ideas
    ? { contradicted: new Map(opts.ideas.contradicted), costUsd: 0, ran: true }
    : i.themedRunId
      ? await checkWeekRead(admin, { clientId: i.clientId, runId: i.themedRunId, companyName: i.company, headlines: drafts.map((d) => d.headline), persist: opts.log, budget: checkBudget(opts.clock) })
      : { contradicted: new Map<string, string | null>(), costUsd: 0, ran: false }
  const standing = drafts.filter((d) => !check.contradicted.has(d.headline.trim()))
  const allocation = allocateIdeas(standing, [...points], { month: i.month })
  for (const d of drafts) if (check.contradicted.has(d.headline.trim())) {
    const says = check.contradicted.get(d.headline.trim())
    allocation.held.unshift({ headline: d.headline, reason: `the conversation contradicts it${says ? `: ${says}` : ''}` })
  }
  return { raw: ideas.output, costUsd: ideas.costUsd, prompts: ideas.prompts, check: { contradicted: check.contradicted, ran: check.ran, costUsd: check.costUsd }, allocation }
}

/** One department's writer: the ideas homed there developed into findings,
 *  and the role's own sections from its own research. */
export async function writeRoleBrief(
  admin: SupabaseClient,
  i: BriefSetInputs,
  questions: readonly BriefQuestion[],
  points: readonly GroundedPoint[],
  allocation: Pick<Allocation, 'ideas'>,
  role: BriefRole,
  opts: { log: boolean; client?: ParseClient; clock?: BriefClock },
): Promise<{ raw: BriefOutput; prompts: { system: string; user: string }; costUsd: number }> {
  const call = { admin, clientId: i.clientId, runId: i.runId, log: opts.log, client: opts.client, clock: opts.clock }
  const mine = allocation.ideas.filter((x) => x.home === role)
  const others = allocation.ideas.filter((x) => x.home !== role).map((x) => ({ headline: x.headline, brief: x.home }))
  const w = await writeBrief(call, {
    role, company: i.company, month: i.month, noun: i.noun, ideas: mine, others, points: [...points], questions: [...questions],
    context: i.context, rivals: i.tracked,
    claims: role === 'marketing' ? claimsFor(i) : undefined,
    subjects: role === 'leadership' ? i.standing.map((fact, n) => ({ id: `S${n + 1}`, fact })) : undefined,
  })
  return { raw: w.output, prompts: w.prompts, costUsd: w.costUsd }
}

/**
 * "Also this month, in the other briefs" names only an idea some brief of the
 * set PRINTED as a finding: an idea whose writer wrote nothing, or whose
 * finding was held, is argued nowhere, and a line pointing at it would send a
 * reader to a page that does not exist. Only for a whole set: a dry run that
 * composes one brief cannot see the others' findings. Pure.
 */
export function alsoOnlyPrinted(briefs: readonly MonthlyBriefData[], allocation: Pick<Allocation, 'ideas'>): MonthlyBriefData[] {
  const printed = new Set(briefs.flatMap((d) => d.findings.map((f) => f.ideaId)))
  const headlines = new Set(allocation.ideas.filter((x) => printed.has(x.id)).map((x) => x.headline))
  return briefs.map((d) => {
    const also = d.inShort.also.filter((a) => headlines.has(a.headline))
    if (also.length === d.inShort.also.length) return d
    const dropped = d.inShort.also.filter((a) => !headlines.has(a.headline))
    return {
      ...d,
      inShort: { ...d.inShort, also },
      held: [...d.held, ...dropped.map((a) => ({ what: `also: ${a.headline.slice(0, 80)}`, reason: `no brief printed it as a finding (it was homed in the ${BRIEF_NAME[a.brief]})` }))],
    }
  })
}

/**
 * From grounded research to four composed briefs. The research is passed in
 * (a dry run caches it and writes again without asking twice).
 */
export async function writeBriefSet(
  admin: SupabaseClient,
  i: BriefSetInputs,
  questions: BriefQuestion[],
  grounded: Grounded,
  opts: {
    log: boolean; client?: ParseClient; researchCostUsd?: number; roles?: readonly BriefRole[]
    /** The ideas and their self-check from an earlier write of the same set. */
    ideas?: { raw: IdeasOutput; contradicted: [string, string | null][] }
    /** The allocation an earlier step made of those ideas (the pipeline's
     *  `briefs:ideas`), so the briefs are composed against exactly what their
     *  writers were given. Recomputed from the ideas when absent. */
    allocation?: Allocation
    /** Quote refs the set's other briefs already print. */
    spent?: readonly string[]
    /** A writer's output kept from an earlier write, by role: that brief is
     *  composed again from it and its writer is not called. */
    written?: Partial<Record<BriefRole, BriefOutput>>
    /** Check the summaries again (default). A recompose whose writers were not
     *  called keeps the earlier check's answer instead: pass its contradicted
     *  summaries. */
    summaries?: { contradicted: [string, string | null][] }
    /** The repeat judge's answer from an earlier write of the same set. */
    repeats?: RepeatsOutput
    /** Vectors kept from an earlier write, by text. */
    vectors?: Iterable<[string, number[]]>
    /** The embedder (a test's stand-in); the product's by default, each
     *  request capped (clock.ts). */
    embed?: (texts: string[]) => Promise<number[][]>
    /** The step's clock (the pipeline's `briefs:compose`); absent outside a step. */
    clock?: BriefClock
    /** The words of quote refs the pool does not hold (a subject's voice): the
     *  render's own read by default (a test's stand-in otherwise). */
    quoteWords?: (refs: string[]) => Promise<Map<string, QuoteResolution>>
  },
): Promise<BriefSet> {
  const call = { admin, clientId: i.clientId, runId: i.runId, log: opts.log, client: opts.client, clock: opts.clock }
  let cost = opts.researchCostUsd ?? 0
  // The ideas and their self-check, or the ones a dry run kept (so one brief
  // can be written again against the same allocation as the other three).
  const set = await ideasForSet(admin, i, questions, grounded.points, { log: opts.log, client: opts.client, clock: opts.clock, ideas: opts.ideas })
  const ideas = { output: set.raw, costUsd: set.costUsd, prompts: set.prompts }
  const check = set.check
  cost += ideas.costUsd + check.costUsd
  const allocation = opts.allocation ?? set.allocation

  const claims = claimsFor(i)
  const subjects = i.standing.map((fact, n) => ({ id: `S${n + 1}`, fact }))
  const roles = opts.roles ?? BRIEF_ROLES
  // 1. The writers (or the outputs a dry run kept).
  const raws = {} as Record<BriefRole, { raw: BriefOutput; prompts: { system: string; user: string } | null; costUsd: number }>
  for (const role of roles) {
    const kept = opts.written?.[role] ?? null
    if (kept) { raws[role] = { raw: kept, prompts: null, costUsd: 0 }; continue }
    const w = await writeRoleBrief(admin, i, questions, grounded.points, allocation, role, { log: opts.log, client: opts.client, clock: opts.clock })
    raws[role] = w
    cost += w.costUsd
  }

  // 2. Compose by meaning: a first pass names every text a judgement needs,
  //    those are embedded (writer prose, research paraphrases and insight
  //    descriptions, never a comment's words), and the set is composed again
  //    with the vectors. A text a later pass still wants is embedded and the
  //    pass runs once more.
  // Which subject each finding is part of: the findings' insights' memberships.
  const findingInsights = allocation.ideas.flatMap((x) => x.points).map((id) => grounded.points.find((p) => p.id === id)?.insightIds ?? []).flat()
  const insightSubjects = await loadInsightSubjects(admin, i.clientId, findingInsights, i.standing.filter((f) => f.calibration === 'ready').map((f) => f.subjectId))
    .catch(warn('subject memberships')) ?? new Map<string, string[]>()
  const vectors = new Map<string, number[]>(opts.vectors ?? [])
  const brands = [i.company, ...i.tracked]
  const counted = brandsCountedFor(i.clientId, i.company, i.tracked)
  const composeAll = (meaning: Meaning, verdicts: readonly RepeatVerdict[] | null, ideaTexts: ReadonlyMap<string, string> = new Map()) => {
    const quotes = new QuotePool(grounded.counted, { clientId: i.clientId, company: i.company, brandsOf: grounded.brandsOf, meaning })
    quotes.spend(opts.spent ?? [])
    const out = {} as Record<BriefRole, ReturnType<typeof composeBrief>>
    for (const role of roles) {
      out[role] = composeBrief({
        role, company: i.company, month: i.month, noun: i.noun, allocation, points: grounded.points, whoVideos: grounded.whoVideos, quotes, meaning,
        written: raws[role].raw, rivals: i.tracked, claims: role === 'marketing' ? claims : undefined, subjects, insightSubjects,
        audiences: i.audiences, market: i.market, ownPosts: i.context?.posts.month ?? null, giveaway: i.giveaway ?? null, playbook: i.playbook,
        kinds: i.kinds ?? null, posts: i.posts ?? null, longRun: i.longRun ?? null,
        model: BRIEF_MODEL, costUsd: raws[role].costUsd, brandsCounted: counted,
      })
    }
    // The set: the repeat judge's verdicts, another brief's section named in
    // a line, every such line kept only where what it names prints, then In
    // short against what printed. What prints is the deck's, its voices'
    // words in hand (the pool's), as the page will draw them.
    const words = (ref: string) => quotes.textOf(ref)
    const composed = roles.map((r) => out[r].data)
    const judged = verdicts ? applyRepeats(composed, verdicts, allocation.ideas, { meaning, texts: ideaTexts }) : composed
    const named = footnotesOnlyPrinted(namedAcross(judged, meaning, words), words)
    const finished = named.map((d) => summaryAgainstPrinted(d, meaning, brands, words))
    return { out, composed, finished, quotes }
  }
  const collect = new Meaning(vectors, 'collect')
  composeAll(collect, null)
  let embedUsd = 0
  const embed = opts.embed ?? ((texts: string[]) => embedTexts(texts, callOptions(opts.clock, 'embed')))
  const embedMissing = async (texts: readonly string[]) => {
    const missing = [...new Set(texts)].filter((t) => t && !vectors.has(t))
    if (missing.length === 0) return 0
    const got = await embed(missing)
    missing.forEach((t, n) => vectors.set(t, got[n]))
    embedUsd += estimateCost(EMBEDDING_MODEL, Math.ceil(missing.join(' ').length / 4), 0)
    return missing.length
  }
  await embedMissing(collect.wanted())
  let meaning = new Meaning(vectors, 'vectors')
  let pass = composeAll(meaning, null)
  // The repeat judge reads the composed set (or a dry run's kept answer).
  const repeatItems = repeatItemsOf(pass.composed)
  // Each idea as its finding printed it (what was heard, capped): the
  // headline alone, or its first sentence, can miss the idea's matter.
  const firstSaw = new Map(pass.composed.flatMap((d) => d.findings.map((f) => [f.ideaId, capText(f.saw.join(' '), REPEATS_IDEA_CHARS)] as [string, string])))
  const judge = opts.repeats
    ? { output: opts.repeats, costUsd: 0, prompts: null }
    : repeatItems.length
      ? await judgeRepeats(call, { ideas: allocation.ideas, findings: firstSaw, items: repeatItems })
      : { output: { items: [] }, costUsd: 0, prompts: null }
  cost += judge.costUsd
  const verdicts = verdictsOf(judge.output, repeatItems, allocation.ideas)
  const ideaTexts = new Map(allocation.ideas.map((x) => [x.id, `${x.headline}. ${firstSaw.get(x.id) ?? ''}`.trim()]))
  pass = composeAll(meaning, verdicts, ideaTexts)
  for (let n = 0; n < 2 && meaning.wanted().length > 0; n++) {
    await embedMissing(meaning.wanted())
    meaning = new Meaning(vectors, 'vectors')
    pass = composeAll(meaning, verdicts, ideaTexts)
  }
  cost += embedUsd

  // 3. In short against the pages AS THEY PRINT (the September dry build,
  //    12 Oct: the writer writes it before the paginator leaves thin pages
  //    out). Every quote the set prints is given its words, as the deck will
  //    draw them, so the pages fit as they print; each brief is paginated; and
  //    one check reads each brief's printed pages (never a voice's words)
  //    against its In short. A sentence no printed page carries drops whole.
  const whole = BRIEF_ROLES.every((r) => roles.includes(r))
  const composed = whole ? alsoOnlyPrinted(pass.finished, allocation) : pass.finished
  const texts = new Map<string, QuoteResolution>()
  const refs = [...new Set(composed.flatMap((d) => collectQuoteRefs(d)))]
  for (const ref of refs) {
    const w = pass.quotes.textOf(ref)
    if (w?.text) texts.set(ref, w)
  }
  const unread = refs.filter((r) => !texts.has(r))
  if (unread.length) {
    const read = await (opts.quoteWords ?? ((x: string[]) => fetchQuoteResolutionsByRefs(admin, x)))(unread)
    for (const [ref, w] of read) if (w?.text) texts.set(ref, w)
  }
  const words: QuoteWordsOf = (ref) => {
    const w = texts.get(ref)
    return w ? { text: w.text, english: w.english ?? null, lang: w.lang ?? null } : null
  }
  const pages = new Map(composed.map((d) => [d.role, printedPages(d, words)]))
  const items = inShortItems(composed)
  const printedCheck = items.length
    ? await checkInShort(call, { company: i.company, briefs: composed.map((d) => ({ role: d.role, pages: pages.get(d.role) ?? [] })), items })
    : { output: null, costUsd: 0 }
  cost += printedCheck.costUsd
  const onPages = applyInShort(composed, items, printedCheck.output)
  const finished = onPages.briefs
  const briefs = {} as BriefSet['briefs']
  for (const d of finished) {
    briefs[d.role] = {
      data: d, raw: raws[d.role].raw, prompts: raws[d.role].prompts, costUsd: raws[d.role].costUsd, scrub: { counts: pass.out[d.role].counts, dropped: pass.out[d.role].scrubbed },
      printed: { read: printedLines(pages.get(d.role) ?? []), kept: onPages.kept[d.role] ?? [] },
    }
  }
  // 4. The self-check on the summaries that print, against the conversation
  //    (the review: it had passed summaries that rested on held items).
  //    Sentence by sentence: one contradicted sentence drops, not the summary.
  const summaries = [...new Set(Object.values(briefs).flatMap((x) => splitSentences(x.data.inShort.summary.trim()).map((s) => s.trim())).filter(Boolean))]
  const summaryCheck = opts.summaries
    ? { contradicted: new Map(opts.summaries.contradicted), verdicts: [], costUsd: 0, ran: true }
    : i.themedRunId && summaries.length
    ? await checkWeekRead(admin, { clientId: i.clientId, runId: i.themedRunId, companyName: i.company, headlines: summaries, persist: opts.log, budget: checkBudget(opts.clock) })
    : { contradicted: new Map<string, string | null>(), verdicts: [], costUsd: 0, ran: false }
  cost += summaryCheck.costUsd
  for (const x of Object.values(briefs)) {
    const kept: string[] = []
    for (const s of splitSentences(x.data.inShort.summary.trim()).map((y) => y.trim()).filter(Boolean)) {
      if (!summaryCheck.contradicted.has(s)) { kept.push(s); continue }
      const says = summaryCheck.contradicted.get(s)
      x.data.held.push({ what: `in short: ${s.slice(0, 80)}`, reason: `the conversation contradicts it${says ? `: ${says}` : ''}` })
    }
    x.data.inShort.summary = kept.join(' ')
  }
  return {
    inputs: i,
    questions,
    grounded,
    ideas: { raw: ideas.output, costUsd: ideas.costUsd, prompts: ideas.prompts },
    check: {
      contradicted: [...check.contradicted.entries()], ran: check.ran, costUsd: check.costUsd + summaryCheck.costUsd,
      summaries: { contradicted: [...summaryCheck.contradicted.entries()], verdicts: summaryCheck.verdicts, ran: summaryCheck.ran },
    },
    allocation,
    briefs,
    quotes: pass.quotes,
    texts,
    inShort: { items, raw: printedCheck.output, dropped: onPages.dropped, costUsd: printedCheck.costUsd },
    repeats: { raw: judge.output, items: repeatItems, verdicts, costUsd: judge.costUsd },
    vectors,
    embedUsd,
    costUsd: cost,
  }
}

/** Which brands the product counts talk for: the hand-check gate every page
 *  uses (lib/brands/precision.ts). Pure. */
export function brandsCountedFor(clientId: string, company: string, rivals: readonly string[]): { client: boolean; rivals: string[] } {
  return {
    client: brandCountState(clientId, company) === 'counted',
    rivals: rivals.filter((r) => brandCountState(clientId, r) === 'counted'),
  }
}

/** The company's claims as the marketing writer is shown them: its own-voice
 *  claims in paraphrase, then any the pipeline's say-vs-hear holds that are
 *  not among them, numbered A1, A2…. Pure. */
export function claimsFor(i: Pick<BriefSetInputs, 'context' | 'sayVsHear'>): { id: string; claim: string }[] {
  const seen = new Set<string>()
  const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const out: string[] = []
  for (const c of [...(i.context?.claims ?? []), ...i.sayVsHear.map((e) => e.you_say)]) {
    const k = key(c)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(c.replace(/\s+/g, ' ').trim())
  }
  return out.slice(0, 10).map((claim, n) => ({ id: `A${n + 1}`, claim }))
}
