import type { ReactNode } from 'react'
import { CARD, EmptyBox, FlagChip, GoLink } from '@/components/v2'
import { LBL } from '@/components/v2/look'
import { fmtInt, longMonth } from '@/lib/format'
import {
  sharePct, type FirstStandout, type FocusStandout, type GapStandout, type GeneralStandout, type PraisedStandout, type SlotKey, type SlotTier, type Standout, type StandoutSlot,
} from '@/lib/pages/v2/products'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'
import { MidFigure, OfIts, VerdictBadge } from './parts'

// THE STANDOUTS (the four cards across the top; since the audit design, 7
// Nov, drawn to Products.dc.html in ONE treatment: the place's label and
// where it sits, the title, a figure with its words under a hairline, one
// sentence, then "Open {name}"). Each is picked by code (`pickStandouts`,
// lib/pages/v2/products.ts) from the month's counts and crosses, and says only
// what those carry: no model prose, no quote and no weekly direction word
// (Heinrich's v2 rules, decision 1). The one comparison a card can make (a
// subject a category carries far more than one of your products there) is a
// `Verdict`, and the card is drawn only where its band clears. The per-card
// charts (the month dots, the squares, the share rows) are gone: the figure
// and its words say what they drew.
//
// THE FOUR PLACES ARE ALWAYS DRAWN (the parity pass, 13 Oct night). A place
// nothing reached is filled with the month's nearest honest card
// (`standoutSlots`, tier `next`), worded for what it is, or keeps its frame
// and says why in the dashed box (tier `none`, decision 4). A page that reads
// no month draws the four frames alone (`StandoutFrames`).

/** The card's head: the kind of standout as a label (a flag chip for a
 *  picked first month, which is a verdict), and where it sits. */
function Head({ word, where, flag }: { word: string; where?: string; flag?: FirstStandout['flag'] }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1">
      {flag ? <FlagChip verdict={flag} /> : <p className={cn('m-0', LBL)}>{word}</p>}
      {where ? <span className="text-[13px] text-muted-foreground">{where}</span> : null}
    </div>
  )
}

function Title({ children }: { children: ReactNode }) {
  return <h2 className="m-0 text-[18px] font-semibold leading-[1.35] text-foreground">{children}</h2>
}

