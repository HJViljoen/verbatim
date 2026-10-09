import { Fragment, type ReactNode } from 'react'
import {
  CalendarClock, ChartColumn, Coins, Gauge, ListOrdered, Receipt, SlidersHorizontal, Users, Wallet,
} from 'lucide-react'
import { Card, CardTitle } from '@/components/pages/studio/ui'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { addDays, daysBetween, fmtDay, fmtWeekday } from '@/lib/costs/dates'
import type { Charge } from '@/lib/costs/dates'
import type { FixedLine, Scenario } from '@/lib/costs/forecast'
import type { CostsData, RecentRun } from '@/lib/costs/load'
import { fmtNative, fmtUsd, fmtZar, toZar, type Rates } from '@/lib/costs/money'
import { RUN_CADENCE_LABEL, STAGE_LABEL } from '@/lib/costs/types'
import type { Pivot } from '@/lib/costs/usage'
import { buildCostsView, type CostsView } from '@/lib/costs/view'
import { cn } from '@/lib/utils'
import { AddBill, AddProspect, BalanceForm, BillItem, PlanItem, SettingsForm, ToggleButton } from './editors'
import { Pill, StagePill, ZarUsd } from './fields'

// The Costs page, laid out (operator only). Every figure arrives decided in
// `CostsView` (lib/costs/view.ts); these components print it. Cards are the
// Studio's (white on the ground, the card shadow, a title behind its icon
// tile); items inside a card are flat inner blocks (MASTER: blocks inside
// blocks, two levels, no border).

const PAD = 'gap-4 px-5 pt-[22px] pb-5 sm:px-[30px] sm:pt-[26px] sm:pb-[22px]'

