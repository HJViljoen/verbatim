import Link from 'next/link'
import type { ReactNode } from 'react'
import { CARD, EmptyBox, GoLink, SectionHead as KitSectionHead } from '@/components/v2'
import { ROW } from '@/components/v2/look'
import { countWord } from '@/lib/settings/search-set'
import type { SubjectCard, WeekCard } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { Label, Stored } from './parts'

// MARKET'S TOP LAYER, ANALYSIS FIRST (Heinrich, 16 and 17 Oct), drawn to the
// audit design's board (Market.dc.html, 7 Nov): the week's read in one card,
// then one card per tracked subject, each its name (its page's link), a
// headline and what it means, with NO FIGURE (Heinrich, 16 Oct; decision 3);
// the numbers sit one layer down (./index.tsx). About 600 words of written
// analysis above the first number is accepted (ruling 3). Every card keeps
// its frame and its foot in every state; a gap is said inside its own card in
// one line. "Also this week" is gone (small call 12); its words stay below,
// because the weekly email's test holds its own to them.

/** The boards' section head (the kit's `SectionHead`): Market's pages and the
 *  pages that borrow it (Your moves) draw the one head. */
export const SectionHead = KitSectionHead

/** The quiet line a card says its gap in. */
const GAPLINE = 'm-0 text-[15px] leading-[1.55] text-secondary-foreground max-sm:text-[14.5px]'

// ---- The week card ----------------------------------------------------------------------

/** A thin read: no read to open, so no link. */
export const WEEK_THIN = 'Not enough was said this week for a read.'
/** A read that could not be read (the board's failed state, in words that
 *  claim nothing about whether it was written). */
export const WEEK_UNREAD = 'This week’s read could not be read just now.'

/** The card's heading where it has no read to lead with. */
export const WEEK_CARD_TITLE = 'The week’s read'

/** The week card (the board's first tile): the published read's week in one
 *  line as the heading, what it means side by side (stacked under 1180 and on
 *  a phone), and the way into the week's page. The dates are the figures
 *  row's. */
export function WeekCardView({ card }: { card: WeekCard }) {
  return (
    <article id="week" aria-labelledby="week-head" data-week-card={card.state} className={cn(CARD, 'gap-[18px] scroll-mt-6 sm:p-[30px] max-sm:gap-3.5')}>
      {card.state === 'ready' ? (
        <>
          {card.line
            ? <Stored as="h2" id="week-head" line={card.line} slot="week_read" className="m-0 max-w-[1000px] text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-foreground max-sm:text-[21px]" />
            : <h2 id="week-head" className="m-0 text-[21px] leading-[1.3] font-semibold text-foreground">{WEEK_CARD_TITLE}</h2>}
          {card.means.length > 0 ? (
            <div data-week-means="" className="grid grid-cols-1 gap-x-8 gap-y-3 min-[1180px]:grid-cols-3">
              <h3 className="col-span-full m-0 mt-1.5 text-[15px] leading-[1.4] font-semibold text-secondary-foreground">What it means</h3>
              {card.means.map((m, i) => (
                <Stored
                  key={i}
                  line={m}
                  slot="week_read"
                  className={cn(
                    'm-0 text-[16px] leading-[1.6] text-foreground max-sm:py-2.5 max-sm:text-[15px]',
                    // On a phone they stack, a hairline between.
                    i > 0 ? 'max-sm:border-t max-sm:border-track' : 'max-sm:pt-1',
                  )}
                />
              ))}
            </div>
          ) : null}
          {card.href ? <div data-card-foot="" className="mt-1"><GoLink href={card.href}>Read the whole week</GoLink></div> : null}
        </>
      ) : (
        <>
          <h2 id="week-head" className="m-0 text-[21px] leading-[1.3] font-semibold text-foreground">{WEEK_CARD_TITLE}</h2>
          <EmptyBox>{card.state === 'thin' ? WEEK_THIN : WEEK_UNREAD}</EmptyBox>
        </>
      )}
    </article>
  )
}

// ---- The subject cards ------------------------------------------------------------------

/** The head's note: "Six subjects, biggest first" (words to twelve, as the
 *  board writes it); "biggest first" only where some card's row has a level
 *  (`ranked`), and those then lead (`subjectOrder`). Never from a card's
 *  state, which is about its words: Össur's six written reads with no reading
 *  in the month stand in name order (17 Oct). */
