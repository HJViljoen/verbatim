import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import ts from 'typescript'

/**
 * The em-dash guard (copy de-clutter, 2026-09-24). DESIGN.md forbids the em
 * dash in visible copy and the product's owner asked for none, so this finds
 * every one a client could read: JSX text, and string or template literals in
 * the modules that build copy.
 *
 * What it deliberately does NOT look at, and why:
 * - comments (not copy);
 * - regular-expression literals and strings handed to `.replace` / `.split` /
 *   `new RegExp` / `.includes` / `.startsWith` / `.endsWith` / `.indexOf`,
 *   because those MATCH stored words written before this rule (a frozen
 *   snapshot still carries its old dash and the render strips it);
 * - model prompts (`MODEL_PROMPT_DIRS`): changing a prompt's words bumps its
 *   version and re-reads the corpus, which is a cost and not a copy edit;
 * - a literal that is exactly "—", the empty-cell glyph a table prints where a
 *   figure does not exist. It is a mark, not a sentence.
 * - the marketing site (app/site, components/site), which has its own rules;
 * - a literal on, or directly under, a line carrying `em-dash-ok: <reason>`,
 *   for a model prompt inside a file that also holds copy. The reason is
 *   required so the exemption says what it is.
 */

export const SCANNED_ROOTS = ['components', 'app', 'lib']

const SKIP_DIRS = new Set(['node_modules', '.next', 'test'])
const SKIP_PATHS = [
  'app/site/',
  'components/site/',
  'app/api/',
  'app/render/',
]
/** Model prompts: their words are an input to a model, never printed. */
export const MODEL_PROMPT_DIRS = [
  'lib/pipeline/',
  'lib/gather/',
  'lib/eval/',
  'lib/keywords/suggest.ts',
  'lib/reports/cover-model.ts',
  'lib/reports/documents/write-model.ts',
  'lib/subjects/membership.ts',
  'lib/subjects/propose.ts',
]

const MATCHER_METHODS = new Set(['replace', 'replaceAll', 'split', 'includes', 'startsWith', 'endsWith', 'indexOf', 'match', 'test'])

export interface DashHit {
  file: string
  line: number
  text: string
}

function listFiles(root: string, dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) listFiles(root, p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !/fixture/.test(name) && !/\.d\.ts$/.test(name)) {
      const rel = relative(root, p)
      if (SKIP_PATHS.some((s) => rel.startsWith(s))) continue
      if (MODEL_PROMPT_DIRS.some((s) => rel.startsWith(s))) continue
      out.push(rel)
    }
  }
}

function isMatcherArgument(node: ts.Node): boolean {
  let cur: ts.Node = node
  // walk up through parentheses / binary concatenation / template spans
  while (cur.parent && (ts.isParenthesizedExpression(cur.parent) || ts.isBinaryExpression(cur.parent) || ts.isTemplateSpan(cur.parent) || ts.isTemplateExpression(cur.parent))) cur = cur.parent
  const p = cur.parent
  if (!p) return false
  if (ts.isNewExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'RegExp') return true
  if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && MATCHER_METHODS.has(p.expression.name.text)) return true
  return false
}

export function scanSource(file: string, source: string): DashHit[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const hits: DashHit[] = []
  const lines = source.split('\n')
  const exempt = (line: number) => [lines[line], lines[line - 1]].some((l) => l != null && /em-dash-ok: \S/.test(l))
  const add = (node: ts.Node, text: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    if (exempt(line)) return
    hits.push({ file, line: line + 1, text: text.trim().slice(0, 160) })
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      if (node.text.includes('—')) add(node, node.text)
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const t = node.text
      if (t.includes('—') && t !== '—' && !isMatcherArgument(node)) {
        // an import specifier or a type-level literal is never copy
        if (!ts.isImportDeclaration(node.parent) && !ts.isLiteralTypeNode(node.parent)) add(node, t)
      }
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const t = node.text
      if (t.includes('—') && !isMatcherArgument(node.parent.parent ?? node)) add(node, t)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

export function scanRepo(root: string): DashHit[] {
  const files: string[] = []
  for (const r of SCANNED_ROOTS) listFiles(root, join(root, r), files)
  return files.flatMap((f) => scanSource(f, readFileSync(join(root, f), 'utf8')))
}
