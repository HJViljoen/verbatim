import type { CostsData } from '@/lib/costs/load'
import { buildCostsView } from '@/lib/costs/view'
import { buildMoneyView, type FinanceRows } from '@/lib/finance/view'
import { Billing, Invoices, MoneyInMissing, MoneyInSummary, Payments } from './money-in'
import { CostsBody } from './sections'

// Ops → Costs with Money in on top (Finance, 2026-11-17): the costs as before,
// and, once the finance migration is in, the invoices, payments and billing
// above them. `finance` null = the migration is not applied: the page says so
// and the costs below work as they did.

export function CostsPageBody({ data, finance, pdfUrls, now }: {
  data: CostsData
  finance: FinanceRows | null
  pdfUrls?: ReadonlyMap<string, string>
  now: Date
}) {
  if (!finance) return <CostsBody data={data} money={{ top: <MoneyInMissing />, comingUp: [], owedByClientZar: new Map(), fxSwitch: false }} />

  const usdZar = data.settings.usdZar
  // A month's costs as the plan works them out (the page's own forecast).
  const costsThisMonthZar = buildCostsView(data).forecast.now.costZar
  const view = buildMoneyView(finance, {
    today: data.today,
    usdZar,
    costsThisMonthZar,
    clientNames: new Map(data.clients.map((c) => [c.id, c.name])),
    pdfUrls,
  })
  // "Owed to you" is ONE figure on the page: the invoices' balances for the
  // clients that have invoices, the hand-kept unpaid amount for the rest
  // (lib/costs/view.ts), the same in this tile and in the summary below.
  const owedToYouZar = buildCostsView(data, { owedByClientZar: view.summary.owedByClientZar }).owedToYouZar
  const top = (
    <>
      <MoneyInSummary view={view} usdZar={usdZar} owedToYouZar={owedToYouZar} />
      <Invoices view={view} today={data.today} usdZar={usdZar} now={now} />
      <div className="grid grid-cols-1 gap-[22px] xl:grid-cols-2">
        <Payments view={view} today={data.today} />
        <Billing view={view} />
      </div>
    </>
  )
  return <CostsBody data={data} money={{ top, comingUp: view.comingUp, owedByClientZar: view.summary.owedByClientZar, fxSwitch: true }} />
}
