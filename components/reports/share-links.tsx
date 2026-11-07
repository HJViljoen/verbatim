'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import { revokeShareLink } from '@/app/dashboard/studio/actions'
import { BTN_SECONDARY, BTN_SM, EMPTY, INPUT, LBL, STACK, STACK_CELL, STACK_HEAD, STACK_ROW, TBL, TD, TH } from '@/components/v2/look'
import { cn } from '@/lib/utils'

export interface ShareLinkView {
  id: string
  url: string | null
  title: string
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  protected: boolean
  views: number
  lastViewedAt: string | null
  buildAt: string
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Create a link to the latest build; list every link with its views; revoke.
 *  Since the audit design (7 Nov, Studio.dc.html): labelled Expires and
 *  Password fields, Create link the white button (the workbench's one yellow
 *  is Save), and the links a table (Link, Build of, Made, Expires, Views, the
 *  actions), each row a block on a phone. */
export function ShareLinks({ snapshotId, links }: { snapshotId: string | null; links: ShareLinkView[] }) {
  const router = useRouter()
  const [days, setDays] = useState<'7' | '30' | '90' | 'none'>('30')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<{ url: string; protected: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function create() {
    if (!snapshotId) return
    setBusy(true); setError(null); setMade(null)
    try {
      const r = await fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ snapshotId, expiresDays: days === 'none' ? null : Number(days), password: password || undefined }) })
      const j = (await r.json().catch(() => ({}))) as { url?: string; protected?: boolean; error?: string }
      if (!r.ok || !j.url) { setError(j.error ?? 'Could not create the link. Try again.'); return }
      setMade({ url: j.url, protected: Boolean(j.protected) })
      setPassword('')
      router.refresh()
    } catch {
      setError('Could not create the link. Try again.')
    } finally {
      setBusy(false)
    }
  }
  async function copy(url: string, id: string) {
    try { await navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(null), 1500) } catch { /* clipboard blocked: the URL is on screen */ }
  }

  const LINK = 'font-medium text-foreground underline decoration-control underline-offset-4 hover:decoration-foreground'
  return (
    <div className="flex flex-col gap-3 text-[14.5px]">
      {snapshotId ? (
        <div className="flex flex-col gap-3 rounded-[10px] bg-inner px-5 py-[18px]">
          <span className={LBL}>New link to the latest build</span>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-secondary-foreground">Expires</span>
              <select value={days} onChange={(e) => setDays(e.target.value as typeof days)} className={cn(INPUT, 'w-[150px] max-sm:h-11')}>
                <option value="7">in 7 days</option><option value="30">in 30 days</option><option value="90">in 90 days</option><option value="none">never</option>
              </select>
            </label>
            <label className="flex min-w-0 flex-[0_1_260px] flex-col gap-1.5">
              <span className="text-[13px] text-secondary-foreground">Password (optional)</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" className={cn(INPUT, 'w-full max-sm:h-11')} />
            </label>
            <button type="button" onClick={create} disabled={busy} className={cn(BTN_SECONDARY, 'max-sm:h-11')}>
              {busy && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />} Create link
            </button>
          </div>
          {made && (
            <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1" aria-live="polite">
              <a href={made.url} target="_blank" rel="noopener" className={cn(LINK, 'break-all')}>{made.url}</a>
              <button type="button" onClick={() => copy(made.url, 'new')} className={cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>{copied === 'new' ? 'Copied' : 'Copy'}</button>
              {made.protected && <span className="text-muted-foreground">Password set: send it separately.</span>}
            </p>
          )}
          {error && <p className="m-0 text-caution" aria-live="polite">{error}</p>}
          <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">Anyone with the link can read this build, no account needed. Revoke any time.</p>
        </div>
      ) : (
        <p className={cn(EMPTY, 'm-0')}>Build the report first; a link points at a build.</p>
      )}
      {links.length > 0 && (
        <table className={cn(TBL, STACK, 'text-[14.5px]')}>
          <thead className={STACK_HEAD}>
            <tr>
              <th scope="col" className={TH}>Link</th>
              <th scope="col" className={TH}>Build of</th>
              <th scope="col" className={TH}>Made</th>
              <th scope="col" className={TH}>Expires</th>
              <th scope="col" className={TH}>Views</th>
              <th scope="col" className={cn(TH, 'pr-0 text-right')}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className={STACK}>
            {links.map((l) => {
              const dead = Boolean(l.revokedAt) || (l.expiresAt ? new Date(l.expiresAt).getTime() <= Date.now() : false)
              return (
                <tr key={l.id} className={cn(STACK_ROW, dead && 'text-muted-foreground')}>
                  <td className={cn(TD, STACK_CELL, 'max-w-[260px]')}>
                    {l.url && !dead
                      ? <a href={l.url} target="_blank" rel="noopener" className={cn(LINK, 'break-all')}>{l.url.replace(/^https?:\/\//, '')}</a>
                      : <span>{l.revokedAt ? 'Withdrawn' : 'Expired'}</span>}
                    {l.protected ? <span className="block text-[13px] text-muted-foreground">Password set</span> : null}
                  </td>
                  <td className={cn(TD, STACK_CELL)}><span className="sm:hidden">Build of </span>{fmt(l.buildAt)}</td>
                  <td className={cn(TD, STACK_CELL)}><span className="sm:hidden">Made </span>{fmt(l.createdAt)}</td>
                  <td className={cn(TD, STACK_CELL)}>{l.expiresAt ? <><span className="sm:hidden">Expires </span>{fmtDay(l.expiresAt)}</> : 'No expiry'}</td>
                  <td className={cn(TD, STACK_CELL, 'tabular-nums')}>
                    {l.views} view{l.views === 1 ? '' : 's'}
                    {l.lastViewedAt ? <span className="block text-[13px] text-muted-foreground">last {fmt(l.lastViewedAt)}</span> : null}
                  </td>
                  <td className={cn(TD, STACK_CELL, 'pr-0 text-right')}>
                    {!dead ? (
                      <span className="inline-flex flex-wrap justify-end gap-2 max-sm:justify-start">
                        {l.url ? <button type="button" onClick={() => copy(l.url!, l.id)} className={cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>{copied === l.id ? 'Copied' : 'Copy'}</button> : null}
                        <form action={revokeShareLink}><input type="hidden" name="id" value={l.id} /><button type="submit" className={cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>Revoke</button></form>
                      </span>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
