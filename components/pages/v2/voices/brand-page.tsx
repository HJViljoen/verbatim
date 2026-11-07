import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { MovementBadge, nonAnswerParts, signedChange } from '@/components/delta-badge'
import { CARD, commaCite, EmptyBox, SectionHead, TickBar, toMax, type StatItem } from '@/components/v2'
import { ROW, TBL, TD, TD_NUM, TH } from '@/components/v2/look'
import { fmtCompact, fmtInt, longMonth, shortDate } from '@/lib/format'
import { monthTerm } from '@/lib/reading/month-label'
import { prevMonth } from '@/lib/reading/month-key'
import { notMeasuredLine } from '@/lib/pages/not-measured'
import {
  BRAND_FINDINGS_NOTE, BRAND_NO_FINDING, BRAND_YOU_NO_FINDING, brandCreatorsNone, brandCreatorsSub, brandFrameNone, brandGroupsNone,
  type BrandPage,
} from '@/lib/pages/v2/voices-levels'
import { cn } from '@/lib/utils'
import { CAPS, FailedSubjectLine, Fig, LevelText } from './parts'
import { AskBox, LevelQuoteTile } from './levels'

// A BRAND'S PAGE, A HUB (G3-Voices-Brand; since the audit design, 7 Nov,
// drawn to Voices-Brand.dc.html). In the board's order:
//   0. THE TITLE BLOCK: "A rival brand" (or yours, or one you watch) under
//      its name, and the figures row (`brandStats`): the month, named without
//      being asked (`k_organic` of `n_organic`), named at all (`k_any` of its
//      own `n`), and against last month (its `Verdict`, the change beside the
//      word; a brand not counted says why there, once);
//   1. THE LEAD: Pass C's latest finding about it (a rival's) and when it was
//      written, then what named without being asked is counted in, praised
//      and complained (the month's alone), and one note: the videos naming it
//      are what every figure below is of;
//   2. HOW THE TALK DIFFERS: the finding's account, and its other findings;
//   3. WHO TALKS ABOUT IT: its parts are Voices' levels (board D3), the groups
//      commenting on its videos and the creators it comes up with, each
//      opening its page (D2: a hub draws no videos);
//   4. THE NUMBERS: named without being asked month by month (a table), what
//      people did in the comments, what its talk sits in (READY subjects
//      only, U6), where it was named, where, a tile each with bare counts of
//      its videos and bars against the largest (decisions 2 and 5);
//   5. UNDER ITS OWN CONTENT (a rival's alone): the ninety days to the month's
//      last update named in its head (D4), what is asked under its posts, what
//      it says in them; then SAID ABOUT IT, three comments, a tile each;
//   6. THE AGENT.
// A brand not counted keeps every frame and says why once (the figures row),
// that no figure prints for it once (the lead tile), and its numbers are one
// tile naming what they would hold in the dashed box (decision 4; the review
// of Phases 4 and 5: no empty table, no line repeated a frame).

/** The month a brand's page compares with: always the month before the one
 *  it reads (`prevMonth`), named in full. Never the month's own name: a brand
 *  with no reading last month (`prevNamed` null) once printed "October's
 *  alone, not compared with October". Pure. */
export const brandCompareMonth = (page: Pick<BrandPage, 'month'>): string => longMonth(prevMonth(page.month.month))

