import { describe, expect, it } from 'vitest'
import { STARTER_TEMPLATES, instantiate, starterTemplate, starterTemplates, templateKeys } from './templates'
import { isStaticKey } from './compose'
import { ALL_SECTION_PAGES } from './types'

describe('starter templates', () => {
  it('name only static keys of their own page, and every audience is real', () => {
    // Six: four arrangements, the retiring digest, and the weekly REPORT, which
    // is an artefact composed from block keys and carries no sections at all
    // (Phase 1 WP17).
    expect(STARTER_TEMPLATES.map((t) => t.key)).toEqual(['weekly_report', 'weekly_digest', 'monthly_marketing_review', 'leadership_one_pager', 'sales_objections_competitors', 'content_what_to_make_next'])
    for (const t of STARTER_TEMPLATES) {
      for (const s of t.sections) {
        // ALL_, not SECTION_: the weekly digest and the leadership one-pager
        // name `dashboard`, which WP9 retired from the picker and kept
        // registered for the artefacts already built from them.
        expect(ALL_SECTION_PAGES).toContain(s.page)
        expect(s.page).not.toBe('agent')
        for (const k of s.keys ?? []) {
          expect(isStaticKey(k)).toBe(true)
          expect(k.startsWith(`${s.page}.`)).toBe(true)
        }
      }
    }
  })
  // D1: `voice.movers` is no longer registered by the Voice module, and the
  // Studio's picker is exactly that registry — a starter that still named it
  // stored a tile nobody could show and made the outline count "6 of 5 tiles".
  it('names no tile the pages no longer register while the direction words are gated off', () => {
    for (const t of STARTER_TEMPLATES) for (const s of t.sections) expect(s.keys ?? []).not.toContain('voice.movers')
    expect(templateKeys(['voice.map', 'voice.movers', 'voice.mood'], false)).toEqual(['voice.map', 'voice.mood'])
    expect(templateKeys(['voice.map', 'voice.movers'], true)).toEqual(['voice.map', 'voice.movers'])
    expect(templateKeys(['voice.movers'])).toEqual([]) // the shipped default
  })

  it('offers only what a report can actually be started from', () => {
    // A retired starter and an artefact both still RESOLVE — stored schedules
    // name them — and neither is ever handed to somebody starting a report.
    for (const t of starterTemplates()) {
      expect(t.retired).toBeFalsy()
      expect(t.artefact).toBeFalsy()
      expect(t.sections.length).toBeGreaterThan(0)
    }
  })

  it('instantiates with fresh ids', () => {
    const secs = instantiate(starterTemplate('leadership_one_pager')!.sections)
    expect(secs).toHaveLength(1)
    expect(secs[0].id).toMatch(/^[a-z0-9-]{8}$/)
  })
})
