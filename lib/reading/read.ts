import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, mapWithLimit, MULTI_ROW_IN_CHUNK, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { CONFIG_CHANGES_TABLE, isMissingConfigLog, type ConfigChange } from '../config-log'
import { renameChains, renameFrom, type RenameChains, type RenameRecord } from '../rivals'
import { createAdminClient, selectAll } from '../supabase-admin'
import { idsKey, memoRead } from './memo'
import { isMissingMonthlyReading, isMissingMonthTable, monthEndInstant, monthStartOf } from './monthly'
import {
  buildSeries,
  mergeSeriesNotes,
  monthAxis,
  rankObjects,
  type DenominatorPoint,
  type MonthLabel,
  type MonthSeries,
  type NumeratorPoint,
  type ObjectWeight,
  type SeriesChange,
  type Substrate,
} from './series'
import {
  RPC_WINDOW_DENOMINATORS,
  RPC_WINDOW_THEME_READINGS,
  TABLE_DENOMINATORS,
  TABLE_SUBJECT_READINGS,
  TABLE_THEME_READINGS,
  type Audience,
  type PlatformMix,
} from './types'
import { isMissingSubjects, TABLE_SUBJECTS } from '../subjects/types'
import type { ObjectKind } from './verdicts'

// The reading layer's I/O — the only file here that touches a database
// (decision N).
//
// WHICH CLIENT, AND WHY IT IS THE SERVICE ROLE. The two month tables are
// readable by `authenticated` under a per-tenant SELECT policy, so a session
// client could select them. The four SQL functions cannot be: they take
// `p_client` as a PARAMETER, which makes a function a tenant could call a
// function a tenant could call with someone else's client id, so all four are
// `revoke all … from public, anon, authenticated` with execute granted to
// `service_role` only. A session-client reader is therefore permanently stuck
// with whatever the last run happened to write — no window, no week, no
// month-to-date — and a page and its own export would compute a horizon two
// different ways.
//
// So the reading takes the service role, inside a server component, with the
// tenant id taken from `getSessionContext()` and NEVER from a request
// parameter. That is the shape `/dashboard/ops/readiness` has used since it
// shipped. `ReadingHandle` is a client and a tenant id travelling together for
// exactly that reason: a loader that is handed the pair cannot accidentally
// read with a tenant id that came off the URL.
//
// THE THREE EMPTY ANSWERS ARE THREE ANSWERS. A read that finds nothing can mean
// the migration is not applied, the tenant has never been seeded, or the months
// asked for genuinely carried no conversation, and a reader that renders 0 for
// any of them is lying. `substrate` is settled here, once, and `buildSeries`
// spends it.
//
// COLUMNS THAT MAY NOT EXIST YET. `clustering_key` (M2) and
// `config_changes.affects_audiences` / `.affects_months` (M1) are applied by
// hand in one window before R1, and a deploy can land first. Every read here is
// `select('*')` rather than a column list, so an absent column arrives as an
// absent key on a plain object instead of a 42703 that takes the page down —
// and every type that names those columns has them optional.

export interface ReadingHandle {
  client: SupabaseClient
  clientId: string
}

/** The reading client: the service role. Never built from a request; a caller
 *  pairs it with the tenant id the session already pinned. */
export function readingClient(): SupabaseClient {
  return createAdminClient()
}

/**
 * The handle a loader is given. `client` is injectable so an operator script or
 * a test can pass its own.
 *
 * BUILT ON FIRST READ, not on construction. `Scope.reading` is required, so
 * every dashboard route now fills it — including three loaders that read no
 * month at all (the thread page, Content, Voice). Eagerly, that meant
 * `createAdminClient()` on every render of every page: a service-role client in
 * scope for every loader in the app, one careless
 * `reading.client.from('<not a month table>')` away from an RLS bypass, and a
 * hard requirement for SUPABASE_SERVICE_ROLE_KEY at render time on pages that
 * never needed it (lib/supabase-admin.ts asserts the key with `!` and
 * createClient throws on undefined). The getter keeps decision N's pairing —
 * the client and the tenant id still travel together, and a loader still cannot
 * separate them — and costs nothing where no month is read.
 */
