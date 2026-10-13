import { createHash } from 'node:crypto'

import { MARKET_FIRST_PROJECTS, type ProjectRef } from '../ops/market-first-args'
import type { SeedRows } from './seed'
import type { AliasKind } from './types'

// The pure half of scripts/products.ts (depth v2 T12): its flags, what a seed
// load would write over what the catalogue already holds, and the hand
// check's sample. The script does the reading and the writing.

export const PRODUCTS_SCRIPT = 'products'

export type ProductsMode =
  | { kind: 'seed'; seed: string; apply: boolean }
  | { kind: 'back-read'; write: boolean; seed: string | null; sampleModel: number }

export interface ProductsArgs {
  clientId: string
  project: ProjectRef
  confirm: boolean
  mode: ProductsMode
  from: string
  to: string
  budgetUsd: number
  cap: number
  maxReads: number
  out: string | null
  sampleOut: string | null
}

const firstOfNextMonth = (now: Date): string => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
const DAY = /^\d{4}-\d{2}-01$/

/**
 * Parse argv (see the script's header). Throws a sentence on anything it does
 * not know or any combination it refuses, so a typo is a refusal and never a
 * silent write. PURE.
 */
export function parseProductsArgs(argv: readonly string[], now: Date = new Date()): ProductsArgs {
  const values: Record<string, string> = {}
  const flags = new Set<string>()
  const VALUES = ['client', 'project', 'seed', 'from', 'to', 'budget', 'cap', 'max-reads', 'out', 'sample-out', 'sample-model']
  const FLAGS = ['apply', 'confirm', 'back-read', 'dry-run', 'write']
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) throw new Error(`${PRODUCTS_SCRIPT}: unexpected argument ${a}`)
    const name = a.slice(2)
    if (VALUES.includes(name)) {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`${PRODUCTS_SCRIPT}: --${name} needs a value`)
      values[name] = v
    } else if (FLAGS.includes(name)) flags.add(name)
    else throw new Error(`${PRODUCTS_SCRIPT}: unknown flag --${name}`)
  }
  const clientId = values.client ?? ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(clientId)) {
    throw new Error(`${PRODUCTS_SCRIPT}: --client must be a uuid, got ${clientId || '(none)'}`)
  }
  const project = values.project
  if (!project) throw new Error(`${PRODUCTS_SCRIPT}: --project <ref> is required: zfmxrrugaihxpubunleu (staging) or mkwjlckescdveosvrvaq (production)`)
  if (!(project in MARKET_FIRST_PROJECTS)) throw new Error(`${PRODUCTS_SCRIPT}: --project ${project} is not allow-listed`)
  const num = (name: string, fallback: number): number => {
    if (values[name] === undefined) return fallback
    const n = Number(values[name])
    if (!Number.isFinite(n) || n < 0) throw new Error(`${PRODUCTS_SCRIPT}: --${name} must be a number of at least 0`)
    return n
  }
  const from = values.from ?? '2026-06-01'
  const to = values.to ?? firstOfNextMonth(now)
  if (!DAY.test(from) || !DAY.test(to) || from >= to) throw new Error(`${PRODUCTS_SCRIPT}: --from and --to are firsts of months, from before to (got ${from} to ${to})`)

  let mode: ProductsMode
  if (flags.has('back-read')) {
    if (flags.has('apply')) throw new Error(`${PRODUCTS_SCRIPT}: --apply loads a seed; the back-read writes with --write`)
    if (flags.has('dry-run') === flags.has('write')) throw new Error(`${PRODUCTS_SCRIPT}: --back-read takes exactly one of --dry-run and --write`)
    const write = flags.has('write')
    if (write && values.seed) throw new Error(`${PRODUCTS_SCRIPT}: --write reads the catalogue the database holds; --seed is for a dry run before it is loaded`)
    if (write && values['sample-model']) throw new Error(`${PRODUCTS_SCRIPT}: --sample-model is a dry run's hand check; --write asks the model about everything`)
    const sampleModel = num('sample-model', 0)
    if (sampleModel > 0 && !values['sample-out']) throw new Error(`${PRODUCTS_SCRIPT}: --sample-model needs --sample-out <new file>`)
    mode = { kind: 'back-read', write, seed: values.seed ?? null, sampleModel: Math.trunc(sampleModel) }
  } else {
    if (!values.seed) throw new Error(`${PRODUCTS_SCRIPT}: say what to do: --seed <file> [--apply], or --back-read --dry-run | --write`)
    if (flags.has('write') || flags.has('dry-run')) throw new Error(`${PRODUCTS_SCRIPT}: a seed load is dry unless --apply; --write and --dry-run belong to --back-read`)
    mode = { kind: 'seed', seed: values.seed, apply: flags.has('apply') }
  }
  // Production is read only with --confirm (the probe goes first).
  const confirm = flags.has('confirm')
  if (project === 'mkwjlckescdveosvrvaq' && !confirm) throw new Error(`${PRODUCTS_SCRIPT}: reading production needs --confirm (a timed probe goes first)`)
  const sampling = mode.kind === 'back-read' && mode.sampleModel > 0
  return {
    clientId, project: project as ProjectRef, confirm, mode, from, to,
    budgetUsd: num('budget', mode.kind === 'back-read' && mode.write ? 5 : sampling ? 1 : 0),
    cap: Math.trunc(num('cap', Number.MAX_SAFE_INTEGER)),
    maxReads: Math.trunc(num('max-reads', 80)),
    out: values.out ?? null,
    sampleOut: values['sample-out'] ?? null,
  }
}

