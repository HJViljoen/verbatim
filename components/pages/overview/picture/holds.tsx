import { monthsPhrase } from '@/lib/written/month'
import type { LongRunReadData } from '@/lib/written/types'
import { Card, HAIR, MUTED, WhoName } from './parts'

// (a) "What holds across {months}": the long-run read, as stored (lib/written/
// longrun.ts). The lead in the serif, then each idea: its headline and body
// on the left, on the right what it was heard on and who it is about. The
// prose is the writer's, scrubbed when it was written (`week_read` policy).
// No read written: nothing here (the page omits the block).

export function HoldsBlock({ read, brand, noun }: { read: LongRunReadData; brand: string; noun: string | null }) {
  if (read.ideas.length === 0) return null
  const months = monthsPhrase(read.months)
  return (
    <Card label={`What holds across ${months}`} className="gap-[14px] px-5 pb-2.5 pt-7 sm:px-8">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#C2410C]">What holds across {months}</div>
      </div>
      {read.inShort ? (
        <p data-copy="stored" data-slot="week_read" className="m-0 max-w-[1000px] font-serif text-[20px] font-medium leading-[1.4] sm:text-[24px]">
          {read.inShort}
        </p>
      ) : null}
      {read.ideas.map((idea, i) => {
        const heard = idea.months.filter((m) => m.videos > 0).map((m) => m.month)
        return (
          <article key={idea.headline} className={`grid grid-cols-1 gap-6 border-t ${HAIR} py-6 md:grid-cols-5 md:gap-9`}>
            <div className="flex flex-col gap-3 md:col-span-3">
              <div className="flex items-start gap-3">
                <div aria-hidden className="flex size-[26px] shrink-0 items-center justify-center rounded-[13px] bg-[#FFD43B] text-[13px] font-bold">{i + 1}</div>
                <h3 data-copy="stored" data-slot="week_read" className="m-0 text-[21px] font-bold leading-[1.3]">{idea.headline}</h3>
              </div>
              {idea.body.map((p) => (
                <p key={p} data-copy="stored" data-slot="week_read" className="m-0 text-[16px] leading-[1.6]">{p}</p>
              ))}
            </div>
            <div className="pt-1 md:col-span-2">
              <div className="flex flex-col gap-2">
                <div className={`text-[13px] ${MUTED}`}>
                  Heard in {monthsPhrase(heard)}, <span data-copy="figure" className="font-mono text-[#26292C]">{idea.videos}</span> videos
                </div>
                <div className="flex flex-col">
                  {idea.who.map((p) => (
                    <div key={p.about} className={`flex justify-between gap-3 border-t ${HAIR} py-[7px] text-[13.5px]`}>
                      <span><WhoName about={p.about} brand={brand} noun={noun} /></span>
                      <span data-copy="figure" className="font-mono text-[13.5px]">{p.videos}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
        )
      })}
    </Card>
  )
}
