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
 *  A NAME IN ANOTHER SCRIPT STILL GETS ONE. A Japanese, Cyrillic or Arabic name
 *  has no ASCII to keep, and the rule above folds every one of them to '' —
 *  but `competitors.slug` is `not null`, so no slug means no identity at all:
 *  no row, no "tracked since", no rename, none of what decision I bought, and
 *  WP16's add path would fail the not-null rather than degrade. The fallback is
 *  the UTF-8 bytes of the lowercased name in hex behind an 'x-': stable,
 *  per-tenant unique, and the one fold a database and a browser can be trusted
 *  to agree on byte for byte. It applies only when the name actually carries a
 *  non-ASCII character, so '!!!' — a name with no letter and no digit anywhere
 *  — still has no slug, and `rename_rival`'s refusal still means what it says.
 *
 *  The twin of `public.rival_slug(text)`; the two must agree, and both
 *  decompose and strip BEFORE lowercasing so the answer does not depend on a
 *  database's collation. The one residual dependency is `lower()` on the
 *  fallback path, where every character is outside ASCII by definition;
 *  production and the verification cluster are both en_US.UTF-8, and M1's
 *  exercise compares the two implementations on Cyrillic, Greek, Japanese and
 *  Arabic. NOT the audience key — that is still the name — and NOT
 *  lib/gather/owned.ts `entitySlug`, which looks almost identical, does not
 *  strip diacritics, and may never change because it is an Inngest step-id
 *  segment (AGENTS.md: step ids are a stability contract). */
