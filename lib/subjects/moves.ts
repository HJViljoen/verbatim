import type { SupabaseClient } from '@supabase/supabase-js'

import { actorStamp, recordConfigChange, type ConfigActor } from '../config-log'
import {
  MOVE_DIRECTIONS,
  MOVE_KINDS,
  MOVE_MAX_THEMES,
  MOVE_STATUSES,
  SUBJECTS_MAX,
  SUBJECTS_MIN,
  TABLE_MOVES,
  TABLE_SUBJECTS,
  isMissingSubjects,
  type Move,
  type MoveDirection,
  type MoveKind,
  type MoveStatus,
  type SubjectOrigin,
  type SubjectStatus,
} from './types'

// Moves — what a client declared it is trying to change — and the subject
// writes that go with them (design item 22, decision E).
//
// WHY `moves` AND NOT `initiatives`. `initiatives` is the ancestor and has zero
// rows on both tenants. Its `registry_ids` column is documented as
// theme_registry ids, CHECKed at 1-5, and deliberately not updatable, because
// "change either and every point already reported becomes a point about
// something else". None of that fits a subject: a subject's membership is a set
// that exceeds five themes and is re-decided every week, so storing a subject
// id there would break the column's contract in three places at once — the
// comment, the server action's ownership check, and the measurement, which
// would silently contribute zero to both sides and read "too early" for ever.
// `initiatives` is legacy from here: read by the old Dashboard tile, written by
// nothing new, dropped in Phase 3.
//
// APPEND-ONLY FOR MEMBERS, EXCEPT THE ONE COLUMN THAT MEANS "CHANGE" (WP12).
// `kind`, the target, `title` and `declared_at` carry no UPDATE grant: they are
// what every point already reported means, and moving one would quietly change
// what a frozen month was about. `status` is the exception, and the reason it
// had to become one is SU2: a client who declares a move and finishes it has to
// be able to say so, or OV5 lists it as active for ever while the person who
// filed it watches. Marking a move done or dropped measures nothing differently
// — no month is re-opened and nothing is deleted, a dropped move keeps its line
// — so the grant is `update (status, updated_at)` and the policy pins the
// tenant on both sides (20260918093000, amended in WP12; Heinrich accepted).
//
// A SUBJECT IS PROPOSED BEFORE IT IS COUNTED. `subjects.status` defaults to
// 'proposed' and the judge, the month reading and the freeze all read only
// `active` rows, so naming a subject is half the act: decision E says the set
// is CONFIRMED per tenant before a single subject row is shown, and
// `activateSubject` is that confirmation. Nothing else in this codebase writes
// 'active' — a subject nobody confirmed is a subject nothing counts, and
// `nameSubject`'s sentence says so rather than implying the counting has
// already started.
//
// EVERY SUBJECT WRITE CARRIES AN ACTOR. `config_changes.surface` already admits
// 'subjects' (20260915091000), and a subject IS a configuration change in the
// sense that matters: it declares what a measurement is about. The log is
// written with the SERVICE-ROLE client because config_changes has no insert
// policy, and a log a tenant can append to is not a log.

/** The session a browser write arrives on. Structural, so a route handler's own
 *  context fits without importing lib/auth into a module that has no business
 *  redirecting anybody. */
export interface WriteContext {
  supabase: SupabaseClient
  clientId: string
  userId: string
  email?: string
  operator?: { isHome: boolean } | null
}

export interface DeclareMoveInput {
  kind: MoveKind
  subjectId?: string | null
  registryIds?: readonly string[] | null
  lineageId?: string | null
  title: string
  note?: string | null
  direction?: MoveDirection
}

export interface WriteResult<T> {
  ok: boolean
  message: string
  value?: T
  /** True when the write failed because M4's tables are not applied here.
   *
   *  A CODE, BECAUSE THE PROSE IS NOT ONE. `accept-advice.ts` used to tell this
   *  case apart with `message.includes('not switched on')`, and on an
   *  advice-kinded move there is no subject to pre-read, so the only failure
   *  path is the INSERT — whose message is `couldNotSave`'s "Could not save.
   *  Try again". The client was therefore shown "Could not save" on a press
   *  that HAD marked the row Done, and pressing again wrote a second decision.
   *  A caller deciding what to say needs the cause, not a substring of the
   *  sentence it is about to replace. */
  missing?: boolean
}

/** What a caller is told when M4 is not applied here. One string, so a reader
 *  and the three sites that return it cannot drift. */
