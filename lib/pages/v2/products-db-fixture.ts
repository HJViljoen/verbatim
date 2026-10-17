import { fakeDb, type FakeDb } from '../../test/fake-db'
import { OSSUR_CLIENT_ID } from '../../config'
import { PRODUCT_RULE_VERSION } from '../../products/rules'
import type { StandingText } from '../../products/match'
import { judgeVersionFor } from '../../subjects/types'
import { OSSUR_CATALOGUE, OSSUR_STANDING, ossurProductRows, SEP_MARKET, PRODUCT_IDS } from './products-fixture'

// YOUR PRODUCTS' DATABASE, OFFLINE (17 Oct, the level pages): a table-driven
// stand-in (lib/test/fake-db.ts) holding Össur's fixture catalogue, its four
// months of product rows (June to September, September the reading month),
// September's market and every placement on it, so a page load runs end to
// end with no network. The statements harness counts what each page reads
// (`products-statements.test.ts`), and the isolation tests hand it another
// workspace's rows to prove no page names them.
//
// `product_catalogue` answers one jsonb, which the stand-in's rpc (rows only)
// cannot: `productsDb` wraps the client so that one function answers the
// catalogue itself, recorded like any other call.

export const PRODUCTS_DB_CLIENT = OSSUR_CLIENT_ID
export const FOREIGN_CLIENT = '00000000-0000-4000-8000-0000000000cc'
const RUN = '00000000-0000-4000-8000-0000000000bb'

/** Three comments in September naming the Iceross Seal-In X, on two of its
 *  videos (the fixture's own placements name it by the videos' content
 *  alone), so its page has comments to show. */
function sealInXComments(): [string, StandingText][] {
  const videos = [...OSSUR_STANDING.values()].filter((t) => t.commentId == null && t.placements.some((p) => p.productId === PRODUCT_IDS.sealInX())).map((t) => t.videoId).filter((v) => v.includes('2026-09'))
  return [0, 0, 1].map((at, i) => {
    const commentId = `c-sealinx-${i}`
    return [`c:${commentId}`, { videoId: videos[at], commentId, month: '2026-09-01', placements: [{ placement: 'named', groupId: PRODUCT_IDS.liners(), productId: PRODUCT_IDS.sealInX(), method: 'rule' }] }]
  })
}

/** Every placement the database holds: the fixture's, and the comments
 *  naming the Seal-In X. */
export const DB_STANDING: ReadonlyMap<string, StandingText> = new Map([...OSSUR_STANDING, ...sealInXComments()])

/** One mention row per standing placement, as the products step stores it. */
function mentionRows() {
  const rows: Record<string, unknown>[] = []
  let i = 0
  for (const [key, t] of DB_STANDING) {
    for (const p of t.placements) {
      rows.push({
        id: `m-${String(++i).padStart(6, '0')}`, client_id: PRODUCTS_DB_CLIENT, video_id: t.videoId,
        source: key.startsWith('v:') ? 'content' : 'comment', comment_id: t.commentId, comment_month: t.month,
        placement: p.placement, product_id: p.productId, group_id: p.groupId, method: 'rule',
        rule_version: PRODUCT_RULE_VERSION, catalogue_version: OSSUR_CATALOGUE.version, tag_id: null,
      })
    }
  }
  return rows
}

/** The texts every placement sits on: a comment row for each placed comment,
 *  a video row for every video a placement sits on. */
