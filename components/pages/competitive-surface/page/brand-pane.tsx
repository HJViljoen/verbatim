import Link from 'next/link'
import { ScanSearch } from 'lucide-react'

import { IconTile, SELECTED } from '@/components/colour-roles'

import { fmtInt, platformLabel, shortDate } from '@/lib/format'
import { PANE_TITLE, paneKindLabel, quoteWords, windowWords, type AskedBlock, type InFullBlock, type SaidAbout } from '@/lib/pages/brands'
import { cn } from '@/lib/utils'
import { BrandName, Card, CountRow, SubHead } from './ui'

// A brand in full (the artboard's second card): the brands you track as pills
// with their videos over the ninety days, stated once; the ones with none in
// one line; then the brand picked, what people did in its comments as counts,
// what is said about it (gated quotes, each naming who it is about) and what is
// asked under its content. The picked pill is the selected pale yellow; the
// brand's own counts are a rival's, so they draw in the rival grey.

function Pills({ rows }: { rows: InFullBlock['rows'] }) {
  return (
    <nav aria-label="Brands you track" className="flex flex-wrap gap-2">
      {rows.map((r) => (
        <Link
          key={r.audience}
          href={r.href}
          scroll={false}
          aria-current={r.selected ? 'true' : undefined}
          className={cn(
            'inline-flex items-center gap-2 rounded-[8px] px-3.5 text-[14px] text-foreground no-underline',
            // As drawn: a bordered chip is 36px inside its 1px border (38),
            // the selected one 36 with none.
            r.selected ? cn('h-9 font-bold', SELECTED) : 'h-[38px] border border-border font-medium hover:bg-foreground/[0.04]',
          )}
        >
          {r.label}
          <span data-copy="figure" className={cn('font-mono text-[12px] text-muted-foreground', r.selected ? 'font-medium' : null)}>{fmtInt(r.videos)}</span>
        </Link>
      ))}
    </nav>
  )
}

function Said({ said }: { said: SaidAbout }) {
  return (
    <div className="flex flex-col gap-2.5">
      <SubHead title={`Said about ${said.label}`} />
      {said.quotes.map((q) => {
        const words = quoteWords(q)
        const src = [q.platform ? platformLabel(q.platform) : null, q.date ? shortDate(q.date) : null].filter(Boolean).join(' · ')
        return (
          <figure key={q.ref} className="m-0 flex flex-col gap-2 rounded-[12px] bg-inner px-[18px] py-4">
            <blockquote data-copy="quote" className="m-0 font-serif text-[15px] italic leading-[1.5] text-foreground">“{words}”</blockquote>
            <figcaption className="text-[12px] text-muted-foreground">
              {src}{src ? <span> · </span> : null}<BrandName kind="brand">{said.label}</BrandName>
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}

function Asked({ asked }: { asked: AskedBlock }) {
  return (
    <div className="flex flex-col gap-1.5">
      <SubHead
        title="Asked under their content"
        sub={<><span data-copy="figure">{fmtInt(asked.videos)}</span> of its videos carry a question. Asked most:</>}
      />
      <div className="flex flex-col">
        {asked.themes.map((t) => (
          <div key={t.registryId} className="flex items-start justify-between gap-3 border-t border-border py-[9px] text-[14px]">
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="font-semibold text-foreground"><span data-copy="subject" data-slot="pass_b_theme">{t.label}</span></span>
              <div className="text-[12px] leading-[1.45]"><BrandName kind="brand">{asked.label}</BrandName></div>
            </div>
            <span className="shrink-0 whitespace-nowrap text-muted-foreground">
              <span data-copy="figure" className="font-mono text-foreground">{fmtInt(t.videos)}</span> {t.videos === 1 ? 'video' : 'videos'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BrandPaneCard({ inFull, asked, said, noun }: { inFull: InFullBlock; asked: AskedBlock | null; said: SaidAbout | null; noun: string | null }) {
  const filed = inFull.rows.filter((r) => r.videos > 0)
  const none = inFull.rows.filter((r) => r.videos === 0).map((r) => r.label)
  const sel = inFull.selected
  // Only what the brand picked has: its said-about quotes when the gate passes
  // any, its questions when any theme carries one.
  const saidShown = said && sel && said.audience === sel.audience && said.quotes.length > 0 ? said : null
  const askedShown = asked && sel && asked.audience === sel.audience && asked.themes.length > 0 ? asked : null
  return (
    <Card className="gap-3.5 px-7 pt-6 pb-7">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2.5">
          <IconTile icon={ScanSearch} />
          <h2 className="m-0 text-[20px] font-bold text-foreground">{PANE_TITLE}</h2>
        </div>
        <div className="text-[13px] text-muted-foreground">Videos about each brand you track, last 90 days ({windowWords(inFull.window)})</div>
      </div>
      {filed.length > 0 ? <Pills rows={filed} /> : null}
      {none.length > 0 ? (
        <div className="-mt-1 text-[13px] text-muted-foreground">No videos in the last 90 days: {none.join(', ')}.</div>
      ) : null}
      {sel ? (
        <div className="grid grid-cols-1 gap-x-8 border-t border-border pt-2 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2.5 pt-3.5">
            <SubHead title={`${sel.label} in full`} sub={<>What people did in the comments, of its <span data-copy="figure">{fmtInt(sel.videos)}</span> videos</>} />
            <div className="flex flex-col">
              {sel.kinds.map((k) => <CountRow key={k.kind} label={paneKindLabel(k.kind, noun)} k={k.videos} of={sel.videos} who="rival" />)}
            </div>
          </div>
          {saidShown || askedShown ? (
            <div className="flex min-w-0 flex-col gap-[18px] pt-3.5">
              {saidShown ? <Said said={saidShown} /> : null}
              {askedShown ? <Asked asked={askedShown} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
