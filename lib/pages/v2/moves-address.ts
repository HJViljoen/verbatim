// YOUR MOVES' ADDRESSES (levels as pages, 17 Oct; the G6 boards). Until
// then a piece of advice opened in place (`?advice=<lineage>`), the advice
// record opened in place (`?advice=all`) and a move's Open went to what it is
// on. Every one is a page now, each its own address, written once here:
//
//   /dashboard/moves                      the root: the advice to decide on,
//                                         your moves, the plan, the conclusions
//   /dashboard/moves/advice               the advice record (an index)
//   /dashboard/moves/advice/<id>          a piece of advice (the hub), by its
//                                         lineage or, from an old `?rec=`
//                                         link, a recommendation id
//   /dashboard/moves/<id>                 a dated move (the evidence)
//
// A move's page reads `?video=<videos.id>` (one video's comments about it in
// full) and `?videos=all` (every video), as Market's conversation page does;
// the record reads `?all=1` (every piece no longer raised). Every older link
// (`?advice=`, `?item=`, `?rec=`, `?ledger=` on this page, and the same on
// Market's address, where Your moves lived until Design v2) redirects here
// for good, in one hop, through `redirectFor` (lib/nav.ts).
//
// PLAIN AND CLIENT-SAFE: no read, no server module, so the crumbs, the
// switcher and lib/nav.ts can all take it.

export const MOVES_PATH = '/dashboard/moves'
/** The advice record's page. */
export const ADVICE_RECORD_PATH = `${MOVES_PATH}/advice`
/** The value an old link named the advice record by (`?advice=all`,
 *  `?ledger=all`): `LEDGER_ALL_VALUE` (lib/pages/market-surface.ts), pinned
 *  equal in lib/nav-redirects.test.ts. */
export const ADVICE_RECORD_VALUE = 'all'

/** A piece of advice's page: its lineage, or a recommendation id. */
export const advicePath = (id: string): string => `${ADVICE_RECORD_PATH}/${encodeURIComponent(id)}`
/** A dated move's page. */
export const movePath = (id: string): string => `${MOVES_PATH}/${encodeURIComponent(id)}`

/** The record with every piece listed (`?all=1`). */
export const ADVICE_RECORD_ALL_HREF = `${ADVICE_RECORD_PATH}?all=1`
/** The anchor of the record's last group, where "Show the other N" lands. */
export const RECORD_GONE_ANCHOR = 'no-longer-raised'

/** Where "What people said after it" begins on a move's page: the cards'
 *  links land on it. */
export const MOVE_SAID_ANCHOR = 'what-people-said'

/**
 * A move's page with a video's comments opened (`?video=`) or every video
 * listed (`?videos=all`), landing on the card or the list. Pure.
 */
export function moveEvidenceHref(id: string, open: { video?: string | null; videos?: boolean } = {}): string {
  const q = new URLSearchParams()
  if (open.video) q.set('video', open.video)
  if (open.videos) q.set('videos', 'all')
  const qs = q.toString()
  if (!qs) return movePath(id)
  return `${movePath(id)}?${qs}#${open.video ? `video-${open.video}` : MOVE_SAID_ANCHOR}`
}

/** Whether a path is one of Your moves' pages, for the redirect table's "an
 *  address something serves". */
export function isMovesPage(path: string): boolean {
  return path === MOVES_PATH || path === ADVICE_RECORD_PATH
    || /^\/dashboard\/moves\/advice\/[^/]+$/.test(path)
    || /^\/dashboard\/moves\/[^/]+$/.test(path)
}

/** Where an old link's advice value lands: the record for `all`, else that
 *  piece of advice's page. Pure. */
export const adviceLanding = (value: string): string => (value === ADVICE_RECORD_VALUE ? ADVICE_RECORD_PATH : advicePath(value))
