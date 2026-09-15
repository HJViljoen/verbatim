import type { SupabaseClient } from '@supabase/supabase-js'

import { recordConfigChange, type ConfigActor } from '../config-log'
import { audienceOf } from '../rivals'
import { selectAll } from '../supabase-admin'
import { TABLE_ATTENTION_PANELS, type PlatformMix } from './types'

// The attention panel: a frozen set of accounts, and the index read over it
// (design item 11).
//
// WHAT THE PANEL IS FOR. An attention share taken over "every account we have
// ever seen" measures our own gathering, not the category. Össur has 2,259
// non-Reddit accounts and 251 of them were first seen before 1 June 2026; the
// rest arrived with later keyword changes, a re-gate, a new platform. Month
// over month, most of the movement in such a number is us looking in more
// places. The panel is the accounts we were ALREADY watching before the window
// opened, written down with the cutoff that chose them, so the series answers
// "did the category's attention move between these brands" instead of "did we
// find more creators".
//
// THREE MONTHS' LEAD, AND WHAT IT COSTS TODAY. `PANEL_LEAD_MONTHS` is the
// design's rule: a member has to have been first seen at least three months
// before the month being read. Measured 2026-09-15, for a September reading
// (cutoff 1 June):
//
//   Össur    251 non-Reddit accounts; 145 panel videos in August, 77 in September
//   Sealand    0 — its earliest scrape of ANY account is 2026-06-28
//
// So Sealand has no attention index at all until an October reading (cutoff
// 1 July, 536 accounts), and that is the honest answer rather than a defect:
// the tenant has been tracked for eleven weeks. `derivePanel` refuses to freeze
// an empty panel rather than writing a row that would make "0 of 0" look like a
// reading.
//
// REDDIT IS NOT A MEMBER, AND THE DATA FORCED IT. Zero Reddit accounts on
// either tenant were first seen before 2026-08-01 — Reddit gathering began with
// 20260814120000_subreddits — so at any workable cutoff the Reddit panel is
// empty by construction. It is also the one platform whose comment count is not
// comparable: a thread caps at 40 stored comments where every other platform
// caps at 100, and a thread's replies are one conversation rather than N
// reactions to a post. The exclusion is enforced here and said once per block.
//
// `comments_count`, NOT `comments_count_at_scrape`. The design names the latter;
// it is null on 35% of Össur's rows and 50% of Sealand's and means "as at the
// last paid comment scrape". `comments_count` is NOT NULL and is the platform's
// own current report — which drifts upward for any video still being re-found,
// so a month's attention figure is partly a function of when we last looked.
// That is an argument for freezing the number and printing its reading date,
// which is exactly what month_audience_stats does, and NOT an argument for the
// column that is missing half the time.

/** Months of lead a panel member needs: first seen at least this long before
 *  the month being read. */
export const PANEL_LEAD_MONTHS = 3

/** Platforms that are never panel members. See the head of this file. */
export const PANEL_EXCLUDED_PLATFORMS: readonly string[] = ['reddit']

/** The sentence a block prints once, wherever an attention figure appears.
 *  Calibrated copy: it says what was left out and why, in the reader's terms. */
export const PANEL_EXCLUDES_NOTE =
  'Reddit is left out of this comparison: a thread collects replies to a conversation rather than reactions to a post, so its comment count is not the same measurement.'

/** Why a panel exists. Mirrors the `attention_panels.reason` CHECK. */
export const PANEL_REASONS = ['first_freeze', 'tracking_change', 'manual', 'backfill'] as const
export type PanelReason = (typeof PANEL_REASONS)[number]

/** One member of a panel, as stored in `attention_panels.accounts`. */
export interface PanelMember {
  platform: string
  account_name: string
  /** `min(videos.scraped_at)` for that account — "first seen by our gather",
   *  never the account's own start. There is no other account first-seen fact
   *  in the schema: `account_snapshots` holds six rows, three handles per
   *  tenant, all of them the client's own. */
  first_seen: string
}

