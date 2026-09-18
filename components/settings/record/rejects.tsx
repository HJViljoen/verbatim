import type { ReactNode } from 'react'

import { fmtInt } from '@/lib/format'
import { SettingsRow, SettingsTable } from '@/components/settings-frame'
import type { KeptRate, RejectRow } from '@/lib/settings/reject-log'

import { RecordSection } from './frame'

/**
 * THE REJECT LOG — the artboard's `1fr │ 260px │ 230px` table
 * (`record.rejects.*`).
 *
 * The post in curly quotes, the rule that fired with a 7px grey bucket dot
 * before it, and a 44px bordered "This should have been kept" button in its own
 * column. The build drew a `<ul>` of stacked list items with an 11.5px
 * hover-underline text link — the one place the build was meaningfully quieter
 * than the design intends, on the control that is the page's whole argument.
 *
 * THE NOTE UNDER THE TABLE IS NEW AND IT IS TRUE (`record.rejects.note`).
 * "Kept rejections train the gate; they do not change a month already read."
 * The first half is what an appeal does — `fileGateAppeal` writes a row and
 * changes no configuration (`actions.ts`); the second is the freeze, which is
 * enforced by three database guards per month table and not by a convention
 * (AGENTS.md). The idea lived in a code comment and no reader-facing sentence
 * said it.
 *
 * THE APPEAL CONTROL IS PASSED IN. It is a client component with an action
 * behind it; this file is rendered by the block test tier, which renders once
 * and statically. So the page supplies the control per row and this draws the
 * column it sits in.
 */

export function RejectLogBlock({
  rows, summary, unavailable, unjudged, byTerm, byPlatform, basis, withheld, control,
}: {
  rows: readonly RejectRow[]
  /** "N of M candidates were set aside (38.0%) · recorded from 9 Sep 2026". */
  summary: string
  /** The sentence to print instead of the whole block, where the gate's own
   *  record is not open to this workspace yet. */
  unavailable?: string | null
  unjudged: ReactNode | null
  byTerm: readonly KeptRate[]
  byPlatform: readonly KeptRate[]
  basis: string | null
  /** The sentence a member reads in place of the posts themselves. */
  withheld?: string | null
  control?: (row: RejectRow) => ReactNode
}) {
  if (unavailable) {
    return (
      <RecordSection title="The reject log" meta="not open to you yet">
        <p className="m-0 text-[12.5px] text-muted-foreground">{unavailable}</p>
      </RecordSection>
    )
  }
  return (
    <RecordSection title="The reject log" meta={summary}>
      {unjudged ? <p className="m-0 text-[11.5px] text-muted-foreground">{unjudged}</p> : null}

      {withheld ? (
        <p className="m-0 text-[12px] text-muted-foreground">{withheld}</p>
      ) : rows.length === 0 ? (
        <p className="m-0 text-[12.5px] text-muted-foreground">Nothing has been set aside yet.</p>
      ) : (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[minmax(0,1fr)_260px_230px] gap-x-3 pb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground md:grid">
            <span>Thrown away</span>
            <span>The rule that fired</span>
            <span />
          </div>
          {rows.map((r) => (
            <div
              key={`${r.runId}-${r.platform}-${r.videoId}`}
              className="grid grid-cols-1 items-center gap-x-3 gap-y-2 border-t border-border/70 py-3 md:min-h-[60px] md:grid-cols-[minmax(0,1fr)_260px_230px] md:py-2"
            >
              <span className="min-w-0 text-[12.5px]">
                {/* The stranger's own words, and rule (c) may not police them
                    (lib/test/copy-contract.ts): a caption can say "growing" and
                    the product has made no direction claim by quoting it. */}
                <span data-copy="quote">“{r.captionExcerpt ?? 'No caption was stored for this one.'}”</span>
                <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                  {r.platform}
                  {r.accountName ? ` · ${r.accountName}` : ''}
                  {r.keyword ? ` · found on “${r.keyword}”` : ''}
                </span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-secondary-foreground">
                <span className="h-[7px] w-[7px] flex-none rounded-full bg-border" />
                <span className="min-w-0">
                  {r.reason ?? (r.source === 'default' ? 'Nobody judged this one.' : 'No reason was recorded.')}
                </span>
              </span>
              <span className="md:justify-self-end">{control?.(r)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="m-0 text-[12px] text-muted-foreground">
        Kept rejections train the gate; they do not change a month already read.
      </p>

      {byTerm.length > 0 ? (
        <div className="flex flex-col gap-2 pt-1">
          <p className="m-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">What each term brings back</p>
          <SettingsTable head={['Term', 'Looked at', 'Kept', 'Kept rate']}>
            {byTerm.map((t) => (
              <SettingsRow
                key={t.key}
                cells={[t.label, fmtInt(t.found), fmtInt(t.kept), `${t.keptPct.toFixed(1)}%`]}
              />
            ))}
          </SettingsTable>
          {byPlatform.length > 0 ? (
            <p className="m-0 text-[11.5px] text-muted-foreground">
              By platform: {byPlatform.map((p) => `${p.label} ${p.keptPct.toFixed(1)}%`).join(' · ')}.
            </p>
          ) : null}
          {basis ? <p className="m-0 text-[11.5px] text-muted-foreground">{basis}</p> : null}
        </div>
      ) : null}
    </RecordSection>
  )
}
