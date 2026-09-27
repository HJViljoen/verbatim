import type { ReactNode } from 'react'

import { fmtInt } from '@/lib/format'
import { carriesShare, levelText } from '@/lib/reading/level'
import { REJECT_ROWS, type KeptRate, type RejectRow } from '@/lib/settings/reject-log'

import { RecordSection } from './frame'
import { ShowAll } from './show-all'

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
 * NO NOTE UNDER THE TABLE (25 Sep rulings, the whole Record tab from WP1.6).
 * The Phase 1 port printed what filing an appeal does and does not do under
 * the rows; that is method, and the control's own words carry the rest ("This
 * should have been kept", then the filed sentence). What the note refused
 * still holds: nothing here claims an appeal "trains the gate" (`gate_appeals`
 * is read by this page and a readiness probe only; design review finding 3,
 * code review finding 3).
 *
 * TITLE ALONE. The set-aside count that sat beside the title is the section's
 * one-line answer, the first line of its body; the rates' base ("of the last
 * 1,000") is the table's column head, where a base belongs.
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
// FROM `xl` (fresh design check, 26 Sep): in a tile, at 1024, the 200px floor
// left the post 148px and the rule 60px, one word to a line.
const TRACKS = 'xl:grid-cols-[minmax(0,2.8fr)_minmax(0,1.13fr)_minmax(200px,1fr)]'

/**
 * One precision for a set of kept rates (deploy 2 review): a decimal share is
 * never printed on a base under 100 (GR F25), so where any rate in the set
 * rests on fewer than 100 looked at, every share in it is a whole percent
 * ("38%", not "38.0%"), and one column keeps one precision. A rate on fewer
 * than 100 looked at is no share at all: it prints as its count, "48 of 91"
 * (market-first WP3.10, a copy debt found after deploy 1; `levelText`'s floor).
 * Exported for the test.
 */
export function keptRateText(rates: readonly Pick<KeptRate, 'found' | 'keptPct'>[]): (r: Pick<KeptRate, 'found' | 'kept' | 'keptPct'>) => string {
  const whole = rates.some((r) => r.found < 100)
  return (r) => {
    // "of N" through `levelText` (plan §4.0): its count under the floor.
    if (!carriesShare(r.found)) return levelText(r.kept, r.found)?.text ?? `${fmtInt(r.kept)} of ${fmtInt(r.found)}`
    return whole ? `${Math.round(r.keptPct)}%` : `${r.keptPct.toFixed(1)}%`
  }
}

export function RejectLogBlock({
  rows, summary, unavailable, unjudged, byTerm, byPlatform, lookedAt = 'Looked at', withheld, control,
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
  /** The "Looked at" column's head, carrying the rates' base where they are
   *  over a sample (`sampleHead`). */
  lookedAt?: string
  /** The sentence a member reads in place of the posts themselves. */
  withheld?: string | null
  control?: (row: RejectRow) => ReactNode
}) {
  if (unavailable) {
    return (
      <RecordSection title="The reject log">
        <p className="m-0 text-[15px] text-muted-foreground">{unavailable}</p>
      </RecordSection>
    )
  }
  const termRate = keptRateText(byTerm)
  const platformRate = keptRateText(byPlatform)
  return (
    <RecordSection title="The reject log">
      {summary ? <p className="m-0 text-[15px] leading-[1.5]">{summary}</p> : null}
      {unjudged ? <p className="m-0 text-[13px] text-muted-foreground">{unjudged}</p> : null}

      {withheld ? (
        <p className="m-0 text-[15px] text-muted-foreground">{withheld}</p>
      ) : rows.length === 0 ? (
        <p className="m-0 text-[15px] text-muted-foreground">Nothing has been set aside yet.</p>
      ) : (
        <div className="flex flex-col">
          <div className={`hidden gap-x-3 border-b border-border pb-2 text-[13px] font-medium leading-[1.35] text-muted-foreground xl:grid ${TRACKS}`}>
            <span>Thrown away</span>
            <span>The rule that fired</span>
            <span />
          </div>
          {/* THE LATEST FIVE, THEN THE REST (Heinrich's default, 26 Sep,
              R-b): in a native disclosure, keyboard reachable, with no client
              script, and every row printed (show-all.tsx). The page reads
              only the REJECT_ROWS most recent posts, so a full read says
              "Show the 20 most recent", never "all" (deploy 2 review). */}
          <ShowAll items={rows} count={rows.length} capped={rows.length >= REJECT_ROWS} render={(r) => (
            <div
              key={`${r.runId}-${r.platform}-${r.videoId}`}
              className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b border-border/60 py-3 last:border-b-0 xl:min-h-[60px] xl:py-2 ${TRACKS}`}
            >
              <span className="min-w-0 text-[13px] leading-[1.5] [overflow-wrap:anywhere]">
                {/* The stranger's own words, and rule (c) may not police them
                    (lib/test/copy-contract.ts): a caption can say "growing" and
                    the product has made no direction claim by quoting it. */}
                <span data-copy="quote">“{r.captionExcerpt ?? 'No caption was stored for this one.'}”</span>
                <span className="mt-0.5 block font-mono text-[12px] leading-[1.45] text-muted-foreground">
                  {r.platform}
                  {r.accountName ? ` · ${r.accountName}` : ''}
                  {r.keyword ? ` · found on “${r.keyword}”` : ''}
                </span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] leading-[1.45] text-secondary-foreground">
                <span className="h-[7px] w-[7px] flex-none rounded-full bg-border" />
                <span className="min-w-0">
                  {r.reason ?? (r.source === 'default' ? 'Nobody judged this one.' : 'No reason was recorded.')}
                </span>
              </span>
              <span className="xl:justify-self-end">{control?.(r)}</span>
            </div>
          )} />
        </div>
      )}

      {byTerm.length > 0 ? (
        <div className="flex flex-col gap-3 pt-2">
          <h3 className="m-0 text-[15px] font-semibold">What each term brings back</h3>
          {/* THE TAB'S TABLE VOICE (13px sentence-case heads over the rule, as
              The record's above), not the settings forms' mono capitals; the
              rates' base rides in the "Looked at" head. */}
          {/* In a narrow pane (768: the sidebar and the settings rail leave
              about 250px) the table scrolls inside its own box, never the
              page (deploy 2 review). */}
          <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full border-collapse text-[13px] leading-[1.45]">
            <thead>
              <tr className="border-b border-border">
                {['Term', lookedAt, 'Kept', 'Kept rate'].map((h, i) => (
                  <th key={h} scope="col" className={`pb-2 align-bottom font-medium text-muted-foreground ${i === 0 ? 'pr-3 text-left' : 'pl-3 text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byTerm.map((t) => (
                <tr key={t.key} className="border-b border-border/60 last:border-b-0">
                  <td className="py-2 pr-3 text-left align-top">{t.label}</td>
                  {[fmtInt(t.found), fmtInt(t.kept), termRate(t)].map((c, i) => (
                    <td key={i} className="py-2 pl-3 text-right align-top font-mono tabular-nums">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {byPlatform.length > 0 ? (
            <p className="m-0 text-[13px] text-secondary-foreground">
              By platform: {byPlatform.map((p) => `${p.label} ${platformRate(p)}`).join(' · ')}.
            </p>
          ) : null}
        </div>
      ) : null}
    </RecordSection>
  )
}
