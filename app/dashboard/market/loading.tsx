import { MarketSkeleton } from '@/components/pages/v2/market/skeleton'

// Mirrors components/pages/v2/market (MarketPage): the bar, the top row, the
// subject board beside the rail, then every conversation.
// `lib/dashboard-loading.test.ts` fails a page that has no loader of its own
// or a named shared one.
export default function MarketLoading() {
  return <MarketSkeleton />
}
