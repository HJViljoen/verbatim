import type { SupabaseClient } from '@supabase/supabase-js'

import {
  recordConfigChange,
  type ConfigActor,
} from './config-log'
import { selectAll } from './supabase-admin'

// A rival's identity, and the one place the audience key is built (Phase 1 WP1,
// design item 16 addendum, decision I).
//
// THE KEY DID NOT CHANGE. An audience is still `competitor:<competitor_name>`
// with the name exactly as configured, spaces and capitals included, because
// 214 denominator rows and 2,957 theme readings are already frozen under it and
// `audience` is in both primary keys. What changed is that the name now has a
// row behind it (`competitors`, migration 20260918090000), so a rename is one
// operation with a record instead of five writes and a silence, a retired rival
// stays renderable, and a reader can stitch the two halves of a renamed series
// into one line with the break marked.
//
// THE EIGHT COPIES. The three-way precedence — the client's own post, then a
// tracked rival's, then the category — existed in eight places when this file
// was written (lib/pipeline/metrics.ts entityOf, lib/pipeline/step-a2.ts
// bucketOf, lib/quotes.ts videoBucketOf, lib/competitive-tiles.ts videoBucket +
// competitorBucket, scripts/run-tagging.ts bucket, scripts/regate-corpus.ts
// bucketOf), and two of them disagreed: the tagging inspector emitted
// 'industry' where everything else emits 'industry-other', and the re-gate
// inspector wrote `competitor:null` for a row flagged as a rival with no name.
// They are now all `audienceOf`. Two SQL copies remain on purpose, inside
// monthly_denominators and monthly_theme_readings
// (20260915092000_monthly_reading.sql:274-277, :425-429): the reading runs in
// the database and a function boundary there would be a per-row call on a
// corpus scan. They are the duplication this file is allowed to have, and any
// change here has to be made there too.

/** The audience key of every video nobody's brand is in. */
export const INDUSTRY_AUDIENCE = 'industry-other'
/** The audience key of the client's own posts. */
export const CLIENT_AUDIENCE = 'client'
/** What a rival audience key starts with. */
export const RIVAL_PREFIX = 'competitor:'
/** The name a video flagged as a rival's but carrying none is keyed under.
 *  Not a real rival: it means the tagger disagreed with itself. */
export const UNKNOWN_RIVAL = 'unknown'

/** A rival's audience key, from its name. The ONE place the prefix is applied.
 *
 *  WHERE THE TWO SQL COPIES DIVERGE, AND WHY IT IS NOT FIXED HERE. This trims
 *  and folds a blank name to 'unknown'; both copies are the bare
 *  `'competitor:' || coalesce(v.competitor_name, 'unknown')`, so a padded name
 *  keys one way in TypeScript and another in the reading, and an EMPTY string
 *  (not null) gives 'competitor:' there and 'competitor:unknown' here. Nothing
 *  in production has either — 0 padded and 0 blank `competitor_name` values,
 *  and both `csv()` helpers trim on save — but the disagreement would land on
 *  `month_*.audience`, which is in a primary key and freezes, so it cannot be
 *  corrected afterwards. The copies live in 20260915092000_monthly_reading.sql,
 *  which IS applied to production; M3 (20260918092000) rewrites those two
 *  function bodies for the window readings and is where `btrim`/`nullif`
 *  belongs. Until then the test below asserts only what it can see. */
export function rivalKey(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  return `${RIVAL_PREFIX}${trimmed === '' ? UNKNOWN_RIVAL : trimmed}`
}

/** Is this audience key a rival's? */
export function isRivalAudience(audience: string | null | undefined): boolean {
  return typeof audience === 'string' && audience.startsWith(RIVAL_PREFIX) && audience.length > RIVAL_PREFIX.length
}

/** The name inside a rival audience key; null for `client`, `industry-other`
 *  and anything else. The inverse of `rivalKey`, and the only supported way to
 *  read a name back out of a stored key — a dozen readers did `slice(11)` by
 *  hand. */
export function rivalNameOf(audience: string | null | undefined): string | null {
  return isRivalAudience(audience) ? (audience as string).slice(RIVAL_PREFIX.length) : null
}

/** The entity columns the audience rule reads. Structurally typed so every
 *  caller's own row shape fits — they differ only in how nullable they are. */
export interface EntityTags {
  is_client?: boolean | null
  is_competitor?: boolean | null
  competitor_name?: string | null
}