export function readingHandle(clientId: string, client?: SupabaseClient): ReadingHandle {
  let made = client
  return {
    clientId,
    get client(): SupabaseClient {
      return (made ??= readingClient())
    },
  }
}

// ---- The stored month series -------------------------------------------------

export interface MonthSeriesOptions {
  /** The audience keys to read. Every audience the tenant has when omitted —
   *  which is what a coverage or "since we started" read wants. Either name of
   *  a renamed rival names the whole line: the months under the other name are
   *  fetched too, and the series comes back keyed by the newest name. */
  audiences?: readonly Audience[]
  /** What the numerators are. Only `theme` has a table today; `subject` and
   *  `kind` get theirs in M4 and M5, and this is where they attach. */
  objectKind?: ObjectKind
  /** The objects to read numerators for. With none, the result is the
   *  denominator series alone — an audience's own conversation, month by
   *  month. */
  objectIds?: readonly string[]
  /** The axis, inclusive at both ends. Any day in a month names the month. */
  from: string
  to: string
  /** `min(config_changes.changed_at)` is read here too unless a caller has it. */
  changeLogFrom?: string | null
  /** Delivered updates per month start, and the month of the tenant's first
   *  one — decision M's thin-month rule needs both, and without them its first
   *  arm ("fewer than two updates in a month after we started") can never
   *  fire. Read here off `pipeline_runs` unless a caller already holds them;
   *  `updatesByMonth: {}` reads nothing and leaves the arm off. A run count is
   *  a run-indexed number and is a period key for NOTHING else (AGENTS.md). */
  updatesByMonth?: Readonly<Record<string, number>>
  firstRunMonth?: string | null
}

export interface MonthSeriesSet {
  substrate: Substrate
  /** The NUMERATOR table's own substrate — `missing` where the migration that
   *  creates it has not been applied here, and equal to `substrate` otherwise.
   *  A caller that asked for no objects gets the denominator's answer. */
  numeratorSubstrate: Substrate
  /** One per RIVAL asked for, per object asked for — a renamed rival is one
   *  series under its newest name, not one per stored key. */
  series: MonthSeries[]
  /** Every denominator row read, unfolded — what `sinceStart` and a coverage
   *  line are computed from. */
  denominators: DenominatorPoint[]
  /** The renames stitched into the series above, for a caller that wants to
   *  name them in prose. */
  renames: RenameRecord[]
  /** Every series' notes, said once. A set of series repeats the change-log
   *  boundary and the unrecorded-grouping stretches on each of them; a surface
   *  reading the set prints THESE, not `series[n].notes`. */
  notes: MonthLabel[]
  changeLogFrom: string | null
}

type StoredDenominator = DenominatorPoint & { platform_mix?: PlatformMix }
type StoredNumerator = NumeratorPoint & { theme_id?: string; platform_mix?: PlatformMix }

const NUMERATOR_TABLE: Partial<Record<ObjectKind, string>> = {
  theme: TABLE_THEME_READINGS,
  // M4's sibling (Phase 1 WP12). It carries the same five columns the series
  // reads — month, audience, videos, comments, run_id — so it attaches here
  // rather than growing a second loader beside this one. What differs is the
  // COMPARABILITY key: a theme month is comparable with another under an equal
  // `run_id`, a subject month under an equal `judge_version`, and a subject's
  // rows carry no clustering fingerprint at all (lib/subjects/read.ts). That
  // difference lives in the readers, not here.
  subject: TABLE_SUBJECT_READINGS,
}

/** `month_theme_readings.theme_id` is the stable `theme_registry` identity, and
 *  the id column the sibling tables of M4/M5 carry is their own. */
const NUMERATOR_ID_COLUMN: Partial<Record<ObjectKind, string>> = {
  theme: 'theme_id',
  subject: 'subject_id',
}

