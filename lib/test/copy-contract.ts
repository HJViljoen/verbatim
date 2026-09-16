import type { ReactNode } from 'react'
import { render, markupText } from './render'
import { DIRECTION_WORDS as CALIBRATED_DIRECTION_WORDS, FRAMED } from '../calibration'
import { PROSE_POLICY, type ProseSlot } from '../prose/scrub'

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
//       unreadable, "Dominant · 21 of 36 videos" is a measurement. (The
//       noun: a reading surface counts videos — the thirteen words — while
//       `conversations` stays on the legacy pages that still compute it.)
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
//     <span data-copy="level">Dominant · 21 of 36 videos</span>
//     <span data-copy="verdict">up 4 pts since August</span>
//     <p data-copy="stored" data-slot="pass_d_b_recommendation">{row.title}</p>
//     <h3 data-copy="subject" data-slot="pass_b_theme">{theme.label}</h3>
//
// A `figure` nested inside a `prose` is the normal case and is how rule (a)
// stays satisfiable: the checker takes each prose node's OWN words — the text
// of every marked descendant removed — so code's number is code's, and the
// model's sentence around it is checked bare.
//
// The marker goes on an element that OPENS AND CLOSES — never a void, never a
// self-closed tag, which open no scope and hold no words. A `data-copy` the
// scanner cannot resolve into a node is reported (`unscanned-marker`) rather
// than skipped, because a rule that silently does not apply is worse than one
// that fails.
//
// Unmarked markup is not exempt from rule (c): a direction word anywhere on a
// block that is not inside a verdict node fails, which is the point — the rule
// is about the whole page, not about the nodes someone remembered to mark.
//
// ---- `stored`, and why it exists (Phase 1 WP14) -----------------------------
//
// `prose` means "the model wrote this HERE, for this page, and code composed
// the sentence around it" — the interpretation, the brief, the cover. Rules (a)
// and (c) are exactly right for that node, and the figure tokens make them
// satisfiable.
//
// `stored` is the OTHER kind of model prose, and the product is full of it: a
// recommendation's title, a market insight's description, a question insight's
// words, a say-vs-hear claim. Those strings were written by a model call at
// some past update, adjudicated THEN by that call's slot policy
// (lib/prose/scrub.ts PROSE_POLICY), and read back out of a column here. Two
// things follow, and both were live defects on Market and Competitive before
// this kind existed:
//
//   · RULE (a) CANNOT BE RE-RUN AT RENDER. The digit rule's escape hatch is
//     `allowTokens` — product names that carry a digit, mined from THAT RUN's
//     own inputs (3R80, C-Leg 4, Allpa 32L). A renderer holds no run and no
//     allow-list, so re-checking digits here can only produce false positives
//     on names it has no way to recognise. Measured on production: "Viewers
//     ask about the specific prosthetic model shown (3r85 or 3r80)" and
//     "backpacks like the Cotopaxi Allpa 32L" both fail rule (a) and both are
//     correct copy. So a `stored` node is exempt from (a); the slot's own
//     scrubber is where a fabricated figure is caught, at write time.
//   · RULE (c) APPLIES ONLY WHERE THE SLOT RUNS IT. `PROSE_POLICY` gives the
//     recommendation, insight and question slots `digits` and NOT `direction`,
//     on a measured trade written down beside the table: on a recommendation
//     "Increase" is an imperative addressed to the reader ("Increase Content
//     Volume to Improve Share of Voice"), not a claim that something is going
//     up, and deleting one recommendation in fifteen to catch four leaks is
//     the wrong trade. A render-time rule that deletes what the write-time
//     policy deliberately keeps is the product enforcing two different
//     contracts on one string. So a `stored` node is excised from the rule (c)
//     sweep exactly when its slot's policy is `none` or `digits` — and NOT
//     when the policy is `direction` or `both`, where the sentence should
//     already have been deleted before storage and a direction word means the
//     scrubber failed.
//
// THE EXEMPTION NAMES ITSELF. A `stored` node MUST carry `data-slot` naming a
// slot in `PROSE_SLOTS`, so the exemption is auditable — a reader sees which
// model call wrote the words and can look up what was adjudicated. A `stored`
// node with no slot, or an unknown one, is a violation (`unknown-slot`) and not
// a quiet pass: this is an escape hatch, and an escape hatch nobody can see the
// shape of is just a hole.

