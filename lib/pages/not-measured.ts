import { SUBJECT_NOT_MEASURED } from '../subjects/calibration-state'

// THE ONE SHORT LINE THAT NAMES THE SUBJECTS NOT MEASURED YET (14 Oct; the
// lead's ruling on Heinrich's "tracked no matter what"). Where a surface
// lists subjects in a small place (a Voices card's box, a brand's panel, the
// Dashboard's moves tile), every subject whose check has not passed, open or
// failed alike, is NAMED, never folded into a count: "Not measured yet: Cost
// & access, Fit & comfort". Why a failed one shows no figure (FAILED_EXPLAINED)
// is said once a page, never in this line. Pure, and free of any reader, so a
// tile or a card can import it.

/** What starts the line: the one constant every surface prints for a subject
 *  whose check has not passed, SUBJECT_NOT_MEASURED. */
export const NOT_MEASURED_LEAD = SUBJECT_NOT_MEASURED

/** "Not measured yet: Cost & access, Fit & comfort": every subject named
 *  once, in the order given. Null where there is none. Pure. */
export function notMeasuredLine(subjects: readonly { label: string }[] | undefined): string | null {
  const names = (subjects ?? []).map((s) => s.label.trim()).filter(Boolean)
  return names.length > 0 ? `${NOT_MEASURED_LEAD}: ${names.join(', ')}` : null
}
