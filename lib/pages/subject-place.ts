import type { SupabaseClient } from '@supabase/supabase-js'
import { subjectCalibration, type SubjectCalibration } from '../subjects/calibration-state'
import { loadActiveSubjects } from '../subjects/membership'
import { isMissingSubjects, type Subject } from '../subjects/types'
import { loadMemberInsightIdsBySubject } from './subjects'

// ONE PLACEMENT RULE FOR A CONVERSATION'S SUBJECT (the parity fix, 14 Oct).
//
// Every surface that names a conversation's subject names it through
// `placeSubject`, over the inputs `loadSubjectPlacement` reads, so one
// conversation names the same subject on Market, Content and the legacy
// Voice surface. Until 14 Oct Content kept its own rule (every active
// subject in one tier, a failed one included, in id order) and the legacy
// Voice surface another (ready subjects only), so a conversation could name
// one subject on Market and another, or none, on Content.
//
// A NAME IS NOT A FIGURE. Placing a conversation in a subject whose check has
// not passed is allowed (ruling U6 is about figures resting on membership):
// the surface may name the subject and print the conversation's own counts,
// never a level, line, change or count of the subject's own.
//
// A TRACKED SUBJECT IS NEVER HIDDEN (Heinrich, 14 Oct: "they want it tracked
// no matter what"). A failed subject (its check clearly under the floor,
// being re-described) is placed exactly as a provisional one is: in the
// second tier, taking a conversation only where no ready subject does. Until
// 14 Oct it was in no tier, so the conversations it holds named no subject
// anywhere and the subject's own row on Market listed nothing inside it.
//
// The rule's member ids are the conversation's own (`theme_observations.
// member_insight_ids`) under the run the page reads its conversations from:
// Market's themed run, Content's anchor run. Those are the same run whenever
// the published week read is the latest themed one, which is how a run
// publishes; a page reading another run reads that run's clustering.

/** The subjects a conversation may be placed in, as `placeSubject` takes
 *  them: the READY ones (`order`, `subjectsOf`), and the ones whose check has
 *  not passed, provisional or failed (`pending`), used only where no ready
 *  subject takes the conversation. `names` holds both. */
export interface SubjectPlacement {
  names: ReadonlyMap<string, string>
  order: readonly string[]
  subjectsOf: ReadonlyMap<string, readonly string[]>
  pending?: { order: readonly string[]; subjectsOf: ReadonlyMap<string, readonly string[]> } | null
}

/** The fewest of a conversation's member insights a subject must hold, and
 *  the share of them (the written read's rule, lib/written/pool.ts
 *  `subjectForTheme`; the test pins the two together). */
const MIN_MEMBERS = 3
const SHARE_FLOOR = 0.15

/**
 * The subject a conversation is part of, among one tier: the one holding the
 * most of its member insights, at least 3 of them and at least 15% (the
 * written read's rule, lib/written/pool.ts `subjectForTheme`, restated here
 * so a page does not import the pipeline's pool). A tie goes to the subject
 * earlier in `order`, then by id. Pure.
 */
