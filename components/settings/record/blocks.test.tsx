import { describe, expect, it } from 'vitest'

import { AppealControl } from '@/app/dashboard/settings/record/appeal-control'
import { APPEAL_ASK, APPEAL_FILED } from '@/app/dashboard/settings/record/appeal-copy'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { deliveryRecord } from '@/lib/settings/delivery'
import { readChangeLog } from '@/lib/settings/change-log'
import type { ConfigChange } from '@/lib/config-log'

import { ChangeLogBlock, PREHISTORY_LINE, sameRows } from './change-log'
import { CoverageBlock } from './coverage'
import { DeliveryBlock } from './delivery'
import { NO_EXPORT_WHY, ScopeStatement } from './header'
import { keptRateText, RejectLogBlock } from './rejects'
import {
  changeLogFixture, coverageRowsFixture, deliveryFixture,
  freshCoverageRowsFixture, gateSummaryFixture, keptByPlatformFixture,
  keptByTermFixture, lookedAtFixture, noReadingsFixture, oneLineFixture, readingsFixture, rejectRowsFixture,
  statsFixture, updatesFixture,
} from './fixture'

// The render tier for Settings › The record (block E wave 2). One static
// render per block, against the copy contract, in both the populated arm and
// the arm a fresh database produces — because on the record page the degraded
// arm is not an edge case, it is what both live tenants show for three of the
// five sections today.

const september = updatesFixture().filter((u) => u.startedAt.startsWith('2026-09'))

/** The same updates where the scheduled slots are not recorded, which is the
 *  state that composes a delivery caveat. */
