import { describe, expect, it } from 'vitest'

import { firstPanelUpdate } from './brands-load'

// The Brands page's one pure seam in its loader (WP3.5): the update the first
// attention panel freezes with, where none exists yet. The panel freezes with
// the first month that closes (research S10: Sealand's first panel, the 4 Oct
// run, which freezes August).

const SEALAND = { report_period: 'weekly', report_day: 'sunday' }
const RIVALS = [{ name: 'Cotopaxi', retiredAt: null }, { name: 'Poler', retiredAt: '2026-09-09T10:00:00.000Z' }]
const den = (month: string, audience: string, status: string) => ({ month, audience, status })

describe('firstPanelUpdate', () => {
  it('names the update after the oldest filling month’s freeze line (Sealand at 27 Sep: August, the 4 Oct update)', () => {
    const at = firstPanelUpdate({
      now: '2026-09-27T08:30:00.000Z',
      schedule: SEALAND,
      rivals: RIVALS,
      denominators: [
        den('2026-07-01', 'industry-other', 'frozen'), den('2026-08-01', 'industry-other', 'filling'),
        den('2026-08-01', 'competitor:Cotopaxi', 'filling'), den('2026-09-01', 'industry-other', 'filling'),
      ],
    })
    expect(at?.slice(0, 10)).toBe('2026-10-04')
  })

  it('reads only the market’s audiences: a retired rival’s filling row does not move it', () => {
    const at = firstPanelUpdate({
      now: '2026-09-27T08:30:00.000Z',
      schedule: SEALAND,
      rivals: RIVALS,
      denominators: [den('2026-06-01', 'competitor:Poler', 'filling'), den('2026-09-01', 'industry-other', 'filling')],
    })
    expect(at?.slice(0, 10)).toBe('2026-11-01')
  })

  it('promises nothing without a schedule or a filling month', () => {
    expect(firstPanelUpdate({ now: '2026-09-27T08:30:00.000Z', schedule: null, rivals: RIVALS, denominators: [den('2026-09-01', 'industry-other', 'filling')] })).toBeNull()
    expect(firstPanelUpdate({ now: '2026-09-27T08:30:00.000Z', schedule: SEALAND, rivals: RIVALS, denominators: [den('2026-08-01', 'industry-other', 'frozen')] })).toBeNull()
  })
})
