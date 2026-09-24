import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { monthsOfVideos } from '../lib/config-affects'
import { audienceOf } from '../lib/rivals'
import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { bucketsAfterRetag, recordConfigChange, retagChange, scriptActor } from '../lib/config-log'
import { tagVideo, type VideoTags } from '../lib/gather/tagging'
import { attributeVideos, ATTRIBUTION_PROMPT_VERSION, type AttributionMethod, type AttrCandidate } from '../lib/gather/attribution'
import { loadGatherConfig } from '../lib/gather/gather'
import {
  applyRefusals,
  configFingerprint,
  decideApply,
  editPlan,
  identitySkip,
  judgeable,
  movedAudiences,
  needsPassARead,
  pairTotals,
  passAConsequences,
  planRetag,
  projectRefOf,
  retagIdentities,
  RETAG_PLAN_VERSION,
  SETTLED_RUN_STATUSES,
  type ApplyDecision,
  type PlanEdits,
  type RetagPlan,
  type RetagRow,
} from '../lib/gather/retag'
import { COMMENT_THRESHOLD, SEALAND_CLIENT_ID as SEALAND } from '../lib/config'

// Corpus re-tag — recomputes entity tags (is_client / is_competitor /
// competitor_name) over videos ALREADY in the DB, with no Apify spend. The
// decisions are pure and tested in lib/gather/retag.ts; this file is the I/O.
//
// THREE WAYS TO RUN IT (env loaded: set -a; source <env>; set +a, or
// node --env-file=… --import tsx scripts/run-tagging.ts …):
//
//   --client <uuid> [--platform <p>] [--method gpt|substring]
//       Inspect. Judges (gpt spends OpenAI — about $0.08 on Sealand) and prints
//       the distribution, the CHANGES table and the review checks. Writes
//       nothing anywhere.
//
//   … --plan-out <file>
//       The same dry run, and the plan it prints is written to <file>: every
//       moving row (id, video_id, platform, before, after), the rows the judge
//       saw and kept, the rows it gave no verdict for, the config fingerprint,
//       the git SHA of this code and what it cost. THE ONLY JUDGED PASS.
//
//   --client <uuid> --apply <file> --project <ref> [--check] [--allow-inflight]
//                  [--drop <id>[,<id>…]] [--set <id>=<audience>]…
//       Replays a reviewed plan with ZERO OpenAI calls. Refuses when the
//       Supabase URL is not <ref>, the plan was judged on another project or
//       for another client, the tracking config has changed since, or a run
//       for the client is in flight (--allow-inflight is accepted for the
//       staging ref only, for its stale 'analyzing' run, and refused for
//       production). Every row is re-checked: an own or tracked-rival post (by
//       source or by account) is never written; a row already at its planned
//       tags is "already applied" and not counted again; a row that moved
//       since the plan is drift and left alone. --drop / --set are the
//       reviewer's corrections, validated against the plan (lib/gather/retag.ts
//       editPlan). --check runs every guard and prints what would be written,
//       and writes nothing. One config_changes row for what landed.
//
//   --write (legacy): judge and write in one go. Refuses when any judge batch
//       failed and while a run is in flight; prefer --plan-out then --apply.
//
// PASS A AFTER A RE-TAG — option (a), an existing mechanism. Pass A is not
// tag-neutral (only an industry video may cite on-camera words as audience
// evidence; only a brand-side video keeps claims), and decideAnalysis has no
// trigger for a tag change. It does re-read any video whose
// analyzed_prompt_version differs from the run's ('version'), so a write here
// clears that column on every moved video Pass A read in the FULL lane, in the
// same UPDATE as the tags. The next run re-reads exactly those; the script
// prints how many and an estimate of what that costs. Below-floor moves need
// nothing: industry → rival videos with a transcript enter the claims lane on
// their own, and rival → industry claims-lane videos drop out of it.
//
// WHAT THIS SCRIPT LEARNED THE HARD WAY.
// 1. It never touches an OWNED or COMPETITOR_OWNED row — nor a DISCOVERED row
//    whose account is the client's or a tracked rival's own (identitySkip).
//    Those tags are an identity stamped by account membership, and on
//    production the discovered-first own posts were never reconciled.
// 2. A write leaves a config_changes row: method, before/after bucket counts,
//    rows moved, rows spared, cost, months and audiences moved. The 2026-09-09
//    re-tag left none, and is still unrecoverable.
// 3. It reads the config the gather reads (loadGatherConfig), exclude_terms
//    included; a hand-written select without them was the 2026-09-17 bug.
// 4. It never writes a row the judge gave no verdict for.

