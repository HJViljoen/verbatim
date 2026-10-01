import { WeeklyReadEmail } from '../../components/email/weekly-read'
import { renderStaticHtml } from './render-html'
import { htmlToText } from './text'
import type { WeeklyReadSnapshotData } from '../reports/weekly-read-build'

/**
 * Rendering the weekly read (artefact `weekly_read`): a hydrated snapshot (the
 * quotes' words resolved) → the subject, the HTML and its plain-text mirror.
 * Runs in a route handler or a script, never in a page and never inside an
 * Inngest step (react-dom/server is loaded at runtime by render-html).
 *
 * THE SUBJECT IS FROZEN WITH THE READ (`data.subject`), so the inbox line and
 * the report cannot describe two different weeks, and "the email as sent"
 * re-renders to the same line.
 *
 * NO SHARE BUTTON AND NO ATTACHMENT LINE. The approved design ends on "Open
 * Verbatim" and "Who gets this"; the email IS the report. `shareUrl` and
 * `attached` are accepted so every artefact's renderer has one call shape, and
 * deliberately not printed.
 */

export interface RenderWeeklyReadArgs {
  data: WeeklyReadSnapshotData
  shareUrl?: string | null
  appUrl: string
  attached?: boolean
  /** The mark's address; absolute by default (`${appUrl}/brand/…`). */
  markSrc?: string
}

export function renderWeeklyReadEmail(a: RenderWeeklyReadArgs): { subject: string; html: string; text: string } {
  const preheader = a.data.subject.replace(/^[^:]*:\s*/, '')
  const html = `<!doctype html>\n${renderStaticHtml(<WeeklyReadEmail data={a.data} appUrl={a.appUrl} markSrc={a.markSrc} preheader={preheader} />)}`
  return { subject: a.data.subject, html, text: htmlToText(html) }
}
