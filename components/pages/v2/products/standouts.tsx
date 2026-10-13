import Link from 'next/link'
import { EYEBROW } from '@/components/colour-roles'
import { CARD, FlagChip, UnitSquares } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import {
  SUBJECT_NOT_MEASURED,
  type FirstStandout, type FocusStandout, type GapStandout, type GeneralStandout, type PraisedStandout, type SlotKey, type SlotTier, type Standout, type StandoutSlot,
} from '@/lib/pages/v2/products'
import { cn } from '@/lib/utils'
import { MidFigure, OfIts, OLINK, ShareRow, VerdictBadge } from './parts'

// THE STANDOUTS (board E4-Products, the four cards across the top). Each is
// picked by code (`pickStandouts`, lib/pages/v2/products.ts) from the month's
// counts and crosses, and says only what those carry: no model prose, no
// quote and no weekly direction word (Heinrich's v2 rules, decision 1). The
// one comparison a card can make (a subject a category carries far more than
// one of your products there) is a `Verdict`, and the card is drawn only
// where its band clears. Each opens its product's or category's panel.
//
// THE FOUR PLACES ARE ALWAYS DRAWN (the parity pass, 13 Oct night: "the page
// shouldn't look too different if everything isn't as populated as the
// design"). A place nothing reached is filled with the month's nearest honest
// card (`standoutSlots`, tier `next`), worded for what it is, or keeps its
// frame and its visual, empty, under one line (tier `none`). A page that reads
// no month draws the four frames alone (`StandoutFrames`).

/** The card's head: the kind of standout in the orange eyebrow (a flag chip
 *  for a first month, which is a verdict), and where it sits. */
function Eyebrow({ word, where, flag }: { word: string; where?: string; flag?: FirstStandout['flag'] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {flag ? <FlagChip verdict={flag} /> : <p className={cn('m-0', EYEBROW)}>{word}</p>}
      {where ? <span className="font-mono text-[11.5px] text-muted-foreground">{where}</span> : null}
    </div>
  )
}

function Title({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return <h2 className={cn('m-0 text-[17px] font-semibold leading-[1.3] tracking-[-0.005em]', muted ? 'text-muted-foreground' : 'text-foreground')}>{children}</h2>
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[13px] leading-[1.4] text-muted-foreground">{children}</p>
}

function Foot({ href }: { href: string | null }) {
  return (
    <div className="mt-auto flex min-h-[20px] items-center pt-1">
      {href ? <Link href={href} scroll={false} className={OLINK}>Open →</Link> : null}
    </div>
  )
}

/** Each place's eyebrow, the board's words (the praise place in the page's
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

/** Month dots, oldest first: hollow for a month with none, the orange for
 *  the month it came up (the board's strip). `hollow` draws every dot
 *  hollow: no product's first month among them. */
function MonthDots({ months, label, hollow = false }: { months: readonly string[]; label: string; hollow?: boolean }) {
  const n = months.length
  if (n < 2) return null
  const W = 220
  const x = (i: number) => 10 + (i * (W - 20)) / (n - 1)
  const mid = Math.floor((n - 1) / 2)
  return (
    <svg viewBox={`0 0 ${W} 44`} className="block h-auto w-full max-w-[260px]" role="img" aria-label={label}>
      <line x1={10} y1={18} x2={W - 10} y2={18} className="stroke-track" />
      {months.map((m, i) => (i === n - 1 && !hollow
        ? <circle key={m} cx={x(i)} cy={18} r={7} className="fill-orange" />
        : <circle key={m} cx={x(i)} cy={18} r={5} className="fill-card stroke-foreground/25" strokeWidth={1.5} />))}
      {[0, mid, n - 1].filter((i, j, xs) => xs.indexOf(i) === j).map((i) => (
        <text key={i} x={x(i)} y={40} textAnchor="middle" fontSize={9.5} fontWeight={i === n - 1 ? 600 : 400}
          className={cn('font-mono', i === n - 1 ? 'fill-foreground' : 'fill-muted-foreground')}>
          {longMonth(months[i]).slice(0, 3)}
        </text>
      ))}
    </svg>
  )
}

/** The strip with no month to name (a page that reads none): the board's
 *  eight dots, every one hollow, no labels. */
function EmptyDots() {
  const W = 220
  return (
    <svg aria-hidden viewBox={`0 0 ${W} 44`} className="block h-auto w-full max-w-[260px]">
      <line x1={10} y1={18} x2={W - 10} y2={18} className="stroke-track" />
      {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={10 + (i * (W - 20)) / 7} cy={18} r={5} className="fill-card stroke-foreground/20" strokeWidth={1.5} />)}
    </svg>
  )
}

