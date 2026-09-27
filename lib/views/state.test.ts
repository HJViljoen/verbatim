import { describe, expect, it } from 'vitest'

import { SEALAND_LENS } from './fixture'
import { noteText, unreadNote, viewLine, viewNote, viewState } from './state'

// What a page says about its view (decision F: "the count says so"). The
// counts are staging's September: 654 market videos, 601 once the 53
// off-topic ones are set aside, 381 buyers, 220 makers.

const VIEWS_ONLY = { views: true, setAside: false }
const ALL_ON = { views: true, setAside: true }
const BASE = '/dashboard/voice'

describe('viewNote', () => {
  it('says what the view set aside, as a count of videos', () => {
    expect(noteText(viewNote('market', 654, 601))).toBe('53 off-topic videos set aside')
    expect(noteText(viewNote('buyers', 654, 381))).toBe('273 makers’ and off-topic videos set aside')
    expect(noteText(viewNote('market', 654, 653))).toBe('1 off-topic video set aside')
  })

  it('names the one thing the Makers view keeps, and says nothing for Everything or an unknown side', () => {
    expect(noteText(viewNote('makers', 654, 220))).toBe('Makers’ own videos only')
    expect(viewNote('everything', 654, 654)).toBeNull()
    expect(viewNote('buyers', null, 381)).toBeNull()
    expect(viewNote('market', 654, 654)).toBeNull()
  })

  it('names the view and the month where the view is not read yet', () => {
    expect(noteText(unreadNote('buyers', '2026-09-01'))).toBe('The Buyers view is not read for September yet')
    expect(noteText(unreadNote('makers', '2026-10-01'))).toBe('The Makers view is not read for October yet')
    expect(noteText(unreadNote('market', '2026-09-01'))).toBe('Off-topic videos are not set aside for September yet')
  })
})

describe('viewState', () => {
  it('presses the view read and says what it set aside', () => {
    const s = viewState({
      read: { state: 'read', view: 'buyers', lens: 'buyers', rows: SEALAND_LENS.buyers },
      cfg: VIEWS_ONLY, basePath: BASE, params: { view: 'buyers' }, month: '2026-09-01', everything: 654, inView: 381,
    })
    expect(s).toMatchObject({ view: 'buyers', defaultView: 'everything', unread: null })
    expect(s.choices.find((c) => c.active)?.label).toBe('Buyers')
    expect(noteText(s.note)).toBe('273 makers’ and off-topic videos set aside')
  })

  it('reads every video where the view’s lens is not there, pressing Everything and naming the view not read', () => {
    const s = viewState({
      read: { state: 'not_read', view: 'makers', lens: 'makers', why: 'missing' },
      cfg: VIEWS_ONLY, basePath: BASE, params: { view: 'makers' }, month: '2026-09-01', everything: 654, inView: null,
    })
    expect(s).toMatchObject({ view: 'everything', unread: 'makers' })
    expect(s.choices.find((c) => c.active)?.label).toBe('Everything')
    expect(noteText(s.note)).toBe('The Makers view is not read for September yet')
  })

  it('has the default count say so once off-topic videos are set aside', () => {
    const s = viewState({
      read: { state: 'read', view: 'market', lens: 'all_but_noise', rows: SEALAND_LENS.all_but_noise },
      cfg: ALL_ON, basePath: BASE, params: {}, month: '2026-09-01', everything: 654, inView: 601,
    })
    expect(s.choices.map((c) => [c.label, c.active])).toEqual([['Everything', true], ['Buyers', false], ['Makers', false]])
    expect(noteText(s.note)).toBe('53 off-topic videos set aside')
  })
})

describe('viewLine: the view on a page printed or sent', () => {
  it('prints the pressed option and the note, and nothing for every video with nothing to add', () => {
    const buyers = viewState({
      read: { state: 'read', view: 'buyers', lens: 'buyers', rows: [] },
      cfg: VIEWS_ONLY, basePath: BASE, params: {}, month: '2026-09-01', everything: 654, inView: 381,
    })
    expect(viewLine(buyers)).toEqual({ label: 'Buyers', note: { count: 273, words: 'makers’ and off-topic videos set aside' } })
    const all = viewState({ read: { state: 'everything', view: 'everything' }, cfg: VIEWS_ONLY, basePath: BASE, params: {}, month: '2026-09-01', everything: 654, inView: null })
    expect(viewLine(all)).toBeNull()
    expect(viewLine(undefined)).toBeNull()
  })
})
