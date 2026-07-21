// "Since last update" movement badge. Extracted from app/dashboard/page.tsx so
// every surface (stat band, funnel, finding tiles, the where-you-stand cards)
// renders the same delta. Self-gates: renders nothing until a previous update
// exists (delta == null), so first runs simply show no comparison.
export function DeltaBadge({ delta, unit }: { delta: number | null; unit?: string }) {
  if (delta == null) return null
  const suffix = unit ? ` ${unit}` : ''
  if (delta === 0) {
    return (
      <span className="whitespace-nowrap text-xs font-medium text-muted-foreground" title="no change since your last update">
        — unchanged
      </span>
    )
  }
  return (
    <span
      title="movement since your last update"
      className={`whitespace-nowrap text-xs font-semibold ${delta > 0 ? 'text-positive' : 'text-negative'}`}
    >
      {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString('en-US')}{suffix}
    </span>
  )
}