/** A frozen panel, as stored. */
export interface AttentionPanel {
  id: string
  client_id: string
  frozen_at: string
  cutoff: string
  accounts: PanelMember[]
  account_count: number
  reason: PanelReason
}

/**
 * The cutoff for reading `month`: the first day of the month `lead` months
 * before it. A member first seen ON the cutoff is out — the test is strictly
 * before, so "three months of lead" means three whole months.
 */
export function panelCutoff(month: string, lead: number = PANEL_LEAD_MONTHS): string {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  const d = new Date(Date.UTC(y, (m - 1) - lead, 1))
  return d.toISOString().slice(0, 10)
}

/** An account and when our gather first saw it. */
export interface SeenAccount {
  platform: string
  account_name: string
  first_seen: string
}

export interface DerivedPanel {
  members: PanelMember[]
  /** Accounts left out because their platform is never a member, per platform.
   *  Printed, not silent: on today's corpus this is where every Reddit account
   *  goes, and a reader who is told "Reddit is excluded" should be able to see
   *  how many that was. */
  excluded: PlatformMix
  /** Accounts left out because they were first seen on or after the cutoff —
   *  the ones that would have made the index a measurement of our gathering. */
  tooNew: number
  /** A panel with no members is not a panel and is never frozen. */
  empty: boolean
}

/**
 * Who is on the panel, from every account we have ever seen.
 *
 * Pure: the caller does the reading. An account with no `first_seen` is treated
 * as too new — `videos.scraped_at` is NOT NULL with a `now()` default, so this
 * arm is unreachable from the database and exists so a caller that assembled
 * the list some other way cannot quietly widen the panel.
 */
export function derivePanel(
  accounts: readonly SeenAccount[],
  opts: { cutoff: string; excludePlatforms?: readonly string[] },
): DerivedPanel {
  const excludePlatforms = opts.excludePlatforms ?? PANEL_EXCLUDED_PLATFORMS
  const cutoff = opts.cutoff.slice(0, 10)
  const members: PanelMember[] = []
  const excluded: PlatformMix = {}
  let tooNew = 0
  for (const a of accounts) {
    if (excludePlatforms.includes(a.platform)) {
      excluded[a.platform] = (excluded[a.platform] ?? 0) + 1
      continue
    }
    if (!a.first_seen || a.first_seen.slice(0, 10) >= cutoff) {
      tooNew++
      continue
    }
    members.push({ platform: a.platform, account_name: a.account_name, first_seen: a.first_seen })
  }
  members.sort((x, y) => x.platform.localeCompare(y.platform) || x.account_name.localeCompare(y.account_name))
  return { members, excluded, tooNew, empty: members.length === 0 }
}

/** Is this video by a panel account? The membership test, in one place, so the
 *  TypeScript derivation and the SQL read agree on what "the same account"
 *  means: the (platform, account_name) pair, exactly, with no folding. There is
 *  no accounts table and no `videos.account_id`; the handle IS the key. */
export function onPanel(panel: { accounts: readonly PanelMember[] }, v: { platform: string; account_name: string }): boolean {
  return panel.accounts.some((m) => m.platform === v.platform && m.account_name === v.account_name)
}

/** Are these two readings inside one panel era? A series may only be compared
 *  where they are — a re-freeze changes the denominator's membership, and
 *  neither number is wrong. */
export const samePanelEra = (a: string | null | undefined, b: string | null | undefined): boolean =>
  a != null && b != null && a === b

/**
 * Has the panel been overtaken by a tracking change?
 *
 * A change to the tracked rivals, the search terms, the handles or the
 * platforms moves which accounts we gather at all, so the panel has to be
 * re-frozen and the axis has to carry a rule. This answers from the change log
 * — the only place those moves are recorded — and it is deliberately generous:
 * an unrecorded change (a hand-run SQL update before the trigger existed) reads
 * as no change, which is why the rule is "re-freeze and log", not "re-freeze
 * when stale".
 */
