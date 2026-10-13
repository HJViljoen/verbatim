import type { SupabaseClient } from '@supabase/supabase-js'

import { productReadingsEnabled } from '../config'
import { longMonth, shortDate } from '../format'
import { CONTACT_EMAIL } from '../legal'
import {
  isMissingProductsSchema,
  loadMonthProductReadings,
  PRODUCT_ALIAS_COLUMNS,
  PRODUCT_COLUMNS,
  PRODUCT_GROUP_COLUMNS,
  TABLE_PRODUCT_ALIASES,
  TABLE_PRODUCT_GROUPS,
  TABLE_PRODUCTS,
  type AliasKind,
  type MonthProductReadingRow,
  type ProductAliasRow,
  type ProductGroupRow,
  type ProductRow,
} from '../products/types'
import { marketProductMonth } from '../products/market-month'
import { aliasProblem } from '../products/rules'
import { monthStartOf } from '../reading/month-key'
import { productsHref } from '../pages/v2/products-address'
import { selectAll } from '../supabase-admin'
import { settingsSubPage } from './rail'

// Settings › Your products (depth redesign v2, T10b; board E8-Settings-Products):
// the client's catalogue, as the page reads it and the actions write it.
//
// WHAT THIS FILE HOLDS. The read (`loadProductSettings`: the live catalogue and
// this month's product readings, in four small reads), the view the tab draws
// (`productSettingsView`, pure), and the rules a write is held to
// (`catalogueText`, the length limits and the sentences). The writes are
// `lib/actions/products.ts`; the tab is `components/pages/settings/products`.
//
// A CATEGORY IS A `product_groups` ROW. The page says "categories"; the code
// never does (`category` is the non-rival bucket and the insight kind,
// lib/products/types.ts).
//
// THE MIGRATION MAY NOT BE THERE. `20261109090000_products.sql` is applied
// nowhere yet, so every read answers `missing` on a missing table rather than
// throwing, and the tab says the list is not switched on. Any other failure
// throws: a page that cannot read its settings says so, and never shows an
// empty list as if it were the client's.
//
// "THIS MONTH" IS THE COMMENT'S MONTH, AND YOUR PRODUCTS' MONTH. A product's
// figure is its videos in the month Your products reads (the reading month,
// `productsMonth`; the calendar month only where it could not be read), from
// `month_product_readings` (AGENTS.md: a
// period is dated by the comment), pooled over EVERY audience, the client's
// included: creators' videos about the client and the comments on its own
// posts count, its own posts' words never place anything
// (`marketProductMonth`, lib/products/market-month.ts; the lead's ruling, 13
// Oct). Your products (T5) pools through the same function, so the two
// surfaces never print two numbers for one product. A video sits in exactly
// one audience, so the sum is the videos that named it, each once. Where the
// month holds no product row at all, nothing has read it yet: the column
// prints a dot, never "quiet", because quiet is a claim about the market and
// an unread month is ours.
//
// NO COUNT WHILE THE PAGE IS OFF (Phase 4 fix round). Your products prints
// "not switched on" until `PRODUCT_READINGS_ENABLED` turns the tenant on, and
// Heinrich's order is to back-read before he does, so `month_product_readings`
// can hold rows for a tenant whose page is off. This tab then reads no month
// and prints no count, and says plainly why (`PRODUCTS_PAGE_OFF`), so it never
// shows a number the page will not.

/** What a person is told when the products migration is not applied here. */
export const PRODUCTS_NOT_APPLIED = 'Your products are not switched on for this workspace yet.'

/** What a person is told when the list is there but the products page is not
 *  switched on for the workspace (`PRODUCT_READINGS_ENABLED`, lib/config.ts):
 *  the list can be kept, and no count prints, because the page that would
 *  print the same count says it is not switched on. */
export const PRODUCTS_PAGE_OFF = 'The Your products page is not switched on for this workspace yet, so no counts show here. You can get the list ready in the meantime.'

/** A member's refusal: changing the catalogue changes what is counted. */
export const PRODUCTS_REFUSED = 'Only owners and admins can change your product list.'

