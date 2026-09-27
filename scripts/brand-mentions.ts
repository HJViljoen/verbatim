import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  barePattern, BRAND_RULE_VERSION, brandPattern, brandRulesFingerprint, brandRulesFor, type BrandRule,
} from '../lib/brands/aliases'
import {
  handCheckList, mentionKey, monthBrandCounts, ownPostMentions, planMentions, standInCandidates,
  type BrandCandidates, type Candidate, type HandCheckEntry, type MentionRow, type StandInComment, type StandInVideo,
} from '../lib/brands/mentions'
import { readRivalFound, withoutRivalSearches } from '../lib/brands/rival-searches'
import { SEALAND_CLIENT_ID } from '../lib/config'
import { normAccount, ownAccountNames } from '../lib/gather/owned'
import { assertProject, modeLine, parseScriptArgs, type ScriptArgs } from '../lib/ops/market-first-args'
import { isMissingObject, readMonthVideos, type Pages } from '../lib/provenance/load'
import { createAdminClient, selectAll } from '../lib/supabase-admin'

// Brand topics v1: every video a tracked brand or the client comes up in
// (market-first decision E, WP2.6; plan §4.0 "Scripts"; MF2 part B).
//
// For each brand in lib/brands/aliases.ts it asks brand_mention_candidates
// (MF2) for the window's matches of the brand's rule, and of its bare name
// where the rule guards it (the homonym test, lib/brands/mentions.ts), and
// plans one `content` row per video and one `comment` row per matching
// comment, method 'rule', rule version BRAND_RULE_VERSION. Heinrich runs it
// with --apply on Mon 5 Oct (after MF2, plan §3.7) and again after each run,
// and reads the hand-check list that morning: it covers all eight (your name
// and every tracked rival, a brand with no match included), and its results
// become lib/brands/precision.ts's production entries. Until a brand has one,
// the page prints it "not counted yet". No model call (the GPT confirm is
// Stage 3, decision L).
//
// READ-ONLY BY DEFAULT, and it never prompts (it runs through `!`).
//   --project <ref>      required; one of the two allow-listed refs, and the
//                        Supabase URL it was started with must be that ref's
//                        (the host check), or nothing is read.
//   --confirm            required to read PRODUCTION at all: it then times a
//                        one-row probe first and stops if it takes over 3 s
//                        (the read ration, plan §7.6).
//   --from / --to        the window, [from, to): comments dated in it, and the
//                        readable videos with a comment dated in it. Default:
//                        2026-08-01 to the first of next month (UTC).
//   --plan-out <file>    also write the planned rows and the month counts to
//                        a NEW local file (no excerpt).
//   --hand-check <file>  also write the hand-check list to a NEW local file:
//                        every match of the client's name outside its own
//                        posts, and --sample (default 30) matches per other
//                        brand, each with its excerpt. The excerpts live in
//                        this file only; the database never stores one.
//   --apply              write: insert the planned rows not already held for
//                        this rule version (read first, because PostgREST
//                        cannot target the unique index's coalesce; MF2
//                        seam). brand_mentions is append-only.
//   --apply --check      run every guard of --apply (MF2 present, the held
//                        rows read) and print what would be written; write
//                        nothing.
//   --max-reads <n>      stop before the n+1-th read (pages and RPC calls;
//                        default 45).
//   --stand-in           STAGING DRY RUN ONLY: MF2 is not on staging, so the
//                        candidates are computed from the videos and comments
//                        in JavaScript (lib/brands/mentions.ts
//                        standInCandidates), the ARE's twin. Refused on
//                        production and with --apply.
//
// THE READS (production, Sealand): the probe (1), tracking_configs (1),
// competitors (1), brand_mention_candidates once per brand and once more per
// guarded brand (13), the own-post identity (1, and 1 per 100 matched videos:
// 2 on staging's 145), market_month_videos per month (2 to 3), the rival
// searches and the videos they found (3 on staging: lib/brands/rival-searches.ts,
// the reads the page makes); with --apply, the held rows (1+). About 30.
//
// THE HEADLINE COUNT'S BASE (decision E, the research's F37, the 27 Sep
// ruling): a brand's count without the videos ANY of our rival searches found
// (current and retired, `keyword_performance`'s rival bucket), over one base
// for every brand in the month; the count in all beside it.
//
//   cd ~/Documents/code/verbatim-mf-run && … node --env-file=.env.local --import tsx scripts/brand-mentions.ts \
//     --project mkwjlckescdveosvrvaq --confirm [--from 2026-08-01] [--to 2026-11-01] \
//     [--plan-out <file>] [--hand-check <file>] [--apply [--check]]

