import Link from 'next/link'
import { ChartColumn } from 'lucide-react'
import { BrandChip } from '@/components/colour-roles'
import { MovementBadge } from '@/components/delta-badge'
import { CARD, CardHead, InPlacePanel, PanelSection, PanelTitle, StatCell, StatRow, TickBar } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { windowWords } from '@/lib/pages/brands'
import { PANEL_ID, type BrandPanel, type VoicesBrandRow, type VoicesBrands } from '@/lib/pages/v2/voices'
import type { Verdict } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'
import { AskButton, CAPS, EmptyLine, Fig, LevelText, MiniRow, PanelTag, QuoteCard } from './parts'

// THE BRANDS (board E3-Voices, "Brands in your market"; its panel is the
// Competitive brand pane re-laid out to the board's panel).
//
// TWO BASES, EACH SAID. "Named in" is named unprompted (`k_organic` of
// `n_organic`), this month and last, with its `Verdict` beside it (the board's
// "no clear change" and "▲ from 28"). "Praised · complained" and "Talked about
// for" read every video naming the brand this month (`k_any`): a brand's
// unprompted month is a handful of videos, too few to say how it is treated.
// Those cells carry no verdict, and the card says so where the board would
// read a change into them.

const DOT = { you: 'bg-you', rival: 'bg-comp' } as const

/** The verdict beside a level: its own node, the only place a movement word
 *  may stand. Nothing where the comparison was refused or not drawn. */
export function VerdictNote({ verdict, you }: { verdict: Verdict | null; you: boolean }) {
  if (!verdict || verdict.state === 'refused') return null
  return (
    <span data-copy="verdict" className="whitespace-nowrap">
      <MovementBadge verdict={verdict} unit="pts" good={you ? 'up' : 'neutral'} bandTip />
    </span>
  )
}

function BrandName({ row }: { row: VoicesBrandRow }) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-[15px] font-semibold leading-[1.3]">
      <span aria-hidden className={cn('mt-[6px] size-[9px] shrink-0 rounded-full', row.you ? DOT.you : DOT.rival)} />
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Link
        href={row.href}
        scroll={false}
        aria-expanded={row.selected}
        aria-controls={row.selected ? PANEL_ID.brand : undefined}
        className="min-w-0 text-foreground no-underline hover:underline hover:underline-offset-[3px]"
      >
        {row.label}
      </Link>
      {row.you ? <BrandChip who="you" className="text-[12px]">You</BrandChip> : null}
      </span>
    </div>
  )
}

function Treat({ row }: { row: VoicesBrandRow }) {
  if (!row.praised || !row.complained) return <span className="text-[12.5px] text-muted-foreground">not read</span>
  const n = row.praised.n
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5" role="img" aria-label={`Praised in ${row.praised.k} and complained in ${row.complained.k} of its ${n} videos`}>
        {row.praised.k > 0 ? <span className={cn('h-2.5 rounded-[3px]', row.you ? 'bg-you' : 'bg-comp')} style={{ width: `${Math.max(2, (100 * row.praised.k) / n) * 0.6}%` }} /> : null}
        {row.complained.k > 0 ? <span className="h-2.5 rounded-[3px] bg-negative/85" style={{ width: `${Math.max(2, (100 * row.complained.k) / n) * 0.6}%` }} /> : null}
      </div>
      <span data-copy="level" className="font-mono text-[12px] tabular-nums text-muted-foreground">
        {fmtInt(row.praised.k)} · {fmtInt(row.complained.k)} of {fmtInt(n)}
      </span>
    </div>
  )
}

function BrandRow({ row, max }: { row: VoicesBrandRow; max: number }) {
  const named = row.named
  return (
    <div
      data-brand={row.brandKey}
      aria-current={row.selected ? 'true' : undefined}
      className={cn(
        'grid grid-cols-2 items-center gap-x-[18px] gap-y-3 border-t border-track py-4 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.6fr)]',
        row.selected ? '-mx-3 rounded-[10px] bg-accent/45 px-3' : null,
      )}
    >
      <BrandName row={row} />
      <div className="flex min-w-0 flex-col gap-1">
        {named ? (
          <>
            <TickBar pct={max > 0 ? (100 * named.k) / max : 0} tone={row.you ? 'you' : 'rival'} size="lg" label={`${row.label}: named unprompted in ${named.k} of ${named.n} videos`} />
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-[12.5px] text-muted-foreground">
              <LevelText k={named.k} n={named.n} unit="videos" />
              <VerdictNote verdict={row.verdict} you={row.you} />
            </div>
          </>
        ) : null}
      </div>
      <Treat row={row} />
      <div className="min-w-0 text-[13px] leading-[1.4]">
        {row.topSubject ? (
          <>
            {row.topSubject.label} <span className="whitespace-nowrap text-muted-foreground">· <LevelText k={row.topSubject.k} n={row.topSubject.n} /></span>
          </>
        ) : <span className="text-muted-foreground">no subject yet</span>}
      </div>
    </div>
  )
}

