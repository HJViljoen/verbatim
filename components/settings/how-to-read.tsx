import Link from 'next/link'
import type { ReactNode } from 'react'

import { GO, LBL } from '@/components/v2/look'
import { cn } from '@/lib/utils'
import { GLOSSARY, READER_FLAGS, THIRTEEN_WORDS, type GlossaryKey } from '@/lib/calibration'
import { surface } from '@/lib/nav'
import { DEFINITIONS, READING_CARDS, READING_PATH } from '@/lib/settings/how-to-read'

// Settings › How to read, the body (Phase 1 WP16, design ST9; market-first
// WP3.10): one card per page, the reading words, the definitions and a way
// through the product. The route resolves the session and the bar; this draws
// the content from `lib/settings/how-to-read.ts` and decides nothing, so it
// renders in the static test tier.
//
// THE 25 SEP RULINGS, APPLIED TO THE GUIDE ITSELF (plan §1 B ruling 3):
//   - a card's header is its title alone. "Open it →" sat at the right of the
//     header; it is a link, so it moves to the card's foot, which holds links
//     only, and it names the page by its current sidebar label (§4.0), as
//     every other footer link does;
//   - the question under the title is §2.1's ("Question (Settings › How to
//     read)"): the one line a page's bar no longer carries;
//   - the pane's header carries no meta ("9 pages" went), and each card's line
//     under its title is one line.
//
// "THE THIRTEEN WORDS" IS FIFTEEN NOW (WP1.6 added market and brand to
// THIRTEEN_WORDS, whose name stays as the constant every surface imports), so
// the card no longer counts them in its title. The two marks a theme row can
// carry on the market pages, makers and off-topic (decision F), are glossary
// words the pages print as row tags, so they are listed beside the flags.
//
// SINCE THE AUDIT DESIGN (7 Nov, Settings-HowToRead.dc.html): every card a
// white tile with a 21px title; a page card's question at 18px (no mono),
// "Words this page uses" a comma list of the names alone (each word is
// defined once, under "The words every page uses"), "What it cannot tell
// you" a bulleted list, "Open {page}" a link with no arrow; the words a
// ruled list of terms and definitions; the way through three to a row. The
// sub-heads are labels in sentence case, never mono capitals.

/** The marks a theme row can carry on a market page (decision F): printed as
 *  row tags ("about a third makers", "set aside"), defined in the glossary. */
export const ROW_MARKS = ['maker', 'off_topic'] as const satisfies readonly GlossaryKey[]

const TILE = 'scroll-mt-4 rounded-[12px] bg-card p-[30px] shadow-card max-sm:p-[18px]'
const H2 = 'm-0 text-[21px] font-semibold leading-[1.3]'
const LEAD = 'm-0 mt-1.5 text-[15px] leading-[1.55] text-secondary-foreground'

function Bullets({ items, className }: { items: readonly string[]; className?: string }) {
  return (
    <ul className={cn('m-0 flex max-w-[900px] list-disc flex-col gap-2 pl-5 text-[15px] leading-[1.6]', className)}>
      {items.map((c) => <li key={c}>{c}</li>)}
    </ul>
  )
}

