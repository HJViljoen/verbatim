import { cosine, embedTexts } from '../pipeline/cluster'

// Your moves' advice, as a short list (walkthrough item 6, 29 Sep).
//
// WHAT WAS WRONG. The ledger drew 12 of 79 recommendations and offered "Show all
// 79". Pass D-b writes a fresh set every update and nothing merges or retires
// them, so about fifteen were the same "proof layer" idea reworded ("Publish a
// Sealand material passport", "Turn sustainability into a product proof
// system", "Put visible upcycling proof on product pages"…), and June's
// generic advice ("Emphasize Brand Stability and Avoid Controversial Topics",
// to an activist B Corp) was still on the page.
//
// SO THE DEFAULT IS THE CURRENT ADVICE, ONE ROW PER IDEA, AND A HANDFUL:
//
//   - CURRENT is what the latest update that carried advice raised, plus what
//     you have said you are working on. Everything else was not raised again
//     by the latest update: it is kept, one quiet link away, never deleted.
//   - ONE ROW PER IDEA. Two pieces of current advice that say the same thing
//     are one row, the one the ledger ranks higher. Older advice that says the
//     same thing as a current row is counted on it ("also raised in other
//     words"), which is what "Why we keep raising it" is about.
//   - "The same thing" is a cosine between embeddings of the title and its
//     argument, at or above `ADVICE_SAME_IDEA`. Advice you decided on is never
//     folded into another row.
//
// READ-TIME, AND FAIL-SOFT. The pipeline never merges or retires advice, and
// this does not either: it only decides what the page draws first. Without
// vectors (the embedding call failed or timed out) the current advice is drawn
// unmerged: the stale rows are still gone and nothing that should show is
// hidden.

/** How many ideas the default list draws: a handful. Five is a default
 *  (walkthrough, 29 Sep): Pass D-b raises five or six per update, so this is
 *  about one update's advice with its near-copies folded; 12 is the ledger's
 *  old page size. */
export const ADVICE_SHORTLIST = 5

/**
 * The cosine at or above which two pieces of advice are one idea, on
 * `text-embedding-3-small` vectors of "title. argument".
 *
 * MEASURED on the staging copy of Sealand's 69 recommendations (29 Sep): the
 * reworded proof-layer family pairs at 0.80-0.86 ("Put visible upcycling proof
 * on product pages" / "Turn Sealand's circular story into item-level proof"
 * 0.857, "Publish a material passport" / the same 0.813), and the nearest pair
 * that is two different actions sits just under the bar ("Put Sealand in
 * travel discovery channels" / "Add a fit and facts layer", 0.792). Titles
 * alone do not separate them (the brand name inflates every pair), so the
 * argument goes in with the title.
 */
export const ADVICE_SAME_IDEA = 0.8

/** What the shortlist needs of a ledger row. */
export interface ShortlistRow {
  lineageId: string
  status: string
  /** The row's newest copy is the latest advice-carrying update's. */
  inLatest?: boolean
}

export interface AdviceShortlist {
  /** The ideas drawn, in the ledger's order. */
  lineages: string[]
  /** Other pieces of advice counted on each drawn row: the same idea, in
   *  other words. */
  alsoRaised: Map<string, number>
  /** Every row not drawn. */
  earlier: number
}

/** The rows current enough to draw: raised by the latest update, or being
 *  worked on. In the ledger's order. */
export function currentAdvice<R extends ShortlistRow>(rows: readonly R[]): R[] {
  return rows.filter((r) => r.inLatest === true || r.status === 'in_progress')
}

/**
 * The short list. `rows` is the whole ledger in its own order (the current
 * recommendation first, then the newest). `vectorOf` names a row's vector;
 * null where there are none, and then nothing is merged.
 */
export function adviceShortlist<R extends ShortlistRow>(
  rows: readonly R[],
  vectorOf: ((lineageId: string) => readonly number[] | undefined) | null,
  opts: { shown?: number; threshold?: number } = {},
): AdviceShortlist {
  const shown = opts.shown ?? ADVICE_SHORTLIST
  const threshold = opts.threshold ?? ADVICE_SAME_IDEA
  const decided = (r: R) => r.status !== 'new'
  const score = (a: R, b: R): number => {
    const va = vectorOf?.(a.lineageId)
    const vb = vectorOf?.(b.lineageId)
    return va && vb ? cosine(va as number[], vb as number[]) : 0
  }

  const reps: R[] = []
  const alsoRaised = new Map<string, number>()
  const count = (r: R) => alsoRaised.set(r.lineageId, (alsoRaised.get(r.lineageId) ?? 0) + 1)
  const pool = currentAdvice(rows)
  const inPool = new Set(pool.map((r) => r.lineageId))
  for (const r of pool) {
    const rep = decided(r) ? undefined : reps.find((x) => !decided(x) && score(x, r) >= threshold)
    if (rep) count(rep)
    else reps.push(r)
  }
  // Older advice saying what a current row says is counted on the row it is
  // closest to, never drawn on its own.
  if (vectorOf) {
    for (const r of rows) {
      if (inPool.has(r.lineageId) || decided(r)) continue
      let best: R | null = null
      let bestScore = threshold
      for (const x of reps) {
        if (decided(x)) continue
        const s = score(x, r)
        if (s >= bestScore) { best = x; bestScore = s }
      }
      if (best) count(best)
    }
  }
  const lineages = reps.slice(0, shown).map((r) => r.lineageId)
  return { lineages, alsoRaised, earlier: rows.length - lineages.length }
}

// ── the vectors (I/O) ────────────────────────────────────────────────────────

/** How long the page waits for vectors before drawing the list unmerged. */
export const ADVICE_VECTOR_TIMEOUT_MS = 5000

/** Vectors already fetched, by the exact text embedded. A piece of advice's
 *  words never change once written, so a warm server embeds each once. */
const VECTOR_CACHE = new Map<string, number[]>()
const VECTOR_CACHE_MAX = 4000

/** The text a row is embedded by: its title and its argument. */
export const adviceText = (r: { title: string; why?: string | null }): string => `${r.title}. ${r.why ?? ''}`.trim()

/**
 * Each row's vector, by lineage, or null. One embedding call for whatever the
 * cache does not hold, raced against `ADVICE_VECTOR_TIMEOUT_MS`. NEVER throws:
 * a failure is logged and the page draws the list unmerged.
 */
export async function adviceVectors(
  rows: readonly { lineageId: string; title: string; why?: string | null }[],
): Promise<Map<string, number[]> | null> {
  if (rows.length === 0) return new Map()
  const texts = rows.map(adviceText)
  const missing = [...new Set(texts.filter((t) => !VECTOR_CACHE.has(t)))]
  try {
    if (missing.length > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ADVICE_VECTOR_TIMEOUT_MS) })
      const got = await Promise.race([embedTexts(missing), timeout]).finally(() => clearTimeout(timer))
      if (!got) {
        console.warn(`[pages] adviceVectors: no vectors inside ${ADVICE_VECTOR_TIMEOUT_MS} ms; the advice list is drawn unmerged`)
        return null
      }
      if (VECTOR_CACHE.size + missing.length > VECTOR_CACHE_MAX) VECTOR_CACHE.clear()
      missing.forEach((t, i) => VECTOR_CACHE.set(t, got[i]))
    }
    return new Map(rows.map((r, i) => [r.lineageId, VECTOR_CACHE.get(texts[i]) as number[]]))
  } catch (e) {
    console.warn(`[pages] adviceVectors: ${e instanceof Error ? e.message : String(e)}; the advice list is drawn unmerged`)
    return null
  }
}
