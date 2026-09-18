import { describe, expect, it } from 'vitest'

import { AppealControl } from '@/app/dashboard/settings/record/appeal-control'
import { APPEAL_ASK, APPEAL_FILED } from '@/app/dashboard/settings/record/appeal-copy'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'

import { ChangeLogBlock } from './change-log'
import { CoverageBlock } from './coverage'
import { DeliveryBlock } from './delivery'
import { RecordHeader, SaveStrip, ScopeStatement } from './header'
import { RejectLogBlock } from './rejects'
import {
  changeLogFixture, changeMetaFixture, coverageRowsFixture, deliveryFixture,
  freshCoverageRowsFixture, gateBasisFixture, gateSummaryFixture, keptByPlatformFixture,
  keptByTermFixture, noReadingsFixture, oneLineFixture, readingsFixture, rejectRowsFixture,
  saveStateFixture, statsFixture, unrecordedSaveStateFixture, updatesFixture,
} from './fixture'

// The render tier for Settings › The record (block E wave 2). One static
// render per block, against the copy contract, in both the populated arm and
// the arm a fresh database produces — because on the record page the degraded
// arm is not an edge case, it is what both live tenants show for three of the
// five sections today.

const september = updatesFixture().filter((u) => u.startedAt.startsWith('2026-09'))

const delivery = (
  <DeliveryBlock
    record={deliveryFixture()}
    stats={statsFixture()}
    updates={september}
    month="September 2026"
    readings={readingsFixture()}
  />
)

const changeLog = (
  <ChangeLogBlock
    log={changeLogFixture()}
    rows={20}
    meta={changeMetaFixture()}
    boundary="a change breaks a series; the old line is kept"
    showing={null}
    now="2026-09-28T09:00:00.000Z"
  />
)

const rejects = (
  <RejectLogBlock
    rows={rejectRowsFixture()}
    summary={gateSummaryFixture()}
    unjudged={null}
    byTerm={keptByTermFixture()}
    byPlatform={keptByPlatformFixture()}
    basis={gateBasisFixture()}
    // THE CONTROL A READER ACTUALLY GETS. `AppealButton` holds `useActionState`
    // and a static render cannot drive it, so the markup and the copy live in
    // `AppealControl` / `appeal-copy.ts` and this renders those — the stand-in
    // `<span>` that used to sit here is why the artboard's 44px button stayed
    // unported and unnoticed (design review finding 2, code review finding 7).
    control={(r) => <AppealControl filed={r.appealed ? APPEAL_FILED : null} />}
  />
)

const coverage = (
  <CoverageBlock
    title="Coverage · September 2026"
    meta="still filling · as at 28 Sep 2026"
    rows={coverageRowsFixture()}
    oneLine={oneLineFixture()}
  />
)

