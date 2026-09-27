import Link from 'next/link'
import type { ReactNode } from 'react'

import { SettingsCard } from '@/components/settings-frame'
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

/** The marks a theme row can carry on a market page (decision F): printed as
 *  row tags ("about a third makers", "set aside"), defined in the glossary. */
export const ROW_MARKS = ['maker', 'off_topic'] as const satisfies readonly GlossaryKey[]

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((c) => (
        <li key={c} className="flex gap-2 text-[12px] leading-[1.45] text-secondary-foreground">
          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
          {c}
        </li>
      ))}
    </ul>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{children}</p>
}

function Words({ keys }: { keys: readonly GlossaryKey[] }) {
  return (
    <dl className="flex flex-col gap-1.5">
      {keys.map((k) => (
        <div key={k} className="flex gap-2 text-[12px] leading-[1.5]">
          <dt className="w-[110px] shrink-0 font-semibold">{GLOSSARY[k][0]}</dt>
          <dd className="text-secondary-foreground">{GLOSSARY[k][1]}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One card per page, in the sidebar's order. */
export function PageCards() {
  return (
    <div id="reading-cards" className="flex flex-col gap-3">
      {READING_CARDS.map((card) => {
        const s = surface(card.key)
        return (
          <section
            key={card.key}
            id={card.key}
            data-search={`${s.label} ${s.question ?? ''} ${card.tells} ${card.cannot.join(' ')} ${card.read.map((k) => GLOSSARY[k][0]).join(' ')}`.toLowerCase()}
            className="scroll-mt-4 rounded-md bg-inner px-4 pt-3.5"
          >
            <h3 className="text-[14px] font-semibold">{s.label}</h3>
            {s.question && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{s.question}</p>}
            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-secondary-foreground">{card.tells}</p>

            {card.read.length > 0 && (
              <div className="mt-3">
                <Eyebrow>How to read it</Eyebrow>
                <dl className="flex flex-col gap-1">
                  {card.read.map((k) => (
                    <div key={k} className="flex gap-2 text-[12px] leading-[1.45]">
                      <dt className="shrink-0 font-semibold text-foreground">{GLOSSARY[k][0]}</dt>
                      <dd className="text-secondary-foreground">{GLOSSARY[k][1]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <div className="mt-3">
              <Eyebrow>What it cannot tell you</Eyebrow>
              <Bullets items={card.cannot} />
            </div>

            <footer className="mt-3 border-t border-border/70 py-2.5">
              <Link href={s.href} className="text-[12px] font-medium hover:underline">Open {s.label} →</Link>
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
    <SettingsCard title="The words every page uses" description="Each one means the same thing on every page and in every document.">
      {/* A word says what a figure IS; a flag or a mark says something about
          the row it sits on. Three lists, so a card that says what it holds
          holds exactly that. */}
      <Words keys={THIRTEEN_WORDS} />
      <p className="mb-1.5 mt-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Two flags a row can carry</p>
      <Words keys={READER_FLAGS} />
      <p className="mb-1.5 mt-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Two marks a theme can carry</p>
      <Words keys={ROW_MARKS} />
    </SettingsCard>
  )
}

/** The method the pages do not print under their blocks, once, each under a
 *  stable anchor a page links to. */
export function Definitions() {
  return (
    <SettingsCard title="Definitions" description="What the pages no longer explain beside every figure.">
      {/* Ruling M (copy de-clutter, 2026-09-24) and the 25 Sep rulings: one
          paragraph per idea, each under a stable id. A legend or a link opens
          #<id>, and lib/settings/how-to-read.test.ts asserts every anchor a
          pill points at exists. */}
      <div className="flex flex-col gap-3">
        {DEFINITIONS.map((d) => (
          <section key={d.id} id={d.id} className="scroll-mt-4">
            <h3 className="text-[13px] font-semibold">{d.title}</h3>
            <p className="mt-0.5 text-[12px] leading-[1.5] text-secondary-foreground">{d.body}</p>
          </section>
        ))}
      </div>
    </SettingsCard>
  )
}

/** A way through the product, on the three clocks it keeps. */
export function ReadingPath() {
  return (
    <SettingsCard title="A way through it" description="The product keeps three clocks, and each answers a different question.">
      <div className="flex flex-col gap-3">
        {READING_PATH.map((step) => (
          <div key={step.when}>
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{step.when}</p>
            <div className="mt-1"><Bullets items={step.what} /></div>
          </div>
        ))}
      </div>
    </SettingsCard>
  )
}

/** The whole body, under the route's frame. `search` is the route's
 *  ListSearch (it reads the URL, so it cannot render in the static tier). */
export function HowToReadBody({ search }: { search?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {search}
      <PageCards />
      <ReadingWords />
      <Definitions />
      <ReadingPath />
    </div>
  )
}
