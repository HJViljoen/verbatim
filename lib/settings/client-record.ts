import { fullDate } from '../format'
import type { ChangeLogView, ClientChange } from './change-log'

// SETTINGS › THE RECORD, AS A CLIENT READS IT (finish-list item 17, 29 Sep
// 2026).
//
// The record is written for the people who keep it: stored notes that explain
// the mechanics of a trigger or a probe, a reconstruction's "Everything before
// this line is gone", identical before→after pairs, and a clause about videos
// "never looked at more closely". A client read those as faults. This module
// is how the tab reads for a tenant user; an operator (lib/auth.ts
// `operator`) keeps the record as written.
//
// READ-TIME, AND NOTHING STORED CHANGES. `readChangeLog` and `recordRows` are
// shared with the quarterly deck and the record drawer, and stay as they are:
// this takes their output and rewords or leaves out rows on the way to the
// page.

/** A stored note in plain words: a sentence, or null to leave the row out. */
type Rewrite = (m: RegExpMatchArray) => string | null

const REWRITES: readonly [RegExp, Rewrite][] = [
  // Logged by the subjects trigger for a subject an operator script wrote.
  [/^Confirmed on creation:/, () => 'A subject we set up for you, counted from the day it was added.'],
  // Operator notes on the weekly schedule.
  [/^Paused at the owner.s request/, () => 'The weekly email was paused: nothing is sent from it until it is switched on with you.'],
  [/^The default weekly schedule was switched on with no recipients/, () => 'The weekly email was set up, with nobody on its list yet.'],
  // Our own quality checks on a subject's matching: nothing a client changes.
  [/^Matching checked for /, () => null],
  [/^precision measured by hand/i, () => null],
  // The reconstruction's notes (scripts/reconstruct-config-log.ts), dated
  // before the record began.
  [/^the earliest term set any record can show\..*?the first of them on (\d{4}-\d{2}-\d{2})\./, (m) =>
    `The earliest search terms on record. The updates before them, from ${fullDate(`${m[1]}T00:00:00Z`)}, did not keep which terms they searched.`],
  [/^"(.+)" was first searched on \S+\./, (m) => `“${m[1]}” added to the searches.`],
  [/^"(.+)" was last searched on \S+ and was gone by \S+\./, (m) => `“${m[1]}” taken out of the searches.`],
  [/^(r\/\S+) was proposed on \S+\./, (m) => `${m[1]} suggested as a community to watch.`],
  [/^(r\/\S+) was probed on \S+ and reads "(\w+)" today(?: \((\d+) of (\d+) sampled posts kept\))?\./, (m) => {
    const sample = m[3] != null && m[4] != null ? `: ${m[3]} of ${m[4]} sampled posts were about your market` : ''
    return m[2] === 'rejected' ? `${m[1]} checked and left out${sample}.` : `${m[1]} checked${sample}.`
  }],
  [/^(\w+) was populated by (\d{4}-\d{2}-\d{2}) at the latest/, (m) =>
    `Accounts we read were set up by ${fullDate(`${m[2]}T00:00:00Z`)}.`],
]

/** A composed note that names a stored field: "Cadence (report_day) changed." */
const FIELD_NOTE = /^(.+?) \([a-z_]+\) changed\.$/

/**
 * A note as a client reads it. Null leaves the row out. A note no rule knows
 * is returned as it is: a note an owner or a teammate wrote is theirs.
 */
export function clientNote(said: string): string | null {
  for (const [re, say] of REWRITES) {
    const m = said.match(re)
    if (m) return say(m)
  }
  const field = said.match(FIELD_NOTE)
  return field ? `${field[1]} changed.` : said
}

/** "Communities changed." with nothing under it says nothing a client can use. */
const BARE = /^[^.]+ changed\.$/

/**
 * One row as a client reads it, or null to leave it out: the note in plain
 * words, and a before→after pair that prints the same on both sides dropped
 * ("3 settings → 3 settings"). A row left with nothing but "X changed." once
 * its pair is dropped is left out: the 20 and 27 Sep community rows printed two
 * identical lists of twenty.
 */
export function clientChange(c: ClientChange): ClientChange | null {
  const said = clientNote(c.said)
  if (said == null) return null
  const same = c.before != null && c.before === c.after
  if (same && BARE.test(said)) return null
  return { ...c, said, before: same ? null : c.before, after: same ? null : c.after }
}

export function clientChangeLog(view: ChangeLogView): ChangeLogView {
  const keep = (rows: readonly ClientChange[]) => rows.map(clientChange).filter((c): c is ClientChange => c != null)
  return { ...view, recorded: keep(view.recorded), prehistory: keep(view.prehistory) }
}

/**
 * The coverage row's and the scope statement's clause about the videos the
 * gate's quick check cleared (lib/reading/record.ts `discardCaveat`): "678
 * videos passed the quick check and were never looked at more closely" read
 * to a client as work we skipped. It is the gate working; the operator's view
 * keeps it.
 */
export function withoutQuickCheck(text: string): string {
  return text.replace(/; \d[\d,]* videos? passed the quick check and were never looked at more closely(, and )?/, (_m, and?: string) => (and ? '; ' : ''))
}
