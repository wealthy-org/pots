import { describe, expect, it } from 'vitest'
import { roundsAgoLabel, shortenAddress } from './format'

describe('roundsAgoLabel', () => {
  it('names the unit and pluralises it', () => {
    expect(roundsAgoLabel(1)).toBe('1 round ago')
    expect(roundsAgoLabel(5)).toBe('5 rounds ago')
    expect(roundsAgoLabel(0)).toBe('Hit this round')
  })

  it('falls back when the indexer does not know the last hit', () => {
    expect(roundsAgoLabel(null)).toBe('Current jackpot')
    expect(roundsAgoLabel(undefined)).toBe('Current jackpot')
    expect(roundsAgoLabel(-1)).toBe('Current jackpot')
  })
})

describe('shortenAddress', () => {
  it('keeps the first six and last four characters', () => {
    expect(shortenAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe('0x7099...79C8')
  })
})
