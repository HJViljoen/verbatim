import type { ReactNode } from 'react'
import { BlockQuote } from '@/components/blocks/quote'
import { overviewSentence, MARKET_SENTENCE_TITLE } from '@/components/pages/overview/sentence'
import { Parts, shortMonthName } from '@/components/pages/overview/market'
import { substituteFigures } from '@/lib/reports/cover'
import { proseFigures } from '@/lib/prose/figures'
import { EMAIL, FONT } from '@/lib/email/theme'
import { surface } from '@/lib/nav'
import { hasQuote } from '@/lib/renderables/quotes-freeze'
import { THEME_PREV_N, boardPrev, figureText, heroView, printedLead, themeToken, voicesHeading, type HeroPart } from '@/lib/pages/overview-market'
import type { OverviewData } from '@/lib/pages/overview'
import type { MonthlyData } from '@/lib/pages/monthly'
import type { FigureTable } from '@/lib/reading/verdicts'
import { fromFrontPage } from './adapt'
import { Body, Inner, Num, RowLabel, Table } from './email'

/**
 * 1 · The month (market-first WP2.1; the front page's block 1, plan §2.2).
 *
 * THE FRONT PAGE'S "THE MONTH", ON THE MONTH THAT HAS ENDED: the market's size,
 * its three biggest conversations not led by makers, the month before as
 * levels, the one chip, and the lead theme's voices. In the app and on paper
 * it is the page's block; in an inbox it is drawn as the email artboard draws
 * it, the three conversations as a table under the clause that names them.
 */

/**
 * The themes clause, cut where the email draws its table: the words up to
 * "…category videos:", and whatever follows the list (the makers sentence).
 * The words are the front page's own parts (`heroThemeParts`), cut and never
 * rewritten; a clause that is not a list (the subject lead) comes back whole.
 */
export function splitClause(parts: readonly HeroPart[]): { intro: HeroPart[]; after: HeroPart[] } | null {
  const i = parts.findIndex((p) => p.t === 'text' && p.s.includes(': '))
  if (i < 0) return null
  const head = parts[i] as Extract<HeroPart, { t: 'text' }>
  const intro: HeroPart[] = [...parts.slice(0, i), { t: 'text', s: head.s.slice(0, head.s.indexOf(': ') + 1) }]
  const j = parts.findIndex((p, k) => k > i && p.t === 'text' && p.s.startsWith('.'))
  if (j < 0) return { intro, after: [] }
  const close = parts[j] as Extract<HeroPart, { t: 'text' }>
  const rest = close.s.slice(1).trimStart()
  const after: HeroPart[] = [...(rest ? [{ t: 'text' as const, s: rest }] : []), ...parts.slice(j + 1)]
  if (after[0]?.t === 'text') after[0] = { t: 'text', s: after[0].s.trimStart() }
  return { intro, after }
}

/** The size sentence at the artboard's 28px, its figures in mono. The clause
 *  before its colon takes a line of its own, as the page sets it. */
function SizeSentence({ body, figures }: { body: string; figures: FigureTable }) {
  const colon = body.indexOf(': ')
  const split = colon > 0 && !body.slice(0, colon).includes('[[')
  const line = (text: string) =>
    substituteFigures(text, proseFigures(figures)).map((p, i) =>
      'text' in p
        ? <span key={i}>{p.text}</span>
        : <span key={i} data-copy="figure" style={{ fontFamily: FONT.mono, fontWeight: 600, letterSpacing: '-.04em' }}>{p.figure}</span>,
    )
  return (
    <div style={{ fontFamily: FONT.sans, fontSize: 28, lineHeight: '36px', fontWeight: 500, letterSpacing: '-.02em', color: EMAIL.ink }}>
      {split ? <>{body.slice(0, colon + 1)}<br />{line(body.slice(colon + 2))}</> : line(body)}
    </div>
  )
}

function monthEmail(data: MonthlyData): ReactNode {
  const o = data.overview
  const s = o.sentence
  const view = heroView(o.hero, o.themes, o.month)
  const hero = o.hero?.kind === 'themes' ? o.hero : null
  // No month before beside a refused themes pair, and no chip (T0a, MR-2).
  const shownPrev = o.themes ? boardPrev(o.themes) : null
  const prev = shownPrev && shownPrev.n != null ? shownPrev : null
  const cut = hero && hero.top.length > 0 ? splitClause(view.parts) : null
  const voices = (o.heroVoices ?? []).filter(hasQuote)
  // A stored lead our new searches found prints no voices (T0a, MR-3).
  const lead = printedLead(o.hero)
  // A theme the month before did not read declares no August figure
  // (`prevReadK`), so its cell prints the preview's "·", as the board's does
  // (./themes.tsx), never an empty cell under "Aug of N".
  const cell = (key: string, isPrev = false) => {
    const text = figureText(view.figures[key])
    return text ? <Num prev={isPrev}>{text}</Num> : isPrev ? <Num prev>·</Num> : null
  }
  return (
    <>
      <SizeSentence body={s.body} figures={s.figures} />
      {cut && hero ? (
        <>
          <Body marginTop={16}><Parts parts={cut.intro} figures={view.figures} mode="email" /></Body>
          <Table
            marginTop={12}
            columns={[
              { head: '' },
              { head: 'Videos', align: 'right', width: 64 },
              ...(prev ? [{ head: <span data-copy="level">{shortMonthName(prev.month)}<br />of {figureText(view.figures[THEME_PREV_N])}</span>, align: 'right' as const, width: 64 }] : []),
            ]}
            rows={hero.top.map((t) => [
              <RowLabel key="l"><span data-copy="subject" data-slot="pass_b_theme">{t.label}</span></RowLabel>,
              cell(themeToken(t.registryId, 'k')),
              ...(prev ? [cell(themeToken(t.registryId, 'prev'), true)] : []),
            ])}
          />
          {cut.after.length > 0 ? (
            <Body marginTop={12} size={14}><span style={{ color: EMAIL.muted }}><Parts parts={cut.after} figures={view.figures} mode="email" /></span></Body>
          ) : null}
        </>
      ) : view.parts.length > 0 ? (
        <Body marginTop={16}><Parts parts={view.parts} figures={view.figures} mode="email" /></Body>
      ) : null}
      {lead && voices.length > 0 ? (
        <Inner>
          <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '22px', fontWeight: 600, color: EMAIL.ink }}>
            {voicesHeading(voices.length)} on “<span data-copy="subject" data-slot="pass_b_theme">{lead.label}</span>”
          </div>
          <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '18px', color: EMAIL.muted, marginTop: 2 }}>from that theme’s own comments</div>
          {voices.map((v) => (
            <div key={v.quote.ref} style={{ marginTop: 16 }}><BlockQuote quote={v.quote} cite={v.cite} mode="email" /></div>
          ))}
        </Inner>
      ) : null}
    </>
  )
}

/** A withdrawn comment leaves its wrapper behind (`resolveQuotes` nulls a
 *  field): the voices the section prints are the ones that still resolve. */
function withResolvedVoices(o: OverviewData): OverviewData {
  if (!o.heroVoices) return o
  const kept = o.heroVoices.filter(hasQuote)
  return kept.length === o.heroVoices.length ? o : { ...o, heroVoices: kept }
}

export const monthlyMonth = fromFrontPage({
  key: 'monthly.month',
  title: MARKET_SENTENCE_TITLE,
  block: overviewSentence,
  link: () => {
    const page = surface('overview')
    return { href: page.href, label: `Open ${page.label} →` }
  },
  email: monthEmail,
  project: withResolvedVoices,
})
