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
  return mode === 'email'
    ? <a href={href} style={{ color: EMAIL.ink }}>{label}</a>
    : <Link href={href} className="hover:underline">{label}</Link>
}
