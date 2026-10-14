import type { ConfigActor, ConfigChangeInput } from '../config-log'
import { sameName } from './moves'
import type { Subject } from './types'

// Re-describing a subject, by an operator (14 Oct; Heinrich: "accuracy is
// important but at some point we have to accept when there isn't that much to
// be said"). Pure: the plan, the row and the change-log line. The writes are
// scripts/subject-redescribe.ts.
//
// A RE-DESCRIPTION IS A NEW SUBJECT, NOT AN EDIT, and that is the schema's rule
// rather than this file's (20260918093000_subjects.sql: no UPDATE grant on
// `description`, and the table comment). Three things make it so:
//   - `JUDGE_VERSION` folds in the prompt, the model, the band and the phrase
//     formula, never the words of one subject, so `subject_band()` returns no
//     pair already decided for the subject: an edit in place would re-judge
//     nothing and keep every member the old words let in.
//   - nothing resets a calibration on an edit: `calibration_judge_version`
//     would still equal the live key, so a ready subject would stay ready on
//     words nobody checked.
//   - the months. A subject's frozen months were counted under the old words
//     and are never rewritten, and no reader compares a subject's months on
//     anything that would move with the words (Market's board judges the pair
//     on the market view, `regime: 'n/a'`; the anomaly check's regime is the
//     judge version; `subjects` is not a change of ours). Under one id, June
//     to August under the old words would print, and be compared, as the new
//     subject's history.
// A new id is the one boundary every reader already keeps: the successor has
// no row in a closed month (the insert guard refuses one, and the one-shot
// back-read is spent), so it starts in the first month still filling, and the
// old line keeps its months under the old words, closed.
//
// WHAT IT KEEPS: the name, the origin and the source (the provenance of a name
// the client confirmed). WHAT IT DOES NOT: the old id's memberships, its
// calibration and its months, which is the point. Moves declared on the old id
// stay on it (a move's target carries no UPDATE grant), so an operator checks
// for them first.
//
// RESUMABLE, because the order is retire, insert, point, log, and the unique
// live name means the insert can only follow the retirement: a run that stops
// after the retirement leaves the old line closed with no successor, and the
// same command run again finishes it. Each step is planned from what the
// database holds, so a finished subject plans nothing.

/** One subject's new words, as the seed gives them. */
export interface Redescription {
  /** The subject today. */
  id: string
  /** Its name today, a guard: the seed refuses to run against a set it was not
   *  written for. The successor keeps it. */
  name: string
  /** Its description today, the same guard. */
  from: string | null
  /** The new description: what belongs, then what does not ("…, excluding …",
   *  which the judge reads and the phrase vector leaves out). */
  description: string
}

export interface RedescribeSeed {
  clientId: string
  /** The day the words were written, for the record. */
  writtenOn: string
  subjects: readonly Redescription[]
}

/** The columns the plan reads. */
export type RedescribeSubject = Pick<
  Subject,
  'id' | 'client_id' | 'name' | 'description' | 'origin' | 'source_ref' | 'status' | 'superseded_by'
>

/** In the order they run. */
export const REDESCRIBE_WRITES = ['retire', 'insert', 'point', 'log'] as const
export type RedescribeWrite = (typeof REDESCRIBE_WRITES)[number]

export type RedescribePlan =
  | { id: string; name: string; writes: RedescribeWrite[]; successorId: string | null }
  | { id: string; name: string; refused: string }

/** The subjects table's own limit (`description` CHECK, and `nameSubject`). */
export const DESCRIPTION_MAX = 400

const words = (s: string | null | undefined): string => (s ?? '').trim()

/** The new words, or why they cannot be stored. */
export function descriptionProblem(description: string, from: string | null): string | null {
  const d = words(description)
  if (!d) return 'the new description is empty'
  if (d.length > DESCRIPTION_MAX) return `the new description is ${d.length} characters; the limit is ${DESCRIPTION_MAX}`
  if (d === words(from)) return 'the new description is the one it has today'
  return null
}

/** Has this re-description's change-log line been written? Read off the
 *  `subjects` rows' `after`, which `redescribeChange` writes as the
 *  successor's id and the id it supersedes. */
export function redescribeLogged(changes: readonly { after: unknown }[], successorId: string, oldId: string): boolean {
  return changes.some((c) => {
    const a = c.after as { id?: unknown; supersedes?: unknown } | null
    return a != null && typeof a === 'object' && a.id === successorId && a.supersedes === oldId
  })
}

