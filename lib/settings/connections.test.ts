import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { communitiesMeta, type CommunityRow } from './communities'
import { platformRows, platformShareBasis, savedMessage, PLATFORM_SHARE_ABSENT, PLATFORM_SHARE_UNREAD, trackingPending, type TrackingFormState } from './connections'
import { isNewRival, rivalRefusalNote, rivalsMeta, type RivalRow } from './rivals-view'
import { removeTerm, termDateShort, termsMeta } from './terms'

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
    // The fourth figure is said as an exclusion, not as a fourth bucket count
    // under a total that covers three.
    expect(meta).toBe('4 terms · brand 2 · competitor 1 · category 1 · 1 excluded, not searched')
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

describe('taking a term off a list', () => {
  const lists = {
    brand_keywords: ['Ossur', 'Össur'],
    competitor_keywords: ['Ottobock'],
    industry_keywords: ['prosthetic leg'],
    exclude_terms: [],
  }

  it('matches what the term says, not the case it was stored in', () => {
    // m1: the review strip removes `TermSummary.keyword`, which is the first
    // keyword_performance row's spelling — "ossur" where the client typed
    // "Ossur". An exact comparison removed nothing and reported nothing.
    const out = removeTerm(lists, 'brand_keywords', 'ossur')
    expect(out.removed).toBe(true)
    expect(out.terms.brand_keywords).toEqual(['Össur'])
  })

  it('falls through to the list that actually holds it', () => {
    // The performance row's bucket is its own; a term that has since moved
    // must still come off the list it is on.
    const out = removeTerm(lists, 'brand_keywords', 'Ottobock')
    expect(out.removed).toBe(true)
    expect(out.terms.competitor_keywords).toEqual([])
    expect(out.terms.brand_keywords).toEqual(['Ossur', 'Össur'])
  })

  it('says when it removed nothing, and changes nothing', () => {
    const out = removeTerm(lists, 'brand_keywords', 'not a term here')
    expect(out.removed).toBe(false)
    expect(out.terms).toEqual(lists)
  })

  it('takes one term, not every term that folds the same way', () => {
    const out = removeTerm({ ...lists, brand_keywords: ['bag', 'BAG'] }, 'brand_keywords', 'bag')
    expect(out.terms.brand_keywords).toEqual(['BAG'])
  })
})

describe('the platform share’s basis sentence', () => {
  it('tells a failed read apart from a month nobody has read', () => {
    // m2: loadWindowReading already swallows "the monthly reading is not
    // applied" and rethrows everything else, so the loader's blanket catch
    // absorbed only real failures — and printed them as a fact about the
    // record.
    expect(platformShareBasis({ month: '2026-09-01', status: 'filling', videos: null, audience: 'Your own brand', unread: true }))
      .toBe(PLATFORM_SHARE_UNREAD)
    expect(platformShareBasis({ month: '2026-09-01', status: 'filling', videos: null, audience: 'Your own brand' }))
      .toBe(PLATFORM_SHARE_ABSENT)
  })

  it('names the freeze state a closed month is in', () => {
    // m3: the status this page passes is the 30-day RULE, and the month in
    // hand is always the current one, so this arm is the one a real closed
    // month would take.
    expect(platformShareBasis({ month: '2026-07-01', status: 'frozen', videos: 412, audience: 'Your own brand' }))
      .toMatch(/July.* is closed/)
  })
})

describe('what the one save row says afterwards', () => {
  it('names what was written, not the terms alone', () => {
    // m4: the composed save may change the terms, the exclusions, the rival
    // list, the cadence and the day, and answered with the terms form's own
    // sentence whichever of them had moved.
    expect(savedMessage(['Cadence'])).toBe('Saved — cadence. Your next update is the first one to use it.')
    expect(savedMessage(['Brand terms', 'Rivals', 'Cadence']))
      .toBe('Saved — brand terms, rivals and cadence. Your next update is the first one to use them.')
  })

  it('drops a field it does not know, so nothing crafted is echoed back', () => {
    expect(savedMessage(['<script>', 'Rivals'])).toBe('Saved — rivals. Your next update is the first one to use it.')
    expect(savedMessage([])).toBe('Saved. Nothing had changed, so nothing moved.')
  })

  it('knows the same seven fields the pending strip does', () => {
    const before: TrackingFormState = {
      brand: ['a'], competitor: ['b'], category: ['c'], exclusions: ['d'],
      rivals: ['Freitag'], period: 'weekly', day: 'monday',
    }
    const after: TrackingFormState = {
      brand: [], competitor: [], category: [], exclusions: [],
      rivals: [], period: 'monthly', day: 'sunday',
    }
    for (const edit of trackingPending(before, after)) {
      expect(savedMessage([edit.field]), `${edit.field} is a field the message knows`)
        .not.toBe('Saved. Nothing had changed, so nothing moved.')
    }
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

  it('does not split a rival’s own name on a comma', () => {
    // C2: the table posts one value per name, so a comma inside one is part of
    // the name. "Smith, Wesson & Co" split in two would be two rivals, two
    // identities and two competitor:<name> audiences whose frozen months can
    // never be re-keyed. The old comma-separated box is the only shape the
    // split belongs to, and the marker — not the number of values — is what
    // says which shape arrived.
    const fn = actions.slice(actions.indexOf('const trackedNames'), actions.indexOf('// Facts vs knobs'))
    expect(fn).toContain('const fromTable = formData.get(RIVALS_PRESENT) != null')
    expect(fn).toMatch(/fromTable\s*\n?\s*\?\s*raw\.map/)
    // The legacy box keeps the split, and only it.
    expect(fn).toMatch(/:\s*raw\.flatMap\(\(v\) => csv\(v\)\)/)
  })

  it('leaves no model-spending action on the page with no control for it', () => {
    // C7: the port dropped the "Suggest more terms" button and left the
    // action exported — a POST-reachable endpoint that spends OpenAI money
    // with nothing in the product naming it. Onboarding keeps its own.
    expect(actions).not.toMatch(/export async function suggestMoreTerms/)
    expect(actions).not.toContain('suggestSearchTerms')
    expect(actions).not.toContain('takeSuggestionSlot')
  })

  it('keeps the one save row on the two existing write paths', () => {
    // `saveTracking` composes; it does not open a third path to the columns.
    const save = actions.slice(actions.indexOf('export async function saveTracking'))
    expect(save).toContain('updateSearchTerms(prev, formData)')
    expect(save).toContain('updateTrackingConfig(prev, formData)')
    expect(save).not.toContain('.update(')
  })
})
