// VOICES' LEVEL PAGES, SHOT BESIDE THE G3 BOARDS (17 Oct): registered in
// scripts/pages-shots.ts with one line (`...VOICES_LEVEL_SHOTS`), so the four
// pages builders' shot lists merge without touching each other's.
//
//   node --import tsx scripts/pages-shots.ts --only voices-levels-group,... \
//     --artboards ~/Documents/Heinrich/Verbatim-Design/depth-2026-10/canvas/project
//     [--width 390]   (the phone boards are G3-Voices-*-Phone)
//
// THE ROOT: the live page's two tenants' fixtures beside G3-Voices. THE LEVEL
// PAGES: each from its own builder (lib/pages/v2/voices-levels-fixture.ts), its
// thin and not-counted states, a switcher drawn open, and a video opened or
// every video listed on a creator's page. A production dump of any level page
// (`VOICES_LEVEL_JSON=<file>`, scripts/voices-v2-dump.ts) is drawn beside its
// own board.

import { readFileSync } from 'fs'
import { createElement as h, type ReactNode } from 'react'
import { VoicesPage } from '../../components/pages/v2/voices'
import { VoicesBrandPage, VoicesCreatorPage, VoicesGroupPage } from '../../components/pages/v2/voices/pages'
import { VOICES_FIXTURES } from '../../lib/pages/v2/voices-fixture'
import { VOICES_LEVEL_FIXTURES } from '../../lib/pages/v2/voices-levels-fixture'
import { GROUP_MISSING, type BrandPage, type CreatorPage, type GroupPage } from '../../lib/pages/v2/voices-levels'
import type { VoicesData } from '../../lib/pages/v2/voices'

interface Shot { key: string; path: string; artboard: string; page: () => ReactNode; fixed?: boolean }

const G = '/dashboard/voices/groups/caregivers'
const B = '/dashboard/voices/brands/5ecfa431'
const C = '/dashboard/voices/creators/tiktok/@stepbystep.amp'

/** A production dump of any page Voices draws, beside its own board. */
function realShot(): Shot[] {
  const file = process.env.VOICES_LEVEL_JSON
  if (!file) return []
  const data = JSON.parse(readFileSync(file, 'utf8')) as (GroupPage | BrandPage | CreatorPage | VoicesData) & { kind?: string }
  if (data.kind === 'group') return [{ key: 'voices-levels-real', path: G, artboard: 'G3-Voices-Group.dc.html', page: () => h(VoicesGroupPage, { data: data as GroupPage }) }]
  if (data.kind === 'brand') return [{ key: 'voices-levels-real', path: B, artboard: 'G3-Voices-Brand.dc.html', page: () => h(VoicesBrandPage, { data: data as BrandPage }) }]
  if (data.kind === 'creator') return [{ key: 'voices-levels-real', path: C, artboard: 'G3-Voices-Creator.dc.html', page: () => h(VoicesCreatorPage, { data: data as CreatorPage }) }]
  return [{ key: 'voices-levels-real', path: '/dashboard/voices', artboard: 'G3-Voices.dc.html', page: () => h(VoicesPage, { data: data as VoicesData }) }]
}

export const VOICES_LEVEL_SHOTS: Shot[] = [
  { key: 'voices-levels-root', path: '/dashboard/voices', artboard: 'G3-Voices.dc.html', page: () => h(VoicesPage, { data: VOICES_FIXTURES.ossur() }) },
  { key: 'voices-levels-root-sealand', path: '/dashboard/voices', artboard: 'G3-Voices.dc.html', page: () => h(VoicesPage, { data: VOICES_FIXTURES.sealand() }) },
  { key: 'voices-levels-root-thin', path: '/dashboard/voices', artboard: 'G3-Voices.dc.html', page: () => h(VoicesPage, { data: VOICES_FIXTURES['ossur-thin']() }) },
  { key: 'voices-levels-group', path: G, artboard: 'G3-Voices-Group.dc.html', page: () => h(VoicesGroupPage, { data: VOICES_LEVEL_FIXTURES.group() }) },
  { key: 'voices-levels-group-thin', path: '/dashboard/voices/groups/caretaker', artboard: 'G3-Voices-Group-Thin.dc.html', page: () => h(VoicesGroupPage, { data: VOICES_LEVEL_FIXTURES['group-thin']() }) },
  { key: 'voices-levels-group-tracked', path: G, artboard: 'G3-Voices-Group.dc.html', page: () => h(VoicesGroupPage, { data: VOICES_LEVEL_FIXTURES['group-tracked']() }) },
  { key: 'voices-levels-group-switcher', path: G, artboard: 'G3-Voices-Brand-Switcher.dc.html', page: () => h(VoicesGroupPage, { data: VOICES_LEVEL_FIXTURES.group(), switcherOpen: true }) },
  { key: 'voices-levels-brand', path: B, artboard: 'G3-Voices-Brand.dc.html', page: () => h(VoicesBrandPage, { data: VOICES_LEVEL_FIXTURES.brand() }) },
  { key: 'voices-levels-brand-switcher', path: B, artboard: 'G3-Voices-Brand-Switcher.dc.html', page: () => h(VoicesBrandPage, { data: VOICES_LEVEL_FIXTURES.brand(), switcherOpen: true }) },
  { key: 'voices-levels-brand-you', path: '/dashboard/voices/brands/client', artboard: 'G3-Voices-Brand.dc.html', page: () => h(VoicesBrandPage, { data: VOICES_LEVEL_FIXTURES['brand-you']() }) },
  { key: 'voices-levels-brand-not-counted', path: B, artboard: 'G3-Voices-Brand.dc.html', page: () => h(VoicesBrandPage, { data: VOICES_LEVEL_FIXTURES['brand-not-counted']() }) },
  { key: 'voices-levels-creator', path: C, artboard: 'G3-Voices-Creator.dc.html', page: () => h(VoicesCreatorPage, { data: VOICES_LEVEL_FIXTURES.creator() }) },
  { key: 'voices-levels-creator-open', path: C, artboard: 'G3-Voices-Creator.dc.html', page: () => h(VoicesCreatorPage, { data: VOICES_LEVEL_FIXTURES['creator-open']() }) },
  { key: 'voices-levels-creator-all', path: C, artboard: 'G3-Voices-Creator.dc.html', page: () => h(VoicesCreatorPage, { data: VOICES_LEVEL_FIXTURES['creator-all']() }) },
  { key: 'voices-levels-missing', path: '/dashboard/voices/groups/gone', artboard: 'no-board-voices-missing.dc.html', page: () => h(VoicesGroupPage, { data: { kind: 'missing', level: 'group', line: GROUP_MISSING } }) },
  ...realShot(),
]
