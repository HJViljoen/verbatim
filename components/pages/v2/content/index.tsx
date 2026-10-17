import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { PeriodSwitch } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { CONTENT_PERIODS, contentHref, monthWords, questionSlotsContext, weekWordsOf, type ContentPageData, type ContentState } from '@/lib/pages/v2/content'
import { surface } from '@/lib/nav'
import { AskedCard } from './asked'
import { IdeasSection } from './ideas'
import { Fig } from './parts'
import { PostsCard } from './posts'
import { RepliesCard } from './replies'
import { WorksCard } from './works'

/**
 * CONTENT (depth v2, T6; boards E5-Content, and since 17 Oct G5-Content).
 *
 * The root: the page bar (its period switch: which days the reply list and
 * the also-asked table read), the week's post ideas, What works beside Worth
 * a reply and Your posts, then Also asked. It keeps its own title and has no
 * crumb row. EVERY OPEN IS A PAGE (depth as pages, 17 Oct): an idea's card
 * opens its page, a question card and an Also asked row open the
 * conversation's page in Market, Worth a reply and Your posts open theirs;
 * nothing opens in place. Server-rendered; the period and the expanded table
 * are URL params (lib/pages/v2/content.ts `contentHref`).
 */

/** "this week" for a seven-day window, else its days ("between 28 Sep and 4
 *  Oct"): a window is not called a week unless it is one. */
export function weekWordOf(data: Pick<ContentPageData, 'week'>): string {
  return weekWordsOf(data.week)
}

function Meta({ data }: { data: ContentPageData }) {
  const parts: React.ReactNode[] = []
  if (data.period === 'week' && data.week) {
    parts.push(<span key="w">{data.week.label}</span>)
    if (data.market.week != null) {
      parts.push(
        <span key="m">
          <Fig>{fmtInt(data.market.week)}</Fig> videos in your market with a comment{data.week.isWeek ? ' this week' : ''}
          {data.market.month != null ? <>, <Fig>{fmtInt(data.market.month)}</Fig> {monthWords(data.month)}</> : null}
        </span>,
      )
    }
  } else {
    parts.push(<span key="w">{data.month.complete ? longMonth(data.month.month) : `${longMonth(data.month.month)} so far`}</span>)
    if (data.market.month != null) parts.push(<span key="m"><Fig>{fmtInt(data.market.month)}</Fig> videos in your market with a comment</span>)
  }
  if (!data.posts.unread) {
    parts.push(<span key="p"><Fig>{fmtInt(data.posts.total)}</Fig> {data.posts.total === 1 ? 'post' : 'posts'} of your own published {monthWords(data.month)}</span>)
  }
  return <>{parts.map((p, i) => <span key={i}>{i > 0 ? ' · ' : null}{p}</span>)}</>
}

/** What works beside Worth a reply over Your posts: stacked on a phone and
 *  up to 1280, then 8 · 4 with the two in one column. */
export function ContentPage({ data }: { data: ContentPageData }) {
  const state: ContentState = { period: data.period, asked: data.asked.expanded }
  const weekWord = weekWordOf(data)
  const month = data.month
  return (
    <PageFrame>
      <PageBar title={surface('content').label} meta={<Meta data={data} />}>
        <PeriodSwitch
          value={data.period}
          options={CONTENT_PERIODS}
          hrefFor={(period) => contentHref({ ...state, period })}
        />
      </PageBar>

      <IdeasSection block={data.ideas} month={month} ctx={questionSlotsContext(data)} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <WorksCard block={data.works} className="xl:col-span-8" />
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-4">
          <RepliesCard view={data.replies} state={state} />
          <PostsCard block={data.posts} />
        </div>
      </div>

      <AskedCard block={data.asked} state={state} month={month} weekWord={weekWord} weekHead={data.week && !data.week.isWeek ? data.week.label : 'This week'} afterIdeas={data.ideas.cards.length + data.ideas.questions.length > 0} />
    </PageFrame>
  )
}
