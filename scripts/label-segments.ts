import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'

import { SEALAND_CLIENT_ID } from '../lib/config'
import { recordConfigChange, scriptActor, type ConfigActor } from '../lib/config-log'
import { asChangeInput, type LoggedChangeInput } from '../lib/config-surfaces-mf1'
import { assertProject, modeLine, parseScriptArgs, type ScriptArgs } from '../lib/ops/market-first-args'
import { logAiCall } from '../lib/pipeline/ai-log'
import {
  isMissingObject, monthVideosFromExport, readConfigChanges, readExportFile, readMonthVideos, readProvenanceFile,
  readProvenanceTable, readVerdicts, readVideos, type Pages, type VideoRow,
} from '../lib/provenance/load'
import { CATEGORY_AUDIENCE, type MonthVideo } from '../lib/provenance/searches'
import { resolvedHints, segmentHintsFor } from '../lib/segments/hints'
import {
  SEGMENT_JUDGE_BATCH, SEGMENT_JUDGE_MODEL, SEGMENT_JUDGE_PASS, SEGMENT_JUDGE_PROMPT_VERSION, SEGMENT_JUDGE_VERSION,
  judgeSegmentBatch, projectJudgeCost, segmentJudgeBatches, type SegmentCandidate, type SegmentJudgeClient,
} from '../lib/segments/judge'
import { SEGMENT_RULE_VERSION, segmentOfReason, segmentReason, segmentRulesEnabled, type Segment } from '../lib/segments/rules'
import {
  SEGMENT_V2_NOTE, V2_PLAN_KIND, freshJudgements, judgeRows, parseMaxUsd, parsePlan, tallyLabels, v2Mode,
  type PlanCall, type PlanLabel, type PlanVideo, type V2Plan,
} from '../lib/segments/v2'
import { createAdminClient, selectAll } from '../lib/supabase-admin'

// segments_v1 labels on every stored video (market-first decision F, plan
// WP1.4; the last of Heinrich's four --apply pastes on Wed 30 Sep, after
// reconstruct-provenance, whose first-found terms the noise rule reads).
//
// A LABEL, NEVER A DELETION. It writes `video_segments` rows (method 'rule',
// rule_version 'segments_v1') and one `config_changes` row on the surface
// 'segment', WITH NO NOTE (Heinrich, 27 Sep: "lets just not add those notes";
// plan §8): the app titles the row by its surface, and no sentence explaining
// the change is stored for a client to read. Nothing is deleted and no month
// table is touched: September's main rows are untouched, and every labelled
// video stays in every count.
//
// THE VIDEOS ADMITTED UNJUDGED. A gate verdict with source 'default' admitted a
// video without judging it (a failed batch fell open; on staging 64 of
// September's 625 category videos). Each goes through the free heuristic gate
// (lib/gather/relevance.ts heuristicVerdict, the one run-relevance.ts
// --method heuristic runs; no model call): one it finds off-topic is marked
// noise with reason 'unjudged_admission', and the rest keep their v1 label with
// ';unjudged_admission' added to the reason, so the change list can name them.
//
// Switched on only for a tenant SEGMENT_RULES_ENABLED names (Sealand); it
// refuses any other. READ-ONLY BY DEFAULT: it prints the counts, the maker share
// of the Aug–Sep category videos (the done-when's 30–36%), and with
// --hand-check <file> writes 20 flagged and 20 unflagged September category
// videos, md5-ordered, for the precision hand check. With --apply --project
// <ref> it inserts the rule rows the table does not hold yet. It never prompts.
//
//   node --env-file=.env.local --import tsx scripts/label-segments.ts --project <ref> \
//     [--export <file>] [--provenance <file>] [--hand-check <file>] [--apply]
//
// --rule segments_v2 (plan WP3.2) runs the JUDGE instead (lib/segments/judge.ts,
// `labelSegmentsV2` below). Read-only by default and model-free by default:
// it calls the model only behind --spend, and never in the same paste as a
// write. Without --rule, or with --rule segments_v1, this file behaves exactly
// as before, and refuses the v2 flags.

const NAME = 'label-segments'
const INSERT_CHUNK = 500

