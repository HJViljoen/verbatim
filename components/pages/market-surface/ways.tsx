import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { MarketSurfaceData, WayRow } from '@/lib/pages/market-surface'
import { AcceptAdviceButton } from './accept-button'

// MK5 · How a move is made (design §3 MK5; ported to the artboard, Block D
// wave 2).
//
// FIVE BUTTONS IN A ROW, NOT FIVE PARAGRAPHS. The artboard draws this as one
// full-width strip of 44px controls in a fixed order — Confirm this month's
// card · Track this · Accept advice · Register a claim · Upload a plan — and
// that order is the argument: the card first, because it is the one a client
// meets already filled in. The block was five stacked rows of title, prose and
// an unlock sentence, at four times the height, with the accept button rendered
// separately below the list it belongs in.
//
// A WAY THAT DOES NOT WORK KEEPS ITS SENTENCE INSIDE ITS OWN SLOT. The artboard
// draws five live buttons; two of these five write nothing yet, and a control
// that looks pressable and is not is worse than a control that says why. So a
// dead way renders as a disabled-looking slot with its unlock underneath it, in
// the same cell — never as a live button, and never dropped, because the count
// of ways in is part of what this block tells a reader.
//
// "Track this" IS LIVE BUT NOT HERE: it needs a subject or a theme in hand and
// Market has neither, so its one click is a link to the surface that does.
// "Accept this advice" is the one button on this page that writes, and it
// writes a move against the ledger's oldest undecided row — its own slot now,
// where it belongs, with the row it would act on named beneath it.
//
// THE CLAIMS MOVED OUT (`market.sayhear`). They were a tail on the bottom of
// this block under this block's heading; they are a different question and the
// artboard gives them a card.

/** The artboard's button shape: 44px, rounded 6, green for the one primary. */
const BUTTON = 'inline-flex h-[44px] items-center gap-2 rounded-md px-4 text-[13px] font-medium'
/**
 * A WAY THAT WORKS IS THE HEAVIER CONTROL, WHICH IS THE WAY ROUND THIS ROW HAD
 * IT BACKWARDS.
 *
 * `LIVE` was `bg-tile` — the tile's own white, so no fill at all — inside a
 * solid hairline, and `DEAD` was `bg-inner`: a filled grey slab. Rendered at
 * 1440 the two ways that write NOTHING were the two loudest objects on a row
 * whose meta says "3 of 5 work today", and the row said the opposite of its own
 * sentence. A disabled control has to be visible (it is the count of ways in,
 * and it carries the sentence saying why it cannot be pressed) and it may not
 * be the emphasis.
 *
 * So the fill comes off the dead one and its hairline goes to 60%: the live
 * control is the artboard's white-with-a-hairline and the dead one is the same
 * outline, quieter, in muted ink. Tokens only — no new tone.
 */
const LIVE = `${BUTTON} bg-tile text-foreground ring-1 ring-border transition-colors hover:bg-inner`
const DEAD = `${BUTTON} cursor-not-allowed bg-transparent text-muted-foreground ring-1 ring-border/60`

/** One way's slot. THE NOTE IS CAPPED BY ITS SLOT, NEVER BY ITSELF: a
 *  `max-w-[240px]` on the note alone is wider than most of these buttons, so at
 *  1440 the sentence belonging to "Confirm this month's card" ran under "Track
 *  this" as well and a reader could not tell which sentence explained which
 *  control. The cap belongs to the column.
 *
 *  AND THE CONTROL IS SIZED BY ITS LABEL, NEVER BY THE NOTE UNDER IT. A flex
 *  column stretches its children, so the 260px the SENTENCE needs was spent on
 *  the BUTTON: the two dead ways rendered as 260×44 slabs while the two live
 *  ones, whose notes are shorter, shrank to 90px and 114px. The artboard sizes
 *  every one of its five by its own text (`inline-flex`, `padding: 0 16px`), so
 *  `items-start` does here what `inline-flex` does there and the cap goes on
 *  applying to the column the note wraps in. */
const SLOT = 'flex min-w-0 max-w-[260px] flex-col items-start gap-1'

