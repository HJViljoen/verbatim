import { createAdminClient } from '../lib/supabase-admin'
import { parseSubreddits, setSubredditStatuses } from '../lib/gather/subreddits'
import type { SubredditEntry } from '../lib/gather/types'

// Sealand's tracking config for the 2026-09 iteration pass. Keywords, subreddits
// and competitor handles have never been editable in the app (the settings UI
// covers competitor_names / report_period / report_day only), so an operator
// change is a script, and a script beats a hand-written UPDATE: it prints the
// diff, it is re-runnable, and the reasoning for every value is next to it.
//
//   node --env-file=.env.local --import tsx scripts/sealand-config-2026-09.ts [--apply]
//
// Dry by default. After --apply, re-stamp the stored corpus's entity tags:
//   node --env-file=.env.local --import tsx scripts/run-tagging.ts --write --client <sealand>
// (competitor_names changed, so Patagonia / Topo Designs / Poler videos must
// fall back to the category bucket rather than keep a competitor name nothing
// tracks any more.)

import { SEALAND_CLIENT_ID as SEALAND } from '../lib/config'

/**
 * Competitor accounts, resolved live 2026-09-09 and verified before being
 * written — a wrong handle here credits another brand's posts to a tracked
 * competitor, which is worse than tracking nothing.
 *
 *   Cotopaxi  IG @cotopaxi (verified badge, bio → cotopaxi.com) · TT
 *             @cotopaxiofficial · YT UCjGWYNy7xrGOJ72AeMBb-hA — all three
 *             taken from cotopaxi.com's own footer. NOTE: TikTok @cotopaxi is
 *             a private individual named Nelson, which is exactly the mistake
 *             this verification exists to prevent.
 *   Freitag   IG/TT/YT all @freitaglab, from freitag.ch's own footer; the IG
 *             account is verified and its bio links back to freitag.ch. The
 *             plain @freitag handles belong to other people — "Freitag" is
 *             German for Friday, and instagram.com/freitag is a newspaper.
 *   Rareform  IG @rareform (verified, 120k) and TT @rareform, both from
 *             rareform.com's footer. NO YouTube: their site links none, and
 *             the youtube.com/@rareform channel has 1 subscriber and cannot be
 *             confirmed as theirs. A platform we cannot verify is left out.
 */
const COMPETITOR_HANDLES: Record<string, Record<string, string>> = {
  Cotopaxi: {
    instagram: 'cotopaxi',
    tiktok: 'cotopaxiofficial',
    youtube: 'UCjGWYNy7xrGOJ72AeMBb-hA',
  },
  Freitag: {
    instagram: 'freitaglab',
    tiktok: 'freitaglab',
    youtube: 'UCHyhAHfoZOUw0zRCn1JSAMg',
  },
  Rareform: {
    instagram: 'rareform',
    tiktok: 'rareform',
  },
}

/** Communities this pass adds, with the status each has earned. `candidate`
 *  means the probe decides on the next run; `active` is for communities whose
 *  on-topic-ness is not in question. */
const SUBREDDIT_CHANGES: { name: string; status: SubredditEntry['status']; why: string }[] = [
  { name: 'onebag', status: 'active', why: 'the bag-choice community — squarely on topic, no probe needed' },
  { name: 'southafrica', status: 'candidate', why: "Sealand's home market; the probe decides whether bags come up" },
  { name: 'capetown', status: 'candidate', why: 'the city Sealand is from; same question, smaller room' },
]

const CONFIG = {
  // The brand's own name and the tag people actually use. "sealandgear" as a
  // bare word is dropped: it collides with the hashtag and adds a search.
  brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
  // Three competitors, each an upcycled/recycled-material bag brand — the set
  // Sealand is actually compared to. Patagonia, Poler and Topo Designs come
  // off: they are outdoor brands, not upcycling ones, and every competitor
  // tracked costs a search per platform per run.
  competitor_names: ['Cotopaxi', 'Freitag', 'Rareform'],
  // Operator-curated rather than derived: a bare brand name searches a
  // homonym ("Freitag" = Friday, "Cotopaxi" = a volcano and a province of
  // Ecuador, and the live search proved it — most #cotopaxi posts are
  // Ecuadorian real estate and travel).
  competitor_keywords: ['cotopaxi backpack', 'freitag bag', 'rareform bag'],
  // What the category calls itself. Material-first ('sailcloth', 'recycled
  // sailcloth') because that is Sealand's actual differentiator and the words
  // its buyers use.
  industry_keywords: [
    'upcycled bag', 'recycled bag', 'sailcloth bag', 'recycled sailcloth',
    'upcycled backpack', 'sustainable backpack', 'eco backpack',
  ],
  // Was 50/50. The gather is windowed at the source on every platform now, so
  // a higher ceiling buys coverage of the period rather than depth into old
  // content.
  max_videos: 100,
  comment_depth: 100,
  competitor_handles: COMPETITOR_HANDLES,
} as const

