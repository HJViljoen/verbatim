import { describe, it, expect } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { SidebarTenant } from './sidebar-tenant-loader'
import type { Role } from '@/lib/roles'

// `main.shell.sidebar.tenant` — the one shell element the Overview package owns
// for the whole wave (Block D wave 2). The design review's Medium 15 is the
// reason this file exists: the side-by-side's sidebar was hand-written HTML, so
// the only picture of this footer was a picture of a copy of it. The harness
// now renders the real component, and these assertions pin the part a
// screenshot cannot show — that the second line is the member's REAL role and
// never the artboard's invented job title (D14).

describe('SidebarTenant', () => {
  it('prints the brand and the role word, and no job title', () => {
    const text = renderText(SidebarTenant({ brand: 'Sealand', role: 'admin' }))
    expect(text).toBe('Sealand admin')
    expect(text).not.toMatch(/director|manager|head of/i)
  })

  it('draws the role from the Role union — every member of it and nothing else', () => {
    const roles: Role[] = ['owner', 'admin', 'member']
    for (const role of roles) {
      expect(renderText(SidebarTenant({ brand: 'Sealand', role }))).toBe(`Sealand ${role}`)
    }
  })

  it('prints the brand alone when no role resolves', () => {
    expect(renderText(SidebarTenant({ brand: 'Sealand', role: null }))).toBe('Sealand')
  })

  it('renders nothing at all when neither resolves', () => {
    expect(render(SidebarTenant({ brand: null, role: null }))).toBe('')
  })

  it('keeps the role in mono, which is what the artboard asks for', () => {
    expect(render(SidebarTenant({ brand: 'Sealand', role: 'owner' }))).toContain('font-mono')
  })
})
