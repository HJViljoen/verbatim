import { describe, expect, it } from 'vitest'
import { filterComments } from './spam-filter'
import type { CommentRow } from './types'

// The pre-Pass-A gate. Everything it flags stays in the database
// (is_low_signal = true) and out of the model's input, so a mistake here is
// either money spent on junk or a real customer voice the analysis never sees.

let seq = 0
const c = (text: string | null, author: string | null = 'someone'): CommentRow => ({
  id: `c${++seq}`,
  client_id: 'client',
  run_id: 'run',
  platform: 'tiktok',
  video_id: 'v1',
  comment_id: null,
  author,
  text,
  likes: null,
})

const reasons = (rows: CommentRow[]) => filterComments(rows).lowSignal.map((l) => l.reason)
const keptText = (rows: CommentRow[]) => filterComments(rows).kept.map((k) => k.text)

describe('filterComments — the seven reasons', () => {
  it('flags an empty or whitespace-only comment too_short', () => {
    expect(reasons([c(''), c('   '), c(null)])).toEqual(['too_short', 'too_short', 'too_short'])
  })

  it('flags 1–2 character micro-noise too_short', () => {
    // The junk that sits next to real short sentiment: "Pp", "k", "xd".
    expect(reasons([c('Pp'), c('k'), c('xd')])).toEqual(['too_short', 'too_short', 'too_short'])
  })

  it('flags a contentless engagement token low_value', () => {
    expect(reasons([c('first'), c('fyp'), c('lol'), c('bro')]))
      .toEqual(['low_value', 'low_value', 'low_value', 'low_value'])
  })

  it('flags a comment with no letter or digit anywhere emoji_only', () => {
    expect(reasons([c('🔥🔥🔥'), c('!!!'), c('👏 👏'), c('❤️❤️')]))
      .toEqual(['emoji_only', 'emoji_only', 'emoji_only', 'emoji_only'])
  })

  it('classes a one-emoji comment too_short, not emoji_only — the short rule runs first', () => {
    // An emoji is 2 UTF-16 units, so a single one is under the 3-char floor and
    // never reaches the emoji branch. Same flag either way (is_low_signal), but
    // the reason is what a future audit of this filter would read.
    expect(reasons([c('🔥'), c('❤️')])).toEqual(['too_short', 'too_short'])
  })

  it('flags a comment that is only mentions or links mention_or_url_only', () => {
    expect(reasons([c('@jane @bob'), c('https://shop.example.com/x'), c('www.example.com')]))
      .toEqual(['mention_or_url_only', 'mention_or_url_only', 'mention_or_url_only'])
  })

  it('flags a self-promo phrase anywhere in the comment spam_pattern', () => {
    expect(reasons([c('Love these — dm me for a discount'), c('LINK IN BIO 🔥'), c('follow back pls')]))
      .toEqual(['spam_pattern', 'spam_pattern', 'spam_pattern'])
  })

  it('flags the same author saying the same thing twice duplicate, keeping the first', () => {
    const res = filterComments([c('these run so small', 'ann'), c('These  run so small', 'ann')])
    expect(res.kept.map((k) => k.id)).toEqual(['c' + (seq - 1)])
    expect(res.lowSignal).toEqual([{ id: 'c' + seq, reason: 'duplicate' }])
  })
})

describe('filterComments — what it must NOT cut', () => {
  it('keeps short sentiment, which the 2026-06-29 rule change exists to protect', () => {
    // The old blanket `length < 10` cut ~23% of all comments, mostly this.
    // SHORT_NOISE is a denylist for a reason: "wow" is not on it.
    expect(keptText([c('wow'), c('nice'), c('Amazing'), c('obsessed'), c('hermoso')]))
      .toEqual(['wow', 'nice', 'Amazing', 'obsessed', 'hermoso'])
  })

  it('keeps short purchase intent', () => {
    expect(keptText([c('Price'), c('Link'), c('I want it')])).toHaveLength(3)
  })

  it('exempts a question from both short rules', () => {
    // "k?" is two characters and "lol?" is on the noise list; both ask something.
    expect(filterComments([c('k?'), c('lol?')]).lowSignal).toEqual([])
  })

  it('does not exempt a bare "?" — the question mark carries the rule, not the meaning', () => {
    // The `?` escape only covers the two short rules. A lone "?" has no letter
    // or digit, so the emoji/symbol branch still takes it, and should: there is
    // no question in it to answer.
    expect(reasons([c('?')])).toEqual(['emoji_only'])
  })

  it('keeps emoji once there is a letter beside them', () => {
    expect(keptText([c('🔥 these boots 🔥'), c('10/10')])).toEqual(['🔥 these boots 🔥', '10/10'])
  })

  it('keeps a mention inside a real sentence', () => {
    expect(keptText([c('@jane you need these')])).toEqual(['@jane you need these'])
  })

  it('keeps the same text from two different authors — dedup is per author', () => {
    expect(keptText([c('same jacket here', 'ann'), c('same jacket here', 'bob')])).toHaveLength(2)
  })

  it('collapses two anonymous comments with the same text — worth a look, not a bug', () => {
    // The dedup key is `${author ?? ''}::${norm}`, so a null author makes every
    // anonymous commenter the same person. Two different people saying "love
    // these" under a platform that gave no handle: the second is dropped. Pinned
    // as the CURRENT behaviour, not endorsed — the alternative (keep both) risks
    // letting a bot through, and the trade is a policy call, not a fix to make
    // inside a debt sweep.
    expect(reasons([c('love these', null), c('love these', null)])).toEqual(['duplicate'])
  })

  it('scopes dedup to one call, so the same voice under another video is not a duplicate', () => {
    const first = filterComments([c('these run so small', 'ann')])
    const second = filterComments([c('these run so small', 'ann')])
    expect(first.lowSignal).toEqual([])
    expect(second.lowSignal).toEqual([])
  })
})

describe('filterComments — the invariant', () => {
  it('never drops a comment: every id appears exactly once across kept and lowSignal', () => {
    // The flagged rows are written back as is_low_signal = true and stay
    // visible in raw drill-down; a comment this function lost would be one the
    // client can no longer find.
    const rows = [
      c(''), c('Pp'), c('fyp'), c('🔥'), c('@jane'), c('dm me'),
      c('these run so small', 'ann'), c('these run so small', 'ann'),
      c('wow'), c('k?'), c('@jane you need these'),
    ]
    const { kept, lowSignal } = filterComments(rows)
    const seen = [...kept.map((k) => k.id), ...lowSignal.map((l) => l.id)].sort()
    expect(seen).toEqual(rows.map((r) => r.id).sort())
    expect(new Set(seen).size).toBe(rows.length)
  })

  it('takes the first matching reason, in branch order', () => {
    // "dm me" is also short, and an emoji-only string is also not a mention —
    // the chain is exclusive, so each comment carries exactly one reason.
    expect(reasons([c('🔥🔥🔥'), c('dm me')])).toEqual(['emoji_only', 'spam_pattern'])
  })

  it('returns empty arrays for no comments', () => {
    expect(filterComments([])).toEqual({ kept: [], lowSignal: [] })
  })
})