/** Whose post a video is: the client's, a tracked rival's, or the category's.
 *
 *  Evaluated against whatever the caller holds. Read LIVE from `videos` this is
 *  today's answer; read off a stored `themes.bucket` it is the answer the run
 *  that wrote it gave, and a re-tag since then has moved videos without moving
 *  buckets (lib/quotes.ts resolves insights through the live rows for exactly
 *  that reason). */
export function audienceOf(v: EntityTags): string {
  if (v.is_client) return CLIENT_AUDIENCE
  if (v.is_competitor) return rivalKey(v.competitor_name)
  return INDUSTRY_AUDIENCE
}

/** A display name folded to a stable per-tenant key: lowercase, diacritics
 *  stripped, everything else run together with hyphens. 'Össur' → 'ossur',
 *  'Topo Designs' → 'topo-designs', '!!!' → '' (no slug at all).
 *
 *  The twin of `public.rival_slug(text)`; the two must agree, and both
 *  decompose and strip BEFORE lowercasing so the answer does not depend on a
 *  database's collation. NOT the audience key — that is still the name — and
 *  NOT lib/gather/owned.ts `entitySlug`, which looks almost identical, does not
 *  strip diacritics, and may never change because it is an Inngest step-id
 *  segment (AGENTS.md: step ids are a stability contract). */