/** The attribute a block marks a node with. */
export const COPY_ATTR = 'data-copy'

/** The attribute a `stored` node names its model call with. */
export const SLOT_ATTR = 'data-slot'

/**
 * `subject` is a fifth kind, and it is the copy contract catching up with the
 * PROSE POLICY TABLE (Phase 1 WP13).
 *
 * `lib/prose/scrub.ts` PROSE_POLICY already decides, per model slot, which
 * rules that slot's words get — and two slots are deliberately NOT
 * direction-scrubbed: `pass_b_theme` ('none': a theme's label and its
 * description) and `pass_e_persona` ('digits', never 'direction'). The reason
 * is written there and it is false-positive class 2 in lib/calibration.ts: in
 * those slots a direction word is almost always about the SUBJECT rather than
 * about a reading. Production says so out loud — Össur's cast is described as
 * helping people "keep dignity and momentum" and stopped by "pain, falls, slow
 * progress", and Sealand's by an "emotional pull [that] fades fast". Not one
 * of those is a claim that anything moved, and no word list can tell them
 * apart from one that is.
 *
 * So rule (c) was failing three correct sentences on every render, and the
 * only ways out were to scrub words the product's own policy says not to
 * scrub, or to stop printing the model's description of the group. `subject`
 * is the third way: a node whose words are the model's about the thing itself,
 * exempt from the direction rule and — matching `pass_b_theme`'s 'none' — from
 * the digit rule too, because "a 16-inch laptop sleeve" is a legitimate theme
 * label. What it is NOT exempt from is an unsubstituted `[[n]]` token, which is
 * a defect in every slot there is.
 *
 * It is narrow on purpose. `prose` stays the default for everything a model
 * writes ABOUT a reading — a brief, a cover, an interpretation — and those are
 * exactly the slots PROSE_POLICY marks 'both'.
 *
 * AND A `subject` NODE CARRIES THE MODEL'S WORDS AND NOTHING ELSE. The
 * exemption cuts the node's whole range out of rule (c)'s block-wide scan, so
 * a node that also wraps a heading, a label or a sentence CODE wrote is a
 * place a real direction word can sit unmarked. A block marks the model's
 * value, not the row it sits in: `<span>Drives</span> <span
 * data-copy="subject">{persona.wants}</span>`, never one marked node around
 * both. VO4's cast was written the wrong way round and is the reason this
 * paragraph exists.
 */
export type CopyKind = 'prose' | 'figure' | 'level' | 'verdict' | 'subject' | 'stored'

const KINDS: readonly CopyKind[] = ['prose', 'figure', 'level', 'verdict', 'subject', 'stored']

/** Does this slot's write-time policy delete an unearned direction sentence?
 *  Where it does, rule (c) still applies to its stored words. */
const runsDirectionRule = (slot: string): boolean =>
  PROSE_POLICY[slot as ProseSlot] === 'direction' || PROSE_POLICY[slot as ProseSlot] === 'both'

export interface CopyNode {
  kind: CopyKind
  /** Every word the node renders, marked descendants included. */
  text: string
  /** The node's own words — the text of every marked descendant removed. */
  ownText: string
  /** The model call that wrote these words, on a `stored` node. Null anywhere
   *  else, where provenance is the page's own. */
  slot: string | null
}

export type CopyRule =
  | 'prose-digit' | 'prose-figure-token' | 'level-denominator' | 'direction-word'
  | 'unknown-kind' | 'unscanned-marker' | 'unknown-slot'

export interface CopyViolation {
  rule: CopyRule
  /** The words that failed, so a failure names the sentence and not a line number. */
  text: string
  detail: string
}