function Way({ way, mode, appUrl }: { way: WayRow; mode: RenderMode; appUrl: string }) {
  const email = mode === 'email'
  if (email) {
    return (
      <div style={{ padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 600, color: EMAIL.ink }}>
          {way.href ? <a href={`${appUrl}${way.href}`} style={{ color: EMAIL.ink }}>{way.title} →</a> : way.title}
        </div>
        <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 2 }}>{way.how}</div>
        {way.unlock ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 }}>{way.unlock}</div> : null}
      </div>
    )
  }
  // A WAY THAT DOES NOT WORK IS A DISABLED CONTROL, AND IT SAYS SO IN WORDS.
  // It was a `<span>` wearing the live button's ring: not focusable, carrying
  // no `aria-disabled` and no role, told apart from a working control by a
  // colour shift alone — and its "how" lived in a `title` no keyboard and no
  // touch reaches. A real `disabled` button announces itself, and the sentence
  // that a mouse used to have to find is printed under it.
  const dead = !way.live
  return (
    <span className={SLOT}>
      {way.href && mode === 'app'
        ? <Link href={`${appUrl}${way.href}`} className={LIVE} title={way.how}>{way.title}</Link>
        : dead && mode === 'app'
          // PAPER DRAWS NO CONTROL AT ALL, live or dead: an export must not
          // render a button nobody can press, so print keeps the slot's shape
          // as a plain span and the words under it carry the whole answer.
          // ON SCREEN THE DEAD WAY'S "HOW" AND ITS NOT-BUILT LINE RIDE AS A
          // TOOLTIP (copy de-clutter B75, ruling G): the roadmap is listed once
          // in Settings › Readiness. The wrapper carries the title because a
          // disabled button fires no hover in every browser.
          ? <span title={[way.how, way.unlock].filter(Boolean).join(' ')} className="cursor-help"><button type="button" disabled aria-disabled="true" data-print-hide className={DEAD}>{way.title}</button></span>
          : <span className={dead ? DEAD : LIVE}>{way.title}</span>}
      {dead && mode !== 'app' ? <span className="text-[11px] leading-[1.35] text-secondary-foreground">{way.how}</span> : null}
      {way.unlock && (!dead || mode !== 'app') ? <span className="text-[11px] leading-[1.35] text-muted-foreground">{way.unlock}</span> : null}
    </span>
  )
}

export const marketWays: Block<MarketSurfaceData> = {
  key: 'market.ways',
  title: 'How a move is made',
  question: 'How do we tell you what we are doing about it?',

  render(data, mode = 'app', ctx) {
    const w = data.ways
    const email = mode === 'email'
    const live = w.ways.filter((x) => x.live).length

    return (
      <BlockFrame
        title={marketWays.title}
        question={marketWays.question}
        mode={mode}
        // THE ARTBOARD'S META, and the count it leaves out. "five ways in · a
        // move is scored from the update after it" is true and says nothing
        // about how many of the five a reader can actually use today, which on
        // this page is the more useful half.
        meta={`five ways in · ${live} of ${w.ways.length} work today`}
      >
        {email ? (
          <div>{w.ways.map((way) => <Way key={way.key} way={way} mode={mode} appUrl={ctx.appUrl} />)}</div>
        ) : (
          <div className="flex flex-wrap items-start gap-2.5">
            {w.ways.map((way) => (
              way.key === 'advice' && mode === 'app' && w.acceptable ? (
                // THE ONE BUTTON ON THIS PAGE THAT WRITES, in its own slot in
                // the artboard's order, with the row it would act on named
                // under it. It used to be rendered below the whole list.
                <span key={way.key} className={SLOT}>
                  <AcceptAdviceButton lineageId={w.acceptable.lineageId} title={w.acceptable.title} />
                  <span className="text-[11px] leading-[1.35] text-muted-foreground">
                    The oldest you have not decided on: <span data-copy="stored" data-slot="pass_d_b_recommendation">{w.acceptable.title}</span>
                  </span>
                </span>
              ) : <Way key={way.key} way={way} mode={mode} appUrl={ctx.appUrl} />
            ))}
          </div>
        )}
      </BlockFrame>
    )
  },

  // NO FIGURES, and the design says so itself: this section "holds no numbers
  // except the per-month verdict on a registered claim", which is the number it
  // cannot produce.
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.ways.empty
  },
}
