import type { SupabaseClient } from '@supabase/supabase-js'

import type { ConfigSurface } from '../config-log'
import { selectAll } from '../supabase-admin'

// Your products (depth redesign v2, T10; plan decision 3, option B): the
// catalogue a client keeps, where its market's talk is placed under it, and the
// months that placement reads. The schema is
// supabase/migrations/20261109090000_products.sql; every enum and column list
// here mirrors that file, and lib/products-migration.test.ts holds the two equal.
//
// THE INTERFACE T11 (placement), T12 (seed, back-read, tags), T10b (Settings)
// and T5 (the page) code against:
//   - a category is a `product_groups` row (the page says "categories"; the
//     code never does: `category` is the non-rival bucket and the insight kind);
//   - the catalogue is read ONCE, with its version, through
//     `loadProductCatalogue` (the `product_catalogue` RPC): the version stored
//     on a placement is the catalogue that made it;
//   - a placement is a `product_mentions` row, append-only; which one applies
//     is `PLACEMENT_METHOD_PRECEDENCE` under one catalogue version;
//   - a person's tag is a `product_tags` row; the newest on a target applies
//     (`standingTags`);
//   - a month is a `month_product_readings` row per audience and object,
//     written through mergeMonthRows (lib/reading/monthly.ts) like every month
//     table, under the month tables' freeze guards.
//
// The Supabase client is untyped (AGENTS.md), so these are the row shapes as
// stored: snake_case, a nullable column as `| null`, a date as 'YYYY-MM-DD',
// a timestamp as an ISO string.

// ---- Names ------------------------------------------------------------------

export const TABLE_PRODUCT_GROUPS = 'product_groups'
export const TABLE_PRODUCTS = 'products'
export const TABLE_PRODUCT_ALIASES = 'product_aliases'
export const TABLE_PRODUCT_MENTIONS = 'product_mentions'
export const TABLE_PRODUCT_TAGS = 'product_tags'
export const TABLE_MONTH_PRODUCT_READINGS = 'month_product_readings'
export const RPC_PRODUCT_CATALOGUE = 'product_catalogue'

/** The month table's primary key, for an upsert's `onConflict`. */
export const MONTH_PRODUCT_READINGS_ON_CONFLICT = 'client_id,month,audience,object_kind,object_id'

/** The `config_changes.surface` every catalogue edit is logged on
 *  (lib/config-log.ts CONFIG_SURFACES). Not a tracking surface: an edit moves
 *  no video into or out of the corpus, and cuts no chart. */
export const PRODUCTS_SURFACE = 'products' satisfies ConfigSurface

// ---- Vocabularies (each mirrors a CHECK) ---------------------------------------

export const CATALOGUE_STATUSES = ['active', 'retired'] as const
export type CatalogueStatus = (typeof CATALOGUE_STATUSES)[number]

/**
 * What an alias is. A product's `name` or `nickname` names it; a category's
 * `category_word` is talk about the category in general; a category's `name`
 * or `nickname` (a product family, "Pro-Flex") is one of the client's products
 * there, the rules unable to tell which. A `category_word` belongs to a
 * category only.
 */
export const ALIAS_KINDS = ['name', 'nickname', 'category_word'] as const
export type AliasKind = (typeof ALIAS_KINDS)[number]

/**
 * Where a placement puts the talk.
 *   named      one of the client's products (product_id, and its category)
 *   unclear    one of the client's products in a category, not which one
 *   unbranded  the category in general
 *   none       none of the catalogue (read and refused, so not read again
 *              under the same catalogue version)
 */
export const PLACEMENTS = ['named', 'unclear', 'unbranded', 'none'] as const
export type Placement = (typeof PLACEMENTS)[number]

/** Who placed it: the matcher, the classifier, the confirm call on a generic
 *  word's hit, or a person (a tag). */
export const PLACEMENT_METHODS = ['rule', 'model', 'confirmed', 'tag'] as const
export type PlacementMethod = (typeof PLACEMENT_METHODS)[number]

/** Which placement applies when several place the same text under one
 *  catalogue version: a person over the confirm call over the classifier over
 *  the rules. */
export const PLACEMENT_METHOD_PRECEDENCE: readonly PlacementMethod[] = ['tag', 'confirmed', 'model', 'rule']