describe('the delivery block', () => {
  it('prints four stat cells rather than one sentence, and the gap in weeks with the month it fell in', () => {
    const text = renderText(delivery)
    expect(text).toContain('6 Apr')
    expect(text).toContain('22')
    expect(text).toContain('updates')
    // 35 days = 5 weeks, and the month the gap ended in.
    expect(text).toContain('5')
    expect(text).toContain('longest gap, in May')
    expect(text).toContain('27 Sep')
    // Four 24px mono figures, one per cell.
    expect(render(delivery).match(/text-\[24px\]/g)).toHaveLength(4)
  })

  it('never claims a start date it does not hold, and never promises a next update', () => {
    const text = renderText(delivery)
    // D14: "tracking since" is a claim about an act nothing recorded.
    expect(text).not.toContain('tracking since')
    // Nothing in the product knows when the next gather runs.
    expect(text).not.toContain('next 4 Oct')
    expect(text).not.toContain('next ')
    expect(text).toContain('first update on record')
  })

  it('dates the pills in the reader’s form and marks the update that did not finish', () => {
    const text = renderText(delivery)
    expect(text).toContain('6 Sep')
    expect(text).toContain('27 Sep')
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    const june = renderText(
      <DeliveryBlock
        record={deliveryFixture()}
        stats={statsFixture()}
        updates={updatesFixture().filter((u) => u.startedAt.startsWith('2026-06'))}
        month="June 2026"
        readings={readingsFixture()}
      />,
    )
    expect(june).toContain('did not finish')
  })

  it('keeps the delivery caveats with the delivery figures', () => {
    // Design review finding 7: rendered after the readings strip they read as
    // footnotes to the readings, and the section's argument went stats → month
    // → readings → stats again.
    const text = renderText(delivery)
    const finished = text.indexOf('of the last 8 finished')
    const readings = text.indexOf('Monthly readings')
    expect(finished).toBeGreaterThan(-1)
    expect(finished).toBeLessThan(readings)
  })

  it('prints the monthly readings strip this page never had', () => {
    const text = renderText(delivery)
    expect(text).toContain('Monthly readings')
    expect(text).toContain('6 so far')
    expect(text).toContain('monthly reading')
    expect(text).toContain('Your 6th monthly reading')
    expect(text).toContain('read at setup')
    expect(text).toContain('under the floor')
    expect(text).toContain('has not filled up')
    // The remainder is the TOTAL less the one named, not the truncated list's
    // (code review finding 2), and the months that will never fill up say so.
    expect(text).toContain('and 3 other months are under it too')
    expect(text).toContain('3 were read at setup and will not fill up any further')
  })

  it('says the reading is not recorded rather than counting zero readings', () => {
    const text = renderText(
      <DeliveryBlock
        record={deliveryFixture()}
        stats={statsFixture()}
        updates={september}
        month="September 2026"
        readings={noReadingsFixture()}
      />,
    )
    expect(text).toContain('has not been recorded for this workspace yet')
    expect(text).not.toContain('0 so far')
  })

  it('keeps the copy contract', () => {
    assertCopyContract(delivery)
    assertCopyContract(
      <DeliveryBlock
        record={deliveryFixture()}
        stats={statsFixture()}
        updates={[]}
        month="September 2026"
        readings={noReadingsFixture()}
      />,
    )
  })
})

describe('the change log', () => {
  it('prints one row per recorded change, with the short date and the amber flag', () => {
    const text = renderText(changeLog)
    expect(text).toContain('3 Sep')
    expect(text).toContain('Poler added as a rival')
    expect(text).toContain('this month')
    // 19 Aug is not this month and carries no flag.
    expect(text).toContain('19 Aug')
    expect(render(changeLog).match(/bg-warning\/20/g)).toHaveLength(1)
  })

  it('prints the before→after whole, because on those rows it is the change', () => {
    const text = renderText(changeLog)
    // Six named subjects, not "nothing → fit, comfort, delivery, price, ser…"
    // (design review finding 6).
    expect(text).toContain('fit, comfort, delivery, price, service, sizing')
    expect(text).toContain('sealand, recycled sails')
    expect(render(changeLog)).not.toContain('truncate')
  })

  it('prints a person where the artboard prints a role, because the product has no roles', () => {
    // D14. `actorWords` resolves the actor; nothing maps a user to a job title.
    const text = renderText(changeLog)
    expect(text).toContain('You')
    expect(text).not.toContain('digital director')
  })

  it('keeps the reconstructed rows apart from the record', () => {
    const text = renderText(changeLog)
    expect(text).toContain('Before the record began')
    expect(text).toContain('a label, not a record')
    expect(changeMetaFixture()).toContain('4 changes since 6 Apr')
    expect(changeMetaFixture()).toContain('1 this month')
  })

  it('says the log is not recorded rather than drawing an empty table', () => {
    const text = renderText(
      <ChangeLogBlock
        log={changeLogFixture()}
        rows={20}
        meta=""
        boundary=""
        showing={null}
        now="2026-09-28T09:00:00.000Z"
        unavailable="Nothing in the product can record a configuration change yet."
      />,
    )
    expect(text).toContain('can record a configuration change yet')
    expect(text).not.toContain('Poler')
  })

  it('keeps the copy contract', () => {
    assertCopyContract(changeLog)
  })
})

