import { notFound } from 'next/navigation'
import { PrintRoot } from '@/components/print/print-root'
import { QuarterlyDeck } from '@/components/print/quarterly-deck'
import { quarterlySnapshotFixture, quarterlyFixture, formingFixture, afterQuarterFixture } from '@/components/blocks/quarterly/fixture'

// THROWAWAY (Block D wave 2, E-quarterly). Deleted before the package's last
// commit; the permanent tier is components/blocks/quarterly/blocks.test.tsx.
// Anything under /site is public in proxy.ts — no session, no database — so
// this renders the deck from its own fixture at the deck's real size.

export const dynamic = 'force-dynamic'

const STATES = {
  populated: quarterlyFixture,
  forming: formingFixture,
  after: afterQuarterFixture,
}

export default async function ArtboardQuarterly({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const sp = await searchParams
  const state = STATES[(sp.state ?? 'populated') as keyof typeof STATES] ?? quarterlyFixture
  return (
    <PrintRoot>
      <QuarterlyDeck data={quarterlySnapshotFixture(state())} date="18 Sep 2026" />
    </PrintRoot>
  )
}