export const SUBJECTS_NOT_APPLIED = 'Subjects are not switched on for this workspace yet.'

// ---- Pure -------------------------------------------------------------------

/** The target columns for one move, or the reason there are none.
 *
 *  Exactly one target, matching the kind — the same rule the database's
 *  `moves_one_target` CHECK states, restated here so a person gets a sentence
 *  instead of a constraint name. */
export function moveTarget(
  input: Pick<DeclareMoveInput, 'kind' | 'subjectId' | 'registryIds' | 'lineageId'>,
): { subject_id: string | null; registry_ids: string[] | null; lineage_id: string | null } | string {
  if (!MOVE_KINDS.includes(input.kind)) return `Not something this product can track: ${input.kind}.`
  const registryIds = input.registryIds ? [...new Set(input.registryIds)] : null
  if (input.kind === 'subject') {
    if (!input.subjectId) return 'Pick the subject this is about.'
    if (registryIds?.length || input.lineageId) return 'A move is about one thing: a subject, some themes, or a piece of advice.'
    return { subject_id: input.subjectId, registry_ids: null, lineage_id: null }
  }
  if (input.kind === 'theme') {
    if (!registryIds?.length) return 'Pick at least one theme.'
    if (registryIds.length > MOVE_MAX_THEMES) return `Track at most ${MOVE_MAX_THEMES} themes in one move.`
    if (input.subjectId || input.lineageId) return 'A move is about one thing: a subject, some themes, or a piece of advice.'
    return { subject_id: null, registry_ids: registryIds, lineage_id: null }
  }
  if (!input.lineageId) return 'Name the recommendation this came from.'
  if (input.subjectId || registryIds?.length) return 'A move is about one thing: a subject, some themes, or a piece of advice.'
  return { subject_id: null, registry_ids: null, lineage_id: input.lineageId }
}

/** The partial unique index's own comparison: `lower(trim(name))`, one live
 *  subject per name per tenant. Restated here so the one place that has to
 *  predict the index cannot drift from it. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** A title a person will read on a chart in six months. */
export function moveTitle(raw: string): string | null {
  const title = raw.trim().replace(/\s+/g, ' ')
  if (title.length < 1 || title.length > 120) return null
  return title
}

/** Where a tenant's subject set sits against the 5-8 the design asks for. Not a
 *  database CHECK: a tenant has to be able to sit at three while it is setting
 *  up, and this is what says so out loud instead of refusing. */
export function subjectSetVerdict(count: number): { state: 'short' | 'ready' | 'over'; line: string } {
  if (count > SUBJECTS_MAX) {
    return { state: 'over', line: `${count} subjects. More than ${SUBJECTS_MAX} and no single one gets enough of the conversation to read.` }
  }
  if (count < SUBJECTS_MIN) {
    return { state: 'short', line: `${count} of ${SUBJECTS_MIN}-${SUBJECTS_MAX} subjects named.` }
  }
  return { state: 'ready', line: `${count} subjects.` }
}

/** What confirming a subject should do, decided before anything is written.
 *
 *  The ceiling lives here rather than in the database for the reason
 *  `subjectSetVerdict` gives — a tenant has to be able to sit at three while it
 *  is setting up — but it IS enforced on the way up: past SUBJECTS_MAX no
 *  single subject gets enough of the conversation to read, and a set that
 *  grows past it silently is a set of numbers nobody can be given a band for. */
export type ActivationCheck =
  | { do: 'activate' }
  | { do: 'nothing'; message: string }
  | { do: 'refuse'; message: string }

export function activationCheck(
  subject: { status: SubjectStatus } | null,
  activeCount: number,
): ActivationCheck {
  if (!subject) return { do: 'refuse', message: 'That subject is not yours.' }
  if (subject.status === 'active') return { do: 'nothing', message: 'That one is already being counted.' }
  if (subject.status === 'retired') {
    return { do: 'refuse', message: 'You stopped tracking that one. Add it again to start a new line for it.' }
  }
  if (activeCount >= SUBJECTS_MAX) {
    return {
      do: 'refuse',
      message: `You are already tracking ${SUBJECTS_MAX}. Stop tracking one before you add another. With more than ${SUBJECTS_MAX}, no single one gets enough of the conversation to read.`,
    }
  }
  return { do: 'activate' }
}

// ---- Writes -----------------------------------------------------------------

