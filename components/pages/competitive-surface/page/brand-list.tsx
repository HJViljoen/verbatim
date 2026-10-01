import { longMonth } from '@/lib/format'
import { LIST_TITLE, monthSoFar, type BrandList } from '@/lib/pages/brands'
import { Card, CountWords, GOLD, TitleStack } from './ui'

// Brands in your market (the artboard's first card): every brand named
// unprompted in the month's videos, counts only, with you as one gold row on
// the same list, and one closing line for the brands never named, an absence
// that is itself a finding.

export function BrandListCard({ list, soFar }: { list: BrandList; soFar: boolean }) {
  return (
    <Card className="gap-3 px-[26px] pt-6 pb-[22px]">
      <TitleStack title={LIST_TITLE} sub={`Videos that named the brand unprompted, ${monthSoFar(list.month, soFar)}`} />
      {list.rows.length > 0 ? (
        <div role="list" className="flex flex-col">
          {list.rows.map((r) => (
            <div key={`${r.you ? 'you' : 'brand'}:${r.label}`} role="listitem" className="flex items-baseline justify-between gap-3 border-t border-border py-[11px]">
              <div className="flex min-w-0 items-baseline gap-2">
                {r.you ? (
                  <>
                    <span className="text-[15px] font-bold" style={{ color: GOLD }}>{r.label}</span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: GOLD }}>You</span>
                  </>
                ) : (
                  <span className="text-[15px] font-semibold text-foreground">{r.label}</span>
                )}
              </div>
              <CountWords value={r.k} one="video" many="videos" you={r.you} />
            </div>
          ))}
        </div>
      ) : null}
      {list.notNamed.length > 0 ? (
        <div className="border-t border-border pt-2.5 text-[13px] leading-[1.5] text-muted-foreground">
          Not named unprompted in {longMonth(list.month)}: {list.notNamed.join(', ')}.
        </div>
      ) : null}
    </Card>
  )
}
