import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { whatYouTrack } from '@/lib/pages/settings'
import type { SettingsFormState } from '@/app/dashboard/settings/actions'
import { SearchTerms } from './search-terms'
import { YourAccounts } from './your-accounts'
import { BrandsYouTrack, Communities, NotYourMarket } from './tracked-cards'

// Settings › What you track, as the Page-Settings artboard draws it: what each
// card PRINTS (the render tier, AGENTS.md), for an owner or admin and for a
// member who can only read.

const model = whatYouTrack({
  tenant: 'Sealand',
  config: {
    brand_keywords: ['sealand gear', '#sealandgear', 'sealand bag'],
    industry_keywords: ['eco backpack', 'handmade bag'],
    competitor_keywords: ['cotopaxi backpack', 'frtg'],
    exclude_terms: [],
    competitor_names: ['Freedom of Movement', 'Cotopaxi'],
    competitor_handles: { Cotopaxi: { instagram: 'cotopaxi', tiktok: 'cotopaxiofficial', youtube: 'UC1' }, 'Freedom of Movement': { instagram: 'fombrand' } },
    own_handles: { instagram: 'sealandgear', tiktok: 'sealandgear', youtube: 'UC2' },
    subreddits: [{ name: 'onebag', status: 'active', discovered_at: '2026-09-01' }, { name: 'backpacks', status: 'active', discovered_at: '2026-09-01' }],
  },
  rivals: [],
  notMine: 0,
})
const noop = async (prev: SettingsFormState): Promise<SettingsFormState> => prev

function bans(markup: string, text: string) {
  expect(markup).not.toMatch(/border-l(-|\b)/)
  expect(markup).not.toMatch(/border-left/)
  expect(markup).not.toContain('<mark')
  expect(text).not.toContain('—')
}

describe('Search terms', () => {
  it('prints the four groups in the artboard\'s order, each with its add button, for an editor', () => {
    const el = <SearchTerms terms={model.terms} canEdit />
    const text = renderText(el)
    expect(text).toContain('Search terms The words that decide which videos belong to your market.')
    expect(text).toContain('Your name Videos that mention you Add a term sealand gear #sealandgear sealand bag')
    expect(text).toContain('The category What your market talks about Add a term eco backpack handmade bag')
    // The board's name and note for the third group, said on the screen.
    expect(text).toContain('Names for the brands you track How people name the brands you track. The brands themselves, with their accounts, are under Brands you track. Add a term cotopaxi backpack frtg')
    // An empty group is the place to add one, for an editor, and says so in
    // the dashed box (the audit design).
    expect(text).toMatch(/Not these Videos with these words are left out Add a word None yet\.$/)
    const markup = render(el)
    expect(markup).toMatch(/<p class="[^"]*border-dashed[^"]*">None yet\.<\/p>/)
    // Every term one look, in a list: no colour by whose words it is, no
    // round pill, no icon on the add button.
    expect(markup.match(/<li class="inline-flex min-h-\[30px\][^"]*rounded-\[8px\][^"]*bg-inner[^"]*">/g)).toHaveLength(7)
    expect(markup).not.toContain('data-chip')
    expect(markup).not.toContain('rounded-full')
    expect(markup).not.toContain('<svg')
    assertCopyContract(markup)
    bans(markup, text)
  })

  it('draws no buttons and no empty group for a member', () => {
    const text = renderText(<SearchTerms terms={model.terms} canEdit={false} />)
    expect(text).not.toContain('Add a')
    expect(text).not.toContain('Not these')
    expect(text).not.toContain('None yet')
  })
})

describe('Your accounts', () => {
  it('prints @handles and the channel by name as a list of terms and values, in sans, with Edit for an editor', () => {
    const el = <YourAccounts rows={model.ownAccounts} handles={model.ownHandles} canEdit action={noop} />
    const markup = render(el)
    expect(renderText(el)).toBe('Your accounts Your own posts, kept apart from what your market says. Edit Instagram @sealandgear TikTok @sealandgear YouTube Sealand’s channel')
    // The board's `<dl>`: the platform a term, the handle its value, no mono.
    expect(markup).toContain('<dt class="font-semibold">Instagram</dt><dd class="m-0 min-w-0 break-all text-right">@sealandgear</dd>')
    expect(markup).not.toContain('font-mono')
    expect(markup).not.toContain('<svg')
    assertCopyContract(markup)
    bans(markup, renderText(el))
    expect(renderText(<YourAccounts rows={model.ownAccounts} handles={model.ownHandles} canEdit={false} action={noop} />)).not.toContain('Edit')
  })
})

describe('Brands you track and Communities', () => {
  it('lists the brands A to Z with their accounts, and the menu for an editor', () => {
    const el = <BrandsYouTrack brands={model.brands} names={model.names} canEdit />
    const text = renderText(el)
    expect(text).toBe('Brands you track Each brand and its own accounts. The names people call them by are under Search terms. Add a brand Cotopaxi Instagram @cotopaxi TikTok @cotopaxiofficial YouTube Freedom of Movement Instagram @fombrand')
    expect(render(el)).toContain('aria-label="More for Cotopaxi"')
    // Each brand's accounts a list, one a line (the board's), with no dot
    // before the name and no mono handle.
    expect(render(el)).toContain('<li>Instagram <span class="break-all text-foreground">@cotopaxi</span></li><li>TikTok <span class="break-all text-foreground">@cotopaxiofficial</span></li><li>YouTube</li>')
    expect(render(el)).not.toContain('rounded-full')
    expect(render(el)).not.toContain('font-mono')
    assertCopyContract(render(el))
    bans(render(el), text)
    expect(render(<BrandsYouTrack brands={model.brands} names={model.names} canEdit={false} />)).not.toContain('More for')
  })

  it('lists the communities as r/ names on Reddit', () => {
    const el = <Communities communities={model.communities} canEdit />
    // A plain list of r/ names: the line under the title says they are Reddit's.
    expect(renderText(el)).toBe('Communities Reddit communities that count as your market. Add a community r/backpacks r/onebag')
    expect(render(el)).toContain('<li class="border-t border-track py-[13px] last:pb-0">r/backpacks</li>')
    assertCopyContract(render(el))
  })

  it('draws a read-only card only where it has something to list', () => {
    expect(render(<Communities communities={[]} canEdit={false} />)).toBe('')
    expect(render(<BrandsYouTrack brands={[]} names={[]} canEdit={false} />)).toBe('')
  })
})

describe('Not your market', () => {
  it('is not drawn with nothing marked, and states the count as a figure where something is', () => {
    expect(render(<NotYourMarket count={0} />)).toBe('')
    expect(render(<NotYourMarket count={null} />)).toBe('')
    const markup = render(<NotYourMarket count={3} />)
    expect(renderText(<NotYourMarket count={3} />)).toBe('Not your market 3 videos you marked as not your market.')
    assertCopyContract(markup)
  })
})
