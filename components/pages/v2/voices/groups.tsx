import Link from 'next/link'
import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { Users } from 'lucide-react'
import {
  CARD, CardHead, equalColumns, InPlacePanel, panelItemOrder, panelPlacement, PanelSection, PanelSlot, PanelTitle, SELECTED_CARD_RING, SlopePair, StatCell, StatRow, TickBar,
  type PanelLayout, type PerBreakpoint,
} from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { prevMonth } from '@/lib/reading/month-key'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import {
  GROUP_NO_WHO, GROUP_NOT_COMPARED, GROUP_NOT_DESCRIBED, groupNoConversations, MIX_WHY, mixNotRead, mixTitle, PANEL_ID, slopeLabel, WHO_SHOWN, type GroupPanel, type GroupProducts, type VoicesData, type VoicesGroupCard, type VoicesGroups,
} from '@/lib/pages/v2/voices'
import { cn } from '@/lib/utils'
import { AskButton, CAPS, EmptyLine, FailedSubjectsFoot, Fig, LevelText, MiniRow, NotMeasuredRows, OLINK, PanelTag, Phrase, PendingSubjectsLine, PlatformStrip, QuoteCard } from './parts'

// THE GROUPS (board E3-Voices, "Who's in your market", the group cards and
// "How the mix changed"; E3-Voices-Open, the group's panel). Decision 2
// holds: each group is this month's videos as a count of the market's, with
// no share of the market and no change since last month. A video can hold
// more than one group, so the counts are drawn as separate bars, never one
// stacked bar with an "Other" remainder. THE BOARD'S SHAPE HOLDS AROUND IT
// (the parity pass, 13 Oct): a card's verdict slot says the change is not
// compared yet, and the mix card keeps the grid's sixth place, this month's
// column drawn and last month's left empty, with one line saying why.

/** "Who's in your market": every group's videos this month, a bar each. */
export function WhoCard({ groups, videos, monthWords, failed }: { groups: VoicesGroups; videos: number | null; monthWords: string; failed?: readonly { id: string; label: string }[] }) {
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
            // Below 1024, where the sidebar leaves the card too narrow for the
            // name beside the bar, the bar takes its own line under the name
            // and the count, full width and compact (the fresh check, 13 Oct:
            // the board's phone draws its band there), and a long name wraps
            // rather than being cut (T9); from 1024 it sits between them.
            <div key={c.key} role="listitem" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-[13.5px] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_auto] lg:gap-y-0">
              <Link href={c.href} scroll={false} className={cn('min-w-0 font-semibold text-foreground no-underline hover:underline hover:underline-offset-[3px]', c.selected ? 'underline underline-offset-[3px]' : null)}>
                <span data-copy="subject" data-slot="pass_e_persona">{c.name}</span>
              </Link>
              <TickBar pct={(100 * c.videos) / n} size="lg" tone="market" label={`${c.name}: ${fmtInt(c.videos)} of ${fmtInt(n)} videos`} className="order-last col-span-2 max-lg:h-2 lg:order-none lg:col-span-1" />
              <LevelText k={c.videos} n={n} unit="videos" className="text-right text-[12.5px] text-secondary-foreground" />
            </div>
          ))}
        </div>
      )}
      {/* Why a subject being re-described shows no figure, ONCE on the page
          (14 Oct, the lead's ruling): each card only names it among those
          not measured yet. */}
      <FailedSubjectsFoot failed={failed} />
    </section>
  )
}

