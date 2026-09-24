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
 * The button is now the artboard's (`app/dashboard/settings/record/
 * appeal-control.tsx`): the first port drew this table and left that link
 * exactly as it was, and the package's own side-by-side did not show it because
 * the shot route supplied a stand-in (design review finding 2).
 *
 * THE NOTE UNDER THE TABLE IS THE ARTBOARD'S IDEA IN THE CODE'S WORDS
 * (`record.rejects.note`). The artboard — and the brief, which asserted it was
 * true — says "Kept rejections train the gate". Nothing implements that:
 * `gate_appeals` is written by `fileGateAppeal` and read by exactly two places,
 * this page (to mark a row filed) and `lib/readiness/load.ts` (a table probe).
 * Nothing in `lib/gather/`, `inngest/` or `lib/pipeline/` reads it at all, and
 * `actions.ts` says so in capitals — "IT FILES A COMPLAINT; IT DOES NOT
 * RE-GATHER" — adding that what we then DO about an appeal is a separate
 * configuration change. "Trains the gate" reads as an automatic feedback loop
 * and is the class of claim AGENTS.md names ("a page once claimed 'no email is
 * sent' while Resend sent"), so the sentence says what filing one actually does
 * (design review finding 3, code review finding 3). The second half is the
 * freeze, and that one IS true: three database guards per month table, not a
 * convention.
 *
 * THE APPEAL CONTROL IS PASSED IN. It is a client component with an action
 * behind it; this file is rendered by the block test tier, which renders once
 * and statically. So the page supplies the control per row and this draws the
 * column it sits in — and what it supplies is `AppealControl`, which is pure,
 * so the test tier renders the control a reader gets rather than a stand-in.
 */

/**
 * The artboard's `1fr │ 260px │ 230px`, as fractions that cannot overflow.
 *
 * Ported literally at `md:`, the two fixed tracks starved the caption column
 * and the two headers overprinted each other from 768px to about 950px (design
 * review finding 1). The pane at 1440 is about 1160px and the gaps take 24, so
 * 2.8 : 1.13 : 1 of the remaining 1136 is 645 │ 260 │ 230 — the mock's own
 * widths — and at every narrower width the same ratio divides whatever is
 * there. The control column keeps a 200px FLOOR because a 44px button whose
 * label is "This should have been kept" is the one cell here that has a real
 * minimum; every other track's minimum is 0, so the row can never be wider
 * than the pane.
 */
const TRACKS = 'lg:grid-cols-[minmax(0,2.8fr)_minmax(0,1.13fr)_minmax(200px,1fr)]'

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
          <div className={`hidden gap-x-3 pb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground lg:grid ${TRACKS}`}>
            <span>Thrown away</span>
            <span>The rule that fired</span>
            <span />
          </div>
          {rows.map((r) => (
            <div
              key={`${r.runId}-${r.platform}-${r.videoId}`}
              className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-t border-border/70 py-3 lg:min-h-[60px] lg:py-2 ${TRACKS}`}
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
              <span className="lg:justify-self-end">{control?.(r)}</span>
            </div>
          ))}
        </div>
      )}

      {/* THE SENTENCE BELONGS TO THE CONTROL, AND ONLY PRINTS WHERE THE
          CONTROL DOES (Block D wave 3, RC7). It was rendered unconditionally,
          outside the branch that draws the rows and their buttons, so it was
          read in two of the block's three states by someone who has no button
          to press: a member — the M8 default for anyone who is not owner or
          admin — read "saying so files it" with every row withheld, and a
          workspace with nothing set aside read "Nothing has been set aside
          yet." followed immediately by instructions for saying otherwise. The
          `control` half of the guard matters too: the prop is optional, and a
          caller that draws the rows without it draws no button either. */}
      {!withheld && rows.length > 0 && control ? (
        <p className="m-0 text-[12px] text-muted-foreground">
          Saying so files it for a person to look at. It does not re-run the gather, and it does not change a month
          already read.
        </p>
      ) : null}

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
