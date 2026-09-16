import { QuarterlyEmail } from '../../components/email/quarterly'
import { renderStaticHtml } from './render-html'
import { htmlToText } from './text'
import { EMAIL } from './theme'
import type { BlockContext } from '../blocks/types'
import type { QuarterlySnapshotData } from '../reports/quarterly-build'

/**
 * Rendering the quarterly review's email (Phase 1 WP20): a hydrated snapshot →
 * the subject, the HTML and its plain-text mirror. Runs in a route handler or a
 * script, never in a page and never inside an Inngest step (AGENTS.md).
 *
 * THE SUBJECT IS FROZEN WITH THE READING. `data.subject` was composed when the
 * snapshot was taken, so the line in the inbox and the line on the artefact
 * cannot describe two different quarters — which is what "the email as sent"
 * re-rendering from the snapshot has to be able to promise. It also carries the
 * six-month gate, because whether the reader's own side is readable is the one
 * thing worth knowing before the message is opened.
 *
 * NO IMAGE TILES. The two pages this email carries say their numbers in words;
 * `ctx.image(key)` answers null and neither reads it. The runner therefore
 * renders one job for a quarterly send — the PDF — and an image-blocking client
 * loses nothing.
 */

export interface RenderQuarterlyArgs {
  data: QuarterlySnapshotData
  shareUrl: string | null
  appUrl: string
  attached: boolean
  images?: Record<string, string>
}

/** Block keys whose email says it with a picture. Empty on purpose: see above. */
export const QUARTERLY_IMAGE_BLOCKS: readonly string[] = []

export function renderQuarterlyEmail(a: RenderQuarterlyArgs): { subject: string; html: string; text: string } {
  const ctx: BlockContext = {
    appUrl: a.appUrl,
    image: (key) => a.images?.[key] ?? null,
    theme: EMAIL,
  }
  const html = `<!doctype html>\n${renderStaticHtml(
    <QuarterlyEmail data={a.data} shareUrl={a.shareUrl} appUrl={a.appUrl} attached={a.attached} ctx={ctx} preheader={a.data.subject} />,
  )}`
  return { subject: a.data.subject, html, text: htmlToText(html) }
}
