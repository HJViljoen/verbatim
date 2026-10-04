import type { SupabaseClient } from '@supabase/supabase-js'

import { loadAskFrame } from '../../agent/answer'
import { askWindow } from '../../agent/scope'
import { loadCommentNamings, namesByComment, trackedBrands, type WhoVideo } from '../../brands/attribution'
import { WHAT_THEY_SELL } from '../../pages/market-frame'
import { buildPlaybook, loadPlaybookVideos, type PlaybookBlock } from '../../pages/playbook'
import type { SayVsHearEntry } from '../../pipeline/schemas'
import { marketAudiences } from '../../reading/market'
import { monthStartOf, nextMonth } from '../../reading/month-key'
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
import { composeBrief, SHARE_MIN_VIDEOS, type AudienceRow } from './compose'
import { groundPoint, groundedPointOf } from './ground'
import { BRIEF_MODEL, draftIdeas, writeBrief } from './model'
import { allBriefQuestions, type BriefQuestion } from './questions'
import { QuotePool } from './quotes'
import type { Allocation, BriefRole, GroundedPoint, IdeaDraft, MonthlyBriefData } from './types'
import { BRIEF_ROLES, isBriefRole } from './types'
import type { BriefOutput, IdeasOutput } from './write'

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
}

const warn = (what: string) => (e: unknown) => {
  console.warn(`[briefs] ${what} not read; the brief has less: ${e instanceof Error ? e.message : String(e)}`)
  return null
}

/** The month's window, `[month start, next month start)`. */
export const monthWindow = (month: string) => ({ from: `${monthStartOf(month)}T00:00:00.000Z`, to: `${nextMonth(monthStartOf(month))}T00:00:00.000Z` })

