import { HairlineSkeleton } from '@/components/pages/voice-surface/hairline/skeleton'

// DESIGN TEST: the Hairline look's own skeleton (see ./page.tsx), so loading
// it never shows the shipped page's bones in the other look.
export default function HairlineConversationLoading() {
  return <HairlineSkeleton />
}