/** A locked tenant's own user (lib/tenant-locks.ts, the `tracking` lock). The
 *  operator, who is let through, makes the change on the tenant's behalf. */
export const PRODUCTS_HELD = `Your product list is held still during your trial. Write to ${CONTACT_EMAIL} and we will make the change for you.`

export const COULD_NOT_SAVE = 'Could not save. Try again, and tell us if it keeps happening.'

/** The schema's own limits (the name CHECKs in 20261109090000_products.sql). */
export const CATALOGUE_LIMITS = {
  group: { min: 1, max: 60 },
  product: { min: 1, max: 80 },
  alias: { min: 2, max: 80 },
} as const

export type CatalogueTextKind = keyof typeof CATALOGUE_LIMITS

const WHAT: Record<CatalogueTextKind, string> = { group: 'category', product: 'product', alias: 'name' }

/** Why the matcher could never read this as a name, or null where it can:
 *  the matcher's own rule (lib/products/rules.ts `aliasProblem`, one rule for
 *  Settings, the seed and the compiler), said in words. PURE. */
export function aliasTextProblem(text: string): string | null {
  const problem = aliasProblem(text)
  if (problem === 'characters') return "Use letters, numbers, spaces and & . ' + - only, so the name can be found as it is written."
  if (problem === 'too_short') return 'Give the name at least two letters or numbers.'
  return null
}

/**
 * A typed name as the catalogue stores it: spaces collapsed and trimmed, or
 * the sentence that refuses it. The database's CHECK says the same (trimmed,
 * within its length, no control characters); this says it in words first. A
 * product's name is also one of its names (an alias of kind `name`), so it and
 * an alias are held to the matcher's rule too (`aliasTextProblem`). PURE.
 */
export function catalogueText(raw: unknown, kind: CatalogueTextKind): { ok: true; text: string } | { ok: false; message: string } {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim()
  const { min, max } = CATALOGUE_LIMITS[kind]
  if (/[\u0000-\u001f\u007f]/.test(text)) return { ok: false, message: `Type the ${WHAT[kind]} as plain words.` }
  if (text.length < min) return { ok: false, message: min > 1 ? `Give the ${WHAT[kind]} at least ${min} letters.` : `Type the ${WHAT[kind]} first.` }
  if (text.length > max) return { ok: false, message: `Keep the ${WHAT[kind]} under ${max} characters.` }
  if (kind !== 'group') {
    const problem = aliasTextProblem(text)
    if (problem) return { ok: false, message: problem }
  }
  return { ok: true, text }
}

/** Two names are one name when they differ only in case (the live-name
 *  indexes are on `lower(...)`). */
export const sameCatalogueName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** The address of the tab, with a category open. */
export function productsTabHref(groupId?: string | null): string {
  const base = settingsSubPage('products').href
  return groupId ? `${base}?group=${encodeURIComponent(groupId)}` : base
}

/** Where "couldn't tell which" talk is tagged: Your products, the category
 *  open on its list, in the month this tab reads (the page's own month, so the
 *  figure here is the figure there). */
export const productsPageHref = (groupId: string, month?: string | null): string =>
  productsHref({ month: month ? month.slice(0, 7) : undefined }, { kind: 'group', id: groupId }, { at: 'unclear' })

// ---- The read -------------------------------------------------------------------

export type ProductSettingsRead =
  | { state: 'missing' }
  | {
      state: 'ready'
      groups: ProductGroupRow[]
      products: ProductRow[]
      aliases: ProductAliasRow[]
      /** The month the figures are about, 'YYYY-MM-01'. */
      month: string
      readings: MonthProductReadingRow[]
      /** Whether the products page is switched on for the workspace
       *  (`productReadingsEnabled`). Off, no month is read. */
      readingsOn: boolean
    }

/**
 * The client's live catalogue (active categories, their active products, the
 * aliases not retired) and this month's product readings. On the session's own
 * client: the tenant holds SELECT on every column of these tables under its
 * own-client policy, and an operator's session is already the service role.
 */
