import { describe, expect, it } from 'vitest'
import { parseRef, referralBonus, referralLink } from './referral'

const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

describe('parseRef', () => {
  it('reads a valid address and returns it checksummed', () => {
    expect(parseRef(`?ref=${ADDRESS.toLowerCase()}`)).toBe(ADDRESS)
    expect(parseRef(`?x=1&ref=${ADDRESS}`)).toBe(ADDRESS)
  })

  it('rejects missing, malformed, and zero addresses', () => {
    expect(parseRef('')).toBeNull()
    expect(parseRef('?ref=')).toBeNull()
    expect(parseRef('?ref=0x123')).toBeNull()
    expect(parseRef('?ref=hello')).toBeNull()
    expect(parseRef(`?ref=0x${'0'.repeat(40)}`)).toBeNull()
  })
})

describe('referralLink', () => {
  it('points at the Mine page with the wallet as ref', () => {
    expect(referralLink('https://pots.test', ADDRESS)).toBe(`https://pots.test/mine?ref=${ADDRESS}`)
  })
})

describe('referralBonus', () => {
  it('is 1% of the claim in wei, rounded down', () => {
    expect(referralBonus(10n ** 18n)).toBe(10n ** 16n)
    expect(referralBonus(99n)).toBe(0n)
    expect(referralBonus(0n)).toBe(0n)
  })
})
