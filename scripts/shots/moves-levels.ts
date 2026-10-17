// YOUR MOVES' LEVEL PAGES IN scripts/pages-shots.ts (levels as pages, 17 Oct;
// the G6 boards, shot with `--artboards ~/Documents/Heinrich/Verbatim-Design/
// depth-2026-10/canvas/project`): the root, a piece of advice (the hub, its
// switcher open, the thin real Össur state as a member, a move made on it,
// every read failed, an id it does not hold), a dated move (the evidence, its
// switcher open, a subject whose check is open, the thin real move as a
// member) and the advice record (as the board, every piece, a quiet one).
// At `--width 390` the same keys stand beside the -Phone boards by eye.
//
// A loader dump (`MOVES_LEVELS_JSON=<file>`, written by
// scripts/moves-v2-dump.ts `--view advice:<id>|move:<id>|record`) is drawn by
// its own page (`moves-levels-real`).

import { readFileSync } from 'fs'
import { createElement as h, type ReactNode } from 'react'

import { MovesV2Page } from '../../components/pages/v2/moves'
import { MovesAdvicePage, MovesMissing, MovesMovePage, MovesRecordPage } from '../../components/pages/v2/moves/levels'
import { movesFixture } from '../../lib/pages/v2/moves-fixture'
import {
  adviceFailedFixture, adviceFixture, adviceThinFixture, adviceWithMoveFixture, moveFixture, moveHeldFixture, moveThinFixture, recordFixture, recordQuietFixture,
} from '../../lib/pages/v2/moves-levels-fixture'
import { ADVICE_MISSING, MOVE_MISSING, type MovePageData, type RecordPageData } from '../../lib/pages/v2/moves-levels'
import type { AdvicePageData } from '../../lib/pages/v2/moves-levels-load'

/** pages-shots.ts's `Page`, restated so this module stands alone. */
interface ShotPage { key: string; path: string; artboard: string; page: () => ReactNode; fixed?: boolean }

const ADVICE = '/dashboard/moves/advice/a1000000-0000-4000-8000-000000000001'
const MOVE = '/dashboard/moves/m-clinic'
const RECORD = '/dashboard/moves/advice'

/** A dump from scripts/moves-v2-dump.ts `--view`: `{ view, data }`. */
function dumpPage(): ReactNode {
  const raw = JSON.parse(readFileSync(process.env.MOVES_LEVELS_JSON as string, 'utf8')) as { view: string; data: unknown }
  if (raw.data === 'missing') return h(MovesMissing, { line: raw.view === 'move' ? MOVE_MISSING : ADVICE_MISSING })
  if (raw.view === 'record') return h(MovesRecordPage, { page: raw.data as RecordPageData })
  if (raw.view === 'move') return h(MovesMovePage, { page: raw.data as MovePageData })
  return h(MovesAdvicePage, { page: raw.data as AdvicePageData })
}

function dumpArtboard(): string {
  try {
    const view = (JSON.parse(readFileSync(process.env.MOVES_LEVELS_JSON as string, 'utf8')) as { view: string }).view
    return view === 'record' ? 'G6-Moves-Record.dc.html' : view === 'move' ? 'G6-Moves-Move.dc.html' : 'G6-Moves-Advice-Thin.dc.html'
  } catch {
    return 'G6-Moves-Advice.dc.html'
  }
}

export const MOVES_LEVEL_PAGES: ShotPage[] = [
  // The root as a tenant sees it (statements held: the plan takes the row).
  { key: 'moves-levels-root', path: '/dashboard/moves', artboard: 'G6-Moves.dc.html', page: () => h(MovesV2Page, { data: movesFixture(), statements: null }) },
  // A piece of advice, the hub.
  { key: 'moves-levels-advice', path: ADVICE, artboard: 'G6-Moves-Advice.dc.html', page: () => h(MovesAdvicePage, { page: adviceFixture() }) },
  { key: 'moves-levels-advice-switcher', path: ADVICE, artboard: 'G6-Moves-Advice-Switcher.dc.html', page: () => h(MovesAdvicePage, { page: adviceFixture(), switcherOpen: true }) },
  { key: 'moves-levels-advice-thin', path: ADVICE, artboard: 'G6-Moves-Advice-Thin.dc.html', page: () => h(MovesAdvicePage, { page: adviceThinFixture() }) },
  { key: 'moves-levels-advice-thin-switcher', path: ADVICE, artboard: 'G6-Moves-Advice-Switcher.dc.html', page: () => h(MovesAdvicePage, { page: adviceThinFixture(), switcherOpen: true }) },
  { key: 'moves-levels-advice-move', path: ADVICE, artboard: 'G6-Moves-Advice.dc.html', page: () => h(MovesAdvicePage, { page: adviceWithMoveFixture() }) },
  { key: 'moves-levels-advice-failed', path: ADVICE, artboard: 'G6-Moves-Advice-Thin.dc.html', page: () => h(MovesAdvicePage, { page: adviceFailedFixture() }) },
  { key: 'moves-levels-advice-missing', path: ADVICE, artboard: 'G6-Moves-Advice.dc.html', page: () => h(MovesMissing, { line: ADVICE_MISSING }) },
  // A dated move, the evidence.
  { key: 'moves-levels-move', path: MOVE, artboard: 'G6-Moves-Move.dc.html', page: () => h(MovesMovePage, { page: moveFixture() }) },
  { key: 'moves-levels-move-switcher', path: MOVE, artboard: 'G6-Moves-Move.dc.html', page: () => h(MovesMovePage, { page: moveFixture(), switcherOpen: true }) },
  { key: 'moves-levels-move-held', path: MOVE, artboard: 'G6-Moves-Move.dc.html', page: () => h(MovesMovePage, { page: moveHeldFixture() }) },
  { key: 'moves-levels-move-thin', path: MOVE, artboard: 'G6-Moves-Move.dc.html', page: () => h(MovesMovePage, { page: moveThinFixture() }) },
  // The advice record, the index.
  { key: 'moves-levels-record', path: RECORD, artboard: 'G6-Moves-Record.dc.html', page: () => h(MovesRecordPage, { page: recordFixture() }) },
  { key: 'moves-levels-record-all', path: RECORD, artboard: 'G6-Moves-Record.dc.html', page: () => h(MovesRecordPage, { page: recordFixture(true) }) },
  { key: 'moves-levels-record-quiet', path: RECORD, artboard: 'G6-Moves-Record.dc.html', page: () => h(MovesRecordPage, { page: recordQuietFixture() }) },
  ...(process.env.MOVES_LEVELS_JSON
    ? [{ key: 'moves-levels-real', path: '/dashboard/moves', artboard: dumpArtboard(), page: dumpPage }]
    : []),
]
