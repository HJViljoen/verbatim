import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { SEALAND_CLIENT_ID } from '../lib/config'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import {
  isMissingObject, readExportFile, readKeywordRows, readProvenanceTable, readRuns, readVerdicts, readVideos, snapshotOf,
  type Pages,
} from '../lib/provenance/load'
import { planProvenance, provenanceSummary, type ProvenanceSnapshot } from '../lib/provenance/reconstruct'
import { gathersOf } from '../lib/provenance/searches'
import { createAdminClient } from '../lib/supabase-admin'

// How each video was first found, written once into MF1's `video_provenance`
// (market-first plan WP1.4; the first of Heinrich's four --apply pastes on
// Wed 30 Sep, after MF1).
//
// The plan is lib/provenance/reconstruct.ts: the earliest kept gate verdict,
// then the production snapshot (WP1.0, --prod-snapshot), then the staging
// export (WP0.1, --staging-export), then era A; ambiguous where an era-A
// video's terms were overwritten. The current source_keywords are the last
// snapshot.
//
// READ-ONLY BY DEFAULT: it prints the plan's summary, and with --out writes the
// plan to a local file (the other scripts' dry runs read it with --provenance
// where MF1 is not applied). With --apply --project <ref> it inserts the rows
// the table does not hold yet (insert-if-absent; a stored row is never
// rewritten, and the table refuses UPDATE). It never prompts.
//
//   node --env-file=.env.local --import tsx scripts/reconstruct-provenance.ts \
//     --project <ref> [--client <uuid>] [--prod-snapshot <file>] [--staging-export <file>] [--out <file>] [--apply]
//
// --since <YYYY-MM-DD> [--until <YYYY-MM-DD>] (deploy 4, WP3.4) keeps the
// plan to the videos first stored in [since, until): the ones stored between
// the last snapshot the pastes reconstructed from and gather-time provenance
// (videos first stored 18 Oct to 1 Nov; the 8 Nov run writes its own 'exact'
// rows). Everything outside the span is left to the rows already held, which
// the apply never rewrites anyway. Heinrich's paste after deploy 4:
//   … scripts/reconstruct-provenance.ts --project mkwjlckescdveosvrvaq --since 2026-10-12 --until 2026-11-02 [--apply]
//
// Reads (pages of 1,000): videos, gate_verdicts, keyword_performance,
// pipeline_runs and, on --apply, video_provenance's held ids. About 20 on
// Sealand's production at the 27 Sep state.

const NAME = 'reconstruct-provenance'
const INSERT_CHUNK = 500

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME, values: ['prod-snapshot', 'staging-export', 'out', 'since', 'until'], defaultClient: SEALAND_CLIENT_ID,
  })
  const since = args.values.since ?? null
  const until = args.values.until ?? null
  for (const [flag, v] of [['since', since], ['until', until]] as const) {
    if (v != null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${NAME}: --${flag} takes a date, YYYY-MM-DD (got ${v})`)
  }
  if (since && until && !(since < until)) throw new Error(`${NAME}: --since must come before --until`)
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(modeLine(args, NAME))
  const admin = createAdminClient()
  const pages: Pages = { n: 0 }
  const now = new Date().toISOString()

  const snapshots: ProvenanceSnapshot[] = []
  if (args.values['prod-snapshot']) snapshots.push(snapshotOf(readExportFile(args.values['prod-snapshot'], args.clientId), 'snapshot'))
  if (args.values['staging-export']) snapshots.push(snapshotOf(readExportFile(args.values['staging-export'], args.clientId), 'staging'))
  for (const s of snapshots) console.log(`  evidence: ${s.label} (taken ${s.takenAt}, ${s.sourceKeywords.size} videos)`)

  const [videos, verdicts, kp, runs] = await Promise.all([
    readVideos(admin, args.clientId, pages),
    readVerdicts(admin, args.clientId, pages),
    readKeywordRows(admin, args.clientId, pages),
    readRuns(admin, args.clientId, pages),
  ])
  const gathers = gathersOf(kp, runs)
  const planned = planProvenance({
    videos: videos.map((v) => ({ id: v.id, platform: v.platform, videoId: v.video_id, firstSeen: v.first_seen, sourceKeywords: v.source_keywords ?? [], source: v.source })),
    verdicts: verdicts.map((v) => ({ runId: v.run_id, platform: v.platform, videoId: v.video_id, keyword: v.keyword, kept: v.kept, createdAt: v.created_at })),
    gathers: gathers.map((g) => ({ runId: g.runId, at: g.at, terms: g.terms })),
    snapshots,
    now: { label: `snapshot@${now.slice(0, 10)}`, takenAt: now },
  })
  // The span: videos first stored in [since, until) (first_seen, the insert
  // default the gather never overwrites).
  const inSpan = (firstSeen: string) => (!since || firstSeen >= `${since}T00:00:00.000Z`) && (!until || firstSeen < `${until}T00:00:00.000Z`)
  const firstSeenOf = new Map(videos.map((v) => [v.id, v.first_seen]))
  const rows = planned.filter((r) => inSpan(firstSeenOf.get(r.videoId) ?? r.firstStoredAt))
  if (since || until) console.log(`  span [${since ?? 'the start'}, ${until ?? 'now'}): ${rows.length} of ${planned.length} videos first stored in it`)
  console.log(`  ${videos.length} videos · ${verdicts.length} gate verdicts · ${gathers.length} gathers (${gathers[0]?.at ?? '-'} to ${gathers.at(-1)?.at ?? '-'})`)
  const summary = provenanceSummary(rows)
  for (const [k, n] of Object.entries(summary).sort()) console.log(`  ${k.padEnd(40)} ${n}`)

  if (args.values.out) {
    mkdirSync(dirname(args.values.out), { recursive: true })
    writeFileSync(args.values.out, JSON.stringify({ plannedAt: now, project: args.project, clientId: args.clientId, summary, rows }, null, 1) + '\n')
    console.log(`  plan written to ${args.values.out}`)
  }

  if (!args.apply) {
    console.log(`read-only: nothing written · reads: ${pages.n} pages`)
    return
  }

  const held = await readProvenanceTable(admin, args.clientId, pages)
  if (held == null) throw new Error(`${NAME}: video_provenance does not exist on ${args.project}. Apply MF1 first. Nothing written.`)
  const fresh = rows.filter((r) => !held.has(r.videoId))
  let inserted = 0
  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    const chunk = fresh.slice(i, i + INSERT_CHUNK).map((r) => ({
      client_id: args.clientId, video_id: r.videoId, first_run_id: r.firstRunId, first_stored_at: r.firstStoredAt,
      first_terms: r.firstTerms, first_subreddits: r.firstSubreddits, method: r.method, evidence: r.evidence,
    }))
    const { error } = await admin.from('video_provenance').upsert(chunk, { onConflict: 'client_id,video_id', ignoreDuplicates: true })
    if (error) {
      if (isMissingObject(error, 'video_provenance')) throw new Error(`${NAME}: video_provenance does not exist. Nothing more written.`)
      throw new Error(`${NAME}: insert failed after ${inserted} rows: ${error.message}`)
    }
    inserted += chunk.length
  }
  console.log(`APPLIED: ${inserted} provenance rows inserted (${held.size} were already held and left alone) · reads: ${pages.n} pages`)
}

if (process.argv[1]?.endsWith('reconstruct-provenance.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
