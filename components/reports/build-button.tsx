'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SM } from '@/components/v2/look'
import { cn } from '@/lib/utils'

// Build = freeze the report as it is and print it (POST /api/reports/[id]/build).
// Same shape as the export menu: a live elapsed counter while Chrome works,
// the signed URL opened on success, an honest line on failure.
// Since the audit design (7 Nov, Studio.dc.html): the kit's small button,
// white by default (the workbench's one yellow is Save), the wait in words.

type State =
  | { phase: 'idle' }
  | { phase: 'busy'; started: number }
  | { phase: 'done'; url: string; artifactId: string; skipped: { page: string; reason: string }[] }
  | { phase: 'error'; message: string }

export function BuildButton({ reportId, primary = false, className = '' }: { reportId: string; primary?: boolean; className?: string }) {
  const router = useRouter()
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (state.phase !== 'busy') return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [state.phase])
  const elapsed = state.phase === 'busy' ? Math.max(0, Math.floor((now - state.started) / 1000)) : 0

  async function build() {
    setState({ phase: 'busy', started: Date.now() })
    setNow(Date.now())
    try {
      const r = await fetch(`/api/reports/${reportId}/build`, { method: 'POST' })
      const j = (await r.json().catch(() => ({}))) as { url?: string; artifactId?: string; error?: string; skipped?: { section: { page: string }; reason: string }[] }
      if (!r.ok || !j.url || !j.artifactId) {
        setState({ phase: 'error', message: j.error ?? 'Couldn’t build this report. Try again.' })
        return
      }
      setState({ phase: 'done', url: j.url, artifactId: j.artifactId, skipped: (j.skipped ?? []).map((s) => ({ page: s.section.page, reason: s.reason })) })
      window.location.assign(j.url)
      router.refresh()
    } catch {
      setState({ phase: 'error', message: 'Couldn’t build this report. Try again.' })
    }
  }

  const busy = state.phase === 'busy'
  return (
    <div className={`flex flex-col items-end gap-1 ${className}`}>
      <button type="button" onClick={build} disabled={busy} className={cn(primary ? BTN_PRIMARY : BTN_SECONDARY, BTN_SM, 'max-sm:h-11')}>
        {busy && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
        {busy ? `Building, ${elapsed} ${elapsed === 1 ? 'second' : 'seconds'}` : 'Build PDF'}
      </button>
      {state.phase === 'done' && (
        <p className="m-0 text-right text-[13px] text-muted-foreground" aria-live="polite">
          Your PDF is downloading. <a href={`/api/artifacts/${state.artifactId}`} className="font-medium text-foreground underline decoration-control underline-offset-4 hover:decoration-foreground">Download again</a>
          {state.skipped.length > 0 && <span className="block">{state.skipped.length} section{state.skipped.length === 1 ? '' : 's'} left out, {state.skipped[0].reason}</span>}
        </p>
      )}
      {state.phase === 'error' && <p className="m-0 text-right text-[13px] text-caution" aria-live="polite">{state.message}</p>}
    </div>
  )
}
