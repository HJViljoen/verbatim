import { describe, it, expect } from 'vitest'
import { shownTrajectory, documentSettings, isDocumentData } from './types'

// D1 (2026-09-15): the document side's gate on what gets WRITTEN is
// `trajectoryWord` (merge.ts). This is the gate on what gets DRAWN — the
// eleven documents already frozen in production carry "rising", "fading" and
// "seen N updates running" in their page meta and in their workings, and one
// of them is served by a live share link until 30 September.
describe('shownTrajectory', () => {
  it('withholds a frozen history word while the run-indexed direction words are gated off', () => {
    expect(shownTrajectory('rising', false)).toBe('')
    expect(shownTrajectory('fading', false)).toBe('')
    expect(shownTrajectory('seen 2 updates running', false)).toBe('')
    expect(shownTrajectory('new this update', false)).toBe('')
    expect(shownTrajectory('rising')).toBe('') // the shipped default
  })

  it('hands the word straight back when they are on', () => {
    expect(shownTrajectory('rising', true)).toBe('rising')
    expect(shownTrajectory('seen 2 updates running', true)).toBe('seen 2 updates running')
  })

  it('reads an absent word as no word, either way — the empty string every caller already handles', () => {
    expect(shownTrajectory('', true)).toBe('')
    expect(shownTrajectory(null, true)).toBe('')
    expect(shownTrajectory(undefined, true)).toBe('')
    expect(shownTrajectory(undefined, false)).toBe('')
  })
})

describe('documentSettings', () => {
  it('falls back to the defaults rather than trusting a stored value', () => {
    expect(documentSettings(null)).toEqual({ sellsTo: 'consumers', competitors: null, language: 'en', findings: 4 })
    expect(documentSettings({ sellsTo: 'sideways' as never })).toMatchObject({ sellsTo: 'consumers' })
  })
})

describe('isDocumentData', () => {
  it('knows a document snapshot from a tile snapshot', () => {
    expect(isDocumentData({ kind: 'document', pages: [] })).toBe(true)
    expect(isDocumentData({ kind: 'report', pages: [] })).toBe(false)
    expect(isDocumentData(null)).toBe(false)
  })
})