interface Args {
  clientId: string
  clientGiven: boolean
  platform?: string
  method: AttributionMethod
  write: boolean
  planOut: string | null
  apply: string | null
  project: string | null
  allowInflight: boolean
  check: boolean
  edits: PlanEdits
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    clientId: SEALAND, clientGiven: false, method: 'gpt', write: false, planOut: null,
    apply: null, project: null, allowInflight: false, check: false, edits: { drop: [], set: [] },
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`)
      return v
    }
    if (flag === '--client') { a.clientId = next(); a.clientGiven = true }
    else if (flag === '--platform') a.platform = next()
    else if (flag === '--method') a.method = next() as AttributionMethod
    else if (flag === '--write') a.write = true
    else if (flag === '--plan-out') a.planOut = next()
    else if (flag === '--apply') a.apply = next()
    else if (flag === '--project') a.project = next()
    else if (flag === '--allow-inflight') a.allowInflight = true
    else if (flag === '--check') a.check = true
    else if (flag === '--drop') a.edits.drop.push(...next().split(',').map((s) => s.trim()).filter(Boolean))
    else if (flag === '--set') {
      const v = next()
      const at = v.indexOf('=')
      if (at <= 0) throw new Error(`--set takes <id>=<audience>, got ${v}`)
      a.edits.set.push({ id: v.slice(0, at).trim(), audience: v.slice(at + 1).trim() })
    }
    else throw new Error(`unknown flag: ${flag}`)
  }
  if (a.method !== 'gpt' && a.method !== 'substring') throw new Error(`--method is gpt or substring, not ${a.method}`)
  // A default tenant is fine to READ and a footgun to write.
  if ((a.write || a.apply) && !a.clientGiven) throw new Error('--write and --apply require an explicit --client <uuid>')
  if (a.apply && !a.project) throw new Error('--apply requires --project <ref>: the project it is meant to write')
  if (a.apply && (a.write || a.planOut || a.platform)) throw new Error('--apply replays a plan; it takes no --write, --plan-out or --platform')
  if (!a.apply && (a.check || a.allowInflight || a.edits.drop.length || a.edits.set.length)) {
    throw new Error('--check, --allow-inflight, --drop and --set go with --apply')
  }
  if (a.write && a.planOut) throw new Error('--plan-out is the dry run; review it, then --apply it')
  return a
}

type Admin = ReturnType<typeof createAdminClient>

const ROW_COLUMNS =
  'id, video_id, platform, source, account_name, caption, hashtags, comments_count, analyzed_lane, transcript_status, is_client, is_competitor, competitor_name'

async function loadRows(admin: Admin, clientId: string, platform?: string): Promise<RetagRow[]> {
  return selectAll<RetagRow>(() => {
    let q = admin.from('videos').select(ROW_COLUMNS).eq('client_id', clientId)
    if (platform) q = q.eq('platform', platform)
    return q.order('id', { ascending: true })
  })
}

async function loadCompetitorHandles(admin: Admin, clientId: string): Promise<Record<string, Record<string, string>>> {
  const { data, error } = await admin.from('tracking_configs').select('competitor_handles').eq('client_id', clientId).maybeSingle()
  if (error) throw new Error(`tracking_configs.competitor_handles: ${error.message}`)
  return (data?.competitor_handles ?? {}) as Record<string, Record<string, string>>
}

async function loadInflight(admin: Admin, clientId: string): Promise<{ id: string; status: string }[]> {
  const { data, error } = await admin
    .from('pipeline_runs')
    .select('id, status')
    .eq('client_id', clientId)
    .not('status', 'in', `(${SETTLED_RUN_STATUSES.join(',')})`)
  if (error) throw new Error(`pipeline_runs: ${error.message}`)
  return (data ?? []) as { id: string; status: string }[]
}

/** This client's average Pass A call, for the re-read estimate. One bounded
 *  read; null when there is nothing to average. */
async function passACallCost(admin: Admin, clientId: string): Promise<number | null> {
  const { data, error } = await admin
    .from('ai_call_log')
    .select('cost_usd')
    .eq('client_id', clientId)
    .eq('pass', 'pass_a')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error || !data?.length) return null
  const costs = (data as { cost_usd: number | string | null }[]).map((r) => Number(r.cost_usd)).filter(Number.isFinite)
  return costs.length ? costs.reduce((s, c) => s + c, 0) / costs.length : null
}

function gitSha(): string {
  try {
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim() !== ''
    return dirty ? `${sha}+dirty` : sha
  } catch {
    return 'unknown'
  }
}

function tally(labels: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of labels) m.set(l, (m.get(l) ?? 0) + 1)
  return new Map([...m.entries()].sort((a, b) => b[1] - a[1]))
}

function printTally(title: string, m: Map<string, number>, total: number) {
  console.log(`  ${title}`)
  for (const [label, n] of m) {
    const pct = total ? Math.round((n / total) * 100) : 0
    console.log(`    ${label.padEnd(28)} ${String(n).padStart(4)}  (${pct}%)`)
  }
}

const trim = (s: string | null | undefined, n: number) => [...(s ?? '').replace(/\s+/g, ' ').trim()].slice(0, n).join('')

/** What the next run's Pass A does about these moves, said plainly. */
async function printPassA(admin: Admin, clientId: string, moves: { change: ApplyDecision['change']; row: RetagRow }[], verb: string) {
  const { reread, enterClaims, leaveClaims } = passAConsequences(moves)
  const perCall = reread > 0 ? await passACallCost(admin, clientId) : null
  console.log('\n=== PASS A ON THE NEXT RUN ===')
  console.log(`  ${reread} moved video(s) were read in the full lane; ${verb} clears their analyzed_prompt_version, so the next run re-reads them under the new owner rule (reason 'version').`)
  if (reread > 0) {
    console.log(perCall === null
      ? '  cost: no Pass A calls on record for this client to estimate from.'
      : `  cost: about $${(reread * perCall).toFixed(4)} (${reread} × this client's average Pass A call, $${perCall.toFixed(5)}).`)
  }
  console.log(`  ${enterClaims} moved to a brand with a transcript and below the comment floor: they enter the claims lane on their own.`)
  console.log(`  ${leaveClaims} claims-lane video(s) moved to industry-other: their claims stop counting under the rival.`)
}

