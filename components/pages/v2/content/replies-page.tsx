import Link from 'next/link'
import type { ReactNode } from 'react'
import { BrandChip } from '@/components/colour-roles'
import { translationLabel, translationNote } from '@/components/quote-block'
import { LevelBar } from '@/components/shell/level-bar'
import { PageFrame } from '@/components/shell/page-grid'
import { CARD, PeriodSwitch, TickBarRow } from '@/components/v2'
import { fmtInt, platformLabel } from '@/lib/format'
import { CONTENT_PERIODS } from '@/lib/pages/v2/content'
import { contentRepliesHref } from '@/lib/pages/v2/content-address'
import { REPLY_VIDEOS_PHONE, type RepliesPageData, type ReplyCommentView, type ReplyKindView, type ReplyVideoView } from '@/lib/pages/v2/content-replies'
import { cn } from '@/lib/utils'
import { AskCard, ContentLevelTile, ElsewhereSection, FACT, FactLabel, MORE, RAIL, RAIL_ROW, VideoTile } from './level'

// THE COMMENTS WORTH A REPLY, THE EVIDENCE (depth as pages, 17 Oct; boards
// G5-Content-Replies and -Replies-Phone). Lighter than an idea's page and led
// by what people said: the flat header (a reply arrow on the neutral,
// "Comments", "Worth a reply", the days and the counts in mono, the period
// switch), a one-line read and the chips by kind, a hairline; then the comments
// by kind, each under the video it was written on, beside the facts; elsewhere
// on Content; the Agent. No card or figures up top: the count is a cap, never a
// level, so no month sits beside it.

/** "6 under your posts, 3 under posts about you, 3 elsewhere": the split by
 *  whose post, each count a figure; where every comment sits in one place,
 *  that place in words. */
export function underWords(under: RepliesPageData['view']['under']): ReactNode {
  const parts: [number, string][] = ([[under.own, 'under your posts'], [under.about, 'under posts about you'], [under.elsewhere, 'elsewhere']] as [number, string][]).filter(([n]) => n > 0)
  if (parts.length === 0) return null
  if (parts.length === 1) return under.own > 0 ? 'all under your posts' : under.about > 0 ? 'all under posts about you' : 'all elsewhere in your market'
  return <>{parts.map(([n, w], i) => <span key={w}>{i > 0 ? ', ' : null}<span data-copy="figure">{fmtInt(n)}</span> {w}</span>)}</>
}

/** The meta line as its phone lines: the days written, then the count and
 *  its split. */
export function repliesMeta(data: RepliesPageData): ReactNode[][] {
  const first = data.dates ? [`Written ${data.dates}`] : []
  if (data.view.unread) return [first]
  const total = data.view.total
  const split = total > 0 ? underWords(data.view.under) : null
  return [first, [<><span data-copy="figure">{fmtInt(total)}</span> {total === 1 ? 'comment' : 'comments'}</>, ...(split ? [split] : [])]]
}

/** One comment under its video: the commenter's words, its English, when,
 *  its likes, and why it surfaced. */
function Comment({ c }: { c: ReplyCommentView }) {
  const note = translationNote({ lang: c.lang, english: c.english })
  const label = translationLabel(note)
  const cite = [c.date, c.likes ? `${fmtInt(c.likes)} ${c.likes === 1 ? 'like' : 'likes'}` : null, c.reason ? `about ${c.reason.charAt(0).toLowerCase()}${c.reason.slice(1)}` : null].filter(Boolean).join(' · ')
  return (
    <div data-reply-comment="" className="flex flex-col gap-[5px] border-t border-border py-3 first:border-t-0">
      <p data-copy="quote" className="m-0 font-serif text-[15px] italic leading-[1.5] text-foreground max-sm:text-[14.5px]">“{c.text}”</p>
      {label ? <span className="text-[12px] text-muted-foreground">{label}</span> : null}
      {note.english ? <p data-copy="quote" className="m-0 text-[14px] leading-[1.5] text-foreground">{note.english}</p> : null}
      {cite ? <span className="text-[12px] text-muted-foreground">{cite}</span> : null}
    </div>
  )
}

/** Whose post it is: "Your post" on your own, your brand's chip on a post
 *  about you, nothing elsewhere. */
