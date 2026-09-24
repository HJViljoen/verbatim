import { WeeklyEmail } from '../../components/email/weekly'
import { renderStaticHtml } from './render-html'
import { htmlToText } from './text'
import { EMAIL } from './theme'
import type { BlockContext } from '../blocks/types'
import type { WeeklySnapshotData } from '../reports/weekly-build'

/**
 * Rendering the weekly report (Phase 1 WP17): a hydrated snapshot → the
 * subject, the HTML and its plain-text mirror. Runs in a route handler or a
 * script, never in a page and never inside an Inngest step.
 *
 * THE SUBJECT IS FROZEN WITH THE READING. `data.subject` was composed when the
 * snapshot was taken, so the line in the inbox and the line on the artefact
 * cannot describe two different weeks — which is what "the email as sent"
 * re-rendering from the snapshot has to be able to promise.
 *
 * NO IMAGE TILES TODAY, and the contract is still honoured: `ctx.image(key)`
 * answers null, and every weekly block is written to say its numbers in words.
 * None of the six draws a chart — WR2's monthly line is OV2's and does not
 * cross into the report — so the runner renders no PNGs for this artefact and
 * an image-blocking client loses nothing.
 */

export interface RenderWeeklyArgs {
  data: WeeklySnapshotData
  shareUrl: string | null
  appUrl: string
  attached: boolean
  /** blockKey → `cid:` URL of an inline image the runner attached. */
  images?: Record<string, string>
}

/** Block keys whose email says it with a picture. Empty on purpose: see above. */
export const WEEKLY_IMAGE_BLOCKS: readonly string[] = []

export function renderWeeklyEmail(a: RenderWeeklyArgs): { subject: string; html: string; text: string } {
  const ctx: BlockContext = {
    appUrl: a.appUrl,
    image: (key) => a.images?.[key] ?? null,
    theme: EMAIL,
  }
  const html = `<!doctype html>\n${renderStaticHtml(
    <WeeklyEmail data={a.data} shareUrl={a.shareUrl} appUrl={a.appUrl} attached={a.attached} ctx={ctx} preheader={a.data.subject} />,
  )}`
  return { subject: a.data.subject, html, text: htmlToText(html) }
}
