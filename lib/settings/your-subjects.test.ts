import { describe, expect, it } from 'vitest'

import { fixtureSubjectId, SUBJECTS_FIXTURE_CLIENT, subjectsFixtureRows, subjectsFixtureTable } from '@/components/pages/settings/subjects/fixture'
import { fakeDb } from '../test/fake-db'
import { loadYourSubjects, yourSubjectsView } from './your-subjects'

// Settings › Your subjects (T10c): the read and the view. Offline.

describe('loadYourSubjects', () => {
  it('reads the followed and suggested subjects of the session\'s client, never a stopped one', async () => {
    const table = [...subjectsFixtureTable(), { id: fixtureSubjectId(99), client_id: SUBJECTS_FIXTURE_CLIENT, name: 'Old name', description: null, status: 'retired', origin: 'client', named_at: '2026-08-01T00:00:00.000Z' }]
    const db = fakeDb({ subjects: table })
    const read = await loadYourSubjects(db.client as never, SUBJECTS_FIXTURE_CLIENT)
    expect(read.state).toBe('ready')
    if (read.state !== 'ready') return
    expect(read.rows.map((r) => r.name)).not.toContain('Old name')
    expect(read.rows).toHaveLength(8)
    expect(db.calls[0].filters).toEqual([`client_id=${SUBJECTS_FIXTURE_CLIENT}`, 'status in 2'])
  })

  it('answers missing where the subjects migration is not applied', async () => {
    expect(await loadYourSubjects(fakeDb({}).client as never, SUBJECTS_FIXTURE_CLIENT)).toEqual({ state: 'missing' })
  })
})

describe('yourSubjectsView', () => {
  it('splits what is followed from what waits, links a followed one to Market, and says where a suggestion came from', () => {
    const v = yourSubjectsView(subjectsFixtureRows(), true)
    expect(v.following.map((s) => s.name)).toEqual(['Durability', 'Recycled materials', 'Waterproofing', 'Looks & style', 'Price', 'Comfort'])
    expect(v.activeCount).toBe(6)
    expect(v.max).toBe(10)
    expect(v.following[0].href).toBe(`/dashboard/market/subjects/${fixtureSubjectId(1)}`)
    expect(v.waiting.map((s) => [s.name, s.because])).toEqual([
      ['Community & purpose', 'you said this in your own posts'],
      ['Travel size rules', 'the category raised it in the videos we read'],
    ])
  })
})