/** The board's row of marks for "k of its n videos": one square a video up
 *  to two rows (the board draws nine), and past that one bar of the same
 *  height and length, so a category's tens of videos weigh what the board's
 *  nine do rather than piling into rows. */
export const SQUARES_MAX = 18
function Marks({ k, n, tone, label }: { k: number; n: number; tone: 'you' | 'ink'; label: string }) {
  if (n <= SQUARES_MAX) return <UnitSquares k={k} n={n} tone={tone} label={label} />
  const pct = n > 0 ? Math.min(100, (100 * k) / n) : 0
  return (
    <div role="img" aria-label={label} data-units={`${k}/${n}`} className="relative h-[21px] w-full max-w-[221px] overflow-hidden rounded-[3px] bg-track">
      {pct > 0 ? <i className={cn('absolute inset-y-0 left-0', tone === 'you' ? 'bg-you' : 'bg-foreground')} style={{ width: `${pct}%` }} /> : null}
    </div>
  )
}

/** The marks with nothing to count: the board's nine squares, all track. */
function EmptyMarks() {
  return (
    <div aria-hidden className="grid max-w-[221px] grid-cols-9 gap-1">
      {Array.from({ length: 9 }, (_, i) => <i key={i} className="aspect-square rounded-[3px] bg-track" />)}
    </div>
  )
}

/** Two share rows with nothing in them: the category card's frame. */
function EmptyShares() {
  const row = (name: string) => (
    <div>
      <div className="text-[12.5px] leading-[1.35] text-muted-foreground">{name}</div>
      <div className="mt-[5px] h-2 rounded-full bg-track" />
    </div>
  )
  return <div aria-hidden className="flex flex-col gap-[9px]">{row('In general')}{row('One of yours')}</div>
}

function FirstCard({ s, monthName, tier }: { s: FirstStandout; monthName: string; tier: SlotTier }) {
  const names = (s.others ?? []).map((o) => o.name)
  const last = s.months[s.months.length - 1].month
  return (
    <>
      {/* A first month under the standout's floor is new, but its one or two
          videos earn no flag: the eyebrow says it in words. */}
      <Eyebrow word={SLOT_WORDS.first} where={s.where} flag={tier === 'pick' ? s.flag : undefined} />
      <Title>{s.name} came up for the first time</Title>
      <MidFigure value={s.videos}>{s.videos === 1 ? 'video' : 'videos'} in {monthName}</MidFigure>
      <MonthDots
        months={s.months.map((m) => m.month)}
        label={`Videos naming ${s.name} each month, ${longMonth(s.months[0].month)} to ${longMonth(last)}: none until ${longMonth(last)}, then ${fmtInt(s.videos)}.`}
      />
      {names.length > 0
        ? <Sub>Also new in {monthName}: {names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}.</Sub>
        : s.lead ? <Sub><OfIts k={s.lead.k} n={s.lead.n} /> are about {s.lead.label}.</Sub> : null}
    </>
  )
}

function GapCard({ s }: { s: GapStandout }) {
  // The eyebrow says which side carries the subject, from the pair itself
  // (the product's share against the category's), in no direction word.
  const less = s.product.k * s.category.n < s.category.k * s.product.n
  return (
    <>
      <Eyebrow word={less ? 'Category, not you' : 'You, more than the category'} where={s.where} />
      <Title>
        {less
          ? <>{s.subject} is a {s.where.toLowerCase()} matter, not a {s.product.name} one</>
          : <>{s.subject} stands out on {s.product.name}</>}
      </Title>
      <div className="flex flex-col gap-[9px]">
        <ShareRow name={`All ${s.where.toLowerCase()}`} level={s.category} tone="market" />
        <ShareRow name={s.product.name} level={s.product} tone="you" />
      </div>
      <Sub>Share of videos about {s.subject}. <VerdictBadge verdict={s.verdict} /></Sub>
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
      <Eyebrow word={SLOT_WORDS.category} where={s.where} />
      <Title>{title}</Title>
      <div className="flex flex-col gap-[9px]">
        <ShareRow name={`${s.name} in general`} level={s.inGeneral} tone="market" />
        <ShareRow name="One of yours" level={s.yours} tone="you" />
      </div>
      <Sub>Of the <span data-copy="figure">{fmtInt(s.inGeneral.n)}</span> videos about {word} in {monthName}, how many name none of your products.</Sub>
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
      <Eyebrow word={SLOT_WORDS.praised} where={s.where} />
      <Title>
        {tier !== 'pick'
          ? <>{s.name} videos with praise in their comments</>
          : q === 'Most' ? <>Most {s.name} videos have praise in their comments</> : <>{q} {s.name} video has praise in its comments</>}
      </Title>
      <MidFigure value={s.praised.k}>of its <span data-copy="figure">{fmtInt(s.praised.n)}</span> videos</MidFigure>
      <Marks k={s.praised.k} n={s.praised.n} tone="you" label={`${fmtInt(s.praised.k)} of ${fmtInt(s.praised.n)} videos naming ${s.name} have praise in their comments`} />
      <Sub>Videos that name it with praise in their comments, about it or about anything else in the video.</Sub>
    </>
  )
}

