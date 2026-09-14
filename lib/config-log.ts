import { dbSafeJson, dbSafeText } from './db-text'
import { isMissingColumnError } from './supabase-admin'

// The configuration change log (Phase 0, design item 16).
//
// Every configuration surface in this product is a single mutable row that is
// overwritten in place, and until now nothing recorded that it moved. The cost
// of that shows up whenever a number changes shape: Sealand's rival set was
// rewritten on 2026-09-09 and the corpus re-tag that followed moved 253 stored
// videos and 84 themes out of their buckets, with nothing anywhere saying what
// changed, when, from what, or who did it.
//
// The log is written three ways, and all three are needed:
//
//   trigger        `tracking_configs_audit` fires on every UPDATE of the config
//                  row, whoever made it. It is the ONLY path that catches a
//                  write no code made — the tenth write path in production is a
//                  hand-typed UPDATE in the SQL editor. It records what moved
//                  and when, and can only ever name a ROLE unless the write
//                  site stamped `last_actor` in the same statement.
//   logged         `recordConfigChange`, at the write sites the trigger cannot
//                  see: a schedule save, a corpus re-tag, a re-gate, the INSERT
//                  that gives a new tenant its first configuration.
//   reconstructed  scripts/reconstruct-config-log.ts, for the history that
//                  predates the log. Inference at gather granularity, with
//                  35- and 39-day blind windows. Every such row's `note` names
//                  its evidence, and `changeLogBoundary` prints the line that
//                  keeps a reader from reading inference as record.
//
// The actor is the half a trigger cannot supply. Measured in production: a
// tenant's session client presents as `authenticated` with auth.uid() = that
// person, while the service role and the SQL editor both present with a null
// auth.uid() — and the workspace switcher deliberately hands a platform
// admin's writes to the service-role client (lib/auth.ts), so the operator
// edits most worth logging are exactly the ones the database sees as anonymous.
// `actorStamp` + `withActor` carry the person into the same UPDATE.

// ---- Vocabulary -------------------------------------------------------------

/** Which configuration moved — grouped by what a reader goes looking for, not
 *  by column. Mirrors the config_changes surface CHECK. */
export const CONFIG_SURFACES = [
  'terms', 'rivals', 'handles', 'platforms', 'subreddits', 'cadence', 'knobs',
  'schedule', 'subjects', 'entity_retag', 'regate', 'other',
] as const
export type ConfigSurface = (typeof CONFIG_SURFACES)[number]

/** Who moved it. Mirrors the config_changes actor_kind CHECK. */
export const ACTOR_KINDS = ['user', 'operator', 'script', 'pipeline', 'sql', 'reconstructed'] as const
export type ActorKind = (typeof ACTOR_KINDS)[number]

export type ChangeSource = 'logged' | 'trigger' | 'reconstructed'

/** The `tracking_configs` columns the trigger watches, in the trigger's order.
 *  `updated_at` and `last_actor` are deliberately absent: a write that only
 *  re-stamps the actor is not a configuration change. `report_emails` is absent
 *  because nothing has written it since recipients moved to report_schedules. */
export const WATCHED_CONFIG_COLUMNS = [
  'brand_keywords', 'competitor_keywords', 'industry_keywords', 'exclude_terms',
  'competitor_names', 'own_handles', 'competitor_handles', 'platforms', 'subreddits',
  'report_period', 'report_day', 'max_videos', 'max_comments', 'comment_depth',
] as const
export type WatchedConfigColumn = (typeof WATCHED_CONFIG_COLUMNS)[number]

const SURFACE_BY_COLUMN: Record<WatchedConfigColumn, ConfigSurface> = {
  brand_keywords: 'terms',
  competitor_keywords: 'terms',
  industry_keywords: 'terms',
  exclude_terms: 'terms',
  competitor_names: 'rivals',
  own_handles: 'handles',
  competitor_handles: 'handles',
  platforms: 'platforms',
  subreddits: 'subreddits',
  report_period: 'cadence',
  report_day: 'cadence',
  max_videos: 'knobs',
  max_comments: 'knobs',
  comment_depth: 'knobs',
}

