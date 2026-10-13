import { describe, expect, it } from 'vitest'

import { weekLead, type LeadConversation } from './week-lead'

// What leads the week: ONE rule, the weekly email's and Market's (T11b).

const conv = (registryId: string, week: number, setApart = false): LeadConversation & { tag: string } =>
  ({ registryId, label: `Label ${registryId}`, week, setApart, tag: `conv-${registryId}` })

const CONVS = [conv('a', 12), conv('b', 30, true), conv('c', 18), conv('d', 18), conv('e', 4)]

describe('weekLead', () => {
  it('the first flag leads, in the order given (weekFlagRows\' order), whatever the conversations say', () => {
    const flags = [{ id: 'f1', rank: 1 }, { id: 'f2', rank: 2 }]
    expect(weekLead({ flags, newThisWeek: [{ registryId: 'a' }], conversations: CONVS })).toEqual({ kind: 'flag', flag: flags[0] })
    // A flag leads as flagged even where its conversation is set apart: the
    // conversations are not consulted.
    expect(weekLead({ flags: [{ id: 'on-b' }], newThisWeek: [], conversations: CONVS })?.kind).toBe('flag')
  })

  it('else the new conversation with the most videos this week, on the conversation\'s count', () => {
    const lead = weekLead({ flags: [], newThisWeek: [{ registryId: 'e' }, { registryId: 'a' }], conversations: CONVS })
    expect(lead).toEqual({ kind: 'new', conversation: CONVS[0] })
    // The caller's own object comes back.
    expect(lead?.kind !== 'flag' && lead?.conversation.tag).toBe('conv-a')
  })

  it('a new conversation set apart, or with no conversation to count it, never leads; the next one does', () => {
    expect(weekLead({ flags: [], newThisWeek: [{ registryId: 'b' }, { registryId: 'e' }], conversations: CONVS })).toEqual({ kind: 'new', conversation: CONVS[4] })
    expect(weekLead({ flags: [], newThisWeek: [{ registryId: 'zz' }], conversations: CONVS })?.kind).toBe('biggest')
  })

  it('else the biggest conversation this week, never one set apart; ties to the registry id', () => {
    expect(weekLead({ flags: [], newThisWeek: [], conversations: CONVS })).toEqual({ kind: 'biggest', conversation: CONVS[2] })
    expect(weekLead({ flags: [], newThisWeek: [], conversations: [conv('z', 5), conv('y', 5)] })?.kind !== 'flag'
      && weekLead({ flags: [], newThisWeek: [], conversations: [conv('z', 5), conv('y', 5)] })).toMatchObject({ conversation: { registryId: 'y' } })
  })

  it('nothing is null: no flag, nothing new, no conversation with a video, or only set-apart ones', () => {
    expect(weekLead({ flags: [], newThisWeek: [], conversations: [] })).toBeNull()
    expect(weekLead({ flags: [], newThisWeek: [{ registryId: 'x' }], conversations: [conv('x', 0)] })).toBeNull()
    expect(weekLead({ flags: [], newThisWeek: [], conversations: [conv('b', 30, true)] })).toBeNull()
  })

  it('reads its input and never reorders it', () => {
    const before = CONVS.map((c) => c.registryId)
    weekLead({ flags: [], newThisWeek: [], conversations: CONVS })
    expect(CONVS.map((c) => c.registryId)).toEqual(before)
  })
})
