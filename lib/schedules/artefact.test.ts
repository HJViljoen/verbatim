import { describe, expect, it } from 'vitest'
import { RETIRED_DIGEST_KEY, WEEKLY_STARTER_KEY, artefactTitle, scheduleArtefact, sendsArtefact, sendsWeekly } from './artefact'
import { STARTER_TEMPLATES, starterTemplate, starterTemplates } from '../reports/templates'
import { DEFAULT_SCHEDULE_STARTER } from './default'

describe('which artefact a schedule sends', () => {
  it('reads the column when M8 has been applied', () => {
    expect(scheduleArtefact({ starter_key: null, artefact: 'weekly' })).toBe('weekly')
    expect(scheduleArtefact({ starter_key: null, artefact: 'brief:sales' })).toBe('brief:sales')
  })

  it('falls back to the starter key until then', () => {
    expect(scheduleArtefact({ starter_key: WEEKLY_STARTER_KEY })).toBe('weekly')
    expect(sendsWeekly({ starter_key: WEEKLY_STARTER_KEY })).toBe(true)
  })

  it('answers null for a schedule nothing has said anything about', () => {
    expect(scheduleArtefact({ starter_key: null })).toBeNull()
    expect(scheduleArtefact({ starter_key: 'monthly_marketing_review' })).toBeNull()
  })

  it('leaves the retiring digest sending the digest', () => {
    // The point of the migration script: a stored schedule does not change what
    // it sends because a new artefact exists. An operator moves it.
    expect(sendsWeekly({ starter_key: RETIRED_DIGEST_KEY })).toBe(false)
  })

  it('prefers the column over the key, so a migrated row wins', () => {
    expect(scheduleArtefact({ starter_key: RETIRED_DIGEST_KEY, artefact: 'weekly' })).toBe('weekly')
  })

  it('ignores an empty column rather than reading it as an artefact', () => {
    expect(scheduleArtefact({ starter_key: WEEKLY_STARTER_KEY, artefact: '  ' })).toBe('weekly')
    expect(scheduleArtefact({ starter_key: null, artefact: null })).toBeNull()
  })
})

describe('the weekly starter', () => {
  it('resolves, so a guard asking "is this a template we know?" answers yes', () => {
    // Without this, editing the recipients of the one schedule that matters is
    // refused with "Pick a template." (app/dashboard/studio/actions.ts).
    expect(starterTemplate(WEEKLY_STARTER_KEY)?.key).toBe(WEEKLY_STARTER_KEY)
  })

  it('is never offered as a starting point for a report — it has no sections', () => {
    expect(starterTemplates().some((t) => t.key === WEEKLY_STARTER_KEY)).toBe(false)
    expect(starterTemplate(WEEKLY_STARTER_KEY)?.sections).toEqual([])
  })
})

describe('the retiring starter', () => {
  it('still resolves, because stored rows name it', () => {
    expect(starterTemplate(RETIRED_DIGEST_KEY)?.key).toBe(RETIRED_DIGEST_KEY)
  })

  it('is never offered for a new report again', () => {
    expect(starterTemplates().some((t) => t.key === RETIRED_DIGEST_KEY)).toBe(false)
    expect(STARTER_TEMPLATES.some((t) => t.key === RETIRED_DIGEST_KEY)).toBe(true)
  })

  it('is not what a new workspace is born on', () => {
    expect(DEFAULT_SCHEDULE_STARTER).toBe(WEEKLY_STARTER_KEY)
    expect(sendsWeekly({ starter_key: DEFAULT_SCHEDULE_STARTER })).toBe(true)
  })
})

// The Studio builds its list out of `reports`, so a schedule with no report row
// had no screen at all once an operator migrated it: no recipients field, no
// Preview, no Send now, no Active toggle, and SQL the only door to the list of
// people it emails. These two answers are what puts it back on the page.
describe('a schedule with no report of its own', () => {
  it('is the one the Studio has to list in its own right', () => {
    expect(sendsArtefact({ starter_key: WEEKLY_STARTER_KEY, report_id: null })).toBe(true)
    expect(sendsArtefact({ starter_key: null, report_id: null, artefact: 'weekly' })).toBe(true)
  })

  it('is not one that already has a template to be listed under', () => {
    expect(sendsArtefact({ starter_key: WEEKLY_STARTER_KEY, report_id: 'r1' })).toBe(false)
    expect(sendsArtefact({ starter_key: RETIRED_DIGEST_KEY, report_id: null })).toBe(false)
    expect(sendsArtefact({ starter_key: null, report_id: null })).toBe(false)
  })

  it('has a name to be listed under, for every artefact the column may hold', () => {
    expect(artefactTitle('weekly')).toBe('Weekly report')
    expect(artefactTitle('monthly')).toBe('Monthly report')
    expect(artefactTitle('quarterly')).toBe('Quarterly report')
    expect(artefactTitle('brief:sales')).toBe('Sales brief')
    expect(artefactTitle(null)).toBe('Sending')
  })
})
