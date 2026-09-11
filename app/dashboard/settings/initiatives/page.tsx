import Link from 'next/link'
import { SettingsFrame, SettingsCard } from '@/components/settings-frame'
import { InitiativeRowForm } from './initiative-row'
import { getSessionContext } from '@/lib/auth'
import { weekdayDate } from '@/lib/format'
import { toInitiative, type InitiativeDbRow } from '@/lib/initiatives/types'

// Settings › Initiatives — the list of what this workspace declared it is
// trying to move, and the only place to rename, finish or stop one. Declaring
// happens where the theme is (Voice of Customer): a list of themes with no
// evidence beside them is not where anyone decides what to track.

export default async function InitiativesSettingsPage() {
  const { supabase, clientId } = await getSessionContext()

  const [{ data: client }, { data: rows }] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    supabase
      .from('initiatives')
      .select('id, title, goal, registry_ids, competitor_name, direction, started_at, status, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
  ])

  const initiatives = ((rows ?? []) as InitiativeDbRow[]).map(toInitiative)
  const active = initiatives.filter((i) => i.status === 'active')

  // Theme names for the rows — read once, by identity. A label is display only:
  // it is the registry id that the measurement follows.
  const registryIds = [...new Set(initiatives.flatMap((i) => i.registryIds))]
  const { data: registry } = registryIds.length
    ? await supabase.from('theme_registry').select('id, canonical_label').eq('client_id', clientId).in('id', registryIds)
    : { data: [] }
  const labelById = new Map(((registry ?? []) as { id: string; canonical_label: string }[]).map((r) => [r.id, r.canonical_label]))

  return (
    <SettingsFrame
      active="initiatives"
      title="Settings"
      context={client?.company_name ?? 'Client'}
      contentTitle="Initiatives"
      contentMeta={initiatives.length > 0 ? `${active.length} being tracked · ${initiatives.length} in all` : undefined}
    >
      <div className="flex flex-col gap-3">
        <SettingsCard
          title="What you are trying to move"
          description="Each one is measured on the themes it was declared with, from the day you declared it. We report whether that conversation grew or shrank — never whether you succeeded."
        >
          {initiatives.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Nothing tracked yet. Open a theme in{' '}
              <Link href="/dashboard/voice" className="font-medium underline underline-offset-2">Voice of Customer</Link>{' '}
              and choose “Track this theme”.
            </p>
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