export const MENTION_SOURCES = ['content', 'comment'] as const
export type MentionSource = (typeof MENTION_SOURCES)[number]

/** A video's content fields, brand_mentions' list (lib/brands/mentions.ts). */
export const PRODUCT_CONTENT_FIELDS = ['account', 'caption', 'hashtags', 'transcript', 'transcript_en', 'ocr'] as const
export type ProductContentField = (typeof PRODUCT_CONTENT_FIELDS)[number]

/** The actors a write site can stamp (lib/config-log.ts ConfigActor): never
 *  `sql` or `reconstructed`, which only the change log's own paths write. */
export const CATALOGUE_ACTOR_KINDS = ['user', 'operator', 'script', 'pipeline'] as const
export type CatalogueActorKind = (typeof CATALOGUE_ACTOR_KINDS)[number]

export const READING_OBJECT_KINDS = ['group', 'product'] as const
export type ReadingObjectKind = (typeof READING_OBJECT_KINDS)[number]

/** A catalogue version as `product_catalogue` mints it and every placement and
 *  month row stores it: 'pc1_' and 16 hex. The digit is the formula's. */
export const CATALOGUE_VERSION_PATTERN = /^pc[0-9]+_[0-9a-f]{16}$/
export const isCatalogueVersion = (v: unknown): v is string => typeof v === 'string' && CATALOGUE_VERSION_PATTERN.test(v)

// ---- Rows ---------------------------------------------------------------------

/** Who last wrote a catalogue row (or added an alias, or tagged). */
export interface CatalogueActorColumns {
  actor_kind: CatalogueActorKind
  actor_user_id: string | null
  actor_label: string
}

export interface ProductGroupRow extends CatalogueActorColumns {
  id: string
  client_id: string
  name: string
  status: CatalogueStatus
  sort: number
  /** The website a seeded row came from ('ossur.com'); null when a person added it. */
  seeded_from: string | null
  retired_at: string | null
  created_at: string
  updated_at: string
}

export interface ProductRow extends CatalogueActorColumns {
  id: string
  client_id: string
  group_id: string
  name: string
  status: CatalogueStatus
  sort: number
  seeded_from: string | null
  retired_at: string | null
  created_at: string
  updated_at: string
}

/** Exactly one of product_id and group_id. Retired, never edited. */
export interface ProductAliasRow extends CatalogueActorColumns {
  id: string
  client_id: string
  product_id: string | null
  group_id: string | null
  alias: string
  kind: AliasKind
  needs_confirm: boolean
  seeded_from: string | null
  created_at: string
  retired_at: string | null
  retired_by: string | null
  retired_label: string | null
}

/** A person's verdict on a comment (or a video as a whole, comment_id null).
 *  Append-only; `supersedes` names the tag it replaced. */
export interface ProductTagRow extends CatalogueActorColumns {
  id: string
  client_id: string
  video_id: string
  comment_id: string | null
  placement: Placement
  product_id: string | null
  group_id: string | null
  supersedes: string | null
  created_at: string
}

/** One placement of a video's content or a comment. Append-only. */
export interface ProductMentionRow {
  id: string
  client_id: string
  video_id: string
  source: MentionSource
  /** The content field a rule matched; null on a comment row, and on a content
   *  row a model or a person placed as a whole. */
  field: ProductContentField | null
  comment_id: string | null
  /** The comment's month, 'YYYY-MM-01'; null on a content row. */
  comment_month: string | null
  placement: Placement
  /** Set exactly when placement is 'named'. */
  product_id: string | null
  /** Set unless placement is 'none' (on a named row: the product's category). */
  group_id: string | null
  method: PlacementMethod
  /** The placing method's own version (matcher, confirm, classifier, tag step). */
  rule_version: string
  catalogue_version: string
  /** Set exactly when method is 'model' or 'confirmed'. */
  model: string | null
  prompt_version: string | null
  /** Set exactly when method is 'tag'. */
  tag_id: string | null
  found_at: string
}

/**
 * A product's or a category's month, per audience. On a category row the split
 * is exclusive (named, else unclear, else unbranded), so
 * k_named + k_unclear + k_unbranded = k_any; a product row is its named videos
 * (k_unclear = k_unbranded = 0, k_any = k_named). n is the audience's videos
 * the month reads. Like-for-like across months only where both versions match.
 */
