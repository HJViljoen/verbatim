import { shortDate } from '../format'

// Where a subject came from, printed truthfully (market-first decision G,
// WP3.1): "picked for you, not yet confirmed" until the client has confirmed it.
//
// WHAT COUNTS AS CONFIRMED, from the record and nothing else:
//   - a `config_changes` row with surface 'subjects' and field 'confirmed'
//     naming the subject's id: the operator's record that the client chose it
//     (scripts/new-subjects.ts writes one per subject confirmed on the 13 Oct
//     call);
//   - a tenant member activating it through the product: M4's status trigger
//     logs that as surface 'subjects', field 'subjects', `after.status` 'active',
//     with `actor_kind` 'user';
//   - a subject a member named through the product: `created_by` is set only by
//     that path (M4's insert policy pins it to the member), so the member chose
//     it. M14's trigger logs every row written any other way and says so ("no
//     member confirmed it").
// Anything else, which is today's eight (all written by script, `created_by`
// null, measured on staging 27 Sep), reads "picked for you, not yet confirmed",
// whatever its stored `origin` says: three of them carry 'client' and two came
// from the invented mock (decision G's why).

export const ORIGIN_UNCONFIRMED = 'picked for you, not yet confirmed'

/** One change-log row, as the Settings page reads it. */
export interface SubjectChangeRow {
  field: string | null
  after: unknown
  actor_kind: string
  changed_at: string
}

/** The subjects the record shows the client confirmed, with the day: the
 *  earliest confirmation of each. */
export function confirmedSubjects(rows: readonly SubjectChangeRow[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rows) {
    const after = (r.after && typeof r.after === 'object' ? r.after : {}) as { id?: unknown; status?: unknown }
    const id = typeof after.id === 'string' ? after.id : null
    if (!id) continue
    const confirms = r.field === 'confirmed' || (r.field === 'subjects' && after.status === 'active' && r.actor_kind === 'user')
    if (!confirms) continue
    const held = out.get(id)
    if (!held || r.changed_at < held) out.set(id, r.changed_at)
  }
  return out
}

/**
 * The origin words under a subject in Settings › Subjects.
 *
 * A proposed row keeps its candidate's reason (`candidateWords`, where the
 * name came from), because that is the argument for confirming it; a counted
 * or stopped one says whether the client chose it.
 */
export function subjectOriginWords(
  s: { id: string; status: string; created_by?: string | null },
  confirmed: ReadonlyMap<string, string>,
  candidateWords: string,
): string {
  if (s.status === 'proposed') return candidateWords
  const on = confirmed.get(s.id)
  if (on) return `you confirmed it on ${shortDate(on)}`
  if (s.created_by) return 'you named it'
  return ORIGIN_UNCONFIRMED
}
