'use client'

import { useId, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import { deleteSchedule, saveSchedule } from '@/app/dashboard/studio/actions'
import { CADENCES, type ScheduleRow } from '@/lib/schedules/types'
import { splitRecipients } from '@/lib/schedules/validate'
import { SCHEDULE_RECIPIENTS_MAX } from '@/lib/config'
import { PUBLISHED_NOT_EMAILED } from '@/lib/schedules/platform-state'
import { sendsWeeklyRead } from '@/lib/schedules/artefact'
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SM, INPUT, LBL } from '@/components/v2/look'
import { cn } from '@/lib/utils'

// A report's sending (Stage 3, reshaped 2026-08-30): who gets it, after which
// updates, with the PDF and a share link. One schedule per report; saved
// through a server action (owner/admin). "Send me a test" and "Send now" go
// through the send route, the same path the update takes on Sunday. No
// browser dialogs: a destructive click asks again inline.
//
// SINCE THE AUDIT DESIGN (7 Nov, Studio.dc.html): sentence-case labels over
// the kit's 40px fields, 18px checkboxes, Save the yellow button and the
// rest white (while a build waits for review, Send it is the yellow one and
// Save turns white: one yellow at a time), the lines in words with no " · ".

interface Props {
  /** The workspace's own template this schedule sends, or null for a schedule
   *  that sends an ARTEFACT (the weekly report) and has no `reports` row. */
  reportId: string | null
  /** The starter key an artefact schedule is stored under. Saving used to post
   *  `starterKey: null` unconditionally, so the form could not express one at
   *  all: the first save after `migrate-schedule-keys --apply` would have
   *  emptied the key and left the schedule sending nothing this build knows. */
  starterKey?: string | null
  reportTitle: string
  /** The report's schedule, or null when it is not sent to anyone yet. */
  schedule: ScheduleRow | null
  canManage: boolean
  userEmail: string | null
  /** Whether the workspace has a completed update to send. */
  sendable: boolean
  /** A build waiting for a person: any member may read it and send it. */
  /** A build waiting for a person. `stalled` = a delivery that died partway
   *  and whose claim has gone cold; the same Send press picks it up. */
  ready?: { id: string; subject: string | null; readyAt: string | null; error: string | null; stalled?: boolean; publishedAt?: string | null } | null
  /** A written report is edited block by block before it goes; an arranged one is not. */
  isDocument?: boolean
  /** Who gets the review email (lib/schedules/members.ts `reviewAudience`):
   *  the workspace's members, or the operator where the Studio is hidden from
   *  the tenant or its sending is locked. The form says which. */
  reviewer?: 'operator' | 'members'
}

const inputCls = cn(INPUT, 'w-full text-[14.5px] disabled:opacity-60 max-sm:h-11')
const labelCls = LBL
const btnPrimary = cn(BTN_PRIMARY, 'max-sm:h-11')
const btnQuiet = cn(BTN_SECONDARY, 'max-sm:h-11')
const btnSmall = cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')
const QUIET_TEXT = 'min-h-9 text-[13px] text-muted-foreground underline decoration-control underline-offset-4 hover:text-foreground max-sm:min-h-11'
const checkCls = 'size-[18px] accent-foreground'

