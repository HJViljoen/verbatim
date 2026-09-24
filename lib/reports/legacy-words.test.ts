import { describe, expect, it } from 'vitest'
import { withCurrentWords } from './legacy-words'

describe('withCurrentWords', () => {
  it('rewrites a pre-sweep phrase stored in a snapshot, deep in the data', () => {
    const old = { cover: { stats: [{ label: 'Durability — you against the category, Q3 2026' }] }, n: 3 }
    expect(withCurrentWords(old).cover.stats[0].label).toBe('Durability: you against the category, Q3 2026')
  })

  it('returns the same object when nothing matched, and leaves other dashes alone', () => {
    const cur = { quote: 'she said — and meant it', label: 'Durability: you against the category' }
    expect(withCurrentWords(cur)).toBe(cur)
  })

  it('rewrites the Overview sentences a monthly snapshot stores', () => {
    const old = {
      lead: 'Looks & style came up in 16.3% of the category’s videos this month — 102 of 625 videos.',
      note: 'Your side carried 9 videos this month, too few for its column to answer — the category column carries the month.',
      moves: 'One monthly reading so far — the first comparison lands with the month after this one.',
    }
    const cur = withCurrentWords(old)
    expect(cur.lead).toBe('Looks & style came up in 16.3% of the category’s videos this month, 102 of 625 videos.')
    expect(cur.note).toContain('to answer; the category column')
    expect(cur.moves).toBe('One monthly reading so far. The first comparison lands with the month after this one.')
  })

  // No surface states a language share (2026-09-24); a snapshot frozen before
  // that still carries one in words, and it must not print.
  it('cuts the language share out of a frozen snapshot, and nothing else', () => {
    const old = {
      record: {
        line: '3 updates · 394 videos · 34% of what was said on camera was not in English · 1 tracking change',
        tail: '3 updates · 394 videos · 34% of what was said on camera was not in English',
        lines: [
          '3 updates delivered.',
          '34% of the videos whose language we know were not in English, and 491 videos have no language recorded at all. This is what was said in videos; the comments have no language of their own recorded yet.',
          'No language was recorded for any video, so the share not in English cannot be drawn.',
        ],
        rows: [{ id: 'updates', label: 'Updates this window' }, { id: 'language', label: 'Not in English', figure: '34%' }],
      },
      method: {
        language: '27% of what was said on camera was not in English: 474 of 1,755 videos whose language we know.',
        legacy: '27% of what was said on camera was not in English — 474 of 1,755 videos whose language we know.',
        lines: ['Prepared by Verbatim · 1 Sep 2026.', '27% of what was said on camera was not in English: 474 of 1,755 videos whose language we know, and 12 with no language recorded at all.'],
      },
      numbers: [{ label: 'Sources', value: 'TikTok 38%' }, { id: 'languages', label: 'Languages', value: '27% not in English' }],
      translation: 'The words are printed as they were written, with an English rendering underneath, where they were not in English.',
    }
    const cur = withCurrentWords(old)
    expect(cur.record.line).toBe('3 updates · 394 videos · 1 tracking change')
    expect(cur.record.tail).toBe('3 updates · 394 videos')
    expect(cur.record.lines).toEqual(['3 updates delivered.'])
    expect(cur.record.rows.map((r) => r.label)).toEqual(['Updates this window'])
    expect(cur.method.language).toBe('')
    expect(cur.method.legacy).toBe('')
    expect(cur.method.lines).toEqual(['Prepared by Verbatim · 1 Sep 2026.'])
    expect(cur.numbers.map((r) => r.label)).toEqual(['Sources'])
    // The translation of quotes is kept: only the share goes.
    expect(cur.translation).toBe(old.translation)
  })
})
