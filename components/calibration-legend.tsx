import { GLOSSARY, type GlossaryKey } from '@/lib/calibration'

// "How to read this page" — the calibrated-language legend (Calibrated-Language
// doc 2026-07-04). Sits just under each data page's header, collapsed. Renders
// the same GLOSSARY lines the chip tooltips use, so hover text and legend can
// never drift apart. Server component, native details/summary — no client JS.

export function CalibrationLegend({ items }: { items: GlossaryKey[] }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span className="text-[9px] transition-transform group-open:rotate-90" aria-hidden>▶</span>
        How to read this page
      </summary>
      <dl className="mt-2 space-y-1 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        {items.map((key) => (
          <div key={key} className="flex gap-2">
            <dt className="shrink-0 font-semibold">{GLOSSARY[key][0]}</dt>
            <dd>— {GLOSSARY[key][1]}</dd>
          </div>
        ))}
        <p className="pt-1 text-[10px] opacity-80">
          Every label above is assigned by a fixed rule from counted data — never worded by the AI.
        </p>
      </dl>
    </details>
  )
}
