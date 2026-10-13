'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { canManageTenant, getSessionContext } from '@/lib/auth'
import { actorStamp, recordConfigChange, type ConfigActor } from '@/lib/config-log'
import {
  isMissingProductsSchema,
  PRODUCTS_SURFACE,
  TABLE_PRODUCT_ALIASES,
  TABLE_PRODUCT_GROUPS,
  TABLE_PRODUCTS,
  type AliasKind,
} from '@/lib/products/types'
import {
  catalogueText,
  COULD_NOT_SAVE,
  PRODUCTS_HELD,
  PRODUCTS_NOT_APPLIED,
  PRODUCTS_REFUSED,
  sameCatalogueName,
} from '@/lib/settings/products'
import { createAdminClient } from '@/lib/supabase-admin'
import { assertTenantMay } from '@/lib/tenant-locks'

// Settings › Your products: the catalogue's writes (depth redesign v2, T10b).
// Categories (`product_groups`), products and the other names people use
// (`product_aliases`): add, rename, and retire. Nothing here deletes, and the
// database agrees (no DELETE grant on any of the three): a product or a
// category that ever placed talk is named by placements and frozen months that
// must still render, so removing one IS retiring it (retireRival's rule,
// lib/rivals.ts). An alias is never edited either: its one change is the
// retirement stamp, and different words are a retirement plus a new row, so
// the catalogue of any past moment reads back from the rows.
//
// THE GATE IS THE TRACKING SETTINGS' (app/dashboard/settings/actions.ts):
//   1. `canManageTenant`: owners and admins. The catalogue decides what talk is
//      counted under which product, so a member reads it and does not change
//      it;
//   2. `assertTenantMay(session, clientId, 'tracking')`: a locked tenant's own
//      user is refused (lib/tenant-locks.ts; Sealand during its trial), and the
//      platform operator is let through to make the change on their behalf.
//      There is no queue for a catalogue edit (`tracking_config_queue` holds
//      tracking columns only), so the lock refuses, in its own sentence;
//   3. then the write, on the SERVICE ROLE. The migration grants a tenant
//      SELECT and nothing else on these tables, so every write goes through
//      the admin client after the two checks above, and every statement names
//      the session's client itself: the service role passes RLS.
//
// EVERY WRITE CARRIES AN ACTOR, TWICE. On the row (`actor_kind`, `actor_user_id`,
// `actor_label`: the latest hand) and in `config_changes` on the `products`
// surface (the history; `recordConfigChange`, written with the service role
// because a log a tenant can append to is not a log). `products` is in neither
// TRACKING_SURFACES nor WEEK_CUT_SURFACES: a catalogue edit moves no video into
// or out of the corpus, and the product readings carry the catalogue version
// they were read under (lib/products/types.ts).
//
// THE MIGRATION MAY NOT BE THERE. Every read and write answers
// PRODUCTS_NOT_APPLIED on a missing table (`isMissingProductsSchema`) and
// writes nothing.
//
// A PRODUCT'S OWN NAME IS ALSO ONE OF ITS NAMES. Adding a product writes an
// alias of kind `name` with the product's name, and a rename retires that
// alias and writes the new one, so the matcher (T11) finds a product a person
// added here whether it compiles `products.name` or only the aliases. The tab
// does not print that alias beside the name it repeats.

export interface ProductFormState {
  ok: boolean
  message: string
  /** The row written, so a form can follow it without re-reading. */
  id?: string
}

const uuid = z.string().uuid()
const GONE = { group: 'That category is no longer here.', product: 'That product is no longer here.', alias: 'That name is no longer on your list.' } as const

type Admin = ReturnType<typeof createAdminClient>

interface Writer {
  admin: Admin
  clientId: string
  userId: string
  actor: ConfigActor
}

/** The session, or the sentence that refuses it. Role first, then the lock. */
async function writer(detail: string): Promise<Writer | ProductFormState> {
  const session = await getSessionContext()
  if (!canManageTenant(session.role)) return { ok: false, message: PRODUCTS_REFUSED }
  const may = assertTenantMay(session, session.clientId, 'tracking')
  if (!may.ok) return { ok: false, message: PRODUCTS_HELD }
  return { admin: createAdminClient(), clientId: session.clientId, userId: session.userId, actor: actorStamp(session, `products: ${detail}`) }
}

