import { createHash } from 'node:crypto'
import { bucketsAfterRetag, skipRetag } from '../config-log'
import { audienceOf, CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, RIVAL_PREFIX } from '../rivals'
import { normAccount, ownAccountNames, type FlipIdentity } from './owned'
import { matchEntities, type VideoTags } from './tagging'
import { fold } from './util'
import type { GatherConfig } from './types'

// The corpus re-tag's decisions, pure (scripts/run-tagging.ts does the I/O).
//
// A re-tag re-judges which brand every STORED video is about. It moved 253
// Sealand videos on 2026-09-09 and left nothing behind; the 2026-09-24 repair
// makes it two steps with a person between them:
//
//   --plan-out <file>   the dry run, and the only judged pass. It writes the
//                       exact rows that would move (before and after), the
//                       config it was judged under, the code it ran and what
//                       it cost.
//   --apply <file>      replays that plan with no OpenAI call at all, so what
//                       lands is exactly what was reviewed — against a named
//                       project, never while a run is in flight, re-checking
//                       every row's identity and stored tags as it goes.
//
// Everything that decides which row moves, which is skipped and why lives
// here so it can be tested; the script is glue.

/** The production project. --allow-inflight is never accepted against it. */
export const PRODUCTION_REF = 'mkwjlckescdveosvrvaq'
/** The preview branch — the one project --allow-inflight is accepted for,
 *  because of the stale 'analyzing' run ddbbffe4 that exists only there. */
export const STAGING_REF = 'zfmxrrugaihxpubunleu'

/** Run statuses that are finished. Anything else is a run in flight. */
export const SETTLED_RUN_STATUSES = ['completed', 'failed', 'partial'] as const

export const RETAG_PLAN_VERSION = 1

/** A stored video, as much of it as a re-tag reads. */
export interface RetagRow {
  id: string
  video_id: string
  platform: string
  source: string | null
  account_name: string | null
  caption?: string | null
  hashtags?: string[] | null
  comments_count?: number | null
  analyzed_lane?: string | null
  transcript_status?: string | null
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
}

/** One row a plan moves. `id` is the videos row id — video_id alone is only
 *  unique per platform. */
export interface PlannedChange {
  id: string
  video_id: string
  platform: string
  before: VideoTags
  after: VideoTags
}

/** A judged row the plan leaves where it is — the only rows `--set` may add. */
export interface KeptRow {
  id: string
  video_id: string
  platform: string
  tags: VideoTags
}

export interface RetagPlan {
  version: typeof RETAG_PLAN_VERSION
  clientId: string
  /** The project ref the plan was judged against (from the Supabase URL). */
  project: string | null
  createdAt: string
  /** The commit that built the plan, with `+dirty` when the tree was not clean. */
  gitSha: string
  method: string
  promptVersion: string
  configFingerprint: string
  costUsd: number
  /** Videos sent to the judge. */
  judged: number
  failedBatches: number
  errors: string[]
  /** Row ids tagged without a verdict. Never written, and never in `changes`. */
  fallbackIds: string[]
  /** Identity rows (own or tracked-rival posts) the plan never judged. */
  spared: number
  changes: PlannedChange[]
  kept: KeptRow[]
  /** Set when the plan was judged over one platform only. */
  platform?: string
  /** What a reviewer changed with --drop / --set, in order. */
  edits?: string[]
  /** The row ids those edits touched — carried onto the change log's
   *  actor_label, so which rows a person overrode survives the plan file. */
  editedIds?: string[]
  /** The file an edited plan was made from (editPlan via --plan-out). */
  editedFrom?: string
}

const tagsOf = (r: Pick<RetagRow, 'is_client' | 'is_competitor' | 'competitor_name'>): VideoTags => ({
  is_client: Boolean(r.is_client),
  is_competitor: Boolean(r.is_competitor),
  competitor_name: r.competitor_name ?? null,
})

/** Exactly equal, the way the old script compared: all three columns. */
export function sameTags(a: Pick<RetagRow, 'is_client' | 'is_competitor' | 'competitor_name'>, b: VideoTags): boolean {
  const t = tagsOf(a)
  return t.is_client === b.is_client && t.is_competitor === b.is_competitor && t.competitor_name === (b.competitor_name ?? null)
}

// ---- the judged pass, named ------------------------------------------------------

