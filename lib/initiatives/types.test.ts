import { describe, it, expect } from 'vitest'
import {
  initiativesOf, isTrackingSomething, toInitiative, EMPTY_INITIATIVES,
  type InitiativesData, type InitiativeDbRow,
} from './types'

// A snapshot frozen before this tile existed has no `initiatives` key at all,
// and `slides()` plus every tile renderer are called with hydrated snapshot
// data as often as with live data — the render route, the report deck, a share
// link, the Studio editor, the "email as sent" re-render. Reaching through the
// absent key 500s all five. This is the guard they all go through.
const frozenBeforeThisShipped = JSON.parse(
  '{"brand":"Sealand","runDate":"2026-08-23","hero":{"show":true}}',
) as { initiatives?: InitiativesData }

describe('initiativesOf — a snapshot that predates the tile', () => {
  it('hands back the empty shape rather than undefined', () => {
    expect(initiativesOf(frozenBeforeThisShipped)).toEqual({ rows: [], total: 0 })
    expect(initiativesOf(frozenBeforeThisShipped).rows.length).toBe(0)
    expect(isTrackingSomething(frozenBeforeThisShipped)).toBe(false)
  })

  it('passes live data straight through', () => {
    const live: { initiatives?: InitiativesData } = {
      initiatives: { rows: [{ id: 'i1', title: 'Comfort', direction: 'up', startedLabel: '1 Aug', series: [1, 2], line: 'Up 1.0 points since 1 Aug · 2 updates', verdict: 'moving_up', theirWay: true, latestShare: 2, sentimentDelta: null }], total: 1 },
    }
    expect(initiativesOf(live).total).toBe(1)
    expect(isTrackingSomething(live)).toBe(true)
  })

  it('a tenant with initiatives that measured nothing is still tracking', () => {
    expect(isTrackingSomething({ initiatives: { rows: [], total: 0 } })).toBe(false)
  })

  it('the shared empty shape is the empty shape', () => {
    expect(EMPTY_INITIATIVES).toEqual({ rows: [], total: 0 })
  })
})

describe('toInitiative', () => {
  const row: InitiativeDbRow = {
    id: 'i1', title: 'Comfort', goal: null, registry_ids: ['reg-1'],
    direction: 'down', started_at: '2026-08-01', status: 'done', created_at: '2026-08-01T00:00:00Z',
  }

  it('reads the row as the app wants it', () => {
    expect(toInitiative(row)).toMatchObject({ registryIds: ['reg-1'], direction: 'down', status: 'done' })
  })

  it('falls back rather than trusting a value the CHECK should have stopped', () => {
    const odd = toInitiative({ ...row, direction: 'sideways', status: 'whatever', registry_ids: null })
    expect(odd).toMatchObject({ direction: 'up', status: 'active', registryIds: [] })
  })
})
