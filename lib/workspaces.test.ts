import { describe, it, expect } from 'vitest'
import { parseWorkspaceCookie } from './workspaces'

// The cookie is the ONLY attacker-controlled input on the operator path, so
// what it accepts is worth pinning. (Whether the uuid names a real client is a
// separate check — listWorkspaces — that this function deliberately does not do.)
describe('parseWorkspaceCookie', () => {
  it('accepts a canonical uuid', () => {
    expect(parseWorkspaceCookie('ac16988e-c4f3-4baf-b388-73895852a554'))
      .toBe('ac16988e-c4f3-4baf-b388-73895852a554')
  })

  it('normalises an upper-case uuid to lower case', () => {
    expect(parseWorkspaceCookie('AC16988E-C4F3-4BAF-B388-73895852A554'))
      .toBe('ac16988e-c4f3-4baf-b388-73895852a554')
  })

  it('trims surrounding whitespace', () => {
    expect(parseWorkspaceCookie('  ac16988e-c4f3-4baf-b388-73895852a554 '))
      .toBe('ac16988e-c4f3-4baf-b388-73895852a554')
  })

  it('rejects absent, empty and blank values', () => {
    expect(parseWorkspaceCookie(undefined)).toBeNull()
    expect(parseWorkspaceCookie('')).toBeNull()
    expect(parseWorkspaceCookie('   ')).toBeNull()
  })

  it('rejects junk that is not a uuid', () => {
    expect(parseWorkspaceCookie('not-a-uuid')).toBeNull()
    expect(parseWorkspaceCookie('ac16988e-c4f3-4baf-b388')).toBeNull()
    expect(parseWorkspaceCookie('ac16988e-c4f3-4baf-b388-73895852a554-extra')).toBeNull()
    expect(parseWorkspaceCookie('gc16988e-c4f3-4baf-b388-73895852a554')).toBeNull()
  })

  it('rejects a uuid with anything appended, including SQL', () => {
    expect(parseWorkspaceCookie("ac16988e-c4f3-4baf-b388-73895852a554' or '1'='1")).toBeNull()
    expect(parseWorkspaceCookie('ac16988e-c4f3-4baf-b388-73895852a554,de300055-0000-4000-8000-000000000001')).toBeNull()
    expect(parseWorkspaceCookie("'; drop table clients; --")).toBeNull()
  })
})