export function panelStale(
  panel: Pick<AttentionPanel, 'frozen_at'>,
  changes: readonly { changed_at: string; surface: string }[],
  surfaces: readonly string[] = ['terms', 'rivals', 'handles', 'platforms', 'subreddits', 'rival_rename', 'entity_retag'],
): boolean {
  return changes.some((c) => surfaces.includes(c.surface) && c.changed_at > panel.frozen_at)
}

// ---- The index itself --------------------------------------------------------

/** One audience's two numbers in one month, as stored. */
export interface AttentionRow {
  audience: string
  /** Videos by a panel account about this brand, uploaded in this month. */
  panel_videos: number
  /** Their platform-reported `comments_count`, summed. */
  attention_comments: number
  panel_platform_mix?: PlatformMix
}

export interface AttentionSplit {
  audience: string
  /** Of the month's panel videos, this audience's — the CONTENT share. */
  content: { k: number; n: number; pct: number | null }
  /** Of the month's panel comments, this audience's — the ATTENTION share. */
  attention: { k: number; n: number; pct: number | null }
  platformMix: PlatformMix
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * The two shares, per audience, over one month's panel.
 *
 * TWO DENOMINATORS, AND THAT IS THE POINT OF THE BLOCK. Measured on Össur's
 * August 2026 panel: Ottobock's CONTENT share is 13.6% of the panel's videos
 * and its ATTENTION share is 0.56% of the panel's comments. A standings table
 * with one denominator — which is all the product has ever had — cannot say
 * that, and it is the difference between "they post a lot" and "people talk
 * about them".
 */
export function attentionSplit(rows: readonly AttentionRow[]): AttentionSplit[] {
  const videos = rows.reduce((s, r) => s + r.panel_videos, 0)
  const comments = rows.reduce((s, r) => s + r.attention_comments, 0)
  return rows.map((r) => ({
    audience: r.audience,
    content: { k: r.panel_videos, n: videos, pct: videos > 0 ? round1((r.panel_videos / videos) * 100) : null },
    attention: {
      k: r.attention_comments,
      n: comments,
      pct: comments > 0 ? round1((r.attention_comments / comments) * 100) : null,
    },
    platformMix: r.panel_platform_mix ?? {},
  }))
}

// ---- Reading and freezing (I/O) ----------------------------------------------

/** The objects 20260918094000 creates. A deploy can reach production before the
 *  migration is applied by hand, exactly as the month tables can, and a reader
 *  survives it the same way. */
const ATTENTION_OBJECTS = [TABLE_ATTENTION_PANELS, 'month_audience_stats', 'monthly_audience_stats', 'month_kind_readings', 'monthly_kind_readings', 'window_kind_readings'] as const

/** Is this the error WP5's readings get before M5 lands? Narrow and named, the
 *  `isMissingMonthlyReading` shape. */
export function isMissingKindMoodAttention(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!ATTENTION_OBJECTS.some((name) => text.includes(name))) return false
  if (code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/**
 * Every account this tenant's corpus has ever carried, and when we first saw it.
 *
 * `min(scraped_at)` per (platform, account_name), folded in TypeScript because
 * PostgREST has no GROUP BY. `scraped_at` is the right column and the only one:
 * it is set at first insert and never re-stamped (no writer anywhere in the
 * repo, and PostgREST's upsert only writes the columns in its payload — 900 of
 * Össur's rows carry a `refreshed_at` on a different calendar day, which is the
 * proof). `selectAll` pages past 1000 on a unique order.
 */
export async function accountFirstSeen(admin: SupabaseClient, clientId: string): Promise<SeenAccount[]> {
  const rows = await selectAll<{ platform: string; account_name: string; scraped_at: string }>(() =>
    admin
      .from('videos')
      .select('platform, account_name, scraped_at')
      .eq('client_id', clientId)
      .order('id', { ascending: true }),
  )
  const first = new Map<string, SeenAccount>()
  for (const r of rows) {
    if (!r.account_name) continue
    const key = `${r.platform}|${r.account_name}`
    const seen = first.get(key)
    if (!seen || r.scraped_at < seen.first_seen) {
      first.set(key, { platform: r.platform, account_name: r.account_name, first_seen: r.scraped_at })
    }
  }
  return [...first.values()]
}

/** The tenant's current panel — the one frozen last — or null. */
export async function currentPanel(admin: SupabaseClient, clientId: string): Promise<AttentionPanel | null> {
  const { data, error } = await admin
    .from(TABLE_ATTENTION_PANELS)
    .select('id, client_id, frozen_at, cutoff, accounts, account_count, reason')
    .eq('client_id', clientId)
    .order('frozen_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`read attention panel: ${(error as { message?: string }).message ?? String(error)}`)
  return (data as AttentionPanel | null) ?? null
}

export interface FreezePanelResult {
  panel: AttentionPanel | null
  derived: DerivedPanel
  /** Nothing was written because the panel would have had no members. */
  refused: 'empty' | null
}

/**
 * Freeze a panel and log it.
 *
 * APPEND-ONLY, AND THE DATABASE AGREES: `attention_panels` has UPDATE and
 * DELETE revoked from the service role, because a panel that could be edited
 * would silently re-base every attention figure already frozen against it. A
 * mistake is corrected by freezing another one, which is a dated row.
 *
 * The change is logged on `other`/`attention_panel` rather than on a surface of
 * its own: adding a surface means another CHECK on `config_changes` and the
 * vocabulary there is about what a TENANT changed, while this is a measurement
 * decision we made. Every configuration write carries an actor (AGENTS.md), and
 * this one carries the caller's.
 */
export async function freezePanel(
  admin: SupabaseClient,
  opts: {
    clientId: string
    /** The month being read; the cutoff is derived from it unless one is given. */
    month?: string
    cutoff?: string
    reason: PanelReason
    actor: ConfigActor
    accounts?: readonly SeenAccount[]
    lead?: number
    dryRun?: boolean
  },
): Promise<FreezePanelResult> {
  const cutoff = opts.cutoff ?? panelCutoff(opts.month ?? new Date().toISOString().slice(0, 10), opts.lead)
  const accounts = opts.accounts ?? (await accountFirstSeen(admin, opts.clientId))
  const derived = derivePanel(accounts, { cutoff })
  if (derived.empty) return { panel: null, derived, refused: 'empty' }
  if (opts.dryRun) return { panel: null, derived, refused: null }

  const { data, error } = await admin
    .from(TABLE_ATTENTION_PANELS)
    .insert({
      client_id: opts.clientId,
      cutoff,
      accounts: derived.members,
      account_count: derived.members.length,
      reason: opts.reason,
      created_by: opts.actor.label,
    })
    .select('id, client_id, frozen_at, cutoff, accounts, account_count, reason')
    .single()
  if (error) throw new Error(`freeze attention panel: ${(error as { message?: string }).message ?? String(error)}`)

  await recordConfigChange(admin, {
    clientId: opts.clientId,
    surface: 'other',
    field: 'attention_panel',
    after: { cutoff, accounts: derived.members.length, reason: opts.reason },
    actor: opts.actor,
    note: `attention panel frozen: ${derived.members.length} accounts first seen before ${cutoff}; ${derived.tooNew} too new, ${Object.values(derived.excluded).reduce((s, n) => s + n, 0)} on excluded platforms`,
  })
  return { panel: data as AttentionPanel, derived, refused: null }
}

/** The audience of a tracked video, for a caller assembling attention rows in
 *  TypeScript. The one precedence rule (lib/rivals.ts), re-exported here so an
 *  attention reader never hand-rolls a ninth copy of it. */
export const attentionAudienceOf = audienceOf
