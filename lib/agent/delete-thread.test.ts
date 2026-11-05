import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { deleteAgentThread, mayDeleteThread, threadDeletable, THREAD_DELETE_REFUSED, THREAD_GONE } from './delete-thread'

// Deleting an Ask thread (5 Nov): its author, or an owner or admin, and only
// ever a thread of the session's own workspace.

const CLIENT = '00000000-0000-4000-8000-0000000000aa'
const OTHER = '00000000-0000-4000-8000-0000000000cc'
const AUTHOR = '00000000-0000-4000-8000-0000000000d1'
const SOMEONE = '00000000-0000-4000-8000-0000000000d2'
const T1 = '00000000-0000-4000-8000-0000000000e1'
const FOREIGN = '00000000-0000-4000-8000-0000000000e9'

const tables = () => ({
  agent_threads: [
    { id: T1, client_id: CLIENT, kind: 'question', title: 'Straps', created_by: AUTHOR },
    { id: FOREIGN, client_id: OTHER, kind: 'question', title: 'Another workspace', created_by: AUTHOR },
  ],
})

describe('who may delete a thread', () => {
  it('its author, and the workspace\'s owners and admins; a member never another\'s', () => {
    expect(mayDeleteThread({ role: 'member', userId: AUTHOR, createdBy: AUTHOR })).toBe(true)
    expect(mayDeleteThread({ role: 'member', userId: SOMEONE, createdBy: AUTHOR })).toBe(false)
    expect(mayDeleteThread({ role: 'admin', userId: SOMEONE, createdBy: AUTHOR })).toBe(true)
    expect(mayDeleteThread({ role: 'owner', userId: SOMEONE, createdBy: null })).toBe(true)
    // No recorded author is no one's own thread.
    expect(mayDeleteThread({ role: 'member', userId: SOMEONE, createdBy: null })).toBe(false)
  })
})

describe('deleteAgentThread', () => {
  it('deletes the session workspace\'s thread for its author, naming the workspace in the delete', async () => {
    const db = fakeDb(tables())
    expect(await deleteAgentThread(db.client as never, { clientId: CLIENT, userId: AUTHOR, role: 'member' }, T1)).toEqual({ ok: true })
    const del = db.calls.find((c) => c.op === 'delete')
    expect(del?.table).toBe('agent_threads')
    expect(del?.filters).toEqual(expect.arrayContaining([`id=${T1}`, `client_id=${CLIENT}`]))
  })

  it('refuses a member who did not ask it, and deletes nothing', async () => {
    const db = fakeDb(tables())
    expect(await deleteAgentThread(db.client as never, { clientId: CLIENT, userId: SOMEONE, role: 'member' }, T1)).toEqual({ ok: false, message: THREAD_DELETE_REFUSED })
    expect(db.calls.some((c) => c.op === 'delete')).toBe(false)
  })

  it('another workspace\'s thread, or an id that names nothing, is no longer here, even to an owner', async () => {
    for (const id of [FOREIGN, '00000000-0000-4000-8000-0000000000ff', 'not-an-id', '']) {
      const db = fakeDb(tables())
      expect(await deleteAgentThread(db.client as never, { clientId: CLIENT, userId: AUTHOR, role: 'owner' }, id)).toEqual({ ok: false, message: THREAD_GONE })
      expect(db.calls.some((c) => c.op === 'delete')).toBe(false)
    }
  })
})

describe('threadDeletable (whether the page draws the control)', () => {
  it('an owner or admin without a read; a member only on their own thread', async () => {
    const db = fakeDb(tables())
    expect(await threadDeletable(db.client as never, { clientId: CLIENT, userId: SOMEONE, role: 'admin' }, T1)).toBe(true)
    expect(db.calls).toHaveLength(0)
    expect(await threadDeletable(db.client as never, { clientId: CLIENT, userId: AUTHOR, role: 'member' }, T1)).toBe(true)
    expect(await threadDeletable(db.client as never, { clientId: CLIENT, userId: SOMEONE, role: 'member' }, T1)).toBe(false)
    expect(await threadDeletable(db.client as never, { clientId: CLIENT, userId: AUTHOR, role: 'member' }, FOREIGN)).toBe(false)
  })
})