/**
 * Movement vocabulary, whole-word and case-insensitive — THE SAME LIST the
 * prose scrubber matches on (lib/calibration.ts). It was a second copy for one
 * WP and the two drifted 64 words apart, which is the drift the shared list
 * exists to make impossible: a word added to one of them was not added to the
 * other, and the block contract and the model scrubber then disagreed about
 * what a direction word is.
 *
 * MINUS THE FRAMED THREE. `up`, `down` and `new` count as claims only inside a
 * movement frame ("moved up", "up 4 points", "new this month"), which
 * `directionHits` can check and a flat regex over rendered copy cannot — the
 * product's ordinary copy says "where each one turns up" and "the new socket".
 * They belong to rule (c) in spirit and are gated instead by
 * `directionWordsFor('dashboard.themes')` (lib/config.ts).
 *
 * Bare `rise` and `fall` are absent from the shared list itself, for the same
 * reason and with the reason written there.
 */
export const DIRECTION_WORDS: readonly string[] =
  CALIBRATED_DIRECTION_WORDS.filter((w) => !FRAMED.has(w))

/**
 * A fresh matcher each call, never one shared `/g` regex: `lastIndex` survives
 * a call, so a caller that loops over an exported instance and forgets to
 * reset it skips matches — non-deterministically, which is the worst way for a
 * contract to fail.
 */
export function directionRe(): RegExp {
  return new RegExp(`\\b(${DIRECTION_WORDS.join('|')})\\b`, 'gi')
}

/** A level's evidence: "of" followed by a number, with or without separators. */
const DENOMINATOR_RE = /\bof\s+[\d][\d,.   ]*\d*\b/i

/** Void elements have no closing tag, so they never open a scope. */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

const TAG_RE = /<(\/?)([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g

interface Marked {
  kind: CopyKind
  /** `data-slot`, verbatim, or null. */
  slot: string | null
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
  slot: string | null
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
          found.push({ kind: open.kind, slot: open.slot, start: open.start, innerStart: open.innerStart, innerEnd: m.index, end: m.index + whole.length })
        }
      }
      continue
    }

    if (selfClose || VOID.has(name)) continue
    stack.push({ name, kind: kindOf(attrs), slot: slotOf(attrs), start: m.index, innerStart: m.index + whole.length })
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
      slot: n.slot,
      text: markupText(clean.slice(n.innerStart, n.innerEnd)),
      ownText: markupText(cut(clean, n.innerStart, n.innerEnd, outer.map((c) => [c.start, c.end] as [number, number]))),
    }
  })
}

/** The attribute in any of the three spellings HTML allows. Double quotes are
 *  all `renderToStaticMarkup` ever emits, but a hand-written fixture reaches
 *  for single ones, and a marker the reader cannot SEE is a rule that silently
 *  does not apply. */
