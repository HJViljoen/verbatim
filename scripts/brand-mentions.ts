import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'

import { BRAND_RULE_VERSION, brandRulesFingerprint, brandRulesFor, WATCHED_RULE_VERSION } from '../lib/brands/aliases'
import {
  handCheckList, mentionKey, standInCandidates,
  type BrandCandidates, type Candidate, type HandCheckEntry, type MentionRow, type StandInComment, type StandInVideo,
} from '../lib/brands/mentions'
import { readBrands, type IdentityRow, type Tracking } from '../lib/brands/readings'
import { SEALAND_CLIENT_ID } from '../lib/config'
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
// with --apply on Tue 6 Oct (after MF2) and again after each run; he reads the
// hand-check list on Wed 7 Oct. No model call (the GPT confirm is Stage 3,
// decision L).
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
// 2 on staging's 145), market_month_videos per month (2 to 3), the first-found
// terms of every market video in the window (1 per 100: 9 on staging's Aug
// and Sep); with --apply, the held rows (1+). About 35.
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

function handCheckMarkdown(entries: readonly HandCheckEntry[], header: string): string {
  const clean = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').trim()
  const lines = [header, '']
  for (const brand of [...new Set(entries.map((e) => e.brand))]) {
    const mine = entries.filter((e) => e.brand === brand)
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
  const ID_COLS = 'id, platform, video_id, source, account_name, is_client, is_competitor, competitor_name'
  console.log(modeLine(args, NAME) + (check ? ' (--check: nothing is written)' : ''))
  console.log(`  rules ${BRAND_RULE_VERSION} (fingerprint ${brandRulesFingerprint()}; watched brands ${WATCHED_RULE_VERSION}), window [${from}, ${to})${standIn ? ', STAND-IN candidates (staging dry run; MF2 not applied)' : ''}`)
  if (rules.length === 0) {
    console.log('  no brand rules for this client (lib/brands/aliases.ts): nothing to count, nothing written')
    return
  }
  const admin = createAdminClient()
  if (args.project === PRODUCTION) await probe(admin, args, ration)

  // The brands, their candidates, the rows, whose own posts, each month's
  // market and the first-found terms: lib/brands/readings.ts readBrands, the
  // one copy the pipeline's brand-readings step shares (deploy 4, WP3.5).
  // Watched brands (tracking_configs.watched_brands, MF3) are read with
  // their own rule version (WATCHED_RULE_VERSION).
  const cache: { standIn: Awaited<ReturnType<typeof standInRows>> | null } = { standIn: null }
  const read = await readBrands(args.clientId, {
    engine: standIn ? 'js' : 'are',
    tracking: async () => {
      ration.spend(1, 'tracking_configs')
      const base = 'competitor_names, competitor_keywords, competitor_handles, own_handles, brand_keywords'
      const first = await admin.from('tracking_configs').select(`${base}, watched_brands`).eq('client_id', args.clientId).maybeSingle()
      if (!first.error && first.data) return first.data as Tracking
      const { data, error } = await admin.from('tracking_configs').select(base).eq('client_id', args.clientId).maybeSingle()
      if (error || !data) throw new Error(`${NAME}: tracking_configs: ${error?.message ?? 'no row'}`)
      return data as Tracking
    },
    competitors: async () => {
      ration.spend(1, 'competitors')
      const { data, error } = await admin.from('competitors').select('id, name, retired_at').eq('client_id', args.clientId)
      if (error) throw new Error(`${NAME}: competitors: ${error.message}`)
      return (data ?? []) as { id: string; name: string; retired_at: string | null }[]
    },
    candidates: async (pattern, what) => {
      if (standIn) {
        cache.standIn ??= await standInRows(admin, args.clientId, from, to, ration)
        return standInCandidates(pattern, cache.standIn.videos, cache.standIn.comments)
      }
      try {
        return await candidatesOf(admin, args.clientId, pattern, from, to, ration, what)
      } catch (e) {
        if (isMissingObject(e, 'brand_mention_candidates')) {
          throw new Error(`${NAME}: brand_mention_candidates is not on ${args.project}: MF2 is not applied.${args.project === STAGING ? ' A staging dry run takes --stand-in.' : ''} Nothing written.`)
        }
        throw e
      }
    },
    ownedVideos: async () => {
      const owned = await selectAll<IdentityRow>(() => admin.from('videos').select(ID_COLS).eq('client_id', args.clientId)
        .in('source', ['owned', 'competitor_owned']).order('id'))
      ration.spend(Math.max(1, Math.ceil(owned.length / 1000)), 'the own posts')
      return owned
    },
    videosById: async (ids) => {
      ration.spend(1, 'the matched videos')
      const { data, error } = await admin.from('videos').select(ID_COLS).eq('client_id', args.clientId).in('id', [...ids])
      if (error) throw new Error(`${NAME}: videos: ${error.message}`)
      return (data ?? []) as IdentityRow[]
    },
    monthVideos: async (m) => {
      const set = await readMonthVideos(admin, args.clientId, m, ration)
      ration.spend(0, `market_month_videos ${m}`)
      return set
    },
    // Every market video's first-found terms, not only the matched ones': a
    // video found only by a brand's own searches leaves that brand's organic
    // base (nOrganic) whether or not it names the brand.
    firstTerms: async (ids) => {
      const out = new Map<string, string[]>()
      try {
        for (const part of chunks(ids, ID_CHUNK)) {
          ration.spend(1, 'the first-found terms')
          const { data, error } = await admin.from('video_provenance').select('video_id, first_terms').eq('client_id', args.clientId).in('video_id', part)
          if (error) throw error
          for (const r of (data ?? []) as { video_id: string; first_terms: string[] }[]) out.set(r.video_id, r.first_terms)
        }
      } catch (e) {
        if (!isMissingObject(e, 'video_provenance')) throw e
        return null
      }
      return out
    },
  }, { from, to })
  if (!read) {
    console.log('  no brand rules for this client (lib/brands/aliases.ts): nothing to count, nothing written')
    return
  }
  for (const line of read.lines) console.log(line)
  if (cache.standIn) console.log(`  stand-in rows: ${cache.standIn.videos.length} readable videos with a comment in the window, ${cache.standIn.comments.length} comments`)
  const { brands, perBrand, plan, ownerOf, markets, firstTerms, counts, own } = read
  const months = monthsIn(from, to)

  // The report.
  for (const b of brands) {
    const mine = plan.mentions.filter((m) => m.row.brand_key === b.brandKey)
    const content = mine.filter((m) => m.row.source === 'content').length
    const comment = mine.length - content
    const dropped = plan.dropped.filter((d) => d.brand === b.rule.brand)
    console.log(`\n${b.rule.brand} (${b.brandKey}): ${content} content rows, ${comment} comment rows; ${plan.homonymVideos.get(b.rule.brand)?.size ?? 0} videos read as the other meaning (${dropped.length} matches dropped); own posts naming it: ${own.get(b.brandKey) ?? 0}`)
    for (const c of counts.filter((x) => x.brandKey === b.brandKey)) {
      console.log(`  ${c.month.slice(0, 7)}: came up in ${c.kAny} of the market's ${c.n} videos (content ${c.kContent}, a comment dated in the month ${c.kComment})` +
        (firstTerms ? `; without the videos only its own searches found: ${c.kOrganic} of ${c.nOrganic}` : '; first-found terms not read (MF1 missing)'))
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
    writeNew(args.values['hand-check'], handCheckMarkdown(entries,
      `# Brand mentions: the hand check (${args.project === PRODUCTION ? 'production' : 'staging'}, ${BRAND_RULE_VERSION}, window ${from} to ${to}, read ${now.toISOString().slice(0, 16)}Z)\n\n` +
      `Every match of your name outside your own posts, and ${sample} matches per other brand. Mark each "the brand?" yes or no. Excerpts are for this check only.`))
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
        .eq('client_id', args.clientId).in('rule_version', [...new Set(rows.map((r) => r.rule_version)), BRAND_RULE_VERSION]).order('id'))
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
