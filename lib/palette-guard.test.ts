import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// Palette A's guards over the app's source (2026-10-01).
//
// (1) THE RETIRED GREEN IS GONE FROM THE APP. The 2026-08-28 green and its
//     tints did four jobs; palette A gives those jobs to ink, the brand
//     yellow, the gold and the orange. A literal of the old set, the site's
//     Room and mint, the crowd's 2026-07 pine, or a Tailwind green, in app/,
//     components/, lib/ or public/ is the old palette coming back. That now
//     includes the app's favicons, home-screen icon and share card (Heinrich,
//     1 Oct: "the rest needs to be changed to yellow").
//
// (2) THE MARKETING SITE KEEPS ITS GREEN, AND ONLY THE SITE (Heinrich, 1 Oct:
//     "we can leave the marketing site green for now"). Exempt from (1):
//     everything under `app/site` (its pages, and its own icon, apple-icon and
//     share card, which replace the app's for that segment), `.site-theme` at
//     the foot of app/globals.css, and the site's static marks in
//     public/brand. Its favicon.ico (public/brand/favicon-site.ico, which
//     proxy.ts hands the apex) is a binary and is not scanned; the
//     scripts/check-design-drift.sh guard (f) holds both sides' brand art.
//
// (3) THE APP'S MARK IS YELLOW at the top left: the sidebar draws the ditto in
//     `text-brand` beside the name in ink, and so do the signed-out pages.
//
// (4) NO LEFT STRIPE ON A CARD OR A QUOTE (Heinrich's design ban). A left
//     border wider than a 1px divider, in any colour, or an email's stripe cell
//     beside a quote. A 1px `border-l` between two columns is a divider and
//     passes.
//
// (5) THE SHADOWS ARE BACK, AS ONE TOKEN (Heinrich, 1 Oct: "we don't really
//     have drop shadows anymore, like for the sidebar or the large blocks").
//     `--shadow-card` and `--shadow-sidebar` are set in both themes; every
//     large card of the ten client pages draws `shadow-card` and no card
//     carries a shadow literal of its own; inner panels (a quote on the
//     ground) stay flat.
//
// (6) THE COLOUR ROLES (components/colour-roles.tsx; MASTER §Colour roles).
//     Orange is a FILL, never a text colour: no `text-orange` (the fill token)
//     and no orange hex as a text colour; the text-safe orange is
//     `text-orange-text` (#C2410C). Gold words sit on white only: on the
//     ground or the pale yellow they fail AA (4.3 and 4.2 to 1), so a brand on
//     a line is a chip (white on the gold, 4.7 to 1) and the pages name the
//     client through it.
//
// Pure: it reads the source off disk. Test files are not scanned: they assert
// these strings are ABSENT, so they have to be able to name them.

const ROOTS = ['app', 'components', 'lib', 'public']
const EXT = /\.(tsx?|css|svg|mjs|js)$/
const SITE = /^app\/site\//
/** The marketing site's static marks: green on paper, mint on the Room, white
 *  on a green tile. The site's until it is recoloured; no app surface names
 *  them (the app's are verbatim-mark-yellow and -ink). */
