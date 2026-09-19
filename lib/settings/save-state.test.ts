import { describe, expect, it } from 'vitest'

import { activeSubreddits, knownSubreddits } from '../gather/subreddits'
import type { SubredditEntry } from '../gather/types'
import { communityWords } from './communities'
import { applySubredditEdit, NOTHING_PENDING, saveState, subredditEdit, WATCHED_COMMUNITY_CAP, type LastChange } from './save-state'

// The save-state strip (block D, D9). What these hold is the difference
// between the two tenses and the difference between the two absences:
// "this save broke nothing" and "we did not write down what it broke" are not
// the same sentence, and before M1 every stored row is the second.

const change = (over: Partial<LastChange> = {}): LastChange => ({
  changed_at: '2026-09-03T14:02:11.000Z',
  affects_audiences: null,
  affects_months: null,
  source: 'logged',
  ...over,
})

describe('saveState', () => {
  it('says nothing is waiting when nothing is', () => {
    const s = saveState()
    expect(s.line).toBe(NOTHING_PENDING)
    expect(s.pending).toEqual([])
    expect(s.breaks).toEqual([])
    expect(s.lastSavedAt).toBeNull()
  })

  it('counts what is waiting, and keeps both sides of each edit', () => {
    const s = saveState({
      pending: [
        { field: 'Rivals', from: 'Freitag, Patagonia', to: 'Freitag, Patagonia, Poler' },
        { field: 'Cadence', from: 'weekly', to: 'monthly' },
      ],
    })
    expect(s.line).toBe('2 changes waiting')
    expect(s.pending).toHaveLength(2)
    expect(s.pending[0].from).toBe('Freitag, Patagonia')
  })

  it('says "1 change waiting", not "1 changes"', () => {
    expect(saveState({ pending: [{ field: 'Cadence', from: 'weekly', to: 'monthly' }] }).line).toBe('1 change waiting')
  })

  it('draws no break half at all where M1 is unapplied', () => {
    const s = saveState({
      lastChange: change({ affects_audiences: ['competitor:Freitag'], affects_months: '[2026-06-01,2026-10-01)' }),
      affectsRecorded: false,
    })
    expect(s.recorded).toBe(false)
    expect(s.breaks).toEqual([])
    expect(s.line).toBe(NOTHING_PENDING)
    // The row's own date still stands: the log is applied, only its two
    // columns are not.
    expect(s.lastSavedAt).toBe('2026-09-03T14:02:11.000Z')
  })

  it('names what the last save broke, in the reader’s words', () => {
    const s = saveState({
      pending: [{ field: 'Rivals', from: 'Freitag', to: 'Freitag, Poler' }],
      lastChange: change({ affects_audiences: ['competitor:Freitag'], affects_months: '[2026-06-01,2026-10-01)' }),
      affectsRecorded: true,
    })
    expect(s.breaks).toHaveLength(1)
    expect(s.breaks[0].audiences).toEqual(['Freitag'])
    expect(s.breaks[0].months).toBe('Jun 2026 to Sep 2026')
    expect(s.line).toBe('1 change waiting · the last save broke Freitag’s months from Jun 2026 to Sep 2026')
  })

  it('names BOTH names when the break was a rename', () => {
    const s = saveState({
      lastChange: change({
        affects_audiences: ['competitor:Freitag', 'competitor:Freitag Lassie'],
        affects_months: '[2026-06-01,2026-07-01)',
      }),
      affectsRecorded: true,
    })
    // A rename cannot re-key a frozen month (AGENTS.md): the old months stay
    // under the old string, so the strip has to carry both names or a reader
    // cannot find the half that did not move.
    expect(s.breaks[0].audiences).toEqual(['Freitag', 'Freitag Lassie'])
    expect(s.breaks[0].line).toBe('Freitag and Freitag Lassie’s months from Jun 2026')
    expect(s.line).toContain('Freitag and Freitag Lassie')
  })

  it('records no break where the change recorded neither audiences nor months', () => {
    const s = saveState({ lastChange: change(), affectsRecorded: true })
    expect(s.breaks).toEqual([])
    expect(s.line).toBe(NOTHING_PENDING)
  })

  it('does not call a reconstructed row a save', () => {
    const s = saveState({ lastChange: change({ source: 'reconstructed' }), affectsRecorded: true })
    expect(s.lastSavedAt).toBeNull()
  })
})

