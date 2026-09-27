import { SettingsFrame } from '@/components/settings-frame'
import { BrandsYouTrackCard, type BrandRow } from '@/components/settings/tracking/brands-you-track'
import { CardGrid } from '@/components/settings/tracking/card'
import { CommunitiesSection } from '@/components/settings/tracking/communities'
import { MakersCard, NotMyMarketCard } from '@/components/settings/tracking/market-marks'
import { PlatformsSection } from '@/components/settings/tracking/platforms'
import { SearchSetCard } from '@/components/settings/tracking/search-set'
import { marketSplit, SearchesEachUpdate, WhereItCameFrom, WhereWeReadIt, YourMarketCard, type IndexEntry } from '@/components/settings/tracking/your-market'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { brandRulesFor } from '@/lib/brands/aliases'
import { NOT_COUNTED_YET } from '@/lib/brands/precision'
import { redditDiscoveryEnabled } from '@/lib/config'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { loadBrandsBlock } from '@/lib/pages/overview-brands'
import { topicNote } from '@/lib/pages/overview-market/brands'
import { prevMonth } from '@/lib/reading/month-key'
import { readingHandle } from '@/lib/reading/read'
import { communityRows, tableRows, unconfiguredShare } from '@/lib/settings/communities'
import { platformRows } from '@/lib/settings/connections'
import { loadMakersLine } from '@/lib/settings/makers-line'
import { loadQueue, queueLines, queueSummary, type QueueColumn } from '@/lib/settings/queue'
import { rivalRows } from '@/lib/settings/rivals-view'
import { byFirstDay, communityDays, communitySince, exclusionGroups, firstSearchedOn, searchedAs, setHistory, trackedSince } from '@/lib/settings/search-set'
import { SET_GROUPS } from '@/lib/settings/set-groups'
import { termDateShort } from '@/lib/settings/terms'
import { loadTrackingPage } from '@/lib/settings/tracking-load'
import { loadYourMarket, searchPlan } from '@/lib/settings/your-market'
import { oneLineBar } from '@/lib/shell/bar'
import { createAdminClient } from '@/lib/supabase-admin'
import { tenantLocked } from '@/lib/tenant-locks'
import { marketPairChip, notMyMarketCount, ownPostsIn, prevMarketSplit } from './market-read'
import { TermPerformance } from './term-performance'
import { TrackingForm } from './tracking-form'
import type { SearchTermsConfig, TrackingConfig } from './config-shapes'

// Settings › What we read (the key and the address stay `tracking`), as the
// approved preview's "What we read" artboard draws it (market-first WP3.10):
// tiles on the page's twelve columns, in the artboard's order.
//   1. Your market, with the page's index beside it;
//   2. The search set: held still until January, each search with the day we
//      first searched it, and how the set got here. Its one control opens the
//      editor (the page's one form) in the set's place;
//   3. Where your market came from: each search, with its makers;
//   4. Where we read it, and Searches each update, side by side;
//   5. Brands you track;
//   6. Makers, and This is not my market, side by side.
// Every save path the page had is the editor's: the terms, the brands you
// track (with the rename), the communities you watch, each written with its
// actor or, where the searches are held still, queued for the 1st. There is
// no cadence (deploy 2b: every workspace is weekly, on Sunday).
//
// THE ONE FIGURE HERE ON THE RUN CLOCK, LABELLED. A term's yield is a property
// of the GATHER, and `keyword_performance.created_at` is the run's date; the
// editor's term record ("How they are doing") says so in its column head.
// Every other month on this page is dated by the comment.
//
// THIS FILE IS A LOADER AND A COMPOSITION AND NOTHING ELSE. Every card is a
// component under components/settings/tracking/ with a static render test.

