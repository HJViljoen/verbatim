import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

// WHAT A 'use client' FILE PULLS INTO THE BROWSER (Phase 4 fix round). The
// build caught `components/pages/v2/products/tag-control.tsx` (fixed in
// 3abd43be): a client component that imported a button style from `parts.tsx`,
// which imported the page's loader, which reached `lib/gather` and its
// `node:` modules, so the client bundle could not be built. Only
// `next build` saw it, minutes in. This walks each client file's RUNTIME
// import graph with the project's own TypeScript parser (no bundler, no new
// dependency) and names the first chain that reaches something a browser
// bundle cannot hold:
//   - a `node:` builtin, or a bare Node builtin Next does not polyfill for the
//     client (`NEXT_CLIENT_POLYFILLS`, from Next's webpack fallbacks:
//     `crypto`, `path`, `url`… are polyfilled; `fs`, `child_process`, `net`…
//     are not);
//   - `server-only`, which exists to fail exactly this;
//   - `next/headers`, which only a server render has.
//
// RUNTIME IMPORTS ONLY: `import type`, and an import whose every name is
// `type`, are erased and never followed. A `'use server'` module is a
// boundary: a client file that imports one gets a reference to a server
// action, not its code. Packages are not walked (a package's browser build is
// the package's); `@/` and relative paths are.
//
// KNOWN SOFT CHAINS, pre-existing on 13 Oct and NOT failed on: these client
// files reach a server-side module that is not itself a hard stop (the
// bundler includes it and it builds), which is wasteful and worth a cleanup,
// not a broken build:
//   - app/dashboard/settings/tracking-form.tsx -> lib/settings/save-state.ts
//     -> lib/gather/subreddits.ts (lib/gather);
//   - components/agent-composer.tsx -> lib/agent/scope.ts
//     -> lib/reading/reading-month.ts -> lib/reading/monthly.ts
//     -> lib/supabase-admin.ts;
//   - components/settings/tracking/rivals.tsx -> lib/settings/rivals-view.ts
//     -> lib/rivals.ts -> lib/supabase-admin.ts;
//   - components/subjects/subject-editor.tsx -> lib/pages/subjects.ts
//     -> lib/supabase-admin.ts (and on to lib/quote-text.ts -> `crypto`,
//     which Next polyfills).

/** Node builtins Next's client bundle polyfills (next/dist/build/
 *  webpack-config.js, the client `resolve.fallback`), so a bare import of one
 *  builds. Any other builtin, and every `node:` import, does not. */
export const NEXT_CLIENT_POLYFILLS: ReadonlySet<string> = new Set([
  'assert', 'buffer', 'constants', 'crypto', 'domain', 'events', 'http', 'https', 'os', 'path', 'process', 'punycode',
  'querystring', 'setImmediate', 'stream', 'string_decoder', 'sys', 'timers', 'tty', 'url', 'util', 'vm', 'zlib',
])

const BUILTINS = new Set(builtinModules)

/** Why a module specifier cannot be in a client bundle, or null. */
export function hardStop(spec: string): string | null {
  if (spec.startsWith('node:')) return 'a node: builtin'
  if (spec === 'server-only') return 'server-only'
  if (spec === 'next/headers') return 'next/headers'
  const bare = spec.split('/')[0]
  if ((BUILTINS.has(spec) || BUILTINS.has(bare)) && !NEXT_CLIENT_POLYFILLS.has(bare)) return 'a Node builtin Next does not polyfill'
  return null
}

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js']

interface FileInfo { directive: string | null; specs: string[] }

export interface ClientChain {
  /** The client file, relative to the root. */
  file: string
  /** Why the chain cannot be bundled. */
  hit: string
  /** The client file, each module on the way, and the module that stops it. */
  trail: string[]
}

/** The 'use client' files under `dirs` (how many were checked), and those
 *  whose runtime imports reach a hard stop, each with its first (shortest)
 *  chain. */
export function clientChains(root: string, dirs: readonly string[] = ['app', 'components', 'hooks', 'lib']): { checked: number; chains: ClientChain[] } {
  const base = resolve(root)
  const cache = new Map<string, FileInfo>()
  const rel = (f: string) => relative(base, f)

  const resolveSpec = (spec: string, from: string): string | null => {
    const start = spec.startsWith('@/') ? join(base, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null
    if (!start) return null
    if (existsSync(start) && statSync(start).isFile()) return start
    for (const e of EXTS) if (existsSync(start + e)) return start + e
    return null
  }

  const info = (file: string): FileInfo => {
    const hit = cache.get(file)
    if (hit) return hit
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const first = sf.statements[0]
    const directive = first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) ? first.expression.text : null
    const specs: string[] = []
    const visit = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const c = n.importClause
        const typeOnly = c != null && (c.isTypeOnly || (!c.name && c.namedBindings != null && ts.isNamedImports(c.namedBindings)
          && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly)))
        if (!typeOnly) specs.push(n.moduleSpecifier.text)
      } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const typeOnly = n.isTypeOnly || (n.exportClause != null && ts.isNamedExports(n.exportClause)
          && n.exportClause.elements.length > 0 && n.exportClause.elements.every((e) => e.isTypeOnly))
        if (!typeOnly) specs.push(n.moduleSpecifier.text)
      } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
        specs.push(n.arguments[0].text)
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
    const out = { directive, specs }
    cache.set(file, out)
    return out
  }

  const chainFor = (start: string): ClientChain | null => {
    const seen = new Set([start])
    const queue: [string, string[]][] = [[start, [rel(start)]]]
    while (queue.length > 0) {
      const [file, trail] = queue.shift()!
      for (const spec of info(file).specs) {
        const hit = hardStop(spec)
        if (hit) return { file: rel(start), hit, trail: [...trail, spec] }
        const next = resolveSpec(spec, file)
        if (!next || seen.has(next)) continue
        seen.add(next)
        if (info(next).directive === 'use server') continue
        queue.push([next, [...trail, rel(next)]])
      }
    }
    return null
  }

  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return []
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.(tsx?|jsx?|mjs)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
  const files = dirs.map((d) => join(base, d)).filter((d) => existsSync(d)).flatMap(walk)
  // Only a file that says 'use client' somewhere is parsed to see whether it
  // says it first: most of the tree never is.
  const clients = files.filter((f) => /['"]use client['"]/.test(readFileSync(f, 'utf8')) && info(f).directive === 'use client')
  return { checked: clients.length, chains: clients.map(chainFor).filter((c): c is ClientChain => c != null) }
}
