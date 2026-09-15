import { describe, it, expect } from 'vitest'
import {
  buildProvisionPlan, validateSpec, validateHandles, normaliseHandle,
  INSTAGRAM_HANDLE, TIKTOK_HANDLE, HANDLE_FORMAT_CAVEAT, LIMITS,
} from './provisioning'

const base = { companyName: 'Dagne Dover', competitorNames: ['Away', 'Beis', 'Calpak'] }

describe('validateSpec — fail with a sentence, not a constraint name (Tier 2)', () => {
  it('accepts a well-formed spec', () => {
    expect(validateSpec(base)).toEqual([])
  })

  it('requires competitors, because half the corpus is found through them', () => {
    expect(validateSpec({ ...base, competitorNames: [] })[0]).toContain('at least one competitor')
  })

  it('mirrors the database ceilings rather than discovering them on write', () => {
    expect(validateSpec({ ...base, maxVideos: LIMITS.maxVideos + 1 })[0]).toContain('at most 100')
    expect(validateSpec({ ...base, commentDepth: 501 })[0]).toContain('at most 500')
    expect(validateSpec({ ...base, competitorNames: Array.from({ length: 16 }, (_, i) => `B${i}`) })[0])
      .toContain('at most 15 competitors')
  })

  it('rejects an unknown platform and a malformed recipient', () => {
    expect(validateSpec({ ...base, platforms: ['tiktok', 'twitter'] })[0]).toContain('twitter')
    expect(validateSpec({ ...base, reportEmails: ['not-an-email'] })[0]).toContain('not an email address')
  })

  it('rejects a report day the scheduler would never match', () => {
    expect(validateSpec({ ...base, reportDay: 'someday' })[0]).toContain('reportDay must be one of')
  })
})

describe('buildProvisionPlan (Tier 2)', () => {
  it('derives competitor_keywords, which no hand-made tenant ever had', () => {
    const p = buildProvisionPlan(base)
    expect(p.config.competitor_keywords).toEqual(['Away', 'Beis', 'Calpak'])
    expect(p.config.competitor_names).toEqual(['Away', 'Beis', 'Calpak'])
  })

  it('warns when a competitor is too short to search on', () => {
    const p = buildProvisionPlan({ ...base, competitorNames: ['Away', 'On'] })
    expect(p.config.competitor_keywords).toEqual(['Away'])
    expect(p.warnings.join(' ')).toContain('tag but not gather')
  })

  it('creates the tenant DORMANT and PAUSED unless an operator approves', () => {
    const p = buildProvisionPlan(base)
    expect(p.client.is_active).toBe(false)
    expect(p.client.approved_at).toBeNull()
    // A new tenant produces its first read when asked, not on the next tick.
    expect(p.config.report_period).toBe('paused')
  })

  it('approving is explicit, and says what it means', () => {
    const p = buildProvisionPlan({ ...base, approve: true }, new Date('2026-08-18T12:00:00Z'))
    expect(p.client.is_active).toBe(true)
    expect(p.client.approved_at).toBe('2026-08-18T12:00:00.000Z')
    expect(p.warnings.join(' ')).toContain('scheduler will pick this tenant up')
  })

  it('defaults max_videos above the column default, which is demo-sized', () => {
    // The DB default of 10 leaves almost nothing standing after the analysis
    // floors (>= 5 comments per video, >= 2 videos per theme).
    expect(buildProvisionPlan(base).config.max_videos).toBe(30)
  })

  it('brand keywords default to the company name', () => {
    expect(buildProvisionPlan(base).config.brand_keywords).toEqual(['Dagne Dover'])
  })

  it('flags a tenant that will run and email nobody', () => {
    expect(buildProvisionPlan(base).warnings.join(' ')).toContain('email nobody')
  })

  it('flags reddit, which spends on every run', () => {
    const p = buildProvisionPlan({ ...base, platforms: ['tiktok', 'reddit'] })
    expect(p.warnings.join(' ')).toContain('reddit is enabled')
  })
})


