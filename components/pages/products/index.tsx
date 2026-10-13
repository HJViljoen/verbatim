import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { surface } from '@/lib/nav'

// YOUR PRODUCTS (Design v2, decision 6 of the depth plan): what is being said
// about what you sell. A PLACEHOLDER until the page lands (depth plan T5),
// which needs the products catalogue and its placement step (T10 to T12):
// nothing is read for a product yet, so the page says so and prints nothing
// that looks like a reading.

/** The one line the page prints until the page itself lands. */
export const PRODUCTS_EMPTY = 'Your products will appear here.'

export function ProductsPage() {
  return (
    <PageFrame className="gap-[22px]">
      <PageBar title={surface('products').label} />
      <section aria-label={surface('products').label} className="flex flex-col rounded-[16px] bg-white px-7 py-6 shadow-card">
        <p className="m-0 text-[14px] text-[#5F656B]">{PRODUCTS_EMPTY}</p>
      </section>
    </PageFrame>
  )
}