export function ScheduleForm({ reportId, starterKey = null, reportTitle, schedule, canManage, userEmail, sendable, ready, isDocument, reviewer = 'members' }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [cadence, setCadence] = useState<ScheduleRow['cadence']>(schedule?.cadence ?? 'every_update')
  const cadenceHelpId = useId()
  const [recipients, setRecipients] = useState(schedule?.recipients.join(', ') ?? '')
  const [attachPdf, setAttachPdf] = useState(schedule?.attach_pdf ?? true)
  const [shareDays, setShareDays] = useState(schedule ? (schedule.share_days == null ? 'never' : String(schedule.share_days)) : '30')
  const [active, setActive] = useState(schedule?.active ?? true)
  const [review, setReview] = useState(schedule?.review ?? false)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [confirm, setConfirm] = useState<'send' | 'delete' | 'deliver' | 'publish' | null>(null)
  const [preview, setPreview] = useState(false)
  // THE HELD BUILD'S OWN EMAIL. "Read the email" on a build waiting for review
  // used to open the dry preview at today's data, which rebuilds from scratch;
  // the reviewer must read the email that Send will deliver, so it opens the
  // send's own snapshot (`?send=`), the "email as sent" path.
  const [heldPreview, setHeldPreview] = useState(false)
  const [busy, setBusy] = useState<'test' | 'now' | 'deliver' | 'publish' | null>(null)

  const parsedRecipients = splitRecipients(recipients)
  const tooMany = parsedRecipients.length > SCHEDULE_RECIPIENTS_MAX
  // A CADENCE THIS FORM CANNOT EXPRESS MAKES IT READ-ONLY, rather than letting
  // it post one and be refused. Settings > Reports can create a quarterly row —
  // M8's CHECK accepts it so the recipient table can name a quarterly review —
  // and CADENCES deliberately does not offer it, because nothing builds one
  // until WP20. The select then matched no option, the submit posted
  // `cadence as 'every_update' | 'monthly'` (a cast that lies about the value),
  // and `scheduleInputSchema` refused it with a raw Zod sentence on a client
  // screen. Nothing is lost: such a row is stored switched off, so there is
  // nothing to turn on until its builder lands.
  const unofferedCadence = !CADENCES.some((c) => c.key === cadence)
  const readOnly = !canManage || unofferedCadence

  const save = () => start(async () => {
    const r = await saveSchedule({
      id: schedule?.id ?? null,
      input: {
        name: reportTitle,
        // Exactly one of the two, and the one this schedule already is: the
        // input schema refuses both and refuses neither.
        starterKey: reportId ? null : starterKey,
        reportId,
        // Narrowed to what this form offers, and the form is read-only when the
        // stored value is not one of them (see `unofferedCadence`), so this is
        // a narrowing and no longer a claim about a value it has not checked.
        cadence: cadence === 'monthly' ? 'monthly' : 'every_update',
        recipients: parsedRecipients,
        attachPdf,
        shareDays: shareDays === 'never' ? null : (Number(shareDays) as 7 | 30 | 90),
        active,
        review,
      },
    })
    setStatus(r)
    if (r.ok) router.refresh()
  })

  // The weekly read: every build goes in the client's past issues as soon as
  // it is built (5 Oct); review holds the email alone.
  const weeklyRead = sendsWeeklyRead({ starter_key: schedule?.starter_key ?? starterKey, artefact: schedule?.artefact ?? null })

  const send = async (mode: 'test' | 'now' | 'deliver') => {
    if (!schedule) return
    setBusy(mode); setConfirm(null); setStatus(null)
    try {
      const body = mode === 'deliver' ? { mode, sendId: ready?.id } : { mode }
      const r = await fetch(`/api/schedules/${schedule.id}/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = (await r.json().catch(() => ({}))) as { status?: string; error?: string; to?: string | string[]; subject?: string; notified?: boolean }
      if (!r.ok) setStatus({ ok: false, message: j.error ?? 'Could not send. Try again.' })
      else if (j.status === 'sent') setStatus({ ok: true, message: mode === 'test' ? `Sent to ${j.to}: "${j.subject}".` : `Sent to ${Array.isArray(j.to) ? j.to.length : 0} people: "${j.subject}".` })
      else if (j.status === 'enqueued') setStatus({ ok: true, message: 'Writing it now. It goes out when it is done, or comes back here for review.' })
      else if (j.status === 'ready') setStatus({ ok: true, message: weeklyRead
        ? `Built, and in the client's past issues${j.notified ? '; the review email went' : ''}. Nobody on the list was emailed: use Send it above to email them.`
        : `Built and waiting for review${j.notified ? '; everyone in this workspace was emailed' : ''}. Use Send it above when you have read it.` })
      else if (j.status === 'already_sent') setStatus({ ok: true, message: 'This update already went out to this list.' })
      else if (j.status === 'skipped') setStatus({ ok: false, message: j.error ?? 'Nothing was sent.' })
      else setStatus({ ok: false, message: j.error ?? 'Could not send.' })
      router.refresh()
    } catch {
      setStatus({ ok: false, message: 'Could not send. Try again.' })
    } finally {
      setBusy(null)
    }
  }

  // ON THE PLATFORM, NOT EMAILED (the backfill, 1 Oct; lib/schedules/publish.ts):
  // the operator adds a held weekly build to the client's past issues without
  // emailing anyone. Since 5 Oct every weekly read the update (or Send now)
  // builds is put there by itself (lib/schedules/run.ts), so this button is
  // for a build held before then, or one whose publishing failed. Its reads are
  // on the pages already, from the run on. Send still emails it, as before.
  const publish = async () => {
    if (!schedule || !ready) return
    setBusy('publish'); setConfirm(null); setStatus(null)
    try {
      const r = await fetch(`/api/schedules/${schedule.id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sendId: ready.id }) })
      const j = (await r.json().catch(() => ({}))) as { status?: string; error?: string }
      if (!r.ok) setStatus({ ok: false, message: j.error ?? 'Could not publish it. Try again.' })
      else if (j.status === 'published') setStatus({ ok: true, message: 'On the platform. Nobody was emailed.' })
      else if (j.status === 'already') setStatus({ ok: true, message: 'It is in the past issues already.' })
      else setStatus({ ok: false, message: j.error ?? 'Could not publish it.' })
      router.refresh()
    } catch {
      setStatus({ ok: false, message: 'Could not publish it. Try again.' })
    } finally {
      setBusy(null)
    }
  }

  const readyOn = ready?.readyAt ? new Date(ready.readyAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : null
  const published = Boolean(ready?.publishedAt) && !ready?.stalled
  const canPublish = Boolean(ready) && !ready?.stalled && !published && !isDocument
  // One yellow at a time: a build waiting for review makes Send it the act.
  const sendIsPrimary = Boolean(ready && schedule)

  return (
    <div className="flex flex-col gap-4">
      {ready && schedule && (
        <div className="flex flex-col gap-2 rounded-[10px] bg-inner px-5 py-4">
          <p className="m-0 text-[15px] font-semibold text-foreground">
            {ready.stalled ? 'Stopped partway through sending' : `${published ? PUBLISHED_NOT_EMAILED.split(' \u00b7 ').join(', ') : 'Ready for review'}${readyOn ? `, built ${readyOn}` : ''}`}
          </p>
          <p className="m-0 text-[14px] leading-[1.5] text-secondary-foreground">
            {ready.stalled
              ? `The report is built, and nothing was recorded as sent. It stopped partway, so it is possible some of the ${schedule.recipients.length} ${schedule.recipients.length === 1 ? 'person' : 'people'} already have it; sending it again goes to all of them. Anyone here can send it.`
              : published
                ? schedule.recipients.length === 0
                  ? 'It is in the client\'s past issues, and nobody was emailed. Nobody is on the list below: add someone there to email it.'
                  : `It is in the client's past issues, and nobody was emailed. Send it to email it to ${schedule.recipients.length} ${schedule.recipients.length === 1 ? 'person' : 'people'} as well.`
                : `${isDocument ? 'Read it, change anything that needs changing, then send it' : 'Read it, then send it'} to ${schedule.recipients.length} ${schedule.recipients.length === 1 ? 'person' : 'people'}.${reviewer === 'members' ? ' Anyone here can send it.' : ''}${canPublish ? ' Or add it to the past issues without emailing anyone.' : ''}`}
          </p>
          {ready.error && <p className="m-0 text-[14px] text-caution">The last attempt did not go: {ready.error}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {confirm === 'deliver' ? (
              <span className="inline-flex flex-wrap items-center gap-2 text-[14px]">
                Send it to {schedule.recipients.length} {schedule.recipients.length === 1 ? 'person' : 'people'} now?
                <button type="button" onClick={() => send('deliver')} className={btnPrimary}>Yes, send</button>
                <button type="button" onClick={() => setConfirm(null)} className={QUIET_TEXT}>Cancel</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirm('deliver')} disabled={busy != null || schedule.recipients.length === 0} className={btnPrimary}>
                {busy === 'deliver' ? <><LoaderCircle className="mr-1.5 size-3 animate-spin" aria-hidden /> Sending…</> : 'Send it'}
              </button>
            )}
            {isDocument
              ? <Link href={`/dashboard/studio/edit/${reportId}`} className={btnQuiet}>Read and edit it</Link>
              : <button type="button" onClick={() => setHeldPreview((v) => !v)} className={btnQuiet}>{heldPreview ? 'Hide the email' : 'Read the email'}</button>}
            {canPublish && (confirm === 'publish' ? (
              <span className="inline-flex flex-wrap items-center gap-2 text-[14px]">
                Add it to the past issues without emailing anyone?
                <button type="button" onClick={publish} className={btnQuiet}>Yes, add it</button>
                <button type="button" onClick={() => setConfirm(null)} className={QUIET_TEXT}>Cancel</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirm('publish')} disabled={busy != null} className={btnQuiet}>
                {busy === 'publish' ? <><LoaderCircle className="mr-1.5 size-3 animate-spin" aria-hidden /> Adding…</> : 'Add to past issues (not emailed)'}
              </button>
            ))}
          </div>
          {heldPreview && !isDocument && (
            <div className="mt-2 flex flex-col gap-1">
              <span className={labelCls}>The email as it will go out</span>
              <iframe src={`/api/schedules/${schedule.id}/preview?send=${ready.id}`} sandbox="allow-popups allow-popups-to-escape-sandbox" title="The email waiting for review" className="h-[720px] w-full rounded-[8px] bg-tile ring-1 ring-border" />
            </div>
          )}
        </div>
      )}
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>To</span>
        <textarea value={recipients} disabled={readOnly} rows={3} onChange={(e) => setRecipients(e.target.value)} className={cn(inputCls, 'h-auto resize-y px-3 py-2.5 leading-[1.5]')} placeholder="one@company.com, two@company.com" />
        <span className={`text-[13px] ${tooMany ? 'text-caution' : 'text-muted-foreground'}`}>
          {parsedRecipients.length} address{parsedRecipients.length === 1 ? '' : 'es'}. Commas, spaces or new lines between them, at most {SCHEDULE_RECIPIENTS_MAX}.
        </span>
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        {/* The option says its name; what it means is the line under the
            field, in full at every width (a closed select cannot wrap, and
            at 390 "Every update: Goes out after each scheduled update." was
            cut mid-word). */}
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>When</span>
            <select value={cadence} disabled={readOnly} onChange={(e) => setCadence(e.target.value as ScheduleRow['cadence'])} aria-describedby={cadenceHelpId} className={inputCls}>
              {CADENCES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <span id={cadenceHelpId} data-cadence-help="" className="text-[13px] leading-[1.45] text-muted-foreground">{CADENCES.find((c) => c.key === cadence)?.help}</span>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Share link in the email</span>
          <select value={shareDays} disabled={readOnly} onChange={(e) => setShareDays(e.target.value)} className={inputCls}>
            <option value="7">Opens for 7 days</option>
            <option value="30">Opens for 30 days</option>
            <option value="90">Opens for 90 days</option>
            <option value="never">Never expires</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px]">
        <label className="flex min-h-9 items-center gap-2 max-sm:min-h-11"><input type="checkbox" checked={attachPdf} disabled={readOnly} onChange={(e) => setAttachPdf(e.target.checked)} className={checkCls} /> Attach the PDF</label>
        <label className="flex min-h-9 items-center gap-2 max-sm:min-h-11"><input type="checkbox" checked={active} disabled={readOnly} onChange={(e) => setActive(e.target.checked)} className={checkCls} /> Sending is on</label>
        <label className="flex min-h-9 items-center gap-2 max-sm:min-h-11"><input type="checkbox" checked={review} disabled={readOnly} onChange={(e) => setReview(e.target.checked)} className={checkCls} /> Review before sending</label>
      </div>
      {review && (
        <p className="m-0 -mt-1 text-[14px] leading-[1.5] text-muted-foreground">
          {weeklyRead ? 'Each issue is in the client\'s past issues as soon as it is built; only the email waits. ' : ''}
          {reviewer === 'operator'
            ? 'The review email goes to Heinrich at Verbatim, not to this workspace: he reads it and presses Send. Nothing goes to the list above until then.'
            : 'Everyone in this workspace gets an email when it is ready; any of them can read, edit and send it. Nothing goes to the list above until then.'}
        </p>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
          <button type="button" onClick={save} disabled={pending || tooMany} className={sendIsPrimary ? btnQuiet : btnPrimary}>
            {pending ? <><LoaderCircle className="mr-1.5 size-3 animate-spin" aria-hidden /> Saving…</> : schedule ? 'Save' : 'Start sending'}
          </button>
          {schedule && (
            <>
              <button type="button" onClick={() => send('test')} disabled={busy != null || !sendable || !userEmail} title={userEmail ? `Sends to ${userEmail} only` : undefined} className={btnQuiet}>
                {busy === 'test' ? <><LoaderCircle className="mr-1.5 size-3 animate-spin" aria-hidden /> Sending…</> : 'Send me a test'}
              </button>
              {confirm === 'send' ? (
                <span className="inline-flex flex-wrap items-center gap-2 text-[14px]">
                  Send the latest update to {schedule.recipients.length} {schedule.recipients.length === 1 ? 'person' : 'people'} now?
                  <button type="button" onClick={() => send('now')} className={btnQuiet}>Yes, send</button>
                  <button type="button" onClick={() => setConfirm(null)} className={QUIET_TEXT}>Cancel</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirm('send')} disabled={busy != null || !sendable || schedule.recipients.length === 0} className={btnQuiet}>
                  {busy === 'now' ? <><LoaderCircle className="mr-1.5 size-3 animate-spin" aria-hidden /> Sending…</> : 'Send now'}
                </button>
              )}
              <button type="button" onClick={() => setPreview((v) => !v)} className={btnQuiet}>{preview ? 'Hide the email' : 'Preview the email'}</button>
              {schedule.is_default ? (
                <span className="ml-auto text-[13.5px] text-muted-foreground">The workspace digest can be switched off, not removed.</span>
              ) : confirm === 'delete' ? (
                <form action={deleteSchedule} className="ml-auto inline-flex flex-wrap items-center gap-2 text-[14px]">
                  <input type="hidden" name="id" value={schedule.id} />
                  Stop sending this report and forget its list?
                  <button type="submit" className={cn(btnSmall, 'border-negative text-negative')}>Yes</button>
                  <button type="button" onClick={() => setConfirm(null)} className={QUIET_TEXT}>Cancel</button>
                </form>
              ) : (
                <button type="button" onClick={() => setConfirm('delete')} className={cn(QUIET_TEXT, 'ml-auto')}>Remove the sending</button>
              )}
            </>
          )}
        </div>
      )}
      {!canManage && schedule && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
          <button type="button" onClick={() => setPreview((v) => !v)} className={btnQuiet}>{preview ? 'Hide the email' : 'Preview the email'}</button>
          <span className="text-[14px] text-muted-foreground">An owner or admin changes who gets this.</span>
        </div>
      )}
      {status && <p className={`m-0 text-[14px] ${status.ok ? 'text-secondary-foreground' : 'text-caution'}`} aria-live="polite">{status.message}</p>}
      {!sendable && canManage && <p className="m-0 text-[14px] text-muted-foreground">Sending and previewing start with your first completed update.</p>}

      {preview && schedule && (
        <div className="flex flex-col gap-1">
          <span className={labelCls}>The email, at today’s data</span>
          <iframe src={`/api/schedules/${schedule.id}/preview`} sandbox="allow-popups allow-popups-to-escape-sandbox" title="Email preview" className="h-[720px] w-full rounded-[8px] bg-tile ring-1 ring-border" />
        </div>
      )}
    </div>
  )
}
