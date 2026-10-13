import { SEALAND_CLIENT_ID } from '@/lib/config'
import type { SubjectSettingsRow } from '@/lib/settings/your-subjects'

// Settings › Your subjects: Sealand's set as the 1 Oct Subjects page read it
// (six followed) and two suggestions waiting, one from its own posts and one
// the category raised. Stored-row shape for the fake database, and the
// loader's shape for the view.

export const SUBJECTS_FIXTURE_CLIENT = SEALAND_CLIENT_ID

const sid = (n: number): string => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const ROWS: [string, string | null, 'active' | 'proposed', 'client' | 'own_claims' | 'category_theme'][] = [
  ['Durability', 'Whether the bag lasts: seams, zips, straps and the fabric after years of use.', 'active', 'client'],
  ['Recycled materials', 'What people say about bags made from sailcloth and other reused material.', 'active', 'client'],
  ['Waterproofing', 'Keeping what is inside dry, in rain and on the water.', 'active', 'client'],
  ['Looks & style', 'How the bags look, their colours and how they are worn.', 'active', 'category_theme'],
  ['Price', 'Whether the bags are worth what they cost.', 'active', 'client'],
  ['Comfort', 'How a bag carries: straps, back panels and weight on the body.', 'active', 'client'],
  ['Community & purpose', 'The people and the cause behind a brand.', 'proposed', 'own_claims'],
  ['Travel size rules', null, 'proposed', 'category_theme'],
]

/** The rows as `subjects` stores them. */
export function subjectsFixtureTable(): Record<string, unknown>[] {
  return ROWS.map(([name, description, status, origin], i) => ({
    id: sid(i + 1), client_id: SUBJECTS_FIXTURE_CLIENT, name, description, status, origin,
    named_at: `2026-09-${String(10 + i).padStart(2, '0')}T08:00:00.000Z`,
  }))
}

/** The same rows as the loader hands them on. */
export function subjectsFixtureRows(): SubjectSettingsRow[] {
  return subjectsFixtureTable().map((r) => ({
    id: r.id as string, name: r.name as string, description: r.description as string | null,
    status: r.status as 'active' | 'proposed', origin: r.origin as SubjectSettingsRow['origin'], namedAt: r.named_at as string,
  }))
}

export const fixtureSubjectId = sid
