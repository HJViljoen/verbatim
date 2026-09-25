import { createAdminClient } from '../lib/supabase-admin'
import { diffConfigRows, scriptActor, updateWithActor } from '../lib/config-log'
import { buildPlatformTasks, capSearchPlan, searchLabel } from '../lib/gather/gather'
import { parseSubreddits } from '../lib/gather/subreddits'
import { GATHER_MAX_SEARCHES_PER_RUN } from '../lib/config'
import type { GatherConfig, Platform } from '../lib/gather/types'
import { SEALAND_CLIENT_ID as SEALAND } from '../lib/config'

// Sealand's tracking config, 2026-09-17 — the trial pass that widens the rival
// set beyond upcycled-material bag brands.
//
//   node --env-file=.env.local --import tsx scripts/sealand-config-2026-09-17.ts [--apply]
//
// Successor to scripts/sealand-config-2026-09.ts (2026-09-09), same shape and
// the same reasons: keywords, exclusions and competitor handles have never been
// editable in the app, so an operator change is a script — it prints the diff,
// it is re-runnable, and the reasoning for every value sits next to it. Every
// field it writes is logged by the tracking_configs trigger, one row per column
// that moves; this script only supplies the actor, in the same UPDATE.
//
// It does NOT touch subreddits, report_period, report_day, platforms or
// max_videos. Those are left exactly as the scheduler will find them on Sunday.
//
// Dry by default. After --apply, re-stamp the stored corpus's entity tags —
// run-tagging's --write is gone; judge to a plan, review it, then apply it:
//   node --env-file=.env.local --import tsx scripts/run-tagging.ts --client <sealand> --plan-out <plan.json>
//   node --env-file=.env.local --import tsx scripts/run-tagging.ts --client <sealand> --apply <plan.json> --project <ref>
// (competitor_names gained four entries, so stored videos that mention them are
// still filed under the category bucket until a re-tag moves them.)

/**
 * The four names this pass adds, and why each is a name rather than a keyword.
 *
 * NO RENAMES. `audience` in the monthly reading is the NAME
 * (`competitor:<competitor_name>`, AGENTS.md), and a frozen month cannot be
 * re-keyed — so renaming a rival splits its series permanently. The three
 * existing names keep their exact spelling.
 *
 *   The North Face          the aspirational incumbent every SA outdoor-bag
 *                           buyer compares against; global, huge, and the one
 *                           rival whose own accounts are certain to be active.
 *   Patagonia               came OFF this config on 2026-09-09 as "an outdoor
 *                           brand, not an upcycling one". It goes back on for a
 *                           different reason: it is the sustainability
 *                           benchmark Sealand's own buyers name. Its old
 *                           frozen months are still keyed `competitor:Patagonia`
 *                           and re-join the series on the same string.
 *   Freedom of Movement     Cape Town, direct local rival, same buyer.
 *   Old School              Cape Town, direct local rival, same buyer.
 */
const COMPETITOR_NAMES = [
  'Cotopaxi', 'Freitag', 'Rareform',
  'The North Face', 'Patagonia', 'Freedom of Movement', 'Old School',
] as const

