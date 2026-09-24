// Block D wave 3 · the `weekly` group's side-by-side shots: the weekly report
// email, rendered from its populated fixture into the document it actually
// sends, put beside `WeeklyReport.dc.html`.
//
//   node --import tsx scripts/wave3-weekly-shots.ts --out <dir> [--tag before]
//
// WHY THIS ONE NEEDS ITS OWN SCRIPT. `scripts/wave2-shots.ts` wraps a page in
// the app shell and the Tailwind build; `WeeklyEmail` IS a whole document —
// `<html>` down — with every style inline and no stylesheet at all, because
// that is what a mail client will get. So the harness renders it and
// screenshots it as-is, at the canvas width, with nothing added but the Plex
// webfont link the document already carries.
//
// The artboard is 640 wide and the shot is taken at 640, so the two images are
// the same scale and a width change is visible as a width change.

import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { withBrowser } from '../lib/render/chromium'
import { blockContext } from '../lib/blocks/types'
import { EMAIL } from '../lib/email/theme'
import { WeeklyEmail } from '../components/email/weekly'
import { WEEKLY_BLOCK_KEYS, weeklySubject } from '../lib/reports/weekly'
import { WEEKLY_SNAPSHOT_VERSION, type WeeklySnapshotData } from '../lib/reports/weekly-build'
import { weeklyFixture, formingFixture } from '../components/blocks/weekly/fixture'

const args = process.argv.slice(2)
const flag = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const out = flag('out', 'scratch/wave3-weekly-shots')
const tag = flag('tag', 'after')
/** The viewport. 640 is the artboard's canvas; 390 and 320 are the phones. */
const width = Number(flag('width', '640'))
const artboards = flag(
  'artboards',
  '/Users/heinrichviljoen/Documents/Heinrich/Cold-Reviews/Verbatim-IA-Review-2026-09-13/mock-sealand/artboards',
)

const APP = 'https://app.verbatimintel.com'

function snapshot(reading = weeklyFixture()): WeeklySnapshotData {
  return {
    version: WEEKLY_SNAPSHOT_VERSION,
    kind: 'weekly',
    company: 'Sealand',
    title: 'Sealand · your update',
    period: '6 Sep – 13 Sep',
    readingAt: '2026-09-18T09:00:00.000Z',
    month: '2026-09-01',
    keys: [...WEEKLY_BLOCK_KEYS],
    reading,
    figures: {},
    subject: weeklySubject('Sealand', reading.section1.check),
  }
}

const markup = (data: WeeklySnapshotData) =>
  `<!doctype html>${renderToStaticMarkup(
    WeeklyEmail({
      data,
      shareUrl: `${APP}/r/tok`,
      appUrl: APP,
      attached: true,
      ctx: blockContext(APP, EMAIL),
      preheader: data.subject,
    }),
  )}`

const pair = (built: string, artboard: string, title: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#11110f;font-family:-apple-system,'Segoe UI',sans-serif}
.row{display:flex;gap:24px;padding:24px;align-items:flex-start}
figure{margin:0;flex:none;width:640px}
figcaption{color:#e8e6df;font-size:18px;padding:0 0 10px;font-weight:600}
img{display:block;width:640px;border:1px solid #3a382f}
h1{color:#e8e6df;font-size:24px;padding:24px 24px 0;margin:0}
</style></head><body><h1>${title}</h1><div class="row">
<figure><figcaption>the artboard (the spec)</figcaption><img src="file://${artboard}"></figure>
<figure><figcaption>the built email, from its populated fixture</figcaption><img src="file://${built}"></figure>
</div></body></html>`

const STATES: { key: string; data: () => WeeklySnapshotData }[] = [
  { key: 'weekly', data: () => snapshot() },
  { key: 'weekly-forming', data: () => snapshot(formingFixture()) },
]

async function main() {
  mkdirSync(out, { recursive: true })
  for (const s of STATES) writeFileSync(join(out, `${tag}-${s.key}.html`), markup(s.data()))

  await withBrowser(async (page) => {
    // 640 = the artboard's own canvas, so the two images are one scale.
    await page.setViewport({ width, height: 1200, deviceScaleFactor: 1 })
    for (const s of STATES) {
      await page.goto(`file://${resolve(out, `${tag}-${s.key}.html`)}`, { waitUntil: 'networkidle0' })
      const name = width === 640 ? `${tag}-${s.key}` : `${tag}-${s.key}-${width}`
      writeFileSync(join(out, `${name}.png`), await page.screenshot({ fullPage: true, type: 'png' }))
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      console.log(`${name}.png · horizontal overflow ${over}px`)
    }
    const art = join(artboards, 'WeeklyReport.dc.html')
    if (width !== 640 || !existsSync(art)) return
    await page.goto(`file://${art}`, { waitUntil: 'networkidle0' })
    writeFileSync(join(out, 'artboard-weekly.png'), await page.screenshot({ fullPage: true, type: 'png' }))
    const html = join(out, `side-by-side-${tag}-weekly.html`)
    writeFileSync(html, pair(resolve(out, `${tag}-weekly.png`), resolve(out, 'artboard-weekly.png'), `weekly report · ${tag}`))
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' })
    writeFileSync(join(out, `side-by-side-${tag}-weekly.png`), await page.screenshot({ fullPage: true, type: 'png' }))
    console.log(`side-by-side-${tag}-weekly.png`)
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
