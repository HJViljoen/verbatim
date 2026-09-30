import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ConfigChange } from '../config-log'
import { readChangeLog } from './change-log'
import { clientChangeLog, clientCoverageRow, clientNote, listedChanges, listedChangesNote, listedLine, withoutQuickCheck } from './client-record'

// Finish-list item 17: Settings › The record, as a client reads it. Every row
// goes through the real `readChangeLog`, with the notes production stores.

let n = 0
const row = (over: Partial<ConfigChange>): ConfigChange => ({
  id: `c${++n}`, client_id: 'x', changed_at: '2026-09-24T08:00:00.000Z', surface: 'subjects', field: null,
  before: null, after: null, actor_kind: 'operator', actor_user_id: null, actor_label: null, run_id: null,
  source: 'logged', rows_affected: null, note: null, affects_audiences: null, affects_months: null,
  ...over,
})
const subs = (extra: string) => ['sustainablefashion', 'backpacks', 'ecofashion', 'outdoorgear', 'zerowaste', 'buyitforlife', 'edc', 'hikinggear', ...Array.from({ length: 12 }, (_, i) => `${extra}${i}`)]

describe('clientNote', () => {
  it('rewords our notes to ourselves in plain words', () => {
    expect(clientNote('Confirmed on creation: this subject was counted from the moment it was written, and it was not written through the product, no member confirmed it.'))
      .toBe('A subject we set up for you, counted from the day it was added.')
    expect(clientNote('Paused at the owner’s request: Sealand’s team receives no automated update until he has sent the first brief himself. Nothing is sent from this schedule while it is paused, whoever is added to its recipient list.'))
      .toBe('The weekly email was paused: nothing is sent from it until it is switched on with you.')
    expect(clientNote('The default weekly schedule was switched on with no recipients, so each finished update records a skipped send instead of raising a missed-delivery alert. No email goes out until recipients are added.'))
      .toBe('The weekly email was set up, with nobody on its list yet.')
    expect(clientNote('Cadence (report_day) changed.')).toBe('Cadence changed.')
  })

  it('leaves our own quality checks out', () => {
    expect(clientNote('Matching checked for Comfort on 25 sampled viewer points.')).toBeNull()
  })

  it('rewords the reconstruction, with no "Everything before this line is gone"', () => {
    const earliest = clientNote('the earliest term set any record can show. It is not when these terms were configured: 7 earlier update(s) ran before the first one that left a term record, the first of them on 2026-06-28. Everything before this line is gone. Afterwards the record is per update, not per change: the longest stretch with no update at all is 39 days, and a term added and removed inside one leaves nothing.')
    expect(earliest).toBe('The earliest search terms on record. The updates before them, from 28 Jun 2026, did not keep which terms they searched.')
    expect(clientNote('r/sailboats was probed on 2026-09-13 and reads "rejected" today (0 of 12 sampled posts kept). Only the most recent probe survives: a re-probe overwrites the earlier one, and a strike carries no date at all.'))
      .toBe('r/sailboats checked and left out: 0 of 12 sampled posts were about your market.')
    expect(clientNote('"frtg" was first searched on 2026-09-13. It was added between the update of 2026-09-10 and the one of 2026-09-13 (3 day(s) apart); which of those days, and by whom, is not recorded.'))
      .toBe('“frtg” added to the searches.')
  })

  it('keeps a note nobody wrote a rule for, as it was written', () => {
    expect(clientNote('Weekly digest now sends the weekly report')).toBe('Weekly digest now sends the weekly report')
  })
})

