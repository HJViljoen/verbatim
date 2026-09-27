import type { ReactNode } from 'react'

import { fmtInt, longMonth } from '@/lib/format'
import { LEAD_MAX_MAKER_SHARE, MAKER_GROUP_SHARE, MAKER_NOTE_SHARE, THEME_FLOOR } from '@/lib/pages/overview-market/board'
import { levelText } from '@/lib/reading/level'
import type { MakerState, SegmentCounts } from '@/lib/settings/your-market'

import { Card, CardLink, Fig } from './card'

// Settings › What we read: "Makers" and "This is not my market" (market-first
// WP3.10; the approved "What we read" artboard's last two cards, side by
// side). Each is its title alone, a one-line answer, the rows and a footer of
// links only (the 25 Sep rulings).
//
// EACH CLAIM IS ONE THE CODE KEEPS (GS constraint 8), which is where these
// part from the artboard's words:
//   - Makers' four rules are decision F's, at the shares board.ts applies
//     (MAKER_GROUP_SHARE, MAKER_NOTE_SHARE, LEAD_MAX_MAKER_SHARE), and its
//     figure is the reading month's, as every other card on this page is,
//     with its base (the artboard read August and September together, and no
//     base). The view switch is drawn as the artboard draws it: Everything
//     on, Buyers and Makers not yet, "from late November" (lib/views: both
//     switches stay off until WP3.2's check after the November judge run).
//     The call has no date in anything a client reads (plan §3.7, 26 Sep), so
//     it is "our next call".
//   - "This is not my market" says what a mark does today: a label, never a
//     deletion (lib/segments/override.ts). The video is marked off-topic and
//     stays in every count until the off-topic videos leave it, from late
//     November (lib/views `setAside`, decision F). The pages carry no menu to
//     mark a video yet and an account is not a target yet, so the first step
//     is to tell us which video or quote, and the mark is counted here.

const NOT_MEASURED = 'not measured'

/** "half", "a fifth", "a quarter": the three shares decision F names. */
const SHARE_WORDS = new Map<number, string>([[0.5, 'half'], [0.2, 'a fifth'], [0.25, 'a quarter']])
const shareWords = (share: number): string => SHARE_WORDS.get(share) ?? `${Math.round(share * 100)}%`

/** Decision F's rules, in the words the artboard gives them. */
export const MAKER_RULES: readonly { label: string; words: string }[] = [
  { label: 'Kept', words: 'Makers stay in your market’s size, subjects, kinds of comment and mood.' },
  { label: 'Grouped', words: `A theme where ${shareWords(MAKER_GROUP_SHARE)} or more of the videos are makers’ becomes one makers line.` },
  { label: 'Marked', words: `A theme where ${shareWords(MAKER_NOTE_SHARE)} or more of the videos are makers’ prints its maker share.` },
  { label: 'Not quoted', words: `The headline quotes only a theme that is ${shareWords(LEAD_MAX_MAKER_SHARE)} makers or fewer.` },
]

// Written out in full, so Tailwind's scanner sees both.
const RULE_COLS = { '96px': 'sm:grid-cols-[96px_minmax(0,1fr)]', '104px': 'sm:grid-cols-[104px_minmax(0,1fr)]' } as const

function Rules({ label, children, last = false, labelWidth }: { label: string; children: ReactNode; last?: boolean; labelWidth: keyof typeof RULE_COLS }) {
  return (
    <div className={`grid grid-cols-1 items-baseline gap-x-4 gap-y-1 py-3 ${RULE_COLS[labelWidth]} ${last ? '' : 'border-b border-border/60'}`}>
      <dt className="text-[15px] font-semibold">{label}</dt>
      <dd className="m-0 text-[15px] leading-[1.55] text-secondary-foreground [text-wrap:pretty]">{children}</dd>
    </div>
  )
}

/** The makers line the pages draw this month: the maker-led themes at the
 *  floor, and the two biggest of them. */
export interface MakersLine { count: number; lead: readonly { label: string; k: number }[] }

/**
 * MAKERS. Drawn only where a maker rule is switched on for the workspace
 * (Össur has none, plan §2.13: no makers line and no "buyer"). Before MF1 the
 * figure reads "not measured".
 */
