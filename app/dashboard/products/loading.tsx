import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { Bone } from '@/components/shell/skeleton'
import { surface } from '@/lib/nav'

// Mirrors components/pages/products (the placeholder): the title, then its one
// card. The title is the real one, so the page does not change its name on
// arrival.
export default function ProductsLoading() {
  return (
    <PageFrame className="gap-[22px]">
      <span role="status" className="sr-only">Loading {surface('products').label}…</span>
      <PageBar title={surface('products').label} />
      <section className="flex flex-col rounded-[16px] bg-white px-7 py-6 shadow-card">
        <Bone className="h-4 w-56 max-w-full" />
      </section>
    </PageFrame>
  )
}
