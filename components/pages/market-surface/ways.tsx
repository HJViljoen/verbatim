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
const LIVE = `${BUTTON} bg-tile text-foreground ring-1 ring-border transition-colors hover:bg-inner`
const DEAD = `${BUTTON} cursor-not-allowed bg-inner text-muted-foreground ring-1 ring-border/70`

/** One way's slot. THE NOTE IS CAPPED BY ITS SLOT, NEVER BY ITSELF: a
 *  `max-w-[240px]` on the note alone is wider than most of these buttons, so at
 *  1440 the sentence belonging to "Confirm this month's card" ran under "Track
 *  this" as well and a reader could not tell which sentence explained which
 *  control. The cap belongs to the column. */
const SLOT = 'flex min-w-0 max-w-[260px] flex-col gap-1'

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
          ? <button type="button" disabled aria-disabled="true" data-print-hide className={DEAD}>{way.title}</button>
          : <span className={dead ? DEAD : LIVE}>{way.title}</span>}
      {dead ? <span className="text-[11px] leading-[1.35] text-secondary-foreground">{way.how}</span> : null}
      {way.unlock ? <span className="text-[11px] leading-[1.35] text-muted-foreground">{way.unlock}</span> : null}
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
        meta={`five ways in · ${live} of ${w.ways.length} work today · a move is scored from the update after it`}
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
