'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Esc closes the viewer. An enhancement only: the backdrop and the Close
// button are plain Links, so the panel opens and closes with no JS at all.
// This island renders nothing and only listens.
export function ViewerEscape({ closeHref }: { closeHref: string }) {
  const router = useRouter()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) router.push(closeHref, { scroll: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeHref, router])
  return null
}
