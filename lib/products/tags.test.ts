import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID } from '../config'
import { fakeAdmin } from '../test/s3-run-fake-admin'
import { FIXTURE_CATALOGUE, G, P } from '../test/products-fixtures'
import { PRODUCT_MODEL_RULE_VERSION } from './classify'
import { parseTagValue, PRODUCT_TAG_COPY, PRODUCT_TAG_VERSION, resolveTag, sameTag, tagMonths, tagOptions, tagValue, writeProductTag } from './tags'

const V = '00000000-0000-4000-8000-0000000000a1'
const C = '00000000-0000-4000-8000-0000000000c1'
const C_AUG = '00000000-0000-4000-8000-0000000000c2'
const OTHER = '00000000-0000-4000-8000-0000000000ff'
const NOW = '2026-10-13T10:00:00.000Z'
const actor = { kind: 'user' as const, user_id: '00000000-0000-4000-8000-0000000000ee', label: 'owner@ossur.test · tagged a product', at: NOW }
const t = <T extends object>(rows: T[]) => rows.map((r) => ({ client_id: OSSUR_CLIENT_ID, ...r }))

describe('the Tag control\'s options and values', () => {
  it('offers a category\'s products, then one of yours not which, the category in general, then none', () => {
    const opts = tagOptions(FIXTURE_CATALOGUE, G('Liners'))
    expect(opts.map((o) => o.label)).toEqual(['Iceross Seal-In X5', 'Iceross Comfort', 'One of your liners, not sure which', 'Liners in general', 'Not about your products'])
    expect(tagOptions(FIXTURE_CATALOGUE).length).toBe(FIXTURE_CATALOGUE.products.length + 2 * FIXTURE_CATALOGUE.groups.length + 1)
    expect(opts.map((o) => o.label).join(' ')).not.toMatch(/[—–]/)
  })

  it('posts a value that reads back to the same choice, and nothing else reads', () => {
    for (const o of tagOptions(FIXTURE_CATALOGUE)) expect(parseTagValue(o.value)).toEqual(o.choice)
    for (const bad of ['', 'named:', 'named:x', 'maybe:' + G('Feet'), null, 7]) expect(parseTagValue(bad)).toBeNull()
    expect(tagValue({ placement: 'none' })).toBe('none')
  })

  it('resolves a choice against the active catalogue: a product carries its category; a stale id is refused', () => {
    expect(resolveTag({ placement: 'named', productId: P('Rheo Knee') }, FIXTURE_CATALOGUE)).toEqual({ ok: true, placement: 'named', productId: P('Rheo Knee'), groupId: G('Knees') })
    expect(resolveTag({ placement: 'unbranded', groupId: G('Feet') }, FIXTURE_CATALOGUE)).toEqual({ ok: true, placement: 'unbranded', productId: null, groupId: G('Feet') })
    expect(resolveTag({ placement: 'none' }, FIXTURE_CATALOGUE)).toEqual({ ok: true, placement: 'none', productId: null, groupId: null })
    expect(resolveTag({ placement: 'named', productId: OTHER }, FIXTURE_CATALOGUE)).toEqual({ ok: false, why: 'unknown_target' })
    expect(sameTag(undefined, { placement: 'none', productId: null, groupId: null })).toBe(false)
  })

  it('moves the comment\'s own month while it fills, and every open month for a video', () => {
    expect(tagMonths('2026-10-01', NOW)).toEqual(['2026-10-01'])
    expect(tagMonths('2026-09-01', NOW)).toEqual(['2026-09-01'])
    expect(tagMonths('2026-08-01', NOW)).toEqual([])
    expect(tagMonths(null, NOW)).toEqual(['2026-09-01', '2026-10-01'])
  })

  it('says everything in client words, with no digit and no dash', () => {
    for (const s of Object.values(PRODUCT_TAG_COPY)) {
      expect(s).not.toMatch(/\d|—|–/)
      expect(s).not.toMatch(/\b(run|pipeline|model|placement)\b/i)
    }
  })
})

/** October's rows as the last run left them: Liners, "in general", one video. */
const lastRun = (version: string, kAny = 1) => t([{
  month: '2026-10-01', audience: 'industry-other', object_kind: 'group', object_id: G('Liners'), group_id: G('Liners'), product_id: null,
  k_named: 0, k_unclear: 0, k_unbranded: kAny, k_any: kAny, k_organic: kAny, comments: kAny, n: 1, n_organic: 1,
  status: 'filling', origin: 'live', read_at: '2026-10-11T07:00:00Z', run_id: 'run-1', rule_version: PRODUCT_MODEL_RULE_VERSION, catalogue_version: version, frozen_at: null,
}])

