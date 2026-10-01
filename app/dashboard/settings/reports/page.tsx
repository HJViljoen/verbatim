import { redirect } from 'next/navigation'

// Settings › Reports and recipients moved into the Studio (pages build, 1 Oct):
// who gets each report is edited from its row in "Your reports". The address
// stays, for links already in circulation.
export default function SettingsReportsPage(): never {
  redirect('/dashboard/studio')
}