/**
 * One judged pass, named: a hash of what made it — client, project, the moment
 * it was judged, the code, the config. An EDITED plan keeps its base plan's id
 * (the edits are a review of that pass, not a new one), and renaming or moving
 * the file does not change it, so "has this pass been written to the change
 * log" has one answer across every copy of it.
 */
export function planId(plan: Pick<RetagPlan, 'version' | 'clientId' | 'project' | 'createdAt' | 'gitSha' | 'configFingerprint'>): string {
  const basis = { v: plan.version, c: plan.clientId, p: plan.project, t: plan.createdAt, g: plan.gitSha, f: plan.configFingerprint }
  return createHash('sha256').update(stable(basis)).digest('hex').slice(0, 12)
}

/** What an apply writes on actor_label, and what a later apply looks for. */
export function planMarker(plan: Parameters<typeof planId>[0]): string {
  return `plan id ${planId(plan)}`
}

/** Does an entity_retag change-log row for this judged pass exist already? */
export function planAudited(actorLabels: readonly (string | null)[], plan: Parameters<typeof planId>[0]): boolean {
  const marker = planMarker(plan)
  return actorLabels.some((l) => (l ?? '').includes(marker))
}

/** The change-log actor label for an apply: the command, the plan's file name
 *  (never its path — actor_label is tenant-readable), its id, the code that
 *  built it, and every row a reviewer overrode. */
export function applyLabel(plan: RetagPlan, planFileName: string): string {
  const edited = plan.editedIds?.length
    ? ` · reviewer edits on ${plan.editedIds.length} row(s): ${plan.editedIds.join(', ')}`
    : ''
  return `scripts/run-tagging.ts --apply <plan> · plan ${planFileName} · ${planMarker(plan)} built at ${plan.gitSha.slice(0, 12)}${edited}`
}

// ---- identity ------------------------------------------------------------------

/**
 * Who the client and each tracked rival ARE, per platform: the configured
 * handle plus every account name an owned read stored for it — the census
 * rule (ownAccountNames), built exactly as scripts/reconcile-video-source.ts
 * builds it.
 */
export function retagIdentities(
  rows: readonly RetagRow[],
  ownHandles: Record<string, string>,
  competitorHandles: Record<string, Record<string, string>>,
): FlipIdentity[] {
  const identities: FlipIdentity[] = [
    { entity: { kind: 'client' }, names: ownAccountNames([...rows], ownHandles, { source: 'owned' }) },
  ]
  for (const [name, handles] of Object.entries(competitorHandles)) {
    identities.push({
      entity: { kind: 'competitor', name },
      names: ownAccountNames([...rows], handles ?? {}, { source: 'competitor_owned', competitorName: name }),
    })
  }
  return identities
}

/**
 * Why a row's tag is an IDENTITY the re-tag must neither judge nor write — or
 * null when it is a reading of content.
 *
 * BY SOURCE, AND BY ACCOUNT. `source` alone is not enough, and on production it
 * is certainly not: the reconcile that moves discovered-first own posts to
 * 'owned' ran only on the preview branch. A discovered row posted by
 * `sealandgear` with is_client=true from the owned upsert and no brand keyword
 * in its text is not even a candidate, so the judge would call it industry and
 * the re-tag would strip the client's own post — the WP2 failure again. So a
 * row whose account is the client's or a tracked rival's own is spared exactly
 * as an 'owned' row is, whatever its source says.
 */
export function identitySkip(row: RetagRow, identities: readonly FlipIdentity[]): string | null {
  if (skipRetag(row.source)) return `source ${row.source}`
  const account = normAccount(row.account_name)
  if (!account) return null
  for (const idt of identities) {
    if (!idt.names.get(row.platform)?.has(account)) continue
    return idt.entity.kind === 'client' ? 'the client’s own account' : `${idt.entity.name}’s own account`
  }
  return null
}

// ---- the plan ------------------------------------------------------------------

export interface RetagDecision {
  changes: PlannedChange[]
  kept: KeptRow[]
  /** Judged but given no verdict — never written. */
  fallback: RetagRow[]
  /** Identity rows, never judged. */
  spared: { row: RetagRow; reason: string }[]
}

/** The rows a judge may be asked about: everything but the identity rows. */
export function judgeable(rows: readonly RetagRow[], identities: readonly FlipIdentity[]): RetagRow[] {
  return rows.filter((r) => identitySkip(r, identities) === null)
}

