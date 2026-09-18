import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { communitiesMeta, type CommunityRow } from './communities'
import { platformRows, platformShareBasis, PLATFORM_SHARE_ABSENT, trackingPending, type TrackingFormState } from './connections'
import { isNewRival, rivalRefusalNote, rivalsMeta, type RivalRow } from './rivals-view'
import { termDateShort, termsMeta } from './terms'

// The pure half of the Settings › Tracking artboard port (Block D wave 2).

const community = (over: Partial<CommunityRow> = {}): CommunityRow => ({
  key: 'onebag', label: 'r/onebag', status: 'active', discoveredAt: '2026-04-06', probe: null,
  posts: 61, comments: 591, insights: 40, eligible: 30, keptPct: 72, found: 90, unconfigured: false,
  ...over,
})

const rival = (over: Partial<RivalRow> = {}): RivalRow => ({
  identity: null, name: 'Freitag', trackedSince: null, retiredAt: null, handles: {},
  perPlatform: [], captured: 0, read: 0, noAccounts: true, ownPosts: null, ownPostsWhy: null,
  ...over,
})

const form = (over: Partial<TrackingFormState> = {}): TrackingFormState => ({
  brand: ['Sealand'], competitor: ['Freitag'], category: ['eco bag'], exclusions: [],
  rivals: ['Freitag'], period: 'weekly', day: 'sunday',
  ...over,
})

describe('the platforms block', () => {
  const mix = { tiktok: 352, youtube: 268, instagram: 194, reddit: 111 }

  it('takes each platform’s share of the month’s videos, not of the mix', () => {
    // The population is the denominator's own `videos`, which is a count of
    // DISTINCT videos — the mix is per platform and is never pooled into a
    // total (lib/reading/types.ts). Summing the mix and dividing by that would
    // quietly answer a different question.
    const rows = platformRows({ platforms: ['tiktok', 'youtube'], communities: 12, mix, videos: 1000 })
    expect(rows.map((r) => r.share)).toEqual([35.2, 26.8, 19.4, 11.1])
    expect(rows.map((r) => r.connected)).toEqual([true, true, false, false])
  })

  it('leaves the share NULL where the month was not read — never zero', () => {
    const rows = platformRows({ platforms: ['tiktok'], communities: 12, mix: null, videos: null })
    expect(rows.every((r) => r.share === null)).toBe(true)
    expect(platformShareBasis({ month: '2026-09-01', status: 'filling', videos: null, audience: 'Your own brand' }))
      .toBe(PLATFORM_SHARE_ABSENT)
  })

  it('names the population, the month and the freeze state beside the shares', () => {
    const basis = platformShareBasis({ month: '2026-09-01', status: 'filling', videos: 2359, audience: 'Your own brand' })
    expect(basis).toContain('Your own brand')
    expect(basis).toContain('2,359 videos')
    expect(basis).toContain('September')
    expect(basis).toContain('still filling')
    expect(platformShareBasis({ month: '2026-06-01', status: 'frozen', videos: 800, audience: 'The category' })).toContain('closed')
  })

  it('says Reddit’s two conditions, off the constant that enforces them', () => {
    const reddit = platformRows({ platforms: ['reddit'], communities: 12, mix: null, videos: null })[3]
    expect(reddit.reads).toContain('12 watched communities')
    expect(reddit.reads).toContain('40 comments per thread')
    expect(reddit.reads).toContain('no engagement row')
  })
})

describe('what is waiting to be saved', () => {
  it('is empty when nothing has been touched', () => {
    expect(trackingPending(form(), form())).toEqual([])
  })

  it('names each list that changed, by how many it now holds', () => {
    const pending = trackingPending(form(), form({ category: ['eco bag', 'wet commute bag'], day: 'monday' }))
    expect(pending.map((p) => p.field)).toEqual(['Category terms', 'The day it lands'])
    expect(pending[0]).toMatchObject({ from: '1 entry', to: '2 entries' })
    expect(pending[1]).toMatchObject({ from: 'sunday', to: 'monday' })
  })

  it('counts a removal, and an empty list says "nothing"', () => {
    const pending = trackingPending(form(), form({ rivals: [] }))
    expect(pending).toEqual([{ field: 'Rivals', from: '1 entry', to: 'nothing' }])
  })
})

describe('the section metas', () => {
  it('counts the terms and leaves the exclusions out of the total', () => {
    const meta = termsMeta({ brand: ['a', 'b'], competitor: ['c'], category: ['d'], exclusions: ['e'] })
    expect(meta).toBe('4 terms · brand 2 · competitor 1 · category 1 · not this 1')
  })

  it('says ALL TIME on the community counts rather than implying a month', () => {
    const meta = communitiesMeta([community(), community({ key: 'x', label: 'r/x', unconfigured: true, posts: 3, comments: 9 })])
    expect(meta).toContain('1 community')
    expect(meta).toContain('64 posts')
    expect(meta).toContain('600 comments stored, all time')
    expect(meta).not.toContain('this month')
  })

  it('splits the rivals into those with accounts and those on terms alone', () => {
    const meta = rivalsMeta([
      rival({ name: 'Freitag', noAccounts: false }),
      rival({ name: 'Patagonia' }),
      rival({ name: 'Poler' }),
    ])
    expect(meta).toBe('3 tracked · 1 with account · 2 on search terms only')
  })

  it('counts a retired rival apart, because its row is still drawn', () => {
    expect(rivalsMeta([rival(), rival({ name: 'Gone', retiredAt: '2026-08-01' })])).toContain('1 no longer tracked')
  })
})

