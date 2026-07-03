'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

// Filter bar for Voice of Customer. URL-driven so the server component does the
// actual filtering (shareable links, no client data duplication); this only
// updates the query string and preserves any other params (e.g. ?themes).
const TYPES = [
  { value: 'all', label: 'All types' },
  { value: 'pain_point', label: 'Pain point' },
  { value: 'question', label: 'Question' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'purchase_intent', label: 'Purchase intent' },
  { value: 'buying_trigger', label: 'Buying trigger' },
  { value: 'switching_signal', label: 'Switching signal' },
  { value: 'objection', label: 'Objection' },
  { value: 'praise', label: 'Praise' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'demographic_signal', label: 'Demographic signal' },
]
const SCORES = [
  { value: '0', label: 'Any score' },
  { value: '5', label: 'Score 5+' },
  { value: '7', label: 'Score 7+' },
  { value: '9', label: 'Score 9+' },
]

export function VoiceFilters({ type, min, deepLinked }: { type: string; min: string; deepLinked?: boolean }) {
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
      <select className={selectCls} value={type} onChange={(e) => setParam('type', e.target.value, 'all')} aria-label="Filter by type">
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <select className={selectCls} value={min} onChange={(e) => setParam('min', e.target.value, '0')} aria-label="Filter by minimum score">
        {SCORES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </div>
  )
}
