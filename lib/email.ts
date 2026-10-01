// Email delivery. Every outbound email goes through this module so the provider
// is swappable in one place. Sending is wired to Resend but stays fully optional:
// with no RESEND_API_KEY / EMAIL_FROM configured, sends are logged no-ops and
// callers fall back to surfacing the invite link in the UI — so the app builds
// and runs identically without an email account, and lights up the moment the
// two env vars exist (plus a verified sending domain on the Resend side).
//
//   RESEND_API_KEY=re_...                     # https://resend.com/api-keys
//   EMAIL_FROM="Verbatim <invites@verbatimintel.com>"   # must be a verified domain

import { Resend } from 'resend'
import { EMAIL } from '@/lib/email/theme'

const apiKey = process.env.RESEND_API_KEY
const from = process.env.EMAIL_FROM
// Instantiated once; null when unconfigured so we cleanly no-op instead of throwing.
const resend = apiKey ? new Resend(apiKey) : null

export interface InviteEmail {
  to: string
  inviteUrl: string
  companyName: string
  invitedByEmail?: string
  /** The inviter's `users.full_name`, when they have one. Preferred over the
   *  address in the body: an invite is from a PERSON, and "Heinrich Viljoen
   *  invited you" is the sentence a stranger can act on. The address is still
   *  carried, as Reply-To, so answering the mail reaches them. */
  invitedByName?: string
}

// Returns whether the email was actually dispatched. False (no provider wired, or
// a send failure) tells callers to fall back to showing the invite link in the UI —
// a failed send must never break invite creation, so errors are swallowed to false.
export async function sendInviteEmail(invite: InviteEmail): Promise<{ sent: boolean }> {
  if (!resend || !from) {
    console.log(
      `[email:stub] invite for "${invite.companyName || 'your team'}" -> ${invite.to}: ${invite.inviteUrl}`,
    )
    return { sent: false }
  }

  const { subject, text, html, replyTo } = renderInviteEmail(invite)

  try {
    // replyTo spread rather than passed as undefined, the shape sendReportEmail
    // and sendLeadEmail already use: a reply goes to the person who invited
    // them, not to the unattended invites@ mailbox the `from` names.
    const { error } = await resend.emails.send({
      from,
      to: invite.to,
      subject,
      text,
      html,
      ...(replyTo ? { replyTo } : {}),
    })
    if (error) {
      console.error(`[email] invite send failed -> ${invite.to}:`, error)
      return { sent: false }
    }
    return { sent: true }
  } catch (err) {
    console.error(`[email] invite send threw -> ${invite.to}:`, err)
    return { sent: false }
  }
}

// Operator alert (run failures). Goes to ALERT_EMAIL — Heinrich, never a
// client. Same optional posture as everything else here: unset var or no
// provider = logged no-op, and a failed alert send must never mask the
// failure it reports, so errors are swallowed to false.
export async function sendAlertEmail(subject: string, text: string): Promise<{ sent: boolean }> {
  const to = process.env.ALERT_EMAIL
  if (!resend || !from || !to) {
    console.log(`[email:stub] alert: ${subject}`)
    return { sent: false }
  }
  try {
    const { error } = await resend.emails.send({ from, to, subject, text })
    if (error) {
      console.error(`[email] alert send failed:`, error)
      return { sent: false }
    }
    return { sent: true }
  } catch (err) {
    console.error(`[email] alert send threw:`, err)
    return { sent: false }
  }
}

export interface LeadEmail {
  name: string
  email: string
  company: string
  interest?: string
}

// Early-access lead from the marketing site's form. Goes to ALERT_EMAIL —
// Heinrich is the whole sales team, and there is no business mailbox yet, so
// operator email is the lead inbox. replyTo is set to the lead so a reply from
// the alert inbox starts the actual conversation.
export async function sendLeadEmail(lead: LeadEmail): Promise<{ sent: boolean }> {
  const to = process.env.ALERT_EMAIL
  if (!resend || !from || !to) {
    console.log(`[email:stub] lead: ${lead.name} <${lead.email}> (${lead.company})`)
    return { sent: false }
  }
  const text = [
    `New early-access request from the marketing site.`,
    ``,
    `Name:    ${lead.name}`,
    `Email:   ${lead.email}`,
    `Company: ${lead.company}`,
    ...(lead.interest ? [``, `What they want to know:`, lead.interest] : []),
  ].join('\n')
  try {
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: lead.email,
      subject: `Verbatim lead: ${lead.company}`,
      text,
    })
    if (error) {
      console.error('[email] lead send failed:', error)
      return { sent: false }
    }
    return { sent: true }
  } catch (err) {
    console.error('[email] lead send threw:', err)
    return { sent: false }
  }
}