/** Brand names, each a link to its panel: "Proteor, Old School". */
function NameLinks({ names }: { names: readonly { label: string; href: string }[] }) {
  return (
    <>
      {names.map((b, i) => (
        <span key={b.label}>
          {i > 0 ? ', ' : null}
          <Link href={b.href} scroll={false} className="text-inherit underline decoration-foreground/25 underline-offset-[3px] hover:decoration-foreground">{b.label}</Link>
        </span>
      ))}
    </>
  )
}

/** The note: Pass C's weightiest finding, with its brand's panel a click
 *  away (any tracked brand opens, printed as a row or not). */
function Note({ note }: { note: NonNullable<VoicesBrands['note']> }) {
  return (
    <p className="m-0 rounded-[10px] bg-inner px-3.5 py-3 text-[13.5px] leading-[1.5] text-foreground">
      <b className="font-semibold">{note.rival}:</b>{' '}
      <span data-copy="stored" data-slot="pass_c_finding">{note.title}</span>{' '}
      <Link href={note.href} scroll={false} className="whitespace-nowrap font-semibold text-orange-text no-underline hover:underline">Open {note.rival} →</Link>
    </p>
  )
}

/** "Brands in your market" (the board's left card of the pair). */
export function BrandsCard({ brands, monthWords }: { brands: VoicesBrands; monthWords: string }) {
  const max = Math.max(0, ...brands.rows.map((r) => r.named?.k ?? 0))
  const prev = longMonth(brands.prevMonth)
  const month = longMonth(brands.month)
  // The one base every "Named in" level shares: the market's videos this
  // month that our searches for a brand did not find (`n_organic`).
  const unsearched = brands.rows.find((r) => r.named)?.named?.n ?? null
  return (
    <article aria-labelledby="voices-brands" className={CARD}>
      <CardHead
        icon={ChartColumn}
        id="voices-brands"
        title="Brands in your market"
        sub={`Videos that named each brand without being asked, ${monthWords}, and how people treat it in every video naming it`}
      />
      {brands.state !== 'ready' ? (
        <div className="flex flex-col gap-1.5">
          <EmptyLine>{brands.empty}</EmptyLine>
          {brands.state === 'not_counted' && brands.tracked.length > 0 ? (
            <EmptyLine>The brands this workspace tracks: <NameLinks names={brands.tracked} />.</EmptyLine>
          ) : null}
          {brands.state === 'not_counted' && brands.note ? <Note note={brands.note} /> : null}
        </div>
      ) : (
        <>
          {brands.rows.length > 0 ? (
            <div>
              {/* The board's header: four columns at lg, and below it two rows of
                  two, over the rows' own two-by-two cells. */}
              <div className={cn(CAPS, 'grid grid-cols-2 gap-x-[18px] gap-y-1 border-b border-border pb-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.6fr)]')}>
                <span>Brand</span><span>Named in</span><span>Praised · complained</span><span>Talked about for</span>
              </div>
              {unsearched != null ? (
                <p className="m-0 border-b border-track py-2 text-[12px] leading-[1.45] text-muted-foreground">
                  Named in: of the <Fig>{fmtInt(unsearched)}</Fig> videos in {month} we did not find by searching for a brand, so a brand named in them was named without being asked.
                </p>
              ) : null}
              <div role="list">
                {brands.rows.map((r) => <div key={r.brandKey} role="listitem"><BrandRow row={r} max={max} /></div>)}
              </div>
            </div>
          ) : (
            <EmptyLine>No brand you track was named without being asked in {monthWords}.</EmptyLine>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span><i aria-hidden className="mr-1.5 inline-block h-2 w-2.5 rounded-[2px] bg-comp align-[0.05em]" />videos where people praised</span>
              <span><i aria-hidden className="mr-1.5 inline-block h-2 w-2.5 rounded-[2px] bg-negative/85 align-[0.05em]" />complained</span>
            </span>
            {brands.notNamed.length > 0 ? <span>Not named without being asked in {monthWords}: <NameLinks names={brands.notNamed} /></span> : null}
          </div>
          {brands.rows.length > 0 ? (
            <p className="m-0 text-[12px] leading-[1.5] text-muted-foreground">
              Praised, complained and talked about are {month}’s alone: each brand’s videos are too few to set against {prev}.
            </p>
          ) : null}
          {brands.notCounted.length > 0 ? (
            <p className="m-0 text-[12px] leading-[1.5] text-muted-foreground">
              {brands.notCounted.map((b, i) => (
                <span key={b.label}>
                  {i > 0 ? ' · ' : null}
                  <Link href={b.href} scroll={false} className="text-inherit underline decoration-foreground/25 underline-offset-[3px] hover:decoration-foreground">{b.label}</Link>: {b.words}
                </span>
              ))}
            </p>
          ) : null}
          {brands.note ? <Note note={brands.note} /> : null}
        </>
      )}
    </article>
  )
}

/** The brand's panel: its month in full, and a rival's Competitive pane. */
export function BrandPanelView({ panel, monthWords }: { panel: BrandPanel; monthWords: string }) {
  // The crosses' own base (the lens's n: every video naming it this month),
  // for every k a cross printed, so a share's two sides come from one read.
  const crossN = panel.kinds[0]?.n ?? panel.subjects[0]?.n ?? 0
  const praised = panel.kinds.find((k) => k.kind === 'praise')
  const complained = panel.kinds.find((k) => k.kind === 'pain_point')
  const window = panel.window ? windowWords(panel.window) : null
  return (
    <InPlacePanel
      id={PANEL_ID.brand}
      notchAt={panel.notchAt}
      closeHref={panel.closeHref}
      labelledBy="brand-title"
      closeLabel="Close this brand"
      head={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <PanelTag>Brand</PanelTag>
            {panel.you ? <BrandChip who="you" className="text-[12px]">You</BrandChip> : null}
          </div>
          <PanelTitle id="brand-title">{panel.label}</PanelTitle>
          <p className="m-0 mt-1 text-[14px] leading-[1.4] text-muted-foreground">The videos naming {panel.label} in {monthWords}, and what was said in them</p>
        </>
      }
    >
      {panel.stateWords ? (
        <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">{panel.label} in {monthWords}: {panel.stateWords}.</p>
      ) : null}
      {panel.tooFew ? (
        <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">No video named {panel.label} without being asked in {monthWords}: too few to say how people treat it.</p>
      ) : null}
      {(panel.named && !panel.tooFew) || panel.kinds.length > 0 ? (
      <StatRow>
        {panel.named && !panel.tooFew ? (
          <StatCell value={panel.named.k} of={panel.named.n} label="videos named it without being asked">
            <div className="mt-1.5 text-[12px]"><VerdictNote verdict={panel.verdict} you={panel.you} /></div>
            {panel.prevNamed ? (
              <div className="mt-1 text-[12px] text-muted-foreground">{longMonth(panel.prevNamed.month)}: <LevelText k={panel.prevNamed.k} n={panel.prevNamed.n} /></div>
            ) : null}
          </StatCell>
        ) : null}
        {panel.any && !panel.tooFew ? <StatCell value={panel.any.k} of={panel.any.n} label="videos named it at all" /> : null}
        {praised ? <StatCell value={praised.k} of={praised.n} label="videos naming it, where people praised something" /> : null}
        {complained ? <StatCell value={complained.k} of={complained.n} label="videos naming it, where people complained about something" /> : null}
      </StatRow>
      ) : null}

      <div className="grid grid-cols-1 gap-7 md:grid-cols-3">
        {panel.kinds.length > 0 ? (
          <PanelSection label={<>What people did in the comments · of its <Fig>{fmtInt(crossN)}</Fig></>}>
            {panel.kinds.map((k) => <MiniRow key={k.kind} size="md" tone={panel.you ? 'you' : 'rival'} label={k.label} k={k.k} of={k.n} />)}
          </PanelSection>
        ) : null}
        {panel.subjects.length > 0 ? (
          <PanelSection label={<>What they talk about · of its <Fig>{fmtInt(crossN)}</Fig></>}>
            {panel.subjects.map((s) => <MiniRow key={s.id} size="md" label={s.label} k={s.k} of={s.n} />)}
          </PanelSection>
        ) : null}
        {panel.asked ? (
          <PanelSection label={<>Asked under its content{window ? `, ${window}` : ''}</>}>
            <div className="flex flex-col gap-0.5">
              {panel.asked.themes.map((t) => (
                <Link key={t.registryId} href={t.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[14px] text-foreground no-underline hover:bg-inner">
                  <span className="min-w-0"><span data-copy="subject" data-slot="pass_b_theme">{t.label}</span></span>
                  <span className="shrink-0 whitespace-nowrap text-[13px] text-secondary-foreground"><Fig>{fmtInt(t.videos)}</Fig> {t.videos === 1 ? 'video' : 'videos'}</span>
                </Link>
              ))}
            </div>
          </PanelSection>
        ) : null}
      </div>

      {panel.findings.length > 0 ? (
        <PanelSection label="Where its talk differs from the rest of the market · the latest update">
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {panel.findings.slice(0, 4).map((f) => (
              <div key={f.id} className="flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-inner px-4 py-3.5">
                <span className={CAPS}>{f.kindWords}</span>
                <p className="m-0 text-[15px] font-semibold leading-[1.4] text-foreground"><span data-copy="stored" data-slot="pass_c_finding">{f.title}</span></p>
                {f.body ? <p className="m-0 text-[13.5px] leading-[1.55] text-secondary-foreground"><span data-copy="stored" data-slot="pass_c_finding">{f.body}</span></p> : null}
              </div>
            ))}
          </div>
        </PanelSection>
      ) : null}

      {panel.said.length > 0 ? (
        <PanelSection label={<>Said about {panel.label}{window ? `, ${window}` : ''}</>}>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {panel.said.map((q) => <QuoteCard key={q.ref} quote={q} />)}
          </div>
        </PanelSection>
      ) : null}

      <AskButton href={panel.askHref}>Ask the Agent about {panel.you ? 'your brand' : panel.label}</AskButton>
    </InPlacePanel>
  )
}
