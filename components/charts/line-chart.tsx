// Multi-series line over updates with direct end labels (no legend box for ≤4
// series), a light baseline + midline, and optional event markers ringed on
// the first series. With `points`, every update gets a dot whose <title> reads
// that point's own value. Server SVG, scales to its container width.

export interface LineSeries { label: string; values: number[]; color: string }

export function LineChart({
  series, labels, format = (v) => `${v}`, width = 560, height = 150, padL = 34, padR = 90, endLabels = true, markers = [], zeroBase = true,
  points = false, pointNote,
}: {
  series: LineSeries[]
  /** One x label per point (already formatted, e.g. "16 Aug"). */
  labels?: string[]
  format?: (v: number) => string
  width?: number
  height?: number
  padL?: number
  padR?: number
  endLabels?: boolean
  markers?: { i: number; label: string }[]
  zeroBase?: boolean
  /** Mark every update and answer "what was this one?" on hover: a dot per
   *  point with a title reading "<series> <value> · <x label>". */
  points?: boolean
  /** An extra clause for that point's title, e.g. "all updates" where the
   *  number means something different from the rest of the line. */
  pointNote?: (i: number) => string | undefined
}) {
  const all = series.flatMap((s) => s.values)
  if (all.length === 0) return null
  const n = Math.max(...series.map((s) => s.values.length))
  const lo = zeroBase ? 0 : Math.min(...all)
  const hi = Math.max(...all) * 1.12 || 1
  const x = (i: number) => padL + (n === 1 ? (width - padL - padR) / 2 : (i * (width - padL - padR)) / (n - 1))
  const y = (v: number) => 12 + (height - 30) * (1 - (v - lo) / (hi - lo || 1))
  const mid = lo + (hi - lo) / 2
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ overflow: 'visible' }} role="img" aria-label={series.map((s) => s.label).join(' vs ')}>
      <line x1={padL} y1={y(lo)} x2={width - padR} y2={y(lo)} stroke="var(--border)" strokeWidth={1} />
      <line x1={padL} y1={y(mid)} x2={width - padR} y2={y(mid)} stroke="var(--muted)" strokeWidth={1} />
      <text x={padL - 6} y={y(lo) + 3} textAnchor="end" fontSize={10} fontFamily="var(--font-plex-mono), monospace" fill="var(--muted-foreground)">{format(lo)}</text>
      <text x={padL - 6} y={y(mid) + 3} textAnchor="end" fontSize={10} fontFamily="var(--font-plex-mono), monospace" fill="var(--muted-foreground)">{format(mid)}</text>
      {series.map((s) => {
        const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
        const last = s.values.length - 1
        return (
          <g key={s.label}>
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <circle cx={x(last)} cy={y(s.values[last])} r={3.2} fill={s.color} stroke="var(--tile)" strokeWidth={1.5} />
            {points && s.values.map((v, i) => {
              const note = pointNote?.(i)
              const title = `${s.label} ${format(v)}${labels?.[i] ? ` · ${labels[i]}` : ''}${note ? ` · ${note}` : ''}`
              return (
                <g key={i}>
                  {i !== last && <circle cx={x(i)} cy={y(v)} r={2.2} fill={s.color} stroke="var(--tile)" strokeWidth={1} />}
                  {/* a hand-sized target over a 2px dot; the title is the hover */}
                  <circle cx={x(i)} cy={y(v)} r={9} fill="transparent"><title>{title}</title></circle>
                </g>
              )
            })}
            {endLabels && (
              <text x={x(last) + 8} y={y(s.values[last]) + 4} fontSize={11} fontWeight={600} fontFamily="var(--font-plex-sans), sans-serif" fill="var(--foreground)">
                {s.label} <tspan fontFamily="var(--font-plex-mono), monospace" fontWeight={500}>{format(s.values[last])}</tspan>
              </text>
            )}
          </g>
        )
      })}
      {labels?.map((l, i) => (
        // Several updates on one day (re-analyses) would repeat the label —
        // print a date once, at its first point.
        i > 0 && labels[i - 1] === l ? null : (
          <text key={i} x={x(i)} y={height - 4} textAnchor="middle" fontSize={10} fontFamily="var(--font-plex-mono), monospace" fill="var(--muted-foreground)">{l}</text>
        )
      ))}
      {markers.map((m, k) => series[0]?.values[m.i] != null && (
        <circle key={k} cx={x(m.i)} cy={y(series[0].values[m.i])} r={8} fill="none" stroke="var(--warning)" strokeWidth={2}>
          <title>{m.label}</title>
        </circle>
      ))}
    </svg>
  )
}