/**
 * Write each move as a compare-and-set on the row exactly as it was read —
 * source and all three tag columns — so a gather or a hand edit landing
 * between the read and the write is refused, not overwritten. A full-lane
 * video also loses its analyzed_prompt_version in the same statement (Pass A,
 * above). Keeps going past a failure; returns what landed.
 */
async function writeMoves(admin: Admin, clientId: string, moves: { change: ApplyDecision['change']; row: RetagRow }[]) {
  const written: typeof moves = []
  const lost: string[] = []
  const errs: string[] = []
  for (const m of moves) {
    const s = m.row
    const payload: Record<string, unknown> = {
      is_client: m.change.after.is_client,
      is_competitor: m.change.after.is_competitor,
      competitor_name: m.change.after.competitor_name,
      ...(needsPassARead(s) ? { analyzed_prompt_version: null } : {}),
    }
    let q = admin.from('videos').update(payload, { count: 'exact' }).eq('id', s.id).eq('client_id', clientId)
    q = s.source === null ? q.is('source', null) : q.eq('source', s.source)
    q = s.is_client === null ? q.is('is_client', null) : q.eq('is_client', s.is_client)
    q = s.is_competitor === null ? q.is('is_competitor', null) : q.eq('is_competitor', s.is_competitor)
    q = s.competitor_name === null ? q.is('competitor_name', null) : q.eq('competitor_name', s.competitor_name)
    const { error, count } = await q
    if (error) errs.push(`${s.id}: ${error.message}`)
    else if (count === 0) lost.push(s.id)
    else written.push(m)
  }
  return { written, lost, errs }
}

/** The config_changes row for what actually landed. Returns whether it was
 *  recorded. Counts, not row ids: which buckets grew and which shrank. */
