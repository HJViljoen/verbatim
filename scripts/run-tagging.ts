import { execSync } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { monthsOfVideos } from '../lib/config-affects'
import { audienceOf } from '../lib/rivals'
import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { CONFIG_CHANGES_TABLE, recordConfigChange, retagChange, scriptActor } from '../lib/config-log'
import { tagVideo, type VideoTags } from '../lib/gather/tagging'
import { attributeVideos, ATTRIBUTION_PROMPT_VERSION, type AttributionMethod, type AttrCandidate } from '../lib/gather/attribution'
import { loadGatherConfig } from '../lib/gather/gather'
import {
  accountLookalikes,
  accountStems,
  applyLabel,
  applyRefusals,
  configFingerprint,
  decideApply,
  driftRefusal,
  editPlan,
  identitySkip,
  judgeable,
  movedAudiences,
  needsPassARead,
  pairTotals,
  passAConsequences,
  planAudited,
  planMarker,
  planRetag,
  projectRefOf,
  retagAudit,
  retagIdentities,
  RETAG_PLAN_VERSION,
  SETTLED_RUN_STATUSES,
  sparedByAccount,
  sparedByReason,
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
// THE WAYS TO RUN IT (env loaded: set -a; source <env>; set +a, or
// node --env-file=… --import tsx scripts/run-tagging.ts …). The first line it
// prints is the project it is pointed at.
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
//       the git SHA of this code and what it cost. THE ONLY JUDGED PASS. The
//       file must not exist (a retry never replaces a reviewed plan) and its
//       directory must be writable — both checked before any OpenAI spend.
//
//   --client <uuid> --apply <file> --project <ref> [--check] [--allow-inflight <run id>]
//       Replays a reviewed plan with ZERO OpenAI calls. Refuses when the
//       Supabase URL is not <ref>, the plan was judged on another project or
//       for another client, the tracking config has changed since, a judge
//       batch failed, the plan was built from uncommitted code, a run has
//       started since the plan was judged, more than 5% of its rows have moved
//       since, or a run for the client is in flight (--allow-inflight <run id>
//       looks past that ONE run, on the staging ref only — its stale
//       'analyzing' run ddbbffe4 — and is refused for production). Every row
//       is re-checked: an own or tracked-rival post (by source or by account)
//       is never written; a row already at its planned tags is "already
//       applied"; a row that moved since the plan is drift and left alone.
//       --check runs every guard and prints what would be written, and writes
//       nothing. One config_changes row for what landed — and if an earlier
//       apply of the same plan landed rows and left no change-log row (the
//       insert failed, or the process died mid-write), this one records those
//       too (lib/gather/retag.ts retagAudit).
//
//   --client <uuid> --apply <file> --project <ref> --check --plan-out <edited>
//                  [--drop <id>[,<id>…]] [--set <id>=<audience>]…
//       A REVIEWER'S CORRECTIONS MAKE A NEW PLAN FILE, and nothing else. The
//       edits are validated against the plan (editPlan) and written, with
//       their list and the row ids they touched, to <edited>; the real apply
//       then takes <edited> with no edit flags, so the judgments written are
//       exactly the ones reviewed and the change log names every row a person
//       overrode. --drop / --set are refused on a writing --apply.
//
//   --write is GONE. It judged and wrote in one go with none of the guards
//       above; the plan and the apply are the only write path.
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
  planOut: string | null
  apply: string | null
  project: string | null
  /** The stale in-flight run to look past (staging only), by id or prefix. */
  allowInflight: string | null
  check: boolean
  edits: PlanEdits
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    clientId: SEALAND, clientGiven: false, method: 'gpt', planOut: null,
    apply: null, project: null, allowInflight: null, check: false, edits: { drop: [], set: [] },
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
    else if (flag === '--write') {
      throw new Error('--write is gone: judge with --plan-out <file>, review it, then --apply <file> --project <ref>. ' +
        'Judging and writing in one go had none of the plan/apply guards.')
    }
    else if (flag === '--plan-out') a.planOut = next()
    else if (flag === '--apply') a.apply = next()
    else if (flag === '--project') a.project = next()
    else if (flag === '--allow-inflight') a.allowInflight = next()
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
  const edits = a.edits.drop.length + a.edits.set.length > 0
  // A default tenant is fine to READ and a footgun to write.
  if (a.apply && !a.clientGiven) throw new Error('--apply requires an explicit --client <uuid>')
  if (a.apply && !a.project) throw new Error('--apply requires --project <ref>: the project it is meant to write')
  if (a.apply && a.platform) throw new Error('--apply replays a plan; it takes no --platform')
  // THE EDITS ARE A NEW PLAN, NEVER FLAGS ON A WRITE. They lived only on the
  // command line: the --check paste and the real --apply paste had to carry
  // identical flags and nothing tied them together, so a `--drop` left off
  // the real apply stripped is_client from the very post the review saved.
  if (a.apply && edits && !(a.check && a.planOut)) {
    throw new Error('--drop / --set make a NEW plan: add --check --plan-out <edited.json>, review it, then --apply that file with no edit flags')
  }
  if (a.apply && a.planOut && !edits) throw new Error('--plan-out with --apply writes an edited plan; it needs --drop or --set')
  if (a.apply && a.planOut && resolve(a.planOut) === resolve(a.apply)) throw new Error('--plan-out must name a new file, not the plan being edited')
  if (!a.apply && (a.check || a.allowInflight !== null || edits)) {
    throw new Error('--check, --allow-inflight, --drop and --set go with --apply')
  }
  return a
}

