import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReadingHandle } from '../reading/read'
import type { PairOn } from '../reading/pairs'
import type { Verdict } from '../reading/verdicts'
import { loadMovesExtras, type CardInputs } from './overview'

// Finish-list item 21: Sealand's September card printed "Subjects matched:
// none" above "Community & purpose in your audience: 7 of 10", a subject being
// re-described. The card's movement is now banded for the subject the card's
// own rows would name, and a subject that is not ready names none.

const post = (id: string) => ({ id, upload_date: '2026-09-10T00:00:00.000Z', comments_count: 12, hook_style: null, classified_type: null, analyzed_run_id: 'r1' })
const inputs = (): CardInputs => ({
  videos: [post('p1'), post('p2'), post('p3')],
  claims: [],
  matches: new Map([['community', ['p1', 'p2', 'p3']], ['price', ['p1']]]),
  matchesFailed: false,
})
const verdictFor = (subjectId: string) => ({ objectId: subjectId } as unknown as Verdict)

async function card(calibrations: Record<string, 'ready' | 'provisional' | 'failed'>) {
  const banded: string[] = []
  const extras = await loadMovesExtras({
    supabase: {} as SupabaseClient,
    reading: {} as ReadingHandle,
    clientId: 'c',
    month: '2026-09-01',
    moves: null,
    subjectNames: new Map([['community', 'Community & purpose'], ['price', 'Price']]),
    subjectCalibrations: new Map(Object.entries(calibrations)),
    themeLabels: new Map(),
    cardInputs: Promise.resolve(inputs()),
    movementFor: (id) => { banded.push(id); return { yours: verdictFor(id), category: verdictFor(id) } },
    pair: (() => null) as unknown as PairOn,
  })
  return { card: extras.card!, banded }
}

describe('the month’s card: its movement is the subject its rows name', () => {
  it('bands no subject that is being re-described, even the one most posts matched', async () => {
    const { card: c, banded } = await card({ community: 'failed', price: 'ready' })
    expect(banded).toEqual(['price'])
    expect(c.subjects.map((s) => s.subjectId)).toEqual(['price'])
  })

  it('prints no movement at all where no matched subject is ready', async () => {
    const { card: c, banded } = await card({ community: 'failed', price: 'provisional' })
    expect(banded).toEqual([])
    expect(c.movement).toEqual({ yours: null, category: null })
    expect(c.subjects).toEqual([])
  })
})
