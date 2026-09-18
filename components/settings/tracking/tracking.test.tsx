import { describe, expect, it } from 'vitest'

import { CadenceSection, FREEZE_NOTE, SLOT_NOTE } from './cadence'
import { CommunitiesSection } from './communities'
import { rowMessage } from './community-controls'
import { PlatformsSection } from './platforms'
import { RivalsSection, RENAME_UNAVAILABLE } from './rivals'
import { RIVAL_REMOVED_PENDING } from '@/lib/settings/rivals-view'
import { NEW_TERM_RULE, REVIEW_KEEP_NOTE, TermsSection } from './terms'
import { BREAK_NOT_RECORDED, BROKE_NOTHING, LastSaveStrip, NEVER_SAVED, SaveStateLine } from '../save-state-strip'
import { gridIntrinsic } from '@/components/settings/chrome'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import type { TermSummary } from '@/lib/keywords/value'
import { platformRows, platformShareBasis } from '@/lib/settings/connections'
import type { CommunityRow } from '@/lib/settings/communities'
import type { RivalRow } from '@/lib/settings/rivals-view'
import { saveState, type LastChange } from '@/lib/settings/save-state'

// The render tier for Settings › Tracking (Block D wave 2, E-settings). One
// static render per section, asserted on what it PRINTS — which is where every
// honesty rule on this page lives: the scope word on a lifetime count, the em
// dash instead of a zero, the absent third line of the save strip, the cadence
// options the product can actually run, and the basis beside every share.
//
// WHAT "keeps the copy contract" MEANS ON THIS PAGE, EXACTLY (m6). No section
// here marks a single `data-copy` node, because nothing on a settings page is
// model prose — so `assertCopyContract` exercises rule (c) alone: no direction
// word outside a verdict. Rules (a) and (b) have no node to apply to. The five
// occurrences of that sentence below are that one check, and the figures and
// scope words are asserted by name in the tests around it.

const term = (over: Partial<TermSummary> = {}): TermSummary => ({
  key: 'eco bag', keyword: 'eco bag', bucket: 'industry', platforms: ['tiktok'], updates: 8,
  found: 410, kept: 12, eligible: 4, insights: 2, keptRate: 0.029, worthReviewing: true,
  reviewPlatforms: ['tiktok'], because: ['most of what it brings in is not this category'],
  ...over,
})

const community = (over: Partial<CommunityRow> = {}): CommunityRow => ({
  key: 'onebag', label: 'r/onebag', status: 'active', discoveredAt: '2026-04-06', probe: null,
  posts: 61, comments: 591, insights: 40, eligible: 30, keptPct: 72, found: 90, unconfigured: false,
  ...over,
})

const rival = (over: Partial<RivalRow> = {}): RivalRow => ({
  identity: null, name: 'Freitag', trackedSince: null, retiredAt: null, handles: {},
  perPlatform: [], captured: 0, read: 0, noAccounts: true, ownPosts: null, ownPostsWhy: null,
  ...over,
})

const TERMS = {
  brand_keywords: ['Sealand', 'Sealand bags'],
  competitor_keywords: ['Freitag'],
  industry_keywords: ['eco bag'],
  exclude_terms: ['sealand micronation'],
}

const termsSection = (
  <TermsSection
    terms={{ ...TERMS }}
    dates={{ sealand: 'added 6 Apr', freitag: 'in use by 6 Apr, not recorded' }}
    datesNote="A date on a term is when it entered the set."
    review={[term()]}
    canEdit
    onAdd={() => null}
    onRemove={() => {}}
  />
)

