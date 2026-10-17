import type { CSSProperties } from 'react'
import { User } from 'lucide-react'
import { CARD, CardHead } from '@/components/v2'
import { fmtInt, longMonth, platformLabel } from '@/lib/format'
import { fmtMultiple, monthWords, postsHref, type PostsBlock } from '@/lib/pages/v2/content'
import { cn } from '@/lib/utils'
import { Fig, Lvl, OLink, PlatformCounts } from './parts'

/**
 * YOUR POSTS THIS MONTH (E5-Content's rail): the posts off your own accounts
 * this month (`ownedPosts`, `source = 'owned'`: never a creator's video that
 * names you), where they went, your typical post's response against a
 * typical market video, and the best one. "All your posts" opens their own
 * page (`/dashboard/content/posts`, depth as pages, 17 Oct).
 *
 * Response is read where the platform gave one: Reddit is left out (its rate
 * is capped), an Instagram photo has none, and the typical post needs three
 * rated posts before it is stated (`OWN_RESPONSE_MIN`); the card says how
 * many it was read from where that is fewer than all.
 */

const CELL = 'min-w-0 rounded-[10px] bg-inner px-3.5 py-3'

/** Your posts with a response figure: the block's count, or (a page dumped
 *  before it carried one) the rows that have a multiple. */
const ratedOf = (block: PostsBlock): number => block.rated ?? block.rows.filter((r) => r.multiple != null).length
const VALUE = 'font-mono text-[24px] leading-none font-medium tracking-[-0.02em] tabular-nums'

export function PostsCard({ block, className, style }: { block: PostsBlock; className?: string; style?: CSSProperties }) {
  const when = monthWords(block)
  return (
    <article aria-labelledby="posts-title" style={style} className={cn(CARD, className)}>
      <CardHead
        icon={User}
        id="posts-title"
        title={block.complete ? `Your posts in ${longMonth(block.month)}` : 'Your posts this month'}
        sub={`Published on your own accounts, ${when.replace(/^in /, '')}`}
      />
      {/* The board's shape in every state: the two cells, the best post's
          line and the link. A cell that cannot be read keeps its frame with a
          quiet dot; the best post's place says why there is none. */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className={CELL}>
          {block.unread ? (
            <div aria-hidden className={cn(VALUE, 'text-muted-foreground')}>·</div>
          ) : (
            <Fig className={cn(VALUE, 'block')}>{fmtInt(block.total)}</Fig>
          )}
          <div className="mt-1.5 text-[12.5px] leading-[1.4] text-muted-foreground">
            {block.total === 1 ? 'post' : 'posts'}{block.byPlatform.length > 0 ? <> · <PlatformCounts rows={block.byPlatform} label={platformLabel} /></> : null}
          </div>
        </div>
        <div className={CELL}>
          {block.unread || block.total === 0 ? (
            <>
              <div aria-hidden className={cn(VALUE, 'text-muted-foreground')}>·</div>
              <div className="mt-1.5 text-[12.5px] leading-[1.4] text-muted-foreground">response of your typical post against the market’s</div>
            </>
          ) : block.response ? (
            <>
              <Fig className={cn(VALUE, 'block')}>{fmtMultiple(block.response.multiple)}</Fig>
              <div className="mt-1.5 text-[12.5px] leading-[1.4] text-muted-foreground">
                response of your typical post against the market’s
                {block.response.rated < block.total ? <>, read from <Lvl>{fmtInt(block.response.rated)} of {fmtInt(block.total)}</Lvl> with a response figure</> : null}
              </div>
            </>
          ) : (
            // Too few rated posts for a typical one: the cell's figure is how
            // many have a response figure, of all of them (a level).
            <div data-copy="level">
              <div className={cn(VALUE, 'whitespace-nowrap')}>{fmtInt(ratedOf(block))} <span className="text-[15px] text-muted-foreground">of {fmtInt(block.total)}</span></div>
              <div className="mt-1.5 text-[12.5px] leading-[1.4] text-muted-foreground">
                {block.marketTypical === false ? 'with a response figure; the market’s typical video could not be read to compare them' : 'with a response figure, too few to state a typical one'}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="text-[13.5px] leading-[1.5]">
        <span className="text-muted-foreground">Best {block.complete ? `in ${longMonth(block.month)}` : 'this month'}</span><br />
        {block.best ? (
          <>
            <span data-copy="quote">“{block.best.title ?? 'Untitled post'}”</span>
            {block.best.format ? <>, {block.best.format.toLowerCase()}</> : null}
            {block.best.multiple != null ? <> <Fig>· {fmtMultiple(block.best.multiple)}</Fig></> : null}
          </>
        ) : (
          <span className="text-muted-foreground">
            {block.unread ?? (block.total === 0
              ? `You published nothing of your own ${when}.`
              : block.marketTypical === false ? 'None to name: the market’s typical video could not be read.' : 'None to name without a response figure.')}
          </span>
        )}
      </div>
      {block.unread || block.total === 0 ? null : (
        <div className="mt-auto">
          <OLink href={postsHref()}>All your posts →</OLink>
        </div>
      )}
    </article>
  )
}
