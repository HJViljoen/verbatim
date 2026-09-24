import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// A "use server" file may export async functions only. One plain object in
// lib/actions/subjects.ts made Next refuse the module at runtime and took down
// every Studio action (2026-09-24, error digest 4042015919@E352).
describe('"use server" files export async functions only', () => {
  const files = execSync(`git grep -l -E "^['\\"]use server['\\"]" -- app lib components`, { encoding: 'utf8' })
    .split('\n').filter(Boolean)
  it('finds the server-action files', () => { expect(files.length).toBeGreaterThan(0) })
  for (const f of files) {
    it(f, () => {
      const bad = readFileSync(f, 'utf8').split('\n').filter((l) =>
        /^export\s+(const|let|var|class|enum|default\s+(?!async))/.test(l) ||
        /^export\s+function\s/.test(l) ||
        /^export\s+\{/.test(l) && !/^export\s+type\s/.test(l))
      expect(bad).toEqual([])
    })
  }
})
