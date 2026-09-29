import { isValidElement } from 'react'
import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { allAccountsVoiceFixture, ossurVoiceFixture, refusedVoiceFixture, voiceFixture } from './fixture'
import { voiceWhere } from './where'

// C6 · Where your market talks (market-first WP3.8, plan §2.4 C6), on
// staging's September: Sealand 469 accounts, 19 at the floor, 17 listed and 2
// set aside; Össur 248 accounts, 19 listed, no maker rule.

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, {})

describe('voiceWhere (C6)', () => {
  it('says how many accounts, how many at the floor, and the largest’s share of the month’s comments', () => {
    const text = renderText(voiceWhere.render(voiceFixture(), 'app', ctx))
    expect(text).toContain('469 accounts behind the category’s September videos; 19 of them with 3 or more videos.')
    // r/onebag: 701 of 15,792 category comments in September.
    expect(text).toContain('The largest holds 4% of 15,792 category comments in September.')
    // The look-back's base, not "months read" (finish-list item 9).
    expect(text).toMatch(/Seen in\s*months, of the last \d/)
    expect(text).not.toContain('months read')
  })

  it('lists the accounts at the floor by videos, per month, each with the months read it was seen in', () => {
    const text = renderText(voiceWhere.render(voiceFixture(), 'app', ctx))
    expect(text).toMatch(/r\/onebag\s*701 comments in September\s*28\s*2 of 3/)
    expect(text).toMatch(/r\/backpacks\s*15/)
    expect(text).toMatch(/ReBorn Creations\s*maker\s*9/)
    const at = ['r/onebag', 'r/backpacks', 'r/ManyBaggers', 'ReBorn Creations'].map((n) => text.indexOf(n))
    expect(at).toEqual([...at].sort((a, b) => a - b))
  })

  it('keeps the military-dog channel out of the list and counts it as set aside, naming neither it nor the search (WP3.8; default of 29 Sep)', () => {
    for (const data of [voiceFixture(), allAccountsVoiceFixture()]) {
      const w = data.where!
      expect(w.rows.map((r) => r.name)).not.toContain('Mike Ritland')
      expect(w.setAside.map((r) => r.name)).toContain('Mike Ritland')
      for (const mode of ['app', 'email'] as const) {
        const text = renderText(voiceWhere.render(data, mode, ctx))
        expect(text).not.toContain('Mike Ritland')
        expect(text).not.toContain('sealand gear')
        expect(text).toMatch(/Set aside as off-topic: \d+ accounts? with \d+ videos? about something else, left out of the list above\./)
      }
    }
  })

  it('prints the first ten and links to every account at the floor, and back', () => {
    const first = voiceFixture()
    expect(first.where!.rows).toHaveLength(10)
    expect(renderText(voiceWhere.render(first, 'app', ctx))).toContain('All 19 accounts')
    expect(render(voiceWhere.render(first, 'app', ctx))).toContain('href="/dashboard/voice?accounts=all#where"')
    const all = allAccountsVoiceFixture()
    expect(all.where!.rows).toHaveLength(17)
    expect(renderText(voiceWhere.render(all, 'app', ctx))).toContain('The 10 with the most videos')
    expect(render(voiceWhere.render(all, 'app', ctx))).toContain('href="/dashboard/voice#where"')
  })

  it('sets nothing aside and marks nothing where the tenant has no maker rule (Össur)', () => {
    const text = renderText(voiceWhere.render(ossurVoiceFixture(), 'app', ctx))
    expect(text).not.toContain('Set aside')
    expect(text).not.toContain('maker')
    expect(text).toContain('248 accounts behind the category’s September videos; 19 of them with 3 or more videos.')
  })

  it('says it was not read in the month’s own words', () => {
    expect(voiceWhere.emptyState(refusedVoiceFixture())).toBe('Where your market talks in September is not read yet.')
    expect(renderText(voiceWhere.render(refusedVoiceFixture(), 'app', ctx))).toContain('Where your market talks in September is not read yet.')
  })

  it('has its title alone in the header and at most a link in the footer (25 Sep rulings)', () => {
    for (const mode of MODES) {
      const el = voiceWhere.render(voiceFixture(), mode, ctx)
      expect(isValidElement(el) && el.type === BlockFrame).toBe(true)
      const props = (el as { props: { meta?: unknown; footerNote?: unknown } }).props
      expect(props.meta, mode).toBeUndefined()
      expect(props.footerNote, mode).toBeUndefined()
    }
    expect(render(voiceWhere.render(voiceFixture(), 'app', ctx))).toMatch(/<h2[^>]*>Where your market talks<\/h2>/)
  })

  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), ossurVoiceFixture(), refusedVoiceFixture(), allAccountsVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceWhere.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })
})
