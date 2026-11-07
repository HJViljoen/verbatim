import type { CSSProperties, ReactNode } from 'react'
import { CARD, CardHead, GoLink } from '@/components/v2'
import { fmtInt, platformLabel } from '@/lib/format'
import { fmtMultiple, monthWords, postsHref, type PostsBlock } from '@/lib/pages/v2/content'
import { cn } from '@/lib/utils'
import { Fig, PlatformCounts } from './parts'

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
 *
 * Since the audit design (7 Nov, `Content.dc.html`): the count is the
 * figures row's ("Your posts in October: 9 published"), so the card is one
 * list, Where, Typical response and Best, each under its term.
 */

/** Your posts with a response figure: the block's count, or (a page dumped
 *  before it carried one) the rows that have a multiple. */
const ratedOf = (block: PostsBlock): number => block.rated ?? block.rows.filter((r) => r.multiple != null).length

/** One term of the list, ruled from the one above. */
function Item({ term, first = false, children }: { term: string; first?: boolean; children: ReactNode }) {
  return (
    <div className={first ? undefined : 'border-t border-track pt-3.5'}>
      <dt className="text-[13px] text-muted-foreground">{term}</dt>
      <dd className="m-0 mt-1">{children}</dd>
    </div>
  )
}

export function PostsCard({ block, className, style }: { block: PostsBlock; className?: string; style?: CSSProperties }) {
  const when = monthWords(block)
  const none = block.unread != null || block.total === 0
  return (
    <article aria-labelledby="posts-title" style={style} className={cn(CARD, className)}>
      <CardHead id="posts-title" title={`Your posts ${when}`} sub="Published on your own accounts" />
      {/* The board's shape in every state: the three terms and the link. A
          term that cannot be read says so in its place; the best post's
          place says why there is none. */}
      <dl className="m-0 flex flex-col gap-3.5 text-[14.5px] leading-[1.5]">
        <Item term="Where" first>
          {block.unread ? <span className="text-muted-foreground">Not read</span>
            : block.byPlatform.length > 0 ? <PlatformCounts rows={block.byPlatform} label={platformLabel} />
              : <span className="text-muted-foreground">Nowhere yet</span>}
        </Item>
        <Item term="Typical response">
          {none ? (
            <span className="text-muted-foreground">No response to state.</span>
          ) : block.response ? (
            <>
              <Fig className="text-[22px] font-bold leading-[1.3]">{fmtMultiple(block.response.multiple)}</Fig><br />
              your typical post against the market’s
              {block.response.rated < block.total ? <>, read from the <Fig>{fmtInt(block.response.rated)}</Fig> posts with a response figure</> : null}
            </>
          ) : (
            // Too few rated posts for a typical one: how many have a response
            // figure, of all of them (a level).
            <>
              <span data-copy="level">{fmtInt(ratedOf(block))} of {fmtInt(block.total)}</span>{' '}
              {block.marketTypical === false ? 'with a response figure; the market’s typical video could not be read to compare them' : 'with a response figure, too few to state a typical one'}
            </>
          )}
        </Item>
        <Item term={`Best ${when}`}>
          {block.best ? (
            <>
              <span className="font-semibold">
                {block.best.format ?? 'A post'}
                {block.best.multiple != null ? <>, <Fig>{fmtMultiple(block.best.multiple)}</Fig></> : null}
              </span><br />
              <span data-copy="quote" className="text-secondary-foreground">“{block.best.title ?? 'Untitled post'}”</span>
            </>
          ) : (
            <span className="text-muted-foreground">
              {block.unread ?? (block.total === 0
                ? `You published nothing of your own ${when}.`
                : block.marketTypical === false ? 'None to name: the market’s typical video could not be read.' : 'None to name without a response figure.')}
            </span>
          )}
        </Item>
      </dl>
      {none ? null : (
        <div className="mt-auto">
          <GoLink href={postsHref()}>All your posts</GoLink>
        </div>
      )}
    </article>
  )
}