export function MakersCard({
  month, makers, counts, line = null, askOnCall = false, conversationLabel, conversationHref,
}: {
  month: string
  makers: MakerState
  counts: SegmentCounts | null
  /** The month's makers line; null where it was not read. */
  line?: MakersLine | null
  /** Whether makers are part of the market is a question for our next call
   *  (the trial's: plan §1, decision F). */
  askOnCall?: boolean
  conversationLabel: string
  conversationHref: string
}) {
  if (makers === 'no_rule') return null
  const m = longMonth(month)
  const l = makers === 'measured' && counts && counts.category > 0 ? levelText(counts.categoryMakers, counts.category) : null
  return (
    <Card id="makers" span={6} title="Makers" footer={<CardLink href={conversationHref}>See the makers line on {conversationLabel}</CardLink>}>
      {l && counts ? (
        <div data-copy="level" className="flex items-baseline gap-4">
          <span className="font-mono text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{l.kind === 'share' ? l.text : fmtInt(counts.categoryMakers)}</span>
          <span className="text-[15px] leading-[1.5] text-secondary-foreground">
            of <Fig n={counts.category} /> category videos in your market in {m} are makers’ own: sewing, crochet and DIY.
          </span>
        </div>
      ) : (
        <p className="m-0 text-[15px] text-muted-foreground">{NOT_MEASURED}</p>
      )}
      <dl className="m-0 flex flex-col">
        {MAKER_RULES.map((r, i) => (
          <Rules key={r.label} label={r.label} last={i === MAKER_RULES.length - 1} labelWidth="96px">
            {r.words}
            {r.label === 'Grouped' && line && line.count > 0 ? (
              <>
                {' '}In {m}: <Fig n={line.count} /> {line.count === 1 ? 'theme' : 'themes'} at {fmtInt(THEME_FLOOR)} or more
                {line.lead.length > 0 ? (
                  <>, led by {line.lead.map((t, i) => (
                    <span key={t.label}>
                      {i > 0 ? ' and ' : ''}
                      <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span> (<Fig n={t.k} />)
                    </span>
                  ))}</>
                ) : null}.
              </>
            ) : null}
          </Rules>
        ))}
      </dl>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div role="group" aria-label="View" className="inline-flex h-11 items-center gap-1 rounded-lg bg-inner px-1">
            <button type="button" aria-pressed="true" className="inline-flex h-9 items-center rounded-[4px] bg-tile px-3.5 text-[14px] font-semibold shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(38,41,44,.06)]">Everything</button>
            <button type="button" disabled className="inline-flex h-9 cursor-not-allowed items-center rounded-[4px] px-3.5 text-[14px] font-medium text-muted-foreground">Buyers</button>
            <button type="button" disabled className="inline-flex h-9 cursor-not-allowed items-center rounded-[4px] px-3.5 text-[14px] font-medium text-muted-foreground">Makers</button>
          </div>
          <span className="font-mono text-[13px] text-muted-foreground">from late November</span>
        </div>
        {askOnCall ? (
          <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">We ask you on our next call whether makers are part of your market.</p>
        ) : null}
      </div>
    </Card>
  )
}

/**
 * THIS IS NOT MY MARKET. What a mark does, in three steps, and what is set
 * aside and by whom: by you (the videos whose newest override marks them
 * off-topic), by us (the month's market videos marked off-topic) and by rule
 * (what the market never holds).
 */
export function NotMyMarketCard({
  month, byYou, counts, makers = 'measured', span = 6,
}: {
  month: string
  /** Videos you marked; null where the table is not there. */
  byYou: number | null
  counts: SegmentCounts | null
  /** 'no_rule': no maker or off-topic rule is on for the workspace (Össur),
   *  so nothing is marked by us, and nothing leaves a count. */
  makers?: MakerState
  span?: 6 | 12
}) {
  const m = longMonth(month)
  const ruled = makers !== 'no_rule'
  const steps: ReactNode[] = [
    <>
      Tell us which video or quote, and we give it the mark:
      <span className="mt-2 block">
        <span className="inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-[4px] bg-tile px-2 align-[1px] text-[13px] font-medium text-foreground ring-1 ring-border">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg>
          This is not my market
        </span>
      </span>
    </>,
    ruled
      ? 'It is marked off-topic and stays in every count until late November, when off-topic videos leave your count in the months still filling. A month that is already final keeps what it was read with.'
      : 'It is marked off-topic and stays in every count.',
    'It is counted here, as set aside by you.',
  ]
  return (
    <Card id="not-mine" span={span} title="This is not my market">
      <p className="-mt-2 mb-0 max-w-[460px] text-[17px] font-medium leading-[1.5] tracking-[-0.01em] [text-wrap:pretty]">
        Tell us when something we read is not your market, and we mark it off-topic.
      </p>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3">
            <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-full font-mono text-[13px] font-semibold text-secondary-foreground ring-1 ring-inset ring-neutral-seg">{i + 1}</span>
            <span className="text-[15px] leading-[1.55] text-secondary-foreground [text-wrap:pretty]">{s}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1 rounded-lg bg-inner px-6 pb-2 pt-6">
        <h3 className="m-0 mb-1 text-[15px] font-semibold">Set aside</h3>
        <dl className="m-0 flex flex-col">
          <Rules label="By you" labelWidth="104px">
            {byYou == null ? NOT_MEASURED : byYou === 0
              ? <span className="text-muted-foreground">nothing yet</span>
              : <><Fig n={byYou} /> {byYou === 1 ? 'video' : 'videos'} you marked</>}
          </Rules>
          <Rules label="By us" labelWidth="104px">
            {!ruled
              ? 'nothing: no off-topic rule is switched on for your workspace.'
              : counts && counts.market > 0
                ? <>off-topic videos, such as those a bare brand name found about something else: <OffTopic k={counts.marketNoise} n={counts.market} /> in {m}. From late November they leave your count, and the count says so.</>
                : NOT_MEASURED}
          </Rules>
          <Rules label="By rule" labelWidth="104px" last>your own posts, and the comments under brands’ own posts. Neither is counted in your market.</Rules>
        </dl>
      </div>
    </Card>
  )
}

/** "8% of 654 market videos", or "5 of 60 market videos" under 100. */
function OffTopic({ k, n }: { k: number; n: number }) {
  const l = levelText(k, n)
  return (
    <span data-copy="level">
      <span className="font-mono font-semibold tabular-nums text-foreground">{l?.kind === 'share' ? l.text : fmtInt(k)}</span> of <Fig n={n} /> market videos
    </span>
  )
}
