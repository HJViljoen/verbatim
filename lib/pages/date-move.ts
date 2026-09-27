import { z } from 'zod'

import { longMonth, shortDate } from '../format'

// "Date a move" (the approved preview's Your moves, WP3.6 wave 2): what the
// form offers and what it sends, pure. The write is lib/actions/date-move.ts
// through lib/subjects/moves.ts `declareMove`; the day is MF5's
// `moves.dated_on` (20261103091000), its window lib/subjects/move-day.ts.
//
// WHAT A MOVE IS DATED ON. Something the market is read on month by month,
// so Y4 can print its level in the move's month and the two after it: one of
// your subjects (not one being re-described), one of the questions your market
// asked most in the reading month (a theme), or the current recommendation (a
// piece of advice, read on the theme its evidence leads with).
//
// WHEN. A day from the first of the month two months back to today, the
// window MF5's CHECK holds (the three months the page reads). Before MF5 is
// applied the form takes no day and the move is dated today.

/** What the form needs, handed to the page by the loader. */
export interface MoveDating {
  /** MF5 is applied here, so the form takes a day. */
  datable: boolean
  /** The database's day (UTC), `YYYY-MM-DD`: the latest a move may be dated. */
  today: string
  /** The first day the window allows. */
  earliest: string
  /** The reading month the question themes are from. */
  month: string
  subjects: { id: string; name: string }[]
  themes: { registryId: string; label: string }[]
  advice: { lineageId: string; title: string } | null
}

/** "From 1 Aug to today", the hint under the day. */
export const dayWindowLine = (earliest: string): string => `From ${shortDate(earliest)} to today.`

/** A form may be offered only where there is something to date a move on. */
export const canDate = (d: MoveDating | null | undefined): d is MoveDating =>
  d != null && (d.subjects.length > 0 || d.themes.length > 0 || d.advice != null)

// ---- the target, as one form value ---------------------------------------------
//
// ONE SELECT, THREE KINDS: "subject:<uuid>", "theme:<registry uuid>" or
// "advice:<lineage uuid>". The kind is the prefix, so the value alone says
// which one target the move carries (moves_one_target).

export type MoveTargetInput =
  | { kind: 'subject'; subjectId: string }
  | { kind: 'theme'; registryIds: string[] }
  | { kind: 'advice'; lineageId: string }

export const targetValue = (kind: MoveTargetInput['kind'], id: string): string => `${kind}:${id}`

const uuid = z.string().uuid()

export function parseMoveTarget(value: string): MoveTargetInput | string {
  const [kind, id, ...rest] = value.trim().split(':')
  if (rest.length > 0 || !id || !uuid.safeParse(id).success) return 'Pick what the move is about.'
  if (kind === 'subject') return { kind, subjectId: id }
  if (kind === 'theme') return { kind, registryIds: [id] }
  if (kind === 'advice') return { kind, lineageId: id }
  return 'Pick what the move is about.'
}

// ---- the words --------------------------------------------------------------------

export const DATE_MOVE = 'Date a move'
/** The sheet's lead: "and when" only where the form takes a day. */
export const dateMoveLead = (datable: boolean): string =>
  `Name what you changed${datable ? ' and when' : ''}. This page then reads what your market said that month and the two after it, as a level.`
export const DATE_MOVE_TITLE_HINT = 'A post series, a product page or a price, in your words.'
/** Said in place of the day where MF5 is not applied here. */
export const DATE_MOVE_TODAY = 'It is dated today.'

/** The groups of the "What it is about" list. */
export const targetGroups = (d: Pick<MoveDating, 'month'>) => ({
  subjects: 'Your subjects',
  themes: `What your market asked most in ${longMonth(d.month)}`,
  advice: 'The current recommendation',
})

/** What the form says once a move is dated. */
export const dateMoveSaid = (day: string | null): string => (day ? `Dated ${shortDate(day)}.` : 'Dated today.')
