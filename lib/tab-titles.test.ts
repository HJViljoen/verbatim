import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SURFACES } from './nav'

// Every app tab read "Verbatim · Consumer Intelligence", whichever page it held
// (finish-list item 25 polish). Each of the nine now titles itself from the
// same table the sidebar reads (lib/nav.ts), and the root layout's template
// adds the product. A page that drops its metadata fails here.

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('tab titles', () => {
  it.each(SURFACES.map((s) => [s.label, s]))('%s titles its tab from its own surface', (_label, s) => {
    const file = `app${s.href}/page.tsx`
    const src = read(file)
    expect(src, file).toMatch(/export const metadata: Metadata = \{ title: /)
    expect(src, file).toContain(`surface('${s.key}').label`)
  })

  it('the root layout templates them and describes the market a brand sells into', () => {
    const src = read('app/layout.tsx')
    expect(src).toContain('template: "%s · Verbatim"')
    expect(src).not.toContain('Media-based consumer intelligence')
    expect(src).toContain('The bigger market your brand sells into')
  })

  it('the marketing layout keeps its own full titles out of the app template', () => {
    expect(read('app/site/layout.tsx')).toMatch(/title: \{ absolute: '[^']+', template: '%s' \}/)
  })
})
