import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { calibrationWord } from '@/lib/subjects/calibration-state'

// A subject row's calibration word (decision C, WP1.1): "provisional" or
// "being re-described", as a row tag in the preview's face (mono, muted, under
// or beside the subject's name). A ready subject carries no word, and neither
// does a row stored before the three states, which renders as it was sent.
//
// NO `data-copy`. The two words hold no digit and no direction word, so the
// copy contract checks them as plain markup and they pass; an exemption that
// names nothing is a hole (AGENTS.md).
//
// A SUBJECT THE MONTH WAS NOT READ FOR carries its words in the same place and
// face (WP1.1 review, finding 1): "no reading yet" (`unreadWords`, the one
// wording on every surface, default M-a), or "not read in {Month}" once no
// update will read the month.

export function CalibrationTag({
  calibration,
  unread = null,
  mode = 'app',
  block = false,
  className,
}: {
  /** The row's state, or a stored value (`'calibrating'` reads as provisional). */
  calibration: string | null | undefined
  /** The words a row the month was not read for prints (`SubjectRow.unread`),
   *  in place of the calibration word. */
  unread?: string | null
  mode?: RenderMode
  /** On a line of its own rather than inline. */
  block?: boolean
  className?: string
}) {
  const word = unread || calibrationWord(calibration)
  if (!word) return null
  if (mode === 'email') {
    const style = { fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }
    // ON A LINE OF ITS OWN, A REAL BLOCK. The email's plain-text part is read
    // off the HTML (`htmlToText`), which breaks lines at block ELEMENTS and
    // knows nothing of CSS, so a span set `display: block` printed
    // "Repair & warrantybeing re-described" there.
    return block ? <div style={style}>{word}</div> : <span style={style}>{word}</span>
  }
  return (
    <span className={`${block ? 'block' : 'inline'} font-mono text-[11px] font-normal text-muted-foreground${className ? ` ${className}` : ''}`}>
      {word}
    </span>
  )
}
