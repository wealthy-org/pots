import { describe, expect, it } from 'vitest'
import { createChatHandlers, type ChatHandlerDeps } from './chat-http'
import { createToken, signInMessage } from './chat-session'
import type { ChatMessage, ChatStore, NicknameOutcome, PurgeResult } from './chat-store'
import { createFailureLimiter } from './keeper-auth'

const SECRET = 's'.repeat(40)
const KEEPER = 'k'.repeat(40)
const WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const NOW = 1_800_000_000_000
const SIGNATURE = `0x${'ab'.repeat(65)}`
const HOST = 'pots.test'

function fakeStore(overrides: Partial<ChatStore> = {}) {
  const calls: string[] = []
  let nextId = 1
  const store: ChatStore = {
    async list({ after, limit }) {
      calls.push(`list:${after ?? ''}:${limit}`)
      return []
    },
    async insert(wallet, body): Promise<ChatMessage | 'rate_limited'> {
      calls.push(`insert:${wallet}:${body}`)
      return {
        id: String(nextId++),
        wallet,
        nickname: null,
        body,
        createdAt: new Date(NOW).toISOString(),
      }
    },
    async trimOld() {
      calls.push('trim')
    },
    async purge(): Promise<PurgeResult> {
      calls.push('purge')
      return { chatDeleted: 3, keeperEventsDeleted: 1 }
    },
    async getNickname() {
      return null
    },
    async setNickname(): Promise<NicknameOutcome> {
      calls.push('setNickname')
      return 'ok'
    },
    async removeNickname() {
      calls.push('removeNickname')
    },
    ...overrides,
  }
  return { store, calls }
}

function setup(
  options: { store?: ChatStore | null; env?: Record<string, string>; verify?: boolean } = {},
) {
  const logs: string[] = []
  const store = options.store === undefined ? fakeStore().store : options.store
  const deps: ChatHandlerDeps = {
    getEnv: () => ({ CHAT_SESSION_SECRET: SECRET, KEEPER_SECRET: KEEPER, ...options.env }),
    getStore: () => store,
    verifySignature: async () => options.verify ?? true,
    limiter: createFailureLimiter({ max: 3, windowMs: 60_000, now: () => NOW }),
    now: () => NOW,
    log: (line) => logs.push(line),
    chainId: () => 46630,
  }
  return { handlers: createChatHandlers(deps), logs }
}

const cookieFor = (wallet = WALLET) => `pots_chat=${createToken(wallet, SECRET, NOW)}`

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://${HOST}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: `https://${HOST}`,
      host: HOST,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

const sessionBody = (overrides: Record<string, unknown> = {}) => ({
  wallet: WALLET,
  issuedAt: new Date(NOW).toISOString(),
  signature: SIGNATURE,
  ...overrides,
})

describe('POST /api/chat/session', () => {
  it('sets an httpOnly cookie for a valid signature and touches no database', async () => {
    const { store, calls } = fakeStore()
    const { handlers } = setup({ store })
    const response = await handlers.session(post('/api/chat/session', sessionBody()))
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(
      /pots_chat=.+; HttpOnly; Secure; SameSite=Lax/,
    )
    expect(await response.json()).toMatchObject({ wallet: WALLET.toLowerCase() })
    expect(calls).toEqual([])
  })

  it('refuses a bad signature, an old issue time, and a malformed body', async () => {
    const bad = setup({ verify: false })
    expect((await bad.handlers.session(post('/api/chat/session', sessionBody()))).status).toBe(401)
    const old = setup()
    const stale = await old.handlers.session(
      post(
        '/api/chat/session',
        sessionBody({ issuedAt: new Date(NOW - 10 * 60_000).toISOString() }),
      ),
    )
    expect(stale.status).toBe(401)
    expect(await stale.json()).toEqual({ error: 'CHAT_BAD_SIGNATURE' })
    const malformed = setup()
    expect(
      (await malformed.handlers.session(post('/api/chat/session', { wallet: 'x' }))).status,
    ).toBe(400)
  })

  it('verifies the text built by the server, not text sent by the client', async () => {
    let seen = ''
    const logs: string[] = []
    const handlers = createChatHandlers({
      getEnv: () => ({ CHAT_SESSION_SECRET: SECRET }),
      getStore: () => null,
      verifySignature: async ({ message }) => {
        seen = message
        return true
      },
      limiter: createFailureLimiter({ max: 3, windowMs: 60_000, now: () => NOW }),
      now: () => NOW,
      log: (l) => logs.push(l),
      chainId: () => 46630,
    })
    await handlers.session(post('/api/chat/session', sessionBody()))
    expect(seen).toBe(
      signInMessage({ wallet: WALLET, chainId: 46630, issuedAt: new Date(NOW).toISOString() }),
    )
  })

  it('rate limits repeated failures from one source', async () => {
    const { handlers } = setup({ verify: false })
    for (let i = 0; i < 3; i += 1) {
      await handlers.session(post('/api/chat/session', sessionBody()))
    }
    expect((await handlers.session(post('/api/chat/session', sessionBody()))).status).toBe(429)
  })

  it('answers 503 without the secret and 403 for a foreign origin', async () => {
    const noSecret = setup({ env: { CHAT_SESSION_SECRET: 'short' } })
    expect((await noSecret.handlers.session(post('/api/chat/session', sessionBody()))).status).toBe(
      503,
    )
    const foreign = setup()
    const response = await foreign.handlers.session(
      post('/api/chat/session', sessionBody(), { origin: 'https://evil.test' }),
    )
    expect(response.status).toBe(403)
  })
})

