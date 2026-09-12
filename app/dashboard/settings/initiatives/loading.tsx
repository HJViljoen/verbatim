import { SettingsSkeleton } from '@/components/settings-skeleton'

// Loading skeleton for Settings › Initiatives — the settings rail + one card.
export default function Loading() {
  return <SettingsSkeleton title="Settings" cards={1} />
}
