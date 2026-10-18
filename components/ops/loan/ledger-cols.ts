// The ledger's grid, shared by its header row (sections.tsx, a server
// component) and its rows (editors.tsx, a client one), so it lives in neither:
// a server component that imports a value from a 'use client' file gets a
// client reference, not the string.
//
// From 800px of card: date, note, borrowed, paid back, balance after, and
// Edit / Delete. Narrower, a row is two lines and its buttons. Written out
// whole for Tailwind's scanner.

export const LEDGER_COLS = '@min-[800px]/ledger:grid-cols-[92px_minmax(0,1fr)_112px_112px_136px_136px]'
