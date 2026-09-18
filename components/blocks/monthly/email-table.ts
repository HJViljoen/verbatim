import type { CSSProperties } from 'react'

/**
 * The two constants every email table in this artefact repeats (Block D
 * wave 2, E-monthly).
 *
 * `components/email/primitives.tsx` has held both since Stage 3 and holds them
 * PRIVATE, because until now nothing outside that file drew a table. The
 * monthly report's three ported sections do — the artboard's section 2, 4 and
 * 5 are tables and an email has no grid — so the pair is stated once here
 * rather than four times across four files. Exporting them from the primitives
 * module instead would be a change to a file the whole wave shares; this is
 * additive and belongs to one package.
 */
export const T: CSSProperties = { borderCollapse: 'collapse', borderSpacing: 0 }

export const presentation = { role: 'presentation', cellPadding: 0, cellSpacing: 0, border: 0 } as const