export function subjectOfTheme(
  memberIds: readonly string[],
  subjectsOf: ReadonlyMap<string, readonly string[]>,
  order: readonly string[] = [],
): string | null {
  const members = [...new Set(memberIds)]
  if (members.length === 0) return null
  const counts = new Map<string, number>()
  for (const id of members) for (const s of new Set(subjectsOf.get(id) ?? [])) counts.set(s, (counts.get(s) ?? 0) + 1)
  const at = (s: string) => {
    const i = order.indexOf(s)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  let best: string | null = null
  let bestN = 0
  for (const [s, n] of counts) {
    if (n > bestN || (n === bestN && best != null && (at(s) - at(best) || s.localeCompare(best)) < 0)) {
      best = s
      bestN = n
    }
  }
  return best != null && bestN >= MIN_MEMBERS && bestN / members.length >= SHARE_FLOOR ? best : null
}

/**
 * The subjects a conversation may be placed in, in two tiers (the parity
 * pass, 13 Oct; ruling U6): the READY ones, and every other active subject,
 * its check open (provisional) or failed (being re-described), in one tier
 * and in the subjects' own order (14 Oct: a tracked subject is never hidden;
 * a failed one behaves exactly as a provisional one). Pure.
 */
export function placementTiers<S extends { id: string }>(all: readonly { subject: S; calibration: string }[]): { ready: S[]; pending: S[] } {
  return {
    ready: all.filter((x) => x.calibration === 'ready').map((x) => x.subject),
    pending: all.filter((x) => x.calibration !== 'ready').map((x) => x.subject),
  }
}

/**
 * THE SUBJECT A CONVERSATION IS PLACED IN, ON EVERY SURFACE (the parity pass,
 * 13 Oct, on Market; every surface since 14 Oct; ruling U6): a READY subject
 * always wins. `subjectOfTheme` over the ready subjects alone first; only
 * where no ready subject takes the conversation (3 of its member insights
 * and 15% of them) is it read against the subjects whose check has not
 * passed (provisional and failed, one tier), so a subject whose matching is
 * not verified never takes a conversation from one whose matching is. Pure.
 */
export function placeSubject(memberIds: readonly string[], s: SubjectPlacement): string | null {
  return subjectOfTheme(memberIds, s.subjectsOf, s.order)
    ?? (s.pending ? subjectOfTheme(memberIds, s.pending.subjectsOf, s.pending.order) : null)
}

/** Each conversation's subject (`placeSubject`), named, by registry id: null
 *  where none takes it or the subjects are not read. Pure. */
export function placeConversations(
  members: ReadonlyMap<string, readonly string[]>,
  placed: SubjectPlacement | null,
): Map<string, { id: string; name: string } | null> {
  const out = new Map<string, { id: string; name: string } | null>()
  for (const [id, memberIds] of members) {
    const s = placed ? placeSubject(memberIds, placed) : null
    const name = s ? placed?.names.get(s) ?? null : null
    out.set(id, s && name ? { id: s, name } : null)
  }
  return out
}

/** A subject as the placement read it, with its check's state. */
export interface PlacedSubjectRow {
  subject: Subject
  calibration: SubjectCalibration
}

/**
 * The tenant's active subjects with their check's state (`all`, named first),
 * and the placement both tiers read (`placed`): one membership read for the
 * two tiers, split by subject. `placed` is null where no subject may take a
 * conversation, or the subjects are not recorded here (a missing table is no
 * subjects, never an error).
 */
export async function loadSubjectPlacement(db: SupabaseClient, clientId: string): Promise<{ all: PlacedSubjectRow[]; placed: SubjectPlacement | null }> {
  let subjects: Subject[]
  try {
    subjects = await loadActiveSubjects(db as never, clientId)
  } catch (error) {
    if (isMissingSubjects(error)) return { all: [], placed: null }
    throw error
  }
  const all = subjects.map((s) => ({ subject: s, calibration: subjectCalibration(s) }))
  const tiers = placementTiers(all)
  const placeable = [...tiers.ready, ...tiers.pending]
  if (placeable.length === 0) return { all, placed: null }
  const bySubject = await loadMemberInsightIdsBySubject(db, clientId, placeable.map((s) => s.id))
  if (!bySubject) return { all, placed: null }
  const tierOf = (list: readonly Subject[]) => {
    const subjectsOf = new Map<string, string[]>()
    for (const sub of list) for (const id of bySubject.get(sub.id) ?? []) subjectsOf.set(id, [...(subjectsOf.get(id) ?? []), sub.id])
    return { order: list.map((x) => x.id), subjectsOf }
  }
  const ready = tierOf(tiers.ready)
  return {
    all,
    placed: {
      names: new Map(placeable.map((x) => [x.id, x.name])),
      order: ready.order,
      subjectsOf: ready.subjectsOf,
      pending: tiers.pending.length > 0 ? tierOf(tiers.pending) : null,
    },
  }
}

/** The tenant's READY subjects' ids (ruling U6: the subjects a flag, a count
 *  or a rank may rest on). None where the subjects are not recorded here, so
 *  a subject flag then never leads (fail closed); another failure throws. */
export async function loadReadySubjectIds(db: SupabaseClient, clientId: string): Promise<Set<string>> {
  try {
    return new Set((await loadActiveSubjects(db as never, clientId)).filter((s) => subjectCalibration(s) === 'ready').map((s) => s.id))
  } catch (error) {
    if (isMissingSubjects(error)) return new Set()
    throw error
  }
}