describe('the search terms section', () => {
  const words = renderText(termsSection)

  it('prints every bucket with its own count, the fourth one included', () => {
    expect(words).toContain('4 terms · brand 2 · competitor 1 · category 1 · 1 excluded, not searched')
    expect(words).toContain('Not this')
  })

  it('leaves the chips bare where the log holds no date at all', () => {
    // m7: with no dates the chips each repeated "in the set before we kept a
    // record" — the same statement twenty-one times under a note that already
    // makes it once.
    const bare = renderText(
      <TermsSection terms={{ ...TERMS }} dates={{}} datesNote="We have not written down when a term was added yet."
        review={[]} canEdit onAdd={() => null} onRemove={() => {}} />,
    )
    expect(bare.split('in the set before we kept a record').length - 1).toBe(0)
    expect(bare).toContain('We have not written down when a term was added yet.')
    // Where SOME terms are dated, an undated one keeps its own sentence.
    expect(words).toContain('in the set before we kept a record')
  })

  it('carries the short date on a chip and keeps the weaker grade weaker', () => {
    expect(words).toContain('added 6 Apr')
    expect(words).toContain('in use by 6 Apr, not recorded')
    // A term the log never names gets the sentence, not a guessed date.
    expect(words).toContain('in the set before we kept a record')
  })

  it('gives a 20px remove icon a pressable target', () => {
    // M5: a `size-3` glyph in `p-0.5` is roughly 20 x 20 on a page whose own
    // CONTROL constant is h-11 for everything else. The icon keeps its size
    // and the pseudo element carries the target out to 44.
    const markup = render(termsSection)
    const remove = markup.slice(markup.indexOf('aria-label="Remove Sealand"'))
    expect(remove.slice(0, 400)).toContain('after:-inset-3')
  })

  it('states what adding one does, beside the field that does it', () => {
    expect(words).toContain(NEW_TERM_RULE)
  })

  it('puts the review strip’s control at the strip’s own edge, and drops the strip with the term', () => {
    // M7: "Remove it" sat mid-strip with a grey note trailing to the right
    // edge, so the row did not scan as sentence-then-action. And the strip
    // came from a server prop, so it stayed put after a removal — the one
    // control on it looked inert whether it had worked or not.
    const markup = render(termsSection)
    const strip = markup.slice(markup.indexOf('Worth reviewing'))
    expect(strip.indexOf(REVIEW_KEEP_NOTE)).toBeLessThan(strip.indexOf('Remove it'))
    const gone = renderText(
      <TermsSection
        terms={{ ...TERMS, industry_keywords: [] }}
        dates={{}} review={[term()]} canEdit onAdd={() => null} onRemove={() => {}}
      />,
    )
    expect(gone).not.toContain('Worth reviewing')
  })

  it('prints the review strip as k of n, with the evidence', () => {
    expect(words).toContain('kept 12 of 410 found')
    expect(words).toContain('most of what it brings in is not this category')
    // "Keep it" is not drawn: nothing stores an acknowledgement, and a button
    // that only forgets until the next reload is not a control.
    expect(words).toContain('Remove it')
    expect(words).not.toContain('Keep it')
  })

  it('keeps the copy contract', () => {
    assertCopyContract(termsSection)
  })
})

