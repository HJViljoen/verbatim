import { describe, it, expect } from 'vitest'
import {
  initiativesOf, initiativeTile, isTrackingSomething, toInitiative, EMPTY_INITIATIVES,
  type InitiativesData, type InitiativeDbRow, type InitiativeTileRow,
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

// D1: the tile said direction four ways and only the sentence was gated — the
// sparkline of share per UPDATE, the stroke colour that judged it, the signed
// mood delta and the sentence itself. A null `theirWay` also made the colour
// WRONG rather than absent: `theirWay === false ? comp : you` painted every
// losing initiative in the client's own green.
describe('initiativeTile', () => {
  const row = (over: Partial<InitiativeTileRow> = {}): InitiativeTileRow => ({
    id: 'i1', title: 'Comfort', direction: 'up', startedLabel: '1 Aug',
    series: [2.1, 3.4, 6.1], line: 'Up 4.0 points since 1 Aug · 3 updates',
    verdict: 'moving_up', theirWay: true, latestShare: 6.1, sentimentDelta: 0.4, ...over,
  })
  const data = (r: InitiativeTileRow): { initiatives: InitiativesData } => ({ initiatives: { rows: [r], total: 1 } })

  it('takes the movement off the row while the direction words are gated off, and keeps the subject and the level', () => {
    const t = initiativeTile(data(row()), false)
    expect(t.movement).toBe(false)
    expect(t.rows[0]).toMatchObject({
      title: 'Comfort', latestShare: 6.1,
      series: [], theirWay: null, sentimentDelta: null,
      line: 'Tracked since 1 Aug · 3 updates read',
    })
    expect(t.total).toBe(1)
    expect(initiativeTile(data(row())).rows[0].series).toEqual([]) // the shipped default
  })

  it('re-says a sentence frozen with a direction, and leaves the two honest-silence ones alone', () => {
    const down = initiativeTile(data(row({ verdict: 'moving_down', theirWay: false, line: 'Down 8.0 points since 1 Aug · 3 updates' })), false)
    expect(down.rows[0].line).toBe('Tracked since 1 Aug · 3 updates read')
    const flat = initiativeTile(data(row({ verdict: 'flat', theirWay: null, line: 'Holding steady since 1 Aug · 3 updates' })), false)
    expect(flat.rows[0].line).toBe('Tracked since 1 Aug · 3 updates read')
    const early = initiativeTile(data(row({ verdict: 'too_early', series: [1.2], line: 'One update in since 1 Aug — movement needs a second.' })), false)
    expect(early.rows[0].line).toBe('One update in since 1 Aug — movement needs a second.')
  })

  it('hands the whole row through when the words are on', () => {
    const t = initiativeTile(data(row()), true)
    expect(t.movement).toBe(true)
    expect(t.rows[0]).toEqual(row())
  })

  it('reads a snapshot that predates the tile as the empty tile, either way', () => {
    expect(initiativeTile({}, false)).toEqual({ rows: [], total: 0, movement: false })
    expect(initiativeTile({}, true)).toEqual({ rows: [], total: 0, movement: true })
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