// ---- the seed load ------------------------------------------------------------------

export interface HeldCatalogue {
  groups: { id: string; name: string }[]
  products: { id: string; name: string; group_id: string }[]
  /** Live aliases: what the words already place. */
  aliases: { alias: string; product_id: string | null; group_id: string | null }[]
}

export interface SeedLoadPlan {
  groups: SeedRows['groups']
  products: (SeedRows['products'][number] & { groupId: string | null })[]
  aliases: (SeedRows['aliases'][number] & { productId: string | null; groupId: string | null })[]
  /** Rows the catalogue already holds as the seed has them. */
  held: { groups: number; products: number; aliases: number }
  /** Rows the seed asks for that the catalogue holds differently: never moved
   *  or rewritten (the load is append-only); a person decides in Settings. */
  conflicts: string[]
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * What loading `rows` over `held` writes: every category, product and alias
 * the catalogue does not hold yet, by name (case aside), and a line for each
 * the catalogue holds differently. APPEND-ONLY: nothing held is moved,
 * renamed, retired or deleted. A product whose category is new is written
 * after it (`groupId` null until then: the script fills it from the insert).
 * PURE.
 */
export function planSeedLoad(rows: SeedRows, held: HeldCatalogue): SeedLoadPlan {
  const out: SeedLoadPlan = { groups: [], products: [], aliases: [], held: { groups: 0, products: 0, aliases: 0 }, conflicts: [] }
  const groupByName = new Map(held.groups.map((g) => [norm(g.name), g.id]))
  const productByName = new Map(held.products.map((p) => [norm(p.name), p]))
  const groupName = new Map(held.groups.map((g) => [g.id, g.name]))
  const productName = new Map(held.products.map((p) => [p.id, p.name]))
  const seedGroupName = new Map(rows.groups.map((g) => [g.key, g.name]))
  const seedProductName = new Map(rows.products.map((p) => [p.key, p.name]))
  for (const g of rows.groups) {
    if (groupByName.has(norm(g.name))) out.held.groups++
    else out.groups.push(g)
  }
  for (const p of rows.products) {
    const groupId = groupByName.get(norm(seedGroupName.get(p.groupKey)!)) ?? null
    const had = productByName.get(norm(p.name))
    if (!had) { out.products.push({ ...p, groupId }); continue }
    if (groupId && had.group_id !== groupId) {
      out.conflicts.push(`product "${p.name}" is held under "${groupName.get(had.group_id) ?? had.group_id}", the seed has it under "${seedGroupName.get(p.groupKey)}": left where it is`)
    } else out.held.products++
  }
  const aliasHeld = new Map(held.aliases.map((a) => [norm(a.alias), a]))
  for (const a of rows.aliases) {
    const had = aliasHeld.get(norm(a.alias))
    const groupId = a.groupKey ? groupByName.get(norm(seedGroupName.get(a.groupKey)!)) ?? null : null
    const productId = a.productKey ? productByName.get(norm(seedProductName.get(a.productKey)!))?.id ?? null : null
    if (!had) { out.aliases.push({ ...a, productId, groupId }); continue }
    const same = a.productKey ? had.product_id !== null && had.product_id === productId : had.group_id !== null && had.group_id === groupId
    if (same) out.held.aliases++
    else {
      const where = had.product_id ? `product "${productName.get(had.product_id) ?? had.product_id}"` : `category "${groupName.get(had.group_id ?? '') ?? had.group_id}"`
      const seedWhere = a.productKey ? `product "${seedProductName.get(a.productKey)}"` : `category "${seedGroupName.get(a.groupKey ?? '')}"`
      out.conflicts.push(`"${a.alias}" already places talk under ${where}; the seed has it under ${seedWhere}: left as it is`)
    }
  }
  return out
}

// ---- the hand check's sample ----------------------------------------------------------

export interface SampleRow {
  method: 'rule' | 'confirmed' | 'model'
  placement: 'named' | 'unclear' | 'unbranded'
  /** The product (named) or the category, by name. */
  target: string
  category: string
  where: string
  text: string
  context: string | null
  key: string
}

/** A fixed sample, the first `n` by a hash of the key: a re-run over the same
 *  rows takes the same ones. PURE. */
export function hashSample<T>(xs: readonly T[], n: number, keyOf: (x: T) => string): T[] {
  const h = (x: T) => createHash('sha1').update(keyOf(x)).digest('hex')
  return [...xs].sort((a, b) => (h(a) < h(b) ? -1 : h(a) > h(b) ? 1 : 0)).slice(0, Math.max(0, n))
}

/** The alias kinds a seed load writes, for the dry print. */
export const KIND_WORD: Record<AliasKind, string> = { name: 'name', nickname: 'other name', category_word: 'category word' }