describe('GET /api/chat/messages', () => {
  it('is public, clamps the limit, passes the cursor, and is cacheable for a few seconds', async () => {
    const { store, calls } = fakeStore()
    const { handlers } = setup({ store })
    const response = await handlers.listMessages(
      new Request(`https://${HOST}/api/chat/messages?after=41&limit=999`),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('s-maxage=3')
    expect(await response.json()).toMatchObject({
      messages: [],
      day: new Date(NOW).toISOString().slice(0, 10),
    })
    expect(calls).toEqual(['list:41:100'])
  })

  it('ignores a malformed cursor and limit', async () => {
    const { store, calls } = fakeStore()
    const { handlers } = setup({ store })
    await handlers.listMessages(new Request(`https://${HOST}/api/chat/messages?after=abc&limit=-3`))
    expect(calls).toEqual(['list::50'])
  })

  it('answers 503 when the database is not configured or fails, without detail', async () => {
    const none = setup({ store: null })
    expect(
      (await none.handlers.listMessages(new Request(`https://${HOST}/api/chat/messages`))).status,
    ).toBe(503)
    const broken = fakeStore({
      list: async () => {
        throw new Error('connection string postgres://user:secret@host/db')
      },
    })
    const { handlers, logs } = setup({ store: broken.store })
    const response = await handlers.listMessages(new Request(`https://${HOST}/api/chat/messages`))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'CHAT_UNAVAILABLE' })
    expect(logs.join('')).not.toContain('secret')
    expect(logs.join('')).toContain('Error')
  })
})

describe('POST /api/chat/messages', () => {
  it('stores a message for the cookie wallet as plain text', async () => {
    const { store, calls } = fakeStore()
    const { handlers } = setup({ store })
    const response = await handlers.postMessage(
      post('/api/chat/messages', { body: '  <b>hi</b> https://x.test  ' }, { cookie: cookieFor() }),
    )
    expect(response.status).toBe(201)
    expect(calls[0]).toBe(`insert:${WALLET.toLowerCase()}:<b>hi</b> https://x.test`)
    expect(((await response.json()) as { message: ChatMessage }).message.body).toBe(
      '<b>hi</b> https://x.test',
    )
  })

  it('needs a valid cookie: none, forged, expired', async () => {
    const { handlers } = setup()
    const none = await handlers.postMessage(post('/api/chat/messages', { body: 'x' }))
    expect(none.status).toBe(401)
    const forged = await handlers.postMessage(
      post('/api/chat/messages', { body: 'x' }, { cookie: 'pots_chat=abc.def' }),
    )
    expect(forged.status).toBe(401)
    const expired = createToken(WALLET, SECRET, NOW - 13 * 3600 * 1000)
    const old = await handlers.postMessage(
      post('/api/chat/messages', { body: 'x' }, { cookie: `pots_chat=${expired}` }),
    )
    expect(old.status).toBe(401)
    expect(await old.json()).toEqual({ error: 'CHAT_UNAUTHENTICATED' })
  })

  it('rejects empty, oversized, and non-text bodies before any database call', async () => {
    const { store, calls } = fakeStore()
    const { handlers } = setup({ store })
    for (const body of ['', '   ', 'a'.repeat(281), 5]) {
      const response = await handlers.postMessage(
        post('/api/chat/messages', { body }, { cookie: cookieFor() }),
      )
      expect(response.status).toBe(400)
    }
    expect(calls).toEqual([])
  })

  it('refuses a foreign origin and a non-JSON content type', async () => {
    const { handlers } = setup()
    const foreign = await handlers.postMessage(
      post(
        '/api/chat/messages',
        { body: 'x' },
        { cookie: cookieFor(), origin: 'https://evil.test' },
      ),
    )
    expect(foreign.status).toBe(403)
    const text = await handlers.postMessage(
      post(
        '/api/chat/messages',
        { body: 'x' },
        { cookie: cookieFor(), 'content-type': 'text/plain' },
      ),
    )
    expect(text.status).toBe(403)
  })

  it('answers 429 with Retry-After when the store limits the wallet', async () => {
    const limited = fakeStore({ insert: async () => 'rate_limited' })
    const { handlers } = setup({ store: limited.store })
    const response = await handlers.postMessage(
      post('/api/chat/messages', { body: 'x' }, { cookie: cookieFor() }),
    )
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('3')
    expect(await response.json()).toEqual({ error: 'CHAT_RATE_LIMITED' })
  })

  it('answers 503 when the database fails and leaks nothing', async () => {
    const broken = fakeStore({
      insert: async () => {
        throw new Error('boom postgres://u:p@h/d')
      },
    })
    const { handlers } = setup({ store: broken.store })
    const response = await handlers.postMessage(
      post('/api/chat/messages', { body: 'x' }, { cookie: cookieFor() }),
    )
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('postgres')
  })
})

