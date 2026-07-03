'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

// Filter bar for Voice of Customer. URL-driven so the server component does the
// actual filtering (shareable links, no client data duplication); this only
// updates the query string and preserves any other params (e.g. ?themes, ?type).
// Category filtering moved to the tab row on the page; strength options are
// worded, never numeric (Redesign Spec §1 — scores are not displayed).
const STAGES = [
  { value: 'all', label: 'Any journey stage' },
  { value: 'awareness', label: 'Awareness' },
  { value: 'consideration', label: 'Consideration' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'ownership', label: 'Ownership' },
  { value: 'advocacy', label: 'Advocacy' },
]
const STRENGTH = [
  { value: '0', label: 'Any strength' },
  { value: '4', label: 'Clear or stronger' },
  { value: '7', label: 'Strong only' },
]

export function VoiceFilters({ stage, min, deepLinked, showStage }: {
  stage: string
  min: string
  deepLinked?: boolean
  /** Hide the journey filter on runs whose insights predate the journey tag. */
  showStage?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function push(mutate: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(params.toString())
    mutate(p)
    const qs = p.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const setParam = (key: string, value: string, clearValue: string) =>
    push((p) => (value === clearValue ? p.delete(key) : p.set(key, value)))

  const selectCls =
    'h-9 rounded-full border border-input bg-card px-4 text-sm text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40'

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 sm:ml-auto">
      {deepLinked && (
        <button
          type="button"
          onClick={() => push((p) => p.delete('themes'))}
          className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          Supporting a selected insight
          <span aria-hidden>✕</span>
        </button>
      )}
      {showStage && (
        <select className={selectCls} value={stage} onChange={(e) => setParam('stage', e.target.value, 'all')} aria-label="Filter by journey stage">
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      )}
      <select className={selectCls} value={min} onChange={(e) => setParam('min', e.target.value, '0')} aria-label="Filter by signal strength">
        {STRENGTH.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </div>
  )
}
