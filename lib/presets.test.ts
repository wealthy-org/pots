import { describe, expect, it } from 'vitest'
import { PRESETS } from './presets'

describe('PRESETS', () => {
  it('matches the approved square counts', () => {
    expect(PRESETS.odd).toHaveLength(13)
    expect(PRESETS.even).toHaveLength(12)
    expect(PRESETS.diamond).toHaveLength(13)
    expect(PRESETS.ring).toHaveLength(16)
  })

  it('keeps every square inside 1 to 25', () => {
    for (const squares of Object.values(PRESETS)) {
      for (const square of squares) {
        expect(square).toBeGreaterThanOrEqual(1)
        expect(square).toBeLessThanOrEqual(25)
      }
    }
  })
})
