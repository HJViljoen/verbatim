import { APPEAL_ASK, APPEAL_FILING } from './appeal-copy'

/**
 * "This should have been kept" — the reject log's control, as the artboard
 * draws it (`record.rejects.*`, design review finding 2).
 *
 * THE ARTBOARD'S BUTTON, NOT A TEXT LINK. `SettingsRecord.dc.html` draws a 44px
 * bordered button in its own 230px column, on white, with a hairline ring and a
 * 12.5px medium label; the build drew an 11.5px hover-underline text link about
 * 16px tall — an affordance that only appears once the pointer is already on
 * it, on the one control that is this page's whole argument. A reader who
 * disagrees with the gate has to be able to SEE that disagreeing is something
 * the product invites.
 *
 * PURE, AND SEPARATE FROM THE ACTION, so the render tier can render the control
 * a reader actually gets. `AppealButton` is a client component holding
 * `useActionState`, which a static render cannot drive; the block test used to
 * substitute a bare `<span>`, so the shipped control's copy and size were
 * asserted by nothing (code review finding 7). This file has no hooks and no
 * action — it is the markup — and the button is a plain `type="submit"` that
 * the client component wraps in its form.
 */
export function AppealControl({
  filed, pending, error,
}: {
  /** The sentence to print in place of the control, once there is nothing left
   *  to ask for. */
  filed?: string | null
  pending?: boolean
  /** What went wrong, where the action came back with something to say. */
  error?: string | null
}) {
  if (filed) {
    return <span className="block text-[11.5px] leading-[1.4] text-muted-foreground lg:text-right">{filed}</span>
  }
  return (
    <span className="flex flex-col items-start gap-1 lg:items-end">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-[44px] shrink-0 items-center whitespace-nowrap rounded-[4px] bg-tile px-4 text-[12.5px] font-medium text-foreground ring-1 ring-border transition-colors hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        {pending ? APPEAL_FILING : APPEAL_ASK}
      </button>
      {error ? <span className="text-[11.5px] text-negative lg:text-right">{error}</span> : null}
    </span>
  )
}