export function subjectsNote(cards: readonly SubjectCard[]): ReactNode {
  const n = cards.length
  const ranked = cards.some((c) => c.ranked === true)
  if (n === 1) return 'One subject'
  const word = countWord(n)
  const count = /\d/.test(word) ? <span data-copy="figure">{word}</span> : word.charAt(0).toUpperCase() + word.slice(1)
  return <>{count} subjects{ranked ? ', biggest first' : null}</>
}

/** One tracked subject's card: its name opening its page, its headline as
 *  the lead, what it means, and "Open {subject}" at its foot; no figure in
 *  any state (decision 3). */
function SubjectCardView({ card }: { card: SubjectCard }) {
  return (
    <article data-subject-card={card.state} className={cn(CARD, 'gap-2.5')}>
      <h3 className="m-0 text-[19px] leading-[1.3] font-semibold text-foreground max-sm:text-[18px]">
        {card.href ? <Link href={card.href} className={ROW}>{card.name}</Link> : card.name}
      </h3>
      {card.headline ? <Stored line={card.headline} slot="week_read" className="m-0 text-[16px] leading-[1.45] font-medium text-foreground" /> : null}
      {card.state === 'read' && card.body ? <Stored line={card.body} slot="week_read" className="m-0 text-[15px] leading-[1.6] text-secondary-foreground max-sm:text-[14.5px] max-sm:leading-[1.58]" /> : null}
      {card.state === 'thin' && card.body ? <Stored line={card.body} slot="week_read" className={GAPLINE} /> : null}
      {card.note ? <p className={GAPLINE}>{card.note}</p> : null}
      {card.state === 'provisional' || card.state === 'failed' ? (
        <div className="mt-0.5 flex flex-col gap-0.5">
          <Label className="mb-1">Inside it</Label>
          {card.inside.length > 0
            ? card.inside.map((c) => (
              <Link key={c.id} href={c.href} className={cn(ROW, 'py-1 text-[15px] font-normal')}>
                <span data-copy="subject" data-slot="pass_b_theme">{c.label}</span>
              </Link>
            ))
            : <p className="m-0 py-1 text-[14px] text-secondary-foreground">No conversation in it reached three videos yet.</p>}
        </div>
      ) : null}
      {card.href ? <div data-card-foot="" className="mt-auto pt-1.5"><GoLink href={card.href}>Open {card.name}</GoLink></div> : null}
    </article>
  )
}

/** "What the market is talking about": one card per tracked subject, two to
 *  a row from 1180 and one below; cards in a row share a height. */
export function SubjectCardsView({ cards }: { cards: readonly SubjectCard[] }) {
  return (
    <>
      <SectionHead id="subjects-title" title="What the market is talking about" note={cards.length > 0 ? subjectsNote(cards) : null} />
      <section id="subjects" aria-labelledby="subjects-title" className="grid scroll-mt-6 grid-cols-1 gap-5 min-[1180px]:grid-cols-2 max-sm:gap-3.5">
        {cards.length > 0
          ? cards.map((c) => <SubjectCardView key={c.id} card={c} />)
          : (
            <article data-subject-card="none" className={cn(CARD, 'min-[1180px]:col-span-2')}>
              <p className={GAPLINE}>Your subjects will appear here once they are named in Settings.</p>
            </article>
          )}
      </section>
    </>
  )
}

// ---- The words of "Also this week" -------------------------------------------------------

// The section is gone from the page (small call 12). Its words stay: the
// weekly email's test (components/email/weekly-read-v3.test.tsx) holds the
// email's own words equal to these.

/** The new card's words where nothing was first heard this week. */
export const NOTHING_NEW = 'Nothing new this week'
export const NOTHING_ELSE_NEW = 'Nothing else new this week'
/** The stand-in's line: the week's next biggest conversation. */
export const ALSO_TALKED = 'Also talked about'
/** The lead's eyebrow where it is the week's biggest. */
export const MOST_TALKED = 'Most talked about this week'
/** The stand-in's eyebrow where an earlier week first heard it. */
export const NEWEST = 'Newest'
