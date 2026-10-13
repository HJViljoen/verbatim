import { describe, expect, it } from 'vitest'

import { PROSE_POLICY } from '../prose/scrub'
import { IDEA_FIELD_MAX, MEDICAL_CLAIMS, medicalHits, MOVEMENT, scrubIdeaText } from './scrub'

// The post ideas' scrub (T13): a figure is code's, a medical claim is never
// stored, the conversation is never said to move, and the market's own words
// survive (a liner that keeps slipping, a lower-limb socket, drop foot).

describe('the post_idea slot in the prose policy table', () => {
  it('is `digits`, on the recommendation\'s precedent: a suggestion and a question, never a reading', () => {
    expect(PROSE_POLICY.post_idea).toBe('digits')
  })
})

describe('medicalHits: never a medical or clinical claim', () => {
  const claims: [string, string][] = [
    ['Silicone liners heal skin irritation within days.', 'cures'],
    ['Wearing the liner overnight prevents swelling.', 'effect on the body'],
    ['A gel liner reduces phantom limb pain.', 'effect on the body'],
    ['The wrong socket causes blisters and sores.', 'effect on the body'],
    ['This knee helps with back pain on long walks.', 'effect on the body'],
    ['Showering with the leg on is completely safe.', 'safety'],
    ['The prosthetic is safe for swimming in the sea.', 'safety'],
    ['A microprocessor knee is clinically proven to cut falls.', 'proven or recommended'],
    ['Prosthetists recommend replacing the liner every season.', 'proven or recommended'],
    ['Redness that lasts is a sign of infection.', 'diagnosis'],
    ['Take ibuprofen for the ache after a long day.', 'medicine'],
    ['Check with your medical team before changing anything.', 'the medical team line'],
    ['See your prosthetist about any rubbing.', 'sent to a doctor'],
    // The fresh check's cases (13 Oct): each was kept before.
    ['A microprocessor knee lowers the risk of falls on uneven ground.', 'effect on the body'],
    ['A good liner cuts the risk of skin breakdown.', 'effect on the body'],
    ['A vacuum socket protects the skin.', 'effect on the body'],
    ['The Rheo Knee improves gait and reduces strain on the hips.', 'effect on the body'],
    ['The Pro-Flex foot is gentler on the knees.', 'kind to the body'],
    ['A powered ankle is safer on slopes.', 'safety'],
    ['Walking down stairs safely with a new knee.', 'safety'],
    ['A good socket improves balance and posture.', 'effect on the body'],
    ['Silicone is good for your skin.', 'kind to the body'],
    ['A lighter foot takes the pressure off the sound side.', 'effect on the body'],
  ]
  it.each(claims)('drops "%s" (%s)', (sentence, rule) => {
    expect(medicalHits(sentence)).toContain(rule)
    // As the cover and a label store it: nothing left.
    expect(scrubIdeaText(sentence, 'cover').text).toBe('')
    expect(scrubIdeaText(sentence.replace(/\.$/, ''), 'label').text).toBe('')
  })

  const fine = [
    // The market's own words about the device and the money.
    'How long liners usually last, the signs it is time to replace one, and what wears them out faster',
    'Whether medical aid pays for a second liner',
    'What to do when insurance says no to a powered knee',
    'Why a liner keeps slipping by lunchtime and how a socket should fit',
    'A lower-limb socket for climbing stairs and walking on drop foot days',
    // Asking, not claiming: a question, or a clause opened by a neutral question word.
    'Is it safe to swim with a prosthetic leg?',
    'Whether it is safe to shower with the leg on, and what to dry first',
    'What causes skin irritation under a liner',
    'How to reduce rubbing on a long walk',
    'When to see a prosthetist about a new socket',
    // Topics about the device, which must survive the wider rules.
    'How a microprocessor knee works on stairs',
    'How a microprocessor knee bends, locks and swings on stairs and slopes',
    'What a vacuum socket is and how it holds the limb',
    'Living with lower back pain after an amputation is a topic people raise',
    'How to choose a lower-limb socket and what affects balance on a new foot',
    'How the knee supports the user on a ramp',
    'Whether a powered ankle is safer on slopes',
    'How heavy a prosthetic leg is, and what changes the weight',
  ]
  it.each(fine)('keeps "%s"', (sentence) => {
    expect(medicalHits(sentence)).toEqual([])
    expect(scrubIdeaText(sentence, 'cover').counts.droppedMedical).toBe(0)
  })

  it('lets a question through every rule but the medicine and the medical-team ones', () => {
    expect(medicalHits('Do prosthetists recommend a pin lock or suction?')).toEqual([])
    expect(medicalHits('Is it safer to wear the leg in the shower?')).toEqual([])
    expect(medicalHits('Which painkillers help with phantom pain?')).toContain('medicine')
  })

  it('never lets the medical team be named: the Content page prints that line itself', () => {
    expect(medicalHits('What to check with your medical team before switching liners')).toEqual(['the medical team line'])
    expect(medicalHits('Should I ask my care team about a new liner?')).toEqual(['the medical team line'])
    expect(scrubIdeaText('How long a liner lasts. What to check with your medical team before switching liners.', 'cover').text).toBe('How long a liner lasts.')
    // "medical aid" is insurance, not the team.
    expect(medicalHits('Whether medical aid pays for a second liner')).toEqual([])
  })

  it('does not let "how" or "why" alone excuse a claim: they presume the answer', () => {
    expect(medicalHits('How silicone prevents sores on the residual limb')).toContain('effect on the body')
    expect(medicalHits('Why the liner causes sweating and blisters')).toContain('effect on the body')
  })

  it('names every rule', () => {
    expect(MEDICAL_CLAIMS.map((r) => r.name)).toEqual(['cures', 'effect on the body', 'kind to the body', 'safety', 'proven or recommended', 'diagnosis', 'medicine', 'the medical team line', 'sent to a doctor'])
  })
})

