import Link from 'next/link'
import { EYEBROW } from '@/components/colour-roles'
import { CARD, FlagChip, UnitSquares } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import type {
  FirstStandout, FocusStandout, GapStandout, GeneralStandout, PraisedStandout, Standout,
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

/** The card's head: the kind of standout in the orange eyebrow (a flag chip
 *  for a first month, which is a verdict), and where it sits. */
function Eyebrow({ word, where, flag }: { word: string; where: string; flag?: FirstStandout['flag'] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {flag ? <FlagChip verdict={flag} /> : <p className={cn('m-0', EYEBROW)}>{word}</p>}
      <span className="font-mono text-[11.5px] text-muted-foreground">{where}</span>
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="m-0 text-[17px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground">{children}</h2>
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[13px] leading-[1.4] text-muted-foreground">{children}</p>
}

function Foot({ href }: { href: string }) {
  return (
    <div className="mt-auto flex items-center pt-1">
      <Link href={href} scroll={false} className={OLINK}>Open →</Link>
    </div>
  )
}

/** "almost every video", "most of its videos": the share in words, decided
 *  here from the level (never from a model). */
export function shareWords(k: number, n: number): string {
  if (n > 0 && k >= n) return 'every video'
  if (n > 0 && k / n >= 0.75) return 'almost every video'
  return 'most of its videos'
}

/** Month dots, oldest first: hollow for a month with none, the orange for
 *  the month it came up (the board's strip). */
function MonthDots({ months, name }: { months: FirstStandout['months']; name: string }) {
  const n = months.length
  if (n < 2) return null
  const W = 220
  const x = (i: number) => 10 + (i * (W - 20)) / (n - 1)
  const mid = Math.floor((n - 1) / 2)
  const first = months[0]
  const last = months[n - 1]
  return (
    <svg viewBox={`0 0 ${W} 44`} className="block h-auto w-full max-w-[260px]" role="img"
      aria-label={`Videos naming ${name} each month, ${longMonth(first.month)} to ${longMonth(last.month)}: none until ${longMonth(last.month)}, then ${fmtInt(last.k)}.`}>
      <line x1={10} y1={18} x2={W - 10} y2={18} className="stroke-track" />
      {months.slice(0, -1).map((m, i) => <circle key={m.month} cx={x(i)} cy={18} r={5} className="fill-card stroke-foreground/25" strokeWidth={1.5} />)}
      <circle cx={x(n - 1)} cy={18} r={7} className="fill-orange" />
      {[0, mid, n - 1].filter((i, j, xs) => xs.indexOf(i) === j).map((i) => (
        <text key={i} x={x(i)} y={40} textAnchor="middle" fontSize={9.5} fontWeight={i === n - 1 ? 600 : 400}
          className={cn('font-mono', i === n - 1 ? 'fill-foreground' : 'fill-muted-foreground')}>
          {longMonth(months[i].month).slice(0, 3)}
        </text>
      ))}
    </svg>
  )
}

function FirstCard({ s, monthName }: { s: FirstStandout; monthName: string }) {
  return (
    <>
      <Eyebrow word="New" where={s.where} flag={s.flag} />
      <Title>{s.name} came up for the first time</Title>
      <MidFigure value={s.videos}>{s.videos === 1 ? 'video' : 'videos'} in {monthName}</MidFigure>
      <MonthDots months={s.months} name={s.name} />
      {s.lead ? <Sub><OfIts k={s.lead.k} n={s.lead.n} /> are about {s.lead.label}.</Sub> : null}
    </>
  )
}

function GapCard({ s }: { s: GapStandout }) {
  const less = (s.verdict.changePts ?? 0) < 0
  return (
    <>
      <Eyebrow word="Category, not you" where={s.where} />
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
  return (
    <>
      <Eyebrow word="Category, not you" where={s.where} />
      <Title>{s.name} talk is mostly about {word} in general</Title>
      <div className="flex flex-col gap-[9px]">
        <ShareRow name={`${s.name} in general`} level={s.inGeneral} tone="market" />
        <ShareRow name="One of yours" level={s.yours} tone="you" />
      </div>
      <Sub>Of the <span data-copy="figure">{fmtInt(s.inGeneral.n)}</span> videos about {word} in {monthName}, how many name none of your products.</Sub>
    </>
  )
}

function PraisedCard({ s }: { s: PraisedStandout }) {
  return (
    <>
      <Eyebrow word="Most praised" where={s.where} />
      <Title>{s.name} is praised in {shareWords(s.praised.k, s.praised.n)}</Title>
      <MidFigure value={s.praised.k}>of its <span data-copy="figure">{fmtInt(s.praised.n)}</span> videos</MidFigure>
      <UnitSquares k={s.praised.k} n={s.praised.n} tone="you" label={`${fmtInt(s.praised.k)} of ${fmtInt(s.praised.n)} videos praise ${s.name}`} />
      <Sub>Videos where someone said it worked.</Sub>
    </>
  )
}

function FocusCard({ s }: { s: FocusStandout }) {
  return (
    <>
      <Eyebrow word="Worth a look" where={s.where} />
      <Title>{s.name} talk is mostly about {s.subject}</Title>
      <MidFigure value={s.level.k}>of its <span data-copy="figure">{fmtInt(s.level.n)}</span> videos</MidFigure>
      <UnitSquares k={s.level.k} n={s.level.n} tone="ink" label={`${fmtInt(s.level.k)} of ${fmtInt(s.level.n)} ${s.name} videos are about ${s.subject}`} />
      <Sub>More than any other subject in its videos.</Sub>
    </>
  )
}

/** One card. */
export function StandoutCard({ s, monthName }: { s: Standout; monthName: string }) {
  return (
    <article data-standout={s.kind} className={cn(CARD, 'gap-3.5')}>
      {s.kind === 'first' ? <FirstCard s={s} monthName={monthName} /> : null}
      {s.kind === 'gap' ? <GapCard s={s} /> : null}
      {s.kind === 'general' ? <GeneralCard s={s} monthName={monthName} /> : null}
      {s.kind === 'praised' ? <PraisedCard s={s} /> : null}
      {s.kind === 'focus' ? <FocusCard s={s} /> : null}
      <Foot href={s.href} />
    </article>
  )
}

/** The row of cards: four across at the board's width, two below 1180px,
 *  one on a phone. Fewer cards are fewer cards: nothing pads. */
export function Standouts({ standouts, monthName }: { standouts: readonly Standout[]; monthName: string }) {
  if (standouts.length === 0) return null
  return (
    <section aria-label="What stands out" className="grid grid-cols-1 gap-5 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-4">
      {standouts.map((s) => <StandoutCard key={`${s.kind}:${s.open.id}`} s={s} monthName={monthName} />)}
    </section>
  )
}
