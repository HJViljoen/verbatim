import Link from 'next/link'
import { SquarePlay, Users } from 'lucide-react'
import { MovementBadge, nonAnswerParts, signedChange } from '@/components/delta-badge'
import { BubbleGlyph, LayersGlyph } from '@/components/shell/level-glyphs'
import { CARD, CardHead, MiniBars, TickBar, TickBarRow } from '@/components/v2'
import { fmtCompact, fmtInt, longMonth, shortDate } from '@/lib/format'
import { inlineMonth } from '@/lib/reading/month-label'
import { notMeasuredLine } from '@/lib/pages/not-measured'
import {
  BRAND_FINDINGS_NOTE, BRAND_NO_FINDING, BRAND_YOU_NO_FINDING, brandCreatorsNone, brandCreatorsSub, brandGroupsNone,
  type BrandMonthBar, type BrandPage,
} from '@/lib/pages/v2/voices-levels'
import { cn } from '@/lib/utils'
import { Fig, LevelText, RowChevron } from './parts'
import { VerdictNote } from './brands'
import { AskBox, Caps, FL, FS, FV, FW, GAPLINE, HUB_LEAD, HubBar, HubCard, HubFig, LevelQuoteCard, LevelSection, MiniTile, PAGE_CARD, READ } from './levels'

// A BRAND'S PAGE, A HUB (G3-Voices-Brand, its phone and its switcher boards).
// In the board's order:
//   1. THE HEADER CARD: Pass C's latest finding about it (a rival's) as its
//      lead, then four figures: named without being asked (`k_organic` of
//      `n_organic`, in its colour role), the change against last month (its
//      `Verdict`, the change beside the word), named at all (`k_any`, what the
//      figures below are of), praised and complained (the month's alone);
//   2. HOW THE TALK DIFFERS: the finding's account, and its other findings;
//   3. WHO TALKS ABOUT IT: its parts are Voices' levels (board D3), the groups
//      commenting on its videos and the creators it comes up with, each
//      opening its page (D2: a hub draws no videos);
//   4. THE NUMBERS: named without being asked month by month (three bars and
//      the verdict line), what people did in the comments, what its talk sits
//      in (READY subjects only, U6), where it was named, where;
//   5. UNDER ITS OWN CONTENT (a rival's alone): the ninety days to the month's
//      last update under their own heading and window chip (D4), what is asked
//      under its posts, what it says in them, and three comments about it,
//      each from its conversation;
//   6. THE AGENT.
// A brand not counted keeps every frame and says why once.

