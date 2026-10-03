import { describe, expect, it } from 'vitest'
import { DEFAULT_MIN_BALANCE_WEI, readKeeperConfig } from './keeper-config'

const KEY = `0x${'1'.repeat(64)}`
const SECRET = 's'.repeat(40)

describe('readKeeperConfig', () => {
  it('accepts a valid configuration and applies the default minimum balance', () => {
    const result = readKeeperConfig({ KEEPER_PRIVATE_KEY: KEY, KEEPER_SECRET: SECRET })
    expect(result).toEqual({
      ok: true,
      config: { privateKey: KEY, secret: SECRET, minBalanceWei: DEFAULT_MIN_BALANCE_WEI },
    })
    expect(DEFAULT_MIN_BALANCE_WEI).toBe(2_000_000_000_000_000n)
  })

  it('reads an explicit minimum balance', () => {
    const result = readKeeperConfig({
      KEEPER_PRIVATE_KEY: KEY,
      KEEPER_SECRET: SECRET,
      KEEPER_MIN_BALANCE_WEI: '123',
    })
    expect(result.ok && result.config.minBalanceWei).toBe(123n)
  })

  it('treats a missing optional minimum balance as fine', () => {
    const result = readKeeperConfig({
      KEEPER_PRIVATE_KEY: KEY,
      KEEPER_SECRET: SECRET,
      KEEPER_MIN_BALANCE_WEI: '',
    })
    expect(result.ok).toBe(true)
  })

  it('names every missing variable', () => {
    const result = readKeeperConfig({})
    expect(result.ok).toBe(false)
    expect(!result.ok && result.issues.map((issue) => issue.variable)).toEqual([
      'KEEPER_PRIVATE_KEY',
      'KEEPER_SECRET',
    ])
  })

  it('rejects a short secret, a malformed key, and a malformed minimum balance', () => {
    const result = readKeeperConfig({
      KEEPER_PRIVATE_KEY: '0x1234',
      KEEPER_SECRET: 'short',
      KEEPER_MIN_BALANCE_WEI: '0.5',
    })
    expect(!result.ok && result.issues.map((issue) => issue.variable)).toEqual([
      'KEEPER_PRIVATE_KEY',
      'KEEPER_SECRET',
      'KEEPER_MIN_BALANCE_WEI',
    ])
  })

  it('never puts a value into an issue', () => {
    const bad = 'not-a-key-but-secret-looking-value'
    const result = readKeeperConfig({ KEEPER_PRIVATE_KEY: bad, KEEPER_SECRET: 'tiny' })
    expect(JSON.stringify(result)).not.toContain(bad)
    expect(JSON.stringify(result)).not.toContain('tiny')
  })
})
