import { SettingsFrame, SettingsCard } from '@/components/settings-frame'
import { InitiativeRowForm } from './initiative-row'
import { getSessionContext } from '@/lib/auth'
import { settingsBar } from '@/lib/settings/bar'
import { weekdayDate } from '@/lib/format'
import { rows as readRows, row } from '@/lib/pages/read'
import { toInitiative, type InitiativeDbRow } from '@/lib/initiatives/types'
import { OldPageBanner } from '@/components/shell/old-page-banner'
import { PARKED_INITIATIVES } from '@/lib/nav'

// Settings › Initiatives — the list of what this workspace declared it is
// trying to move, and the only place to rename, finish or stop one. Declaring
// happened where the theme was (the old Voice page): a list of themes with no
// evidence beside them is not where anyone decides what to track.
//
// The card's promise comes from `initiativePromise()`, which is gated on D1:
// this page and the "Track this theme" sheet are the two places the product
// tells a client what tracking will give them back, and both must promise only
// what the tile can currently draw.
//
// PARKED, NOT RETIRED (Phase 1 WP9). What a client is trying to move reads on
// Market as "moves" from WP14 on, and this page goes when that panel can do
// what it does. Until then it stays and wears the banner, by the same rule
// Market Intelligence and Competitive Intelligence do: a page whose job has
// nowhere else to go is parked, never redirected.

export default async function InitiativesSettingsPage() {
  const { supabase, clientId } = await getSessionContext()

  const [clientRes, initiativesRes] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    supabase
      .from('initiatives')
      .select('id, title, goal, registry_ids, direction, started_at, status, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
  ])

  const client = row<{ company_name: string | null }>(clientRes, 'initiatives.client')
  const initiatives = readRows<InitiativeDbRow>(initiativesRes, 'initiatives.list').map(toInitiative)

  // Theme names for the rows — read once, by identity. A label is display only:
  // it is the registry id that the measurement follows.
  const registryIds = [...new Set(initiatives.flatMap((i) => i.registryIds))]
  const registryRes = registryIds.length
    ? await supabase.from('theme_registry').select('id, canonical_label').eq('client_id', clientId).in('id', registryIds)
    : { data: [], error: null }
  const labelById = new Map(readRows<{ id: string; canonical_label: string }>(registryRes, 'initiatives.registry').map((r) => [r.id, r.canonical_label]))
  // THE ONE-LINE BAR (the 25 Sep rulings, WP3.10), as on every Settings
  // sub-page; and no meta beside the pane title: the counts are the list's.
  const bar = await settingsBar(supabase, clientId, client?.company_name ?? 'Your workspace')

  return (
    <SettingsFrame
      // Parked, and not one of the seven: the rail lights nothing here (WP16).
      active={null}
      title="Settings"
      context={client?.company_name ?? 'Client'}
      bar={bar}
      contentTitle="Initiatives"
    >
      <div className="flex flex-col gap-3">
        <OldPageBanner page={PARKED_INITIATIVES} />
        <SettingsCard
          title="What you are trying to move"
          description="Each one is measured on the themes it was declared with, from the day you declared it."
        >
          {initiatives.length === 0 ? (
            // NO "TRACK THIS THEME" TO POINT AT (WP3.10). The empty state sent a
            // reader to "Voice of Customer" to choose "Track this theme"; the
            // page at that address is Conversation now and draws no such
            // control, so the sentence claimed a behaviour the code does not
            // have (GS constraint 8). The banner above names where this goes.
            <p className="text-[12px] text-muted-foreground">Nothing tracked yet.</p>
          ) : (
            <div className="flex flex-col">
              {initiatives.map((i) => (
                <InitiativeRowForm
                  key={i.id}
                  initiative={i}
                  themeNames={i.registryIds.map((id) => labelById.get(id) ?? 'a theme no longer heard')}
                  startedLabel={weekdayDate(i.startedAt)}
                />
              ))}
            </div>
          )}
        </SettingsCard>
      </div>
    </SettingsFrame>
  )
}
