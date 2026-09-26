import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'

import { JUDGE_ROLES } from '../lib/segments/judge'
import {
  HAND_CHECK_KIND, HAND_CHECK_PRECISION, drawHandCheck, parsePlan, researchSample, scoreHandCheck,
  type HandCheckItem, type HandCheckScore, type HandCheckSheet, type Precision,
} from '../lib/segments/v2'

// The segments_v2 hand check (plan WP3.2 done-when; decision F): "a fresh hand
// check of 50 videos by an agent, plus Heinrich's 20, gives maker precision
// ≥ 0.8 and off-topic precision ≥ 0.8. If not, v2 ships as a check only, the
// default view stays Everything, and Status says so."
//
// LOCAL FILES ONLY. It reads a judged plan (label-segments --rule segments_v2
// --spend --plan-out) and WP0.1's export, and writes one sheet. It reads no
// database and calls no model, so it takes no --project. It never prompts.
//
// DRAW. A fresh, seeded sample from the plan's category videos of the full lane
// that the judge labelled, LEAVING OUT the research's 150 (the md5-first 150 of
// the 850 Aug–Sep category videos, CQ §C; the rule segments-parity.ts
// reproduces them by). The agent's 50: 20 the judge called makers, 20 it called
// off-topic (the two precisions) and 10 it left in the market (what it missed).
// Heinrich's 20: 10 and 10 more of the two it marked. Disjoint, and BLIND: the
// sheet does not say what the judge answered, and its order is shuffled.
//
//   node --import tsx scripts/segments-hand-check.ts --plan <plan.json> \
//     --export <WP0.1 export.json> --seed <word> --out <sheet.json>
//
// LABEL. In the sheet, set each item's `label` to one of buyer, buyer-adjacent,
// maker, off-topic, other (the judge's roles, CQ F105), or "skip" for a video
// that can no longer be judged. `note` is free.
//
// SCORE. Joins the plan back in and prints maker and off-topic precision, per
// part and pooled, against 0.8, with the verdict. Exit 0 on a pass, 2 below
// the bar, 1 while incomplete.
//
//   node --import tsx scripts/segments-hand-check.ts --score <sheet.json> --plan <plan.json>

const NAME = 'segments-hand-check'

function parseArgs(argv: readonly string[]): Record<string, string> {
  const known = ['plan', 'export', 'seed', 'out', 'score']
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const name = a.startsWith('--') ? a.slice(2) : null
    if (!name || !known.includes(name)) throw new Error(`${NAME}: unknown argument ${a} (it takes ${known.map((k) => `--${k}`).join(', ')})`)
    const v = argv[++i]
    if (v === undefined || v.startsWith('--')) throw new Error(`${NAME}: --${name} needs a value`)
    out[name] = v
  }
  if (!out.plan) throw new Error(`${NAME}: --plan <judged plan> is required`)
  return out
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

const fmt = (p: Precision): string =>
  `${p.k} of ${p.n}${p.precision === null ? '' : ` (${p.precision.toFixed(2)}${p.pass ? '' : `, under ${HAND_CHECK_PRECISION}`})`}`

