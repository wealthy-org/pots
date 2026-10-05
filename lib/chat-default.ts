import { createPublicClient, http, type Hex } from 'viem'
import { createChatHandlers, createDefaultLimiter } from './chat-http'
import { createDbChatStore } from './chat-store'
import { resolveChainId } from './config'
import { getDb } from './db/client'

const verifier = createPublicClient({ transport: http('http://127.0.0.1') })

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
  // personal_sign of an externally owned account is checked locally: no RPC call is made.
  verifySignature: ({ wallet, message, signature }) =>
    verifier.verifyMessage({ address: wallet, message, signature: signature as Hex }),
  limiter: createDefaultLimiter(),
  now: () => Date.now(),
  log: (line) => console.info(line),
  chainId: () => resolveChainId(process.env),
})
