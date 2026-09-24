import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { fmtInt, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import { RIVAL_STATE_LINE, type CompetitiveSurfaceData, type RivalOption } from '@/lib/pages/competitive-surface'

// CO1 · One rival selection (design §3 CO1) — it scopes the whole surface.
//
// FOUR STATES, NOT TWO. The parked page's selector is built from the keys of
// `run_summary.period_share_of_voice`, so a rival with no row in that layer is
// not offered at all: on Sealand today that is Rareform, which the tenant
// configured, which has fifteen videos in the corpus, and which a client would
// reasonably expect to find here. This selector lists every tracked rival and
// says which of four things is true of each — read this window, quiet this
// window, never read, or no longer tracked.
//
// A RETIRED RIVAL KEEPS ITS ROW. Its frozen months are filed under its name and
// always will be (a frozen row cannot be re-keyed), so "was tracked · its
// months keep its name" is the only honest thing to print over them.
//
// UNTIL M1, THE ABSENCES CANNOT BE LISTED. `competitors` is the register;
// without it the only list is `tracking_configs.competitor_names`, which holds
// today's names and no retirement at all — so a rival the tenant stopped
// tracking is invisible here, and the block says that rather than implying
// there were never any. (Sealand had Patagonia and Topo Designs until
// 2026-09-09; 84 of their registry themes are still in the database.)

const UNRECORDED =
  'Rivals you have stopped tracking are not recorded for this workspace yet, so this list is the ones you track today.'

function Option({ option, mode }: { option: RivalOption; mode: RenderMode }) {
  const email = mode === 'email'
  const state = RIVAL_STATE_LINE[option.state]
  const stamp = option.retiredAt ? ` · until ${shortDate(option.retiredAt)}` : ''
  const body = <>
    {option.name}
    <span className={email ? undefined : 'ml-1.5 text-[11px] font-normal text-muted-foreground'} style={email ? { color: EMAIL.muted } : undefined}>
      {state}{stamp}
      {/* THE BASIS IS PART OF THE FIGURE (D15), AND IT USED TO LIVE IN A
          COMMENT. `countAnalysedByRival` has no date filter — it is a head
          count over the whole corpus — while the words beside it ("read this
          window", "nothing of theirs was read this window") are a WINDOW
          state. So the pill read "Ottobock read this window · 319 of their
          videos read" six hundred pixels above standings saying Ottobock is
          42 of 449 for September, and 319 read as a contradiction of the
          window figure rather than as a different measure.

          AND "in all" WAS NOT THE ANSWER (competitive 5). The fix borrowed the
          head-to-head footer's phrase on the grounds that it names the same
          span, and it does not. `readThisMonth` is documented at
          lib/reading/head-to-head.ts:177 as "Every audience's videos in the
          MONTH, summed", and :266 spends it as "42 videos of theirs read in
          Sep 2026, of 449 read in all" — so there "in all" means across every
          AUDIENCE, this month. Here `countAnalysedByRival`
          (lib/pages/competitive-surface.ts:1080-1110) has no date filter and
          means the whole corpus, ALL TIME. Both render on one page about 600px
          apart, and because the fixture's month total is also 449 the
          available reading of the pill's "in all" was the footer's month-wide
          one — which puts 319 straight back into contradiction with 42 of 449.
          So the pill names its span outright, in the words the page bar
          already uses for it, and "in all" is left to the footer. */}
      {option.analysed != null && option.analysed > 0 ? <> · <span data-copy="figure">{fmtInt(option.analysed)}</span> of their videos read since we started</> : null}
    </span>
  </>

  if (email) {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: option.selected ? EMAIL.ink : EMAIL.ink2, padding: '3px 0' }}>{body}</div>
    )
  }
  return (
    <Link
      href={option.href}
      aria-current={option.selected ? 'true' : undefined}
      className={`inline-flex items-baseline rounded-full px-2.5 py-1 text-[12px] transition-colors ${option.selected ? 'bg-inner font-medium text-foreground ring-1 ring-border' : 'bg-tile text-secondary-foreground ring-1 ring-border hover:bg-inner'}`}
    >
      {body}
    </Link>
  )
}

export const competitiveRivals: Block<CompetitiveSurfaceData> = {
  key: 'competitive.rivals',
  title: 'Your rivals',
  question: 'Which rival is this page about?',

  render(data, mode = 'app') {
    const r = data.rivals
    const email = mode === 'email'
    const empty = competitiveRivals.emptyState(data)

    // THE APP ARM IS NOT A CARD (Block D wave 2, the artboard's CO1). The
    // selection is a CONTROL for the page, and the mock draws it as a labelled
    // pill row sitting directly under the soundness band, outside any tile. It
    // was a full-width card with an uppercase eyebrow, a block question and a
    // mono meta naming the selected rival — the chrome of a finding around a
    // radio group. Print and email keep the frame, because neither has a page
    // bar to sit under and a bare row there would have no heading at all.
    if (mode === 'app') {
      return (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Rival</span>
          {empty ? <span className="text-[12px] text-muted-foreground">{empty}</span> : null}
          {r.options.map((o) => <Option key={o.audience} option={o} mode={mode} />)}
          {!r.identityRecorded && r.options.length > 0 ? (
            <span className="min-w-0 text-[11.5px] text-muted-foreground">{UNRECORDED}</span>
          ) : null}
        </div>
      )
    }

    return (
      <BlockFrame
        title={competitiveRivals.title}
        question={competitiveRivals.question}
        mode={mode}
        meta={r.selected ? r.selected.name : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        <div className={email ? undefined : 'flex flex-wrap items-center gap-1.5'}>
          {r.options.map((o) => <Option key={o.audience} option={o} mode={mode} />)}
        </div>
        {!r.identityRecorded && r.options.length > 0 ? (
          <p
            className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 } : undefined}
          >
            {UNRECORDED}
          </p>
        ) : null}
      </BlockFrame>
    )
  },

  // NO FIGURES. "N of their videos read since we started" is a count of the corpus, not a
  // reading of a month; the shares are the standings' to declare. The pill says
  // that span out loud rather than leaving it here (D15).
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.rivals.empty
  },
}

export { UNRECORDED as RIVALS_UNRECORDED }
