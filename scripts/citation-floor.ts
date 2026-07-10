import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { embedTexts, cosine } from '../lib/pipeline/cluster'

// Read-only calibrator for the Pass D citation-relevance floor (the
// existence-vs-relevance gap, teardown 2026-07-09 §Run 1). For a run's
// market_insights, prints the cosine similarity between each insight's text and
// (a) the themes it actually cites vs (b) every other theme in the run — so the
// floor separating genuine grounding from citation padding is picked from real
// data, not guessed. Run with env loaded:
//   node --env-file=.env.local --import tsx scripts/citation-floor.ts [--client <uuid>] [--run <uuid>]

const SEALAND = 'ac16988e-c4f3-4baf-b388-73895852a554'

function parseArgs(argv: string[]): { clientId: string; runId?: string } {
  const args = { clientId: SEALAND as string, runId: undefined as string | undefined }
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i]
    if (argv[i] === '--client') args.clientId = next()
    else if (argv[i] === '--run') args.runId = next()
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  return args
}

interface ThemeRow {
  id: string
  label: string
  description: string | null
  bucket: string
  supporting_insight_ids: string[]
  embedding: number[] | string | null
}

const parseVec = (e: number[] | string | null): number[] | null =>
  Array.isArray(e) ? e : typeof e === 'string' ? (JSON.parse(e) as number[]) : null

async function main() {
  const { clientId, runId: runArg } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  let runId = runArg
  if (!runId) {
    const { data, error } = await admin
      .from('pipeline_runs').select('id, started_at')
      .eq('client_id', clientId).in('status', ['completed', 'partial'])
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
    if (error || !data) throw new Error(`latest run: ${error?.message ?? 'none found'}`)
    runId = data.id as string
  }
  console.log(`client ${clientId} · run ${runId}\n`)

  const [{ data: miData, error: miErr }, themes] = await Promise.all([
    admin.from('market_insights')
      .select('id, insight_type, title, description, evidence')
      .eq('client_id', clientId).eq('run_id', runId)
      .order('opportunity_score', { ascending: false }),
    selectAll<ThemeRow>(() =>
      admin.from('themes')
        .select('id, label, description, bucket, supporting_insight_ids, embedding')
        .eq('client_id', clientId).eq('run_id', runId).order('id', { ascending: true }),
    ),
  ])
  if (miErr) throw new Error(`market_insights: ${miErr.message}`)
  const insights = (miData ?? []) as { id: string; insight_type: string; title: string; description: string; evidence: { supporting_theme_ids?: string[] } | null }[]
  if (!insights.length || !themes.length) throw new Error(`nothing to calibrate: ${insights.length} insights, ${themes.length} themes`)

  // evidence.supporting_theme_ids holds AUDIENCE-insight ids — reverse-map each
  // to the theme(s) whose supporting_insight_ids contain it.
  const themesByAudienceId = new Map<string, Set<number>>()
  themes.forEach((t, ti) => {
    for (const aid of t.supporting_insight_ids ?? []) {
      const s = themesByAudienceId.get(aid) ?? new Set<number>()
      s.add(ti)
      themesByAudienceId.set(aid, s)
    }
  })

  const themeVecs = themes.map((t) => parseVec(t.embedding))
  const missing = themeVecs.filter((v) => !v).length
  if (missing) console.log(`(${missing}/${themes.length} themes have no stored embedding — skipped)\n`)

  const insightVecs = await embedTexts(insights.map((mi) => `${mi.title}. ${mi.description}`))

  const fmt = (n: number) => n.toFixed(3)
  const allCited: number[] = []
  const allUncited: number[] = []

  insights.forEach((mi, ii) => {
    const citedIdx = new Set<number>()
    for (const aid of mi.evidence?.supporting_theme_ids ?? []) {
      for (const ti of themesByAudienceId.get(aid) ?? []) citedIdx.add(ti)
    }
    console.log(`[M${ii + 1}] (${mi.insight_type}) ${mi.title}`)
    if (citedIdx.size === 0) {
      console.log('    cites no themes (SoV-derived) — skipped\n')
      return
    }
    const rows: { sim: number; cited: boolean; label: string; bucket: string }[] = []
    themes.forEach((t, ti) => {
      const v = themeVecs[ti]
      if (!v) return
      const sim = cosine(insightVecs[ii], v)
      rows.push({ sim, cited: citedIdx.has(ti), label: t.label, bucket: t.bucket })
      ;(citedIdx.has(ti) ? allCited : allUncited).push(sim)
    })
    const cited = rows.filter((r) => r.cited).sort((a, b) => a.sim - b.sim)
    for (const r of cited) console.log(`    cited   ${fmt(r.sim)}  [${r.bucket}] ${r.label}`)
    const topUncited = rows.filter((r) => !r.cited).sort((a, b) => b.sim - a.sim).slice(0, 3)
    for (const r of topUncited) console.log(`    uncited ${fmt(r.sim)}  [${r.bucket}] ${r.label}   (top uncited)`)
    console.log('')
  })

  const dist = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
    return `n=${s.length} min=${fmt(s[0])} p25=${fmt(q(0.25))} median=${fmt(q(0.5))} p75=${fmt(q(0.75))} max=${fmt(s[s.length - 1])}`
  }
  console.log(`cited   ${dist(allCited)}`)
  console.log(`uncited ${dist(allUncited)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
