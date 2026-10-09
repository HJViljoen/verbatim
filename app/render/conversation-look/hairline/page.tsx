import { notFound } from 'next/navigation'
import { HairlineConversationPage } from '@/components/pages/voice-surface/hairline'
import { conversationFixture } from '@/components/pages/voice-surface/fixture-conversation'
import { HarnessFrame } from '../frame'

// DEVELOPMENT ONLY (see ../page.tsx): the Hairline design test from the
// render fixture, reached as /render/conversation-look?look=hairline.

export default async function HairlineHarness({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const sp = await searchParams
  return (
    <HarnessFrame>
      <HairlineConversationPage data={sp.empty ? null : conversationFixture()} params={sp} />
    </HarnessFrame>
  )
}
