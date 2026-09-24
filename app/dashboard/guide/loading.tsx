import { SettingsSkeleton } from '@/components/settings-skeleton'

// /dashboard/guide only redirects, to Settings › How to read
// (RETIRED_ADDRESSES in lib/nav.ts), so while it resolves it shows where it is
// going rather than the Overview skeleton it would otherwise inherit.
export default function Loading() {
  return <SettingsSkeleton title="Settings" cards={3} />
}