describe('clientChangeLog', () => {
  const rows = [
    // 27 Sep: the automatic update rewrote the communities, and the two
    // sides print the same twenty.
    row({ changed_at: '2026-09-27T05:00:00.000Z', surface: 'subreddits', field: 'subreddits', actor_kind: 'pipeline', before: subs('a'), after: subs('b') }),
    row({ changed_at: '2026-09-25T09:00:00.000Z', note: 'Matching checked for Comfort on 25 sampled viewer points.', before: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, after: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 7 } }),
    row({ changed_at: '2026-09-24T09:00:00.000Z', surface: 'schedule', note: 'Weekly digest now sends the weekly report', before: { a: 1, b: 2, c: 3 }, after: { a: 1, b: 2, c: 4 } }),
    row({ changed_at: '2026-09-24T08:00:00.000Z', note: 'Confirmed on creation: this subject was counted from the moment it was written, and it was not written through the product — no member confirmed it.' }),
    row({ changed_at: '2026-09-18T08:00:00.000Z', surface: 'schedule', actor_kind: 'user', actor_user_id: 'u2', note: 'daniela@sealandgear.com joined the workspace digest', before: ['brayden@sealandgear.com'], after: ['brayden@sealandgear.com', 'daniela@sealandgear.com'] }),
  ]
  const written = readChangeLog({ rows, emails: { u2: 'daniela@sealandgear.com' } })
  const client = clientChangeLog(written)

  it('drops a pair that prints the same on both sides, and a row with nothing left to say', () => {
    expect(written.recorded.find((c) => c.surface === 'subreddits')?.before).toBe(written.recorded.find((c) => c.surface === 'subreddits')?.after)
    expect(client.recorded.map((c) => c.said)).toEqual([
      'Weekly digest now sends the weekly report',
      'A subject we set up for you, counted from the day it was added.',
      'daniela@sealandgear.com joined the workspace digest',
    ])
    const digest = client.recorded[0]
    expect(digest.before).toBeNull()
    expect(digest.after).toBeNull()
  })

  // sw-2 item 2: the coverage row counts the entries the page LISTS, not rows
  // of the log ("71 changes" beside about twenty listed), and its clause is
  // the latest listed day, not a composed "the newest A subject we set up…".
  it('counts the changes the page lists, and dates the latest', () => {
    const ours = [{ date: '2026-09-27T05:00:00.000Z' }, { date: '2026-09-17T14:02:56.000Z' }, { date: '2026-08-17T10:00:00.000Z' }]
    const listed = listedChanges({ ours, log: client, from: '2026-09-01', to: '2026-09-30' })
    // Two of ours in September, and the client log's three recorded rows.
    expect(listed).toEqual({ count: 5, latest: '2026-09-27' })
    expect(listedChangesNote(listed)).toBe('listed on this page, the latest on 27 Sep')
    expect(listedChangesNote({ count: 0, latest: null })).toBeNull()
    const page = readFileSync(join(process.cwd(), 'app/dashboard/settings/record/page.tsx'), 'utf8')
    expect(page).toContain('listedChanges({ ours: changed?.lines ?? [], log, ')
    expect(page).not.toContain('changeNote(log, ')
  })

  it('says the listed count plainly in the scope statement', () => {
    expect(listedLine('20 changes to what we track were made inside this window.')).toBe('20 changes were made inside this window, each listed on this page.')
    expect(listedLine('1 change to what we track was made inside this window.')).toBe('1 change was made inside this window, listed on this page.')
    expect(listedLine('Nothing about what we track changed in this window.')).toBe('Nothing about what we track changed in this window.')
  })

  it('keeps a real before→after', () => {
    const joined = client.recorded.find((c) => c.said.includes('joined'))
    expect(joined?.before).toBe('brayden@sealandgear.com')
    expect(joined?.after).toBe('brayden@sealandgear.com, daniela@sealandgear.com')
  })
})

describe('withoutQuickCheck', () => {
  it('drops the quick-check clause and keeps the rest', () => {
    expect(withoutQuickCheck('discarded 55% of what was looked at · recorded from 9 Sep 2026; 678 videos passed the quick check and were never looked at more closely'))
      .toBe('discarded 55% of what was looked at · recorded from 9 Sep 2026')
    expect(withoutQuickCheck('it; 1 video passed the quick check and were never looked at more closely, and 3 videos came in while the check was switched off.'))
      .toBe('it; 3 videos came in while the check was switched off.')
    expect(withoutQuickCheck('nothing to strip.')).toBe('nothing to strip.')
  })
  it('takes the clause out of a row’s basis as well as its text (sw-2 item 1)', () => {
    const gate = { id: 'gate', rest: 'of what was looked at', basis: 'recorded from 9 Sep 2026; 678 videos passed the quick check and were never looked at more closely' }
    expect(clientCoverageRow(gate)).toEqual({ id: 'gate', rest: 'of what was looked at', basis: 'recorded from 9 Sep 2026' })
  })
})