/**
 * What a client is told when a write fails, and where the cause actually goes.
 *
 * These ten sites returned "Could not save: " followed by the PostgREST
 * message, putting constraint names, table names and "violates row-level
 * security policy for table …" in front of a client. The pattern was inherited
 * — app/dashboard/settings/actions.ts does it too — but main also carries the
 * calibrated shape this copies: "Could not save your search terms. Try again,
 * and tell us if it keeps happening."
 *
 * The raw text is not thrown away: it is logged with the operation named, so an
 * operator still has everything they had before.
 */
function couldNotSave(where: string, error: unknown, extra = ''): string {
  const message = (error as { message?: string } | null)?.message ?? String(error)
  console.error(`[subjects] ${where} failed: ${message}`)
  return extra ? `Could not save.${extra}` : 'Could not save. Try again, and tell us if it keeps happening.'
}

const actorFor = (ctx: WriteContext, detail: string): ConfigActor =>
  actorStamp({ userId: ctx.userId, email: ctx.email, operator: ctx.operator ?? null }, detail)

/** The admin client the change log needs. Passed in rather than imported so
 *  this module stays testable and so a caller cannot accidentally use it for
 *  the write itself — the write goes through the SESSION client, where RLS and
 *  the column grants are the gate. */
export type AdminClient = SupabaseClient

/**
 * Declare a move. "Track this" on a subject or a theme, or accepting a piece of
 * advice.
 *
 * Written on the SESSION client: RLS pins the tenant and the insert policy pins
 * `declared_by` to the person actually signed in, so one member cannot file a
 * declaration under another member's name. `declared_at` is the database's
 * `current_date` and is never a form value — everything measured about this
 * move is measured from the line the client drew, not from a date a request
 * could choose.
 */
export async function declareMove(
  ctx: WriteContext,
  admin: AdminClient,
  input: DeclareMoveInput,
): Promise<WriteResult<Move>> {
  const title = moveTitle(input.title)
  if (!title) return { ok: false, message: 'Give it a name of 1 to 120 characters.' }
  const target = moveTarget(input)
  if (typeof target === 'string') return { ok: false, message: target }
  const direction = input.direction ?? 'up'
  if (!MOVE_DIRECTIONS.includes(direction)) return { ok: false, message: 'Say whether you want more of this or less.' }

  // The subject must be this tenant's. The session client is RLS-scoped, so a
  // subject belonging to someone else simply does not come back, and an absent
  // row is the check — the initiatives precedent. Without it a crafted request
  // would store a foreign id that the measurement would then read nothing for,
  // and the move would print "too early" for ever with no explanation.
  if (target.subject_id) {
    const { data, error } = await ctx.supabase
      .from(TABLE_SUBJECTS).select('id').eq('client_id', ctx.clientId).eq('id', target.subject_id).maybeSingle()
    if (error) {
      if (isMissingSubjects(error)) return { ok: false, message: SUBJECTS_NOT_APPLIED, missing: true }
      return { ok: false, message: couldNotSave('declareMove subject read', error) }
    }
    if (!data) return { ok: false, message: 'That subject is not yours to track.' }
  }
  if (target.registry_ids) {
    const { data, error } = await ctx.supabase
      .from('theme_registry').select('id').eq('client_id', ctx.clientId).in('id', target.registry_ids)
    if (error) return { ok: false, message: couldNotSave('declareMove theme read', error) }
    if ((data ?? []).length !== target.registry_ids.length) return { ok: false, message: 'One of those themes is not yours to track.' }
  }

  const { data, error } = await ctx.supabase
    .from(TABLE_MOVES)
    .insert({
      client_id: ctx.clientId,
      kind: input.kind,
      subject_id: target.subject_id,
      registry_ids: target.registry_ids,
      lineage_id: target.lineage_id,
      title,
      note: input.note?.trim() || null,
      direction,
      declared_by: ctx.userId,
    })
    .select('id, client_id, kind, subject_id, registry_ids, lineage_id, title, note, direction, declared_at, declared_by, status')
    .maybeSingle()
  if (error) {
    // The insert is the ONLY failure path for an advice-kinded move — it has no
    // subject to pre-read — so a missing `moves` table arrived here wearing
    // "Could not save. Try again" and nothing upstream could tell the two
    // apart. It says which it is now.
    if (isMissingSubjects(error)) return { ok: false, message: SUBJECTS_NOT_APPLIED, missing: true }
    return { ok: false, message: couldNotSave('declareMove insert', error) }
  }

  const move = data as Move | null
  await recordConfigChange(admin, {
    clientId: ctx.clientId,
    surface: 'subjects',
    field: 'moves',
    before: null,
    after: { id: move?.id ?? null, kind: input.kind, title, direction, target },
    actor: actorFor(ctx, 'declared a move'),
  })
  return { ok: true, message: 'Tracking it from today.', value: move ?? undefined }
}

