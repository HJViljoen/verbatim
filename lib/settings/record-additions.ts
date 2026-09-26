import type { ConfigChange } from '../config-log'
import { segmentRulesEnabled } from '../segments/rules'

// Settings › What we changed gains three sections with deploy 5 (market-first
// plan §2.10 D5, WP3.10; the approved SettingsRecord artboard):
//   - "Searches held still until January", with its request path ("Ask for a
//     change", decision I): for a tracking-locked tenant, what the lock does now
//     and what is queued;
//   - "How we check, mark and file videos": the three ways a video is judged
//     after a search finds it, what each does today, and when a change of ours
//     last moved it (the dated changes themselves stay in The record's group of
//     the same name);
//   - "What the pages can say, and when": §2.11's timeline, levels now and the
//     first comparison read the same way in December, if nothing we search
//     changes.
// Each in client words, and each claim one the code keeps (GS constraint 8).

// ---- What the pages can say, and when ------------------------------------------------

/** §2.11, the rows a reader needs: when each kind of statement becomes
 *  possible. `from` is the day the row starts to hold (an update's day or the
 *  month's first). The weekly line's row is not here: whether it prints was
 *  Heinrich's call on 26 Oct (decision M), and the page does not know it. */
export const PAGES_CAN_SAY: readonly { when: string; from: string; says: string }[] = [
  { when: 'to 31 Oct', from: '2026-09-25', says: 'Each month in full, with the month before beside it, not read as a change.' },
  { when: '11 Oct update', from: '2026-10-11', says: 'The re-check on the searches both months ran, without makers or off-topic videos. Provisional.' },
  { when: '1 Nov', from: '2026-11-01', says: 'October, ended, leads. September against October is not compared.' },
  { when: '6 Dec update', from: '2026-12-06', says: 'October against November at the same age: the first comparison read the same way.' },
  { when: 'about 3 Jan', from: '2027-01-03', says: 'October against November in full, once November has filled. November against December at the same age.' },
  { when: 'January', from: '2027-01-10', says: 'The first unusual-week flags.' },
  { when: 'late January', from: '2027-01-24', says: 'The first direction words, once December has filled.' },
  { when: 'April 2027', from: '2027-04-01', says: 'The first quarter comparison: the first quarter of 2027 against the last of 2026.' },
]

export const PAGES_CAN_SAY_LEAD = 'Levels now. The first change we can stand behind comes in December, if nothing we search changes.'

/** Each row with where it stands on `now`: 'reached', 'next' (the first not
 *  yet reached) or 'later'. */
export function timelineRows(now: string): { when: string; says: string; state: 'reached' | 'next' | 'later' }[] {
  const day = now.slice(0, 10)
  let nextSeen = false
  return PAGES_CAN_SAY.map((r) => {
    if (r.from <= day) return { when: r.when, says: r.says, state: 'reached' as const }
    const state = nextSeen ? 'later' as const : 'next' as const
    nextSeen = true
    return { when: r.when, says: r.says, state }
  })
}

// ---- How we check, mark and file videos -------------------------------------------------

export interface CheckMethod {
  key: 'relevance' | 'makers' | 'filing'
  title: string
  /** What it does today, in one or two sentences. */
  does: string
  /** The newest change of ours to it on record, or null. */
  lastChanged: string | null
}

/** Which logged surfaces move each method. */
const METHOD_SURFACES: Readonly<Record<CheckMethod['key'], readonly string[]>> = {
  relevance: ['gate_rule', 'regate'],
  makers: ['segment'],
  filing: ['attribution', 'entity_retag'],
}

export function checkMethods(clientId: string, rows: readonly Pick<ConfigChange, 'surface' | 'changed_at'>[]): CheckMethod[] {
  const last = (key: CheckMethod['key']): string | null => {
    const dates = rows.filter((r) => METHOD_SURFACES[key].includes(r.surface)).map((r) => r.changed_at).sort()
    return dates.length ? dates[dates.length - 1] : null
  }
  return [
    {
      key: 'relevance',
      title: 'How we decide what is relevant',
      does: 'Every new video a search finds is checked for being about your category before it is read. What is set aside is listed in the reject log on this page.',
      lastChanged: last('relevance'),
    },
    {
      key: 'makers',
      title: 'How we mark makers’ videos',
      does: segmentRulesEnabled(clientId)
        ? 'Videos made by makers, and off-topic ones, are marked by a word check on caption, hashtags and topics. They stay in every count; a theme where a fifth or more are makers’ says so.'
        : 'No maker rule is switched on for this workspace, so no video is marked.',
      lastChanged: last('makers'),
    },
    {
      key: 'filing',
      title: 'How we file a video to a brand',
      does: 'A check decides which brand you track, if any, a video is about, and files it there. Your market’s own figures do not move with it; brand and theme counts can.',
      lastChanged: last('filing'),
    },
  ]
}