/** The surface a `tracking_configs` column belongs to. Must agree with the
 *  CASE in the tracking_configs_audit trigger — the same change reaching the
 *  log by the two routes has to read the same way. */
export function surfaceForColumn(column: string): ConfigSurface {
  return SURFACE_BY_COLUMN[column as WatchedConfigColumn] ?? 'other'
}

// ---- The row ----------------------------------------------------------------

/** One `config_changes` row, as stored. */
export interface ConfigChange {
  id: string
  client_id: string
  changed_at: string
  surface: ConfigSurface
  field: string | null
  before: unknown
  after: unknown
  actor_kind: ActorKind
  actor_user_id: string | null
  actor_label: string | null
  run_id: string | null
  source: ChangeSource
  rows_affected: number | null
  note: string | null
}

/** Who made a write, carried from the write site into the same UPDATE as the
 *  change itself (`tracking_configs.last_actor`) or straight onto a logged row.
 *
 *  `at` and `nonce` are part of the stamp on purpose. The trigger's "is this
 *  stamp fresh" test is `NEW.last_actor is distinct from OLD.last_actor`, so
 *  two writes carrying a byte-identical stamp make the second one read as
 *  unstamped — and an unstamped service-role write is logged as `pipeline`,
 *  which is the one attribution that is certainly false for a person's edit.
 *  `at` alone leaves that to millisecond resolution; the nonce settles it. */
export interface ConfigActor {
  kind: ActorKind
  user_id: string | null
  label: string | null
  at: string
  /** Unique per statement, so freshness never depends on the clock. Optional
   *  only for the paths that never touch `last_actor` (a logged row builds its
   *  own actor); `withActor` fills one in when a stamp arrives without one. */
  nonce?: string
  /** The update this write belongs to — the pipeline's own config writes. */
  run_id?: string | null
}

/** A value no other statement will carry. `crypto` is on globalThis in every
 *  runtime this repo runs in; the fallback keeps a stamp unique rather than
 *  throwing if one ever is not. */
