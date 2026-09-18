// Block D wave 2 · E-main: render Overview from its POPULATED fixture into a
// full HTML document and screenshot it beside the artboard, with no session.
//
//   node --import tsx scripts/e-main-shot.ts --out <dir>
//
// WHY A FIXTURE AND NOT THE APP. There is no session cookie in this package, so
// `scripts/shot.ts` (which signs in through /login) cannot run — and a page
// rendered against production would be the refused state on every block, which
// is not what a fidelity claim is made against. `components/pages/overview/
// fixture.ts` is the reading surface the whole wave is reviewed on.
//
// The CSS is app/globals.css compiled through the project's own Tailwind
// pipeline, so the tokens, the type ramp and the shadows are the app's and not
// a second copy of them.

import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { withBrowser } from '../lib/render/chromium'
import { OverviewPage } from '../components/pages/overview'
import { overviewFixture, refusedFixture } from '../components/pages/overview/fixture'

const args = process.argv.slice(2)
const flag = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const out = flag('out', 'scratch/e-main')
const artboard = flag('artboard', '')

const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap'

/** The app shell around the page: the 224px sidebar and the 24px-padded main,
 *  exactly as `app/dashboard/layout.tsx` sets them. The sidebar's rows are
 *  static here — `components/app-sidebar.tsx` is a client component wired to
 *  the router — but the WIDTH, the groups and the footer are the shipped ones,
 *  because the artboard's proportions only mean anything against them. */
const SIDEBAR = `
<aside style="width:224px;flex:none;display:flex;flex-direction:column;background:var(--sidebar);box-shadow:var(--shadow-tile)">
  <div style="display:flex;align-items:baseline;gap:8px;padding:20px 16px 4px">
    <span style="font-size:17px;font-weight:700;letter-spacing:-.02em;color:var(--foreground)">Verbatim</span>
  </div>
  <nav style="display:flex;flex-direction:column;gap:4px;padding-top:8px">
    <div style="padding:0 14px">
      <div style="height:28px;display:flex;align-items:center;padding:0 10px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-foreground)">Intelligence</div>
      ${['Overview', 'Subjects', 'Voice', 'Market', 'Competitive', 'This week', 'Ask', 'Reports'].map((l, i) => `
      <div style="position:relative;display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;border-radius:4.8px;font-size:14px;font-weight:${i === 0 ? 600 : 400};color:${i === 0 ? 'var(--foreground)' : 'var(--sidebar-foreground)'}">
        ${i === 0 ? '<span style="position:absolute;left:-8px;top:8px;bottom:8px;width:2px;border-radius:9999px;background:var(--primary)"></span>' : ''}
        <span style="width:16px;height:16px;border-radius:3px;background:var(--muted)"></span><span>${l}</span>
      </div>`).join('')}
    </div>
    <div style="padding:0 14px">
      <div style="height:28px;display:flex;align-items:center;padding:0 10px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-foreground)">Account</div>
      <div style="display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;font-size:14px;color:var(--sidebar-foreground)"><span style="width:16px;height:16px;border-radius:3px;background:var(--muted)"></span><span>Settings</span></div>
    </div>
  </nav>
  <div style="margin-top:auto;padding:0 14px 16px">
    <div style="display:flex;flex-direction:column;gap:1px;padding:0 10px 10px">
      <span style="font-size:12.5px;font-weight:500;color:var(--sidebar-foreground)">Sealand</span>
      <span style="font-family:var(--font-mono);font-size:10.5px;color:var(--muted-foreground)">admin</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;font-size:14px;color:var(--sidebar-foreground)"><span style="width:16px;height:16px;border-radius:3px;background:var(--muted)"></span><span>Logout</span></div>
  </div>
</aside>`

async function css(): Promise<string> {
  const src = readFileSync('app/globals.css', 'utf8')
  const res = await postcss([tailwind()]).process(src, { from: 'app/globals.css' })
  return res.css
}

function doc(style: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${style}
html,body{margin:0;padding:0}
/* next/font sets these on <html>; this harness has no next/font. */
:root{--font-sans:'IBM Plex Sans',-apple-system,'Segoe UI',sans-serif;--font-serif:'IBM Plex Serif',Georgia,serif;--font-mono:'IBM Plex Mono',monospace}
body{font-family:var(--font-sans);-webkit-font-smoothing:antialiased}
</style></head><body><div style="display:flex;width:1440px;background:var(--background)">${SIDEBAR}
<main style="flex:1;min-width:0;padding:24px">${body}</main></div></body></html>`
}

async function main() {
  mkdirSync(out, { recursive: true })
  const style = await css()
  const pages: [string, string][] = [
    ['overview-populated', renderToStaticMarkup(OverviewPage({ data: overviewFixture() }))],
    ['overview-refused', renderToStaticMarkup(OverviewPage({ data: refusedFixture() }))],
  ]
  for (const [name, markup] of pages) writeFileSync(join(out, `${name}.html`), doc(style, markup))

  await withBrowser(async (page) => {
    // 1440px is the artboard's own width, and `xl:` (1280px) is where the page
    // grid and every TileColumns turn into columns — a narrower shot would be a
    // fidelity claim about the stacked layout.
    await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 })
    for (const [name] of pages) {
      await page.goto(`file://${resolve(out, `${name}.html`)}`, { waitUntil: 'networkidle0' })
      const buf = await page.screenshot({ fullPage: true, type: 'png' })
      writeFileSync(join(out, `${name}.png`), buf)
      console.log(`${name}.png`)
    }
    if (artboard) {
      await page.goto(`file://${artboard}`, { waitUntil: 'networkidle0' })
      const buf = await page.screenshot({ fullPage: true, type: 'png' })
      writeFileSync(join(out, 'artboard-Main.png'), buf)
      console.log('artboard-Main.png')
    }
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
