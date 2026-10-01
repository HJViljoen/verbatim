'use client'

import { useState } from 'react'
import { buttonClass } from './ui'

// A share link to one past issue: made on the first press (the default
// expiry, no password), copied to the clipboard, and shown where the browser
// will not copy.

export function ShareLinkButton({ snapshotId }: { snapshotId: string }) {
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function share() {
    setBusy(true); setNote(null)
    try {
      let link = url
      if (!link) {
        const r = await fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshotId }) })
        const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string }
        if (!r.ok || !j.url) { setNote(j.error ?? 'Could not make the link. Try again.'); return }
        link = j.url
        setUrl(link)
      }
      try { await navigator.clipboard.writeText(link); setNote('Link copied') } catch { setNote(link) }
    } catch {
      setNote('Could not make the link. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={share} disabled={busy} className={buttonClass('secondary', 'small')}>Share link</button>
      {note ? <span role="status" className="max-w-[260px] break-all text-[12px] text-[#5F656B]">{note}</span> : null}
    </span>
  )
}
