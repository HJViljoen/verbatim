// "How to read this page" — the calibrated-language legend (Calibrated-Language
// doc 2026-07-04). Every badge word is rule-assigned from measured data
// (lib/calibration.ts); this popover states each rule in one line so every
// reader maps the same word to the same meaning. Server component, native
// details/summary — no client JS.

const LEGEND: Record<string, [string, string]> = {
  dominant: ['Dominant', 'at least 40% of the group’s conversations (min 10)'],
  widespread: ['Widespread', 'at least 15% of the group’s conversations (min 5)'],
  recurring: ['Recurring', 'heard in more than one conversation, below Widespread'],
  early_signal: ['Early signal', 'heard in a single conversation so far — worth watching, not yet confirmed'],
  strong_evidence: ['Strong evidence', 'high-confidence finding backed by two or more sources'],
  act_now: ['Act now', 'the single top-ranked action this update — never more than one'],
  plan_next: ['Plan next', 'ranked second or third this update'],
  sentiment: ['Strongly positive → Strongly negative', 'fixed cutoffs on the measured share of rated conversations; Polarized = both sides above 30%'],
}

export type LegendKey = keyof typeof LEGEND

export function CalibrationLegend({ items }: { items: LegendKey[] }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span className="text-[9px] transition-transform group-open:rotate-90" aria-hidden>▶</span>
        How to read this page
      </summary>
      <dl className="mt-2 space-y-1 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        {items.map((key) => (
          <div key={key} className="flex gap-2">
            <dt className="shrink-0 font-semibold">{LEGEND[key][0]}</dt>
            <dd>— {LEGEND[key][1]}</dd>
          </div>
        ))}
        <p className="pt-1 text-[10px] opacity-80">
          Every label above is assigned by a fixed rule from counted data — never worded by the AI.
        </p>
      </dl>
    </details>
  )
}
