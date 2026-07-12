import { createAdminClient } from '../lib/supabase-admin'

// Operator read of keyword ROI across every gathered run — the pruning tool.
// keyword_performance is written by gather (analysis-only re-runs add nothing),
// so each row is one (run, platform, keyword) gather outcome. Prints a
// per-keyword table sorted worst-relevance-first: the top rows are the pruning
// candidates, the bottom rows earn their Apify spend. Run with env loaded:
//   node --env-file=.env.local --import tsx scripts/keyword-roi.ts [--client <uuid>]

const SEALAND = 'ac16988e-c4f3-4baf-b388-73895852a554'

function parseArgs(argv: string[]): { clientId: string } {
  const args = { clientId: SEALAND as string }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  return args
}

interface KpRow {
  run_id: string
  platform: string
  keyword: string
  bucket: string
  videos_found: number
  gate_survived: number
  insights_contributed: number | null
  value_score: number | string | null
  created_at: string
}

async function main() {
  const { clientId } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('keyword_performance')
    .select('run_id, platform, keyword, bucket, videos_found, gate_survived, insights_contributed, value_score, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as KpRow[]
  if (rows.length === 0) {
    console.log('no keyword_performance rows for this client — no gathered runs yet')
    return
  }

  const runs = new Set(rows.map((r) => r.run_id))
  const first = rows[0].created_at.slice(0, 10)
  const last = rows[rows.length - 1].created_at.slice(0, 10)
  console.log(`client ${clientId} · ${runs.size} gathered run${runs.size === 1 ? '' : 's'} · ${first} → ${last}\n`)

  interface Agg {
    keyword: string
    bucket: string
    platforms: Set<string>
    runs: Set<string>
    found: number
    survived: number
    insights: number
    scoreSum: number
    scoreN: number
  }
  const byKeyword = new Map<string, Agg>()
  for (const r of rows) {
    const agg = byKeyword.get(r.keyword) ?? {
      keyword: r.keyword, bucket: r.bucket, platforms: new Set<string>(), runs: new Set<string>(),
      found: 0, survived: 0, insights: 0, scoreSum: 0, scoreN: 0,
    }
    agg.platforms.add(r.platform)
    agg.runs.add(r.run_id)
    agg.found += r.videos_found
    agg.survived += r.gate_survived
    agg.insights += r.insights_contributed ?? 0
    if (r.value_score != null) {
      agg.scoreSum += Number(r.value_score)
      agg.scoreN += 1
    }
    byKeyword.set(r.keyword, agg)
  }

  const table = [...byKeyword.values()]
    .map((a) => ({
      keyword: a.keyword,
      bucket: a.bucket,
      platforms: a.platforms.size,
      runs: a.runs.size,
      found: a.found,
      relevant: a.survived,
      'rate %': a.found > 0 ? Math.round((a.survived / a.found) * 100) : 0,
      insights: a.insights,
      'avg score': a.scoreN > 0 ? (a.scoreSum / a.scoreN).toFixed(1) : '—',
    }))
    .sort((a, b) => a['rate %'] - b['rate %'] || b.found - a.found)

  console.table(table)
  console.log('sorted worst relevance first — top rows are pruning candidates; rate = gate_survived / videos_found at gather time')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