const sentence = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`

/** The month bars' drawing: the share over each bar, "k of n" under it, a
 *  month still filling outlined (MASTER), in the brand's colour role. */
function monthBars(bars: readonly BrandMonthBar[]) {
  return bars.map((b) => {
    const pct = b.n ? (100 * (b.k ?? 0)) / b.n : 0
    return {
      label: b.label,
      value: pct,
      display: b.k != null && b.n ? `${Math.round(pct)}%` : '',
      sub: b.k != null && b.n != null ? `${b.filling ? 'so far · ' : ''}${fmtInt(b.k)} of ${fmtInt(b.n)}` : undefined,
      filling: b.filling,
    }
  })
}

function Header({ page }: { page: BrandPage }) {
  const counted = page.state === 'counted'
  const tone = page.you ? 'you' : 'rival'
  const v = page.verdict
  const nonAnswer = nonAnswerParts(v, 'pts')
  const prev = page.prevNamed
  const eyebrow = page.lead
    ? <>Where its talk differs{page.findingsDate ? <> · the {shortDate(page.findingsDate)} update</> : null}</>
    : <>{page.you ? 'Your brand' : 'A brand you track'} · {inlineMonth(page.month.monthWords, page.month.monthLabel)}</>
  return (
    <HubCard
      id="brand-hub"
      label={page.label}
      eyebrow={eyebrow}
      lead={page.lead ? <h2 className={HUB_LEAD}><span data-copy="stored" data-slot="pass_c_finding">{page.lead.title}</span></h2> : null}
    >
      {!counted ? (
        <div data-fig="" className="col-span-full flex flex-col gap-1.5 px-[34px] pt-5 pb-[22px] max-sm:px-[18px] max-sm:pt-[15px] max-sm:pb-4">
          <p data-brand-state={page.state} className={cn(GAPLINE, 'max-sm:text-[14.5px]')}>{page.label} in {page.month.monthWords}: {page.stateWords ?? 'not counted yet'}.</p>
        </div>
      ) : (
        <>
          <HubFig>
            {page.named ? (
              <>
                <div data-copy="figure" className={FV}>{fmtInt(page.named.k)}</div>
                <HubBar pct={page.named.n > 0 ? (100 * page.named.k) / page.named.n : 0} tone={tone} />
                <div className={FL}><span data-copy="level">of {fmtInt(page.named.n)} videos</span> named it without being asked</div>
                <div className={FS}>the videos we did not find by searching for a brand</div>
              </>
            ) : <p className={cn(FL, 'm-0 text-muted-foreground')}>Not read for {page.month.monthWords}.</p>}
          </HubFig>
          <HubFig>
            {v && v.state !== 'refused' ? (
              <>
                {nonAnswer
                  ? <div data-copy="verdict" title={nonAnswer.title} className={FW}>{sentence(nonAnswer.word)}</div>
                  : <div data-copy="verdict" className={cn(FW, '[&>span]:text-[length:inherit] [&>span]:leading-[inherit] [&>span]:font-[inherit]')}><MovementBadge verdict={v} unit="pts" good={page.you ? 'up' : 'neutral'} bandTip /></div>}
                <div className={FL}>
                  {nonAnswer?.change != null ? <><span data-copy="verdict" className="whitespace-nowrap">{signedChange(nonAnswer.change, 'pts')}</span> </> : null}
                  against {longMonth(prev?.month ?? page.month.month)}
                </div>
                {prev ? <div className={FS}><LevelText k={prev.k} n={prev.n} /> in {longMonth(prev.month)}</div> : null}
              </>
            ) : <p data-fig-gap="" className={cn(FL, 'm-0 text-muted-foreground')}>No comparison with last month yet.</p>}
          </HubFig>
          <HubFig>
            {page.any ? (
              <>
                <div data-copy="figure" className={FV}>{fmtInt(page.any.k)}</div>
                {/* `k_any` of its own `n`, the row's (the root's panel's
                    rule): never a k of one read over another's n. */}
                <div className={FL}><span data-copy="level">of {fmtInt(page.any.n)} videos</span> named it at all</div>
                <div className={FS}>what the figures below are of</div>
              </>
            ) : <p className={cn(FL, 'm-0 text-muted-foreground')}>Not read for {page.month.monthWords}.</p>}
          </HubFig>
          <HubFig>
            {page.praised && page.complained ? (
              <>
                <div className={FV}><Fig>{fmtInt(page.praised.k)}</Fig> · <Fig>{fmtInt(page.complained.k)}</Fig></div>
                <div className={FL}>of its <Fig>{fmtInt(page.praised.n)}</Fig>: praised · complained</div>
                <div className={FS}>{longMonth(page.month.month)}’s alone, too few to set against {longMonth(prev?.month ?? page.month.month)}</div>
              </>
            ) : <p className={cn(FL, 'm-0 text-muted-foreground')}>How people treat it is not read yet.</p>}
          </HubFig>
        </>
      )}
    </HubCard>
  )
}

function ReadCard({ page }: { page: BrandPage }) {
  if (!page.lead) {
    return (
      <article aria-label={`Where ${page.label}'s talk differs`} data-brand-read="none" className={PAGE_CARD}>
        <div className="flex flex-col gap-3">
          <Caps>How the talk differs</Caps>
          <p className={GAPLINE}>{page.you ? BRAND_YOU_NO_FINDING : BRAND_NO_FINDING}</p>
        </div>
      </article>
    )
  }
  return (
    <article aria-label={`Where ${page.label}'s talk differs from the rest of the market`} className={PAGE_CARD}>
      <div className="grid grid-cols-1 gap-11 max-sm:gap-0 min-[1180px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <Caps>How the talk differs</Caps>
          {page.lead.body ? <p className={READ}><span data-copy="stored" data-slot="pass_c_finding">{page.lead.body}</span></p> : null}
          <p className="m-0 text-[12.5px] text-muted-foreground">{BRAND_FINDINGS_NOTE}</p>
        </div>
        {page.findings.length > 0 ? (
          <div className="flex min-w-0 flex-col max-[1179px]:mt-6 max-[1179px]:border-t max-[1179px]:border-track max-[1179px]:pt-6 max-sm:mt-[18px] max-sm:pt-[18px]">
            {page.findings.map((f) => (
              <div key={f.id} className="flex flex-col gap-[5px] border-t border-track py-3.5 first:border-t-0 first:pt-0.5">
                <Caps>{f.kindWords}</Caps>
                <p className="m-0 text-[15.5px] leading-[1.4] font-semibold text-foreground"><span data-copy="stored" data-slot="pass_c_finding">{f.title}</span></p>
                {f.body ? <p className="m-0 text-[14px] leading-[1.55] text-secondary-foreground"><span data-copy="stored" data-slot="pass_c_finding">{f.body}</span></p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}

/** "Who talks about it": the groups commenting on its videos, the creators it
 *  comes up with, each a row that opens its page (the chevron at its end). */
function WhoTalks({ page }: { page: BrandPage }) {
  const counted = page.state === 'counted'
  const n = page.any?.k ?? 0
  const notCounted = <p className={GAPLINE}>{page.label} is not counted yet.</p>
  return (
    <section aria-label={`Who talks about ${page.label}`} className="grid grid-cols-1 items-start gap-5 max-sm:gap-3.5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <article aria-labelledby="brand-groups" className={CARD}>
        <CardHead icon={Users} id="brand-groups" title="The groups commenting on its videos" sub="A video can hold more than one group, so the counts overlap" />
        {!counted ? notCounted : page.groups.length === 0 ? <p className={GAPLINE}>{page.groupsLine ?? brandGroupsNone(page.month)}</p> : (
          <div role="list">
            {page.groups.map((g) => (
              <div key={g.key} role="listitem" className="grid grid-cols-[22px_minmax(0,1fr)_64px_16px] items-center gap-x-3 gap-y-1.5 border-t border-track py-3 first:border-t-0 first:pt-0.5 lg:grid-cols-[22px_minmax(0,1.25fr)_minmax(0,1fr)_64px_16px]">
                <MiniTile kind="group" size="sm" />
                <div className="min-w-0">
                  <Link href={g.href} className="block text-[14.5px] leading-[1.3] font-semibold text-foreground no-underline hover:underline hover:underline-offset-[3px]"><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></Link>
                  {g.oneLiner ? <span className="mt-0.5 block text-[12.5px] leading-[1.4] text-muted-foreground max-sm:hidden"><span data-copy="subject" data-slot="pass_e_persona">{g.oneLiner}</span></span> : null}
                </div>
                <TickBar pct={n > 0 ? (100 * g.k) / n : 0} size="md" tone="market" label={`${g.name}: ${fmtInt(g.k)} of ${fmtInt(n)}`} className="max-lg:order-last max-lg:col-span-2 max-lg:col-start-2" />
                <LevelText k={g.k} n={n} className="text-right text-[12.5px] whitespace-nowrap" />
                <RowChevron href={g.href} />
              </div>
            ))}
          </div>
        )}
      </article>
      <article aria-labelledby="brand-creators" className={CARD}>
        <CardHead icon={SquarePlay} id="brand-creators" title="Creators it comes up with" sub={brandCreatorsSub(page.month)} />
        {!counted ? notCounted : page.creators.length === 0 ? <p className={GAPLINE}>{brandCreatorsNone(page.month)}</p> : (
          <div role="list">
            {page.creators.map((c) => (
              <div key={c.key} role="listitem" className="grid grid-cols-[36px_minmax(0,1fr)_auto_16px] items-center gap-3 border-t border-track py-3 first:border-t-0 first:pt-0.5">
                <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-track text-[12px] font-semibold text-secondary-foreground">{c.initials}</span>
                <div className="min-w-0">
                  <Link href={c.href} className="block truncate text-[14.5px] font-semibold text-foreground no-underline hover:underline hover:underline-offset-[3px]">{c.account}</Link>
                  <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-muted-foreground">{c.platformLabel}{c.followers != null ? <> · <Fig>{fmtCompact(c.followers)}</Fig> {c.followerWord}</> : null}</span>
                </div>
                <span className="whitespace-nowrap text-right text-[12.5px] text-muted-foreground"><b data-copy="figure" className="font-mono text-[15px] font-medium tabular-nums text-foreground">{fmtInt(c.k)}</b> of its <Fig>{fmtInt(n)}</Fig></span>
                <RowChevron href={c.href} />
              </div>
            ))}
          </div>
        )}
        {page.communitiesLeftOut ? <p className="m-0 text-[12px] leading-[1.5] text-muted-foreground">Reddit is left out: there a post’s account is the community it was posted in, not who made it.</p> : null}
      </article>
    </section>
  )
}

/** The verdict in a sentence under the month bars: the badge's word (or the
 *  movement), against last month; where the month is inside last month's
 *  swing, said so, never a direction word outside the verdict. */
function VerdictLine({ page }: { page: BrandPage }) {
  const v = page.verdict
  if (!v || v.state === 'refused') return null
  const prev = longMonth(page.prevNamed?.month ?? page.month.month)
  const nonAnswer = nonAnswerParts(v, 'pts')
  return (
    <p data-verdict-line="" className="m-0 text-[13px] text-secondary-foreground">
      {nonAnswer
        ? <><b data-copy="verdict" className="font-semibold text-foreground">{sentence(nonAnswer.word)}</b> against {prev}{v.state === 'no_clear_change' ? <>: {page.month.monthWords} is inside {prev}’s normal swing.</> : '.'}</>
        : <><VerdictNote verdict={v} you={page.you} /> against {prev}.</>}
    </p>
  )
}

function Numbers({ page }: { page: BrandPage }) {
  const counted = page.state === 'counted'
  const n = page.any?.k ?? 0
  if (!counted) {
    return (
      <section aria-label={`${page.label} in numbers`} data-numbers-gap={page.state} className={PAGE_CARD}>
        <p className={GAPLINE}>No figure prints for {page.label} until it is counted.</p>
      </section>
    )
  }
  const bars = monthBars(page.months)
  const prev = longMonth(page.prevNamed?.month ?? page.month.month)
  const tone = page.you ? 'you' : 'rival'
  return (
    <section aria-label={`${page.label} in numbers`} className={PAGE_CARD}>
      <div className="grid grid-cols-1 gap-11 max-sm:gap-0 min-[1180px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Caps>Named without being asked · month by month</Caps>
          {bars.some((b) => b.sub) ? (
            <>
              <MiniBars bars={bars} size="lg" highlight={null} tone={tone} className="max-w-[520px] max-sm:hidden" label={`${page.label}, named without being asked, month by month`} />
              <MiniBars bars={bars} size="md" highlight={null} tone={tone} className="sm:hidden" label={`${page.label}, named without being asked, month by month`} />
            </>
          ) : <p className="m-0 text-[13.5px] text-muted-foreground">No month of it is read yet.</p>}
          <VerdictLine page={page} />
        </div>
        <div className="flex min-w-0 flex-col gap-2 max-[1179px]:mt-6 max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
          {/* Each cross's head names the cross's own base, the videos the
              lens read (the root's panel's `crossN`), as its rows do. */}
          <Caps>What people did in the comments{page.kinds.length > 0 ? <> · of its <Fig>{fmtInt(page.kinds[0].n)}</Fig></> : null}</Caps>
          {page.kinds.length > 0
            ? page.kinds.map((k) => <TickBarRow key={k.kind} name={k.label} value={fmtInt(k.k)} pct={k.n > 0 ? (100 * k.k) / k.n : 0} tone={tone} valueWidth="narrow" label={`${fmtInt(k.k)} of ${fmtInt(k.n)}`} />)
            : <p className="m-0 text-[13.5px] text-muted-foreground">Not read yet.</p>}
          <p className="m-0 text-[12.5px] text-muted-foreground">{longMonth(page.month.month)}’s alone: its videos are too few to set against {prev}.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-10 gap-y-[26px] border-t border-track pt-6 max-sm:gap-y-0 max-sm:pt-[18px] min-[1180px]:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Caps className="mb-1">What its talk sits in{page.subjects.length > 0 ? <> · of its <Fig>{fmtInt(page.subjects[0].n)}</Fig></> : null}</Caps>
          {page.subjects.map((s) => (
            <Link key={s.id} href={s.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[14px] text-foreground no-underline hover:bg-inner">
              <span className="inline-flex min-w-0 items-center gap-2"><LayersGlyph className="size-3.5 shrink-0 text-muted-foreground" />{s.label}</span>
              <LevelText k={s.k} n={s.n} className="shrink-0 text-[13px] text-secondary-foreground" />
            </Link>
          ))}
          {page.subjects.length === 0 && page.notMeasured.length === 0 ? <p className="m-0 text-[13.5px] text-muted-foreground">No subject read in its videos yet.</p> : null}
          <p className="m-0 text-[12px] leading-[1.45] text-muted-foreground">
            {notMeasuredLine(page.notMeasured)}{page.notMeasured.length > 0 && page.subjects.length > 0 ? ' · ' : null}{page.subjects.length > 0 ? 'each opens in Market' : null}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
          <Caps>Where it was named{page.where ? <> · of its <Fig>{fmtInt(page.where.n)}</Fig></> : null}</Caps>
          {page.where ? (
            <>
              <TickBarRow name="In the comments" value={fmtInt(page.where.comment)} pct={(100 * page.where.comment) / page.where.n} tone="ink" valueWidth="narrow" label={`${fmtInt(page.where.comment)} of ${fmtInt(page.where.n)}`} />
              <TickBarRow name="In the video: caption, speech or on screen" value={fmtInt(page.where.content)} pct={(100 * page.where.content) / page.where.n} tone="ink" valueWidth="narrow" label={`${fmtInt(page.where.content)} of ${fmtInt(page.where.n)}`} />
              <p className="m-0 text-[12px] text-muted-foreground">A video can name it in both</p>
            </>
          ) : <p className="m-0 text-[13.5px] text-muted-foreground">Not read for {page.month.monthWords}.</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-2 max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
          <Caps>Where{n > 0 ? <> · of its <Fig>{fmtInt(n)}</Fig></> : null}</Caps>
          {page.platforms.length > 0
            ? page.platforms.map((p) => <TickBarRow key={p.platform} name={p.label} value={fmtInt(p.k)} pct={n > 0 ? (100 * p.k) / n : 0} tone="ink" valueWidth="narrow" label={`${fmtInt(p.k)} of ${fmtInt(n)}`} />)
            : <p className="m-0 text-[13.5px] text-muted-foreground">No video counted by platform yet.</p>}
        </div>
      </div>
    </section>
  )
}

/** UNDER ITS OWN CONTENT (D4): a rival's ninety days, under their own head
 *  and window chip, so their dates never mix with the month's. */
function OwnContent({ page }: { page: BrandPage }) {
  const w = page.window
  if (!w) return null
  return (
    <>
      <LevelSection
        title="Under its own content"
        note={<span data-window-chip="" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-track px-[9px] py-[5px] text-[12px] leading-none font-semibold text-foreground">{w.words} · <span className="max-sm:hidden">the ninety days to the month’s last update</span><span className="sm:hidden">ninety days</span></span>}
      />
      <section aria-label={`Under ${page.label}'s own content`} className={PAGE_CARD}>
        <div className="grid grid-cols-1 gap-11 max-sm:gap-0 min-[1180px]:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Caps className="mb-1">Asked under its content</Caps>
            {page.asked.length > 0 ? (
              <>
                {page.asked.map((t) => (
                  <Link key={t.id} href={t.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[14px] text-foreground no-underline hover:bg-inner">
                    <span className="inline-flex min-w-0 items-center gap-2"><BubbleGlyph className="size-3.5 shrink-0 text-muted-foreground" /><span data-copy="subject" data-slot="pass_b_theme">{t.label}</span></span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-[13px] text-secondary-foreground"><Fig>{fmtInt(t.videos)}</Fig> {t.videos === 1 ? 'video' : 'videos'}</span>
                  </Link>
                ))}
                <p className="m-0 text-[12px] text-muted-foreground">The questions people ask under {page.label}’s own posts · each opens in Market</p>
              </>
            ) : <p className="m-0 text-[13.5px] text-muted-foreground">No question conversation under its own posts in these ninety days.</p>}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 max-[1179px]:mt-6 max-sm:mt-[18px] max-sm:border-t max-sm:border-track max-sm:pt-[18px]">
            <Caps className="mb-1">What it says in its own videos</Caps>
            {page.claims.length > 0
              ? page.claims.map((c) => <p key={c.id} className="m-0 border-t border-track py-3 text-[14.5px] leading-[1.55] text-foreground first-of-type:border-t-0 first-of-type:pt-0"><span data-copy="stored" data-slot="pass_a_brand_claim">{c.claim}</span></p>)
              : <p className="m-0 text-[13.5px] text-muted-foreground">Nothing it says in its own posts in these ninety days is read yet.</p>}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-track pt-6 max-sm:pt-[18px]">
          <Caps>Said about {page.label}{page.said.length > 0 ? <> · <Fig>{fmtInt(page.said.length)}</Fig> {page.said.length === 1 ? 'comment' : 'comments'}{page.said.every((q) => q.from) ? ', each from its conversation' : null}</> : null}</Caps>
          {page.said.length > 0 ? (
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
              {page.said.map((q) => <LevelQuoteCard key={q.ref} q={q} />)}
            </div>
          ) : <p className="m-0 text-[13.5px] text-muted-foreground">Nothing said about it in these ninety days can be quoted.</p>}
        </div>
      </section>
    </>
  )
}

/** The page's body under its title block, in the board's order. */
export function BrandPageBody({ page }: { page: BrandPage }) {
  const n = page.any?.k
  const counted = page.state === 'counted'
  return (
    <>
      <Header page={page} />
      <ReadCard page={page} />
      <LevelSection title={`Who talks about ${page.label}`} note={counted && n != null ? <>Its <Fig>{fmtInt(n)}</Fig> videos, {page.month.monthWords} · each opens its page in Voices</> : null} />
      <WhoTalks page={page} />
      <LevelSection title="The numbers" note={counted && n != null ? <>Named without being asked, month by month · then its <Fig>{fmtInt(n)}</Fig> videos, {page.month.monthWords}</> : null} />
      <Numbers page={page} />
      <OwnContent page={page} />
      <AskBox text={<>Ask what your market says about {page.you ? 'your brand' : page.label}, in your own words.</>} href={page.askHref} button={`Ask the Agent about ${page.you ? 'your brand' : page.label}`} />
    </>
  )
}

