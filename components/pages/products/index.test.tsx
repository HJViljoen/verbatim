import { describe, expect, it } from 'vitest'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { PRODUCTS_EMPTY, ProductsPage } from './index'

// Your products' placeholder (Design v2): the title from the nav table and one
// honest empty card, until the page lands (depth plan T5).

describe('the Your products placeholder', () => {
  it('prints its title and one empty card, and nothing that reads as a figure', () => {
    const html = render(<ProductsPage />)
    expect(renderText(<ProductsPage />)).toBe(`Your products ${PRODUCTS_EMPTY}`)
    expect(html).toContain('<h1')
    expect(html.match(/<section/g)).toHaveLength(1)
    expect(html).toContain('shadow-card')
    assertCopyContract(html)
  })
})
