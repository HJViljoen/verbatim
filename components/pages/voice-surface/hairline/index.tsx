import type { VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { HairlineConversation, HairlineEmpty, HairlineTopbar } from './body'
import { hlMono, hlSans, hlSerif } from './fonts'
import './hairline.css'

// DESIGN TEST: Conversation in the Hairline look, `/dashboard/voice?look=hairline`
// only (rewritten to app/dashboard/voice/hairline in next.config.ts). It
// deliberately departs from design-system/verbatim/MASTER.md (see ./body.tsx).
// Only that route imports this module, so the shipped page never loads its
// fonts, its CSS or its client code.
//
// Every rule in ./hairline.css is scoped to `[data-look="hairline"]` or to an
// ancestor that `:has()` it, so the shell's overrides (a white pane, no crowd,
// the sidebar in ink and grey) hold exactly while this page is mounted and end
// when it unmounts. No shared component is changed.

/** The faces' generated family names, on the root while the page is mounted:
 *  the sidebar sits outside this tree and reads them too. */
const FONT_VARS =
  `:root:has([data-look="hairline"]){--hx-sans:${hlSans.style.fontFamily};` +
  `--hx-mono:${hlMono.style.fontFamily};--hx-serif:${hlSerif.style.fontFamily};}`

export function HairlineConversationPage({
  data,
  params = {},
}: {
  data: VoiceSurfaceData | null
  params?: Record<string, string | undefined>
}) {
  return (
    <div data-look="hairline" className="hl">
      {/* next/font's own family strings; nothing a reader typed. */}
      <style dangerouslySetInnerHTML={{ __html: FONT_VARS }} />
      <HairlineTopbar data={data} params={params} />
      {data ? <HairlineConversation data={data} params={params} /> : <HairlineEmpty />}
    </div>
  )
}