const SITE_FILES = new Set([
  'public/brand/verbatim-mark.svg',
  'public/brand/verbatim-mark-mint.svg',
  'public/brand/verbatim-mark-white.svg',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXT.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

/** The app's own text of a file: globals.css stops at the marketing theme,
 *  which is the site's. */
function appText(path: string): string {
  const text = readFileSync(path, 'utf8')
  return path === 'app/globals.css' ? text.split('/* ── Marketing theme')[0] : text
}

const ALL = ROOTS.flatMap((r) => walk(r))
const FILES = ALL.filter((p) => !SITE.test(p) && !SITE_FILES.has(p))

/** The 2026-08-28 green set and its rgb; the earlier greens; the site's Room,
 *  mint and the greens that sit on the Room (the site's own, never the app's);
 *  the 2026-07 pine the crowd art drew; and Tailwind's own greens. */
const RETIRED_GREEN = [
  /#(?:0E8A5F|DDF3E9|0B6E4C|2FBF85|173B2D|7EDDB4|0B1F16|0F7B5A|12865F)\b/i,
  /#(?:0F1F19|3DBF8C|9FC3B2|8FA79A|C9D8CF|EEF3EF|DCE6E0|E3ECE6|14503A)\b/i,
  /rgba?\(\s*14\s*,\s*138\s*,\s*95\b/,
  /rgba?\(\s*(?:15\s*,\s*31\s*,\s*25|159\s*,\s*195\s*,\s*178)\b/,
  /\b(?:text|bg|border|ring|fill|stroke|from|to|via|outline|decoration|divide|accent|caret|shadow)-(?:green|emerald|teal|lime)-\d{2,3}\b/,
]

/** A left border wider than 1px, in Tailwind, a style object or CSS; or an
 *  email table's narrow stripe cell with a background. */
const STRIPE = [
  /\bborder-[ls]-(?:[2-9]|\d{2,}|\[(?:[2-9]|\d{2,})(?:\.\d+)?(?:px|rem)\])(?![\w-])/,
  /\bborder(?:Left|InlineStart)(?:Width)?\s*:\s*['"`]?\s*(?:[2-9]|\d{2,})(?:\.\d+)?(?:px)?\b/,
  /\bborder-(?:left|inline-start)(?:-width)?\s*:\s*(?:[2-9]|\d{2,})(?:\.\d+)?px/,
  /<td\s+width=\{[2-6]\}\s+style=\{\{\s*background:/,
]

function hits(patterns: RegExp[], files: string[]): string[] {
  const out: string[] = []
  for (const f of files) {
    appText(f).split('\n').forEach((line, i) => {
      if (patterns.some((re) => re.test(line))) out.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`)
    })
  }
  return out
}

const read = (p: string) => readFileSync(p, 'utf8')

/** Each card primitive of the ten client pages, and the class string it is
 *  drawn with. The Agent page's body is redesigned on its own branch and uses
 *  the token there. */
const CARDS: [string, string][] = [
  ['components/pages/home/index.tsx', "const SHADOW = 'shadow-card'"],
  ['components/pages/home/skeleton.tsx', "const SHADOW = 'shadow-card'"],
  ['components/pages/overview/picture/parts.tsx', 'rounded-[16px] bg-white shadow-card'],
  ['components/pages/week/read-page.tsx', 'rounded-[16px] bg-white shadow-card'],
  ['components/pages/voice-surface/conversation.tsx', 'rounded-[16px] bg-white shadow-card'],
  ['components/pages/competitive-surface/page/ui.tsx', 'rounded-[16px] bg-card shadow-card'],
  ['components/pages/subjects/page.tsx', "const CARD = 'flex flex-col rounded-[16px] bg-white shadow-card'"],
  ['components/pages/moves/parts.tsx', 'rounded-[16px] bg-white shadow-card'],
  ['components/pages/studio/ui.tsx', 'text-[#26292C] shadow-card'],
]

/** Orange as a text colour: the fill token as `text-`, or the orange hex set
 *  as a colour. */
const ORANGE_TEXT = [
  /\btext-orange(?!-text)\b/,
  /\btext-\[#F2651D\]/i,
  /\bcolor:\s*['"`]#F2651D/i,
]

describe('palette A guard', () => {
  it('finds the source it is meant to scan, the app\'s brand art included and the site left out', () => {
    for (const f of ['app/globals.css', 'components/quote-block.tsx', 'lib/email/theme.ts', 'app/icon.svg',
      'app/icon.tsx', 'app/apple-icon.tsx', 'app/opengraph-image.tsx', 'public/crowd.svg', 'public/crowd-live.svg',
      'public/brand/verbatim-mark-yellow.svg', 'components/brand/mark.tsx']) expect(FILES).toContain(f)
    expect(FILES.some((f) => SITE.test(f) || SITE_FILES.has(f))).toBe(false)
    for (const f of SITE_FILES) expect(ALL).toContain(f)
  })

  it('carries no retired green in the app: app, components, lib or public, the site aside', () => {
    expect(hits(RETIRED_GREEN, FILES)).toEqual([])
  })

  it('draws the app\'s icons and share card in the yellow brand, and the site\'s in its green', () => {
    // The app: the ink mark on a yellow tile; the card's mark is the yellow.
    for (const f of ['app/icon.svg', 'app/icon.tsx', 'app/apple-icon.tsx']) {
      expect(read(f), f).toContain('#FFD43B')
      expect(read(f), f).toContain('#26292C')
    }
    expect(read('app/opengraph-image.tsx')).toMatch(/const YELLOW = "#FFD43B"/)
    // The site: its own copies, in the green, in its own segment.
    for (const f of ['app/site/icon.svg', 'app/site/icon.tsx', 'app/site/apple-icon.tsx']) {
      expect(read(f), f).toContain('#0E8A5F')
      expect(read(f), f).not.toContain('#FFD43B')
    }
    expect(read('app/site/opengraph-image.tsx')).toMatch(/const ROOM = "#0F1F19"/)
    expect(read('app/site/opengraph-image.tsx')).toMatch(/const MINT = "#3DBF8C"/)
    // A site 404's metadata takes the ROOT's icon files, so it names the site's.
    expect(read('app/site/not-found.tsx')).toContain("url: '/site/icon.svg'")
    expect(read('app/site/not-found.tsx')).toContain("url: '/site/opengraph-image'")
    // The favicon.ico is root-only in Next, so the apex is handed the site's.
    expect(read('proxy.ts')).toContain("url.pathname = '/brand/favicon-site.ico'")
    expect(statSync('public/brand/favicon-site.ico').size).toBeGreaterThan(0)
  })

  it('draws the app\'s mark yellow at the top left, beside the name in ink', () => {
    for (const f of ['components/workspace-switcher-loader.tsx', 'components/workspace-switcher.tsx']) {
      const src = read(f)
      expect(src, f).toContain('<VerbatimMark size={20} className="shrink-0 text-brand" />')
      expect(src, f).not.toMatch(/<VerbatimMark[^>]*text-(?:foreground|primary)/)
      // The name stays ink: yellow text on the white sidebar does not read.
      expect(src, f).toMatch(/text-\[1[78]px\][^"]*text-foreground/)
    }
    expect(read('components/auth/auth-card.tsx')).toContain('<VerbatimMark size={24} className="shrink-0 text-brand" />')
  })

  it('draws no left stripe wider than 1px on a card or a quote', () => {
    expect(hits(STRIPE, FILES)).toEqual([])
  })

  it('sets the card and sidebar shadows once, in both themes, and maps them to utilities', () => {
    const css = appText('app/globals.css')
    for (const t of ['shadow-card', 'shadow-sidebar']) {
      expect(css, t).toContain(`--${t}: var(--${t});`)
      expect(css.match(new RegExp(`^\\s*--${t}: \\d`, 'gm')), t).toHaveLength(2)
    }
  })

  it('draws every large card of the client pages on the card shadow, with no shadow literal of its own', () => {
    for (const [f, cls] of CARDS) expect(read(f), f).toContain(cls)
    // The artboard's literal, and any card-sized shadow written out by hand.
    const pages = FILES.filter((f) => f.startsWith('components/pages/') && !f.startsWith('components/pages/agent/'))
    expect(hits([/shadow-\[0_1px_2px_rgba\(0,0,0,0\.05\),0_4px_14px/], pages)).toEqual([])
    // The sidebar's edge.
    expect(read('components/app-sidebar.tsx')).toContain('className="border-r-[#E4E2DC] shadow-sidebar"')
  })

  it('keeps the inner panels flat: a quote on the ground carries no shadow', () => {
    for (const f of ['components/pages/overview/picture/stands.tsx', 'components/pages/week/read-page.tsx', 'components/pages/voice-surface/conversation.tsx']) {
      const panel = read(f).split('\n').find((l) => l.includes('rounded-[12px] bg-[#F7F6F2]'))
      expect(panel, f).toBeDefined()
      expect(panel!, f).not.toMatch(/shadow-/)
    }
  })

  it('never sets the orange as a text colour (the text-safe orange is #C2410C)', () => {
    expect(hits(ORANGE_TEXT, FILES)).toEqual([])
  })

  it('knows the forms it was written to catch, and lets a divider through', () => {
    const caught = (line: string, set: RegExp[]) => set.some((re) => re.test(line))
    for (const line of [
      "className='border-l-2 border-primary/30 pl-3'",
      'className="border-l-4 border-border"',
      'className="border-l-[3px] border-you"',
      'className="border-s-2"',
      "style={{ borderLeft: '3px solid #FFD43B' }}",
      'style={{ borderLeftWidth: 2 }}',
      '.quote { border-left: 2px solid var(--border); }',
      '<td width={2} style={{ background: EMAIL.border, fontSize: 1 }}>&nbsp;</td>',
    ]) expect(caught(line, STRIPE), line).toBe(true)
    for (const line of [
      'className="border-l border-border pl-4"',
      'className="xl:border-l xl:pl-4 xl:first:border-l-0"',
      '  border-left: 1px solid var(--border);',
      "style={{ borderLeft: '1px solid #E4E2DC' }}",
    ]) expect(caught(line, STRIPE), line).toBe(false)
    for (const line of ["background: '#0e8a5f'", 'rgba(14,138,95,.3)', 'className="text-green-600"', 'bg-emerald-50',
      'const MINT = "#3DBF8C"', 'const ROOM = "#0F1F19"', 'stroke="#14503A"', 'rgba(15,31,25,.98) 0%', "color: '#0F7B5A'",
      'fill="#12865F"']) {
      expect(caught(line, RETIRED_GREEN), line).toBe(true)
    }
    expect(caught("background: '#FFD43B'", RETIRED_GREEN)).toBe(false)
    for (const line of ['className="text-orange"', 'className="font-bold text-orange uppercase"', 'className="text-[#F2651D]"', "style={{ color: '#F2651D' }}"]) {
      expect(caught(line, ORANGE_TEXT), line).toBe(true)
    }
    for (const line of ['className="text-orange-text"', 'className="bg-orange"', 'stroke="var(--orange)"']) expect(caught(line, ORANGE_TEXT), line).toBe(false)
    expect(caught('const ROOM = "#1F2124"', RETIRED_GREEN)).toBe(false)
  })
})
