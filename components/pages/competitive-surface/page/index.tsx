import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { surface } from '@/lib/nav'
import { brandList, findingsShown, type BrandsPageData } from '@/lib/pages/brands'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import { BrandListCard } from './brand-list'
import { BrandPaneCard } from './brand-pane'
import { FindingsBlockView } from './findings'
import { PostsCard } from './posts'
import { WorksCard } from './works'

// Competitive (renamed from Brands; pages build, 1 Oct), drawn to the approved
// artboard Page-Competitive.dc.html: the title alone, then
//   1. Brands in your market (0.62) beside A brand in full (1.38);
//   2. Where a rival's talk differs, two cards abreast;
//   3. What they post, and what they say about themselves;
//   4. What works in your market's videos.
// 22px between blocks. A block with nothing to show is not drawn (rule 2),
// and nothing on the page says how it was made (rule 1): no month selector,
// no "as at", no Export.

/** The blocks this data draws, in the artboard's order. */
export type CompetitiveBlockKey = 'list' | 'pane' | 'findings' | 'posts' | 'works'

export function competitiveBlocks(b: BrandsPageData, client: string): CompetitiveBlockKey[] {
  const out: CompetitiveBlockKey[] = []
  if (brandList(b, client)) out.push('list')
  if (b.inFull.rows.some((r) => r.videos > 0)) out.push('pane')
  if (findingsShown(b.findings).length > 0) out.push('findings')
  if (b.posts.rows.length > 0) out.push('posts')
  if (b.works && (b.works.formats.length > 0 || b.works.hooks.length > 0)) out.push('works')
  return out
}

export function CompetitivePage({ data }: { data: CompetitiveSurfaceData }) {
  const b = data.brands
  const title = surface('competitive').label
  if (!b) {
    return (
      <PageFrame className="gap-[22px]">
        <PageBar title={title} />
      </PageFrame>
    )
  }
  const client = data.brand
  const noun = b.noun ?? null
  const soFar = data.reading?.state === 'so_far'
  const list = brandList(b, client)
  const shown = competitiveBlocks(b, client)
  const pane = shown.includes('pane')
  return (
    <PageFrame className="gap-[22px]">
      <PageBar title={title} />
      {list || pane ? (
        <div className={list && pane ? 'grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.62fr)_minmax(0,1.38fr)]' : 'grid grid-cols-1 items-start gap-5'}>
          {list ? <BrandListCard list={list} soFar={soFar} /> : null}
          {pane ? <BrandPaneCard inFull={b.inFull} asked={b.asked} said={b.saidAbout ?? null} noun={noun} /> : null}
        </div>
      ) : null}
      {shown.includes('findings') ? <FindingsBlockView findings={findingsShown(b.findings)} client={client} noun={noun} /> : null}
      {shown.includes('posts') ? <PostsCard posts={b.posts} /> : null}
      {shown.includes('works') && b.works ? <WorksCard works={b.works} noun={noun} /> : null}
    </PageFrame>
  )
}
