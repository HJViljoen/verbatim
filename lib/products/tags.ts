import type { SupabaseClient } from '@supabase/supabase-js'

import { readRivalFound } from '../brands/rival-searches'
import { recordConfigChange, type ConfigActor } from '../config-log'
import { readMonthVideos } from '../provenance/load'
import { denominatorKey, freezeStateFor, monthsToRefresh, monthStartOf } from '../reading/monthly'
import { selectAll } from '../supabase-admin'
import { compileCatalogue, PRODUCT_RULE_VERSION } from './rules'
import { standingPlacements, type MentionInsert } from './match'
import { PRODUCT_MODEL_RULE_VERSION } from './classify'
import { readSearchFound, readSearchTerms } from './organic'
import {
  categorySearchFinds, categorySearchTerms, HELD_COLUMNS, mergeProductRows, PRODUCT_READINGS_TABLE, productReadingRows, storedProductRows, writeProductRows,
  type HeldRow,
} from './readings'
import {
  isMissingProductsSchema, loadProductCatalogue, PRODUCT_TAG_COLUMNS, PRODUCTS_SURFACE, standingTags, tagTargetKey,
  TABLE_PRODUCT_MENTIONS, TABLE_PRODUCT_TAGS, type Placement, type ProductCatalogue, type ProductTagRow,
} from './types'

// "Tag the product" (depth redesign v2, T12; the board's "Tag them and we'll
// learn the name"): a person says which of the client's products or
// categories a comment (or a video as a whole) is about, or that it is about
// none of them. The Tag button is T5's (Your products, the couldn't-tell-which
// list); this is what it posts to, through lib/actions/product-tags.ts.
//
// APPEND-ONLY, A CHAIN. A tag is a product_tags row; a re-tag is a NEW row
// whose `supersedes` names the tag it replaced, and the schema's two unique
// indexes keep a target's tags one chain, so two people re-tagging one comment
// at once cannot both stand: the second insert fails, and the action says the
// tag changed under them. The newest tag on a target applies (`standingTags`),
// and it is the text's whole answer (lib/products/match.ts standingPlacements).
// There is no untag: re-tagging as "none of our products" is a verdict.
//
// ITS PLACEMENT ROW. Each tag also writes one product_mentions row (method
// 'tag', `tag_id`) under the catalogue version it was made under: the record
// of the placement, and where a tagged comment's month is read from.
//
// OPEN MONTHS ONLY. The tag re-reads the months still FILLING that it can
// move (a comment's own month; a video's every open month), from what is
// stored: the placements the last run wrote, the standing tags, the month's
// market. No rule scan and no model call. A FROZEN month is untouched: it is
// the record, and the freeze guards refuse it anyway. So a tag on a comment in
// a closed month counts nowhere a page reads today, and that is the honest
// answer (research D §8).
//
// "WE'LL LEARN THE NAME" is not built: a tag does not add an alias. A new name
// is added in Settings (T10b), and it is a new catalogue version.
//
// LOGGED: one config_changes row on surface 'products' (field 'tag') with the
// person as its actor. 'products' cuts no chart and moves no comparison
// (lib/products/types.ts PRODUCTS_SURFACE).

/** product_mentions.rule_version on a tag's placement row. */
export const PRODUCT_TAG_VERSION = 'product_tag_v1'

/** The answers a Tag offers. */
export type TagChoice =
  | { placement: 'named'; productId: string }
  | { placement: 'unclear' | 'unbranded'; groupId: string }
  | { placement: 'none' }

/** One option of the Tag control (T5): its value posts as `choice`. */
export interface TagOption { value: string; label: string; choice: TagChoice }

/** A choice as the form posts it: 'named:<product>', 'unclear:<category>',
 *  'unbranded:<category>', 'none'. */
export const tagValue = (c: TagChoice): string =>
  c.placement === 'named' ? `named:${c.productId}` : c.placement === 'none' ? 'none' : `${c.placement}:${c.groupId}`

/** The posted value read back; null for anything else. PURE. */
export function parseTagValue(raw: unknown): TagChoice | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (s === 'none') return { placement: 'none' }
  const m = s.match(/^(named|unclear|unbranded):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)
  if (!m) return null
  return m[1] === 'named' ? { placement: 'named', productId: m[2] } : { placement: m[1] as 'unclear' | 'unbranded', groupId: m[2] }
}

/**
 * The options a Tag offers for a text under one category (the board's list:
 * each of the category's products, then "one of ours, not sure which", then
 * the category in general, then none of ours), in the catalogue's order. With
 * no category, every category's products. Labels are client words. PURE.
 */
