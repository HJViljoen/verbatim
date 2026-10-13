import { getSessionContext } from '@/lib/auth'
import { readingHandle } from '@/lib/reading/read'
import { loadVoiceSurface, type VoiceSurfaceParams } from '@/lib/pages/voice-surface'
import { VoiceSurfacePage } from '@/components/pages/voice-surface'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: surface('voices').label }

// VOICES AT /dashboard/voices (Design v2, decision 6 of the depth plan): who
// is saying it, and who matters.
//
// A PLACEHOLDER UNTIL THE VOICES PAGE LANDS (depth plan T4): Conversation as
// it was drawn at /dashboard/voice ("everything your market talked about, in
// full", market-first WP2.4), whose cast and brands' videos are Voices' now.
// An old Conversation link lands here with its params (lib/nav.ts
// `redirectFor`), except one that opened a theme, which Market opens
// (`?conv=`). `?brand=` (Competitive's "Open {brand}'s videos →", and
// Competitive's own `?vs=`) puts one tracked brand's videos over B2's ninety
// days in the board's place; `?horizon=` and `?audience=` are read as nothing.
//
// The legacy Voice of Customer module stays registered under the page key
// `voice` (components/pages/registry.ts) for the export route, the share page
// and the Studio. This file is a ROUTE, not the module an artefact names.

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