function Under({ under, brand }: { under: ReplyVideoView['under']; brand: string }) {
  if (under === 'own_post') return <span data-under="own" className="ml-auto inline-flex items-center rounded-full bg-accent px-2 py-[5px] text-[12px] leading-none font-semibold whitespace-nowrap text-foreground">Your post</span>
  if (under === 'names_you') return <BrandChip who="you" className="ml-auto text-[12px]">{brand}</BrandChip>
  return null
}

/** A video in a kind (F3's `.vcard`): its poster, platform and day, whose
 *  post, its caption on one line, the comments, the reply link. */
function VideoCard({ v, brand, hideOnPhone, wrong }: { v: ReplyVideoView; brand: string; hideOnPhone: boolean; wrong: boolean }) {
  return (
    <article data-reply-video="" className={cn(CARD, 'gap-3 px-[22px] pt-5 pb-[18px] max-sm:gap-2.5 max-sm:px-4 max-sm:pt-4 max-sm:pb-3.5', hideOnPhone ? 'max-sm:hidden' : null)}>
      <div className="flex min-w-0 items-center gap-3">
        <VideoTile />
        <div className="min-w-0">
          <span className="block truncate text-[14.5px] leading-[1.3] font-semibold text-foreground">{v.account ?? v.platform}</span>
          <span className="block text-[12.5px] leading-[1.35] text-muted-foreground">{v.platform}{v.posted ? ` · posted ${v.posted}` : null}</span>
        </div>
        <Under under={v.under} brand={brand} />
      </div>
      {v.caption ? <p data-copy="quote" className="m-0 truncate text-[14.5px] leading-[1.5] text-secondary-foreground">{v.caption}</p> : null}
      <div className="rounded-[10px] bg-inner px-4 py-0.5 max-sm:px-3.5">
        {v.comments.map((c) => <Comment key={c.ref} c={c} />)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {wrong
          ? <span className="text-[12.5px] text-muted-foreground">For awareness only, no reply link</span>
          : v.href && v.hrefLabel
            ? <a href={v.href} target="_blank" rel="noopener noreferrer" className="text-[13.5px] font-semibold text-orange-text no-underline underline-offset-[3px] hover:underline">{v.hrefLabel} ↗</a>
            : null}
      </div>
    </article>
  )
}

/** One kind: its title and counts, what it holds, its videos (two on a phone,
 *  then "Show all … in {kind}"). Its frame and one line where it holds none. */
function KindSection({ k, data }: { k: ReplyKindView; data: RepliesPageData }) {
  const when = data.period === 'month' ? 'this month' : data.isWeek ? 'this week' : 'in these days'
  return (
    <section id={k.key} aria-labelledby={`h-${k.key}`} data-reply-kind={k.key} className="flex scroll-mt-6 flex-col gap-3 [&+&]:mt-[18px] max-sm:[&+&]:mt-2.5">
      <div className="flex items-baseline justify-between gap-3 px-0.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
        <h2 id={`h-${k.key}`} className="m-0 text-[19px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground max-sm:text-[18px]">{k.title}</h2>
        {k.comments > 0 ? (
          <span className="text-[13px] text-muted-foreground"><span data-copy="figure" className="font-mono">{fmtInt(k.comments)}</span> {k.comments === 1 ? 'comment' : 'comments'} on <span data-copy="figure" className="font-mono">{fmtInt(k.videos.length)}</span> {k.videos.length === 1 ? 'video' : 'videos'}</span>
        ) : null}
      </div>
      <p className="-mt-1.5 m-0 px-0.5 text-[13px] leading-[1.45] text-muted-foreground">{k.sub}</p>
      {k.videos.length === 0 ? (
        <div className={cn(CARD, 'gap-2')}><p className="m-0 text-[14.5px] leading-[1.55] text-muted-foreground">None {when}.</p></div>
      ) : (
        <>
          {k.videos.map((v, i) => <VideoCard key={v.key} v={v} brand={data.brand} wrong={k.key === 'wrong'} hideOnPhone={!k.full && i >= REPLY_VIDEOS_PHONE} />)}
          {k.moreHref ? <Link href={k.moreHref} className={cn(MORE, 'self-stretch sm:hidden')}><span>Show all <span data-copy="figure">{fmtInt(k.comments)}</span> in {k.chip}</span></Link> : null}
        </>
      )}
    </section>
  )
}

/** The facts (F3's `.rail3`; a card on a phone). */
function Facts({ data }: { data: RepliesPageData }) {
  const { view } = data
  const total = Math.max(1, view.total)
  const kinds: [string, string, number][] = [['buy', 'Ready to buy', view.counts.buying], ['questions', 'Questions', view.counts.question], ['objections', 'Objections', view.counts.objection], ['wrong', 'Wrong information', view.counts.flagged]]
  const under: [string, number][] = [['Your posts', view.under.own], ['Posts about you', view.under.about], ['Elsewhere in your market', view.under.elsewhere]]
  return (
    <aside aria-labelledby="facts-title" className={RAIL}>
      <h2 id="facts-title" className="m-0 mb-1 text-[15px] font-semibold text-foreground">The facts</h2>
      {view.unread ? null : (
        <>
          <div className={FACT}>
            <FactLabel>What they are</FactLabel>
            {kinds.map(([anchor, name, n]) => <TickBarRow key={anchor} name={<a href={`#${anchor}`} className="text-foreground no-underline hover:underline">{name}</a>} value={fmtInt(n)} pct={(100 * n) / total} valueWidth="narrow" label={`${fmtInt(n)} of ${fmtInt(view.total)}`} className={RAIL_ROW} />)}
          </div>
          <div className={FACT}>
            <FactLabel>Whose post they sit under</FactLabel>
            {under.map(([name, n]) => <TickBarRow key={name} name={name} value={fmtInt(n)} pct={(100 * n) / total} valueWidth="narrow" label={`${fmtInt(n)} of ${fmtInt(view.total)}`} className={RAIL_ROW} />)}
          </div>
          <div className={FACT}>
            <FactLabel>Where</FactLabel>
            {data.platforms.length > 0
              ? data.platforms.map((p) => <TickBarRow key={p.platform} name={platformLabel(p.platform)} value={fmtInt(p.comments)} pct={(100 * p.comments) / total} tone="ink" valueWidth="narrow" label={`${fmtInt(p.comments)} of ${fmtInt(view.total)}`} className={RAIL_ROW} />)
              : <p className="m-0 text-[13px] text-muted-foreground">No comment on the list.</p>}
          </div>
        </>
      )}
      <div className={FACT}>
        <FactLabel>How the list is picked</FactLabel>
        <p className="m-0 text-[12.5px] leading-[1.5] text-secondary-foreground">
          Picked from the comments written {view.window?.phrase ?? 'this week'}: at most three of a kind, twelve in all and two from one video. We cannot see whether you have replied, so a comment stays on the list.
        </p>
      </div>
    </aside>
  )
}

/** The reply list's page body under its title block. */
export function RepliesPageBody({ data }: { data: RepliesPageData }) {
  const { view } = data
  return (
    <>
      <div data-replies-lead="" className="-mt-0.5 flex flex-col gap-3 border-b border-border pb-[22px] max-sm:gap-2.5 max-sm:pb-4">
        <p className="m-0 max-w-[820px] text-[21px] leading-[1.45] font-normal tracking-[-0.005em] text-foreground max-sm:text-[18px]">{data.lead}</p>
        {view.unread ? null : (
          <nav aria-label="Kinds of comment" className="flex flex-wrap gap-1.5">
            {data.kinds.map((k) => (
              <a key={k.key} href={`#${k.key}`} className="rounded-full bg-card px-3 py-1.5 text-[13px] whitespace-nowrap text-foreground no-underline ring-1 ring-border hover:bg-inner max-sm:px-2.5">
                {k.chip}<span data-copy="figure" className="ml-1 font-mono font-semibold">{fmtInt(k.comments)}</span>
              </a>
            ))}
          </nav>
        )}
      </div>
      <div className="grid grid-cols-1 items-start gap-11 max-sm:gap-[22px] min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col">
          {view.unread
            ? <div data-replies-gap="" className={cn(CARD, 'gap-2')}><p className="m-0 text-[15px] leading-[1.55] text-muted-foreground">{view.unread}</p></div>
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
  return (
    <PageFrame className="text-foreground">
      <LevelBar
        crumbs={data.crumbs}
        level="replies"
        tile={<ContentLevelTile level="replies" />}
        label="Comments"
        title="Worth a reply"
        meta={repliesMeta(data)}
        controls={<PeriodSwitch value={data.period} options={CONTENT_PERIODS} hrefFor={(period) => contentRepliesHref({ period })} />}
      />
      <RepliesPageBody data={data} />
    </PageFrame>
  )
}
