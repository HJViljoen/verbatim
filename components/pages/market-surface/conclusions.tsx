import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { TierChip, tierMetaLine } from './tier'
import { fmtInt } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { ConclusionRow, MarketSurfaceData } from '@/lib/pages/market-surface'

// MK1 · What we concluded this month (design §3 MK1).
//
// THE TIER CHIP IS SHOWN EXACTLY AS BUILT. The design's gate is one sentence —
// "a conclusion below the evidence bar is labelled, not hidden" — and on both
// tenants the conclusion the model is MOST confident about (10 of 10) is the
// one with no grounding at all, which is precisely the row the gate exists for.
// It is drawn with everyone else's, wearing "Early signal".
//
// THE CHIPS LINK INTO VOICE, which is the design's "each beside the theme it
// came from". A chip carries a theme SLUG, which is what `/dashboard/voice
// ?themes=` narrows on; the registry id is the cross-run identity (AGENTS.md)
// and is not what this link is for — it is a filter on the update's own themes.
//
// THE MODEL'S WORDS ARE MARKED `stored`, NOT `prose`. The title and the
// description are Pass D-a's, written at some past update and read back out of
// a column; `prose` means "composed for this page", and the difference is not
// pedantry — 22 of 135 stored conclusions carry a numeral (gap-05 §2) and one
// of today's says "before curiosity turns into distrust or drop-off", so
// marking them `prose` fails rules (a) and (c) on correct copy. The marker
// names the slot (`pass_d_a_insight`, policy `digits`), so a reader can see
// what was adjudicated and what was not. The count beside them is code's and
// stays `figure`.

function Row({ row, mode, appUrl, corpus }: { row: ConclusionRow; mode: RenderMode; appUrl: string; corpus: number | null }) {
  const email = mode === 'email'
  // THE DENOMINATOR IS PRINTED. `distinctVideos` counts over the WHOLE corpus
  // (Össur: 1,699 analysed videos), and "301 videos behind it" directly under
  // "What we concluded this month" — beside a page bar reading "September 2026"
  // and a Competitive surface saying September held 449 — reads as a share of
  // the month that does not exist.
  const count = (
    <span data-copy="figure" className={email ? undefined : 'font-mono text-[11.5px] tabular-nums text-muted-foreground'} style={email ? { fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.muted } : undefined}>
      {corpus != null
        ? <>{fmtInt(row.videos)} of {fmtInt(corpus)} videos behind it</>
        : <>{fmtInt(row.videos)} {row.videos === 1 ? 'video' : 'videos'} behind it</>}
    </span>
  )
  const chips = row.themes.map((t) => {
    const href = `${appUrl}/dashboard/voice?themes=${encodeURIComponent(t.slug)}`
    const label = t.label ?? t.slug
    return email
      ? <a key={t.slug} href={href} style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.ink2, marginRight: 8 }}>{label}</a>
      : <Link key={t.slug} href={href} className="rounded-full bg-inner px-2 py-0.5 text-[11px] text-secondary-foreground hover:bg-tile">{label}</Link>
  })

  if (email) {
    return (
      <div style={{ padding: '6px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        <div data-copy="stored" data-slot="pass_d_a_insight" style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>{row.title}</div>
        <div style={{ marginTop: 3 }}><TierChip tier={row.tier} mode={mode} /> {count}</div>
        <div data-copy="stored" data-slot="pass_d_a_insight" style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 3 }}>{row.description}</div>
        {chips.length > 0 ? <div style={{ marginTop: 3 }}>{chips}</div> : null}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-border/70 pt-2">
      <p data-copy="stored" data-slot="pass_d_a_insight" className="m-0 text-[13px] font-medium">{row.title}</p>
      <span className="flex flex-wrap items-center gap-2"><TierChip tier={row.tier} mode={mode} /> {count}</span>
      <p data-copy="stored" data-slot="pass_d_a_insight" className="m-0 text-[12.5px] text-secondary-foreground">{row.description}</p>
      {chips.length > 0 ? <span className="flex flex-wrap items-center gap-1.5">{chips}</span> : null}
    </div>
  )
}

export const marketConclusions: Block<MarketSurfaceData> = {
  key: 'market.conclusions',
  title: 'What we concluded this month',
  question: 'What has the conversation told us?',

  render(data, mode = 'app', ctx) {
    const c = data.conclusions
    const email = mode === 'email'
    const empty = marketConclusions.emptyState(data)
    // THE CHIPS' OWN WORDS. This read "5 confirmed · 1 early · 0 below the
    // bar" — `confirmed` is the internal GateTier key — beside chips reading
    // "Strong evidence" / "Early signal" / "Below the evidence bar".
    const meta = tierMetaLine({ confirmed: c.counts.confirmed, early: c.counts.early, archive: c.belowBar })

    return (
      <BlockFrame title={marketConclusions.title} question={marketConclusions.question} mode={mode} meta={meta}>
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        <div className={email ? undefined : 'flex min-w-0 flex-col gap-2'}>
          {c.rows.map((row) => <Row key={row.id} row={row} mode={mode} appUrl={ctx.appUrl} corpus={c.corpusVideos} />)}
        </div>
        <p
          className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 } : undefined}
        >
          {/* THE SORT IS PRINTED, not implied. The design asks for tier and
              then the size of the MOVEMENT behind each conclusion, and the
              movement is not computable: a conclusion cites audience_insight
              ids and the monthly reading is keyed on theme_registry ids, with
              nothing joining the two. So the second key is the size of the
              evidence, and a reader is told which one they are looking at. */}
          Ordered by {c.sortedBy}. {c.corpusLine}
        </p>
      </BlockFrame>
    )
  },

  // NO FIGURES. The counts on this block are counts of the model's own
  // conclusions and of the videos behind them — evidence, not a reading of the
  // month. A number budget counts readings.
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.conclusions.empty
  },
}
