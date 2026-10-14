import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { BrandChip, TAG } from '@/components/colour-roles'
import { MovementBadge } from '@/components/delta-badge'
import { ProportionBar } from '@/components/proportion-bar'
import { FlagChip, InPlacePanel, MiniBars, PanelSection, PanelTitle, StatCell, StatRow, TickBarRow, type PerBreakpoint } from '@/components/v2'
import { fmtInt, fmtPct } from '@/lib/format'
import { marketLabelsOf } from '@/lib/brands/labels'
import { MARKET_PANEL_MONTHS, platformRows, type ConvPanel, type MarketData, type MonthCount, type PanelQuote, type StoredLine, type SubjectDetail, type SubjectPanel } from '@/lib/pages/v2/market'
import type { WhoPart } from '@/lib/written/types'
import { translationLabel, translationNote } from '@/components/quote-block'
import { cn } from '@/lib/utils'
import { About, ConvChip, ConvRow, Label, OLINK, SetApartTag, Stored, newVerdict } from './parts'
import { PlatformMonthRow } from './rail'
import { BRANDS_NOT_COUNTED, BRANDS_NOT_READ } from '@/lib/pages/v2/voices'

// THE OPEN PANELS (depth v2, T3; E2-Market-Open): a conversation in full, or a
// subject in full, in place under the row it was opened from, with a notch
// pointing at it (`InPlacePanel`, driven by `?conv=` / `?subject=`). Level 2:
// the quotes (three, through the quote gate) and our read live here, never on
// the page above.

const ASK = 'inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-lg bg-brand px-3.5 text-[13.5px] font-semibold text-brand-foreground no-underline transition-colors hover:bg-brand/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** The month bars of a share line: the share over each bar, "k of n" under. */
function shareBars(bars: readonly MonthCount[]) {
  // The board's four months; only the newest can be "so far".
  const shown = bars.slice(-MARKET_PANEL_MONTHS)
  return shown.map((b, i) => {
    const pct = b.n ? (100 * (b.k ?? 0)) / b.n : 0
    const soFar = b.filling && i === shown.length - 1
    return {
      label: b.label,
      value: pct,
      display: fmtPct(pct),
      sub: b.n != null ? `${soFar ? 'so far · ' : ''}${fmtInt(b.k ?? 0)} of ${fmtInt(b.n)}` : undefined,
      filling: soFar,
    }
  })
}

/** `notchAt`: the placement's notch where the page placed the panel among
 *  its cards (T9); alone, the loader's. */
