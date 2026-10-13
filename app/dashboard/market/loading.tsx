import { MarketPictureSkeleton } from '@/components/pages/overview/picture/skeleton'

// Mirrors components/pages/overview/picture (MarketPicturePage), Your market
// as the bigger picture, which Market draws until its own page lands: the
// title, the long-run read, where your market stands, then the biggest
// conversations beside what people do in the comments. `lib/dashboard-loading.test.ts` fails a page that has no loader
// of its own or a named shared one.
export default function MarketLoading() {
  return <MarketPictureSkeleton />
}
