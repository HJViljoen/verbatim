import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadVoiceSurface, type VoiceSurfaceParams } from '@/lib/pages/voice-surface'
import { VoiceSurfacePage } from '@/components/pages/voice-surface'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('voice').label }

// Conversation — "everything your market talked about, in full" (market-first
// WP2.4, plan §2.4; the page was Voice, Phase 1 WP13).
//
// The address is unchanged and stored links still land: `?themes=` (fourteen
// of the thirty-two stored links carry it) opens the biggest theme it names in
// the pane, and `?horizon=` and `?audience=` are read as nothing, since the
// page reads the reading month and the category's themes. `?brand=` (the
// Brands page's "Open {brand}'s videos →") puts one tracked brand's videos
// over B2's ninety days in the board's place.
//
// The legacy Voice of Customer module stays registered under the page key
// `voice` (components/pages/registry.ts) for the export route, the share page
// and the Studio. This file replaces the ROUTE, not the module an artefact
// names — the line WP11 drew when Overview took the Dashboard's address.

export default async function Page({ searchParams }: { searchParams?: Promise<VoiceSurfaceParams> }) {
  const { supabase, clientId } = await getSessionContext()
  const sp = ((await searchParams) ?? {}) as Record<string, string | undefined>
  const data = await loadVoiceSurface({ supabase, clientId, reading: readingHandle(clientId), params: sp })
  // THE APPROVED ARTBOARD (the pages build, 1 Oct): the title alone at the
  // top, no month chip, no "as at" line and no Export (the export route
  // renders the legacy Voice module, so a PDF from here would not be this
  // page).
  return <VoiceSurfacePage data={data} params={sp} />
}
