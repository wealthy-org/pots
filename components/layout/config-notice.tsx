import { validateConfig } from '@/lib/config'

/** Environment values the browser bundle can see; each access must stay a literal for Next to inline it. */
const publicEnv = {
  NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: process.env.NEXT_PUBLIC_ROBINHOOD_CHAIN_ID,
  NEXT_PUBLIC_ROBINHOOD_RPC_URL: process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL,
  NEXT_PUBLIC_ROUND_MANAGER_ADDRESS: process.env.NEXT_PUBLIC_ROUND_MANAGER_ADDRESS,
  NEXT_PUBLIC_POTS_TOKEN_ADDRESS: process.env.NEXT_PUBLIC_POTS_TOKEN_ADDRESS,
  NEXT_PUBLIC_ROUND_MANAGER_DEPLOY_BLOCK: process.env.NEXT_PUBLIC_ROUND_MANAGER_DEPLOY_BLOCK,
  NEXT_PUBLIC_INDEXER_URL: process.env.NEXT_PUBLIC_INDEXER_URL,
}

export function ConfigNotice() {
  const issues = validateConfig(publicEnv)
  if (issues.length === 0) {
    return null
  }
  return (
    <div
      role="alert"
      className="mb-4 rounded-md border border-loss/40 bg-loss/10 px-4 py-2.5 text-sm"
    >
      <p className="font-medium">This build is not fully configured.</p>
      <ul className="mt-1 list-inside list-disc font-mono text-xs text-text-2">
        {issues.map((issue) => (
          <li key={issue.variable}>
            {issue.variable} {issue.problem}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-text-2">
        Contract reads and deploys will fail until this is fixed.
      </p>
    </div>
  )
}