export interface NameSubjectInput {
  name: string
  description?: string | null
  origin: SubjectOrigin
  sourceRef?: string | null
  /** The subject this replaces, when this is a rename rather than a new name.
   *  The old row is retired and points here; its months keep their line. */
  supersedes?: string | null
}

/**
 * Name a subject.
 *
 * A RENAME IS TWO ROWS, not an edit. SU1 says renaming starts a new line and
 * keeps the old one, and the database agrees by withholding UPDATE on `name`
 * and `description` — both are read by the judge and both feed the phrase
 * vector, so editing either in place would re-decide membership under an
 * unchanged judge_version and quietly change what every frozen month was about.
 * `supersedes` is how the two rows are joined: the new one is inserted, the old
 * one is retired and points at it.
 */
export async function nameSubject(
  ctx: WriteContext,
  admin: AdminClient,
  input: NameSubjectInput,
): Promise<WriteResult<{ id: string }>> {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (name.length < 1 || name.length > 60) return { ok: false, message: 'Give it a name of 1 to 60 characters.' }
  const description = input.description?.trim() || null
  if (description && description.length > 400) return { ok: false, message: 'Keep the description under 400 characters.' }

  const insert = () =>
    ctx.supabase
      .from(TABLE_SUBJECTS)
      .insert({
        client_id: ctx.clientId,
        name,
        description,
        origin: input.origin,
        source_ref: input.sourceRef ?? null,
        created_by: ctx.userId,
      })
      .select('id')
      .maybeSingle()

  let { data, error } = await insert()

  // A RE-DESCRIPTION KEEPS THE NAME, and the partial unique index is on the
  // name alone — so replacing a subject's description collides with the very
  // row it is replacing, and "You are already tracking …" would be the answer
  // to every description edit there will ever be. When the only thing in the
  // way IS the row being superseded, retire that one first and try again. The
  // failed insert wrote nothing, so this costs a round trip in the collision
  // case and changes nothing in any other.
  let retiredFirst = false
  if (error && (error as { code?: string }).code === '23505' && input.supersedes) {
    const { data: old } = await ctx.supabase
      .from(TABLE_SUBJECTS).select('id, name, status').eq('client_id', ctx.clientId).eq('id', input.supersedes).maybeSingle()
    const previous = old as { name: string; status: string } | null
    if (previous && previous.status !== 'retired' && sameName(previous.name, name)) {
      const retired = await retireSubject(ctx, admin, { id: input.supersedes })
      if (!retired.ok) return { ok: false, message: retired.message }
      retiredFirst = true
      ;({ data, error } = await insert())
    }
  }

  if (error) {
    if (isMissingSubjects(error)) return { ok: false, message: SUBJECTS_NOT_APPLIED, missing: true }
    // The partial unique index: one live subject per name per tenant.
    if ((error as { code?: string }).code === '23505') return { ok: false, message: `You are already tracking "${name}".` }
    // AND THE MONTH IS CLOSED, WHICH "stopped" DOES NOT SAY. Retiring the
    // superseded subject fires `subject_retirement_freeze` immediately, so if
    // the retry then fails the old subject's current month stays frozen at a
    // partial reading that `subjects_retirement_is_final` now guarantees can
    // never be reopened. "Add it again" starts a NEW line; the sentence has to
    // say what the old one cost.
    const stopped = retiredFirst
      ? ` "${name}" has been stopped and its months are closed at the numbers they held; the replacement was not saved, and adding it again starts a new line.`
      : ''
    return { ok: false, message: couldNotSave('nameSubject insert', error, stopped) }
  }
  const id = (data as { id: string } | null)?.id
  await recordConfigChange(admin, {
    clientId: ctx.clientId,
    surface: 'subjects',
    field: 'subjects',
    before: null,
    after: { id: id ?? null, name, description, origin: input.origin, supersedes: input.supersedes ?? null },
    actor: actorFor(ctx, input.supersedes ? 'renamed a subject' : 'named a subject'),
  })
  if (input.supersedes && id) {
    if (retiredFirst) {
      // Already retired above; all that is left is the pointer joining the old
      // line to the new one. `superseded_by` is in the member's update grant
      // for exactly this.
      const { error: pointError } = await ctx.supabase
        .from(TABLE_SUBJECTS)
        .update({ superseded_by: id, updated_at: new Date().toISOString() })
        .eq('id', input.supersedes)
      if (pointError) return { ok: false, message: couldNotSave('nameSubject point update', pointError) }
    } else {
      const retired = await retireSubject(ctx, admin, { id: input.supersedes, supersededBy: id })
      if (!retired.ok) return { ok: false, message: retired.message }
    }
  }
  // NOT "it starts being counted": a named subject is `proposed`, and nothing
  // counts a proposed subject. Confirming it is `activateSubject`.
  return { ok: true, message: 'Added. Confirm it and it starts being counted from the next update.', value: id ? { id } : undefined }
}