function commentAndVideoRows() {
  const comments: Record<string, unknown>[] = []
  const videos = new Map<string, Record<string, unknown>>()
  const platformOf = new Map(SEP_MARKET.map((v) => [v.id, v.platform]))
  const ownedOf = new Map(SEP_MARKET.map((v) => [v.id, v.owned]))
  for (const t of DB_STANDING.values()) {
    const platform = platformOf.get(t.videoId) ?? 'tiktok'
    if (!videos.has(t.videoId)) {
      videos.set(t.videoId, {
        id: t.videoId, client_id: PRODUCTS_DB_CLIENT, platform, video_id: `p-${t.videoId}`, video_url: `https://www.tiktok.com/@a/video/${t.videoId}`,
        account_name: ownedOf.get(t.videoId) ? 'ossur' : 'stepbystep.amp', caption: `A video about ${t.videoId}`, comments_count: 40,
        upload_date: '2026-09-03', source: ownedOf.get(t.videoId) ? 'owned' : 'discovered', is_client: false, is_competitor: false, competitor_name: null,
      })
    }
    if (t.commentId) {
      comments.push({
        id: t.commentId, client_id: PRODUCTS_DB_CLIENT, text: 'My prosthetist put me in the Össur gel liner and the sweating is so much better now.',
        comment_date: `${(t.month ?? '2026-09-01').slice(0, 7)}-18T10:00:00.000Z`, platform, video_id: `p-${t.videoId}`, comment_id: `pc-${t.commentId}`, author: 'viewer',
      })
    }
  }
  return { comments, videos: [...videos.values()] }
}

/** The tables, Össur's, plus one row of another workspace's in each table a
 *  page reads by id, which no page of Össur's may name. */
export function productsTables() {
  const { comments, videos } = commentAndVideoRows()
  const foreignVideo = { id: 'v-foreign-1', client_id: FOREIGN_CLIENT, platform: 'tiktok', video_id: 'p-foreign', video_url: 'https://x', account_name: 'Other workspace creator', caption: 'Other workspace video', comments_count: 5, upload_date: '2026-09-03', source: 'discovered', is_client: false, is_competitor: false, competitor_name: null }
  const foreignComment = { id: 'c-foreign-1', client_id: FOREIGN_CLIENT, text: 'Other workspace comment about a liner.', comment_date: '2026-09-18T10:00:00.000Z', platform: 'tiktok', video_id: 'p-foreign', comment_id: 'pc-foreign', author: 'x' }
  return {
    clients: [{ id: PRODUCTS_DB_CLIENT, company_name: 'Össur' }],
    pipeline_runs: [{
      id: RUN, client_id: PRODUCTS_DB_CLIENT, status: 'completed', started_at: '2026-10-12T04:00:00.000Z', completed_at: '2026-10-12T06:00:00.000Z',
      errors: [], window_start: '2026-10-05T00:00:00.000Z', window_end: '2026-10-12T00:00:00.000Z', options: {},
    }],
    month_denominators: ['2026-08-01', '2026-09-01', '2026-10-01'].map((month) => ({ client_id: PRODUCTS_DB_CLIENT, month, audience: 'industry-other', videos: 300, comments: 4000, platform_mix: { tiktok: 200, instagram: 100 }, status: 'filling', run_id: RUN, read_at: `${month.slice(0, 7)}-28T00:00:00.000Z` })),
    month_product_readings: [
      ...ossurProductRows().map((r) => ({ ...r, client_id: PRODUCTS_DB_CLIENT })),
      // Another workspace's month row, under one of Össur's own category ids,
      // in an audience Össur's rows do not hold: read without the client
      // filter, it would pool into the split (`marketProductMonth` keeps one
      // row an audience, so a shared audience would hide it).
      { client_id: FOREIGN_CLIENT, month: '2026-09-01', audience: 'competitor:Other workspace', object_kind: 'group', object_id: PRODUCT_IDS.liners(), group_id: PRODUCT_IDS.liners(), product_id: null, k_named: 99, k_unclear: 99, k_unbranded: 99, k_any: 297, comments: 999, n: 999, catalogue_version: OSSUR_CATALOGUE.version, status: 'filling' },
    ],
    product_mentions: [
      ...mentionRows(),
      { id: 'm-foreign-1', client_id: FOREIGN_CLIENT, video_id: 'v-foreign-1', source: 'comment', comment_id: 'c-foreign-1', comment_month: '2026-09-01', placement: 'named', product_id: PRODUCT_IDS.sealInX(), group_id: PRODUCT_IDS.liners(), method: 'rule', rule_version: PRODUCT_RULE_VERSION, catalogue_version: OSSUR_CATALOGUE.version, tag_id: null },
      // Another workspace's mention naming the Seal-In X on one of Össur's
      // own September videos, by its own comment: read without the client
      // filter, it would add a comment naming it to that video's count.
      { id: 'm-foreign-2', client_id: FOREIGN_CLIENT, video_id: 'v-2026-09-0', source: 'comment', comment_id: 'c-foreign-2', comment_month: '2026-09-01', placement: 'named', product_id: PRODUCT_IDS.sealInX(), group_id: PRODUCT_IDS.liners(), method: 'rule', rule_version: PRODUCT_RULE_VERSION, catalogue_version: OSSUR_CATALOGUE.version, tag_id: null },
    ],
    // Another workspace's tag, moving one of Össur's own comments naming the
    // Seal-In X to the category in general: read without the client filter,
    // it would take that comment off the video's count.
    product_tags: [{ id: 't-foreign-1', client_id: FOREIGN_CLIENT, video_id: 'v-2026-09-0', comment_id: 'c-sealinx-0', placement: 'unbranded', product_id: null, group_id: PRODUCT_IDS.liners(), supersedes: null, actor_kind: 'user', actor_user_id: null, actor_label: 'other workspace', created_at: '2026-10-01T00:00:00.000Z' }],
    subjects: [{
      id: 's-fit-comfort', client_id: PRODUCTS_DB_CLIENT, name: 'Fit & comfort', description: 'Fit.', origin: 'named', source_ref: null, named_at: '2026-09-01T00:00:00.000Z', status: 'active',
      superseded_by: null, embedded_at: null, embed_input_version: null, calibrated_at: '2026-10-01T00:00:00.000Z', calibration_precision: 0.9, calibration_n: 40, calibration_judge_version: judgeVersionFor(PRODUCTS_DB_CLIENT),
    }],
    comments: [...comments, foreignComment],
    videos: [...videos, foreignVideo],
    comment_translations: [],
    competitors: [],
    tracking_configs: [{ client_id: PRODUCTS_DB_CLIENT, competitor_names: [], own_handles: {} }],
    consumer_profiles: [{ client_id: PRODUCTS_DB_CLIENT, run_id: RUN, run_date: '2026-10-12', personas: [{ key: 'new', name: 'New amputees, first year', insightIds: ['ins-1'] }, { key: 'long', name: 'Long-time users upgrading', insightIds: ['ins-2'] }] }],
    insight_evidence: [],
    change_log: [],
    config_changes: [],
  }
}

