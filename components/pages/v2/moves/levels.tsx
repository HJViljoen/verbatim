import { LevelBar } from '@/components/shell/level-bar'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { GoLink } from '@/components/v2'
import { MOVES_PATH, PAGE_TITLE } from '@/lib/pages/v2/moves'
import type { AdvicePageData } from '@/lib/pages/v2/moves-levels-load'
import { BACK_TO_MOVES, RECORD_LEVEL, RECORD_TITLE, type MovePageData, type RecordPageData } from '@/lib/pages/v2/moves-levels'
import { AdviceDecision } from './advice-actions'
import { AdvicePageBody, AdviceTags, AdviceTitle, adviceStats } from './advice-page'
import { MOVES_FIRST_RUN } from './index'
import { MoveStatusControl } from './move-status'
import { MovePageBody, moveStats } from './move-page'
import { MoveStatusChip } from './moves'
import { RecordPageBody, recordStats } from './record-page'

// YOUR MOVES' LEVEL PAGES (levels as pages, 17 Oct; the G6 boards): a piece
// of advice (the hub), a dated move (the evidence) and the advice record (the
// index), each its own address under Your moves (lib/pages/v2/moves-address.ts).
// Your moves stays the sidebar's active surface on every one.
//
// EACH OPENS WITH THE PATH, THEN ITS TITLE BLOCK (Market's `LevelBar`, F3;
// since the audit design, 7 Nov, no tile and no label: the title, its tags
// or its line under it, and the figures row). The advice's two decision
// controls sit at the block's right-hand end, for an owner or an admin only
// (decision 3); a move's status tag and its Mark done and Stop it sit there
// too, the controls again only for an owner or an admin.

/** An address that names nothing this tenant holds: one calm line inside the
 *  page, and the way back. Never a 404. */
export function MovesMissing({ line }: { line: string }) {
  return (
    <PageFrame className="text-foreground">
      <PageBar title={PAGE_TITLE} />
      <div className="flex flex-col items-start gap-2">
        <p data-moves-missing="" className="m-0 text-[15px] text-muted-foreground">{line}</p>
        <GoLink href={MOVES_PATH}>{BACK_TO_MOVES}</GoLink>
      </div>
    </PageFrame>
  )
}

/** Before the first update: the root's own line. */
export function MovesFirstRun() {
  return (
    <PageFrame className="text-foreground">
      <PageBar title={PAGE_TITLE} />
      <p className="m-0 text-[15px] text-muted-foreground">{MOVES_FIRST_RUN}</p>
    </PageFrame>
  )
}

/** A piece of advice's page (`/dashboard/moves/advice/[id]`). */
export function MovesAdvicePage({ page, switcherOpen = false }: { page: AdvicePageData; switcherOpen?: boolean }) {
  const { card } = page
  const decide = page.canDecide && card.status === 'new'
  return (
    <PageFrame className="text-foreground">
      <LevelBar
        crumbs={page.crumbs}
        level="advice"
        title={<AdviceTitle card={{ ...card, title: page.heading ?? card.title }} />}
        tags={<AdviceTags page={page} />}
        stats={adviceStats(page)}
        controls={decide ? <AdviceDecision lineageId={card.lineageId} recommendationId={card.recommendationId} title={card.title} dating={page.dating} /> : null}
        open={switcherOpen ? 'current' : undefined}
      />
      <AdvicePageBody page={page} />
    </PageFrame>
  )
}

/** A dated move's page (`/dashboard/moves/[id]`). The figures row names
 *  what it is on and links to it in Market (decision 4); the crumb already
 *  links up. */
export function MovesMovePage({ page, switcherOpen = false }: { page: MovePageData; switcherOpen?: boolean }) {
  const { card } = page
  return (
    <PageFrame className="text-foreground">
      <LevelBar
        crumbs={page.crumbs}
        level="move"
        title={<span data-copy="quote">{card.title}</span>}
        stats={moveStats(page)}
        controls={(
          <div data-move-controls="" className="flex flex-wrap items-center gap-2.5">
            <MoveStatusChip status={card.status} />
            {page.canDecide ? <MoveStatusControl id={card.id} status={card.status} /> : null}
          </div>
        )}
        open={switcherOpen ? 'current' : undefined}
      />
      <MovePageBody page={page} />
    </PageFrame>
  )
}

/** The advice record's page (`/dashboard/moves/advice`): no chevron, it has
 *  no siblings. The audit design's title block: the title, its line under
 *  it, the figures row. */
export function MovesRecordPage({ page }: { page: RecordPageData }) {
  return (
    <PageFrame className="text-foreground">
      <LevelBar
        crumbs={page.crumbs}
        level="record"
        title={RECORD_TITLE}
        sub={RECORD_LEVEL}
        stats={recordStats(page)}
      />
      <RecordPageBody page={page} />
    </PageFrame>
  )
}