describe('the communities section', () => {
  const section = (
    <CommunitiesSection
      rows={[
        community(),
        community({ key: 'campinggear', label: 'r/CampingGear', posts: 0, comments: 0, insights: 0, keptPct: null, discoveredAt: null }),
        community({ key: 'frugal', label: 'r/frugal', status: 'candidate', probe: { sampled: 40, kept: 9, at: '2026-08-11' }, posts: 1, comments: 7 }),
      ]}
      hidden={3}
      hiddenPosts={7}
      unconfigured={{ posts: 292, fromUnconfigured: 216, pct: 74 }}
      canEdit
      keptClosed={false}
    />
  )
  const words = renderText(section)

  it('says ALL TIME on the counts rather than printing them under a month', () => {
    expect(words).toContain('stored, all time')
    expect(words).toContain('Posts · all time')
    expect(words).toContain('Comments · all time')
    expect(words).not.toContain('this month')
  })

  it('prints an em dash where nothing came back, never a zero', () => {
    expect(words).toContain('—')
    expect(words).not.toMatch(/\b0\b/)
  })

  it('reads the state as the decision it is, with its sampling line', () => {
    expect(words).toContain('watched by hand, never sampled')
    expect(words).toContain('proposed, and measured')
    expect(words).toContain('sampled 2026-08-11: 9 of 40 on topic')
    expect(words).toContain('a state is what was decided, never a count of what it brought')
  })

  it('draws both controls — stop watching, and add one', () => {
    expect(words).toContain('Stop watching')
    expect(words).toContain('Watch this community')
    expect(words).toContain('capped at 40 per thread')
  })

  it('heads a column of sentences over its first word, not its last', () => {
    // H1: the grid head right-aligned every column but the first while the
    // cells under three of them read left, so STATE sat ~330px right of its
    // own dots. Head and cells now take one array.
    const markup = render(section)
    const head = markup.slice(markup.indexOf('min-width'), markup.indexOf('border-t border-border/70'))
    for (const word of ['Community', 'Found', 'State']) {
      const at = head.indexOf(`>${word}<`)
      expect(at, `${word} is in the head`).toBeGreaterThan(-1)
      // The span that opens immediately before the word carries its alignment.
      expect(head.slice(head.lastIndexOf('<span', at), at)).toContain('text-left')
    }
    expect(head.slice(head.lastIndexOf('<span', head.indexOf('>Kept<')), head.indexOf('>Kept<'))).toContain('text-right')
  })

  it('declares a minimum no narrower than its own columns', () => {
    // C5/B2: the row rule is painted on the row element, which takes the
    // wrapper's width; the cells keep their tracks. A minimum short of the
    // tracks is the last column hanging past every rule, which at the page's
    // real content width (≈912px) is exactly what it did.
    expect(gridIntrinsic('188px 84px 212px 92px 104px 72px 84px minmax(104px,1fr)')).toBe(1024)
    const markup = render(section)
    expect(markup).toContain('min-width:1024px')
    expect(markup).not.toContain('min-width:980px')
  })

  it('keeps a community’s control after its own click, and retires the message with the row', () => {
    // C4/M1: the control used to be REPLACED by the status message, which
    // useActionState then kept forever — a failed write left an error and no
    // retry, a successful one left "Saved…" where the row's newly correct
    // "Watch it" belonged. The message is a sibling now, and it is spent the
    // moment the row changes direction.
    expect(rowMessage('stop', null, '')).toBe('')
    expect(rowMessage('stop', 'stop', 'Could not save that.')).toBe('Could not save that.')
    expect(rowMessage('add', 'stop', 'Saved. Your next update stops reading that community')).toBe('')
    expect(words).toContain('Stop watching')
  })

  it('keeps the copy contract', () => {
    assertCopyContract(section)
  })
})

describe('the rivals section', () => {
  const rows = [
    rival({
      name: 'Freitag', noAccounts: false, captured: 28, read: 0,
      identity: {
        id: 'r1', client_id: 'c', slug: 'freitag', name: 'Freitag', first_seen_at: '2026-04-06',
        retired_at: null, superseded_by: null, created_at: '2026-04-06T00:00:00Z', created_by: null,
      },
      trackedSince: '2026-04-06',
      perPlatform: [{ platform: 'tiktok', handle: 'freitag', captured: 28, read: 0 }],
      ownPosts: { value: { k: 11, n: 11 }, basis: 'posts published in September 2026', month: '2026-09-01' },
    }),
    rival({ name: 'Poler', trackedSince: '2026-09-03', ownPostsWhy: 'No account is configured for this rival, so nothing they publish is read.' }),
  ]
  const section = (
    <RivalsSection rows={rows} names={['Freitag', 'Poler']} month="2026-09-01" canEdit onAdd={() => null} onRemove={() => {}} />
  )
  const words = renderText(section)

  it('heads the own-posts column by its month and names the clock under it', () => {
    expect(words).toContain('Own posts · Sep 2026')
    expect(words).toContain('dated by the day the post went up')
    expect(words).toContain('posts published in September 2026')
  })

  it('badges a rival that arrived this month and says what it refuses', () => {
    expect(words).toContain('New')
    expect(words).toContain('comparisons involving it are refused for Sep 2026')
  })

  it('says why a row cannot be renamed instead of leaving the cell empty', () => {
    expect(words).toContain(RENAME_UNAVAILABLE)
  })

  it('closes the section in one paragraph, not a stack of four', () => {
    // H2: every sentence stays; the four separate blocks of 10.5px grey do
    // not. `SectionNotes` flows them, so the section spends the lines the
    // words need rather than four paragraphs' worth of them.
    const markup = render(section)
    const tail = markup.slice(markup.lastIndexOf('Add a rival'))
    expect(tail.match(/<p /g)?.length ?? 0).toBe(1)
    expect(words).toContain('earliest evidence in our own data')
    expect(words).toContain('dated by the day the post went up')
  })

  it('keeps the capture-versus-read census and the earliest-evidence footnote', () => {
    expect(words).toContain('28 captured, 0 read')
    expect(words).toContain('earliest evidence in our own data')
    expect(words).toContain('removing one is a break, not a zero')
  })

  it('shows a rival the reader has taken off as taken off, and offers the way back', () => {
    // C3: `names` is the form's list and `rows` is the server's. With the
    // rival gone from the first, the row used to keep its state sentence, its
    // census and its "Tracked since" and lose only its own x — the one edit on
    // the page with no visible consequence.
    const dropped = renderText(
      <RivalsSection rows={rows} names={['Poler']} month="2026-09-01" canEdit onAdd={() => null} onRemove={() => {}} />,
    )
    expect(dropped).toContain(RIVAL_REMOVED_PENDING)
    expect(dropped).toContain('Put it back')
    // And the head counts the form, not the load.
    expect(dropped).toContain('1 tracked')
    expect(dropped).toContain('1 waiting to be taken off')
  })

  it('keeps the copy contract', () => {
    assertCopyContract(section)
  })
})