async function logMoves(admin: Admin, a: {
  clientId: string
  rows: RetagRow[]
  written: { change: ApplyDecision['change']; row: RetagRow }[]
  spared: number
  method: string
  costUsd: number
  label: string
  note?: string
}): Promise<boolean> {
  const bucketsBefore = a.rows.map((r) => audienceOf(r))
  const indexOf = new Map(a.rows.map((r, i) => [r.id, i]))
  const applied = new Map<number, string>()
  for (const w of a.written) {
    const i = indexOf.get(w.change.id)
    if (i !== undefined) applied.set(i, audienceOf(w.change.after))
  }
  // The MONTHS it moved, computed now because nothing can compute them later:
  // `videos` has no updated_at and no history. The rows are already written,
  // so a failure here costs the band and not the re-tag.
  let months: string | null = null
  try {
    months = await monthsOfVideos(admin, a.clientId, a.written.map((w) => ({ platform: w.row.platform, video_id: w.row.video_id })))
  } catch (e) {
    console.error(`affected months not computed: ${(e as Error).message}`)
  }
  const audiences = movedAudiences(a.written.map((w) => w.change))
  console.log(months ? `months moved: ${months}` : 'months moved: not known')
  console.log(`audiences moved: ${audiences.join(', ')}`)
  return recordConfigChange(admin, retagChange({
    affects: { months, audiences },
    clientId: a.clientId,
    actor: scriptActor(a.label),
    method: a.method,
    before: Object.fromEntries(tally(bucketsBefore)),
    after: Object.fromEntries(tally(bucketsAfterRetag(bucketsBefore, applied))),
    rowsAffected: a.written.length,
    skipped: a.spared,
    costUsd: a.costUsd,
    note: a.note,
  }))
}

// ---- judge (inspect, --plan-out, legacy --write) ---------------------------------

