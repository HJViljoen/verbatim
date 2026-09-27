import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { GLOSSARY, THIRTEEN_WORDS } from '../calibration'
import { DIRECTION_WORDS } from '../calibration'
import { ASK_MONTHLY_CAP } from '../config'
import { SURFACES } from '../nav'
import { SLOT_HOUR } from '../pipeline/schedule-due'
import { NEW_THEME_FLOOR } from '../pages/week'
import { BASELINE_MONTHS } from '../reading/anomaly'
import { TOUCH_MIN_WORDS } from '../reading/own-posts'
import { LEAD_MAX_MAKER_SHARE, MAKER_GROUP_SHARE, MAKER_NOTE_SHARE } from '../pages/overview-market/board'
import { NINETY_DAY_NOTE } from '../pages/overview-market/brands'
import { COMPARE_RULES } from '../pages/overview-market/change'
import { COMPARE_FLAG_SHARE, COMPARE_REFUSE_SHARE, DEPTH_RATIO_MIN } from '../reading/comparability'
import { CHECK_MIN_VIDEOS, DENSE_MIN_DATED } from '../reading/recheck'
import { MONTH_READABLE_VIDEOS, READING_SWITCH_FRACTION, READING_SWITCH_UPDATES } from '../reading/reading-month'
import { MONTHLY_UPDATES_PAST_END } from '../reports/monthly'
import { SUBJECT_PRECISION_FLOOR } from '../subjects/types'
import { DEFINITIONS, READING_CARDS, READING_PATH } from './how-to-read'
import { QUEUE_FLOOR } from './queue'
import { TERM_YIELD_BASIS } from './terms'

