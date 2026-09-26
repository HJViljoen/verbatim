import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import {
  barePattern, BRAND_PRECISION_FLOOR, BRAND_RULE_VERSION, BRAND_RULES, brandPattern, brandRulesFingerprint, brandRulesFor,
  jsRegex, negativePattern, ruleMatches, strongPattern, type BrandRule,
} from './aliases'

const sealand = brandRulesFor(SEALAND_CLIENT_ID)
const rule = (brand: string): BrandRule => {
  const r = sealand.find((x) => x.brand === brand)
  if (!r) throw new Error(`no rule for ${brand}`)
  return r
}

describe('the brand rules: what they are', () => {
  it('pins the rules as compiled to their version: a change is a new BRAND_RULE_VERSION', () => {
    expect(BRAND_RULE_VERSION).toBe('brands_v1')
    expect(brandRulesFingerprint()).toBe('e307e0181d99b804')
  })

  it('holds the plan floor (WP2.6)', () => {
    expect(BRAND_PRECISION_FLOOR).toBe(0.8)
  })

  it("covers Sealand and every rival Sealand tracks (staging tracking_configs.competitor_names, 26 Sep), and nobody else's", () => {
    expect(sealand.map((r) => r.key.kind === 'client' ? 'client' : r.key.name).sort()).toEqual(
      ['Cotopaxi', 'Freedom of Movement', 'Freitag', 'Old School', 'Patagonia', 'Rareform', 'The North Face', 'client'].sort(),
    )
    expect(brandRulesFor(OSSUR_CLIENT_ID)).toEqual([])
    expect(Object.keys(BRAND_RULES)).toEqual([SEALAND_CLIENT_ID])
  })

  it('writes every form and guard in the syntax both engines read alike', () => {
    // No word-boundary escapes (\b \m \M \y), no \w or \p (they differ between
    // ARE and JS), no lookarounds or anchors (the compiler adds its own), no
    // unescaped dot (ARE's crosses lines), no literal space (write \s+).
    const bad = /\\[bmMyYwWpP]|\(\?[=!<]|\^|\$|(?<!\\)\.|\s/
    for (const r of sealand) {
      for (const f of [...r.strong, ...r.weak, ...(r.notPreceded ?? []), ...(r.notFollowed ?? []), ...(r.notWith ?? []), ...(r.needs ?? [])]) {
        expect(f, `${r.brand}: ${f}`).not.toMatch(bad)
        expect(() => new RegExp(f, 'iu'), `${r.brand}: ${f}`).not.toThrow()
      }
    }
  })

  it('compiles one pattern for both engines: they differ only in the word class', () => {
    for (const r of sealand) {
      const js = brandPattern(r, 'are').replaceAll('[^[:alnum:]_]', '[^\\p{L}\\p{N}_]').replaceAll('[[:alnum:]_]', '[\\p{L}\\p{N}_]')
      expect(js).toBe(brandPattern(r, 'js'))
      expect(() => jsRegex(brandPattern(r, 'js'))).not.toThrow()
    }
  })

  it('reads a bare name as a homonym test only where the rule guards it', () => {
    expect(barePattern(rule('Old School'), 'js')).toBeNull()
    expect(barePattern(rule('Rareform'), 'js')).toBeNull()
    expect(barePattern(rule('Freedom of Movement'), 'js')).toBeNull()
    for (const b of ['Sealand', 'Cotopaxi', 'Freitag', 'The North Face', 'Patagonia']) {
      expect(barePattern(rule(b), 'js')).not.toBeNull()
      expect(negativePattern(rule(b), 'js')).not.toBeNull()
    }
    expect(strongPattern(rule('Cotopaxi'), 'js')).not.toBeNull()
  })
})

// Every text below is a real staging match (Sealand, comments dated or videos
// read Aug to 20 Sep 2026; the hand check of 26 Sep), cut to the words that
// decide it, except those marked CONSTRUCTED: the plan's named homonyms that
// staging's window holds no example of (a mountain's north face, Thursday
// Night Football, the micronation, polybags, Dongguan) and the handles of the
// three rivals staging's window never names.
describe('the brand rules: what they count', () => {
  const counts = (brand: string, text: string) => ruleMatches(rule(brand), text)

  it('Freitag: German for Friday does not count; the bag company does', () => {
    for (const t of [
      'Guten Morgen ☕ Wir wünschen euch einen tollen Freitag und kommt gut ins Wochenende ❤️',
      'was haltet ihr von diesen Freitag 🙇‍♀️🙇‍♂️ @sampagnebaby',
      'Freitag  21 .8.2026',
      'Freitag ❤️🫶 #food #reels',
      'Ungefähr die Fläche von 70 Fußballfeldern hat am Freitag zwischen Langenfeld und Langscheid gebrannt.',
      'Crashout bei Kreis im echten Leben in Freitag der 13 Camp Forest Green',
      'Schönen guten morgen wünsche dir einen wunderschönen Freitag 🥰',
      'Bitte Freitag raus bringen',
      '#reel #كربلاء_المقدسة #قانون #frtg #الديوانية',
      // A shopping list names a bag far from the day: the sign must be near.
      `❣️Tedi HAUL & Steampunk/Halloween Freitag ❣️#steampunk #halloween #art #diy sizzix wachs ${'* https://link.amazon/B03nhUWMk '.repeat(4)} Tasche`,
    ]) expect(counts('Freitag', t), t).toBe(false)
    for (const t of [
      'Does anyone in Berlin own a FREITAG Cool Bag (F738) I could borrow for a few hours next Tuesday?',
      'My Freitag Hazzard F306 is around 19L and I do sometimes use it as my one bag',
      'We have a Freitag store here, I would have tried it in store first.',
      'This is SUCH a cool brand! Go check them out :) @FREITAG lab. ag  #bag #freitag',
      'พี่ @freitag.bangkokเขากลับมาเปิดที่สยามซอย 2',
      '* Freitag: https://freitag.ch/en_US/products/f532-ted?v=010000674125',
      "there's a Freitag account on Instagram which says it's the Howden's bag.",
    ]) expect(counts('Freitag', t), t).toBe(true)
  })

  it('Patagonia: the region does not count; the company does', () => {
    for (const t of [
      'Patagonia Chilena 🇨🇱🧉🏔️❤️',
      'My time in Patagonia  Truly felt like I was dreaming out in these mountains.',
      '😍 #patagonia #puntaarenas #naturaleza',
      'Argentina le robó la Patagonia a Chile fue lo que dijo una Chilena',
      'I live in it and I am driving from Canada towards Patagonia.',
      'Five Hikers Died in Patagonia After Being Told It Was Safe',
      'uno se queda mirando y no quiere que terminen 🧡🥹 #patagonia #parati #wildlifephotography #puma #wildlife',
      'I agree with you, but Patagonia is a region spanning across Chile and Argentina, not a country',
    ]) expect(counts('Patagonia', t), t).toBe(false)
    for (const t of [
      '$59 Patagonia Houdini Jacket direct from Patagonia, 2 Colors (50% Off)',
      'How Patagonia Was Founded 🏔️ #shorts #business',
      'HUGE: Patagonia Sues Trump Again to Protect Bears Ears',
      'All 3 showed up in Patagonia boxes, with Patagonia tape, and the bags are absolutely legit',
      'Hold firm, Patagonia!',
      '(allowances are bigger in USA) to a 20l Patagonia Atom',
    ]) expect(counts('Patagonia', t), t).toBe(true)
  })

  it('Cotopaxi: the volcano and the province do not count; the company does', () => {
    for (const t of [
      'Climbing Cotopaxi!🌋 Climbing the world’s second largest active volcano!',
      '#Latacunga #Cotopaxi',
      'Desde la cárcel de Cotopaxi, Darío Macas renuncia a la alcaldía de Machala',
      '🏎🏁F1 Sin Motor: Parque Nacional COTOPAXI 2026🏁🏎',
      'Mucho cuidado, hermanos, paleo, hermanos de Cotopaxi con dejarse vender',
    ]) expect(counts('Cotopaxi', t), t).toBe(false)
    for (const t of [
      'Cotopaxi Allpa 70L vs Fjällräven Färden 80L',
      'Always buy good luggage. I highly recommend Cotopaxi',
      '#cotapaxi #backpack #school #college #review',
      // A handle wins over the volcano beside it (the fix branch's own case).
      '@COTOPAXI apparel and backpack at Cotopaxi volcano in Ecuador',
    ]) expect(counts('Cotopaxi', t), t).toBe(true)
  })

  it('The North Face: counts without "The"; a mountain face and Thursday Night Football do not', () => {
    for (const t of ['Nike elite mogs north face btw', 'I switched from TNF to Rab.', 'Anyone here use the North Face Jester backpack?', '#northface #backpack']) {
      expect(counts('The North Face', t), t).toBe(true)
    }
    // CONSTRUCTED
    for (const t of ['They climbed the north face of the Eiger in a day', 'TNF tonight: Thursday Night Football on Prime']) {
      expect(counts('The North Face', t), t).toBe(false)
    }
  })

  it('Sealand: the micronation, polybags, Dongguan and the marine toilet do not count; the brand keywords do', () => {
    for (const t of [
      'e​​#siwil​​#china​​#billgates​​#romania​​#japan​​#sealand​​#ohio​​#southkorea',
      'I replaced the old Sealand/Vacuflush marine toilet with a Brand New, complete Dometic replacement',
      'The Principality of Sealand sits on Roughs Tower off the Suffolk coast', // CONSTRUCTED
      'Dongguan Sealand polybag factory, custom packaging', // CONSTRUCTED
      'I LOVE SEALAND !!🥹🥹❤️',
    ]) expect(counts('Sealand', t), t).toBe(false)
    for (const t of [
      'a gal on the go’s best friend 🎒💕 using my @sealandgear buddy xs backpack',
      "the experience I had today designing my own moonbag at the Sealand Experience Store, Dock Road",
      'I am excited to be collaborating with Sealand @sealandgear    Sealand is a local lifestyle brand',
    ]) expect(counts('Sealand', t), t).toBe(true)
  })

  it('Old School, Freedom of Movement and Rareform: the plain phrases do not count; the brand does', () => {
    expect(counts('Old School', 'Duck theme, Kirby, old school Jansport, all awesome.')).toBe(false)
    expect(counts('Old School', 'Old School Bag to New School Bag 🤯♻️ | Complete Recycling Process')).toBe(false)
    expect(counts('Freedom of Movement', 'it is enough to ensure their freedom of movement in the desert')).toBe(false)
    // CONSTRUCTED
    expect(counts('Old School', 'new drop from @oldschool_ltd')).toBe(true)
    expect(counts('Freedom of Movement', 'my sling from @fombrand')).toBe(true)
    expect(counts('Rareform', 'the band was in rare form tonight')).toBe(false)
    expect(counts('Rareform', 'Rareform bag made from billboards')).toBe(true)
  })
})
