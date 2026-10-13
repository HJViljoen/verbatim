import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Candidate } from '../lib/brands/mentions'
import { buildProductsData, setKey, type ProductMonthRow, type ProductsParams, type TextRead } from '../lib/pages/v2/products'
import type { StandingText } from '../lib/products/match'
import { placeProducts, type ProductCommentRow, type ProductReadIO, type ProductVideoRow } from '../lib/products/readings'
import type { ProductCatalogue } from '../lib/products/types'
import type { MonthVideo } from '../lib/provenance/searches'
import { freezeStateFor, monthStartOf } from '../lib/reading/monthly'
import { refuseEveryPair } from '../lib/reading/pairs'

// Your products, NEAR-REAL, OFFLINE (depth v2, T5): the page built from a
// recorded production read, with no database and no model.
//
//   OPENAI_API_KEY=x node --import tsx scripts/products-page-replay.ts \
//     --dump <a dump scripts/products.ts --back-read --dry-run --dump wrote> \
//     --month 2026-09 --out <new file> [--open group:<name>|product:<name>] [--now <iso>]
//
// The dump holds every read the products dry run made over its window (the
// catalogue scan, the videos and comments read in full, each month's market,
// the rivals' finds). This runs the products step's own pass over it
// (lib/products/readings.ts placeProducts) with no model (the rules alone: the
// confirm call and the classifier add to these), and builds the page
// (`buildProductsData`) from the month rows and placements it gives, the
// panel's texts from the dump's own comments and videos. What the dump does
// not hold the shot does not show: no subject or kind (the `lens_readings`
// crosses are a live read), no video link, and every month pair refused (the
// month-pair judge reads the change log; failing closed, as the page does).
// The output is a ProductsData JSON for scripts/pages-shots.ts
// (`PRODUCTS_JSON=<file>`). It holds commenters' words: keep it local.

interface Dump {
  clientId: string
  clientName: string
  window: { from: string; to: string }
  catalogue: ProductCatalogue
  candidates: Candidate[]
  monthVideos: Record<string, MonthVideo[] | null>
  videos: ProductVideoRow[]
  comments: ProductCommentRow[]
  rivalFound: string[]
}

function arg(name: string, fallback?: string): string {
  const argv = process.argv.slice(2)
  const i = argv.indexOf(`--${name}`)
  const v = i >= 0 ? argv[i + 1] : undefined
  if (v == null || v.startsWith('--')) {
    if (fallback !== undefined) return fallback
    throw new Error(`products-page-replay: --${name} is required`)
  }
  return v
}

async function main(): Promise<void> {
  const dump = JSON.parse(readFileSync(resolve(arg('dump')), 'utf8')) as Dump
  const month = monthStartOf(`${arg('month')}-01`)
  const now = arg('now', new Date().toISOString())
  const out = resolve(arg('out'))
  if (existsSync(out)) throw new Error(`products-page-replay: ${out} exists; name a new file`)
  const io: ProductReadIO = {
    engine: 'are',
    candidates: async () => dump.candidates,
    monthVideos: async (m) => dump.monthVideos[m] ?? null,
    videos: async (ids) => { const want = new Set(ids); return dump.videos.filter((v) => want.has(v.id)) },
    comments: async (vs) => {
      const want = new Set(vs.map((v) => `${v.platform}\u0000${v.video_id}`))
      const seen = new Set<string>()
      return dump.comments.filter((c) => want.has(`${c.platform}\u0000${c.video_id}`) && !seen.has(c.id) && seen.add(c.id))
    },
    held: async () => null,
    tags: async () => null,
    rivalFound: async () => new Set(dump.rivalFound),
    // The organic base is not printed on the page; the dump predates its reads.
    searchTerms: async () => [],
    searchFound: async () => new Map(),
  }
  const pass = await placeProducts({ clientId: dump.clientId, clientName: dump.clientName, io, catalogue: dump.catalogue, window: dump.window, ask: null, budgetUsd: 0 })
  const rows: ProductMonthRow[] = pass.rows
    .filter((r) => r.month <= month)
    .map((r) => ({ ...r, status: freezeStateFor(r.month, now) }))
  const market = (dump.monthVideos[month] ?? []).map((v) => ({ id: v.id, audience: v.audience, platform: v.platform }))

  // The open item, by name.
  const params: ProductsParams = {}
  const open = arg('open', '')
  if (open) {
    const [kind, name] = [open.slice(0, open.indexOf(':')), open.slice(open.indexOf(':') + 1)]
    if (kind === 'group') params.group = dump.catalogue.groups.find((g) => g.name === name)?.id
    if (kind === 'product') params.product = dump.catalogue.products.find((p) => p.name === name)?.id
  }

  // The panel's texts, from the dump's own rows.
  const videos = new Map(dump.videos.map((v) => [v.id, v]))
  const comments = new Map(dump.comments.map((c) => [c.id, c]))
  const textOf = (t: StandingText): TextRead => {
    const c = t.commentId ? comments.get(t.commentId) : undefined
    const v = videos.get(t.videoId)
    return {
      key: t.commentId ? `c:${t.commentId}` : `v:${t.videoId}`, videoId: t.videoId, commentId: t.commentId,
      text: c?.text ?? null, lang: null, english: null, date: c?.comment_date ?? null,
      platform: v?.platform ?? c?.platform ?? null, account: v?.account_name ?? null, videoUrl: null, platformCommentId: null,
    }
  }
  const newest = (a: TextRead, b: TextRead) => (b.date ?? '').localeCompare(a.date ?? '')
  const { productMonthSets, unclearTexts, namedComments } = await import('../lib/pages/v2/products')
  const sets = productMonthSets({ month, market, standing: pass.standing, groups: dump.catalogue.groups.map((g) => g.id), products: dump.catalogue.products.map((p) => p.id) })
  const panelReads = params.group
    ? { unclear: unclearTexts(pass.standing, month, params.group, sets.groups.get(params.group)?.unclear ?? new Set()).map(textOf).sort(newest) }
    : params.product
      ? { named: namedComments(pass.standing, month, params.product, sets.products.get(params.product) ?? new Set()).map(textOf).sort(newest) }
      : null

  const data = buildProductsData({
    clientId: dump.clientId, client: dump.clientName, month, soFar: freezeStateFor(month, now) === 'filling' && now < `${month.slice(0, 7)}-31`,
    catalogue: { state: 'ready', catalogue: dump.catalogue }, enabled: true, rows, market, standing: pass.standing,
    crosses: new Map(), pair: refuseEveryPair, params, canTag: true, panelReads,
  })
  writeFileSync(out, JSON.stringify(data))
  const header = data.header
  console.log(`products-page-replay: ${data.state} · ${data.monthWords} · ${header?.cameUp ?? 0} of ${header?.products ?? 0} products came up · ${header?.videos ?? '?'} videos · market ${data.market ?? '?'}`)
  for (const c of data.shelf) console.log(`  ${c.name}: ${c.videos} (${c.unclear} not which) · ${c.products.filter((p) => (p.videos ?? 0) > 0).map((p) => `${p.name} ${p.videos}`).join(', ') || 'no product named'}`)
  console.log(`  standouts: ${data.standouts.map((s) => `${s.kind} ${s.name}`).join(' · ') || 'none'}`)
  console.log(`  set keys read: ${[...sets.groups.keys()].map((g) => setKey('group', g)).length} categories; wrote ${out} (local only: it holds commenters' words)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