describe('how to read', () => {
  it('describes every surface the shell has, and no other', () => {
    expect(READING_CARDS.map((c) => c.key)).toEqual(SURFACES.map((s) => s.key))
  })

  it('repeats neither the title nor the question — lib/nav.ts owns both', () => {
    for (const card of READING_CARDS) {
      const s = SURFACES.find((x) => x.key === card.key)!
      expect(card).not.toHaveProperty('title')
      expect(card.tells).not.toBe(s.question)
    }
  })

  it('names only real glossary words', () => {
    for (const card of READING_CARDS) {
      for (const key of card.read) expect(GLOSSARY[key]).toBeDefined()
    }
  })

  it('draws its vocabulary from the thirteen and their two flags, not the legacy words', () => {
    const allowed = new Set<string>([...THIRTEEN_WORDS, 'new', 'gone_quiet'])
    for (const card of READING_CARDS) {
      for (const key of card.read) expect(allowed.has(key)).toBe(true)
    }
  })

  it('says what every surface cannot tell you — the half a reader asks for least', () => {
    for (const card of READING_CARDS) expect(card.cannot.length).toBeGreaterThan(0)
  })

  it('does not carry the Guide’s false claim about search terms', () => {
    const settings = READING_CARDS.find((c) => c.key === 'settings')!
    const words = [settings.tells, ...settings.cannot].join(' ')
    expect(words).not.toContain('changed by us on request, not from this page')
    // The true half survives, and the correction with it.
    expect(words).toContain('Your search terms are yours')
  })

  it('says what the brands rule counts, so "none found" reads as a zero by that rule (the lead’s ruling of 27 Sep)', () => {
    const line = READING_CARDS.find((c) => c.key === 'overview')!.cannot.find((l) => l.startsWith('Under Brands in your market'))!
    expect(line).toContain('the rule counts the brand’s name, its handles and its phrases')
    expect(line).toContain('“None found” means the rule found no such video that month')
    expect(line).toContain('“not counted yet” means we have not yet checked its matches by hand')
    expect(line).not.toMatch(/[0-9—]/)
  })

  it('says the rhythm once, as weekly on Sunday, and offers no choice of it (27 Sep)', () => {
    const settings = READING_CARDS.find((c) => c.key === 'settings')!
    expect(settings.cannot.join(' ')).toContain('every workspace is updated weekly, on Sunday')
    const updates = DEFINITIONS.find((d) => d.id === 'updates')!
    expect(updates.body).toContain('once a week, on Sunday')
    expect(updates.body).toContain(`${String(SLOT_HOUR).padStart(2, '0')}:00 South African time`)
    expect(READING_PATH[0].what[0]).toContain('Sunday’s update')
    // Nothing here names a cadence to choose, or a pause.
    const all = [...READING_CARDS.flatMap((c) => [c.tells, ...c.cannot]), ...READING_PATH.flatMap((p) => p.what), ...DEFINITIONS.map((d) => `${d.title} ${d.body}`)].join(' ')
    expect(all).not.toMatch(/\bcadence\b|\bmonthly update|\bfortnight|\bpaused?\b|the day it lands/i)
  })

  it('never calls a month "complete" (plan §4.0: ended or final, never complete; deploy 2 review)', () => {
    for (const card of READING_CARDS) {
      expect([card.tells, ...card.cannot].join(' ')).not.toMatch(/\bcomplete months?\b/i)
    }
  })

  it('reads on three clocks, in the order a month is actually read', () => {
    expect(READING_PATH.map((p) => p.when)).toEqual([
      'Each week', 'Each month, once the month is done', 'Each quarter',
    ])
    for (const step of READING_PATH) expect(step.what.length).toBeGreaterThan(0)
  })

  it('prints no direction word of its own outside the word that defines one', () => {
    // The cards are prose about the product, not a verdict, so D1's rule
    // applies to them exactly as it applies to a block: gaining and fading are
    // earned by three readings and are never furniture.
    const prose = READING_CARDS.flatMap((c) => [c.tells, ...c.cannot]).join(' ').toLowerCase()
    for (const word of DIRECTION_WORDS) {
      if (word === 'grew' || word === 'faded') continue // "what grew and faded" is a panel's NAME
      expect(prose).not.toContain(` ${word} `)
    }
  })

  it('gives every definition a unique anchor that no surface card already uses', () => {
    const ids = DEFINITIONS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(READING_CARDS.some((c) => c.key === id)).toBe(false)
    for (const d of DEFINITIONS) expect(`${d.title} ${d.body}`).not.toContain('—')
  })

  it('carries no "How sound is this" card, and no card says "how sound" (25 Sep rulings)', () => {
    expect(DEFINITIONS.map((d) => d.id)).not.toContain('soundness')
    for (const d of DEFINITIONS) expect(`${d.title} ${d.body}`.toLowerCase()).not.toContain('how sound')
    for (const c of READING_CARDS) expect(JSON.stringify(c).toLowerCase()).not.toContain('how sound')
  })

  it('holds the method week by week does not print under its chart (WP2.9; 25 Sep rulings)', () => {
    const w = DEFINITIONS.find((d) => d.id === 'week-by-week')!
    expect(w.title).toBe('Week by week')
    expect(w.body).toContain('follow our searches as much as the market')
    expect(w.body).toContain('counts in both')
    expect(w.body).toContain('Your own posts are not counted')
    expect(w.body).toContain('two updates old')
    expect(w.body).toContain('compared only with weeks read the same way')
    expect(w.body).not.toContain('—')
  })

  it('carries exactly one definition of New, and the glossary agrees with it', () => {
    const nw = DEFINITIONS.filter((d) => d.id === 'new')
    expect(nw).toHaveLength(1)
    expect(nw[0].body).toContain('no earlier month in our record')
    expect(GLOSSARY.new[1]).toContain('no earlier month in our record')
  })
})

// ---- market-first (WP3.10, plan §2.10 D5, decision K) -----------------------

const card = (key: string) => READING_CARDS.find((c) => c.key === key)!
const def = (id: string) => DEFINITIONS.find((d) => d.id === id)!
const cardText = (key: string) => { const c = card(key); return [c.tells, ...c.cannot].join(' ') }
const everything = [
  ...READING_CARDS.flatMap((c) => [c.tells, ...c.cannot]),
  ...DEFINITIONS.flatMap((d) => [d.title, d.body]),
  ...READING_PATH.flatMap((p) => [p.when, ...p.what]),
]

