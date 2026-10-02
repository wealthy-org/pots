import { describe, expect, it } from 'vitest'
import { netEth, shareAmount } from './shares'

describe('shareAmount', () => {
  it('splits proportionally with integer floor', () => {
    expect(shareAmount(4_500n, 3n, 4n)).toBe(3_375n)
    expect(shareAmount(4_500n, 1n, 4n)).toBe(1_125n)
    expect(shareAmount(1_000n, 1n, 3n)).toBe(333n)
  })

  it('returns zero for an empty winning square', () => {
    expect(shareAmount(4_500n, 1n, 0n)).toBe(0n)
  })
})

describe('netEth', () => {
  it('can be negative when the entry lost', () => {
    expect(netEth(100n, 250n)).toBe(-150n)
    expect(netEth(400n, 250n)).toBe(150n)
  })
})
