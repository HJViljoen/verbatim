import { Ban, CircleHelp, Frown, Lightbulb, Repeat, ShoppingBag, Sparkle, ThumbsUp, UserRound, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * PALETTE A'S COLOUR ROLES (colour pass, 1 Oct; MASTER.md §Colour roles).
 *
 * Heinrich, 1 Oct: "I kinda want more of the colours that we have in the
 * colour palette to actually show up on this site … none of the orange or
 * brown." More colour, but every colour keeps ONE job, so a reader learns it
 * once and reads it on every page:
 *
 *   yellow  #FFD43B  the market and the brand: a bar counting the market's
 *                    videos, the Agent, a finding's number on a market read
 *   orange  #F2651D  FILLS ONLY: what is new this week, and the second series
 *                    of a chart (the comments line); attention marks
 *   orange text #C2410C  eyebrows, labels and links; the glyph in an icon tile
 *   gold    #9A6B00  you (the client): its chip, its bars, its figures
 *   grey    #8A9097  rivals: their chips' dot, their bars
 *   pale yellow #FFF4C7  small surfaces: icon tiles, tags (a subject, a
 *                    conversation, a term), the selected row or tab
 *
 * Everything that draws one of these jobs goes through this file, so the
 * classes are written out once (whole, for Tailwind's scanner) and a page
 * never picks a colour for itself. Tokens, not literals: each has a `.dark`
 * counterpart in app/globals.css, so the roles hold on ink too.
 *
 * Bans that still hold: orange is never a text colour (the orange TEXT is
 * #C2410C); no marker fill behind words in prose (a chip is a label on a brand
 * line, never inside a sentence); pale yellow never fills a large surface; no
 * left stripe; no gradient.
 */

/** Whose videos a bar counts, and so its fill. */
export type BarWho = 'market' | 'you' | 'rival' | 'second'

/** A bar's fill by whose videos it counts: the market yellow, you gold, a
 *  rival grey, a chart's second series orange. */
export const BAR_FILL: Record<BarWho, string> = {
  market: 'bg-brand',
  you: 'bg-you',
  rival: 'bg-comp',
  second: 'bg-orange',
}

/** An eyebrow over a card's lead ("In short", "A conversation in full"). */
export const EYEBROW = 'text-[12px] font-bold uppercase tracking-[0.08em] text-orange-text'

/** A selected row, pill or tab: the pale yellow, ink on it. */
export const SELECTED = 'bg-accent text-accent-foreground'

/** A tag (a conversation's or subject's label, a market term): the pale
 *  yellow, ink on it. Single-line pills only (MASTER: rounding follows the
 *  content). */
export const TAG = 'bg-accent text-accent-foreground'

export type IconTone = 'soft' | 'brand' | 'new'

const TILE_TONE: Record<IconTone, string> = {
  // The pale yellow under the orange text: 4.7:1 for the glyph.
  soft: 'bg-accent text-orange-text',
  // The Agent: the brand yellow, ink on it.
  brand: 'bg-brand text-brand-foreground',
  // What is new: the orange fill, ink on it (4.6:1).
  new: 'bg-orange text-brand-foreground',
}

/**
 * A card's or a tile's icon: a rounded square in front of its title. `md` is
 * 28px (a card title, a Dashboard tile), `sm` 24px (a card inside a grid).
 * Decorative: the title beside it says what the card is.
 *
 * IT TAKES NO HEIGHT OF ITS OWN: a negative block margin brings it to 18px of
 * layout, under any title's line, so a card's rows sit exactly where they did
 * before it had one (no layout change; the colour pass, 1 Oct).
 */
export function IconTile({
  icon: Icon, tone = 'soft', size = 'md', className,
}: { icon: LucideIcon; tone?: IconTone; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      aria-hidden
      data-icon-tile={tone}
      className={cn(
        // Centred on its title's line (`self-center`), so the group can align
        // its title by baseline with whatever stands beside it.
        'inline-flex shrink-0 items-center justify-center self-center',
        size === 'sm' ? '-my-[3px] size-6 rounded-[7px]' : '-my-[5px] size-7 rounded-[8px]',
        TILE_TONE[tone],
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} strokeWidth={2} />
    </span>
  )
}

/**
 * A brand on a brand line ("Cotopaxi 2 · Patagonia 2 · other bags 16"): you
 * in a gold chip with white words (4.7:1; gold TEXT on the ground is 4.3:1
 * and failed AA inside a quote panel), a rival in a chip on the track with
 * the rival grey's dot. The market stays plain muted words around them: it is
 * the default, and a chip on every row would make the exception the rule.
 * Shorter than any line it sits in (its own leading 1.2, no padding), so it
 * never grows a line, wrapped lines never touch, and the words keep their
 * order for a screen reader.
 */
export function BrandChip({ who, children, className }: { who: 'you' | 'rival'; children: ReactNode; className?: string }) {
  if (who === 'you') {
    return (
      <span data-who-chip="you" className={cn('inline-block whitespace-nowrap rounded-[4px] bg-you px-1.5 py-px leading-none font-semibold text-you-foreground', className)}>
        {children}
      </span>
    )
  }
  return (
    <span data-who-chip="rival" className={cn('inline-block whitespace-nowrap rounded-[4px] bg-track px-1.5 py-px leading-none font-semibold text-foreground', className)}>
      <span aria-hidden className="mr-1 inline-block size-1.5 rounded-full bg-comp align-[0.12em]" />
      {children}
    </span>
  )
}

/** The " · " between two parts of a brand line, where a chip stands on
 *  either side: the chip already bounds itself, so the dot is not drawn (it
 *  cost a wrapped line beside four chips) and is kept for a screen reader and
 *  for the line's words, which read "Cotopaxi 2 · other bags 16" as before. */
export function ChipSep() {
  return <>{' '}<span className="sr-only">·</span>{' '}</>
}

/** A small "new" mark: an orange disc with its numeral in ink (This week's
 *  findings, which are the week's new talk). */
export function NewNumber({ n, size = 26 }: { n: number; size?: 16 | 26 }) {
  return (
    <div
      aria-hidden
      data-new-number=""
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-orange font-bold text-brand-foreground',
        size === 16 ? 'size-4 text-[10px]' : 'size-[26px] text-[13px]',
      )}
    >
      {n}
    </div>
  )
}

/** Each kind of comment's glyph, for the cards that hold one kind (the
 *  Conversation page's "The market's words"). Keys are `talkKindLabel`'s. */
export const KIND_ICON: Record<string, LucideIcon> = {
  praise: ThumbsUp,
  purchase_intent: ShoppingBag,
  question: CircleHelp,
  pain_point: Frown,
  feature_request: Lightbulb,
  objection: Ban,
  buying_trigger: Sparkle,
  switching_signal: Repeat,
  demographic_signal: UserRound,
}
