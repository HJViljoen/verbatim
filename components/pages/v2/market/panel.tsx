import Link from 'next/link'
import { BrandChip } from '@/components/colour-roles'
import { ProportionBar } from '@/components/proportion-bar'
import { PanelSection } from '@/components/v2'
import { fmtInt, fmtPct } from '@/lib/format'
import { marketLabelsOf } from '@/lib/brands/labels'
import { MARKET_PANEL_MONTHS, type GroupLink, type MarketData, type MonthCount, type PanelQuote, type SubjectDetail } from '@/lib/pages/v2/market'
import type { WhoPart } from '@/lib/written/types'
import { translationLabel, translationNote } from '@/components/quote-block'
import { About } from './parts'
import { BTN_PRIMARY, ROW, toMax } from '@/components/v2/look'
import { cn } from '@/lib/utils'

// THE PARTS MARKET'S PAGES SHARE (17 Oct; until then the open panels', E2-
// Market-Open): the Agent's button, a share line's month bars, the three
// comments (level 2: quotes live on a page, never on the top layer), who a
// set of videos is about, who is saying it, and the subject's one base,
// named. The pages
// themselves are ./subject-page.tsx and ./conversation-page.tsx.

/** The Agent's button for the pages that borrow it (Your products, Your
 *  moves): the kit's primary (the brand yellow, decision 8). Market's own
 *  pages ask with a link (`GoLink`), as its boards do. */
export const ASK = cn(BTN_PRIMARY, 'no-underline')

/** The month bars of a share line: the share over each bar, "k of n" under.
 *  WHOLE PERCENTS (the fresh check, 17 Oct): the subject's page printed
 *  "34%" on its tile and "34.0%" on the bar below it, one figure two ways;
 *  the boards print whole percents here, as the tiles and the kinds card
 *  do, and the "k of n" under each bar keeps it checkable. */
export function shareBars(bars: readonly MonthCount[]) {
  // At most a conversation's four months (a subject's page hands in three); only the newest can be "so far".
  const shown = bars.slice(-MARKET_PANEL_MONTHS)
  return shown.map((b, i) => {
    const pct = b.n ? (100 * (b.k ?? 0)) / b.n : 0
    const soFar = b.filling && i === shown.length - 1
    return {
      label: b.label,
      value: pct,
      display: fmtPct(pct, 0),
      sub: b.n != null ? `${soFar ? 'so far, ' : ''}${fmtInt(b.k ?? 0)} of ${fmtInt(b.n)}` : undefined,
      filling: soFar,
    }
  })
}

/** The quotes a panel prints: the conversation panel's markup, one card each. */
export function QuotesSection({ quotes, data }: { quotes: readonly PanelQuote[]; data: MarketData }) {
  return (
    <PanelSection label={<>In their words, <span data-copy="figure">{quotes.length}</span> of the comments</>}>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        {quotes.map((q, i) => {
          const note = translationNote({ lang: q.lang, english: q.english })
          const label = translationLabel(note)
          return (
            <figure key={i} className="m-0 flex flex-col gap-1.5 rounded-[10px] bg-inner px-[15px] py-[13px]">
              <blockquote data-copy="quote" className="m-0 font-serif text-[15.5px] italic leading-[1.5] text-foreground">“{q.text}”</blockquote>
              {label ? <span className="text-[12px] text-muted-foreground">{label}</span> : null}
              {note.english ? <p data-copy="quote" className="m-0 font-serif text-[14px] leading-[1.5] text-muted-foreground">{note.english}</p> : null}
              <figcaption className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                <span>{q.source}</span>
                {q.about === 'client' ? <BrandChip who="you">{data.brand}</BrandChip> : q.about && q.about !== 'market' ? <BrandChip who="rival">{q.about.slice('rival:'.length)}</BrandChip> : null}
              </figcaption>
            </figure>
          )
        })}
      </div>
    </PanelSection>
  )
}

/** Who a set of videos is about, as the conversation panel draws it: the bar
 *  where a brand is in it, then the running line. */