export function tagOptions(catalogue: Pick<ProductCatalogue, 'groups' | 'products'>, groupId?: string | null): TagOption[] {
  const groups = [...catalogue.groups].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).filter((g) => !groupId || g.id === groupId)
  const out: TagOption[] = []
  for (const g of groups) {
    for (const p of [...catalogue.products].filter((x) => x.group_id === g.id).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))) {
      const choice: TagChoice = { placement: 'named', productId: p.id }
      out.push({ value: tagValue(choice), label: p.name, choice })
    }
    const unclear: TagChoice = { placement: 'unclear', groupId: g.id }
    const unbranded: TagChoice = { placement: 'unbranded', groupId: g.id }
    out.push({ value: tagValue(unclear), label: `One of your ${g.name.toLowerCase()}, not sure which`, choice: unclear })
    out.push({ value: tagValue(unbranded), label: `${g.name} in general`, choice: unbranded })
  }
  const none: TagChoice = { placement: 'none' }
  out.push({ value: tagValue(none), label: 'Not about your products', choice: none })
  return out
}

/** A choice against the ACTIVE catalogue: the row's target columns, or why
 *  not. A named product carries its category. PURE. */
export function resolveTag(choice: TagChoice, catalogue: Pick<ProductCatalogue, 'groups' | 'products'>):
  | { ok: true; placement: Placement; productId: string | null; groupId: string | null }
  | { ok: false; why: 'unknown_target' } {
  if (choice.placement === 'none') return { ok: true, placement: 'none', productId: null, groupId: null }
  if (choice.placement === 'named') {
    const p = catalogue.products.find((x) => x.id === choice.productId)
    return p ? { ok: true, placement: 'named', productId: p.id, groupId: p.group_id } : { ok: false, why: 'unknown_target' }
  }
  return catalogue.groups.some((g) => g.id === choice.groupId)
    ? { ok: true, placement: choice.placement, productId: null, groupId: choice.groupId }
    : { ok: false, why: 'unknown_target' }
}

/** Is the standing tag already this answer? PURE. */
export const sameTag = (t: Pick<ProductTagRow, 'placement' | 'product_id' | 'group_id'> | undefined, r: { placement: Placement; productId: string | null; groupId: string | null }): boolean =>
  !!t && t.placement === r.placement && (t.product_id ?? null) === r.productId && (t.group_id ?? null) === r.groupId

/** The months a tag may move, as at `now`: the comment's own month while it
 *  is still filling; for a video's content, every month still open. PURE. */
export function tagMonths(commentMonth: string | null, now: string): string[] {
  if (commentMonth) return freezeStateFor(commentMonth, now) === 'filling' ? [monthStartOf(commentMonth)] : []
  return monthsToRefresh(now, [])
}

export const PRODUCT_TAG_COPY = {
  done: 'Tagged. Your products counts this from now on, in this month and any month still open.',
  closedMonth: 'Tagged and kept. That comment\'s month is closed, so its counts stay as they were.',
  already: 'This is already tagged that way.',
  changed: 'Someone tagged this a moment ago. Refresh to see it, then tag again if you need to.',
  role: 'Only an owner or an admin can tag.',
  unread: 'We could not read what that was. Refresh the page and try again.',
  unknown: 'We have no record of that comment in this workspace.',
  unknownTarget: 'That product or category is not in your list any more. Refresh the page and try again.',
  notReady: 'Your products is not set up yet, so there is nothing to tag against.',
  failed: 'We could not take that just now. Try again, and tell us if it keeps happening.',
} as const

/** `written_closed`: the tag is stored, on a comment whose month is closed,
 *  so no count it is in moves (the frozen month is the record). */
export type TagOutcome = 'written' | 'written_closed' | 'already' | 'changed' | 'unknown_text' | 'unknown_target' | 'not_ready' | 'failed'
export interface TagResult { outcome: TagOutcome; logged: boolean; reread: string[]; error?: string }

const PG_UNIQUE_VIOLATION = '23505'

/**
 * Write one tag for a comment (or a video as a whole) of this tenant, its
 * placement row, the change-log row, and re-read the open months it moves.
 * The tenant comes from the session; the video and the comment are resolved
 * against it before anything is written.
 */