async function judge(args: Args) {
  const admin = createAdminClient()
  // The gather's own view of the config — exclude_terms included — so the
  // re-tag and the gather cannot disagree about what a term is.
  const config = await loadGatherConfig(args.clientId)
  const competitorHandles = await loadCompetitorHandles(admin, args.clientId)
  const fingerprint = configFingerprint(config, competitorHandles)

  console.log('Tracking config:')
  console.log(`  brand_keywords:    ${JSON.stringify(config.brand_keywords)}`)
  console.log(`  competitor_names:  ${JSON.stringify(config.competitor_names)}`)
  console.log(`  exclude_terms:     ${JSON.stringify(config.exclude_terms)}`)
  console.log(`  fingerprint:       ${fingerprint}`)
  console.log('')

  const rows = await loadRows(admin, args.clientId, args.platform)
  const identities = retagIdentities(rows, config.own_handles ?? {}, competitorHandles)

  // Identity rows never reach the judge. The judge's key is the ROW id —
  // video_id is only unique per platform.
  const candidates: AttrCandidate[] = judgeable(rows, identities).map((r) => ({
    video_id: r.id,
    account_name: r.account_name ?? '',
    caption: r.caption ?? '',
    hashtags: r.hashtags ?? [],
  }))
  if (args.method === 'gpt') {
    console.log(
      `! --method gpt asks OpenAI about every substring candidate among ${candidates.length} videos, and it does that\n` +
      '  BEFORE it knows whether you asked to write. --method substring is the free path.\n',
    )
  }
  console.log(`Attributing ${candidates.length} of ${rows.length} videos (method=${args.method})…\n`)
  const result = await attributeVideos(candidates, { method: args.method, config })
  const decision = planRetag(rows, result.tags, result.fallbackIds, identities, config)
  const byId = new Map(rows.map((r) => [r.id, r]))
  const sparedIds = new Set(decision.spared.map((s) => s.row.id))

  // The inspector's three columns, over the whole corpus (a spared row keeps
  // its stored tag).
  const UNTAGGED: VideoTags = { is_client: false, is_competitor: false, competitor_name: null }
  const finalAudience = (r: RetagRow): string => audienceOf(sparedIds.has(r.id) ? r : (result.tags.get(r.id) ?? UNTAGGED))
  const account = rows.map((r) => audienceOf(tagVideo({ account_name: r.account_name ?? '', caption: '', hashtags: [] }, config)))
  const substring = rows.map((r) => audienceOf(tagVideo({ account_name: r.account_name ?? '', caption: r.caption ?? '', hashtags: r.hashtags ?? [] }, config)))
  const finals = rows.map(finalAudience)
  const finalCb = rows.filter((r) => (r.comments_count ?? 0) >= COMMENT_THRESHOLD).map(finalAudience)

  console.log(`=== BUCKET DISTRIBUTION — ${rows.length} videos${args.platform ? ` (${args.platform})` : ''} ===`)
  printTally('account-only (old):', tally(account), rows.length)
  console.log('')
  printTally('content substring:', tally(substring), rows.length)
  console.log('')
  printTally('content + judge (final):', tally(finals), rows.length)
  console.log(`\n=== COMMENT-BEARING ONLY (>= ${COMMENT_THRESHOLD} comments — what feeds Pass A) — ${finalCb.length} videos ===`)
  printTally('content + judge (final):', tally(finalCb), finalCb.length)

  // THE REVIEW TABLE: every row that moves, grouped by pair, biggest first.
  const pairs = pairTotals(decision.changes)
  console.log(`\n=== CHANGES — ${decision.changes.length} rows move ===`)
  for (const [pair, n] of pairs) console.log(`  ${pair.padEnd(52)} ${String(n).padStart(4)}`)
  const order = new Map(pairs.map(([p], i) => [p, i]))
  const sorted = [...decision.changes].sort((a, b) =>
    (order.get(`${audienceOf(a.before)} → ${audienceOf(a.after)}`)! - order.get(`${audienceOf(b.before)} → ${audienceOf(b.after)}`)!) ||
    ((byId.get(b.id)?.comments_count ?? 0) - (byId.get(a.id)?.comments_count ?? 0)))
  for (const c of sorted) {
    const r = byId.get(c.id)!
    console.log(
      `  ${`${audienceOf(c.before)} → ${audienceOf(c.after)}`.padEnd(52)} [${r.platform}] @${trim(r.account_name, 30)} ` +
      `lane=${r.analyzed_lane ?? '-'} ${r.comments_count ?? 0} cmts id=${r.id} "${trim(r.caption, 80)}"`,
    )
  }

  if (decision.fallback.length) {
    console.log(`\n=== NO VERDICT — ${decision.fallback.length} rows the judge did not answer for; NEVER written ===`)
    for (const r of decision.fallback.slice(0, 20)) console.log(`  [${r.platform}] @${trim(r.account_name, 30)}: "${trim(r.caption, 70)}"`)
    if (decision.fallback.length > 20) console.log(`  … +${decision.fallback.length - 20} more`)
  }

  // The skeptic's review checks, as numbers a reviewer can read off.
  const clientLoss = decision.changes.filter((c) => c.before.is_client && !c.after.is_client)
  const identityInPlan = decision.changes.filter((c) => identitySkip(byId.get(c.id)!, identities) !== null).length
  console.log('\n=== REVIEW CHECKS ===')
  console.log(`  (c) owned / competitor_owned rows in the plan:            ${decision.changes.filter((c) => ['owned', 'competitor_owned'].includes(byId.get(c.id)!.source ?? '')).length}`)
  console.log(`  (d) failed judge batches:                                 ${result.failedBatches}${result.errors.length ? ` — ${result.errors.join('; ')}` : ''}`)
  console.log(`      rows with no verdict (never written):                 ${decision.fallback.length}`)
  console.log(`  (f) client → not client moves (each listed below):       ${clientLoss.length}`)
  for (const c of clientLoss) { const r = byId.get(c.id)!; console.log(`        ${r.id} [${r.platform}] @${trim(r.account_name, 30)}: "${trim(r.caption, 70)}"`) }
  console.log(`  (g) moving rows on an own or tracked-rival account:      ${identityInPlan}`)
  console.log(`      own / rival-owned rows spared (never judged):        ${decision.spared.length}`)

  await printPassA(admin, args.clientId, decision.changes.map((c) => ({ change: c, row: byId.get(c.id)! })), '--apply')

  console.log('\n=== SUMMARY ===')
  console.log(`videos:                 ${rows.length}`)
  console.log(`judged:                 ${result.gptJudged}`)
  console.log(`rejected by a verdict:  ${result.rejected}`)
  console.log(`no verdict:             ${result.fallbackIds.size}`)
  console.log(`failedBatches:          ${result.failedBatches}`)
  console.log(`rows whose tags change: ${decision.changes.length}`)
  console.log(`attribution cost:       $${result.costUsd.toFixed(5)}`)

  const plan: RetagPlan = {
    version: RETAG_PLAN_VERSION,
    clientId: args.clientId,
    project: projectRefOf(process.env.NEXT_PUBLIC_SUPABASE_URL),
    createdAt: new Date().toISOString(),
    gitSha: gitSha(),
    method: args.method,
    promptVersion: args.method === 'gpt' ? ATTRIBUTION_PROMPT_VERSION : 'substring',
    configFingerprint: fingerprint,
    costUsd: result.costUsd,
    judged: result.gptJudged,
    failedBatches: result.failedBatches,
    errors: result.errors,
    fallbackIds: [...result.fallbackIds],
    spared: decision.spared.length,
    changes: decision.changes,
    kept: decision.kept,
    ...(args.platform ? { platform: args.platform } : {}),
  }
  if (plan.gitSha.endsWith('+dirty')) console.warn('\n! the working tree has uncommitted changes; the plan records the SHA as +dirty.')

  if (args.planOut) {
    writeFileSync(args.planOut, JSON.stringify(plan, null, 2) + '\n')
    console.log(`\nplan written: ${args.planOut} (${plan.changes.length} changes, project ${plan.project ?? 'none'}, ${plan.gitSha.slice(0, 12)})`)
    console.log('nothing written to the database. Review the CHANGES above, then --apply the file.')
    return
  }
  if (!args.write) {
    console.log('\n(dry — no writes. Re-run with --plan-out <file> to keep the plan, then --apply it.)')
    return
  }

  // Legacy --write. Never over a failed batch: its rows carry no verdict, and
  // a re-tag that half-judged the corpus must be re-run, not written.
  if (result.failedBatches > 0) {
    console.error(`\nREFUSED: ${result.failedBatches} judge batch(es) failed. Nothing written; re-run it.`)
    process.exit(1)
  }
  const inflight = await loadInflight(admin, args.clientId)
  if (inflight.length) {
    console.error(`\nREFUSED: a run is in flight for this client: ${inflight.map((r) => `${r.id} (${r.status})`).join(', ')}. Nothing written.`)
    process.exit(1)
  }
  const moves = decision.changes.map((c) => ({ change: c, row: byId.get(c.id)! }))
  console.log(`\nWriting ${moves.length} updated tags…`)
  const { written, lost, errs } = await writeMoves(admin, args.clientId, moves)
  console.log(`updated ${written.length}/${moves.length}${lost.length ? `; ${lost.length} moved since they were read, left alone` : ''}${errs.length ? `; ${errs.length} errors:\n  ${errs.slice(0, 10).join('\n  ')}` : ''}`)
  if (written.length === 0) return
  const logged = await logMoves(admin, {
    clientId: args.clientId,
    rows,
    written,
    spared: decision.spared.length,
    method: args.method,
    costUsd: result.costUsd,
    label: `scripts/run-tagging.ts --write --method ${args.method}${args.platform ? ` --platform ${args.platform}` : ''}`,
    note: args.platform ? `${args.platform} only` : undefined,
  })
  console.log(logged ? 'change log: recorded.' : 'change log: NOT recorded (see the error above).')
  if (!logged || errs.length) process.exit(1)
}

