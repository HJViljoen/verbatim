import { describe, expect, it } from 'vitest'

import { summariseRunErrors } from '../pipeline/run-errors'
import { countedStepLabels, OWN_TABLE_STEPS, updateStatus } from './run-status'
import { AFTER_GATHER_STEPS } from './week-line'

const msg = (recorded: string[], total = recorded.length) => summariseRunErrors(total, recorded)
const PRODUCT = 'product-readings: 2026-10 not written (Postgres 23505): product_mentions insert: duplicate key value'

describe('updateStatus: a run partial only for Your products is the update it was', () => {
  it('reads the counted labels close-run writes, and nothing of a message cut at the cap', () => {
    expect(countedStepLabels(msg([PRODUCT]))).toEqual(['product-readings'])
    expect(countedStepLabels(msg([PRODUCT, PRODUCT, 'plan-product-readings: not planned: x']))).toEqual(['product-readings', 'plan-product-readings'])
    expect(countedStepLabels(msg(['comments:tiktok:4: actor failed', PRODUCT]))).toEqual(['comments:tiktok:4', 'product-readings'])
    expect(countedStepLabels(msg([PRODUCT], 60))).toBeNull()
    expect(countedStepLabels(null)).toBeNull()
    expect(countedStepLabels('3 step errors')).toBeNull()
  })

  it('completed only where every counted error is a product step; any other step keeps the run partial, as today', () => {
    expect(updateStatus({ status: 'partial', error_message: msg([PRODUCT]) })).toBe('completed')
    expect(updateStatus({ status: 'partial', error_message: msg([PRODUCT, 'plan-product-readings: not planned: x']) })).toBe('completed')
    // a gather-stage error beside it
    expect(updateStatus({ status: 'partial', error_message: msg([PRODUCT, 'gate:youtube: refused']) })).toBe('partial')
    // a step after the gather that is not Your products' (Össur's 18 Oct run)
    expect(updateStatus({ status: 'partial', error_message: msg(['ocr: 51 of 300 video calls failed (17%)']) })).toBe('partial')
    // no message, a cut message, and every other status: as they are
    expect(updateStatus({ status: 'partial' })).toBe('partial')
    expect(updateStatus({ status: 'partial', error_message: msg([PRODUCT], 60) })).toBe('partial')
    expect(updateStatus({ status: 'failed', error_message: msg([PRODUCT]) })).toBe('failed')
    expect(updateStatus({ status: 'completed', error_message: null })).toBe('completed')
    expect(updateStatus({ status: null })).toBeNull()
  })

  it('the product steps are steps after the gather, so the week charts already read them so', () => {
    for (const s of OWN_TABLE_STEPS) expect(AFTER_GATHER_STEPS).toContain(s)
  })
})
