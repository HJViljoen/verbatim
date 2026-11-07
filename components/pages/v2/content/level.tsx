import Link from 'next/link'
import { CARD, GoLink, SectionHead } from '@/components/v2'
import { BTN_PRIMARY } from '@/components/v2/look'
import { fmtInt } from '@/lib/format'
import { MEDICAL_LINE } from '@/lib/post-ideas/medical'
import type { Elsewhere } from '@/lib/pages/v2/content-levels'
import { CONTENT_ROOT } from '@/lib/pages/v2/content-address'
import { cn } from '@/lib/utils'
import { Sentence } from './parts'

// CONTENT'S LEVEL PAGES, THE PIECES THEY SHARE (depth as pages, 17 Oct; the
// G5 boards; since the audit design, 7 Nov, the Content boards, with no level
// tile): the one calm line an address that names nothing prints; "Elsewhere
// on Content"; and the Agent's tile. Server components, no client code.

export const BACK_TO_CONTENT = 'Back to Content'

/** An address that names nothing Content shows: one calm line and the way
 *  back, never a 404. */
export function ContentMissing({ line }: { line: string }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p data-content-missing="" className="m-0 text-[15px] text-muted-foreground">{line}</p>
      <GoLink href={CONTENT_ROOT}>{BACK_TO_CONTENT}</GoLink>
    </div>
  )
}

/** The Agent at a page's foot (the Content boards' last tile): its line and
 *  the yellow button, the page's one primary, with no icon; the button under
 *  the line on a phone. */
export function AskCard({ line, label, href }: { line: string; label: string; href: string }) {
  return (
    <section aria-label="Ask the Agent" className={cn(CARD, 'flex-row flex-wrap items-center justify-between gap-6 max-sm:gap-3')}>
      <p className="m-0 min-w-0 flex-[1_1_420px] text-[15.5px] leading-[1.55]">{line}</p>
      <Link href={href} className={cn(BTN_PRIMARY, 'no-underline max-sm:w-full')}>{label}</Link>
    </section>
  )
}

/** A tile of the foot, the whole tile its link (the board's). */
const SIB = cn(CARD, 'gap-1.5 text-foreground no-underline transition-shadow hover:shadow-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground')
const SIB_TITLE = 'text-[16px] leading-[1.35] font-semibold underline decoration-control underline-offset-4'
const SIB_LINE = 'text-[14px] leading-[1.5] text-secondary-foreground'

/** One idea in the foot: its title (`stored`), and "Post idea 1, in 48 of 640
 *  videos from 14 Sep to 11 Oct and 31 in October so far." (decision 1: the
 *  four weeks beside their month; their base is no figures row's here, so it
 *  stays). */
function IdeaSibling({ idea }: { idea: Elsewhere['ideas'][number] }) {
  return (
    <>
      <span data-copy="stored" data-slot="post_idea" className={SIB_TITLE}>{idea.title}</span>
      <span className={SIB_LINE}>
        Post idea {idea.rank}
        {idea.read && idea.month != null ? (
          <>, in <span data-copy="level">{fmtInt(idea.read.k)} of {fmtInt(idea.read.n)} videos</span> from {idea.readLabel} and <span data-copy="figure">{fmtInt(idea.month)}</span> {idea.monthWords}</>
        ) : null}.
      </span>
    </>
  )
}

/** "Elsewhere on Content": the root's first two ideas and the other evidence
 *  page, a tile each (stacked on a phone), "Open Content" in the head, and in
 *  a medical market the medical team line once under the ideas (decision 14). */
export function ElsewhereSection({ data }: { data: Elsewhere }) {
  return (
    <section aria-labelledby="elsewhere-title" className="flex flex-col">
      <SectionHead id="elsewhere-title" title="Elsewhere on Content" action={<GoLink href={CONTENT_ROOT}>Open Content</GoLink>} />
      <nav aria-label="Elsewhere on Content" data-elsewhere="" className="mt-[22px] grid grid-cols-1 gap-5 lg:grid-cols-3">
        {data.ideas.map((i) => <Link key={i.id} href={i.href} className={SIB}><IdeaSibling idea={i} /></Link>)}
        {data.ideas.length === 0 ? (
          <Link href={CONTENT_ROOT} className={SIB}>
            <span className={SIB_TITLE}>What to post next</span>
            <span className={SIB_LINE}>{data.ideasLine}</span>
          </Link>
        ) : null}
        <Link href={data.page.href} className={SIB}>
          <span className={SIB_TITLE}>{data.page.label}</span>
          <span className={SIB_LINE}><Sentence parts={data.page.line} />.</span>
        </Link>
      </nav>
      {data.medical && data.ideas.length > 0 ? <p data-medical-line="" className="m-0 mx-0.5 mt-3.5 text-[14px] leading-[1.5] text-secondary-foreground">{MEDICAL_LINE}</p> : null}
    </section>
  )
}
