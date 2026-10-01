import { LogOut } from "lucide-react"
import { signOut } from "@/app/login/actions"

/**
 * LOG OUT, FOR THE SETTINGS BAR (the navigation of 1 Oct; page review §1
 * Settings: "Log out moves in"). It left the sidebar's foot, which the design
 * draws as Studio and Settings alone, and Settings' bar carries it instead.
 *
 * Drawn exactly as `Page-Settings.dc.html` draws it: a 40px white button, 16px
 * across, a 10px radius, a hairline border, 14px semibold ink, and Lucide's
 * `LogOut` at 16px before the words.
 *
 * A form posting to the server action, not a client handler, so it is a server
 * component any page can render and it works before the page hydrates. The
 * action clears the session cookies and lands on /login (app/login/actions.ts).
 */
export function LogOutButton() {
  return (
    <form action={signOut} className="m-0">
      <button
        type="submit"
        className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-[#E4E2DC] bg-white px-4 text-[14px] font-semibold text-[#26292C] hover:bg-[#F7F6F2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#26292C]"
      >
        <LogOut className="size-4 shrink-0" strokeWidth={2} aria-hidden />
        Log out
      </button>
    </form>
  )
}
