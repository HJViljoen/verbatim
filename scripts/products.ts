import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Candidate } from '../lib/brands/mentions'
import { readRivalFound } from '../lib/brands/rival-searches'
import { readSearchFound, readSearchTerms } from '../lib/products/organic'
import { recordConfigChange, scriptActor } from '../lib/config-log'
import { assertProject, MARKET_FIRST_PROJECTS } from '../lib/ops/market-first-args'
import { denominatorKey, monthStartOf } from '../lib/reading/monthly'
import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { clientNameOf, readCommentAuthors, readOwnHandles } from '../lib/pipeline/product-readings'
import { runClassifier, type ClassifyItem, type RunClassifyResult } from '../lib/products/classify'
import { excerptAround, keyOfRow, standingPlacements, type MentionInsert } from '../lib/products/match'
import {
  CATEGORY_WORDS_ONLY_UNDER_RELEVANT, guardFreeze, HELD_COLUMNS, itemsLeft, mergeProductRows, placeProducts, pooledProductMonth, priceItems, PRODUCT_COMMENT_COLUMNS, PRODUCT_VIDEO_COLUMNS, productReadingRows,
  readProductMonthVideos, storedProductRows, writeProductRows, type Ask, type HeldRow, type PlaceResult, type ProductCommentRow, type ProductReadIO, type ProductVideoRow,
} from '../lib/products/readings'
import { matchAliases } from '../lib/products/rules'
import { hashSample, KIND_WORD, parseProductsArgs, planSeedLoad, PRODUCTS_SCRIPT, type HeldCatalogue, type ProductsArgs, type SampleRow } from '../lib/products/script'
import { seedCatalogue, seedProblems, seedRows, type CatalogueSeed } from '../lib/products/seed'
import {
  isMissingProductsSchema, loadProductCatalogue, PRODUCT_TAG_COLUMNS, PRODUCTS_SURFACE, TABLE_PRODUCT_ALIASES, TABLE_PRODUCT_GROUPS,
  TABLE_PRODUCT_MENTIONS, TABLE_PRODUCT_TAGS, TABLE_PRODUCTS, type ProductCatalogue, type ProductContentField, type ProductTagRow,
} from '../lib/products/types'

// Your products, by hand (depth redesign v2, T12): load a catalogue seed, and
// read the months back. Three modes; every write is Heinrich's paste-run.
//
//   1. THE SEED. --client <uuid> --project <ref> [--confirm] --seed <file> [--apply]
//      Reads the seed (scripts/seeds/<client>-products.ts), refuses it if it
//      would not load (lib/products/seed.ts seedProblems), reads what the
//      catalogue holds, and prints what loading it writes: every category,
//      product and name the catalogue does not hold yet, and a line for each
//      it holds differently. APPEND-ONLY: nothing held is moved, renamed,
//      retired or deleted (a person does that in Settings). Dry unless
//      --apply; --apply inserts with the actor scriptActor(<this command>)
//      and logs ONE config_changes row on surface 'products'.
//
//   2. THE BACK-READ, DRY. --client --project --confirm --back-read --dry-run
//      [--seed <file>] [--from 2026-06-01] [--to <first of next month>]
//      Reads production over the window and writes NOTHING: the rules over
//      every text, the generic names the confirm call would read, the
//      comments the classifier would read, the months by the rules alone, and
//      a PRICE for the model calls, estimated from the very prompts it would
//      send (lib/products/classify.ts estimateBatchUsd; no model is called).
//      --seed takes the catalogue from the seed file, for a dry run before
//      the migration is applied or the seed loaded. --out <new file> writes
//      the plan's counts (no comment's words) to a local file; --dump <new
//      file> every read (the words included) for replaying the pass offline,
//      and --replay <that file> runs the dry run again from it, reading no
//      database (a revised seed or prompt measured on the same texts).
//      THE HAND CHECK: --sample-model <n> --sample-out <new file> [--budget 1]
//      ALSO asks the model about a fixed sample of n of the generic names and
//      n of the classifier's comments (nothing written to the database,
//      budget-capped), and writes a sheet of 50 placements (rules and model)
//      with their words to a NEW local file for a person to label. The words
//      live in that file only.
//
//   3. THE BACK-READ, WRITTEN. --client --project --confirm --back-read --write
//      [--from] [--to] [--budget 5] [--cap <items>]
//      The same pass over the catalogue the DATABASE holds (the seed loaded
//      first), with the model asked (the hard cap: --budget dollars, default
//      $5; --cap items): the rules' rows and the model's are inserted into
//      product_mentions (append-only; a row the table holds is skipped, so a
//      second run asks only what the first did not finish), then every month
//      of the window is written to month_product_readings. A month that
//      closed before the table had its rows takes them ONCE (decision K's
//      arm): a product or a name added after this has no history for those
//      months. Run it only with the catalogue reviewed and complete.
//
// READ-ONLY UNLESS --apply (seed) OR --write (back-read), and never prompts.
// --project must be one of the two allow-listed refs and the Supabase URL the
// script was started with must be its (assertProject); production is read
// only with --confirm, which times a one-row probe first and stops over 3 s.
// --max-reads (default 80) stops before the read that would pass it, and
// one query is in flight at a time.
//
// THE READS (a dry back-read, June to October, with --seed): the probe (1),
// the client's name (1), market_month_videos per month (5), the rival
// searches and the videos they found (4), brand_mention_candidates over the
// whole window with the catalogue's one pattern (a page per 1,000 rows), the
// videos it found in content (a request per 100), and the comments under the
// category-relevant videos (a page per 1,000). About 30.
//
//   node --env-file=.env.local --import tsx scripts/products.ts --client <uuid> --project mkwjlckescdveosvrvaq --confirm \
//     --seed scripts/seeds/ossur-products.ts [--apply]
//   node --env-file=.env.local --import tsx scripts/products.ts --client <uuid> --project mkwjlckescdveosvrvaq --confirm \
//     --back-read --dry-run [--seed scripts/seeds/ossur-products.ts] [--out <file>]
//   node --env-file=.env.local --import tsx scripts/products.ts --client <uuid> --project mkwjlckescdveosvrvaq --confirm \
//     --back-read --write [--budget 5]