export interface MonthProductReadingRow {
  client_id: string
  month: string
  audience: string
  object_kind: ReadingObjectKind
  object_id: string
  /** The category: the row's own, or the product's when it was read. */
  group_id: string
  /** The product on a product row; null on a category row. */
  product_id: string | null
  k_named: number
  k_unclear: number
  k_unbranded: number
  k_any: number
  comments: number
  n: number
  status: 'filling' | 'frozen'
  origin: 'live' | 'back_read'
  read_at: string
  run_id: string | null
  rule_version: string
  catalogue_version: string
  frozen_at: string | null
}

// ---- Column lists (every column; the tenant holds column-level SELECT) --------------

export const PRODUCT_GROUP_COLUMNS =
  'id, client_id, name, status, sort, seeded_from, retired_at, created_at, updated_at, actor_kind, actor_user_id, actor_label'
export const PRODUCT_COLUMNS =
  'id, client_id, group_id, name, status, sort, seeded_from, retired_at, created_at, updated_at, actor_kind, actor_user_id, actor_label'
export const PRODUCT_ALIAS_COLUMNS =
  'id, client_id, product_id, group_id, alias, kind, needs_confirm, seeded_from, created_at, actor_kind, actor_user_id, actor_label, retired_at, retired_by, retired_label'
export const PRODUCT_TAG_COLUMNS =
  'id, client_id, video_id, comment_id, placement, product_id, group_id, supersedes, actor_kind, actor_user_id, actor_label, created_at'
export const PRODUCT_MENTION_COLUMNS =
  'id, client_id, video_id, source, field, comment_id, comment_month, placement, product_id, group_id, method, rule_version, catalogue_version, model, prompt_version, tag_id, found_at'
export const MONTH_PRODUCT_READING_COLUMNS =
  'client_id, month, audience, object_kind, object_id, group_id, product_id, k_named, k_unclear, k_unbranded, k_any, comments, n, status, origin, read_at, run_id, rule_version, catalogue_version, frozen_at'

// ---- The catalogue, read once with its version ----------------------------------

export interface CatalogueGroup { id: string; name: string; sort: number }
export interface CatalogueProduct { id: string; group_id: string; name: string; sort: number }
export interface CatalogueAlias {
  id: string
  product_id: string | null
  group_id: string | null
  alias: string
  kind: AliasKind
  needs_confirm: boolean
}

/** What `product_catalogue(p_client)` returns: the ACTIVE catalogue (active
 *  categories, their active products, the live aliases of those) and the
 *  version it hashes to, in display order. */
export interface ProductCatalogue {
  version: string
  groups: CatalogueGroup[]
  products: CatalogueProduct[]
  aliases: CatalogueAlias[]
}

/** `ready`: a catalogue to place under. `empty`: the client has no active
 *  category (nothing to place; Sealand today). `missing`: the migration is not
 *  applied yet, so a step no-ops and Settings says it is not ready. */
export type CatalogueRead =
  | { state: 'ready'; catalogue: ProductCatalogue }
  | { state: 'empty' }
  | { state: 'missing' }

const PRODUCT_SCHEMA_OBJECTS = [
  TABLE_PRODUCT_GROUPS, TABLE_PRODUCTS, TABLE_PRODUCT_ALIASES, TABLE_PRODUCT_MENTIONS, TABLE_PRODUCT_TAGS,
  TABLE_MONTH_PRODUCT_READINGS, RPC_PRODUCT_CATALOGUE,
]

/** Is this error "the products migration is not applied"? Narrow: one of its
 *  own names, and a missing-relation or missing-function answer (the
 *  isMissingMonthlyReading shape; `selectAll` leaves only the sentence). */