function statementNonce(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return c?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export interface ConfigChangeInput {
  clientId: string
  surface: ConfigSurface
  field?: string | null
  before?: unknown
  after?: unknown
  actor: ConfigActor
  /** Overrides actor.run_id when a row belongs to a different update than the
   *  actor does (reconstruction rows evidenced by one update's gather). */
  runId?: string | null
  source?: ChangeSource
  rowsAffected?: number | null
  note?: string | null
  /** When the change happened, if that is not now — reconstruction only. */
  changedAt?: string | null
}

/** A change input as the database takes it. Model-derived text can reach here
 *  (the term suggester's words end up in brand/industry keywords), so every
 *  value bound for a text or jsonb column goes through db-text first. */
export function changeRow(input: ConfigChangeInput): Record<string, unknown> {
  const runId = input.runId !== undefined ? input.runId : (input.actor.run_id ?? null)
  return {
    client_id: input.clientId,
    ...(input.changedAt ? { changed_at: input.changedAt } : {}),
    surface: input.surface,
    field: input.field ?? null,
    before: input.before === undefined ? null : dbSafeJson(input.before),
    after: input.after === undefined ? null : dbSafeJson(input.after),
    actor_kind: input.actor.kind,
    actor_user_id: input.actor.user_id,
    actor_label: input.actor.label === null || input.actor.label === undefined
      ? null
      : dbSafeText(input.actor.label),
    run_id: runId,
    source: input.source ?? 'logged',
    rows_affected: input.rowsAffected ?? null,
    note: input.note ? dbSafeText(input.note) : null,
  }
}

// ---- Actors -----------------------------------------------------------------

/** What `actorStamp` needs from a session. Structural on purpose: the settings
 *  actions pass their `getSessionContext()` result straight in. */
export interface ActorSession {
  userId: string
  email?: string
  operator?: { isHome: boolean } | null
}

/** The person behind a product write.
 *
 *  A platform admin is an `operator` whether or not they are inside someone
 *  else's workspace — the distinction that matters to a reader of the log is
 *  "the tenant changed this" vs "we changed this". Which workspace they were
 *  standing in goes in the label, because that is what the switcher hides from
 *  the database.
 *
 *  `detail` names the statement, so two writes in one save (search terms, then
 *  exclusions) are legible in the log; the nonce, not the detail, is what keeps
 *  the trigger from reading the second one as stale.
 *
 *  On a browser (`authenticated`) write the database overrides kind, user and
 *  label from identity — a session that can write `last_actor` could otherwise
 *  claim to be anyone. What this stamp actually carries across is the operator
 *  case, which arrives on the service-role client the switcher uses. */
export function actorStamp(session: ActorSession, detail?: string, now: Date = new Date()): ConfigActor {
  const operating = Boolean(session.operator)
  const who = session.email ?? session.userId
  const where = session.operator && !session.operator.isHome ? ' · operator view' : ''
  return {
    kind: operating ? 'operator' : 'user',
    user_id: session.userId,
    label: `${who}${where}${detail ? ` · ${detail}` : ''}`,
    at: now.toISOString(),
    nonce: statementNonce(),
  }
}

/** An operator CLI. The label is the command, so the log says what to re-read. */
export function scriptActor(label: string, now: Date = new Date()): ConfigActor {
  return { kind: 'script', user_id: null, label, at: now.toISOString(), nonce: statementNonce() }
}

/** The pipeline writing its own configuration — today only subreddit
 *  discovery, which rewrites the community list on roughly every weekly
 *  gather. Stamped with the run so a week of churn is attributable. */
export function pipelineActor(runId: string, label: string, now: Date = new Date()): ConfigActor {
  return { kind: 'pipeline', user_id: null, label, at: now.toISOString(), nonce: statementNonce(), run_id: runId }
}

/** Inference, not record. Used only by scripts/reconstruct-config-log.ts. */
export function reconstructedActor(label: string, now: Date = new Date()): ConfigActor {
  return { kind: 'reconstructed', user_id: null, label, at: now.toISOString() }
}

// ---- Stamping a tracking_configs UPDATE -------------------------------------

/** Add the actor to a `tracking_configs` UPDATE payload. The nonce belongs to
 *  the statement rather than to the person, so one is filled in here for a
 *  hand-built actor that arrived without one — a stamp the trigger cannot tell
 *  from its predecessor is not a stamp. */
export function withActor<T extends Record<string, unknown>>(
  update: T,
  actor: ConfigActor,
): T & { last_actor: ConfigActor } {
  return { ...update, last_actor: dbSafeJson({ ...actor, nonce: actor.nonce ?? statementNonce() }) }
}

/** Run a `tracking_configs` UPDATE with the actor stamped on it, and survive a
 *  deploy that lands before this migration does.
 *
 *  Without the retry, the first settings save after a deploy would 400 on a
 *  column that does not exist yet and the client would lose an edit they made
 *  correctly — the failure mode `isMissingColumnError` was written for. The
 *  statement is rejected whole, so the retry cannot write twice. */
export async function updateWithActor<R extends { error: unknown }>(
  update: (payload: Record<string, unknown>) => PromiseLike<R>,
  payload: Record<string, unknown>,
  actor: ConfigActor,
): Promise<R> {
  const stamped = await update(withActor(payload, actor))
  if (stamped.error && isMissingColumnError(stamped.error, 'last_actor')) {
    // An error, not a warning, and it names the person: the retry is
    // UNATTRIBUTED, and the two ways it gets here end differently. If the
    // column really is absent the trigger is absent too (they arrive in one
    // migration) and the change is simply not logged at all. If the column is
    // there and PostgREST's schema cache is merely stale — PGRST204 — the
    // trigger does fire, and for the three settings writes that go out on the
    // admin client it records `pipeline`/`service_role`: a client's own edit
    // filed as the machine's. This line is then the only record of who it was.
    const code = (stamped.error as { code?: string }).code ?? '?'
    console.error(
      `[config-log] tracking_configs.last_actor rejected (${code}) — retrying UNSTAMPED. ` +
      `The write was ${actor.kind} ${actor.label ?? actor.user_id ?? 'unknown'}; ` +
      'the log will name the database role instead, or nothing at all.',
    )
    return update(payload)
  }
  return stamped
}

// ---- Diffing a configuration ------------------------------------------------

/** Key-sorted JSON, so two values that Postgres's jsonb would call equal are
 *  equal here too — jsonb normalises object key order and JavaScript does not. */
function stableJson(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${stableJson(val)}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

const isEmptyValue = (v: unknown): boolean =>
  v === null || v === undefined ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)

export interface ConfigDiffArgs {
  clientId: string
  /** The stored row, or null when this is the configuration's birth. */
  before: Record<string, unknown> | null
  /** What is being written. Only the columns present here are considered. */
  after: Record<string, unknown>
  actor: ConfigActor
  source?: ChangeSource
  note?: string | null
  changedAt?: string | null
}

/** One change per watched column that actually moved — the TypeScript mirror of
 *  the tracking_configs_audit trigger, for the paths the trigger cannot see
 *  (an INSERT) and for the scripts that want to PRINT what a write will log
 *  before it happens.
 *
 *  At birth (`before` null) an empty array or empty object writes no row: a new
 *  tenant with no exclusions has not made a change about exclusions. */
export function diffConfigRows(args: ConfigDiffArgs): ConfigChangeInput[] {
  const rows: ConfigChangeInput[] = []
  for (const column of WATCHED_CONFIG_COLUMNS) {
    if (!(column in args.after)) continue
    const after = args.after[column]
    const before = args.before ? args.before[column] : undefined
    if (args.before === null && isEmptyValue(after)) continue
    if (stableJson(before ?? null) === stableJson(after ?? null)) continue
    rows.push({
      clientId: args.clientId,
      surface: surfaceForColumn(column),
      field: column,
      before: args.before === null ? null : (before ?? null),
      after: after ?? null,
      actor: args.actor,
      source: args.source ?? 'logged',
      note: args.note ?? null,
      changedAt: args.changedAt ?? null,
    })
  }
  return rows
}

// ---- Writing -----------------------------------------------------------------

/** Minimal shape of the admin client this module writes through. */
interface InsertableClient {
  from: (table: string) => {
    insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => PromiseLike<{ error: { message?: string } | null }>
  }
}

/** Write one change. NON-FATAL by design, and this is the one place the
 *  asymmetry with the trigger is deliberate: inside the trigger a failed insert
 *  aborts the configuration write with it, because a change that is not logged
 *  should not happen. Here the write has already happened — a schedule saved, a
 *  corpus re-tagged — so failing the caller would mean reporting an error for
 *  work that succeeded. The failure is logged loudly instead. It also covers
 *  the deploy that lands before the migration: the table is simply not there
 *  yet, and a settings page is not the place to find that out. */
export async function recordConfigChange(admin: InsertableClient, input: ConfigChangeInput): Promise<boolean> {
  return (await recordConfigChanges(admin, [input])) === 1
}

/** The same, for a set of changes written together. Returns how many landed. */
export async function recordConfigChanges(admin: InsertableClient, inputs: ConfigChangeInput[]): Promise<number> {
  if (inputs.length === 0) return 0
  const { error } = await admin.from('config_changes').insert(inputs.map(changeRow))
  if (error) {
    console.error(`[config-log] ${inputs.length} change(s) NOT logged for ${inputs[0].clientId}: ${error.message ?? 'unknown error'}`)
    return 0
  }
  return inputs.length
}

// ---- The corpus operations --------------------------------------------------

/** Video sources whose entity tags are stamped by ACCOUNT MEMBERSHIP rather
 *  than by content (lib/gather/owned.ts): the account's own read is the
 *  authority on whose post it is. A content re-tag must not re-judge them —
 *  Sealand's own handle `sealandgear` contains none of its brand keywords
 *  (`sealand gear`, `#sealandgear`, `sealand bag`), so a re-tag today would
 *  strip `is_client` from 37 of its 59 own posts. */
export const IDENTITY_STAMPED_SOURCES = ['owned', 'competitor_owned'] as const

/** Is this video's tag an identity the re-tag must leave alone? */
export function skipRetag(source: string | null | undefined): boolean {
  return (IDENTITY_STAMPED_SOURCES as readonly string[]).includes(source ?? '')
}

/** Where every video sits AFTER a re-tag — counting only the rows whose UPDATE
 *  actually landed. `moved` maps a row's index in `before` to the bucket it
 *  moved to; anything not in it (unchanged, spared, or a write that failed)
 *  keeps the bucket it had.
 *
 *  The re-tag writes row by row and keeps going past a failure, so `after` and
 *  `rows_affected` can disagree: a run that intended 253 moves and landed 243
 *  used to log a distribution in which all 253 had moved. This row is the only
 *  record of an operation whose effect is otherwise unrecoverable, so it has to
 *  describe the corpus that exists, not the one that was asked for. */
export function bucketsAfterRetag(
  before: readonly string[],
  moved: ReadonlyMap<number, string>,
): string[] {
  const after = [...before]
  for (const [index, bucket] of moved) {
    if (Number.isInteger(index) && index >= 0 && index < after.length) after[index] = bucket
  }
  return after
}

/** How a re-tag decided, in words a reader of a moved number can use. The
 *  method matters — substring and gpt differ by up to 35x in rows touched — but
 *  `substring` and `gpt` are our words, not anyone else's. */
const RETAG_METHOD_WORDS: Record<string, string> = {
  substring: 'by matching the words in each post',
  gpt: 'by matching the words in each post, with the ambiguous ones judged one by one',
}

/** Add a detail to an actor's label without losing the label. */
function labelled(actor: ConfigActor, detail: string): ConfigActor {
  return detail ? { ...actor, label: `${actor.label ?? 'unknown'} · ${detail}` } : actor
}

/** The record a corpus re-tag leaves. Today it leaves none at all: `videos` has
 *  no `updated_at`, attribution is never written to `ai_call_log`, and the
 *  script carries no run id, so neither the moment, the method nor the OpenAI
 *  spend of the 2026-09-09 Sealand re-tag is recoverable.
 *
 *  The two halves are kept apart on purpose. `note` is the sentence — no
 *  command line, no dollars, no internal vocabulary — because the log is
 *  readable by every member of the tenant and Phase 1 will put it on a screen.
 *  What only an operator needs (which script, which flags, what it spent) goes
 *  on `actor_label`, beside the command that produced it. */
export function retagChange(args: {
  clientId: string
  actor: ConfigActor
  method: string
  before: Record<string, number>
  after: Record<string, number>
  rowsAffected: number
  skipped: number
  costUsd?: number
  note?: string
}): ConfigChangeInput {
  const how = RETAG_METHOD_WORDS[args.method] ?? `by ${args.method}`
  return {
    clientId: args.clientId,
    surface: 'entity_retag',
    field: null,
    before: args.before,
    after: args.after,
    actor: args.costUsd === undefined ? args.actor : labelled(args.actor, `OpenAI $${args.costUsd.toFixed(5)}`),
    rowsAffected: args.rowsAffected,
    note:
      `re-checked which brand each stored video is about, ${how}. ` +
      `${args.rowsAffected} video(s) moved; ${args.skipped} posted by your own or a tracked rival's account ` +
      `were left as they were, because there the account says whose post it is.` +
      `${args.note ? ` ${args.note}` : ''}`,
  }
}

// ---- The boundary -----------------------------------------------------------

/** The sentence that has to appear wherever this log is read. Everything before
 *  the first real entry is inference from what each update searched — gather
 *  granular, with blind windows of 35 days (Össur) and 39 days (Sealand) where
 *  a change made and undone leaves nothing at all. */
export function changeLogBoundary(firstLoggedAt: string | null | undefined): string {
  if (!firstLoggedAt) {
    return 'No configuration change has been recorded yet. Anything shown before the first one is reconstructed from what each update searched — a label, not a record.'
  }
  return `No change was recorded before ${firstLoggedAt.slice(0, 10)}. Entries before it are reconstructed from what each update searched — a label, not a record.`
}
