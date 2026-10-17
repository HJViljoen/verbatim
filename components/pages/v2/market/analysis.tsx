import Link from 'next/link'
import type { ReactNode } from 'react'
import { BarChart3, Calendar, MessageSquareText, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react'
import { EYEBROW, IconTile } from '@/components/colour-roles'
import { CARD, FlagChip } from '@/components/v2'
import { countWord } from '@/lib/settings/search-set'
import type { HeroCard, MarketData, SideCard, SubjectCard, WeekCard } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { Label, OLINK, Stored } from './parts'

// MARKET'S TOP LAYER, ANALYSIS FIRST (Heinrich, 16 and 17 Oct; F2-Market,
// -Phone and -States): the week's read in one card, then one card per tracked
// subject, each a headline and what it means with NO FIGURE, then the three
// things that stood out this week, small; the numbers sit one layer down
// (./index.tsx). About 600 words of written analysis above the first number
// is accepted (ruling 3). Every card keeps its frame and its foot in every
// state; a gap is said inside its own card in one line.

/** The boards' section head between layers: its title, and a quiet note at
 *  the right (under it on a phone). */
export function SectionHead({ id, title, note }: { id?: string; title: string; note?: ReactNode }) {
  return (
    <div className="mt-3.5 flex items-baseline justify-between gap-3 px-0.5 max-sm:mt-2.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
      <h2 id={id} className="m-0 text-[19px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[18px]">{title}</h2>
      {note ? <span className="text-[13px] leading-[1.4] text-muted-foreground">{note}</span> : null}
    </div>
  )
}

/** The quiet line a card says its gap in (the boards' `.gapline`). */
const GAPLINE = 'm-0 text-[15px] leading-[1.55] text-muted-foreground max-sm:text-[14.5px]'

/** A card's foot: the month words at the left, its link at the right. */
function Foot({ left, href, label = 'Open' }: { left?: ReactNode; href: string | null; label?: string }) {
  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1.5">
      {left ? <span className="text-[12.5px] text-muted-foreground">{left}</span> : <span />}
      {href ? <Link href={href} className={OLINK}>{label} →</Link> : null}
    </div>
  )
}

// ---- The week card ----------------------------------------------------------------------

/** A thin read: no read to open, so no link. */
export const WEEK_THIN = 'Not enough was said this week for a read.'
/** A read that could not be read (the board's failed state, in words that
 *  claim nothing about whether it was written). */
export const WEEK_UNREAD = 'This week’s read could not be read just now.'

/** The week card (F2-Market): the published read's week in one line, what it
 *  means side by side (stacked under 1180 and on a phone), and the way into
 *  the week's page. */
export function WeekCardView({ card }: { card: WeekCard }) {
  const eyebrow = card.dates ? `This week · ${card.dates}` : 'This week'
  return (
    <article id="week" aria-labelledby={card.state === 'ready' ? 'week-head' : undefined} data-week-card={card.state} className={cn(CARD, 'gap-[18px] scroll-mt-6 sm:px-[30px] sm:pt-7 sm:pb-[26px] max-sm:gap-3.5 max-sm:px-[18px] max-sm:pt-5 max-sm:pb-[18px]')}>
      <div className="flex items-center gap-3">
        <IconTile icon={Calendar} className="my-0" />
        <p className={cn('m-0', EYEBROW)}>{eyebrow}</p>
      </div>
      {card.state === 'ready' ? (
        <>
          {card.line ? <Stored as="h2" id="week-head" line={card.line} slot="week_read" className="m-0 max-w-[900px] text-[26px] leading-[1.32] font-semibold tracking-[-0.015em] text-foreground max-sm:text-[21px] max-sm:leading-[1.32]" /> : null}
          {card.means.length > 0 ? (
            <div data-week-means="" className="grid grid-cols-1 gap-x-9 gap-y-2.5 border-t border-track pt-4 max-sm:gap-y-0 max-sm:pt-3.5 min-[1180px]:grid-cols-3">
              <Label className="col-span-full max-sm:mb-1">What it means</Label>
              {card.means.map((m, i) => (
                <Stored
                  key={i}
                  line={m}
                  slot="week_read"
                  className={cn(
                    'm-0 text-[15px] leading-[1.55] text-foreground max-sm:py-2.5 max-sm:text-[14.5px]',
                    // On a phone they stack, a hairline between (F2-Market-Phone).
                    i > 0 ? 'max-sm:border-t max-sm:border-track' : 'max-sm:pt-1',
                  )}
                />
              ))}
            </div>
          ) : null}
          <Foot href={card.href} label="Read the whole week" />
        </>
      ) : (
        <p className={GAPLINE}>{card.state === 'thin' ? WEEK_THIN : WEEK_UNREAD}</p>
      )}
    </article>
  )
}

