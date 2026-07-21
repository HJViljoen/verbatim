import { DeltaBadge } from './delta-badge'

// The counted "this update, in figures" strip — a quiet tertiary ribbon under
// the hero (Meltwater-style annotation, not a competing stat-hero). Extracted
// from app/dashboard/page.tsx; each item is a bold figure + a delta that appears
// once a previous update exists. Renders nothing below two items so it never
// looks stranded. Callers pass already-computed figures — the numbers rule
// holds: no counting happens here.

export interface StatTile {
  n: number
  label: string
  delta: number | null
}

export function StatBand({ tiles }: { tiles: StatTile[] }) {
  if (tiles.length < 2) return null
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-card/60 px-5 py-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">This update</span>
      {tiles.map((t) => (
        <div key={t.label} className="flex items-baseline gap-1.5 border-l border-border/60 pl-5">
          <span className="text-lg font-semibold tabular-nums">{t.n.toLocaleString('en-US')}</span>
          <span className="text-xs text-muted-foreground">{t.label}</span>
          <DeltaBadge delta={t.delta} />
        </div>
      ))}
    </div>
  )
}