const NAME = PRODUCTS_SCRIPT
const PROBE_MAX_MS = 3000
const ID_CHUNK = 100

class Ration {
  n = 0
  constructor(private readonly max: number) {}
  spend(k: number, what: string): void {
    this.n += k
    if (this.n > this.max) throw new Error(`${NAME}: the read ration (--max-reads ${this.max}) is spent at ${what}. Nothing written.`)
  }
}

function writeNew(path: string, body: string): void {
  if (existsSync(path)) throw new Error(`${NAME}: ${path} exists; name a new file`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`
const monthsOf = (from: string, to: string): string[] => {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  while (d.toISOString().slice(0, 10) < to) { out.push(d.toISOString().slice(0, 10)); d.setUTCMonth(d.getUTCMonth() + 1) }
  return out
}

/** A builder thunk that charges the ration once per page selectAll asks for. */
const paged = <B>(ration: Ration, what: string, build: () => B): (() => B) => () => { ration.spend(1, what); return build() }

async function probe(admin: SupabaseClient, clientId: string, ration: Ration): Promise<void> {
  const t0 = Date.now()
  ration.spend(1, 'the probe')
  const { error } = await admin.from('clients').select('id').eq('id', clientId).limit(1)
  const ms = Date.now() - t0
  if (error) throw new Error(`${NAME}: the probe failed (${error.message}). Back off 15 minutes. Nothing read further.`)
  console.log(`  probe: ${ms} ms`)
  if (ms > PROBE_MAX_MS) throw new Error(`${NAME}: the probe took ${ms} ms (over ${PROBE_MAX_MS}). Back off 15 minutes. Nothing read further.`)
}

async function loadSeed(path: string): Promise<CatalogueSeed> {
  const mod = await import(pathToFileURL(resolve(path)).href) as Record<string, unknown>
  const seed = (mod.default ?? Object.values(mod).find((v) => typeof v === 'object' && v !== null && 'groups' in v)) as CatalogueSeed | undefined
  if (!seed || !Array.isArray(seed.groups)) throw new Error(`${NAME}: ${path} exports no catalogue seed`)
  const problems = seedProblems(seed)
  if (problems.length) throw new Error(`${NAME}: the seed would not load:\n  ${problems.join('\n  ')}\nNothing read or written.`)
  return seed
}

// ---- 1. the seed ----------------------------------------------------------------------------

async function heldCatalogue(admin: SupabaseClient, clientId: string, ration: Ration): Promise<HeldCatalogue> {
  try {
    const groups = await selectAll<{ id: string; name: string }>(paged(ration, 'the categories', () => admin.from(TABLE_PRODUCT_GROUPS).select('id, name').eq('client_id', clientId).eq('status', 'active').order('id')))
    const products = await selectAll<{ id: string; name: string; group_id: string }>(paged(ration, 'the products', () => admin.from(TABLE_PRODUCTS).select('id, name, group_id').eq('client_id', clientId).eq('status', 'active').order('id')))
    const aliases = await selectAll<{ alias: string; product_id: string | null; group_id: string | null }>(paged(ration, 'the names', () => admin.from(TABLE_PRODUCT_ALIASES).select('alias, product_id, group_id').eq('client_id', clientId).is('retired_at', null).order('id')))
    return { groups, products, aliases }
  } catch (e) {
    if (isMissingProductsSchema(e)) throw new Error(`${NAME}: the products migration (20261109090000) is not applied here. Apply it first (scripts/apply-market-first-migrations.sh --set products). Nothing written.`)
    throw e
  }
}

async function seedMode(admin: SupabaseClient, args: ProductsArgs, ration: Ration, command: string): Promise<void> {
  if (args.mode.kind !== 'seed') return
  const seed = await loadSeed(args.mode.seed)
  const rows = seedRows(seed)
  console.log(`  seed: ${args.mode.seed} · from ${seed.seededFrom}, compiled ${seed.compiledOn} · ${rows.groups.length} categories, ${rows.products.length} products, ${rows.aliases.length} names (${rows.aliases.filter((a) => a.needsConfirm).length} generic)`)
  const held = await heldCatalogue(admin, args.clientId, ration)
  const plan = planSeedLoad(rows, held)
  console.log(`  the catalogue holds ${held.groups.length} categories, ${held.products.length} products, ${held.aliases.length} live names`)
  console.log(`  already held as the seed has them: ${plan.held.groups} categories, ${plan.held.products} products, ${plan.held.aliases} names`)
  console.log(`  to write: ${plan.groups.length} categories, ${plan.products.length} products, ${plan.aliases.length} names`)
  for (const g of plan.groups) console.log(`    + category ${g.name}`)
  for (const p of plan.products) console.log(`    + product  ${p.name} (in ${rows.groups.find((g) => g.key === p.groupKey)?.name})`)
  for (const a of plan.aliases) console.log(`    + ${KIND_WORD[a.kind].padEnd(13)} ${a.alias}${a.needsConfirm ? ' (generic: the confirm call reads it first)' : ''}`)
  for (const c of plan.conflicts) console.log(`    ! ${c}`)
  if (!args.mode.apply) { console.log(`\n${NAME}: DRY: nothing written. Add --apply to write the rows above.`); return }
  if (plan.groups.length + plan.products.length + plan.aliases.length === 0) { console.log(`\n${NAME}: nothing to write.`); return }

  const actor = scriptActor(command)
  const stamp = { actor_kind: 'script', actor_user_id: null, actor_label: actor.label ?? command }
  const before = await loadProductCatalogue(admin, args.clientId)
  const groupId = new Map<string, string>()
  for (const g of rows.groups) {
    const id = held.groups.find((h) => h.name.trim().toLowerCase() === g.name.toLowerCase())?.id
    if (id) groupId.set(g.key, id)
  }
  const maxSort = held.groups.length
  for (const g of plan.groups) {
    const { data, error } = await admin.from(TABLE_PRODUCT_GROUPS).insert({ client_id: args.clientId, name: g.name, sort: maxSort + g.sort, seeded_from: seed.seededFrom, ...stamp }).select('id').single()
    if (error || !data) throw new Error(`${NAME}: category ${g.name}: ${error?.message ?? 'no id returned'} (rows written before this stay; re-run to finish)`)
    groupId.set(g.key, (data as { id: string }).id)
  }
  const productId = new Map<string, string>()
  for (const p of rows.products) {
    const id = held.products.find((h) => h.name.trim().toLowerCase() === p.name.toLowerCase())?.id
    if (id) productId.set(p.key, id)
  }
  for (const p of plan.products) {
    const gid = groupId.get(p.groupKey)
    if (!gid) throw new Error(`${NAME}: product ${p.name}: its category was not written`)
    const { data, error } = await admin.from(TABLE_PRODUCTS).insert({ client_id: args.clientId, group_id: gid, name: p.name, sort: p.sort, seeded_from: seed.seededFrom, ...stamp }).select('id').single()
    if (error || !data) throw new Error(`${NAME}: product ${p.name}: ${error?.message ?? 'no id returned'} (rows written before this stay; re-run to finish)`)
    productId.set(p.key, (data as { id: string }).id)
  }
  const aliasRows = plan.aliases.map((a) => ({
    client_id: args.clientId, product_id: a.productKey ? productId.get(a.productKey) ?? null : null, group_id: a.groupKey ? groupId.get(a.groupKey) ?? null : null,
    alias: a.alias, kind: a.kind, needs_confirm: a.needsConfirm, seeded_from: seed.seededFrom, ...stamp,
  }))
  for (let i = 0; i < aliasRows.length; i += 200) {
    const { error } = await admin.from(TABLE_PRODUCT_ALIASES).insert(aliasRows.slice(i, i + 200))
    if (error) throw new Error(`${NAME}: names: ${error.message} (rows written before this stay; re-run to finish)`)
  }
  const after = await loadProductCatalogue(admin, args.clientId)
  const version = (r: typeof before) => (r.state === 'ready' ? r.catalogue.version : null)
  const counts = (r: typeof before) => (r.state === 'ready' ? { groups: r.catalogue.groups.length, products: r.catalogue.products.length, aliases: r.catalogue.aliases.length, version: r.catalogue.version } : { groups: 0, products: 0, aliases: 0, version: null })
  const logged = await recordConfigChange(admin, {
    clientId: args.clientId, surface: PRODUCTS_SURFACE, field: 'catalogue', before: counts(before), after: counts(after), actor,
    rowsAffected: plan.groups.length + plan.products.length + plan.aliases.length,
    note: `seed ${args.mode.seed} from ${seed.seededFrom}, compiled ${seed.compiledOn}`,
  })
  console.log(`\n${NAME}: WROTE ${plan.groups.length} categories, ${plan.products.length} products, ${plan.aliases.length} names · catalogue ${version(before) ?? '(none)'} → ${version(after)} · change ${logged ? 'logged' : 'NOT logged (see above)'}`)
}

// ---- 2 and 3. the back-read --------------------------------------------------------------------

/** Every read a dry run made (--dump), keyed by what it asked. */
interface Recording {
  candidates: Candidate[]
  monthVideos: Record<string, unknown>
  videos: ProductVideoRow[]
  comments: ProductCommentRow[]
  rivalFound: string[]
  /** Our search terms, and video → the category terms that found it (absent
   *  in a dump made before the per-category base: replayed as none). */
  searchTerms?: string[]
  searchFound?: Record<string, string[]>
}

/** A dump's reads, replayed: no database. */
function replayIO(rec: Recording): ProductReadIO {
  const found = new Set(rec.rivalFound)
  return {
    engine: 'are',
    candidates: async () => rec.candidates,
    monthVideos: async (m) => (rec.monthVideos[m] ?? null) as Awaited<ReturnType<ProductReadIO['monthVideos']>>,
    videos: async (ids) => { const want = new Set(ids); return rec.videos.filter((v) => want.has(v.id)) },
    comments: async (vs) => {
      const want = new Set(vs.map((v) => `${v.platform}\u0000${v.video_id}`))
      const seen = new Set<string>()
      return rec.comments.filter((c) => want.has(`${c.platform}\u0000${c.video_id}`) && !seen.has(c.id) && seen.add(c.id))
    },
    held: async () => null,
    tags: async () => null,
    rivalFound: async () => found,
    searchTerms: async () => rec.searchTerms ?? [],
    searchFound: async (terms) => {
      const want = new Set(terms.map((t) => t.trim().toLowerCase()))
      return new Map(Object.entries(rec.searchFound ?? {}).filter(([, ts]) => ts.some((t) => want.has(t.trim().toLowerCase()))))
    },
  }
}

/** The IO, recording what it returns into `rec` (a dry run's --dump). */
function recorded(io: ProductReadIO, rec: Recording): ProductReadIO {
  return {
    ...io,
    candidates: async (p) => { const r = await io.candidates(p); rec.candidates.push(...r); return r },
    monthVideos: async (m) => { const r = await io.monthVideos(m); rec.monthVideos[m] = r; return r },
    videos: async (ids) => { const r = await io.videos(ids); rec.videos.push(...r); return r },
    comments: async (vs) => { const r = await io.comments(vs); rec.comments.push(...r); return r },
    rivalFound: async () => { const r = await io.rivalFound(); rec.rivalFound.push(...r); return r },
    searchTerms: async () => { const r = await io.searchTerms(); rec.searchTerms = [...r]; return r },
    searchFound: async (terms) => { const r = await io.searchFound(terms); rec.searchFound = Object.fromEntries([...r].map(([k, v]) => [k, [...v]])); return r },
  }
}

function scriptIO(admin: SupabaseClient, args: ProductsArgs, ration: Ration, fromSeed: boolean): ProductReadIO {
  const window = { from: args.from, to: args.to }
  return {
    engine: 'are',
    candidates: async (pattern) => {
      const rows = await selectAll<Candidate>(paged(ration, 'the catalogue scan', () => admin.rpc('brand_mention_candidates', { p_client: args.clientId, p_pattern: pattern, p_from: window.from, p_to: window.to })
        .order('video_id').order('source').order('field').order('comment_id')))
      return rows.map((r) => ({ ...r, comment_month: r.comment_month ? String(r.comment_month).slice(0, 10) : null }))
    },
    monthVideos: async (m) => {
      const pages = { n: 0 }
      ration.spend(1, `the market of ${m.slice(0, 7)}`)
      const out = await readProductMonthVideos(admin, args.clientId, m, pages)
      if (pages.n > 1) ration.spend(pages.n - 1, `the market of ${m.slice(0, 7)}`)
      return out
    },
    videos: async (ids) => {
      const out: ProductVideoRow[] = []
      for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const part = ids.slice(i, i + ID_CHUNK)
        out.push(...await selectAll<ProductVideoRow>(paged(ration, 'the videos the scan found', () => admin.from('videos').select(PRODUCT_VIDEO_COLUMNS).eq('client_id', args.clientId).in('id', part).order('id'))))
      }
      return out
    },
    comments: async (videos) => {
      const out: ProductCommentRow[] = []
      const byPlatform = new Map<string, string[]>()
      for (const v of videos) byPlatform.set(v.platform, [...(byPlatform.get(v.platform) ?? []), v.video_id])
      for (const [platform, ids] of [...byPlatform].sort(([a], [b]) => a.localeCompare(b))) {
        const uniq = [...new Set(ids)].sort()
        for (let i = 0; i < uniq.length; i += 200) {
          const part = uniq.slice(i, i + 200)
          out.push(...await selectAll<ProductCommentRow>(paged(ration, `the comments under the relevant ${platform} videos`, () => admin.from('comments').select(PRODUCT_COMMENT_COLUMNS)
            .eq('client_id', args.clientId).eq('platform', platform).in('video_id', part)
            .gte('comment_date', `${window.from}T00:00:00Z`).lt('comment_date', `${window.to}T00:00:00Z`).order('id'))))
        }
      }
      return out
    },
    held: async (version, months) => {
      if (fromSeed) return null
      try {
        const content = await selectAll<HeldRow>(paged(ration, 'the held placements', () => admin.from(TABLE_PRODUCT_MENTIONS).select(HELD_COLUMNS)
          .eq('client_id', args.clientId).eq('catalogue_version', version).eq('source', 'content').order('id')))
        const comment = await selectAll<HeldRow>(paged(ration, 'the held placements', () => admin.from(TABLE_PRODUCT_MENTIONS).select(HELD_COLUMNS)
          .eq('client_id', args.clientId).eq('catalogue_version', version).eq('source', 'comment').in('comment_month', [...months]).order('id')))
        const tags = await selectAll<HeldRow>(paged(ration, 'the tags\' placements', () => admin.from(TABLE_PRODUCT_MENTIONS).select(HELD_COLUMNS)
          .eq('client_id', args.clientId).eq('method', 'tag').order('id')))
        return [...content, ...comment, ...tags.filter((t) => t.catalogue_version !== version)]
      } catch (e) {
        if (isMissingProductsSchema(e)) return null
        throw e
      }
    },
    tags: async () => {
      if (fromSeed) return null
      try {
        return await selectAll<ProductTagRow>(paged(ration, 'the tags', () => admin.from(TABLE_PRODUCT_TAGS).select(PRODUCT_TAG_COLUMNS).eq('client_id', args.clientId).order('id')))
      } catch (e) {
        if (isMissingProductsSchema(e)) return null
        throw e
      }
    },
    rivalFound: async () => {
      ration.spend(1, 'the rival searches configured')
      const { data, error } = await admin.from('tracking_configs').select('competitor_keywords').eq('client_id', args.clientId).maybeSingle()
      if (error) throw new Error(`tracking_configs: ${error.message}`)
      const terms = (data as { competitor_keywords: string[] | null } | null)?.competitor_keywords ?? null
      const found = await readRivalFound(admin, args.clientId, terms, ration)
      console.log(`  rival searches: ${found.terms.size} terms (${[...found.terms].slice(0, 8).join(', ')}${found.terms.size > 8 ? ', …' : ''}), ${found.videos.size} videos found by them`)
      return found.videos
    },
    searchTerms: () => readSearchTerms(admin, args.clientId, ration),
    searchFound: (terms) => readSearchFound(admin, args.clientId, terms, ration),
    ownHandles: () => { ration.spend(1, 'the client\'s own handles'); return readOwnHandles(admin, args.clientId) },
    commentAuthors: (ids) => { ration.spend(Math.max(1, Math.ceil(ids.length / 100)), 'who wrote the scan\'s comments'); return readCommentAuthors(admin, args.clientId, ids) },
  }
}

/** The months as the rules alone place them (a dry run's counts). */
function rulesOnlyRows(clientId: string, pass: PlaceResult, catalogue: ProductCatalogue) {
  const standing = standingPlacements({
    rows: pass.ruleRows,
    active: { groups: new Set(catalogue.groups.map((g) => g.id)), products: new Set(catalogue.products.map((p) => p.id)) },
  })
  return productReadingRows({ clientId, compiled: pass.compiled, markets: pass.markets, rivalFound: pass.rivalFound, searchFinds: pass.searchFinds, standing })
}

function printMonths(rows: ReturnType<typeof rulesOnlyRows>, catalogue: ProductCatalogue, months: readonly string[], heading: string): void {
  console.log(`\n  ${heading}`)
  for (const m of months) {
    const n = pooledProductMonth(rows, m, catalogue.groups[0]?.id ?? '').n
    console.log(`  ${m.slice(0, 7)} (${n} videos in the market):`)
    for (const g of catalogue.groups) {
      const p = pooledProductMonth(rows, m, g.id)
      const named = catalogue.products.filter((x) => x.group_id === g.id)
        .map((x) => ({ name: x.name, k: pooledProductMonth(rows, m, x.id).k_any })).filter((x) => x.k > 0).sort((a, b) => b.k - a.k)
      console.log(`    ${g.name.padEnd(22)} ${String(p.k_any).padStart(4)} of ${p.n}: ${p.k_named} name one, ${p.k_unclear} one of yours not which, ${p.k_unbranded} in general · organic ${p.k_organic} of ${p.n_organic} · ${p.comments} comments${named.length ? ` · ${named.slice(0, 5).map((x) => `${x.name} ${x.k}`).join(', ')}` : ''}`)
    }
  }
}

/** The texts of a rule row, as a person reads it: the words around the match. */
function textOfRow(pass: PlaceResult, r: MentionInsert): { text: string; context: string | null; where: string } {
  const v = pass.videoRows.get(r.video_id)
  const caption = v?.caption ? v.caption.replace(/\s+/g, ' ').slice(0, 160) : null
  if (r.source === 'comment' && r.comment_id) return { text: pass.commentText.get(r.comment_id) ?? '', context: caption, where: 'comment' }
  const field = r.field as ProductContentField
  const raw = v ? (field === 'account' ? v.account_name : field === 'hashtags' ? (v.hashtags ?? []).join(' ') : field === 'ocr' ? v.ocr_text : (v as unknown as Record<string, string | null>)[field]) : null
  const body = raw ?? ''
  const hit = matchAliases(pass.compiled, body).find((m) => (r.product_id ? m.alias.productId === r.product_id : m.alias.groupId === r.group_id))
  return { text: excerptAround(body, hit?.start ?? 0, 240), context: field === 'caption' ? null : caption, where: field }
}

function sampleSheet(pass: PlaceResult, catalogue: ProductCatalogue, results: { items: ClassifyItem[]; result: RunClassifyResult }[], header: string): { md: string; rows: SampleRow[] } {
  const groupName = new Map(catalogue.groups.map((g) => [g.id, g.name]))
  const productName = new Map(catalogue.products.map((p) => [p.id, p.name]))
  const toSample = (r: MentionInsert, text: string, context: string | null, where: string): SampleRow => ({
    method: r.method as SampleRow['method'], placement: r.placement as SampleRow['placement'],
    target: r.product_id ? productName.get(r.product_id) ?? '?' : groupName.get(r.group_id ?? '') ?? '?',
    category: groupName.get(r.group_id ?? '') ?? '?', where, text: text.replace(/\s+/g, ' ').replace(/\|/g, '/').trim(), context: context?.replace(/\|/g, '/') ?? null,
    key: `${keyOfRow(r)}|${r.product_id ?? r.group_id}`,
  })
  // The model's placements (the sample asked), with the words it read.
  const textOfItem = new Map<string, { text: string; context: string | null; where: string }>()
  for (const { items } of results) {
    for (const it of items) {
      const v = pass.videoRows.get(it.item.videoId)
      textOfItem.set(it.item.key, { text: it.item.text, context: v?.caption ? v.caption.replace(/\s+/g, ' ').slice(0, 160) : null, where: it.kind === 'confirm' ? `${it.item.source === 'content' ? it.item.field : 'comment'} (generic: ${it.item.aliases.map((a) => a.alias).join(', ')})` : 'comment' })
    }
  }
  const model = results.flatMap((x) => x.result.rows).filter((r) => r.placement !== 'none')
    .map((r) => { const t = textOfItem.get(keyOfRow(r))!; return toSample(r, t.text, t.context, t.where) })
  const rules = pass.ruleRows.filter((r) => r.placement !== 'none').map((r) => { const t = textOfRow(pass, r); return toSample(r, t.text, t.context, t.where) })
  const pick = (xs: SampleRow[], n: number) => hashSample(xs, n, (x) => x.key)
  const modelNamed = pick(model.filter((x) => x.placement === 'named'), 12)
  const modelOther = pick(model.filter((x) => x.placement !== 'named'), 25 - modelNamed.length)
  const ruleNamed = pick(rules.filter((x) => x.placement === 'named'), 15)
  const ruleOther = pick(rules.filter((x) => x.placement !== 'named'), 50 - modelNamed.length - modelOther.length - ruleNamed.length)
  const rows = [...ruleNamed, ...ruleOther, ...modelNamed, ...modelOther]
  const lines = [header, '', '| # | method | placed as | under | where | the words | the video | right product? | right category? |', '|---|---|---|---|---|---|---|---|---|']
  rows.forEach((r, i) => lines.push(`| ${i + 1} | ${r.method} | ${r.placement} | ${r.target}${r.placement === 'named' ? ` (${r.category})` : ''} | ${r.where} | ${r.text.slice(0, 300)} | ${r.context ?? ''} | | |`))
  lines.push('', `Pools: rules ${rules.length} placements (${rules.filter((x) => x.placement === 'named').length} named); model ${model.length} placements (${model.filter((x) => x.placement === 'named').length} named) from the sample asked.`)
  return { md: lines.join('\n'), rows }
}

async function backRead(admin: SupabaseClient, args: ProductsArgs, ration: Ration, command: string): Promise<void> {
  if (args.mode.kind !== 'back-read') return
  const mode = args.mode
  let catalogue: ProductCatalogue
  const replay = args.replay ? JSON.parse(readFileSync(args.replay, 'utf8')) as Recording & { catalogue: ProductCatalogue; clientName: string; clientId: string } : null
  if (replay && replay.clientId !== args.clientId) throw new Error(`${NAME}: ${args.replay} is client ${replay.clientId}, not ${args.clientId}`)
  if (replay && !mode.seed) {
    catalogue = replay.catalogue
    console.log(`  catalogue: the dump's (${catalogue.version})`)
  } else if (mode.seed) {
    catalogue = seedCatalogue(await loadSeed(mode.seed))
    console.log(`  catalogue: from the seed ${mode.seed} (${catalogue.groups.length} categories, ${catalogue.products.length} products, ${catalogue.aliases.length} names; ids and version are the seed's, never stored)`)
  } else {
    ration.spend(1, 'the catalogue')
    const read = await loadProductCatalogue(admin, args.clientId)
    if (read.state === 'missing') throw new Error(`${NAME}: the products migration is not applied here. A dry run can take --seed <file>. Nothing written.`)
    if (read.state === 'empty') throw new Error(`${NAME}: the client has no catalogue. Load the seed first (--seed <file> --apply). Nothing written.`)
    catalogue = read.catalogue
    console.log(`  catalogue: ${catalogue.version} (${catalogue.groups.length} categories, ${catalogue.products.length} products, ${catalogue.aliases.length} names)`)
  }
  if (!replay) ration.spend(1, 'the client\'s name')
  const clientName = replay ? replay.clientName : await clientNameOf(admin, args.clientId)
  const rec: Recording | null = args.dump ? { candidates: [], monthVideos: {}, videos: [], comments: [], rivalFound: [] } : null
  const baseIO = replay ? replayIO(replay) : scriptIO(admin, args, ration, !!mode.seed)
  const io = rec ? recorded(baseIO, rec) : baseIO
  const months = monthsOf(args.from, args.to)
  const sampled: { items: ClassifyItem[]; result: RunClassifyResult }[] = []
  let sampleSpend = 0

  let ask: Ask | null = null
  if (mode.write) {
    ask = (items, videos, budgetUsd, compiled) => runClassifier({
      admin, clientId: args.clientId, runId: null, clientName, catalogue, compiled, items, videos, budgetUsd, parallel: 4,
      write: async (rows) => { await insertRows(admin, rows) },
    })
  } else if (mode.sampleModel > 0) {
    ask = async (items, videos, _budget, compiled) => {
      const pickN = hashSample(items, mode.sampleModel, (x) => x.item.key)
      const r = await runClassifier({ admin: null, clientId: args.clientId, runId: null, clientName, catalogue, compiled, items: pickN, videos, budgetUsd: Math.max(0, args.budgetUsd - sampleSpend), parallel: 4 })
      sampleSpend += r.costUsd
      sampled.push({ items: pickN, result: r })
      // The dry run's model spend is the sample's alone; the rest is priced below.
      return { ...r, rows: [] }
    }
  }
  console.log(`  window ${args.from} to ${args.to} (${months.length} months) · ${mode.write ? `WRITE, model hard cap ${usd(args.budgetUsd)}` : mode.sampleModel > 0 ? `DRY, with a model sample of ${mode.sampleModel} a kind (cap ${usd(args.budgetUsd)})` : 'DRY, no model call'}`)
  const pass = await placeProducts({
    clientId: args.clientId, clientName, io, catalogue, window: { from: args.from, to: args.to },
    ask, budgetUsd: args.budgetUsd, queueCap: args.cap,
    insert: mode.write ? (rows) => insertRows(admin, rows) : undefined,
  })
  const priceAll = !mode.write ? priceItems(
    [...pass.confirm.map((item) => ({ kind: 'confirm' as const, item })), ...pass.queue.map((item) => ({ kind: 'classify' as const, item }))],
    clientName, catalogue, pass.compiled, new Map([...pass.videoRows].map(([id, v]) => [id, { videoId: id, caption: v.caption, names: [] }])),
  ) : null
  const avgQueuePerVideo = pass.relevant.size ? pass.queue.length / pass.relevant.size : 0
  const perItem = priceAll && pass.confirm.length + pass.queue.length > 0 ? priceAll.usd / (pass.confirm.length + pass.queue.length) : 0

  console.log(`\n  reads: ${ration.n} requests · scan rows ${pass.reads.candidates} · videos read in full ${pass.reads.videos} · comments read in full ${pass.reads.comments}`)
  console.log(`  the rules: ${pass.ruleRows.length} placements (${pass.ruleRows.filter((r) => r.placement === 'named').length} named, ${pass.ruleRows.filter((r) => r.placement === 'unclear').length} one of yours not which, ${pass.ruleRows.filter((r) => r.placement === 'unbranded').length} in general) on ${new Set(pass.ruleRows.map(keyOfRow)).size} texts`)
  console.log(`  category-relevant videos: ${pass.relevant.size}; ${pass.waitingOnConfirm.size} more wait on the confirm of a generic name`)
  console.log(`  category words in comments under videos that are not category-relevant: ${pass.offTopicWords} (${CATEGORY_WORDS_ONLY_UNDER_RELEVANT ? 'not counted' : 'counted: CATEGORY_WORDS_ONLY_UNDER_RELEVANT is off'})`)
  console.log('  the organic base, per category: beyond the rival searches\' finds, the market videos a search in its own words found')
  for (const g of catalogue.groups) {
    const o = pass.organic.get(g.id)
    console.log(`    ${g.name.padEnd(22)} ${o && o.terms.length ? `${o.videos} videos left out, found by ${o.terms.map((t) => `"${t}"`).join(', ')}` : 'none of our searches is in its words'}`)
  }
  console.log(`  the confirm call would read ${pass.confirm.length} texts holding a generic name (${[...new Set(pass.confirm.flatMap((c) => c.aliases.map((a) => a.alias)))].slice(0, 12).join(', ')})`)
  console.log(`  the classifier would read ${pass.queue.length} comments under the relevant videos (${avgQueuePerVideo.toFixed(1)} a video)`)
  if (priceAll) {
    const waiting = pass.waitingOnConfirm.size * avgQueuePerVideo * perItem
    console.log(`  PRICE (gpt-4.1-mini for the comments, gpt-4.1 for the generic names; from the prompts, no call made): ${usd(priceAll.usd)} for ${priceAll.calls} calls (${priceAll.inputTokens.toLocaleString('en-US')} input and at most ${priceAll.outputTokens.toLocaleString('en-US')} output tokens); up to ${usd(waiting)} more for the comments under the ${pass.waitingOnConfirm.size} videos the confirm may make relevant; total up to ${usd(priceAll.usd + waiting)}. The provider's prompt cache lowers the input part.`)
  }
  printMonths(mode.write ? pass.rows : rulesOnlyRows(args.clientId, pass, catalogue), catalogue, months, mode.write ? 'THE MONTHS (rules, confirm and classifier):' : 'THE MONTHS BY THE RULES ALONE (the confirm and the classifier add to these):')

  if (mode.sampleModel > 0 && args.sampleOut) {
    const asked = sampled.reduce((s, x) => s + x.result.asked, 0)
    const placed = sampled.flatMap((x) => x.result.rows).filter((r) => r.placement !== 'none').length
    console.log(`\n  the model sample: ${asked} items asked, ${placed} placed, ${sampled.reduce((s, x) => s + x.result.unplaced, 0)} answers refused, spent ${usd(sampleSpend)}`)
    const header = `# Products hand check (sheet): ${MARKET_FIRST_PROJECTS[args.project]}, client ${args.clientId}, ${args.from} to ${args.to}\n\nCatalogue ${catalogue.version}${mode.seed ? ` (from ${mode.seed})` : ''}. Read ${new Date().toISOString()} by \`${command}\`. Model sample: ${asked} items asked, ${placed} placed, ${usd(sampleSpend)}. The words live in this file only.`
    const sheet = sampleSheet(pass, catalogue, sampled, header)
    writeNew(args.sampleOut, sheet.md)
    console.log(`  the sheet: ${args.sampleOut} (${sheet.rows.length} placements)`)
  }
  if (args.out) {
    writeNew(args.out, JSON.stringify({
      readAt: new Date().toISOString(), project: args.project, clientId: args.clientId, window: { from: args.from, to: args.to }, catalogueVersion: catalogue.version,
      reads: ration.n, rules: pass.ruleRows.length, confirm: pass.confirm.length, queue: pass.queue.length, relevant: pass.relevant.size,
      waitingOnConfirm: pass.waitingOnConfirm.size, price: priceAll, months: mode.write ? pass.rows : rulesOnlyRows(args.clientId, pass, catalogue),
    }, null, 1))
    console.log(`  the plan: ${args.out}`)
  }
  if (rec && args.dump) {
    // The comments under the videos the confirm may make relevant too, so an
    // offline replay can read every video a confirm could open.
    const waiting = [...pass.waitingOnConfirm].map((id) => pass.videoRows.get(id)).filter((v): v is ProductVideoRow => !!v)
    if (waiting.length) await io.comments(waiting.map((v) => ({ platform: v.platform, video_id: v.video_id })))
    writeNew(args.dump, JSON.stringify({ readAt: new Date().toISOString(), clientId: args.clientId, clientName, window: { from: args.from, to: args.to }, catalogue, ...rec }))
    console.log(`  the dump: ${args.dump} (${rec.candidates.length} scan rows, ${rec.videos.length} videos, ${rec.comments.length} comments; local only)`)
  }
  if (!mode.write) { console.log(`\n${NAME}: DRY: nothing written.`); return }

  // The months, each its own merge against what is stored and what has closed.
  // THE ONE SHOT: a month this write would freeze is written only from a pass
  // that read it in full (guardFreeze); with anything left, its rows wait.
  const now = new Date().toISOString()
  const left = itemsLeft(pass, args.cap)
  let written = 0
  let refused = 0
  const waiting: string[] = []
  for (const m of months) {
    const stored = await storedProductRows(admin, args.clientId, [m], isMissingProductsSchema)
    if (stored == null) throw new Error(`${NAME}: month_product_readings is not here. Nothing more written.`)
    const closed = await selectAll<{ month: string; audience: string }>(() => admin.from('month_denominators').select('month, audience')
      .eq('client_id', args.clientId).eq('month', m).eq('status', 'frozen').order('audience'))
    const guarded = guardFreeze(mergeProductRows({ months: [m], fresh: pass.rows.filter((r) => monthStartOf(r.month) === m), stored, now, runId: null, closedAudienceMonths: closed.map(denominatorKey) }), left, 'skip')
    if (!guarded.merged) {
      waiting.push(m.slice(0, 7))
      console.log(`  ${m.slice(0, 7)}: NOT written: it closes on this write, and the model left ${left} items. Its placements are in; its month rows wait.`)
      continue
    }
    const merged = guarded.merged
    const w = await writeProductRows(admin, args.clientId, merged)
    written += w.written
    refused += merged.refusedLate.length
    console.log(`  ${m.slice(0, 7)}: ${w.written} rows written (${merged.writes.filter((x) => x.status === 'frozen').length} frozen, ${merged.writes.filter((x) => x.origin === 'back_read').length} read back), ${merged.keptFrozen} already frozen and left, ${merged.refusedLate.length} refused as late`)
  }
  const c = pass.confirmResult
  const k = pass.classifyResult
  console.log(`\n${NAME}: WROTE ${pass.freshRuleRows.length} rule placements, ${pass.modelRows.length} model rows (confirm ${c?.asked ?? 0} asked, classifier ${k?.asked ?? 0} asked), ${written} month rows, ${refused} refused as late · spent ${usd(pass.costUsd)}`)
  if (waiting.length) {
    console.log(`${NAME}: NOT FINISHED. The model left ${left} items (a cap, the clock, a rate limit, a failed call or an unusable answer), so the closed months ${waiting.join(', ')} were NOT written. Run the same command again: it asks only what is left, and writes those months once nothing is.`)
  }
}

