import { PlatformIcon } from '@/components/charts/platform-icon'
import { Figure, GridRow, GridTable, Section, SectionHead } from '@/components/settings/chrome'
import { fmtInt, longMonth } from '@/lib/format'
import { levelText } from '@/lib/reading/level'
import {
  biggestSearchLine,
  searchCapLine,
  type MakerState,
  type PlatformShare,
  type SearchPlan,
  type TermShare,
} from '@/lib/settings/your-market'

// Settings › Tracking › Your market (market-first plan §2.10 D5, WP3.10; the
// approved preview's "What we read" artboard: "Where your market came from",
// "Where we read it" and "Searches each update"). Three sections at the top of
// Tracking, each its title alone with a one-line answer under it (the 25 Sep
// rulings): the market's size, each search's share of it with the makers among
// them, and the market's platforms beside the search cap. Every part that has
// no table behind it reads "not measured", never a zero.

/** At most twelve rows in any block (decision B). */
export const SEARCH_ROWS = 12

const NOT_MEASURED = 'not measured'

function Line({ children }: { children: React.ReactNode }) {
  return <p className="m-0 max-w-[720px] text-[13px] leading-[1.5] text-secondary-foreground">{children}</p>
}

/** "84%" at 100 videos or more, "44 of 85" under them (`levelText`). */
function level(k: number, n: number): string {
  return levelText(k, n)?.text ?? NOT_MEASURED
}

export function YourMarketSize({ month, videos }: { month: string; videos: number | null }) {
  return (
    <Section className="border-t-0 pt-0">
      <SectionHead title="Your market" />
      {videos == null ? (
        <Line>{NOT_MEASURED}</Line>
      ) : (
        <Line>
          Everything we read except your own posts:{' '}
          <span data-copy="figure" className="font-mono font-semibold text-foreground">{fmtInt(videos)}</span> videos in {longMonth(month)}.
        </Line>
      )}
    </Section>
  )
}

const SEARCH_COLS = 'minmax(180px,1fr) 120px 90px 120px'
const SEARCH_ALIGN = ['left', 'right', 'right', 'right'] as const

export function WhereItCameFrom({
  month, marketVideos, terms, makers,
}: {
  month: string
  /** The month's market videos, or null where MF1 is not there. */
  marketVideos: number | null
  /** Each search's videos, or null where `video_provenance` is not there. */
  terms: { rows: readonly TermShare[]; unknown: number } | null
  makers: MakerState
}) {
  const m = longMonth(month)
  if (marketVideos == null || terms == null) {
    return (
      <Section>
        <SectionHead title="Where your market came from" />
        <Line>{NOT_MEASURED}</Line>
      </Section>
    )
  }
  const top = biggestSearchLine(terms.rows)
  const shown = terms.rows.slice(0, SEARCH_ROWS)
  const makersCell = (r: TermShare) =>
    makers === 'measured' && r.makers != null ? fmtInt(r.makers) : makers === 'no_rule' ? 'no rule' : NOT_MEASURED
  return (
    <Section>
      <SectionHead title="Where your market came from" />
      {top == null ? (
        <Line>No video in {m} carries a record of the search that found it yet.</Line>
      ) : top.mostlyMakers && top.makers != null ? (
        <Line>
          Your biggest search, <span className="font-mono">{top.search}</span>, finds mostly makers:{' '}
          <span data-copy="level">
            <span className="font-mono font-semibold text-foreground">{level(top.makers, top.videos)}</span>
            {levelText(top.makers, top.videos)?.kind === 'share' ? ` of ${fmtInt(top.videos)} videos` : ' videos'}
          </span>.
        </Line>
      ) : (
        <Line>
          Your biggest search, <span className="font-mono">{top.search}</span>, found{' '}
          <span data-copy="level">
            <span className="font-mono font-semibold text-foreground">{level(top.videos, marketVideos)}</span>
            {levelText(top.videos, marketVideos)?.kind === 'share' ? ` of ${fmtInt(marketVideos)} ${m} videos` : ` ${m} videos`}
          </span>.
        </Line>
      )}
      {shown.length > 0 ? (
        <GridTable
          cols={SEARCH_COLS}
          min={540}
          align={SEARCH_ALIGN}
          head={['Search', `Videos, ${m.slice(0, 3)} (of ${fmtInt(marketVideos)})`, 'Share', 'Makers of them']}
        >
          {shown.map((r) => (
            <GridRow
              key={r.search}
              cols={SEARCH_COLS}
              align={SEARCH_ALIGN}
              cells={[
                <span key="s" className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-mono text-[12.5px]">{r.search}</span>
                  {makers === 'measured' && r.makers != null && r.videos > 0 && r.makers / r.videos >= 0.5
                    ? <span className="shrink-0 text-[11px] text-muted-foreground">mostly makers</span>
                    : null}
                </span>,
                <Figure key="v" value={fmtInt(r.videos)} />,
                // The base is the column head's ("of 654"), so the cell is a figure.
                <span key="p" data-copy="figure"><Figure value={level(r.videos, marketVideos)} muted /></span>,
                <Figure key="m" value={makersCell(r)} muted={makers !== 'measured'} />,
              ]}
            />
          ))}
        </GridTable>
      ) : null}
      {terms.rows.length > SEARCH_ROWS ? (
        <Line>{fmtInt(SEARCH_ROWS)} of {fmtInt(terms.rows.length)} searches shown.</Line>
      ) : null}
      {terms.unknown > 0 && top != null ? (
        <Line>{fmtInt(terms.unknown)} of {m}’s {fmtInt(marketVideos)} videos carry no record of the search that found them.</Line>
      ) : null}
    </Section>
  )
}

