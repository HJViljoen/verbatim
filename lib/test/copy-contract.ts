import type { ReactNode } from 'react'
import { render, markupText } from './render'

// The copy-and-figures contract every block is tested against, from WP10 on
// (Phase 1 WP0, decision X). Three rules, and they are the three the product
// has actually broken before:
//
//   (a) NO DIGIT IN A MODEL-PROSE NODE. The model explains, code rates
//       (lib/calibration.ts). Pass D-a already writes its brief with a `[[n]]`
//       token where a figure belongs and render substitutes the authoritative
//       value (lib/pipeline/narrative.ts FIGURE_TOKEN, lib/dashboard-
//       narrative.ts) — so a digit that reaches the page inside model prose
//       and NOT inside a figure node is a number the model typed, which is the
//       one thing that contract exists to stop.
//   (b) EVERY LEVEL PRINTS "of N". A calibrated word without its denominator
//       is a score, and this product shows no scores: "Dominant" alone is
//       unreadable, "Dominant · 21 of 36 conversations" is a measurement.
//   (c) NO DIRECTION WORD OUTSIDE A VERDICT NODE. D1 (AGENTS.md): gaining and
//       fading compare two readings of one cumulative corpus taken at two
//       arbitrary moments. A direction word is legitimate only where a verdict
//       computed it from a period reading with an n and a band, so it may
//       appear only inside a node marked as that verdict.
//
// THE MARKER. A block declares which of its nodes are which with one
// attribute, `data-copy`, on the element that wraps the words:
//
//     <p data-copy="prose">{brief.before}<span data-copy="figure">21</span>{brief.after}</p>
//     <span data-copy="level">Dominant · 21 of 36 conversations</span>
//     <span data-copy="verdict">up 4 pts since August</span>
//
// A `figure` nested inside a `prose` is the normal case and is how rule (a)
// stays satisfiable: the checker takes each prose node's OWN words — the text
// of every marked descendant removed — so code's number is code's, and the
// model's sentence around it is checked bare.
//
// Unmarked markup is not exempt from rule (c): a direction word anywhere on a
// block that is not inside a verdict node fails, which is the point — the rule
// is about the whole page, not about the nodes someone remembered to mark.

/** The attribute a block marks a node with. */
export const COPY_ATTR = 'data-copy'

export type CopyKind = 'prose' | 'figure' | 'level' | 'verdict'

const KINDS: readonly CopyKind[] = ['prose', 'figure', 'level', 'verdict']

export interface CopyNode {
  kind: CopyKind
  /** Every word the node renders, marked descendants included. */
  text: string
  /** The node's own words — the text of every marked descendant removed. */
  ownText: string
}

export type CopyRule = 'prose-digit' | 'prose-figure-token' | 'level-denominator' | 'direction-word' | 'unknown-kind'

export interface CopyViolation {
  rule: CopyRule
  /** The words that failed, so a failure names the sentence and not a line number. */
  text: string
  detail: string
}

/**
 * Movement vocabulary, whole-word and case-insensitive. Deliberately NOT here:
 * bare "up" and "down", which the product's ordinary copy uses without
 * claiming a direction ("where each one turns up"), and "new", which is a word
 * before it is a chip. Both belong to rule (c) in spirit; neither can be
 * caught by a word list without failing honest copy, so the New chip stays
 * gated by `directionWordsFor('dashboard.themes')` instead (lib/config.ts).
 */
export const DIRECTION_WORDS = [
  'gaining', 'gained', 'gains', 'fading', 'faded', 'fades',
  'rising', 'rises', 'risen', 'rose', 'falling', 'falls', 'fallen',
  'climbing', 'climbed', 'slipping', 'slipped', 'surging', 'surged',
  'growing', 'grew', 'shrinking', 'shrank', 'shrunk',
  'accelerating', 'decelerating', 'trending', 'trended',
  'upward', 'downward', 'uptick', 'downtick', 'momentum',
  'increase', 'increased', 'increases', 'increasing',
  'decrease', 'decreased', 'decreases', 'decreasing',
]

export const DIRECTION_RE = new RegExp(`\\b(${DIRECTION_WORDS.join('|')})\\b`, 'gi')

/** A level's evidence: "of" followed by a number, with or without separators. */
const DENOMINATOR_RE = /\bof\s+[\d][\d,.   ]*\d*\b/i

/** Void elements have no closing tag, so they never open a scope. */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

const TAG_RE = /<(\/?)([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g

interface Marked {
  kind: CopyKind
  /** Index of the opening tag. */
  start: number
  /** Index just past the opening tag. */
  innerStart: number
  /** Index of the closing tag. */
  innerEnd: number
  /** Index just past the closing tag. */
  end: number
}

interface Open {
  name: string
  kind: CopyKind | null
  start: number
  innerStart: number
}

/**
 * Every marked element in a markup string, with its ranges, outermost first.
 * A tiny scanner rather than a parser: the tier has no jsdom and no new
 * dependency, and `renderToStaticMarkup` emits well-formed markup with every
 * void element self-closed, which is all this needs to be right about.
 */
function scan(markup: string): Marked[] {
  const stack: Open[] = []
  const found: Marked[] = []

  TAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TAG_RE.exec(markup)) !== null) {
    const [whole, closing, rawName, attrs, selfClose] = m
    const name = rawName.toLowerCase()

    if (closing) {
      // Pop to the nearest matching open tag; anything skipped was unclosed.
      const back = [...stack].reverse().findIndex((o) => o.name === name)
      if (back === -1) continue
      const depth = stack.length - 1 - back
      while (stack.length > depth) {
        const open = stack.pop()!
        if (open.kind) {
          found.push({ kind: open.kind, start: open.start, innerStart: open.innerStart, innerEnd: m.index, end: m.index + whole.length })
        }
      }
      continue
    }

    if (selfClose || VOID.has(name)) continue
    stack.push({ name, kind: kindOf(attrs), start: m.index, innerStart: m.index + whole.length })
  }

  return found.sort((a, b) => a.start - b.start)
}