/**
 * Confirm a subject: the write that actually starts the counting.
 *
 * `subjects.status` defaults to 'proposed' and every reader that matters —
 * `loadActiveSubjects`, and through it the membership judge, the month reading
 * and the freeze — filters on 'active'. So this is decision E's confirmation
 * step, and without it a tenant's subjects exist and measure nothing.
 *
 * Written on the SESSION client: the column grant on `subjects` hands a member
 * `status` and nothing that says what the measurement is about, so this is the
 * one thing about a subject a browser may change.
 */
export async function activateSubject(
  ctx: WriteContext,
  admin: AdminClient,
  input: { id: string },
): Promise<WriteResult<null>> {
  const { data: before, error: readError } = await ctx.supabase
    .from(TABLE_SUBJECTS).select('id, name, status').eq('client_id', ctx.clientId).eq('id', input.id).maybeSingle()
  if (readError) {
    if (isMissingSubjects(readError)) return { ok: false, message: SUBJECTS_NOT_APPLIED, missing: true }
    return { ok: false, message: couldNotSave('confirmSubject read', readError) }
  }
  const { data: live, error: countError } = await ctx.supabase
    .from(TABLE_SUBJECTS).select('id').eq('client_id', ctx.clientId).eq('status', 'active')
  if (countError) return { ok: false, message: couldNotSave('confirmSubject count', countError) }

  const verdict = activationCheck(before as { status: SubjectStatus } | null, (live ?? []).length)
  if (verdict.do === 'refuse') return { ok: false, message: verdict.message }
  if (verdict.do === 'nothing') return { ok: true, message: verdict.message, value: null }

  const { error } = await ctx.supabase
    .from(TABLE_SUBJECTS)
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', input.id)
  if (error) return { ok: false, message: couldNotSave('confirmSubject update', error) }

  // NOT LOGGED HERE. `subjects_status_audit` writes the config_changes row for
  // every status move, from identity, and it cannot be gone round: the update
  // grant and the "Members retire their subjects" policy make this a PATCH a
  // browser can send directly, so a log written only on this path was a log
  // with a hole in it. One row per change, wherever the change came from.
  return { ok: true, message: 'Confirmed. It starts being counted from the next update.', value: null }
}

/**
 * Mark a move done, dropped, or active again.
 *
 * THE ONLY THING ABOUT A MOVE A BROWSER MAY CHANGE, and the column grant is
 * what makes that true rather than this function: `update (status, updated_at)
 * on public.moves to authenticated` means a crafted PATCH at `title` or
 * `subject_id` is refused by the database before any policy runs. So this adds
 * a sentence a person can read and an actor on the log, not a boundary.
 *
 * NOT PINNED TO `declared_by`. A move is the WORKSPACE's declaration — a
 * colleague finishing a teammate's move is the normal case, not an
 * impersonation — and who filed it stays on the row either way. That is the
 * difference from `rec_decisions`, where the row IS "this person decided".
 *
 * The write is on the SESSION client, so RLS pins the tenant; the log goes
 * through the admin client, because `config_changes` has no insert policy and a
 * log a tenant can append to is not a log.
 */
