import { z } from 'zod'

import { splitSentences } from '../../prose/scrub'
import type { Meaning } from './meaning'
import type { AllocatedIdea, BriefItem, BriefRole, MonthlyBriefData, SectionKey } from './types'
import { BRIEF_NAME, BRIEF_ROLES } from './types'

// ONE IDEA, ONE HOME, by what the words SAY (the fix pass, 4 Oct). The
// compose step catches an item resting on another idea's points or videos;
// it cannot catch one that says the same thing from other research (Sealand's
// durability six times, its rivals three times, Össur's fit and cost in all
// four briefs). Embeddings do not separate "says the same claim" from "touches
// the same topic" (measured on Sealand: a restatement scored 0.58, a
// different claim on the same material 0.63), so one structured call reads
// the set's PRINTED prose (the writer's words and the ideas' headlines; never
// a comment) and names, per item, the idea or the earlier item it restates.
// Code acts on the answer: an item restating its own brief's finding is held;
// one restating another brief's idea, or an item another brief printed
// first, keeps its first sentence and names that brief.

export const REPEATS_PROMPT_VERSION = 'brief_repeats_v3'
/** How far the judge's idea may sit below the closest idea in meaning. */
export const JUDGE_MARGIN = 0.05
/** How far the judge's same-as item may sit below the closest line in the
 *  other briefs. */
export const SAME_MARGIN = 0.1
/** How much of each finding the judge reads. */
export const REPEATS_IDEA_CHARS = 700

/** Sections whose lines are code's counts, or questions put to the business
 *  (asking is not saying it twice): never judged. */
const NOT_JUDGED: ReadonlySet<SectionKey> = new Set(['content.formats', 'content.borrow', 'leadership.shares', 'leadership.decisions'])

export interface RepeatItem {
  /** The short id the judge sees (R1, R2…). */
  id: string
  /** The stable key code acts on. */
  key: string
  role: BriefRole
  section: SectionKey
  text: string
}

export const itemKey = (role: BriefRole, section: SectionKey, i: Pick<BriefItem, 'title' | 'text'>): string =>
  `${role}|${section}|${(i.title ?? '').trim()}|${i.text.trim().slice(0, 60)}`

const said = (i: Pick<BriefItem, 'title' | 'text' | 'detail'>) => `${i.title ? `${i.title}. ` : ''}${i.text}${i.detail ? ` ${i.detail}` : ''}`

/** The items the judge reads: every untagged section item of the set, in
 *  role order. Pure. */
export function repeatItemsOf(briefs: readonly MonthlyBriefData[]): RepeatItem[] {
  const out: RepeatItem[] = []
  for (const role of BRIEF_ROLES) {
    const d = briefs.find((b) => b.role === role)
    if (!d) continue
    for (const s of d.sections) {
      if (NOT_JUDGED.has(s.key)) continue
      for (const g of s.groups) for (const i of g.items) {
        if (i.tag) continue
        out.push({ id: `R${out.length + 1}`, key: itemKey(role, s.key, i), role, section: s.key, text: said(i) })
      }
    }
  }
  return out
}

export const repeatsSchema = () => z.object({
  items: z.array(z.object({
    item: z.string().describe('The item id, as given (R1, R2...).'),
    restates_idea: z.string().describe('The id of the idea this item makes the same claim as (I1, I2...), or "" when none.'),
    same_as: z.string().describe('The id of an item in ANOTHER brief that makes the same claim, or "" when none.'),
  })),
})
export type RepeatsOutput = z.infer<ReturnType<typeof repeatsSchema>>

export function buildRepeatsPrompts(a: { ideas: readonly Pick<AllocatedIdea, 'id' | 'headline' | 'home'>[]; findings: ReadonlyMap<string, string>; items: readonly RepeatItem[] }): { system: string; user: string } {
  const system = [
    'You check a set of four department briefs (Sales, Marketing, Content, Leadership) written for one company about one month of talk in its market.',
    'Each idea of the month is argued in ONE brief only. Your job: find the items that say an idea again, or say again what an item in another brief says.',
    '',
    'For every item, answer two things:',
    '- restates_idea: the id of the idea whose CLAIM the item makes again: the same people saying or wanting the same thing about the same matter. An item that only shares a topic word with an idea, or that makes a different claim about the same material, does not restate it. Leave it "" when in doubt.',
    '- same_as: the id of an item in a DIFFERENT brief that makes the same claim (the same people, the same matter, the same thing said). Leave it "" when in doubt.',
    '',
    'Judge the claim, not the wording. Two items about the same rival restate each other only where they say the same thing about it.',
    'Answer for every item, in the order given.',
  ].join('\n')
  const user = [
    '## Ideas',
    ...a.ideas.map((i) => `${i.id} [${BRIEF_NAME[i.home]}] ${i.headline}${a.findings.get(i.id) ? `: ${a.findings.get(i.id)}` : ''}`),
    '',
    '## Items',
    ...a.items.map((i) => `${i.id} [${BRIEF_NAME[i.role]}, ${i.section.split('.')[1]}] ${i.text}`),
  ].join('\n')
  return { system, user }
}

export interface RepeatVerdict {
  key: string
  idea: string | null
  sameAs: string | null
}

/** The judge's answer as verdicts on item keys; ids it did not give, or gave
 *  wrong, are dropped. Pure. */
