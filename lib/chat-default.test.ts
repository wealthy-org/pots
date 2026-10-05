import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { signInMessage } from './chat-sign'

// The default wiring with a real signature: no fake verifier, no RPC.
const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const HOST = 'pots.test'

function sessionRequest(body: unknown) {
  return new Request(`https://${HOST}/api/chat/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: `https://${HOST}`, host: HOST },
    body: JSON.stringify(body),
  })
}

describe('chat sign-in with the default verifier', () => {
  beforeEach(() => {
    vi.stubEnv('CHAT_SESSION_SECRET', 's'.repeat(40))
    vi.stubEnv('NEXT_PUBLIC_ROBINHOOD_CHAIN_ID', '46630')
    vi.resetModules()
  })
  afterEach(() => vi.unstubAllEnvs())

  async function load() {
    return (await import('./chat-default')).chatHandlers
  }

  it('accepts a real personal_sign signature of the wallet', async () => {
    const handlers = await load()
    const issuedAt = new Date().toISOString()
    const signature = await account.signMessage({
      message: signInMessage({ wallet: account.address, chainId: 46630, issuedAt }),
    })
    const response = await handlers.session(
      sessionRequest({ wallet: account.address, issuedAt, signature }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('pots_chat=')
  })

  it('refuses a signature of another message or another wallet', async () => {
    const handlers = await load()
    const issuedAt = new Date().toISOString()
    const other = privateKeyToAccount(`0x${'22'.repeat(32)}`)
    const wrongWallet = await other.signMessage({
      message: signInMessage({ wallet: account.address, chainId: 46630, issuedAt }),
    })
    const wrongMessage = await account.signMessage({ message: 'something else' })
    for (const signature of [wrongWallet, wrongMessage]) {
      const response = await handlers.session(
        sessionRequest({ wallet: account.address, issuedAt, signature }),
      )
      expect(response.status).toBe(401)
    }
  })
})
