import { normForMatch } from './quote-match'

// Where a video's hook_text came from (WP7b M4, 2026-09-12).
//
// THE PROBLEM this solves. On-screen text is now eligible to be the hook, and
// that is right — on short-form video the hook is very often TYPED on the cover
// and never said out loud, which is the hole the whole feature exists to fill.
// But hook_text is one column with no provenance, so the moment cover text
// starts feeding it, hook_style distributions and every hook analytic shift for
// newly classified videos with nothing on the row to say why. A reader
// comparing this quarter to last would see a change in the audience where there
// was only a change in what we read.
//
// WHY IT IS DERIVED RATHER THAN ASKED FOR. The obvious implementation is to add
// a `hook_source` field to the model's output schema. That would change the
// response format of EVERY Pass A call, for every video — which is exactly the
// corpus-wide prompt change WP7b is built to avoid, and would force the
// prompt-version bump and full re-read the design spent its effort dodging.
//
// So it is computed instead, from the same verbatim matching the quote
// validator already trusts: the hook the model returned is looked up in the
// blocks the model was shown. No prompt change, no schema change, no bump, and
// it is deterministic — the same inputs always give the same answer.

export type HookSource = 'typed' | 'spoken' | 'caption'

/**
 * Which block the returned hook_text was copied out of.
 *
 * SPOKEN WINS TIES, deliberately. A hook that is both said aloud and printed on
 * the cover is common (the creator reads their own title card), and 'typed' is
 * the new, load-bearing label — the one a reader will use to explain a shift.
 * Awarding it only when the words appear NOWHERE but the frame keeps it a
 * strong signal instead of a fuzzy one.
 *
 * Null when the hook matches nothing it was shown: the model paraphrased, or
 * invented, or the source has since changed. Null is honest — better than
 * guessing a provenance for a string whose origin we cannot see.
 */
export function hookSource(
  hookText: string | null | undefined,
  blocks: { transcript?: string | null; ocr?: string | null; caption?: string | null },
): HookSource | null {
  const needle = normForMatch(hookText ?? '')
  if (!needle) return null
  if (contains(blocks.transcript, needle)) return 'spoken'
  // Per LINE, like the [o] evidence validator: the newlines separate text
  // blocks, and a "hook" welded from two cards is not a hook anyone wrote.
  if ((blocks.ocr ?? '').split('\n').some((line) => contains(line, needle))) return 'typed'
  if (contains(blocks.caption, needle)) return 'caption'
  return null
}

function contains(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false
  return normForMatch(haystack).includes(needle)
}
