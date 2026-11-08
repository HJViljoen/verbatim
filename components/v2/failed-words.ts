import { FAILED_EXPLAINED } from '@/lib/subjects/calibration-state'

// SAY A STATE ONCE (brief §3; the real-data pass, 8 Nov: Sealand's three
// subjects being re-described printed `FAILED_EXPLAINED` three times on
// Market, Voices, a group's page and a rival's page, beside a line naming the
// same three). Screen words only, from `FAILED_EXPLAINED`'s own; nothing in
// print, email or the briefs imports this file.

/** A subject being re-described, as a row's or a card's state where the
 *  screen says why once: `FAILED_EXPLAINED`'s own first words. */
export const FAILED_STATE = FAILED_EXPLAINED.slice(0, FAILED_EXPLAINED.indexOf(':'))

/** Why two or more subjects being re-described show no figure, said ONCE for
 *  all of them after their names (the real-data pass, 8 Nov: Sealand's three
 *  printed `FAILED_EXPLAINED` three times on a screen, beside a line naming
 *  the same three). The words are `FAILED_EXPLAINED`'s, made plural; one
 *  subject keeps `FAILED_EXPLAINED` as it is. */
export const FAILED_EXPLAINED_EACH = `${FAILED_STATE}: a check found each of them catching comments about other things, so none shows a figure while we reword them.`