/** Every `data-copy` node in a markup string, outermost first. */
export function copyNodes(markup: string): CopyNode[] {
  const clean = markup.replace(/<!--[\s\S]*?-->/g, '')
  const marked = scan(clean)
  return marked.map((n) => {
    const children = marked.filter((c) => c !== n && c.start >= n.innerStart && c.end <= n.innerEnd)
    // Only the OUTERMOST marked descendants are cut; a grandchild is already
    // inside the range its parent removes.
    const outer = children.filter((c) => !children.some((p) => p !== c && c.start >= p.start && c.end <= p.end))
    return {
      kind: n.kind,
      text: markupText(clean.slice(n.innerStart, n.innerEnd)),
      ownText: markupText(cut(clean, n.innerStart, n.innerEnd, outer.map((c) => [c.start, c.end] as [number, number]))),
    }
  })
}

function kindOf(attrs: string): CopyKind | null {
  const m = new RegExp(`${COPY_ATTR}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs)
  const value = m?.[1]?.trim()
  return value && (KINDS as readonly string[]).includes(value) ? (value as CopyKind) : null
}

/** The declared `data-copy` values a block used, valid or not — so an
 *  unrecognised kind is a violation rather than silence. */
function declaredKinds(markup: string): string[] {
  const out: string[] = []
  const re = new RegExp(`${COPY_ATTR}\\s*=\\s*"([^"]*)"`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(markup)) !== null) out.push(m[1].trim())
  return out
}

function cut(source: string, from: number, to: number, cuts: [number, number][]): string {
  if (!cuts.length) return source.slice(from, to)
  const inside = cuts.filter(([a, b]) => a >= from && b <= to).sort((a, b) => a[0] - b[0])
  let at = from
  let out = ''
  for (const [a, b] of inside) {
    if (a < at) continue
    out += source.slice(at, a)
    at = b
  }
  return out + source.slice(at, to)
}

/** Every rule a rendered block breaks. Empty means it keeps the contract. */
export function copyViolations(input: ReactNode | string): CopyViolation[] {
  const raw = typeof input === 'string' ? input : render(input)
  const markup = raw.replace(/<!--[\s\S]*?-->/g, '')
  const nodes = copyNodes(markup)
  const bad: CopyViolation[] = []

  for (const kind of declaredKinds(markup)) {
    if (!(KINDS as readonly string[]).includes(kind)) {
      bad.push({ rule: 'unknown-kind', text: kind, detail: `${COPY_ATTR}="${kind}" is not one of ${KINDS.join(', ')}` })
    }
  }

  for (const n of nodes) {
    if (n.kind === 'prose') {
      // (a) The model wrote this. Numbers are code's; a figure node carries them.
      if (n.ownText.includes('[[n]]')) {
        bad.push({ rule: 'prose-figure-token', text: n.ownText, detail: 'an unsubstituted [[n]] figure token reached the page' })
      }
      const digit = /\d/.exec(n.ownText)
      if (digit) {
        bad.push({ rule: 'prose-digit', text: n.ownText, detail: `a digit ("${digit[0]}") in model prose — wrap code's figure in ${COPY_ATTR}="figure"` })
      }
    }
    if (n.kind === 'level' && !DENOMINATOR_RE.test(n.text)) {
      bad.push({ rule: 'level-denominator', text: n.text, detail: 'a calibrated level with no "of N" — a word without its evidence is a score' })
    }
  }

  // (c) The whole block, minus the verdict nodes that are allowed the word.
  let rest = markup
  const verdicts = scan(markup).filter((n) => n.kind === 'verdict')
  const outermost = verdicts.filter((n) => !verdicts.some((p) => p !== n && n.start >= p.start && n.end <= p.end))
  for (const n of [...outermost].sort((x, y) => y.start - x.start)) rest = rest.slice(0, n.start) + ' ' + rest.slice(n.end)
  const restText = markupText(rest)
  DIRECTION_RE.lastIndex = 0
  const seen = new Set<string>()
  let d: RegExpExecArray | null
  while ((d = DIRECTION_RE.exec(restText)) !== null) {
    const word = d[1].toLowerCase()
    if (seen.has(word)) continue
    seen.add(word)
    bad.push({ rule: 'direction-word', text: context(restText, d.index), detail: `"${d[1]}" outside a ${COPY_ATTR}="verdict" node (D1)` })
  }

  return bad
}

/** Throw unless the rendered block keeps all three rules. The message names
 *  the sentence, so a failing block test reads like an edit note. */
export function assertCopyContract(input: ReactNode | string): void {
  const bad = copyViolations(input)
  if (!bad.length) return
  throw new Error(
    `copy contract: ${bad.length} violation${bad.length === 1 ? '' : 's'}\n` +
      bad.map((v) => `  [${v.rule}] ${v.detail}\n    …${v.text}…`).join('\n'),
  )
}

function context(text: string, at: number, radius = 40): string {
  return text.slice(Math.max(0, at - radius), Math.min(text.length, at + radius))
}