/**
 * Competitor accounts, resolved live 2026-09-17 and verified before being
 * written — a wrong handle credits another brand's posts to a tracked
 * competitor, which is worse than tracking nothing. Verified the same way the
 * 2026-09-09 pass verified its three: the brand's OWN site is the authority,
 * and a platform that cannot be confirmed from it is LEFT OUT rather than
 * guessed.
 *
 * IG/TT are bare handles (no @); YT is the channel ID, because that is what
 * `fetchOwnProfile` passes to the Data API (lib/gather/owned.ts ytProfile).
 *
 * ONE HANDLE PER PLATFORM PER COMPETITOR. The column is
 * `Record<string, Record<string, string>>` everywhere that reads it
 * (lib/gather/owned.ts buildOwnedCensus / ownAccountNames, the census steps in
 * inngest/functions/pipeline.ts, lib/readiness/load.ts), and each one iterates
 * `Object.entries(handles)` expecting ONE string per platform key. So The North
 * Face's South African account cannot be carried beside the global one, and a
 * second competitor entry for it would split the brand's series for the sake of
 * a handle. The global account is what is tracked.
 *
 *   The North Face  IG @thenorthface and YT UCNfWDbERpf34FsSWIpqGD0Q, both off
 *             TNF's own sites (thenorthface.co.za and thenorthface.com.tr
 *             footers; the YT id read from `<meta itemprop="identifier">` on the
 *             channel both of them link, whose own link list points back to
 *             thenorthface.com). TT @thenorthface is the ONE handle here that
 *             was not read off a page at all: thenorthface.com and most TNF
 *             regional sites answer a non-browser fetch with 403, the two that
 *             do answer link IG/FB/YT/X and no TikTok at all, and tiktok.com
 *             serves a JS bot-check to every fetch — so it was SUPPLIED BY THE
 *             OWNER on 2026-09-17 and is written on his word. Worth a second
 *             look in a browser, because TNF runs REGIONAL TikTok accounts
 *             (@thenorthface.ca exists) and a wrong handle credits another
 *             account's posts to a tracked rival.
 *             SOUTH AFRICA: @thenorthfacesouthafrica is real and official
 *             (thenorthface.co.za's footer; verified account, bio "Official
 *             Page. Shop @ TNF Canal Walk, Sandton, V&A Waterfront…"), and it
 *             is NOT here: one handle per platform per competitor, and a second
 *             competitor entry would split the brand's series for the sake of a
 *             handle. The global account is what is tracked.
 *   Patagonia IG @patagonia and YT UCl3xZ-f3cQhOHvH6f-7-ssQ from patagonia.com's
 *             own footer, which links the channel BY UC id. TT @patagonia is
 *             one hop further out: patagonia.com's site was serving a waiting-
 *             room page throughout, so the footer was read from the Internet
 *             Archive capture of patagonia.com itself, and the TikTok comes
 *             from that footer's YouTube channel's own link list (which also
 *             carries patagonia.com and instagram.com/patagonia). Brand-
 *             controlled either way, but it is a two-hop read — re-confirm off
 *             the live footer when the site is back up.
 *   Freedom of Movement
 *             TT @fombrand straight off freedomofmovement.co.za's footer (also
 *             on /pages/about-us and /pages/contact). IG @fombrand is THE ONE
 *             HANDLE HERE NOT READ OFF THE BRAND'S OWN PAGE: their site links
 *             Facebook, X, TikTok and WhatsApp and no Instagram at all, and the
 *             account's bio link (linkin.bio/fombrand) renders client-side, so
 *             the loop back to their domain never closed. It is written anyway
 *             on identity rather than on a link: the account is VERIFIED, its
 *             display name is "Freedom Of Movement", its bio reads "Premium
 *             South African lifestyle brand… @fombrand_uk", its highlights name
 *             the brand's own lines (FOM Vellies, FOM Tekkie, FOM Leather), and
 *             the identical bare handle is what their own footer links on the
 *             three other platforms. Both failure modes the 2026-09-09 pass
 *             caught — a private individual on a bare handle, an unconfirmable
 *             channel — are ruled out by the badge and the name. NO YouTube:
 *             their site links none.
 *   Old School
 *             IG @oldschool_ltd and TT @oldschool_ltd, both out of
 *             oldschool.co.za's own footer social block (alongside
 *             facebook.com/oldschoolltd). Note the `_ltd`: the bare
 *             @oldschool handles are not theirs. NO YouTube: the footer has
 *             Instagram, TikTok and Facebook and nothing else.
 */
const COMPETITOR_HANDLES: Record<string, Record<string, string>> = {
  // unchanged, verified 2026-09-09 (scripts/sealand-config-2026-09.ts)
  Cotopaxi: { instagram: 'cotopaxi', tiktok: 'cotopaxiofficial', youtube: 'UCjGWYNy7xrGOJ72AeMBb-hA' },
  Freitag: { instagram: 'freitaglab', tiktok: 'freitaglab', youtube: 'UCHyhAHfoZOUw0zRCn1JSAMg' },
  Rareform: { instagram: 'rareform', tiktok: 'rareform' },
  // added 2026-09-17
  // tiktok handle supplied by the owner 2026-09-17 (site footers unreadable
  // behind bot wall)
  'The North Face': { instagram: 'thenorthface', tiktok: 'thenorthface', youtube: 'UCNfWDbERpf34FsSWIpqGD0Q' },
  Patagonia: { instagram: 'patagonia', tiktok: 'patagonia', youtube: 'UCl3xZ-f3cQhOHvH6f-7-ssQ' },
  'Freedom of Movement': { instagram: 'fombrand', tiktok: 'fombrand' },
  'Old School': { instagram: 'oldschool_ltd', tiktok: 'oldschool_ltd' },
}

