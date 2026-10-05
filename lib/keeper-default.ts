import { getDb } from './db/client'
import { keeperEvents } from './db/schema'
import { createKeeperChain } from './keeper-chain'
import { createKeeperHistory, type KeeperEventRow } from './keeper-history'
import { createDefaultKeeperHandlers } from './keeper-http'

/**
 * Module-level on purpose: the failure limiter and the history throttle keep their state between
 * requests of one instance. tradeoff: state lives in the function instance only. Upgrade trigger:
 * the WAF rate-limit rule.
 */
const recordHistory = createKeeperHistory({
  // Read at the point of use: with DATABASE_URL unset there is no history and no database call.
  getInsert: () => {
    const db = getDb()
    return db
      ? async (row: KeeperEventRow) => {
          await db.insert(keeperEvents).values(row)
        }
      : null
  },
  now: () => Date.now(),
  log: (line) => console.info(line),
})

export const keeperHandlers = createDefaultKeeperHandlers(
  (config) => createKeeperChain(config.privateKey),
  recordHistory,
)