export function rivalSlug(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---- The identity -----------------------------------------------------------

/** The table, named once so a reader and a writer cannot disagree. */
export const COMPETITORS_TABLE = 'competitors'

/** One `competitors` row, as stored. */
export interface Competitor {
  id: string
  client_id: string
  /** The display name AND the string the audience key is built from. */
  name: string
  slug: string
  /** Earliest evidence in the database that the name was tracked — not the day
   *  tracking began, which nothing records. */
  first_seen_at: string | null
  /** Set when the tenant stopped tracking. The row stays: its months are frozen
   *  under its name and a reader still has to render it. */
  retired_at: string | null
  superseded_by: string | null
  created_by: string | null
  created_at: string
}

/** Is this error "the competitors table is not there yet"? The migration is
 *  applied by hand, so a deploy can reach production before it does. Same
 *  narrow shape as `isMissingConfigLog`: this table's own name, and one of the
 *  codes that means "no such relation". */
export function isMissingCompetitors(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes(COMPETITORS_TABLE)) return false
  if (code && ['PGRST205', 'PGRST204', '42P01', '42703'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/** Every rival this tenant has ever had, tracked ones first, then by name.
 *
 *  Retired rows come back too, and deliberately: a frozen month keyed on a name
 *  nobody tracks any more still has to be rendered, and "was tracked until
 *  {date}" is the only honest thing to print over it. Callers that want only
 *  the live set filter on `retired_at`.
 *
 *  Returns [] and says so loudly if the table is not there yet, so a page can
 *  render without it rather than 500 through a deploy window. */
export async function loadCompetitors(client: SupabaseClient, clientId: string): Promise<Competitor[]> {
  let rows: Competitor[]
  try {
    rows = await selectAll<Competitor>(() =>
      client.from(COMPETITORS_TABLE).select('*').eq('client_id', clientId).order('name', { ascending: true }),
    )
  } catch (error) {
    if (isMissingCompetitors(error)) {
      console.error(`[rivals] ${COMPETITORS_TABLE} is not there yet — no rival identities for ${clientId}.`)
      return []
    }
    throw error
  }
  return rows.sort((a, b) => {
    const retired = Number(Boolean(a.retired_at)) - Number(Boolean(b.retired_at))
    return retired !== 0 ? retired : a.name.localeCompare(b.name)
  })
}

/** The rival a stored name or audience key belongs to. Matched on the slug, so
 *  a capitalisation or an accent does not lose the row; live rows win over
 *  retired ones when a name has been reused. */
export function findRival(rivals: readonly Competitor[], nameOrAudience: string | null | undefined): Competitor | null {
  const name = rivalNameOf(nameOrAudience) ?? nameOrAudience ?? ''
  const slug = rivalSlug(name)
  if (!slug) return null
  const hits = rivals.filter((r) => r.slug === slug)
  return hits.find((r) => !r.retired_at) ?? hits[0] ?? null
}

// ---- Creating, renaming and retiring ----------------------------------------

/** What a write to a rival's identity needs: the admin client, the tenant, and
 *  the person or command behind it. Every configuration write carries an actor
 *  (AGENTS.md). */
export interface RivalContext {
  client: SupabaseClient
  clientId: string
  actor: ConfigActor
  /** The comment-dated months this change could move, as a Postgres daterange
   *  literal — `lib/config-affects.ts affectsMonths`. Null when not computed;
   *  NULL in the column means "not known", which is the honest value. */
  affectsMonths?: string | null
  /** Overrides the sentence the log stores. Client-readable copy only. */
  note?: string | null
}

/** What the tenant's tracked list asks of the identity table. Pure, so the
 *  rule is testable without a database: the query is one read either side. */
export interface RivalPlan {
  /** Names with no row at all, as they will be stored. */
  create: { name: string; slug: string }[]
  /** Rows that are retired and tracked again. */
  revive: Competitor[]
}

/** Which identities a tracked list is missing.
 *
 *  Matched on the slug, like `findRival`, so a re-typed capitalisation is not a
 *  second rival. A name whose only row is RETIRED revives that row rather than
 *  minting a second one: two rows sharing a slug would make `findRival` choose
 *  between them, and the frozen months under that name belong to the rival that
 *  earned them. Nothing is ever removed here — a name dropped from the list is
 *  `retireRival`'s business. */
export function planRivals(existing: readonly Competitor[], names: readonly string[]): RivalPlan {
  // One name per slug, first spelling wins: 'Cotopaxi' and 'cotopaxi ' typed
  // into one Settings field are one rival, and the live unique index agrees.
  const wanted = new Map<string, string>()
  for (const raw of names) {
    const name = (raw ?? '').trim()
    const slug = rivalSlug(name)
    if (!name || !slug || wanted.has(slug)) continue
    wanted.set(slug, name)
  }

  const live = new Set(existing.filter((r) => !r.retired_at).map((r) => r.slug))
  const retired = new Map<string, Competitor>()
  for (const row of existing) {
    if (!row.retired_at || live.has(row.slug)) continue
    const kept = retired.get(row.slug)
    // The most recently retired row is what this name last was.
    if (!kept || (kept.retired_at ?? '') < row.retired_at) retired.set(row.slug, row)
  }

  const plan: RivalPlan = { create: [], revive: [] }
  for (const [slug, name] of wanted) {
    if (live.has(slug)) continue
    const back = retired.get(slug)
    if (back) plan.revive.push(back)
    else plan.create.push({ name, slug })
  }
  return plan
}

/** What a reconcile did. Names, not counts, because the caller logs them. */
export interface EnsureResult {
  /** Names that had no identity and now have one. */
  created: string[]
  /** Names whose identity had been retired and is tracked again. */
  revived: string[]
}

/**
 * Give every tracked name an identity, and revive one that is tracked again.
 *
 * THE INVARIANT. `competitors` is only worth having if every name in
 * `tracking_configs.competitor_names` has exactly one live row: that is what
 * supplies "tracked since {date}", what `findRival` resolves a frozen month's
 * `competitor:<name>` through, and what `rename_rival` needs an id for. The
 * migration's backfill makes it true once. Nothing else in this file creates a
 * row — `rename_rival` and `retireRival` only ever UPDATE — so without this the
 * table starts drifting at the first rival anyone adds in Settings and the new
 * one can never be renamed at all.
 *
 * Call it AFTER a successful write of the tracked list, with an admin client:
 * `authenticated` has SELECT on this table and nothing else, deliberately.
 *
 * Additive and non-fatal by the same asymmetry as `recordConfigChange`: the
 * configuration write has already happened, so a failure here is logged and
 * leaves the identity to the next save rather than reporting an error for work
 * that succeeded. It never renames, never retires and never deletes; removing a
 * name from the list is `retireRival`'s job, because a rival whose row vanished
 * takes its frozen months' only label with it.
 */
export async function ensureRivals(ctx: RivalContext, names: readonly string[]): Promise<EnsureResult> {
  const out: EnsureResult = { created: [], revived: [] }
  if (names.length === 0) return out
  try {
    const plan = planRivals(await loadCompetitors(ctx.client, ctx.clientId), names)
    if (plan.create.length === 0 && plan.revive.length === 0) return out

    for (const back of plan.revive) {
      const { error } = await ctx.client
        .from(COMPETITORS_TABLE)
        .update({ retired_at: null })
        .eq('client_id', ctx.clientId)
        .eq('id', back.id)
      if (error) throw error
      out.revived.push(back.name)
    }

    if (plan.create.length) {
      const { error } = await ctx.client.from(COMPETITORS_TABLE).insert(plan.create.map((r) => ({
        client_id: ctx.clientId,
        name: r.name,
        slug: r.slug,
        // Today, which is the truth for a name tracked from now on. The
        // backfilled rows' earlier dates are evidence found in the corpus, not
        // a start anyone recorded.
        first_seen_at: new Date().toISOString(),
        created_by: ctx.actor.label ?? ctx.actor.kind,
      })))
      if (error) throw error
      // Pushed only once the statement landed, so the result describes the
      // table that exists rather than the one that was asked for.
      out.created.push(...plan.create.map((r) => r.name))
    }
  } catch (error) {
    if (isMissingCompetitors(error)) {
      console.error(`[rivals] ${COMPETITORS_TABLE} is not there yet — ${ctx.clientId} keeps its names without identities.`)
      return out
    }
    const message = (error as { message?: string }).message ?? String(error)
    console.error(`[rivals] identities NOT reconciled for ${ctx.clientId}: ${message}`)
  }
  return out
}

/** What `rename_rival()` did. Counts, because the operation is otherwise
 *  invisible: the corpus re-stamp used to leave no record at all. */
export interface RenameResult {
  /** False when the new name equals the old one — nothing moved and nothing
   *  was logged, because the log answers "what changed". */
  renamed: boolean
  old_name: string
  new_name: string
  videos: number
  theme_registry: number
  themes: number
  change_id: string | null
}

/** Rename a rival: the identity, the tracked list and census handles, the
 *  stored corpus, the theme registry, the current run's theme buckets and the
 *  log row, in ONE transaction (`public.rename_rival`). Five writes that
 *  half-land leave a corpus stamped with two names and nothing saying so.
 *
 *  What it does NOT do is re-key a frozen month: it cannot — `audience` is in
 *  the primary key and the frozen guard refuses the UPDATE. The old months stay
 *  under the old name, the new ones start under the new one, and the log row
 *  names both so `stitchRenames` can draw one line with the break marked. */
export async function renameRival(ctx: RivalContext, id: string, newName: string): Promise<RenameResult> {
  const { data, error } = await ctx.client.rpc('rename_rival', {
    p_client_id: ctx.clientId,
    p_competitor_id: id,
    p_new_name: newName,
    p_actor: ctx.actor as unknown as Record<string, unknown>,
    p_affects_months: ctx.affectsMonths ?? null,
    p_note: ctx.note ?? null,
  })
  if (error) throw new Error(`renameRival: ${(error as { message?: string }).message ?? String(error)}`)
  return data as RenameResult
}

/** Stop tracking a rival. Sets `retired_at` and writes the log row; it never
 *  deletes, because a frozen month keyed on the name still has to be rendered
 *  and because the last time a rival was removed from this product its whole
 *  history became unattributable overnight.
 *
 *  It does not touch the tracked list: removing the name from
 *  `tracking_configs.competitor_names` is the Settings save, and the audit
 *  trigger logs that. This is the identity half — the fact that the rival's
 *  series ends here. */
export async function retireRival(
  ctx: RivalContext,
  id: string,
  at: Date = new Date(),
): Promise<{ retired: boolean; name: string | null }> {
  const { data: row, error: readErr } = await ctx.client
    .from(COMPETITORS_TABLE)
    .select('id, name, retired_at')
    .eq('client_id', ctx.clientId)
    .eq('id', id)
    .maybeSingle()
  if (readErr) throw new Error(`retireRival: ${(readErr as { message?: string }).message ?? String(readErr)}`)
  const stored = row as { id: string; name: string; retired_at: string | null } | null
  if (!stored) throw new Error(`retireRival: no rival ${id} for client ${ctx.clientId}`)
  if (stored.retired_at) return { retired: false, name: stored.name }

  const { error } = await ctx.client
    .from(COMPETITORS_TABLE)
    .update({ retired_at: at.toISOString() })
    .eq('client_id', ctx.clientId)
    .eq('id', id)
  if (error) throw new Error(`retireRival: ${(error as { message?: string }).message ?? String(error)}`)

  await recordConfigChange(ctx.client as unknown as Parameters<typeof recordConfigChange>[0], {
    clientId: ctx.clientId,
    surface: 'rivals',
    field: 'competitor_names',
    before: { name: stored.name, tracked: true },
    after: { name: stored.name, tracked: false },
    actor: ctx.actor,
    note: ctx.note ??
      `We stopped tracking ${stored.name}. Everything already recorded about ${stored.name} stays; ` +
      'nothing new is added from here, so the line ends rather than falling to zero.',
    affects: { audiences: [rivalKey(stored.name)], months: ctx.affectsMonths ?? null },
  })
  return { retired: true, name: stored.name }
}

// ---- Reading a renamed series -----------------------------------------------

/** One rename, as a reader needs it: the two audience keys and when it was
 *  recorded. Built from a `config_changes` row with surface 'rival_rename' —
 *  `affects_audiences` is [old, new] in that order. */
export interface RenameRecord {
  from: string
  to: string
  /** `config_changes.changed_at` — the wall clock, which is the rename's
   *  identity but NOT where the break is drawn: the break is drawn where the
   *  months actually change key. */
  at: string
}

/** A rename read off a change-log row, or null when the row does not carry the
 *  two audiences (every row written before this column existed). */
export function renameFrom(change: {
  surface?: string | null
  affects_audiences?: string[] | null
  changed_at?: string | null
}): RenameRecord | null {
  if (change.surface !== 'rival_rename') return null
  const [from, to] = change.affects_audiences ?? []
  if (!from || !to || from === to) return null
  return { from, to, at: change.changed_at ?? '' }
}

/** Where a stitched line changes name. Drawn at the first month that carries
 *  the new key — not at `changed_at`, which is a wall clock and can sit months
 *  away from the conversation it moved. */
export interface RenameBreak {
  month: string
  from: string
  to: string
  /** When the rename was recorded. */
  at: string
  /** The sentence over the rule. No jargon: a reader of a chart is being told
   *  that two names are one rival, nothing else. */
  label: string
}

/** One line: every month of one rival, whatever it was called at the time. */
export interface StitchedSeries<P> {
  /** The key the line is drawn under — the newest name in the chain. */
  audience: string
  /** Every key the line has carried, oldest first. */
  names: string[]
  points: P[]
  breaks: RenameBreak[]
}

/** The break's sentence. One place, so the chart, the export and the email say
 *  the same thing. */
export function renameLabel(from: string, to: string): string {
  const was = rivalNameOf(from) ?? from
  const now = rivalNameOf(to) ?? to
  return `${was} is now called ${now}`
}

/**
 * Join the halves of a renamed rival's series into one line with the change
 * marked on it.
 *
 * A rename splits the record and cannot un-split it: frozen months keep the old
 * key forever. So the reader does the joining, and says so — the line is
 * continuous, the rule is drawn at the month the name changes, and the sentence
 * over it names both. Audiences nothing was renamed to or from come back
 * untouched, one series each, so a caller can pass everything it holds.
 *
 * Pure: the points are whatever the caller has, as long as they carry an
 * `audience` and a `month`. Chains are followed (A→B→C is one line under C) and
 * a cycle terminates rather than hanging — a log is written by people and
 * A→B→A is a thing people do.
 */
export function stitchRenames<P extends { audience: string; month: string }>(
  series: readonly P[],
  renames: readonly RenameRecord[],
): StitchedSeries<P>[] {
  const next = new Map<string, RenameRecord>()
  for (const r of renames) if (r.from !== r.to && !next.has(r.from)) next.set(r.from, r)

  // The end of each chain, and the chain that reaches it. A key renamed twice
  // lands on the newest name; a cycle stops at the key it came back to.
  const headOf = new Map<string, string>()
  const chainTo = new Map<string, RenameRecord[]>()
  for (const start of new Set([...series.map((p) => p.audience), ...next.keys()])) {
    const walked: RenameRecord[] = []
    const seen = new Set([start])
    let head = start
    for (;;) {
      const step = next.get(head)
      if (!step || seen.has(step.to)) break
      walked.push(step)
      seen.add(step.to)
      head = step.to
    }
    headOf.set(start, head)
    const stored = chainTo.get(head)
    if (!stored || walked.length > stored.length) chainTo.set(head, walked)
  }

  const grouped = new Map<string, P[]>()
  for (const p of series) {
    const head = headOf.get(p.audience) ?? p.audience
    grouped.set(head, [...(grouped.get(head) ?? []), p])
  }

  const out: StitchedSeries<P>[] = []
  for (const [head, points] of grouped) {
    const sorted = [...points].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
    // The chain that ends at this head, oldest name first.
    const chain = (chainTo.get(head) ?? []).filter((step) => {
      const reached = headOf.get(step.from)
      return reached === head
    })
    const names = chain.length ? [chain[0].from, ...chain.map((s) => s.to)] : [head]
    const breaks: RenameBreak[] = []
    for (const step of chain) {
      // The month the new key first appears. No months under it yet (a rival
      // renamed before its first reading) means no rule to draw.
      const first = sorted.find((p) => p.audience === step.to)
      if (!first) continue
      breaks.push({ month: first.month, from: step.from, to: step.to, at: step.at, label: renameLabel(step.from, step.to) })
    }
    out.push({ audience: head, names, points: sorted, breaks })
  }
  return out.sort((a, b) => a.audience.localeCompare(b.audience))
}