export async function loadBriefSetInputs(admin: SupabaseClient, opts: { clientId: string; month: string; now: Date }): Promise<BriefSetInputs> {
  const { clientId } = opts
  const month = monthStartOf(opts.month)
  const window = monthWindow(month)
  const [client, config, run] = await Promise.all([
    admin.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    admin.from('tracking_configs').select('competitor_names, industry_keywords').eq('client_id', clientId).maybeSingle(),
    admin.from('pipeline_runs').select('id').eq('client_id', clientId).in('status', ['completed', 'partial']).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (client.error) throw new Error(`briefs: client: ${client.error.message}`)
  const company = String((client.data as { company_name?: string } | null)?.company_name ?? '').trim() || 'the company'
  const runId = (run.data as { id?: string } | null)?.id
  if (!runId) throw new Error('briefs: no completed run')
  const cfg = (config.data ?? {}) as { competitor_names?: string[]; industry_keywords?: string[] }
  const tracked = (cfg.competitor_names ?? []).map((n) => String(n).trim()).filter(Boolean)

  const rows = await admin.from('month_denominators').select('audience, videos, comments').eq('client_id', clientId).eq('month', month)
  const audiences = rows.error ? null : ((rows.data ?? []) as AudienceRow[]).map((r) => ({ audience: r.audience, videos: Number(r.videos), comments: Number(r.comments) }))
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
  opts: { now: Date; budgetUsd: number; parallel?: number },
): Promise<{ answers: ResearchAnswer[]; window: { from: string; to: string } | null; costUsd: number }> {
  const frame = await loadAskFrame(admin, i.clientId, opts.now)
  const reading = await loadReadingMonth(admin, readingHandle(i.clientId, admin), opts.now.toISOString(), { explicit: i.month }).catch(warn('reading month'))
  const framed = { ...frame, reading: reading ?? frame.reading }
  const window = askWindow(framed.reading, 'days90', opts.now.toISOString())
  const r = await runResearch(admin, { clientId: i.clientId, companyName: i.company, runId: i.runId, questions: [...questions], budgetUsd: opts.budgetUsd, frame: framed, now: opts.now, parallel: opts.parallel })
  return { answers: r.answers, window, costUsd: r.costUsd }
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

/** The ideas call's output as drafts. Pure. */
export function draftsOf(out: IdeasOutput | null): IdeaDraft[] {
  return (out?.ideas ?? []).map((d) => ({
    headline: d.headline,
    basedOn: d.based_on ?? [],
    home: isBriefRole(d.home) ? d.home : null,
    second: isBriefRole(d.second) ? d.second : null,
  }))
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
  briefs: Record<BriefRole, { data: MonthlyBriefData; raw: BriefOutput | null; prompts: { system: string; user: string } | null; costUsd: number; scrub: unknown }>
  quotes: QuotePool
  costUsd: number
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
  opts: { log: boolean; client?: ParseClient; researchCostUsd?: number; roles?: readonly BriefRole[] },
): Promise<BriefSet> {
  const call = { admin, clientId: i.clientId, runId: i.runId, log: opts.log, client: opts.client }
  let cost = opts.researchCostUsd ?? 0
  const ideas = await draftIdeas(call, { company: i.company, month: i.month, noun: i.noun, points: grounded.points, questions, context: i.context })
  cost += ideas.costUsd
  const drafts = draftsOf(ideas.output)
  const check = i.themedRunId
    ? await checkWeekRead(admin, { clientId: i.clientId, runId: i.themedRunId, companyName: i.company, headlines: drafts.map((d) => d.headline), persist: opts.log })
    : { contradicted: new Map<string, string | null>(), verdicts: [], costUsd: 0, ran: false }
  cost += check.costUsd
  const standing = drafts.filter((d) => !check.contradicted.has(d.headline.trim()))
  const allocation = allocateIdeas(standing, grounded.points, { month: i.month })
  for (const d of drafts) if (check.contradicted.has(d.headline.trim())) {
    const says = check.contradicted.get(d.headline.trim())
    allocation.held.unshift({ headline: d.headline, reason: `the conversation contradicts it${says ? `: ${says}` : ''}` })
  }

  const quotes = new QuotePool(grounded.counted, { clientId: i.clientId, company: i.company, brandsOf: grounded.brandsOf })
  const claims = claimsFor(i)
  const subjects = i.standing.map((fact, n) => ({ id: `S${n + 1}`, fact }))
  const briefs = {} as BriefSet['briefs']
  for (const role of opts.roles ?? BRIEF_ROLES) {
    const mine = allocation.ideas.filter((x) => x.home === role)
    const others = allocation.ideas.filter((x) => x.home !== role).map((x) => ({ headline: x.headline, brief: x.home }))
    let raw: BriefOutput | null = null
    let prompts: { system: string; user: string } | null = null
    let callCost = 0
    const w = await writeBrief(call, {
      role, company: i.company, month: i.month, noun: i.noun, ideas: mine, others, points: grounded.points, questions,
      context: i.context, rivals: i.tracked, claims: role === 'marketing' ? claims : undefined, subjects: role === 'leadership' ? subjects : undefined,
    })
    raw = w.output
    prompts = w.prompts
    callCost = w.costUsd
    cost += callCost
    const composed = composeBrief({
      role, company: i.company, month: i.month, noun: i.noun, allocation, points: grounded.points, whoVideos: grounded.whoVideos, quotes,
      written: raw, rivals: i.tracked, claims: role === 'marketing' ? claims : undefined, subjects: role === 'leadership' ? subjects : undefined,
      audiences: i.audiences, market: i.market, ownPosts: i.context?.posts.month ?? null, playbook: i.playbook, model: BRIEF_MODEL, costUsd: callCost,
    })
    briefs[role] = { data: composed.data, raw, prompts, costUsd: callCost, scrub: composed.counts }
  }
  // The summaries go through the same self-check as the ideas' headlines (the
  // long-run read's rule for its lead): a summary the conversation
  // contradicts does not print, and In short keeps its figures and lines.
  const summaries = Object.values(briefs).map((b) => b.data.inShort.summary.trim()).filter(Boolean)
  const summaryCheck = i.themedRunId && summaries.length
    ? await checkWeekRead(admin, { clientId: i.clientId, runId: i.themedRunId, companyName: i.company, headlines: summaries, persist: opts.log })
    : { contradicted: new Map<string, string | null>(), verdicts: [], costUsd: 0, ran: false }
  cost += summaryCheck.costUsd
  for (const b of Object.values(briefs)) {
    const s = b.data.inShort.summary.trim()
    if (!s || !summaryCheck.contradicted.has(s)) continue
    const says = summaryCheck.contradicted.get(s)
    b.data.held.push({ what: `in short: ${s.slice(0, 80)}`, reason: `the conversation contradicts it${says ? `: ${says}` : ''}` })
    b.data.inShort.summary = ''
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
    quotes,
    costUsd: cost,
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
