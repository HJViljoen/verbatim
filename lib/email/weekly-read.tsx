import { WeeklyReadEmail } from '../../components/email/weekly-read'
import { renderStaticHtml } from './render-html'
import { htmlToText } from './text'
import { isWeeklyV3, type WeeklyReadSnapshotData } from '../reports/weekly-read-build'

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
 * THE SHARE LINK IS "READ THIS WEEK IN FULL" (review M3): the report's own
 * web page, findings in full, until the new This week page ships. Where there
 * is no link (a test send, a preview) the row is not printed. No share button
 * and no attachment line: the approved design ends on "Open Verbatim" and
 * "Who gets this"; `attached` is accepted so every artefact's renderer has one
 * call shape, and deliberately not printed.
 */

export interface RenderWeeklyReadArgs {
  data: WeeklyReadSnapshotData
  shareUrl?: string | null
  appUrl: string
  attached?: boolean
  /** The mark's address; absolute by default (`${appUrl}/brand/…`). */
  markSrc?: string
  /** Level 1's mark on its ink tile; absolute by default. */
  markOnInkSrc?: string
  /** The workspace's market is medical (`printsMedicalLine(clientId)`): the
   *  Content line prints the medical team line even where the snapshot froze
   *  none. */
  medical?: boolean
}

export function renderWeeklyReadEmail(a: RenderWeeklyReadArgs): { subject: string; html: string; text: string } {
  const preheader = a.data.subject.replace(/^[^:]*:\s*/, '')
  const html = `<!doctype html>\n${renderStaticHtml(<WeeklyReadEmail data={a.data} appUrl={a.appUrl} markSrc={a.markSrc} markOnInkSrc={a.markOnInkSrc} fullUrl={a.shareUrl ?? null} preheader={preheader} medical={a.medical ?? false} />)}`
  // Version 3's rows are links that wrap their eyebrow, name and figure
  // (H7-Email-Weekly-Alt): its text keeps each on its own line. Versions 1
  // and 2 read as they always have (lib/test/weekly-read-golden/).
  return { subject: a.data.subject, html, text: htmlToText(html, { linkBlocks: isWeeklyV3(a.data) }) }
}
