import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { PeriodSwitch, withMonthName, type StatItem } from '@/components/v2'
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
 * the also-asked table read, the month by its name) with its figures row,
 * the week's post ideas, What works beside Worth a reply and Your posts, then
 * Also asked (the audit design's `Content.dc.html`, 7 Nov). It keeps its own title and has no
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

const fig = (n: number) => <Fig>{fmtInt(n)}</Fig>
const NOT_READ = 'Not read yet'

/** The month as the switch and the figures row name it: "October so far",
 *  or "October" for a month the week has left. */
export const contentMonthText = (month: Pick<ContentPageData['month'], 'month' | 'complete'>): string =>
  month.complete ? longMonth(month.month) : `${longMonth(month.month)} so far`

/**
 * The figures row (the board's `.strip`; the audit design, 7 Nov): the
 * screen's bases said once, so the counts below may be bare (decision 2).
 * This week: the week, the market's videos this week, the month's (the
 * week's figures sit beside it, decision 1), and your posts in the month.
 * This month: the month, the market's, and your posts. Pure.
 */
export function contentStats(data: ContentPageData): StatItem[] {
  const month = contentMonthText(data.month)
  const posts: StatItem = {
    key: 'posts',
    term: `Your posts ${monthWords(data.month)}`,
    value: data.posts.unread ? 'Could not be read just now' : <>{fig(data.posts.total)} published</>,
  }
  if (data.period === 'week' && data.week) {
    return [
      { key: 'week', term: data.week.isWeek ? 'Week' : 'Days', value: data.week.label },
      {
        key: 'market',
        term: data.week.isWeek ? 'Your market this week' : 'Your market these days',
        value: data.market.week != null ? <>{fig(data.market.week)} videos with a comment</> : NOT_READ,
      },
      { key: 'month', term: month, value: data.market.month != null ? <>{fig(data.market.month)} videos</> : NOT_READ },
      posts,
    ]
  }
  return [
    { key: 'month', term: 'Month', value: month },
    { key: 'market', term: 'Your market', value: data.market.month != null ? <>{fig(data.market.month)} videos with a comment</> : NOT_READ },
    posts,
  ]
}

/** The ideas, then What works beside Worth a reply over Your posts (stacked
 *  on a phone and up to 1280, then 2fr / 1fr), then Also asked. */
export function ContentPage({ data }: { data: ContentPageData }) {
  const state: ContentState = { period: data.period, asked: data.asked.expanded }
  const weekWord = weekWordOf(data)
  const month = data.month
  return (
    <PageFrame>
      <PageBar title={surface('content').label} stats={contentStats(data)} phoneControls="below">
        <PeriodSwitch
          value={data.period}
          options={withMonthName(CONTENT_PERIODS, contentMonthText(month))}
          hrefFor={(period) => contentHref({ ...state, period })}
        />
      </PageBar>

      <IdeasSection block={data.ideas} month={month} ctx={questionSlotsContext(data)} />

      <div className="mt-[26px] grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <WorksCard block={data.works} />
        <div className="flex min-w-0 flex-col gap-5">
          <RepliesCard view={data.replies} state={state} />
          <PostsCard block={data.posts} />
        </div>
      </div>

      <div className="mt-[26px]">
        <AskedCard block={data.asked} state={state} month={month} weekWord={weekWord} weekHead={data.week && !data.week.isWeek ? data.week.label : 'This week'} afterIdeas={data.ideas.cards.length + data.ideas.questions.length > 0} />
      </div>
    </PageFrame>
  )
}