// ---- The subject cards ------------------------------------------------------------------

/** The head's note: "Your six subjects, biggest first" (words to twelve, as
 *  the board writes it); "biggest first" only where some are ranked. */
export function subjectsNote(cards: readonly SubjectCard[]): ReactNode {
  const n = cards.length
  const ranked = cards.some((c) => c.state === 'read' || c.state === 'thin' || c.state === 'no_read')
  const word = countWord(n)
  const count = /\d/.test(word) ? <span data-copy="figure">{word}</span> : word
  if (n === 1) return 'Your subject'
  return <>Your {count} subjects{ranked ? ', biggest first' : null}</>
}

/** One tracked subject's card, in each of F2-Market-States' states. */
function SubjectCardView({ card }: { card: SubjectCard }) {
  return (
    <article data-subject-card={card.state} className={cn(CARD, 'col-span-12 gap-3 min-[1180px]:col-span-6')}>
      <p className={cn('m-0', EYEBROW)}>{card.name}</p>
      {card.headline ? <Stored as="h3" line={card.headline} slot="week_read" className="m-0 text-[20px] leading-[1.32] font-semibold tracking-[-0.01em] text-foreground max-sm:text-[18px]" /> : null}
      {card.state === 'read' && card.body ? <Stored line={card.body} slot="week_read" className="m-0 text-[15px] leading-[1.6] text-secondary-foreground max-sm:text-[14.5px] max-sm:leading-[1.58]" /> : null}
      {card.state === 'thin' && card.body ? <Stored line={card.body} slot="week_read" className={GAPLINE} /> : null}
      {card.note ? <p className={GAPLINE}>{card.note}</p> : null}
      {card.state === 'provisional' || card.state === 'failed' ? (
        <div className="mt-0.5 flex flex-col gap-0.5">
          <Label className="mb-1">Inside it</Label>
          {card.inside.length > 0
            ? card.inside.map((c) => (
              <Link key={c.id} href={c.href} className="-mx-2 rounded-md px-2 py-1.5 text-[14.5px] text-foreground no-underline transition-colors hover:bg-inner">
                <span data-copy="subject" data-slot="pass_b_theme">{c.label}</span>
              </Link>
            ))
            : <p className="m-0 py-1.5 text-[14px] text-muted-foreground">No conversation in it reached three videos yet.</p>}
        </div>
      ) : null}
      <Foot left={card.monthText} href={card.href} />
    </article>
  )
}

/** "What the market is talking about": one card per tracked subject, two to
 *  a row from 1180 and one below; cards in a row share a height. */
export function SubjectCardsView({ cards }: { cards: readonly SubjectCard[] }) {
  return (
    <>
      <SectionHead id="subjects-title" title="What the market is talking about" note={cards.length > 0 ? subjectsNote(cards) : null} />
      <section id="subjects" aria-labelledby="subjects-title" className="grid scroll-mt-6 grid-cols-12 gap-5 max-sm:gap-3.5">
        {cards.length > 0
          ? cards.map((c) => <SubjectCardView key={c.id} card={c} />)
          : (
            <article data-subject-card="none" className={cn(CARD, 'col-span-12')}>
              <p className={GAPLINE}>Your subjects will appear here once they are named in Settings.</p>
            </article>
          )}
      </section>
    </>
  )
}

// ---- Also this week ----------------------------------------------------------------------

/** The new card's words where nothing was first heard this week. */
export const NOTHING_NEW = 'Nothing new this week'
export const NOTHING_ELSE_NEW = 'Nothing else new this week'
/** The stand-in's line: the week's next biggest conversation. */
export const ALSO_TALKED = 'Also talked about'
/** The lead's eyebrow where it is the week's biggest. */
export const MOST_TALKED = 'Most talked about this week'

