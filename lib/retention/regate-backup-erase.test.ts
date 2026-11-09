import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { BACKUP_COMMENT_DEPENDENTS, findBackedUpComments, removeBackedUpCopies, scrubBackupRow, scrubRegateBackup } from './regate-backup-erase'
import { ERASED_WORDS } from './stored-prose'

// A regate (regate_videos) keeps the rows it removes in `regate_backup` for 30
// days, comments whole, and `regate_restore` puts them back. An erasure has to
// find the commenter there, scrub the backed-up prose and remove the copies.
// Synthetic words and handles.

const ERASED = 'my socket rubs raw after an hour every single day'
const OTHER = 'my socket rubs a little after a long day'

const comment = (id: string, author: string, text: string, platform = 'youtube', client = 'c1') =>
  ({ id, client_id: client, author, text, platform, video_id: `v-${id}`, comment_id: `yt-${id}` })

function backup() {
  return [
    { batch_id: 'b1', client_id: 'c1', source_table: 'comments', row_data: comment('k1', '@SockFan', ERASED) },
    // The same comment in a second batch (regated, restored, regated again).
    { batch_id: 'b2', client_id: 'c1', source_table: 'comments', row_data: comment('k1', '@SockFan', ERASED) },
    { batch_id: 'b1', client_id: 'c1', source_table: 'comments', row_data: comment('k2', '@someoneelse', OTHER) },
    { batch_id: 'b1', client_id: 'c1', source_table: 'comments', row_data: comment('k3', '@sockfan', 'on tiktok, not this request', 'tiktok') },
    { batch_id: 'b1', client_id: 'c1', source_table: 'insight_evidence', row_data: { id: 'e1', comment_id: 'k1', quote: 'rubs raw after an hour' } },
    { batch_id: 'b1', client_id: 'c1', source_table: 'language_samples', row_data: { id: 'l1', comment_id: 'k1', phrase: 'rubs raw' } },
    { batch_id: 'b1', client_id: 'c1', source_table: 'insight_evidence', row_data: { id: 'e2', comment_id: 'k2', quote: 'rubs a little' } },
    { batch_id: 'b1', client_id: 'c1', source_table: 'audience_insights', row_data: { id: 'i1', theme: 'Socket pain', description: `One said "${ERASED}".`, strength_score: 7 } },
    { batch_id: 'b1', client_id: 'c1', source_table: 'audience_insights', row_data: { id: 'i2', theme: 'Socket pain', description: `One said "${OTHER}".`, strength_score: 5 } },
    { batch_id: 'b1', client_id: 'c1', source_table: 'account_events', row_data: { id: 'a1', explanation: 'Fit talk rose.', supporting_theme_labels: ['Fit'], hero_quote: 'rubs raw after an hour' } },
    { batch_id: 'b1', client_id: 'c2', source_table: 'audience_insights', row_data: { id: 'i3', theme: 'Socket pain', description: `One said "${ERASED}".` } },
  ]
}

describe('erasure finds the commenter in the regate backup', () => {
  it('matches the author on the platform, case-insensitively, once per comment', async () => {
    const db = fakeDb({ regate_backup: backup() })
    const found = await findBackedUpComments(db.client as never, 'youtube', ['SockFan', '@SockFan'])
    expect(found.map((c) => [c.id, c.text])).toEqual([['k1', ERASED]])
  })

  it('finds nothing where the table is not in this database', async () => {
    expect(await findBackedUpComments(fakeDb({}).client as never, 'youtube', ['@SockFan'])).toEqual([])
  })
})

describe('erasure scrubs the backed-up prose', () => {
  it('an insight\'s description and an event\'s hero quote, this workspace only, nothing else', async () => {
    const tables = { regate_backup: backup() }
    const db = fakeDb(tables)
    // Before: the backup holds the words.
    expect(JSON.stringify(tables.regate_backup.filter((r) => r.client_id === 'c1' && r.source_table === 'audience_insights'))).toContain(ERASED)
    expect(await scrubRegateBackup(db.client as never, ['c1'], [ERASED], { apply: true })).toBe(2)
    const byId = (id: string) => tables.regate_backup.find((r) => (r.row_data as { id: string }).id === id)!.row_data as Record<string, unknown>
    expect(byId('i1')).toEqual({ id: 'i1', theme: 'Socket pain', description: `One said "${ERASED_WORDS}".`, strength_score: 7 })
    expect(byId('a1')).toEqual({ id: 'a1', explanation: 'Fit talk rose.', supporting_theme_labels: ['Fit'], hero_quote: null })
    // Another person's near words, and another workspace, are left alone.
    expect(byId('i2').description).toBe(`One said "${OTHER}".`)
    expect(byId('i3').description).toBe(`One said "${ERASED}".`)
    const updates = db.calls.filter((c) => c.op === 'update')
    expect(updates.map((u) => u.filters)).toEqual([
      ['batch_id=b1', 'source_table=audience_insights', 'row_data->>id=i1'],
      ['batch_id=b1', 'source_table=account_events', 'row_data->>id=a1'],
    ])
  })

  it('leaves a backed-up comment row to the delete, and a row with none of the words alone', () => {
    expect(scrubBackupRow('comments', comment('k1', '@SockFan', ERASED), [ERASED])).toBeNull()
    expect(scrubBackupRow('audience_insights', { id: 'i2', description: OTHER }, [ERASED])).toBeNull()
  })
})

describe('erasure removes the backup\'s copies of the comments, with the delete', () => {
  it('the comment rows in every batch and the rows hanging off them, nothing else', async () => {
    const tables = { regate_backup: backup() }
    const db = fakeDb(tables)
    expect(await removeBackedUpCopies(db.client as never, ['k1'], { apply: true })).toEqual({ comments: 2, dependents: 2 })
    const left = tables.regate_backup.map((r) => `${r.batch_id}:${r.source_table}:${(r.row_data as { id: string }).id}`)
    expect(left).not.toContain('b1:comments:k1')
    expect(left).not.toContain('b2:comments:k1')
    expect(left).not.toContain('b1:insight_evidence:e1')
    expect(left).not.toContain('b1:language_samples:l1')
    expect(left).toEqual(expect.arrayContaining(['b1:comments:k2', 'b1:insight_evidence:e2', 'b1:comments:k3']))
    expect(JSON.stringify(tables.regate_backup.filter((r) => r.source_table === 'comments'))).not.toContain(ERASED)
    // Hanging rows first, then the comments.
    const deletes = db.calls.filter((c) => c.op === 'delete')
    expect(deletes.map((d) => d.filters[0])).toEqual([`source_table in ${BACKUP_COMMENT_DEPENDENTS.length}`, 'source_table=comments'])
  })

  it('counts and deletes nothing on a dry run', async () => {
    const tables = { regate_backup: backup() }
    const db = fakeDb(tables)
    expect(await removeBackedUpCopies(db.client as never, ['k1'], { apply: false })).toEqual({ comments: 2, dependents: 2 })
    expect(db.calls.filter((c) => c.op === 'delete')).toEqual([])
    expect(tables.regate_backup).toHaveLength(backup().length)
  })
})