export default async function SettingsTrackingPage({ searchParams }: { searchParams?: Promise<{ searches?: string }> }) {
  const params = (await searchParams) ?? {}
  const session = await getSessionContext()
  const { supabase, clientId, role } = session
  const canEdit = canManageTenant(role)
  // The one read on this page that a tenant session may never make: the
  // community a verdict was about is `gate_verdicts.account_name`, which M8
  // withholds from `authenticated`. Owners and admins get it through the
  // service role, in this server component; everyone else gets the table
  // without the column and is told so.
  const inputs = await loadTrackingPage(supabase, clientId, canEdit ? createAdminClient() : null, readingHandle(clientId))
  const month = inputs.censusMonth
  const nowIso = new Date().toISOString()
  // HELD STILL UNTIL JANUARY (decision I, WP3.10): a locked tenant's term,
  // rival and handle edits wait in the queue. Before MF3 there is no queue; a
  // read that fails otherwise draws the strip without a list rather than a
  // queue with nothing in it.
  const locked = tenantLocked(clientId, 'tracking')
  const names = ((inputs.config?.competitor_names as string[] | null) ?? []).filter(Boolean)
  // YOUR MARKET (WP3.10): the market's parts, each search's share with its
  // makers, the category's platforms, the brands' counts and the makers line,
  // on the reading month. The service role, because MF1's functions are
  // granted to it alone; counts only, of the session's own tenant. A failed
  // read prints "not measured", as a missing table does.
  const admin = createAdminClient()
  const say = (what: string) => (error: unknown): null => {
    console.error(`[settings] ${what} not read for ${clientId}: ${(error as { message?: string }).message ?? String(error)}`)
    return null
  }
  const [queue, market, brands, makersLine, ownPosts, byYou] = await Promise.all([
    locked ? loadQueue(supabase, clientId).catch(say('tracking queue')) : Promise.resolve(null),
    loadYourMarket(admin, clientId, month).catch(say('your market')),
    loadBrandsBlock(admin, clientId, month).catch(say('brands')),
    loadMakersLine(admin, clientId, month, [inputs.tenant, ...names]),
    ownPostsIn(supabase, clientId, month),
    notMyMarketCount(supabase, clientId),
  ])
  const before = prevMonth(month)
  const [prevSplit, chip] = await Promise.all([
    market?.market ? prevMarketSplit(admin, clientId, before) : Promise.resolve(null),
    market?.market ? marketPairChip(clientId, before, month, nowIso) : Promise.resolve(null),
  ])
  const moves = surface('market')
  const front = surface('overview')
  const conversation = surface('voice')
  const brandsPage = surface('competitive')

  const c = inputs.config as TrackingConfig | null
  const terms = inputs.config as SearchTermsConfig | null
  const platforms = (inputs.config?.platforms as string[] | null) ?? []
  const ownHandles = (inputs.config?.own_handles as Record<string, string> | null) ?? {}
  const handles = (inputs.config?.competitor_handles as Record<string, Record<string, string>> | null) ?? {}
  const plan = searchPlan((inputs.config ?? {}) as Parameters<typeof searchPlan>[0], redditDiscoveryEnabled())
  const split = market?.market ? marketSplit(market.market) : null
  const makers = market?.makers ?? 'not_measured'

  const lists = {
    brand_keywords: terms?.brand_keywords ?? [],
    competitor_keywords: terms?.competitor_keywords ?? [],
    industry_keywords: terms?.industry_keywords ?? [],
  }
  const searchedTerms = [...lists.brand_keywords, ...lists.competitor_keywords, ...lists.industry_keywords]
  // Each group's chips in the order they joined what we read, as the approved
  // preview draws them (the earliest first, a tie as the list holds it).
  const days = firstSearchedOn(inputs.setChanges, inputs.updates)
  const dayOfTerm = (t: string) => days.get(t.trim().toLowerCase())
  const since = communitySince(inputs.entries, inputs.setChanges)
  const sinceOn = communityDays(inputs.entries, inputs.setChanges)
  const communities = byFirstDay(inputs.entries.filter((e) => e.status === 'active'), (e) => sinceOn.get(e.name))
    .map((e) => ({ name: e.name, day: since.get(e.name) ?? null }))
  const rivals = rivalRows({ names, handles, identities: inputs.rivals, census: inputs.census, month })
  const queued = queue?.state === 'available' ? queueLines(queue.rows, inputs.config as Partial<Record<QueueColumn, unknown>> | null) : []
  const communityTable = communityRows({ entries: inputs.entries, roi: inputs.roi, gate: inputs.communityKept ?? [] })
  const table = tableRows(communityTable)

  // Brands you track in the Brands page's order where it counted them (the
  // counted, then those mostly another word), then the rest by the videos
  // filed under them, then as the list names them.
  const topics = brands?.topics ?? []
  const order = new Map(topics.filter((t) => t.count === 'counted' || t.noise).map((t, i) => [t.label.toLowerCase(), i]))
  const rules = brandRulesFor(clientId)
  const brandRows: BrandRow[] = names
    .map((name, i) => {
      const k = name.toLowerCase()
      const topic = topics.find((t) => t.label.toLowerCase() === k) ?? null
      const identity = inputs.rivals.find((r) => r.name.toLowerCase() === k && !r.retired_at) ?? null
      const own = rivals.find((r) => r.name === name)?.ownPosts ?? null
      const row: BrandRow = {
        name,
        searchedAs: searchedAs(name, rules.find((r) => r.key.kind === 'rival' && r.brand.toLowerCase() === k) ?? null, lists.competitor_keywords),
        since: trackedSince(name, inputs.setChanges, identity?.first_seen_at ?? null),
        filed: split ? split.byBrand.find((b) => b.name.toLowerCase() === k)?.videos ?? 0 : null,
        came: topic && topic.count === 'counted' && topic.kAny != null && topic.kOrganic != null
          ? { kOrganic: topic.kOrganic, kAny: topic.kAny }
          : { note: (topic ? topicNote(topic) : null) ?? NOT_COUNTED_YET },
        ownPosts: own ? own.value.k : null,
      }
      return { i, row }
    })
    .sort((a, b) =>
      (order.get(a.row.name.toLowerCase()) ?? names.length) - (order.get(b.row.name.toLowerCase()) ?? names.length)
      || (b.row.filed ?? 0) - (a.row.filed ?? 0)
      || a.i - b.i)
    .map((x) => x.row)

  const withVideos = split ? brandRows.filter((r) => (r.filed ?? 0) > 0).length : null
  const index: IndexEntry[] = [
    { href: '#search-set', title: 'The search set', sub: `${fmtInt(searchedTerms.length)} terms${locked ? ' · held still' : ''}` },
    { href: '#by-search', title: 'Where your market came from', sub: makers === 'measured' ? 'each search, with its makers' : 'each search' },
    { href: '#platforms', title: 'Where we read it', sub: `${fmtInt(platforms.length)} platforms · ${fmtInt(plan.used)} searches` },
    { href: '#brands', title: 'Brands you track', sub: withVideos != null ? `${fmtInt(names.length)} · ${fmtInt(withVideos)} with ${longMonth(month)} videos` : fmtInt(names.length) },
    ...(makers !== 'no_rule' ? [{ href: '#makers', title: 'Makers', sub: 'kept, grouped and marked' }] : []),
    { href: '#not-mine', title: 'This is not my market', sub: 'what is set aside' },
  ]

  return (
    <SettingsFrame active="tracking" title="Settings" bar={oneLineBar(inputs.tenant, inputs.reading)}>
      {inputs.configFailed ? (
        <p className="text-[12.5px] text-muted-foreground">We could not load your settings just now. Refresh the page, and tell us if it keeps happening.</p>
      ) : !c || !terms ? (
        <p className="text-[12.5px] text-muted-foreground">No tracking config for this workspace. Nothing is tracked until this is set up with you.</p>
      ) : (
        <CardGrid>
          <YourMarketCard
            month={month}
            soFar={inputs.reading?.state === 'so_far'}
            videos={market?.market?.length ?? null}
            split={split}
            prev={prevSplit ? { month: before, split: prevSplit } : null}
            chip={chip}
            ownPosts={ownPosts}
            movesLabel={moves.label}
            movesHref={moves.href}
            marketLabel={front.label}
            marketHref={front.href}
            index={index}
          />
          <SearchSetCard
            locked={locked}
            queue={queue?.state === 'available' ? { state: 'available', summary: queueSummary(queued, nowIso), lines: queued } : { state: 'unavailable' }}
            canEdit={canEdit}
            groups={SET_GROUPS.map((g) => ({ key: g.key, label: g.label, sub: g.sub, terms: byFirstDay(lists[g.key], (t) => dayOfTerm(t)?.on).map((t) => ({ term: t, day: dayOfTerm(t)?.words ?? null })) }))}
            communities={communities}
            exclusions={exclusionGroups(clientId, terms.exclude_terms ?? [])}
            history={setHistory({ changes: inputs.setChanges, terms: searchedTerms, updates: inputs.updates, locked, now: nowIso })}
            recordHref="/dashboard/settings/record"
            editor={
              <TrackingForm
                canEdit={canEdit}
                terms={{ ...lists, exclude_terms: terms.exclude_terms ?? [] }}
                dates={Object.fromEntries([...inputs.termDates].map(([term, date]) => [term, termDateShort(date)]))}
                datesNote={
                  inputs.termDates.size === 0
                    ? 'We have not written down when a term was added yet.'
                    : 'A date on a term is when it entered the set. “In use by” means we worked it out afterwards from what an update searched: a label, not a record.'
                }
                review={inputs.performance.rows.filter((t) => t.worthReviewing)}
                rivals={rivals}
                names={names}
                month={month}
                lastChange={inputs.lastChange}
                lastChangeNote={inputs.lastChangeNote}
                affectsRecorded={inputs.affectsRecorded}
                performance={<TermPerformance rows={inputs.performance.rows} updates={inputs.performance.updates} months={inputs.termYield} />}
                communities={
                  <CommunitiesSection
                    rows={table.shown}
                    hidden={table.hidden}
                    hiddenPosts={table.hiddenPosts}
                    unconfigured={unconfiguredShare(communityTable)}
                    canEdit={canEdit}
                    keptClosed={inputs.communityKept === null}
                  />
                }
                platforms={
                  <PlatformsSection
                    rows={platformRows({ platforms, communities: communityTable.filter((r) => !r.unconfigured).length, mix: inputs.platformMix, videos: inputs.monthVideos })}
                    ownAccounts={ownHandles}
                  />
                }
              />
            }
          />
          <WhereItCameFrom
            month={month}
            marketVideos={market?.market?.length ?? null}
            terms={market?.terms ?? null}
            makers={makers}
            all={params.searches === 'all'}
            allHref="/dashboard/settings?searches=all#by-search"
            topHref="/dashboard/settings#by-search"
            askOnCall={locked}
          />
          <WhereWeReadIt
            month={month}
            category={split ? split.category : null}
            mix={market?.mix ?? null}
            conversationLabel={conversation.label}
            conversationHref={conversation.href}
          />
          <SearchesEachUpdate plan={plan} terms={searchedTerms.length} />
          <BrandsYouTrackCard month={month} rows={brandRows} brandsLabel={brandsPage.label} brandsHref={brandsPage.href} />
          <MakersCard
            month={month}
            makers={makers}
            counts={market?.segmentCounts ?? null}
            line={makersLine}
            askOnCall={locked}
            conversationLabel={conversation.label}
            conversationHref={conversation.href}
          />
          <NotMyMarketCard month={month} byYou={byYou} counts={market?.segmentCounts ?? null} makers={makers} span={makers === 'no_rule' ? 12 : 6} />
        </CardGrid>
      )}
    </SettingsFrame>
  )
}
