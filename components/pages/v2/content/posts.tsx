import { User } from 'lucide-react'
import { CARD, CardHead, InPlacePanel, PanelTitle, SELECTED_CARD_RING } from '@/components/v2'
import { fmtInt, longMonth, platformLabel, shortDate } from '@/lib/format'
import { POSTS_PANEL_ID, contentHref, fmtMultiple, monthWords, type ContentState, type PostsBlock } from '@/lib/pages/v2/content'
import { cn } from '@/lib/utils'
import { Fig, Lvl, OLink, PlatformCounts } from './parts'

/**
 * YOUR POSTS THIS MONTH (E5-Content's rail): the posts off your own accounts
 * this month (`ownedPosts`, `source = 'owned'`: never a creator's video that
 * names you), where they went, your typical post's response against a
 * typical market video, and the best one. "All your posts" opens the list in
 * place (`?posts=1`).
 *
 * Response is read where the platform gave one: Reddit is left out (its rate
 * is capped), an Instagram photo has none, and the typical post needs three
 * rated posts before it is stated (`OWN_RESPONSE_MIN`); the card says how
 * many it was read from where that is fewer than all.
 */

const CELL = 'min-w-0 rounded-[10px] bg-inner px-3.5 py-3'
const VALUE = 'font-mono text-[24px] leading-none font-medium tracking-[-0.02em] tabular-nums'

export function PostsCard({ block, state, selected, className }: { block: PostsBlock; state: ContentState; selected: boolean; className?: string }) {
  const when = monthWords(block)
  return (
    <article aria-labelledby="posts-title" className={cn(CARD, selected ? SELECTED_CARD_RING : null, className)}>
      <CardHead
        icon={User}
        id="posts-title"
        title={block.complete ? `Your posts in ${longMonth(block.month)}` : 'Your posts this month'}
        sub={`Published on your own accounts, ${when.replace(/^in /, '')}`}
      />
      {block.unread ? (
        <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">{block.unread}</p>
      ) : block.total === 0 ? (
        <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground">You published nothing of your own {when}.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <div className={CELL}>
              <Fig className={cn(VALUE, 'block')}>{fmtInt(block.total)}</Fig>
              <div className="mt-1.5 text-[12.5px] leading-[1.4] text-muted-foreground">
                {block.total === 1 ? 'post' : 'posts'} · <PlatformCounts rows={block.byPlatform} label={platformLabel} />
              </div>
            </div>
            <div className={CELL}>
              {block.response ? (
                <>
                  <Fig className={cn(VALUE, 'block')}>{fmtMultiple(block.response.multiple)}</Fig>
                  <div className="mt-1.5 text-[12.5px] leading-[1.4] text-muted-foreground">
                    response of your typical post against the market’s
                    {block.response.rated < block.total ? <>, read from <Lvl>{fmtInt(block.response.rated)} of {fmtInt(block.total)}</Lvl> with a response figure</> : null}
                  </div>
                </>
              ) : (
                <div className="text-[12.5px] leading-[1.4] text-muted-foreground">Too few of your posts have a response figure to state a typical one</div>
              )}
            </div>
          </div>
          {block.best ? (
            <div className="text-[13.5px] leading-[1.5]">
              <span className="text-muted-foreground">Best {block.complete ? `in ${longMonth(block.month)}` : 'this month'}</span><br />
              <span data-copy="quote">“{block.best.title ?? 'Untitled post'}”</span>
              {block.best.format ? <>, {block.best.format.toLowerCase()}</> : null}
              {block.best.multiple != null ? <> <Fig>· {fmtMultiple(block.best.multiple)}</Fig></> : null}
            </div>
          ) : null}
          <div className="mt-auto">
            {selected ? (
              <OLink href={contentHref({ ...state, open: null })} scroll={false} aria-expanded aria-controls={POSTS_PANEL_ID}>Close ↑</OLink>
            ) : (
              <OLink href={contentHref({ ...state, open: { kind: 'posts' } })} aria-expanded={false} aria-controls={POSTS_PANEL_ID}>All your posts →</OLink>
            )}
          </div>
        </>
      )}
    </article>
  )
}

export function PostsPanel({ block, state }: { block: PostsBlock; state: ContentState }) {
  const when = monthWords(block)
  return (
    <InPlacePanel
      id={POSTS_PANEL_ID}
      notchAt={0.83}
      closeHref={contentHref({ ...state, open: null })}
      closeLabel="Close your posts"
      labelledBy="posts-panel-title"
      head={<PanelTitle id="posts-panel-title">Your posts {when}</PanelTitle>}
    >
      {block.rows.length === 0 ? (
        <p className="m-0 text-[14px] text-muted-foreground">You published nothing of your own {when}.</p>
      ) : (
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-border text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <th scope="col" className="pr-3 pb-2.5 font-semibold whitespace-nowrap">Posted</th>
              <th scope="col" className="pr-3 pb-2.5 font-semibold">Post</th>
              <th scope="col" className="hidden pr-3 pb-2.5 font-semibold md:table-cell">Made as</th>
              <th scope="col" className="hidden pr-3 pb-2.5 font-semibold lg:table-cell">Opens with</th>
              <th scope="col" className="pb-2.5 text-right font-semibold whitespace-nowrap">Response</th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r) => (
              <tr key={r.id} className="border-b border-track last:border-b-0">
                <td className="py-[11px] pr-3 align-top whitespace-nowrap text-muted-foreground">{shortDate(`${r.date}T00:00:00.000Z`)} · {platformLabel(r.platform)}</td>
                <td className="py-[11px] pr-3 align-top">
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="font-medium no-underline hover:underline"><span data-copy="quote">{r.title ?? 'Untitled post'}</span></a> : <span data-copy="quote">{r.title ?? 'Untitled post'}</span>}
                </td>
                <td className="hidden py-[11px] pr-3 align-top text-muted-foreground md:table-cell">{r.format ?? 'not read yet'}</td>
                <td className="hidden py-[11px] pr-3 align-top text-muted-foreground lg:table-cell">{r.opening ?? 'not read yet'}</td>
                <td className="py-[11px] text-right align-top">{r.multiple != null ? <Fig>{fmtMultiple(r.multiple)}</Fig> : <span className="text-[12.5px] text-muted-foreground">none</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="m-0 text-[12.5px] leading-[1.5] text-muted-foreground">
        Response is the post’s likes, shares and comments against its views, as a multiple of a typical market video published {when}. Reddit is left out, and a photo has no views to read it against.
      </p>
    </InPlacePanel>
  )
}
