import { describe, expect, it } from 'vitest'

import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { DeleteThread, deleteThreadWords } from './delete-thread'

// The delete control at a thread's foot (5 Nov): closed, it is one quiet
// button; the confirm is the page's own line, never the browser's dialog.
describe('DeleteThread', () => {
  it('draws one button, named for the thread\'s kind, and keeps the copy contract', () => {
    expect(renderText(<DeleteThread threadId="t1" kind="question" />)).toBe('Delete this question')
    expect(renderText(<DeleteThread threadId="t1" kind="document" />)).toBe('Delete this check')
    assertCopyContract(<DeleteThread threadId="t1" kind="question" />)
    expect(render(<DeleteThread threadId="t1" kind="question" />)).toContain('data-print-hide')
  })

  it('the confirm says what goes, for whom, and that it is for good', () => {
    expect(deleteThreadWords('question').ask).toBe('Delete this question and its answers? It goes for everyone in your workspace, and it can’t be undone.')
    expect(deleteThreadWords('document').ask).toContain('The plan it checked stays on Market.')
  })
})
