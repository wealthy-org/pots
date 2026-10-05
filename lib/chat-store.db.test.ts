// Runs against the Neon `dev` branch only: `npm run test:db` (loads .env.local). Skipped when
// DATABASE_URL is unset, so CI and `npm test` never touch a database.
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDbChatStore } from './chat-store'
import { getDb } from './db/client'
import { keeperEvents } from './db/schema'
import { toRow } from './keeper-history'

const db = getDb()
const A = '0x00000000000000000000000000000000000a11ce'
const B = '0x00000000000000000000000000000000000b0b00'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!db)('chat store on the dev branch', () => {
  const store = db ? createDbChatStore(db) : (null as never)

  async function clean() {
    if (!db) return
    await db.execute(sql`delete from chat_messages where wallet in (${A}, ${B})`)
    await db.execute(sql`delete from profiles where wallet in (${A}, ${B})`)
    await db.execute(sql`delete from keeper_events where round_id = 'test-run'`)
  }
  beforeAll(clean)
  afterAll(clean)

  it('stores a message, lists it for today, and joins the nickname', async () => {
    const stored = await store.insert(A, 'hello from the test')
    expect(stored).not.toBe('rate_limited')
    expect(await store.setNickname(A, 'TestAlice', 'testalice')).toBe('ok')
    const list = await store.list({ limit: 100 })
    const mine = list.find((m) => m.body === 'hello from the test')
    expect(mine?.nickname).toBe('TestAlice')
    expect(mine?.wallet).toBe(A)
    const after = await store.list({ after: Number(mine?.id) - 1, limit: 5 })
    expect(after[0]?.id).toBe(mine?.id)
  })

  it('refuses a second message within 2 seconds, then allows it', async () => {
    await sleep(2100)
    expect(await store.insert(B, 'one')).not.toBe('rate_limited')
    expect(await store.insert(B, 'two')).toBe('rate_limited')
    await sleep(2100)
    expect(await store.insert(B, 'three')).not.toBe('rate_limited')
  })

  it('allows at most 10 messages per wallet per minute', async () => {
    await clean()
    let accepted = 0
    for (let i = 0; i < 12; i += 1) {
      await sleep(2050)
      if ((await store.insert(A, `burst ${i}`)) !== 'rate_limited') accepted += 1
    }
    expect(accepted).toBe(10)
  }, 60_000)

  it('keeps nicknames unique without regard to case and applies the cooldown', async () => {
    await clean()
    expect(await store.setNickname(A, 'Neo_One', 'neo_one')).toBe('ok')
    expect(await store.setNickname(B, 'NEO_ONE', 'neo_one')).toBe('taken')
    expect(await store.setNickname(A, 'Neo_Two', 'neo_two')).toBe('cooldown')
    expect(await store.getNickname(A)).toBe('Neo_One')
    await store.removeNickname(A)
    expect(await store.getNickname(A)).toBeNull()
    expect(await store.setNickname(B, 'NEO_ONE', 'neo_one')).toBe('ok')
  })

  it('purges rows before the current UTC day and old keeper rows, and keeps today', async () => {
    if (!db) return
    await clean()
    await db.execute(sql`insert into chat_messages (wallet, body, created_at) values
      (${A}, 'yesterday late', (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') - interval '1 second'),
      (${A}, 'today first', (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'))`)
    await db.execute(sql`insert into keeper_events (round_id, http_status, created_at) values
      ('test-run', 503, now() - interval '31 days'), ('test-run', 503, now() - interval '29 days')`)
    const result = await store.purge()
    expect(result.chatDeleted).toBeGreaterThanOrEqual(1)
    expect(result.keeperEventsDeleted).toBeGreaterThanOrEqual(1)
    const left = await db.execute(
      sql`select body from chat_messages where wallet = ${A} order by id`,
    )
    expect((left as unknown as { rows: { body: string }[] }).rows.map((r) => r.body)).toEqual([
      'today first',
    ])
    const events = await db.execute(
      sql`select count(*)::int as n from keeper_events where round_id = 'test-run'`,
    )
    expect((events as unknown as { rows: { n: number }[] }).rows[0].n).toBe(1)
  })

  it('does not list yesterday even before the purge has run', async () => {
    if (!db) return
    await clean()
    await db.execute(sql`insert into chat_messages (wallet, body, created_at) values
      (${A}, 'old but not purged', (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') - interval '1 hour')`)
    const list = await store.list({ limit: 100 })
    expect(list.some((m) => m.body === 'old but not purged')).toBe(false)
  })

  it('stores a keeper problem row with its arrays and json', async () => {
    if (!db) return
    await clean()
    const row = toRow({
      status: 'error',
      httpStatus: 503,
      round: { id: 'test-run', phase: 'LOCKED' },
      actions: [{ name: 'settle', ok: false, reason: 'reverted' }],
      alerts: ['treasury_low', 'round_stalled'],
      at: '2026-10-05T00:00:00.000Z',
    })
    await db.insert(keeperEvents).values(row)
    const stored = await db.execute(
      sql`select alerts, failed_actions, http_status, phase from keeper_events where round_id = 'test-run'`,
    )
    const first = (stored as unknown as { rows: Record<string, unknown>[] }).rows[0]
    expect(first.alerts).toEqual(['treasury_low', 'round_stalled'])
    expect(first.failed_actions).toEqual([{ name: 'settle', reason: 'reverted' }])
    expect(first.http_status).toBe(503)
  })
})
