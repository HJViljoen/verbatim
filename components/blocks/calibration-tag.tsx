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

export function CalibrationTag({
  calibration,
  mode = 'app',
  block = false,
  className,
}: {
  /** The row's state, or a stored value (`'calibrating'` reads as provisional). */
  calibration: string | null | undefined
  mode?: RenderMode
  /** On a line of its own rather than inline. */
  block?: boolean
  className?: string
}) {
  const word = calibrationWord(calibration)
  if (!word) return null
  if (mode === 'email') {
    return (
      <span style={{ display: block ? 'block' : 'inline', fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}>
        {word}
      </span>
    )
  }
  return (
    <span className={`${block ? 'block' : 'inline'} font-mono text-[11px] font-normal text-muted-foreground${className ? ` ${className}` : ''}`}>
      {word}
    </span>
  )
}