describe('subredditEdit', () => {
  const current = ['prosthetics', 'amputees']

  it('adds a community, whatever form it was pasted in', () => {
    for (const typed of ['r/BuyItForLife', 'BuyItForLife', 'https://www.reddit.com/r/BuyItForLife/']) {
      const r = subredditEdit(current, { kind: 'add', name: typed })
      expect('error' in r).toBe(false)
      if ('error' in r) continue
      expect(r.next).toEqual(['prosthetics', 'amputees', 'buyitforlife'])
      expect(r.change).toEqual({
        field: 'Communities',
        from: 'r/prosthetics, r/amputees',
        to: 'r/prosthetics, r/amputees, r/buyitforlife',
      })
    }
  })

  it('stops watching one, and leaves the order of the rest alone', () => {
    const r = subredditEdit(current, { kind: 'stop', name: 'r/Prosthetics' })
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.next).toEqual(['amputees'])
    expect(r.change.to).toBe('r/amputees')
  })

  it('refuses a duplicate rather than writing the list twice', () => {
    expect(subredditEdit(current, { kind: 'add', name: 'Prosthetics' })).toEqual({
      error: 'You are already watching r/prosthetics.',
    })
  })

  it('refuses to stop one that is not being watched', () => {
    expect(subredditEdit(current, { kind: 'stop', name: 'r/onebag' })).toEqual({
      error: 'You are not watching r/onebag.',
    })
  })

  it('refuses an empty name, and a name the fold will not take', () => {
    expect(subredditEdit(current, { kind: 'add', name: '   ' })).toEqual({
      error: 'Name a community to watch, like r/prosthetics.',
    })
    // A user profile is not a community — lib/gather/subreddits.ts rejects
    // both forms, and counting one would corrupt per-community ROI.
    expect(subredditEdit(current, { kind: 'add', name: 'u/spez' })).toEqual({
      error: 'u/spez is not a community we can watch — a community looks like r/prosthetics.',
    })
  })

  it('says "nothing" rather than an empty string when the last one goes', () => {
    const r = subredditEdit(['onebag'], { kind: 'stop', name: 'onebag' })
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.change.to).toBe('nothing')
  })
})