function Sub({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[14px] leading-[1.5] text-secondary-foreground">{children}</p>
}

function Foot({ href, name }: { href: string | null; name: string | null }) {
  return (
    <div className="mt-auto flex min-h-[20px] items-center pt-1">
      {href && name ? <GoLink href={href}>Open {name}</GoLink> : null}
    </div>
  )
}

/** Each place's label, the board's words (the praise place in the page's
 *  own: "Praise in the comments", since praise there may be about anything
 *  in the video). */
export const SLOT_WORDS: Readonly<Record<SlotKey, string>> = {
  first: 'New',
  category: 'Category, not you',
  praised: 'Praise in the comments',
  focus: 'Worth a look',
}

/** "Every", "Almost every", "Most": the share in words, decided here from
 *  the level (never from a model). */
export function shareWords(k: number, n: number): 'Every' | 'Almost every' | 'Most' {
  if (n > 0 && k >= n) return 'Every'
  if (n > 0 && k / n >= 0.75) return 'Almost every'
  return 'Most'
}

function FirstCard({ s, monthName, tier }: { s: FirstStandout; monthName: string; tier: SlotTier }) {
  const names = (s.others ?? []).map((o) => o.name)
  return (
    <>
      {/* A first month under the standout's floor is new, but its one or two
          videos earn no flag: the label says it in words. */}
      <Head word={SLOT_WORDS.first} where={s.where} flag={tier === 'pick' ? s.flag : undefined} />
      <Title>{s.name} came up for the first time</Title>
      <MidFigure value={s.videos}>{s.videos === 1 ? 'video' : 'videos'} in {monthName}</MidFigure>
      {names.length > 0
        ? <Sub>Also new in {monthName}: {names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}.</Sub>
        : s.lead ? <Sub><OfIts k={s.lead.k} n={s.lead.n} /> are about {s.lead.label}.</Sub> : null}
    </>
  )
}

function GapCard({ s }: { s: GapStandout }) {
  // The label says which side carries the subject, from the pair itself
  // (the product's share against the category's), in no direction word.
  const less = s.product.k * s.category.n < s.category.k * s.product.n
  return (
    <>
      <Head word={less ? 'Category, not you' : 'You, more than the category'} where={s.where} />
      <Title>
        {less
          ? <>{s.subject} is a {s.where.toLowerCase()} matter, not a {s.product.name} one</>
          : <>{s.subject} stands out on {s.product.name}</>}
      </Title>
      <MidFigure value={s.product.k} of={s.product.n}>{s.product.name} videos are about {s.subject} <span data-copy="figure">({sharePct(s.product.k, s.product.n)})</span></MidFigure>
      <Sub>
        All {s.where.toLowerCase()}: <span data-copy="level">{fmtInt(s.category.k)} of {fmtInt(s.category.n)}</span> videos, <span data-copy="figure">{sharePct(s.category.k, s.category.n)}</span>. <VerdictBadge verdict={s.verdict} />
      </Sub>
    </>
  )
}

function GeneralCard({ s, monthName }: { s: GeneralStandout; monthName: string }) {
  const word = s.name.toLowerCase()
  // The title says what the split says: mostly in general (the pick's bar),
  // else mostly yours, else neither (a `next` card reads under the bar).
  const title = s.inGeneral.k * 2 > s.inGeneral.n
    ? <>{s.name} talk is mostly about {word} in general</>
    : s.yours.k * 2 > s.yours.n
      ? <>Most {word} talk names one of your products</>
      : <>{s.name} talk, yours against the category in general</>
  return (
    <>
      <Head word={SLOT_WORDS.category} where={s.where} />
      <Title>{title}</Title>
      <MidFigure value={s.inGeneral.k} of={s.inGeneral.n}>name none of your products <span data-copy="figure">({sharePct(s.inGeneral.k, s.inGeneral.n)})</span></MidFigure>
      <Sub>
        Of the <span data-copy="figure">{fmtInt(s.inGeneral.n)}</span> videos about {word} in {monthName}, <span data-copy="figure">{fmtInt(s.yours.k)}</span> <span data-copy="figure">({sharePct(s.yours.k, s.yours.n)})</span> {s.yours.k === 1 ? 'names' : 'name'} one of yours.
      </Sub>
    </>
  )
}

/** WHAT IS COUNTED: the videos that name it AND carry praise in their
 *  comments (an insight of the praise kind, lib/reading/cross.ts). The
 *  praise may be about something else in the video, so the card says
 *  "praise in the comments", never that the product is praised. Under the
 *  pick's bar (half its videos) the title claims no share: the figure does. */
function PraisedCard({ s, tier }: { s: PraisedStandout; tier: SlotTier }) {
  const q = shareWords(s.praised.k, s.praised.n)
  return (
    <>
      <Head word={SLOT_WORDS.praised} where={s.where} />
      <Title>
        {tier !== 'pick'
          ? <>{s.name} videos with praise in their comments</>
          : q === 'Most' ? <>Most {s.name} videos have praise in their comments</> : <>{q} {s.name} video has praise in its comments</>}
      </Title>
      <MidFigure value={s.praised.k}>of its <span data-copy="figure">{fmtInt(s.praised.n)}</span> videos</MidFigure>
      <Sub>Videos that name it with praise in their comments, about it or about anything else in the video.</Sub>
    </>
  )
}

/** "Mostly" is the level's own word (half or more of its videos, the pick's
 *  bar). A rank ("most often", "more than any other") is said only where the
 *  subject leads every other it could hold (`ranked`: no tie, none pending);
 *  otherwise the card prints the level alone. */
function FocusCard({ s, tier }: { s: FocusStandout; tier: SlotTier }) {
  return (
    <>
      <Head word={SLOT_WORDS.focus} where={s.where} />
      <Title>
        {tier === 'pick'
          ? <>{s.name} talk is mostly about {s.subject}</>
          : s.ranked ? <>{s.name} talk is most often about {s.subject}</> : <>{s.name} videos about {s.subject}</>}
      </Title>
      <MidFigure value={s.level.k}>of its <span data-copy="figure">{fmtInt(s.level.n)}</span> videos</MidFigure>
      {s.ranked ? <Sub>More than any other subject in its videos.</Sub> : null}
    </>
  )
}

/** One card. */
export function StandoutCard({ s, monthName, tier = 'pick' }: { s: Standout; monthName: string; tier?: SlotTier }) {
  return (
    <article data-standout={s.kind} data-tier={tier} className={cn(CARD, 'gap-3.5')}>
      {s.kind === 'first' ? <FirstCard s={s} monthName={monthName} tier={tier} /> : null}
      {s.kind === 'gap' ? <GapCard s={s} /> : null}
      {s.kind === 'general' ? <GeneralCard s={s} monthName={monthName} /> : null}
      {s.kind === 'praised' ? <PraisedCard s={s} tier={tier} /> : null}
      {s.kind === 'focus' ? <FocusCard s={s} tier={tier} /> : null}
      <Foot href={s.href} name={s.name} />
    </article>
  )
}

/** The line a place with nothing to show prints. Subjects not measured yet
 *  (ruling U6): the place's own words, and SUBJECT_NOT_MEASURED under them. */
export function emptyTitle(slot: Pick<StandoutSlot, 'slot' | 'reason'>, monthName: string): string {
  if (slot.slot === 'first') return `Nothing came up for the first time in ${monthName}`
  if (slot.slot === 'category') return `No category came up in ${monthName}`
  if (slot.reason === 'pending') return FRAME_TITLES.focus
  if (slot.reason === 'unread') return `Not read for ${monthName} yet`
  return slot.slot === 'praised' ? `No praise in the comments to show for ${monthName}` : `No subject to show for ${monthName}`
}

/** A place with nothing to show: its label, then the dashed box with its
 *  line (decision 4, no empty chart), and (the first place) the newest
 *  product on the shelf, which it opens. */
function EmptyCard({ slot, title, frame = false }: { slot: Pick<StandoutSlot, 'slot' | 'months' | 'newest' | 'reason'>; title: string; frame?: boolean }) {
  const sub = slot.newest
    ? <>Newest on your shelf: {slot.newest.name}, first named in {longMonth(slot.newest.month)}.</>
    : slot.reason === 'pending' ? SUBJECT_NOT_MEASURED : frame ? FRAME_LINES[slot.slot] : null
  return (
    // A frame (no month read) holds the height of the board's cards, so the
    // row keeps the page's weight with nothing in it.
    <article data-standout={slot.slot} data-tier="none" className={cn(CARD, 'gap-3.5', frame ? 'min-[760px]:min-h-[216px]' : null)}>
      <Head word={SLOT_WORDS[slot.slot]} />
      {sub ? <EmptyBox title={title}>{sub}</EmptyBox> : <EmptyBox>{title}</EmptyBox>}
      <Foot href={slot.newest?.href ?? null} name={slot.newest?.name ?? null} />
    </article>
  )
}

const GRID = 'grid grid-cols-1 gap-5 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-4'

/** The board's row: four across at its width, two below 1180px, one on a
 *  phone. Always the four places (`standoutSlots`). */
export function Standouts({ slots, monthName }: { slots: readonly StandoutSlot[]; monthName: string }) {
  if (slots.length === 0) return null
  return (
    <section aria-label="What stands out" className={GRID}>
      {slots.map((slot) => (slot.card
        ? <StandoutCard key={slot.slot} s={slot.card} monthName={monthName} tier={slot.tier} />
        : <EmptyCard key={slot.slot} slot={slot} title={emptyTitle(slot, monthName)} />))}
    </section>
  )
}

/** What each place shows, said where no month is read (no catalogue, not
 *  switched on, not read): the four frames in the board's places. */
export const FRAME_TITLES: Readonly<Record<SlotKey, string>> = {
  first: 'A product’s first month',
  category: 'A category against your products in it',
  praised: 'Praise in the comments on a product',
  focus: 'What one product’s talk is about',
}

/** What each frame will show, in one sentence of its own (decision 4: a
 *  title and one sentence in the dashed box; the review of Phases 4 and 5).
 *  Why no month is read is said once, in the catalogue's box below. */
export const FRAME_LINES: Readonly<Record<SlotKey, string>> = {
  first: 'A product named for the first time in a month, and in how many videos.',
  category: 'How much of a category’s talk names none of your products.',
  praised: 'How many of a product’s videos have praise in their comments.',
  focus: 'The subject a product’s talk is mostly about.',
}

/** The four frames for a page that reads no month: each place's label and
 *  what it will show, in the dashed box. No number, no link. */
export function StandoutFrames() {
  return (
    <section aria-label="What stands out" data-frames="" className={GRID}>
      {(['first', 'category', 'praised', 'focus'] as const).map((slot) => <EmptyCard key={slot} slot={{ slot }} title={FRAME_TITLES[slot]} frame />)}
    </section>
  )
}