/**
 * Which numerator kinds have a clustering to be like-for-like about.
 *
 * ONLY A THEME DOES. `month_subject_readings` carries no `clustering_key`
 * column at all — `subjectMonthSide` sets `clustering: false` deliberately,
 * because a subject's membership is not a clustering artefact and its months
 * ARE comparable across a re-grouping — and `buildSeries` did not know that: it
 * read `r.clustering_key ?? null` off the numerator rows, got null everywhere,
 * and `clusteringBoundaries` marked every month but the first `unknown` (two
 * nulls are never equal, by design). Exercised directly on subject-shaped rows,
 * the series came back carrying "We did not record how themes were grouped for
 * Jun 2026 to Sep 2026, so those months are not strictly comparable with the
 * ones after them" — off-topic for a subject, and false.
 *
 * It does not reach a screen today: `subjectNotes` filters `clustering_changed`
 * out on the Subjects page, and the numerator table is unapplied on production
 * so no boundary is computed at all. It appears the moment M4 lands, for any
 * OTHER reader of a subject series — WP18's monthly report, WP19's briefs — and
 * the page-level filter would not catch it, being a blanket
 * `kind !== 'clustering_changed'` that would swallow a genuine `changed` note
 * too.
 *
 * So the fact is stated here, where the numerator table is chosen, rather than
 * left for each reader to remember.
 */
const NUMERATOR_HAS_CLUSTERING: Partial<Record<ObjectKind, boolean>> = {
  theme: true,
  subject: false,
}

/** Every key one rival has worn, including the one asked for. A key nothing was
 *  renamed to or from answers with itself. */
function namesFor(chains: RenameChains, audience: string): string[] {
  const head = chains.headOf.get(audience) ?? audience
  return chains.namesOf.get(head) ?? [audience]
}

/**
 * The stored months for one axis, one set of audiences and one set of objects.
 *
 * Paged with `selectAll` on a UNIQUE order — each table's primary key minus the
 * tenant — because a page break on a non-unique key can skip a row, and a
 * skipped row here is a month that silently disappears from a chart. Össur's
 * whole-history theme read is 1,346 rows and Sealand's 1,526, so the 1,000-row
 * cap is not hypothetical: it is crossed by both tenants at "last 12 months".
 */
