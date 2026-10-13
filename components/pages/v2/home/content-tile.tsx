import { NAV_ICON } from '@/components/nav-icons'
import { OwnTouchLine } from '@/components/pages/v2/content/ideas'
import { RecipeChip } from '@/components/pages/v2/content/parts'
import { fmtInt } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import { IDEAS_EMPTY, POST_IDEA_SLOT, type TopContent } from '@/lib/pages/v2/content'
import type { TileRead } from '@/lib/pages/v2/home'
import { cn } from '@/lib/utils'
import { MID, MONO_MUTED, TILE, TILE_FAILED, TileHead, TileLine, TT } from './parts'

// THE DASHBOARD'S CONTENT TILE (Design v2, T8; E1-Dashboard's second row),
// from `topContent`: the week's first post idea, which opens its brief in
// place on Content (`?idea=<rank>`), with how many of the week's market videos
// it came up in and the month beside it (decision 1), the format and opening
// code chose, and whether your posts touched on it; or why there is no idea
// (not switched on, none written, too old). In a medical market the medical
// team line prints under the idea, always (T13's done-when).
//
// The board's "12 comments are waiting for a reply" is not printed: nothing
// can see whether you replied (decision 5), so Content lists the comments
// worth an answer instead, one click down.

export function ContentTileView({ read }: { read: TileRead<TopContent> }) {
  const top = read.state === 'ok' ? read.top : null
  const idea = top?.state === 'ready' ? top.idea : null
  return (
    <article aria-labelledby="home-content" data-tile="content" data-state={top?.state ?? 'failed'} className={cn(TILE, 'col-span-12 min-[1180px]:col-span-4')}>
      <TileHead icon={NAV_ICON.content} name="Content" id="home-content" href={top?.href ?? '/dashboard/content'} />
      {!top ? <TileLine>{TILE_FAILED}</TileLine> : !idea ? <TileLine>{top.line ?? IDEAS_EMPTY.none}</TileLine> : (
        <>
          {top.line ? <TileLine className="text-[13px]">{top.line}</TileLine> : null}
          <h3 className={TT}>
            Post next: <span data-copy="stored" data-slot={POST_IDEA_SLOT}>{idea.title}</span>
          </h3>
          {idea.week ? (
            <div data-copy="level" className="flex flex-wrap items-baseline gap-x-2.5">
              <span className={MID}>{fmtInt(idea.week.k)}</span>
              <span className={MONO_MUTED}>of {fmtInt(idea.week.n)} videos this week</span>
            </div>
          ) : null}
          {/* The week beside its month (decision 1); the month alone where the
              week was not read. */}
          {idea.month ? (
            <p data-copy="level" className={cn(MONO_MUTED, 'm-0', idea.week ? '-mt-2 max-sm:-mt-1' : 'text-[14px] text-foreground')}>
              {fmtInt(idea.month.k)} of {fmtInt(idea.month.n)} {idea.monthWords}
            </p>
          ) : null}
          {idea.format || idea.opening ? (
            <div className="flex flex-wrap gap-2 max-sm:hidden">
              {idea.format ? <RecipeChip recipe={idea.format} /> : null}
              {idea.opening ? <RecipeChip recipe={idea.opening} /> : null}
            </div>
          ) : null}
          <p className="m-0 text-[13px] leading-[1.4]"><OwnTouchLine own={idea.own} /></p>
          {idea.medical ? <p className="m-0 text-[12px] leading-[1.4] text-muted-foreground">{MEDICAL_LINE}</p> : null}
        </>
      )}
    </article>
  )
}