describe('scrubIdeaText', () => {
  it('drops a sentence with a digit the model typed, keeping a product name that carries one', () => {
    const out = scrubIdeaText('Show the Pro-Flex XC 2 on stairs. Liners last 6 to 12 months.', 'cover', { allow: ['Pro-Flex', 'XC 2'] })
    expect(out.text).toBe('Show the Pro-Flex XC 2 on stairs.')
    expect(out.counts.droppedDigits).toBe(1)
  })

  it('drops a medical claim from any field and names the rule', () => {
    const out = scrubIdeaText('How long liners last and how to spot wear. A fresh liner prevents skin irritation.', 'cover')
    expect(out.text).toBe('How long liners last and how to spot wear.')
    expect(out.counts.droppedMedical).toBe(1)
    expect(out.counts.medical).toEqual(['effect on the body'])
    expect(scrubIdeaText('Silicone heals the skin', 'label').text).toBe('')
  })

  it('keeps the market\'s own nouns that the direction list holds, and counts them', () => {
    const out = scrubIdeaText('Why does my liner keep slipping on a lower-limb socket?', 'title')
    expect(out.text).toBe('Why does my liner keep slipping on a lower-limb socket?')
    expect(out.counts.flaggedDirection).toBeGreaterThan(0)
    expect(scrubIdeaText('What a child needs as they grow, and climbing stairs on a new knee', 'cover').text).toBe('What a child needs as they grow, and climbing stairs on a new knee')
  })

  it('drops a claim that the conversation moved from the cover and the labels, never from the title', () => {
    expect(MOVEMENT.test('Liner questions are trending')).toBe(true)
    expect(scrubIdeaText('A topic on the rise. How long a liner lasts.', 'cover').text).toBe('How long a liner lasts.')
    expect(scrubIdeaText('More and more people ask it', 'label').text).toBe('')
    expect(scrubIdeaText('Is the liner trend worth it?', 'title').text).toBe('Is the liner trend worth it?')
  })

  it('drops the first person from the cover and the labels, and how the idea was made from the cover', () => {
    expect(scrubIdeaText('Show how we test liners. How long a liner lasts.', 'cover').text).toBe('How long a liner lasts.')
    expect(scrubIdeaText('What our data shows about liners. How long a liner lasts.', 'cover').text).toBe('How long a liner lasts.')
    expect(scrubIdeaText('Can we get a second liner on insurance?', 'title').text).toBe('Can we get a second liner on insurance?')
  })

  it('house style: no dashes, British spelling, no quotation marks round a title', () => {
    expect(scrubIdeaText('“Does the color of a liner matter?”', 'title').text).toBe('Does the colour of a liner matter?')
    expect(scrubIdeaText('How long it lasts — and what wears it out', 'cover').text).toBe('How long it lasts, and what wears it out')
  })

  it('holds a title or a label over its cap whole, and cuts a cover at a boundary', () => {
    const long = `Why ${'really '.repeat(40)}does it slip?`
    expect(long.length).toBeGreaterThan(IDEA_FIELD_MAX.title)
    const t = scrubIdeaText(long, 'title')
    expect(t.text).toBe('')
    expect(t.counts.droppedLong).toBe(1)
    const cover = scrubIdeaText(`${'How a liner wears and what to show about it. '.repeat(10)}`, 'cover')
    expect(cover.text.length).toBeLessThanOrEqual(IDEA_FIELD_MAX.cover)
    expect(cover.text.endsWith('.')).toBe(true)
  })
})