/** Letters and digits only, folded: 'Sealand Gear_ZA' → 'sealandgearza'. */
const squash = (x: unknown): string => fold(x).replace(/[^a-z0-9]/g, '')

/** Shortest stem worth matching — 'tnf' or 'the' would match half the corpus. */
const MIN_STEM = 4

export interface AccountStem {
  stem: string
  /** The audience the stem belongs to: 'client' or 'competitor:<name>'. */
  audience: string
}

/**
 * The stems an own or tracked-rival account would carry: the client's handles
 * and brand words ('sealandgear', 'sealand'), each rival's name with and
 * without a leading "the" ('thenorthface', 'northface') and its handles.
 */
export function accountStems(
  config: Pick<GatherConfig, 'brand_keywords' | 'competitor_names' | 'own_handles'>,
  competitorHandles: Record<string, Record<string, string>>,
): AccountStem[] {
  const out = new Map<string, AccountStem>()
  const add = (raw: unknown, audience: string) => {
    const stem = squash(raw)
    if (stem.length >= MIN_STEM && !out.has(`${audience}|${stem}`)) out.set(`${audience}|${stem}`, { stem, audience })
  }
  for (const h of Object.values(config.own_handles ?? {})) add(h, CLIENT_AUDIENCE)
  for (const k of config.brand_keywords ?? []) {
    add(k, CLIENT_AUDIENCE)
    add(`${k}`.replace(/^#/, '').trim().split(/\s+/)[0], CLIENT_AUDIENCE)
  }
  for (const name of config.competitor_names ?? []) {
    const audience = `${RIVAL_PREFIX}${name}`
    add(name, audience)
    add(`${name}`.replace(/^the\s+/i, ''), audience)
    for (const h of Object.values(competitorHandles[name] ?? {})) add(h, audience)
  }
  return [...out.values()]
}

/**
 * Review check (g), independent of identitySkip: the moving rows whose account
 * NAME looks like the client's or a tracked rival's — a YouTube display name
 * the owned read never stored, a platform missing from own_handles, a '_za'
 * variant. identitySkip has already taken out every account it knows, so this
 * lists exactly the ones it did not, for a reviewer to --drop a real own post.
 * The longest matching stem wins, so the line says what it matched on.
 */
export function accountLookalikes<R extends Pick<RetagRow, 'id' | 'account_name'>>(
  rows: readonly R[],
  stems: readonly AccountStem[],
): { row: R; stem: AccountStem }[] {
  const out: { row: R; stem: AccountStem }[] = []
  for (const row of rows) {
    const account = squash(row.account_name)
    if (!account) continue
    const hit = stems.filter((s) => account.includes(s.stem)).sort((a, b) => b.stem.length - a.stem.length)[0]
    if (hit) out.push({ row, stem: hit })
  }
  return out
}

/** Spared identity rows counted by why — by source, and by account (the new
 *  behaviour on production, where own posts were never reconciled). */
export function sparedByReason(spared: readonly { reason: string }[]): [string, number][] {
  const m = new Map<string, number>()
  for (const s of spared) m.set(s.reason, (m.get(s.reason) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** Was this row spared by its ACCOUNT rather than by its source? */
export const sparedByAccount = (reason: string): boolean => !reason.startsWith('source ')

/**
 * Which rows move. `finalTags` and `fallbackIds` are keyed by ROW id (the
 * script passes `id` as the judge's video_id). A row whose tag came from no
 * verdict never moves; an identity row is never judged and never moves.
 */
export function planRetag(
  rows: readonly RetagRow[],
  finalTags: ReadonlyMap<string, VideoTags>,
  fallbackIds: ReadonlySet<string>,
  identities: readonly FlipIdentity[],
  config: GatherConfig,
): RetagDecision {
  const out: RetagDecision = { changes: [], kept: [], fallback: [], spared: [] }
  for (const r of rows) {
    const reason = identitySkip(r, identities)
    if (reason) { out.spared.push({ row: r, reason }); continue }
    const m = matchEntities({ account_name: r.account_name ?? '', caption: r.caption ?? '', hashtags: r.hashtags ?? [] }, config)
    const flagged = m.brand || m.competitors.length > 0
    if (fallbackIds.has(r.id)) { out.fallback.push(r); continue }
    const after = finalTags.get(r.id) ?? { is_client: false, is_competitor: false, competitor_name: null }
    if (!sameTags(r, after)) {
      out.changes.push({ id: r.id, video_id: r.video_id, platform: r.platform, before: tagsOf(r), after })
    } else if (flagged) {
      out.kept.push({ id: r.id, video_id: r.video_id, platform: r.platform, tags: tagsOf(r) })
    }
  }
  return out
}

/** "competitor:Freitag → industry-other" totals, largest first. */
export function pairTotals(changes: readonly Pick<PlannedChange, 'before' | 'after'>[]): [string, number][] {
  const m = new Map<string, number>()
  for (const c of changes) {
    const k = `${audienceOf(c.before)} → ${audienceOf(c.after)}`
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** The audiences a set of moves touched, both sides — `affects.audiences`, so
 *  the change band names Cotopaxi, Freitag and Patagonia rather than nothing. */
export function movedAudiences(changes: readonly Pick<PlannedChange, 'before' | 'after'>[]): string[] {
  const out = new Set<string>()
  for (const c of changes) { out.add(audienceOf(c.before)); out.add(audienceOf(c.after)) }
  return [...out].sort()
}

// ---- the config the plan was judged under ---------------------------------------

function stable(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

/** A short hash of every tracking_configs value a re-tag's outcome depends on:
 *  the terms the judge and the exclusions read, and the handles the identity
 *  skip reads. An edit to any of them between plan and apply refuses the apply. */
export function configFingerprint(
  config: Pick<GatherConfig, 'brand_keywords' | 'competitor_keywords' | 'competitor_names' | 'industry_keywords' | 'exclude_terms' | 'own_handles'>,
  competitorHandles: Record<string, Record<string, string>>,
): string {
  const basis = {
    brand_keywords: config.brand_keywords ?? [],
    competitor_keywords: config.competitor_keywords ?? [],
    competitor_names: config.competitor_names ?? [],
    industry_keywords: config.industry_keywords ?? [],
    exclude_terms: config.exclude_terms ?? [],
    own_handles: config.own_handles ?? {},
    competitor_handles: competitorHandles ?? {},
  }
  return createHash('sha256').update(stable(basis)).digest('hex').slice(0, 16)
}

// ---- the guards --------------------------------------------------------------------

/** 'https://abc.supabase.co' → 'abc'. Null for anything that is not a
 *  Supabase project URL — a local stack has no ref, and cannot be --project. */
export function projectRefOf(url: string | null | undefined): string | null {
  try {
    const host = new URL(url ?? '').hostname
    const m = /^([a-z0-9]{20})\.supabase\.co$/.exec(host)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** Every reason an --apply must not run. Empty means go. */
export function applyRefusals(a: {
  plan: RetagPlan
  clientId: string
  project: string
  supabaseUrl: string | null | undefined
  configFingerprint: string
  inflight: readonly { id: string; status: string }[]
  /** A stale in-flight run to look past, by id or id prefix — staging only,
   *  and only that run: any other run in flight still refuses. */
  allowInflight: string | null
  /** Runs for this client that STARTED after the plan was judged. */
  runsSince?: readonly { id: string; status: string; started_at: string | null }[]
}): string[] {
  const out: string[] = []
  const host = projectRefOf(a.supabaseUrl)
  if (a.plan.version !== RETAG_PLAN_VERSION) out.push(`plan version ${a.plan.version} is not ${RETAG_PLAN_VERSION}`)
  if (host !== a.project) out.push(`the Supabase URL points at ${host ?? 'no Supabase project'}, not --project ${a.project}`)
  if (a.plan.project !== a.project) out.push(`the plan was judged against ${a.plan.project ?? 'no project'}, not ${a.project}`)
  if (a.plan.clientId !== a.clientId) out.push(`the plan is for client ${a.plan.clientId}, not ${a.clientId}`)
  if (a.plan.configFingerprint !== a.configFingerprint) {
    out.push(`the tracking config changed since the plan was judged (${a.plan.configFingerprint} → ${a.configFingerprint}); build a new plan`)
  }
  const fallback = new Set(a.plan.fallbackIds)
  const tainted = a.plan.changes.filter((c) => fallback.has(c.id)).length
  if (tainted > 0) out.push(`${tainted} planned change(s) were tagged without a judge; a plan never writes those`)
  // PART OF THE CORPUS WAS NEVER RE-CHECKED. Each row is still safe (a row
  // with no verdict is never in `changes`), but the change-log row would say
  // the corpus was re-checked when part of it was not — review step (d) says
  // stop, so the apply does too.
  if (a.plan.failedBatches > 0) {
    out.push(`${a.plan.failedBatches} judge batch(es) failed while the plan was built, so part of the corpus was never re-checked; build a new plan`)
  }
  // The plan must name the code that built it — the review is of THAT code.
  if (a.plan.gitSha.endsWith('+dirty')) out.push(`the plan was built from uncommitted code (${a.plan.gitSha.replace(/\+dirty$/, '').slice(0, 12)}+dirty); build it from a clean checkout`)
  else if (!/^[0-9a-f]{7,40}$/.test(a.plan.gitSha)) out.push(`the plan does not name the commit that built it (${a.plan.gitSha}); build it from a clean checkout`)
  // Production takes a JUDGED plan only: a substring plan tags every name
  // match as the brand, the mechanism behind the September noise.
  if (a.project === PRODUCTION_REF && a.plan.method !== 'gpt') {
    out.push(`a ${a.plan.method} plan is refused against production; judge it with --method gpt`)
  }
  // A RUN SINCE THE PLAN. Its gather may have tagged rows the plan never saw
  // (a pre-Sunday plan applied after Sunday is the design's own fallback
  // case), and drift reports only the rows the plan knows about.
  const since = a.runsSince ?? []
  if (since.length > 0) {
    out.push(`a run started after the plan was judged (${since.map((r) => `${r.id} ${r.status}`).join(', ')}); build a new plan`)
  }
  const allow = a.allowInflight
  if (allow !== null) {
    if (a.project !== STAGING_REF) {
      out.push(a.project === PRODUCTION_REF
        ? '--allow-inflight is refused against production'
        : `--allow-inflight is accepted only for the staging ref ${STAGING_REF}`)
    } else if (allow.length < 8) {
      out.push(`--allow-inflight names one run by its id (at least 8 characters), not "${allow}"`)
    }
  }
  const lookPast = (r: { id: string }) => allow !== null && allow.length >= 8 && a.project === STAGING_REF && r.id.startsWith(allow)
  const blocking = a.inflight.filter((r) => !lookPast(r))
  if (blocking.length > 0) {
    out.push(`a run is in flight for this client: ${blocking.map((r) => `${r.id} (${r.status})`).join(', ')}`)
  }
  return out
}

/** More than this share of the planned rows drifted or vanished: the corpus
 *  has moved under the plan, and a mostly-stale plan is not applied. */
export const DRIFT_REFUSAL_SHARE = 0.05

/** The refusal for a plan the corpus has moved under — or null. */
export function driftRefusal(decisions: readonly Pick<ApplyDecision, 'verdict'>[]): string | null {
  const moved = decisions.filter((d) => d.verdict === 'drift' || d.verdict === 'missing').length
  if (decisions.length === 0 || moved / decisions.length <= DRIFT_REFUSAL_SHARE) return null
  return `${moved} of ${decisions.length} planned rows moved or vanished since the plan was judged ` +
    `(more than ${Math.round(DRIFT_REFUSAL_SHARE * 100)}%); build a new plan`
}

// ---- reviewing a plan ------------------------------------------------------------

/** An audience key the tracked set knows, as tags — or null. */
export function tagsForAudience(audience: string, competitorNames: readonly string[]): VideoTags | null {
  const a = audience.trim()
  if (a === CLIENT_AUDIENCE) return { is_client: true, is_competitor: false, competitor_name: null }
  if (a === INDUSTRY_AUDIENCE) return { is_client: false, is_competitor: false, competitor_name: null }
  if (!a.startsWith(RIVAL_PREFIX)) return null
  const name = competitorNames.find((n) => fold(n) === fold(a.slice(RIVAL_PREFIX.length)))
  return name ? { is_client: false, is_competitor: true, competitor_name: name } : null
}

export interface PlanEdits {
  /** Plan rows to leave out — a row id, or a video_id that names one row. */
  drop: string[]
  /** Rows to send somewhere else: `<id>=<audience>`. The row must be one the
   *  judge saw (a planned change or a kept row); its before-state is the one
   *  recorded in the plan, and --apply checks the stored row still has it. */
  set: { id: string; audience: string }[]
}

/**
 * A plan corrected by a reviewer, validated. Throws on anything it cannot
 * apply exactly — an unknown id, an ambiguous one, an audience the tracked set
 * does not know, a row the judge never saw — because a review that half-lands
 * is worse than one that has to be retyped.
 */
export function editPlan(plan: RetagPlan, edits: PlanEdits, competitorNames: readonly string[]): RetagPlan {
  const changes = [...plan.changes]
  const kept = [...plan.kept]
  const log = [...(plan.edits ?? [])]
  const ids = [...(plan.editedIds ?? [])]
  const seen = new Set<string>()
  const find = <T extends { id: string; video_id: string }>(rows: T[], key: string): number => {
    const byId = rows.findIndex((r) => r.id === key)
    if (byId >= 0) return byId
    const byVideo = rows.flatMap((r, i) => (r.video_id === key ? [i] : []))
    if (byVideo.length > 1) throw new Error(`${key} names ${byVideo.length} rows (one per platform); pass the row id`)
    return byVideo[0] ?? -1
  }
  const once = (key: string, i: number, rows: { id: string }[]) => {
    const id = rows[i].id
    if (seen.has(id)) throw new Error(`${key} is edited twice`)
    seen.add(id)
    if (!ids.includes(id)) ids.push(id)
  }
  for (const key of edits.drop) {
    const i = find(changes, key)
    if (i < 0) throw new Error(`--drop ${key}: not a planned change`)
    once(key, i, changes)
    const [c] = changes.splice(i, 1)
    log.push(`dropped ${c.id} (${audienceOf(c.before)} → ${audienceOf(c.after)})`)
  }
  for (const { id: key, audience } of edits.set) {
    const to = tagsForAudience(audience, competitorNames)
    if (!to) throw new Error(`--set ${key}=${audience}: not client, industry-other or a tracked competitor:<name>`)
    const ci = find(changes, key)
    if (ci >= 0) {
      once(key, ci, changes)
      const c = changes[ci]
      if (audienceOf(c.before) === audienceOf(to)) {
        changes.splice(ci, 1)
        log.push(`set ${c.id} back to ${audienceOf(to)} (dropped)`)
      } else {
        changes[ci] = { ...c, after: to }
        log.push(`set ${c.id} to ${audienceOf(to)} (plan said ${audienceOf(c.after)})`)
      }
      continue
    }
    const ki = find(kept, key)
    if (ki < 0) throw new Error(`--set ${key}: not a row the judge saw in this plan`)
    once(key, ki, kept)
    const k = kept[ki]
    if (audienceOf(k.tags) === audienceOf(to)) throw new Error(`--set ${key}=${audience}: it is there already`)
    kept.splice(ki, 1)
    changes.push({ id: k.id, video_id: k.video_id, platform: k.platform, before: k.tags, after: to })
    log.push(`set ${k.id} to ${audienceOf(to)} (plan kept it at ${audienceOf(k.tags)})`)
  }
  return { ...plan, changes, kept, edits: log, editedIds: ids }
}

// ---- applying a plan -------------------------------------------------------------

export type ApplyVerdict = 'write' | 'already' | 'drift' | 'identity' | 'missing'

export interface ApplyDecision {
  change: PlannedChange
  verdict: ApplyVerdict
  /** Why, for everything but 'write'. */
  reason?: string
  /** The stored row it was decided against. */
  stored?: RetagRow
}

/**
 * What --apply does with each planned row, re-checked against the rows as they
 * are NOW:
 *   identity  its source or account now says it is an own or tracked-rival
 *             post — never written, whatever the plan says;
 *   already   the stored tags already equal the plan's after: a re-run after a
 *             partial apply, not a drift. Not written, and not counted again;
 *   drift     the stored tags equal neither side — something else moved it
 *             since the plan (a gather, a hand edit). Left alone and reported;
 *   write     stored equals the plan's before.
 */
export function decideApply(
  plan: Pick<RetagPlan, 'changes'>,
  stored: ReadonlyMap<string, RetagRow>,
  identities: readonly FlipIdentity[],
): ApplyDecision[] {
  return plan.changes.map((change) => {
    const row = stored.get(change.id)
    if (!row) return { change, verdict: 'missing', reason: 'no such row any more' }
    const reason = identitySkip(row, identities)
    if (reason) return { change, verdict: 'identity', reason, stored: row }
    if (sameTags(row, change.after)) return { change, verdict: 'already', reason: 'already applied', stored: row }
    if (!sameTags(row, change.before)) {
      return { change, verdict: 'drift', reason: `stored ${audienceOf(tagsOf(row))}, plan expected ${audienceOf(change.before)}`, stored: row }
    }
    return { change, verdict: 'write', stored: row }
  })
}

/**
 * What the change-log row for an apply records: the moves, and every bucket
 * of the corpus before and after them.
 *
 * AN APPLY WHOSE ROW WAS NEVER LOGGED IS FINISHED BY THE NEXT ONE. The write
 * lands row by row, then one config_changes insert records it; if that insert
 * fails (a PostgREST hiccup) or the process dies mid-write, the rows are
 * written and nothing says so. A re-run finds them 'already' applied — and
 * used to log nothing, leaving the re-tag permanently unaudited, which is the
 * 2026-09-09 failure this whole path exists to prevent (and the row is what
 * restarts the attention panel and names the months and audiences, so the
 * corrections would read as market moves).
 *
 * So when no change-log row names this judged pass (`planAudited`), the
 * 'already' rows are counted in too, with their before-bucket rebuilt from the
 * plan (the stored row already shows the after). When one does, only this
 * apply's own writes are logged, as before.
 */
export function retagAudit(
  rows: readonly RetagRow[],
  decisions: readonly ApplyDecision[],
  writtenIds: ReadonlySet<string>,
  audited: boolean,
): { moves: ApplyDecision[]; before: string[]; after: string[] } {
  const landed = decisions.filter((d) => d.verdict === 'write' && writtenIds.has(d.change.id))
  const already = audited ? [] : decisions.filter((d) => d.verdict === 'already')
  const moves = [...landed, ...already]
  const planBefore = new Map(already.map((d) => [d.change.id, audienceOf(d.change.before)]))
  const before = rows.map((r) => planBefore.get(r.id) ?? audienceOf(r))
  const indexOf = new Map(rows.map((r, i) => [r.id, i]))
  const moved = new Map<number, string>()
  for (const d of moves) {
    const i = indexOf.get(d.change.id)
    if (i !== undefined) moved.set(i, audienceOf(d.change.after))
  }
  return { moves, before, after: bucketsAfterRetag(before, moved) }
}

/**
 * Pass A after a re-tag. Pass A is NOT tag-neutral: only an industry video may
 * cite its transcript or on-screen text as audience evidence, and only a
 * client or rival video keeps claims (pass-a.ts ownerIndustry). A moved video
 * read in the FULL lane keeps the insights its old owner rule produced until
 * something re-reads it — and decideAnalysis has no trigger for a tag change.
 *
 * It does have one for a version: `analyzed_prompt_version` differing from the
 * run's prompt version re-selects a video ('version'). So --apply clears that
 * column on these rows, in the same UPDATE as the tags, and the next run
 * re-reads exactly them. Nothing new is invented; the column is read by
 * decideAnalysis alone.
 */
export function needsPassARead(row: Pick<RetagRow, 'analyzed_lane'>): boolean {
  return row.analyzed_lane === 'full'
}

/** What the next run's Pass A will do about a set of moves, counted. */
export function passAConsequences(moves: readonly { change: Pick<PlannedChange, 'before' | 'after'>; row: RetagRow }[]): {
  reread: number
  enterClaims: number
  leaveClaims: number
} {
  let reread = 0
  let enterClaims = 0
  let leaveClaims = 0
  for (const { change, row } of moves) {
    const brandSideAfter = change.after.is_client || change.after.is_competitor
    const brandSideBefore = change.before.is_client || change.before.is_competitor
    if (needsPassARead(row)) reread++
    // Below the floor, an industry → brand-side video with a transcript
    // qualifies for the claims lane (passALane) and is picked up as new/lane.
    else if (brandSideAfter && !brandSideBefore && row.transcript_status === 'ok') enterClaims++
    // A claims-lane video moved to industry qualifies for nothing ('skip');
    // its claims stop counting because claimEntity reads live tags.
    if (row.analyzed_lane === 'claims_only' && !brandSideAfter) leaveClaims++
  }
  return { reread, enterClaims, leaveClaims }
}
