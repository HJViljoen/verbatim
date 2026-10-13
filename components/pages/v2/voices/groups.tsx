import Link from 'next/link'
import { Users } from 'lucide-react'
import { CARD, CardHead, InPlacePanel, PanelSection, PanelTitle, SELECTED_CARD_RING, StatCell, StatRow, TickBar } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { groupRows, PANEL_ID, type GroupPanel, type VoicesData, type VoicesGroupCard, type VoicesGroups } from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { AskButton, CAPS, EmptyLine, Fig, LevelText, MiniRow, OLINK, PanelTag, Phrase, PlatformStrip, QuoteCard } from './parts'

// THE GROUPS (board E3-Voices, "Who's in your market" and the group cards;
// E3-Voices-Open, the group's panel). Decision 2 holds: each group is this
// month's videos as a count of the market's, with no share of the market, no
// change since last month and no "how the mix changed" card. A video can hold
// more than one group, so the counts are drawn as separate bars, never one
// stacked bar with an "Other" remainder.

/** "Who's in your market": every group's videos this month, a bar each. */
export function WhoCard({ groups, videos, monthWords }: { groups: VoicesGroups; videos: number | null; monthWords: string }) {
  const n = videos ?? 0
  return (
    // `id="cast"`: an old Conversation link (`/dashboard/voice#cast`, the cast
    // of who is talking) lands here with its fragment (lib/nav.ts).
    <section id="cast" aria-labelledby="voices-who" className={cn(CARD, 'scroll-mt-6')}>
      <CardHead
        icon={Users}
        id="voices-who"
        title="Who’s in your market"
        sub={
          groups.state === 'ready' && n > 0
            ? <>The groups of people commenting, and how many of the market’s <Fig>{fmtInt(n)}</Fig> videos in {monthWords} each one comments on. A video can hold more than one group, so the counts overlap.</>
            : 'The groups of people commenting in your market.'
        }
      />
      {groups.state !== 'ready' ? <EmptyLine>{groups.empty}</EmptyLine> : n === 0 ? (
        <EmptyLine>No market video in {monthWords} yet.</EmptyLine>
      ) : (
        <div role="list" className="flex flex-col gap-2.5">
          {groups.cards.map((c) => (
            <div key={c.key} role="listitem" className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_auto] items-center gap-3 text-[13.5px] max-sm:grid-cols-[minmax(0,1fr)_auto]">
              <Link href={c.href} scroll={false} className={cn('min-w-0 truncate font-semibold text-foreground no-underline hover:underline hover:underline-offset-[3px]', c.selected ? 'underline underline-offset-[3px]' : null)}>
                <span data-copy="subject" data-slot="pass_e_persona">{c.name}</span>
              </Link>
              <TickBar pct={(100 * c.videos) / n} size="lg" tone="market" label={`${c.name}: ${fmtInt(c.videos)} of ${fmtInt(n)} videos`} className="max-sm:hidden" />
              <LevelText k={c.videos} n={n} unit="videos" className="text-right text-[12.5px] text-secondary-foreground" />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** One group (the board's `.pcard`). */
export function GroupCard({ card, n, monthWords }: { card: VoicesGroupCard; n: number | null; monthWords: string }) {
  return (
    <article
      data-group={card.key}
      className={cn(CARD, 'gap-3.5 rounded-[14px] px-[22px] py-5', card.selected ? SELECTED_CARD_RING : null)}
    >
      <div>
        <h3 className="m-0 text-[16.5px] font-semibold leading-[1.3] text-foreground"><span data-copy="subject" data-slot="pass_e_persona">{card.name}</span></h3>
        {card.oneLiner ? <p className="m-0 mt-[3px] text-[13.5px] leading-[1.45] text-muted-foreground"><span data-copy="subject" data-slot="pass_e_persona">{card.oneLiner}</span></p> : null}
      </div>
      {card.videos > 0 && n ? (
        <div data-copy="level" className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[28px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground">{fmtInt(card.videos)}</span>
          <span className="font-mono text-[12.5px] text-muted-foreground">of {fmtInt(n)} videos</span>
        </div>
      ) : (
        <p className="m-0 text-[13.5px] text-muted-foreground">No video of the market’s in {monthWords} carries their comments.</p>
      )}
      {card.subjects.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-[10px] bg-inner px-3.5 py-3">
          <p className={cn(CAPS, 'mb-0.5')}>What they talk about · of their <Fig>{fmtInt(card.videos)}</Fig></p>
          {card.subjects.map((s) => <MiniRow key={s.id} label={s.label} k={s.k} of={card.videos} />)}
        </div>
      ) : null}
      {card.wants || card.stops ? (
        <div className="flex flex-col gap-1.5 text-[13.5px] leading-[1.45] text-foreground">
          {card.wants ? <div><b className="font-semibold">Wants:</b> <span data-copy="subject" data-slot="pass_e_persona">{card.wants}</span></div> : null}
          {card.stops ? <div><b className="font-semibold">Stops them:</b> <span data-copy="subject" data-slot="pass_e_persona">{card.stops}</span></div> : null}
        </div>
      ) : null}
      {card.platforms.length > 0 ? (
        <div>
          <p className={cn(CAPS, 'mb-1.5')}>Where</p>
          <PlatformStrip platforms={card.platforms} label={`Where ${card.name} comment`} />
        </div>
      ) : null}
      <div className="mt-auto flex items-center justify-between pt-1">
        <Link
          href={card.href}
          scroll={false}
          aria-expanded={card.selected}
          aria-controls={card.selected ? PANEL_ID.group : undefined}
          className={OLINK}
        >
          {card.selected ? 'Close ↑' : 'Open →'}
        </Link>
      </div>
    </article>
  )
}

/** The group's panel, in place under its row (E3-Voices-Open). */
export function GroupPanelView({ panel, monthWords }: { panel: GroupPanel; monthWords: string }) {
  const [first, second] = panel.subjects
  const where = panel.platforms[0]
  return (
    <InPlacePanel
      id={PANEL_ID.group}
      notchAt={panel.notchAt}
      closeHref={panel.closeHref}
      labelledBy="group-title"
      closeLabel="Close this group"
      head={
        <>
          <div className="flex flex-wrap items-center gap-2"><PanelTag>Group</PanelTag></div>
          <PanelTitle id="group-title"><span data-copy="subject" data-slot="pass_e_persona">{panel.name}</span></PanelTitle>
          {panel.oneLiner ? <p className="m-0 mt-1 text-[14px] leading-[1.4] text-muted-foreground"><span data-copy="subject" data-slot="pass_e_persona">{panel.oneLiner}</span></p> : null}
        </>
      }
    >
      <StatRow>
        {panel.n ? <StatCell value={panel.videos} of={panel.n} label="videos they comment on" /> : <StatCell value={panel.videos} label="videos they comment on" />}
        {first && panel.videos > 0 ? <StatCell value={first.k} of={panel.videos} label={<>are about {first.label}</>} /> : null}
        {second && panel.videos > 0 ? <StatCell value={second.k} of={panel.videos} label={<>are about {second.label}</>} /> : null}
        {where && panel.videos > 0 ? <StatCell value={where.k} of={panel.videos} label={<>are on {where.label}</>} /> : null}
      </StatRow>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-3">
        {panel.wants ? <PanelSection label="What they want"><p className="m-0 text-[15px] leading-[1.6] text-foreground"><span data-copy="subject" data-slot="pass_e_persona">{panel.wants}</span></p></PanelSection> : null}
        {panel.stops ? <PanelSection label="What stops them"><p className="m-0 text-[15px] leading-[1.6] text-foreground"><span data-copy="subject" data-slot="pass_e_persona">{panel.stops}</span></p></PanelSection> : null}
        {panel.triggers ? <PanelSection label="What tips them into acting"><p className="m-0 text-[15px] leading-[1.6] text-foreground"><span data-copy="subject" data-slot="pass_e_persona">{panel.triggers}</span></p></PanelSection> : null}
      </div>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-3">
        {panel.who.length > 0 ? (
          <PanelSection label="Who they say they are">
            {panel.who.slice(0, 5).map((w) => (
              <div key={w.label} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_30px] items-center gap-2.5 text-[13.5px]">
                <span className="min-w-0"><span data-copy="stored" data-slot="pass_a_audience_insight">{w.label}</span></span>
                <TickBar pct={(100 * w.count) / Math.max(1, ...panel.who.map((x) => x.count))} size="md" label={`${w.label}: ${w.count}`} />
                <Fig className="text-right text-[12.5px]">{fmtInt(w.count)}</Fig>
              </div>
            ))}
            <span className="text-[12px] text-muted-foreground">How often each came up in what they said</span>
          </PanelSection>
        ) : null}
        {panel.conversations.length > 0 ? (
          <PanelSection label="The conversations they’re in">
            <div className="flex flex-col gap-0.5">
              {panel.conversations.map((c) => (
                <Link key={c.registryId} href={c.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[14px] text-foreground no-underline hover:bg-inner">
                  <span className="min-w-0"><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></span>
                  <LevelText k={c.k} n={panel.videos} className="ml-auto shrink-0 whitespace-nowrap text-[13px] text-secondary-foreground" />
                </Link>
              ))}
            </div>
            <span className="text-[12px] text-muted-foreground">Each opens in Market</span>
          </PanelSection>
        ) : null}
        {panel.platforms.length > 0 && panel.videos > 0 ? (
          <PanelSection label={<>Where they comment · of <Fig>{fmtInt(panel.videos)}</Fig></>}>
            {panel.platforms.map((p) => <MiniRow key={p.platform} size="md" tone="ink" label={p.label} k={p.k} of={panel.videos} />)}
          </PanelSection>
        ) : null}
      </div>

      {panel.phrases.length > 0 ? (
        <PanelSection label="How they talk">
          <div>{panel.phrases.map((p) => <Phrase key={p.text} text={p.text} english={p.english} />)}</div>
        </PanelSection>
      ) : null}

      {panel.quotes.length > 0 ? (
        <PanelSection label={<>In their words · <Fig>{fmtInt(panel.quotes.length)}</Fig> of their comments in {monthWords}</>}>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            {panel.quotes.map((q) => <QuoteCard key={q.ref} quote={q} />)}
          </div>
        </PanelSection>
      ) : null}

      <AskButton href={panel.askHref}>Ask the Agent about this group</AskButton>
    </InPlacePanel>
  )
}

/** The cards three to a row, and the open group's panel under the row its
 *  card is in. */
export function GroupGrid({ data }: { data: Pick<VoicesData, 'groups' | 'videos' | 'panel' | 'monthWords'> }) {
  const rows = groupRows(data.groups.cards, 3)
  const panel = data.panel?.kind === 'group' ? data.panel : null
  return (
    <>
      {rows.map((row, i) => (
        <div key={i} className="contents">
          <section aria-label={i === 0 ? 'The groups' : 'The groups, continued'} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {row.map((c) => <GroupCard key={c.key} card={c} n={data.videos} monthWords={data.monthWords} />)}
          </section>
          {panel && row.some((c) => c.key === panel.key) ? <GroupPanelView panel={panel} monthWords={data.monthWords} /> : null}
        </div>
      ))}
    </>
  )
}