type Admin = ReturnType<typeof createAdminClient>

const ROW_COLUMNS =
  'id, video_id, platform, source, account_name, caption, hashtags, comments_count, analyzed_lane, transcript_status, is_client, is_competitor, competitor_name'
/** What --apply needs: identity, tags and the Pass A lane — no caption or
 *  hashtags, which only the judge reads, so the production read is lighter. */
const APPLY_COLUMNS =
  'id, video_id, platform, source, account_name, comments_count, analyzed_lane, transcript_status, is_client, is_competitor, competitor_name'

async function loadRows(admin: Admin, clientId: string, platform?: string, columns: string = ROW_COLUMNS): Promise<RetagRow[]> {
  return selectAll<RetagRow>(() => {
    // Typed as the full list so the untyped client's select parser accepts a
    // runtime string; RetagRow's caption and hashtags are optional either way.
    let q = admin.from('videos').select(columns as typeof ROW_COLUMNS).eq('client_id', clientId)
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

/** Runs for the client that STARTED after the plan was judged. */
async function loadRunsSince(admin: Admin, clientId: string, since: string): Promise<{ id: string; status: string; started_at: string | null }[]> {
  const { data, error } = await admin
    .from('pipeline_runs')
    .select('id, status, started_at')
    .eq('client_id', clientId)
    .gt('started_at', since)
  if (error) throw new Error(`pipeline_runs since the plan: ${error.message}`)
  return (data ?? []) as { id: string; status: string; started_at: string | null }[]
}

/** The client's entity_retag change-log rows, newest first — so an apply knows
 *  whether this judged pass is on file. A read that fails refuses the apply:
 *  without the answer it would either log twice or not at all. */
async function loadRetagLog(admin: Admin, clientId: string): Promise<{ changed_at: string; actor_label: string | null }[]> {
  const { data, error } = await admin
    .from(CONFIG_CHANGES_TABLE)
    .select('changed_at, actor_label')
    .eq('client_id', clientId)
    .eq('surface', 'entity_retag')
    .order('changed_at', { ascending: false })
  if (error) throw new Error(`config_changes (entity_retag): ${error.message} — nothing written; the apply must know whether this plan is on the change log already`)
  return (data ?? []) as { changed_at: string; actor_label: string | null }[]
}

/**
 * A plan file is never overwritten, and a bad path is found before the money
 * is spent: a retry of the dry run would otherwise replace the REVIEWED plan
 * with a new, nondeterministic judgment under the same name. The write itself
 * is exclusive too (`flag: 'wx'`), for the race.
 */
function checkNewFile(path: string) {
  if (existsSync(path)) throw new Error(`${path} exists; a plan file is never overwritten — name a new one`)
  try {
    accessSync(dirname(resolve(path)), constants.W_OK)
  } catch (e) {
    throw new Error(`cannot write ${path}: ${(e as Error).message}`)
  }
}

const shortSha = (sha: string) => (sha.endsWith('+dirty') ? `${sha.replace(/\+dirty$/, '').slice(0, 12)}+dirty` : sha.slice(0, 12))

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

/** The config_changes row for what landed (retagAudit). Returns whether it was
 *  recorded. Counts, not row ids: which buckets grew and which shrank. */
async function logMoves(admin: Admin, a: {
  clientId: string
  audit: ReturnType<typeof retagAudit>
  spared: number
  method: string
  costUsd?: number
  label: string
  note?: string
}): Promise<boolean> {
  // The MONTHS it moved, computed now because nothing can compute them later:
  // `videos` has no updated_at and no history. The rows are already written,
  // so a failure here costs the band and not the re-tag.
  let months: string | null = null
  try {
    months = await monthsOfVideos(admin, a.clientId, a.audit.moves.map((m) => ({ platform: m.change.platform, video_id: m.change.video_id })))
  } catch (e) {
    console.error(`affected months not computed: ${(e as Error).message}`)
  }
  const audiences = movedAudiences(a.audit.moves.map((m) => m.change))
  console.log(months ? `months moved: ${months}` : 'months moved: not known')
  console.log(`audiences moved: ${audiences.join(', ')}`)
  return recordConfigChange(admin, retagChange({
    affects: { months, audiences },
    clientId: a.clientId,
    actor: scriptActor(a.label),
    method: a.method,
    before: Object.fromEntries(tally(a.audit.before)),
    after: Object.fromEntries(tally(a.audit.after)),
    rowsAffected: a.audit.moves.length,
    skipped: a.spared,
    costUsd: a.costUsd,
    note: a.note,
  }))
}

// ---- judge (inspect, --plan-out) ---------------------------------------------------

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

  // The plan is dated by when the corpus was READ, not when the judge finished:
  // --apply refuses a plan older than any run that started since, and a run
  // that started while the judge was working has already moved these rows.
  const readAt = new Date().toISOString()
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
      `! --method gpt asks OpenAI about every substring candidate among ${candidates.length} videos.\n` +
      '  --method substring is the free path, and its plan is refused against production.\n',
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
  const changeById = new Map(decision.changes.map((c) => [c.id, c]))
  // (g) INDEPENDENT OF identitySkip. planRetag has already taken out every row
  // identitySkip knows, so re-asking it always read 0 and proved nothing. The
  // question (g) exists for is the accounts it does NOT know: a YouTube display
  // name the owned read never stored, a platform missing from own_handles, a
  // '_za' variant. So it lists every MOVING row whose account name carries the
  // client's or a tracked rival's stem, for a reviewer to --drop a real one.
  const lookalikes = accountLookalikes(decision.changes.map((c) => byId.get(c.id)!), accountStems(config, competitorHandles))
  const byAccount = decision.spared.filter((s) => sparedByAccount(s.reason))
  console.log('\n=== REVIEW CHECKS ===')
  console.log(`  (c) owned / competitor_owned rows in the plan (0 by construction): ${decision.changes.filter((c) => ['owned', 'competitor_owned'].includes(byId.get(c.id)!.source ?? '')).length}`)
  console.log(`      own / rival-owned rows spared, never judged:          ${decision.spared.length}`)
  for (const [why, n] of sparedByReason(decision.spared)) console.log(`        ${why.padEnd(44)} ${String(n).padStart(4)}`)
  if (byAccount.length) {
    // The new behaviour on production, where the discovered-first own posts
    // were never reconciled: spared by ACCOUNT although the source says
    // discovered. Each is listed so the review can confirm it is theirs.
    console.log(`      spared by ACCOUNT (source says otherwise) — confirm each is really theirs:`)
    for (const { row: r, reason } of byAccount) {
      console.log(`        ${r.id} [${r.platform}] source=${r.source ?? '-'} @${trim(r.account_name, 30)} stored ${audienceOf(r)} — ${reason}: "${trim(r.caption, 60)}"`)
    }
  }
  console.log(`  (d) failed judge batches:                                 ${result.failedBatches}${result.errors.length ? ` — ${result.errors.join('; ')}` : ''}`)
  console.log(`      rows with no verdict (never written):                 ${decision.fallback.length}`)
  console.log(`  (f) client → not client moves (each listed below):       ${clientLoss.length}`)
  for (const c of clientLoss) { const r = byId.get(c.id)!; console.log(`        ${r.id} [${r.platform}] @${trim(r.account_name, 30)}: "${trim(r.caption, 70)}"`) }
  console.log(`  (g) moving rows whose account looks like an own or tracked-rival one: ${lookalikes.length}`)
  for (const { row: r, stem } of lookalikes) {
    const c = changeById.get(r.id)!
    console.log(`        ${r.id} [${r.platform}] @${trim(r.account_name, 30)} ~${stem.audience} ('${stem.stem}') ${audienceOf(c.before)} → ${audienceOf(c.after)}: "${trim(r.caption, 60)}"`)
  }
  if (lookalikes.length) console.log('      a real own or rival post among them: --apply <plan> --project <ref> --drop <id> --check --plan-out <edited.json>')

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
    createdAt: readAt,
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
  if (plan.gitSha.endsWith('+dirty')) console.warn('\n! the working tree has uncommitted changes; the plan records the SHA as +dirty, and --apply will refuse it.')

  if (args.planOut) {
    // Exclusive: a reviewed plan is never replaced (checkNewFile ran before
    // the judge was paid; this is the race).
    writeFileSync(args.planOut, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' })
    console.log(`\nplan written: ${args.planOut} (${plan.changes.length} changes, project ${plan.project ?? 'none'}, ${shortSha(plan.gitSha)}, ${planMarker(plan)})`)
    console.log('nothing written to the database. Review the CHANGES above, then --apply the file.')
    return
  }
  console.log('\n(dry — no writes. Re-run with --plan-out <file> to keep the plan, then --apply it.)')
}

// ---- --apply -------------------------------------------------------------------

async function apply(args: Args) {
  const planFile = args.apply!
  const project = args.project!
  let plan = JSON.parse(readFileSync(planFile, 'utf8')) as RetagPlan
  if (!plan || !Array.isArray(plan.changes) || !Array.isArray(plan.kept) || !Array.isArray(plan.fallbackIds)) {
    throw new Error(`${planFile} is not a re-tag plan`)
  }

  const guard = (
    fingerprint: string,
    inflight: { id: string; status: string }[],
    runsSince: { id: string; status: string; started_at: string | null }[],
  ) => {
    const refusals = applyRefusals({
      plan,
      clientId: args.clientId,
      project,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      configFingerprint: fingerprint,
      inflight,
      allowInflight: args.allowInflight,
      runsSince,
    })
    if (refusals.length === 0) return
    console.error('REFUSED — nothing written:')
    for (const r of refusals) console.error(`  - ${r}`)
    process.exit(1)
  }
  // Twice. First before ANY database access — a wrong host, project, client,
  // plan or --allow-inflight is refused without reading the wrong project at
  // all — then with what only the database can say: the config now, and the
  // runs in flight or started since the plan.
  guard(plan.configFingerprint, [], [])
  const admin = createAdminClient()
  const config = await loadGatherConfig(args.clientId)
  const competitorHandles = await loadCompetitorHandles(admin, args.clientId)
  const inflight = await loadInflight(admin, args.clientId)
  const runsSince = await loadRunsSince(admin, args.clientId, plan.createdAt)
  guard(configFingerprint(config, competitorHandles), inflight, runsSince)
  if (inflight.length) console.warn(`! --allow-inflight ${args.allowInflight} on ${project}: looking past ${inflight.map((r) => `${r.id} (${r.status})`).join(', ')}`)
  // The apply should run from the commit that built the plan (the merged
  // one). Not refused — the plan, not this checkout, holds the judgments — but
  // said, because the guards and the Pass A clearing are this checkout's.
  const head = gitSha()
  if (head !== plan.gitSha) console.warn(`! this checkout is ${shortSha(head)}; the plan was built at ${shortSha(plan.gitSha)}.`)

  if (args.edits.drop.length || args.edits.set.length) {
    plan = { ...editPlan(plan, args.edits, config.competitor_names ?? []), editedFrom: basename(planFile) }
    console.log('reviewer edits:')
    for (const e of plan.edits ?? []) console.log(`  ${e}`)
  }

  console.log(`plan ${basename(planFile)} · ${planMarker(plan)}: ${plan.changes.length} changes · judged ${plan.createdAt} at ${shortSha(plan.gitSha)} · ${plan.method} (${plan.promptVersion}) · $${plan.costUsd.toFixed(5)} · failedBatches ${plan.failedBatches}`)
  if (plan.editedIds?.length) console.log(`  reviewed: ${plan.editedIds.length} row(s) edited${plan.editedFrom ? ` from ${plan.editedFrom}` : ''} — ${plan.editedIds.join(', ')}`)
  console.log(`project ${project} · client ${args.clientId} · config ${plan.configFingerprint} unchanged · 0 OpenAI calls\n`)

  // The whole corpus, not only the planned rows: identity is learned from the
  // owned rows, and the change log counts every bucket before and after.
  const rows = await loadRows(admin, args.clientId, undefined, APPLY_COLUMNS)
  const identities = retagIdentities(rows, config.own_handles ?? {}, competitorHandles)
  const decisions = decideApply(plan, new Map(rows.map((r) => [r.id, r])), identities)
  const by = (v: ApplyDecision['verdict']) => decisions.filter((d) => d.verdict === v)
  const moves = by('write').map((d) => ({ change: d.change, row: d.stored! }))
  const already = by('already')

  console.log('=== APPLY ===')
  console.log(`  write:    ${moves.length}`)
  console.log(`  already:  ${already.length}  (at their planned tags — written by an earlier apply of this plan)`)
  for (const v of ['drift', 'identity', 'missing'] as const) {
    const ds = by(v)
    console.log(`  ${`${v}:`.padEnd(9)} ${ds.length}${ds.length ? '  (left alone)' : ''}`)
    for (const d of ds.slice(0, 20)) console.log(`    ${d.change.id} [${d.change.platform}] ${audienceOf(d.change.before)} → ${audienceOf(d.change.after)}: ${d.reason}`)
    if (ds.length > 20) console.log(`    … +${ds.length - 20} more`)
  }
  const stale = driftRefusal(decisions)
  if (stale) {
    console.error(`\nREFUSED — nothing written:\n  - ${stale}`)
    process.exit(1)
  }

  // IS THIS JUDGED PASS ON THE CHANGE LOG ALREADY? If an earlier apply landed
  // rows and its change-log insert failed (or it died mid-write), nothing else
  // can record them, so this apply does (retagAudit).
  const onFile = (await loadRetagLog(admin, args.clientId)).find((l) => planAudited([l.actor_label], plan)) ?? null
  const audited = onFile !== null
  console.log(audited
    ? `\nchange log: this plan is on file (${onFile!.changed_at}); an apply logs only its own new writes.`
    : `\nchange log: nothing on file for this plan yet; an apply records ${moves.length + already.length} row(s)` +
      (already.length ? ` — ${already.length} of them written by an earlier apply that left no change-log row.` : '.'))
  await printPassA(admin, args.clientId, moves, args.check ? '--apply' : 'this apply')

  if (args.check) {
    if (args.planOut) {
      writeFileSync(args.planOut, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' })
      console.log(`\nedited plan written: ${args.planOut} (${plan.changes.length} changes, ${plan.edits?.length ?? 0} edit(s)). Review it, then --apply THAT file with no edit flags.`)
    }
    console.log('\n--check: every guard passed; nothing written to the database.')
    return
  }
  if (moves.length === 0 && (audited || already.length === 0)) {
    console.log('\nnothing to write — no change-log row (a re-run of an applied, logged plan is not a second change).')
    return
  }

  let written: { change: ApplyDecision['change']; row: RetagRow }[] = []
  let errs: string[] = []
  if (moves.length > 0) {
    console.log(`\nWriting ${moves.length} rows…`)
    const res = await writeMoves(admin, args.clientId, moves)
    written = res.written
    errs = res.errs
    console.log(`updated ${written.length}/${moves.length}${res.lost.length ? `; ${res.lost.length} moved between the read and the write, left alone` : ''}${errs.length ? `; ${errs.length} errors:\n  ${errs.slice(0, 10).join('\n  ')}` : ''}`)
  }
  const audit = retagAudit(rows, decisions, new Set(written.map((w) => w.change.id)), audited)
  if (audit.moves.length === 0) process.exit(errs.length ? 1 : 0)
  if (!audited && already.length) console.log(`recording ${already.length} row(s) an earlier apply of this plan wrote without a change-log row.`)

  const spared = rows.filter((r) => identitySkip(r, identities) !== null).length
  const logged = await logMoves(admin, {
    clientId: args.clientId,
    audit,
    spared,
    method: plan.method,
    // The judged pass's OpenAI spend, once: a second row for a pass already on
    // file did not spend it again.
    costUsd: audited ? undefined : plan.costUsd,
    label: applyLabel(plan, basename(planFile)),
    note: plan.platform ? `${plan.platform} only` : undefined,
  })
  console.log(logged
    ? 'change log: recorded.'
    : 'change log: NOT recorded (see the error above). The rows are written. Re-run the same --apply: it finds no change-log row for this plan and records everything the plan has landed.')
  if (!logged || errs.length) process.exit(1)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  // WHICH PROJECT, FIRST — before anything is read, judged or written. The
  // env is whatever was sourced, and `node --env-file` does not override a
  // variable already exported in the shell.
  console.log(`project ${projectRefOf(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? 'none (NEXT_PUBLIC_SUPABASE_URL is not a Supabase project URL)'}`)
  if (args.planOut) checkNewFile(args.planOut)
  if (args.apply) return apply(args)
  return judge(args)
}

main().catch((e) => {
  console.error('run-tagging failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