export interface ReviewEmail {
  to: string[]
  companyName: string
  reportTitle: string
  /** When the build finished, already formatted for reading. */
  builtOn: string
  studioUrl: string
  /** The review goes to the operator, not the workspace (lib/schedules/members.ts
   *  `reviewAudience`): the email then says which workspace to view first,
   *  because the Studio opens on whichever one the operator last chose. */
  forOperator?: boolean
  /** How many people the report goes to once sent, where known. */
  recipients?: number
  /** Whether there is anything to edit before sending: a report the Studio
   *  edits, yes; an artefact Verbatim writes whole (the weekly read), no. */
  editable?: boolean
  /** What else the Send publishes, for the operator to read first: the
   *  month's long-run read, which Your market prints once this run's weekly
   *  read is sent (fresh review B1). Absent on every other review. */
  alsoPublished?: AlsoPublished | null
}

/**
 * The month's long-run read as the operator's review email carries it: its
 * title ("What holds across August and September"), its lead and each idea's
 * headline and sentences, the writer's words as stored (scrubbed when they
 * were written; no comment's words, no figure). `unread` where the run's
 * long-run read could not be read into the email: the email then says so
 * rather than leave it out, because the Send publishes it either way.
 */
export type AlsoPublished =
  | { title: string; inShort: string; ideas: { headline: string; body: string[] }[] }
  | { unread: true }

/** The section's heading where the long-run read could not be read. */
export const ALSO_PUBLISHED_UNREAD =
  'Also published when you send: the long-run read on Your market, if this update wrote one. It could not be read into this email, so check it before you send.'

/** The review email's "Also published when you send" section, as plain
 *  paragraphs in order (pure, for the test and the text body). */
export function alsoPublishedLines(also: AlsoPublished): { heading: string; lead: string | null; ideas: { headline: string; body: string[] }[] } {
  if ('unread' in also) return { heading: ALSO_PUBLISHED_UNREAD, lead: null, ideas: [] }
  return {
    heading: `Also published when you send: ${also.title}`,
    lead: also.inShort.trim() || null,
    ideas: also.ideas.map((idea, i) => ({ headline: `${i + 1}. ${idea.headline}`, body: idea.body })),
  }
}

/** The lines of the review email's body, in order (pure, for the test). */
export function reviewEmailLines(review: ReviewEmail): { lead: string; steps: string; after: string } {
  const who = review.recipients != null
    ? `the ${review.recipients} ${review.recipients === 1 ? 'recipient' : 'recipients'}`
    : 'the recipients'
  const workspace = review.forOperator && review.companyName
    ? ` In Verbatim, view ${review.companyName} in the workspace switcher first.`
    : ''
  return {
    lead: `${review.reportTitle} was built on ${review.builtOn} from the latest update.`,
    steps: `${review.editable === false ? 'Read it, then send it.' : 'Read it, edit it if anything needs a change, then send it.'}${workspace}`,
    after: `Nothing goes to ${who} until someone presses Send.`,
  }
}

