import { describe, expect, it } from 'vitest'
import { starterTemplate } from '../reports/templates'
import { QUARTERLY_STARTER_KEY } from './artefact'
import { CADENCES } from './types'
import { normaliseRecipients, recipientsSchema, scheduleInputSchema, splitRecipients } from './validate'

describe('recipients', () => {
  it('splits a pasted list on commas, semicolons, newlines and spaces', () => {
    expect(splitRecipients('a@x.com, b@x.com;c@x.com\nd@x.com e@x.com')).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com'])
    expect(splitRecipients('')).toEqual([])
  })
  it('lower-cases and dedupes, keeping first-seen order', () => {
    expect(normaliseRecipients([' Malori@Ossur.com', 'anne@ossur.com', 'malori@ossur.com '])).toEqual(['malori@ossur.com', 'anne@ossur.com'])
  })
  it('rejects a non-address and more than the cap', () => {
    expect(recipientsSchema.safeParse(['not an email']).success).toBe(false)
    const many = Array.from({ length: 26 }, (_, i) => `p${i}@x.com`)
    expect(recipientsSchema.safeParse(many).success).toBe(false)
    expect(recipientsSchema.safeParse(many.slice(0, 25)).success).toBe(true)
  })
})

describe('scheduleInputSchema', () => {
  const base = { name: 'Weekly digest', cadence: 'every_update', recipients: ['a@x.com'], attachPdf: true, shareDays: 30, active: true }
  it('takes exactly one template — a starter key or a report id', () => {
    expect(scheduleInputSchema.safeParse({ ...base, starterKey: 'weekly_digest' }).success).toBe(true)
    expect(scheduleInputSchema.safeParse({ ...base, reportId: '4f6c4a1c-2b2f-4d1a-9d3a-3e3f9a1b2c3d' }).success).toBe(true)
    expect(scheduleInputSchema.safeParse({ ...base }).success).toBe(false)
    expect(scheduleInputSchema.safeParse({ ...base, starterKey: 'weekly_digest', reportId: '4f6c4a1c-2b2f-4d1a-9d3a-3e3f9a1b2c3d' }).success).toBe(false)
  })
  it('review defaults to off and round-trips on', () => {
    expect(scheduleInputSchema.parse({ ...base, starterKey: 'weekly_digest' }).review).toBe(false)
    expect(scheduleInputSchema.parse({ ...base, starterKey: 'weekly_digest', review: true }).review).toBe(true)
  })
  it('share-link life is 7, 30, 90 or never', () => {
    expect(scheduleInputSchema.safeParse({ ...base, starterKey: 'weekly_digest', shareDays: null }).success).toBe(true)
    expect(scheduleInputSchema.safeParse({ ...base, starterKey: 'weekly_digest', shareDays: 14 }).success).toBe(false)
  })
})

describe('the quarterly cadence', () => {
  it('is offered by the picker and accepted by the Studio’s own routes', () => {
    // WP16 filtered it out of CADENCES and refused it here, with a comment
    // saying the picker gains it with the review that fills it — WP20 is that
    // review. Until this, a quarterly schedule created through Settings could
    // not afterwards be edited in the Studio at all.
    expect(CADENCES.map((c) => c.key)).toContain('quarterly')
    const parsed = scheduleInputSchema.safeParse({
      name: 'Quarterly review',
      starterKey: QUARTERLY_STARTER_KEY,
      reportId: null,
      cadence: 'quarterly',
      recipients: ['someone@example.com'],
      attachPdf: true,
      shareDays: 30,
      active: true,
    })
    expect(parsed.success).toBe(true)
  })

  it('resolves the starter it is created under, so editing it is not refused', () => {
    // app/dashboard/studio/actions.ts refuses an unknown starter with "Pick a
    // template."; lib/reports/templates.ts says the weekly entry exists to
    // prevent exactly that, and QUARTERLY_STARTER_KEY had no entry.
    expect(starterTemplate(QUARTERLY_STARTER_KEY)?.artefact).toBe(true)
  })
})