const sentence = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`

/** The level under its title: whose brand it is. */
export const brandSub = (page: Pick<BrandPage, 'you' | 'watched'>): string => (page.you ? 'Your brand' : page.watched ? 'A brand you watch' : 'A rival brand')

/** Against last month, in the figures row: the verdict's word and its change
 *  (a verdict node each), or the comparison not drawn. */
function Against({ page }: { page: BrandPage }) {
  const v = page.verdict
  if (page.state !== 'counted' || !v || v.state === 'refused') return <span data-fig-gap="">No comparison yet</span>
  const nonAnswer = nonAnswerParts(v, 'pts')
  // A movement in the same form as a non-answer, the word then the change
  // (the review of Phases 4 and 5: your own brand read "▲ 7.1 pts" with no
  // word, a rival "No clear change, +2.4 pts"), the band in the title.
  if (!nonAnswer) {
    const change = 'changePts' in v ? v.changePts : null
    const band = 'bandPts' in v ? v.bandPts : null
    if (change == null) return <span data-copy="verdict" className="[&>span]:text-[length:inherit] [&>span]:leading-[inherit] [&>span]:font-[inherit]"><MovementBadge verdict={v} unit="pts" good={page.you ? 'up' : 'neutral'} bandTip /></span>
    return (
      <>
        <span data-copy="verdict" title={band != null ? `moved beyond the ${band} pt margin of this measurement` : undefined}>Beyond its normal swing</span>
        , <span data-copy="verdict" className="whitespace-nowrap">{signedChange(change, 'pts')}</span>
      </>
    )
  }
  return (
    <>
      <span data-copy="verdict" title={nonAnswer.title}>{sentence(nonAnswer.word)}</span>
      {nonAnswer.change != null ? <>, <span data-copy="verdict" className="whitespace-nowrap">{signedChange(nonAnswer.change, 'pts')}</span></> : null}
    </>
  )
}

/** The figures row: the month, named without being asked, named at all, and
 *  against last month. A brand not counted says why in the second cell, once
 *  on the page, and prints no figure. Pure. */
export function brandStats(page: BrandPage): StatItem[] {
  const counted = page.state === 'counted'
  const cells: StatItem[] = [{ key: 'month', term: monthTerm(page.month.monthLabel), value: page.month.monthWords }]
  cells.push({
    key: 'named',
    term: 'Named without being asked',
    value: !counted
      // The row's words (a lib string that may carry " · ") in commas.
      ? <span data-brand-state={page.state}>{sentence(commaCite(page.stateWords ?? 'not counted yet'))}</span>
      : page.named ? <LevelText k={page.named.k} n={page.named.n} unit="videos" /> : 'Not read yet',
  })
  if (counted) cells.push({ key: 'any', term: 'Named at all', value: page.any ? <LevelText k={page.any.k} n={page.any.n} unit="videos" /> : 'Not read yet' })
  cells.push({ key: 'against', term: 'Against last month', value: <Against page={page} /> })
  return cells
}

/** A fact of the lead tile: its label, and its words. */
function Fact({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={CAPS}>{term}</dt>
      <dd className="m-0 mt-1.5 text-[15px] leading-[1.5] text-secondary-foreground">{children}</dd>
    </div>
  )
}

const BIG = 'text-[28px] font-bold leading-[1.2] text-foreground'

/** The lead: the finding (a rival's) and when it was written, then the facts
 *  the figures row does not hold, and what every figure below is of. */
function Header({ page }: { page: BrandPage }) {
  const counted = page.state === 'counted'
  const any = page.any?.k ?? page.praised?.n ?? null
  return (
    <section id="brand-hub" aria-label={page.label} className={cn(CARD, 'gap-[22px] sm:p-[30px]')}>
      {page.lead ? (
        <div>
          <h2 className="m-0 max-w-[1000px] text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-foreground max-sm:text-[23px]">
            <span data-copy="stored" data-slot="pass_c_finding">{page.lead.title}</span>
          </h2>
          <p className="m-0 mt-2.5 text-[14.5px] text-muted-foreground">Where its talk differs{page.findingsDate ? <>, from the {shortDate(page.findingsDate)} update</> : null}</p>
        </div>
      ) : null}
      {counted ? (
        <>
          <dl className={cn('m-0 grid grid-cols-1 gap-8 min-[900px]:grid-cols-3', page.lead ? 'border-t border-track pt-5' : null)}>
            <Fact term="Named without being asked">
              {page.named ? <>Counted in the <Fig>{fmtInt(page.named.n)}</Fig> videos we did not find by searching for a brand</> : <>Not read for {page.month.monthWords}.</>}
            </Fact>
            {page.praised && page.complained ? (
              <>
                <Fact term="Praised it"><Fig className={BIG}>{fmtInt(page.praised.k)}</Fig> of the <Fig>{fmtInt(page.praised.n)}</Fig> videos naming it</Fact>
                <Fact term="Complained about something"><Fig className={BIG}>{fmtInt(page.complained.k)}</Fig> of the <Fig>{fmtInt(page.complained.n)}</Fig> videos naming it</Fact>
              </>
            ) : <Fact term="How people treat it"><EmptyBox>Not read yet.</EmptyBox></Fact>}
          </dl>
          {/* One note for both of the old footnotes: what the figures below
              are of, and that its counts are the month's alone (base `any`
              carries no verdict, and no reason is given). */}
          {any != null ? (
            <p data-brand-base="" className="m-0 text-[13.5px] leading-[1.5] text-muted-foreground">
              The <Fig>{fmtInt(any)}</Fig> videos naming it are what every figure below is of, and its counts are {longMonth(page.month.month)}’s alone, not compared with {brandCompareMonth(page)}.
            </p>
          ) : null}
        </>
      ) : (
        <EmptyBox>{brandFrameNone('figure', page.label, page.month)}</EmptyBox>
      )}
    </section>
  )
}

function ReadCard({ page }: { page: BrandPage }) {
  if (!page.lead) {
    return (
      <article aria-label={`Where ${page.label}'s talk differs`} data-brand-read="none" className={cn(CARD, 'gap-2.5 sm:p-[30px]')}>
        {/* An h2: with no finding the lead tile above has no heading, so this
            is the h1's next. */}
        <h2 className={CAPS}>How the talk differs</h2>
        {/* No finding: said in the dashed box (decision 4; the review of
            Phases 6 and 7), as every other gap on the page. */}
        <EmptyBox>{page.you ? BRAND_YOU_NO_FINDING : BRAND_NO_FINDING}</EmptyBox>
      </article>
    )
  }
  return (
    <article aria-label={`Where ${page.label}'s talk differs from the rest of the market`} className={cn(CARD, 'sm:p-[30px]')}>
      <div className="grid grid-cols-1 gap-10 max-sm:gap-6 min-[900px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2.5">
          <h3 className={CAPS}>How the talk differs</h3>
          {page.lead.body ? <p className="m-0 text-[17px] leading-[1.65] text-foreground"><span data-copy="stored" data-slot="pass_c_finding">{page.lead.body}</span></p> : null}
          <p className="m-0 mt-1 text-[13.5px] text-muted-foreground">{BRAND_FINDINGS_NOTE}</p>
        </div>
        {page.findings.length > 0 ? (
          <div className="flex min-w-0 flex-col">
            {page.findings.map((f) => (
              <div key={f.id} className="flex flex-col border-t border-track py-5 first:border-t-0 first:pt-0">
                <h3 className="m-0 text-[18px] leading-[1.4] font-semibold text-foreground"><span data-copy="stored" data-slot="pass_c_finding">{f.title}</span></h3>
                <p className="m-0 mt-1 mb-2 text-[13.5px] text-muted-foreground">{sentence(f.kindWords)}</p>
                {f.body ? <p className="m-0 text-[15px] leading-[1.6] text-secondary-foreground"><span data-copy="stored" data-slot="pass_c_finding">{f.body}</span></p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}

/** A tile of the page: its head (and its line), then its body. */
function Tile({ title, sub, children, ...rest }: { title: ReactNode; sub?: ReactNode; children: ReactNode; 'data-numbers-gap'?: string }) {
  return (
    <article className={cn(CARD, 'gap-3.5')} {...rest}>
      <div>
        <h3 className="m-0 text-[17px] leading-[1.3] font-semibold text-foreground">{title}</h3>
        {sub ? <p className="m-0 mt-1 text-[14px] leading-[1.45] text-muted-foreground">{sub}</p> : null}
      </div>
      {children}
    </article>
  )
}

/** A list's rows: a name, a bar against the list's largest, a count. */
function BarRows({ rows, bar = 96, label }: { rows: readonly { key: string; name: ReactNode; k: number; note?: ReactNode }[]; bar?: 70 | 90 | 96 | 120; label: (k: number) => string }) {
  const at = toMax(rows.map((r) => r.k))
  const cols = bar === 70 ? 'grid-cols-[minmax(0,1fr)_70px_30px]' : bar === 90 ? 'grid-cols-[minmax(0,1fr)_90px_30px]' : bar === 120 ? 'grid-cols-[minmax(0,1fr)_120px_34px]' : 'grid-cols-[minmax(0,1fr)_96px_34px]'
  return (
    <div className={cn('grid items-center gap-x-3.5 gap-y-3 text-[15px]', cols)}>
      {rows.map((r) => (
        <Fragment key={r.key}>
          <span className="min-w-0">{r.name}{r.note ? <span className="mt-0.5 block text-[13.5px] leading-[1.45] text-muted-foreground">{r.note}</span> : null}</span>
          <TickBar pct={at(r.k)} size="md" label={label(r.k)} />
          <Fig className="text-right">{fmtInt(r.k)}</Fig>
        </Fragment>
      ))}
    </div>
  )
}

const NOTE = 'm-0 text-[13.5px] leading-[1.45] text-muted-foreground'

/** "Who talks about it": the groups commenting on its videos, the creators it
 *  comes up with, each opening its page by its name. */
function WhoTalks({ page }: { page: BrandPage }) {
  const counted = page.state === 'counted'
  const n = page.any?.k ?? 0
  // Why it is not counted is the figures row's, once; each tile says what it
  // holds.
  const gap = (what: 'group' | 'creator') => <EmptyBox><span data-brand-frame-gap={page.state}>{brandFrameNone(what, page.label, page.month)}</span></EmptyBox>
  return (
    <section aria-label={`Who talks about ${page.label}`} className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <Tile title="The groups commenting on its videos" sub="A video can hold more than one group, so the counts overlap.">
        {!counted ? gap('group') : page.groups.length === 0 ? <EmptyBox>{page.groupsLine ?? brandGroupsNone(page.month)}</EmptyBox> : (
          <BarRows
            bar={90}
            rows={page.groups.map((g) => ({
              key: g.key,
              k: g.k,
              name: <Link href={g.href} className={cn(ROW, 'font-normal')}><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></Link>,
              note: g.oneLiner ? <span data-copy="subject" data-slot="pass_e_persona">{g.oneLiner}</span> : null,
            }))}
            label={(k) => `${fmtInt(k)} of ${fmtInt(n)}`}
          />
        )}
      </Tile>
      <Tile title="Creators it comes up with" sub={`${brandCreatorsSub(page.month)}.`}>
        {!counted ? gap('creator') : page.creators.length === 0 ? <EmptyBox>{brandCreatorsNone(page.month)}</EmptyBox> : (
          // From 640 the table; on a phone (decision 14) the creator with its
          // platform and audience in a line under it, and its videos.
          <div className="-mx-1 overflow-x-auto px-1">
            <table className={cn(TBL, 'sm:min-w-[420px]')}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>Creator</th>
                  <th scope="col" className={cn(TH, 'max-sm:hidden')}>Platform</th>
                  <th scope="col" className={cn(TH, 'max-sm:hidden')}>Audience</th>
                  <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>Its videos</th>
                </tr>
              </thead>
              <tbody>
                {page.creators.map((c) => (
                  <tr key={c.key}>
                    <td className={cn(TD, 'font-semibold')}>
                      <Link href={c.href} className={ROW}>{c.account}</Link>
                      <span className="mt-1 block text-[14px] font-normal leading-[1.45] text-secondary-foreground sm:hidden">
                        {c.platformLabel}{c.followers != null ? <>, <Fig>{fmtCompact(c.followers)}</Fig> {c.followerWord}</> : null}
                      </span>
                    </td>
                    <td className={cn(TD, 'max-sm:hidden')}>{c.platformLabel}</td>
                    <td className={cn(TD, 'whitespace-nowrap text-secondary-foreground max-sm:hidden')}>{c.followers != null ? <><Fig>{fmtCompact(c.followers)}</Fig> {c.followerWord}</> : null}</td>
                    <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5 font-semibold')}><Fig>{fmtInt(c.k)}</Fig></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page.communitiesLeftOut ? <p className={NOTE}>Reddit is left out: there a post’s account is the community it was posted in, not who made it.</p> : null}
      </Tile>
    </section>
  )
}

/** The numbers of a brand with no figure (not counted, noisy, or named in no
 *  video): one tile, its parts named once in the dashed box (decision 4; the
 *  review of Phases 4 and 5), never an empty table or a line a frame. Why is
 *  said once, in the figures row; that no figure prints, once, in the lead. */
export const BRAND_NUMBERS_NONE = 'Month by month, what people did in the comments, what its talk sits in, where it was named and where: each is drawn here once it has a figure.'

function Numbers({ page }: { page: BrandPage }) {
  const counted = page.state === 'counted'
  const n = page.any?.k ?? 0
  if (!counted) {
    return (
      <section aria-label={`${page.label} in numbers`} data-numbers-gap={page.state} className={CARD}>
        <EmptyBox>{BRAND_NUMBERS_NONE}</EmptyBox>
      </section>
    )
  }
  return (
    <section aria-label={`${page.label} in numbers`} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
        <Tile title="Named without being asked, month by month">
          <table className={TBL}>
            <thead>
              <tr>
                <th scope="col" className={TH}>Month</th>
                <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>Named without being asked</th>
                <th scope="col" className={cn(TH, 'pr-0 pl-3.5 text-right')}>Share</th>
              </tr>
            </thead>
            <tbody>
              {page.months.map((m) => (
                <tr key={m.month} data-brand-month={m.filling ? 'filling' : 'closed'}>
                  <td className={TD}>{m.label}{m.filling ? ' so far' : null}</td>
                  <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5')}>{m.k != null && m.n != null ? <LevelText k={m.k} n={m.n} /> : <span className="text-muted-foreground">Not read</span>}</td>
                  <td className={cn(TD, TD_NUM, 'pr-0 pl-3.5 font-semibold')}>{m.k != null && m.n ? <Fig>{Math.round((100 * m.k) / m.n)}%</Fig> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tile>
        <Tile title={<>What people did in the comments{page.kinds.length > 0 ? <>, of its <Fig>{fmtInt(page.kinds[0].n)}</Fig></> : null}</>}>
          {page.kinds.length > 0
            ? <BarRows bar={120} rows={page.kinds.map((k) => ({ key: k.kind, name: k.label, k: k.k }))} label={(k) => `${fmtInt(k)} of ${fmtInt(page.kinds[0].n)}`} />
            : <EmptyBox>Not read yet.</EmptyBox>}
        </Tile>
      </div>
      <div className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-3">
        <Tile title={<>What its talk sits in{page.subjects.length > 0 ? <>, of its <Fig>{fmtInt(page.subjects[0].n)}</Fig></> : null}</>}>
          {(
            <>
              {page.subjects.length > 0
                ? <BarRows bar={70} rows={page.subjects.map((s) => ({ key: s.id, name: <Link href={s.href} className={cn(ROW, 'font-normal')}>{s.label}</Link>, k: s.k }))} label={(k) => `${fmtInt(k)} of ${fmtInt(page.subjects[0].n)}`} />
                : page.notMeasured.length === 0 ? <EmptyBox>No subject read in its videos yet.</EmptyBox> : null}
              {/* With no subject measured, its state is the tile's one
                  sentence, in the dashed box (decision 4). */}
              {page.notMeasured.length > 0 ? (page.subjects.length > 0 ? <p className={NOTE}>{notMeasuredLine(page.notMeasured)}.</p> : <EmptyBox>{notMeasuredLine(page.notMeasured)}.</EmptyBox>) : null}
              {page.subjects.length > 0 ? <p className={NOTE}>Each opens in Market.</p> : null}
              {/* Why one being re-described shows no figure, said once on the
                  page (14 Oct), as the root's foot and a group's page say it. */}
              {page.notMeasured.filter((s) => s.failed).map((s) => <FailedSubjectLine key={s.id} label={s.label} />)}
            </>
          )}
        </Tile>
        <Tile title={<>Where it was named{page.where ? <>, of its <Fig>{fmtInt(page.where.n)}</Fig></> : null}</>}>
          {page.where ? (
            <>
              <BarRows bar={70} rows={[{ key: 'comment', name: 'In the comments', k: page.where.comment }, { key: 'content', name: 'In the video: caption, speech or on screen', k: page.where.content }]} label={(k) => `${fmtInt(k)} of ${fmtInt(page.where!.n)}`} />
              <p className={NOTE}>A video can name it in both.</p>
            </>
          ) : <EmptyBox>Not read for {page.month.monthWords}.</EmptyBox>}
        </Tile>
        <Tile title={<>Where{n > 0 ? <>, of its <Fig>{fmtInt(n)}</Fig></> : null}</>}>
          {page.platforms.length > 0
            ? <BarRows bar={90} rows={page.platforms.map((p) => ({ key: p.platform, name: p.label, k: p.k }))} label={(k) => `${fmtInt(k)} of ${fmtInt(n)}`} />
            : <EmptyBox>No video counted by platform yet.</EmptyBox>}
        </Tile>
      </div>
    </section>
  )
}

/** UNDER ITS OWN CONTENT (D4): a rival's ninety days, named in their own
 *  head, so their dates never mix with the month's; then what is said about
 *  it, a comment a tile. */
function OwnContent({ page }: { page: BrandPage }) {
  const w = page.window
  if (!w) return null
  return (
    <>
      <SectionHead title="Under its own content" note={<span data-window-chip="">{w.words}, the ninety days to the month’s last update</span>} />
      <section aria-label={`Under ${page.label}'s own content`} className="grid grid-cols-1 gap-5 min-[1180px]:grid-cols-2">
        <Tile title="Asked under its content">
          {page.asked.length > 0 ? (
            <>
              <div className="flex flex-col gap-2.5">
                {page.asked.map((t) => (
                  <div key={t.id} className="flex justify-between gap-3 border-t border-track pt-2.5 text-[15px]">
                    <Link href={t.href} className={cn(ROW, 'font-normal')}><span data-copy="subject" data-slot="pass_b_theme">{t.label}</span></Link>
                    <span className="shrink-0 whitespace-nowrap font-semibold"><Fig>{fmtInt(t.videos)}</Fig> {t.videos === 1 ? 'video' : 'videos'}</span>
                  </div>
                ))}
              </div>
              <p className={NOTE}>The questions people ask under {page.label}’s own posts. Each opens in Market.</p>
            </>
          ) : <EmptyBox>No question conversation under its own posts in these ninety days.</EmptyBox>}
        </Tile>
        <Tile title="What it says in its own videos">
          {page.claims.length > 0
            ? <div className="flex flex-col gap-3">{page.claims.map((c) => <p key={c.id} className="m-0 border-t border-track pt-3 text-[16px] leading-[1.6] text-foreground"><span data-copy="stored" data-slot="pass_a_brand_claim">{c.claim}</span></p>)}</div>
            : <EmptyBox>Nothing it says in its own posts in these ninety days is read yet.</EmptyBox>}
        </Tile>
      </section>
      <SectionHead
        title={`Said about ${page.label}`}
        note={page.said.length > 0 ? <><Fig>{fmtInt(page.said.length)}</Fig> {page.said.length === 1 ? 'comment' : 'comments'}{page.said.every((q) => q.from) ? ', each from its conversation' : null}</> : null}
      />
      {page.said.length > 0 ? (
        <section aria-label={`Said about ${page.label}`} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {page.said.map((q) => <LevelQuoteTile key={q.ref} q={q} />)}
        </section>
      ) : (
        <section aria-label={`Said about ${page.label}`} className={CARD}>
          <EmptyBox>Nothing said about it in these ninety days can be quoted.</EmptyBox>
        </section>
      )}
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
      <SectionHead title={`Who talks about ${page.label}`} note={counted && n != null ? <>Its <Fig>{fmtInt(n)}</Fig> videos, {page.month.monthWords}. Each opens its page in Voices.</> : null} />
      <WhoTalks page={page} />
      <SectionHead title="The numbers" note={counted && n != null ? <>Named without being asked, month by month, then its <Fig>{fmtInt(n)}</Fig> videos, {page.month.monthWords}</> : null} />
      <Numbers page={page} />
      <OwnContent page={page} />
      <AskBox text={<>Ask what your market says about {page.you ? 'your brand' : page.label}, in your own words.</>} href={page.askHref} button={`Ask the Agent about ${page.you ? 'your brand' : page.label}`} />
    </>
  )
}