function admin(over: { schema?: boolean; refuseTag?: boolean; months?: object[]; mentions?: object[] } = {}) {
  let n = 0
  const schema = over.schema ?? true
  return fakeAdmin({
    tables: {
      videos: t([{ id: V, platform: 'tiktok', video_id: 'tt1' }]),
      comments: t([
        { id: C, platform: 'tiktok', video_id: 'tt1', comment_date: '2026-10-02T10:00:00Z', text: 'my liner sweats' },
        { id: C_AUG, platform: 'tiktok', video_id: 'tt1', comment_date: '2026-08-02T10:00:00Z', text: 'old one' },
      ]),
      ...(schema ? {
        product_tags: [], product_mentions: over.mentions ?? t([{
          video_id: V, source: 'comment', comment_id: C, comment_month: '2026-10-01', placement: 'unbranded', product_id: null, group_id: G('Liners'),
          method: 'rule', rule_version: 'product_rules_v1', catalogue_version: FIXTURE_CATALOGUE.version, tag_id: null,
        }]),
        month_product_readings: over.months ?? lastRun(FIXTURE_CATALOGUE.version),
      } : {}),
      config_changes: [], month_denominators: [], tracking_configs: t([{ competitor_keywords: [] }]), keyword_performance: [], video_provenance: [],
    },
    rpc: {
      ...(schema ? { product_catalogue: () => ({ data: FIXTURE_CATALOGUE }) } : {}),
      market_month_videos: () => [{ video_id: V, audience: 'industry-other', platform: 'tiktok', dated_comments: 2 }],
    },
    defaults: { product_tags: () => ({ id: `00000000-0000-4000-8000-00000000t00${++n}`.replace('t', 'a'), created_at: `2026-10-13T10:00:0${n}Z` }) },
    refuse: over.refuseTag ? { product_tags: () => ({ code: '23505', message: 'duplicate key value violates unique constraint "product_tags_one_successor"' }) } : undefined,
  })
}