/** The one change row the labels are logged with: surface 'segment', field
 *  segments_v1, and NO NOTE (27 Sep; the note constant this file held is gone,
 *  so nothing can store or print it). lib/provenance/change-notes.test.ts
 *  holds it to `note: null`. */
export function segmentChangeRow(args: { clientId: string; actor: ConfigActor; rowsAffected: number }): LoggedChangeInput {
  return { clientId: args.clientId, surface: 'segment', field: SEGMENT_RULE_VERSION, actor: args.actor, rowsAffected: args.rowsAffected, note: null }
}

/** The planned change row as the dry run prints it: "note: none" (the note in
 *  quotes only if one ever came back, which run/mf-helper.mjs refuses). */
export function segmentRowLine(row: Pick<LoggedChangeInput, 'note'>): string {
  const note = row.note?.trim() ? `"${row.note.trim()}"` : 'none'
  return `  new row: segment ${SEGMENT_RULE_VERSION}, written with the labels · note: ${note}`
}

const md5 = (s: string): string => createHash('md5').update(s).digest('hex')

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME, values: ['export', 'provenance', 'hand-check', 'rule', 'plan-out', 'from-plan', 'max-usd'], flags: ['spend', 'full-lane'],
    defaultClient: SEALAND_CLIENT_ID,
  })
  const rule = args.values.rule ?? SEGMENT_RULE_VERSION
  if (rule !== SEGMENT_RULE_VERSION && rule !== 'segments_v2') {
    throw new Error(`${NAME}: --rule is segments_v1 (the default) or segments_v2, got ${rule}`)
  }
  const v2Only = ['plan-out', 'from-plan', 'max-usd'].filter((f) => args.values[f] !== undefined)
    .concat(['spend', 'full-lane'].filter((f) => args.flags.has(f)))
  const v1Only = ['export', 'provenance', 'hand-check'].filter((f) => args.values[f] !== undefined)
  if (rule === SEGMENT_RULE_VERSION && v2Only.length > 0) throw new Error(`${NAME}: --${v2Only[0]} belongs to --rule segments_v2`)
  if (rule !== SEGMENT_RULE_VERSION && v1Only.length > 0) throw new Error(`${NAME}: --${v1Only[0]} belongs to segments_v1`)
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(modeLine(args, NAME))
  if (rule === 'segments_v2') return labelSegmentsV2(args)
  if (!segmentRulesEnabled(args.clientId)) {
    throw new Error(`${NAME}: no segment rule is switched on for ${args.clientId} (lib/segments/rules.ts SEGMENT_RULES_ENABLED). Nothing read.`)
  }
  // The heuristic gate makes no model call, but its module builds the OpenAI
  // client at import, which needs a key to exist. A placeholder is set only
  // when none is, and nothing here ever calls it.
  process.env.OPENAI_API_KEY ??= 'unused-heuristic-gate-only'
  const { heuristicVerdict } = await import('../lib/gather/relevance')

  const admin = createAdminClient()
  const pages: Pages = { n: 0 }
  const [videos, verdicts, changes] = await Promise.all([
    readVideos(admin, args.clientId, pages, { text: true }),
    readVerdicts(admin, args.clientId, pages),
    readConfigChanges(admin, args.clientId, pages),
  ])
  const provenance = args.values.provenance
    ? readProvenanceFile(args.values.provenance)
    : await readProvenanceTable(admin, args.clientId, pages)
  if (provenance == null) console.log('  video_provenance is not there (MF1 not applied): the noise rule reads source_keywords only; pass --provenance <plan file>')

  const unjudged = new Set(verdicts.filter((v) => v.kept && v.source === 'default').map((v) => `${v.platform}\u0000${v.video_id}`))
  const labels = new Map<string, { segment: Segment; reason: string | null }>()
  let unjudgedOff = 0
  let unjudgedKept = 0
  for (const v of videos) {
    const p = provenance?.get(v.id)
    let reason = segmentReason({
      caption: v.caption, hashtags: v.hashtags, topics: v.topics,
      firstTerms: p?.first_terms, firstSubreddits: p?.first_subreddits, firstEvidence: p?.evidence, sourceKeywords: v.source_keywords,
    })
    let segment = segmentOfReason(reason)
    if (unjudged.has(`${v.platform}\u0000${v.video_id}`)) {
      const h = heuristicVerdict({ video_id: v.video_id, account_name: v.account_name ?? '', caption: v.caption ?? '', hashtags: v.hashtags ?? [] })
      if (h && !h.relevant) {
        segment = 'noise'
        reason = 'unjudged_admission'
        unjudgedOff++
      } else {
        reason = reason ? `${reason};unjudged_admission` : 'unjudged_admission'
        unjudgedKept++
      }
    }
    labels.set(v.id, { segment, reason })
  }
  const tally = (ids: Iterable<string>) => {
    const t: Record<Segment, number> = { maker: 0, noise: 0, market: 0 }
    for (const id of ids) t[labels.get(id)!.segment]++
    return t
  }
  const all = tally(labels.keys())
  console.log(`  ${videos.length} videos: maker ${all.maker} · noise ${all.noise} · market ${all.market}`)
  console.log(`  admitted unjudged (a default verdict): ${unjudgedOff + unjudgedKept}, of which the heuristic gate finds ${unjudgedOff} off-topic`)

  // The maker share the done-when names: Aug–Sep category videos.
  const exportFile = args.values.export ? readExportFile(args.values.export, args.clientId) : null
  const monthSet = async (m: string): Promise<MonthVideo[]> => {
    const fromDb = exportFile ? null : await readMonthVideos(admin, args.clientId, m, pages)
    const set = fromDb ?? (exportFile ? monthVideosFromExport(exportFile, m) : null)
    if (set == null) throw new Error(`${NAME}: market_month_videos is not there (MF1 not applied) and no --export was given.`)
    return set
  }
  const aug = await monthSet('2026-08-01')
  const sep = await monthSet('2026-09-01')
  const category = new Set([...aug, ...sep].filter((v) => v.audience === CATEGORY_AUDIENCE).map((v) => v.id))
  const cat = tally(category)
  const share = (n: number, of: number) => (of > 0 ? `${((100 * n) / of).toFixed(1)}%` : '-')
  console.log(`  Aug–Sep category videos: ${category.size}; maker ${cat.maker} (${share(cat.maker, category.size)}), noise ${cat.noise} (${share(cat.noise, category.size)})`)
  for (const [label, set] of [['August', aug], ['September', sep]] as const) {
    const ids = set.filter((v) => v.audience === CATEGORY_AUDIENCE).map((v) => v.id)
    const t = tally(ids)
    console.log(`    ${label}: ${ids.length} category · maker ${t.maker} (${share(t.maker, ids.length)}) · noise ${t.noise} (${share(t.noise, ids.length)})`)
  }

  if (args.values['hand-check']) {
    const byId = new Map<string, VideoRow>(videos.map((v) => [v.id, v]))
    const sepCat = sep.filter((v) => v.audience === CATEGORY_AUDIENCE).map((v) => v.id).sort((a, b) => (md5(a) < md5(b) ? -1 : 1))
    const pick = (maker: boolean) => sepCat.filter((id) => (labels.get(id)!.segment === 'maker') === maker).slice(0, 20).map((id) => {
      const v = byId.get(id)!
      return { id, platform: v.platform, flagged: maker, reason: labels.get(id)!.reason, caption: v.caption, hashtags: v.hashtags, topics: v.topics, sourceKeywords: v.source_keywords }
    })
    mkdirSync(dirname(args.values['hand-check']), { recursive: true })
    writeFileSync(args.values['hand-check'], JSON.stringify({ project: args.project, clientId: args.clientId, month: '2026-09', flagged: pick(true), unflagged: pick(false) }, null, 1) + '\n')
    console.log(`  hand-check sheet (20 flagged, 20 unflagged September category videos, md5 order): ${args.values['hand-check']}`)
  }

  // The change row, printed in the dry run too (as log-tracking-eras prints
  // its own), with "note: none": it is written without one.
  const actorLabel = `scripts/${NAME}.ts --apply`
  const logged = changes.some((c) => (c.surface as string) === 'segment' && c.field === SEGMENT_RULE_VERSION)
  console.log(logged
    ? `  change row: segment ${SEGMENT_RULE_VERSION} is held; none written`
    : segmentRowLine(segmentChangeRow({ clientId: args.clientId, actor: scriptActor(actorLabel), rowsAffected: 0 })))

  if (!args.apply) {
    console.log(`read-only: nothing written · reads: ${pages.n} pages`)
    return
  }

  let held: { video_id: string }[]
  try {
    held = await selectAll<{ video_id: string }>(() => admin.from('video_segments').select('video_id')
      .eq('client_id', args.clientId).eq('rule_version', SEGMENT_RULE_VERSION).eq('method', 'rule').order('video_id'))
    pages.n += Math.max(1, Math.ceil(held.length / 1000))
  } catch (e) {
    if (isMissingObject(e, 'video_segments')) throw new Error(`${NAME}: video_segments does not exist on ${args.project}. Apply MF1 first. Nothing written.`)
    throw e
  }
  const heldIds = new Set(held.map((h) => h.video_id))
  const fresh = [...labels.entries()].filter(([id]) => !heldIds.has(id))
  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    const { error } = await admin.from('video_segments').insert(fresh.slice(i, i + INSERT_CHUNK).map(([id, l]) => ({
      client_id: args.clientId, video_id: id, rule_version: SEGMENT_RULE_VERSION, segment: l.segment, method: 'rule',
      reason: l.reason, actor_label: actorLabel,
    })))
    if (error) throw new Error(`${NAME}: labels not written after ${i} rows: ${error.message}`)
  }
  if (!logged && fresh.length > 0) {
    const ok = await recordConfigChange(admin, asChangeInput(segmentChangeRow({
      clientId: args.clientId, actor: scriptActor(actorLabel), rowsAffected: fresh.length,
    })))
    if (!ok) throw new Error(`${NAME}: the labels are written, but the change row is not (see the log above)`)
  }
  console.log(`APPLIED: ${fresh.length} labels written (${heldIds.size} already held), change row ${logged || fresh.length === 0 ? 'already held or not needed' : 'written'} · reads: ${pages.n} pages`)
}

