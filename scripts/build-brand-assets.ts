import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

// Raster copies of the Verbatim mark, for the two places that cannot take an
// SVG: app/favicon.ico (the browsers and bookmark bars that still ask for it)
// and the email header (every client strips inline SVG). Run it again whenever
// the mark changes; the output is committed, so nothing rasterises at build.
//
//   node --import tsx scripts/build-brand-assets.ts
//
// The ICO is assembled here rather than with a library: the container is a
// 6-byte header, one 16-byte directory entry per size, then the PNG bytes.

const ROOT = path.join(import.meta.dirname, '..')

/** The mark alone, on nothing. `size` is the pixel square; the art is the 64 viewBox. */
const glyph = (colour: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <line x1="27" y1="16" x2="17" y2="48" stroke="${colour}" stroke-width="12" stroke-linecap="round"/>
  <line x1="47" y1="16" x2="37" y2="48" stroke="${colour}" stroke-width="12" stroke-linecap="round"/>
</svg>`

/** The favicon tile: green on white, radius 12 of 64 — the same 6-at-32px as app/icon.tsx. */
const tile = glyph('#0E8A5F').replace(
  'fill="none">',
  'fill="none">\n  <rect width="64" height="64" rx="12" fill="#FFFFFF"/>',
)

const png = (svg: string, size: number) =>
  sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer()

/** PNG-in-ICO: every browser since IE11 reads it, and it keeps the round caps. */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(size === 256 ? 0 : size, 0) // width (0 means 256)
    e.writeUInt8(size === 256 ? 0 : size, 1) // height
    e.writeUInt8(0, 2) // palette colours: none, it is a PNG
    e.writeUInt8(0, 3) // reserved
    e.writeUInt16LE(1, 4) // colour planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

async function main() {
  // The email mark, at 4× the 16px it is shown at, so it stays crisp on retina.
  for (const [file, colour] of [
    ['verbatim-mark.png', '#0E8A5F'],
    ['verbatim-mark-mint.png', '#3DBF8C'],
  ] as const) {
    const out = path.join(ROOT, 'public/brand', file)
    await writeFile(out, await png(glyph(colour), 64))
    console.log('wrote', path.relative(ROOT, out))
  }

  const sizes = [16, 32, 48]
  const images = await Promise.all(sizes.map(async (size) => ({ size, data: await png(tile, size) })))
  const icoPath = path.join(ROOT, 'app/favicon.ico')
  await writeFile(icoPath, ico(images))
  console.log('wrote', path.relative(ROOT, icoPath), `(${sizes.join(', ')}px)`)

  // Fail loudly rather than commit a container no browser will read.
  const written = await readFile(icoPath)
  if (written.readUInt16LE(2) !== 1 || written.readUInt16LE(4) !== sizes.length) {
    throw new Error('the ICO header did not come out right')
  }
}

void main()
