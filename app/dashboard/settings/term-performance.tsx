import { platformLabel } from '@/lib/format'
import { glossaryRule } from '@/lib/calibration'
import { EnhancedTable } from '@/components/shell/enhanced-table'
import { LabelRow } from '@/components/settings/chrome'
import type { TermSummary } from '@/lib/keywords/value'
import { TERM_YIELD_BASIS, type TermYield } from '@/lib/settings/terms'

// How your search terms are doing (WP5, 2026-09-11) — the first surface in the
// app to read keyword_performance, which until now only an operator CLI
// (scripts/keyword-roi.ts) ever looked at. It sits beside the editor on
// purpose: a client who can change the terms needs to see what the terms did.
//
// "Worth reviewing" is a hint, never an action. It is the same rule the CLI
// printed as DROP-CANDIDATE, and it opens to show the three numbers behind it
// (MASTER rule 5 — a claim is clickable evidence). The client decides.

const BUCKET_LABEL: Record<string, string> = {
  brand: 'Your brand',
  competitor: 'Competitors',
  industry: 'Your category',
}

const n = (x: number) => x.toLocaleString('en-US')

function Row({ t, months }: { t: TermSummary; months?: TermYield }) {
  return (
    <tr data-search={`${t.keyword} ${BUCKET_LABEL[t.bucket] ?? t.bucket} ${t.platforms.map(platformLabel).join(' ')}`.toLowerCase()} className="border-t border-border/70 align-top">
      <td className="py-1.5 pr-3">{t.keyword}</td>
      <td className="py-1.5 pr-3 text-muted-foreground" data-v={BUCKET_LABEL[t.bucket] ?? t.bucket}>{BUCKET_LABEL[t.bucket] ?? t.bucket}</td>
      <td className="py-1.5 pr-3 text-muted-foreground">{t.platforms.map(platformLabel).join(' · ')}</td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums" data-v={t.found}>{n(t.found)}</td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums" data-v={t.kept}>{n(t.kept)}</td>
      {/* The kept-rate. lib/keywords/value.ts has computed it since the file
          was written and documented it as "the number the table shows"; the
          table showed four raw counts and never it. Design ST2 asks for it
          printed, and it was a render change all along. */}
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums" data-v={Math.round(t.keptRate * 1000)}>{(t.keptRate * 100).toFixed(1)}%</td>
      {/* Month by month, on the UPDATE's clock — the one figure in this product
          that is honestly run-dated (TERM_YIELD_BASIS, printed once below). */}
      <td className="py-1.5 pr-3 font-mono text-[10px] text-muted-foreground">
        {months ? months.months.map((m) => `${m.month} ${m.keptPct.toFixed(0)}%`).join(' · ') : '—'}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground" data-v={t.eligible}>{n(t.eligible)}</td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums" data-v={t.insights}>{n(t.insights)}</td>
      <td className="py-1.5" data-v={t.worthReviewing ? 1 : 0}>
        {t.worthReviewing ? (
          // <details> rather than a floating panel: the row grows in place, so
          // nothing can be clipped by the table's own scroller, and it works
          // with a keyboard and on paper without a line of JavaScript.
          <details className="min-w-[168px]">
            {/* A claim you can open, not a coloured badge (MASTER rule 5).
                The amber pill this replaced read ~1.9:1 on white, under any
                contrast floor, and rules 1-2 keep hue for data anyway. */}
            <summary
              className="inline-flex cursor-pointer list-none items-center text-[11px] text-secondary-foreground underline decoration-dotted decoration-1 underline-offset-[3px] marker:content-none hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title={glossaryRule('term_value')}
            >
              Worth reviewing
            </summary>
            <ul className="mt-1.5 space-y-1 text-[11px] leading-[1.4] text-muted-foreground">
              {t.because.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </details>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  )
}

export function TermPerformance({ rows, updates, months = [] }: { rows: TermSummary[]; updates: number; months?: readonly TermYield[] }) {
  const monthsByTerm = new Map(months.map((m) => [m.keyword.trim().toLowerCase(), m]))
  const flagged = rows.filter((t) => t.worthReviewing).length
  const description = rows.length === 0
    ? 'Nothing to show yet — this fills in after your first update.'
    : `Pooled over your last ${updates} update${updates === 1 ? '' : 's'}. Found = posts the term surfaced · kept = the ones about your market · with comments = the ones worth reading · insights = findings they led to.${flagged > 0 ? ` ${flagged} term${flagged === 1 ? '' : 's'} worth a look.` : ''}`

  // Inside the terms section rather than in a filled card of its own (the
  // artboard port): the label gutter is the page's, so the record lines up
  // under the lists it is the record OF.
  return (
    <LabelRow label="How they are doing" meta={`pooled over ${updates} update${updates === 1 ? '' : 's'}`}>
      <p className="mb-2 text-[11.5px] text-muted-foreground">{description}</p>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          We have not gathered anything yet, so no term has a record. Come back after your first update.
        </p>
      ) : (
        <EnhancedTable filterPlaceholder="Filter terms…">
          <table className="w-full min-w-[860px] text-[11.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                {([['Term', 'str'], ['Group', 'str'], ['Where', null], ['Found', 'num'], ['Kept', 'num'], ['Kept rate', 'num'], ['Month by month', null], ['With comments', 'num'], ['Insights', 'num'], ['Worth reviewing', 'num']] as [string, string | null][]).map(([h, sort], i) => (
                  <th
                    key={h}
                    data-sort={sort ?? undefined}
                    scope="col"
                    className={`pb-1.5 pr-3 font-semibold ${(i >= 3 && i <= 5) || i === 7 || i === 8 ? 'text-right' : 'text-left'}`}
                  >
                    {/* The flag column's heading is a sort control, so it needs
                        a name even though the column reads better unlabelled. */}
                    {i === 9 ? <span className="sr-only">{h}</span> : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => <Row key={t.key} t={t} months={monthsByTerm.get(t.keyword.trim().toLowerCase())} />)}
            </tbody>
          </table>
        </EnhancedTable>
      )}
      {rows.length > 0 && <p className="mt-2 font-mono text-[10.5px] leading-[1.4] text-cat">{TERM_YIELD_BASIS}</p>}
    </LabelRow>
  )
}