export async function loadProductSettings(
  db: SupabaseClient,
  clientId: string,
  now: Date = new Date(),
  opts: {
    month?: string | null
    /** The products page's switch; `productReadingsEnabled` unless a test
     *  names it. */
    readingsOn?: boolean
  } = {},
): Promise<ProductSettingsRead> {
  // THE PAGE'S MONTH (`productsMonth`, lib/pages/v2/products.ts: the reading
  // month every reading page reads), where the route read it; the calendar
  // month only where it could not.
  const month = monthStartOf(opts.month ?? now.toISOString())
  const readingsOn = opts.readingsOn ?? productReadingsEnabled(clientId)
  try {
    const [groups, products, aliases] = await Promise.all([
      selectAll<ProductGroupRow>(() =>
        db.from(TABLE_PRODUCT_GROUPS).select(PRODUCT_GROUP_COLUMNS).eq('client_id', clientId).eq('status', 'active').order('sort').order('id')),
      selectAll<ProductRow>(() =>
        db.from(TABLE_PRODUCTS).select(PRODUCT_COLUMNS).eq('client_id', clientId).eq('status', 'active').order('sort').order('id')),
      selectAll<ProductAliasRow>(() =>
        db.from(TABLE_PRODUCT_ALIASES).select(PRODUCT_ALIAS_COLUMNS).eq('client_id', clientId).is('retired_at', null).order('created_at').order('id')),
    ])
    const readings = groups.length > 0 && readingsOn ? await loadMonthProductReadings(db, clientId, [month]) : []
    return { state: 'ready', groups, products, aliases, month, readings, readingsOn }
  } catch (error) {
    if (isMissingProductsSchema(error)) return { state: 'missing' }
    throw error
  }
}

/**
 * The route's read: the page's month (`readMonth`, the route's
 * `productsMonth`) only where the products page is switched on, then the
 * catalogue. Off, it reads NO month at all (the page that would print the
 * same count is off, so nothing here is a count of a month), as AGENTS.md
 * says (Phase 4 fix check).
 */
export async function loadProductSettingsForPage(
  db: SupabaseClient,
  clientId: string,
  now: Date,
  readMonth: () => Promise<{ month: string }>,
  readingsOn: boolean = productReadingsEnabled(clientId),
): Promise<ProductSettingsRead> {
  const month = readingsOn ? (await readMonth()).month : null
  return loadProductSettings(db, clientId, now, { month, readingsOn })
}

// ---- The view -------------------------------------------------------------------

export interface AliasChip {
  id: string
  alias: string
  kind: AliasKind
  /** A common word: each hit goes to the confirm call before it counts. */
  needsConfirm: boolean
}

export interface ProductLine {
  id: string
  name: string
  /** The other names people use, its own name left out. */
  aliases: AliasChip[]
  /** Its videos this month; null where the month holds no row for it. */
  videos: number | null
}

export interface CategoryLine {
  id: string
  name: string
  /** Its active products. */
  products: number
  href: string
  selected: boolean
}

export interface OpenCategory {
  id: string
  name: string
  /** Its active products. */
  products: number
  /** How many of them came up this month; null where the month is unread. */
  cameUp: number | null
  /** Videos about one of its products, the rules unable to tell which; null
   *  where the month holds no row for the category. */
  unclear: number | null
  /** Where those are tagged. */
  tagHref: string
  /** Words for the category in general (`category_word`). */
  words: AliasChip[]
  /** Names for the range as a whole (a category's `name` or `nickname`). */
  ranges: AliasChip[]
  rows: ProductLine[]
}

export interface ProductSettingsView {
  /** "We filled this in from ossur.com on 11 Oct." where the list was seeded. */
  seeded: { from: string; on: string } | null
  /** Every active product, across the categories. */
  total: number
  categories: CategoryLine[]
  open: OpenCategory | null
  /** The month's name, "October". */
  monthName: string
  /** Whether the month holds any product row. */
  read: boolean
  /** Whether the products page is switched on. Off, nothing on the tab is a
   *  count of the market (`PRODUCTS_PAGE_OFF`). */
  readingsOn: boolean
  /** Every category, for the "Move to" choice on a product. */
  choices: { id: string; name: string }[]
  /** Any common word on the open category, so the key is drawn. */
  anyConfirm: boolean
  canEdit: boolean
  /** An owner or admin the tenant lock holds (`assertTenantMay`, `tracking`):
   *  the controls are drawn disabled, under the lock's own line, rather than
   *  refusing after a submit. Never true for the operator. */
  locked: boolean
}

