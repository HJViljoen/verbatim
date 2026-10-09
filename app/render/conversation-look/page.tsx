import { notFound } from 'next/navigation'
import { VoiceSurfacePage } from '@/components/pages/voice-surface'
import { conversationFixture } from '@/components/pages/voice-surface/fixture-conversation'
import { HarnessFrame } from './frame'

// DEVELOPMENT ONLY: 404 in production, so a preview or production deployment
// never serves it. The Hairline design test's screenshot harness:
// Conversation from its render fixture (`conversationFixture`, the same data
// the render tests and scripts/pages-shots.ts use), inside the shipped sidebar
// and the dashboard layout's pane, with no session and no database.
//
//   /render/conversation-look                 the page as it ships
//   /render/conversation-look?look=hairline   the Hairline design test
//   ?empty=1                                  the state before a first month
//
// `?look=hairline` reaches ./hairline/page.tsx through a development-only
// rewrite in next.config.ts, the same mechanism the real route uses.

export default async function ConversationHarness({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const sp = await searchParams
  return (
    <HarnessFrame>
      <VoiceSurfacePage data={sp.empty ? null : conversationFixture()} params={sp} />
    </HarnessFrame>
  )
}