async function insertRows(admin: SupabaseClient, rows: readonly MentionInsert[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from(TABLE_PRODUCT_MENTIONS).insert(rows.slice(i, i + 500))
    if (error) throw new Error(`${TABLE_PRODUCT_MENTIONS} insert: ${error.message}`)
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const args = parseProductsArgs(argv)
  if (!args.replay) assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  const command = `scripts/products.ts ${argv.join(' ')}`
  const writes = (args.mode.kind === 'seed' && args.mode.apply) || (args.mode.kind === 'back-read' && args.mode.write)
  console.log(args.replay
    ? `${NAME}: replaying ${args.replay} (no database is read), client ${args.clientId}`
    : `${NAME}: ${writes ? 'WRITE' : 'read-only'} on ${MARKET_FIRST_PROJECTS[args.project]} ${args.project}, client ${args.clientId}`)
  // A replay reads no database: the client is never built.
  const admin = args.replay ? (null as unknown as SupabaseClient) : createAdminClient()
  const ration = new Ration(args.maxReads)
  if (args.confirm && !args.replay) await probe(admin, args.clientId, ration)
  if (args.mode.kind === 'seed') await seedMode(admin, args, ration, command)
  else await backRead(admin, args, ration, command)
  console.log(`${NAME}: ${ration.n} reads`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
