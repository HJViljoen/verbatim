import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { FIXTURE_CATALOGUE } from '../test/products-fixtures'
import {
  aliasBody, cataloguePattern, CLIENT_NEAR, compileCatalogue, compilerFingerprint, matchAliases, PRODUCT_RULE_VERSION, readText,
} from './rules'

const compiled = compileCatalogue(FIXTURE_CATALOGUE, OSSUR_CLIENT_ID)
const read = (text: string) => readText(compiled, text)
const placed = (text: string) => read(text).placements.map((p) => `${p.placement}:${p.productId ? compiled.productName.get(p.productId) : compiled.groupName.get(p.groupId)}`)
const generic = (text: string) => read(text).generic.map((a) => a.alias)

describe('aliasBody: one alias, compiled as a watched brand is', () => {
  it('reads the words as written: spaces flexible, a hyphen optional, a dot and a plus literal', () => {
    expect(aliasBody('Pro-Flex XC', 'name')).toBe('pro[- ]?flex\\s*xc')
    expect(aliasBody('Rheo Knee 3', 'nickname')).toBe('rheo\\s*knee\\s*3')
    expect(aliasBody('Formfit Pro+', 'name')).toBe('formfit\\s*pro\\+')
    expect(aliasBody('St. Liner', 'name')).toBe('st\\.\\s*liner')
  })

  it('gives a category word its plural, and nothing else one', () => {
    expect(aliasBody('liner', 'category_word')).toBe('liner(?:s|es)?')
    expect(aliasBody('liner', 'nickname')).toBe('liner')
  })

  it('refuses what the two engines might read apart, and a name too short to mean anything', () => {
    for (const bad of ['C-Leg®', 'Pro/Flex', 'feet (prosthetic)', 'x', '--', 'a b'.slice(0, 1)]) expect(aliasBody(bad, 'name'), bad).toBeNull()
  })
})

describe('the compiled catalogue', () => {
  it('compiles every alias for both engines, and they differ only in the word class', () => {
    expect(compiled.refused).toEqual([])
    for (const a of compiled.aliases) {
      const js = a.pattern.are.replaceAll('[^[:alnum:]_]', '[^\\p{L}\\p{N}_]').replaceAll('[[:alnum:]_]', '[\\p{L}\\p{N}_]')
      expect(js, a.alias).toBe(a.pattern.js)
    }
    const all = cataloguePattern(compiled, 'are')!
    expect(all.startsWith('(?<![[:alnum:]_])(?:')).toBe(true)
    expect(() => new RegExp(cataloguePattern(compiled, 'js')!, 'isu')).not.toThrow()
  })

  it('places a product alias as named, a family as unclear, a category word as unbranded', () => {
    const by = (alias: string) => compiled.aliases.find((a) => a.alias === alias)!
    expect(by('Pro-Flex XC').placement).toBe('named')
    expect(by('Pro-Flex').placement).toBe('unclear')
    expect(by('liner').placement).toBe('unbranded')
    expect(by('Unity').needsConfirm).toBe(true)
  })

  it('pins the compiler: a change to what a catalogue matches is a new PRODUCT_RULE_VERSION', () => {
    expect(PRODUCT_RULE_VERSION).toBe('product_rules_v1')
    expect(CLIENT_NEAR).toBe(40)
    expect(compilerFingerprint(compiled)).toBe('c280d9ddcaaa290f')
  })

  it('reads the client\'s own name only where the tenant has a brand rule', () => {
    expect(compiled.client?.rule.brand).toBe('Össur')
    expect(compileCatalogue(FIXTURE_CATALOGUE, 'a-tenant-with-no-rules').client).toBeNull()
    expect(compileCatalogue(FIXTURE_CATALOGUE, SEALAND_CLIENT_ID).client?.rule.brand).toBe('Sealand')
  })
})

describe('readText: what one text places', () => {
  it('names a product however the hyphen and spaces fall, and in any case', () => {
    for (const t of ['Loving my Pro-Flex XC', 'my proflex xc', 'PRO FLEX XC on the trail', 'pro-flexxc']) {
      expect(placed(t), t).toEqual(['named:Pro-Flex XC'])
    }
  })

  it('takes the longest name: a product inside a family, a product inside a longer product', () => {
    expect(placed('the pro-flex xc torsion is stiff')).toEqual(['named:Pro-Flex XC Torsion'])
    expect(placed('my Pro-Flex hurts')).toEqual(['unclear:Feet'])
    expect(matchAliases(compiled, 'pro-flex xc torsion').map((m) => m.alias.alias)).toEqual(['Pro-Flex XC Torsion'])
  })

  it('places a category word as the category in general, plural too', () => {
    expect(placed('which liners do you use?')).toEqual(['unbranded:Liners'])
    expect(placed('Prosthetic feet are expensive')).toEqual(['unbranded:Feet'])
  })

  it('reads "my Össur liner" as one of the client\'s, not which (CLIENT_NEAR), and a far-off name as nothing to it', () => {
    expect(placed('my Össur liner keeps slipping')).toEqual(['unclear:Liners'])
    expect(placed('ossur liners are the best')).toEqual(['unclear:Liners'])
    const far = `Össur ${'and a very long story about the clinic visit '.repeat(2)}and then liners`
    expect(placed(far)).toEqual(['unbranded:Liners'])
  })

  it('never matches inside a word: eyeliner is not a liner', () => {
    expect(placed('new eyeliner look')).toEqual([])
    expect(placed('rheology class')).toEqual([])
  })

  it('keeps each category\'s strongest placement and every product named', () => {
    expect(placed('Iceross Seal-In X5 vs a plain liner, then the Rheo Knee and a Power Knee').sort()).toEqual(
      ['named:Iceross Seal-In X5', 'named:Power Knee', 'named:Rheo Knee'],
    )
  })

  describe('the generic names go to the confirm call and place nothing by rule', () => {
    it('"Unity" alone: set aside, nothing placed', () => {
      expect(placed('unity is strength')).toEqual([])
      expect(generic('unity is strength')).toEqual(['Unity'])
    })

    it('"Total Knee" as the surgery: set aside, nothing placed', () => {
      expect(placed('my mom had a total knee replacement')).toEqual([])
      expect(generic('my mom had a total knee replacement')).toEqual(['Total Knee'])
    })

    it('"Comfort": set aside, and the full product name beside it still names the product', () => {
      expect(placed('comfort matters most')).toEqual([])
      expect(generic('comfort matters most')).toEqual(['Comfort'])
      // "Comfort" inside "Iceross Comfort" is the longer match's: not generic.
      expect(placed('the Iceross Comfort is soft')).toEqual(['named:Iceross Comfort'])
      expect(generic('the Iceross Comfort is soft')).toEqual([])
    })

    it('a generic category word ("socket") waits for the confirm; a specific one ("prosthetic socket") places', () => {
      expect(placed('my eye socket hurts')).toEqual([])
      expect(generic('my eye socket hurts')).toEqual(['socket'])
      expect(placed('new prosthetic socket today')).toEqual(['unbranded:Sockets'])
    })

    it('a generic name beside a placed one: the placed one stands, the generic waits', () => {
      expect(placed('Unity with my Iceross Seal-In X5')).toEqual(['named:Iceross Seal-In X5'])
      expect(generic('Unity with my Iceross Seal-In X5')).toEqual(['Unity'])
    })
  })
})