/** One group (the board's `.pcard`). */
export function GroupCard({ card, n, monthWords, style }: { card: VoicesGroupCard; n: number | null; monthWords: string; style?: CSSProperties }) {
  // No ready subject on their videos, and some not measured yet (open or
  // being re-described): the box cannot say "no subject", only that they are
  // not measured, by name (ruling U6; 14 Oct).
  const notMeasured = card.videos > 0 && card.subjects.length === 0 && ((card.subjectsPending ?? 0) > 0 || (card.subjectsNotMeasured?.length ?? 0) > 0)
  return (
    <article
      data-group={card.key}
      style={style}
      className={cn(CARD, 'gap-3.5 rounded-[14px] px-[22px] py-5', card.selected ? SELECTED_CARD_RING : null)}
    >
      <div>
        <h3 className="m-0 text-[16.5px] font-semibold leading-[1.3] text-foreground"><span data-copy="subject" data-slot="pass_e_persona">{card.name}</span></h3>
        {card.oneLiner ? <p className="m-0 mt-[3px] text-[13.5px] leading-[1.45] text-muted-foreground"><span data-copy="subject" data-slot="pass_e_persona">{card.oneLiner}</span></p> : null}
      </div>
      {n ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span data-copy="level" className="flex items-baseline gap-2">
            <span className="font-mono text-[28px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground">{fmtInt(card.videos)}</span>
            <span className="font-mono text-[12.5px] text-muted-foreground">of {fmtInt(n)} videos</span>
          </span>
          {/* The board's verdict slot ("no clear change"): decision 2 reads no
              change for a group yet, and the slot says so. */}
          <span className="ml-auto whitespace-nowrap text-[12.5px] font-medium text-muted-foreground">{GROUP_NOT_COMPARED}</span>
        </div>
      ) : (
        <p className="m-0 text-[13.5px] text-muted-foreground">No video of the market’s in {monthWords} carries their comments.</p>
      )}
      {/* RULING U6: the ready subjects alone carry a count (the reader's
          `measuredSubjects`); the rest are said once, never counted. With
          none ready the box keeps its frame and its height: one quiet line
          and its rows' empty tracks. */}
      <div className="flex flex-col gap-2 rounded-[10px] bg-inner px-3.5 py-3">
        <p className={cn(CAPS, 'mb-0.5')}>What they talk about{card.videos > 0 && !notMeasured ? <> · of their <Fig>{fmtInt(card.videos)}</Fig></> : null}</p>
        {card.subjects.length > 0 ? (
          <>
            {card.subjects.map((s) => <MiniRow key={s.id} label={s.label} k={s.k} of={card.videos} />)}
            <PendingSubjectsLine subjects={card.subjectsNotMeasured} count={card.subjectsPending ?? 0} />
          </>
        ) : notMeasured ? (
          <NotMeasuredRows subjects={card.subjectsNotMeasured} />
        ) : <p className="m-0 text-[12.5px] leading-[1.4] text-muted-foreground">{card.videos > 0 ? 'No subject read in their videos yet.' : `None of their comments in ${monthWords}.`}</p>}
      </div>
      {card.wants || card.stops ? (
        <div className="flex flex-col gap-1.5 text-[13.5px] leading-[1.45] text-foreground">
          {/* Three lines each, so a card keeps the board's height when Pass E
              writes a paragraph (the lead's ruling, 13 Oct); the panel prints
              both in full. */}
          {card.wants ? <div className="line-clamp-3"><b className="font-semibold">Wants:</b> <span data-copy="subject" data-slot="pass_e_persona">{card.wants}</span></div> : null}
          {card.stops ? <div className="line-clamp-3"><b className="font-semibold">Stops them:</b> <span data-copy="subject" data-slot="pass_e_persona">{card.stops}</span></div> : null}
        </div>
      ) : null}
      <div>
        <p className={cn(CAPS, 'mb-1.5')}>Where</p>
        {card.platforms.length > 0
          ? <PlatformStrip platforms={card.platforms} label={`Where ${card.name} comment`} />
          : <span aria-hidden className="block h-1.5 rounded-full bg-track" />}
      </div>
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

/** A panel column's one quiet line, where it has nothing to list. */
function Quiet({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">{children}</p>
}

/** A month's short name on the chart's axis: "Sep". */
const shortMonth = (month: string): string => longMonth(month).slice(0, 3)

/**
 * The board's sixth card ("How the mix changed" on E3-Voices): each group's
 * videos on the kit's slope chart. Decision 2 reads no group's month before
 * this one (each update describes the groups afresh), so the card is named
 * for what it shows, "The mix in September" (the fresh check, 13 Oct: the
 * board's words claimed a comparison), the chart draws this month's column
 * and leaves last month's axis empty and dashed, and the subtitle and one
 * line say why. Nothing is drawn between the two: a line needs both ends.
 */
export function MixCard({ cards, n, month, monthWords, style }: { cards: readonly VoicesGroupCard[]; n: number | null; month: string; monthWords: string; style?: CSSProperties }) {
  const before = prevMonth(month)
  return (
    <article data-mix="" aria-labelledby="voices-mix" style={style} className={cn(CARD, 'gap-3.5 rounded-[14px] px-[22px] py-5')}>
      <div>
        <h3 id="voices-mix" className="m-0 text-[16.5px] font-semibold leading-[1.3] text-foreground">{mixTitle(monthWords)}</h3>
        <p className="m-0 mt-[3px] text-[13.5px] leading-[1.45] text-muted-foreground">{mixNotRead(longMonth(before))}</p>
      </div>
      <SlopePair
        fromLabel={shortMonth(before)}
        toLabel={shortMonth(month)}
        rows={cards.map((c) => ({ key: c.key, label: slopeLabel(c.name), fullLabel: c.name, slot: 'pass_e_persona' as const, from: null, to: c.videos }))}
        format={fmtInt}
        label={`Each group’s videos of the market’s${n ? ` ${fmtInt(n)}` : ''}`}
        // Last month's axis is the chart's empty slot: drawn dashed, as a
        // column with no reading in it (the first <line> is that axis).
        className="mx-auto max-w-[340px] [&>line:first-of-type]:[stroke-dasharray:3_4]"
      />
      <p className="m-0 text-[13.5px] leading-[1.5] text-secondary-foreground">{MIX_WHY}</p>
    </article>
  )
}

/** E3-Voices-Open's "Products they mention", as the count is: your products
 *  named in the group's videos this month, each opening in Your products,
 *  and the videos about one of yours where we could not tell which. Where no
 *  catalogue is read the column keeps its place and says so in one line. */
export function ProductsColumn({ products, videos }: { products: GroupProducts; videos: number }) {
  const listed = products.rows.length > 0 || products.unclear > 0
  return (
    <PanelSection label={<>Products in their videos{listed && videos > 0 ? <> · of their <Fig>{fmtInt(videos)}</Fig></> : null}</>}>
      {listed ? (
        <>
          <div className="flex flex-col gap-0.5">
            {products.rows.map((p) => (
              <Link key={p.id} href={p.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[14px] text-foreground no-underline hover:bg-inner">
                <span className="min-w-0">{p.name}</span>
                <LevelText k={p.k} n={videos} className="ml-auto shrink-0 whitespace-nowrap text-[13px] text-secondary-foreground" />
              </Link>
            ))}
            {products.unclear > 0 ? (
              <div className="-mx-2 flex items-center justify-between gap-3 px-2 py-1.5 text-[14px] text-foreground">
                <span className="min-w-0">Couldn’t tell which product</span>
                <LevelText k={products.unclear} n={videos} className="ml-auto shrink-0 whitespace-nowrap text-[13px] text-secondary-foreground" />
              </div>
            ) : null}
          </div>
          {products.rows.length > 0 ? <span className="text-[12px] text-muted-foreground">Each opens in Your products</span> : null}
        </>
      ) : (
        <Quiet>{products.line}</Quiet>
      )}
    </PanelSection>
  )
}

/** The group's panel, in place under its row (E3-Voices-Open). `notchAt`
 *  is the grid's placement, per breakpoint (`GroupGrid`); alone, the
 *  loader's three-across notch. */
export function GroupPanelView({ panel, monthWords, notchAt }: { panel: GroupPanel; monthWords: string; notchAt?: number | PerBreakpoint }) {
  const [first, second] = panel.subjects
  const where = panel.platforms[0]
  return (
    <InPlacePanel
      id={PANEL_ID.group}
      notchAt={notchAt ?? panel.notchAt}
      openKey={panel.key}
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
        {/* Ruling U6: no ready subject, no "are about" figure; the two
            cells' place says why, once, so the row keeps its four. */}
        {!first && panel.videos > 0 && ((panel.subjectsPending ?? 0) > 0 || (panel.subjectsNotMeasured?.length ?? 0) > 0) ? (
          <div className="min-w-0 rounded-[10px] bg-inner px-4 pt-4 pb-3.5 xl:col-span-2">
            <div className="text-[15px] font-medium leading-[30px] text-muted-foreground">{SUBJECT_NOT_MEASURED}</div>
            <div className="mt-2 text-[12.5px] leading-[1.4] text-muted-foreground">what their videos are about</div>
          </div>
        ) : null}
        {where && panel.videos > 0 ? <StatCell value={where.k} of={panel.videos} label={<>are on {where.label}</>} /> : null}
      </StatRow>

      {/* THE PANEL'S TWO GRIDS NEVER REFLOW (the fresh check, 13 Oct): a
          column with nothing to list keeps its place and says so in one
          quiet line, so the next one never slides into its slot. */}
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
        <PanelSection label="What they want">{panel.wants ? <p className="m-0 text-[15px] leading-[1.6] text-foreground"><span data-copy="subject" data-slot="pass_e_persona">{panel.wants}</span></p> : <Quiet>{GROUP_NOT_DESCRIBED}</Quiet>}</PanelSection>
        <PanelSection label="What stops them">{panel.stops ? <p className="m-0 text-[15px] leading-[1.6] text-foreground"><span data-copy="subject" data-slot="pass_e_persona">{panel.stops}</span></p> : <Quiet>{GROUP_NOT_DESCRIBED}</Quiet>}</PanelSection>
        <PanelSection label="What tips them into acting">{panel.triggers ? <p className="m-0 text-[15px] leading-[1.6] text-foreground"><span data-copy="subject" data-slot="pass_e_persona">{panel.triggers}</span></p> : <Quiet>{GROUP_NOT_DESCRIBED}</Quiet>}</PanelSection>
      </div>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
        <PanelSection label="Who they say they are">
          {panel.who.length > 0 ? (
            <>
              {/* The top three, near-repeats already merged (decision 8, `mergeWho`). */}
              {panel.who.slice(0, WHO_SHOWN).map((w) => (
                <div key={w.label} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_30px] items-center gap-2.5 text-[13.5px]">
                  <span className="min-w-0"><span data-copy="stored" data-slot="pass_a_audience_insight">{w.label}</span></span>
                  <TickBar pct={(100 * w.count) / Math.max(1, ...panel.who.slice(0, WHO_SHOWN).map((x) => x.count))} size="md" label={`${w.label}: ${w.count}`} />
                  <Fig className="text-right text-[12.5px]">{fmtInt(w.count)}</Fig>
                </div>
              ))}
              <span className="text-[12px] text-muted-foreground">How often each came up in what they said</span>
            </>
          ) : <Quiet>{GROUP_NO_WHO}</Quiet>}
        </PanelSection>
        <PanelSection label="The conversations they’re in">
          {panel.conversations.length > 0 ? (
            <>
              <div className="flex flex-col gap-0.5">
                {panel.conversations.map((c) => (
                  <Link key={c.registryId} href={c.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[14px] text-foreground no-underline hover:bg-inner">
                    <span className="min-w-0"><span data-copy="subject" data-slot="pass_b_theme">{c.label}</span></span>
                    <LevelText k={c.k} n={panel.videos} className="ml-auto shrink-0 whitespace-nowrap text-[13px] text-secondary-foreground" />
                  </Link>
                ))}
              </div>
              <span className="text-[12px] text-muted-foreground">Each opens in Market</span>
            </>
          ) : <Quiet>{groupNoConversations(monthWords)}</Quiet>}
        </PanelSection>
        {panel.products ? <ProductsColumn products={panel.products} videos={panel.videos} /> : (
          // A panel read before the products column (a stored dump) keeps
          // where the group comments in its place.
          <PanelSection label={<>Where they comment{panel.videos > 0 ? <> · of <Fig>{fmtInt(panel.videos)}</Fig></> : null}</>}>
            {panel.platforms.length > 0 && panel.videos > 0
              ? panel.platforms.map((p) => <MiniRow key={p.platform} size="md" tone="ink" label={p.label} k={p.k} of={panel.videos} />)
              : <Quiet>None of their comments in {monthWords}.</Quiet>}
          </PanelSection>
        )}
      </div>

      {panel.phrases.length > 0 ? (
        <PanelSection label="How they talk">
          <div>{panel.phrases.map((p) => <Phrase key={p.text} text={p.text} english={p.english} />)}</div>
        </PanelSection>
      ) : null}

      {panel.quotes.length > 0 ? (
        <PanelSection label={<>In their words · <Fig>{fmtInt(panel.quotes.length)}</Fig> of their comments in {monthWords}</>}>
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
            {panel.quotes.map((q) => <QuoteCard key={q.ref} quote={q} />)}
          </div>
        </PanelSection>
      ) : null}

      <AskButton href={panel.askHref}>Ask the Agent about this group</AskButton>
    </InPlacePanel>
  )
}

/** The group grid's columns: one on a phone, two from 768, three from 1280.
 *  `count` is every item in the grid: the group cards and the mix card. */
export function groupLayout(count: number): PanelLayout {
  return { base: equalColumns(1, count), md: equalColumns(2, count), xl: equalColumns(3, count) }
}

/** The cards three to a row (two from 768, one on a phone), and the open
 *  group's panel under the row its card is in at every width: one grid, the
 *  panel a child of it placed after the card's row (`panelPlacement`), and in
 *  the markup right after the card that opened it. */
export function GroupGrid({ data }: { data: Pick<VoicesData, 'groups' | 'videos' | 'panel' | 'monthWords' | 'month'> }) {
  const cards = data.groups.cards
  const panel = data.panel?.kind === 'group' ? data.panel : null
  const at = panel ? cards.findIndex((c) => c.key === panel.key) : -1
  // The mix card is the grid's last item (the board's sixth place), so a
  // panel opened from its row lands after it.
  const place = at >= 0 ? panelPlacement(at, groupLayout(cards.length + 1)) : null
  return (
    <>
      <section aria-label="The groups" className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c, i) => (
          <Fragment key={c.key}>
            <GroupCard card={c} n={data.videos} monthWords={data.monthWords} style={panelItemOrder(i)} />
            {panel && place && i === at ? (
              <PanelSlot placement={place}><GroupPanelView panel={panel} monthWords={data.monthWords} notchAt={place.notch} /></PanelSlot>
            ) : null}
          </Fragment>
        ))}
        <MixCard cards={cards} n={data.videos} month={data.month} monthWords={data.monthWords} style={panelItemOrder(cards.length)} />
      </section>
      {/* A group no card names (an old link) still opens, under the grid. */}
      {panel && at < 0 ? <GroupPanelView panel={panel} monthWords={data.monthWords} /> : null}
    </>
  )
}
