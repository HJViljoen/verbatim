import Link from 'next/link'
import type { ReactNode } from 'react'
import { BrandChip } from '@/components/colour-roles'
import { translationNote } from '@/components/quote-block'
import { LevelBar } from '@/components/shell/level-bar'
import { PageFrame } from '@/components/shell/page-grid'
import { CARD, EmptyBox, GoLink, listWords, PeriodSwitch, SectionHead, shortDates, TickBar, toMax, translationLine, withMonthName, type StatItem } from '@/components/v2'
import { CHIP, QUOTE } from '@/components/v2/look'
import { fmtInt, longMonth, platformLabel } from '@/lib/format'
import { CONTENT_PERIODS } from '@/lib/pages/v2/content'
import { contentRepliesHref } from '@/lib/pages/v2/content-address'
import { REPLY_VIDEOS_PHONE, type RepliesPageData, type ReplyCommentView, type ReplyKindView, type ReplyVideoView } from '@/lib/pages/v2/content-replies'
import { readingMonthOf } from '@/lib/written/month'
import { cn } from '@/lib/utils'
import { AskCard, ElsewhereSection } from './level'

// THE COMMENTS WORTH A REPLY, THE EVIDENCE (depth as pages, 17 Oct; boards
// G5-Content-Replies and -Replies-Phone; since the audit design, 7 Nov, drawn
// to Content-Replies.dc.html). Lighter than an idea's page and led by what
// people said: the title with the period switch (the month by its name) and
// the figures row (the days written, the comments on the list), a one-line
// read and the chips by kind; then the comments by kind, each under the video
// it was written on, a figure a comment, beside the facts in a tile;
// elsewhere on Content; the Agent. The count is a cap, never a level, so no
// "of N" and no month sits beside it.

/** "6 under your posts, 3 under posts about you, 3 elsewhere": the split by
 *  whose post, each count a figure; where every comment sits in one place,
 *  that place in words. */
export function underWords(under: RepliesPageData['view']['under']): ReactNode {
  const parts: [number, string][] = ([[under.own, 'under your posts'], [under.about, 'under posts about you'], [under.elsewhere, 'elsewhere']] as [number, string][]).filter(([n]) => n > 0)
  if (parts.length === 0) return null
  if (parts.length === 1) return under.own > 0 ? 'all under your posts' : under.about > 0 ? 'all under posts about you' : 'all elsewhere in your market'
  return <>{parts.map(([n, w], i) => <span key={w}>{i > 0 ? ', ' : null}<span data-copy="figure">{fmtInt(n)}</span> {w}</span>)}</>
}

/** The figures row (the board's `.strip`): the days the comments were
 *  written, and how many are on the list (a cap, never a level). The split
 *  by whose post is the facts'. Pure. */
export function repliesStats(data: RepliesPageData): StatItem[] {
  const cells: StatItem[] = []
  // A week's days in the short form ("5 to 11 Oct"); a month's words as
  // they are ("October so far").
  if (data.dates) cells.push({ key: 'written', term: 'Written', value: data.period === 'week' ? shortDates(data.dates) : data.dates })
  cells.push({
    key: 'comments',
    term: 'Comments worth a reply',
    value: data.view.unread ? 'Not read just now' : <span data-copy="figure">{fmtInt(data.view.total)}</span>,
  })
  return cells
}

/** The month as the switch names it ("October so far", "October"): the
 *  page's month, the root's rule (`readingMonthOf` over the week the list is
 *  read from; the month's own words where the month is read). Null where no
 *  update has covered a week. */
export function repliesMonthText(data: Pick<RepliesPageData, 'period' | 'view'>): string | null {
  const w = data.view.window
  if (!w) return null
  if (data.period === 'month') return w.phrase.replace(/^in /, '')
  const m = readingMonthOf({ from: w.from, to: w.to })
  return m.complete ? longMonth(m.month) : `${longMonth(m.month)} so far`
}

/** One comment under its video, a figure of its own (the board's): the
 *  commenter's words, its English, then its platform, day, likes and why it
 *  surfaced, in commas. */
function Comment({ c, platform }: { c: ReplyCommentView; platform: string }) {
  const note = translationNote({ lang: c.lang, english: c.english })
  const label = translationLine(note)
  const cite = listWords([platform, c.date, c.likes ? `${fmtInt(c.likes)} ${c.likes === 1 ? 'like' : 'likes'}` : null, c.reason ? `about ${c.reason.charAt(0).toLowerCase()}${c.reason.slice(1)}` : null])
  return (
    <figure data-reply-comment="" className="m-0 flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-inner px-[22px] py-[18px] max-sm:px-4 max-sm:py-3.5">
      <blockquote className="m-0"><p data-copy="quote" className={cn('m-0 text-foreground', QUOTE)}>“{c.text}”</p></blockquote>
      {label ? <span className="text-[13px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[14.5px] leading-[1.5] text-foreground">{note.english}</p> : null}
      {cite ? <figcaption className="mt-1 text-[13px] text-muted-foreground">{cite}</figcaption> : null}
    </figure>
  )
}