describe('a rival that arrived this month', () => {
  it('is New only where an identity dates it', () => {
    expect(isNewRival(rival(), '2026-09-01')).toBe(false)
    expect(isNewRival(rival({ trackedSince: '2026-09-03' }), '2026-09-01')).toBe(true)
    expect(isNewRival(rival({ trackedSince: '2026-04-06' }), '2026-09-01')).toBe(false)
  })

  it('and the note says which comparisons the month refuses', () => {
    expect(rivalRefusalNote([rival()], '2026-09-01')).toBeNull()
    const one = rivalRefusalNote([rival({ name: 'Poler', trackedSince: '2026-09-03' })], '2026-09-01')
    expect(one).toBe('Poler was added this month, so comparisons involving it are refused for Sep 2026.')
    const two = rivalRefusalNote(
      [rival({ name: 'Poler', trackedSince: '2026-09-03' }), rival({ name: 'Topo', trackedSince: '2026-09-09' })],
      '2026-09-01',
    )
    expect(two).toContain('Poler and Topo were added this month')
  })
})

describe('a term’s date at the artboard’s scale', () => {
  it('shortens the date and keeps the two grades apart', () => {
    expect(termDateShort({ on: '2026-04-06', source: 'recorded' })).toBe('added 6 Apr')
    expect(termDateShort({ on: '2026-04-06', source: 'reconstructed' })).toBe('in use by 6 Apr, not recorded')
    expect(termDateShort(undefined)).toBe('in the set before we kept a record')
  })
})

describe('every configuration write on this page carries an actor', () => {
  // AGENTS.md: `tracking_configs` UPDATEs go through `updateWithActor` /
  // `withActor` so the audit trigger logs a PERSON instead of a role, and a
  // surface the trigger cannot see calls `recordConfigChange`. The artboard
  // port rewrote every control on the page — one save row, two Reddit
  // controls, a rivals table that is itself the list — so this reads the two
  // action modules and checks the rule survived the rewrite. Nothing else
  // would notice a bare `.update()` slipping back in.
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  const actions = source('../../app/dashboard/settings/actions.ts')
  const rivals = source('../../app/dashboard/settings/rivals-actions.ts')
  const rivalsSection = source('../../components/settings/tracking/rivals.tsx')

  it('has no bare UPDATE on tracking_configs anywhere in the actions', () => {
    // Every write to the table is the callback `updateWithActor` hands its
    // stamped payload to, so every `.update()` on it takes `payload` and
    // nothing else. An `.update({ … })` with an object literal would be a
    // write the audit trigger sees as a role rather than a person.
    for (const [name, text] of [['actions.ts', actions], ['rivals-actions.ts', rivals]] as const) {
      const writes = [...text.matchAll(/\.from\('tracking_configs'\)[\s\S]{0,40}?\.update\(\s*([A-Za-z{])/g)]
      for (const w of writes) {
        expect(w[1], `${name} writes tracking_configs without updateWithActor`).toBe('p')
      }
    }
  })

  it('stamps each of the three writes, and logs the one the trigger cannot see', () => {
    // updateWithActor: the terms, the derived competitor terms, the exclusions,
    // the cadence and the community edit.
    expect([...actions.matchAll(/updateWithActor\(/g)].length).toBeGreaterThanOrEqual(5)
    expect([...actions.matchAll(/actorStamp\(session/g)].length).toBeGreaterThanOrEqual(5)
    // `subreddits` is a JSON column the audit trigger does not watch, so the
    // community control writes its own row naming what the edit breaks.
    expect(actions).toContain('recordConfigChange(')
    expect(actions).toContain("surface: 'subreddits'")
  })

  it('renames a rival through the one logged RPC, never a hand UPDATE', () => {
    expect(rivals).toContain('renameRival(')
    expect(rivals).not.toMatch(/\.from\('competitors'\)\s*\n?\s*\.update\(/)
  })

  it('lets a workspace with no rival save its terms', () => {
    // C1: one save row means the rivals schema now gates the TERMS too. A
    // floor of one rival there refused a save whose first half had already
    // been written — and the rivals section itself presents "no rival is
    // named" as a legal state.
    expect(actions).not.toContain('add at least one competitor')
    expect(actions).toContain("competitor_names: z.array(z.string()).max(15")
  })

  it('tells an empty rival list apart from a POST that carried none', () => {
    // The marker, not the absence: without it a cached page or a hand-made
    // POST would erase a tracked list nobody touched.
    expect(actions).toContain('RIVALS_PRESENT')
    expect(actions).toContain('...(posted ? { competitor_names: parsed.data.competitor_names } : {})')
    expect(rivalsSection).toContain('name={RIVALS_PRESENT}')
  })

  it('keeps the one save row on the two existing write paths', () => {
    // `saveTracking` composes; it does not open a third path to the columns.
    const save = actions.slice(actions.indexOf('export async function saveTracking'))
    expect(save).toContain('updateSearchTerms(prev, formData)')
    expect(save).toContain('updateTrackingConfig(prev, formData)')
    expect(save).not.toContain('.update(')
  })
})
