import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'

// How a block states what its numbers are counted over (Block D wave 2, fix
// pass).
//
// THREE TILES ENDED IN A WALL OF SMALL GREY PROSE. Each block closes with
// three to eight lines of 11px muted text explaining how its count was
// derived — the corpus a conclusion's videos are counted over, what "Repeated"
// counts, what a plan claim's floor is. Every sentence is defensible and the
// artboard has none of them; drawn as one justified grey block at the foot of
// a tile they read as boilerplate, which is the one thing a stated basis must
// not do, and they are a large part of why the built page runs 900px taller
// than the artboard.
//
// SO THE DERIVATION IS ONE PRESS FROM THE NUMBER IT EXPLAINS, which is the
// pattern this page already uses for a figure (MASTER rule 5, and the dotted
// underline on every counted figure in these blocks). The summary carries the
// same dotted underline, so it reads as the same offer.
//
// AND IT IS OPEN EVERYWHERE THERE IS NOTHING TO PRESS. Print and email get the
// paragraph inline, exactly as before: a disclosure nobody can open is a basis
// that has been hidden, and the rule this page is built on is that a figure
// travels with the population it is a share of. Nothing is removed from any
// mode — only the app's resting height changes.
export function Derivation({
  children, mode, label = 'How this is counted',
}: { children: ReactNode; mode: RenderMode; label?: string }) {
  if (mode === 'email') {
    return (
      <p style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 }}>{children}</p>
    )
  }
  if (mode !== 'app') {
    return <p className="m-0 text-[11px] leading-[1.35] text-muted-foreground">{children}</p>
  }
  return (
    <details className="group m-0 min-w-0">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-muted-foreground">
        <span aria-hidden className="text-[9px] transition-transform group-open:rotate-90 motion-reduce:transition-none">▶</span>
        <span className="underline decoration-muted-foreground decoration-dotted underline-offset-[3px]">{label}</span>
      </summary>
      <p className="m-0 mt-1 text-[11px] leading-[1.35] text-muted-foreground">{children}</p>
    </details>
  )
}
