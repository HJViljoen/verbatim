import { SEALAND_CLIENT_ID } from '../config'
import { segmentRulesEnabled } from '../segments/rules'

// Which tenants read the Buyers and Makers views, and whether off-topic videos
// leave the default count (market-first decision F; plan WP3.3, WP3.2).
//
// OFF FOR EVERY TENANT, AND IT STAYS OFF UNTIL WP3.2's CHECK. Decision F: the
// views come "with deploy 5, after a second check on a fresh sample (WP3.2,
// checked by Fri 13 Nov)". WP3.2's done-when: a fresh hand check of 50 videos
// by an agent plus Heinrich's 20 gives maker precision of at least 0.8 AND
// off-topic precision of at least 0.8; "if not, v2 ships as a check only, the
// default view stays Everything, and Status says so". So nothing here turns
// true on a build: it turns true on Heinrich's word after that check, in a
// commit of its own, and lib/views/config.test.ts pins today's state.
//
// TWO SWITCHES, BECAUSE THEY ANSWER TWO QUESTIONS.
//   `views`     Buyers and Makers one click away, on a page that draws the
//               view pill (Conversation's "The market in the month", the
//               approved preview). The default stays Everything, so every page
//               keeps the one market count the front page prints.
//   `setAside`  off-topic videos leave the DEFAULT count ("set aside from the
//               default count, and the count says so", decision F): the
//               default view becomes `market`, and the pill's note says how
//               many were set aside. Before it turns true, the pages that draw
//               no pill (Your market, Subjects) need their own place to say
//               so, or they print a different market size from Conversation's
//               without saying why (recorded in the WP3.3 build notes).
//
// A TENANT WITH NO MAKER RULE NEVER READS A VIEW (Össur: its non-buyer content
// is lived experience, not making, CQ F43): there are no makers to take out
// or keep, so `viewsConfigFor` answers null whatever this table says.
//
// NOT IN lib/config.ts. That file is on the freeze-months path (plan §7.11,
// scripts/pipeline-closure.sh), and a view is a page's concern: nothing on the
// pipeline's import closure imports this file.

export interface ViewsConfig {
  /** Buyers and Makers one click away where the page draws the pill. */
  views: boolean
  /** Off-topic videos set aside from the default count (the `market` view). */
  setAside: boolean
}

export const VIEWS: Readonly<Record<string, ViewsConfig>> = {
  [SEALAND_CLIENT_ID]: { views: false, setAside: false },
}

/** A tenant's switches, or null where it reads no view at all: no entry, or no
 *  maker rule switched on for it. */
export function viewsConfigFor(clientId: string): ViewsConfig | null {
  if (!Object.prototype.hasOwnProperty.call(VIEWS, clientId)) return null
  if (!segmentRulesEnabled(clientId)) return null
  return VIEWS[clientId]
}

/** Is any view live for this tenant? */
export const viewsLive = (cfg: ViewsConfig | null): boolean => cfg != null && (cfg.views || cfg.setAside)
