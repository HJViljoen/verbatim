import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chunk } from '../lib/chunk'
import { CLUSTER_SIMILARITY_THRESHOLD, MERGE_CHUNK_MAX } from '../lib/config'

// The pre-merge half of a `themes:<bucket>` step, timed by phase, on a real
// bucket (18 Nov: Sealand's industry-other spent 193 s of the step's 255 s
// before its first merge call, and 57 of the 76 merge calls of its last two
// attempts were aborted at the deadline).
//
//   fetch  node --env-file=.env.local --import tsx scripts/cluster-bench.ts fetch \
//            --client <uuid> --run <uuid> [--bucket industry-other] [--dir <dir>]
//          The step's own load (loadGroupedInsights, timed) and its own embed
//          pass over the bucket (embedTexts, one request at a time, each
//          timed), saved to <dir> as float32 vectors plus the insight ids.
//          Writes nothing to the database. Spends one embeddings pass
//          (text-embedding-3-small, about $0.01 for 10,000 insights).
//          The vectors come from the API and not from
//          audience_insights.embedding on purpose: AGENTS.md forbids
//          reading that column in bulk, and the step re-embeds the bucket
//          on every run anyway, so these are the vectors it clusters.
//
//   time   node --expose-gc --import tsx scripts/cluster-bench.ts time --in <file.f32> [--in <file.f32> …]
//            [--n <count>] [--impl old|new] [--check]
//          Offline. Concatenates the files (in order) and takes the first
//          <count> vectors; past their end (a bucket bigger than any today)
//          it adds jittered copies of the earliest, a fixed sequence, so the
//          clusters stay embedding-shaped. One implementation per process, so
//          the peak RSS it prints is that implementation's. --check runs both
//          and compares their clusters, assignments and order, exactly.

const DIM = 1536

