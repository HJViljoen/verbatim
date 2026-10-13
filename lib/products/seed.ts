import { createHash } from 'node:crypto'

import { aliasBody } from './rules'
import type { AliasKind, CatalogueAlias, ProductCatalogue } from './types'

// A catalogue seed (depth redesign v2, T12): a client's categories, products
// and the names people use, compiled by hand from the client's website for a
// person to review, then loaded once by `scripts/products.ts --seed <file>
// --apply` (scriptActor, config_changes surface 'products'). The seed is a
// TypeScript module exporting one `CatalogueSeed`; each product carries its
// source page in a comment above it.
//
// WHAT EACH LIST BECOMES (lib/products/rules.ts reads the rows):
//   group.words      category_word aliases: talk about the category in
//                    general ("liner", "prosthetic foot")
//   group.families   the category's nickname aliases: a product family whose
//                    members the words alone cannot tell apart ("Iceross",
//                    "Pro-Flex"): one of the client's products, not which
//   product.name     the product's own row, and its `name` alias
//   product.aliases  `nickname` aliases: the other names people use
// `needsConfirm` (on a product, its own name; on an alias, that alias) marks
// a generic word ("Unity", "Comfort", "Total Knee") whose hit goes to the
// confirm call before it places anything.
//
// The rows a seed makes are checked here before anything is written
// (`seedProblems`): every name within the table's limits, every alias one the
// matcher reads, and one word, one target, across the whole catalogue (the
// live-alias index refuses a second).

export interface SeedAlias {
  alias: string
  /** A generic word: its hit is confirmed by the model before it places. */
  needsConfirm?: boolean
}

export interface SeedProduct {
  /** The product's name as the client writes it (products.name, ≤ 80). */
  name: string
  /** The product's own name is a generic word. */
  needsConfirm?: boolean
  /** Other names people use for it (nicknames, short forms, spellings). */
  aliases?: readonly (string | SeedAlias)[]
}

export interface SeedGroup {
  /** The category's name as the page prints it (product_groups.name, ≤ 60). */
  name: string
  /** Words for the category in general. */
  words: readonly (string | SeedAlias)[]
  /** Product families: the client's, but not which product. */
  families?: readonly (string | SeedAlias)[]
  products: readonly SeedProduct[]
}

export interface CatalogueSeed {
  /** The website the seed was compiled from ('ossur.com'): products.seeded_from. */
  seededFrom: string
  /** When it was compiled, 'YYYY-MM-DD'. */
  compiledOn: string
  groups: readonly SeedGroup[]
}

const asAlias = (a: string | SeedAlias): SeedAlias => (typeof a === 'string' ? { alias: a } : a)

/** One row the seed asks for, in order: categories, then their products, then
 *  every alias. Ids are the seed's own (`seedId`), stable across reads, so a
 *  dry run's catalogue reads the same every time. */
export interface SeedRows {
  groups: { key: string; name: string; sort: number }[]
  products: { key: string; groupKey: string; name: string; sort: number }[]
  aliases: { key: string; productKey: string | null; groupKey: string | null; alias: string; kind: AliasKind; needsConfirm: boolean }[]
}

/** A stable uuid-shaped id for a seed row (v4 layout, from a hash): what the
 *  in-memory catalogue a dry run reads carries. Never written: the database
 *  mints the real ids on --apply. */
