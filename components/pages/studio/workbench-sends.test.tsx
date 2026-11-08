import { describe, expect, it } from 'vitest'
import { render } from '@/lib/test/render'
import { SendsTable, type SendRow } from '@/app/dashboard/studio/workbench'

// Build and send's history (Studio-New.dc.html's "Sends"): an issue on the
// platform opens its page; a skipped, failed, claimed or ready send has none
// at `?group=sent&item=`, so it is plain text (the operator pass, 8 Nov: main
// and the redesign linked every one but the ready, to an address that opened
// nothing).

const send = (over: Partial<SendRow>): SendRow => ({
  id: 's-1', schedule_id: 'sch', status: 'sent', subject: 'This week in your market', recipients: ['a@b.c'], sent_at: '2026-11-01T06:00:00.000Z',
  claimed_at: '2026-11-01T05:00:00.000Z', error: null, ready_at: null, approved_by: null, snapshot_id: 'snap', published_at: null, ...over,
})

describe('the sends table', () => {
  it('links an issue on the platform, sent or put there without its email, and nothing else', () => {
    const html = render(<SendsTable nameOf={new Map()} history={[
      send({ id: 'sent' }),
      send({ id: 'published', status: 'ready', sent_at: null, published_at: '2026-11-02T06:00:00.000Z' }),
      send({ id: 'skipped', status: 'skipped', sent_at: null, subject: 'Skipped update' }),
      send({ id: 'failed', status: 'failed', sent_at: null, subject: 'Failed update', error: 'boom' }),
      send({ id: 'ready', status: 'ready', sent_at: null, subject: 'Waiting update' }),
    ]} />)
    expect(html).toContain('href="/dashboard/studio?group=sent&amp;item=sent"')
    expect(html).toContain('href="/dashboard/studio?group=sent&amp;item=published"')
    for (const id of ['skipped', 'failed', 'ready']) expect(html).not.toContain(`item=${id}"`)
    expect(html).toMatch(/<span class="font-semibold">Skipped update<\/span>/)
    expect(html).toMatch(/<span class="font-semibold">Failed update<\/span>/)
  })
})
