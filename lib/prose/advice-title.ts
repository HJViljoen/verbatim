// A piece of advice's title where its stored one is blank (the parity fix,
// 14 Oct). Pass D-b's title goes through its slot's scrub
// (`pass_d_b_recommendation`, lib/prose/scrub.ts), which drops a sentence
// whole where it holds a digit the model typed, so a title that was one such
// sentence is stored empty: one of Össur's current pieces of advice (12 Oct)
// is, and every surface named it "A piece of advice with no title". The
// advice's body (its reasoning, through the same scrub) is the model's own
// words about the same advice, so its first clause names it.
//
// ONE RULE, two callers: the pipeline (lib/pipeline/pass-d.ts, so no new row
// stores a blank title where the body says something) and every surface that
// names a piece of advice (lib/pages/v2/advice-words.ts `adviceTitle`, for the
// rows already stored). Pure and import-free: both sides take it.

/** About how long a title made from the body may be, in characters. */
export const DERIVED_TITLE_MAX = 70

/** Sentence ends and clause breaks a first clause stops at: a full stop, a
 *  question or exclamation mark, a semicolon or a colon, each before a space
 *  or the end, or a spaced dash. */
const CLAUSE_END = /^(.+?)(?:[.!?;:](?=\s|$)|\s[-–—]\s)/u

const TRAILING = /[\s,;:.·\-–—]+$/u

/**
 * The body's first clause, as a title: whitespace folded, cut at the first
 * sentence end or clause break, then, where it is still longer than `max`, on
 * the last word boundary that fits with an ellipsis. Null where the body is
 * blank. Never longer than `max` characters. Pure.
 */
export function titleFromBody(body: string | null | undefined, max = DERIVED_TITLE_MAX): string | null {
  const text = (body ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const m = CLAUSE_END.exec(text)
  const clause = (m ? m[1] : text).replace(TRAILING, '').trim()
  if (!clause) return null
  if (clause.length <= max) return clause
  let out = ''
  for (const word of clause.split(' ')) {
    const next = out ? `${out} ${word}` : word
    if (next.length > max - 1) break
    out = next
  }
  // One word longer than the whole measure: cut inside it.
  const cut = (out || clause.slice(0, max - 1)).replace(TRAILING, '')
  return `${cut}…`
}

/** The title a piece of advice is named by: its stored title, else its
 *  body's first clause (`titleFromBody`), else null (both blank). Pure. */
export function titleOrBody(title: string | null | undefined, body: string | null | undefined): string | null {
  return (title ?? '').trim() || titleFromBody(body)
}
