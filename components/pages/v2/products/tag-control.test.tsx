import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { tagOptions } from '@/lib/products/tags'
import { PRODUCT_TAG_COPY } from '@/lib/products/tags'
import { OSSUR_CATALOGUE, PRODUCT_IDS } from '@/lib/pages/v2/products-fixture'
import type { ProductTagState } from '@/lib/actions/product-tags'
import { TAG_INITIAL, TagControl, TagControlView, tagSaid } from './tag-control'

// The Tag control's states (board E4-Products-Liners, "Tag the product"),
// each rendered on its own, and what it says after each answer the action
// gives (lib/actions/product-tags.ts).

const options = tagOptions(OSSUR_CATALOGUE, PRODUCT_IDS.liners()).map((o) => ({ value: o.value, label: o.label }))
const view = (over: Partial<Parameters<typeof TagControlView>[0]> = {}) => (
  <TagControlView videoId="11111111-1111-4111-8111-111111111111" commentId="22222222-2222-4222-8222-222222222222" options={options} label="This liner gave me a rash" open={false} {...over} />
)

describe('tagSaid: the sentence and its voice, per answer', () => {
  const s = (outcome: ProductTagState['outcome'], ok: boolean, message: string): ProductTagState => ({ ok, outcome, message })

  it('done, kept (a closed month: the tag stands and the frozen counts do not move), already, and every refusal as an error', () => {
    expect(tagSaid(s('written', true, PRODUCT_TAG_COPY.done))).toEqual({ tone: 'done', message: PRODUCT_TAG_COPY.done })
    expect(tagSaid(s('written_closed', true, PRODUCT_TAG_COPY.closedMonth))).toEqual({ tone: 'kept', message: PRODUCT_TAG_COPY.closedMonth })
    expect(tagSaid(s('already', true, PRODUCT_TAG_COPY.already))).toEqual({ tone: 'already', message: PRODUCT_TAG_COPY.already })
    for (const [outcome, message] of [['role', PRODUCT_TAG_COPY.role], ['changed', PRODUCT_TAG_COPY.changed], ['unknown_text', PRODUCT_TAG_COPY.unknown], ['unknown_target', PRODUCT_TAG_COPY.unknownTarget], ['not_ready', PRODUCT_TAG_COPY.notReady], ['failed', PRODUCT_TAG_COPY.failed], ['unread', PRODUCT_TAG_COPY.unread]] as const) {
      expect(tagSaid(s(outcome, false, message)), outcome).toEqual({ tone: 'error', message })
    }
  })

  it('says nothing before an answer', () => {
    expect(tagSaid(TAG_INITIAL)).toBeNull()
    expect(tagSaid(null)).toBeNull()
  })
})

describe('the control, drawn in each state', () => {
  it('closed: the ink button alone, its card not drawn', () => {
    const m = render(view())
    expect(m).toContain('data-tag-control="closed"')
    expect(m).toContain('aria-expanded="false"')
    expect(m).not.toContain('<form')
    expect(renderText(view())).toBe('Tag the product')
    assertCopyContract(view())
  })

  it('open: the category\'s products, one of yours not which, the category in general, none of yours; the text\'s ids posted', () => {
    const node = view({ open: true })
    const m = render(node)
    expect(m).toContain('data-tag-control="open"')
    expect(m).toContain('name="videoId" value="11111111-1111-4111-8111-111111111111"')
    expect(m).toContain('name="commentId" value="22222222-2222-4222-8222-222222222222"')
    const text = renderText(node)
    expect(text).toContain('Which is it about?')
    expect(text).toContain('Iceross Seal-In X')
    expect(text).toContain('One of your products in Liners, not sure which Liners in general Not about your products')
    expect(text).toContain('Cancel Save')
    assertCopyContract(node)
  })

  it('a video as a whole posts no comment id', () => {
    expect(render(view({ open: true, commentId: null }))).not.toContain('name="commentId"')
  })

  it('pending: the choice and both buttons held while the action runs', () => {
    const m = render(view({ open: true, pending: true }))
    expect(m).toContain('Saving')
    expect(m.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('answered: the action\'s sentence under the button, an error as an alert', () => {
    const done = render(view({ state: { ok: true, outcome: 'written', message: PRODUCT_TAG_COPY.done } }))
    expect(done).toContain('data-said="done"')
    expect(done).toContain('role="status"')
    const kept = renderText(view({ state: { ok: true, outcome: 'written_closed', message: PRODUCT_TAG_COPY.closedMonth } }))
    expect(kept).toContain('That comment’s month is closed'.replace('’', '\''))
    const refused = render(view({ state: { ok: false, outcome: 'role', message: PRODUCT_TAG_COPY.role } }))
    expect(refused).toContain('role="alert"')
    expect(refused).toContain('data-said="error"')
  })

  it('the live control starts closed and silent', () => {
    expect(render(<TagControl videoId="v" commentId={null} options={options} label="a video" />)).toContain('data-tag-control="closed"')
  })
})