interface Small {
  key: string
  icon: LucideIcon
  /** The eyebrow, or the flag's chip in its place (the chip is the eyebrow:
   *  decision 1 leaves it the check's own words, "Unusual this week"). */
  eyebrow: ReactNode
  chip?: ReactNode
  title: ReactNode
  sub?: string
  href: string | null
}

/** A conversation's label as a title: Pass B's words, in their node. */
const conv = (label: string) => <span data-copy="subject" data-slot="pass_b_theme">{label}</span>

/** The three places' cards, by today's rules for what fills each
 *  (`weekLead`, `printableFlags`, `pickWeekSides`, `earlierNewOf`,
 *  `alsoTalkedOf`) and in each of their parity states. Pure. */
export function alsoCards(hero: HeroCard | null, sides: readonly SideCard[]): Small[] {
  const out: Small[] = []
  if (hero?.kind === 'flag') {
    const c = hero.card
    out.push({ key: 'flag', icon: TrendingUp, eyebrow: null, chip: <FlagChip verdict={c.verdict} />, title: c.conv ? conv(c.conv.label) : c.flag.label, href: c.href })
  } else if (hero) {
    out.push({
      key: 'lead', icon: hero.kind === 'new' ? Sparkles : MessageSquareText,
      eyebrow: hero.kind === 'new' ? <span data-copy="verdict">New this week</span> : MOST_TALKED,
      title: conv(hero.conv.label), href: hero.href,
    })
  }
  for (const s of sides) {
    const c = s.convs[0]
    if (s.kind === 'biggest') {
      const eyebrow = hero?.kind === 'biggest' ? ALSO_TALKED : MOST_TALKED
      out.push(c
        ? { key: 'biggest', icon: BarChart3, eyebrow, title: conv(c.label), href: s.hrefs[0] ?? null }
        : { key: 'biggest', icon: BarChart3, eyebrow, title: 'No other conversation this week', sub: 'Nothing else reached three of the category’s videos.', href: null })
    } else if (s.kind === 'new_list') {
      if (c) {
        out.push({ key: 'new', icon: Sparkles, eyebrow: <span data-copy="verdict">New this week</span>, title: conv(c.label), href: s.hrefs[0] ?? null })
      } else {
        const none = <span data-copy="verdict">{s.anyNew ? NOTHING_ELSE_NEW : NOTHING_NEW}</span>
        const pick = s.earlier ?? s.also ?? null
        out.push(pick
          ? { key: 'new', icon: Sparkles, eyebrow: none, title: conv(pick.conv.label), sub: s.earlier ? `First heard the week of ${s.earlier.week}` : ALSO_TALKED, href: pick.href }
          : { key: 'new', icon: Sparkles, eyebrow: <span data-copy="verdict">New this week</span>, title: none, href: null })
      }
    }
  }
  return out
}

function SmallCard({ card }: { card: Small }) {
  return (
    <article data-also={card.key} className={cn(CARD, 'col-span-12 gap-3.5 sm:px-[22px] sm:py-5 max-sm:gap-3 max-sm:px-[18px] max-sm:py-4 min-[1180px]:col-span-4')}>
      <div className="flex items-start gap-3">
        <IconTile icon={card.icon} className="my-0 self-start" />
        <div className="min-w-0 flex-1">
          {card.chip ? <div className="flex flex-wrap items-center gap-2.5">{card.chip}</div> : <p className={cn('m-0', EYEBROW)}>{card.eyebrow}</p>}
          <h3 className="m-0 mt-1 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground">{card.title}</h3>
          {card.sub ? <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground">{card.sub}</p> : null}
        </div>
      </div>
      <Foot href={card.href} />
    </article>
  )
}

/** "Also this week": the three places, small (F2-Market). */
export function AlsoThisWeek({ data }: { data: MarketData }) {
  const cards = alsoCards(data.top.hero, data.top.sides)
  if (cards.length === 0) return null
  return (
    <>
      <SectionHead id="also-title" title="Also this week" note="What stood out in this week’s conversations" />
      <section id="top-row" aria-labelledby="also-title" className="grid scroll-mt-6 grid-cols-12 gap-5 max-sm:gap-3.5">
        {cards.map((c) => <SmallCard key={c.key} card={c} />)}
      </section>
    </>
  )
}
