'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Check, Download, LoaderCircle } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BarPill } from '@/components/shell/page-grid'
import { FORMAT_NOUN, exportErrorLine, jobKey, pageSections, tileSections, type ExportJob, type ExportSection } from '@/lib/exports/jobs'
import type { PageKey } from '@/lib/renderables/types'

// Export-in-place (Stage 1, 2026-08-29; pulled for the Studio 2026-08-30;
// back 2026-09-11). Every page leaves as a PDF of the view the reader is
// looking at; every tile as an image. The page provides the scope — which
// page, which URL params, which tiles — through a context; a tile only names
// its own key. On paper there is no provider, so the controls render nothing.
//
// Quiet chrome (MASTER rule 1): the page control is the page bar's own pill,
// the tile control is zero-opacity until the tile is hovered or the button is
// focused, so no header ever moves. Both carry data-print-hide, so an export
// never shows its own buttons.

interface ExportScopeValue {
  page: PageKey
  params: Record<string, string | undefined>
  /** Every renderable on the page, for the page menu's "a tile as an image". */
  tiles: { key: string; title: string }[]
}

const ExportScopeContext = createContext<ExportScopeValue | null>(null)

export function ExportScope({ page, params, tiles, children }: ExportScopeValue & { children: ReactNode }) {
  return <ExportScopeContext.Provider value={{ page, params, tiles }}>{children}</ExportScopeContext.Provider>
}

type State =
  | { phase: 'idle' }
  | { phase: 'busy'; noun: string; started: number }
  | { phase: 'done'; noun: string }
  | { phase: 'error'; message: string }

/** One control's state machine: ask the route, then hand the browser the file. */
function useExport(scope: ExportScopeValue | null) {
  const [state, setState] = useState<State>({ phase: 'idle' })
  // A ticking clock while we wait — a render is five to twelve seconds, and a
  // control that only spins reads as broken. Elapsed is derived, never stored.
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (state.phase !== 'busy') return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [state.phase])
  const elapsed = state.phase === 'busy' ? Math.max(0, Math.floor((now - state.started) / 1000)) : 0

  const reset = useCallback(() => setState({ phase: 'idle' }), [])

  const run = useCallback(async (job: ExportJob) => {
    if (!scope) return
    const noun = FORMAT_NOUN[job.format]
    setState({ phase: 'busy', noun, started: Date.now() })
    try {
      const r = await fetch('/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: job.kind, page: scope.page, tileKey: job.tileKey,
          params: scope.params, variant: job.variant ?? 'default', format: job.format,
        }),
      })
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!r.ok || !j.url) {
        setState({ phase: 'error', message: exportErrorLine(r.status, j.error) })
        return
      }
      setState({ phase: 'done', noun })
      // The signed URL carries Content-Disposition: attachment — the browser
      // takes the file and the page stays where it was.
      window.location.assign(j.url)
    } catch {
      setState({ phase: 'error', message: exportErrorLine(0, null) })
    }
  }, [scope])

  return { state, elapsed, run, reset }
}

/** Open/closed plus the machine, with the two-second settle after a file lands. */
function useExportControl(scope: ExportScopeValue | null) {
  const [open, setOpen] = useState(false)
  const ex = useExport(scope)
  const { phase } = ex.state
  const { reset } = ex
  useEffect(() => {
    if (phase !== 'done') return
    const id = setTimeout(() => { setOpen(false); reset() }, 2000)
    return () => clearTimeout(id)
  }, [phase, reset])
  return { open, setOpen, ex }
}

function StateIcon({ phase, className }: { phase: State['phase']; className: string }) {
  if (phase === 'busy') return <LoaderCircle className={`${className} animate-spin`} aria-hidden />
  if (phase === 'done') return <Check className={`${className} text-primary`} aria-hidden />
  return <Download className={className} aria-hidden />
}

/** What the open menu shows: the jobs, or how the last one is going. */
function Body({ sections, ex }: { sections: ExportSection[]; ex: ReturnType<typeof useExport> }) {
  const { state, elapsed } = ex
  if (state.phase === 'busy') {
    return (
      <p role="status" className="flex items-center gap-2 px-1.5 py-2 text-[12.5px] text-secondary-foreground">
        <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden />
        Preparing your {state.noun} · {elapsed}s
      </p>
    )
  }
  if (state.phase === 'done') {
    return (
      <p role="status" className="flex items-center gap-2 px-1.5 py-2 text-[12.5px] text-secondary-foreground">
        <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
        Your {state.noun} is downloading.
      </p>
    )
  }
  if (state.phase === 'error') {
    return (
      <div className="px-1.5 py-2">
        <p role="alert" className="text-[12.5px] leading-[1.4] text-negative">{state.message}</p>
        <button type="button" onClick={ex.reset} className="mt-1.5 cursor-pointer text-[12px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
          Back
        </button>
      </div>
    )
  }
  return (
    <>
      {sections.map((s, i) => (
        <div key={s.label ?? i}>
          {i > 0 && <DropdownMenuSeparator />}
          {s.label && (
            <DropdownMenuLabel className="font-mono text-[10.5px] font-normal uppercase tracking-[0.06em]">
              {s.label}
            </DropdownMenuLabel>
          )}
          {s.jobs.map((j) => (
            <DropdownMenuItem
              key={jobKey(j)}
              // Keep the menu open: it is where the wait, the file and any
              // error are reported.
              onSelect={(e) => { e.preventDefault(); void ex.run(j) }}
              className="cursor-pointer gap-3 text-[12.5px]"
            >
              <span className="min-w-0 truncate">{j.label}</span>
              {j.hint && <span className="ml-auto shrink-0 font-mono text-[10.5px] uppercase text-muted-foreground">{j.hint}</span>}
            </DropdownMenuItem>
          ))}
        </div>
      ))}
    </>
  )
}

/** The page-level control: this page, this page with everything, any tile. */
export function ExportMenu() {
  const scope = useContext(ExportScopeContext)
  const { open, setOpen, ex } = useExportControl(scope)
  if (!scope) return null
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button" data-print-hide=""
          className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BarPill active={open}>
            <StateIcon phase={ex.state.phase} className="size-3.5" />
            Export
          </BarPill>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <Body sections={pageSections(scope.tiles)} ex={ex} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The tile-level control, rendered by Tile when it has an exportKey. */
export function TileExportButton({ tileKey }: { tileKey: string }) {
  const scope = useContext(ExportScopeContext)
  const { open, setOpen, ex } = useExportControl(scope)
  if (!scope) return null
  const resting = ex.state.phase === 'idle' && !open
  return (
    // No transform on this span: a transformed ancestor would trap the
    // portalled menu inside the tile's overflow-hidden box.
    <span className={`absolute -right-1 -top-0.5 transition-opacity duration-150 ${resting ? 'opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100' : 'opacity-100'}`}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button" aria-label="Export this tile" data-print-hide=""
            className="grid size-5 cursor-pointer place-items-center rounded-[4px] text-muted-foreground transition-colors hover:bg-inner hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <StateIcon phase={ex.state.phase} className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <Body sections={tileSections(tileKey)} ex={ex} />
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
