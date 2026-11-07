'use client'

import { useActionState, useEffect, useState } from 'react'
import { Ellipsis } from 'lucide-react'
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SM, INPUT } from '@/components/v2/look'
import { cn } from '@/lib/utils'
import { saveWords } from '@/lib/pages/settings-words'
import { TENANT_LOCK_REFUSAL } from '@/lib/tenant-locks'
import { RIVALS_PRESENT } from '@/app/dashboard/settings/constants'
import type { SettingsFormState } from '@/app/dashboard/settings/actions'
import type { RenameState } from '@/app/dashboard/settings/rivals-actions'

// The artboard's "…" on a brand you track: rename it, or stop tracking it.
// A rename is the one logged rival rename (lib/rivals.ts, needs the brand's
// identity); stopping posts the tracked list without it, through the same
// action that adds one.
//
// SINCE THE AUDIT DESIGN (7 Nov, Settings.dc.html): the "…" is the white
// secondary button, square; the menu's field is the kit's input and its
// confirm the yellow button. Styles from components/v2/look.ts (import-free,
// the client-bundle guard).

const initial = { ok: false, message: '' }
const LOCKS = [TENANT_LOCK_REFUSAL.tracking]

export function BrandMenu({
  name, id, names, rename, save,
}: {
  name: string
  id: string | null
  names: string[]
  rename: (prev: RenameState, formData: FormData) => Promise<RenameState>
  save: (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>
}) {
  const [mode, setMode] = useState<'closed' | 'menu' | 'rename' | 'stop' | 'done'>('closed')
  const [renamed, runRename, renaming] = useActionState(async (prev: RenameState, fd: FormData) => {
    const out = await rename(prev, fd)
    if (out.ok) setMode('done')
    return out
  }, initial)
  const [stopped, runStop, stopping] = useActionState(async (prev: SettingsFormState, fd: FormData) => {
    const out = await save(prev, fd)
    if (out.ok) setMode('done')
    return out
  }, initial as SettingsFormState)
  const last = renamed.message ? renamed : stopped
  const words = saveWords(last, LOCKS)

  useEffect(() => {
    if (mode === 'closed') return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMode('closed') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={`More for ${name}`}
        aria-expanded={mode !== 'closed'}
        onClick={() => setMode((m) => (m === 'closed' ? 'menu' : 'closed'))}
        className={cn(BTN_SECONDARY, BTN_SM, 'w-9 px-0 max-sm:size-11')}
      >
        <Ellipsis aria-hidden className="size-4" strokeWidth={2} />
      </button>
      {mode !== 'closed' && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 flex w-[280px] flex-col gap-2 rounded-[10px] border border-border bg-card p-3 text-[14px] shadow-[0_6px_24px_rgba(0,0,0,0.08)]">
          {mode === 'menu' && (
            <>
              {id ? <button type="button" onClick={() => setMode('rename')} className="min-h-9 rounded-[8px] px-2.5 text-left font-medium hover:bg-inner max-sm:min-h-11">Rename</button> : null}
              <button type="button" onClick={() => setMode('stop')} className="min-h-9 rounded-[8px] px-2.5 text-left font-medium hover:bg-inner max-sm:min-h-11">Stop tracking</button>
            </>
          )}
          {mode === 'rename' && id && (
            <form action={runRename} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={id} />
              <label htmlFor={`rename-${id}`} className="font-semibold">Rename {name}</label>
              <input id={`rename-${id}`} name="name" defaultValue={name} required autoFocus className={cn(INPUT, 'max-sm:h-11')} />
              <div className="flex gap-2">
                <button type="submit" disabled={renaming} className={cn(BTN_PRIMARY, BTN_SM, 'max-sm:h-11')}>{renaming ? 'Saving' : 'Rename'}</button>
                <button type="button" onClick={() => setMode('closed')} className={cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>Cancel</button>
              </div>
            </form>
          )}
          {mode === 'stop' && (
            <form action={runStop} className="flex flex-col gap-2">
              <input type="hidden" name={RIVALS_PRESENT} value="1" />
              {names.filter((n) => n !== name).map((n) => <input key={n} type="hidden" name="competitor_names" value={n} />)}
              <p className="m-0 font-semibold">Stop tracking {name}?</p>
              <div className="flex gap-2">
                <button type="submit" disabled={stopping} className={cn(BTN_PRIMARY, BTN_SM, 'max-sm:h-11')}>{stopping ? 'Saving' : 'Stop tracking'}</button>
                <button type="button" onClick={() => setMode('closed')} className={cn(BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>Cancel</button>
              </div>
            </form>
          )}
          {words && mode !== 'menu' ? <p role="status" className={cn('m-0 text-[13px] leading-[1.45]', last.ok ? 'text-muted-foreground' : 'text-caution')}>{words}</p> : null}
        </div>
      )}
    </div>
  )
}
