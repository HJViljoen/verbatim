import { shortDate } from '@/lib/format'
import type { RecStatus } from '@/lib/calibration'

// The lead card's decision, in words: shared by the app's control
// (lead-decision.tsx, a client component) and the print and email arms, so
// the three say one thing.

/** The lead card's word for a recommendation nobody has decided on. Not the
 *  ledger pill's "New", which is a word about the advice, not about you. */
export const LEAD_UNDECIDED = 'Not decided yet'

/** "you marked it on 15 Sep" (the preview's stamp, the front page's words),
 *  or null where no decision is recorded. Formatted on the server, so the
 *  control and the page it hydrates on print one day. */
export function leadStamp(decidedAt: string | null): string | null {
  return decidedAt ? `you marked it on ${shortDate(decidedAt)}` : null
}

/** The square beside the word, in the colour the status earns (the ledger
 *  pill's tones, as a mark). */
export const LEAD_SQUARE: Record<RecStatus, string> = {
  new: 'bg-transparent ring-1 ring-inset ring-muted-foreground/60',
  acknowledged: 'bg-secondary-foreground',
  in_progress: 'bg-you',
  acted_on: 'bg-positive',
  dismissed: 'bg-muted-foreground',
}
