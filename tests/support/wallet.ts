import type { Page } from '@playwright/test'
import { createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export type WalletMode = 'approve' | 'reject'

type MockWalletOptions = {
  privateKey: Hex
  chainId: number
  rpcUrl: string
  mode?: WalletMode
}

type E2eWindow = {
  __e2e: { mode: WalletMode; chainId: number }
}

/**
 * Installs an injected EIP-1193 wallet before the app loads. Reads go to the RPC; transactions are
 * signed in Node with the given key, so the same fixture works on a local chain and on testnet.
 */
export async function installMockWallet(page: Page, options: MockWalletOptions) {
  const account = privateKeyToAccount(options.privateKey)
  const wallet = createWalletClient({ account, transport: http(options.rpcUrl) })

  await page.exposeFunction('__e2eSendTransaction', async (raw: string) => {
    const tx = JSON.parse(raw) as { to?: Hex; data?: Hex; value?: Hex }
    return wallet.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value ? BigInt(tx.value) : undefined,
      chain: null,
    })
  })

  await page.addInitScript(
    ({ address, chainId, rpcUrl, mode }) => {
      type Listener = (...args: unknown[]) => void
      const listeners: Record<string, Listener[]> = {}
      const state = { mode, chainId }
      const w = window as unknown as E2eWindow & {
        ethereum: unknown
        __e2eSendTransaction: (raw: string) => Promise<string>
      }
      w.__e2e = state

      const emit = (event: string, ...args: unknown[]) => {
        for (const listener of listeners[event] ?? []) listener(...args)
      }

      w.ethereum = {
        isMetaMask: true,
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return [address]
            case 'eth_chainId':
              return '0x' + state.chainId.toString(16)
            case 'net_version':
              return String(state.chainId)
            case 'wallet_switchEthereumChain': {
              const target = parseInt((params?.[0] as { chainId: string }).chainId, 16)
              state.chainId = target
              emit('chainChanged', '0x' + target.toString(16))
              return null
            }
            case 'eth_sendTransaction':
              if (state.mode === 'reject') {
                throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
              }
              return w.__e2eSendTransaction(JSON.stringify(params?.[0]))
            default: {
              const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? [] }),
              })
              const body = (await response.json()) as {
                result?: unknown
                error?: { message: string; code: number }
              }
              if (body.error) {
                throw Object.assign(new Error(body.error.message), { code: body.error.code })
              }
              return body.result
            }
          }
        },
        on: (event: string, listener: Listener) => {
          ;(listeners[event] ??= []).push(listener)
        },
        removeListener: (event: string, listener: Listener) => {
          listeners[event] = (listeners[event] ?? []).filter((item) => item !== listener)
        },
      }
    },
    {
      address: account.address,
      chainId: options.chainId,
      rpcUrl: options.rpcUrl,
      mode: options.mode ?? 'approve',
    },
  )

  return { address: account.address }
}

export async function setWalletMode(page: Page, mode: WalletMode) {
  await page.evaluate((value) => {
    ;(window as unknown as E2eWindow).__e2e.mode = value
  }, mode)
}
