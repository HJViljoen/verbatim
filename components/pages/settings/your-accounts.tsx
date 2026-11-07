'use client'

import { useActionState, useState } from 'react'
import { Card, CardTitle } from '@/components/pages/studio/ui'
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SM, INPUT } from '@/components/v2/look'
import { cn } from '@/lib/utils'
import { saveWords } from '@/lib/pages/settings-words'
import { TENANT_LOCK_REFUSAL } from '@/lib/tenant-locks'
import type { SettingsFormState } from '@/app/dashboard/settings/actions'

// "Your accounts" (Page-Settings artboard): the workspace's own Instagram,
// TikTok and YouTube, kept apart from what the market says. Edit opens the
// three handles in place.
//
// SINCE THE AUDIT DESIGN (7 Nov, Settings.dc.html): a `<dl>`, each platform
// beside its handle in ink, never mono (`mono` is carried and not drawn); Edit
// the white button with no icon, Save the yellow one.

export interface OwnAccountView {
  platform: string
  value: string
  mono: boolean
}

const FIELDS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
] as const

const initial: SettingsFormState = { ok: false, message: '' }

export function YourAccounts({
  rows, handles, canEdit, action,
}: {
  rows: readonly OwnAccountView[]
  handles: Record<string, string>
  canEdit: boolean
  action: (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>
}) {
  const [editing, setEditing] = useState(false)
  // A save that landed closes the fields (set in the action, not an effect).
  const [state, run, pending] = useActionState(async (prev: SettingsFormState, fd: FormData) => {
    const out = await action(prev, fd)
    if (out.ok) setEditing(false)
    return out
  }, initial)
  const words = saveWords(state, [TENANT_LOCK_REFUSAL.tracking])

  if (!canEdit && rows.length === 0) return null
  return (
    <Card className="p-[26px] max-sm:p-[18px]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle>Your accounts</CardTitle>
          <p className="m-0 mt-1.5 text-[15px] leading-[1.55] text-secondary-foreground">Your own posts, kept apart from what your market says.</p>
        </div>
        {canEdit && !editing ? (
          <button type="button" onClick={() => setEditing(true)} className={cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>Edit</button>
        ) : null}
      </div>
      {editing ? (
        <form action={run} className="mt-[18px] flex flex-col">
          {FIELDS.map((f) => (
            <div key={f.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-track py-2.5">
              <label htmlFor={`own-${f.key}`} className="text-[15px] font-semibold">{f.label}</label>
              <input
                id={`own-${f.key}`}
                name={f.key}
                defaultValue={handles[f.key] ? (f.key === 'youtube' ? handles[f.key] : `@${handles[f.key]}`) : ''}
                placeholder={f.key === 'youtube' ? '@handle or channel id' : '@handle'}
                className={cn(INPUT, 'w-[240px] max-w-full max-sm:h-11')}
              />
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 border-t border-track pt-4">
            <button type="button" onClick={() => setEditing(false)} className={cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>Cancel</button>
            <button type="submit" disabled={pending} className={cn(BTN_PRIMARY, BTN_SM, 'max-sm:h-11')}>{pending ? 'Saving' : 'Save'}</button>
          </div>
        </form>
      ) : rows.length > 0 ? (
        <dl className="m-0 mt-[18px] text-[15px]">
          {rows.map((r) => (
            <div key={r.platform} className="flex justify-between gap-4 border-t border-track py-[13px] last:pb-0">
              <dt className="font-semibold">{r.platform}</dt>
              <dd className="m-0 min-w-0 break-all text-right">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {words ? <p role="status" className={cn('m-0 mt-3 text-[13px] leading-[1.45]', state.ok ? 'text-muted-foreground' : 'text-caution')}>{words}</p> : null}
    </Card>
  )
}