/**
 * What each subject of the seed needs, from what the database holds.
 *
 *   active, its name and words as the seed says → retire, insert, point, log
 *   retired by an earlier run, no successor yet   → insert, point, log
 *   retired, its successor there, not pointed     → point (and log if missing)
 *   retired and pointed at its successor          → log if missing, else nothing
 *
 * Anything else is refused with a reason, and the script writes nothing for
 * any subject while one is refused.
 */
export function planRedescribe(
  subjects: readonly RedescribeSubject[],
  changes: readonly { after: unknown }[],
  seed: readonly Redescription[],
): RedescribePlan[] {
  const seen = new Set<string>()
  return seed.map((e): RedescribePlan => {
    const refuse = (refused: string): RedescribePlan => ({ id: e.id, name: e.name, refused })
    if (seen.has(e.id)) return refuse('named twice in the seed')
    seen.add(e.id)
    const old = subjects.find((s) => s.id === e.id)
    if (!old) return refuse('not a subject of this workspace')
    if (!sameName(old.name, e.name)) return refuse(`it is called "${old.name}" today, and the seed says "${e.name}"`)
    const problem = descriptionProblem(e.description, e.from)
    if (problem) return refuse(problem)
    const target = words(e.description)
    const live = subjects.filter((s) => s.id !== old.id && s.status !== 'retired' && sameName(s.name, old.name))
    const logWrite = (successorId: string): RedescribeWrite[] => (redescribeLogged(changes, successorId, old.id) ? [] : ['log'])

    if (old.status === 'proposed') return refuse('it is proposed, not counted: reword it in Settings, or confirm it first')
    if (old.status === 'active') {
      if (words(old.description) !== words(e.from)) return refuse('its description today is not the one the seed was written against')
      if (live.length > 0) return refuse('another live subject already has its name')
      return { id: e.id, name: e.name, writes: ['retire', 'insert', 'point', 'log'], successorId: null }
    }

    // Retired. Only a re-description this seed began may be finished.
    if (old.superseded_by) {
      const successor = subjects.find((s) => s.id === old.superseded_by)
      if (!successor || successor.status === 'retired') return refuse('it was stopped and replaced, and its replacement is stopped too')
      if (words(successor.description) !== target) return refuse('it was replaced by a subject with other words')
      return { id: e.id, name: e.name, writes: logWrite(successor.id), successorId: successor.id }
    }
    if (live.length > 1) return refuse('more than one live subject has its name')
    const successor = live[0]
    if (successor) {
      if (words(successor.description) !== target) return refuse('it is stopped and a subject of its name has other words')
      return { id: e.id, name: e.name, writes: ['point', ...logWrite(successor.id)], successorId: successor.id }
    }
    if (words(old.description) !== words(e.from)) return refuse('it is stopped, and its description is not the one the seed was written against')
    return { id: e.id, name: e.name, writes: ['insert', 'point', 'log'], successorId: null }
  })
}

/** The successor's row. Born `active`: the set was confirmed when the old
 *  subject was, and the words are what changed. `created_by` is left out, so
 *  the `subjects_insert_audit` trigger records the insert as the database
 *  role, beside the script's own line with the command. `named_at` is the
 *  database's day. */
export function successorRow(old: RedescribeSubject, e: Pick<Redescription, 'description'>): {
  client_id: string
  name: string
  description: string
  origin: RedescribeSubject['origin']
  source_ref: string | null
  status: 'active'
} {
  return {
    client_id: old.client_id,
    name: old.name,
    description: words(e.description),
    origin: old.origin,
    source_ref: old.source_ref,
    status: 'active',
  }
}

/** The line Settings › The record prints (tenant-readable, verbatim). No
 *  figure and no threshold; "comments" has a fixed meaning there. */
export function redescribeNote(name: string): string {
  return `Reworded "${name}" to say more exactly what belongs in it. It is counted afresh under the new words; months already closed stay with the old ones.`
}

/** The change-log line: `nameSubject`'s shape for a rename ("after" names the
 *  successor and what it supersedes), with the old words on "before". */
export function redescribeChange(
  old: RedescribeSubject,
  successorId: string,
  e: Pick<Redescription, 'description'>,
  actor: ConfigActor,
): ConfigChangeInput {
  return {
    clientId: old.client_id,
    surface: 'subjects',
    field: 'subjects',
    before: { id: old.id, name: old.name, description: old.description },
    after: { id: successorId, name: old.name, description: words(e.description), origin: old.origin, supersedes: old.id },
    actor,
    note: redescribeNote(old.name),
  }
}
