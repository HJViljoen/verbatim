'use client'

import { useActionState, useState } from 'react'
import { AtSign, Pencil } from 'lucide-react'
import { buttonClass, Card, CardTitle } from '@/components/pages/studio/ui'
import { saveWords } from '@/lib/pages/settings-words'
import { TENANT_LOCK_REFUSAL } from '@/lib/tenant-locks'
import type { SettingsFormState } from '@/app/dashboard/settings/actions'

// "Your accounts" (Page-Settings artboard): the workspace's own Instagram,
// TikTok and YouTube, kept apart from what the market says. Edit opens the
// three handles in place.

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
    <Card className="gap-3.5 px-[30px] pt-[26px] pb-3.5">
      <div className="flex items-center justify-between gap-3">
        <CardTitle icon={AtSign}>Your accounts</CardTitle>
        {canEdit && !editing ? (
          <button type="button" onClick={() => setEditing(true)} className={buttonClass('secondary', 'small')}>
            <Pencil aria-hidden className="size-[15px]" strokeWidth={2} />
            Edit
          </button>
        ) : null}
      </div>
      <p className="m-0 -mt-1 text-[14px] text-[#5F656B]">Your own posts, kept apart from what your market says.</p>
      {editing ? (
        <form action={run} className="flex flex-col">
          {FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3 border-t border-[#E4E2DC] py-2">
              <label htmlFor={`own-${f.key}`} className="text-[15px] font-semibold">{f.label}</label>
              <input
                id={`own-${f.key}`}
                name={f.key}
                defaultValue={handles[f.key] ? (f.key === 'youtube' ? handles[f.key] : `@${handles[f.key]}`) : ''}
                placeholder={f.key === 'youtube' ? '@handle or channel id' : '@handle'}
                className="h-[34px] w-[220px] rounded-[10px] border border-[#E4E2DC] bg-white px-3 text-right font-mono text-[13px] text-[#26292C] outline-none focus-visible:border-[#26292C]"
              />
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 border-t border-[#E4E2DC] pt-3 pb-1">
            <button type="button" onClick={() => setEditing(false)} className={buttonClass('ghost', 'small')}>Cancel</button>
            <button type="submit" disabled={pending} className={buttonClass('primary', 'small')}>{pending ? 'Saving' : 'Save'}</button>
          </div>
        </form>
      ) : rows.length > 0 ? (
        <div className="flex flex-col">
          {rows.map((r) => (
            <div key={r.platform} className="flex items-center justify-between gap-3 border-t border-[#E4E2DC] py-3">
              <div className="text-[15px] font-semibold">{r.platform}</div>
              {/* Your own accounts are you: the gold (4.7:1 on the white card). */}
              <div className={r.mono ? 'font-mono text-[13px] text-you' : 'text-[13px] text-you'}>{r.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {words ? <p role="status" className={`m-0 text-[12px] ${state.ok ? 'text-[#5F656B]' : 'text-[#C2410C]'}`}>{words}</p> : null}
    </Card>
  )
}