describe('/api/profile', () => {
  const put = (nickname: unknown) =>
    new Request(`https://${HOST}/api/profile`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        origin: `https://${HOST}`,
        host: HOST,
        cookie: cookieFor(),
      },
      body: JSON.stringify({ nickname }),
    })

  it('sets a valid nickname', async () => {
    const { handlers } = setup()
    const response = await handlers.profile(put('Neo_One'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ nickname: 'Neo_One' })
  })

  it('refuses reserved, address-like, and malformed names without a database call', async () => {
    const { store, calls } = fakeStore()
    const { handlers } = setup({ store })
    for (const name of ['admin', 'ADMIN', 'team_', '0xdeadbeef', 'a', 'has space']) {
      const response = await handlers.profile(put(name))
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'NICKNAME_INVALID' })
    }
    expect(calls).toEqual([])
  })

  it('maps taken and cooldown outcomes', async () => {
    const taken = setup({ store: fakeStore({ setNickname: async () => 'taken' }).store })
    expect((await taken.handlers.profile(put('Neo_One'))).status).toBe(409)
    const cooldown = setup({ store: fakeStore({ setNickname: async () => 'cooldown' }).store })
    const response = await cooldown.handlers.profile(put('Neo_One'))
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'NICKNAME_COOLDOWN' })
  })

  it('reads and removes the nickname of the cookie wallet', async () => {
    const { store, calls } = fakeStore({ getNickname: async () => 'Neo_One' })
    const { handlers } = setup({ store })
    const get = await handlers.profile(
      new Request(`https://${HOST}/api/profile`, { headers: { cookie: cookieFor() } }),
    )
    expect(await get.json()).toEqual({ wallet: WALLET.toLowerCase(), nickname: 'Neo_One' })
    const del = await handlers.profile(
      new Request(`https://${HOST}/api/profile`, {
        method: 'DELETE',
        headers: { origin: `https://${HOST}`, host: HOST, cookie: cookieFor() },
      }),
    )
    expect(del.status).toBe(204)
    expect(calls).toContain('removeNickname')
  })

  it('needs a session and a same-origin write', async () => {
    const { handlers } = setup()
    const anonymous = await handlers.profile(new Request(`https://${HOST}/api/profile`))
    expect(anonymous.status).toBe(401)
    const foreignDelete = await handlers.profile(
      new Request(`https://${HOST}/api/profile`, {
        method: 'DELETE',
        headers: { origin: 'https://evil.test', host: HOST, cookie: cookieFor() },
      }),
    )
    expect(foreignDelete.status).toBe(403)
  })
})

describe('POST /api/chat/purge', () => {
  const purge = (token?: string) =>
    new Request(`https://${HOST}/api/chat/purge`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })

  it('purges with the keeper secret and reports the counts', async () => {
    const { store, calls } = fakeStore()
    const { handlers } = setup({ store })
    const response = await handlers.purge(purge(KEEPER))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ chatDeleted: 3, keeperEventsDeleted: 1 })
    expect(calls).toEqual(['purge'])
  })

  it('rejects a missing or wrong secret and never touches the database', async () => {
    const { store, calls } = fakeStore()
    const { handlers } = setup({ store })
    expect((await handlers.purge(purge())).status).toBe(401)
    expect((await handlers.purge(purge('x'.repeat(40)))).status).toBe(401)
    expect(calls).toEqual([])
  })

  it('rate limits repeated bad secrets and answers 503 when the database fails', async () => {
    const { handlers } = setup()
    for (let i = 0; i < 3; i += 1) await handlers.purge(purge('x'.repeat(40)))
    expect((await handlers.purge(purge(KEEPER))).status).toBe(429)
    const broken = setup({
      store: fakeStore({
        purge: async () => {
          throw new Error('down')
        },
      }).store,
    })
    expect((await broken.handlers.purge(purge(KEEPER))).status).toBe(503)
  })
})
