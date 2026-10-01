import { describe, expect, it } from 'vitest'
import { SEALAND_CLIENT_ID } from '../config'
import { marketSubjectsFixture } from '../../components/pages/subjects/fixture'
import type { SubjectsData } from './subjects'
import { COVERS_MAX, coversLine, quoteCite, subjectKindLabel, subjectsView, type SubjectReadLine } from './subjects-view'

// The Subjects page's view (pages rebuild, 1 Oct; Page-Subjects.dc.html), on
// the staging-shaped Sealand September fixture: Looks & style open, 103 of the
// market's 654 videos.

const read = (over: Partial<SubjectReadLine> = {}): SubjectReadLine => ({
  month: '2026-09-01',
  sentence: 'Buyers ask for specific bags and replacements, naming size and colour before they buy.',
  contents: ['Searching for a specific bag', 'Looking for a better replacement bag'],
  quote: { ref: 'e:1', text: 'I think it’s time to buy the bluey purple smaller backpack!', date: '2026-09-21', platform: 'youtube', thread: null },
  ...over,
})

describe('the list', () => {
  it('is every subject in one list: the ready ones by their market level, then the rest by name', () => {
    const v = subjectsView(marketSubjectsFixture(), null, 'c')
    const ready = marketSubjectsFixture().list.rows.filter((r) => r.market).map((r) => r.name)
    expect(v.rows.slice(0, ready.length).map((r) => r.name)).toEqual(ready)
    const rest = v.rows.slice(ready.length).map((r) => r.name)
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)))
    expect(v.rows.filter((r) => r.selected).map((r) => r.id)).toEqual(['s-looks'])
  })

  it('carries no figure on any row', () => {
    for (const r of subjectsView(marketSubjectsFixture(), null, 'c').rows) expect(Object.keys(r).sort()).toEqual(['description', 'href', 'id', 'name', 'selected', 'status'])
  })
})

describe('the open subject', () => {
  it('leads with its market level on the rail\'s base, its rank in words, and the bar against 100%', () => {
    const p = subjectsView(marketSubjectsFixture(), null, 'c').pane!
    expect(p.standing).toEqual({ value: '16%', width: (103 / 654) * 100, n: 654, rank: 'the biggest' })
  })

  it('prints a count, not a share, under 100 videos', () => {
    const data = marketSubjectsFixture()
    const thin: SubjectsData = { ...data, selected: { ...data.selected!, market: { k: 12, n: 80, pct: null }, kindsIn: { of: 12, rows: [{ kind: 'praise', label: 'x', k: 9 }] } } }
    const p = subjectsView(thin, null, 'c').pane!
    expect(p.standing!.value).toBe('12')
    expect(p.kinds).toMatchObject({ of: 12, share: false, rows: [{ value: '9' }] })
  })

  it('says "so far" only while the month is under way', () => {
    const data = marketSubjectsFixture()
    expect(subjectsView(data, null, 'c').monthWords).toBe('September')
    const sofar = { ...data, reading: { ...(data.reading ?? {}), month: '2026-09-01', state: 'so_far' } } as SubjectsData
    expect(subjectsView(sofar, null, 'c').monthWords).toBe('September so far')
  })

  it('prints the week read\'s sentence, conversations and quote for the read\'s own month only', () => {
    const p = subjectsView(marketSubjectsFixture(), read(), 'c').pane!
    expect(p.sentence).toContain('Buyers ask for specific bags')
    expect(p.contents).toHaveLength(2)
    expect(p.quote?.text).toContain('bluey purple')
    const october = subjectsView(marketSubjectsFixture(), read({ month: '2026-10-01' }), 'c').pane!
    expect(october.sentence).toBeNull()
    expect(october.contents).toEqual([])
    expect(october.quote).toBeNull()
  })

  it('the kinds on its own videos, with the market\'s words', () => {
    const p = subjectsView(marketSubjectsFixture(), null, SEALAND_CLIENT_ID).pane!
    expect(p.kinds!.of).toBe(103)
    expect(p.kinds!.rows[0]).toMatchObject({ kind: 'praise', label: 'Praised a bag', value: '90%' })
    expect(p.kinds!.rows.map((r) => r.label)).toContain('Said they want to buy')
  })

  it('names what praise is of only where the product knows what the tenant sells', () => {
    expect(subjectKindLabel('praise', SEALAND_CLIENT_ID)).toBe('Praised a bag')
    expect(subjectKindLabel('praise', 'someone-else')).toBe('Praised it')
    expect(subjectKindLabel('buying_trigger', 'x')).toBe('Said what made them look')
    expect(subjectKindLabel('objection', 'x')).toBe('Pushed back')
  })
})

// T0a, ruling U6: a subject that is not ready prints nothing that rests on its
// matching. It keeps its name and what the read says about it.
describe('a subject that is not ready', () => {
  for (const calibration of ['provisional', 'failed'] as const) {
    it(`${calibration}: no level, no kinds, no questions`, () => {
      const data = marketSubjectsFixture()
      const p = subjectsView({ ...data, selected: { ...data.selected!, calibration } }, read(), 'c').pane!
      expect(p.standing).toBeNull()
      expect(p.kinds).toBeNull()
      expect(p.questions).toBeNull()
      expect(p.name).toBe('Looks & style')
      expect(p.sentence).toContain('Buyers ask')
    })
  }
})

describe('the small pieces', () => {
  it('cuts the client\'s definition near 160 characters, at a word, with an ellipsis', () => {
    const long = 'Comments about wanting to buy, where to buy or which store to visit, how shipping and delivery work and what they cost, delivery problems, and ordering a custom bag with a name on it.'
    const c = coversLine(long)!
    expect(c.length).toBeLessThanOrEqual(COVERS_MAX + 1)
    expect(c.endsWith('…')).toBe(true)
    expect(c).toMatch(/^Comments about wanting to buy, .* custom…$/)
    expect(coversLine('Short.')).toBe('Short.')
    expect(coversLine('  ')).toBeNull()
  })

  it('cites a quote as the design does: "YouTube · 21 Sep"', () => {
    expect(quoteCite({ platform: 'youtube', date: '2026-09-21' })).toBe('YouTube · 21 Sep')
    expect(quoteCite({ platform: null, date: null })).toBe('')
  })
})