describe('validateHandles — a wrong handle credits someone else\'s posts', () => {
  it('accepts the shape both live tenants actually store', () => {
    expect(validateHandles({ instagram: 'cotopaxi', tiktok: 'cotopaxiofficial', youtube: 'UCjGWYNy7xrGOJ72AeMBb-hA' })).toEqual([])
  })

  it("accepts Ottobock's set as resolved for Össur (Phase 0 decision D3)", () => {
    // The set awaiting Heinrich's go-ahead: @ottobock's channel id, plus the
    // Instagram and TikTok handles read off the brand's own accounts. Pinned
    // here so the validator and the decision cannot drift apart unnoticed.
    expect(validateHandles({ instagram: 'ottobock', tiktok: 'ottobock', youtube: 'UCPTbB5O4fdDTYeZNaj5ihFQ' })).toEqual([])
  })

  it('refuses a YouTube @name, which the owned reader silently reads nothing for', () => {
    const errors = validateHandles({ youtube: 'ottobock' })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('channel id')
  })

  it('refuses a channel id of the wrong length or prefix', () => {
    expect(validateHandles({ youtube: 'UCtooshort' })).toHaveLength(1)
    expect(validateHandles({ youtube: 'ABPTbB5O4fdDTYeZNaj5ihFQ' })).toHaveLength(1)
    expect(validateHandles({ youtube: 'UCPTbB5O4fdDTYeZNaj5ihFQ' })).toEqual([])
  })

  it('refuses a platform no account can be read on, Reddit included', () => {
    expect(validateHandles({ reddit: 'amputee' })[0]).toContain('not a platform')
    expect(validateHandles({ twitter: 'ossur' })[0]).toContain('not a platform')
  })

  it('refuses a leading @ and an empty value rather than storing either', () => {
    expect(validateHandles({ instagram: '@ottobock' })[0]).toContain('drop the leading @')
    expect(validateHandles({ tiktok: '  ' })[0]).toContain('empty handle')
  })

  it('checks an Instagram username against Instagram\'s own rule (WP16)', () => {
    // Every handle the two live tenants store passes.
    expect(validateHandles({ instagram: 'ossur_corp' })).toEqual([])
    expect(validateHandles({ instagram: 'cotopaxiofficial' })).toEqual([])
    // Instagram's published rule: no leading or trailing period, no two in a
    // row, at most 30 characters, and nothing outside [A-Za-z0-9._].
    expect(validateHandles({ instagram: '.ossur' })[0]).toContain('not an Instagram username')
    expect(validateHandles({ instagram: 'ossur.' })[0]).toContain('not an Instagram username')
    expect(validateHandles({ instagram: 'os..sur' })[0]).toContain('not an Instagram username')
    expect(validateHandles({ instagram: 'össur' })[0]).toContain('not an Instagram username')
    expect(validateHandles({ instagram: 'a'.repeat(31) })[0]).toContain('not an Instagram username')
  })

  it('checks a TikTok username, which permits what Instagram forbids', () => {
    expect(validateHandles({ tiktok: 'sealandgear' })).toEqual([])
    // TikTok allows a LEADING period; Instagram does not. Two expressions, not
    // one, precisely for this.
    expect(INSTAGRAM_HANDLE.test('.gear')).toBe(false)
    expect(TIKTOK_HANDLE.test('.gear')).toBe(true)
    expect(validateHandles({ tiktok: 'gear.' })[0]).toContain('not a TikTok username')
    expect(validateHandles({ tiktok: 'a' })[0]).toContain('not a TikTok username')
  })

  it('names a pasted link as a link instead of as a bad username', () => {
    const errors = validateHandles({ instagram: 'https://www.instagram.com/ossur_corp/' })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('looks like a link')
  })

  it('takes a handle out of what a person actually pastes', () => {
    expect(normaliseHandle('instagram', 'https://www.instagram.com/ossur_corp/')).toBe('ossur_corp')
    expect(normaliseHandle('instagram', '@ossur_corp')).toBe('ossur_corp')
    expect(normaliseHandle('tiktok', 'https://www.tiktok.com/@sealandgear?lang=en')).toBe('sealandgear')
    expect(validateHandles({ instagram: normaliseHandle('instagram', 'instagram.com/ossur_corp') })).toEqual([])
  })

  it('takes a YouTube channel id out of a channel URL and refuses to invent one', () => {
    expect(normaliseHandle('youtube', 'https://www.youtube.com/channel/UCjGWYNy7xrGOJ72AeMBb-hA'))
      .toBe('UCjGWYNy7xrGOJ72AeMBb-hA')
    // An @name URL is handed back untouched, so the channel-id error fires
    // rather than a bare '@name' being stored as if it were a handle.
    const pasted = normaliseHandle('youtube', 'https://www.youtube.com/@ottobock')
    expect(pasted).toBe('https://www.youtube.com/@ottobock')
    expect(validateHandles({ youtube: pasted })[0]).toContain('channel id')
  })

  it('says out loud what no format check can catch', () => {
    // @cotopaxi — a private individual named Nelson — passes TikTok's rule as
    // cleanly as @cotopaxiofficial does. The caveat is the second check.
    expect(validateHandles({ tiktok: 'cotopaxi' })).toEqual([])
    expect(HANDLE_FORMAT_CAVEAT).toContain('wrong account')
  })

  it('carries the rival name when a spec is validated whole', () => {
    const errors = validateSpec({
      companyName: 'Össur',
      competitorNames: ['Ottobock'],
      competitorHandles: { Ottobock: { youtube: 'ottobock' } },
    })
    expect(errors[0]).toContain('Ottobock')
    expect(errors[0]).toContain('channel id')
  })
})