export function WhoLine({ parts, data }: { parts: readonly WhoPart[]; data: MarketData }) {
  const total = parts.reduce((s, p) => s + p.videos, 0)
  const words = marketLabelsOf(data.noun)
  const segments = parts.map((p) => ({
    label: p.about === 'client' ? data.brand : p.about === 'market' ? words.short : p.about.slice('rival:'.length),
    count: p.videos,
    pct: total > 0 ? Math.round((100 * p.videos) / total) : 0,
    color: p.about === 'client' ? 'bg-you' : p.about === 'market' ? 'bg-track' : 'bg-comp',
  }))
  return (
    <>
      {parts.some((p) => p.about !== 'market') ? <ProportionBar of="videos" segments={segments} /> : null}
      <About parts={parts} brand={data.brand} noun={data.noun} />
    </>
  )
}

/**
 * WHO'S SAYING IT, one list for a subject's page and a conversation's (17
 * Oct; the audit design, 7 Nov): each group by name, opening in Voices, a bar
 * against the list's largest (decision 5) and its videos as a bare count,
 * where they were counted (`GroupLink.videos`, `groupCountsOf`); `n`, the
 * base, is said once by the caller's head. A count, never a share (decision
 * 2). `note` keeps "Each opens in Voices" under the list for the pages that
 * do not say it in their head.
 */
export function GroupRows({ groups, n, note = true }: { groups: readonly GroupLink[]; n: number | null; note?: boolean }) {
  const bar = toMax(groups.map((g) => g.videos ?? 0))
  return (
    <>
      <div role="list" className="flex flex-col gap-2.5">
        {groups.map((g) => (
          <div key={g.key} role="listitem" className="grid grid-cols-[minmax(0,1fr)_96px_40px] items-center gap-3 text-[15px] leading-[1.35]">
            <Link href={g.href} className={cn(ROW, 'min-w-0 font-normal')}><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></Link>
            {g.videos != null && n != null ? (
              <>
                <div aria-hidden className="h-2 rounded-[4px] bg-track"><div className="h-2 rounded-[4px] bg-brand" style={{ width: `${bar(g.videos)}%` }} /></div>
                <span data-copy="figure" className="text-right tabular-nums">{fmtInt(g.videos)}</span>
              </>
            ) : null}
          </div>
        ))}
      </div>
      {note ? <p className="m-0 text-[13px] text-muted-foreground">Each opens in Voices</p> : null}
    </>
  )
}

/**
 * ONE BASE, NAMED (the lead's ruling, 14 Oct). The level counts the videos
 * its members are cited on and those where a member is only spoken on
 * camera, and since 17 Oct so does the week's share (`week`, the same reading
 * over the week's window); the blocks below read only the videos a comment
 * dates. Where they read fewer videos than the tiles count, the month's or
 * the week's, one calm line under the stats says which, the week beside the
 * month on the week. Nothing where they agree.
 */
export function SubjectBase({ level, week = null, detail, monthText }: { level: { k: number }; week?: { k: number } | null; detail: SubjectDetail; monthText: string }) {
  const cited = detail.cited
  if (!cited) return null
  // The week's tile, where it was read and holds every video the blocks read.
  const weekOf = cited.week != null && week && cited.week <= week.k ? week : null
  if (cited.month >= level.k && !(weekOf && cited.week! < weekOf.k)) return null
  const fig = (n: number) => <span data-copy="figure">{fmtInt(n)}</span>
  return (
    <p data-subject-base="" className="m-0 text-[14px] leading-[1.5] text-secondary-foreground">
      {cited.week != null
        ? <>The parts below read the videos where a comment was about it: {fig(cited.week)} {weekOf ? <>of these {fig(weekOf.k)} </> : null}this week, and {fig(cited.month)} of these {fig(level.k)} in {monthText}.</>
        : <>The parts below read the {fig(cited.month)} of these {fig(level.k)} videos where a comment was about it.</>}
    </p>
  )
}

/** For a test: the link class of the panel's Ask. */
export const PANEL_ASK = ASK