function markerRe(flags: string, attr: string = COPY_ATTR): RegExp {
  return new RegExp(`${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, flags)
}

function markerValue(m: RegExpExecArray): string {
  return (m[1] ?? m[2] ?? m[3] ?? '').trim()
}

function kindOf(attrs: string): CopyKind | null {
  const m = markerRe('i').exec(attrs)
  const value = m ? markerValue(m) : undefined
  return value && (KINDS as readonly string[]).includes(value) ? (value as CopyKind) : null
}

/** `data-slot`, verbatim. Never validated here — an unknown slot has to reach
 *  `copyViolations` to be REPORTED, and a slot silently dropped to null would
 *  read as "no slot declared", which is a different sentence. */
function slotOf(attrs: string): string | null {
  const m = markerRe('i', SLOT_ATTR).exec(attrs)
  return m ? markerValue(m) || null : null
}

/** The declared `data-copy` values a block used, valid or not — so an
 *  unrecognised kind is a violation rather than silence. */
function declaredKinds(markup: string): string[] {
  const out: string[] = []
  const re = markerRe('gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(markup)) !== null) out.push(markerValue(m))
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

  const declared = declaredKinds(markup)
  for (const kind of declared) {
    if (!(KINDS as readonly string[]).includes(kind)) {
      bad.push({ rule: 'unknown-kind', text: kind, detail: `${COPY_ATTR}="${kind}" is not one of ${KINDS.join(', ')}` })
    }
  }

  // The marker itself has to be counted, not trusted. A `data-copy` the scanner
  // cannot resolve into a node — on a void or self-closed element, or on a tag
  // that is never closed — would otherwise be skipped by every rule in
  // silence, which is the wrong direction for a contract to fail in.
  const resolvable = declared.filter((k) => (KINDS as readonly string[]).includes(k)).length
  if (nodes.length < resolvable) {
    bad.push({
      rule: 'unscanned-marker',
      text: markupText(markup).slice(0, 80),
      detail: `${resolvable} ${COPY_ATTR} marker${resolvable === 1 ? '' : 's'} declared but only ${nodes.length} node${nodes.length === 1 ? '' : 's'} resolved — mark an element that opens and closes, never a void or a self-closed tag`,
    })
  }

  for (const n of nodes) {
    // AN UNSUBSTITUTED FIGURE TOKEN IS A DEFECT WHOEVER WROTE THE WORDS.
    // `subject` and `prose` were checked and `stored` was not, so the two kinds
    // were exempt from opposite halves of the contract for no stated reason —
    // and `[[n]]` on a page is the same broken sentence in all three.
    if ((n.kind === 'subject' || n.kind === 'stored') && n.ownText.includes('[[n]]')) {
      bad.push({ rule: 'prose-figure-token', text: n.ownText, detail: 'an unsubstituted [[n]] figure token reached the page' })
    }
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
    // A `subject` node buys a rule-(c) exemption on the same terms a `stored`
    // one does: by naming the model call that wrote the words. It used to buy
    // it for nothing, so any node anywhere could silence rule (c) on its own
    // text by declaring data-copy="subject" with nothing recording why. The
    // five that exist are all `pass_b_theme` or `pass_e_persona`, and both are
    // slots the prose policy never direction-scrubs — which is the whole
    // argument for the kind, and is now written down on each node.
    if ((n.kind === 'stored' || n.kind === 'subject') && !(n.slot != null && n.slot in PROSE_POLICY)) {
      bad.push({
        rule: 'unknown-slot',
        text: n.text.slice(0, 80),
        detail: n.slot == null
          ? `${COPY_ATTR}="stored" with no ${SLOT_ATTR} — name the prose slot that wrote these words`
          : `${SLOT_ATTR}="${n.slot}" is not a slot in PROSE_SLOTS (lib/prose/scrub.ts)`,
      })
    }
  }

  // (c) The whole block, minus the verdict nodes that are allowed the word and
  // the verdict nodes that are allowed the word, the subject nodes the prose
  // policy table exempts (see `CopyKind`) and the stored nodes whose slot
  // policy never ran the rule (see the header).
  let rest = markup
  const marked = scan(markup)
  // A SUBJECT NODE IS EXEMPT ON THE SAME TERMS A STORED ONE IS, and used to be
  // exempt on none: `n.kind === 'subject'` alone let any node anywhere silence
  // rule (c) over its own text with nothing recording why. Both kinds now have
  // to name a prose slot whose policy never ran the direction rule — which is
  // exactly what makes the exemption checkable against PROSE_POLICY.
  //
  // The two predicates being identical is the merge note's own observation ("a
  // `stored` node carrying data-slot='pass_b_theme' is what a `subject` node
  // is"). Folding the two kinds into one is a later, separate change; this
  // closes the hole without rewriting VO4's markup a second time.
  const exempt = marked.filter(
    (n) =>
      n.kind === 'verdict' ||
      ((n.kind === 'stored' || n.kind === 'subject') &&
        n.slot != null && n.slot in PROSE_POLICY && !runsDirectionRule(n.slot)),
  )
  const outermost = exempt.filter((n) => !exempt.some((p) => p !== n && n.start >= p.start && n.end <= p.end))
  for (const n of [...outermost].sort((x, y) => y.start - x.start)) rest = rest.slice(0, n.start) + ' ' + rest.slice(n.end)
  const restText = markupText(rest)
  const re = directionRe()
  const seen = new Set<string>()
  let d: RegExpExecArray | null
  while ((d = re.exec(restText)) !== null) {
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
