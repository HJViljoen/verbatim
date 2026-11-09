import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { scrubRawPayload, scrubRawPayloads } from './raw-payloads-erase'
import { ERASED_WORDS } from './stored-prose'

// The raw actor payloads (`video_raw`, 30 days). An Instagram post's item is
// shaped here as the scraper's output is generally described, with its latest
// comments; the scrub does not depend on that shape being exact. Synthetic
// handles and words.

const ERASED = 'my socket rubs raw after an hour every single day'
const OTHER = 'my socket rubs a little after a long day'
const KEYS = new Set(['sockfan'])

const post = (id: string, comments: { ownerUsername: string; text: string }[], firstComment = '') => ({
  id, shortCode: `C${id}`, ownerUsername: 'clinic_official', caption: 'Fitting day at the clinic',
  commentsCount: 41, firstComment,
  latestComments: comments.map((c, i) => ({ id: `${id}-${i}`, ...c, likesCount: 2, replies: [] })),
})

describe('an erasure reaches the raw payloads', () => {
  it('drops the handle\'s comments and scrubs the words, keeping everything else', () => {
    const item = post('1', [{ ownerUsername: 'SockFan', text: ERASED }, { ownerUsername: 'someoneelse', text: OTHER }], ERASED)
    // Before: the payload holds the handle and the words.
    expect(JSON.stringify(item)).toContain('SockFan')
    expect(JSON.stringify(item)).toContain(ERASED)
    const out = scrubRawPayload(item, 'instagram', KEYS, [ERASED]) as ReturnType<typeof post>
    expect(JSON.stringify(out)).not.toContain('SockFan')
    expect(JSON.stringify(out)).not.toContain(ERASED)
    expect(out.firstComment).toBe(ERASED_WORDS)
    // Another person's comment, the post and its counts are untouched.
    expect(out.latestComments).toEqual([item.latestComments[1]])
    expect({ ...out, latestComments: [], firstComment: '' }).toEqual({ ...item, latestComments: [], firstComment: '' })
  })

  it('finds a reply by the handle inside another person\'s comment', () => {
    const item = post('2', [{ ownerUsername: 'someoneelse', text: OTHER }])
    item.latestComments[0].replies = [{ owner: { username: '@SockFan' }, text: 'same here' }] as never
    const out = scrubRawPayload(item, 'instagram', KEYS, []) as ReturnType<typeof post>
    expect(out.latestComments[0].replies).toEqual([])
  })

  it('never drops the post itself, even where its owner is the handle, and leaves a payload without them as it was', () => {
    const own = { ...post('3', []), ownerUsername: 'sockfan', text: 'not a comment' }
    expect(scrubRawPayload(own, 'instagram', KEYS, [ERASED])).toBe(own)
    const clean = post('4', [{ ownerUsername: 'someoneelse', text: OTHER }])
    expect(scrubRawPayload(clean, 'instagram', KEYS, [ERASED])).toBe(clean)
  })

  it('scrubs every tenant\'s rows on the platform, and only the ones that carried them', async () => {
    const tables = {
      video_raw: [
        { id: 1, client_id: 'c1', platform: 'instagram', raw: post('1', [{ ownerUsername: 'sockfan', text: 'love it so much' }]) },
        { id: 2, client_id: 'c9', platform: 'instagram', raw: post('2', [{ ownerUsername: 'someoneelse', text: OTHER }]) },
        { id: 3, client_id: 'c9', platform: 'tiktok', raw: { id: 't', comments: [{ ownerUsername: 'sockfan', text: 'other platform' }] } },
      ],
    }
    const db = fakeDb(tables)
    expect(await scrubRawPayloads(db.client as never, 'instagram', KEYS, [], { apply: true })).toBe(1)
    expect(db.calls.filter((c) => c.op === 'update').map((u) => u.filters)).toEqual([['id=1']])
    expect(JSON.stringify(tables.video_raw[0].raw)).not.toContain('sockfan')
    expect(JSON.stringify(tables.video_raw[2].raw)).toContain('sockfan')
  })

  it('reads nothing where the table is not in this database', async () => {
    expect(await scrubRawPayloads(fakeDb({}).client as never, 'instagram', KEYS, [ERASED], { apply: true })).toBe(0)
  })
})

// A future gather never stores an erased handle's comments in a payload
// again: the `video_raw` write runs each item through the same rule with the
// suppression keys (lib/gather/gather.ts, gatePlatform's raw capture).
describe('the raw capture drops suppressed handles\' comments at write time', () => {
  it('runs every payload through scrubRawPayload with the platform\'s suppression keys', () => {
    const src = readFileSync(resolve(__dirname, '../gather/gather.ts'), 'utf8')
    const write = src.indexOf(".from('video_raw')")
    const capture = src.lastIndexOf('Step 1 capture', write)
    const block = src.slice(capture, write)
    expect(capture).toBeGreaterThan(0)
    expect(block).toContain('const suppressedKeys = await loadSuppressedKeys(admin, adapter.platform)')
    expect(block).toContain('scrubRawPayload(rawById.get(v.video_id), adapter.platform, suppressedKeys, [])')
  })
})