export function ConversationPanel({ panel, data, notchAt }: { panel: ConvPanel; data: MarketData; notchAt?: number | PerBreakpoint }) {
  const chip = panel.flag
    ? <FlagChip verdict={panel.flag} />
    : panel.isNew && data.month.category != null
      ? <FlagChip verdict={newVerdict(panel.id, panel.label, panel.stats[0]?.value ?? 0, data.month.category, data.month.month)} />
      : null
  return (
    <InPlacePanel
      id="conv-panel"
      notchAt={notchAt ?? panel.notchAt}
      openKey={panel.id}
      closeHref={panel.closeHref}
      labelledBy="conv-panel-title"
      closeLabel="Close this conversation"
      head={
        <>
          {panel.subjectName || chip ? (
            <div className="flex flex-wrap items-center gap-2">
              {panel.subjectName ? <span className={cn(TAG, 'rounded-md px-2 py-[3px] text-[12px]')}>{panel.subjectName}</span> : null}
              {chip}
            </div>
          ) : null}
          <PanelTitle id="conv-panel-title"><span data-copy="subject" data-slot="pass_b_theme">{panel.label}</span></PanelTitle>
        </>
      }
    >
      {panel.stats.length > 0 ? (
        <StatRow>
          {panel.stats.map((s, i) => <StatCell key={i} value={s.value} of={s.of} label={s.label} />)}
        </StatRow>
      ) : null}
      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[26px]">
          {panel.ourRead ? (
            <PanelSection label="Our read">
              {panel.ourRead.lines.map((l, i) => <Stored key={i} line={l} slot={panel.ourRead!.slot} className="m-0 text-[15.5px] leading-[1.62] text-foreground" />)}
            </PanelSection>
          ) : null}
          {panel.line && panel.line.bars.length > 0 ? (
            <PanelSection label={<>Month by month · share of {panel.line.basis} {panel.line.verdict ? <span data-copy="verdict" className="ml-1 normal-case tracking-normal"><MovementBadge verdict={panel.line.verdict} unit="pts" good="neutral" bandTip /></span> : null}</>}>
              <MiniBars bars={shareBars(panel.line.bars)} size="lg" className="max-sm:hidden" label={`Share of the category's videos about ${panel.label}, month by month`} />
              <MiniBars bars={shareBars(panel.line.bars).slice(-3)} size="md" className="sm:hidden" label={`Share of the category's videos about ${panel.label}, month by month`} />
            </PanelSection>
          ) : null}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-x-7 gap-y-[26px] sm:grid-cols-2">
          {data.brands !== 'counted' ? (
            <PanelSection label="Who it’s about">
              <p className="m-0 text-[13.5px] text-muted-foreground">{data.brands === 'not_counted' ? BRANDS_NOT_COUNTED : BRANDS_NOT_READ}</p>
            </PanelSection>
          ) : panel.who ? (
            <PanelSection label="Who it’s about">
              <WhoLine parts={panel.who.parts} data={data} />
            </PanelSection>
          ) : null}
          {panel.doing ? (
            <PanelSection label={<>What people did · <span data-copy="level">of {fmtInt(panel.doing.n)}</span> {panel.doing.text}</>}>
              {panel.doing.rows.map((r) => (
                <TickBarRow key={r.kind} name={r.label} value={fmtInt(r.k)} pct={r.n > 0 ? (100 * r.k) / r.n : 0} valueWidth="narrow" label={`${fmtInt(r.k)} of ${fmtInt(r.n)}`} />
              ))}
            </PanelSection>
          ) : null}
          {panel.groups.length > 0 ? (
            <PanelSection label="Who’s saying it">
              {panel.groups.map((g) => (
                <Link key={g.key} href={g.href} className="-mx-2 rounded-md px-2 py-1 text-[14.5px] text-foreground no-underline hover:bg-inner">
                  <span data-copy="subject" data-slot="pass_e_persona">{g.name}</span>
                </Link>
              ))}
              <p className="m-0 text-[12px] text-muted-foreground">Each opens in Voices</p>
            </PanelSection>
          ) : null}
          {panel.platforms ? (
            <PanelSection label="Where">
              {panel.platforms.rows.map((r, i) => (
                <TickBarRow key={r.platform} name={r.label} value={fmtInt(r.videos)} pct={r.pct} tone="ink" valueWidth="narrow" label={`${fmtInt(r.videos)} of ${fmtInt(panel.platforms!.n)}`} className={i > 2 ? 'opacity-80' : undefined} />
              ))}
            </PanelSection>
          ) : null}
        </div>
      </div>
      {panel.quotes.length > 0 ? <QuotesSection quotes={panel.quotes} data={data} /> : null}
      <div className="flex flex-wrap items-center gap-[18px] border-t border-track pt-5">
        <Link href={panel.askHref} className={ASK}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about this</Link>
      </div>
    </InPlacePanel>
  )
}

/** "Our read" on a subject: its own read where the published read holds one
 *  (14 Oct), what people said and then what it means for the company; else
 *  the week read's sentence on it. */
function subjectOurRead(panel: SubjectPanel): { lines: StoredLine[]; means: StoredLine | null } {
  if (panel.state === 'ready' && panel.read && panel.read.lines.length > 0) return { lines: panel.read.lines, means: panel.read.means ?? null }
  return { lines: panel.sentence ? [panel.sentence] : [], means: null }
}