function Section({ icon, title, meta, children, className }: { icon: Parameters<typeof CardTitle>[0]['icon']; title: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn(PAD, 'min-w-0', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <CardTitle icon={icon}>{title}</CardTitle>
        {meta ? <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">{meta}</div> : null}
      </div>
      {children}
    </Card>
  )
}

/** A signed rand figure: red below zero, a plus above. */
function Signed({ zar, rates, big = false }: { zar: number; rates: Rates; big?: boolean }) {
  const neg = Math.round(zar) < 0
  return (
    <span className={cn('tabular-nums', neg ? 'text-negative' : null)}>
      <span className={big ? 'font-mono text-[26px] font-semibold leading-none' : 'font-medium'}>
        {neg ? '' : Math.round(zar) > 0 ? '+' : ''}{fmtZar(zar)}
      </span>
      <span className={cn('ml-1.5 text-muted-foreground', big ? 'text-[13px]' : null)}>{fmtUsd(zar / rates.usdZar)}</span>
    </span>
  )
}

// ---- The figures at the top ------------------------------------------------------

function Figure({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-inner px-4 py-3.5">
      <span className="text-[12px] font-semibold text-secondary-foreground">{label}</span>
      <div>{children}</div>
      {sub ? <span className="text-[12px] leading-[1.4] text-muted-foreground">{sub}</span> : null}
    </div>
  )
}

export function Summary({ view, rates, prospectsCounted }: { view: CostsView; rates: Rates; prospectsCounted: boolean }) {
  const { now, planned } = view.forecast
  const trials = view.plans.filter((p) => p.stage === 'trial').map((p) => p.name)
  const plannedLabel = trials.length
    ? `Once ${trials.join(' and ')} ${trials.length === 1 ? 'converts' : 'convert'}`
    : 'Planned'
  return (
    <Card className={PAD}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="A month's costs" sub={`Bills ${fmtZar(now.fixedZar)} · usage ${fmtZar(now.usageZar)}`}>
          <span className="font-mono text-[26px] font-semibold leading-none tabular-nums">{fmtZar(now.costZar)}</span>
          <span className="ml-1.5 text-[13px] text-muted-foreground tabular-nums">{fmtUsd(now.costZar / rates.usdZar)}</span>
        </Figure>
        <Figure label="Revenue now" sub="Paying clients">
          <span className="font-mono text-[26px] font-semibold leading-none tabular-nums">{fmtZar(now.revenueZar)}</span>
          <span className="ml-1.5 text-[13px] text-muted-foreground tabular-nums">{fmtUsd(now.revenueZar / rates.usdZar)}</span>
        </Figure>
        <Figure label="Left over now" sub="Revenue less every cost">
          <Signed zar={now.leftZar} rates={rates} big />
        </Figure>
        <Figure label={plannedLabel} sub={`Revenue ${fmtZar(planned.revenueZar)}${prospectsCounted ? ', prospects counted' : ''}`}>
          <Signed zar={planned.leftZar} rates={rates} big />
        </Figure>
      </div>
      <p className="m-0 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        <span>
          Owed to you <ZarUsd zar={fmtZar(view.owedToYouZar)} usd={fmtUsd(view.owedToYouZar / rates.usdZar)} className="font-medium" />
        </span>
        <span>
          Owed by you <ZarUsd zar={fmtZar(view.owedByYouZar)} usd={fmtUsd(view.owedByYouZar / rates.usdZar)} className={cn('font-medium', view.owedByYouZar > 0 ? 'text-negative' : null)} />
        </span>
      </p>
    </Card>
  )
}

// ---- Coming up -------------------------------------------------------------------

export function ComingUp({ charges, data, rates }: { charges: Charge[]; data: CostsData; rates: Rates }) {
  const owed = data.bills.filter((b) => b.overdueAmount > 0)
  const total = charges.filter((c) => !c.late).reduce((s, c) => s + toZar(c.amount ?? 0, c.currency, rates), 0)
  return (
    <Section icon={CalendarClock} title="Coming up" meta={<span>Next 60 days · {fmtZar(total)}</span>}>
      {owed.length ? (
        <div className="flex flex-col gap-1.5 rounded-[10px] bg-negative/12 px-4 py-3 text-[13px]">
          {owed.map((b) => (
            <p key={b.id} className="m-0 text-negative">
              <span className="font-semibold">{b.name}</span>: {fmtNative(b.overdueAmount, b.currency)} owed now
              {b.currency !== 'ZAR' ? ` (${fmtZar(toZar(b.overdueAmount, b.currency, rates))})` : ''}
            </p>
          ))}
        </div>
      ) : null}
      {charges.length === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">Nothing charges in the next 60 days.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {charges.map((c, i) => {
            const days = daysBetween(data.today, c.date)
            return (
              <li key={`${c.billId}-${c.date}-${i}`} className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0">
                <span className={cn('font-mono text-[12px] tabular-nums', c.late ? 'font-semibold text-negative' : 'text-secondary-foreground')}>{fmtWeekday(c.date)}</span>
                <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13.5px]">
                  <span className="font-medium">{c.name}</span>
                  {c.late ? <Pill tone="bad">Date passed</Pill> : days <= 7 ? <Pill tone="soft">{days === 0 ? 'Today' : `In ${days} days`}</Pill> : null}
                  {c.status === 'failing' ? <Pill tone="bad">Failing</Pill> : null}
                  {c.isEstimate ? <Pill tone="faint">Estimate</Pill> : null}
                </span>
                <span className="text-right text-[13px] tabular-nums">
                  {c.amount === null ? <span className="text-muted-foreground">Not known</span> : (
                    <>
                      <span className="font-medium">{fmtZar(toZar(c.amount, c.currency, rates))}</span>
                      <span className="ml-1.5 text-muted-foreground">{fmtNative(c.amount, c.currency)}</span>
                    </>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </Section>
  )
}

// ---- OpenAI credit and Apify -----------------------------------------------------

export function OpenaiCredit({ view, data }: { view: CostsView; data: CostsData }) {
  const r = view.runway
  const s = data.settings
  const soon = r.state === 'out' || (r.daysLeft !== null && r.daysLeft <= 7)
  return (
    <Section icon={Wallet} title="OpenAI credit" meta={<span>Prepaid</span>}>
      {r.state === 'unknown' ? (
        <p className="m-0 text-[13px] text-muted-foreground">Enter the balance from platform.openai.com and the day you read it, and this works out when it runs out.</p>
      ) : (
        <div className="flex flex-col gap-1 text-[13px]">
          <p className={cn('m-0 text-[15px] font-semibold', soon ? 'text-negative' : null)}>
            {r.state === 'out' ? 'Probably out of credit now'
              : r.state === 'idle' ? 'Nothing is burning it'
              : `Runs out around ${fmtDay(r.runsOutOn as string)}${r.daysLeft !== null ? ` (${r.daysLeft} days)` : ''}`}
          </p>
          <p className="m-0 text-muted-foreground">
            About {fmtUsd(Math.max(0, r.remainingUsd))} left of {fmtUsd(s.openaiBalanceUsd ?? 0)} read on {fmtDay(s.openaiBalanceOn as string)}:
            {' '}{fmtUsd(data.openaiSinceBalanceUsd ?? 0)} logged since, {fmtUsd(r.untrackedSinceUsd)} of extras.
          </p>
          <p className="m-0 text-muted-foreground">
            Burning about {fmtUsd(r.dailyBurnUsd)} a day ({fmtUsd(view.openaiMonthlyBurnUsd)} a month: today&rsquo;s clients&rsquo; runs and Whisper, plus {fmtUsd(s.extraOpenaiUsd)} of extras).
          </p>
        </div>
      )}
      <BalanceForm balanceUsd={s.openaiBalanceUsd} balanceOn={s.openaiBalanceOn} today={data.today} />
    </Section>
  )
}

export function ApifyCycle({ view, data }: { view: CostsView; data: CostsData }) {
  const p = view.pace
  const c = data.apifyCycle
  const share = Math.min(1, p.capUsd > 0 ? p.spentUsd / p.capUsd : 0)
  const projected = Math.min(1, p.shareOfCap)
  const over = p.capHitOn !== null
  return (
    <Section icon={Gauge} title="Apify this cycle" meta={<span>{fmtDay(c.start)} to {fmtDay(addDays(c.next, -1))} · day {c.daysElapsed} of {c.daysInCycle}</span>}>
      <div className="flex flex-col gap-2 text-[13px]">
        <p className="m-0">
          <span className="font-mono text-[22px] font-semibold tabular-nums">{fmtUsd(p.spentUsd)}</span>
          <span className="ml-2 text-muted-foreground">spent of the {fmtUsd(p.capUsd)} cap</span>
        </p>
        <div
          role="img"
          aria-label={`${fmtUsd(p.spentUsd)} spent, ${fmtUsd(p.projectedUsd)} at this pace, against a ${fmtUsd(p.capUsd)} cap`}
          className="relative h-2.5 w-full overflow-hidden rounded-full bg-track"
        >
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand/40" style={{ width: `${projected * 100}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${share * 100}%` }} />
        </div>
        <p className={cn('m-0', over ? 'font-medium text-negative' : 'text-muted-foreground')}>
          At this pace {fmtUsd(p.projectedUsd)} by the cycle&rsquo;s end
          {over ? (p.capHitOn === data.today && p.spentUsd >= p.capUsd ? ': the cap is reached.' : `: the cap is reached around ${fmtDay(p.capHitOn as string)}.`) : '.'}
          {c.daysElapsed < 4 ? ' Early in the cycle, so the pace is rough.' : ''}
        </p>
        <p className="m-0 text-muted-foreground">
          The plan expects {fmtUsd(view.apifyPlannedUsd)} a cycle: today&rsquo;s clients&rsquo; runs and {fmtUsd(data.settings.extraApifyUsd)} of snapshots and tests.
          {view.apifyPlannedUsd < data.settings.apifyPlanUsd ? ` Apify bills ${fmtUsd(data.settings.apifyPlanUsd)}, its plan fee, whatever is used under it.` : ''}
        </p>
      </div>
    </Section>
  )
}

// ---- Bills -----------------------------------------------------------------------

export function Bills({ data, rates }: { data: CostsData; rates: Rates }) {
  const order = { failing: 0, watch: 1, active: 2, paused: 3, ended: 4 } as const
  const bills = [...data.bills].sort((a, b) =>
    order[a.status] - order[b.status]
    || (a.nextChargeOn ?? '9999').localeCompare(b.nextChargeOn ?? '9999')
    || a.name.localeCompare(b.name))
  return (
    <Section icon={Receipt} title="Bills" meta={<span>{bills.length} {bills.length === 1 ? 'bill' : 'bills'}</span>}>
      <div className="flex flex-col gap-2.5">
        {bills.map((b) => <BillItem key={b.id} bill={b} rates={rates} today={data.today} />)}
        {bills.length === 0 ? <p className="m-0 text-[13px] text-muted-foreground">No bills yet.</p> : null}
      </div>
      <div><AddBill /></div>
    </Section>
  )
}

// ---- The month ahead -------------------------------------------------------------

function Line({ label, sub, zar, rates, strong = false }: { label: ReactNode; sub?: ReactNode; zar: number; rates: Rates; strong?: boolean }) {
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-t border-border py-2 text-[13px] first:border-t-0', strong ? 'font-semibold' : null)}>
      <span className="min-w-0">
        {label}
        {sub ? <span className="block text-[12px] font-normal text-muted-foreground">{sub}</span> : null}
      </span>
      <ZarUsd zar={fmtZar(zar)} usd={fmtUsd(zar / rates.usdZar)} className="text-right" />
    </div>
  )
}

function UsageLines({ s, rates, data }: { s: Scenario; rates: Rates; data: CostsData }) {
  const z = (usd: number) => usd * rates.usdZar
  return (
    <>
      <Line label="OpenAI" sub={`Runs, plus ${fmtUsd(data.settings.extraOpenaiUsd)} for gbrain and tests`} zar={z(s.openaiUsd)} rates={rates} />
      <Line label="Transcripts" sub="Whisper, on the OpenAI credit" zar={z(s.transcriptsUsd)} rates={rates} />
      <Line
        label="Apify"
        sub={s.apifyAtFloor
          ? `Usage ${fmtUsd(s.apifyUsageUsd)} is under the ${fmtUsd(data.settings.apifyPlanUsd)} plan fee, which is what it bills`
          : `Runs, plus ${fmtUsd(data.settings.extraApifyUsd)} for snapshots and tests`}
        zar={z(s.apifyUsd)}
        rates={rates}
      />
    </>
  )
}

/** A fixed bill's sub-line: how it is charged, where the rand and dollar
 *  figures beside it do not already say so (a dollar or rand bill charged
 *  monthly needs none). */
function chargedAs(l: FixedLine): string | undefined {
  if (l.unknown) return 'Amount not known, counted as nothing'
  if (l.amount === null) return undefined
  const a = fmtNative(l.amount, l.currency)
  if (l.cadence === 'yearly') return `${a} a year`
  if (l.cadence === 'two_yearly') return `${a} every 2 years`
  if (l.currency === 'EUR') return `${a} a month`
  return undefined
}

function Totals({ title, s, rates }: { title: string; s: Scenario; rates: Rates }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] bg-inner px-4 py-3.5 text-[13px]">
      <span className="text-[12px] font-semibold text-secondary-foreground">{title}</span>
      <span className="flex justify-between gap-3">Revenue <ZarUsd zar={fmtZar(s.revenueZar)} usd={fmtUsd(s.revenueZar / rates.usdZar)} /></span>
      <span className="flex justify-between gap-3">Costs <ZarUsd zar={fmtZar(s.costZar)} usd={fmtUsd(s.costZar / rates.usdZar)} /></span>
      <span className="flex justify-between gap-3 font-semibold">Left over <Signed zar={s.leftZar} rates={rates} /></span>
    </div>
  )
}

export function MonthAhead({ view, data, rates }: { view: CostsView; data: CostsData; rates: Rates }) {
  const f = view.forecast
  const s = data.settings
  return (
    <Section
      icon={Coins}
      title="The month ahead"
      meta={(
        <>
          <ToggleButton name="countShared" on={s.countShared} label="Count Claude Max" />
          <ToggleButton name="countProspects" on={s.countProspects} label="Count prospects" />
        </>
      )}
    >
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[700px] border-collapse text-[13px]">
          <caption className="sr-only">Each client and prospect: what its runs cost, what it pays and what is left over</caption>
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-secondary-foreground">
              <th scope="col" className="pb-2 font-semibold">Client</th>
              <th scope="col" className="pb-2 font-semibold">Runs</th>
              <th scope="col" className="pb-2 pl-3 text-right font-semibold">Per run</th>
              <th scope="col" className="pb-2 pl-3 text-right font-semibold">Runs cost a month</th>
              <th scope="col" className="pb-2 pl-3 text-right font-semibold">Pays a month</th>
              <th scope="col" className="pb-2 pl-3 text-right font-semibold">Left now</th>
              <th scope="col" className="pb-2 pl-3 text-right font-semibold">Once paying</th>
            </tr>
          </thead>
          <tbody>
            {f.clients.map((c) => (
              <tr key={c.key} className="border-b border-border last:border-b-0 align-top">
                <td className="py-2.5 pr-3">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{c.name}</span>
                    <StagePill stage={c.stage} label={STAGE_LABEL[c.stage]} />
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-secondary-foreground">
                  {RUN_CADENCE_LABEL[c.cadence]}
                  <span className="block text-[12px] text-muted-foreground tabular-nums">{c.runsPerMonth ? `${c.runsPerMonth.toFixed(1)} a month` : 'none'}</span>
                </td>
                <td className="py-2.5 pl-3 text-right tabular-nums">
                  {c.perRunUsd === null ? <span className="text-muted-foreground">–</span> : fmtUsd(c.perRunUsd)}
                  <span className="block text-[12px] text-muted-foreground">{c.perRunSource === 'measured' ? 'last 3 full' : c.perRunSource === 'override' ? 'typed' : 'none yet'}</span>
                </td>
                <td className="py-2.5 pl-3 text-right"><ZarUsd zar={fmtZar(c.usageZar)} usd={fmtUsd(c.usageUsd)} /></td>
                <td className="py-2.5 pl-3 text-right"><ZarUsd zar={fmtZar(c.revenueZar)} usd={fmtUsd(c.revenueZar / rates.usdZar)} /></td>
                <td className="py-2.5 pl-3 text-right">{c.leftNowZar === null ? <span className="text-muted-foreground">–</span> : <Signed zar={c.leftNowZar} rates={rates} />}</td>
                <td className="py-2.5 pl-3 text-right">{c.leftPlannedZar === null ? <span className="text-muted-foreground">Not counted</span> : <Signed zar={c.leftPlannedZar} rates={rates} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="flex flex-col rounded-[10px] bg-inner px-4 py-3.5">
          <h3 className="m-0 pb-1 text-[13px] font-semibold">Bills, as a month</h3>
          {view.fixed.lines.map((l) => (
            <Line
              key={l.billId}
              label={<>{l.name}{l.shared ? <span className="ml-1.5"><Pill tone="soft">Shared</Pill></span> : null}</>}
              sub={chargedAs(l)}
              zar={l.monthlyZar}
              rates={rates}
            />
          ))}
          <Line label="Bills" zar={f.now.fixedZar} rates={rates} strong />
        </div>
        <div className="flex flex-col rounded-[10px] bg-inner px-4 py-3.5">
          <h3 className="m-0 pb-1 text-[13px] font-semibold">Usage, today&rsquo;s clients</h3>
          <UsageLines s={f.now} rates={rates} data={data} />
          <Line label="Usage" zar={f.now.usageZar} rates={rates} strong />
        </div>
        <div className="flex flex-col gap-3">
          <Totals title="Now" s={f.now} rates={rates} />
          <Totals title={`Once trials convert${s.countProspects ? ' and prospects sign' : ''}`} s={f.planned} rates={rates} />
        </div>
      </div>
      <p className="m-0 text-[12px] leading-[1.5] text-muted-foreground">
        A client&rsquo;s line is its runs only; the bills, the extras and Apify&rsquo;s floor are in the totals. Weekly is 52 runs a year over twelve months.
        A typed cost per run is split across the vendors like the measured runs ({Math.round(f.mix.openai * 100)}% OpenAI, {Math.round(f.mix.transcripts * 100)}% transcripts, {Math.round(f.mix.apify * 100)}% Apify).
      </p>
    </Section>
  )
}

// ---- Clients and prospects -------------------------------------------------------

export function Clients({ view, data, rates }: { view: CostsView; data: CostsData; rates: Rates }) {
  return (
    <Section icon={Users} title="Clients and prospects" meta={<span>What each pays, and how often it runs</span>}>
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
        {view.plans.map((p) => <PlanItem key={p.key} plan={p} rates={rates} today={data.today} />)}
      </div>
      <div><AddProspect /></div>
    </Section>
  )
}

// ---- Spend, last six months ------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`

function PivotTable({ p, rates, caption, first }: { p: Pivot; rates: Rates; caption: string; first: string }) {
  const cell = (usd: number, strong = false) => (
    <td className={cn('py-2 pl-3 text-right align-top tabular-nums', strong ? 'font-semibold' : null)}>
      {usd === 0 ? <span className="text-muted-foreground">–</span> : (
        <>
          <span className="block whitespace-nowrap">{fmtZar(usd * rates.usdZar)}</span>
          <span className="block whitespace-nowrap text-[12px] font-normal text-muted-foreground">{fmtUsd(usd)}</span>
        </>
      )}
    </td>
  )
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-[12px] text-secondary-foreground">
            <th scope="col" className="pb-2 text-left font-semibold">{first}</th>
            {p.months.map((m) => <th key={m} scope="col" className="pb-2 pl-3 text-right font-semibold">{monthLabel(m)}</th>)}
            <th scope="col" className="pb-2 pl-3 text-right font-semibold">Six months</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={r.key} className="border-b border-border">
              <th scope="row" className="py-2 pr-3 text-left align-top font-medium">{r.label}</th>
              {r.cells.map((v, i) => <Fragment key={i}>{cell(v)}</Fragment>)}
              {cell(r.total, true)}
            </tr>
          ))}
          <tr>
            <th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Total</th>
            {p.totals.map((v, i) => <Fragment key={i}>{cell(v, true)}</Fragment>)}
            {cell(p.grand, true)}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function Spend({ view, rates }: { view: CostsView; rates: Rates }) {
  return (
    <Section icon={ChartColumn} title="Spend, last six months" meta={<span>From the database · this month so far</span>}>
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[13px] font-semibold">By vendor</h3>
        <PivotTable p={view.usageByVendor} rates={rates} caption="Spend by vendor and month" first="Vendor" />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[13px] font-semibold">By client</h3>
        <PivotTable p={view.usageByClient} rates={rates} caption="Spend by client and month" first="Client" />
      </div>
      <p className="m-0 text-[12px] leading-[1.5] text-muted-foreground">
        OpenAI is every logged call but transcription; transcripts are the transcription calls (Whisper, and the content check on Apify&rsquo;s speech path, both on the OpenAI credit);
        Apify is each actor run&rsquo;s own usage, plus the per-run figure for runs from before actor runs were recorded.
        Months are Johannesburg months. gbrain shares the OpenAI key and is not in these figures.
      </p>
    </Section>
  )
}

// ---- Recent runs -----------------------------------------------------------------

const ATTRIBUTION: Record<string, string> = {
  exact: 'exact',
  exact_unsettled: 'settling',
  ambiguous: 'shared window',
  partial: 'partial',
  unavailable: 'unknown',
}

export function RecentRuns({ runs, rates }: { runs: RecentRun[]; rates: Rates }) {
  return (
    <Section icon={ListOrdered} title="Recent runs" meta={<span>The last {runs.length}</span>}>
      {runs.length === 0 ? <p className="m-0 text-[13px] text-muted-foreground">No run has a cost yet.</p> : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[680px] border-collapse text-[13px]">
            <caption className="sr-only">The newest runs and what each cost</caption>
            <thead>
              <tr className="border-b border-border text-[12px] text-secondary-foreground">
                <th scope="col" className="pb-2 text-left font-semibold">Started</th>
                <th scope="col" className="pb-2 text-left font-semibold">Client</th>
                <th scope="col" className="pb-2 text-left font-semibold">Status</th>
                <th scope="col" className="pb-2 pl-3 text-right font-semibold">OpenAI</th>
                <th scope="col" className="pb-2 pl-3 text-right font-semibold">Transcripts</th>
                <th scope="col" className="pb-2 pl-3 text-right font-semibold">Apify</th>
                <th scope="col" className="pb-2 pl-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.runId} className="border-b border-border last:border-b-0 align-top">
                  <td className="py-2 pr-3 font-mono text-[12px] whitespace-nowrap tabular-nums">{fmtWeekday(r.startedAt.slice(0, 10))}</td>
                  <td className="py-2 pr-3">{r.clientName ?? '–'}</td>
                  <td className="py-2 pr-3 text-secondary-foreground">{r.status}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">{fmtUsd(r.openaiUsd)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">{fmtUsd(r.transcribeUsd)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">
                    {r.apifyUsd === null ? <span className="text-muted-foreground">–</span> : fmtUsd(r.apifyUsd)}
                    {r.apifyAttribution ? <span className="block text-[12px] text-muted-foreground">{ATTRIBUTION[r.apifyAttribution] ?? r.apifyAttribution}</span> : null}
                  </td>
                  <td className="py-2 pl-3 text-right font-semibold">
                    <span className="block whitespace-nowrap tabular-nums">{fmtZar(r.totalUsd * rates.usdZar)}</span>
                    <span className="block text-[12px] font-normal text-muted-foreground tabular-nums">{fmtUsd(r.totalUsd)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

// ---- Assumptions -----------------------------------------------------------------

export function Assumptions({ data }: { data: CostsData }) {
  return (
    <Section icon={SlidersHorizontal} title="Assumptions">
      <SettingsForm settings={data.settings} />
    </Section>
  )
}


// ---- The page --------------------------------------------------------------------

/** The whole page from its loaded rows: what app/dashboard/ops/costs/page.tsx
 *  renders once the operator is checked. */
export function CostsBody({ data }: { data: CostsData }) {
  const view = buildCostsView(data)
  const rates = { usdZar: data.settings.usdZar, eurZar: data.settings.eurZar }
  return (
    <PageFrame>
      <PageBar
        title="Costs"
        line={<>What Verbatim costs to run, and the month ahead · rand first, dollars alongside at R{rates.usdZar.toFixed(2)} to the dollar</>}
      />
      <Summary view={view} rates={rates} prospectsCounted={data.settings.countProspects} />
      <div className="grid grid-cols-1 gap-[22px] xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <ComingUp charges={view.upcoming} data={data} rates={rates} />
        <div className="flex min-w-0 flex-col gap-[22px]">
          <OpenaiCredit view={view} data={data} />
          <ApifyCycle view={view} data={data} />
        </div>
      </div>
      <MonthAhead view={view} data={data} rates={rates} />
      <Bills data={data} rates={rates} />
      <Clients view={view} data={data} rates={rates} />
      <Spend view={view} rates={rates} />
      <RecentRuns runs={data.recentRuns} rates={rates} />
      <Assumptions data={data} />
    </PageFrame>
  )
}
