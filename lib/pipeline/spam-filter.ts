import type { CommentRow } from './types'

// Pre-Pass-A spam / low-signal filter (Architecture/Analysis-Passes
// §Pre-Pass-A Filter). Raises Pass A input density and cuts token cost — a real
// audit found ~30–50% of TikTok comments are emoji-only, generic, or spam.
//
// This does NOT delete comments. Flagged ones get comments.is_low_signal = true
// (still visible in raw drill-down on the Voice of Customer page); only the
// kept set is sent to Pass A.
//
// Short comments (2026-06-29): the old `length < 10` blanket rule cut ~23% of all
// comments, but a sample showed that bucket is mostly real signal — short
// sentiment ("Amazing", "obsessed", "hermoso") and purchase intent ("I want it",
// "Price", "Link") — sitting next to a small set of contentless engagement junk
// ("first", "fyp", "Pp"). Sentiment vocab is huge + multilingual, engagement junk
// is small + finite, so we KEEP short comments by default and DENYLIST the junk
// (cut 1–2 char micro-noise + SHORT_NOISE tokens). Keeping the ≥5-comment bar
// intact, this ~doubled the analysable corpus on a short-praise-rich D2C brand
// without lowering the quality threshold. Questions ("?") are always kept.

const SPAM_PATTERNS = [
  'check my repost', 'check my page', 'check my profile', 'dm me', 'dm to',
  'follow me back', 'follow back', 'follow me', 'free followers', 'promo code',
  'click my bio', 'link in bio', 'visit my', 'sub to my',
]

// Contentless engagement / filler tokens — noise ONLY as the whole comment
// (normalized exact-match). Kept tight: a denylist errs toward keeping, and the
// cost of over-cutting real sentiment ("nice", "wow") is worse than letting a
// little junk through (it's inert in Pass A's insight extraction anyway).
const SHORT_NOISE = new Set([
  'first', 'first fyp', 'fyp', '1st',
  'lol', 'lmao', 'lmfao', 'haha', 'hahaha', 'hehe',
  'hey', 'hii', 'heyy', 'hello', 'yo', 'sup',
  'okay', 'bro',
])

// "Pure emoji / symbols / whitespace" — no letter or digit anywhere.
const EMOJI_OR_SYMBOL_ONLY = /^[^\p{L}\p{N}]+$/u
// "@mention / URL / whitespace only" — nothing else of substance.
const MENTION_OR_URL_ONLY = /^(?:@[\w.]+|https?:\/\/\S+|www\.\S+|\s)+$/u

export interface LowSignalFlag {
  id: string
  reason: 'too_short' | 'low_value' | 'emoji_only' | 'mention_or_url_only' | 'spam_pattern' | 'duplicate'
}

export interface FilterResult {
  kept: CommentRow[]
  lowSignal: LowSignalFlag[]
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Filter one video's comments. `seenByAuthor` dedups repeated text from the
 * same author within the video (bot signal).
 */
export function filterComments(comments: CommentRow[]): FilterResult {
  const kept: CommentRow[] = []
  const lowSignal: LowSignalFlag[] = []
  const seenByAuthor = new Set<string>()

  for (const c of comments) {
    const raw = (c.text ?? '').trim()
    const norm = normalize(raw)
    const hasQuestion = raw.includes('?')

    let reason: LowSignalFlag['reason'] | null = null

    if (raw.length === 0) {
      reason = 'too_short'
    } else if (norm.length < 3 && !hasQuestion) {
      // 1–2 char micro-noise ("Pp", "k", "xd") — almost never substance.
      reason = 'too_short'
    } else if (!hasQuestion && SHORT_NOISE.has(norm)) {
      // Contentless engagement token ("first", "fyp", "lol"). Short sentiment
      // ("wow", "nice", "amazing", "hermoso") is NOT here, so it survives.
      reason = 'low_value'
    } else if (EMOJI_OR_SYMBOL_ONLY.test(raw)) {
      reason = 'emoji_only'
    } else if (MENTION_OR_URL_ONLY.test(raw)) {
      reason = 'mention_or_url_only'
    } else if (SPAM_PATTERNS.some((p) => norm.includes(p))) {
      reason = 'spam_pattern'
    } else {
      const dupKey = `${c.author ?? ''}::${norm}`
      if (seenByAuthor.has(dupKey)) {
        reason = 'duplicate'
      } else {
        seenByAuthor.add(dupKey)
      }
    }

    if (reason) {
      lowSignal.push({ id: c.id, reason })
    } else {
      kept.push(c)
    }
  }

  return { kept, lowSignal }
}