interface ConfigRow {
  brand_keywords: string[] | null
  competitor_names: string[] | null
  competitor_keywords: string[] | null
  industry_keywords: string[] | null
  platforms: string[] | null
  max_videos: number | null
  comment_depth: number | null
  report_period: string | null
  subreddits: unknown
  competitor_handles: unknown
}

const list = (xs: readonly string[] | null | undefined) => (xs ?? []).join(', ') || '(none)'

function diffLine(label: string, before: unknown, after: unknown): string | null {
  const b = JSON.stringify(before)
  const a = JSON.stringify(after)
  if (b === a) return null
  const show = (v: unknown) => (Array.isArray(v) ? list(v as string[]) : JSON.stringify(v))
  return `  ${label}\n    − ${show(before)}\n    + ${show(after)}`
}

async function main() {
  const apply = process.argv.includes('--apply')
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tracking_configs')
    .select('brand_keywords, competitor_names, competitor_keywords, industry_keywords, platforms, max_videos, comment_depth, report_period, subreddits, competitor_handles')
    .eq('client_id', SEALAND)
    .maybeSingle()
  if (error) throw new Error(`read config: ${error.message}`)
  if (!data) throw new Error('no tracking_configs row for Sealand')
  const before = data as ConfigRow

  const today = new Date().toISOString().slice(0, 10)
  const subreddits = setSubredditStatuses(parseSubreddits(before.subreddits), SUBREDDIT_CHANGES, today)
  const update = { ...CONFIG, subreddits }

  console.log(`Sealand tracking config — ${apply ? 'APPLY' : 'dry run'}\n`)
  const lines = [
    diffLine('brand_keywords', before.brand_keywords, update.brand_keywords),
    diffLine('competitor_names', before.competitor_names, update.competitor_names),
    diffLine('competitor_keywords', before.competitor_keywords, update.competitor_keywords),
    diffLine('industry_keywords', before.industry_keywords, update.industry_keywords),
    diffLine('max_videos', before.max_videos, update.max_videos),
    diffLine('comment_depth', before.comment_depth, update.comment_depth),
    diffLine('competitor_handles', before.competitor_handles, update.competitor_handles),
  ].filter(Boolean)
  console.log(lines.length ? lines.join('\n') : '  (no field changes)')

  console.log('\n  subreddits')
  for (const s of subreddits) {
    const was = parseSubreddits(before.subreddits).find((e) => e.name === s.name)
    const change = !was ? 'ADDED' : was.status !== s.status ? `${was.status} → ${s.status}` : ''
    const why = SUBREDDIT_CHANGES.find((c) => c.name === s.name)?.why
    console.log(`    ${s.status.padEnd(9)} r/${s.name}${change ? `  [${change}]` : ''}${change && why ? ` — ${why}` : ''}`)
  }
  console.log(`\n  unchanged: platforms ${list(before.platforms)} · report_period '${before.report_period}' (no schedule; the next manual run passes period:'monthly')`)

  if (!apply) {
    console.log('\n(dry run — nothing written. Re-run with --apply.)')
    return
  }

  const { error: upErr } = await admin.from('tracking_configs').update(update).eq('client_id', SEALAND)
  if (upErr) throw new Error(`write config: ${upErr.message}`)

  const { data: after, error: reErr } = await admin
    .from('tracking_configs')
    .select('brand_keywords, competitor_names, competitor_keywords, industry_keywords, max_videos, comment_depth, competitor_handles, subreddits')
    .eq('client_id', SEALAND)
    .maybeSingle()
  if (reErr) throw new Error(`re-read config: ${reErr.message}`)
  console.log('\nwritten. Re-read:')
  console.log(JSON.stringify(after, null, 2))
  console.log('\nNext: node --env-file=.env.local --import tsx scripts/run-tagging.ts --write --client ' + SEALAND)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