export function seedId(...parts: string[]): string {
  const h = createHash('sha1').update(parts.join('\u0000')).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const norm = (s: string) => s.trim().toLowerCase()

/** The rows a seed makes. PURE. */
export function seedRows(seed: CatalogueSeed): SeedRows {
  const out: SeedRows = { groups: [], products: [], aliases: [] }
  seed.groups.forEach((g, gi) => {
    const groupKey = seedId('group', norm(g.name))
    out.groups.push({ key: groupKey, name: g.name.trim(), sort: gi })
    for (const w of g.words.map(asAlias)) {
      out.aliases.push({ key: seedId('alias', norm(w.alias)), productKey: null, groupKey, alias: w.alias.trim(), kind: 'category_word', needsConfirm: !!w.needsConfirm })
    }
    for (const f of (g.families ?? []).map(asAlias)) {
      out.aliases.push({ key: seedId('alias', norm(f.alias)), productKey: null, groupKey, alias: f.alias.trim(), kind: 'nickname', needsConfirm: !!f.needsConfirm })
    }
    g.products.forEach((p, pi) => {
      const productKey = seedId('product', norm(p.name))
      out.products.push({ key: productKey, groupKey, name: p.name.trim(), sort: pi })
      out.aliases.push({ key: seedId('alias', norm(p.name)), productKey, groupKey: null, alias: p.name.trim(), kind: 'name', needsConfirm: !!p.needsConfirm })
      for (const a of (p.aliases ?? []).map(asAlias)) {
        out.aliases.push({ key: seedId('alias', norm(a.alias)), productKey, groupKey: null, alias: a.alias.trim(), kind: 'nickname', needsConfirm: !!a.needsConfirm })
      }
    })
  })
  return out
}

/** What would stop the seed loading, one line each; empty when it loads. PURE. */
export function seedProblems(seed: CatalogueSeed): string[] {
  const out: string[] = []
  const rows = seedRows(seed)
  const clean = (s: string) => s === s.trim() && !/[\p{Cc}]/u.test(s)
  if (!seed.seededFrom.trim()) out.push('seededFrom is empty')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(seed.compiledOn)) out.push(`compiledOn ${seed.compiledOn} is not YYYY-MM-DD`)
  const seen = (what: string, names: string[]) => {
    const dup = names.map(norm).filter((n, i, xs) => xs.indexOf(n) !== i)
    for (const d of new Set(dup)) out.push(`${what} "${d}" appears twice`)
  }
  seen('category', rows.groups.map((g) => g.name))
  seen('product', rows.products.map((p) => p.name))
  seen('alias (one word, one target)', rows.aliases.map((a) => a.alias))
  for (const g of rows.groups) if (!clean(g.name) || g.name.length < 1 || g.name.length > 60) out.push(`category "${g.name}" is not 1 to 60 clean characters`)
  for (const p of rows.products) if (!clean(p.name) || p.name.length < 1 || p.name.length > 80) out.push(`product "${p.name}" is not 1 to 80 clean characters`)
  for (const a of rows.aliases) {
    if (!clean(a.alias) || a.alias.length < 2 || a.alias.length > 80) out.push(`alias "${a.alias}" is not 2 to 80 clean characters`)
    else if (!aliasBody(a.alias, a.kind)) out.push(`alias "${a.alias}" is not a name the matcher reads (letters, digits, spaces and & . ' - + only)`)
  }
  for (const g of seed.groups) if (g.words.length === 0) out.push(`category "${g.name}" has no word for the category in general`)
  return out
}

/** The seed as the catalogue product_catalogue would return once it is
 *  loaded, with the seed's own ids and a version over the same lines the RPC
 *  hashes (so a dry run before the migration reads like the real thing).
 *  The version is 'pc1_' and 16 hex like the RPC's, but it is NOT the RPC's
 *  (the ids differ): nothing a dry run computes is ever stored. PURE. */
export function seedCatalogue(seed: CatalogueSeed): ProductCatalogue {
  const rows = seedRows(seed)
  const aliases: CatalogueAlias[] = rows.aliases.map((a) => ({
    id: a.key, product_id: a.productKey, group_id: a.groupKey, alias: a.alias, kind: a.kind, needs_confirm: a.needsConfirm,
  }))
  const lines = [
    ...rows.groups.map((g) => `g|${g.key}|${norm(g.name)}`),
    ...rows.products.map((p) => `p|${p.key}|${p.groupKey}|${norm(p.name)}`),
    ...aliases.map((a) => `a|${a.product_id ?? a.group_id}|${a.kind}|${a.needs_confirm}|${norm(a.alias)}`),
  ].sort()
  return {
    version: `pc1_${createHash('md5').update(lines.join('\n')).digest('hex').slice(0, 16)}`,
    groups: rows.groups.map((g) => ({ id: g.key, name: g.name, sort: g.sort })),
    products: rows.products.map((p) => ({ id: p.key, group_id: p.groupKey, name: p.name, sort: p.sort })),
    aliases: [...aliases].sort((a, b) => norm(a.alias).localeCompare(norm(b.alias)) || a.id.localeCompare(b.id)),
  }
}
