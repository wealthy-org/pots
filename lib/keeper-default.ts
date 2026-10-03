import { createKeeperChain } from './keeper-chain'
import { createDefaultKeeperHandlers } from './keeper-http'

/**
 * Module-level on purpose: the failure limiter keeps its counters between requests of one instance.
 * tradeoff: state lives in the function instance only. Upgrade trigger: the WAF rate-limit rule.
 */
export const keeperHandlers = createDefaultKeeperHandlers((config) =>
  createKeeperChain(config.privateKey),
)
