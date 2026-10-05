// Neon + Drizzle client over HTTP (ADR-017, D-31). Server side only.
// The `neon-http` driver sends one-shot queries; the chat routes need no interactive transaction.
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

export type Database = ReturnType<typeof createDatabase>

function createDatabase(url: string) {
  return drizzle(neon(url), { schema })
}

let cached: { url: string; db: Database } | null = null

/**
 * The database, or null when `DATABASE_URL` is unset or not a Postgres URL. Read at the point of
 * use, so a deployment without the database keeps every other feature working (rules.md).
 */
export function getDb(env: Record<string, string | undefined> = process.env): Database | null {
  const url = env.DATABASE_URL
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    return null
  }
  if (!cached || cached.url !== url) {
    cached = { url, db: createDatabase(url) }
  }
  return cached.db
}

export class DatabaseTimeoutError extends Error {
  constructor() {
    super('database_timeout')
  }
}

/** Fails a database call that outlives `ms`, so a cold or suspended compute cannot hold a route. */
export function withTimeout<T>(work: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DatabaseTimeoutError()), ms)
  })
  return Promise.race([Promise.resolve(work), limit]).finally(() => clearTimeout(timer))
}