export async function loadMonthSeries(
  client: SupabaseClient,
  clientId: string,
  options: MonthSeriesOptions,
): Promise<MonthSeriesSet> {
  const from = monthStartOf(options.from)
  const to = monthStartOf(options.to)
  const asked = options.audiences ? [...new Set(options.audiences)] : null
  const objectIds = options.objectIds ? [...new Set(options.objectIds)] : null
  const objectKind = options.objectKind ?? null

  // THE RENAMES ARE READ FIRST, BECAUSE THEY WIDEN THE QUESTION. A caller's
  // audience keys come off `tracking_configs`, so they are today's names; the
  // months a renamed rival carried under its old name are filed under the old
  // key and always will be (a frozen row cannot be re-keyed). Asking the
  // database for today's key alone fetches half the line and `stitchRenames`
  // has nothing to stitch — the line silently starts at the rename. So the ask
  // is expanded through the chain before the query, and the answer is keyed by
  // the head, which is also what stops one rival coming back as two series
  // when the caller named no audiences at all.
  // THE THREE READS THAT DEPEND ON NOTHING GO FIRST, TOGETHER. The change log,
  // the object labels and the tenant's update count are each a function of the
  // arguments alone — none of them waits on the month rows — and they were
  // awaited one after another around the reads that do. Started here and
  // collected at the bottom, they cost one wait instead of three. (A rejection
  // is collected at the bottom too, so it still fails the load; `void` on the
  // handles keeps an early throw elsewhere from being an unhandled rejection.)
  const table = objectKind ? NUMERATOR_TABLE[objectKind] : undefined
  const idColumn = objectKind ? NUMERATOR_ID_COLUMN[objectKind] : undefined
  const labelsAhead = table && objectIds ? loadLabels(client, clientId, objectKind, objectIds) : null
  const updatesAhead =
    options.updatesByMonth !== undefined || options.firstRunMonth !== undefined
      ? null
      : loadUpdates(client, clientId, from, to)
  labelsAhead?.catch(() => {})
  updatesAhead?.catch(() => {})

  const changes = await loadChanges(client, clientId)
  const renames = changes.map(renameFrom).filter((r): r is RenameRecord => r != null)
  const askedChains = renameChains(asked ?? [], renames)
  const audiences = asked
    ? [...new Set(asked.flatMap((a) => namesFor(askedChains, a)))]
    : null

  // THE NUMERATORS GO OUT WITH THE DENOMINATORS. They were read after, because
  // the numerator read is skipped when the denominator table turns out not to
  // exist — but `month_denominators` is applied and the skip is for a case that
  // is not the live one, so the page paid a whole round trip to learn something
  // it almost always already knows. Started here and judged below: where the
  // substrate is not `seeded` the answer is dropped unread, exactly as if it
  // had never been asked for.
  //
  // MULTI_ROW_IN_CHUNK, NOT THE UUID SIZE. One object id names a row per month
  // per audience here (the reading tables are keyed
  // (client_id, month, audience, <object>)), so a twelve-month window over five
  // audiences is ~60 rows an id: 100 ids is one 1,000-row page and a bit, 250
  // would be six pages read one after another inside a single chunk. The win in
  // this read is that the chunks go out TOGETHER at all; a wider chunk would
  // take that back.
  const numeratorsAhead =
    table && idColumn && objectIds && objectIds.length > 0
      ? mapWithLimit(chunk(objectIds, MULTI_ROW_IN_CHUNK), READ_CONCURRENCY, (ids) =>
          selectAll<StoredNumerator>(() => {
            let q = client
              .from(table)
              .select('*')
              .eq('client_id', clientId)
              .gte('month', from)
              .lte('month', to)
              .in(idColumn, ids)
            if (audiences) q = q.in('audience', audiences)
            return q
              .order('month', { ascending: true })
              .order('audience', { ascending: true })
              .order(idColumn, { ascending: true })
          }),
        )
      : null
  numeratorsAhead?.catch(() => {})

  let substrate: Substrate = 'seeded'
  let denominators: StoredDenominator[] = []
  try {
    denominators = await selectAll<StoredDenominator>(() => {
      let q = client
        .from(TABLE_DENOMINATORS)
        .select('*')
        .eq('client_id', clientId)
        .gte('month', from)
        .lte('month', to)
      if (audiences) q = q.in('audience', audiences)
      return q.order('month', { ascending: true }).order('audience', { ascending: true })
    })
  } catch (error) {
    if (!isMissingMonthlyReading(error)) throw error
    substrate = 'missing'
  }

  // Nothing in the window is not nothing at all: ask the tenant-wide question
  // before deciding which silence this is. One row is enough to answer it.
  if (substrate === 'seeded' && denominators.length === 0) {
    const probe = await client.from(TABLE_DENOMINATORS).select('month').eq('client_id', clientId).limit(1)
    if (probe.error) {
      if (!isMissingMonthlyReading(probe.error)) throw new Error(`${TABLE_DENOMINATORS} probe: ${probe.error.message}`)
      substrate = 'missing'
    } else if ((probe.data ?? []).length === 0) {
      substrate = 'not_seeded'
    }
  }

  const numerators: StoredNumerator[] = []
  // THE NUMERATOR HAS ITS OWN SUBSTRATE, and telling it apart from silence is
  // the point. `month_denominators` is applied and seeded on production;
  // `month_subject_readings` is not, and will not be until W1. Without this the
  // subject series came back as an axis of hollow months — "nothing was said"
  // — for a table that does not exist, which is the one confusion this whole
  // layer is built to prevent. It is the denominator read's own `isMissing`
  // shape, narrow by name, applied one table down.
  let numeratorSubstrate: Substrate = substrate
  if (substrate === 'seeded' && numeratorsAhead) {
    try {
      // The chunks are disjoint by object id, so they were sent at once and are
      // concatenated in chunk order — the same per-id ordering a serial loop
      // gave.
      for (const part of await numeratorsAhead) numerators.push(...part)
    } catch (error) {
      if (!isMissingMonthTable(error) && !isMissingSubjects(error)) throw error
      numeratorSubstrate = 'missing'
      numerators.length = 0
    }
  }

  const changeLogFrom =
    options.changeLogFrom !== undefined ? options.changeLogFrom : firstLoggedAt(changes)
  const seriesChanges: SeriesChange[] = changes.map((c) => ({
    changed_at: c.changed_at,
    surface: c.surface,
    note: c.note ?? null,
    months: c.affects_months ?? null,
    source: c.source ?? null,
  }))

  const labels = labelsAhead ? await labelsAhead : new Map<string, string>()
  const updates = updatesAhead
    ? await updatesAhead
    : { byMonth: options.updatesByMonth ?? {}, firstRunMonth: options.firstRunMonth ?? null }

  // One key per RIVAL, not per stored string: a renamed rival holds months
  // under both names, and keying by the raw distinct set would return the same
  // line twice — a duplicated chart line, and a double count for a caller that
  // sums across `series`.
  const seed = asked ?? denominators.map((d) => d.audience)
  const chains = asked ? askedChains : renameChains(seed, renames)
  const keys = [...new Set(seed.map((a) => chains.headOf.get(a) ?? a))]
  const numeratorById = new Map<string, StoredNumerator[]>()
  for (const row of numerators) {
    const id = String((row as unknown as Record<string, unknown>)[idColumn as string] ?? '')
    numeratorById.set(id, [...(numeratorById.get(id) ?? []), row])
  }

  const axis = monthAxis(from, to)
  const series: MonthSeries[] = []
  for (const audience of keys.length > 0 ? keys : ['']) {
    if (!objectIds || objectIds.length === 0) {
      series.push(
        buildSeries({
          axis,
          audience,
          denominators,
          changes: seriesChanges,
          renames,
          substrate,
          changeLogFrom,
          updatesByMonth: updates.byMonth,
          firstRunMonth: updates.firstRunMonth,
        }),
      )
      continue
    }
    for (const objectId of objectIds) {
      series.push(
        buildSeries({
          axis,
          audience,
          denominators,
          readings: numeratorById.get(objectId) ?? [],
          changes: seriesChanges,
          renames,
          // The OBJECT's substrate, not the denominator's: a series whose
          // numerator table is absent says "not recorded", never "nothing was
          // said" (lib/reading/series.ts MonthState).
          substrate: numeratorSubstrate,
          changeLogFrom,
          updatesByMonth: updates.byMonth,
          firstRunMonth: updates.firstRunMonth,
          // No clustering, no boundaries — never "we did not record it".
          ...(objectKind && NUMERATOR_HAS_CLUSTERING[objectKind] === false ? { regimes: [] } : {}),
          objectId,
          objectLabel: labels.get(objectId) ?? null,
        }),
      )
    }
  }

  return { substrate, numeratorSubstrate, series, denominators, renames, notes: mergeSeriesNotes(series), changeLogFrom }
}