describe('applySubredditEdit', () => {
  const entries: SubredditEntry[] = [
    { name: 'prosthetics', status: 'active', discovered_at: '2026-04-06', probe: { sampled: 40, kept: 31, at: '2026-04-06' } },
    { name: 'onebag', status: 'rejected', discovered_at: '2026-05-02' },
  ]

  it('demotes rather than deletes, so the paid probe survives', () => {
    const r = applySubredditEdit(entries, { kind: 'stop', name: 'r/prosthetics' }, '2026-09-18')
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.next).toHaveLength(2)
    expect(r.next[0].status).toBe('stopped')
    expect(r.next[0].stopped_at).toBe('2026-09-18')
    expect(r.next[0].probe).toEqual({ sampled: 40, kept: 31, at: '2026-04-06' })
  })

  it('does not say the probe ruled out a community the client stopped', () => {
    const r = applySubredditEdit(entries, { kind: 'stop', name: 'r/prosthetics' }, '2026-09-18')
    if ('error' in r) throw new Error('expected an edit')
    // r/prosthetics PASSED its probe, 31 of 40. `rejected` is the probe's own
    // verdict and Settings prints it as "ruled out", so storing it here would
    // tell the client we threw out a community they took off the list.
    expect(r.next[0].status).not.toBe('rejected')
    expect(communityWords({
      key: 'prosthetics', label: 'r/prosthetics', status: r.next[0].status,
      discoveredAt: '2026-04-06', probe: r.next[0].probe ?? null, posts: 12, eligible: 10,
      comments: 40, insights: 3, keptPct: null, found: null, unconfigured: false,
    })).toBe('you stopped watching it')
    // And the gather stops reading it either way — that is what the client asked for.
    expect(activeSubreddits(r.next).includes('prosthetics')).toBe(false)
    // Discovery does not propose it again: it is known in every state.
    expect(knownSubreddits(r.next).has('prosthetics')).toBe(true)
  })

  it('promotes an entry the client once stopped, and drops the stop date with it', () => {
    const stopped = applySubredditEdit(entries, { kind: 'stop', name: 'r/prosthetics' }, '2026-09-18')
    if ('error' in stopped) throw new Error('expected an edit')
    const r = applySubredditEdit(stopped.next, { kind: 'add', name: 'r/prosthetics' }, '2026-09-20')
    if ('error' in r) throw new Error('expected an edit')
    expect(r.next).toHaveLength(2)
    expect(r.next[0]).toEqual({
      name: 'prosthetics', status: 'active', discovered_at: '2026-04-06',
      probe: { sampled: 40, kept: 31, at: '2026-04-06' },
    })
  })

  it('refuses to turn a community the probe ruled out back on, and quotes the verdict', () => {
    // ST4, and this test REPLACES one that asserted the opposite. The add arm
    // is handed the ACTIVE names, so a rejected entry is not "has", `existing`
    // is found, and the entry was rewritten straight to 'active' — overwriting
    // a verdict that was paid for, on a row whose own "sampled … on topic"
    // line stays on screen beside the now-active state. `setSubredditStatuses`
    // says overriding that is a human doing it BY NAME: an operator, not a
    // browser.
    expect(applySubredditEdit(entries, { kind: 'add', name: 'r/onebag' }, '2026-09-18')).toEqual({
      error: 'r/onebag was ruled out by our relevance check. Ask us to look again rather than turning it back on over that.',
    })
    // With a probe on the entry, the refusal IS the measurement, as k of n.
    const probed: SubredditEntry[] = [
      { name: 'frugal', status: 'rejected', discovered_at: '2026-08-11', probe: { sampled: 40, kept: 3, at: '2026-09-12' } },
    ]
    expect(applySubredditEdit(probed, { kind: 'add', name: 'r/frugal' }, '2026-09-18')).toEqual({
      error: 'We sampled r/frugal on 2026-09-12 and 3 of 40 posts were about your market, so it was ruled out. Ask us to look again rather than turning it back on over that.',
    })
    // Nothing is written, so the entry keeps its verdict.
    expect(probed[0].status).toBe('rejected')
    // A community the CLIENT stopped is still theirs to take back: that is the
    // whole reason `stopped` is not `rejected`.
    const stopped: SubredditEntry[] = [{ name: 'frugal', status: 'stopped', discovered_at: '2026-08-11', stopped_at: '2026-09-01' }]
    expect('error' in applySubredditEdit(stopped, { kind: 'add', name: 'r/frugal' }, '2026-09-18')).toBe(false)
  })

  it('caps how many communities a client can watch, because every one is paid for per run', () => {
    // ST4: the add arm appended with no ceiling, and
    // `tracking_configs_cost_ceilings_check` bounded every OTHER list on the
    // row but not this one. An admin typing two hundred names into the add box
    // (or POSTing `updateCommunity` two hundred times — it takes a bare
    // FormData) bought two hundred paid Reddit searches on the next gather.
    const watched: SubredditEntry[] = Array.from({ length: WATCHED_COMMUNITY_CAP }, (_, i) => ({
      name: `community${i}`, status: 'active' as const, discovered_at: '2026-04-06',
    }))
    expect(applySubredditEdit(watched, { kind: 'add', name: 'r/BuyItForLife' }, '2026-09-18')).toEqual({
      error: '12 watched communities is the limit — every one of them is searched and read on every update. Stop watching one first.',
    })
    // One below the cap still goes in, so the ceiling is a ceiling and not an
    // off-by-one that closes the control a community early.
    expect('error' in applySubredditEdit(watched.slice(0, -1), { kind: 'add', name: 'r/BuyItForLife' }, '2026-09-18')).toBe(false)
    // Stopped entries do not count against it: they cost nothing per run, and
    // they are records that are never deleted, so a client who has cycled
    // thirty communities over a year is not locked out by their own history.
    const mostlyStopped: SubredditEntry[] = [
      ...Array.from({ length: 30 }, (_, i) => ({ name: `old${i}`, status: 'stopped' as const, discovered_at: '2026-04-06' })),
      { name: 'prosthetics', status: 'active' as const, discovered_at: '2026-04-06' },
    ]
    expect('error' in applySubredditEdit(mostlyStopped, { kind: 'add', name: 'r/BuyItForLife' }, '2026-09-18')).toBe(false)
  })

  it('appends a community nothing has ever proposed, dated today', () => {
    const r = applySubredditEdit(entries, { kind: 'add', name: 'r/BuyItForLife' }, '2026-09-18')
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.next[2]).toEqual({ name: 'buyitforlife', status: 'active', discovered_at: '2026-09-18' })
  })

  it('lets the client turn down a community that was only ever proposed', () => {
    // ST9: the table offers the control on a candidate row, but the watching
    // list was built from `status === 'active'` alone — so the click returned
    // "You are not watching r/frugal." over a row that plainly says we found
    // it, failing in the pure layer before any write. Nothing is gathered from
    // a candidate, so saying no to it is the only thing that stops the probe
    // promoting it into a paid search later.
    const proposed: SubredditEntry[] = [
      { name: 'prosthetics', status: 'active', discovered_at: '2026-04-06' },
      { name: 'frugal', status: 'candidate', discovered_at: '2026-08-11' },
    ]
    const r = applySubredditEdit(proposed, { kind: 'stop', name: 'r/frugal' }, '2026-09-18')
    if ('error' in r) throw new Error(`expected an edit, got ${r.error}`)
    expect(r.was).toBe('candidate')
    expect(r.next[1]).toEqual({ name: 'frugal', status: 'stopped', discovered_at: '2026-08-11', stopped_at: '2026-09-18' })
    // Demoted, never deleted, and out of the gather either way.
    expect(activeSubreddits(r.next)).toEqual(['prosthetics'])
    expect(knownSubreddits(r.next).has('frugal')).toBe(true)
    // …and the caller can tell the two sentences apart: stopping something we
    // WERE reading is a different answer from turning down a proposal.
    const stoppingActive = applySubredditEdit(proposed, { kind: 'stop', name: 'r/prosthetics' }, '2026-09-18')
    if ('error' in stoppingActive) throw new Error('expected an edit')
    expect(stoppingActive.was).toBe('active')
  })

  it('carries the pure validation’s refusal through unchanged', () => {
    expect(applySubredditEdit(entries, { kind: 'stop', name: 'r/onebag' }, '2026-09-18')).toEqual({
      error: 'You are not watching r/onebag.',
    })
  })

  // THE RECORD'S SIDES ARE THE WATCHED LIST, NEVER THE WIDENED ONE (V2).
  // ST9 widened the membership list with `candidate` entries so a proposal can
  // be turned down, and the config_changes row was built from that same list —
  // so a stop named a community we had never watched as one we had, and
  // contradicted the Communities list an ADD writes on the same page.
  const withCandidate: SubredditEntry[] = [
    { name: 'prosthetics', status: 'active', discovered_at: '2026-04-06' },
    { name: 'bagsonbags', status: 'active', discovered_at: '2026-05-02' },
    { name: 'frugal', status: 'candidate', discovered_at: '2026-09-01' },
  ]

  it('keeps a candidate out of the record when an ACTIVE community is stopped', () => {
    const r = applySubredditEdit(withCandidate, { kind: 'stop', name: 'r/prosthetics' }, '2026-09-18')
    if ('error' in r) throw new Error('expected an edit')
    expect(r.change.from).toBe('r/prosthetics, r/bagsonbags')
    expect(r.change.to).toBe('r/bagsonbags')
    // The widened list is still the membership test, so the candidate survives
    // the edit untouched.
    expect(r.next.find((e) => e.name === 'frugal')?.status).toBe('candidate')
  })

  it('records a turned-down proposal as no change to what we watch', () => {
    const r = applySubredditEdit(withCandidate, { kind: 'stop', name: 'r/frugal' }, '2026-09-18')
    if ('error' in r) throw new Error('expected an edit')
    // Both sides equal: turning a proposal down does not change the watched
    // list. `was` is what lets actions.ts word the row's note as a refusal.
    expect(r.change.from).toBe('r/prosthetics, r/bagsonbags')
    expect(r.change.to).toBe('r/prosthetics, r/bagsonbags')
    expect(r.was).toBe('candidate')
    expect(r.next.find((e) => e.name === 'frugal')?.status).toBe('stopped')
  })

  it('an add names the active list on both sides, as it always did', () => {
    const r = applySubredditEdit(withCandidate, { kind: 'add', name: 'r/onebag' }, '2026-09-18')
    if ('error' in r) throw new Error('expected an edit')
    expect(r.change.from).toBe('r/prosthetics, r/bagsonbags')
    expect(r.change.to).toBe('r/prosthetics, r/bagsonbags, r/onebag')
  })
})
