import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { equalColumns, panelItemOrder, panelPlacement, PanelSlot, PeriodSwitch, type PanelLayout } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { CONTENT_PERIODS, contentHref, daysPhrase, monthWords, type ContentPageData, type ContentState } from '@/lib/pages/v2/content'
import { surface } from '@/lib/nav'
import { AskedCard } from './asked'
import { IdeaPanelView } from './idea-panel'
import { IdeasSection } from './ideas'
import { Fig } from './parts'
import { PostsCard, PostsPanel } from './posts'
import { RepliesCard, RepliesPanel } from './replies'
import { WorksCard } from './works'

/**
 * CONTENT (depth v2, T6; boards E5-Content and E5-Content-Open).
 *
 * The page bar (its period switch: which days the reply list and the also-
 * asked table read), the week's post ideas with the one opened in place
 * under them, What works beside Worth a reply and Your posts (their panels
 * open full width under that row), then Also asked. Server-rendered; every
 * selection is a URL param (lib/pages/v2/content.ts `contentHref`).
 */

/** "this week" for a seven-day window, else its days ("between 28 Sep and 4
 *  Oct"): a window is not called a week unless it is one. */
export function weekWordOf(data: Pick<ContentPageData, 'week'>): string {
  const w = data.week
  if (!w) return 'this week'
  return w.isWeek ? 'this week' : daysPhrase(w.first, w.last)
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
 *  up to 1280, then 8 · 4 with the two in one column (a width of 0 stacks a
 *  card in the cell before it). Their panels sit under the card on a phone and
 *  under the pair from 1280, at the column. */
export const LOWER_LAYOUT: PanelLayout = { base: equalColumns(1, 3), xl: { spans: [8, 4, 0], of: 12 } }

export function ContentPage({ data }: { data: ContentPageData }) {
  const state: ContentState = { period: data.period, open: data.open, asked: data.asked.expanded }
  const weekWord = weekWordOf(data)
  const month = data.month
  const lowerAt = data.open?.kind === 'replies' ? 1 : data.open?.kind === 'posts' ? 2 : -1
  const lower = lowerAt >= 0 ? panelPlacement(lowerAt, LOWER_LAYOUT) : null
  const ideaPanel = data.ideaPanel
  return (
    <PageFrame>
      <PageBar title={surface('content').label} meta={<Meta data={data} />}>
        <PeriodSwitch
          value={data.period}
          options={CONTENT_PERIODS}
          hrefFor={(period) => contentHref({ ...state, period, open: null })}
        />
      </PageBar>

      <IdeasSection
        block={data.ideas}
        state={state}
        month={month}
        weekWord={weekWord}
        panel={ideaPanel
          ? (notchAt) => <IdeaPanelView panel={ideaPanel} state={state} count={data.ideas.cards.length} month={month} weekWord={weekWord} notchAt={notchAt} />
          : undefined}
      />

      {/* One grid at every width: on a phone (and up to 1280) the right-hand
          column dissolves (`contents`) so Worth a reply and Your posts are
          the grid's own cards and the open one's panel lands between them.
          Every order is the kit's (`panelItemOrder`, the cards' in
          LOWER_LAYOUT's order): the column's own is read only from 1280,
          where it is a grid item, and is inert while it is `contents`. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <WorksCard block={data.works} className="xl:col-span-8" style={panelItemOrder(0)} />
        <div className="contents xl:col-span-4 xl:flex xl:min-w-0 xl:flex-col xl:gap-5" style={panelItemOrder(1)}>
          <RepliesCard view={data.replies} state={state} selected={data.open?.kind === 'replies'} style={panelItemOrder(1)} />
          <PostsCard block={data.posts} state={state} selected={data.open?.kind === 'posts'} style={panelItemOrder(2)} />
        </div>
        {lower ? (
          <PanelSlot placement={lower}>
            {data.open?.kind === 'replies'
              ? <RepliesPanel view={data.replies} state={state} notchAt={lower.notch} />
              : <PostsPanel block={data.posts} state={state} notchAt={lower.notch} />}
          </PanelSlot>
        ) : null}
      </div>

      <AskedCard block={data.asked} state={state} month={month} weekWord={weekWord} weekHead={data.week && !data.week.isWeek ? data.week.label : 'This week'} afterIdeas={data.ideas.cards.length > 0} />
    </PageFrame>
  )
}