const deliveryRecordUnslotted = () => deliveryRecord({ updates: updatesFixture(), slotsRecorded: false })

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
    lookedAt={lookedAtFixture()}
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
    // Four 28px mono figures, one per cell: What we changed's stat scale.
    expect(render(delivery).match(/text-\[28px\]/g)).toHaveLength(4)
  })

  it('opens its four-abreast grid at xl and its 172px gutter at lg, where the rails have stopped taking the pane', () => {
    // RC2. `md` is exactly where the app's 224px sidebar and SettingsFrame's
    // own 224px rail both arrive, so at a 768px viewport the pane is 240px:
    // measured stat-cell widths were 48px at 768 and 61px at 820, against the
    // 82px a 24px mono "27 Sep" needs, and the figures painted over their
    // neighbours. In a tile (32px inset) with the tab's 28px figure, four
    // cells get 96px at 1024 and 160px at 1280, so four abreast waits for xl.
    const markup = render(delivery)
    expect(markup).toContain('xl:grid-cols-4')
    expect(markup).not.toContain('lg:grid-cols-4')
    expect(markup).not.toContain('md:grid-cols-4')
    expect(markup).toContain('lg:grid-cols-[172px_minmax(0,1fr)]')
    expect(markup).not.toContain('md:grid-cols-[172px_minmax(0,1fr)]')
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

  it('keeps how many finished with the delivery figures, and no caveat under them (25 Sep rulings)', () => {
    // Design review finding 7: rendered after the readings strip it read as a
    // footnote to the readings.
    const text = renderText(delivery)
    const finished = text.indexOf('of the last 8 finished')
    const readings = text.indexOf('Monthly readings')
    expect(finished).toBeGreaterThan(-1)
    expect(finished).toBeLessThan(readings)
    const unslotted = renderText(
      <DeliveryBlock
        record={deliveryRecordUnslotted()}
        stats={statsFixture()}
        updates={september}
        month="September 2026"
        readings={readingsFixture()}
      />,
    )
    expect(deliveryRecordUnslotted().caveats.length).toBeGreaterThan(0)
    expect(unslotted).not.toContain('a missed slot cannot be told')
  })

  it('prints the monthly readings strip this page never had', () => {
    const text = renderText(delivery)
    expect(text).toContain('Monthly readings')
    expect(text).toContain('6 so far')
    // The months and their updates, and no line of method under them: what
    // the quarter view needs, and which months were read at setup, are gone
    // with the 25 Sep rulings.
    expect(text).not.toContain('Your 6th monthly reading')
    expect(text).not.toContain('read at setup')
    // Which months are under the floor is the coverage row's, once for the
    // page (copy de-clutter C103).
    expect(text).not.toContain('under the floor')
    expect(text).not.toContain('not one that went wrong')
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

  it('keeps the reconstructed rows apart from the record, under their own heading', () => {
    const text = renderText(changeLog)
    expect(text).toContain('Before the record began · 1 entry')
    expect(text).toContain('Reconstructed, not recorded')
  })

  it('says "Reconstructed, not recorded" and "Not known" once, under the heading, not on every row (WP3.10)', () => {
    const log = changeLogFixture()
    const [p] = log.prehistory
    const many = { ...log, prehistory: [p, { ...p, id: `${p.id}-b`, on: '2026-07-01', dateShort: '1 Jul', said: 'Search terms changed' }, { ...p, id: `${p.id}-c`, on: '2026-06-01', dateShort: '1 Jun', said: 'Rivals changed' }] }
    const text = renderText(<ChangeLogBlock log={many} rows={20} now="2026-09-28T09:00:00.000Z" />)
    expect(text.match(/Reconstructed, not recorded/g)).toHaveLength(1)
    expect(text.match(/Not known: this change was worked out afterwards/g)).toBeNull()
    expect(text).toContain(PREHISTORY_LINE)
  })

  it('says the log is not recorded rather than drawing an empty table', () => {
    const text = renderText(
      <ChangeLogBlock
        log={changeLogFixture()}
        rows={20}
       
        now="2026-09-28T09:00:00.000Z"
        unavailable="Nothing in the product can record a configuration change yet."
      />,
    )
    expect(text).toContain('can record a configuration change yet')
    expect(text).not.toContain('Poler')
  })

  it('lets both prose cells break, so the reconstructed actor stays inside its track', () => {
    // RC3. `minmax(0, 0.5fr)` stops the track demanding width; it does not
    // stop the content escaping it. "Reconstructed, not recorded" leads with
    // an unbreakable 85px word in a 53px track at 1024, where the document
    // genuinely scrolled 8px. Both cells now carry `break-words`; before, only
    // "What it breaks" did.
    expect(render(changeLog).match(/min-w-0 break-words text-\[13px\]/g)).toHaveLength(
      (changeLogFixture().recorded.length + changeLogFixture().prehistory.length) * 2,
    )
  })

  it('draws consecutive rows that print the same line once, with how many there are', () => {
    // Sealand's 24 Sep: six rows of "precision measured by hand on 33
    // labelled pairs at 0.6/0.4", one per subject, whose note names none.
    const log = changeLogFixture()
    const first = log.recorded[0]
    const twins = { ...log, recorded: [first, { ...first, id: `${first.id}-b` }, { ...first, id: `${first.id}-c` }, ...log.recorded.slice(1)] }
    const node = <ChangeLogBlock log={twins} rows={20} now="2026-09-28T09:00:00.000Z" />
    const text = renderText(node)
    expect(text.split(first.said).length - 1).toBe(1)
    expect(text).toContain('×3')
    expect(render(node)).toContain('aria-label="3 changes like this one"')
    // Every other row is drawn as it was, uncounted.
    expect(sameRows(twins.recorded).map((r) => r.count)).toEqual([3, ...log.recorded.slice(1).map(() => 1)])
    assertCopyContract(node)
  })

  it('prints its title alone: no count and no boundary sentence beside it (25 Sep rulings)', () => {
    const text = renderText(changeLog)
    expect(text).not.toContain('changes since')
    expect(text).not.toContain('No change was recorded before')
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

  it('prints no note under the rows (25 Sep rulings), and never claims an appeal trains the gate', () => {
    const text = renderText(rejects)
    expect(text).not.toContain('files it for a person to look at')
    // NOT "trains the gate": nothing reads `gate_appeals` except this page and
    // a readiness probe, so a feedback loop is a claim the code does not carry
    // (design review finding 3, code review finding 3).
    expect(text).not.toContain('train the gate')
  })

  it('answers with the set-aside count as its first line, and carries the rates’ base in the column head', () => {
    const markup = render(rejects)
    const header = markup.match(/<header[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? ''
    expect(header).not.toContain(gateSummaryFixture())
    const text = renderText(rejects)
    expect(text.indexOf(gateSummaryFixture())).toBeLessThan(text.indexOf('Thrown away'))
    expect(text).toContain('Looked at (of the last 1,000)')
    expect(text).not.toContain('most recent judgements')
  })

  it('prints its one line in the two states that have no rows', () => {
    const withheld = renderText(
      <RejectLogBlock
        rows={rejectRowsFixture()} summary={gateSummaryFixture()} unjudged={null}
        byTerm={[]} byPlatform={[]}
        withheld="The posts themselves are shown to owners and admins only."
        control={(r) => <AppealControl filed={r.appealed ? APPEAL_FILED : null} />}
      />,
    )
    expect(withheld).toContain('owners and admins only')

    const empty = renderText(
      <RejectLogBlock
        rows={[]} summary={gateSummaryFixture()} unjudged={null}
        byTerm={[]} byPlatform={[]}
        control={(r) => <AppealControl filed={r.appealed ? APPEAL_FILED : null} />}
      />,
    )
    expect(empty).toContain('Nothing has been set aside yet')
  })

  it('says the record is not open rather than printing a confident nothing', () => {
    const text = renderText(
      <RejectLogBlock
        rows={[]}
        summary=""
        unjudged={null}
        byTerm={[]}
        byPlatform={[]}
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
      'UPDATES THIS WINDOW', 'COMMENTS READ', 'VIDEOS ANALYSED', 'SPEECH READ',
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
    expect(text).toContain('all time, Reddit excluded')
    // No language share on the record either (2026-09-24).
    expect(text).not.toContain('not in English')
    expect(text).not.toContain('what was said on camera, not what was written in comments')
    // The two read-depth rows sit side by side and both owe a reader the
    // all-time basis; the twenty-word sentence is printed once and the second
    // row says it short (design review finding 5).
    expect(text.match(/all time, Reddit excluded/g)).toHaveLength(1)
  })

  it('draws one grid, so the hairlines cross the gutter', () => {
    // Design review finding 4: two independent flex columns can only line up
    // where every row is the same height, and ours differ by up to 5:1. The
    // rows are cells of ONE grid — one container, one closing rule, and each
    // row's label and value are siblings in it rather than a box of their own.
    const markup = render(coverage)
    // One pair abreast from 1024 and at every wider width (fresh design check,
    // 26 Sep): in a tile, at the tab's 15px, a two-up value track at 1440 is
    // about 200px. The step stays an arbitrary `min-[…]` variant (RC10).
    expect(markup.match(/min-\[1024px\]:grid-cols-\[186px_minmax\(0,1fr\)\]/g)).toHaveLength(1)
    expect(markup).not.toContain('min-[1440px]:grid-cols')
    expect(markup).not.toContain('xl:grid-cols')
    expect(markup.match(/border-b border-border\/70/g)).toHaveLength(1)
    // One label cell per row, each opening its own hairline, in the tab's
    // 13px sentence-case head voice, not mono capitals.
    expect(markup.match(/border-t border-border\/70 pt-3 text-\[13px\] font-medium/g)).toHaveLength(coverageRowsFixture().length)
    // The section's own eyebrow is the one thing set in capitals.
    expect(markup.match(/uppercase/g)).toHaveLength(1)
  })

  it('refuses the artboard’s four dishonest figures and says what it prints instead', () => {
    const text = renderText(coverage)
    // Comment-dated over run-dated is neither clock.
    expect(text).not.toContain('per update')
    // A run's measure is not a month's; the base names the update, and no
    // method wording follows it (WP3.10).
    expect(text).not.toContain('August 2.3')
    expect(text).toContain('attached per analysed video on the most recent update')
    for (const method of ['dated by the comment, not by the update', 'which is the only span', 'and no deeper', 'which has neither audio', 'so no month before that can show it']) {
      expect(text).not.toContain(method)
    }
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
    // Off `belowFloorTotal`, the way the route composes it: four months are
    // under the floor and three are listed (code review finding 2).
    expect(text).toContain('under 100 · 3 other months too')
  })

  it('prints no one-line summary of the rows under it (copy de-clutter C8)', () => {
    const text = renderText(coverage)
    expect(text).not.toContain('This window in one line')
  })

  it('says what a fresh database cannot say, without a zero anywhere', () => {
    const text = renderText(
      <CoverageBlock
        title="Coverage · September 2026"
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
      <CoverageBlock title="Coverage" rows={freshCoverageRowsFixture()} oneLine="no monthly reading yet" />,
    )
  })
})

describe('the 25 Sep rulings, on every section of the tab (Heinrich’s default, 26 Sep)', () => {
  const sections = { delivery, changeLog, rejects, coverage }

  it('draws each section as a tile whose header is its title alone', () => {
    for (const [name, node] of Object.entries(sections)) {
      const markup = render(node)
      expect(markup, name).toContain('data-record-section=""')
      expect(markup, name).toContain('shadow-tile')
      const header = markup.match(/<header[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? ''
      // The title's <h2> and nothing beside it: no meta, no note.
      expect(header.replace(/<h2[^>]*>[\s\S]*?<\/h2>/, '').replace(/<[^>]+>/g, '').trim(), name).toBe('')
    }
  })

  it('puts no footer under a section that has no link to give', () => {
    for (const [name, node] of Object.entries(sections)) expect(render(node), name).not.toContain('<footer')
  })

  it('prints none of the method lines the Phase 1 page carried', () => {
    const all = Object.values(sections).map((n) => renderText(n)).join(' ')
    for (const line of [
      'every update since the first one on record',
      'the quarter view needs',
      'read at setup',
      'No change was recorded before',
      'files it for a person to look at',
      'most recent judgements',
      'still filling',
      'select it and paste',
      'added to, never edited',
    ]) expect(all).not.toContain(line)
  })
})

describe('the page’s own chrome', () => {
  it('says each note-less change of ours on an MF1 surface by its title alone in the change log (27 Sep)', () => {
    const ours = (id: string, surface: string, field: string, at: string, source: ConfigChange['source']): ConfigChange => ({
      id, client_id: 't1', changed_at: at, surface: surface as ConfigChange['surface'], field, before: null, after: null,
      actor_kind: 'script', actor_user_id: null, actor_label: `scripts/${id}.ts --apply`, run_id: null, source,
      rows_affected: null, note: null, affects_audiences: null, affects_months: null,
    })
    const log = readChangeLog({ rows: [
      ours('seed', 'terms', 'industry_keywords', '2026-09-13T10:00:00Z', 'logged'),
      ours('gate', 'gate_rule', 'relevance_gate', '2026-09-25T16:18:47Z', 'reconstructed'),
      ours('attr', 'attribution', 'attribution_v3', '2026-09-25T16:18:47Z', 'reconstructed'),
      ours('seg', 'segment', 'segments_v1', '2026-09-27T12:00:00Z', 'logged'),
    ] })
    const node = <ChangeLogBlock log={log} rows={20} now="2026-09-28T09:00:00.000Z" />
    const text = renderText(node)
    for (const title of ['How we check relevance', 'How posts are filed by brand', 'How makers and off-topic videos are marked']) expect(text).toContain(title)
    expect(text).not.toMatch(/relevance_gate|attribution_v3|segments_v1|marked changed|relevance changed|brand changed|undefined|""/)
    assertCopyContract(node)
  })

  it('says why there is no Export button rather than drawing one that produces nothing', () => {
    // THE ROUTE'S OWN SENTENCE (RC4). This asserted on a stand-in of its own,
    // which is how "a registered page" and "page module" — the export route's
    // internals — survived a copy lens on a passing test and reached a client
    // as visible body text.
    const text = renderText(
      <ScopeStatement text="Sealand — what this reading covers." why={NO_EXPORT_WHY} />,
    )
    expect(text).toContain('no file to download')
    expect(text).toContain('what this reading covers')
    for (const word of ['page module', 'registered page', 'registry', 'renderable', 'module']) {
      expect(text).not.toContain(word)
    }
  })

  it('keeps the copy contract', () => {
    assertCopyContract(<ScopeStatement text="x" why="y" />)
  })
})

describe('the reject log’s kept rates (deploy 2 review)', () => {
  it('prints a rate under 100 looked at as its count, and the column\'s shares as whole percents (WP3.10)', () => {
    // Staging's 2 Oct rows, "of the last 1,000": made from waste 38 of 100,
    // north face backpack 48 of 91, sustainable fashion 87 of 87.
    const set = [
      { found: 100, kept: 38, keptPct: 38 },
      { found: 91, kept: 48, keptPct: 52.747 },
      { found: 87, kept: 87, keptPct: 100 },
    ]
    const rate = keptRateText(set)
    expect(set.map(rate)).toEqual(['38%', '48 of 91', '87 of 87'])
    // Every base at 100 or more keeps its decimal.
    expect(keptRateText([{ found: 1840, keptPct: 76.2 }])({ found: 1840, kept: 1402, keptPct: 76.2 })).toBe('76.2%')
  })
})
