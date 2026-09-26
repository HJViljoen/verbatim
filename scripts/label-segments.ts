import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { SEALAND_CLIENT_ID } from '../lib/config'
import { recordConfigChange, scriptActor } from '../lib/config-log'
import { asChangeInput } from '../lib/config-surfaces-mf1'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import {
  isMissingObject, monthVideosFromExport, readConfigChanges, readExportFile, readMonthVideos, readProvenanceFile,
  readProvenanceTable, readVerdicts, readVideos, type Pages, type VideoRow,
} from '../lib/provenance/load'
import { CATEGORY_AUDIENCE, type MonthVideo } from '../lib/provenance/searches'
import { SEGMENT_RULE_VERSION, segmentOfReason, segmentReason, segmentRulesEnabled, type Segment } from '../lib/segments/rules'
import { createAdminClient, selectAll } from '../lib/supabase-admin'

// segments_v1 labels on every stored video (market-first decision F, plan
// WP1.4; the last of Heinrich's four --apply pastes on Wed 30 Sep, after
// reconstruct-provenance, whose first-found terms the noise rule reads).
//
// A LABEL, NEVER A DELETION. It writes `video_segments` rows (method 'rule',
// rule_version 'segments_v1') and one `config_changes` row on the surface
// 'segment'. Nothing is deleted and no month table is touched: September's main
// rows are untouched, and every labelled video stays in every count.
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

const NAME = 'label-segments'
const INSERT_CHUNK = 500
export const SEGMENT_NOTE =
  'We marked which videos are makers’ own projects and which are off-topic, so they can be grouped or set aside. Nothing was taken out of any count.'

const md5 = (s: string): string => createHash('md5').update(s).digest('hex')

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME, values: ['export', 'provenance', 'hand-check'], defaultClient: SEALAND_CLIENT_ID,
  })
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(modeLine(args, NAME))
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
  const actorLabel = `scripts/${NAME}.ts --apply`
  const fresh = [...labels.entries()].filter(([id]) => !heldIds.has(id))
  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    const { error } = await admin.from('video_segments').insert(fresh.slice(i, i + INSERT_CHUNK).map(([id, l]) => ({
      client_id: args.clientId, video_id: id, rule_version: SEGMENT_RULE_VERSION, segment: l.segment, method: 'rule',
      reason: l.reason, actor_label: actorLabel,
    })))
    if (error) throw new Error(`${NAME}: labels not written after ${i} rows: ${error.message}`)
  }
  const logged = changes.some((c) => (c.surface as string) === 'segment' && c.field === SEGMENT_RULE_VERSION)
  if (!logged && fresh.length > 0) {
    const ok = await recordConfigChange(admin, asChangeInput({
      clientId: args.clientId, surface: 'segment', field: SEGMENT_RULE_VERSION, actor: scriptActor(actorLabel),
      rowsAffected: fresh.length, note: SEGMENT_NOTE,
    }))
    if (!ok) throw new Error(`${NAME}: the labels are written, but the change row is not (see the log above)`)
  }
  console.log(`APPLIED: ${fresh.length} labels written (${heldIds.size} already held), change row ${logged || fresh.length === 0 ? 'already held or not needed' : 'written'} · reads: ${pages.n} pages`)
}

if (process.argv[1]?.endsWith('label-segments.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