const refused = (w: Writer | ProductFormState): w is ProductFormState => 'ok' in w

/** The columns that say who last wrote a catalogue row. */
const stamp = (actor: ConfigActor) => ({ actor_kind: actor.kind, actor_user_id: actor.user_id, actor_label: actor.label ?? 'unknown' })

/** A failed statement as the person reads it: not switched on, or try again. */
function failed(where: string, error: unknown): ProductFormState {
  if (isMissingProductsSchema(error)) return { ok: false, message: PRODUCTS_NOT_APPLIED }
  console.error(`[products] ${where}: ${(error as { message?: string })?.message ?? String(error)}`)
  return { ok: false, message: COULD_NOT_SAVE }
}

const isUnique = (error: unknown): boolean => (error as { code?: string } | null)?.code === '23505'

/** Every page that reads the catalogue. */
function revalidateProducts(): void {
  revalidatePath('/dashboard/settings/products')
  revalidatePath('/dashboard/products')
  revalidatePath('/dashboard')
}

async function log(w: Writer, field: string, before: unknown, after: unknown, note: string): Promise<void> {
  await recordConfigChange(w.admin, { clientId: w.clientId, surface: PRODUCTS_SURFACE, field, before, after, actor: w.actor, note })
}

interface GroupRef { id: string; name: string; sort: number }
interface ProductRef { id: string; group_id: string; name: string; sort: number }
interface AliasRef { id: string; alias: string; kind: AliasKind; needs_confirm: boolean; product_id: string | null; group_id: string | null }

const nextSort = (rows: readonly { sort: number }[]): number => rows.reduce((m, r) => Math.max(m, r.sort + 1), 0)

/** The client's live aliases, to say where a word already is. */
async function liveAliases(w: Writer): Promise<{ rows: AliasRef[] } | ProductFormState> {
  const { data, error } = await w.admin.from(TABLE_PRODUCT_ALIASES)
    .select('id, alias, kind, needs_confirm, product_id, group_id')
    .eq('client_id', w.clientId).is('retired_at', null)
  if (error) return failed('aliases read', error)
  return { rows: (data ?? []) as AliasRef[] }
}

/** Retire these aliases with the writer's stamp. */
async function retireAliases(w: Writer, ids: readonly string[], at: string): Promise<unknown> {
  if (ids.length === 0) return null
  const { error } = await w.admin.from(TABLE_PRODUCT_ALIASES)
    .update({ retired_at: at, retired_by: w.userId, retired_label: w.actor.label ?? 'unknown' })
    .eq('client_id', w.clientId).in('id', [...ids]).is('retired_at', null)
  return error ?? null
}

/** Write a product's own name as one of its names, unless the word is already
 *  someone's: then the product keeps the names it has, and the log says so. */
async function writeNameAlias(w: Writer, productId: string, name: string, needsConfirm: boolean): Promise<'written' | 'taken' | 'failed'> {
  const { error } = await w.admin.from(TABLE_PRODUCT_ALIASES).insert({
    client_id: w.clientId, product_id: productId, alias: name, kind: 'name', needs_confirm: needsConfirm, ...stamp(w.actor),
  })
  if (!error) return 'written'
  if (isUnique(error)) return 'taken'
  console.error(`[products] name alias for ${productId}: ${(error as { message?: string }).message ?? String(error)}`)
  return 'failed'
}

// ---- Categories -------------------------------------------------------------------

/** "+ Add a category". */
export async function addProductGroup(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const w = await writer('add a category')
  if (refused(w)) return w
  const name = catalogueText(form.get('name'), 'group')
  if (!name.ok) return name

  const { data, error } = await w.admin.from(TABLE_PRODUCT_GROUPS).select('id, name, sort').eq('client_id', w.clientId).eq('status', 'active')
  if (error) return failed('categories read', error)
  const live = (data ?? []) as GroupRef[]
  if (live.some((g) => sameCatalogueName(g.name, name.text))) return { ok: false, message: `You already have a category called ${name.text}.` }

  const { data: row, error: insertError } = await w.admin.from(TABLE_PRODUCT_GROUPS)
    .insert({ client_id: w.clientId, name: name.text, status: 'active', sort: nextSort(live), ...stamp(w.actor) })
    .select('id').single()
  if (insertError) {
    if (isUnique(insertError)) return { ok: false, message: `You already have a category called ${name.text}.` }
    return failed('category insert', insertError)
  }
  const id = (row as { id: string }).id
  await log(w, 'product_groups', null, { id, name: name.text }, `${name.text} was added as a category.`)
  revalidateProducts()
  return { ok: true, message: 'Added.', id }
}

