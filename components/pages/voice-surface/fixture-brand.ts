import { buildBrandView, type BrandView } from '@/lib/pages/voice-surface-brand'
import type { VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { ossurVoiceFixture, voiceFixture } from './fixture'

// Conversation filtered by brand (`?brand=`, the Brands page's B2 footer).
//
// REAL NUMBERS, NONE INVENTED: every brand, count, label and kind here is what
// `loadVoiceSurface` returned on STAGING (zfmxrrugaihxpubunleu, data to 20 Sep)
// with the clock at 2026-10-11T06:00Z, read-only, on 27 Sep: the ninety days
// B2 reads (Sealand 23 Jun to 20 Sep, read to the 20 Sep update; Össur 16 Jun
// to 13 Sep), each brand's `window_denominators` videos and its
// `window_theme_readings` on the themed update, labelled by that update's
// observations. Registry ids are shortened to their first eight characters,
// as ./fixture.ts does. The rest of each page is ./fixture.ts's month.
//
// FIVE STATES:
//   - `cotopaxiVoiceFixture()`: Sealand, `?brand=Cotopaxi`: 32 videos, 43
//     themes, the first 12 printed (B2's "Cotopaxi 32");
//   - `cotopaxiAllVoiceFixture()`: the same with every theme (`board=all`);
//   - `freitagVoiceFixture()`: 8 videos, 14 themes, each on one video;
//   - `rareformVoiceFixture()`: a live tracked brand with no video filed under
//     it in the window;
//   - `ottobockVoiceFixture()`: Össur (paused, §2.13), 88 videos, 12 of 61.

type Row = [id: string, label: string, kind: string, videos: number]

const SEALAND_WINDOW = { from: '2026-06-23', to: '2026-09-21' }

const COTOPAXI: Row[] = [
  ['bffa8059', 'Carry-on size compliance anxiety', 'question', 12],
  ['378dd773', 'Durability that earns trust', 'praise', 7],
  ['697fadc9', 'Desire for Cotopaxi gear', 'purchase_intent', 5],
  ['76551743', 'Love for color and organization', 'praise', 5],
  ['8fa08a79', 'Questions on product details', 'question', 5],
  ['f91863dc', 'Researching specific travel bags', 'purchase_intent', 4],
  ['4b67d09c', 'Comparing brands by carry experience', 'switching_signal', 3],
  ['4fda731a', 'Price and model clarity', 'purchase_intent', 3],
  ['ac918fa0', 'Separate laptop storage wanted', 'feature_request', 3],
  ['9084e1ef', 'Shoulder strap comfort problems', 'pain_point', 3],
  ['ab3bf26e', 'Admiration for compact packing', 'praise', 2],
  ['ef6bdcdc', 'Feature-by-feature bag scrutiny', 'question', 2],
  ['16bdc098', 'Worry about bag theft', 'pain_point', 2],
  ['8bc042d3', '20L feels just right', 'purchase_intent', 1],
  ['f6e271fe', 'Adventure content fuels excitement', 'praise', 1],
  ['06b55739', 'Asking about easier gear hauling', 'question', 1],
  ['786937f8', 'Back-to-school bag interest', 'purchase_intent', 1],
  ['ee74d9fc', 'Better zipper locking needed', 'feature_request', 1],
  ['0a163318', 'Carrying gear as exercise', 'praise', 1],
  ['affcda49', 'Chest strap requested', 'feature_request', 1],
  ['094c0a8f', 'Color and stock interest', 'purchase_intent', 1],
  ['b190cb86', 'Comfortable clothing gets attention', 'praise', 1],
  ['182d5643', 'Concern about zip-off chafing', 'pain_point', 1],
  ['4129a4c7', 'Confusion over exact dimensions', 'question', 1],
  ['2ab7b31f', 'Disappointment with redesign changes', 'objection', 1],
  ['97379851', 'External phone mount feels risky', 'objection', 1],
  ['81e24235', 'Gregory earns quiet respect', 'praise', 1],
  ['4fe0085c', 'Hostel experience sparks interest', 'praise', 1],
  ['b3441119', 'Interest in collaborating with Cotopaxi', 'purchase_intent', 1],
  ['6228ed28', 'Interest in the fire lookout job', 'purchase_intent', 1],
  ['f8c32bf6', 'Luggage passthrough wanted', 'feature_request', 1],
  ['f418ff5a', 'Mosquito concerns for northern trips', 'pain_point', 1],
  ['e2be69cb', 'Nice look, missing features', 'objection', 1],
  ['73c275cb', 'Patagonia\'s backpack reputation questioned', 'question', 1],
  ['92587068', 'Price no longer matches quality', 'objection', 1],
  ['d7ac0e2d', 'Reach extends internationally', 'demographic_signal', 1],
  ['499ff20d', 'Repairable gear adds value', 'praise', 1],
  ['020e50ec', 'Seeking long-term travel packs', 'purchase_intent', 1],
  ['667fa0a0', 'Timbuk2 loyalty for commuting', 'praise', 1],
  ['2fd82471', 'Travel downtime feels more fun', 'praise', 1],
  ['0be01e37', 'Trust in quality guarantees', 'praise', 1],
  ['7a6ca55f', 'Try before committing', 'purchase_intent', 1],
  ['77388169', 'Versatile gear wins praise', 'praise', 1],
]

const FREITAG: Row[] = [
  ['b87938a9', 'Curiosity about tarp logo origins', 'question', 1],
  ['b7362ba6', 'Cute and cool design', 'praise', 1],
  ['fcb4dc0b', 'Freitag earns simple praise', 'praise', 1],
  ['6a0ffe05', 'Frustration with sold-out specials', 'pain_point', 1],
  ['bc7468cb', 'German-speaking regional connection', 'demographic_signal', 1],
  ['41977278', 'Interest in learning to cook', 'purchase_intent', 1],
  ['5a81f3cd', 'Price questions signal consideration', 'purchase_intent', 1],
  ['675fcb45', 'Questions about featured gear', 'question', 1],
  ['c063b065', 'Questions on waxed paper durability', 'question', 1],
  ['62c17192', 'Steampunk craft ideas delight', 'praise', 1],
  ['4b638b21', 'Student and young adult appeal', 'demographic_signal', 1],
  ['3e0d148f', 'Sustainable bags with individual stories', 'praise', 1],
  ['a275766d', 'The cook feels relatable', 'praise', 1],
  ['844f6395', 'Traditional recipe sparks curiosity', 'praise', 1],
]

/** Össur's twelve biggest of Ottobock's 61 (the rest are not needed to draw
 *  the first twelve, and are not listed). */
const OTTOBOCK_SHOWN: Row[] = [
  ['7b67bf94', 'Encouragement through rehabilitation', 'praise', 25],
  ['bf5d6ae8', 'Amputees and family caregivers', 'demographic_signal', 12],
  ['01e39516', 'Price and purchase location', 'purchase_intent', 9],
  ['6c915090', 'Need for a prosthetic knee', 'purchase_intent', 8],
  ['d322d060', 'Questions about activity use', 'question', 8],
  ['f2bcd457', 'Questions about knee specifications', 'question', 8],
  ['73cb059c', 'Admiration for child prosthetic progress', 'praise', 7],
  ['680a9dae', 'Pain, comfort, and liner fit', 'pain_point', 7],
  ['eba7d74f', 'Interest in a new knee', 'purchase_intent', 6],
  ['f5aea948', 'Where to get service', 'question', 4],
  ['10d3afb3', 'Balance and prosthesis weight', 'pain_point', 3],
  ['5d08a5ee', 'Battery life and parts wear', 'pain_point', 3],
]

/** A brand's view off its rows, through the loader's own builder. */
function sealandView(name: string, videos: number, rows: readonly Row[], all = false): BrandView {
  return buildBrandView({
    name,
    window: SEALAND_WINDOW,
    videos,
    readings: rows.map(([themeId, , , v]) => ({ themeId, videos: v })),
    labels: new Map(rows.map(([id, label, kind]) => [id, { label, kind }])),
    all,
  })
}

/** Sealand, `?brand=Cotopaxi`: B2's 32 videos, the first 12 of 43 themes. */
export function cotopaxiVoiceFixture(over: Partial<VoiceSurfaceData> = {}): VoiceSurfaceData {
  return voiceFixture({ params: { brand: 'Cotopaxi' }, brandView: sealandView('Cotopaxi', 32, COTOPAXI), ...over })
}

/** Sealand, `?brand=Cotopaxi&board=all`: every one of the 43. */
export function cotopaxiAllVoiceFixture(over: Partial<VoiceSurfaceData> = {}): VoiceSurfaceData {
  return voiceFixture({ params: { brand: 'Cotopaxi', board: 'all' }, brandView: sealandView('Cotopaxi', 32, COTOPAXI, true), ...over })
}

/** Sealand, `?brand=Freitag`: 8 videos, 14 themes on one video each. */
export function freitagVoiceFixture(over: Partial<VoiceSurfaceData> = {}): VoiceSurfaceData {
  return voiceFixture({ params: { brand: 'Freitag' }, brandView: sealandView('Freitag', 8, FREITAG), ...over })
}

/** Sealand, `?brand=Rareform`: tracked, and nothing filed under it in the
 *  ninety days. */
export function rareformVoiceFixture(over: Partial<VoiceSurfaceData> = {}): VoiceSurfaceData {
  return voiceFixture({ params: { brand: 'Rareform' }, brandView: sealandView('Rareform', 0, []), ...over })
}

/** Össur, `?brand=Ottobock`: 88 videos, the first 12 of 61 themes. */
export function ottobockVoiceFixture(over: Partial<VoiceSurfaceData> = {}): VoiceSurfaceData {
  return ossurVoiceFixture({
    params: { brand: 'Ottobock' },
    brandView: {
      name: 'Ottobock',
      audience: 'competitor:Ottobock',
      window: { from: '2026-06-16', to: '2026-09-14' },
      videos: 88,
      themes: OTTOBOCK_SHOWN.map(([registryId, label, kind, videos]) => ({ registryId, label, kind, videos })),
      total: 61,
      all: false,
    },
    ...over,
  })
}
