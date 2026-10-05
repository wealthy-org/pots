import { verifyMessage, type Hex } from 'viem'
import { createChatHandlers, createDefaultLimiter, createReadLimiter } from './chat-http'
import { createDbChatStore } from './chat-store'
import { resolveChainId } from './config'
import { getDb } from './db/client'

/**
 * Module-level on purpose: the failure limiter keeps its counters between requests of one instance
 * (the same trade-off as the keeper, see keeper-auth.ts).
 */
export const chatHandlers = createChatHandlers({
  getEnv: () => process.env,
  getStore: () => {
    const db = getDb()
    return db ? createDbChatStore(db) : null
  },
  // personal_sign of an externally owned account is recovered locally: no client and no RPC call.
  verifySignature: ({ wallet, message, signature }) =>
    verifyMessage({ address: wallet, message, signature: signature as Hex }),
  limiter: createDefaultLimiter(),
  readLimiter: createReadLimiter(),
  now: () => Date.now(),
  log: (line) => console.info(line),
  chainId: () => resolveChainId(process.env),
})