interface Meta {
  clientId: string
  runId: string
  bucket: string
  n: number
  dim: number
  ids: string[]
  loadMs: number
  embedMs: number
  embedRequestMs: number[]
  corpusInsights: number
  fetchedAt: string
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
function args(argv: string[], name: string): string[] {
  return argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []))
}
const s = (ms: number) => `${(ms / 1000).toFixed(2)} s`
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`

async function fetchBucket(argv: string[]) {
  const clientId = arg(argv, '--client')
  const runId = arg(argv, '--run')
  const bucket = arg(argv, '--bucket') ?? 'industry-other'
  const dir = arg(argv, '--dir') ?? join(tmpdir(), 'cluster-bench')
  if (!clientId || !runId) throw new Error('fetch needs --client <uuid> --run <uuid>')
  const out = join(dir, `${clientId}-${bucket}`)
  if (existsSync(`${out}.json`)) throw new Error(`${out}.json exists; one fetch a bucket (AGENTS.md: no read loops)`)
  mkdirSync(dir, { recursive: true })

  // Imported here so `time` runs with no env and no network.
  const { createAdminClient } = await import('../lib/supabase-admin')
  const { loadGroupedInsights } = await import('../lib/pipeline/step-a2')
  const { embedTexts, embedInput, EMBED_BATCH } = await import('../lib/pipeline/cluster')

  // The probe on the path the loader uses (run-a2.ts's rule): slow or
  // failing, nothing else is read.
  const probeAt = Date.now()
  const { data: run, error } = await createAdminClient()
    .from('pipeline_runs').select('id, client_id, status').eq('id', runId).maybeSingle()
  const probeMs = Date.now() - probeAt
  if (error) throw new Error(`run read failed (PostgREST): ${error.message}`)
  if (probeMs > 3_000) throw new Error(`PostgREST probe took ${s(probeMs)}; no production read for 15 minutes (AGENTS.md)`)
  if (!run || run.client_id !== clientId) throw new Error(`run ${runId} is not this client's`)
  console.log(`PostgREST probe ${probeMs} ms; run ${run.id} is ${run.status}`)

  const loadAt = Date.now()
  const { groups } = await loadGroupedInsights(clientId, runId)
  const loadMs = Date.now() - loadAt
  const grp = groups.find((g) => g.bucket === bucket)
  if (!grp) throw new Error(`bucket "${bucket}" not in this corpus (have: ${groups.map((g) => g.bucket).join(', ')})`)
  const corpusInsights = groups.reduce((t, g) => t + g.insights.length, 0)
  console.log(`load ${s(loadMs)}: ${corpusInsights} insights in ${groups.length} buckets; ${bucket} has ${grp.insights.length}`)

  // embedTexts chunks at EMBED_BATCH and calls one request at a time; calling
  // it a chunk at a time is the same requests in the same order, timed each.
  const texts = grp.insights.map(embedInput)
  const vecs: number[][] = []
  const embedRequestMs: number[] = []
  const embedAt = Date.now()
  for (const part of chunk(texts, EMBED_BATCH)) {
    const t0 = Date.now()
    vecs.push(...(await embedTexts(part)))
    embedRequestMs.push(Date.now() - t0)
  }
  const embedMs = Date.now() - embedAt
  console.log(`embed ${s(embedMs)}: ${embedRequestMs.length} requests (${embedRequestMs.map((m) => (m / 1000).toFixed(1)).join(' · ')} s)`)

  const flat = new Float32Array(vecs.length * DIM)
  vecs.forEach((v, i) => {
    if (v.length !== DIM) throw new Error(`vector ${i} has ${v.length} dimensions, not ${DIM}`)
    for (let d = 0; d < DIM; d++) {
      // The SDK decodes base64 float32, so every value is a float32 already
      // and this copy is exact; say so if it ever is not.
      if (Math.fround(v[d]) !== v[d]) throw new Error(`vector ${i} holds a value that is not a float32`)
      flat[i * DIM + d] = v[d]
    }
  })
  writeFileSync(`${out}.f32`, Buffer.from(flat.buffer))
  const meta: Meta = {
    clientId, runId, bucket, n: vecs.length, dim: DIM, ids: grp.insights.map((i) => i.id),
    loadMs, embedMs, embedRequestMs, corpusInsights, fetchedAt: new Date().toISOString(),
  }
  writeFileSync(`${out}.json`, JSON.stringify(meta))
  console.log(`saved ${out}.f32 (${mb(flat.byteLength)}) and ${out}.json`)
}

/** The files' vectors as the SDK hands them over: one number[] each. */
function loadVecs(files: string[], n?: number): number[][] {
  const out: number[][] = []
  for (const f of files) {
    const buf = readFileSync(f)
    const flat = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
    for (let i = 0; i * DIM < flat.length; i++) {
      if (n !== undefined && out.length >= n) return out
      out.push(Array.from(flat.subarray(i * DIM, (i + 1) * DIM)))
    }
  }
  // Past the real vectors: copy i of the earliest, each value moved by up to
  // ±0.02 (a unit vector of 1,536 values is about ±0.026 each; a copy sits at
  // a cosine of about 0.9 to its original), kept a float32 as
  // the SDK's are. A plain LCG, so every run gets the same corpus.
  const real = out.length
  let seed = 12345
  const jitter = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    return (seed / 2 ** 32) * 0.04 - 0.02
  }
  for (let i = 0; n !== undefined && out.length < n; i++) out.push(out[i % real].map((x) => Math.fround(x + jitter())))
  return out
}

function peak(): string {
  // maxRSS is in kilobytes.
  return `${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB`
}

