import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { BrandChip, TAG } from '@/components/colour-roles'
import { MovementBadge } from '@/components/delta-badge'
import { ProportionBar } from '@/components/proportion-bar'
import { FlagChip, InPlacePanel, MiniBars, PanelSection, PanelTitle, StatCell, StatRow, TickBarRow, type PerBreakpoint } from '@/components/v2'
import { fmtInt, fmtPct } from '@/lib/format'
import { marketLabelsOf } from '@/lib/brands/labels'
import { MARKET_PANEL_MONTHS, type ConvPanel, type MarketData, type MonthCount, type SubjectPanel } from '@/lib/pages/v2/market'
import { translationLabel, translationNote } from '@/components/quote-block'
import { cn } from '@/lib/utils'
import { About, ConvChip, ConvRow, Label, OLINK, SetApartTag, Stored, newVerdict } from './parts'
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
  const whoTotal = panel.who?.n ?? 0
  const words = marketLabelsOf(data.noun)
  const whoSegments = (panel.who?.parts ?? []).map((p) => ({
    label: p.about === 'client' ? data.brand : p.about === 'market' ? words.short : p.about.slice('rival:'.length),
    count: p.videos,
    pct: whoTotal > 0 ? Math.round((100 * p.videos) / whoTotal) : 0,
    color: p.about === 'client' ? 'bg-you' : p.about === 'market' ? 'bg-track' : 'bg-comp',
  }))
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
              {panel.who.parts.some((p) => p.about !== 'market') ? <ProportionBar of="videos" segments={whoSegments} /> : null}
              <About parts={panel.who.parts} brand={data.brand} noun={data.noun} />
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
      {panel.quotes.length > 0 ? (
        <PanelSection label={<>In their words · <span data-copy="figure">{panel.quotes.length}</span> of the comments</>}>
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
            {panel.quotes.map((q, i) => {
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
      ) : null}
      <div className="flex flex-wrap items-center gap-[18px] border-t border-track pt-5">
        <Link href={panel.askHref} className={ASK}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about this</Link>
      </div>
    </InPlacePanel>
  )
}

export function SubjectPanelView({ panel, data, notchAt }: { panel: SubjectPanel; data: MarketData; notchAt?: number | PerBreakpoint }) {
  const week = data.period === 'week'
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
          {panel.state === 'failed' ? panel.note : `${panel.note}.`}
        </p>
      ) : null}
      {panel.level ? (
        <StatRow>
          <StatCell value={panel.level.k} of={panel.level.n} label={`videos in your market, ${panel.monthText}`} />
          <StatCell value={`${Math.round(panel.level.pct)}%`} label={<>of the market’s videos <span data-copy="verdict"><MovementBadge verdict={panel.verdict} unit="pts" good="neutral" bandTip /></span></>} />
        </StatRow>
      ) : null}
      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[26px]">
          {panel.sentence ? (
            <PanelSection label="Our read">
              <Stored line={panel.sentence} slot="week_read" className="m-0 text-[15.5px] leading-[1.62] text-foreground" />
            </PanelSection>
          ) : null}
          {panel.bars.length > 0 ? (
            <PanelSection label="Month by month · share of your market’s videos">
              <MiniBars bars={shareBars(panel.bars)} size="lg" className="max-sm:hidden" label={`Share of the market's videos about ${panel.name}, month by month`} />
              <MiniBars bars={shareBars(panel.bars).slice(-3)} size="md" className="sm:hidden" label={`Share of the market's videos about ${panel.name}, month by month`} />
            </PanelSection>
          ) : null}
        </div>
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
      </div>
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