describe('the platforms section', () => {
  const rows = platformRows({
    platforms: ['tiktok', 'youtube', 'instagram'],
    communities: 12,
    mix: { tiktok: 352, youtube: 268, instagram: 194, reddit: 111 },
    videos: 1000,
  })
  const section = (
    <PlatformsSection
      rows={rows}
      basis={platformShareBasis({ month: '2026-09-01', status: 'filling', videos: 1000, audience: 'Your own brand' })}
      ownAccounts={{ tiktok: 'sealandgear' }}
    />
  )
  const words = renderText(section)

  it('prints no share without the population it is a share of', () => {
    expect(words).toContain('35%')
    expect(words).toContain('share of Your own brand’s 1,000 videos in September')
    expect(words).toContain('still filling')
  })

  it('keeps a word where the artboard draws a switch nothing can switch', () => {
    expect(words).toContain('Connected')
    expect(words).toContain('Not connected')
  })

  it('draws a share of nothing as a dash', () => {
    const blank = renderText(
      <PlatformsSection
        rows={platformRows({ platforms: ['tiktok'], communities: 12, mix: null, videos: null })}
        basis={platformShareBasis({ month: '2026-09-01', status: 'filling', videos: null, audience: 'Your own brand' })}
        ownAccounts={{}}
      />,
    )
    expect(blank).toContain('the month has not been read')
    expect(blank).not.toMatch(/\d+%/)
  })

  it('keeps the copy contract', () => {
    assertCopyContract(section)
  })
})

