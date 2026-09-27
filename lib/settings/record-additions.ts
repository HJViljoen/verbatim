// Settings › What we changed gains three sections with deploy 5 (market-first
// plan §2.10 D5, WP3.10; the approved SettingsRecord artboard):
//   - "Searches held still until January", with its request path ("Ask for a
//     change", decision I): for a tracking-locked tenant, what the lock does now
//     and what is queued;
//   - "How we check, mark and file videos": shipped early, with deploy 2, as The
//     record's group of that name (WP1.6: the relevance check, the maker marks
//     and brand filing, each change of ours dated with what it moved), so it is
//     not drawn twice; a standing description of each check would be method
//     text, which is How to read's (the 25 Sep rulings);
//   - "What the pages can say, and when": §2.11's timeline, levels now and the
//     first comparison read the same way in December, if nothing we search
//     changes.
// Each in client words, and each claim one the code keeps (GS constraint 8).

// ---- What the pages can say, and when ------------------------------------------------

/** §2.11, the rows a reader needs: when each kind of statement becomes
 *  possible. `from` is the day the row starts to hold (an update's day or the
 *  month's first). The weekly line's row is not here: whether it prints was
 *  Heinrich's call on 26 Oct (decision M), and the page does not know it.
 *  The re-check is the 4 Oct update's, not the preview's 11 Oct: the fast
 *  track (plan §3.7, accepted 26 Sep) brings deploy 3 on Mon 5 Oct and reads
 *  the re-check "with the 4 Oct update". */
export const PAGES_CAN_SAY: readonly { when: string; from: string; says: string }[] = [
  { when: 'to 31 Oct', from: '2026-09-25', says: 'Each month in full, with the month before beside it, not read as a change.' },
  { when: '4 Oct update', from: '2026-10-04', says: 'The re-check on the searches both months ran, without makers or off-topic videos. Provisional.' },
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
