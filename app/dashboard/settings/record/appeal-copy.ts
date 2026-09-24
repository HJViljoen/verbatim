/**
 * The four sentences the appeal control can say, in one place.
 *
 * ONE STATE, ONE SENTENCE. The button said "Filed — we will look at this one."
 * and the action returned "Filed. We will look at this one by hand." for the
 * same state, and which one a reader saw depended on whether the render had
 * a message to show (code review finding 10 / design review finding 7). They
 * are the same fact, so they are one string, and both the control and the
 * action now read it from here.
 *
 * A PLAIN MODULE, NOT THE ACTION FILE AND NOT THE COMPONENT. `actions.ts` is
 * `'use server'` and may export nothing but async functions, and importing the
 * control into it would drag JSX into the action module for the sake of four
 * strings. So the copy sits on its own, imported by both.
 */

/** The control itself: what a reader is being invited to say. */
export const APPEAL_ASK = 'This should have been kept'

/** In flight. */
export const APPEAL_FILING = 'Filing…'

/** Filed, now or on an earlier visit. */
export const APPEAL_FILED = 'Filed — we will look at this one by hand.'

/** The same statement twice is still one statement: `gate_appeals` is unique on
 *  the verdict's own key, so a second click is told the truth rather than being
 *  refused. */
export const APPEAL_ALREADY = 'Already filed — we have this one.'
