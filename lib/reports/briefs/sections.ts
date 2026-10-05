import { foldText, names } from '../../agent/scope'
import { POOL_MIN_VIDEOS } from '../../written/pool'
import type { BriefItem, BriefRole, BriefSection, SectionKey } from './types'

// The role sections (pure). Point 2 of the rebuild: the sections are where
// the four briefs differ, and every one of them is written. The 30 Sep drafts
// printed the same borrowed sheets in three briefs (the month, the category
// table, the method sheet) and never wrote the pages that set a role apart
// (say vs hear, the leadership standing page, who is buying).
//
// WHAT PRINTS. A section prints when it has something to say, and only then
// (§0a.2: no empty section, no placeholder, no "nothing this month" line):
//  · an item written from the research prints only on `ITEM_MIN_VIDEOS`
//    distinct counted videos across the points it rests on, so no item rests
//    on one thread ("rests on 7 conversations, three of its five points on one
//    each", the 30 Sep Leadership regarded answer). Three: the week pool's own
//    floor for a theme (`POOL_MIN_VIDEOS`, lib/written/pool.ts). An item rests
//    only on the cited points whose meaning it carries (compose.ts), and its
//    count comes from those;
//  · an item that names a brand (the company or a rival) rests on at least
//    `BRAND_MIN_VIDEOS` videos ABOUT that brand: the Alpine Sea video was
//    credited to Sealand, and a market-wide complaint was pinned on Ottobock;
//  · an item that says what one of the brief's own findings says (half or
//    more of its points are the finding's) is held: the reader would read it
//    twice;
//  · a rival item prints only for a rival the tenant tracks AND that a cited
//    point names, so a tenant whose rivals were never talked about gets no
//    rival section rather than an invented one;
//  · a section with no item that stands is dropped, and the held list says
//    why (the operator's, never the reader's).
// A tracked subject prints with what people say about it (§0a.2's first
// exception); a subject with nothing said prints nothing, not its bare name
// (the review, 4 Oct: a list of names says nothing).

/** Distinct counted videos an item needs to print: the week pool's floor. */
export const ITEM_MIN_VIDEOS = POOL_MIN_VIDEOS
/** Videos about a brand an item that names it needs. */
export const BRAND_MIN_VIDEOS = POOL_MIN_VIDEOS

export interface SectionSpec {
  key: SectionKey
  /** `{company}` is filled in. */
  title: string
  /** Written from the research, or counted in code. */
  source: 'writer' | 'code'
}

export const ROLE_SECTIONS: Readonly<Record<BriefRole, readonly SectionSpec[]>> = {
  sales: [
    { key: 'sales.buyers', title: 'Who is buying', source: 'writer' },
    { key: 'sales.deciders', title: 'Who else is in the decision', source: 'writer' },
    { key: 'sales.stops', title: 'What stops them', source: 'writer' },
    { key: 'sales.settle', title: 'What they want settled first', source: 'writer' },
    { key: 'sales.triggers', title: 'What tips them into buying', source: 'writer' },
    { key: 'sales.rivals', title: 'What each rival is bought for', source: 'writer' },
    { key: 'sales.care', title: 'Language to handle with care', source: 'writer' },
  ],
  marketing: [
    { key: 'marketing.believe', title: 'What the market believes, and what it doubts', source: 'writer' },
    { key: 'marketing.words', title: 'In its own words', source: 'writer' },
    { key: 'marketing.say_hear', title: 'What {company} says, and what comes back', source: 'writer' },
    { key: 'marketing.recall', title: 'How {company} is remembered', source: 'writer' },
    { key: 'marketing.rivals', title: 'How the rivals are heard', source: 'writer' },
  ],
  content: [
    { key: 'content.questions', title: 'The questions people ask', source: 'writer' },
    { key: 'content.formats', title: 'What works in the market\'s videos', source: 'code' },
    { key: 'content.watch', title: 'What comments say about the videos', source: 'writer' },
    { key: 'content.more', title: 'What people want to be shown', source: 'writer' },
    { key: 'content.confusion', title: 'Where the confusion starts', source: 'writer' },
    { key: 'content.borrow', title: 'Words to borrow', source: 'code' },
  ],
  leadership: [
    { key: 'leadership.market', title: 'Where the market stands', source: 'code' },
    { key: 'leadership.shares', title: 'Where {company} stands', source: 'code' },
    { key: 'leadership.weigh', title: 'What buyers weigh, and what makes them switch', source: 'writer' },
    { key: 'leadership.risks', title: 'The risks, in business terms', source: 'writer' },
    { key: 'leadership.decisions', title: 'Questions for the business', source: 'writer' },
  ],
}

