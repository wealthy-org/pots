import { describe, expect, it } from 'vitest'
import { formatCountdown, formatRemaining } from './use-countdown'

describe('formatCountdown', () => {
  it('formats seconds as mm:ss', () => {
    expect(formatCountdown(0)).toBe('00:00')
    expect(formatCountdown(65)).toBe('01:05')
  })
})

describe('formatRemaining', () => {
  it('keeps mm:ss below one hour', () => {
    expect(formatRemaining(59)).toBe('00:59')
    expect(formatRemaining(3599)).toBe('59:59')
  })

  it('switches to hours and minutes from one hour', () => {
    expect(formatRemaining(3600)).toBe('1h 00m')
    expect(formatRemaining(86400)).toBe('24h 00m')
    expect(formatRemaining(5400)).toBe('1h 30m')
  })
})