async function time(argv: string[]) {
  const files = args(argv, '--in')
  if (!files.length) throw new Error('time needs --in <file.f32>')
  const nArg = arg(argv, '--n')
  const impl = arg(argv, '--impl') ?? 'new'
  const check = argv.includes('--check')
  const threshold = CLUSTER_SIMILARITY_THRESHOLD
  // lib/openai.ts builds its client at import; nothing here calls it.
  process.env.OPENAI_API_KEY ??= 'unused-offline'
  const { averageLinkageClusters, clusterCentroids } = await import('../lib/pipeline/cluster')
  const { averageLinkageClustersV1, similarityMatrixV1 } = await import('../lib/pipeline/cluster-oracle')
  const { partitionByCentroid } = await import('../lib/pipeline/theme-merge')

  const t0 = performance.now()
  const vecs = loadVecs(files, nArg ? Number(nArg) : undefined)
  const n = vecs.length
  console.log(`n=${n} dim=${DIM} threshold=${threshold} (read ${s(performance.now() - t0)}; rss ${peak()} after the vectors)`)

  if (check) {
    const tOld = performance.now()
    const old = averageLinkageClustersV1(vecs, threshold)
    const oldMs = performance.now() - tOld
    const tNew = performance.now()
    const mine = averageLinkageClusters(vecs, threshold)
    const newMs = performance.now() - tNew
    const same = old.length === mine.length && old.every((g, i) => g.length === mine[i].length && g.every((x, j) => x === mine[i][j]))
    console.log(`old ${s(oldMs)}, new ${s(newMs)}: ${old.length} vs ${mine.length} clusters; identical assignments and order: ${same}`)
    if (!same) {
      const firstDiff = old.findIndex((g, i) => !mine[i] || g.join(',') !== mine[i].join(','))
      console.log(`first differing group at ${firstDiff}: old [${old[firstDiff]?.slice(0, 10)}] new [${mine[firstDiff]?.slice(0, 10)}]`)
      process.exitCode = 1
    }
    return
  }

  if (impl === 'old') {
    // The 11 Sep code: the fill alone, then the whole function (fill + loop),
    // so the loop is the difference.
    const tf = performance.now()
    let m: Float64Array | null = similarityMatrixV1(vecs)
    const fillMs = performance.now() - tf
    m = null
    // Without --expose-gc the first matrix may outlive its use, and the peak
    // RSS then counts it twice.
    const gc = (globalThis as { gc?: () => void }).gc
    if (gc) gc()
    else console.log('(no --expose-gc: the old peak RSS may count the fill-only matrix too)')
    void m
    const tw = performance.now()
    const groups = averageLinkageClustersV1(vecs, threshold)
    const wholeMs = performance.now() - tw
    report('old', n, groups, fillMs, wholeMs - fillMs, vecs, clusterCentroids, partitionByCentroid)
  } else {
    const { similarityTriangle, linkTriangle } = await import('../lib/pipeline/cluster')
    const tf = performance.now()
    const tri = similarityTriangle(vecs)
    const fillMs = performance.now() - tf
    const tl = performance.now()
    const groups = linkTriangle(tri, n, threshold)
    const linkMs = performance.now() - tl
    // The exported entry point is the two above in sequence; checked here so
    // the timing is of the code the step runs.
    if (n <= 2000) {
      const whole = averageLinkageClusters(vecs, threshold)
      if (whole.length !== groups.length) throw new Error('averageLinkageClusters disagrees with its parts')
    }
    report('new', n, groups, fillMs, linkMs, vecs, clusterCentroids, partitionByCentroid)
  }
}

function report(
  impl: string, n: number, groups: number[][], fillMs: number, linkMs: number, vecs: number[][],
  clusterCentroids: (v: number[][], g: number[][]) => Float32Array[],
  partitionByCentroid: (c: readonly ArrayLike<number>[], max: number) => number[][],
) {
  const tc = performance.now()
  const centroids = clusterCentroids(vecs, groups)
  const centroidMs = performance.now() - tc
  const tp = performance.now()
  const parts = partitionByCentroid(centroids, MERGE_CHUNK_MAX)
  const partMs = performance.now() - tp
  console.log(`[${impl}] n=${n}: fill ${s(fillMs)} · linkage ${s(linkMs)} · centroids ${s(centroidMs)} · partition ${s(partMs)} (${parts.length} parts) → ${groups.length} clusters; peak rss ${peak()}`)
}

const [mode, ...rest] = process.argv.slice(2)
const run = mode === 'fetch' ? fetchBucket(rest) : mode === 'time' ? time(rest) : Promise.reject(new Error('mode: fetch | time'))
run.catch((e) => {
  console.error(e)
  process.exit(1)
})