function FocusCard({ s, tier }: { s: FocusStandout; tier: SlotTier }) {
  return (
    <>
      <Eyebrow word={SLOT_WORDS.focus} where={s.where} />
      <Title>{s.name} talk is {tier === 'pick' ? 'mostly' : 'most often'} about {s.subject}</Title>
      <MidFigure value={s.level.k}>of its <span data-copy="figure">{fmtInt(s.level.n)}</span> videos</MidFigure>
      <Marks k={s.level.k} n={s.level.n} tone="ink" label={`${fmtInt(s.level.k)} of ${fmtInt(s.level.n)} ${s.name} videos are about ${s.subject}`} />
      <Sub>More than any other subject in its videos.</Sub>
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
      <Foot href={s.href} />
    </article>
  )
}

/** The line a place with nothing to show prints as its title. Subjects not
 *  measured yet (ruling U6): the place's own title, and SUBJECT_NOT_MEASURED
 *  under it (`emptySub`). */
export function emptyTitle(slot: Pick<StandoutSlot, 'slot' | 'reason'>, monthName: string): string {
  if (slot.slot === 'first') return `Nothing came up for the first time in ${monthName}`
  if (slot.slot === 'category') return `No category came up in ${monthName}`
  if (slot.reason === 'pending') return FRAME_TITLES.focus
  if (slot.reason === 'unread') return `Not read for ${monthName} yet`
  return slot.slot === 'praised' ? `No praise in the comments to show for ${monthName}` : `No subject to show for ${monthName}`
}

/** A place with nothing to show: its eyebrow, one line for a title, the
 *  card's visual with nothing in it, and (the first place) the newest
 *  product on the shelf, which it opens. */
function EmptyCard({ slot, title, frame = false }: { slot: Pick<StandoutSlot, 'slot' | 'months' | 'newest' | 'reason'>; title: string; frame?: boolean }) {
  const months = slot.months ?? []
  return (
    // A frame (no month read) holds the height of the board's cards, so the
    // row keeps the page's weight with nothing in it.
    <article data-standout={slot.slot} data-tier="none" className={cn(CARD, 'gap-3.5', frame ? 'min-[760px]:min-h-[216px]' : null)}>
      <Eyebrow word={SLOT_WORDS[slot.slot]} />
      <Title muted>{title}</Title>
      {slot.slot === 'first'
        ? months.length >= 2 ? <MonthDots months={months} hollow label={`No product came up for the first time in ${longMonth(months[months.length - 1])}.`} /> : <EmptyDots />
        : slot.slot === 'category' ? <EmptyShares /> : <EmptyMarks />}
      {slot.newest ? <Sub>Newest on your shelf: {slot.newest.name}, first named in {longMonth(slot.newest.month)}.</Sub> : null}
      {slot.reason === 'pending' ? <Sub>{SUBJECT_NOT_MEASURED}</Sub> : null}
      <Foot href={slot.newest?.href ?? null} />
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

/** The four frames for a page that reads no month: each place's eyebrow,
 *  what it will show, and its visual with nothing in it. No number, no link. */
export function StandoutFrames() {
  return (
    <section aria-label="What stands out" data-frames="" className={GRID}>
      {(['first', 'category', 'praised', 'focus'] as const).map((slot) => <EmptyCard key={slot} slot={{ slot }} title={FRAME_TITLES[slot]} frame />)}
    </section>
  )
}
