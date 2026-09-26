import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { SEALAND_CLIENT_ID } from '../../lib/config'
import { assertProject, modeLine, parseScriptArgs } from '../../lib/ops/market-first-args'
import { readExportFile, readProvenanceFile } from '../../lib/provenance/load'
import { noiseTerms, segmentReason } from '../../lib/segments/rules'
import { createAdminClient } from '../../lib/supabase-admin'

// The segments_v1 parity test (plan WP1.4 done-when: "the SQL and TypeScript
// segment rules agree on the 150 hand labels"). The research's 150 hand labels
// are the md5(id)-ordered first 150 of the 850 Aug–Sep category videos (CQ
// §C): the labels themselves were never kept, but the videos are, so both
// copies of the rule are run over exactly those videos, and over all 850:
//
//   - TypeScript: lib/segments/rules.ts segmentReason;
//   - SQL: MF1's public.segments_v1_reason on the throwaway cluster
//     (scripts/pg-shim/throwaway.sh, MF1 applied), fed the same caption,
//     hashtags, topics and terms.
//
// Every reason must be identical, word for word. It exits 1 on any
// disagreement and prints them. It reads the videos' text READ-ONLY from
// --project (staging) and writes nothing anywhere but --out, a local file.
//
//   node --import tsx scripts/pg-shim/segments-parity.ts --project zfmxrrugaihxpubunleu \
//     --export <WP0.1 file> --provenance <plan file> [--out <file>]
//   (THROWAWAY_PORT picks the cluster's port; default 54917)

const NAME = 'segments-parity'
const PSQL = process.env.PG_BIN ? join(process.env.PG_BIN, 'psql') : '/opt/homebrew/opt/postgresql@17/bin/psql'
const md5 = (s: string): string => createHash('md5').update(s).digest('hex')

interface Row { id: string; caption: string | null; hashtags: string[] | null; topics: string[] | null; terms: string[] }

function sqlReasons(rows: readonly Row[]): Map<string, string | null> {
  const tag = `p${randomBytes(6).toString('hex')}`
  const json = JSON.stringify(rows)
  if (json.includes(`$${tag}$`)) throw new Error('dollar-quote tag collision')
  const sql = `select t.id, coalesce(public.segments_v1_reason(t.caption, t.hashtags, t.topics, t.terms), '<null>')
    from json_to_recordset($${tag}$${json}$${tag}$::json) as t(id text, caption text, hashtags text[], topics text[], terms text[])
    order by t.id;`
  const out = execFileSync(PSQL, ['-h', '127.0.0.1', '-p', process.env.THROWAWAY_PORT ?? '54917', '-d', 'verbatim', '-X', '-q', '-A', '-t', '-F', '\u001f', '-v', 'ON_ERROR_STOP=1'], {
    input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } as unknown as NodeJS.ProcessEnv,
  })
  const m = new Map<string, string | null>()
  for (const line of out.split('\n')) {
    if (!line) continue
    const [id, reason] = line.split('\u001f')
    m.set(id, reason === '<null>' ? null : reason)
  }
  return m
}

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), { name: NAME, values: ['export', 'provenance', 'out'], defaultClient: SEALAND_CLIENT_ID })
  if (args.apply) throw new Error(`${NAME}: there is nothing to apply; it only reads`)
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(modeLine(args, NAME))
  if (!args.values.export || !args.values.provenance) throw new Error(`${NAME}: --export and --provenance are required`)
  const exp = readExportFile(args.values.export, args.clientId)
  const prov = readProvenanceFile(args.values.provenance)

  // The population: category, full lane, a comment dated in August or September.
  const months = new Map<string, Set<string>>()
  for (const r of exp.videoMonths) months.set(r.video_id, (months.get(r.video_id) ?? new Set()).add(r.month.slice(0, 7)))
  const pop = exp.videos
    .filter((v) => v.is_client !== true && v.is_competitor !== true && v.analyzed_lane === 'full')
    .filter((v) => months.get(v.id)?.has('2026-08') || months.get(v.id)?.has('2026-09'))
    .map((v) => v.id)
    .sort((a, b) => (md5(a) < md5(b) ? -1 : md5(a) > md5(b) ? 1 : 0))
  const sample = new Set(pop.slice(0, 150))

  const admin = createAdminClient()
  const text = new Map<string, { caption: string | null; hashtags: string[] | null; topics: string[] | null; source_keywords: string[] | null }>()
  for (let i = 0; i < pop.length; i += 100) {
    const { data, error } = await admin.from('videos').select('id, caption, hashtags, topics, source_keywords').in('id', pop.slice(i, i + 100))
    if (error) throw new Error(`${NAME}: videos read failed: ${error.message}`)
    for (const r of data ?? []) text.set(r.id as string, r as never)
  }
  const rows: Row[] = pop.map((id) => {
    const t = text.get(id)
    const p = prov.get(id)
    return { id, caption: t?.caption ?? null, hashtags: t?.hashtags ?? null, topics: t?.topics ?? null, terms: [...noiseTerms(p?.first_terms, t?.source_keywords, p?.first_subreddits)] }
  })
  const ts = new Map(rows.map((r) => [r.id, segmentReason({ caption: r.caption, hashtags: r.hashtags, topics: r.topics, firstTerms: r.terms, sourceKeywords: [] })]))
  const sql = sqlReasons(rows)

  const report = (ids: readonly string[], label: string) => {
    const differ = ids.filter((id) => ts.get(id) !== sql.get(id))
    const makers = ids.filter((id) => ts.get(id)?.startsWith('maker_regex:')).length
    const noise = ids.filter((id) => ts.get(id)?.startsWith('bare_name_only:')).length
    console.log(`  ${label}: ${ids.length} videos · the two copies agree on ${ids.length - differ.length} · maker ${makers} · noise ${noise}`)
    for (const id of differ.slice(0, 20)) console.log(`    DIFFER ${id}: ts=${ts.get(id)} sql=${sql.get(id)}`)
    return differ.length
  }
  const bad = report([...sample], 'the research’s 150 (md5 order)') + report(pop, 'all Aug–Sep category videos')
  if (args.values.out) {
    mkdirSync(dirname(args.values.out), { recursive: true })
    writeFileSync(args.values.out, JSON.stringify({ project: args.project, sample: [...sample], rows: rows.map((r) => ({ ...r, ts: ts.get(r.id), sql: sql.get(r.id) })) }, null, 1) + '\n')
  }
  if (bad > 0) {
    console.error(`${NAME}: FAILED: ${bad} disagreement(s)`)
    process.exit(1)
  }
  console.log(`${NAME}: the SQL and TypeScript rules agree on every video`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