export async function writeProductTag(admin: SupabaseClient, a: {
  clientId: string
  videoId: string
  commentId: string | null
  choice: TagChoice
  actor: ConfigActor
  now?: string
}): Promise<TagResult> {
  const fail = (outcome: TagOutcome, error?: string): TagResult => ({ outcome, logged: false, reread: [], ...(error ? { error } : {}) })
  const now = a.now ?? new Date().toISOString()

  const read = await loadProductCatalogue(admin, a.clientId).catch((e: unknown) => ({ state: 'error' as const, e }))
  if (read.state === 'error') return fail('failed', read.e instanceof Error ? read.e.message : String(read.e))
  if (read.state !== 'ready') return fail('not_ready')
  const catalogue = read.catalogue
  const target = resolveTag(a.choice, catalogue)
  if (!target.ok) return fail('unknown_target')

  const video = await admin.from('videos').select('id, platform, video_id').eq('id', a.videoId).eq('client_id', a.clientId).limit(1)
  if (video.error) return fail('failed', video.error.message)
  const v = (video.data ?? [])[0] as { id: string; platform: string; video_id: string } | undefined
  if (!v) return fail('unknown_text')
  let commentMonth: string | null = null
  if (a.commentId) {
    const c = await admin.from('comments').select('id, platform, video_id, comment_date').eq('id', a.commentId).eq('client_id', a.clientId).limit(1)
    if (c.error) return fail('failed', c.error.message)
    const row = (c.data ?? [])[0] as { platform: string; video_id: string; comment_date: string | null } | undefined
    if (!row || row.platform !== v.platform || row.video_id !== v.video_id || !row.comment_date) return fail('unknown_text')
    commentMonth = monthStartOf(String(row.comment_date))
  }

  const held = await admin.from(TABLE_PRODUCT_TAGS).select(PRODUCT_TAG_COLUMNS).eq('client_id', a.clientId).eq('video_id', a.videoId)
  if (held.error) return isMissingProductsSchema(held.error) ? fail('not_ready') : fail('failed', held.error.message)
  const standing = standingTags((held.data ?? []) as ProductTagRow[]).get(tagTargetKey(a.videoId, a.commentId))
  if (sameTag(standing, target)) {
    // A retry after a write that stored the tag and not its placement row
    // answers "already": make sure the row is there under this version.
    const had = await admin.from(TABLE_PRODUCT_MENTIONS).select('tag_id').eq('client_id', a.clientId).eq('tag_id', standing!.id).eq('catalogue_version', catalogue.version).limit(1)
    if (had.error) return fail('failed', had.error.message)
    if ((had.data ?? []).length === 0) {
      const placed = await admin.from(TABLE_PRODUCT_MENTIONS).insert(tagMention(a, commentMonth, target, standing!.id, catalogue.version))
      if (placed.error) return fail('failed', `the tag is stored but its placement row is not: ${placed.error.message}`)
    }
    return { outcome: 'already', logged: false, reread: [] }
  }

  const stamp = { actor_kind: a.actor.kind, actor_user_id: a.actor.user_id, actor_label: a.actor.label ?? a.actor.user_id ?? a.actor.kind }
  const ins = await admin.from(TABLE_PRODUCT_TAGS).insert({
    client_id: a.clientId, video_id: a.videoId, comment_id: a.commentId, placement: target.placement,
    product_id: target.productId, group_id: target.groupId, supersedes: standing?.id ?? null, ...stamp,
  }).select('id').single()
  if (ins.error || !ins.data) {
    const code = (ins.error as { code?: string } | null)?.code
    if (code === PG_UNIQUE_VIOLATION) return fail('changed')
    return fail('failed', ins.error?.message ?? 'no id returned')
  }
  const tagId = (ins.data as { id: string }).id
  const placed = await admin.from(TABLE_PRODUCT_MENTIONS).insert(tagMention(a, commentMonth, target, tagId, catalogue.version))
  if (placed.error) return fail('failed', `the tag is stored but its placement row is not: ${placed.error.message}`)

  const logged = await recordConfigChange(admin, {
    clientId: a.clientId, surface: PRODUCTS_SURFACE, field: 'tag',
    before: standing ? { placement: standing.placement, product_id: standing.product_id, group_id: standing.group_id } : null,
    after: { video_id: a.videoId, comment_id: a.commentId, placement: target.placement, product_id: target.productId, group_id: target.groupId },
    actor: a.actor, rowsAffected: 1,
    note: 'You tagged what a comment is about under your products.',
  })

  let reread: string[] = []
  try {
    reread = await rereadOpenMonths(admin, a.clientId, catalogue, tagMonths(commentMonth, now), now)
  } catch (e) {
    // The tag stands; the next run re-reads the month anyway.
    console.error(`[product-tags] open months not re-read for ${a.clientId}: ${e instanceof Error ? e.message : String(e)}`)
  }
  const closedMonth = commentMonth !== null && freezeStateFor(commentMonth, now) === 'frozen'
  return { outcome: closedMonth ? 'written_closed' : 'written', logged, reread }
}

/** A tag's placement row, under the catalogue version it was made under. */
function tagMention(a: { clientId: string; videoId: string; commentId: string | null }, commentMonth: string | null,
  target: { placement: Placement; productId: string | null; groupId: string | null }, tagId: string, version: string): MentionInsert {
  return {
    client_id: a.clientId, video_id: a.videoId, source: a.commentId ? 'comment' : 'content', field: null,
    comment_id: a.commentId, comment_month: commentMonth, placement: target.placement, product_id: target.productId, group_id: target.groupId,
    method: 'tag', rule_version: PRODUCT_TAG_VERSION, catalogue_version: version, model: null, prompt_version: null, tag_id: tagId,
  }
}

