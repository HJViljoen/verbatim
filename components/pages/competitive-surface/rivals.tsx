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
      {option.analysed != null && option.analysed > 0 ? <> · <span data-copy="figure">{fmtInt(option.analysed)}</span> of their videos read</> : null}
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

  // NO FIGURES. "N of their videos read" is a count of the corpus, not a
  // reading of a month; the shares are the standings' to declare.
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.rivals.empty
  },
}

export { UNRECORDED as RIVALS_UNRECORDED }
