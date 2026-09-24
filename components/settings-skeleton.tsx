import { PageFrame, PageBar } from '@/components/shell/page-grid'
import { Bone, BoneLines } from '@/components/shell/skeleton'
import { SETTINGS_SUBPAGES } from '@/lib/settings/rail'

// One skeleton for every page inside the settings frame
// (components/settings-frame.tsx): the seven sub-pages under
// /dashboard/settings, plus Team and Billing. It draws what the frame draws
// since the artboard port: a BARE 224px rail on white (the "Settings" label
// and one 40px row per sub-page, read from the same `SETTINGS_SUBPAGES` the
// real rail maps), beside a flat column whose header is a 15px title, a mono
// meta and one sentence of rule, then `cards` flat inner blocks
// (`SettingsCard`). The old version drew the rail and the pane as two elevated
// cards, which the frame stopped doing, so every settings page jumped when it
// landed.
export function SettingsSkeleton({ title, cards = 3 }: { title: string; cards?: number }) {
  return (
    <PageFrame className="min-h-0 flex-1">
      <span role="status" className="sr-only">Loading {title}…</span>
      <PageBar title={title} context={<Bone className="h-3 w-32" />}>
        <Bone className="h-3 w-24" />
      </PageBar>
      <div className="flex min-h-0 flex-col items-start gap-6 md:flex-row md:gap-8">
        <nav aria-hidden className="flex w-full shrink-0 flex-col gap-0.5 md:w-[224px]">
          <div className="flex h-[26px] items-center px-3"><Bone className="h-2 w-14" /></div>
          {SETTINGS_SUBPAGES.map((s, i) => (
            <div key={s.key} className="flex min-h-10 items-center px-3">
              <Bone className={i % 3 === 0 ? 'h-3 w-3/5' : i % 3 === 1 ? 'h-3 w-2/5' : 'h-3 w-1/2'} />
            </div>
          ))}
        </nav>
        <section className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
          <header className="flex flex-col gap-1.5 pb-4">
            <div className="flex items-baseline gap-3"><Bone className="h-4 w-36" /><Bone className="h-2.5 w-24" /></div>
            <Bone className="h-3 w-2/3" />
          </header>
          <div className="flex flex-col gap-3">
            {Array.from({ length: cards }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md bg-inner px-4 py-3.5">
                <Bone className="h-3.5 w-32 bg-tile" /><Bone className="h-2.5 w-2/3 bg-tile" /><BoneLines lines={3} className="[&>*]:bg-tile" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageFrame>
  )
}
