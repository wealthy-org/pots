import { sql } from 'drizzle-orm'
import { withTimeout, type Database } from './db/client'

export type ChatMessage = {
  id: string
  wallet: string
  nickname: string | null
  body: string
  createdAt: string
}

export type PurgeResult = { chatDeleted: number; keeperEventsDeleted: number }

export type NicknameOutcome = 'ok' | 'taken' | 'cooldown'

/** Everything the chat routes need from the database; the routes are tested with a fake of this. */
export interface ChatStore {
  list(options: { after?: number; limit: number }): Promise<ChatMessage[]>
  /** Returns the stored message, or `rate_limited` when the wallet is posting too fast. */
  insert(wallet: string, body: string): Promise<ChatMessage | 'rate_limited'>
  /** Safety delete: chat rows older than 48 hours. */
  trimOld(): Promise<void>
  purge(): Promise<PurgeResult>
  getNickname(wallet: string): Promise<string | null>
  setNickname(wallet: string, nickname: string, lower: string): Promise<NicknameOutcome>
  removeNickname(wallet: string): Promise<void>
}

const QUERY_TIMEOUT_MS = 4_000

// Start of the current UTC day as a timestamptz.
const DAY_START = sql`(date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')`

type Row = Record<string, unknown>

function rowsOf(result: unknown): Row[] {
  const rows = (result as { rows?: Row[] }).rows
  return Array.isArray(rows) ? rows : []
}

function toMessage(row: Row): ChatMessage {
  return {
    id: String(row.id),
    wallet: String(row.wallet),
    nickname: row.nickname === null || row.nickname === undefined ? null : String(row.nickname),
    body: String(row.body),
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  }
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if ((current as { code?: unknown }).code === '23505') {
      return true
    }
    current = (current as { cause?: unknown }).cause
  }
  return false
}

export function createDbChatStore(db: Database): ChatStore {
  const run = <T>(work: PromiseLike<T>) => withTimeout(work, QUERY_TIMEOUT_MS)

  return {
    async list({ after, limit }) {
      const base = sql`
        select m.id, m.wallet, p.nickname, m.body, m.created_at
        from chat_messages m left join profiles p on p.wallet = m.wallet
        where m.created_at >= ${DAY_START}`
      if (after !== undefined) {
        const result = await run(
          db.execute(sql`${base} and m.id > ${after} order by m.id asc limit ${limit}`),
        )
        return rowsOf(result).map(toMessage)
      }
      const result = await run(db.execute(sql`${base} order by m.id desc limit ${limit}`))
      return rowsOf(result).map(toMessage).reverse()
    },

    async insert(wallet, body) {
      // One statement: the rate limit is part of the insert, so two parallel posts cannot both pass.
      const result = await run(
        db.execute(sql`
          with new_row as (
            insert into chat_messages (wallet, body)
            select ${wallet}::text, ${body}::text
            where (select count(*) from chat_messages
                   where wallet = ${wallet}::text and created_at > now() - interval '60 seconds') < 10
              and not exists (select 1 from chat_messages
                   where wallet = ${wallet}::text and created_at > now() - interval '2 seconds')
            returning id, wallet, body, created_at
          )
          select n.id, n.wallet, p.nickname, n.body, n.created_at
          from new_row n left join profiles p on p.wallet = n.wallet`),
      )
      const row = rowsOf(result)[0]
      return row ? toMessage(row) : 'rate_limited'
    },

    async trimOld() {
      await run(
        db.execute(sql`delete from chat_messages where created_at < now() - interval '48 hours'`),
      )
    },

    async purge() {
      const chat = await run(
        db.execute(sql`
          with d as (delete from chat_messages where created_at < ${DAY_START} returning 1)
          select count(*)::int as n from d`),
      )
      const events = await run(
        db.execute(sql`
          with d as (delete from keeper_events where created_at < now() - interval '30 days' returning 1)
          select count(*)::int as n from d`),
      )
      return {
        chatDeleted: Number(rowsOf(chat)[0]?.n ?? 0),
        keeperEventsDeleted: Number(rowsOf(events)[0]?.n ?? 0),
      }
    },

    async getNickname(wallet) {
      const result = await run(
        db.execute(sql`select nickname from profiles where wallet = ${wallet}::text`),
      )
      const row = rowsOf(result)[0]
      return row ? String(row.nickname) : null
    },

    async setNickname(wallet, nickname, lower) {
      try {
        const result = await run(
          db.execute(sql`
            insert into profiles (wallet, nickname, nickname_lower)
            values (${wallet}::text, ${nickname}::text, ${lower}::text)
            on conflict (wallet) do update
              set nickname = excluded.nickname, nickname_lower = excluded.nickname_lower, updated_at = now()
              where profiles.updated_at <= now() - interval '10 minutes'
            returning nickname`),
        )
        return rowsOf(result).length > 0 ? 'ok' : 'cooldown'
      } catch (error) {
        if (isUniqueViolation(error)) {
          return 'taken'
        }
        throw error
      }
    },

    async removeNickname(wallet) {
      await run(db.execute(sql`delete from profiles where wallet = ${wallet}::text`))
    },
  }
}
