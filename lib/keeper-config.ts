export type KeeperConfig = {
  privateKey: `0x${string}`
  secret: string
  minBalanceWei: bigint
}

export type KeeperConfigIssue = { variable: string; problem: string }

export type KeeperConfigResult =
  { ok: true; config: KeeperConfig } | { ok: false; issues: KeeperConfigIssue[] }

export const DEFAULT_MIN_BALANCE_WEI = 2_000_000_000_000_000n
const MIN_SECRET_LENGTH = 32

type Env = Record<string, string | undefined>

/**
 * Reads the server-only keeper variables. Problems name the variable and never
 * contain a value, because the result can end up in an HTTP body (api.md API-28).
 */
export function readKeeperConfig(env: Env): KeeperConfigResult {
  const issues: KeeperConfigIssue[] = []
  const privateKey = env.KEEPER_PRIVATE_KEY
  const secret = env.KEEPER_SECRET
  const minBalance = env.KEEPER_MIN_BALANCE_WEI

  if (!privateKey) {
    issues.push({ variable: 'KEEPER_PRIVATE_KEY', problem: 'is not set' })
  } else if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    issues.push({ variable: 'KEEPER_PRIVATE_KEY', problem: 'is not a 32-byte hex key' })
  }

  if (!secret) {
    issues.push({ variable: 'KEEPER_SECRET', problem: 'is not set' })
  } else if (secret.length < MIN_SECRET_LENGTH) {
    issues.push({
      variable: 'KEEPER_SECRET',
      problem: `must be at least ${MIN_SECRET_LENGTH} characters`,
    })
  }

  let minBalanceWei = DEFAULT_MIN_BALANCE_WEI
  if (minBalance !== undefined && minBalance !== '') {
    if (!/^\d+$/.test(minBalance)) {
      issues.push({ variable: 'KEEPER_MIN_BALANCE_WEI', problem: 'must be a whole number of wei' })
    } else {
      minBalanceWei = BigInt(minBalance)
    }
  }

  if (issues.length > 0 || !privateKey || !secret) {
    return { ok: false, issues }
  }
  return { ok: true, config: { privateKey: privateKey as `0x${string}`, secret, minBalanceWei } }
}
