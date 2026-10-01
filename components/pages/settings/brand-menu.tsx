'use client'

import { useActionState, useEffect, useState } from 'react'
import { Ellipsis } from 'lucide-react'
import { buttonClass } from '@/components/pages/studio/ui'
import { saveWords } from '@/lib/pages/settings-words'
import { TENANT_LOCK_REFUSAL } from '@/lib/tenant-locks'
import { RIVALS_PRESENT } from '@/app/dashboard/settings/constants'
import type { SettingsFormState } from '@/app/dashboard/settings/actions'
import type { RenameState } from '@/app/dashboard/settings/rivals-actions'

// The artboard's "…" on a brand you track: rename it, or stop tracking it.
// A rename is the one logged rival rename (lib/rivals.ts, needs the brand's
// identity); stopping posts the tracked list without it, through the same
// action that adds one.

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
        className="inline-flex size-[34px] items-center justify-center rounded-lg border border-transparent bg-transparent text-[#5F656B] hover:bg-[#F7F6F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26292C]/40"
      >
        <Ellipsis aria-hidden className="size-4" strokeWidth={2} />
      </button>
      {mode !== 'closed' && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 flex w-[260px] flex-col gap-2 rounded-2xl border border-[#E4E2DC] bg-white p-3 text-[13px] shadow-[0_6px_24px_rgba(0,0,0,0.08)]">
          {mode === 'menu' && (
            <>
              {id ? <button type="button" onClick={() => setMode('rename')} className="rounded-lg px-2 py-1.5 text-left font-medium hover:bg-[#F7F6F2]">Rename</button> : null}
              <button type="button" onClick={() => setMode('stop')} className="rounded-lg px-2 py-1.5 text-left font-medium hover:bg-[#F7F6F2]">Stop tracking</button>
            </>
          )}
          {mode === 'rename' && id && (
            <form action={runRename} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={id} />
              <label htmlFor={`rename-${id}`} className="font-semibold">Rename {name}</label>
              <input id={`rename-${id}`} name="name" defaultValue={name} required autoFocus className="h-[34px] rounded-[10px] border border-[#E4E2DC] px-3 text-[13px] outline-none focus-visible:border-[#26292C]" />
              <div className="flex gap-2">
                <button type="submit" disabled={renaming} className={buttonClass('primary', 'small')}>{renaming ? 'Saving' : 'Rename'}</button>
                <button type="button" onClick={() => setMode('closed')} className={buttonClass('ghost', 'small')}>Cancel</button>
              </div>
            </form>
          )}
          {mode === 'stop' && (
            <form action={runStop} className="flex flex-col gap-2">
              <input type="hidden" name={RIVALS_PRESENT} value="1" />
              {names.filter((n) => n !== name).map((n) => <input key={n} type="hidden" name="competitor_names" value={n} />)}
              <p className="m-0 font-semibold">Stop tracking {name}?</p>
              <div className="flex gap-2">
                <button type="submit" disabled={stopping} className={buttonClass('primary', 'small')}>{stopping ? 'Saving' : 'Stop tracking'}</button>
                <button type="button" onClick={() => setMode('closed')} className={buttonClass('ghost', 'small')}>Cancel</button>
              </div>
            </form>
          )}
          {words && mode !== 'menu' ? <p role="status" className={`m-0 text-[12px] ${last.ok ? 'text-[#5F656B]' : 'text-[#C2410C]'}`}>{words}</p> : null}
        </div>
      )}
    </div>
  )
}
