import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL, tokenHex } from '@/lib/email/theme'
import { platformColour } from '@/components/profile-stats'
import { copyNodes, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { voiceCast } from './cast'
import { refusedVoiceFixture, voiceFixture } from './fixture'

// VO4 · the cast, current state only (Phase 1 WP13, decision W).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, {})

const draw = (data = voiceFixture(), mode: RenderMode = 'app') => renderText(voiceCast.render(data, mode, ctx))

describe('voiceCast', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), refusedVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceCast.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })

  it('prints the count and no share — there is no denominator the count is part of', () => {
    const text = draw()
    expect(text).toContain('The one-bag commuter 527 videos')
    expect(text).not.toMatch(/527 of /)
  })

  it('marks the model’s words as `subject` and leaves code’s labels outside the exemption', () => {
    // `subject` cuts its whole range out of rule (c), so a node wrapping a
    // label code wrote is a place a real direction word could hide. Every
    // subject node here is one stored sentence and nothing else.
    const markup = render(voiceCast.render(voiceFixture(), 'app', ctx))
    const subjects = copyNodes(markup).filter((n) => n.kind === 'subject')
    expect(subjects.length).toBeGreaterThan(0)
    for (const label of ['Drives', 'Stops', 'What made them look']) {
      expect(subjects.some((n) => n.text.includes(label)), label).toBe(false)
    }
    expect(draw()).toContain('Drives')
  })

  it('never calls its population "comments" — it is not a comment count', () => {
    // `insight_population` counts the points Pass A extracted and the
    // workspace holds: Össur's 3,129 against 10,534 comments in the September
    // category. "Comments" has a fixed meaning in this product's copy.
    const text = draw()
    expect(text).toContain('read over 3,129 separate points people made')
    expect(text).not.toContain("comments' worth")
  })

  it('paints the platform bar and its dots in a colour that exists', () => {
    // `var(--platform-tiktok)` is defined nowhere in the repo, so every
    // segment and every legend dot painted transparent: the artboard's
    // four-segment bar rendered as three mono percentages floating in a card.
    // `platformColour` is the product's one platform palette.
    const markup = render(voiceCast.render(voiceFixture(), 'app', ctx))
    expect(markup).not.toContain('var(--platform-')
    expect(markup).toContain(platformColour('tiktok'))
    expect(markup).toContain(platformColour('youtube'))
    // And the email arm resolves them to hex rather than painting four dots
    // the same muted grey.
    const email = render(voiceCast.render(voiceFixture(), 'email', ctx))
    expect(email).toContain(tokenHex(platformColour('tiktok')))
    expect(tokenHex(platformColour('tiktok'))).not.toBe(tokenHex(platformColour('youtube')))
  })

  it('says the groups overlap instead of taking a remainder from them', () => {
    expect(draw()).toContain('A video can carry more than one group, so these counts overlap and do not add up to a whole.')
  })

  it('says the group floor on the block rather than implying it, and what the block is a reading OF', () => {
    // PORTED (wave 2): the artboard's footer has two ends. The floor is about
    // which groups are named; the state is about the whole block, and is the
    // page's one exception to the comment clock. The mock's words for it —
    // "current state, not a trend" — cannot be printed: "trend" is on the
    // product's own direction list.
    expect(draw()).toContain('A group is named only where at least 3 videos carry it.')
    expect(draw()).toContain('this month as it stands, never compared with another month')
  })

  it('sets the groups as three cards abreast, the way the artboard does', () => {
    expect(render(voiceCast.render(voiceFixture(), 'app', ctx))).toContain('xl:grid-cols-3')
  })

  it('dates the cast by the update that wrote it — this block is the one exception on the page', () => {
    expect(draw()).toContain('Who is talking, as read on')
  })

  it('says when a later update has landed since the profile was written', () => {
    const base = voiceFixture()
    expect(draw({ ...base, cast: { ...base.cast, stale: true } })).toContain('a later update has landed since')
  })

  it('never prints the mock\u2019s "No persona 16%" line — it is a remainder of a partition these groups are not', () => {
    expect(draw()).not.toMatch(/No group was named on/)
    expect(draw()).not.toMatch(/No persona/)
  })

  it('keeps the crowd figure — decoration the owner chose, once per group', () => {
    const markup = render(voiceCast.render(voiceFixture(), 'app', ctx))
    // ONE per group, and one FIGURE per group: never the artboard's ten-icon
    // array with four filled, which is a share drawn as a picture.
    expect(markup.match(/<svg/g)).toHaveLength(voiceFixture().cast.personas.length)
  })

  it('does not rebuild "how the mix has moved", here or anywhere (cut #79)', () => {
    const text = draw()
    expect(text).not.toMatch(/how the mix/i)
    expect(text).not.toMatch(/over time/i)
  })

  it('omits the dropped-groups line rather than stubbing it (decision W)', () => {
    // `consumer_profiles.dropped` is unpopulated; a line saying "0 groups were
    // just below the floor" would be a false statement about the data.
    expect(draw()).not.toMatch(/below the floor this month/i)
  })

  it('tells "not switched on" apart from "too little conversation"', () => {
    expect(voiceCast.emptyState(refusedVoiceFixture()))
      .toBe('Reading who is talking is not switched on for this workspace yet.')
    const base = voiceFixture()
    const thin = {
      ...base,
      cast: { ...base.cast, state: 'no_personas' as const, personas: [], empty: 'Too little conversation in this update to describe who is talking.' },
    }
    expect(voiceCast.emptyState(thin)).toBe('Too little conversation in this update to describe who is talking.')
  })

  it('still prints the floor note when it has nothing to show — the floor is why', () => {
    expect(draw(refusedVoiceFixture())).toContain('A group is named only where at least 3 videos carry it')
  })

  it('declares one figure, and it is a count — the cast is a description, not a ladder', () => {
    const table = blockAnswers(voiceCast, voiceFixture()).figures
    expect(Object.keys(table)).toEqual(['cast_lead_videos'])
    expect(table.cast_lead_videos).toMatchObject({ value: 527, unit: 'videos' })
  })

  it('declares no verdicts at all: current state carries no comparison', () => {
    expect(blockAnswers(voiceCast, voiceFixture()).verdicts).toEqual([])
  })

  it('hands its voices up as refs', () => {
    expect(blockAnswers(voiceCast, voiceFixture()).quotes).toEqual(['e:9', 'e:10', 'e:11'])
  })

  it('keeps its key, which is a stored contract', () => {
    expect(voiceCast.key).toBe('voice.cast')
  })

  it('does not dress its floor sentence as a control', () => {
    // It was `<Link href={`${ctx.appUrl}/dashboard/voice#cast`}>` and in the
    // app `appUrl` is '' — a link to the page it is already on, wearing
    // `hover:underline`, in a footer slot the same page also fills with two
    // real links and an arrow. A sentence about how the reading was made is
    // not a destination.
    const markup = render(voiceCast.render(voiceFixture(), 'app', ctx))
    expect(markup).toContain('A group is named only where at least')
    expect(markup).not.toContain('/dashboard/voice#cast')
  })
})