describe('the reject log', () => {
  it('draws the artboard’s three columns and the control in its own column', () => {
    const text = renderText(rejects)
    expect(text).toContain('Thrown away')
    expect(text).toContain('The rule that fired')
    expect(text).toContain('Sealand sardines recipe')
    expect(text).toContain('homonym — food')
    expect(text).toContain(APPEAL_ASK)
    expect(text).toContain(APPEAL_FILED)
  })

  it('draws the artboard’s 44px button, not a hover-underline text link', () => {
    const markup = render(rejects)
    // Two rows still offer the control; the third has been filed and says so.
    expect(markup.match(/h-\[44px\]/g)).toHaveLength(2)
    expect(markup).toContain('ring-1 ring-border')
    expect(markup).not.toContain('hover:underline')
    // One state, one sentence: the action and the control read the same string.
    expect(renderText(rejects)).not.toContain('Filed — we will look at this one.')
  })

  it('prints the note about what an appeal does and does not do', () => {
    const text = renderText(rejects)
    expect(text).toContain('files it for a person to look at')
    expect(text).toContain('does not change a month already read')
    // NOT "trains the gate": nothing reads `gate_appeals` except this page and
    // a readiness probe, so a feedback loop is a claim the code does not carry
    // (design review finding 3, code review finding 3).
    expect(text).not.toContain('train the gate')
  })

  it('says the record is not open rather than printing a confident nothing', () => {
    const text = renderText(
      <RejectLogBlock
        rows={[]}
        summary=""
        unjudged={null}
        byTerm={[]}
        byPlatform={[]}
        basis={null}
        unavailable="We do not yet show you what was set aside."
      />,
    )
    expect(text).toContain('do not yet show you')
    expect(text).not.toContain('Nothing has been set aside yet')
  })

  it('keeps the copy contract, with the stranger’s own caption exempt from rule (c)', () => {
    assertCopyContract(rejects)
  })
})

describe('the coverage grid', () => {
  it('prints every fact as a labelled figure rather than a sentence', () => {
    const markup = render(coverage)
    const text = renderText(coverage)
    for (const label of [
      'UPDATES THIS WINDOW', 'COMMENTS READ', 'VIDEOS ANALYSED', 'NOT IN ENGLISH', 'SPEECH READ',
      'ON-SCREEN TEXT READ', 'RELEVANCE GATE', 'THEMES PER VIDEO', 'TRACKING CHANGES',
      'COMPARISONS REFUSED', 'DUAL-MENTION VIDEOS', 'PLATFORM MIX', 'REDDIT', 'BELOW THE FLOOR',
    ]) {
      expect(text.toUpperCase()).toContain(label)
    }
    // Each row's figure is its own mono node, which is what makes the grid
    // scannable and what keeps rule (a) satisfiable.
    expect((markup.match(/data-copy="figure"/g) ?? []).length).toBeGreaterThanOrEqual(10)
  })

  it('carries the basis with the figures whose basis is not this window (D15)', () => {
    const text = renderText(coverage)
    expect(text).toContain('of everything we have ever read for you, not just this window')
    expect(text).toContain('Reddit excluded')
    expect(text).toContain('what was said on camera, not what was written in comments')
    // The two read-depth rows sit side by side and both owe a reader the
    // all-time basis; the twenty-word sentence is printed once and the second
    // row says it short (design review finding 5).
    expect(text.match(/of everything we have ever read for you/g)).toHaveLength(1)
  })

  it('draws one grid, so the hairlines cross the gutter', () => {
    // Design review finding 4: two independent flex columns can only line up
    // where every row is the same height, and ours differ by up to 5:1. The
    // rows are cells of ONE grid — one container, one closing rule, and each
    // row's label and value are siblings in it rather than a box of their own.
    const markup = render(coverage)
    expect(markup.match(/xl:grid-cols-\[186px_minmax\(0,1fr\)_186px_minmax\(0,1fr\)\]/g)).toHaveLength(1)
    expect(markup.match(/border-b border-border\/70/g)).toHaveLength(1)
    // One label cell per row, each opening its own hairline.
    expect(markup.match(/border-t border-border\/70 pt-3 font-mono/g)).toHaveLength(coverageRowsFixture().length)
  })

  it('refuses the artboard’s four dishonest figures and says what it prints instead', () => {
    const text = renderText(coverage)
    // Comment-dated over run-dated is neither clock.
    expect(text).not.toContain('per update')
    expect(text).toContain('dated by the comment, not by the update')
    // A run's measure is not a month's.
    expect(text).not.toContain('August 2.3')
    expect(text).toContain('an update’s own measure, never a month’s')
    // Audience denominators do not add, so the mix is counts.
    expect(text).toContain('TikTok')
    expect(text).not.toMatch(/TikTok \d+%/)
    // The refusal count belongs to the page that drew the comparisons.
    expect(text).toContain('Counted by the page that draws the comparisons')
  })

  it('prints the trailing median, the named change and the floor the strip computed', () => {
    const text = renderText(coverage)
    expect(text).toContain('trailing median')
    expect(text).toContain('Poler added as a rival, 3 Sep')
    expect(text).toContain('under the 100 a banded reading needs')
  })

  it('prints the one-line summary this page never carried', () => {
    const text = renderText(coverage)
    expect(text).toContain('This window in one line')
    expect(text).toContain('monthly reading')
    expect(text).toContain('4 updates')
  })

  it('says what a fresh database cannot say, without a zero anywhere', () => {
    const text = renderText(
      <CoverageBlock
        title="Coverage · September 2026"
        meta="nothing frozen yet"
        rows={freshCoverageRowsFixture()}
        oneLine="no monthly reading yet · 0 updates"
      />,
    )
    expect(text).toContain('No update ran inside this window.')
    expect(text).toContain('has not been recorded for this workspace yet')
    expect(text).toContain('we do not yet show it to you')
    expect(text).toContain('has not been recorded yet')
  })

  it('keeps the copy contract in both arms', () => {
    assertCopyContract(coverage)
    assertCopyContract(
      <CoverageBlock title="Coverage" meta="" rows={freshCoverageRowsFixture()} oneLine="no monthly reading yet" />,
    )
  })
})

