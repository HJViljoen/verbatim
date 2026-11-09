import { describe, expect, it } from 'vitest'

import { ANALYSIS_PROSE_TABLES, scrubStoredProse } from './analysis-prose'
import { erasedTexts, loadTranslations } from './erased-texts'
import { ERASED_WORDS } from './stored-prose'
import { fakeDb } from '../test/fake-db'

// An erasure looks for a comment's English too (lib/retention/erased-texts.ts):
// the product quotes a non-English comment through its translation, and a
// model working in English repeats the English. Synthetic words.

const ORIGINAL = 'mijn koker schuurt na een uur elke dag'
const ENGLISH = 'my socket rubs raw after an hour every day'
const OTHER_ENGLISH = 'my socket fits well after a long day'

const tables = () => ({
  comment_translations: [
    { client_id: 'c1', comment_id: 'k1', text_hash: 'h1', language: 'nl', english: ENGLISH },
    { client_id: 'c1', comment_id: 'k2', text_hash: 'h2', language: 'nl', english: OTHER_ENGLISH },
  ],
  regate_backup: [
    { batch_id: 'b1', client_id: 'c1', source_table: 'comment_translations', row_data: { comment_id: 'k3', text_hash: 'h3', english: 'the liner slipped twice on the stairs' } },
  ],
})

describe('the texts an erasure looks for', () => {
  it('normalises whitespace, keeps 8+ characters, once each', () => {
    expect(erasedTexts(['  a  b  ', `${ORIGINAL}\n`, null], [ORIGINAL, 'short'])).toEqual([ORIGINAL])
  })

  it('reads the English of these comments, live and backed up, and nobody else\'s', async () => {
    const db = fakeDb(tables())
    expect(await loadTranslations(db.client as never, ['k1', 'k3'])).toEqual([ENGLISH, 'the liner slipped twice on the stairs'])
  })

  it('finds nothing where neither table is in this database', async () => {
    expect(await loadTranslations(fakeDb({}).client as never, ['k1'])).toEqual([])
  })

  it('scrubs a copy of the English in stored prose, which the original alone never found', async () => {
    const spec = ANALYSIS_PROSE_TABLES.find((s) => s.table === 'recommendations')!
    const row = () => ({ id: 'r1', client_id: 'c1', title: 'Lead with fit', reasoning: `One wearer wrote "${ENGLISH}".`, based_on: {} })
    const other = { id: 'r2', client_id: 'c1', title: 'Fit', reasoning: `Another wrote "${OTHER_ENGLISH}".`, based_on: {} }
    // The original's words alone: the English copy stays (the gap).
    const before = { recommendations: [row(), { ...other }] }
    await scrubStoredProse(fakeDb(before).client as never, spec, ['c1'], erasedTexts([ORIGINAL]), { apply: true })
    expect(before.recommendations[0].reasoning).toContain(ENGLISH)
    // With the English: gone; another person's English stays.
    const db = fakeDb(tables())
    const texts = erasedTexts([ORIGINAL], await loadTranslations(db.client as never, ['k1']))
    const after = { recommendations: [row(), { ...other }] }
    await scrubStoredProse(fakeDb(after).client as never, spec, ['c1'], texts, { apply: true })
    expect(after.recommendations[0].reasoning).toBe(`One wearer wrote "${ERASED_WORDS}".`)
    expect(after.recommendations[1]).toEqual(other)
  })
})
