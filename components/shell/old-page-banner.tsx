import Link from 'next/link'
import { oldPageBanner, type OldPage } from '@/lib/nav'

/**
 * What a page that is going says about itself (decision C, item 38a).
 *
 * The same shape as `components/access-banner.tsx` — a warning-toned block
 * above the page's own content — and rendered by each parked page rather than
 * by the layout, so it needs no loader and no `usePathname`: a parked page
 * knows it is parked.
 *
 * It names three things, because leaving any of them out is how a retirement
 * becomes a support email: what replaces this page, where that is, and the day
 * this one stops answering. The date comes from OLD_PAGES_RETIRE_ON through
 * lib/nav.ts, never from the clock, so the sidebar group's label and this
 * banner cannot disagree.
 */
export function OldPageBanner({ page }: { page: OldPage }) {
  const b = oldPageBanner(page)
  return (
    <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3" data-print-hide>
      <p className="text-sm font-semibold">{b.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{b.body}</p>
      <Link href={b.href} className="mt-2 inline-block cursor-pointer text-sm font-semibold text-foreground underline-offset-4 hover:underline">
        {b.cta}
      </Link>
    </div>
  )
}