describe('the page’s own chrome', () => {
  it('states the record’s rule in the header, in the artboard’s words', () => {
    const text = renderText(
      <RecordHeader meta="23 updates on record · since 6 Apr · longest gap 5 weeks · last on 27 Sep">
        What was delivered, what changed, what was thrown away, and how much was read. Written as the work happens; it
        is added to, never edited.
      </RecordHeader>,
    )
    expect(text).toContain('added to, never edited')
    // The brief's meta, with its first date back (design review finding 8) and
    // without the word the count cannot carry (code review finding 1).
    expect(text).toContain('23 updates on record')
    expect(text).toContain('since 6 Apr')
    // ("What was delivered" in the sentence under it describes the page, and
    // is not a caption on a count.)
    expect(text).not.toMatch(/updates delivered/)
  })

  it('tells a save that broke nothing from a save whose breakage was never written down', () => {
    const recorded = renderText(<SaveStrip state={saveStateFixture()} note="Poler added as a rival" />)
    expect(recorded).toContain('Nothing waiting to be saved.')
    expect(recorded).toContain('Last save 3 Sep — Poler added as a rival.')
    expect(recorded).toContain('Broke:')
    const unrecorded = renderText(<SaveStrip state={unrecordedSaveStateFixture()} />)
    expect(unrecorded).toContain('not written down here yet')
    expect(unrecorded).not.toContain('Broke: nothing')
  })

  it('says why there is no Export button rather than drawing one that produces nothing', () => {
    const text = renderText(
      <ScopeStatement
        text="Sealand — what this reading covers."
        why="Settings has no registered page module, so the record exports as text rather than as a file."
      />,
    )
    expect(text).toContain('no registered page module')
    expect(text).toContain('what this reading covers')
  })

  it('keeps the copy contract', () => {
    assertCopyContract(<SaveStrip state={saveStateFixture()} note="Poler added as a rival" />)
    assertCopyContract(<ScopeStatement text="x" why="y" />)
  })
})
