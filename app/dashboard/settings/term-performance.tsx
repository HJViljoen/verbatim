import { platformLabel } from '@/lib/format'
import { glossaryRule } from '@/lib/calibration'
import { EnhancedTable } from '@/components/shell/enhanced-table'
import { SettingsCard } from '@/components/settings-frame'
import type { TermSummary } from '@/lib/keywords/value'

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

function Row({ t }: { t: TermSummary }) {
  return (
    <tr data-search={`${t.keyword} ${BUCKET_LABEL[t.bucket] ?? t.bucket} ${t.platforms.map(platformLabel).join(' ')}`.toLowerCase()} className="border-t border-border/70 align-top">
      <td className="py-1.5 pr-3">{t.keyword}</td>
      <td className="py-1.5 pr-3 text-muted-foreground" data-v={BUCKET_LABEL[t.bucket] ?? t.bucket}>{BUCKET_LABEL[t.bucket] ?? t.bucket}</td>
      <td className="py-1.5 pr-3 text-muted-foreground">{t.platforms.map(platformLabel).join(' · ')}</td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums" data-v={t.found}>{n(t.found)}</td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums" data-v={t.kept}>{n(t.kept)}</td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground" data-v={t.eligible}>{n(t.eligible)}</td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums" data-v={t.insights}>{n(t.insights)}</td>
      <td className="py-1.5" data-v={t.worthReviewing ? 1 : 0}>
        {t.worthReviewing ? (
          // <details> rather than a floating panel: the row grows in place, so
          // nothing can be clipped by the table's own scroller, and it works
          // with a keyboard and on paper without a line of JavaScript.
          <details className="min-w-[168px]">
            <summary
              className="inline-flex cursor-pointer list-none items-center rounded-full bg-warning/15 px-2 py-px text-[10.5px] font-medium text-warning marker:content-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

export function TermPerformance({ rows, updates }: { rows: TermSummary[]; updates: number }) {
  const flagged = rows.filter((t) => t.worthReviewing).length
  const description = rows.length === 0
    ? 'Nothing to show yet — this fills in after your first update.'
    : `Pooled over your last ${updates} update${updates === 1 ? '' : 's'}. Found = posts the term surfaced · kept = the ones about your market · with comments = the ones worth reading · insights = findings they led to.${flagged > 0 ? ` ${flagged} term${flagged === 1 ? '' : 's'} worth a look.` : ''}`

  return (
    <SettingsCard title="How your search terms are doing" description={description}>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          We have not gathered anything yet, so no term has a record. Come back after your first update.
        </p>
      ) : (
        <EnhancedTable filterPlaceholder="Filter terms…">
          <table className="w-full min-w-[720px] text-[11.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                {([['Term', 'str'], ['Group', 'str'], ['Where', null], ['Found', 'num'], ['Kept', 'num'], ['With comments', 'num'], ['Insights', 'num'], ['', 'num']] as [string, string | null][]).map(([h, sort], i) => (
                  <th
                    key={h || 'flag'}
                    data-sort={sort ?? undefined}
                    scope="col"
                    className={`pb-1.5 pr-3 font-semibold ${i >= 3 && i <= 6 ? 'text-right' : 'text-left'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => <Row key={t.key} t={t} />)}
            </tbody>
          </table>
        </EnhancedTable>
      )}
    </SettingsCard>
  )
}