function Words({ keys }: { keys: readonly GlossaryKey[] }) {
  return (
    <dl className="m-0 mt-2.5">
      {keys.map((k) => (
        <div key={k} className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-track py-[13px] sm:grid-cols-[200px_minmax(0,1fr)]">
          <dt className="text-[15px] font-semibold">{GLOSSARY[k][0]}</dt>
          <dd className="m-0 text-[15px] leading-[1.6] text-secondary-foreground">{GLOSSARY[k][1]}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One card per page, in the sidebar's order. */
export function PageCards() {
  return (
    <div id="reading-cards" className="flex flex-col gap-5">
      {READING_CARDS.map((card) => {
        const s = surface(card.key)
        return (
          <section
            key={card.key}
            id={card.key}
            data-search={`${s.label} ${s.question ?? ''} ${card.tells} ${card.cannot.join(' ')} ${card.read.map((k) => GLOSSARY[k][0]).join(' ')}`.toLowerCase()}
            className={TILE}
          >
            <h2 className={H2}>{s.label}</h2>
            {s.question && <p className="m-0 mt-1.5 text-[18px] font-medium leading-[1.4]">{s.question}</p>}
            <p className="m-0 mt-3 max-w-[900px] text-[15.5px] leading-[1.6] text-secondary-foreground">{card.tells}</p>

            {/* The names alone: each word is defined once, under The words
                every page uses (the board's de-duplication). */}
            {card.read.length > 0 && (
              <p className="m-0 mt-4 text-[14.5px] leading-[1.55]">
                <span className={LBL}>Words this page uses</span>
                <span className="mt-1 block">{card.read.map((k) => GLOSSARY[k][0]).join(', ')}</span>
              </p>
            )}

            <h3 className={cn(LBL, 'm-0 mt-5')}>What it cannot tell you</h3>
            <Bullets items={card.cannot} className="mt-2" />

            <footer className="mt-5">
              <Link href={s.href} className={GO}>Open {s.label}</Link>
            </footer>
          </section>
        )
      })}
    </div>
  )
}

/** The reading words, the two flags and the two row marks. */
export function ReadingWords() {
  return (
    <section className={TILE}>
      <h2 className={H2}>The words every page uses</h2>
      <p className={LEAD}>Each one means the same thing on every page and in every document.</p>
      {/* A word says what a figure IS; a flag or a mark says something about
          the row it sits on. Three lists, so a card that says what it holds
          holds exactly that. */}
      <div className="mt-4"><Words keys={THIRTEEN_WORDS} /></div>
      <h3 className="m-0 mt-7 text-[17px] font-semibold">Two flags a row can carry</h3>
      <Words keys={READER_FLAGS} />
      <h3 className="m-0 mt-7 text-[17px] font-semibold">Two marks a theme can carry</h3>
      <Words keys={ROW_MARKS} />
    </section>
  )
}

/** The method the pages do not print under their blocks, once, each under a
 *  stable anchor a page links to. */
export function Definitions() {
  return (
    <section className={TILE}>
      <h2 className={H2}>Definitions</h2>
      <p className={cn(LEAD, 'mb-3')}>What the pages no longer explain beside every figure.</p>
      {/* Ruling M (copy de-clutter, 2026-09-24) and the 25 Sep rulings: one
          paragraph per idea, each under a stable id. A legend or a link opens
          #<id>, and lib/settings/how-to-read.test.ts asserts every anchor a
          pill points at exists. */}
      {DEFINITIONS.map((d) => (
        <section key={d.id} id={d.id} className="scroll-mt-4 border-t border-track py-[18px] last:pb-0">
          <h3 className="m-0 text-[16px] font-semibold">{d.title}</h3>
          <p className="m-0 mt-1.5 max-w-[900px] text-[15px] leading-[1.65] text-secondary-foreground">{d.body}</p>
        </section>
      ))}
    </section>
  )
}

/** A way through the product, on the three clocks it keeps. */
export function ReadingPath() {
  return (
    <section className={TILE}>
      <h2 className={H2}>A way through it</h2>
      <p className={LEAD}>The product keeps three clocks, and each answers a different question.</p>
      <div className="mt-5 grid grid-cols-1 gap-7 md:grid-cols-3">
        {READING_PATH.map((step) => (
          <div key={step.when}>
            <h3 className="m-0 mb-2 text-[16px] font-semibold">{step.when}</h3>
            <Bullets items={step.what} className="text-secondary-foreground" />
          </div>
        ))}
      </div>
    </section>
  )
}

/** The whole body, under the route's frame. `search` is the route's
 *  ListSearch (it reads the URL, so it cannot render in the static tier). */
export function HowToReadBody({ search }: { search?: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      {search}
      <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">Each page below lists the words it uses; every word is defined once, under The words every page uses.</p>
      <PageCards />
      <ReadingWords />
      <Definitions />
      <ReadingPath />
    </div>
  )
}
