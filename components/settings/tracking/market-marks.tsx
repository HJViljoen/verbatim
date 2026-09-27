import Link from 'next/link'
import type { ReactNode } from 'react'

import { Section, SectionHead } from '@/components/settings/chrome'
import { fmtInt, longMonth } from '@/lib/format'
import { LEAD_MAX_MAKER_SHARE, MAKER_GROUP_SHARE, MAKER_NOTE_SHARE } from '@/lib/pages/overview-market/board'
import { levelText } from '@/lib/reading/level'
import type { MakerState, SegmentCounts } from '@/lib/settings/your-market'

// Settings › What we read: "Makers" and "This is not my market" (market-first
// WP3.10; the approved "What we read" artboard's last two blocks). Each is its
// title alone, a one-line answer, the rows and a footer of links only (the 25
// Sep rulings).
//
// EACH CLAIM IS ONE THE CODE KEEPS (GS constraint 8), which is where these
// part from the artboard:
//   - Makers' four rules are decision F's, at the shares board.ts applies
//     (MAKER_GROUP_SHARE, MAKER_NOTE_SHARE, LEAD_MAX_MAKER_SHARE), and its
//     figure is the reading month's, as every other block on this page is
//     (the artboard read August and September together). The artboard's view
//     switch ("Everything · Buyers · Makers, from late November") and its "we
//     ask you on the 13 Oct call" are not drawn: the views are WP3.3's, and the
//     call has no fixed date (plan §3.7).
//   - "This is not my market" says what a mark does today: a label, never a
//     deletion (lib/segments/override.ts): the video is marked off-topic and
//     stays in every count. The artboard's three steps (a menu on every video,
//     account or quote; set aside from the next update; put it back) are not
//     drawn: the entry points on the pages, an account as a target and the
//     undo are not built, and a copy line may not promise them.

const NOT_MEASURED = 'not measured'

/** "a half", "a fifth", "a quarter": the three shares decision F names. */
const SHARE_WORDS = new Map<number, string>([[0.5, 'half'], [0.2, 'a fifth'], [0.25, 'a quarter']])
const shareWords = (share: number): string => SHARE_WORDS.get(share) ?? `${Math.round(share * 100)}%`

function Line({ children }: { children: ReactNode }) {
  return <p className="m-0 max-w-[720px] text-[13px] leading-[1.5] text-secondary-foreground">{children}</p>
}

function Rule({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-y-0.5 border-t border-border/70 py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-x-4">
      <dt className="text-[12.5px] font-semibold text-foreground">{label}</dt>
      <dd className="m-0 text-[12.5px] leading-[1.5] text-secondary-foreground">{children}</dd>
    </div>
  )
}

function Level({ k, n }: { k: number; n: number }) {
  const l = levelText(k, n)
  return <span data-copy="level" className="font-mono font-semibold text-foreground">{l?.text ?? NOT_MEASURED}{l?.kind === 'share' ? ` of ${fmtInt(n)}` : ''}</span>
}

/** Decision F's rules, in the words the artboard gives them. */
export const MAKER_RULES: readonly { label: string; words: string }[] = [
  { label: 'Kept', words: 'Makers stay in your market’s size, subjects, kinds of comment and mood.' },
  { label: 'Grouped', words: `A theme where ${shareWords(MAKER_GROUP_SHARE)} or more of the videos are makers’ becomes one makers line.` },
  { label: 'Marked', words: `A theme where ${shareWords(MAKER_NOTE_SHARE)} or more of the videos are makers’ prints its maker share.` },
  { label: 'Not quoted', words: `The headline quotes only a theme that is ${shareWords(LEAD_MAX_MAKER_SHARE)} makers or fewer.` },
]

/**
 * MAKERS. Drawn only where a maker rule is switched on for the workspace
 * (Össur has none, plan §2.13: no makers line and no "buyer"). Before MF1 the
 * figure reads "not measured".
 */
export function MakersSection({
  month, makers, counts, conversationLabel, conversationHref,
}: {
  month: string
  makers: MakerState
  counts: SegmentCounts | null
  conversationLabel: string
  conversationHref: string
}) {
  if (makers === 'no_rule') return null
  const m = longMonth(month)
  return (
    <Section id="makers">
      <SectionHead title="Makers" />
      {makers === 'measured' && counts && counts.category > 0 ? (
        <Line>
          In {m}, makers’ own videos (sewing, crochet and DIY) are <Level k={counts.categoryMakers} n={counts.category} /> category videos in your market.
        </Line>
      ) : (
        <Line>{NOT_MEASURED}</Line>
      )}
      <dl className="m-0 flex max-w-[720px] flex-col">
        {MAKER_RULES.map((r) => <Rule key={r.label} label={r.label}>{r.words}</Rule>)}
      </dl>
      <p className="m-0 text-[12.5px]">
        <Link href={conversationHref} className="font-medium hover:underline">See the makers line on {conversationLabel} →</Link>
      </p>
    </Section>
  )
}

/**
 * THIS IS NOT MY MARKET. What a mark does, and what is set aside and by whom:
 * by you (the videos whose newest override marks them off-topic), by us (the
 * month's market videos marked off-topic) and by rule (what the market never
 * holds).
 */
export function NotMyMarketSection({
  month, byYou, counts, makers = 'measured',
}: {
  month: string
  /** Videos you marked; null where the table is not there. */
  byYou: number | null
  counts: SegmentCounts | null
  /** 'no_rule': no maker or off-topic rule is on for the workspace (Össur),
   *  so nothing is marked by us, and the line says why rather than "not
   *  measured". */
  makers?: MakerState
}) {
  const m = longMonth(month)
  return (
    <Section id="not-my-market">
      <SectionHead title="This is not my market" />
      {/* Where no off-topic rule is on (Össur), no page groups or marks
          off-topic videos (the board's segments read 'no_rule'), so the line
          promises only what the mark does there: the row, and every count. */}
      <Line>
        Tell us when something we read is not your market, and we mark it off-topic.{' '}
        {makers === 'no_rule' ? 'It stays in every count.' : 'It stays in every count, marked, and is grouped with the off-topic videos.'}
      </Line>
      <div className="max-w-[720px] rounded-[4px] bg-inner px-4 py-3">
        <p className="m-0 pb-2 text-[12.5px] font-semibold">Set aside</p>
        <dl className="m-0 flex flex-col">
          <Rule label="By you">
            {byYou == null ? NOT_MEASURED : byYou === 0 ? 'nothing yet' : <><span data-copy="figure" className="font-mono font-semibold text-foreground">{fmtInt(byYou)}</span> {byYou === 1 ? 'video' : 'videos'} you marked</>}
          </Rule>
          <Rule label="By us">
            {makers === 'no_rule'
              ? 'nothing: no off-topic rule is switched on for your workspace.'
              : counts && counts.market > 0
                ? <>off-topic videos, such as those a bare brand name found about something else: <Level k={counts.marketNoise} n={counts.market} /> market videos in {m}.</>
                : NOT_MEASURED}
          </Rule>
          <Rule label="By rule">your own posts, and the comments under brands’ own posts. Neither is counted in your market.</Rule>
        </dl>
      </div>
    </Section>
  )
}