/** Whose post it is: "Your post" in your gold words on your own (as Your
 *  products marks it; the review of Phases 6 and 7), your brand's name in
 *  your gold on a post about you, nothing elsewhere. */
function Under({ under, brand }: { under: ReplyVideoView['under']; brand: string }) {
  if (under === 'own_post') return <span data-under="own" className="shrink-0"><BrandChip who="you" plain className="text-[13px] font-semibold text-you">Your post</BrandChip></span>
  if (under === 'names_you') return <BrandChip who="you" plain className="shrink-0 text-[13px] font-semibold text-you">{brand}</BrandChip>
  return null
}

/** A video in a kind (the board's tile): its poster, platform and day, whose
 *  post at the right, its caption in two lines, the comments, the reply
 *  link. */
function VideoCard({ v, brand, hideOnPhone, wrong }: { v: ReplyVideoView; brand: string; hideOnPhone: boolean; wrong: boolean }) {
  return (
    <article data-reply-video="" className={cn(CARD, 'gap-3.5', hideOnPhone ? 'max-sm:hidden' : null)}>
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h3 className="m-0 text-[16px] leading-[1.35] font-semibold text-foreground">{v.account ?? v.platform}</h3>
          <span className="block text-[14px] leading-[1.4] text-muted-foreground">{v.platform}{v.posted ? `, posted ${v.posted}` : null}</span>
        </div>
        <Under under={v.under} brand={brand} />
      </div>
      {v.caption ? <p data-copy="quote" className="m-0 line-clamp-2 text-[15px] leading-[1.55] text-secondary-foreground">{v.caption}</p> : null}
      {v.comments.map((c) => <Comment key={c.ref} c={c} platform={v.platform} />)}
      {wrong
        ? <span className="text-[14px] text-muted-foreground">For awareness only, no reply link</span>
        : v.href && v.hrefLabel
          ? <GoLink href={v.href} external className="self-start">{v.hrefLabel}</GoLink>
          : null}
    </article>
  )
}

/** One kind: its title and counts, what it holds, its videos (two on a phone,
 *  then "Show all … in {kind}"). Its heading and the dashed box where it
 *  holds none (decision 4). */
/** The list's days in words ("this week", "in October so far", "in
 *  September"): a month that has ended is never "this month". */
const when = (data: RepliesPageData): string =>
  data.period === 'month' ? data.view.window?.phrase ?? 'this month' : data.isWeek ? 'this week' : 'in these days'

function KindSection({ k, data }: { k: ReplyKindView; data: RepliesPageData }) {
  return (
    <section id={k.key} aria-labelledby={`h-${k.key}`} data-reply-kind={k.key} className="flex scroll-mt-6 flex-col">
      <SectionHead
        id={`h-${k.key}`}
        title={k.title}
        note={k.comments > 0 ? <><span data-copy="figure">{fmtInt(k.comments)}</span> {k.comments === 1 ? 'comment' : 'comments'} on <span data-copy="figure">{fmtInt(k.videos.length)}</span> {k.videos.length === 1 ? 'video' : 'videos'}</> : undefined}
      />
      <p className="m-0 mx-0.5 mt-2.5 mb-4 text-[14.5px] leading-[1.5] text-secondary-foreground">{k.sub}</p>
      <div className="flex flex-col gap-4">
        {k.videos.length === 0 ? (
          <EmptyBox>None {when(data)}.</EmptyBox>
        ) : (
          <>
            {k.videos.map((v, i) => <VideoCard key={v.key} v={v} brand={data.brand} wrong={k.key === 'wrong'} hideOnPhone={!k.full && i >= REPLY_VIDEOS_PHONE} />)}
            {k.moreHref ? <Link href={k.moreHref} className={cn(CHIP, 'h-10 justify-center self-stretch font-semibold no-underline sm:hidden')}>Show all <span data-copy="figure" className="mx-1">{fmtInt(k.comments)}</span> in {k.chip}</Link> : null}
          </>
        )}
      </div>
    </section>
  )
}

/** A fact's rows: a name, a bar against the list's largest (decision 5), a
 *  bare count; the bar in your gold for your own posts, the yellow for the
 *  rest. */
function BarRows({ rows }: { rows: readonly { key: string; name: string; n: number; you?: boolean }[] }) {
  const at = toMax(rows.map((r) => r.n))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_80px_24px] items-center gap-x-3 gap-y-2.5 text-[14.5px]">
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <span className="min-w-0">{r.name}</span>
          <TickBar pct={at(r.n)} tone={r.you ? 'you' : 'market'} size="md" label={`${r.name}: ${fmtInt(r.n)} comments`} />
          <span data-copy="figure" className="text-right tabular-nums">{fmtInt(r.n)}</span>
        </div>
      ))}
    </div>
  )
}