// A report built on a review schedule is waiting for a person. Thin by design:
// nothing from the report's content is in the email — the review IS the read,
// and the body stays free of anything an erasure would have to chase. Same
// optional posture as the rest of this module. ONE exception (fresh review
// B1): the operator's email for a run that also wrote the month's long-run
// read carries that read's own words, because the Send publishes it on Your
// market and the Studio does not show it. They are the writer's sentences,
// never a comment's, so there is still nothing for an erasure to chase.
/** The review email's subject, text and HTML (pure, for the test). */
export function reviewEmailBody(review: ReviewEmail): { subject: string; text: string; html: string } {
  const subject = review.companyName ? `${review.companyName}: ${review.reportTitle} is ready for review` : `${review.reportTitle} is ready for review`
  const lines = reviewEmailLines(review)
  const also = review.alsoPublished ? alsoPublishedLines(review.alsoPublished) : null
  const text = [
    lines.lead,
    ``,
    lines.steps,
    review.studioUrl,
    ``,
    lines.after,
    ...(also
      ? [
        ``,
        also.heading,
        ...(also.lead ? [``, also.lead] : []),
        ...also.ideas.flatMap((idea) => [``, idea.headline, ...idea.body]),
      ]
      : []),
  ].join('\n')
  // Below the button, after a hairline: the long-run read the Send publishes
  // too, for the operator to read before pressing it.
  const alsoHtml = also
    ? `
          <tr><td style="padding-top:24px">
            <div style="border-top:1px solid ${EMAIL.hairline};padding-top:24px">
              <p style="margin:0 0 12px;font-size:15px;font-weight:600;line-height:1.45">${escapeHtml(also.heading)}</p>${also.lead ? `
              <p style="margin:0 0 16px;font-size:14px;line-height:1.55">${escapeHtml(also.lead)}</p>` : ''}${also.ideas.map((idea) => `
              <p style="margin:16px 0 6px;font-size:14px;font-weight:600;line-height:1.45">${escapeHtml(idea.headline)}</p>${idea.body.map((p) => `
              <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:${EMAIL.ink2}">${escapeHtml(p)}</p>`).join('')}`).join('')}
            </div>
          </td></tr>`
    : ''
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:${EMAIL.canvas};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${EMAIL.ink}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
          <tr><td>
            <p style="margin:0 0 16px;font-size:16px;line-height:1.5">
              <strong>${escapeHtml(review.reportTitle)}</strong> is ready for review.
            </p>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:${EMAIL.muted}">
              Built on ${escapeHtml(review.builtOn)} from the latest update. ${escapeHtml(lines.steps)} ${escapeHtml(lines.after)}
            </p>
            <a href="${review.studioUrl}"
               style="display:inline-block;background:${EMAIL.button};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px">
              Open in the Studio
            </a>
          </td></tr>${alsoHtml}
        </table>
      </td></tr>
    </table>
  </body>
</html>`
  return { subject, text, html }
}

export async function sendReviewEmail(review: ReviewEmail): Promise<{ sent: boolean }> {
  if (!resend || !from || review.to.length === 0) {
    console.log(`[email:stub] review "${review.reportTitle}" ready -> ${review.to.join(', ') || '(no members)'}: ${review.studioUrl}`)
    return { sent: false }
  }
  const { subject, text, html } = reviewEmailBody(review)
  try {
    const { error } = await resend.emails.send({ from, to: review.to, subject, text, html })
    if (error) {
      console.error('[email] review send failed:', error)
      return { sent: false }
    }
    return { sent: true }
  } catch (err) {
    console.error('[email] review send threw:', err)
    return { sent: false }
  }
}

export interface EmailAttachment {
  filename: string
  content: Buffer
  contentType?: string
  /** Set for an image referenced inline as `cid:<contentId>` in the HTML. */
  contentId?: string
}

export interface ReportEmail {
  to: string[]
  subject: string
  html: string
  text: string
  /** The PDF and any inline images (Stage 3). Resend caps a message at 40 MB. */
  attachments?: EmailAttachment[]
  replyTo?: string
}

// Sends a periodic (weekly/monthly) report to the configured recipients. Like
// invites, this no-ops (returns sent:false) when Resend isn't configured or there
// are no recipients — so report generation + persistence still succeed without an
// email provider, and the report is simply stored for in-app viewing instead.
export async function sendReportEmail(report: ReportEmail): Promise<{ sent: boolean }> {
  if (!resend || !from || report.to.length === 0) {
    const att = (report.attachments ?? []).map((a) => `${a.filename} (${Math.round(a.content.length / 1024)} KB${a.contentId ? `, cid:${a.contentId}` : ''})`)
    console.log(
      `[email:stub] report "${report.subject}" -> ${report.to.join(', ') || '(no recipients)'}${att.length ? ` · attachments: ${att.join(', ')}` : ''}`,
    )
    return { sent: false }
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to: report.to,
      subject: report.subject,
      text: report.text,
      html: report.html,
      ...(report.replyTo ? { replyTo: report.replyTo } : {}),
      ...(report.attachments?.length
        ? { attachments: report.attachments.map((a) => ({ filename: a.filename, content: a.content, ...(a.contentType ? { contentType: a.contentType } : {}), ...(a.contentId ? { contentId: a.contentId } : {}) })) }
        : {}),
    })
    if (error) {
      console.error('[email] report send failed:', error)
      return { sent: false }
    }
    return { sent: true }
  } catch (err) {
    console.error('[email] report send threw:', err)
    return { sent: false }
  }
}

/** Who the invite says it is from, as the body names them: the person's name
 *  when we have one, else their address, else nobody.
 *
 *  Trailing space and all, because the callers interpolate it straight before
 *  "invited you to join" and the no-inviter case has to close up cleanly. The
 *  HTML side escapes this; the text side must not. */
function inviterPrefix(invite: InviteEmail): string {
  const name = invite.invitedByName?.trim()
  if (name) return `${name} `
  const email = invite.invitedByEmail?.trim()
  return email ? `${email} ` : ''
}

/** The invite email exactly as it would be sent — subject, text, html, the
 *  Reply-To it carries, and the `from` the provider is configured with (null
 *  when Resend is unwired and `sendInviteEmail` is a logged no-op).
 *
 *  Exported so an operator CLI can PRINT the email it is about to send instead
 *  of re-typing the template beside it. Two copies of an email body eventually
 *  disagree, and the copy nobody sends is the one that goes stale. */
export function renderInviteEmail(invite: InviteEmail): {
  subject: string
  text: string
  html: string
  from: string | null
  /** The inviter's address, so a reply reaches the person rather than the
   *  unattended mailbox `from` names. Absent when we don't know it. */
  replyTo?: string
} {
  const workspace = invite.companyName?.trim()
  const inviter = inviterPrefix(invite)
  const replyTo = invite.invitedByEmail?.trim()
  return {
    subject: workspace
      ? `You're invited to ${workspace} on Verbatim`
      : `You're invited to a Verbatim workspace`,
    text: inviteText(invite, workspace, inviter),
    html: inviteHtml(invite, workspace, inviter),
    from: from ?? null,
    ...(replyTo ? { replyTo } : {}),
  }
}

