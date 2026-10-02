import { describe, expect, it } from 'vitest'
import { formatWeiToEth, multiplyWei, parseEthToWei, WEI_PER_ETH } from './wei'

describe('parseEthToWei', () => {
  it('parses whole and fractional ETH', () => {
    expect(parseEthToWei('1')).toBe(WEI_PER_ETH)
    expect(parseEthToWei('0.001')).toBe(10n ** 15n)
    expect(parseEthToWei('0,001')).toBe(10n ** 15n)
    expect(parseEthToWei('1.234567891234567891')).toBe(1234567891234567891n)
  })

  it('rejects invalid or over-precise values', () => {
    expect(parseEthToWei('')).toBeNull()
    expect(parseEthToWei('abc')).toBeNull()
    expect(parseEthToWei('-1')).toBeNull()
    expect(parseEthToWei('1.2345678912345678912')).toBeNull()
    expect(parseEthToWei('1e18')).toBeNull()
  })
})

describe('formatWeiToEth', () => {
  it('formats with up to five decimals and trims zeros', () => {
    expect(formatWeiToEth(WEI_PER_ETH)).toBe('1')
    expect(formatWeiToEth(10n ** 15n)).toBe('0.001')
    expect(formatWeiToEth(1234567890123456789n)).toBe('1.23456')
    expect(formatWeiToEth(0n)).toBe('0')
  })

  it('respects the decimal cap', () => {
    expect(formatWeiToEth(10n ** 15n, 2)).toBe('0')
    expect(formatWeiToEth(1234567890123456789n, 8)).toBe('1.23456789')
  })
})

describe('multiplyWei', () => {
  it('multiplies by square count without floating point', () => {
    expect(multiplyWei(10n ** 15n, 25)).toBe(25n * 10n ** 15n)
    expect(multiplyWei(0n, 25)).toBe(0n)
  })
})
