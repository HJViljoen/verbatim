import { translationLabel, translationNote } from '@/components/quote-block'
import { fmtInt, platformLabel, shortDate } from '@/lib/format'
import type { PictureQuote, StandsBlock } from '@/lib/pages/overview-picture'
import { Bar, Card, HAIR, MUTED, TitleRow } from './parts'

// (b) "Where your market stands": every tracked subject in one list. A
// subject with a reading prints its share (a bare figure, its base in the
// subtitle), the week read's sentence on it, the conversations inside it and
// one quote; any other prints its name alone, with no figure and no note.

/** The quote panel: the words in the serif italic on a plain panel (no
 *  stripe), the English under a quote in another language with the machine
 *  translation said, then where and when. */
function QuotePanel({ q }: { q: PictureQuote }) {
  const note = translationNote(q)
  const label = translationLabel(note)
  const where = [q.platform ? platformLabel(q.platform) : null, q.date ? shortDate(`${q.date}T00:00:00Z`) : null].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-col gap-2 rounded-[12px] bg-[#F7F6F2] px-[18px] py-4">
      <p data-copy="quote" className="m-0 font-serif text-[15px] italic leading-[1.5] text-[#26292C]">“{q.text}”</p>
      {label ? <div className={`text-[12px] ${MUTED}`}>{label}</div> : null}
      {note.english ? <p data-copy="quote" className={`m-0 font-serif text-[14px] leading-[1.5] ${MUTED}`}>{note.english}</p> : null}
      {where ? <div className={`text-[12px] ${MUTED}`}>{where}</div> : null}
    </div>
  )
}

export function StandsBlockView({ block, monthText }: { block: StandsBlock; monthText: string }) {
  if (block.rows.length === 0) return null
  const counts = block.n != null && block.rows.some((r) => r.level?.kind === 'count')
  const sub = block.n == null
    ? null
    : counts
      ? <>Videos of the <span data-copy="figure">{fmtInt(block.n)}</span> in {monthText}</>
      : <>Share of the <span data-copy="figure">{fmtInt(block.n)}</span> videos in {monthText}</>
  return (
    <Card label="Where your market stands" className="gap-[14px] px-5 pb-2.5 pt-6 sm:px-7">
      <TitleRow title="Where your market stands" sub={sub} />
      <div className="flex flex-col">
        {block.rows.map((r) => r.level ? (
          <div key={r.subjectId} className={`grid grid-cols-1 gap-8 border-t ${HAIR} py-5 md:grid-cols-2`}>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3.5">
                <h3 className="m-0 w-[130px] shrink-0 text-[17px] font-bold sm:w-[170px]">{r.name}</h3>
                <Bar pct={r.level.pct} height={10} />
                <div data-copy="figure" className="w-[44px] shrink-0 text-right font-mono text-[15px] font-medium">{r.level.text}</div>
              </div>
              {r.sentence ? <p data-copy="stored" data-slot="week_read" className="m-0 text-[15px] leading-[1.55]">{r.sentence}</p> : null}
              {r.contents.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {r.contents.map((c) => (
                    <span key={c} data-copy="subject" data-slot="pass_b_theme" className="rounded-full bg-[#F7F6F2] px-2.5 py-[5px] text-[12px]">{c}</span>
                  ))}
                </div>
              ) : null}
            </div>
            {r.quote ? <QuotePanel q={r.quote} /> : <div />}
          </div>
        ) : (
          <div key={r.subjectId} className={`border-t ${HAIR} py-4`}>
            <h3 className="m-0 text-[17px] font-bold">{r.name}</h3>
          </div>
        ))}
      </div>
    </Card>
  )
}