/** Where the findings print: after this section, or straight after In short
 *  (null). Leadership opens on where the market and the company stand. */
export const FINDINGS_AFTER: Readonly<Record<BriefRole, SectionKey | null>> = {
  sales: null,
  marketing: null,
  content: null,
  leadership: 'leadership.shares',
}

export const sectionTitle = (spec: Pick<SectionSpec, 'title'>, company: string): string => spec.title.replace(/\{company\}/g, company)

/** Does an item have enough behind it to print? */
export const itemStands = (videos: number): boolean => videos >= ITEM_MIN_VIDEOS

/**
 * The tracked rival an item is about, or null where it is about none the
 * tenant tracks or no cited point names it. Accents and case folded ("Ossur"
 * for "Össur"), the Ask agent's own matcher. Pure.
 */
export function groundedRival(name: string, tracked: readonly string[], pointTexts: readonly string[]): string | null {
  const want = foldText(name).trim()
  const rival = tracked.find((r) => foldText(r).trim() === want) ?? null
  if (!rival) return null
  return pointTexts.some((t) => names(t, rival)) ? rival : null
}

/** A section's items, counted across its groups. */
export const itemCount = (s: Pick<BriefSection, 'groups'>): number => s.groups.reduce((n, g) => n + g.items.length, 0)

/** A section with something to say: an item, or a line code counted. */
export const sectionSays = (s: Pick<BriefSection, 'groups' | 'lines' | 'voices'>): boolean =>
  itemCount(s) > 0 || (s.lines?.length ?? 0) > 0 || (s.voices?.length ?? 0) > 0

/**
 * The sections a role's brief prints, in the role's order: those with
 * something to say. Every other section is held with the reason. Pure.
 */
export function selectRoleSections(
  role: BriefRole,
  built: Partial<Record<SectionKey, BriefSection | null>>,
): { sections: BriefSection[]; held: { what: string; reason: string }[] } {
  const sections: BriefSection[] = []
  const held: { what: string; reason: string }[] = []
  for (const spec of ROLE_SECTIONS[role]) {
    const s = built[spec.key]
    if (!s) { held.push({ what: spec.key, reason: 'no material for it this month' }); continue }
    const groups = s.groups.map((g) => ({ ...g, items: g.items.filter((i) => i.text.trim()) })).filter((g) => g.items.length > 0)
    const kept = { ...s, groups }
    if (!sectionSays(kept)) { held.push({ what: spec.key, reason: 'nothing in it stood' }); continue }
    sections.push(kept)
  }
  return { sections, held }
}

/** Items that stand, and the ones that do not with why. Pure. */
export function standingItems(items: readonly (BriefItem & { videos: number })[]): { kept: BriefItem[]; held: { what: string; reason: string }[] } {
  const kept: BriefItem[] = []
  const held: { what: string; reason: string }[] = []
  for (const i of items) {
    if (!i.text.trim()) continue
    if (!itemStands(i.videos)) { held.push({ what: i.title ?? i.text.slice(0, 80), reason: `too little behind it (${i.videos} videos)` }); continue }
    kept.push(i)
  }
  return { kept, held }
}