const MIX_COLS = 'minmax(160px,1fr) 120px 90px'
const MIX_ALIGN = ['left', 'right', 'right'] as const
const PLAN_COLS = 'minmax(160px,1fr) 120px 120px'

export function WhereWeReadIt({
  month, marketVideos, mix, plan,
}: {
  month: string
  marketVideos: number | null
  mix: readonly PlatformShare[] | null
  plan: SearchPlan
}) {
  const m = longMonth(month)
  const two = mix && mix.length >= 2 ? mix[0].videos + mix[1].videos : null
  return (
    <Section>
      <SectionHead title="Where we read it" />
      {mix == null || marketVideos == null ? (
        <Line>{NOT_MEASURED}</Line>
      ) : (
        <>
          {two != null && marketVideos > 0 ? (
            <Line>
              {mix[0].label} and {mix[1].label} hold{' '}
              <span data-copy="level">
                <span className="font-mono font-semibold text-foreground">{level(two, marketVideos)}</span>
                {levelText(two, marketVideos)?.kind === 'share' ? ` of ${fmtInt(marketVideos)} market videos in ${m}` : ` market videos in ${m}`}
              </span>.
            </Line>
          ) : null}
          <GridTable cols={MIX_COLS} min={400} align={MIX_ALIGN} head={['Platform', `Videos, ${m.slice(0, 3)} (of ${fmtInt(marketVideos)})`, 'Share']}>
            {mix.map((p) => (
              <GridRow
                key={p.platform}
                cols={MIX_COLS}
                align={MIX_ALIGN}
                cells={[
                  <span key="n" className="inline-flex items-center gap-2 text-[12.5px] font-medium">
                    <PlatformIcon platform={p.platform} size={14} className="text-secondary-foreground" />
                    {p.label}
                  </span>,
                  <Figure key="v" value={fmtInt(p.videos)} />,
                  <span key="s" data-copy="figure"><Figure value={level(p.videos, marketVideos)} muted /></span>,
                ]}
              />
            ))}
          </GridTable>
        </>
      )}
      <h4 className="m-0 pt-2 text-[12.5px] font-semibold">Searches each update</h4>
      <Line>
        <span data-copy="level" className="font-mono font-semibold text-foreground">{searchCapLine(plan)}</span>
      </Line>
      <GridTable cols={PLAN_COLS} min={400} align={MIX_ALIGN} head={['Group', 'Terms', 'Searches']}>
        {plan.groups.map((g) => (
          <GridRow
            key={g.key}
            cols={PLAN_COLS}
            align={MIX_ALIGN}
            cells={[
              <span key="g" className="text-[12.5px]">{g.label}</span>,
              <Figure key="t" value={g.key === 'communities' ? `${fmtInt(g.terms)} on Reddit` : fmtInt(g.terms)} muted />,
              <Figure key="s" value={fmtInt(g.searches)} />,
            ]}
          />
        ))}
      </GridTable>
    </Section>
  )
}
