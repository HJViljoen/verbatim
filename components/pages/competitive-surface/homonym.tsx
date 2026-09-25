import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'

// A rival name that is mostly another word (market-first WP1.9).
//
// Freitag is German for Friday, and most of what is filed under the name is
// the day, not the brand. Until WP2.6 measures the name's precision at 0.8 or
// more, every row and count on this page that is filed under it carries the
// note (`HOMONYM_NOTES`, lib/config.ts), so a reader does not read the word
// as the brand.
//
// A TAG ON THE ROW, NEVER A NOTE UNDER THE BLOCK. The 25 Sep rulings keep row
// tags and drop footnotes, and the preview's Brands artboard draws this note
// as a quiet line beside the name. `stacked` puts it under the name, where a
// table cell is narrow; otherwise it follows the name after a middle dot.

export function HomonymTag({
  note,
  mode,
  stacked = false,
}: {
  note: string | null | undefined
  mode: RenderMode
  stacked?: boolean
}) {
  if (!note) return null
  if (mode === 'email') {
    return (
      <span data-homonym="" style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 400, color: EMAIL.muted }}>
        {' · '}{note}
      </span>
    )
  }
  return stacked
    ? <span data-homonym="" className="block text-[11px] font-normal leading-[1.35] text-muted-foreground">{note}</span>
    : <span data-homonym="" className="text-[11px] font-normal text-muted-foreground">{' · '}{note}</span>
}