const NAME = 'brand-mentions'
const PRODUCTION = 'mkwjlckescdveosvrvaq'
const STAGING = 'zfmxrrugaihxpubunleu'
const PROBE_MAX_MS = 3000
/** Ids per `in.(…)` read: a GET's URL carries them, so they stay well under
 *  the gateway's URL limit. */
const ID_CHUNK = 100

class Ration implements Pages {
  n = 0
  constructor(private readonly max: number) {}
  spend(k: number, what: string): void {
    this.n += k
    if (this.n > this.max) throw new Error(`${NAME}: the read ration (--max-reads ${this.max}) is spent at ${what}. Nothing written.`)
  }
}

const iso = (d: Date): string => d.toISOString().slice(0, 10)
function monthsIn(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
  while (iso(d) < to) {
    out.push(iso(d))
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}
function chunks<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}
function writeNew(path: string, body: string): void {
  if (existsSync(path)) throw new Error(`${NAME}: ${path} exists; name a new file`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

interface Tracking {
  competitor_names: string[] | null
  competitor_keywords: string[] | null
  competitor_handles: Record<string, Record<string, string>> | null
  own_handles: Record<string, string> | null
  brand_keywords: string[] | null
}
interface IdentityRow {
  id: string; platform: string; video_id: string; source: string | null; account_name: string | null
  is_client: boolean | null; is_competitor: boolean | null; competitor_name: string | null
}

async function probe(admin: SupabaseClient, args: ScriptArgs, ration: Ration): Promise<void> {
  const t0 = Date.now()
  ration.spend(1, 'the probe')
  const { error } = await admin.from('clients').select('id').eq('id', args.clientId).limit(1)
  const ms = Date.now() - t0
  if (error) throw new Error(`${NAME}: the probe failed (${error.message}). Back off 15 minutes. Nothing read further.`)
  console.log(`  probe: ${ms} ms`)
  if (ms > PROBE_MAX_MS) throw new Error(`${NAME}: the probe took ${ms} ms (over ${PROBE_MAX_MS}). Back off 15 minutes (plan §7.6). Nothing read further.`)
}

async function candidatesOf(admin: SupabaseClient, clientId: string, pattern: string, from: string, to: string, ration: Ration, what: string): Promise<Candidate[]> {
  ration.spend(1, what)
  const rows = await selectAll<Candidate>(() =>
    admin.rpc('brand_mention_candidates', { p_client: clientId, p_pattern: pattern, p_from: from, p_to: to })
      .order('video_id').order('source').order('field').order('comment_id'),
  )
  if (rows.length >= 1000) ration.spend(Math.ceil(rows.length / 1000) - 1, what)
  return rows.map((r) => ({ ...r, comment_month: r.comment_month ? String(r.comment_month).slice(0, 10) : null }))
}

/** The stand-in's rows: the window's readable videos and their comments. */
async function standInRows(admin: SupabaseClient, clientId: string, from: string, to: string, ration: Ration) {
  const videos = await selectAll<StandInVideo & { platform: string; video_id: string }>(() =>
    admin.from('videos').select('id, platform, video_id, account_name, caption, hashtags, transcript, transcript_en, ocr_text')
      .eq('client_id', clientId).eq('analyzed_lane', 'full').order('id'), 200)
  ration.spend(Math.max(1, Math.ceil(videos.length / 200)), 'the stand-in videos')
  const byKey = new Map(videos.map((v) => [`${v.platform}\u0000${v.video_id}`, v.id]))
  const raw = await selectAll<{ id: string; platform: string; video_id: string; text: string | null; comment_date: string }>(() =>
    admin.from('comments').select('id, platform, video_id, text, comment_date').eq('client_id', clientId)
      .gte('comment_date', from).lt('comment_date', to).order('id'))
  ration.spend(Math.max(1, Math.ceil(raw.length / 1000)), 'the stand-in comments')
  const comments: StandInComment[] = []
  for (const c of raw) {
    const videoId = byKey.get(`${c.platform}\u0000${c.video_id}`)
    if (videoId) comments.push({ id: c.id, videoId, text: c.text, comment_date: String(c.comment_date).slice(0, 10) })
  }
  const inWindow = new Set(comments.map((c) => c.videoId))
  return { videos: videos.filter((v) => inWindow.has(v.id)), comments }
}

/** Per brand, how many candidates each pattern returned and an md5 of their
 *  sorted keys: the parity check between the stand-in and MF2's function. */
function candidateDigests(perBrand: readonly BrandCandidates[]) {
  const digest = (cs: readonly Candidate[]) => {
    const keys = cs.map((c) => `${c.video_id}|${c.field ?? ''}|${c.comment_id ?? ''}`).sort()
    return {
      content: cs.filter((c) => c.source === 'content').length,
      comment: cs.filter((c) => c.source === 'comment').length,
      md5: createHash('md5').update(keys.join('\n')).digest('hex'),
    }
  }
  return Object.fromEntries(perBrand.map((b) => [b.rule.brand, { hits: digest(b.hits), bare: b.bare ? digest(b.bare) : null }]))
}

/** The list, one section per brand in `brands` (all eight, so the check
 *  covers every brand the page prints), a brand with no match saying so. */
function handCheckMarkdown(entries: readonly HandCheckEntry[], brands: readonly string[], header: string): string {
  const clean = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').trim()
  const lines = [header, '']
  for (const brand of brands) {
    const mine = entries.filter((e) => e.brand === brand)
    if (mine.length === 0) {
      lines.push(`## ${brand}`, '', 'No match in the window: nothing to read. It stays "not counted yet" (a precision needs a match).', '')
      continue
    }
    lines.push(`## ${brand}`, '', '| # | video | month | where | own post | excerpt | the brand? |', '|---|---|---|---|---|---|---|')
    mine.forEach((e, i) => lines.push(
      `| ${i + 1} | ${e.videoId.slice(0, 8)} | ${e.month?.slice(0, 7) ?? ''} | ${e.source === 'content' ? e.field : 'comment'} | ${e.ownPost ? 'yes' : ''} | ${clean(e.excerpt)} | |`,
    ))
    lines.push('')
  }
  return lines.join('\n')
}

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME,
    values: ['from', 'to', 'plan-out', 'hand-check', 'sample', 'max-reads'],
    flags: ['confirm', 'check', 'stand-in'],
    defaultClient: SEALAND_CLIENT_ID,
  })
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  const check = args.flags.has('check')
  const standIn = args.flags.has('stand-in')
  if (check && !args.apply) throw new Error(`${NAME}: --check goes with --apply (it runs the apply's guards and writes nothing)`)
  if (standIn && (args.project !== STAGING || args.apply)) throw new Error(`${NAME}: --stand-in is a staging dry run only (no --apply, --project ${STAGING})`)
  if (args.project === PRODUCTION && !args.flags.has('confirm')) {
    throw new Error(`${NAME}: reading production needs --confirm (it probes first and keeps to the read ration). Nothing read.`)
  }
  const now = new Date()
  const from = args.values.from ?? '2026-08-01'
  const to = args.values.to ?? iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)))
  if (!/^\d{4}-\d{2}-01$/.test(from) || !/^\d{4}-\d{2}-01$/.test(to) || !(from < to)) {
    throw new Error(`${NAME}: --from and --to are firsts of months, from before to (got ${from}, ${to})`)
  }
  const sample = Number(args.values.sample ?? 30)
  const ration = new Ration(Number(args.values['max-reads'] ?? 45))
  const rules = brandRulesFor(args.clientId)
  console.log(modeLine(args, NAME) + (check ? ' (--check: nothing is written)' : ''))
  console.log(`  rules ${BRAND_RULE_VERSION} (fingerprint ${brandRulesFingerprint()}), window [${from}, ${to})${standIn ? ', STAND-IN candidates (staging dry run; MF2 not applied)' : ''}`)
  if (rules.length === 0) {
    console.log('  no brand rules for this client (lib/brands/aliases.ts): nothing to count, nothing written')
    return
  }
  const admin = createAdminClient()
  if (args.project === PRODUCTION) await probe(admin, args, ration)

  // The tenant's brands: the tracked rivals by identity (competitors.id).
  ration.spend(1, 'tracking_configs')
  const { data: tc, error: tcErr } = await admin.from('tracking_configs')
    .select('competitor_names, competitor_keywords, competitor_handles, own_handles, brand_keywords').eq('client_id', args.clientId).maybeSingle()
  if (tcErr || !tc) throw new Error(`${NAME}: tracking_configs: ${tcErr?.message ?? 'no row'}`)
  const tracking = tc as Tracking
  ration.spend(1, 'competitors')
  const { data: comps, error: cErr } = await admin.from('competitors').select('id, name, retired_at').eq('client_id', args.clientId)
  if (cErr) throw new Error(`${NAME}: competitors: ${cErr.message}`)
  const norm = (s: string) => s.trim().toLowerCase()
  const tracked = new Set((tracking.competitor_names ?? []).map(norm))
  const live = new Map(((comps ?? []) as { id: string; name: string; retired_at: string | null }[])
    .filter((c) => !c.retired_at).map((c) => [norm(c.name), c.id]))
  const brands: { rule: BrandRule; brandKey: string }[] = []
  for (const rule of rules) {
    if (rule.key.kind === 'client') { brands.push({ rule, brandKey: 'client' }); continue }
    const id = live.get(norm(rule.key.name))
    if (!id || !tracked.has(norm(rule.key.name))) {
      console.log(`  ${rule.brand}: not a tracked rival with a live competitors row here; skipped`)
      continue
    }
    brands.push({ rule, brandKey: id })
  }
  const ruled = new Set(rules.filter((r) => r.key.kind === 'rival').map((r) => norm((r.key as { name: string }).name)))
  for (const name of tracking.competitor_names ?? []) {
    if (!ruled.has(norm(name))) console.log(`  ${name}: tracked, but lib/brands/aliases.ts has no rule for it: not counted`)
  }

  // The candidates: MF2's function, or on a staging dry run the stand-in.
  const perBrand: BrandCandidates[] = []
  if (standIn) {
    const rows = await standInRows(admin, args.clientId, from, to, ration)
    console.log(`  stand-in rows: ${rows.videos.length} readable videos with a comment in the window, ${rows.comments.length} comments`)
    for (const b of brands) {
      const bare = barePattern(b.rule, 'js')
      perBrand.push({ ...b, hits: standInCandidates(brandPattern(b.rule, 'js'), rows.videos, rows.comments), bare: bare ? standInCandidates(bare, rows.videos, rows.comments) : null })
    }
  } else {
    try {
      for (const b of brands) {
        const hits = await candidatesOf(admin, args.clientId, brandPattern(b.rule, 'are'), from, to, ration, `${b.rule.brand}'s candidates`)
        const bareP = barePattern(b.rule, 'are')
        const bare = bareP ? await candidatesOf(admin, args.clientId, bareP, from, to, ration, `${b.rule.brand}'s bare name`) : null
        perBrand.push({ ...b, hits, bare })
      }
    } catch (e) {
      if (isMissingObject(e, 'brand_mention_candidates')) {
        throw new Error(`${NAME}: brand_mention_candidates is not on ${args.project}: MF2 is not applied.${args.project === STAGING ? ' A staging dry run takes --stand-in.' : ''} Nothing written.`)
      }
      throw e
    }
  }
  const plan = planMentions(args.clientId, BRAND_RULE_VERSION, perBrand)

  // Own posts: the client's and each rival's, by source and by account (the
  // census rule, lib/gather/owned.ts), over the matched videos.
  const matched = [...new Set(plan.mentions.map((m) => m.row.video_id))]
  const idCols = 'id, platform, video_id, source, account_name, is_client, is_competitor, competitor_name'
  const owned = await selectAll<IdentityRow>(() => admin.from('videos').select(idCols).eq('client_id', args.clientId)
    .in('source', ['owned', 'competitor_owned']).order('id'))
  ration.spend(Math.max(1, Math.ceil(owned.length / 1000)), 'the own posts')
  const rowsById = new Map<string, IdentityRow>()
  for (const ids of chunks(matched, ID_CHUNK)) {
    ration.spend(1, 'the matched videos')
    const { data, error } = await admin.from('videos').select(idCols).eq('client_id', args.clientId).in('id', ids)
    if (error) throw new Error(`${NAME}: videos: ${error.message}`)
    for (const r of (data ?? []) as IdentityRow[]) rowsById.set(r.id, r)
  }
  const keyOfRival = new Map(brands.filter((b) => b.rule.key.kind === 'rival').map((b) => [norm((b.rule.key as { name: string }).name), b.brandKey]))
  const clientNames = ownAccountNames(owned, tracking.own_handles ?? {}, { source: 'owned' })
  const rivalNames = Object.entries(tracking.competitor_handles ?? {}).map(([name, handles]) =>
    ({ key: keyOfRival.get(norm(name)) ?? null, names: ownAccountNames(owned, handles ?? {}, { source: 'competitor_owned', competitorName: name }) }))
  const ownerOf = (videoId: string): string | null => {
    const r = rowsById.get(videoId)
    if (!r) return null
    if (r.source === 'owned') return 'client'
    if (r.source === 'competitor_owned') return keyOfRival.get(norm(r.competitor_name ?? '')) ?? null
    const account = normAccount(r.account_name)
    if (!account) return null
    if (clientNames.get(r.platform)?.has(account)) return 'client'
    return rivalNames.find((x) => x.names.get(r.platform)?.has(account))?.key ?? null
  }

  // The month's market, and the videos any of our rival searches found (the
  // one base every brand's headline count sits over; the page reads the same).
  const months = monthsIn(from, to)
  const markets = new Map<string, string[]>()
  for (const m of months) {
    const set = await readMonthVideos(admin, args.clientId, m, ration)
    ration.spend(0, `market_month_videos ${m}`)
    if (set) markets.set(m, set.map((v) => v.id))
  }
  const rivalFound = await readRivalFound(admin, args.clientId, tracking.competitor_keywords)
  ration.spend(rivalFound.pages, 'the rival searches and what they found')
  console.log(`  our rival searches, current and retired (${rivalFound.terms.size}): ${[...rivalFound.terms].sort().join(', ')}`)
  for (const [m, ids] of [...markets.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const base = withoutRivalSearches(ids, rivalFound.videos).length
    console.log(`  ${m.slice(0, 7)}: the market's ${ids.length} videos; ${ids.length - base} found by a rival search of ours; ${base} without them (every brand's headline base)`)
  }
  const counts = monthBrandCounts(plan.mentions, brands.map((b) => ({ brand: b.rule.brand, brandKey: b.brandKey })), { markets, ownerOf, rivalFound: rivalFound.videos })
  const own = ownPostMentions(plan.mentions, ownerOf)

  // The report.
  for (const b of brands) {
    const mine = plan.mentions.filter((m) => m.row.brand_key === b.brandKey)
    const content = mine.filter((m) => m.row.source === 'content').length
    const comment = mine.length - content
    const dropped = plan.dropped.filter((d) => d.brand === b.rule.brand)
    console.log(`\n${b.rule.brand} (${b.brandKey}): ${content} content rows, ${comment} comment rows; ${plan.homonymVideos.get(b.rule.brand)?.size ?? 0} videos read as the other meaning (${dropped.length} matches dropped); own posts naming it: ${own.get(b.brandKey) ?? 0}`)
    for (const c of counts.filter((x) => x.brandKey === b.brandKey)) {
      console.log(`  ${c.month.slice(0, 7)}: came up in ${c.kAny} of the market's ${c.n} videos (content ${c.kContent}, a comment dated in the month ${c.kComment})` +
        `; without any video our rival searches found: ${c.kOrganic} of ${c.nOrganic}`)
    }
  }
  if (markets.size < months.length) console.log(`\n  market_month_videos missing for ${months.length - markets.size} month(s): MF1 not applied?`)

  const rows: MentionRow[] = plan.mentions.map((m) => m.row)
  const gitSha = (() => { try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim() } catch { return 'unknown' } })()
  if (args.values['plan-out']) {
    writeNew(args.values['plan-out'], JSON.stringify({
      kind: 'brand-mentions-plan', version: 1, project: args.project, clientId: args.clientId, ruleVersion: BRAND_RULE_VERSION,
      rulesFingerprint: brandRulesFingerprint(), window: { from, to }, standIn, createdAt: now.toISOString(), gitSha,
      counts, ownPosts: Object.fromEntries(own), candidates: candidateDigests(perBrand), rows,
    }, null, 2))
    console.log(`\n  plan written: ${args.values['plan-out']} (${rows.length} rows)`)
  }
  if (args.values['hand-check']) {
    const entries = handCheckList(plan.mentions, { sample, all: new Set(['client']), ownerOf })
    writeNew(args.values['hand-check'], handCheckMarkdown(entries, brands.map((b) => b.rule.brand),
      `# Brand mentions: the hand check (${args.project === PRODUCTION ? 'production' : 'staging'}, ${BRAND_RULE_VERSION}, window ${from} to ${to}, read ${now.toISOString().slice(0, 16)}Z)\n\n` +
      `All ${brands.length} brands: every match of your name, and ${sample} matches per other brand. Mark each "the brand?" yes or no. ` +
      `Each brand read becomes one production entry in lib/brands/precision.ts (read, yes, the date, ruleVersion '${BRAND_RULE_VERSION}'); only a production entry under the rules the page counts with lets it count a brand. Excerpts are for this check only.`))
    console.log(`  hand-check list written: ${args.values['hand-check']} (${entries.length} matches)`)
  }

  if (!args.apply) {
    console.log(`\nread-only: nothing written (${rows.length} rows planned) · reads: ${ration.n}`)
    return
  }
  // Apply: skip what this rule version already holds.
  let held: Set<string>
  try {
    const heldRows = await selectAll<Pick<MentionRow, 'client_id' | 'video_id' | 'brand_key' | 'source' | 'comment_id' | 'rule_version'>>(() =>
      admin.from('brand_mentions').select('client_id, video_id, brand_key, source, comment_id, rule_version')
        .eq('client_id', args.clientId).eq('rule_version', BRAND_RULE_VERSION).order('id'))
    ration.spend(Math.max(1, Math.ceil(heldRows.length / 1000)), 'the held rows')
    held = new Set(heldRows.map(mentionKey))
  } catch (e) {
    if (!isMissingObject(e, 'brand_mentions')) throw e
    if (!check) throw new Error(`${NAME}: brand_mentions is not on ${args.project}: apply MF2 first. Nothing written.`)
    console.log('  brand_mentions is not there (MF2 not applied): read as empty for --check')
    held = new Set()
  }
  const fresh = rows.filter((r) => !held.has(mentionKey(r)))
  if (check) {
    console.log(`\n--check: would insert ${fresh.length} rows (${rows.length - fresh.length} already held) · reads: ${ration.n}. Nothing written.`)
    return
  }
  for (const part of chunks(fresh, 500)) {
    const { error } = await admin.from('brand_mentions').insert(part)
    if (error) throw new Error(`${NAME}: insert failed after some rows may have landed (re-run: held rows are skipped): ${error.message}`)
  }
  console.log(`\nAPPLIED: ${fresh.length} rows (${rows.length - fresh.length} already held) · reads: ${ration.n}`)
}

if (process.argv[1]?.endsWith('brand-mentions.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
