import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { TAG } from '@/components/colour-roles'
import { MovementBadge } from '@/components/delta-badge'
import { FlagChip, MiniBars, PanelSection, SpikeBars, StatCell, StatRow, TickBarRow } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { noGroupSaying, type ConvPage, type MarketData } from '@/lib/pages/v2/market'
import { cn } from '@/lib/utils'
import { BRANDS_NOT_COUNTED, BRANDS_NOT_READ } from '@/lib/pages/v2/voices'
import { ASK, GroupRows, QuotesSection, shareBars, WhoLine } from './panel'
import { newVerdict, Stored } from './parts'
import { PAGE_CARD, READ } from './subject-page'

// A CONVERSATION'S PAGE (depth as pages, 17 Oct; board F2-Market-Conversation):
// E2's conversation panel, its anatomy whole, as a page. Its subject and its
// chip, its name, the stats (each "of N"), our read, week by week (three bare
// counts) and month by month where the data has
// months, who it is about, what people did, who is saying it (each group's
// videos "k of n"), and where, three
// comments through the quote gate, the Agent. The data is `loadConvPanel`'s,
// as the panel had it.

/** The page's body under its bar: one card, E2's anatomy. */
export function ConversationPageBody({ page, data }: { page: ConvPage; data: MarketData }) {
  const { panel } = page
  const chip = panel.flag
    ? <FlagChip verdict={panel.flag} />
    : panel.isNew && data.month.category != null
      ? <FlagChip verdict={newVerdict(panel.id, panel.label, page.month?.k ?? page.week?.k ?? 0, data.month.category, data.month.month)} />
      : null
  const weeks = page.weeks.length > 0 ? page.weeks : null
  const months = panel.line && panel.line.bars.length > 0 ? panel.line : null
  const base = panel.groupBase ?? null
  return (
    <article id="conversation" aria-labelledby="conv-head" className={PAGE_CARD}>
      <div className="flex flex-col gap-2.5">
        {panel.subjectName || chip ? (
          <div className="flex flex-wrap items-center gap-2">
            {panel.subjectName ? <span className={cn(TAG, 'rounded-md px-2 py-[3px] text-[12px]')}>{panel.subjectName}</span> : null}
            {chip}
          </div>
        ) : null}
        <h2 id="conv-head" className="m-0 max-w-[900px] text-[28px] leading-[1.28] font-semibold tracking-[-0.02em] text-foreground max-sm:text-[21px] max-sm:leading-[1.3]">
          <span data-copy="subject" data-slot="pass_b_theme">{panel.label}</span>
        </h2>
      </div>
      {panel.stats.length > 0 ? (
        // The stats share the row: four, or three where no flag adds its
        // baseline (the board draws four; the row never leaves a hole). Two
        // to a row under 1280, so an odd last one takes the row's width
        // there (the fresh check, 17 Oct: at 390 the third sat beside a gap).
        <StatRow className={cn('max-sm:gap-2.5', panel.stats.length === 3 ? 'xl:grid-cols-3' : panel.stats.length === 2 ? 'xl:grid-cols-2' : null, panel.stats.length % 2 === 1 ? 'max-xl:[&>*:last-child]:col-span-2' : null)}>
          {panel.stats.map((s, i) => <StatCell key={i} value={s.value} of={s.of} label={s.label} />)}
        </StatRow>
      ) : null}
      <div className="grid grid-cols-1 gap-11 max-sm:gap-[26px] min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex min-w-0 flex-col gap-[26px]">
          {panel.ourRead ? (
            <PanelSection label="Our read">
              {panel.ourRead.lines.map((l, i, all) => (
                <Stored
                  key={i}
                  line={l}
                  slot={panel.ourRead!.slot}
                  // The read's last line is what it means, quieter, as the board draws it.
                  className={cn(READ, panel.ourRead!.slot === 'week_read' && all.length > 1 && i === all.length - 1 ? 'text-secondary-foreground' : null)}
                />
              ))}
            </PanelSection>
          ) : null}
          {weeks ? (
            <PanelSection label="Week by week · videos">
              {/* Three bare counts, as the Dashboard's tile and the subject's
                  page draw them; a week our own change cut keeps its slot. */}
              <SpikeBars weeks={weeks} counts="all" ghost className="max-w-[560px]" label={`Category videos a week about ${panel.label}`} />
            </PanelSection>
          ) : null}
          {months ? (
            <PanelSection label={<>Month by month · share of {months.basis} {months.verdict ? <span data-copy="verdict" className="ml-1 normal-case tracking-normal"><MovementBadge verdict={months.verdict} unit="pts" good="neutral" bandTip /></span> : null}</>}>
              <MiniBars bars={shareBars(months.bars)} size="lg" className="max-sm:hidden" label={`Share of the category's videos about ${panel.label}, month by month`} />
              <MiniBars bars={shareBars(months.bars).slice(-3)} size="md" className="sm:hidden" label={`Share of the category's videos about ${panel.label}, month by month`} />
            </PanelSection>
          ) : null}
        </div>
        <div className="grid min-w-0 grid-cols-1 content-start gap-x-7 gap-y-[26px] sm:grid-cols-2">
          <PanelSection label="Who it’s about">
            {data.brands !== 'counted'
              ? <p className="m-0 text-[13.5px] text-muted-foreground">{data.brands === 'not_counted' ? BRANDS_NOT_COUNTED : BRANDS_NOT_READ}</p>
              : panel.who ? <WhoLine parts={panel.who.parts} data={data} /> : <p className="m-0 text-[13.5px] text-muted-foreground">No video read for who it is about.</p>}
          </PanelSection>
          <PanelSection label={panel.doing ? <>What people did · <span data-copy="level">of {fmtInt(panel.doing.n)}</span> {panel.doing.text}</> : 'What people did'}>
            {panel.doing
              ? panel.doing.rows.map((r) => <TickBarRow key={r.kind} name={r.label} value={fmtInt(r.k)} pct={r.n > 0 ? (100 * r.k) / r.n : 0} valueWidth="narrow" label={`${fmtInt(r.k)} of ${fmtInt(r.n)}`} />)
              : <p className="m-0 text-[13.5px] text-muted-foreground">Not read yet.</p>}
          </PanelSection>
          {/* Each group's videos of the conversation's in the period, the
              base named in the label as the subject's page names its own
              (17 Oct); Pass E's names alone where they were not counted. */}
          <PanelSection label={base ? <>Who’s saying it · <span data-copy="level">of {fmtInt(base.n)}</span> {base.text}</> : 'Who’s saying it'}>
            {panel.groups.length > 0
              ? <GroupRows groups={panel.groups} n={base?.n ?? null} />
              : <p className="m-0 text-[13.5px] text-muted-foreground">{base ? noGroupSaying(base.text) : 'Not linked to a group.'}</p>}
          </PanelSection>
          <PanelSection label={panel.platforms ? <>Where · <span data-copy="level">of {fmtInt(panel.platforms.n)}</span> {data.period === 'week' ? 'this week' : `in ${data.month.text}`}</> : 'Where'}>
            {panel.platforms
              ? panel.platforms.rows.map((r, i) => <TickBarRow key={r.platform} name={r.label} value={fmtInt(r.videos)} pct={r.pct} tone="ink" valueWidth="narrow" label={`${fmtInt(r.videos)} of ${fmtInt(panel.platforms!.n)}`} className={i > 2 ? 'opacity-80' : undefined} />)
              : <p className="m-0 text-[13.5px] text-muted-foreground">No video counted by platform yet.</p>}
          </PanelSection>
        </div>
      </div>
      {panel.quotes.length > 0 ? <QuotesSection quotes={panel.quotes} data={data} /> : null}
      <div className="flex flex-wrap items-center gap-[18px] border-t border-track pt-5">
        <Link href={panel.askHref} className={cn(ASK, 'max-sm:w-full max-sm:justify-center')}><Sparkles className="size-3.5" aria-hidden />Ask the Agent about this</Link>
      </div>
    </article>
  )
}