describe('writeProductTag', () => {
  it('writes the tag, its placement row and one change, then re-reads the comment\'s open month from what is stored', async () => {
    const f = admin()
    const r = await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: C, choice: { placement: 'named', productId: P('Iceross Seal-In X5') }, actor, now: NOW })
    expect(r).toMatchObject({ outcome: 'written', logged: true, reread: ['2026-10-01'] })
    expect(f.tables.product_tags).toEqual([expect.objectContaining({
      video_id: V, comment_id: C, placement: 'named', product_id: P('Iceross Seal-In X5'), group_id: G('Liners'), supersedes: null,
      actor_kind: 'user', actor_user_id: actor.user_id, actor_label: actor.label,
    })])
    const tagRow = f.tables.product_mentions.find((m) => m.method === 'tag')!
    expect(tagRow).toMatchObject({ source: 'comment', comment_month: '2026-10-01', rule_version: PRODUCT_TAG_VERSION, tag_id: f.tables.product_tags[0].id, catalogue_version: FIXTURE_CATALOGUE.version })
    expect(f.tables.config_changes).toEqual([expect.objectContaining({ surface: 'products', field: 'tag', actor_kind: 'user', rows_affected: 1 })])
    // the tag is the comment's whole answer: Seal-In X5 named, not "liners in general"
    const liners = f.tables.month_product_readings.find((x) => x.object_id === G('Liners'))!
    expect(liners).toMatchObject({ month: '2026-10-01', k_named: 1, k_unbranded: 0, k_any: 1, comments: 1, status: 'filling', rule_version: PRODUCT_MODEL_RULE_VERSION })
    expect(f.tables.month_product_readings.find((x) => x.object_id === P('Iceross Seal-In X5'))).toMatchObject({ k_named: 1, comments: 1 })
  })

  it('a re-tag supersedes the last; the same answer again writes nothing', async () => {
    const f = admin()
    await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: C, choice: { placement: 'unclear', groupId: G('Liners') }, actor, now: NOW })
    expect((await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: C, choice: { placement: 'unclear', groupId: G('Liners') }, actor, now: NOW })).outcome).toBe('already')
    const r = await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: C, choice: { placement: 'none' }, actor, now: NOW })
    expect(r.outcome).toBe('written')
    expect(f.tables.product_tags.map((x) => [x.placement, x.supersedes])).toEqual([['unclear', null], ['none', f.tables.product_tags[0].id]])
    expect(f.tables.month_product_readings.find((x) => x.object_id === G('Liners'))).toMatchObject({ k_any: 0, comments: 0 })
  })

  it('a tag in a closed month is stored, moves nothing a page reads, and says so', async () => {
    const f = admin()
    const before = structuredClone(f.tables.month_product_readings)
    const r = await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: C_AUG, choice: { placement: 'unbranded', groupId: G('Feet') }, actor, now: NOW })
    expect(r).toMatchObject({ outcome: 'written_closed', reread: [] })
    expect(f.tables.product_tags).toHaveLength(1)
    expect(f.tables.month_product_readings).toEqual(before)
    expect(PRODUCT_TAG_COPY.closedMonth).toBe("Tagged and kept. That comment's month is closed, so its counts stay as they were.")
  })

  it('after a catalogue edit, before the next run, a tag re-reads nothing: the open months keep their counts', async () => {
    // The last run wrote October under the OLD catalogue: two liner videos.
    const OLD = 'pc1_0000000000000000'
    const old = (comment: string) => ({ video_id: V, source: 'comment', comment_id: comment, comment_month: '2026-10-01', placement: 'unbranded', product_id: null, group_id: G('Liners'), method: 'rule', rule_version: 'product_rules_v1', catalogue_version: OLD, tag_id: null })
    const f = admin({ months: lastRun(OLD, 2), mentions: t([old(C), old('other')]) })
    const r = await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: C, choice: { placement: 'named', productId: P('Iceross Comfort') }, actor, now: NOW })
    expect(r).toMatchObject({ outcome: 'written', reread: [] })
    expect(f.tables.month_product_readings.find((x) => x.object_id === G('Liners'))).toMatchObject({ k_any: 2, catalogue_version: OLD })
  })

  it('reads placements only of this matcher\'s and this prompt\'s version, as the run does', async () => {
    const stale = { video_id: V, source: 'comment', comment_id: 'other', comment_month: '2026-10-01', placement: 'unbranded', product_id: null, group_id: G('Feet'), method: 'model', rule_version: 'product_rules_v1+product_classify_v0', catalogue_version: FIXTURE_CATALOGUE.version, tag_id: null, model: 'gpt-4.1-mini', prompt_version: 'product_classify_v0' }
    const f = admin({ mentions: t([stale]) })
    await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: C, choice: { placement: 'none' }, actor, now: NOW })
    expect(f.tables.month_product_readings.find((x) => x.object_id === G('Feet'))).toMatchObject({ k_any: 0 })
  })

  it('a retry that answers "already" makes sure the tag\'s placement row is there', async () => {
    const f = admin()
    await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: C, choice: { placement: 'none' }, actor, now: NOW })
    f.tables.product_mentions = f.tables.product_mentions.filter((m) => m.method !== 'tag')
    const r = await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: C, choice: { placement: 'none' }, actor, now: NOW })
    expect(r.outcome).toBe('already')
    expect(f.tables.product_mentions.filter((m) => m.method === 'tag')).toEqual([expect.objectContaining({ tag_id: f.tables.product_tags[0].id, catalogue_version: FIXTURE_CATALOGUE.version })])
  })

  it('refuses a comment that is not this tenant\'s or not on the video, a stale target, and says when the table is not there', async () => {
    const f = admin()
    expect((await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: OTHER, choice: { placement: 'none' }, actor })).outcome).toBe('unknown_text')
    expect((await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: OTHER, commentId: null, choice: { placement: 'none' }, actor })).outcome).toBe('unknown_text')
    expect((await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: C, choice: { placement: 'named', productId: OTHER }, actor })).outcome).toBe('unknown_target')
    expect(f.tables.product_tags).toEqual([])
    expect((await writeProductTag(admin({ schema: false }).client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: C, choice: { placement: 'none' }, actor })).outcome).toBe('not_ready')
  })

  it('two people at once: the second insert breaks the chain\'s unique index and says it changed', async () => {
    const f = admin({ refuseTag: true })
    const r = await writeProductTag(f.client, { clientId: OSSUR_CLIENT_ID, videoId: V, commentId: C, choice: { placement: 'none' }, actor, now: NOW })
    expect(r.outcome).toBe('changed')
    expect(f.tables.product_mentions.some((m) => m.method === 'tag')).toBe(false)
    expect(f.tables.config_changes).toEqual([])
  })
})