function inviteText(invite: InviteEmail, workspace: string | undefined, inviter: string): string {
  const where = workspace ? `the ${workspace} workspace` : 'a workspace'
  return [
    `${inviter}invited you to join ${where} on Verbatim.`,
    ``,
    `Accept your invite:`,
    invite.inviteUrl,
    ``,
    `This link expires in 7 days. If you weren't expecting this, you can ignore it.`,
  ].join('\n')
}

function inviteHtml(invite: InviteEmail, workspace: string | undefined, inviter: string): string {
  const where = workspace
    ? `the <strong>${escapeHtml(workspace)}</strong> workspace`
    : 'a workspace'
  return `<!doctype html>
<html>
  <body style="margin:0;background:${EMAIL.canvas};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${EMAIL.ink}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
          <tr><td>
            <p style="margin:0 0 16px;font-size:16px;line-height:1.5">
              ${escapeHtml(inviter)}invited you to join ${where} on <strong>Verbatim</strong>.
            </p>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:${EMAIL.muted}">
              Verbatim is a consumer-intelligence platform. Sign in to see your team's dashboards.
            </p>
            <a href="${invite.inviteUrl}"
               style="display:inline-block;background:${EMAIL.button};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px">
              Accept invite
            </a>
            <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:${EMAIL.faint};word-break:break-all">
              Or paste this link into your browser:<br>${invite.inviteUrl}
            </p>
            <p style="margin:16px 0 0;font-size:12px;color:${EMAIL.faint}">
              This link expires in 7 days. If you weren't expecting this, you can ignore it.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
