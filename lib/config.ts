export type ConfigEnv = Record<string, string | undefined>

export type ConfigIssue = { variable: string; problem: string }

const LOCAL_CHAIN_ID = 31337
const KNOWN_CHAIN_IDS = [46630, 4663, LOCAL_CHAIN_ID]
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/
const ZERO_ADDRESS = /^0x0{40}$/

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function resolveChainId(env: ConfigEnv): number {
  const raw = env.NEXT_PUBLIC_ROBINHOOD_CHAIN_ID
  return raw === undefined || raw === '' ? 46630 : Number(raw)
}

/**
 * Returns what a non-local build still needs. A local Anvil run has built-in defaults, so it needs
 * nothing. The indexer URL is optional because the app falls back to contract reads.
 */
export function validateConfig(env: ConfigEnv): ConfigIssue[] {
  const chainId = resolveChainId(env)
  const issues: ConfigIssue[] = []

  // The plan feature is optional on every chain: unset means no plan control and no plan step.
  const plan = env.NEXT_PUBLIC_AUTO_PLAN_ADDRESS
  if (plan && (!ADDRESS_PATTERN.test(plan) || ZERO_ADDRESS.test(plan))) {
    issues.push({
      variable: 'NEXT_PUBLIC_AUTO_PLAN_ADDRESS',
      problem: 'is not a valid, non-zero address',
    })
  }

  if (!KNOWN_CHAIN_IDS.includes(chainId)) {
    issues.push({
      variable: 'NEXT_PUBLIC_ROBINHOOD_CHAIN_ID',
      problem: 'must be 46630, 4663, or 31337',
    })
    return issues
  }
  if (chainId === LOCAL_CHAIN_ID) {
    return issues
  }

  for (const variable of ['NEXT_PUBLIC_ROUND_MANAGER_ADDRESS', 'NEXT_PUBLIC_POTS_TOKEN_ADDRESS']) {
    const value = env[variable]
    if (!value) {
      issues.push({ variable, problem: 'is not set' })
    } else if (!ADDRESS_PATTERN.test(value) || ZERO_ADDRESS.test(value)) {
      issues.push({ variable, problem: 'is not a valid, non-zero address' })
    }
  }

  const deployBlock = env.NEXT_PUBLIC_ROUND_MANAGER_DEPLOY_BLOCK
  if (!deployBlock) {
    issues.push({
      variable: 'NEXT_PUBLIC_ROUND_MANAGER_DEPLOY_BLOCK',
      problem: 'is not set, so event scans would start at block 0',
    })
  } else if (!/^\d+$/.test(deployBlock) || BigInt(deployBlock) === 0n) {
    issues.push({
      variable: 'NEXT_PUBLIC_ROUND_MANAGER_DEPLOY_BLOCK',
      problem: 'must be a positive block number',
    })
  }

  const rpc = env.NEXT_PUBLIC_ROBINHOOD_RPC_URL
  if (rpc && !isHttpUrl(rpc)) {
    issues.push({ variable: 'NEXT_PUBLIC_ROBINHOOD_RPC_URL', problem: 'is not a valid URL' })
  } else if (chainId === 4663 && !rpc) {
    issues.push({
      variable: 'NEXT_PUBLIC_ROBINHOOD_RPC_URL',
      problem: 'must be set explicitly for mainnet',
    })
  }

  const indexer = env.NEXT_PUBLIC_INDEXER_URL
  if (indexer && !isHttpUrl(indexer)) {
    issues.push({ variable: 'NEXT_PUBLIC_INDEXER_URL', problem: 'is not a valid URL' })
  }

  return issues
}

export function describeConfigIssues(issues: ConfigIssue[]): string {
  return issues.map((issue) => `${issue.variable} ${issue.problem}`).join('; ')
}