const H3 = 'm-0 mb-3 text-[15px] font-semibold text-foreground'
const RULED = 'border-t border-track pt-5'

/** The facts, one tile (the board's): whose post they sit under, where, and
 *  how the list is picked. What they are is the chips' (it said the four
 *  counts again). */
function Facts({ data }: { data: RepliesPageData }) {
  const { view } = data
  return (
    <aside aria-labelledby="facts-title" className="flex min-w-0 flex-col">
      <SectionHead id="facts-title" title="The facts" />
      <div className={cn(CARD, 'mt-[22px] gap-[22px]')}>
        {/* Unread, or nothing on the list: no bars at 0 and no box saying
            it again; the list's own column says it once. */}
        {view.unread || view.total === 0 ? null : (
          <>
            <div>
              <h3 className={H3}>Whose post they sit under</h3>
              <BarRows rows={[
                { key: 'own', name: 'Your posts', n: view.under.own, you: true },
                { key: 'about', name: 'Posts about you', n: view.under.about },
                { key: 'elsewhere', name: 'Elsewhere in your market', n: view.under.elsewhere },
              ]} />
            </div>
            <div className={RULED}>
              <h3 className={H3}>Where</h3>
              {data.platforms.length > 0
                ? <BarRows rows={data.platforms.map((p) => ({ key: p.platform, name: platformLabel(p.platform), n: p.comments }))} />
                : <EmptyBox>No comment on the list.</EmptyBox>}
            </div>
          </>
        )}
        <div className={view.unread || view.total === 0 ? undefined : RULED}>
          <h3 className={cn(H3, 'mb-2')}>How the list is picked</h3>
          <p className="m-0 text-[14px] leading-[1.55] text-secondary-foreground">
            Picked from the comments written {view.window?.phrase ?? 'this week'}: up to twelve, no more than two from one video; wrong information is listed apart, up to three. We cannot see whether you have replied, so a comment stays on the list.
          </p>
        </div>
      </div>
    </aside>
  )
}

/** The reply list's page body under its title block. */
export function RepliesPageBody({ data }: { data: RepliesPageData }) {
  const { view } = data
  const empty = !view.unread && view.total === 0
  return (
    <>
      <div data-replies-lead="" className="flex flex-col gap-[18px]">
        <p className="m-0 max-w-[1000px] text-[21px] leading-[1.45] text-foreground max-sm:text-[18px]">{data.lead}</p>
        {view.unread ? null : (
          <nav aria-label="Kinds of comment" className="flex flex-wrap gap-2">
            {data.kinds.map((k) => (
              <a key={k.key} href={`#${k.key}`} className={cn(CHIP, 'gap-1.5 no-underline')}>
                {k.chip} <span data-copy="figure" className="font-semibold">{fmtInt(k.comments)}</span>
              </a>
            ))}
          </nav>
        )}
      </div>
      <div className="grid grid-cols-1 items-start gap-7 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col">
          {view.unread
            ? <div data-replies-gap="" className={cn(CARD, 'mt-[26px]')}><EmptyBox>{view.unread}</EmptyBox></div>
            : empty
              // NOTHING ON THE LIST: said once, in one dashed box (the
              // review of Phases 6 and 7), never "None this week." under each
              // of the four kinds; the chips above name the kinds at 0.
              ? <div data-replies-gap="none" className={cn(CARD, 'mt-[26px]')}><EmptyBox>No comment worth a reply {when(data)}.</EmptyBox></div>
              : data.kinds.map((k) => <KindSection key={k.key} k={k} data={data} />)}
        </div>
        <Facts data={data} />
      </div>
      <ElsewhereSection data={data.elsewhere} />
      <AskCard line="Ask about these comments and what people want from you, in your own words." label="Ask the Agent about these comments" href={data.askHref} />
    </>
  )
}

/** The reply list's page (`/dashboard/content/replies`). */
export function ContentRepliesPage({ data }: { data: RepliesPageData }) {
  const month = repliesMonthText(data)
  return (
    <PageFrame className="text-foreground">
      <LevelBar
        crumbs={data.crumbs}
        level="replies"
        title="Worth a reply"
        stats={repliesStats(data)}
        // The board keeps its two cells in the four-column grid.
        statsColumns={4}
        controls={<PeriodSwitch value={data.period} options={month ? withMonthName(CONTENT_PERIODS, month) : CONTENT_PERIODS} hrefFor={(period) => contentRepliesHref({ period })} />}
      />
      <RepliesPageBody data={data} />
    </PageFrame>
  )
}
