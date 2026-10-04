import { cosine } from '../../pipeline/cluster'
import { stem } from '../../quote-gate'

// How close two texts are in MEANING (the fix pass, 4 Oct: "an item may only
// cite a point whose text it actually matches", "quote fit by meaning, not
// shared words"). Pure: the vectors are handed in.
//
// WHAT IS EMBEDDED, AND WHAT IS NOT. The writer's sentences, the research's
// paraphrases and each quote's INSIGHT description (Pass A's paraphrase of what
// the comment says), never a comment's words: nothing under lib/reports/ sends
// a comment's text to a model (AGENTS.md), so a quote's fit is its insight's
// fit, the week read's rule (lib/written/fit.ts).
//
// THREE MODES, so compose stays pure and runs twice:
//  · `collect`: every pair is "close" (1) and every text asked about is
//    recorded, so the first pass names the largest set the second may need;
//  · `vectors`: the cosine of the two embeddings; a text with no vector is
//    recorded and judged by its words meanwhile;
//  · `words`: shared specific stems over the smaller side, for the tests.

export type MeaningMode = 'collect' | 'vectors' | 'words'

/** Cosine floors, measured on the September runs (README: calibration). */
export const FIT = {
  /** An item carries a point's meaning. */
  item: 0.5,
  /** An In short sentence says something the brief printed. */
  summary: 0.55,
  /** Two items say the same thing (with shared videos). */
  same: 0.6,
  /** A quote's insight illustrates what it sits beside. */
  quote: 0.42,
} as const

export class Meaning {
  private readonly want = new Set<string>()

  constructor(
    private readonly vectors: ReadonlyMap<string, readonly number[]>,
    readonly mode: MeaningMode,
  ) {}

  /** How close `a` and `b` are, 0 to 1. */
  sim(a: string, b: string): number {
    const x = norm(a)
    const y = norm(b)
    if (!x || !y) return 0
    if (this.mode === 'collect') { this.want.add(x); this.want.add(y); return 1 }
    if (this.mode === 'words') return wordsSim(x, y)
    const vx = this.vectors.get(x)
    const vy = this.vectors.get(y)
    if (!vx || !vy) {
      if (!vx) this.want.add(x)
      if (!vy) this.want.add(y)
      return wordsSim(x, y)
    }
    return cosine(vx as number[], vy as number[])
  }

  /** The closest of several texts to `a`. */
  best(a: string, others: readonly string[]): number {
    let top = 0
    for (const o of others) top = Math.max(top, this.sim(a, o))
    return top
  }

  /** Texts asked about that had no vector. */
  wanted(): string[] {
    return [...this.want]
  }
}

/** The key a text is embedded under: whitespace folded. */
export const norm = (s: string): string => (s ?? '').replace(/\s+/g, ' ').trim()

/** Shared specific stems over the smaller side. Pure. */
export function wordsSim(a: string, b: string): number {
  const A = stemsOf(a)
  const B = stemsOf(b)
  if (A.size === 0 || B.size === 0) return 0
  let n = 0
  for (const s of A) if (B.has(s)) n += 1
  return n / Math.min(A.size, B.size)
}

const WORD = /[\p{L}]{4,}/gu
const FILLER = new Set([
  'that', 'this', 'with', 'they', 'them', 'their', 'there', 'when', 'what', 'which', 'from', 'have', 'into', 'about', 'than', 'then', 'also',
  'more', 'some', 'only', 'just', 'over', 'even', 'very', 'will', 'would', 'could', 'should', 'does', 'were', 'been', 'being', 'your', 'ours',
  'like', 'love', 'want', 'wanna', 'need', 'make', 'made', 'know', 'think', 'really', 'much', 'many', 'good', 'great', 'nice', 'look', 'looks',
  'people', 'thing', 'things', 'well', 'back', 'best', 'never', 'always', 'every', 'here', 'where', 'other', 'because', 'thank', 'thanks',
  'these', 'those', 'such', 'each', 'both', 'most', 'after', 'before', 'while', 'doing', 'done', 'going', 'gets', 'getting', 'makes', 'using', 'used',
  'uses', 'wants', 'went', 'come', 'came', 'take', 'took', 'give', 'gave', 'sure', 'lots', 'kind', 'actually', 'pretty', 'maybe',
])

/** A text's content stems (four letters or more, filler out). Pure. */
export const stemsOf = (text: string): Set<string> =>
  new Set((text.toLowerCase().match(WORD) ?? []).filter((w) => !FILLER.has(w)).map(stem))
