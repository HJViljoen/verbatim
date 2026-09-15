import type { Block, BlockContext } from '@/lib/blocks/types'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { PageFrame, PageGrid } from '@/components/shell/page-grid'
import { SurfacePageBar } from '@/components/shell/page-bar'
import { Tile, TileEmpty } from '@/components/shell/tile'
import type { SubjectsData } from '@/lib/pages/subjects'
import { subjectsList } from './list'
import { subjectsSubject } from './subject'
import { subjectsLine } from './line'
import { subjectsKinds } from './kinds'
import { subjectsVoices } from './voices'
import { subjectsUnanswered } from './unanswered'

// Subjects — the page (Phase 1 WP12, design §3 SU1–SU3, the mock's
// Subjects.dc.html).
//
// A RAIL AND A COLUMN, as the mock draws it: the subjects on the left, the
// selected one in full on the right. The selection is in the URL (`?item=`),
// which is how OV2's rows link here and how a reader can send a colleague the
// subject rather than the page.

export const SUBJECT_BLOCKS: readonly Block<SubjectsData>[] = [
  subjectsList,
  subjectsSubject,
  subjectsLine,
  subjectsKinds,
  subjectsVoices,
  subjectsUnanswered,
]

/** Column span and row height per block, in the grid's 12 columns and 116px
 *  row units. The rail is narrow and tall; the reading fills the rest. */
const LAYOUT: Record<string, { col: number; row: number }> = {
  'subjects.list': { col: 3, row: 5 },
  'subjects.subject': { col: 9, row: 2 },
  'subjects.line': { col: 9, row: 3 },
  'subjects.kinds': { col: 6, row: 4 },
  'subjects.voices': { col: 6, row: 4 },
  'subjects.unanswered': { col: 12, row: 2 },
}

/** The app's context: RELATIVE links, so `next/link` navigates on the client
 *  instead of reloading the application to reach its own next page. */
export function subjectsContext(params: Record<string, string | undefined> = {}): BlockContext {
  return blockContext('', EMAIL, params)
}

export function SubjectsPage({
  data,
  params = {},
}: {
  data: SubjectsData | null
  params?: Record<string, string | undefined>
}) {
  if (!data) {
    return (
      <PageFrame>
        <SurfacePageBar nav="subjects" params={params} />
        <PageGrid>
          <Tile col={12} row={2}>
            <TileEmpty>
              Nothing has been read for this workspace yet. Your subjects start being counted with the first update
              after you confirm them.
            </TileEmpty>
          </Tile>
        </PageGrid>
      </PageFrame>
    )
  }

  const ctx = subjectsContext(params)
  return (
    <PageFrame>
      <SurfacePageBar
        nav="subjects"
        params={params}
        context={{ brand: data.brand, month: data.month, status: data.monthStatus, readingAt: data.readingAt }}
        record={{ line: data.record.line, lines: data.record.lines }}
      />
      <PageGrid>
        {SUBJECT_BLOCKS.map((block) => {
          const at = LAYOUT[block.key] ?? { col: 12, row: 2 }
          return (
            <Tile key={block.key} col={at.col} row={at.row}>
              {block.render(data, 'app', ctx)}
            </Tile>
          )
        })}
      </PageGrid>
      {data.notes.length > 0 ? (
        <p className="m-0 text-[11px] text-muted-foreground">
          {/* ONE CAVEAT FOR A RUN OF MONTHS, never one per bar: the reading
              layer merges the series' notes by the union of their months
              (lib/reading/series.ts mergeSeriesNotes). */}
          {data.notes.map((n) => n.text).join(' ')}
        </p>
      ) : null}
    </PageFrame>
  )
}