const chip = (a: ProductAliasRow): AliasChip => ({ id: a.id, alias: a.alias, kind: a.kind, needsConfirm: a.needs_confirm })

const KIND_ORDER: Record<AliasKind, number> = { name: 0, nickname: 1, category_word: 2 }

/** Names in the order they were added (a name a person adds lands at the end,
 *  where they pressed "+ Add a name"), a product's official forms first. */
const byKindThenAdded = (a: ProductAliasRow, b: ProductAliasRow): number =>
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)


/**
 * The tab, from the read. `selected` is the `?group=` param; an unknown or
 * missing one opens the first category. PURE.
 */
export function productSettingsView(
  read: Extract<ProductSettingsRead, { state: 'ready' }>,
  opts: { selected?: string | null; canEdit: boolean; locked?: boolean },
): ProductSettingsView {
  const groups = [...read.groups].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const live = new Set(groups.map((g) => g.id))
  const products = read.products.filter((p) => live.has(p.group_id))
  const perGroup = new Map<string, ProductRow[]>()
  for (const p of products) perGroup.set(p.group_id, [...(perGroup.get(p.group_id) ?? []), p])
  for (const list of perGroup.values()) list.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

  const open = groups.find((g) => g.id === opts.selected) ?? groups[0] ?? null
  const categories: CategoryLine[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    products: perGroup.get(g.id)?.length ?? 0,
    href: productsTabHref(g.id),
    selected: g.id === open?.id,
  }))

  // A PRODUCT WITH NO ROW HAS NO FIGURE. Its videos are its own rows pooled
  // over every audience (`marketProductMonth`, Your products' own basis);
  // where the month holds none for it, nothing has read it, and a missing row
  // is never summed to zero ("quiet" is a claim about the market).
  // Off, no month counts, whatever rows a back-read left.
  const readings = read.readingsOn ? read.readings : []
  const pooled = (id: string) => marketProductMonth(readings, read.month, id)
  const isRead = readings.length > 0
  const productVideos = (id: string): number | null => pooled(id)?.k_named ?? null

  // THE SEED LINE names the website and the day the list was filled in, from
  // the rows themselves (`seeded_from`, `created_at`): the earliest seeded
  // category. A list a person built has no such line.
  const seededRows = groups.filter((g) => g.seeded_from).sort((a, b) => a.created_at.localeCompare(b.created_at))
  const seeded = seededRows[0] ? { from: seededRows[0].seeded_from as string, on: shortDate(seededRows[0].created_at) } : null

  let openView: OpenCategory | null = null
  if (open) {
    const rows: ProductLine[] = (perGroup.get(open.id) ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      aliases: read.aliases
        .filter((a) => a.product_id === p.id && !(a.kind === 'name' && sameCatalogueName(a.alias, p.name)))
        .sort(byKindThenAdded)
        .map(chip),
      videos: productVideos(p.id),
    }))
    const own = read.aliases.filter((a) => a.group_id === open.id && a.product_id === null).sort(byKindThenAdded)
    openView = {
      id: open.id,
      name: open.name,
      products: rows.length,
      cameUp: isRead ? rows.filter((r) => (r.videos ?? 0) > 0).length : null,
      unclear: pooled(open.id)?.k_unclear ?? null,
      tagHref: productsPageHref(open.id, read.month),
      words: own.filter((a) => a.kind === 'category_word').map(chip),
      ranges: own.filter((a) => a.kind !== 'category_word').map(chip),
      rows,
    }
  }

  return {
    seeded,
    total: products.length,
    categories,
    open: openView,
    monthName: longMonth(read.month),
    read: isRead,
    readingsOn: read.readingsOn,
    choices: groups.map((g) => ({ id: g.id, name: g.name })),
    anyConfirm: openView != null && [...openView.words, ...openView.ranges, ...openView.rows.flatMap((r) => r.aliases)].some((a) => a.needsConfirm),
    canEdit: opts.canEdit,
    locked: opts.canEdit && opts.locked === true,
  }
}
