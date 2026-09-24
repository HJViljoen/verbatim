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
    // NOT "what grew and faded": DIRECTION_WORDS_BY_READER is false for all
    // seven readers, so Overview prints a level and a banded change ("5.1 pts
    // down", "no clear change") and no direction word at all. Subjects is the
    // one Block B surface that earns one, and its card lists `direction`.
    tells: 'Where you stand this month: how much conversation there was, how your subjects read against the category and against each named rival, what moved most and by how much against its band, what you said you would do, and what the reading rests on.',
    read: ['month', 'video', 'audience', 'level', 'change'],
    cannot: [
      'It is a reading of a calendar month, and the page bar says which month and whether it is still filling.',
      'A video that names both you and a rival is counted in your audience only. How many did is in the record.',
      'It cannot tell you why anything moved. A number and a reason are different claims, and only one of them is counted.',
    ],
  },
  {
    key: 'subjects',
    tells: 'How the conversation reads on each of the five to eight things you told us you care about: your share of it, the category’s, and each rival’s, month by month.',
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
      'Whether a theme\'s members were re-read in a month is not recorded yet, so a change that is really a re-reading cannot be marked.',
      'A video can carry more than one kind, and a commenter more than one group, so those counts overlap and do not sum to a whole.',
      'A theme heard in one video is kept for the record and never headlines.',
    ],
  },
  {
    key: 'market',
    tells: 'What to do about it, and whether what you already did worked: the moves you declared, dated by you, read against the audiences you did not touch.',
    read: ['move', 'change', 'level', 'new'],
    cannot: [
      'A move is your statement, not ours. We report what the conversation did after it, and we never claim your move caused it.',
      'A move is read from the month after it was dated, so its first comparison lands one reading later, and it is read beside the audiences you did not touch, never against them.',
      'What the conversation did after you acted on advice is compared only once two months have been read in your audience since you decided. The month you decided in is on neither side.',
      'Advice here is grounded in what people said, not in your sales figures.',
    ],
  },
  {
    key: 'competitive',
    tells: 'Who else is in this conversation and how each named rival reads against you, on the same subjects and the same months.',
    read: ['rival', 'audience', 'level', 'change'],
    cannot: [
      'Share here is share of the conversation we read, never market share.',
      'A video that names both you and a rival is counted in your audience only, so it is in no rival\'s share.',
    ],
  },
  {
    key: 'week',
    tells: 'What needs attention this week: anything unusual against the last three complete months, what came in, what is worth a reply, and what worked.',
    read: ['week', 'update'],
    cannot: [
      'A week is seven days inside a month and is never a period of its own. Every number on it is the month so far, against the three months before it; the week is how much of that arrived since the last update.',
      'Themes are re-grouped over everything we have read for you at every update, so most names first heard in an update are the same conversation under a different label. They are named only once they carry enough videos in the month.',
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
    tells: 'The documents: the weekly report, the monthly reading, the quarterly review and the briefs, each as it was sent, and each linked back into the pages it came from.',
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
      'Platforms and how deeply we read each video drive cost and quality, so they are set with you and changed on request. Your search terms are yours: owners and admins edit them here.',
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
    ],
  },
  {
    when: 'Each quarter',
    what: [
      'Read the quarterly review: three months together, what we flagged and what each turned out to be, and what we could not settle.',
      'Check Readiness and the record: that is where the limits of everything above are written down.',
    ],
  },
]

/**
 * Definitions (copy de-clutter, 2026-09-24, ruling M). The explanations that
 * used to be printed beside figures on every visit live here once, each under
 * a stable id so a legend or a tooltip can link straight to it. Plain words,
 * one paragraph each; every threshold is the one the code applies.
 */
export interface Definition {
  /** The anchor on Settings › How to read. Stable: links point at it. */
  id: string
  title: string
  body: string
}

export const DEFINITIONS: readonly Definition[] = [
  {
    id: 'soundness',
    title: 'How sound is this',
    body: 'The line in every page bar: how many updates and videos stand behind the page, and whether anything we track changed. Click it for the record behind it: how deeply each video was read, what was set aside, and which comparisons were refused.',
  },
  {
    id: 'all-time',
    title: 'Counted over everything we have read for you',
    body: 'Some figures are not about one month. The videos behind a conclusion or a piece of advice, and how deeply we read each video, are counted over everything we have read for you up to the month on the page, so they can be larger than that month.',
  },
  {
    id: 'floor',
    title: 'The floor',
    body: 'A change is banded only when each side carries at least 100 videos and at least 10 carry the thing measured; below that it reads too few to compare. A month under 100 videos is below the floor: it has not filled up, which is not a failure. A group of commenters is named only where at least 3 videos carry it, a head-to-head row or a rival’s questions need 10 videos, and a theme first heard in an update is named only once it carries 10 videos in the month.',
  },
  {
    id: 'frozen-live',
    title: 'Frozen and live',
    body: 'A month keeps filling for thirty days after it ends and is marked still filling until then; after that it is frozen and never rewritten. A sent or exported document keeps the figures it was built with. The quoted voices in it are read live, so a comment that is withdrawn never travels.',
  },
  {
    id: 'read-at-setup',
    title: 'Read at setup',
    body: 'Months that had already closed when we started were read back at setup. They are a reading of what we hold today, not what we would have reported at the time, and a chart marks them.',
  },
  {
    id: 'reddit',
    title: 'The Reddit cap',
    body: 'Reddit comments are read to 40 per thread and no deeper. A Reddit post has no views, so it carries no engagement rate and is in no engagement row.',
  },
  {
    id: 'new',
    title: 'New',
    body: 'New means there is no earlier month in our record in which the theme behind it was mentioned, in your audience or in the category. It is a fact about the record, not a direction.',
  },
]