/** "Rename" on the open category. Its identity is the id, so its line keeps. */
export async function renameProductGroup(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const w = await writer('rename a category')
  if (refused(w)) return w
  const id = String(form.get('id') ?? '')
  if (!uuid.safeParse(id).success) return { ok: false, message: GONE.group }
  const name = catalogueText(form.get('name'), 'group')
  if (!name.ok) return name

  const { data, error } = await w.admin.from(TABLE_PRODUCT_GROUPS).select('id, name, sort').eq('client_id', w.clientId).eq('status', 'active')
  if (error) return failed('categories read', error)
  const live = (data ?? []) as GroupRef[]
  // A copy: what the row WAS, whatever the client hands back by reference.
  const found = live.find((g) => g.id === id)
  if (!found) return { ok: false, message: GONE.group }
  const before = { ...found }
  if (before.name === name.text) return { ok: true, message: 'Nothing to change.', id }
  if (live.some((g) => g.id !== id && sameCatalogueName(g.name, name.text))) return { ok: false, message: `You already have a category called ${name.text}.` }

  const { data: hit, error: updateError } = await w.admin.from(TABLE_PRODUCT_GROUPS)
    .update({ name: name.text, updated_at: new Date().toISOString(), ...stamp(w.actor) })
    .eq('client_id', w.clientId).eq('id', id).eq('status', 'active').select('id')
  if (updateError) {
    if (isUnique(updateError)) return { ok: false, message: `You already have a category called ${name.text}.` }
    return failed('category rename', updateError)
  }
  if ((hit ?? []).length === 0) return { ok: false, message: GONE.group }
  await log(w, 'product_groups', { id, name: before.name }, { id, name: name.text }, `The category ${before.name} was renamed ${name.text}.`)
  revalidateProducts()
  return { ok: true, message: 'Renamed.', id }
}

/**
 * Remove a category: it is RETIRED, with its products and every name of
 * theirs and its own. The catalogue reads active categories only, so nothing
 * under it places talk from now on; what was already read stays as it was.
 * The names are retired too so their words are free for another product.
 */
export async function retireProductGroup(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const w = await writer('remove a category')
  if (refused(w)) return w
  const id = String(form.get('id') ?? '')
  if (!uuid.safeParse(id).success) return { ok: false, message: GONE.group }

  const { data: group, error } = await w.admin.from(TABLE_PRODUCT_GROUPS).select('id, name, sort').eq('client_id', w.clientId).eq('id', id).eq('status', 'active').maybeSingle()
  if (error) return failed('category read', error)
  if (!group) return { ok: false, message: GONE.group }
  const { name: groupName } = group as GroupRef
  const { data: products, error: productsError } = await w.admin.from(TABLE_PRODUCTS).select('id, group_id, name, sort').eq('client_id', w.clientId).eq('group_id', id).eq('status', 'active')
  if (productsError) return failed('category products read', productsError)
  const productIds = ((products ?? []) as ProductRef[]).map((p) => p.id)
  const aliases = await liveAliases(w)
  if (!('rows' in aliases)) return aliases
  const aliasIds = aliases.rows.filter((a) => a.group_id === id || (a.product_id != null && productIds.includes(a.product_id))).map((a) => a.id)

  const at = new Date().toISOString()
  const retired = { status: 'retired', retired_at: at, updated_at: at, ...stamp(w.actor) }
  // The category first: from this statement on, the catalogue no longer reads
  // anything under it. Its products and names follow.
  const { data: hit, error: groupError } = await w.admin.from(TABLE_PRODUCT_GROUPS).update(retired).eq('client_id', w.clientId).eq('id', id).eq('status', 'active').select('id')
  if (groupError) return failed('category retire', groupError)
  if ((hit ?? []).length === 0) return { ok: false, message: GONE.group }
  const after: Record<string, unknown> = { id, name: groupName, status: 'retired', products: productIds, aliases: aliasIds }
  if (productIds.length > 0) {
    const { error: e } = await w.admin.from(TABLE_PRODUCTS).update(retired).eq('client_id', w.clientId).eq('group_id', id).eq('status', 'active')
    if (e) { console.error(`[products] category ${id} products retire: ${e.message}`); after.products_failed = true }
  }
  const aliasError = await retireAliases(w, aliasIds, at)
  if (aliasError) { console.error(`[products] category ${id} names retire: ${(aliasError as { message?: string }).message}`); after.aliases_failed = true }
  await log(w, 'product_groups', { id, name: groupName, status: 'active' }, after, `The category ${groupName} was removed, with its ${productIds.length} products.`)
  revalidateProducts()
  return { ok: true, message: 'Removed.', id }
}

