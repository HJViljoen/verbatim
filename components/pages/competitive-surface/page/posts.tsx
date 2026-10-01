import { Megaphone } from 'lucide-react'
import { longMonth } from '@/lib/format'
import { POSTS_HEAD, type PostsBlock } from '@/lib/pages/brands'
import { Card, CountWords, TitleRow } from './ui'

// What they post, and what they say about themselves (the artboard's fourth
// block): each tracked brand whose own posts were read this month, its
// platforms, its posts, and up to two of the claims its posts make, in the
// words the claims read wrote (stored, never set as a quote).

const COLS = 'md:grid-cols-[210px_120px_minmax(0,1fr)]'

export function PostsCard({ posts }: { posts: PostsBlock }) {
  return (
    <Card className="gap-2.5 px-7 pt-6 pb-2.5">
      <TitleRow icon={Megaphone} title={POSTS_HEAD} sub={`Posts on their own accounts in ${longMonth(posts.month)}`} />
      <div aria-hidden className={`hidden gap-6 pt-1 text-[12px] font-semibold text-muted-foreground md:grid ${COLS}`}>
        <div>Brand</div>
        <div>Posted</div>
        <div>What they say about themselves</div>
      </div>
      <div className="-mt-1 flex flex-col">
        {posts.rows.map((r) => (
          <div key={r.audience} className={`grid grid-cols-1 items-start gap-x-6 gap-y-1.5 border-t border-border py-3.5 ${COLS}`}>
            <div className="flex flex-col gap-0.5">
              <div className="text-[15px] font-bold text-foreground">{r.label}</div>
              {r.platforms && r.platforms.length > 0 ? <div className="text-[12px] text-muted-foreground">{r.platforms.join(', ')}</div> : null}
            </div>
            <div><CountWords value={r.posts} one="post" many="posts" /></div>
            {r.said && r.said.length > 0 ? (
              <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px]">
                {r.said.map((c) => (
                  <li key={c.id} className="m-0 text-[14px] leading-[1.5] text-foreground">
                    <span data-copy="stored" data-slot="pass_a_brand_claim">{c.claim}</span>
                  </li>
                ))}
              </ul>
            ) : <div />}
          </div>
        ))}
      </div>
    </Card>
  )
}
