import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'

// DESIGN TEST (Hairline look): the faces hairline.lucasmarkes.com sets.
// Geist for everything, Geist Mono for counts and meta, Instrument Serif for
// the one italic word in the headline and for what people said. Self-hosted by
// next/font like Plex. Imported only by ./index.tsx, which the route loads on
// `?look=hairline` alone. Not preloaded: a preload tag is the one thing that
// could reach the default page's <head> if a bundler ever hoisted this module.

export const hlSans = Geist({ subsets: ['latin'], display: 'swap', preload: false })
export const hlMono = Geist_Mono({ subsets: ['latin'], display: 'swap', preload: false })
export const hlSerif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], display: 'swap', preload: false })