describe('how to read, market-first', () => {
  it('reads every page on the market first', () => {
    for (const c of READING_CARDS) expect(c.tells.toLowerCase(), c.key).toContain('market')
  })

  it('carries no em dash, no "how sound" and no "complete" month anywhere a reader sees (§4.0)', () => {
    for (const t of everything) {
      expect(t).not.toContain('—')
      expect(t.toLowerCase()).not.toContain('how sound')
      expect(t).not.toMatch(/\bcomplete\b/i)
    }
  })

  it('says "five to eight" nowhere: a workspace follows up to ten subjects now (WP3.1)', () => {
    for (const t of everything) expect(t).not.toMatch(/five to eight|5.8 subjects/i)
  })

  it('describes Your subjects as yours, not as "picked for you" (decision G)', () => {
    expect(card('subjects').tells).toContain('each of your subjects')
    expect(cardText('subjects')).not.toContain('picked for you')
  })

  it('holds the method the pages stopped printing under their blocks, once each (25 Sep rulings)', () => {
    for (const id of ['reading-month', 'the-market', 'makers', 'provisional', 'not-read-as-a-change', 're-check', 'from-added-searches', 'brands', 'with-this-update']) {
      expect(def(id), id).toBeDefined()
    }
  })

  it('states the reading month on the rule reading-month.ts applies (decision A)', () => {
    expect(READING_SWITCH_FRACTION).toBe(0.5)
    expect(READING_SWITCH_UPDATES).toBe(2)
    expect(MONTH_READABLE_VIDEOS).toBe(100)
    const b = def('reading-month').body
    expect(b).toContain('half over, has had two updates')
    expect(b).toContain('under 100 videos in your market')
    expect(b).toContain('never today’s date')
  })

  it('states the maker rules at the shares board.ts applies (decision F)', () => {
    expect([MAKER_GROUP_SHARE, MAKER_NOTE_SHARE, LEAD_MAX_MAKER_SHARE]).toEqual([0.5, 0.2, 0.25])
    const b = def('makers').body
    expect(b).toContain('half or more of the videos are makers’ is grouped into one makers line')
    expect(b).toContain('a fifth or more are makers’ prints its maker share')
    expect(b).toContain('a quarter makers or fewer')
    expect(b).toContain('stay in every count')
  })

  it('states the subject check at SUBJECT_PRECISION_FLOOR (decision C)', () => {
    expect(SUBJECT_PRECISION_FLOOR).toBe(0.85)
    const b = def('provisional').body
    expect(b.match(/0\.85/g)?.length).toBe(3)
    expect(b).toContain('marked provisional')
    expect(b).toContain('“being re-described”')
  })

  it('states when two months are compared at the shares comparability.ts applies, and points at The record for the four rules (decision D)', () => {
    expect([COMPARE_REFUSE_SHARE, COMPARE_FLAG_SHARE, DEPTH_RATIO_MIN]).toEqual([0.1, 0.01, 0.8])
    expect(COMPARE_RULES).toHaveLength(4)
    const b = def('not-read-as-a-change').body
    expect(b).toContain('a tenth or more of either')
    expect(b).toContain('from 1% to 9%')
    expect(b).toContain('four fifths')
    expect(b).toContain('“When two months are compared”')
  })

  it('states the re-check at recheck.ts’s floors, and never promises an outcome (WP2.3)', () => {
    expect([CHECK_MIN_VIDEOS, DENSE_MIN_DATED]).toEqual([100, 20])
    const b = def('re-check').body
    expect(b).toContain('20 or more comments')
    expect(b).toContain('each month holds 100 videos')
    expect(b).toContain('always marked provisional')
  })

  it('says S17’s ninety-day note in the words the brands block carries for it, on the Brands card and its definition', () => {
    expect(card('competitive').cannot).toContain(NINETY_DAY_NOTE)
    expect(def('brands').body).toContain(NINETY_DAY_NOTE)
  })

  it('counts a brand in every video, never its own posts, and names the other meanings (decision E)', () => {
    const b = def('brands').body
    expect(b).toContain('every video it comes up in')
    expect(b).toContain('own posts are its posts')
    expect(b).toContain('Freitag is German for Friday')
  })

  it('states the Ask cap and the monthly’s read at their constants', () => {
    expect(ASK_MONTHLY_CAP).toBe(40)
    expect(cardText('ask')).toContain('40 questions a month')
    expect(MONTHLY_UPDATES_PAST_END).toBe(1)
    expect(cardText('reports')).toContain('one update past its end')
  })

  it('says a held-still edit is queued, and claims nothing lands before the queue’s floor (decision I)', () => {
    expect(QUEUE_FLOOR).toBe('2027-01-01')
    const t = cardText('settings')
    expect(t).toContain('queued for the 1st of a month, no earlier than 1 January 2027')
    expect(t).not.toMatch(/can still be compared/)
  })

  it('holds the run clock of what a search term found, which What we read no longer prints under its table', () => {
    expect(TERM_YIELD_BASIS).toContain('Dated by the update that searched, not by when the comments were written')
    expect(cardText('settings')).toContain('dated by the update that searched, not by when the comments were written')
  })

  it('states This week’s and Your moves’ floors at the constants that apply them', () => {
    // "named only once they carry 10 videos in the month" (week.ts), "needs
    // three months read the same way" (anomaly.ts), "two or more of the
    // question’s words" (own-posts.ts's word check, which Your moves reads).
    expect(NEW_THEME_FLOOR).toBe(10)
    expect(cardText('week')).toContain('once they carry 10 videos in the month')
    expect(BASELINE_MONTHS).toBe(3)
    expect(cardText('week')).toContain('needs three months read the same way')
    expect(TOUCH_MIN_WORDS).toBe(2)
    expect(cardText('market')).toContain('two or more of the question’s words')
  })

  it('names Your moves by its current sidebar label on the path (§4.0)', () => {
    const month = READING_PATH.find((p) => p.when.startsWith('Each month'))!
    expect(month.what.join(' ')).toContain(`on ${SURFACES.find((s) => s.key === 'market')!.label},`)
  })
})