const CONFIG = {
  // Unchanged. Listed so the diff says out loud that they were considered.
  brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
  competitor_names: [...COMPETITOR_NAMES],
  // Deliberately NOT bare brand names — the 2026-09-09 rule, and the reason
  // `cotopaxi backpack` is there rather than `cotopaxi`. Each new term names a
  // PRODUCT, so the search returns the company rather than the homonym:
  //   north face backpack   'the north face' alone returns the mountain face,
  //                         the film and half of outdoor TikTok.
  //   patagonia black hole  their single most-named product line, and the one
  //                         phrase that cannot be the region.
  //   fombrand              Freedom of Movement's own handle used as a search
  //                         term — the phrase "freedom of movement" is a legal
  //                         term and an activewear cliché, and is unusable.
  // Old School gets NOTHING: the phrase is two of the commonest words in a
  // caption, and no product qualifier makes it searchable. Handle-only.
  competitor_keywords: [
    'cotopaxi backpack', 'freitag bag', 'frtg', 'rareform bag',
    'north face backpack', 'patagonia black hole', 'fombrand',
  ],
  // Two additions, both phrases the client's own buyers use and neither already
  // covered in scoped form. The client's other words — upcycled, recycled,
  // sustainable, gear — are already here scoped to a product; the bare versions
  // are not added, because a bare category word costs a search per platform and
  // returns the internet.
  industry_keywords: [
    'eco backpack', 'handmade bag', 'recycled bag', 'recycled sailcloth',
    'sailcloth bag', 'sustainable backpack', 'sustainable fashion', 'travel gear',
    'upcycled backpack', 'upcycled bag',
    'made from waste', 'locally made south africa',
  ],
  // WHAT THIS COLUMN ACTUALLY DOES — read lib/gather/tagging.ts `excludedTag`
  // before adding to it. The deterministic gate strips a tag only when
  //   (a) the video already carries one (a client or competitor tag), AND
  //   (b) the ONLY configured term in its text is the bare name itself, AND
  //   (c) one of these terms appears in that text.
  // The bare name is struck out of the evidence set (`otherEvidence` skips the
  // term `bareName` returned), so a name does NOT vouch for itself — the gate
  // can fire. What neutralises it is any OTHER configured term: another rival's
  // name, a competitor keyword, or any of the twelve category terms. `travel
  // gear` and `sustainable fashion` are broad enough that a Patagonia travel
  // video often carries one, and then the exclusion never runs. That is by
  // design: the LLM half (relevance.ts + attribution.ts, which take these same
  // terms as sense HINTS) is what catches everything subtler.
  //
  // The list is GLOBAL, not per rival: `excludedByTerms` tests the text against
  // all of them whichever entity was tagged. So every term here has to be a
  // wrong sense for the whole tenant, and every term is a bare substring with
  // no word boundary — which is why short, collision-prone words are out.
  exclude_terms: [
    // Patagonia the region (Argentina/Chile), which is most of what the name
    // returns. NOT 'provisions' or 'sardines': Patagonia Provisions is the
    // company's own food line, so excluding it would strip real mentions.
    'argentina', 'chile', 'torres del paine',
    // Cotopaxi the volcano and the Ecuadorian province — the 2026-09-09 finding
    // that most #cotopaxi posts are Ecuadorian real estate and travel.
    'ecuador', 'volcano',
    // "Freedom of movement" the legal phrase. NOT bare 'visa' or 'border':
    // these match as substrings ('visage', 'borderline') and 'visa' is also a
    // payment network. The phrase's OTHER homonym — activewear copy, "freedom
    // of movement in these pants" — is not gateable by any word list and is
    // left to the attribution judge.
    'schengen', 'immigration', 'border control',
    // "Old School" the era/genre. One term, because the phrase is ordinary
    // English and a wider list ('music', 'cars') would collide as substrings
    // ('carson', 'scars') and strip real posts. This rival is the weakest of
    // the seven by precision and the report should be read with that in mind.
    'hip hop',
  ],
  // Freitag's German-Friday sense is deliberately NOT here. Both prompts
  // already name it ("'Freitag' is German for 'Friday'" — attribution.ts, and
  // the same case in relevance.ts), and the German words that would catch it
  // ('wochenende', 'endlich') would strip genuine German-language Freitag bag
  // posts, which typically carry no English category term and so have nothing
  // else vouching for them.
  competitor_handles: COMPETITOR_HANDLES,
} as const