// ---- Products ---------------------------------------------------------------------

/** "+ Add a product" in the open category. */
export async function addProduct(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const w = await writer('add a product')
  if (refused(w)) return w
  const groupId = String(form.get('group_id') ?? '')
  if (!uuid.safeParse(groupId).success) return { ok: false, message: GONE.group }
  const name = catalogueText(form.get('name'), 'product')
  if (!name.ok) return name
  const common = form.get('common') === 'on'

  const { data: group, error } = await w.admin.from(TABLE_PRODUCT_GROUPS).select('id, name, sort').eq('client_id', w.clientId).eq('id', groupId).eq('status', 'active').maybeSingle()
  if (error) return failed('category read', error)
  if (!group) return { ok: false, message: GONE.group }
  const { data: products, error: productsError } = await w.admin.from(TABLE_PRODUCTS).select('id, group_id, name, sort').eq('client_id', w.clientId).eq('status', 'active')
  if (productsError) return failed('products read', productsError)
  const live = (products ?? []) as ProductRef[]
  if (live.some((p) => sameCatalogueName(p.name, name.text))) return { ok: false, message: `You already have a product called ${name.text}.` }

  const { data: row, error: insertError } = await w.admin.from(TABLE_PRODUCTS)
    .insert({ client_id: w.clientId, group_id: groupId, name: name.text, status: 'active', sort: nextSort(live.filter((p) => p.group_id === groupId)), ...stamp(w.actor) })
    .select('id').single()
  if (insertError) {
    if (isUnique(insertError)) return { ok: false, message: `You already have a product called ${name.text}.` }
    return failed('product insert', insertError)
  }
  const id = (row as { id: string }).id
  const nameAlias = await writeNameAlias(w, id, name.text, common)
  await log(w, 'products', null, { id, group_id: groupId, name: name.text, name_alias: nameAlias, needs_confirm: common },
    `${name.text} was added to ${(group as GroupRef).name}.`)
  revalidateProducts()
  return { ok: true, message: 'Added.', id }
}