describe('the cadence section', () => {
  const section = (
    <CadenceSection
      period="weekly" day="sunday" storedPeriod="weekly"
      onPeriod={() => {}} onDay={() => {}} canEdit
      updatesThisMonth={['2026-09-27', '2026-09-20', '2026-09-13', '2026-09-06']}
      month="2026-09-01" lastUpdate="2026-09-27" showStudio={false}
    />
  )
  const words = renderText(section)

  it('offers only the cadences the product can run', () => {
    expect(words).toContain('Weekly')
    expect(words).toContain('Monthly')
    expect(words).not.toContain('Fortnightly')
  })

  it('prints the hour as a fact and promises no next date', () => {
    expect(words).toContain(SLOT_NOTE)
    expect(words).not.toContain('next')
    expect(words).toContain(FREEZE_NOTE)
    expect(words).not.toContain('28th')
    // M2: once, and not dressed as the disabled twin of the select beside it.
    expect(words.split(SLOT_NOTE).length - 1).toBe(1)
    expect(render(section)).not.toMatch(/h-11 items-center rounded-\[4px\] bg-inner[^"]*">06:00/)
  })

  it('evidences the cadence with the updates that actually landed', () => {
    expect(words).toContain('4 updates in September — 27 Sep, 20 Sep, 13 Sep, 6 Sep')
    expect(words).toContain('last 27 Sep')
  })

  it('renders a paused workspace as a sentence, never as a select', () => {
    const paused = renderText(
      <CadenceSection
        period="weekly" day="sunday" storedPeriod="paused"
        onPeriod={() => {}} onDay={() => {}} canEdit
        updatesThisMonth={[]} month="2026-09-01" lastUpdate={null} showStudio={false}
      />,
    )
    expect(paused).toContain('Paused. Updates are not being sent.')
    expect(paused).not.toContain('Weekly')
  })

  it('keeps the copy contract', () => {
    assertCopyContract(section)
  })
})

describe('the page’s faint text', () => {
  it('never uses the data-bucket grey as a text colour', () => {
    // H3/m5: --cat (#9AA1A9) is the CATEGORY SERIES colour and reads 2.61:1 on
    // white, under DESIGN.md's floor for text. It carried eighteen of this
    // page's rule sentences, the save strip's honesty line among them.
    const markup = [
      render(termsSection),
      render(<RivalsSection rows={[rival()]} names={['Freitag']} month="2026-09-01" canEdit onAdd={() => null} onRemove={() => {}} />),
      render(
        <CommunitiesSection
          rows={[community()]} hidden={0} hiddenPosts={0}
          unconfigured={{ posts: 0, fromUnconfigured: 0, pct: 0 }} canEdit keptClosed={false}
        />,
      ),
    ].join('')
    expect(markup).not.toContain('text-cat')
    expect(markup).toContain('text-muted-foreground')
  })
})

describe('the save state', () => {
  const change: LastChange = {
    changed_at: '2026-09-03T14:02:00Z', source: 'logged',
    affects_audiences: ['competitor:Poler'], affects_months: '[2026-09-01,2026-10-01)',
  }

  it('renders the absence where M1 has not been applied', () => {
    const words = renderText(<LastSaveStrip state={saveState({ lastChange: change, affectsRecorded: false })} note="Poler was added." />)
    expect(words).toContain('Last save 3 Sep — Poler was added.')
    expect(words).toContain(BREAK_NOT_RECORDED)
    expect(words).not.toContain('Broke:')
  })

  it('names what the save broke where the columns recorded it', () => {
    const words = renderText(<LastSaveStrip state={saveState({ lastChange: change, affectsRecorded: true })} />)
    expect(words).toContain('Broke: Poler’s months from Sep 2026')
  })

  it('tells "broke nothing" apart from "not written down"', () => {
    const words = renderText(
      <LastSaveStrip state={saveState({ lastChange: { ...change, affects_audiences: null, affects_months: null }, affectsRecorded: true })} />,
    )
    expect(words).toContain(BROKE_NOTHING)
  })

  it('says so where nothing has ever been changed', () => {
    expect(renderText(<LastSaveStrip state={saveState({})} />)).toContain(NEVER_SAVED)
  })

  it('carries the pending half at the save row, where the form knows it', () => {
    const state = saveState({
      pending: [{ field: 'Category terms', from: '12 entries', to: '13 entries' }],
      lastChange: change,
      affectsRecorded: false,
    })
    const words = renderText(<SaveStateLine state={state} />)
    expect(words).toContain('1 change waiting to be saved — category terms')
    expect(words).toContain('last saved 3 Sep')
    // M3: the break half is the rail's, and it is drawn once.
    expect(words).not.toContain('was not written down')
    // The rule is only printed where the strip can actually name a break.
    expect(words).not.toContain('A save names the series it breaks')
  })

  it('prints the rule only where a break can be named', () => {
    const words = renderText(<SaveStateLine state={saveState({ lastChange: change, affectsRecorded: true })} />)
    expect(words).toContain('A save names the series it breaks')
    expect(words).toContain('Nothing waiting to be saved')
  })
})