interface ConfigRow {
  brand_keywords: string[] | null
  competitor_names: string[] | null
  competitor_keywords: string[] | null
  industry_keywords: string[] | null
  exclude_terms: string[] | null
  platforms: string[] | null
  max_videos: number | null
  comment_depth: number | null
  report_period: string | null
  report_day: string | null
  subreddits: unknown
  competitor_handles: unknown
}

const list = (xs: readonly string[] | null | undefined) => (xs ?? []).join(', ') || '(none)'

/** Key-sorted JSON, so an object that jsonb would call equal is equal here too.
 *  Postgres normalises jsonb key order and JavaScript does not: a plain
 *  `JSON.stringify` comparison prints `competitor_handles` as CHANGED on every
 *  run, because the stored row comes back in a different key order from the
 *  literal above. The change log's own diff already sorts (`diffConfigRows`),
 *  so without this the printed diff and the logged one disagree — and the
 *  printed one is what an operator reads before deciding to apply. */
function stable(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (typeof v === 'object') {
    return `{${Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, val]) => `${JSON.stringify(k)}:${stable(val)}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

function diffLine(label: string, before: unknown, after: unknown): string | null {
  if (stable(before) === stable(after)) return null
  const show = (v: unknown) => (Array.isArray(v) ? list(v as string[]) : stable(v))
  return `  ${label}\n    − ${show(before)}\n    + ${show(after)}`
}

/**
 * What Sunday's gather will actually plan, from the REAL planner.
 *
 * Every keyword is one search per platform, and Instagram is two (its actor
 * returns reels or feed posts per call, never both — `searchVariants`). Reddit
 * additionally harvests each ACTIVE community wholesale, but only while
 * REDDIT_DISCOVERY_ENABLED is set, which it is in production and is not in
 * .env.local — so the local number is the floor and this prints both.
 *
 * `capSearchPlan` trims PER PLATFORM at GATHER_MAX_SEARCHES_PER_RUN and shouts
 * about what it dropped; anything it drops is a search the tenant paid for the
 * expectation of and did not get, so it is printed here BEFORE the write.
 */
function printSearchPlan(row: ConfigRow, after: typeof CONFIG): void {
  const config: GatherConfig = {
    brand_keywords: [...after.brand_keywords],
    competitor_keywords: [...after.competitor_keywords],
    competitor_names: [...after.competitor_names],
    industry_keywords: [...after.industry_keywords],
    exclude_terms: [...after.exclude_terms],
    platforms: row.platforms ?? [],
    max_videos: row.max_videos ?? 0,
    comment_depth: row.comment_depth ?? 0,
    report_period: row.report_period ?? 'weekly',
    own_handles: {},
    subreddits: parseSubreddits(row.subreddits),
  }
  const platforms = (row.platforms ?? []) as Platform[]
  const keywords = new Set([...config.brand_keywords, ...config.competitor_keywords, ...config.industry_keywords])

  const tasks = platforms.flatMap((p) => buildPlatformTasks(config, p))
  const kept = capSearchPlan(tasks)
  const dropped = tasks.filter((t) => !kept.includes(t))

  console.log(`\n  search plan (${keywords.size} unique keywords × ${platforms.length} platforms)`)
  for (const p of platforms) {
    console.log(`    ${p.padEnd(10)} ${String(tasks.filter((t) => t.platform === p).length).padStart(3)}`)
  }
  console.log(`    ${'TOTAL'.padEnd(10)} ${String(tasks.length).padStart(3)}  against a cap of ${GATHER_MAX_SEARCHES_PER_RUN}`)
  console.log(dropped.length
    ? `    ! ${dropped.length} DROPPED: ${dropped.map((t) => `${t.platform}:${searchLabel(t)}`).join(', ')}`
    : '    nothing is dropped by the cap.')
  if (!process.env.REDDIT_DISCOVERY_ENABLED) {
    const active = config.subreddits.filter((s) => s.status === 'active').length
    console.log(
      `    ! REDDIT_DISCOVERY_ENABLED is not set HERE, so the ${active} active community harvest(s) are not in\n` +
      `      the count above. Production has it on, so the real plan is ${tasks.length + active} of ${GATHER_MAX_SEARCHES_PER_RUN}.`,
    )
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const admin = createAdminClient()
  const columns =
    'brand_keywords, competitor_names, competitor_keywords, industry_keywords, exclude_terms, ' +
    'platforms, max_videos, comment_depth, report_period, report_day, subreddits, competitor_handles'
  const { data, error } = await admin
    .from('tracking_configs').select(columns).eq('client_id', SEALAND).maybeSingle()
  if (error) throw new Error(`read config: ${error.message}`)
  if (!data) throw new Error('no tracking_configs row for Sealand')
  const before = data as unknown as ConfigRow

  const update = { ...CONFIG }

  console.log(`Sealand tracking config, 2026-09-17 — ${apply ? 'APPLY' : 'dry run'}\n`)
  const lines = [
    diffLine('brand_keywords', before.brand_keywords, update.brand_keywords),
    diffLine('competitor_names', before.competitor_names, update.competitor_names),
    diffLine('competitor_keywords', before.competitor_keywords, update.competitor_keywords),
    diffLine('industry_keywords', before.industry_keywords, update.industry_keywords),
    diffLine('exclude_terms', before.exclude_terms, update.exclude_terms),
    diffLine('competitor_handles', before.competitor_handles, update.competitor_handles),
  ].filter(Boolean)
  console.log(lines.length ? lines.join('\n') : '  (no field changes)')

  console.log(
    `\n  untouched: platforms ${list(before.platforms)} · max_videos ${before.max_videos} · ` +
    `comment_depth ${before.comment_depth} · ${before.report_period}/${before.report_day} · ` +
    `${parseSubreddits(before.subreddits).length} communities`,
  )

  printSearchPlan(before, CONFIG)

  const actor = scriptActor('scripts/sealand-config-2026-09-17.ts --apply')
  const willLog = diffConfigRows({
    clientId: SEALAND,
    before: before as unknown as Record<string, unknown>,
    after: update as unknown as Record<string, unknown>,
    actor,
  })
  console.log(`\n  change log: ${willLog.length} row(s) — ${willLog.map((r) => `${r.field} (${r.surface})`).join(', ') || 'none'}`)

  if (!apply) {
    console.log('\n(dry run — nothing written. Re-run with --apply.)')
    return
  }

  const { error: upErr, stamped } = await updateWithActor(
    (payload) => admin.from('tracking_configs').update(payload).eq('client_id', SEALAND),
    update as unknown as Record<string, unknown>,
    actor,
  )
  if (upErr) throw new Error(`write config: ${upErr.message}`)

  const { data: after, error: reErr } = await admin
    .from('tracking_configs').select(columns).eq('client_id', SEALAND).maybeSingle()
  if (reErr) throw new Error(`re-read config: ${reErr.message}`)
  const re = after as unknown as ConfigRow
  console.log('\nwritten. Re-read:')
  console.log(JSON.stringify({
    competitor_names: re.competitor_names,
    competitor_keywords: re.competitor_keywords,
    industry_keywords: re.industry_keywords,
    exclude_terms: re.exclude_terms,
    competitor_handles: re.competitor_handles,
  }, null, 2))
  // Say which of the two writes landed: `updateWithActor` retries UNSTAMPED if
  // `last_actor` is rejected, and an unconditional "the log recorded this"
  // would be false exactly when the log is missing the row it names.
  console.log(stamped
    ? 'change log: one row per column that moved, attributed to this command.'
    : 'change log: NOT attributed — tracking_configs.last_actor was rejected and the write was retried ' +
      'without it. The log names the database role, or has no row at all.')
  console.log('\nNext: node --env-file=.env.local --import tsx scripts/run-tagging.ts --client ' + SEALAND)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
