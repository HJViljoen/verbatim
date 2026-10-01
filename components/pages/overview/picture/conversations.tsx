import Link from 'next/link'
import { fmtInt } from '@/lib/format'
import type { ConversationsBlock, KindsBlock } from '@/lib/pages/overview-picture'
import { Bar, Card, HAIR, MUTED, numberWord, TitleRow, TitleStack, WhoLine } from './parts'

// (c) "The biggest conversations": the category's top five, each with who
// the talk is about, makers' own talk set apart in one line, and the way to
// every conversation. (d) "What people do in the comments": the six kinds on
// the market's base, levels only, each with who the videos are about.

/** Where "Every conversation" goes: the Conversation page. */
export const CONVERSATION_HREF = '/dashboard/voice'

export function ConversationsBlockView({ block, brand, noun }: { block: ConversationsBlock; brand: string; noun: string | null }) {
  if (block.rows.length === 0) return null
  const counts = block.rows.some((r) => r.kind === 'count')
  return (
    <Card label="The biggest conversations" className="gap-[14px] px-5 py-6 sm:px-7">
      <TitleRow
        title="The biggest conversations"
        sub={counts
          ? <>Videos of the category’s <span data-copy="figure">{fmtInt(block.n)}</span></>
          : <>Share of the category’s <span data-copy="figure">{fmtInt(block.n)}</span> videos</>}
      />
      <div className="flex flex-col">
        {block.rows.map((r) => (
          <div key={r.registryId} className={`flex items-center gap-3.5 border-t ${HAIR} py-[9px]`}>
            <div className="flex min-w-0 shrink-0 basis-[45%] flex-col gap-0.5 sm:basis-[300px]">
              <div data-copy="subject" data-slot="pass_b_theme" className="text-[15px] font-semibold">{r.label}</div>
              <div className="text-[12px] leading-[1.45]"><WhoLine parts={r.who} brand={brand} noun={noun} /></div>
            </div>
            <Bar pct={r.pct} />
            <div data-copy="figure" className="w-[40px] shrink-0 text-right font-mono text-[14px]">{r.text}</div>
          </div>
        ))}
      </div>
      {block.makers && block.makers.labels.length > 0 ? (
        <div className={`text-[13px] leading-[1.55] ${MUTED}`}>
          Makers’ own talk (
          {block.makers.labels.map((l, i) => (
            <span key={l}>{i > 0 ? ', ' : ''}<span data-copy="subject" data-slot="pass_b_theme">{l}</span></span>
          ))}
          ) is set apart{block.makers.inTopFive > 0 ? `: ${numberWord(block.makers.inTopFive)} of the month’s five largest threads` : ''}.
        </div>
      ) : null}
      <Link href={CONVERSATION_HREF} className="text-[14px] font-semibold text-[#C2410C] no-underline hover:text-[#26292C]">
        Every conversation →
      </Link>
    </Card>
  )
}

export function KindsBlockView({ block, brand, noun, monthText }: { block: KindsBlock; brand: string; noun: string | null; monthText: string }) {
  if (block.rows.length === 0) return null
  const counts = block.rows.some((r) => r.kindOfLevel === 'count')
  return (
    <Card label="What people do in the comments" className="gap-[14px] px-5 py-6 sm:px-7">
      <TitleStack
        title="What people do in the comments"
        sub={counts
          ? <>Videos of the <span data-copy="figure">{fmtInt(block.n)}</span> in {monthText}, and who the videos are about</>
          : <>Share of the <span data-copy="figure">{fmtInt(block.n)}</span> videos in {monthText}, and who the videos are about</>}
      />
      <div className="flex flex-col">
        {block.rows.map((r) => (
          <div key={r.kind} className={`flex flex-col gap-1 border-t ${HAIR} py-[9px]`}>
            <div className="flex items-center gap-3.5">
              <div className="w-[150px] shrink-0 text-[15px] font-semibold sm:w-[230px]">{r.label}</div>
              <Bar pct={r.pct} />
              <div data-copy="figure" className="w-[40px] shrink-0 text-right font-mono text-[14px]">{r.text}</div>
            </div>
            <div className="text-[12px] leading-[1.45]"><WhoLine parts={r.who} brand={brand} noun={noun} /></div>
          </div>
        ))}
      </div>
    </Card>
  )
}