// ---- --apply -------------------------------------------------------------------

async function apply(args: Args) {
  const planFile = args.apply!
  const project = args.project!
  let plan = JSON.parse(readFileSync(planFile, 'utf8')) as RetagPlan
  if (!plan || !Array.isArray(plan.changes) || !Array.isArray(plan.kept) || !Array.isArray(plan.fallbackIds)) {
    throw new Error(`${planFile} is not a re-tag plan`)
  }

  const guard = (fingerprint: string, inflight: { id: string; status: string }[]) => {
    const refusals = applyRefusals({
      plan,
      clientId: args.clientId,
      project,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      configFingerprint: fingerprint,
      inflight,
      allowInflight: args.allowInflight,
    })
    if (refusals.length === 0) return
    console.error('REFUSED — nothing written:')
    for (const r of refusals) console.error(`  - ${r}`)
    process.exit(1)
  }
  // Twice. First before ANY database access — a wrong host, project, client or
  // --allow-inflight is refused without reading the wrong project at all —
  // then with what only the database can say: the config now, and the runs.
  guard(plan.configFingerprint, [])
  const admin = createAdminClient()
  const config = await loadGatherConfig(args.clientId)
  const competitorHandles = await loadCompetitorHandles(admin, args.clientId)
  const inflight = await loadInflight(admin, args.clientId)
  guard(configFingerprint(config, competitorHandles), inflight)
  if (inflight.length) console.warn(`! --allow-inflight on ${project}: ignoring ${inflight.map((r) => `${r.id} (${r.status})`).join(', ')}`)

  if (args.edits.drop.length || args.edits.set.length) {
    plan = editPlan(plan, args.edits, config.competitor_names ?? [])
    console.log('reviewer edits:')
    for (const e of plan.edits ?? []) console.log(`  ${e}`)
  }

  console.log(`plan ${basename(planFile)}: ${plan.changes.length} changes · judged ${plan.createdAt} at ${plan.gitSha.slice(0, 12)} · ${plan.method} (${plan.promptVersion}) · $${plan.costUsd.toFixed(5)} · failedBatches ${plan.failedBatches}`)
  console.log(`project ${project} · client ${args.clientId} · config ${plan.configFingerprint} unchanged · 0 OpenAI calls\n`)

  // The whole corpus, not only the planned rows: identity is learned from the
  // owned rows, and the change log counts every bucket before and after.
  const rows = await loadRows(admin, args.clientId)
  const identities = retagIdentities(rows, config.own_handles ?? {}, competitorHandles)
  const decisions = decideApply(plan, new Map(rows.map((r) => [r.id, r])), identities)
  const by = (v: ApplyDecision['verdict']) => decisions.filter((d) => d.verdict === v)
  const moves = by('write').map((d) => ({ change: d.change, row: d.stored! }))

  console.log('=== APPLY ===')
  console.log(`  write:    ${moves.length}`)
  console.log(`  already:  ${by('already').length}  (at their planned tags — a re-run, not counted again)`)
  for (const v of ['drift', 'identity', 'missing'] as const) {
    const ds = by(v)
    console.log(`  ${`${v}:`.padEnd(9)} ${ds.length}${ds.length ? '  (left alone)' : ''}`)
    for (const d of ds.slice(0, 20)) console.log(`    ${d.change.id} [${d.change.platform}] ${audienceOf(d.change.before)} → ${audienceOf(d.change.after)}: ${d.reason}`)
    if (ds.length > 20) console.log(`    … +${ds.length - 20} more`)
  }
  await printPassA(admin, args.clientId, moves, args.check ? '--apply' : 'this apply')

  if (args.check) {
    console.log('\n--check: every guard passed; nothing written.')
    return
  }
  if (moves.length === 0) {
    console.log('\nnothing to write — no change-log row (a re-run of an applied plan is not a second change).')
    return
  }

  console.log(`\nWriting ${moves.length} rows…`)
  const { written, lost, errs } = await writeMoves(admin, args.clientId, moves)
  console.log(`updated ${written.length}/${moves.length}${lost.length ? `; ${lost.length} moved between the read and the write, left alone` : ''}${errs.length ? `; ${errs.length} errors:\n  ${errs.slice(0, 10).join('\n  ')}` : ''}`)
  if (written.length === 0) process.exit(errs.length ? 1 : 0)

  const spared = rows.filter((r) => identitySkip(r, identities) !== null).length
  const edited = plan.edits?.length ? ` · ${plan.edits.length} reviewer edit(s)` : ''
  // The plan's FILE NAME and the code's SHA, never its path: actor_label is
  // tenant-readable, and a path names the operator's machine.
  const logged = await logMoves(admin, {
    clientId: args.clientId,
    rows,
    written,
    spared,
    method: plan.method,
    costUsd: plan.costUsd,
    label: `scripts/run-tagging.ts --apply <plan> · plan ${basename(planFile)} built at ${plan.gitSha.slice(0, 12)}${edited}`,
    note: plan.platform ? `${plan.platform} only` : undefined,
  })
  console.log(logged ? 'change log: recorded.' : 'change log: NOT recorded (see the error above).')
  if (!logged || errs.length) process.exit(1)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.apply) return apply(args)
  return judge(args)
}

main().catch((e) => {
  console.error('run-tagging failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