export function isMissingProductsSchema(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!PRODUCT_SCHEMA_OBJECTS.some((name) => text.includes(name))) return false
  // PGRST202 the function, PGRST205 the table, 42883/42P01 the same from Postgres.
  if (code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNullableStr = (v: unknown): v is string | null => v === null || typeof v === 'string'

/** The RPC's jsonb as a `ProductCatalogue`, or null when it is not one (no
 *  catalogue, or a shape this code does not know: a reader never guesses). */
export function parseCatalogue(value: unknown): ProductCatalogue | null {
  if (!isObj(value) || !isCatalogueVersion(value.version)) return null
  const { groups, products, aliases } = value
  if (!Array.isArray(groups) || !Array.isArray(products) || !Array.isArray(aliases)) return null
  const okGroup = (g: unknown): g is CatalogueGroup => isObj(g) && isStr(g.id) && isStr(g.name) && typeof g.sort === 'number'
  const okProduct = (p: unknown): p is CatalogueProduct =>
    isObj(p) && isStr(p.id) && isStr(p.group_id) && isStr(p.name) && typeof p.sort === 'number'
  const okAlias = (a: unknown): a is CatalogueAlias =>
    isObj(a) && isStr(a.id) && isNullableStr(a.product_id) && isNullableStr(a.group_id) && isStr(a.alias)
    && (ALIAS_KINDS as readonly unknown[]).includes(a.kind) && typeof a.needs_confirm === 'boolean'
    && (a.product_id === null) !== (a.group_id === null)
  if (!groups.every(okGroup) || !products.every(okProduct) || !aliases.every(okAlias)) return null
  return { version: value.version, groups, products, aliases }
}

/** The client's active catalogue and its version, in one read. */
export async function loadProductCatalogue(db: SupabaseClient, clientId: string): Promise<CatalogueRead> {
  const { data, error } = await db.rpc(RPC_PRODUCT_CATALOGUE, { p_client: clientId })
  if (error) {
    if (isMissingProductsSchema(error)) return { state: 'missing' }
    throw new Error(`${RPC_PRODUCT_CATALOGUE}: ${(error as { message?: string }).message ?? String(error)}`)
  }
  if (data === null || data === undefined) return { state: 'empty' }
  const catalogue = parseCatalogue(data)
  if (!catalogue) throw new Error(`${RPC_PRODUCT_CATALOGUE}: returned a shape this code does not read`)
  return { state: 'ready', catalogue }
}

// ---- Months ---------------------------------------------------------------------

/** A client's stored product months, every audience and object, for these
 *  months ('YYYY-MM-01'). Past 1000 rows (38 products, five categories, three
 *  audiences, a year), so `selectAll`, in a stable order. */
export async function loadMonthProductReadings(
  db: SupabaseClient,
  clientId: string,
  months: readonly string[],
): Promise<MonthProductReadingRow[]> {
  if (months.length === 0) return []
  return selectAll<MonthProductReadingRow>(() =>
    db.from(TABLE_MONTH_PRODUCT_READINGS).select(MONTH_PRODUCT_READING_COLUMNS)
      .eq('client_id', clientId).in('month', [...months])
      .order('month').order('audience').order('object_kind').order('object_id'))
}

// ---- Tags -----------------------------------------------------------------------

const NO_COMMENT = '-'

/** A tag's target: the comment, or the video as a whole. */
export const tagTargetKey = (videoId: string, commentId: string | null): string => `${videoId}|${commentId ?? NO_COMMENT}`

/** Is tag `a` newer than tag `b`? By time (a timestamp that does not parse is
 *  oldest), then by the stored string (microseconds Date drops), then by id. */
function newer(a: ProductTagRow, b: ProductTagRow): boolean {
  const ta = Date.parse(a.created_at)
  const tb = Date.parse(b.created_at)
  const ma = Number.isNaN(ta) ? -Infinity : ta
  const mb = Number.isNaN(tb) ? -Infinity : tb
  if (ma !== mb) return ma > mb
  if (a.created_at !== b.created_at) return a.created_at > b.created_at
  return a.id > b.id
}

/**
 * The tag that applies on each target: the newest. The schema keeps a
 * target's tags one chain (one first tag, each replaced at most once), so the
 * newest is the chain's end; reading by time rather than walking `supersedes`
 * keeps one answer if a writer ever forgets to set it. PURE.
 */
export function standingTags(tags: readonly ProductTagRow[]): Map<string, ProductTagRow> {
  const out = new Map<string, ProductTagRow>()
  for (const tag of tags) {
    const key = tagTargetKey(tag.video_id, tag.comment_id)
    const held = out.get(key)
    if (!held || newer(tag, held)) out.set(key, tag)
  }
  return out
}
