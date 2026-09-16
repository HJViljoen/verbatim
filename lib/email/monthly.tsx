import { MonthlyEmail } from '../../components/email/monthly'
import { renderStaticHtml } from './render-html'
import { htmlToText } from './text'
import { EMAIL } from './theme'
import type { BlockContext } from '../blocks/types'
import type { MonthlySnapshotData } from '../reports/monthly-build'

/**
 * Rendering the monthly report (Phase 1 WP18): a hydrated snapshot → the
 * subject, the HTML and its plain-text mirror. Runs in a route handler or a
 * script, never in a page and never inside an Inngest step.
 *
 * THE SUBJECT IS FROZEN WITH THE READING. `data.subject` was composed when the
 * snapshot was taken, so the line in the inbox and the line on the artefact
 * cannot describe two different months — which is what "the email as sent"
 * re-rendering from the snapshot has to be able to promise.
 *
 * ONE BLOCK DRAWS A CHART AND IT STILL ASKS FOR NO PNG. MR3's per-row line is
 * an SVG on screen and on paper; in the email the same row prints its readings
 * in words ("Jul 5.1% → Aug 6.8% → Sep 9.4%"), which is what the mock does too.
 * So this email asks for no image at all, the runner renders one job for a
 * monthly send rather than nine, and a client that blocks images loses no
 * number. (There was a `MONTHLY_IMAGE_BLOCKS: []` here saying so; an empty list
 * nothing reads is a claim with no reader, and the runner's own branch —
 * `document || arranged ? [] : EMAIL_IMAGE_TILES…` in lib/schedules/deliver.ts
 * — is where the decision is actually taken.)
 */

export interface RenderMonthlyArgs {
  data: MonthlySnapshotData
  shareUrl: string | null
  appUrl: string
  attached: boolean
  /** blockKey → `cid:` URL of an inline image the runner attached. */
  images?: Record<string, string>
}

export function renderMonthlyEmail(a: RenderMonthlyArgs): { subject: string; html: string; text: string } {
  const ctx: BlockContext = {
    appUrl: a.appUrl,
    image: (key) => a.images?.[key] ?? null,
    theme: EMAIL,
  }
  const html = `<!doctype html>\n${renderStaticHtml(
    <MonthlyEmail data={a.data} shareUrl={a.shareUrl} appUrl={a.appUrl} attached={a.attached} ctx={ctx} preheader={a.data.subject} />,
  )}`
  return { subject: a.data.subject, html, text: htmlToText(html) }
}
