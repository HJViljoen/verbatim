import type { GlossaryKey } from '../calibration'
import type { NavKey } from '../nav'

/**
 * How to read (Phase 1 WP16, design ST9) — one card per surface, plus the
 * thirteen words and a reading path.
 *
 * THE GUIDE'S REPLACEMENT, AND ITS CORRECTION. The old Guide had four sections
 * per page (what it tells you · how to read it · what to do with it each week ·
 * what it can't tell you) and its Settings card carried a false claim: "search
 * terms … are changed by us on request, not from this page", while the same
 * rail rendered a term editor the client had been able to save since
 * 2026-09-11. That sentence is not carried forward. The Guide's own header
 * comment forbade it — "every behavioural claim here must match the code" — and
 * so does AGENTS.md.
 *
 * ONE CARD PER SURFACE, KEYED BY `NavKey`, so a page cannot be described here
 * and be missing from the shell, or be in the shell and undescribed. The
 * TITLE and the QUESTION are not repeated: they come from `lib/nav.ts`, which
 * is the one table that owns them.
 *
 * `read` names GLOSSARY keys rather than spelling definitions out, so a word
 * means the same thing here as it does in the "How to read this page" legend
 * and on the tile it sits under.
 *
 * Pure data. A test asserts one card per surface and that every key is real.
 */

export interface ReadingCard {
  key: NavKey
  /** What the surface tells you, in one sentence. */
  tells: string
  /** How to read it: the words it prints, defined once in the glossary. */
  read: GlossaryKey[]
  /** What it cannot tell you. The half a reader needs most and asks for least. */
  cannot: string[]
}

export const READING_CARDS: readonly ReadingCard[] = [
  {
    key: 'overview',
    tells: 'Where you stand this month: how much conversation there was, how your subjects read against the category and against each named rival, what grew and faded, what you said you would do, and what the reading rests on.',
    read: ['month', 'video', 'audience', 'level', 'change'],
    cannot: [
      'It is a reading of a calendar month, and the current one is still filling — every figure on it moves until thirty days after the month ends, and the page says which month and as at when.',
      'It cannot tell you why anything moved. A number and a reason are different claims, and only one of them is counted.',
    ],
  },
  {
    key: 'subjects',
    tells: 'How the conversation reads on each of the five to eight things you told us you care about — your share of it, the category’s, and each rival’s, month by month.',
    read: ['subject', 'level', 'change', 'direction'],
    cannot: [
      'A subject is counted by the same rule a theme is, which means it counts what people SAID, not what they bought.',
      'A subject we cannot yet spot accurately enough prints no share at all rather than a share we do not trust.',
    ],
  },
  {
    key: 'voice',
    tells: 'Who is saying what: the themes the category keeps returning to, the words your customers use for them, and the people behind each one.',
    read: ['theme', 'kind', 'video', 'gone_quiet'],
    cannot: [
      'The grouping into themes is ours and it can change. When it does, the line says so, and two months either side of a change are not like for like.',
      'A theme heard in one video is kept for the record and never headlines.',
    ],
  },
  {
    key: 'market',
    tells: 'What to do about it, and whether what you already did worked: the moves you declared, dated by you, read against the audiences you did not touch.',
    read: ['move', 'change', 'level'],
    cannot: [
      'A move is your statement, not ours. We report what the conversation did after it, and we never claim your move caused it.',
      'Advice here is grounded in what people said, not in your sales figures.',
    ],
  },
  {
    key: 'competitive',
    tells: 'Who else is in this conversation and how each named rival reads against you, on the same subjects and the same months.',
    read: ['rival', 'audience', 'level', 'change'],
    cannot: [
      'Share here is share of the conversation we read, never market share.',
      'A rival that leaves the tracked set ends its line with a break, never a fall to zero — and a rival renamed is one line with the rename marked on it.',
    ],
  },
  {
    key: 'week',
    tells: 'What needs attention this week: anything unusual against the last three complete months, what came in, what is worth a reply, and what worked.',
    read: ['week', 'update', 'new'],
    cannot: [
      'A week is seven days inside a month and is never a period of its own — it is always printed beside the month it is stated against.',
      'Most weeks nothing is unusual, and the page says so rather than finding something.',
    ],
  },
  {
    key: 'ask',
    tells: 'Your own question, answered from what your customers actually said, with the quotes attached.',
    read: ['video', 'month'],
    cannot: [
      'It cannot invent evidence. "We do not have this" is a real answer and you will get it.',
      'It answers against the update named on the answer, not against this minute.',
    ],
  },
  {
    key: 'reports',
    tells: 'The documents: the weekly report, the monthly reading, the quarterly review and the briefs — each as it was sent, and each linked back into the pages it came from.',
    read: ['update', 'month'],
    cannot: [
      'A sent document keeps the figures it was sent with. Where a still-filling month has moved since, the page prints both numbers rather than quietly correcting one.',
    ],
  },
  {
    key: 'settings',
    tells: 'What we track for you, what we read your market against, how ready each part of the product is for this workspace, the record of everything we did and changed, and who receives what.',
    read: [],
    cannot: [
      'Platforms and how deeply we read each video drive cost and quality, so they are set with you and changed on request. Your search terms are yours — owners and admins edit them here.',
      'Stopping something is never a zero. A rival you stop tracking, or a subject you stop, ends its line with a break and keeps the months it already carries.',
    ],
  },
]

/** A path through the product on the three clocks it actually keeps. The
 *  Guide's "what to do with it each week" was one list per page and answered a
 *  question nobody asked in that order; a reader arrives on a cadence. */
export const READING_PATH: readonly { when: string; what: string[] }[] = [
  {
    when: 'Each week',
    what: [
      'Open This week. Most weeks it says nothing is unusual, and that is the answer.',
      'Answer what is worth a reply while the comments are still warm.',
    ],
  },
  {
    when: 'Each month, once the month is done',
    what: [
      'Read the monthly reading: your subjects against the category and against each rival, on the month just ended.',
      'Declare what you are going to do about it on Market, so next month can be read against it.',
      'A month keeps filling for thirty days after it ends. Before that, every figure on it is still moving and says so.',
    ],
  },
  {
    when: 'Each quarter',
    what: [
      'Read the quarterly review: three months together, what we flagged and what each turned out to be, and what we could not settle.',
      'Check Readiness and the record — that is where the limits of everything above are written down.',
    ],
  },
]
