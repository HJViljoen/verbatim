import type { ReactNode } from 'react'
import { ViewerEscape } from '@/components/reports/report-viewer-close'
import { LevelBar } from '@/components/shell/level-bar'
import { PageFrame } from '@/components/shell/page-grid'
import { GoLink, type StatItem } from '@/components/v2'
import { GO } from '@/components/v2/look'
import { isWeeklyReadData, type WeeklyReadSnapshotData } from '@/lib/reports/weekly-read-build'
import { WEEKLY_READ_TITLE } from '@/lib/reports/weekly-read'
import { weeklyV3View } from '@/lib/reports/weekly-read-v3'
import { chipOf } from '@/components/email/weekly-read-v3'
import type { ViewerSnapshot } from '@/lib/reports/viewer'
import { STUDIO_HREF } from '@/lib/studio-visibility'
import { isMonthlyBriefData, type StoredBriefData } from '@/lib/reports/briefs/types'
import { STUDIO_REPORTS, type StudioArtefact } from '@/lib/pages/studio'
import { appDay, appShort, fmtInt } from '@/lib/format'
import { monthLabel } from '@/lib/shell/bar'

// THE VIEWER'S FRAME (the audit design, 7 Nov, Studio-Weekly.dc.html and
// Studio-Brief.dc.html): the crumb "Studio / {it}", the h1, the links
// (Download PDF where there is one, Open in the Studio for the operator, Back
// to the Studio) and the figures row, over the body `ReportViewer` hands in.
// Kept apart from components/reports/report-viewer.tsx, which loads the
// briefs' wordmark face through next/font (only Next's compiler runs it), so
// the shot harness can draw the frame too.

/** The brief's definition in the Studio (its name and who it is for). */
const briefDef = (d: StoredBriefData) => STUDIO_REPORTS.find((r) => r.artefact === (`brief:${d.role}` as StudioArtefact)) ?? null

const pages = (n: number): string => `${fmtInt(n)} ${n === 1 ? 'page' : 'pages'}`

/** "766 videos in your market": the brief's own figure for its month's
 *  market, where its In short states one. */
function briefMarket(d: StoredBriefData): string | null {
  const f = d.inShort.figures.find((x) => /^videos (and [\d,]+ comments )?in your market\b/.test(x.label))
  return f ? `${f.value} videos in your market` : null
}

/** The weekly read's view, where its read is there to draw one. */
const weeklyView = (d: WeeklyReadSnapshotData) =>
  d.read ? weeklyV3View({ read: d.read, subjects: d.subjects, pages: d.pages, monthClose: d.monthClose, chipOf, full: true }) : null

/** "162 videos, 3,317 comments". */
const videosAndComments = (x: { videos: number; comments: number | null }): string =>
  `${fmtInt(x.videos)} ${x.videos === 1 ? 'video' : 'videos'}${x.comments != null ? `, ${fmtInt(x.comments)} ${x.comments === 1 ? 'comment' : 'comments'}` : ''}`

/**
 * The viewer's figures row (the boards' strip). A weekly read: its week, the
 * market's videos and comments this week and in its month, and when it was
 * read with its length. A monthly brief: who it is for, its month with the
 * market's videos it states, when it was written, its length. Any other
 * build: when it was built, its length. The figures are the snapshot's own
 * (decision 16): nothing is read for them. Pure.
 */
export function viewerStats(view: Pick<ViewerSnapshot, 'data' | 'builtAt' | 'pageCount'>): StatItem[] {
  const { data } = view
  if (isMonthlyBriefData(data)) {
    const market = briefMarket(data)
    return [
      { key: 'for', term: 'For', value: briefDef(data)?.forWho ?? data.role },
      ...(market ? [{ key: 'month', term: monthLabel(data.month), value: market }] : []),
      { key: 'written', term: 'Written', value: appDay(view.builtAt) },
      { key: 'length', term: 'Length', value: pages(view.pageCount) },
    ]
  }
  if (isWeeklyReadData(data)) {
    const v = weeklyView(data)
    const n = v?.numbers ?? null
    return [
      { key: 'week', term: 'Week', value: v?.dates || data.period },
      ...(n ? [
        { key: 'this-week', term: 'This week', value: videosAndComments(n.week) },
        { key: 'month', term: v!.monthGroup, value: videosAndComments(n.month) },
      ] : []),
      { key: 'read', term: 'Read', value: `${appDay(data.readingAt || view.builtAt)}, ${pages(view.pageCount)}` },
    ]
  }
  return [
    { key: 'built', term: 'Built', value: appDay(view.builtAt) },
    { key: 'length', term: 'Length', value: pages(view.pageCount) },
  ]
}

/** The crumb, the h1 and the line under it: "Studio / The weekly, 1 Nov"
 *  over "This week in your market"; "Studio / Monthly briefs" over "Sales
 *  brief" with "Össur, October 2026"; any other build its own title. Pure. */
export function viewerHead(view: Pick<ViewerSnapshot, 'data' | 'title' | 'builtAt'>): { crumb: string; title: string; sub: string | null } {
  const { data } = view
  if (isMonthlyBriefData(data)) {
    return { crumb: 'Monthly briefs', title: briefDef(data)?.name ?? data.title, sub: `${data.company}, ${monthLabel(data.month)}` }
  }
  if (isWeeklyReadData(data)) {
    return { crumb: `The weekly, ${appShort(data.readingAt || view.builtAt)}`, title: WEEKLY_READ_TITLE, sub: null }
  }
  return { crumb: view.title, title: view.title, sub: null }
}

/** The viewer's page: its title block over the body, Esc going back. */
export function ViewerFrame({ snapshot, closeHref, showStudio = false, children }: {
  snapshot: ViewerSnapshot
  closeHref: string
  showStudio?: boolean
  children: ReactNode
}) {
  const pdf = snapshot.pdfHref ?? (snapshot.artifactId ? `/api/artifacts/${snapshot.artifactId}` : null)
  const head = viewerHead(snapshot)
  return (
    <PageFrame>
      <LevelBar
        crumbs={[{ label: 'Studio', href: closeHref }, { label: head.crumb, href: null }]}
        level="report"
        title={head.title}
        sub={head.sub ?? undefined}
        controls={
          <div data-viewer-links="" className="flex flex-wrap items-center gap-x-[22px] gap-y-2">
            {/* A plain link: a Next Link would prefetch the PDF route. */}
            {pdf ? <a href={pdf} className={GO}>Download PDF</a> : null}
            {showStudio && snapshot.reportId ? <GoLink href={`${STUDIO_HREF}?item=${snapshot.reportId}`}>Open in the Studio</GoLink> : null}
            <GoLink href={closeHref}>Back to the Studio</GoLink>
          </div>
        }
        stats={viewerStats(snapshot)}
      />
      <div data-viewer-body="" className="min-w-0">{children}</div>
      <ViewerEscape closeHref={closeHref} />
    </PageFrame>
  )
}