// ---- segments_v2: the judge (plan WP3.2) -----------------------------------------------
//
// FOUR MODES (lib/segments/v2.ts v2Mode), and only one reaches the model:
//   (default)                      read, and price the judge from the prompts it would send. No model.
//   --spend --plan-out <new file>  judge, refused above --max-usd (default $1.00, decision L's top)
//                                  before the first call; the labels go to that local file only.
//   --from-plan <file>             read the plan against the database: what an apply would write.
//   --apply --from-plan <file>     write the plan's labels (insert-if-absent), its spend to
//                                  ai_call_log and one config_changes row on surface 'segment'. No model.
// Spending and writing are two pastes, so the hand check (scripts/segments-hand-check.ts)
// scores the plan before any label lands. --full-lane judges only the videos the counts read.
//
//   node --env-file=.env.local --import tsx scripts/label-segments.ts --rule segments_v2 --project <ref> \
//     [--spend --plan-out <file> [--max-usd <n>]] [--from-plan <file> [--apply]] [--full-lane]

const V2_ACTOR = `scripts/${NAME}.ts --rule ${SEGMENT_JUDGE_VERSION} --apply`
/** Calls in flight at once on a judged run, so about a hundred calls take
 *  minutes, not half an hour. */
const JUDGE_PARALLEL = 4

