import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// YOUR MOVES' LEVEL TILES (levels as pages, 17 Oct; the G6 boards), drawn
// exactly as the boards draw them, so each level says what it is before a
// word is read, and never looks like one of Market's:
//   advice   a signpost on the kit's yellow: the HUB (many things in it)
//   move     a flag on the neutral: the EVIDENCE (one concrete thing)
//   record   a check-list on the neutral: the INDEX (every piece)
// The title block takes the 46px tile (`MovesLevelTile`, beside Market's
// `LevelTile`); the root's cards and the record's rows take the 26px one
// (`MovesKindTile`). Plain SVG, no client code.

export type MovesLevel = 'advice' | 'move' | 'record'

type Glyph = { className?: string }

function Svg({ className, children }: Glyph & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn('shrink-0', className)}>
      {children}
    </svg>
  )
}

/** A piece of advice: a signpost. */
export function SignpostGlyph(p: Glyph) {
  return <Svg {...p}><path d="M12 3v3" /><path d="M18.5 13h-13L2 9.5 5.5 6h13L22 9.5Z" /><path d="M12 13v8" /></Svg>
}

/** A dated move: a flag. */
export function FlagGlyph(p: Glyph) {
  return <Svg {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></Svg>
}

/** The advice record: a check-list. */
export function ChecklistGlyph(p: Glyph) {
  return <Svg {...p}><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></Svg>
}

const GLYPH: Record<MovesLevel, (p: Glyph) => ReactNode> = { advice: SignpostGlyph, move: FlagGlyph, record: ChecklistGlyph }

/** The hub on yellow, the evidence and the index on the neutral. */
const GROUND: Record<MovesLevel, string> = {
  advice: 'bg-accent text-orange-text',
  move: 'bg-track text-secondary-foreground',
  record: 'bg-track text-secondary-foreground',
}

/** The title block's tile: 46px, its glyph 22px (38px and 19px on a phone),
 *  as Market's `LevelTile`. */
export function MovesLevelTile({ level }: { level: MovesLevel }) {
  const G = GLYPH[level]
  return (
    <span aria-hidden data-level-tile={level} className={cn('flex size-[46px] shrink-0 items-center justify-center rounded-[11px] max-sm:size-[38px] max-sm:rounded-[10px]', GROUND[level])}>
      <G className="size-[22px] max-sm:size-[19px]" />
    </span>
  )
}

/** A card's or a row's tile: 26px, its glyph 14px (the boards' `.ktile`). */
export function MovesKindTile({ level, className }: { level: Exclude<MovesLevel, 'record'>; className?: string }) {
  const G = GLYPH[level]
  return (
    <span aria-hidden data-kind-tile={level} className={cn('inline-flex size-[26px] shrink-0 items-center justify-center rounded-[7px]', GROUND[level], className)}>
      <G className="size-3.5" />
    </span>
  )
}