/** "Edit" on a product: its name, and the category it sits in. */
export async function editProduct(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const w = await writer('edit a product')
  if (refused(w)) return w
  const id = String(form.get('id') ?? '')
  if (!uuid.safeParse(id).success) return { ok: false, message: GONE.product }
  const name = catalogueText(form.get('name'), 'product')
  if (!name.ok) return name

  const { data: products, error } = await w.admin.from(TABLE_PRODUCTS).select('id, group_id, name, sort').eq('client_id', w.clientId).eq('status', 'active')
  if (error) return failed('products read', error)
  const live = (products ?? []) as ProductRef[]
  const found = live.find((p) => p.id === id)
  if (!found) return { ok: false, message: GONE.product }
  const before = { ...found }
  const groupId = String(form.get('group_id') ?? '') || before.group_id
  if (!uuid.safeParse(groupId).success) return { ok: false, message: GONE.group }
  if (before.name === name.text && before.group_id === groupId) return { ok: true, message: 'Nothing to change.', id }
  if (live.some((p) => p.id !== id && sameCatalogueName(p.name, name.text))) return { ok: false, message: `You already have a product called ${name.text}.` }

  const moved = groupId !== before.group_id
  let sort = before.sort
  if (moved) {
    const { data: group, error: groupError } = await w.admin.from(TABLE_PRODUCT_GROUPS).select('id, name, sort').eq('client_id', w.clientId).eq('id', groupId).eq('status', 'active').maybeSingle()
    if (groupError) return failed('category read', groupError)
    if (!group) return { ok: false, message: GONE.group }
    sort = nextSort(live.filter((p) => p.group_id === groupId))
  }

  const { data: hit, error: updateError } = await w.admin.from(TABLE_PRODUCTS)
    .update({ name: name.text, group_id: groupId, sort, updated_at: new Date().toISOString(), ...stamp(w.actor) })
    .eq('client_id', w.clientId).eq('id', id).eq('status', 'active').select('id')
  if (updateError) {
    if (isUnique(updateError)) return { ok: false, message: `You already have a product called ${name.text}.` }
    return failed('product edit', updateError)
  }
  if ((hit ?? []).length === 0) return { ok: false, message: GONE.product }

  // THE OWN-NAME ALIAS FOLLOWS THE NAME: the old one retired, the new one
  // written, with the old one's common-word flag. A change of case alone is
  // the same word to the matcher, so it leaves the alias as it is.
  let nameAlias: 'kept' | 'written' | 'taken' | 'failed' = 'kept'
  if (!sameCatalogueName(before.name, name.text)) {
    const aliases = await liveAliases(w)
    const old = 'rows' in aliases ? aliases.rows.filter((a) => a.product_id === id && a.kind === 'name' && sameCatalogueName(a.alias, before.name)) : []
    const retireError = await retireAliases(w, old.map((a) => a.id), new Date().toISOString())
    if (retireError) console.error(`[products] old name alias for ${id}: ${(retireError as { message?: string }).message}`)
    nameAlias = await writeNameAlias(w, id, name.text, old.some((a) => a.needs_confirm))
  }
  const said = moved && before.name !== name.text
    ? `${before.name} was renamed ${name.text} and moved to another category.`
    : moved ? `${name.text} was moved to another category.` : `${before.name} was renamed ${name.text}.`
  await log(w, 'products', { id, name: before.name, group_id: before.group_id }, { id, name: name.text, group_id: groupId, name_alias: nameAlias }, said)
  revalidateProducts()
  return { ok: true, message: 'Saved.', id }
}

/** Remove a product: retired, with every name of its own. */
export async function retireProduct(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const w = await writer('remove a product')
  if (refused(w)) return w
  const id = String(form.get('id') ?? '')
  if (!uuid.safeParse(id).success) return { ok: false, message: GONE.product }

  const { data: product, error } = await w.admin.from(TABLE_PRODUCTS).select('id, group_id, name, sort').eq('client_id', w.clientId).eq('id', id).eq('status', 'active').maybeSingle()
  if (error) return failed('product read', error)
  if (!product) return { ok: false, message: GONE.product }
  const held = { ...(product as ProductRef) }
  const aliases = await liveAliases(w)
  if (!('rows' in aliases)) return aliases
  const aliasIds = aliases.rows.filter((a) => a.product_id === id).map((a) => a.id)

  const at = new Date().toISOString()
  const { data: hit, error: updateError } = await w.admin.from(TABLE_PRODUCTS)
    .update({ status: 'retired', retired_at: at, updated_at: at, ...stamp(w.actor) })
    .eq('client_id', w.clientId).eq('id', id).eq('status', 'active').select('id')
  if (updateError) return failed('product retire', updateError)
  if ((hit ?? []).length === 0) return { ok: false, message: GONE.product }
  const after: Record<string, unknown> = { id, name: held.name, status: 'retired', aliases: aliasIds }
  const aliasError = await retireAliases(w, aliasIds, at)
  if (aliasError) { console.error(`[products] product ${id} names retire: ${(aliasError as { message?: string }).message}`); after.aliases_failed = true }
  await log(w, 'products', { id, name: held.name, group_id: held.group_id, status: 'active' }, after, `${held.name} was removed from your products.`)
  revalidateProducts()
  return { ok: true, message: 'Removed.', id }
}

// ---- Other names ------------------------------------------------------------------

/** The kinds a person may add, by what the name is for. */
const PRODUCT_ALIAS_KINDS: readonly AliasKind[] = ['nickname', 'name']
const GROUP_ALIAS_KINDS: readonly AliasKind[] = ['category_word', 'nickname', 'name']