function gitSha(): string {
  try {
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim() !== ''
    return dirty ? `${sha}+dirty` : sha
  } catch {
    return 'unknown'
  }
}

const pct = (n: number, of: number) => (of > 0 ? `${((100 * n) / of).toFixed(1)}%` : '-')

function printTally(labels: readonly PlanLabel[], videos: readonly PlanVideo[]): void {
  const t = tallyLabels(labels)
  console.log(`  ${t.videos} labels: buyer ${t.roles.buyer} · buyer-adjacent ${t.roles['buyer-adjacent']} · maker ${t.roles.maker}`
    + ` · off-topic ${t.roles['off-topic']} · other ${t.roles.other} (market ${t.segments.market} · maker ${t.segments.maker} · noise ${t.segments.noise})`)
  const cat = new Set(videos.filter((v) => v.category && v.lane === 'full').map((v) => v.id))
  const c = tallyLabels(labels.filter((l) => cat.has(l.videoId)))
  console.log(`    category videos of the full lane: ${c.videos}; maker ${c.segments.maker} (${pct(c.segments.maker, c.videos)}), noise ${c.segments.noise} (${pct(c.segments.noise, c.videos)})`)
}

async function labelSegmentsV2(args: ScriptArgs): Promise<void> {
  const mode = v2Mode({ apply: args.apply, spend: args.flags.has('spend'), planOut: args.values['plan-out'], fromPlan: args.values['from-plan'] })
  const maxUsd = parseMaxUsd(args.values['max-usd'])
  const base = segmentHintsFor(args.clientId)
  if (!base) throw new Error(`${NAME}: no segment hints for ${args.clientId} (lib/segments/hints.ts), so it is not judged. Nothing read.`)
  const planOut = args.values['plan-out']
  if (mode === 'judge') {
    if (planOut && existsSync(planOut)) throw new Error(`${NAME}: ${planOut} exists; --plan-out names a new file. Nothing read, nothing spent.`)
    console.log(`  SPEND: judged by ${SEGMENT_JUDGE_MODEL}, refused above --max-usd $${maxUsd.toFixed(2)}; the labels go to ${planOut} only, never to the database`)
  } else {
    console.log(`  ${SEGMENT_JUDGE_VERSION} (${mode}): no model is called`)
  }

  const admin = createAdminClient()
  const pages: Pages = { n: 0 }
  const [videos, changes, config] = await Promise.all([
    readVideos(admin, args.clientId, pages, { text: true }),
    readConfigChanges(admin, args.clientId, pages),
    admin.from('tracking_configs').select('*').eq('client_id', args.clientId).maybeSingle(),
  ])
  pages.n++
  if (config.error) throw new Error(`${NAME}: tracking_configs read failed: ${config.error.message}`)
  // select('*'): market_description arrives with MF3 and is simply absent before it.
  const row = (config.data ?? {}) as { exclude_terms?: string[] | null; market_description?: string | null }
  const settings = { excludeTerms: row.exclude_terms ?? [], marketDescription: row.market_description ?? null }

  let held: Set<string>
  try {
    const rows = await selectAll<{ video_id: string }>(() => admin.from('video_segments').select('video_id')
      .eq('client_id', args.clientId).eq('rule_version', SEGMENT_JUDGE_VERSION).eq('method', 'judge').order('video_id'))
    pages.n += Math.max(1, Math.ceil(rows.length / 1000))
    held = new Set(rows.map((r) => r.video_id))
  } catch (e) {
    if (!isMissingObject(e, 'video_segments')) throw e
    if (mode === 'apply') throw new Error(`${NAME}: video_segments does not exist on ${args.project}. Apply MF1 first. Nothing written.`)
    console.log('  video_segments is not there (MF1 not applied): every video counts as not yet judged')
    held = new Set()
  }

  const fullLane = args.flags.has('full-lane')
  const pool = fullLane ? videos.filter((v) => v.analyzed_lane === 'full') : videos
  const todo = pool.filter((v) => !held.has(v.id))
  const { hints, homonyms } = resolvedHints(base, settings)
  console.log(`  ${videos.length} stored videos${fullLane ? `, ${pool.length} of them in the full lane (--full-lane)` : ''}; `
    + `${held.size} already judged (${SEGMENT_JUDGE_VERSION}); ${todo.length} to judge`)
  console.log(`  market: "${hints.market}"${settings.marketDescription?.trim() ? ' (the stored market description)' : ''}; ${homonyms.length} other sense(s) of the names from exclude_terms`)

  if (mode === 'review' || mode === 'apply') {
    const file = args.values['from-plan']!
    const plan = parsePlan(JSON.parse(readFileSync(file, 'utf8')), { project: args.project, clientId: args.clientId })
    const stored = new Set(videos.map((v) => v.id))
    const gone = plan.labels.filter((l) => !stored.has(l.videoId)).length
    const fromPlanHeld = plan.labels.filter((l) => stored.has(l.videoId) && held.has(l.videoId)).length
    const fresh = freshJudgements(plan.labels.filter((l) => stored.has(l.videoId)), held)
    console.log(`  plan ${basename(file)}: ${plan.labels.length} labels judged ${plan.createdAt} at ${plan.gitSha.slice(0, 12)} (${plan.promptVersion}; `
      + `$${plan.costUsd.toFixed(4)} in ${plan.calls.length} calls; ${plan.missing.length} left unjudged)`)
    console.log(`  ${fromPlanHeld} already held · ${gone} no longer stored · ${fresh.length} to write`)
    printTally(fresh, plan.videos)
    const logged = changes.some((c) => (c.surface as string) === 'segment' && c.field === SEGMENT_JUDGE_VERSION)
    // The ledger is keyed by THIS plan, not by the change row: a second plan (the videos a
    // first one left unjudged) finds the change row held, and its spend must still land.
    const prior = await admin.from('ai_call_log').select('id', { count: 'exact', head: true })
      .eq('client_id', args.clientId).eq('pass', SEGMENT_JUDGE_PASS).eq('request->>judgedAt', plan.createdAt)
    pages.n++
    if (prior.error) throw new Error(`${NAME}: ai_call_log read failed: ${prior.error.message}. Nothing written.`)
    const callsHeld = (prior.count ?? 0) > 0
    console.log(logged
      ? `  change row: segment ${SEGMENT_JUDGE_VERSION} is held; none written`
      : `  new row: segment ${SEGMENT_JUDGE_VERSION}, written with the labels · "${SEGMENT_V2_NOTE}"`)
    console.log(callsHeld
      ? `  ai_call_log: this plan's calls are held; none written`
      : fresh.length > 0 ? `  ai_call_log: this plan's ${plan.calls.length} calls, written with the labels` : '  ai_call_log: no label to write, so no call is logged')
    if (mode === 'review') {
      console.log(`read-only: nothing written · reads: ${pages.n} pages`)
      return
    }
    const rows = judgeRows(args.clientId, fresh, V2_ACTOR)
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { error } = await admin.from('video_segments').insert(rows.slice(i, i + INSERT_CHUNK))
      if (error) throw new Error(`${NAME}: labels not written after ${i} rows: ${error.message}`)
    }
    if (!callsHeld && fresh.length > 0) {
      // The spend, once per plan, in the ledger: the judged run wrote only its file. Keyed by
      // request.judgedAt. Only an apply that writes labels logs, so a re-apply after the
      // retention sweep has emptied the request bodies (30 days) does not log them twice.
      for (const c of plan.calls) {
        await logAiCall(admin, {
          clientId: args.clientId, runId: null, pass: SEGMENT_JUDGE_PASS, callIndex: c.callIndex, model: plan.model, promptVersion: plan.promptVersion,
          request: { plan: basename(file), judgedAt: plan.createdAt, videos: c.videos }, response: { missing: c.missing },
          error: c.error, usage: c.usage, durationMs: c.durationMs, validationStatus: c.error ? 'error' : c.missing > 0 ? 'partial' : 'ok',
        })
      }
    }
    if (!logged && fresh.length + fromPlanHeld > 0) {
      const ok = await recordConfigChange(admin, asChangeInput({
        clientId: args.clientId, surface: 'segment', field: SEGMENT_JUDGE_VERSION, actor: scriptActor(V2_ACTOR),
        rowsAffected: fresh.length + fromPlanHeld, note: SEGMENT_V2_NOTE,
      }))
      if (!ok) throw new Error(`${NAME}: the labels are written, but the change row is not (see the log above)`)
    }
    const callsLine = callsHeld ? 'calls already logged' : fresh.length > 0 ? `${plan.calls.length} calls logged` : 'no call logged'
    const changeLine = logged ? 'already held' : fresh.length + fromPlanHeld > 0 ? 'written' : 'not needed'
    console.log(`APPLIED: ${fresh.length} labels written (${fromPlanHeld} already held), ${callsLine}, change row ${changeLine} · reads: ${pages.n} pages`)
    return
  }

  const cands: SegmentCandidate[] = todo.map((v) => ({ id: v.id, platform: v.platform, account_name: v.account_name, caption: v.caption, hashtags: v.hashtags }))
  const proj = projectJudgeCost(cands, hints, homonyms)
  console.log(`  projected: ${proj.batches} calls of up to ${SEGMENT_JUDGE_BATCH} videos, about ${proj.promptTokens.toLocaleString('en-US')} tokens in and `
    + `${proj.completionTokens.toLocaleString('en-US')} out: about $${proj.usd.toFixed(2)} (cap --max-usd $${maxUsd.toFixed(2)})`)
  if (mode === 'project') {
    console.log('  no model called. To judge: --spend --plan-out <new file>; then the hand check; then --apply --from-plan <file>.')
    console.log(`read-only: nothing written · reads: ${pages.n} pages`)
    return
  }

  // mode === 'judge': the one path that reaches the model.
  if (proj.usd > maxUsd) {
    throw new Error(`${NAME}: projected $${proj.usd.toFixed(2)} is over --max-usd $${maxUsd.toFixed(2)}; nothing was sent to the model. `
      + 'Raise --max-usd once the spend is agreed, or narrow with --full-lane.')
  }
  const { openai } = await import('../lib/openai')
  const client: SegmentJudgeClient = openai
  const batches = segmentJudgeBatches(cands)
  const perBatch = batches.length > 0 ? proj.usd / batches.length : 0
  const labels: PlanLabel[] = []
  const calls: PlanCall[] = []
  const missing: string[] = []
  let spent = 0
  for (let w = 0; w < batches.length; w += JUDGE_PARALLEL) {
    const wave = batches.slice(w, w + JUDGE_PARALLEL)
    // Twice the projection per call as headroom: a wave that could pass the cap is not sent.
    if (spent + 2 * perBatch * wave.length > maxUsd) {
      for (const b of batches.slice(w)) missing.push(...b.map((c) => c.id))
      console.warn(`  STOPPED before call ${w + 1} of ${batches.length}: the next calls could pass --max-usd $${maxUsd.toFixed(2)} (spent $${spent.toFixed(4)}); the rest are listed as unjudged`)
      break
    }
    const results = await Promise.all(wave.map((b) => judgeSegmentBatch({
      clientId: args.clientId, candidates: b, client, excludeTerms: settings.excludeTerms, marketDescription: settings.marketDescription,
    })))
    results.forEach((r, j) => {
      spent += r.costUsd
      calls.push({ callIndex: w + j + 1, videos: wave[j].length, usage: r.usage, costUsd: r.costUsd, durationMs: r.durationMs, error: r.error, missing: r.missing.length })
      labels.push(...r.judgements.map(({ videoId, role, segment, reason, why }) => ({ videoId, role, segment, reason, why })))
      missing.push(...r.missing)
      if (r.error) console.warn(`  call ${w + j + 1} of ${batches.length}: nothing labelled (${r.error})`)
    })
    console.log(`  judged ${Math.min(w + wave.length, batches.length)} of ${batches.length} calls · $${spent.toFixed(4)}`)
  }
  const plan: V2Plan = {
    kind: V2_PLAN_KIND, version: SEGMENT_JUDGE_VERSION, project: args.project, clientId: args.clientId, createdAt: new Date().toISOString(),
    gitSha: gitSha(), model: SEGMENT_JUDGE_MODEL, promptVersion: SEGMENT_JUDGE_PROMPT_VERSION, maxUsd, costUsd: spent, calls, labels, missing,
    videos: todo.map((v) => ({
      id: v.id, platform: v.platform, account: v.account_name ?? null, caption: v.caption ?? null, hashtags: v.hashtags ?? [], topics: v.topics ?? [],
      category: v.is_client !== true && v.is_competitor !== true, lane: v.analyzed_lane,
    })),
  }
  mkdirSync(dirname(planOut!), { recursive: true })
  writeFileSync(planOut!, JSON.stringify(plan) + '\n', { flag: 'wx' })
  printTally(plan.labels, plan.videos)
  console.log(`read-only on the database: nothing written · plan ${planOut}: ${labels.length} labels, ${missing.length} unjudged · `
    + `spent $${spent.toFixed(4)} in ${calls.length} calls · reads: ${pages.n} pages`)
  console.log(`  next: scripts/segments-hand-check.ts --plan ${planOut} --export <WP0.1 file> --seed <word> --out <sheet>, then --apply --from-plan ${planOut}`)
}

if (process.argv[1]?.endsWith('label-segments.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
