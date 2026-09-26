import Link from 'next/link'
import type { ReactNode } from 'react'

import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'

/**
 * "Open Voice →" — an affordance of the APP, and only of the app and the
 * email that leads back to it.
 *
 * WHY PRINT GETS NOTHING. A block branched on `mode === 'email'` and treated
 * everything else as the screen, which was right while the only other reader
 * was a tenant looking at a PDF of their own dashboard. WP19 is the first
 * thing to put a block's print arm in front of an OUTSIDE reader: a brief goes
 * out as a PDF and as a `/r/<token>` share page, and both carried "Open
 * Market →", absolute via `ctx.appUrl`, resolving for a reader who has no
 * account to a login wall. A document that tells its reader to click something
 * they cannot reach is worse than a document that says nothing there.
 *
 * The block keeps its footer rail either way — `BlockFrame` simply draws none
 * when there is nothing to draw — so a sheet does not shift.
 */
export function openLink(mode: RenderMode, href: string, label: ReactNode): ReactNode {
  if (mode === 'print') return null
  // ONE NAVIGATION LINK STYLE PER ARTEFACT (Block D wave 3, SH24). This arm
  // set the charcoal ink and never set `text-decoration`, so the six
  // block-footer links ("Open This week →", "Open the sales brief →") rendered
  // as default UNDERLINED dark links while every other link on the same email
  // is `EMAIL.link` with no underline. The artboards have exactly one
  // navigation link style; their only underlines are the dotted evidence
  // underlines under figures, which mean something else entirely.
  if (mode === 'email') return <a href={href} style={{ color: EMAIL.link, textDecoration: 'none' }}>{label}</a>
  // THE UNDERLINE IS UNDER THE WORDS, NEVER THE ARROW (the preview's footer
  // link: the words in one underlined span, the arrow in its own aria-hidden
  // span beside it). A decoration on the anchor itself propagates to every
  // child, the arrow included, so the anchor carries none: the words' span
  // (`data-link-text`) takes the hover underline here, and a roomy frame's
  // at-rest hairline (components/blocks/frame.tsx) targets that span too.
  const { text, arrow } = splitArrow(label)
  return (
    <Link href={href} className="group/open">
      <span data-link-text="" className="group-hover/open:underline">{text}</span>
      {arrow ? <>{' '}<span aria-hidden="true">{arrow}</span></> : null}
    </Link>
  )
}

/** A label "Open Voice →" as its words and its arrow; any other label (no
 *  trailing arrow, or not a string) is all words. */
export function splitArrow(label: ReactNode): { text: ReactNode; arrow: string | null } {
  if (typeof label !== 'string') return { text: label, arrow: null }
  const m = /^([\s\S]*\S)\s*(→)\s*$/u.exec(label)
  return m ? { text: m[1], arrow: m[2] } : { text: label, arrow: null }
}
