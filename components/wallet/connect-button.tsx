'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Button } from '@/components/ui/button'
import { shortenAddress } from '@/lib/format'

export function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { connectors, connect, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <Button variant="secondary" size="sm" onClick={() => disconnect()} title="Disconnect wallet">
        {shortenAddress(address)}
      </Button>
    )
  }

  const connector = connectors[0]
  if (!connector) {
    return (
      <Button variant="secondary" size="sm" disabled title="Install MetaMask or Phantom EVM">
        No wallet detected
      </Button>
    )
  }

  return (
    <Button size="sm" onClick={() => connect({ connector })} disabled={isPending}>
      {isPending ? 'Connecting...' : 'Connect wallet'}
    </Button>
  )
}