function draw(args: Record<string, string>): void {
  for (const f of ['export', 'seed', 'out']) if (!args[f]) throw new Error(`${NAME}: a draw needs --${f}`)
  if (existsSync(args.out)) throw new Error(`${NAME}: ${args.out} exists; --out names a new file, so no labels are overwritten`)
  const plan = parsePlan(readJson(args.plan))
  const exp = readJson(args.export) as Parameters<typeof researchSample>[0] & { clientId?: string }
  if (exp.clientId && exp.clientId !== plan.clientId) throw new Error(`${NAME}: the export is client ${exp.clientId}, the plan ${plan.clientId}`)
  const research = researchSample(exp)
  if (research.length !== 150) throw new Error(`${NAME}: the export yields ${research.length} of the research's 150, not 150: is it WP0.1's?`)
  const d = drawHandCheck(plan, new Set(research), args.seed)
  const sheet: HandCheckSheet = {
    kind: HAND_CHECK_KIND, seed: args.seed, clientId: plan.clientId, project: plan.project,
    plan: { file: basename(args.plan), createdAt: plan.createdAt, promptVersion: plan.promptVersion },
    drawnAt: new Date().toISOString(), eligible: d.eligible, excluded: d.excluded, agent: d.agent, heinrich: d.heinrich,
  }
  mkdirSync(dirname(args.out), { recursive: true })
  writeFileSync(args.out, JSON.stringify(sheet, null, 1) + '\n', { flag: 'wx' })
  console.log(`${NAME}: drew from ${d.eligible} category videos of the full lane (${d.excluded} of the research's 150 left out), seed "${args.seed}"`)
  console.log(`  the agent's ${d.agent.length} and Heinrich's ${d.heinrich.length}, blind: ${args.out}`)
  for (const [s, wanted, got] of d.short) console.log(`  SHORT: the judge marked only ${got} ${s} videos here, of the ${wanted} wanted`)
  console.log(`  label each item (${JUDGE_ROLES.join(', ')}, or skip), then: --score ${args.out} --plan ${args.plan}`)
}

function printPart(label: string, items: readonly HandCheckItem[], s: HandCheckScore): void {
  console.log(`  ${label}: ${s.labelled} of ${items.length} labelled · maker ${fmt(s.maker)} · off-topic ${fmt(s.offTopic)}`)
}

function score(args: Record<string, string>): number {
  const sheet = readJson(args.score) as HandCheckSheet
  if (sheet.kind !== HAND_CHECK_KIND) throw new Error(`${NAME}: ${args.score} is not a hand-check sheet`)
  const plan = parsePlan(readJson(args.plan), { clientId: sheet.clientId, project: sheet.project })
  if (plan.createdAt !== sheet.plan.createdAt) throw new Error(`${NAME}: the sheet was drawn from the plan judged ${sheet.plan.createdAt}, not this one (${plan.createdAt})`)
  const allowed = new Set<string>([...JUDGE_ROLES, 'skip'])
  for (const it of [...sheet.agent, ...sheet.heinrich]) {
    if (it.label !== null && !allowed.has(it.label)) throw new Error(`${NAME}: ${it.id} is labelled "${it.label}"; use ${[...allowed].join(', ')}`)
  }
  console.log(`${NAME}: ${basename(args.score)} against ${basename(args.plan)} (${plan.promptVersion}, judged ${plan.createdAt})`)
  printPart(`the agent's ${sheet.agent.length}`, sheet.agent, scoreHandCheck(sheet.agent, plan.labels))
  printPart(`Heinrich's ${sheet.heinrich.length}`, sheet.heinrich, scoreHandCheck(sheet.heinrich, plan.labels))
  const all = [...sheet.agent, ...sheet.heinrich]
  const s = scoreHandCheck(all, plan.labels)
  printPart(`pooled ${all.length}`, all, s)
  console.log(`  of the videos the judge left in the market, ${s.marketMissed.k} of ${s.marketMissed.n} were labelled maker or off-topic`)
  if (s.unknown.length > 0) console.log(`  ${s.unknown.length} item(s) name a video the plan does not hold: ${s.unknown.slice(0, 5).join(', ')}`)
  if (s.verdict === 'incomplete') {
    console.log(`INCOMPLETE: ${s.labelled} of ${s.items} labelled. Label every item (a role, or skip) and score again.`)
    return 1
  }
  if (s.verdict === 'pass') {
    console.log(`PASS: maker and off-topic precision are both at least ${HAND_CHECK_PRECISION}, so segments_v2 may set the default view (decision F).`)
    return 0
  }
  console.log(`BELOW ${HAND_CHECK_PRECISION}: segments_v2 ships as a check only, the default view stays Everything, and Status says so (plan WP3.2).`)
  return 2
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (args.score) {
    for (const f of ['export', 'seed', 'out']) if (args[f]) throw new Error(`${NAME}: --score reads a labelled sheet; it takes no --${f}`)
    process.exit(score(args))
  }
  draw(args)
}

if (process.argv[1]?.endsWith('segments-hand-check.ts')) {
  try {
    main()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
