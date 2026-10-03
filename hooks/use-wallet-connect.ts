'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { useConnect } from 'wagmi'

function subscribe(): () => void {
  // Extensions inject before the page scripts run, so one read after mount is enough.
  return () => undefined
}

function hasInjectedWallet(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { ethereum?: unknown }).ethereum)
}

/** Injected-wallet connect with real detection: no provider means no Connect button. */
export function useWalletConnect() {
  // The server snapshot is true so the first paint matches the usual case; the client corrects it.
  const available = useSyncExternalStore(subscribe, hasInjectedWallet, () => true)
  const { connectors, connect, isPending, error, reset } = useConnect()

  const connector = connectors[0]
  const connectWallet = useCallback(() => {
    if (connector) {
      connect({ connector })
    }
  }, [connect, connector])

  const message = error
    ? error.message.toLowerCase().includes('rejected')
      ? 'Connection rejected in the wallet.'
      : 'Could not connect the wallet. Try again.'
    : null

  return {
    available: available && Boolean(connector),
    connect: connectWallet,
    isPending,
    message,
    clearMessage: reset,
  }
}
