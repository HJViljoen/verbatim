import { PlatformIcon } from '@/components/charts/platform-icon'
import { Figure, GridRow, GridTable, MonoNote, Section, SectionHead } from '@/components/settings/chrome'
import { platformLabel } from '@/lib/format'
import type { PlatformRow } from '@/lib/settings/connections'

// `settings.platforms` — where we listen, at the artboard's density.
//
// THE SWITCHES ARE NOT DRAWN. The artboard puts a toggle on every row;
// `tracking_configs.platforms` has no client write path anywhere in the app —
// it moves cost directly and is an operator lever — so the row keeps the built
// page's status pill in the same cell. A switch that cannot switch is worse
// than a word that can be read.
//
// THE SHARE IS THE MONTH'S, AND IT SAYS WHOSE. `month_denominators.platform_mix`
// for the comment-dated month is the only honest source (lib/settings/
// connections.ts explains why nothing else is), and a percentage with no
// population named is D8's own example of a figure that cannot be checked —
// so the basis sentence under the rows is not optional, and where the month has
// not been read the column is blank rather than zero.

const COLS = '200px minmax(0,1fr) 110px 110px'
const HEAD = ['Platform', 'What we read', 'Share', ''] as const

export function PlatformsSection({ rows, basis, ownAccounts }: {
  rows: readonly PlatformRow[]
  /** Whose videos, in which month, at what stage of the freeze. */
  basis: string
  /** The client's own accounts, per platform — the row the artboard has no
   *  line for and the product needs, because "no account of yours is
   *  configured" is the commonest reason a brand cannot see itself. */
  ownAccounts: Readonly<Record<string, string>>
}) {
  const mine = Object.entries(ownAccounts).filter(([, v]) => v && v.trim() !== '')
  const on = rows.filter((r) => r.connected).length
  return (
    <Section>
      <SectionHead title="Platforms" meta={`${on} on · ${basis}`} />
      <GridTable cols={COLS} min={820} head={HEAD}>
        {rows.map((r) => (
          <GridRow
            key={r.platform}
            cols={COLS}
            minHeight={48}
            cells={[
              <span key="n" className="inline-flex items-center gap-2 text-[12.5px] font-medium">
                <PlatformIcon platform={r.platform} size={14} className="text-secondary-foreground" />
                {r.label}
              </span>,
              <span key="w" className="block text-left text-[12.5px] text-muted-foreground">{r.reads}</span>,
              <Figure key="s" value={r.share === null ? '—' : `${r.share.toFixed(0)}%`} muted={r.share === null} />,
              <span
                key="c"
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-px text-[10.5px] font-medium ${r.connected ? 'bg-accent text-accent-foreground' : 'bg-warning/15 text-warning'}`}
              >
                {r.connected ? 'Connected' : 'Not connected'}
              </span>,
            ]}
          />
        ))}
      </GridTable>
      <MonoNote className="max-w-[820px]">
        Your accounts:{' '}
        {mine.length === 0
          ? 'none configured — the search still finds you, but nothing you publish is read as yours'
          : mine.map(([p, h]) => `${platformLabel(p)} ${p === 'youtube' ? h : `@${h}`}`).join(' · ')}
      </MonoNote>
    </Section>
  )
}