export async function setMoveStatus(
  ctx: WriteContext,
  admin: AdminClient,
  input: { id: string; status: MoveStatus },
): Promise<WriteResult<null>> {
  if (!MOVE_STATUSES.includes(input.status)) return { ok: false, message: 'Say whether it is done, dropped, or still running.' }

  const { data: before, error: readError } = await ctx.supabase
    .from(TABLE_MOVES).select('id, title, status').eq('client_id', ctx.clientId).eq('id', input.id).maybeSingle()
  if (readError) {
    return { ok: false, message: isMissingSubjects(readError) ? 'Tracking is not switched on for this workspace yet.' : couldNotSave('setMoveStatus read', readError) }
  }
  const held = before as { title: string; status: MoveStatus } | null
  if (!held) return { ok: false, message: 'That move is no longer here.' }
  if (held.status === input.status) return { ok: true, message: MOVE_STATUS_SAID[input.status], value: null }

  // `select('id')` so a row the policy filtered out comes back as zero rows
  // rather than as a success — RLS filters an UPDATE, it does not error, and a
  // client told "saved" about a row that was never touched is the failure this
  // whole layer is built to avoid.
  const { data, error } = await ctx.supabase
    .from(TABLE_MOVES)
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', input.id)
    .eq('client_id', ctx.clientId)
    .select('id')
  if (error) return { ok: false, message: couldNotSave('setMoveStatus update', error) }
  if ((data ?? []).length === 0) return { ok: false, message: 'That move is no longer here.' }

  await recordConfigChange(admin, {
    clientId: ctx.clientId,
    surface: 'subjects',
    field: 'moves',
    before: { id: input.id, status: held.status },
    after: { id: input.id, status: input.status, title: held.title },
    actor: actorFor(ctx, `marked a move ${input.status}`),
  })
  return { ok: true, message: MOVE_STATUS_SAID[input.status], value: null }
}

/** What each lifecycle move is called back in the client's own words. Here
 *  rather than in the component so the page, the Settings list and a test all
 *  read one string. */
export const MOVE_STATUS_SAID: Record<MoveStatus, string> = {
  active: 'Running again. We report what the conversation does from here.',
  done: 'Marked done. Its line is kept.',
  dropped: 'Marked dropped. Its line is kept.',
}

/** Retire a subject. Never a delete: the months it already carries are the
 *  record, and `moves.subject_id` is ON DELETE RESTRICT precisely so a
 *  declaration cannot be quietly dropped along with it.
 *
 *  "The months it already carries keep their line" is true because the database
 *  makes it true: `subjects_retirement_freeze` closes every month the subject
 *  still had open, at this instant. A retired subject is never re-judged, so
 *  from here its membership only decays — an open month left open would be
 *  recomputed downward every run and freeze at a number the client never saw. */
export async function retireSubject(
  ctx: WriteContext,
  admin: AdminClient,
  input: { id: string; supersededBy?: string | null },
): Promise<WriteResult<null>> {
  const { data: before, error: readError } = await ctx.supabase
    .from(TABLE_SUBJECTS).select('id, name, status').eq('client_id', ctx.clientId).eq('id', input.id).maybeSingle()
  if (readError) return { ok: false, message: couldNotSave('retireSubject read', readError) }
  if (!before) return { ok: false, message: 'That subject is not yours.' }
  // STOPPING A STOPPED SUBJECT IS NOT A NO-OP, AND THAT IS WHY IT IS REFUSED.
  // The write below sets `superseded_by` to `input.supersededBy ?? null`, and a
  // second Stop passes none — so it erased the pointer joining a renamed
  // subject's frozen months to its successor. retired -> retired also passes
  // `subjects_retirement_is_final` and does NOT fire `subjects_status_audit`
  // (which is `when (new.status is distinct from old.status)`), so the erasure
  // left no config_changes row behind it.
  if ((before as { status?: string }).status === 'retired') {
    return { ok: true, message: 'It was already stopped. The months it carries are closed.', value: null }
  }

  const { error } = await ctx.supabase
    .from(TABLE_SUBJECTS)
    .update({ status: 'retired', superseded_by: input.supersededBy ?? null, updated_at: new Date().toISOString() })
    .eq('id', input.id)
  if (error) return { ok: false, message: couldNotSave('retireSubject update', error) }

  // Logged by `subjects_status_audit`, not here — see confirmSubject. This is
  // the write that permanently freezes the subject's open months, so the record
  // of who made it has to sit where nothing can bypass it.
  // NOT "keep their line": no surface draws a stopped subject's series — the
  // rail excludes it, OV2 reads `in('status', ['active','proposed'])`, and
  // Market lists only the moves. What is true is that the months are closed at
  // the numbers they held and nothing will rewrite them, which is the thing the
  // reader is actually deciding about.
  return { ok: true, message: 'Stopped. The months it already carries are closed and keep their numbers.', value: null }
}
