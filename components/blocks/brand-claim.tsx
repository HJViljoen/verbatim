import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { cn } from '@/lib/utils'

// A brand's own claim, in three modes.
//
// A CLAIM IS NOT A QUOTE. The product's visual language for a PERSON's words is
// the quote: IBM Plex Serif italic in quotation marks behind the rule
// (`components/quote-block.tsx`). A claim the brand made about itself is a
// different object (it is the thing the audience's words are read AGAINST), and
// setting it in quotation marks, bold or not, made it read as one more voice
// from the conversation. So a claim is plain text: the sans face, regular
// weight, ink, no quotation marks. The block around it says whose it is ("your
// claims", "Claims you made"), once, rather than every row.
//
// THE COPY MARKER IS THE CALLER'S. Where the words are the brand's own verbatim
// (`CardClaim.quote`) the caller marks them `quote` so rule (a) does not police
// "100% recycled"; where they are a model's paraphrase (`you_say`) the caller
// marks them `stored` with the slot that wrote them. Style and provenance are
// separate decisions, and this component makes only the first.

export function BrandClaim({
  children, mode = 'app', copy, slot, className, title,
}: {
  children: ReactNode
  mode?: RenderMode
  copy?: 'quote' | 'stored'
  slot?: string
  className?: string
  title?: string
}) {
  if (mode === 'email') {
    return (
      <span data-copy={copy} data-slot={slot} style={{ fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 400, color: EMAIL.ink }}>
        {children}
      </span>
    )
  }
  return (
    <span data-copy={copy} data-slot={slot} title={title} className={cn('min-w-0 text-[12.5px] font-normal not-italic leading-[1.4] text-foreground', className)}>
      {children}
    </span>
  )
}
