import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadVoiceSurface, type VoiceSurfaceParams } from '@/lib/pages/voice-surface'
import { HairlineConversationPage } from '@/components/pages/voice-surface/hairline'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

export const metadata: Metadata = { title: surface('voice').label }

// DESIGN TEST (Oct 2026, branch design/hairline-conversation): Conversation in
// the Hairline look. Readers reach it as `/dashboard/voice?look=hairline`,
// which next.config.ts REWRITES here (a `beforeFiles` rewrite runs after
// proxy.ts, so the session gate and the host routing see the request first).
// It is its own route on purpose: the shipped page's module graph never
// imports the variant's fonts, CSS or client code, so without the param that
// page is exactly what it was.
//
// The same loader and the same data as ../page.tsx; only the drawing differs
// (components/pages/voice-surface/hairline). It deliberately departs from
// design-system/verbatim/MASTER.md.

export default async function Page({ searchParams }: { searchParams?: Promise<VoiceSurfaceParams> }) {
  const { supabase, clientId } = await getSessionContext()
  const sp = ((await searchParams) ?? {}) as Record<string, string | undefined>
  const data = await loadVoiceSurface({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return <HairlineConversationPage data={data} params={sp} />
}
