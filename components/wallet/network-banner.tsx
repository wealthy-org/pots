'use client'

import { useAccount, useSwitchChain } from 'wagmi'
import { Button } from '@/components/ui/button'
import { activeChain } from '@/lib/chains'

export function NetworkBanner() {
  const { isConnected, chainId: walletChainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || walletChainId === undefined || walletChainId === activeChain.id) {
    return null
  }

  return (
    <div
      role="alert"
      className="mb-4 flex items-center justify-between gap-3 rounded-md border border-loss/40 bg-loss/10 px-4 py-2.5 text-sm"
    >
      <span>
        Wrong network. This app is configured for {activeChain.name} (chain {activeChain.id}).
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => switchChain({ chainId: activeChain.id })}
        disabled={isPending}
      >
        {isPending ? 'Switching...' : 'Switch network'}
      </Button>
    </div>
  )
}
