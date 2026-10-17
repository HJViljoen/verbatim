import Link from 'next/link'

import { LevelBar } from '@/components/shell/level-bar'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { OLINK } from '@/components/pages/v2/market/parts'
import { MOVES_PATH, PAGE_TITLE } from '@/lib/pages/v2/moves'
import type { AdvicePageData } from '@/lib/pages/v2/moves-levels-load'
import { ADVICE_LEVEL, BACK_TO_MOVES, RECORD_LEVEL, RECORD_TITLE, moveReadWords, type MovePageData, type RecordPageData } from '@/lib/pages/v2/moves-levels'
import { AdviceDecision } from './advice-actions'
import { AdvicePageBody, AdviceTitle, adviceMeta } from './advice-page'
import { MOVES_FIRST_RUN } from './index'
import { MovesLevelTile } from './level-tiles'
import { MoveStatusControl } from './move-status'
import { MovePageBody, moveMeta } from './move-page'
import { MoveStatusChip, OnLabel } from './moves'
import { RecordPageBody, recordMeta } from './record-page'

// YOUR MOVES' LEVEL PAGES (levels as pages, 17 Oct; the G6 boards): a piece
// of advice (the hub), a dated move (the evidence) and the advice record (the
// index), each its own address under Your moves (lib/pages/v2/moves-address.ts).
// Your moves stays the sidebar's active surface on every one.
//
// EACH OPENS WITH THE PATH, THEN THE PAGE NAMING ITS LEVEL (Market's
// `LevelBar`, F3): the slim crumb row ("Your moves / {page} ⌃⌄") and the
// title block, its tile Your moves' own (a signpost on yellow, a flag or a
// check-list on the neutral). The advice's two decision controls sit at the
// block's right-hand end, where Market keeps its period switch, for an owner
// or an admin only (decision 3); a move's status chip and its Mark done and
// Stop it sit there too, the controls again only for an owner or an admin.

/** An address that names nothing this tenant holds: one calm line inside the
 *  page, and the way back. Never a 404. */
export function MovesMissing({ line }: { line: string }) {
  return (
    <PageFrame className="text-foreground">
      <PageBar title={PAGE_TITLE} />
      <div className="flex flex-col gap-2">
        <p data-moves-missing="" className="m-0 text-[15px] text-muted-foreground">{line}</p>
        <Link href={MOVES_PATH} className={OLINK}>{BACK_TO_MOVES} →</Link>
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
        tile={<MovesLevelTile level="advice" />}
        label={ADVICE_LEVEL}
        title={<AdviceTitle card={card} />}
        meta={adviceMeta(page)}
        controls={decide ? <AdviceDecision lineageId={card.lineageId} recommendationId={card.recommendationId} title={card.title} dating={page.dating} /> : null}
        open={switcherOpen ? 'current' : undefined}
      />
      <AdvicePageBody page={page} />
    </PageFrame>
  )
}

/** A dated move's page (`/dashboard/moves/[id]`). The level label names what
 *  it is on and links to it in Market (decision 4); the crumb already links
 *  up. */
export function MovesMovePage({ page, switcherOpen = false }: { page: MovePageData; switcherOpen?: boolean }) {
  const { card } = page
  const label = card.label
    ? <>Move on {card.onHref ? <Link href={card.onHref} className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-[3px] hover:text-foreground"><OnLabel card={card} /></Link> : <OnLabel card={card} />}</>
    : 'Move'
  return (
    <PageFrame className="text-foreground">
      <LevelBar
        crumbs={page.crumbs}
        level="move"
        tile={<MovesLevelTile level="move" />}
        label={label}
        title={<span data-copy="quote">{card.title}</span>}
        meta={moveMeta(page, moveReadWords(card, page.monthLabel, page.month))}
        controls={(
          <div data-move-controls="" className="flex flex-wrap items-center gap-3.5">
            <MoveStatusChip status={card.status} className="bg-transparent px-0" />
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
 *  no siblings. */
export function MovesRecordPage({ page }: { page: RecordPageData }) {
  return (
    <PageFrame className="text-foreground">
      <LevelBar
        crumbs={page.crumbs}
        level="record"
        tile={<MovesLevelTile level="record" />}
        label={RECORD_LEVEL}
        title={RECORD_TITLE}
        meta={recordMeta(page)}
      />
      <RecordPageBody page={page} />
    </PageFrame>
  )
}