/** The quotes a panel prints: the conversation panel's markup, one card each. */
function QuotesSection({ quotes, data }: { quotes: readonly PanelQuote[]; data: MarketData }) {
  return (
    <PanelSection label={<>In their words · <span data-copy="figure">{quotes.length}</span> of the comments</>}>
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
function WhoLine({ parts, data }: { parts: readonly WhoPart[]; data: MarketData }) {
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

/** The words a subject's week block says where the week holds none of its
 *  videos and the month some (the parity rule: the block keeps its frame). */
export const SUBJECT_NONE_THIS_WEEK = 'No video this week.'

/**
 * ONE BASE, NAMED (the lead's ruling, 14 Oct). The level counts the videos
 * its members are cited on and those where a member is only spoken on
 * camera; the blocks below read only the videos a comment dates. Where the
 * month's blocks read fewer videos than the level counts, one calm line under
 * the stats says which, the week beside the month on the week. Nothing where
 * the two agree.
 */
function SubjectBase({ level, detail, monthText }: { level: { k: number }; detail: SubjectDetail; monthText: string }) {
  const cited = detail.cited
  if (!cited || cited.month >= level.k) return null
  const fig = (n: number) => <span data-copy="figure">{fmtInt(n)}</span>
  return (
    <p data-subject-base="" className="m-0 text-[13px] leading-[1.5] text-muted-foreground">
      {cited.week != null
        ? <>The parts below read the videos where a comment was about it: {fig(cited.week)} this week, and {fig(cited.month)} of these {fig(level.k)} in {monthText}.</>
        : <>The parts below read the {fig(cited.month)} of these {fig(level.k)} videos where a comment was about it.</>}
    </p>
  )
}

/**
 * A READY subject's blocks (14 Oct): the conversation panel's right-hand
 * column over the subject's videos. This week, who it is about and where
 * each print the week with the month beside it (decision 1).
 */
function SubjectBlocks({ detail, data }: { detail: SubjectDetail; data: MarketData }) {
  const week = detail.basis === 'week'
  return (
    <div className="grid min-w-0 grid-cols-1 gap-x-7 gap-y-[26px] sm:grid-cols-2">
      {detail.brands !== 'counted' ? (
        <PanelSection label="Who it’s about">
          <p className="m-0 text-[13.5px] text-muted-foreground">{detail.brands === 'not_counted' ? BRANDS_NOT_COUNTED : BRANDS_NOT_READ}</p>
        </PanelSection>
      ) : detail.who ? (
        <PanelSection label={<>Who it’s about{week ? <span className="normal-case tracking-normal"> · this week</span> : null}</>}>
          {detail.who.parts.length > 0 ? <WhoLine parts={detail.who.parts} data={data} /> : <p className="m-0 text-[13.5px] text-muted-foreground">{SUBJECT_NONE_THIS_WEEK}</p>}
          {week && detail.who.month ? (
            <div className="flex flex-col gap-1">
              <Label className="normal-case tracking-normal">{data.month.text}</Label>
              <About parts={detail.who.month.parts} brand={data.brand} noun={data.noun} />
            </div>
          ) : null}
        </PanelSection>
      ) : null}
      {detail.doing ? (
        <PanelSection label={<>What people did · <span data-copy="level">of {fmtInt(detail.doing.n)}</span> {detail.doing.text}</>}>
          {detail.doing.rows.map((r) => (
            <TickBarRow key={r.kind} name={r.label} value={fmtInt(r.k)} pct={r.n > 0 ? (100 * r.k) / r.n : 0} valueWidth="narrow" label={`${fmtInt(r.k)} of ${fmtInt(r.n)}`} />
          ))}
        </PanelSection>
      ) : null}
      {detail.groups.length > 0 ? (
        <PanelSection label="Who’s saying it">
          {detail.groups.map((g) => (
            <Link key={g.key} href={g.href} className="-mx-2 rounded-md px-2 py-1 text-[14.5px] text-foreground no-underline hover:bg-inner">
              <span data-copy="subject" data-slot="pass_e_persona">{g.name}</span>
            </Link>
          ))}
          <p className="m-0 text-[12px] text-muted-foreground">Each opens in Voices</p>
        </PanelSection>
      ) : null}
      {detail.platforms ? (
        <PanelSection label="Where">
          {week && detail.platforms.month ? (
            // This week: each platform's week beside its month (decision 1).
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 gap-y-1.5 text-[13px]">
              <span />
              <span className="text-right text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">This week</span>
              <span className="text-right text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{detail.platforms.month.text}</span>
              {(detail.platforms.rows.length > 0 ? detail.platforms.rows : platformRows(detail.platforms.month.counts, 'month')?.rows ?? []).map((r) => (
                <PlatformMonthRow key={r.platform} label={r.label} week={detail.platforms!.rows.find((x) => x.platform === r.platform)?.videos ?? 0} month={detail.platforms!.month!.counts[r.platform] ?? 0} n={detail.platforms!.month!.n} />
              ))}
              {detail.platforms.rows.length === 0 ? <p className="col-span-3 m-0 text-[13px] text-muted-foreground">{SUBJECT_NONE_THIS_WEEK}</p> : null}
            </div>
          ) : detail.platforms.rows.map((r, i) => (
            <TickBarRow key={r.platform} name={r.label} value={fmtInt(r.videos)} pct={r.pct} tone="ink" valueWidth="narrow" label={`${fmtInt(r.videos)} of ${fmtInt(detail.platforms!.n)}`} className={i > 2 ? 'opacity-80' : undefined} />
          ))}
        </PanelSection>
      ) : null}
    </div>
  )
}

export function SubjectPanelView({ panel, data, notchAt }: { panel: SubjectPanel; data: MarketData; notchAt?: number | PerBreakpoint }) {
  const week = data.period === 'week'
  // Ruling U6: the blocks rest on the subject's membership, so a READY
  // subject alone has them; every other state keeps the panel as it was.
  const detail = panel.state === 'ready' ? panel.detail ?? null : null
  const ourRead = subjectOurRead(panel)
  const left = (
    <div className="flex min-w-0 flex-col gap-[26px]">
      {ourRead.lines.length > 0 ? (
        <PanelSection label="Our read">
          {ourRead.lines.map((l, i) => <Stored key={i} line={l} slot="week_read" className="m-0 text-[15.5px] leading-[1.62] text-foreground" />)}
          {ourRead.means ? (
            <>
              <Label className="mt-1 normal-case tracking-normal">What it means for {data.brand}</Label>
              <Stored line={ourRead.means} slot="week_read" className="m-0 text-[15.5px] leading-[1.62] text-foreground" />
            </>
          ) : null}
        </PanelSection>
      ) : null}
      {panel.bars.length > 0 ? (
        <PanelSection label="Month by month · share of your market’s videos">
          <MiniBars bars={shareBars(panel.bars)} size="lg" className="max-sm:hidden" label={`Share of the market's videos about ${panel.name}, month by month`} />
          <MiniBars bars={shareBars(panel.bars).slice(-3)} size="md" className="sm:hidden" label={`Share of the market's videos about ${panel.name}, month by month`} />
        </PanelSection>
      ) : null}
    </div>
  )
  const inside = (
    <PanelSection label={<>Conversations inside it {week ? <span className="normal-case tracking-normal">· this week, and {data.month.text}</span> : null}</>}>
      {panel.inside.length > 0
        ? panel.inside.map((c) => (
          <ConvRow
            key={c.id}
            href={c.href}
            label={c.label}
            chip={<><ConvChip flag={c.flag} isNew={c.isNew} id={c.id} label={c.label} k={c.month ?? c.count ?? 0} n={data.month.category ?? 0} month={data.month.month} /><SetApartTag setApart={c.setApart} /></>}
            counts={week ? [c.count, c.month] : [c.count]}
          />
        ))
        : <p className="m-0 text-[13.5px] text-muted-foreground">No conversation in it reached three videos.</p>}
    </PanelSection>
  )
  return (
    <InPlacePanel
      id="subject-panel"
      notchAt={notchAt ?? panel.notchAt}
      openKey={panel.id}
      closeHref={panel.closeHref}
      labelledBy="subject-panel-title"
      closeLabel="Close this subject"
      head={
        <>
          <div className="flex flex-wrap items-center gap-2"><span className={cn(TAG, 'rounded-md px-2 py-[3px] text-[12px]')}>Subject</span></div>
          <PanelTitle id="subject-panel-title">{panel.name}</PanelTitle>
        </>
      }
    >
      {panel.state !== 'ready' && panel.note ? (
        // No level: why, in one line, and the conversations inside it, as the
        // board lists them, in every state (14 Oct: one being re-described
        // too; a tracked subject is never hidden).
        <p data-subject-state={panel.state} className="m-0 text-[15px] leading-[1.6] text-foreground">
          {panel.note.endsWith('.') ? panel.note : `${panel.note}.`}
        </p>
      ) : null}
      {panel.level ? (
        <StatRow>
          {/* This week: the week's videos beside the month's level (decision 1). */}
          {detail?.week ? <StatCell value={detail.week.k} of={detail.week.n} label="videos in your market this week" /> : null}
          <StatCell value={panel.level.k} of={panel.level.n} label={`videos in your market, ${panel.monthText}`} />
          <StatCell value={`${Math.round(panel.level.pct)}%`} label={<>of the market’s videos <span data-copy="verdict"><MovementBadge verdict={panel.verdict} unit="pts" good="neutral" bandTip /></span></>} />
        </StatRow>
      ) : null}
      {panel.level && detail ? <SubjectBase level={panel.level} detail={detail} monthText={panel.monthText} /> : null}
      {detail ? (
        // THE CONVERSATION PANEL'S ANATOMY (14 Oct): our read and the month
        // line, the four blocks beside them, the quotes, then the
        // conversations inside it.
        <>
          <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            {left}
            <SubjectBlocks detail={detail} data={data} />
          </div>
          {detail.quotes.length > 0 ? <QuotesSection quotes={detail.quotes} data={data} /> : null}
          {inside}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          {left}
          {inside}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-[18px] border-t border-track pt-5">
        <Link href={panel.askHref} className={ASK}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about this</Link>
        <Label className="normal-case tracking-normal">Subjects are named in Settings</Label>
      </div>
    </InPlacePanel>
  )
}

/** For a test: the link class of the panel's Ask. */
export const PANEL_ASK = ASK
export const PANEL_OLINK = OLINK
