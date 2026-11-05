import { describe, expect, it, vi } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { deleteAgentThread, mayDeleteThread, THREAD_DELETE_REFUSED, THREAD_GONE } from './delete-thread'

// Deleting an Ask thread (5 Nov): a platform operator's alone for now, because
// the monthly cap is counted on the thread's rows; and only ever a thread of
// the session's own workspace.

const CLIENT = '00000000-0000-4000-8000-0000000000aa'
const OTHER = '00000000-0000-4000-8000-0000000000cc'
const AUTHOR = '00000000-0000-4000-8000-0000000000d1'
const T1 = '00000000-0000-4000-8000-0000000000e1'
const FOREIGN = '00000000-0000-4000-8000-0000000000e9'
const OPERATOR = { homeClientId: OTHER, viewingClientId: CLIENT, viewingName: 'Sealand', isHome: false }

const tables = () => ({
  agent_threads: [
    { id: T1, client_id: CLIENT, kind: 'question', title: 'Straps', created_by: AUTHOR, created_at: '2026-11-03T08:00:00.000Z' },
    { id: FOREIGN, client_id: OTHER, kind: 'question', title: 'Another workspace', created_by: AUTHOR, created_at: '2026-11-03T08:00:00.000Z' },
  ],
})

describe('who may delete a thread', () => {
  it('a platform operator, from the session; nobody else, the thread\'s author and the owner included', () => {
    expect(mayDeleteThread({ operator: OPERATOR })).toBe(true)
    expect(mayDeleteThread({ operator: null })).toBe(false)
  })
})

describe('deleteAgentThread', () => {
  it('refuses a session with no operator, the thread\'s own author too, and reads and deletes nothing', async () => {
    const db = fakeDb(tables())
    expect(await deleteAgentThread(db.client as never, { clientId: CLIENT, userId: AUTHOR, operator: null }, T1)).toEqual({ ok: false, message: THREAD_DELETE_REFUSED })
    expect(db.calls).toHaveLength(0)
  })

  it('deletes the session workspace\'s thread for an operator, naming the workspace in the delete, and logs who deleted what', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const db = fakeDb(tables())
    expect(await deleteAgentThread(db.client as never, { clientId: CLIENT, userId: AUTHOR, operator: OPERATOR }, T1)).toEqual({ ok: true })
    const del = db.calls.find((c) => c.op === 'delete')
    expect(del?.table).toBe('agent_threads')
    expect(del?.filters).toEqual(expect.arrayContaining([`id=${T1}`, `client_id=${CLIENT}`]))
    expect(info.mock.calls.map((c) => String(c[0]))).toContainEqual(expect.stringMatching(new RegExp(`thread deleted .*"thread":"${T1}".*"workspace":"${CLIENT}".*"by":"${AUTHOR}"`)))
    info.mockRestore()
  })

  it('another workspace\'s thread, or an id that names nothing, is no longer here, even to an operator', async () => {
    for (const id of [FOREIGN, '00000000-0000-4000-8000-0000000000ff', 'not-an-id', '']) {
      const db = fakeDb(tables())
      expect(await deleteAgentThread(db.client as never, { clientId: CLIENT, userId: AUTHOR, operator: OPERATOR }, id)).toEqual({ ok: false, message: THREAD_GONE })
      expect(db.calls.some((c) => c.op === 'delete')).toBe(false)
    }
  })
})