/**
 * "+ Add a name" on a product (another name people use for it), or on a
 * category: a word for the category in general (`category_word`) or a name
 * for the range as a whole (`nickname`). `common` marks a common word, whose
 * every hit is checked before it counts (`needs_confirm`).
 */
export async function addProductAlias(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const w = await writer('add a name')
  if (refused(w)) return w
  const productId = String(form.get('product_id') ?? '') || null
  const groupId = productId ? null : String(form.get('group_id') ?? '') || null
  const target = productId ?? groupId
  if (!target || !uuid.safeParse(target).success) return { ok: false, message: productId ? GONE.product : GONE.group }
  const allowed = productId ? PRODUCT_ALIAS_KINDS : GROUP_ALIAS_KINDS
  const kind = (String(form.get('kind') ?? '') || allowed[0]) as AliasKind
  if (!allowed.includes(kind)) return { ok: false, message: 'Say what kind of name it is.' }
  const alias = catalogueText(form.get('alias'), 'alias')
  if (!alias.ok) return alias
  const common = form.get('common') === 'on'

  const table = productId ? TABLE_PRODUCTS : TABLE_PRODUCT_GROUPS
  const { data: owner, error } = await w.admin.from(table).select('id, name').eq('client_id', w.clientId).eq('id', target).eq('status', 'active').maybeSingle()
  if (error) return failed('name owner read', error)
  if (!owner) return { ok: false, message: productId ? GONE.product : GONE.group }
  const ownerName = (owner as { name: string }).name

  const live = await liveAliases(w)
  if (!('rows' in live)) return live
  const taken = live.rows.find((a) => sameCatalogueName(a.alias, alias.text))
  if (taken) {
    const same = taken.product_id === productId && taken.group_id === groupId
    return { ok: false, message: same ? `${alias.text} is already one of its names.` : `${alias.text} is already a name for something else on your list.` }
  }

  const { data: row, error: insertError } = await w.admin.from(TABLE_PRODUCT_ALIASES)
    .insert({ client_id: w.clientId, product_id: productId, group_id: groupId, alias: alias.text, kind, needs_confirm: common, ...stamp(w.actor) })
    .select('id').single()
  if (insertError) {
    if (isUnique(insertError)) return { ok: false, message: `${alias.text} is already a name for something else on your list.` }
    return failed('name insert', insertError)
  }
  const id = (row as { id: string }).id
  const note = kind === 'category_word'
    ? `${alias.text} was added as a word for ${ownerName} in general.`
    : `${alias.text} was added as another name for ${ownerName}.`
  await log(w, 'product_aliases', null, { id, alias: alias.text, kind, needs_confirm: common, product_id: productId, group_id: groupId }, note)
  revalidateProducts()
  return { ok: true, message: 'Added.', id }
}

/** Take a name off the list: the alias is retired, never deleted. */
export async function retireProductAlias(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const w = await writer('remove a name')
  if (refused(w)) return w
  const id = String(form.get('id') ?? '')
  if (!uuid.safeParse(id).success) return { ok: false, message: GONE.alias }

  const { data: alias, error } = await w.admin.from(TABLE_PRODUCT_ALIASES)
    .select('id, alias, kind, needs_confirm, product_id, group_id')
    .eq('client_id', w.clientId).eq('id', id).is('retired_at', null).maybeSingle()
  if (error) return failed('name read', error)
  if (!alias) return { ok: false, message: GONE.alias }
  const before = { ...(alias as AliasRef) }

  const at = new Date().toISOString()
  const { data: hit, error: updateError } = await w.admin.from(TABLE_PRODUCT_ALIASES)
    .update({ retired_at: at, retired_by: w.userId, retired_label: w.actor.label ?? 'unknown' })
    .eq('client_id', w.clientId).eq('id', id).is('retired_at', null).select('id')
  if (updateError) return failed('name retire', updateError)
  if ((hit ?? []).length === 0) return { ok: false, message: GONE.alias }
  await log(w, 'product_aliases', before, { id, retired_at: at }, `${before.alias} was taken off your product names.`)
  revalidateProducts()
  return { ok: true, message: 'Removed.', id }
}