/**
 * Re-read these months FROM WHAT IS STORED (see the header): the placements
 * of this catalogue version by this matcher and this prompt (as placeProducts
 * counts them), dated in the month or on content, the standing tags, the
 * month's market, and the organic base (the rival searches' finds and the
 * category's own searches'). No scan, no model. Skipped, month by month,
 * where the month is no longer filling, or holds no rows yet, or its rows
 * were made under ANOTHER catalogue version: after a Settings edit the
 * placements under the new version do not exist until the next run, and a
 * re-read from them would write the month to about nothing (the fresh check
 * of 13 Oct). The next run reads those months whole. Returns the months
 * written.
 */
export async function rereadOpenMonths(admin: SupabaseClient, clientId: string, catalogue: ProductCatalogue, months: readonly string[], now: string): Promise<string[]> {
  const candidates = months.map(monthStartOf).filter((m) => freezeStateFor(m, now) === 'filling')
  const open: string[] = []
  for (const m of candidates) {
    const versions = await selectAll<{ catalogue_version: string; object_id: string; audience: string; object_kind: string }>(() => admin.from(PRODUCT_READINGS_TABLE)
      .select('catalogue_version, object_id, audience, object_kind').eq('client_id', clientId).eq('month', m).order('audience').order('object_kind').order('object_id'))
    if (versions.length > 0 && versions.every((v) => v.catalogue_version === catalogue.version)) open.push(m)
  }
  if (open.length === 0) return []
  const compiled = compileCatalogue(catalogue, clientId)
  const current = (r: HeldRow) => (r.method === 'rule' && r.rule_version === PRODUCT_RULE_VERSION)
    || ((r.method === 'model' || r.method === 'confirmed') && r.rule_version === PRODUCT_MODEL_RULE_VERSION)
  const content = await selectAll<HeldRow>(() => admin.from(TABLE_PRODUCT_MENTIONS).select(HELD_COLUMNS)
    .eq('client_id', clientId).eq('catalogue_version', catalogue.version).eq('source', 'content').order('id'))
  const comments = await selectAll<HeldRow>(() => admin.from(TABLE_PRODUCT_MENTIONS).select(HELD_COLUMNS)
    .eq('client_id', clientId).eq('catalogue_version', catalogue.version).eq('source', 'comment').in('comment_month', open).order('id'))
  const tagRows = await selectAll<HeldRow>(() => admin.from(TABLE_PRODUCT_MENTIONS).select(HELD_COLUMNS).eq('client_id', clientId).eq('method', 'tag').order('id'))
  const tags = standingTags(await selectAll<ProductTagRow>(() => admin.from(TABLE_PRODUCT_TAGS).select(PRODUCT_TAG_COLUMNS).eq('client_id', clientId).order('id')))
  const tagMonth = new Map(tagRows.filter((r) => r.tag_id && r.comment_month).map((r) => [r.tag_id!, r.comment_month!]))
  const standing = standingPlacements({
    rows: [...content, ...comments].filter(current), tags, tagMonths: tagMonth,
    active: { groups: new Set(catalogue.groups.map((g) => g.id)), products: new Set(catalogue.products.map((p) => p.id)) },
  })
  const { data: tracking } = await admin.from('tracking_configs').select('competitor_keywords').eq('client_id', clientId).maybeSingle()
  const rivalFound = (await readRivalFound(admin, clientId, (tracking as { competitor_keywords: string[] | null } | null)?.competitor_keywords ?? null)).videos
  const termsByGroup = categorySearchTerms(compiled, await readSearchTerms(admin, clientId))
  const allTerms = [...new Set([...termsByGroup.values()].flat())]
  const searchFinds = categorySearchFinds(termsByGroup, allTerms.length ? await readSearchFound(admin, clientId, allTerms) : new Map())
  const written: string[] = []
  for (const m of open) {
    const market = await readMonthVideos(admin, clientId, m, { n: 0 })
    if (!market) continue
    const rows = productReadingRows({ clientId, compiled, markets: new Map([[m, market]]), rivalFound, searchFinds, standing })
    const stored = await storedProductRows(admin, clientId, [m], isMissingProductsSchema)
    if (stored == null) continue
    const closed = await selectAll<{ month: string; audience: string }>(() => admin.from('month_denominators').select('month, audience')
      .eq('client_id', clientId).eq('month', m).eq('status', 'frozen').order('audience'))
    await writeProductRows(admin, clientId, mergeProductRows({ months: [m], fresh: rows, stored, now, runId: null, closedAudienceMonths: closed.map(denominatorKey) }))
    written.push(m)
  }
  return written
}
