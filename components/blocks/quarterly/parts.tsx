import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'

// The quarterly review's shared pieces (Phase 1 WP20).
//
// EIGHT PAGES, THREE MODES, ONE SET OF WORDS. Every page of this artefact is a
// heading, a rule, some rows and a note, and each of those needs an app arm, a
// print arm and a table-markup email arm. Written per page that is eight copies
// of the same ternary; written here it is one, and a change to how a caveat
// reads reaches all eight.
//
// NOTHING HERE STAMPS A `data-copy` MARKER EXCEPT WHERE IT OWNS THE WORDS.
// `Figure` marks itself (the digits are its whole job) and `Level` marks itself
// (rule (b) requires the "of N" inside the level node). A `Note` does not: its
// words are the calling block's, and a block that marked its own prose as
// something else would be claiming a provenance it does not have.

/** A quiet line under a table or a figure — the caveat, the denominator, the
 *  sentence that says what was not recorded. */
export function Note({ children, mode = 'app', tone = 'muted' }: { children: ReactNode; mode?: RenderMode; tone?: 'muted' | 'body' }) {
  if (children == null || children === '') return null
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5, color: tone === 'body' ? EMAIL.ink2 : EMAIL.muted, marginTop: 4 }}>
        {children}
      </div>
    )
  }
  return <p className={`m-0 mt-1 text-[11.5px] leading-relaxed ${tone === 'body' ? 'text-secondary-foreground' : 'text-muted-foreground'}`}>{children}</p>
}

/** A measured number, with what it is out of beside it. The "of N" is REQUIRED
 *  by copy-contract rule (b) wherever a level word is printed, and is good
 *  manners everywhere else. */
export function Figure({ value, of, mode = 'app' }: { value: ReactNode; of?: ReactNode; mode?: RenderMode }) {
  const body = (
    <>
      <span data-copy="figure">{value}</span>
      {of ? <> <span data-copy="figure">{of}</span></> : null}
    </>
  )
  if (mode === 'email') return <span style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.ink }}>{body}</span>
  return <span className="font-mono text-[12px] tabular-nums">{body}</span>
}

/** A calibrated word with its evidence. Both, or neither (WP10's rule). */
export function Level({ word, of, mode = 'app' }: { word: ReactNode; of: string; mode?: RenderMode }) {
  if (mode === 'email') {
    return <span data-copy="level" style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2 }}>{word} · {of}</span>
  }
  return <span data-copy="level" className="text-[12px] text-secondary-foreground">{word} · {of}</span>
}

/**
 * A STATE and its reason — the same shape as a `Level`, and deliberately not
 * one.
 *
 * "not settled · comparison refused" was marked `data-copy="level"`, which
 * rule (b) requires an "of N" inside. None of `unsettledItems`' four reasons
 * carries one ('comparison refused', 'not enough months behind it', 'band
 * ±3.4', 'too few to compare'), so page 8 broke the contract on every item it
 * printed — invisibly, because all four fixtures return zero items.
 *
 * "Not settled" is not a calibrated level at all: it is the product declining
 * to give a reading, and the number it would rest on is the one that is
 * missing. So the marker comes off rather than a denominator being
 * manufactured for it. The node is still swept by rule (c) like every other
 * piece of unmarked copy — nothing here buys an exemption — and the row's own
 * body beside it carries the evidence ("Fit read 1 of 9 videos in this window,
 * against 2 of 12 before it").
 */
export function State({ word, why, mode = 'app' }: { word: ReactNode; why: string; mode?: RenderMode }) {
  if (mode === 'email') {
    return <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2 }}>{word} · {why}</span>
  }
  return <span className="text-[12px] text-secondary-foreground">{word} · {why}</span>
}

/** One row of a page's list. A row is a label, a body and an optional aside;
 *  an email stacks them, because two things side by side in Outlook is another
 *  table and is never worth one. */
export function Row({ label, children, aside, mode = 'app' }: { label?: ReactNode; children: ReactNode; aside?: ReactNode; mode?: RenderMode }) {
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        {label ? <strong>{label}</strong> : null}
        <div style={{ marginTop: 2 }}>{children}</div>
        {aside ? <div style={{ marginTop: 2 }}>{aside}</div> : null}
      </div>
    )
  }
  return (
    <div className="border-t border-border/70 py-1.5 text-[12.5px]">
      {label ? <span className="font-medium">{label}</span> : null}
      <div className="mt-0.5">{children}</div>
      {aside ? <div className="mt-0.5 flex flex-wrap items-center gap-1.5">{aside}</div> : null}
    </div>
  )
}

/**
 * A model's words, read back out of a column, with the call that wrote them
 * named.
 *
 * THE SLOT IS WHAT BUYS THE EXEMPTION. `data-copy="stored"` on its own used to
 * silence rule (c) over a node's text for nothing; the contract now requires a
 * `data-slot` that names a real entry in PROSE_POLICY, so the exemption is
 * checkable against the policy that decided it. A caller passes the slot its
 * words actually came from and never a convenient one.
 */
export function Stored({ slot, children }: { slot: string; children: ReactNode }) {
  return <span data-copy="stored" data-slot={slot}>{children}</span>
}

/** The words the artefact holds itself to, printed on the page rather than
 *  kept in a comment. Italic on screen and on paper; plain in an email, where
 *  italic at 11.5px is unreadable in half the clients. */
export function Rule({ children, mode = 'app' }: { children: ReactNode; mode?: RenderMode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 10 }}>{children}</div>
  }
  return <p className="m-0 mt-2.5 text-[11.5px] italic text-muted-foreground">{children}</p>
}
