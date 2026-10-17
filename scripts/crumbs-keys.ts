// THE SWITCHER BY KEYBOARD, IN A REAL BROWSER (depth as pages, 17 Oct). The
// render tier checks what the breadcrumb PRINTS and cannot press a key (no
// jsdom, lib/test/render.ts); this bundles the shipped `CrumbRow`
// (components/shell/crumbs.tsx) with esbuild, mounts it in headless Chrome
// over the subject page's fixture, and drives it: Enter and Space open it on
// the current entry, the arrows, Home and End move, Escape closes and hands
// the chevron its focus back, Tab and a click outside close it.
//
//   node --import tsx scripts/crumbs-keys.ts
//
// LOCAL ONLY: no database, no network. Exits 1 on the first step that fails.

import { build } from 'esbuild'
import { resolve } from 'path'
import { withBrowser } from '../lib/render/chromium'
import { marketConversationFixture } from '../lib/pages/v2/market-fixture'

const ROOT = resolve(__dirname, '..')

async function bundle(): Promise<string> {
  const out = await build({
    stdin: {
      contents: `
        import { createElement as h } from 'react'
        import { createRoot } from 'react-dom/client'
        import { CrumbRow } from './components/shell/crumbs'
        const crumbs = JSON.parse(document.getElementById('crumbs').textContent)
        createRoot(document.getElementById('root')).render(h('div', { style: { padding: '40px' } }, h(CrumbRow, { crumbs }), h('p', { id: 'away' }, 'Outside')))
      `,
      resolveDir: ROOT,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { '@': ROOT },
    // next/link needs Next's router; a plain anchor carries the same href.
    plugins: [{
      name: 'next-link',
      setup(b) {
        b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'next-link', namespace: 'stub' }))
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: `import { createElement, forwardRef } from 'react'; export default forwardRef(function Link({ href, ...rest }, ref) { return createElement('a', { ...rest, href, ref, onClick: (e) => { e.preventDefault(); window.__followed = href; rest.onClick?.(e) } }) })`,
          loader: 'jsx',
          resolveDir: ROOT,
        }))
      },
    }],
  })
  return out.outputFiles[0].text
}

async function main() {
  const js = await bundle()
  const crumbs = marketConversationFixture(1).crumbs!
  const html = `<!doctype html><html><body><div id="root"></div><script type="application/json" id="crumbs">${JSON.stringify(crumbs).replace(/</g, '\\u003c')}</script><script>${js}</script></body></html>`
  const steps: [string, boolean][] = []
  await withBrowser(async (page) => {
    await page.setContent(html, { waitUntil: 'load' })
    const active = () => page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null
      return { tag: a?.tagName ?? '', label: a?.getAttribute('aria-label') ?? a?.textContent?.trim() ?? '', checked: a?.getAttribute('aria-checked') }
    })
    const menuOpen = () => page.evaluate(() => document.querySelectorAll('[role="menu"]').length)
    // The conversation's own chevron is the last on the bar.
    const chevrons = await page.$$('[data-crumb-chevron]')
    const chevron = chevrons[chevrons.length - 1]
    await chevron.focus()
    await page.keyboard.press('Enter')
    let a = await active()
    steps.push(['Enter opens the menu', (await menuOpen()) === 1])
    steps.push(['…on the current entry, ticked', a.tag === 'A' && a.checked === 'true' && a.label.startsWith('How long a liner lasts')])
    await page.keyboard.press('ArrowDown')
    a = await active()
    steps.push(['ArrowDown moves to the next entry', a.tag === 'A' && a.label.startsWith('Sweat under the liner')])
    await page.keyboard.press('End')
    a = await active()
    steps.push(['End moves to the last entry', a.tag === 'A' && a.label.startsWith('Liner smell and cleaning')])
    await page.keyboard.press('ArrowDown')
    a = await active()
    steps.push(['ArrowDown past the last wraps to the first', a.label.startsWith('How long a liner lasts')])
    await page.keyboard.press('ArrowUp')
    a = await active()
    steps.push(['ArrowUp from the first wraps to the last', a.label.startsWith('Liner smell and cleaning')])
    await page.keyboard.press('Home')
    a = await active()
    steps.push(['Home moves to the first entry', a.label.startsWith('How long a liner lasts')])
    await page.keyboard.press('Escape')
    a = await active()
    steps.push(['Escape closes it', (await menuOpen()) === 0])
    steps.push(['…and gives the chevron its focus back', a.tag === 'BUTTON' && a.label.startsWith('Switch to another conversation')])
    await page.keyboard.press(' ')
    steps.push(['Space opens it', (await menuOpen()) === 1])
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    const followed = await page.evaluate(() => (window as unknown as { __followed?: string }).__followed ?? '')
    steps.push(['Enter on an entry follows its link, the period kept', followed.startsWith('/dashboard/market/conversations/')])
    await page.click('#away')
    steps.push(['A click outside closes it', (await menuOpen()) === 0])
    await chevron.focus()
    await page.keyboard.press('ArrowDown')
    steps.push(['ArrowDown on the chevron opens it', (await menuOpen()) === 1])
    await page.keyboard.press('Tab')
    steps.push(['Tab closes it', (await menuOpen()) === 0])
    // The subject's chevron opens the subjects, ticking Fit & comfort.
    await chevrons[0].focus()
    await page.keyboard.press('Enter')
    a = await active()
    steps.push(['The ancestor\'s chevron opens the subjects on the subject ticked', a.checked === 'true' && a.label.startsWith('Fit & comfort')])
  })
  let failed = 0
  for (const [name, ok] of steps) {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
    if (!ok) failed++
  }
  if (failed > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
