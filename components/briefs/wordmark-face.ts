import { Bricolage_Grotesque } from 'next/font/google'

// The wordmark's face on the brief's cover (the canvas sets "Verbatim" in
// Bricolage Grotesque 700, as the sidebar does): the bold cut alone, latin
// only, as a CSS variable the deck reads (`--font-wordmark`). Kept out of the
// deck itself so the render tier's tests, which run outside Next, can import
// the deck.
export const briefWordmarkFace = Bricolage_Grotesque({ subsets: ['latin'], weight: '700', display: 'swap', variable: '--font-wordmark' })