// ---- the legend pills link into this page --------------------------------

const ROOT = join(__dirname, '..', '..')
function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sources(p))
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p)
  }
  return out
}

describe('How-to-read legend pills', () => {
  const files = [...sources(join(ROOT, 'components')), ...sources(join(ROOT, 'app'))]
  const pills = files.flatMap((f) => {
    const text = readFileSync(f, 'utf8')
    return [...text.matchAll(/<HowToRead\b[^>]*?\banchor="([^"]+)"/g)].map((m) => ({ file: f, anchor: m[1] }))
  })
  const anchors = new Set<string>([...READING_CARDS.map((c) => c.key), ...DEFINITIONS.map((d) => d.id)])

  it('finds the pills it is checking', () => {
    expect(pills.length).toBeGreaterThan(0)
  })

  it('points every pill at an anchor that exists on Settings › How to read', () => {
    for (const p of pills) expect(anchors.has(p.anchor), `${p.file} → #${p.anchor}`).toBe(true)
  })

  it('keeps the same pill where a page still draws one: Subjects, and Competitive’s stored copy', () => {
    const pages = {
      subjects: 'components/pages/subjects/index.tsx',
      competitive: 'components/pages/competitive-surface/index.tsx',
    }
    for (const [key, file] of Object.entries(pages)) {
      const text = readFileSync(join(ROOT, file), 'utf8')
      expect(text, file).toMatch(new RegExp(`<HowToRead\\b[^>]*anchor="${key}"`))
    }
  })

  it('leaves Your moves, This week and Ask with no pill, as the approved preview draws them (deploy 5)', () => {
    // How to read stays one click away in Settings; This week's Week by week
    // footer links its own section.
    for (const file of ['components/pages/market-surface/index.tsx', 'components/pages/week/index.tsx', 'components/pages/agent/surface.tsx']) {
      expect(readFileSync(join(ROOT, file), 'utf8'), file).not.toMatch(/<HowToRead\b/)
    }
    expect(readFileSync(join(ROOT, 'components/pages/week/index.tsx'), 'utf8')).toMatch(/<ExportMenu variant="button" \/>/)
  })

  it('leaves Conversation’s bar with no pill, as the approved preview draws it (d3 polish)', () => {
    // Voice mounted its pill from the route (useSearchParams must sit under
    // the page's Suspense boundary there), so the route file is the one read.
    const text = readFileSync(join(ROOT, 'app/dashboard/voice/page.tsx'), 'utf8')
    expect(text).not.toMatch(/<HowToRead\b/)
  })

  it('leaves Your market’s bar with Export alone, as the approved preview draws it (Heinrich’s default, 26 Sep)', () => {
    // How to read stays one click away in Settings.
    const text = readFileSync(join(ROOT, 'components/pages/overview/index.tsx'), 'utf8')
    expect(text).not.toMatch(/<HowToRead\b/)
    expect(text).toMatch(/<ExportMenu\b/)
  })
})
