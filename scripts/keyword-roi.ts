import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { APIFY_COST_ESTIMATES } from '../lib/config'
import { summariseTerms, insightBearingUpdates, REVIEW_RULE, type KeywordPerfRow } from '../lib/keywords/value'

// Operator read of keyword ROI across every gathered run — the pruning tool.
// keyword_performance is written by gather (analysis-only re-runs add nothing),
// so each row is one (run, platform, keyword) gather outcome; the pipeline's
// keyword-attribution step (2026-08-10) fills insights_contributed after
// synthesis. Aggregates per (platform, keyword) — the data says ROI lives on
// that axis, not keyword alone. Prints worst-relevance-first with an estimated
// Apify spend ($est, coarse ranking constants from lib/config.ts — not an
// invoice) and a DROP-CANDIDATE marker. Run with env loaded:
//   node --env-file=.env.local --import tsx scripts/keyword-roi.ts [--client <uuid>]
// No --client: every client with keyword_performance rows, one table each.

// Drop rule (plan 2026-08-10): pooled over runs where the client's run produced
// any insights at all (excludes gather-only/died-before-analysis runs, which
// would otherwise fake a 0-insight signal), a (platform, keyword) is a
// DROP-CANDIDATE when: ≥3 such runs, pooled survival <5%, pooled found ≥100,
// pooled insights 0. Per-platform by construction — a keyword can be dropped
// on Instagram and kept on YouTube.
//
// The rule itself now lives in lib/keywords/value.ts (2026-09-11), because the
// client's Settings page shows the same judgment as a "Worth reviewing" hint.
// One rule, two readers; this script keeps the per-platform grouping.

function parseArgs(argv: string[]): { clientId: string | null } {
  const args = { clientId: null as string | null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  return args
}

interface KpRow extends KeywordPerfRow {
  value_score: number | string | null
  created_at: string
}

function estRowCost(r: KpRow): number {
  const c = APIFY_COST_ESTIMATES[r.platform]
  if (!c) return 0
  return c.search + r.eligible_videos * c.perVideoComments
}

async function reportClient(clientId: string) {
  const admin = createAdminClient()
  const rows = await selectAll<KpRow>(() =>
    admin
      .from('keyword_performance')
      .select('run_id, platform, keyword, bucket, videos_found, gate_survived, eligible_videos, insights_contributed, value_score, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
  )
  if (rows.length === 0) {
    console.log(`client ${clientId}: no keyword_performance rows — no gathered runs yet\n`)
    return
  }

  // Runs whose whole client run produced at least one attributed insight —
  // the only runs the drop rule may pool over.
  const insightfulRuns = insightBearingUpdates(rows)

  const runs = new Set(rows.map((r) => r.run_id))
  const first = rows[0].created_at.slice(0, 10)
  const last = rows[rows.length - 1].created_at.slice(0, 10)
  console.log(`client ${clientId} · ${runs.size} gathered run${runs.size === 1 ? '' : 's'} (${insightfulRuns.size} with insights) · ${first} → ${last}\n`)

  // Money and the provisional value_score stay here — they are the operator's
  // two columns, and neither belongs in a client-facing summary.
  const est = new Map<string, number>()
  const score = new Map<string, { sum: number; n: number }>()
  for (const r of rows) {
    const key = `${r.platform}::${r.keyword}`
    est.set(key, (est.get(key) ?? 0) + estRowCost(r))
    if (r.value_score != null) {
      const s = score.get(key) ?? { sum: 0, n: 0 }
      score.set(key, { sum: s.sum + Number(r.value_score), n: s.n + 1 })
    }
  }

  const table = summariseTerms(rows, 'platform-term').map((t) => {
    const s = score.get(t.key)
    return {
      platform: t.platforms[0],
      keyword: t.keyword,
      bucket: t.bucket,
      runs: t.updates,
      found: t.found,
      relevant: t.kept,
      'rate %': Math.round(t.keptRate * 100),
      insights: t.insights,
      '$est': (est.get(t.key) ?? 0).toFixed(2),
      'avg score': s && s.n > 0 ? (s.sum / s.n).toFixed(1) : '—',
      'DROP?': t.worthReviewing ? 'DROP-CANDIDATE' : '',
    }
  })

  console.table(table)
  console.log('sorted worst relevance first · rate = gate_survived / videos_found at gather time · $est = coarse Apify ranking estimate, not an invoice')
  console.log(`DROP-CANDIDATE: ≥${REVIEW_RULE.MIN_UPDATES} insight-bearing runs, <${REVIEW_RULE.MAX_KEPT_RATE * 100}% survival, ≥${REVIEW_RULE.MIN_FOUND} found, 0 insights — judged per platform\n`)
}

async function main() {
  const { clientId } = parseArgs(process.argv.slice(2))
  if (clientId) return reportClient(clientId)

  const admin = createAdminClient()
  const data = await selectAll<{ client_id: string }>(() =>
    admin.from('keyword_performance').select('client_id').order('id'),
  )
  const clients = [...new Set(data.map((r) => r.client_id))]
  if (clients.length === 0) {
    console.log('no keyword_performance rows anywhere — no gathered runs yet')
    return
  }
  for (const id of clients) await reportClient(id)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