export function rivalSlug(name: string | null | undefined): string {
  const raw = name ?? ''
  const ascii = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (ascii) return ascii
  const base = raw.normalize('NFC').trim().toLowerCase()
  // "Non-ASCII" in the UTF-8 sense, which is exactly what the SQL twin can test
  // as octet_length > char_length without asking the collation anything.
  if (!/[^\u0000-\u007f]/.test(base)) return ''
  return `x-${[...new TextEncoder().encode(base)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** An audience key folded to the RIVAL it names rather than to its spelling:
 *  `competitor:Cotopaxi`, `competitor:cotopaxi ` and `competitor:COTOPAXI` all
 *  fold to `competitor:cotopaxi`, while `client` and `industry-other` come back
 *  as they are.
 *
 *  It is NOT a key anything is stored under — `month_*.audience` and
 *  `theme_registry.bucket` keep the name verbatim, which is the whole of
 *  decision I. It is what lets a reader ask "are these two strings the same
 *  rival" in one place: theme matching uses it to let an exact title carry an
 *  identity across two spellings (lib/pipeline/theme-registry.ts matchThemes),
 *  and nothing may use it to MERGE stored rows, because a frozen month under
 *  the old string is the record. */
export function audienceFold(audience: string | null | undefined): string {
  const raw = (audience ?? '').trim()
  const name = rivalNameOf(raw)
  if (name === null) return raw
  const slug = rivalSlug(name)
  return `${RIVAL_PREFIX}${slug || name.trim().toLowerCase()}`
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
      console.error(`[rivals] ${COMPETITORS_TABLE} is not there yet; no rival identities for ${clientId}.`)
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

/** A rival as a reading surface needs it: the name to print and whether it is
 *  still tracked. One shape whichever of the two sources answered. */
export interface TrackedRival {
  name: string
  retiredAt: string | null
}

/**
 * The tenant's rivals — from `competitors` where M1 has landed, and from the
 * tracked list where it has not.
 *
 * ONE SHAPE EITHER WAY, so nothing downstream has to know which source
 * answered. `tracking_configs.competitor_names` is a text array with no dates
 * and no retirement, so the fallback's `retiredAt` is null for every row —
 * which is honest: before M1 there is no record that a rival was ever stopped,
 * and three of Sealand's were erased on 9 September with none.
 *
 * Lives here rather than on a page because two surfaces already need it
 * (Overview OV4 and Subjects SU2) and a third is coming; the copy that was in
 * lib/pages/overview.ts is this function.
 */
export async function loadTrackedRivals(client: SupabaseClient, clientId: string): Promise<TrackedRival[]> {
  let stored: Competitor[] = []
  try {
    stored = await loadCompetitors(client, clientId)
  } catch (error) {
    if (!isMissingCompetitors(error)) throw error
  }
  if (stored.length > 0) return stored.map((r) => ({ name: r.name, retiredAt: r.retired_at }))
  const { data, error } = await client
    .from('tracking_configs').select('competitor_names').eq('client_id', clientId).maybeSingle()
  if (error) throw new Error(`tracking_configs rivals: ${error.message}`)
  const names = (data as { competitor_names?: string[] | null } | null)?.competitor_names ?? []
  return names.map((name) => ({ name, retiredAt: null }))
}

/**
 * The rivals a READING surface may list: tracked now, and observed.
 *
 * A PICKER, A PILL ROW, A LEGEND OR A TABLE OFFERS ONLY WHAT IT CAN READ.
 * Sealand's Voice page offered five rivals that carried nothing ("Freedom of
 * Movement not observed", "Poler not observed · tracked to 9 Sep 2026") beside
 * the four it could read, and choosing one opened an empty page. A stopped
 * rival (`retiredAt`) and a rival with nothing observed are not offered
 * anywhere except Settings › Tracking, which is where the list is edited.
 *
 * THIS IS A LISTING RULE, NOT A READING RULE. A stopped rival's frozen months
 * still exist and still render where a surface reads them by name
 * (`retireRival` never deletes, and `stitchRenames` draws across a rename);
 * this only decides what a surface OFFERS. `observed` is the caller's, because
 * each surface knows its own window: Voice asks "any videos this month",
 * a horizon page asks "any videos in the horizon".
 */
export function listedRivals<T extends { name: string; retiredAt: string | null }>(
  rivals: readonly T[],
  observed: (audience: string) => boolean,
): T[] {
  return rivals.filter((r) => r.retiredAt == null && observed(rivalKey(r.name)))
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
 * It writes no `config_changes` row of its own. The change a reader is looking
 * for is the tracked LIST moving, and the `tracking_configs` audit trigger has
 * already logged that in the same save under surface 'rivals'; the actor
 * reaches the identity itself through `created_by`. A revive carries no stamp
 * beyond that row — the log's answer to "who brought this rival back" is the
 * trigger's.
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
      console.error(`[rivals] ${COMPETITORS_TABLE} is not there yet; ${ctx.clientId} keeps its names without identities.`)
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

/** Every key one rival has worn, and the one its line is drawn under. */
export interface RenameChains {
  /** For every key in the seed and in the log: the newest name in its chain. */
  headOf: Map<string, string>
  /** Keyed by head: the legend, oldest name first, ending on the head. */
  namesOf: Map<string, string[]>
}

interface Chains extends RenameChains {
  /** One step out of each key. */
  next: Map<string, RenameRecord>
  /** Keyed by head: the renames inside that component. */
  chainOf: Map<string, RenameRecord[]>
  /** How many renames a key is from its head; `MAX_SAFE_INTEGER` when it never
   *  reaches it (the backwards step of a cycle). */
  stepsToHead: (key: string, head: string) => number
}

/**
 * The keys one rival has worn, resolved from the rename log.
 *
 * Exported because a READER has to expand its question before it asks it: a
 * caller that asks for today's rival keys (they come off `tracking_configs`,
 * so that is the normal case) would otherwise never fetch the months filed
 * under the old name, and `stitchRenames` would have nothing to stitch — the
 * line would silently start at the rename. Seed this with the keys asked for,
 * query on `namesOf(headOf(key))`, and key the answer by the head.
 *
 * Pure, and the same component walk `stitchRenames` does — the two cannot
 * disagree about which names are one rival because there is one walk.
 */
export function renameChains(seed: readonly string[], renames: readonly RenameRecord[]): RenameChains {
  const { headOf, namesOf } = chainsOf(seed, renames)
  return { headOf, namesOf }
}

function chainsOf(seed: readonly string[], renames: readonly RenameRecord[]): Chains {
  // One step out of each key: a rival was renamed TO something, once. A second
  // row for the same `from` is a correction of the first and is ignored.
  const next = new Map<string, RenameRecord>()
  for (const r of renames) if (r.from !== r.to && !next.has(r.from)) next.set(r.from, r)

  const keys = new Set<string>(seed)
  for (const [from, step] of next) { keys.add(from); keys.add(step.to) }

  // The keys one rival has worn, as a COMPONENT rather than a chain. Two names
  // renamed into one (A→C and B→C, which is what a merge looks like in the log)
  // is not a chain, and neither is A→B→A: walking forward from each key on its
  // own put the halves of both shapes in different groups, so one line's legend
  // lost a name and a swap drew two lines instead of one.
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let root = k
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) as string
    let walk = k
    while ((parent.get(walk) ?? walk) !== walk) { const up = parent.get(walk) as string; parent.set(walk, root); walk = up }
    return root
  }
  const union = (a: string, b: string) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  for (const k of keys) if (!parent.has(k)) parent.set(k, k)
  for (const [from, step] of next) union(from, step.to)

  const members = new Map<string, string[]>()
  for (const k of [...keys].sort()) members.set(find(k), [...(members.get(find(k)) ?? []), k])

  const headOf = new Map<string, string>()
  const chainOf = new Map<string, RenameRecord[]>()
  for (const [root, group] of members) {
    // The name the rival wears now: the one nothing renamed away. Renames are
    // one step out of each key, so a component has exactly one such key unless
    // it closes a cycle — and then the newest rename's target is the best
    // answer available, with the name as a tie-break so it is never arbitrary.
    const edges = group.map((k) => next.get(k)).filter((r): r is RenameRecord => Boolean(r))
    const terminal = group.filter((k) => !next.has(k)).sort()
    const newest = [...edges].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.to.localeCompare(b.to)))
    const head = terminal[0] ?? newest[newest.length - 1].to
    for (const k of group) headOf.set(k, head)
    chainOf.set(head, edges)
    void root
  }

  // How many renames a key is from the head, so the legend reads oldest first
  // and ends on the name the line is drawn under.
  const stepsToHead = (key: string, head: string): number => {
    let at = key
    for (let n = 0; n <= keys.size; n++) {
      if (at === head) return n
      const step = next.get(at)
      if (!step) return Number.MAX_SAFE_INTEGER
      at = step.to
    }
    return Number.MAX_SAFE_INTEGER
  }

  const namesOf = new Map<string, string[]>()
  for (const [, group] of members) {
    const head = headOf.get(group[0]) as string
    namesOf.set(
      head,
      [...group].sort((a, b) => {
        const d = stepsToHead(b, head) - stepsToHead(a, head)
        return d !== 0 ? d : a.localeCompare(b)
      }),
    )
  }

  return { headOf, namesOf, next, chainOf, stepsToHead }
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
 * `audience` and a `month`. The keys one rival has worn are found as a
 * component, not as a chain, so all three shapes a log written by people
 * actually contains come out as ONE line with every name in the legend:
 * A→B→C (drawn under C), A→C together with B→C (a merge, drawn under C, both
 * rules marked), and A→B→A (no key in a cycle is un-renamed, so the newest
 * rename's target is the name the line takes, and only the rules that carry it
 * towards that name are drawn).
 */
export function stitchRenames<P extends { audience: string; month: string }>(
  series: readonly P[],
  renames: readonly RenameRecord[],
): StitchedSeries<P>[] {
  const { headOf, namesOf, chainOf, stepsToHead } = chainsOf(series.map((p) => p.audience), renames)

  const grouped = new Map<string, P[]>()
  for (const p of series) {
    const head = headOf.get(p.audience) ?? p.audience
    grouped.set(head, [...(grouped.get(head) ?? []), p])
  }

  const out: StitchedSeries<P>[] = []
  for (const [head, points] of grouped) {
    const sorted = [...points].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
    const names = namesOf.get(head) ?? [head]
    const breaks: RenameBreak[] = []
    for (const step of chainOf.get(head) ?? []) {
      // Only the steps that carry a name TOWARDS the one the line is drawn
      // under. In a cycle the closing step points backwards, and a rule reading
      // "B is now called A" on a line labelled B is worse than no rule.
      if (stepsToHead(step.from, head) <= stepsToHead(step.to, head)) continue
      // The month the new key first appears. No months under it yet (a rival
      // renamed before its first reading) means no rule to draw.
      const first = sorted.find((p) => p.audience === step.to)
      if (!first) continue
      breaks.push({ month: first.month, from: step.from, to: step.to, at: step.at, label: renameLabel(step.from, step.to) })
    }
    breaks.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.from.localeCompare(b.from)))
    out.push({ audience: head, names, points: sorted, breaks })
  }
  return out.sort((a, b) => a.audience.localeCompare(b.audience))
}