export function verdictsOf(out: RepeatsOutput | null, items: readonly RepeatItem[], ideas: readonly Pick<AllocatedIdea, 'id'>[]): RepeatVerdict[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const ideaIds = new Set(ideas.map((i) => i.id))
  const v: RepeatVerdict[] = []
  for (const r of out?.items ?? []) {
    const it = byId.get(String(r.item).trim().toUpperCase())
    if (!it) continue
    const idea = String(r.restates_idea ?? '').trim().toUpperCase()
    const same = byId.get(String(r.same_as ?? '').trim().toUpperCase())
    v.push({ key: it.key, idea: ideaIds.has(idea) ? idea : null, sameAs: same && same.role !== it.role ? same.key : null })
  }
  return v
}

/**
 * Acts on the verdicts, in role order (pure):
 *  · an item that restates its own brief's idea is held;
 *  · one that restates another brief's idea keeps its first sentence and
 *    "Argued in the X brief";
 *  · of two items in different briefs that say the same thing, the later
 *    brief's keeps its first sentence and "Also in the X brief";
 *  · a subject line (where the market stands) keeps its level: it is a
 *    one-liner already.
 */
export function applyRepeats(
  briefs: readonly MonthlyBriefData[],
  verdicts: readonly RepeatVerdict[],
  ideas: readonly Pick<AllocatedIdea, 'id' | 'headline' | 'home'>[],
  check?: { meaning: Meaning; texts: ReadonlyMap<string, string> },
): MonthlyBriefData[] {
  const byKey = new Map(verdicts.map((v) => [v.key, v]))
  // The judge names WHICH idea; meaning checks the name is plausible: an
  // idea further from the item than the closest idea by more than
  // `JUDGE_MARGIN` is a slip (Össur's "Cost & access" named the recent
  // amputees idea, not affordability), and the line is not tagged by it.
  const plausible = (text: string, ideaId: string): boolean => {
    if (!check) return true
    const sims = ideas.map((x) => ({ id: x.id, s: check.meaning.sim(text, check.texts.get(x.id) ?? x.headline) }))
    const top = Math.max(...sims.map((x) => x.s))
    return (sims.find((x) => x.id === ideaId)?.s ?? 0) >= top - JUDGE_MARGIN
  }
  const roleOfKey = (k: string) => k.split('|')[0] as BriefRole
  const order = (r: BriefRole) => BRIEF_ROLES.indexOf(r)
  // Same for a pair: the item named must be among the closest lines in the
  // other briefs (`SAME_MARGIN`); in one tenant's market every line shares
  // the topic, so no fixed floor separates a pair from a slip.
  const textOf = new Map(briefs.flatMap((d) => d.sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => [itemKey(d.role, s.key, i), said(i)] as [string, string])))))
  const pairPlausible = (a: string, b: string): boolean => {
    if (!check) return true
    const ta = textOf.get(a)
    const tb = textOf.get(b)
    if (!ta || !tb) return false
    const others = [...textOf.entries()].filter(([k]) => roleOfKey(k) !== roleOfKey(a)).map(([, t]) => check.meaning.sim(ta, t))
    const s = check.meaning.sim(ta, tb)
    return s > 0 && s >= Math.max(...others) - SAME_MARGIN
  }
  // A pair names the EARLIER brief on the later item, whichever side the
  // judge wrote it on.
  const alsoIn = new Map<string, BriefRole>()
  for (const v of verdicts) {
    if (!v.sameAs || !pairPlausible(v.key, v.sameAs)) continue
    const [a, b] = [v.key, v.sameAs].sort((x, y) => order(roleOfKey(x)) - order(roleOfKey(y)))
    if (!alsoIn.has(b)) alsoIn.set(b, roleOfKey(a))
  }
  return briefs.map((d) => {
    const held = [...d.held]
    const sections = d.sections.map((s) => ({
      ...s,
      groups: s.groups.map((g) => ({
        ...g,
        items: g.items.flatMap((i): BriefItem[] => {
          if (i.tag || NOT_JUDGED.has(s.key)) return [i]
          const key = itemKey(d.role, s.key, i)
          const v = byKey.get(key)
          const idea = v?.idea && plausible(said(i), v.idea) ? ideas.find((x) => x.id === v.idea) : undefined
          const subjectLine = s.key === 'leadership.market'
          if (idea && idea.home === d.role) {
            if (subjectLine) return [i]
            held.push({ what: `${s.key}: ${(i.title ?? i.text).slice(0, 60)}`, reason: `says what the finding "${idea.headline}" says` })
            return []
          }
          const tag = idea ? `Argued in the ${BRIEF_NAME[idea.home]}` : alsoIn.has(key) ? `Also in the ${BRIEF_NAME[alsoIn.get(key)!]}` : null
          if (!tag) return [i]
          if (subjectLine) return [{ ...i, tag }]
          const out: BriefItem = { ...i, text: splitSentences(i.text)[0] ?? i.text, tag }
          delete out.detail
          return [out]
        }),
      })).filter((g) => g.items.length > 0 || (g.lines?.length ?? 0) > 0),
    })).map((s) => {
      // A section left with only lines naming other briefs keeps no voice:
      // its quote illustrated what is now argued elsewhere.
      if (!s.quote || s.groups.some((g) => g.items.some((i) => !i.tag))) return s
      const out = { ...s }
      delete out.quote
      return out
    }).filter((s) => s.groups.length > 0 || (s.voices?.length ?? 0) > 0)
    return { ...d, sections, held }
  })
}
