// THROWAWAY (Block D wave 2, E-quarterly). Shoots each 297 × 167 mm slide of a
// deck and of the artboard at the same size, so the two halves of a
// side-by-side are the same measurement. Uses the repo's own Chromium
// (puppeteer-core + the Mac's Chrome), motion emulated off.
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { withBrowser } from '../../../../../../Users/heinrichviljoen/Documents/code/verbatim-e-quarterly/lib/render/chromium'

const out = process.argv[2]
const url = process.argv[3]
const prefix = process.argv[4]
const selector = process.argv[5] ?? '.vb-slide'

async function main() {
  mkdirSync(out, { recursive: true })
  await withBrowser(async (page) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
    await page.goto(url, { waitUntil: 'networkidle0' })
    await page.evaluate(() => new Promise((r) => setTimeout(r, 600)))
    const slides = await page.$$(selector)
    console.log(`${prefix}: ${slides.length} slides`)
    for (let i = 0; i < slides.length; i++) {
      const buf = await slides[i].screenshot({ type: 'png' })
      writeFileSync(join(out, `${prefix}-${i + 1}.png`), Buffer.from(buf as Uint8Array))
    }
    const boxes = await page.$$eval(selector, (els) =>
      els.map((el) => {
        const body = el.querySelector('.vb-slide-body') as HTMLElement | null
        const inner = body?.firstElementChild as HTMLElement | null
        return {
          slide: Math.round(el.getBoundingClientRect().height),
          bodyBox: body ? Math.round(body.clientHeight) : null,
          content: inner ? Math.round(inner.scrollHeight) : null,
          overflow: body && inner ? Math.round(inner.scrollHeight) - Math.round(body.clientHeight) : null,
        }
      }),
    )
    writeFileSync(join(out, `${prefix}-heights.json`), JSON.stringify(boxes, null, 2))
    console.log(JSON.stringify(boxes))
  })
}
main().catch((e) => { console.error(e); process.exit(1) })