/** The functions a page calls, as Össur's database would answer them. */
export function productsRpcs() {
  return {
    product_month_videos: () => SEP_MARKET.map((v) => ({ video_id: v.id, audience: v.audience, platform: v.platform, dated_comments: 6, owned: v.owned })),
    market_month_videos: () => SEP_MARKET.filter((v) => !v.owned).map((v) => ({ video_id: v.id, audience: v.audience, platform: v.platform, dated_comments: 6 })),
    lens_readings: (args: Record<string, unknown>) => {
      const ids = (args.p_video_ids as string[] | null) ?? []
      return [
        { audience: 'industry-other', object_kind: 'denominator', object_id: 'videos', k: ids.length },
        { audience: 'industry-other', object_kind: 'kind', object_id: 'praise', k: Math.ceil(ids.length / 2) },
        { audience: 'industry-other', object_kind: 'subject', object_id: 's-fit-comfort', k: Math.ceil(ids.length / 3) },
      ]
    },
    window_denominators: () => [],
  }
}

/** The stand-in, with `product_catalogue` answering the fixture's catalogue
 *  (or `catalogue` where a test names another answer). */
export function productsDb(opts: { tables?: Record<string, Record<string, unknown>[]>; catalogue?: unknown } = {}): FakeDb {
  const db = fakeDb((opts.tables ?? productsTables()) as never, productsRpcs() as never)
  const inner = db.client as { rpc: (fn: string, args: Record<string, unknown>) => unknown; from: (t: string) => unknown }
  const answer = opts.catalogue === undefined ? OSSUR_CATALOGUE : opts.catalogue
  const client = {
    from: (t: string) => inner.from(t),
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn !== 'product_catalogue') return inner.rpc(fn, args)
      db.calls.push({ table: fn, op: 'rpc', filters: Object.keys(args ?? {}) })
      const out = args?.p_client === PRODUCTS_DB_CLIENT ? answer : null
      return Promise.resolve({ data: out, error: null })
    },
  }
  return { client, calls: db.calls }
}
