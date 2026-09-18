import { Dot, Figure, gridIntrinsic, GridRow, GridTable, MonoNote, Section, SectionHead } from '@/components/settings/chrome'
import { shortDate } from '@/lib/format'
import { REDDIT_CAP_LINE } from '@/lib/reading/method'
import { COMMUNITY_STATE_RULE, communitiesMeta, communityWords, type CommunityRow } from '@/lib/settings/communities'
import { CommunityAction, CommunityAdd } from './community-controls'

// `settings.reddit.*` — the watched communities, at the artboard's density.
//
// THE COLUMNS ARE THE ARTBOARD'S PLUS THE TWO THE BUILD EARNED. Community ·
// found · state · posts · comments are the drawing; Kept and Findings are what
// the built page already computes per community (`keptByCommunity`, the ROI
// reader) and they are the two columns that answer "is this community worth
// watching", which is the whole question the section exists for.
//
// THREE THINGS THE ARTBOARD SAYS THAT THE DATA DOES NOT.
//
//  1. "Watched since". The date we hold is `subreddits[].discovered_at` — when
//     the pipeline FOUND the community — and a community somebody typed in has
//     none at all. So the column is headed "Found" and a hand-added row is
//     blank rather than carrying a date that means something else (D14).
//  2. "214 threads · 1,880 comments this month". Both figures are lifetime
//     stored posts and comments; there is no per-community month table, and
//     counting `videos` over a date span is the re-derivation lib/reading
//     exists to stop. The heads say `all time` (D9).
//  3. "active ≥ 10 threads · probe 1–9 · no yield 0". That derives a state from
//     a gather count, so a week we did not run demotes a healthy community.
//     The state is a decision, `communityWords` says which one, and the rule
//     beside the head says that.
//
// AND THE ONE IT GETS EXACTLY RIGHT: an em dash on a row that yielded nothing,
// never a `0`. A zero is a measurement; a dash is "nothing came back", which is
// what a community with no stored posts actually tells you.

const COLS = '188px 84px 212px 92px 104px 72px 84px minmax(104px,1fr)'
/** Derived, never declared: the eight tracks and their seven gaps come to
 *  1,024px, and a hand-typed 980 left the "Stop watching" column hanging 44px
 *  past the end of every row rule at the page's real content width. */
const COLS_MIN = gridIntrinsic(COLS)
// Community, Found and State hold words; the five after them hold figures and
// a control. The head reads the way its column does (design H1).
const ALIGN = ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'right'] as const
const HEAD = ['Community', 'Found', 'State', 'Posts · all time', 'Comments · all time', 'Kept', 'Findings', ''] as const

export function CommunitiesSection({
  rows, hidden, hiddenPosts, unconfigured, canEdit, keptClosed,
}: {
  rows: readonly CommunityRow[]
  hidden: number
  hiddenPosts: number
  unconfigured: { posts: number; fromUnconfigured: number; pct: number }
  canEdit: boolean
  /** True where the kept-rate column is closed to this reader (M8 withholds
   *  the community a verdict was about from every tenant session). */
  keptClosed: boolean
}) {
  return (
    <Section>
      <SectionHead title="Watched communities" meta={communitiesMeta(rows)} rule={COMMUNITY_STATE_RULE} />

      {rows.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">No community is watched for this workspace.</p>
      ) : (
        <GridTable cols={COLS} min={COLS_MIN} head={HEAD} align={ALIGN}>
          {rows.map((r) => (
            <GridRow
              key={r.key}
              cols={COLS}
              align={ALIGN}
              cells={[
                <span key="n" className="block truncate text-[12.5px] font-medium">{r.label}</span>,
                <span key="d" className="block font-mono text-[11.5px] text-muted-foreground">
                  {r.discoveredAt ? shortDate(`${r.discoveredAt.slice(0, 10)}T00:00:00.000Z`) : ''}
                </span>,
                <span key="s" className="block text-[12px] text-secondary-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Dot tone={toneOf(r)} />
                    {communityWords(r)}
                  </span>
                  {r.probe && (
                    <span className="block font-mono text-[10.5px] text-muted-foreground">
                      sampled {r.probe.at}: {r.probe.kept} of {r.probe.sampled} on topic
                    </span>
                  )}
                </span>,
                <Figure key="p" value={r.posts > 0 ? r.posts.toLocaleString('en-GB') : '—'} muted={r.posts === 0} />,
                <Figure key="c" value={r.comments > 0 ? r.comments.toLocaleString('en-GB') : '—'} muted={r.comments === 0} />,
                <Figure key="k" value={r.keptPct === null ? '—' : `${r.keptPct.toFixed(0)}%`} muted={r.keptPct === null} />,
                <Figure key="i" value={r.insights > 0 ? r.insights.toLocaleString('en-GB') : '—'} muted={r.insights === 0} />,
                <CommunityAction
                  key="a"
                  name={r.key}
                  op={r.status === 'active' || r.status === 'candidate' ? 'stop' : 'add'}
                  canEdit={canEdit}
                />,
              ]}
            />
          ))}
        </GridTable>
      )}

      <CommunityAdd canEdit={canEdit} note={REDDIT_CAP_LINE} />

      {hidden > 0 && (
        <MonoNote className="max-w-[820px]">
          {hidden} further communit{hidden === 1 ? 'y is' : 'ies are'} not shown, between them carrying{' '}
          {hiddenPosts.toLocaleString('en-GB')} post{hiddenPosts === 1 ? '' : 's'} — one or two each, dragged in by a
          search and not by anyone’s choice.
        </MonoNote>
      )}
      {unconfigured.posts > 0 && unconfigured.fromUnconfigured > 0 && (
        <MonoNote className="max-w-[820px]">
          {unconfigured.pct.toFixed(0)}% of the Reddit posts we hold for you came from communities nobody put on the
          list — the search found them. They are counted the same way, and they are the first place to look when a
          Reddit figure looks wrong.
        </MonoNote>
      )}
      {keptClosed && (
        <MonoNote className="max-w-[820px]">
          How much of each community we kept is shown to owners and admins only — it is read off the accounts other
          people posted from, and the fewer copies of those we hand around the better.
        </MonoNote>
      )}
    </Section>
  )
}

/** The dot's tone follows the DECISION, not a yield: watched is good, proposed
 *  is a watch, ruled out or stopped is neither. */
function toneOf(r: CommunityRow): 'good' | 'watch' | 'none' {
  if (r.status === 'active') return 'good'
  if (r.status === 'candidate' || r.unconfigured) return 'watch'
  return 'none'
}
