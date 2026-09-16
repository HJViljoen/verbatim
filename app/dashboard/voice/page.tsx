import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadVoiceSurface, type VoiceSurfaceParams } from '@/lib/pages/voice-surface'
import { VoiceSurfacePage } from '@/components/pages/voice-surface'

// Voice — "who is saying what in this category?" (Phase 1 WP13, design §3
// VO1–VO4).
//
// The address is unchanged and `?themes=` still lands: thirty-two stored links
// reach here and fourteen of them carry that key, so the new loader reads it
// as the same deep link the old page did — it narrows which themes are drawn,
// never which month is read.
//
// The legacy Voice of Customer module stays registered under the page key
// `voice` (components/pages/registry.ts) for the export route, the share page
// and the Studio. This file replaces the ROUTE, not the module an artefact
// names — the line WP11 drew when Overview took the Dashboard's address.

export default async function Page({ searchParams }: { searchParams?: Promise<VoiceSurfaceParams> }) {
  const { supabase, clientId } = await getSessionContext()
  const sp = ((await searchParams) ?? {}) as Record<string, string | undefined>
  const data = await loadVoiceSurface({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  return <VoiceSurfacePage data={data} params={sp} />
}