/** The runs that DELIVERED something, per month, and the month of the first one
 *  ever. `completed` and `partial` are what every other surface counts as an
 *  update (lib/pages/*.ts), and a month before the first of them is read back at
 *  setup rather than thin — which is decision M's own gate, and the only reason
 *  the thin rule may look at a run date at all. */
async function loadUpdates(
  client: SupabaseClient,
  clientId: string,
  from: string,
  to: string,
): Promise<{ byMonth: Record<string, number>; firstRunMonth: string | null }> {
  const delivered = ['completed', 'partial']
  // The two reads are independent — the axis's runs and the tenant's very first
  // — and were awaited one after the other. Memoised together on the axis,
  // because a page draws several series over the same months.
  const [runs, first] = await memoRead(client, `reading:updates:${clientId}:${from}:${to}`, () =>
    Promise.all([
      selectAll<{ started_at: string | null }>(() =>
        client
          .from('pipeline_runs')
          .select('id, started_at')
          .eq('client_id', clientId)
          .in('status', delivered)
          .gte('started_at', `${from}T00:00:00.000Z`)
          .lt('started_at', monthEndInstant(to))
          .order('started_at', { ascending: true })
          .order('id', { ascending: true }),
      ),
      client
        .from('pipeline_runs')
        .select('started_at')
        .eq('client_id', clientId)
        .in('status', delivered)
        .not('started_at', 'is', null)
        .order('started_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]),
  )
  const byMonth: Record<string, number> = {}
  for (const run of runs) {
    if (!run.started_at) continue
    const month = monthStartOf(run.started_at)
    byMonth[month] = (byMonth[month] ?? 0) + 1
  }

  if (first.error) throw new Error(`pipeline_runs first run: ${first.error.message}`)
  const startedAt = (first.data as { started_at?: string | null } | null)?.started_at ?? null
  return { byMonth, firstRunMonth: startedAt ? monthStartOf(startedAt) : null }
}

/** Every change this tenant has logged, oldest first. An empty list when the
 *  log does not exist yet — the readiness precedent: a reader says "not
 *  recorded", it does not fail. */
function loadChanges(client: SupabaseClient, clientId: string): Promise<ConfigChange[]> {
  // MEMOISED, because every series on a page asks for it: a change log is a
  // tenant-wide fact, and one loadOverview read it three times over the same
  // 102 rows. The list is treated as readonly everywhere here.
  return memoRead(client, `reading:changes:${clientId}`, async () => {
    try {
      return await selectAll<ConfigChange>(() =>
        client
          .from(CONFIG_CHANGES_TABLE)
          .select('*')
          .eq('client_id', clientId)
          .order('changed_at', { ascending: true })
          .order('id', { ascending: true }),
      )
    } catch (error) {
      if (isMissingConfigLog(error)) return []
      throw error
    }
  })
}

/** The first REAL entry: reconstructed rows are inference from what each update
 *  searched, and dating the boundary from one would say the log begins before
 *  anything was actually recorded. */
function firstLoggedAt(changes: readonly ConfigChange[]): string | null {
  const logged = changes.filter((c) => c.source !== 'reconstructed').map((c) => c.changed_at).sort()
  return logged[0] ?? null
}

/** The objects' display labels. Never a key — theme labels churn ~88% run to
 *  run, which is the whole reason `theme_registry.id` exists. */
function loadLabels(
  client: SupabaseClient,
  clientId: string,
  objectKind: ObjectKind | null,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (objectKind !== 'subject' && objectKind !== 'theme') return Promise.resolve(new Map())
  // The chunks are disjoint by id and were awaited ONE AT A TIME; an id names
  // at most one label, so a wider chunk is strictly fewer requests and they can
  // all go at once. Memoised on the asked-for set, because two blocks drawing
  // the same objects want the same names (Overview read theme_registry twice
  // for the same 120 ids).
  return memoRead(client, `reading:labels:${clientId}:${objectKind}:${idsKey(ids)}`, async () => {
    const out = new Map<string, string>()
    const parts = chunk([...new Set(ids)], UUID_IN_CHUNK)
    // A SUBJECT'S LABEL IS ITS NAME, and the name is the client's own words
    // rather than a clustering artefact — which is the difference the two
    // branches are about, not the table they read.
    const table = objectKind === 'subject' ? TABLE_SUBJECTS : 'theme_registry'
    const column = objectKind === 'subject' ? 'name' : 'canonical_label'
    const answers = await mapWithLimit(parts, READ_CONCURRENCY, (part) =>
      Promise.resolve(
        client
          .from(table)
          .select(objectKind === 'subject' ? 'id, name' : 'id, canonical_label')
          .eq('client_id', clientId)
          .in('id', part),
      ),
    )
    for (const { data, error } of answers) {
      if (error) {
        // The names collected so far are still names. The serial loop this
        // replaced returned what it had when M3 turned out to be unapplied, and
        // a caller that gets a partial map falls back to "an unnamed subject"
        // for the rest — so handing back an empty one would lose labels that
        // were read successfully. (Reachable only if one chunk answers and
        // another says the table is missing, which the database does not
        // really do; kept because the answer to "what did we learn" is not
        // "nothing" either way.)
        if (objectKind === 'subject' && isMissingSubjects(error)) return out
        throw new Error(`${table} labels: ${error.message}`)
      }
      for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
        const label = row[column]
        const id = row.id
        if (id && label) out.set(id, label)
      }
    }
    return out
  })
}

// ---- The windowed figure -----------------------------------------------------

export interface WindowDenominator {
  audience: Audience
  videos: number
  comments: number
  platform_mix: PlatformMix
  dual_mention: number
  excluded_undated: number
}

export interface WindowThemeReading {
  audience: Audience
  theme_id: string
  videos: number
  comments: number
  platform_mix: PlatformMix
  excluded_on_camera: number
  excluded_undated: number
}

export interface WindowReadingOptions {
  from: string
  to: string
  audiences?: readonly Audience[]
  /** The clustering to read theme numerators under. With none, only the
   *  denominators are read — which is the shape most pages want, and the one
   *  that costs a single cheap call. */
  runId?: string | null
  objectIds?: readonly string[]
}

export interface WindowReading {
  /** Null when the functions are not applied yet — told apart from an empty
   *  read, exactly as the month series tells its silences apart. */
  denominators: WindowDenominator[] | null
  themes: WindowThemeReading[] | null
}

/**
 * The one windowed figure a page states in prose.
 *
 * Not a sum of month rows, ever: `videos` is a count of DISTINCT videos and a
 * video whose thread spans two months is a member of both months' sets.
 * Measured on the seeded rows, summing overstates Össur's own brand by 38.7%
 * over twelve months and by 90.9% since its first stored month — which crosses
 * the 100-video floor and turns a refusal into an answer. Comments do sum
 * exactly, so a comment-denominated figure could be taken off the series; a
 * video-denominated one could not, and the product's unit is videos.
 */
export async function loadWindowReading(
  client: SupabaseClient,
  clientId: string,
  options: WindowReadingOptions,
): Promise<WindowReading> {
  const audiences = options.audiences ? new Set(options.audiences) : null
  const objectIds = options.objectIds ? new Set(options.objectIds) : null

  let denominators: WindowDenominator[] | null = null
  try {
    denominators = await selectAll<WindowDenominator>(() =>
      client
        .rpc(RPC_WINDOW_DENOMINATORS, { p_client: clientId, p_from: options.from, p_to: options.to })
        .order('audience', { ascending: true }),
    )
  } catch (error) {
    if (!isMissingMonthlyReading(error)) throw error
  }

  let themes: WindowThemeReading[] | null = null
  if (options.runId) {
    try {
      themes = await selectAll<WindowThemeReading>(() =>
        client
          .rpc(RPC_WINDOW_THEME_READINGS, {
            p_client: clientId,
            p_run: options.runId,
            p_from: options.from,
            p_to: options.to,
          })
          .order('audience', { ascending: true })
          .order('theme_id', { ascending: true }),
      )
    } catch (error) {
      if (!isMissingMonthlyReading(error)) throw error
    }
  }

  return {
    denominators: denominators
      ? denominators.filter((d) => !audiences || audiences.has(d.audience))
      : null,
    themes: themes
      ? themes.filter((t) => (!audiences || audiences.has(t.audience)) && (!objectIds || objectIds.has(t.theme_id)))
      : null,
  }
}

// ---- Which objects to draw at all --------------------------------------------

export interface TopObjectsOptions {
  /** Only `theme` has a table today; M4 and M5 attach their own here, exactly
   *  as `loadMonthSeries` does. */
  objectKind?: ObjectKind
  audiences?: readonly Audience[]
  from: string
  to: string
  /** How many objects per audience. */
  limit?: number
}

export interface TopObject {
  audience: Audience
  objectId: string
  label: string | null
  /** Comments over the months read — the ONE figure that sums across month
   *  rows exactly. Ranking weight, never a printed number. */
  comments: number
  months: number
}

/**
 * The objects worth drawing on an axis, largest first, per audience.
 *
 * The seam WP9/WP10 need and `loadMonthSeries` deliberately does not have: it
 * reads numerators only for the object ids a caller already holds, and
 * Overview and Voice do not hold them — they want "the largest themes of this
 * window" before they can ask for anything. This is that question, answered
 * off the same stored month rows, so the ranking and the series are read from
 * one record.
 *
 * It ranks by COMMENTS and returns no video count on purpose: comments sum
 * across month rows exactly and videos do not (a video whose thread spans two
 * months is a member of both months' sets). A caller that wants an object's
 * figure over the window reads `loadWindowReading`, which counts distinct
 * videos in one pass.
 */
export async function loadTopObjects(
  client: SupabaseClient,
  clientId: string,
  options: TopObjectsOptions,
): Promise<TopObject[]> {
  const objectKind = options.objectKind ?? 'theme'
  const table = NUMERATOR_TABLE[objectKind]
  const idColumn = NUMERATOR_ID_COLUMN[objectKind]
  if (!table || !idColumn) return []
  const from = monthStartOf(options.from)
  const to = monthStartOf(options.to)
  const limit = options.limit ?? 10

  const asked = options.audiences ? [...new Set(options.audiences)] : null
  let audiences: string[] | null = null
  // ONE KEY PER RIVAL, exactly as loadMonthSeries folds its own: the ask is
  // widened through the rename chain, so a rival renamed A → B comes back under
  // both strings, and ranking under the RAW string returned two audience groups
  // with a top-N each, both ranked on half the object's comments. Worse than a
  // duplicate, because loadMonthSeries folds to one: this loader chooses which
  // themes to draw and that one draws them, so the ranking and the series would
  // disagree about what the audience is and the page would draw the wrong N
  // themes with the wrong weights.
  let headOf = new Map<string, string>()
  if (asked) {
    const changes = await loadChanges(client, clientId)
    const chains = renameChains(asked, changes.map(renameFrom).filter((r): r is RenameRecord => r != null))
    audiences = [...new Set(asked.flatMap((a) => namesFor(chains, a)))]
    headOf = chains.headOf
  }

  let rows: StoredNumerator[] = []
  try {
    rows = await selectAll<StoredNumerator>(() => {
      let q = client
        .from(table)
        .select('*')
        .eq('client_id', clientId)
        .gte('month', from)
        .lte('month', to)
      if (audiences) q = q.in('audience', audiences)
      return q
        .order('month', { ascending: true })
        .order('audience', { ascending: true })
        .order(idColumn, { ascending: true })
    })
  } catch (error) {
    if (!isMissingMonthlyReading(error)) throw error
    return []
  }

  const weights = new Map<string, ObjectWeight>()
  for (const row of rows) {
    const objectId = String((row as unknown as Record<string, unknown>)[idColumn] ?? '')
    if (!objectId) continue
    const audience = headOf.get(row.audience) ?? row.audience
    const key = `${audience}\u0000${objectId}`
    const held = weights.get(key)
    weights.set(key, {
      audience,
      objectId,
      comments: (held?.comments ?? 0) + (row.comments ?? 0),
      months: (held?.months ?? 0) + 1,
    })
  }

  const ranked = rankObjects([...weights.values()], limit)
  const labels = await loadLabels(client, clientId, objectKind, [...new Set(ranked.map((r) => r.objectId))])
  return ranked.map((r) => ({ ...r, label: labels.get(r.objectId) ?? null }))
}
