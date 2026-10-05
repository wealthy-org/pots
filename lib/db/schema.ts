// Off-chain tables on Neon Postgres (schema.md DATA-23 to DATA-25, ADR-017).
// Server side only: never import this file from a client component.
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// A literal, not a bound parameter: a CHECK constraint cannot take parameters.
const walletCheck = (column: unknown) => sql`${column} ~ '^0x[0-9a-f]{40}$'`

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    wallet: text('wallet').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('chat_messages_wallet_check', walletCheck(table.wallet)),
    check('chat_messages_body_check', sql`char_length(${table.body}) between 1 and 280`),
    index('chat_messages_created_at_idx').on(table.createdAt),
    index('chat_messages_wallet_created_at_idx').on(table.wallet, table.createdAt),
  ],
)

export const profiles = pgTable(
  'profiles',
  {
    wallet: text('wallet').primaryKey(),
    nickname: text('nickname').notNull(),
    nicknameLower: text('nickname_lower').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('profiles_wallet_check', walletCheck(table.wallet)),
    check('profiles_nickname_check', sql`${table.nickname} ~ '^[A-Za-z0-9_]{3,16}$'`),
    uniqueIndex('profiles_nickname_lower_idx').on(table.nicknameLower),
  ],
)

export type FailedAction = { name: string; reason: string }

export const keeperEvents = pgTable(
  'keeper_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    roundId: text('round_id'),
    phase: text('phase'),
    alerts: text('alerts')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    failedActions: jsonb('failed_actions')
      .$type<FailedAction[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    httpStatus: integer('http_status').notNull(),
  },
  (table) => [index('keeper_events_created_at_idx').on(table.createdAt)],
)
